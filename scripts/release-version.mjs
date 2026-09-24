#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function parseVersion(value) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
  if (!match) throw new Error(`Invalid stable semantic version: ${value}`);
  return match.slice(1).map(Number);
}

export function classifyPull(pr) {
  const match = /^(feat|fix|build|chore|ci|docs|perf|refactor|revert|style|test)(?:\([a-z][a-z0-9-]*\))?(!)?: \S.*$/.exec(pr.title);
  if (!match) throw new Error(`PR #${pr.number} needs a Conventional Commit title: ${pr.title}`);
  if (match[2] || /^BREAKING CHANGE:\s*\S/m.test(pr.body ?? "")) return "breaking";
  return match[1] === "feat" ? "minor" : "patch";
}

export function nextVersion(current, pulls, { firstRelease = false, releaseOne = false, pendingRelease = false } = {}) {
  if (pendingRelease) {
    if (releaseOne) throw new Error("Resolve the pending release before requesting 1.0.0");
    if (!pulls.length) throw new Error("A pending release needs a corrective patch PR through dev");
    if (pulls.some((pr) => classifyPull(pr) !== "patch")) {
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
  const kinds = pulls.map(classifyPull);
  if (kinds.includes("breaking")) return major === 0 ? `0.${minor + 1}.0` : `${major + 1}.0.0`;
  if (kinds.includes("minor")) return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function jsonAt(ref, path) {
  return JSON.parse(git("show", `${ref}:${path}`));
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
  const at = process.argv.indexOf(name);
  if (at < 0 || at + 1 >= process.argv.length) throw new Error(`Missing ${name}`);
  return process.argv[at + 1];
}

function latestReleaseTag(base) {
  const tags = git("tag", "--merged", base, "--list", "v[0-9]*.[0-9]*.[0-9]*").split("\n").filter(Boolean);
  return tags.sort((a, b) => {
    const aa = parseVersion(a.slice(1));
    const bb = parseVersion(b.slice(1));
    return aa[0] - bb[0] || aa[1] - bb[1] || aa[2] - bb[2];
  }).at(-1);
}

async function mergedPulls(repo, base, head) {
  const fork = git("merge-base", base, head);
  const commits = git("rev-list", "--first-parent", "--reverse", `${fork}..${head}`)
    .split("\n").filter(Boolean);
  const pulls = [];
  for (const sha of commits) {
    const parents = git("rev-list", "--parents", "-n", "1", sha).split(" ");
    if (parents.length !== 3) {
      throw new Error(`dev contains a commit that is not a regular PR merge: ${sha}`);
    }
    const associated = await github(`/repos/${repo}/commits/${sha}/pulls?per_page=100`);
    const pr = associated.find((item) => item.merge_commit_sha === sha && item.base.ref === "dev" && item.merged_at);
    if (!pr) throw new Error(`Cannot identify the merged dev PR for ${sha}`);
    if (pr.head.ref.startsWith("release/version-pr-") && /^chore\(release\): bump version to \d+\.\d+\.\d+$/.test(pr.title)) continue;
    pulls.push(pr);
  }
  return pulls;
}

async function mainMergePr(repo, sha) {
  const associated = await github(`/repos/${repo}/commits/${sha}/pulls?per_page=100`);
  const pr = associated.find((item) => item.merge_commit_sha === sha && item.base.ref === "main" &&
    item.head.ref === "dev" && item.head.repo?.full_name === repo && item.merged_at);
  if (!pr) throw new Error(`Cannot identify dev to main PR for ${sha}`);
  return pr;
}

async function validatePendingRelease(repo, tag, base, current) {
  const released = tag.slice(1);
  if (jsonAt(tag, "package.json").version !== released) {
    throw new Error(`Release tag ${tag} does not match its package.json version`);
  }
  const commits = git("rev-list", "--first-parent", "--reverse", `${tag}..${base}`).split("\n").filter(Boolean);
  if (!commits.length) throw new Error(`main version ${current} differs from latest release tag ${tag}`);
  const taggedCommit = git("rev-parse", `${tag}^{commit}`);
  for (const [index, sha] of commits.entries()) {
    const parents = git("rev-list", "--parents", "-n", "1", sha).split(" ");
    if (parents.length !== 3) throw new Error(`Unreleased main history contains a non-PR merge: ${sha}`);
    const [, previousMain, dev] = parents;
    const pr = await mainMergePr(repo, sha);
    if (jsonAt(sha, "package.json").version !== current) {
      throw new Error(`Unreleased main commits must keep version ${current}`);
    }
    if (index === 0) {
      if (previousMain !== taggedCommit || jsonAt(previousMain, "package.json").version !== released) {
        throw new Error(`First unreleased main merge did not start from ${tag}`);
      }
      const pulls = await mergedPulls(repo, previousMain, dev);
      const expected = nextVersion(released, pulls, { releaseOne: pr.labels.some((label) => label.name === "release:1.0") });
      if (current !== expected) throw new Error(`Pending main version ${current} should be ${expected}`);
    }
  }
}

async function calculate(repo, base, head, releaseOne) {
  const current = jsonAt(base, "package.json").version;
  const tag = latestReleaseTag(base);
  if (!tag && current !== "0.1.0") throw new Error(`The first release must start from 0.1.0, found ${current}`);
  let pendingRelease = Boolean(tag && tag.slice(1) !== current);
  if (!tag) {
    const parents = git("rev-list", "--parents", "-n", "1", base).split(" ");
    if (parents.length === 3) {
      await mainMergePr(repo, base);
      pendingRelease = true;
    }
  } else if (pendingRelease) {
    await validatePendingRelease(repo, tag, base, current);
  }
  const pulls = tag || pendingRelease ? await mergedPulls(repo, base, head) : [];
  const expected = nextVersion(current, pulls, { firstRelease: !tag && !pendingRelease, releaseOne, pendingRelease });
  return { current, expected, actual: jsonAt(head, "package.json").version, pendingRelease, pulls: pulls.map((pr) => ({ number: pr.number, title: pr.title })) };
}

function verify(actual, expected) {
  if (actual !== expected) throw new Error(`package.json version ${actual} must be ${expected}; wait for the version PR into dev`);
}

async function main() {
  const command = process.argv[2];
  const repo = option("--repo");
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error(`Invalid repository: ${repo}`);
  if (command === "verify-title") {
    const number = Number(option("--number"));
    const pr = await github(`/repos/${repo}/pulls/${number}`);
    if (pr.base.ref !== "dev" || pr.head.ref.startsWith("release/version-pr-")) {
      throw new Error("Expected an ordinary PR into dev");
    }
    console.log(JSON.stringify({ number, title: pr.title, kind: classifyPull(pr) }));
  } else if (command === "plan-pr" || command === "verify-pr") {
    const number = Number(option("--number"));
    const pr = await github(`/repos/${repo}/pulls/${number}`);
    if (pr.base.ref !== "main" || pr.head.ref !== "dev" || pr.head.repo.full_name !== repo) {
      throw new Error("Release PR must come from this repository's dev branch into main");
    }
    const base = git("rev-parse", "origin/main");
    const head = git("rev-parse", "origin/dev");
    if (pr.base.sha !== base || pr.head.sha !== head) throw new Error("PR refs moved; rerun on the latest dev and main");
    const releaseOne = pr.labels.some((label) => label.name === "release:1.0");
    const result = await calculate(repo, base, head, releaseOne);
    if (command === "verify-pr") verify(result.actual, result.expected);
    console.log(JSON.stringify(result));
  } else if (command === "verify-bot-pr") {
    const number = Number(option("--number"));
    const pr = await github(`/repos/${repo}/pulls/${number}`);
    const match = /^release\/version-pr-(\d+)$/.exec(pr.head.ref);
    if (pr.base.ref !== "dev" || pr.head.repo.full_name !== repo || !match ||
        pr.title !== `chore(release): bump version to ${jsonAt(pr.head.sha, "package.json").version}`) {
      throw new Error("Unexpected version PR branch, target, or title");
    }
    const mainPr = await github(`/repos/${repo}/pulls/${match[1]}`);
    if (mainPr.base.ref !== "main" || mainPr.head.ref !== "dev" || mainPr.head.repo.full_name !== repo || mainPr.state !== "open") {
      throw new Error("No matching open dev to main release PR");
    }
    const base = git("rev-parse", "origin/main");
    const dev = git("rev-parse", "origin/dev");
    if (mainPr.base.sha !== base || mainPr.head.sha !== dev || pr.base.sha !== dev) {
      throw new Error("PR refs moved; rerun on the latest dev and main");
    }
    const files = git("diff", "--name-only", dev, pr.head.sha).split("\n").filter(Boolean);
    if (files.length !== 1 || files[0] !== "package.json") throw new Error(`Version PR may only change package.json: ${files.join(", ")}`);
    const releaseOne = mainPr.labels.some((label) => label.name === "release:1.0");
    const result = await calculate(repo, base, dev, releaseOne);
    verify(jsonAt(pr.head.sha, "package.json").version, result.expected);
    console.log(JSON.stringify(result));
  } else if (command === "verify-release") {
    const head = git("rev-parse", "HEAD");
    const parents = git("rev-list", "--parents", "-n", "1", head).split(" ");
    if (parents.length !== 3) throw new Error("main release commit must be a regular dev PR merge");
    const [, base, dev] = parents;
    const pr = await mainMergePr(repo, head);
    const result = await calculate(repo, base, dev, pr.labels.some((label) => label.name === "release:1.0"));
    verify(result.actual, result.expected);
    console.log(JSON.stringify({ ...result, tag: `v${result.expected}`, merge: head }));
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
