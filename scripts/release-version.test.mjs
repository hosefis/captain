import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyPull, nextVersion, parseVersion } from "./release-version.mjs";

const pullRequest = (title, body = "") => ({ number: 12, title, body });

test("accepts only stable semantic versions", () => {
  assert.deepEqual(parseVersion("0.1.0"), [0, 1, 0]);
  assert.throws(() => parseVersion("01.0.0"));
  assert.throws(() => parseVersion("1.0.0-beta"));
});

test("classifies merged PR titles and breaking footers", () => {
  assert.equal(classifyPull(pullRequest("feat(web): add login")), "minor");
  assert.equal(classifyPull(pullRequest("feat(web)!: replace login")), "breaking");
  assert.equal(classifyPull(pullRequest("fix: repair login", "BREAKING CHANGE: changed behavior")), "breaking");
  assert.equal(classifyPull(pullRequest("docs(readme): clarify install")), "patch");
  assert.throws(() => classifyPull(pullRequest("Add login")), /Conventional Commit title/);
});

test("first release is fixed at 0.1.0", () => {
  assert.equal(nextVersion("0.1.0", [], { firstRelease: true }), "0.1.0");
  assert.throws(() => nextVersion("0.1.0", [], { firstRelease: true, releaseOne: true }));
});

test("defaults to patch for a successful merge without feature PRs", () => {
  assert.equal(nextVersion("0.1.0", []), "0.1.1");
  assert.equal(nextVersion("0.1.0", [pullRequest("fix(cli): repair output")]), "0.1.1");
});

test("feature PR raises minor version", () => {
  assert.equal(nextVersion("0.1.1", [pullRequest("feat(cli): add flag")]), "0.2.0");
});

test("breaking changes stay within 0.x until explicit 1.0", () => {
  assert.equal(nextVersion("0.3.2", [pullRequest("feat(cli)!: replace flag")]), "0.4.0");
  assert.equal(nextVersion("0.3.2", [], { releaseOne: true }), "1.0.0");
  assert.equal(nextVersion("1.2.3", [pullRequest("feat(cli)!: replace flag")]), "2.0.0");
  assert.throws(() => nextVersion("1.2.3", [], { releaseOne: true }));
});

test("a pending release keeps its version during a corrective merge", () => {
  assert.equal(nextVersion("0.2.0", [pullRequest("fix(cli): repair pending candidate")], { pendingRelease: true }), "0.2.0");
  assert.equal(nextVersion("1.0.0", [pullRequest("fix(cli): repair candidate")], { pendingRelease: true }), "1.0.0");
  assert.throws(() => nextVersion("0.2.0", [], { pendingRelease: true, releaseOne: true }));
  assert.throws(() => nextVersion("0.2.0", [], { pendingRelease: true }), /corrective patch PR/);
  assert.throws(() => nextVersion("0.2.0", [pullRequest("feat(cli): add capability")], { pendingRelease: true }), /patch-type/);
  assert.throws(() => nextVersion("0.2.0", [pullRequest("fix(cli)!: replace behavior")], { pendingRelease: true }), /patch-type/);
  assert.throws(() => nextVersion("0.2.0", [pullRequest("Invalid title")], { pendingRelease: true }));
});
