#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/** Parse a stable semantic version or reject an invalid release identifier. */
export function parseVersion(value) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
  if (!match) throw new Error(`Invalid stable semantic version: ${value}`);
  return match.slice(1).map(Number);
}

/** Determine the release impact of a Conventional Commit pull request title and body. */
export function classifyPull(pullRequest) {
  const match = /^(feat|fix|build|chore|ci|docs|perf|refactor|revert|style|test)(?:\([a-z][a-z0-9-]*\))?(!)?: \S.*$/.exec(pullRequest.title);
  if (!match) throw new Error(`PR #${pullRequest.number} needs a Conventional Commit title: ${pullRequest.title}`);
  if (match[2] || /^BREAKING CHANGE:\s*\S/m.test(pullRequest.body ?? "")) return "breaking";
  return match[1] === "feat" ? "minor" : "patch";
}

/** Select the next release version while honoring first and pending release policy. */
export function nextVersion(current, pullRequests, { firstRelease = false, releaseOne = false, pendingRelease = false } = {}) {
  if (pendingRelease) {
    if (releaseOne) throw new Error("Resolve the pending release before requesting 1.0.0");
    if (!pullRequests.length) throw new Error("A pending release needs a corrective patch PR through dev");
    if (pullRequests.some((pullRequest) => classifyPull(pullRequest) !== "patch")) {
      throw new Error("Resolve the pending release with patch-type PRs before merging features or breaking changes");
    }
    return current;
  }
  if (firstRelease) {
    if (releaseOne) throw new Error("The first release is fixed at 0.1.0; remove release:1.0");
    return "0.1.0";
  }
  if (releaseOne) {
    if (parseVersion(current)[0] !== 0) throw new Error("release:1.0 is only valid before 1.0.0");
    return "1.0.0";
  }
  const [major, minor, patch] = parseVersion(current);
  const kinds = pullRequests.map(classifyPull);
  if (kinds.includes("breaking")) return major === 0 ? `0.${minor + 1}.0` : `${major + 1}.0.0`;
  if (kinds.includes("minor")) return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function git(...commandArguments) {
  return execFileSync("git", commandArguments, { encoding: "utf8" }).trim();
}

function manifestAtReference(reference, path) {
  return JSON.parse(git("show", `${reference}:${path}`));
}

async function github(path) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is required");
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) throw new Error(`GitHub API ${path}: ${response.status} ${await response.text()}`);
  return response.json();
}

function option(name) {
  const optionIndex = process.argv.indexOf(name);
  if (optionIndex < 0 || optionIndex + 1 >= process.argv.length) throw new Error(`Missing ${name}`);
  return process.argv[optionIndex + 1];
}

function latestReleaseTag(base) {
  const tags = git("tag", "--merged", base, "--list", "v[0-9]*.[0-9]*.[0-9]*").split("\n").filter(Boolean);
  return tags.sort((firstTag, secondTag) => {
    const firstVersion = parseVersion(firstTag.slice(1));
    const secondVersion = parseVersion(secondTag.slice(1));
    return firstVersion[0] - secondVersion[0] || firstVersion[1] - secondVersion[1] || firstVersion[2] - secondVersion[2];
  }).at(-1);
}

async function mergedPullRequests(repository, base, head) {
  const fork = git("merge-base", base, head);
  const commits = git("rev-list", "--first-parent", "--reverse", `${fork}..${head}`)
    .split("\n").filter(Boolean);
  const pullRequests = [];
  for (const commitHash of commits) {
    const parents = git("rev-list", "--parents", "-n", "1", commitHash).split(" ");
    if (parents.length !== 3) {
      throw new Error(`dev contains a commit that is not a regular PR merge: ${commitHash}`);
    }
    const associated = await github(`/repos/${repository}/commits/${commitHash}/pulls?per_page=100`);
    const pullRequest = associated.find((item) => item.merge_commit_sha === commitHash && item.base.ref === "dev" && item.merged_at);
    if (!pullRequest) throw new Error(`Cannot identify the merged dev PR for ${commitHash}`);
    if (pullRequest.head.ref.startsWith("release/version-pr-") && /^chore\(release\): bump version to \d+\.\d+\.\d+$/.test(pullRequest.title)) continue;
    pullRequests.push(pullRequest);
  }
  return pullRequests;
}

async function mainMergePullRequest(repository, commitHash) {
  const associated = await github(`/repos/${repository}/commits/${commitHash}/pulls?per_page=100`);
  const pullRequest = associated.find((item) => item.merge_commit_sha === commitHash && item.base.ref === "main" &&
    item.head.ref === "dev" && item.head.repo?.full_name === repository && item.merged_at);
  if (!pullRequest) throw new Error(`Cannot identify dev to main PR for ${commitHash}`);
  return pullRequest;
}

async function validatePendingRelease(repository, tag, base, current) {
  const released = tag.slice(1);
  if (manifestAtReference(tag, "package.json").version !== released) {
    throw new Error(`Release tag ${tag} does not match its package.json version`);
  }
  const commits = git("rev-list", "--first-parent", "--reverse", `${tag}..${base}`).split("\n").filter(Boolean);
  if (!commits.length) throw new Error(`main version ${current} differs from latest release tag ${tag}`);
  const taggedCommit = git("rev-parse", `${tag}^{commit}`);
  for (const [index, commitHash] of commits.entries()) {
    const parents = git("rev-list", "--parents", "-n", "1", commitHash).split(" ");
    if (parents.length !== 3) throw new Error(`Unreleased main history contains a non-PR merge: ${commitHash}`);
    const [, previousMain, dev] = parents;
    const pullRequest = await mainMergePullRequest(repository, commitHash);
    if (manifestAtReference(commitHash, "package.json").version !== current) {
      throw new Error(`Unreleased main commits must keep version ${current}`);
    }
    if (index === 0) {
      if (previousMain !== taggedCommit || manifestAtReference(previousMain, "package.json").version !== released) {
        throw new Error(`First unreleased main merge did not start from ${tag}`);
      }
      const pullRequests = await mergedPullRequests(repository, previousMain, dev);
      const expected = nextVersion(released, pullRequests, { releaseOne: pullRequest.labels.some((label) => label.name === "release:1.0") });
      if (current !== expected) throw new Error(`Pending main version ${current} should be ${expected}`);
    }
  }
}

