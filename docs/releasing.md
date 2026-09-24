# Releasing create-captain

The public npm package is `create-captain`. Once it has been published, users can run `pnpm dlx create-captain@latest my-app`. This release policy uses merge commits for PRs and protects `dev` and `main` against direct commits after the branch rules are configured below.

## One-time setup

1. Protect `dev` and `main` with rulesets that require pull requests and the CI checks. Allow merge commits; do not require squash merging. Require the version PR gate on `dev` and the release version gate on `main`. The gates restrict `main` PRs to `dev`. Set required approvals to zero so the bot's version PR can merge automatically; regular PRs still need a person to choose Merge. Enable repository auto merge for the version PR after its checks pass.
2. Create a GitHub App installed only on this repository. Give it repository **Contents: read and write**, **Pull requests: read and write**, and **Issues: read and write** permissions. Set the repository variable `RELEASE_APP_ID` to its App ID and the secret `RELEASE_APP_PRIVATE_KEY` to its private key. Set `RELEASE_MAINTAINER` to the GitHub username that should receive failed-publish issue assignments; it defaults to the repository owner (`hosefis`). The App opens the version PR, creates GitHub Releases, and reports published-package failures; the built-in Actions token is read-only.
3. Require Conventional Commit PR titles for changes merged into `dev`: `feat(scope): ...`, `fix(scope): ...`, or another permitted type. Use `!` or a `BREAKING CHANGE:` footer for breaking changes. The version calculator reads merged PR titles, not squash commits. Label the `dev` to `main` PR `release:1.0` only when intentionally declaring the first stable release.
4. Keep `dev` and `main` in sync after each release. Open a PR from `dev` to `main`; the version workflow proposes the next `package.json` version in a separate PR to `dev`. The version PR auto merges after checks, and the `dev` to `main` PR then reruns its checks. No release commit is pushed directly to either protected branch.

The first deployment of these workflows is a bootstrap: workflows triggered by `pull_request_target` must already exist on the default branch before they can run for later PRs. The first `v0.1.0` release also needs a one-time manual npm publish before npm's trusted publisher can be configured.

## First release (`v0.1.0`)

1. Merge the release automation into `main` from `dev` through a PR, after the required checks pass. On `main`, the Create release workflow verifies the merge and runs `pnpm canary:packed`; it creates `v0.1.0` only if both pass.
2. Check out exactly the `v0.1.0` tag on a maintainer machine. Run `pnpm install --frozen-lockfile`, then `pnpm canary:packed`, and publish with `npm publish --access public` from an npm account authorized for `create-captain`. Follow npm's account authentication requirements. Do not publish from a different commit or version.
3. On npmjs.com, configure a trusted publisher for `create-captain`: GitHub owner `hosefis`, repository `captain`, workflow filename `publish.yml`, with direct `npm publish` allowed. Leave the environment field empty unless the workflow is updated to use that exact environment. npm currently requires an existing package for this setup.
4. Run **Publish to npm** manually with input `tag` set to `v0.1.0`. This checks the registry package by running `pnpm dlx` to generate and validate a real pnpm web project. This dispatch does not publish again.

## Subsequent releases

Merge regular PRs into protected `dev` with merge commits. The `dev` to `main` PR version gate proposes a version PR into `dev` and blocks `main` until the updated PR passes CI and the packed-package canary. The default release is a patch. `feat:` raises it to minor. A breaking change stays within `0.x` as a minor release until the explicit `release:1.0` label is used; after `1.0.0`, breaking changes raise the major version.

After the `dev` to `main` merge, Create release verifies the exact merge and repeats the packed-package web canary. A failed check withholds the GitHub Release and npm publish; fix the problem through `dev` and another PR. A passing check creates the `vX.Y.Z` tag and GitHub Release with the GitHub App. The release event starts Publish to npm, which verifies the tag and package version, tests the package again, and runs `npm publish --access public` with npm trusted publishing. It then runs the published `pnpm dlx` web canary. A failed post-publish canary appends a failure note to the GitHub Release and opens an issue assigned to `RELEASE_MAINTAINER`. Reruns reuse the note and issue. Correct the package with a new patch release through `dev` because npm versions cannot be replaced.

### Recover a release withheld on `main`

If the packed-package canary fails after the `dev` to `main` merge, the version in `main` is a pending, unpublished release. Merge at least one ordinary corrective PR into `dev` with a patch-type Conventional Commit title, such as `fix(cli): repair generation`. All PRs merged into `dev` before recovery must be patch-type; feature and breaking-change PRs must wait until the pending version is released. Open another `dev` to `main` PR without a `release:1.0` label. The version gate keeps the same unpublished `package.json` version, so no new version PR is needed. After the corrective merge passes the PR checks and the `main` canary, the workflow releases that pending version. This recovery rule applies only before a GitHub Release and npm publication; a failure found after npm publication needs a new patch version.

The GitHub App token is needed for the release event to start the separate publish workflow. Releases created with the built-in `GITHUB_TOKEN` do not start ordinary downstream workflows. npm publishing uses GitHub OIDC (`id-token: write`), Node 24, and npm 11.5.1 or newer. There is no npm publishing token in repository secrets.

## External references

- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
- [GitHub workflow trigger behavior for `GITHUB_TOKEN`](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
- [GitHub App installation tokens](https://github.com/actions/create-github-app-token)