async function calculate(repository, base, head, releaseOne) {
  const current = manifestAtReference(base, "package.json").version;
  const tag = latestReleaseTag(base);
  if (!tag && current !== "0.1.0") throw new Error(`The first release must start from 0.1.0, found ${current}`);
  let pendingRelease = Boolean(tag && tag.slice(1) !== current);
  if (!tag) {
    const parents = git("rev-list", "--parents", "-n", "1", base).split(" ");
    if (parents.length === 3) {
      await mainMergePullRequest(repository, base);
      pendingRelease = true;
    }
  } else if (pendingRelease) {
    await validatePendingRelease(repository, tag, base, current);
  }
  const pullRequests = tag || pendingRelease ? await mergedPullRequests(repository, base, head) : [];
  const expected = nextVersion(current, pullRequests, { firstRelease: !tag && !pendingRelease, releaseOne, pendingRelease });
  return { current, expected, actual: manifestAtReference(head, "package.json").version, pendingRelease, pulls: pullRequests.map((pullRequest) => ({ number: pullRequest.number, title: pullRequest.title })) };
}

function verify(actual, expected) {
  if (actual !== expected) throw new Error(`package.json version ${actual} must be ${expected}; wait for the version PR into dev`);
}

async function main() {
  const command = process.argv[2];
  const repository = option("--repo");
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error(`Invalid repository: ${repository}`);
  if (command === "verify-title") {
    const number = Number(option("--number"));
    const pullRequest = await github(`/repos/${repository}/pulls/${number}`);
    if (pullRequest.base.ref !== "dev" || pullRequest.head.ref.startsWith("release/version-pr-")) {
      throw new Error("Expected an ordinary PR into dev");
    }
    console.log(JSON.stringify({ number, title: pullRequest.title, kind: classifyPull(pullRequest) }));
  } else if (command === "plan-pr" || command === "verify-pr") {
    const number = Number(option("--number"));
    const pullRequest = await github(`/repos/${repository}/pulls/${number}`);
    if (pullRequest.base.ref !== "main" || pullRequest.head.ref !== "dev" || pullRequest.head.repo.full_name !== repository) {
      throw new Error("Release PR must come from this repository's dev branch into main");
    }
    const base = git("rev-parse", "origin/main");
    const head = git("rev-parse", "origin/dev");
    if (pullRequest.base.sha !== base || pullRequest.head.sha !== head) throw new Error("PR refs moved; rerun on the latest dev and main");
    const releaseOne = pullRequest.labels.some((label) => label.name === "release:1.0");
    const result = await calculate(repository, base, head, releaseOne);
    if (command === "verify-pr") verify(result.actual, result.expected);
    console.log(JSON.stringify(result));
  } else if (command === "verify-bot-pr") {
    const number = Number(option("--number"));
    const pullRequest = await github(`/repos/${repository}/pulls/${number}`);
    const match = /^release\/version-pr-(\d+)$/.exec(pullRequest.head.ref);
    if (pullRequest.base.ref !== "dev" || pullRequest.head.repo.full_name !== repository || !match ||
        pullRequest.title !== `chore(release): bump version to ${manifestAtReference(pullRequest.head.sha, "package.json").version}`) {
      throw new Error("Unexpected version PR branch, target, or title");
    }
    const mainPullRequest = await github(`/repos/${repository}/pulls/${match[1]}`);
    if (mainPullRequest.base.ref !== "main" || mainPullRequest.head.ref !== "dev" || mainPullRequest.head.repo.full_name !== repository || mainPullRequest.state !== "open") {
      throw new Error("No matching open dev to main release PR");
    }
    const base = git("rev-parse", "origin/main");
    const dev = git("rev-parse", "origin/dev");
    if (mainPullRequest.base.sha !== base || mainPullRequest.head.sha !== dev || pullRequest.base.sha !== dev) {
      throw new Error("PR refs moved; rerun on the latest dev and main");
    }
    const files = git("diff", "--name-only", dev, pullRequest.head.sha).split("\n").filter(Boolean);
    if (files.length !== 1 || files[0] !== "package.json") throw new Error(`Version PR may only change package.json: ${files.join(", ")}`);
    const releaseOne = mainPullRequest.labels.some((label) => label.name === "release:1.0");
    const result = await calculate(repository, base, dev, releaseOne);
    verify(manifestAtReference(pullRequest.head.sha, "package.json").version, result.expected);
    console.log(JSON.stringify(result));
  } else if (command === "verify-release") {
    const head = git("rev-parse", "HEAD");
    const parents = git("rev-list", "--parents", "-n", "1", head).split(" ");
    if (parents.length !== 3) throw new Error("main release commit must be a regular dev PR merge");
    const [, base, dev] = parents;
    const pullRequest = await mainMergePullRequest(repository, head);
    const result = await calculate(repository, base, dev, pullRequest.labels.some((label) => label.name === "release:1.0"));
    verify(result.actual, result.expected);
    console.log(JSON.stringify({ ...result, tag: `v${result.expected}`, merge: head }));
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
