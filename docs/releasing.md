# Releasing `create-captain`

Follow **Steps 1–7 once**, in order, to make `pnpm dlx create-captain@latest my-app` available. Use Step 8 for later releases. The first npm publication is manual; later publications use npm trusted publishing. Changes reach `dev` and `main` through regular merge-commit PRs.

**Current starting point:** The release automation is merged into `dev`, but `main` still has the original CLI. Both branches already have active rulesets requiring PR merge commits plus `verify` and `live-canary`; auto-merge is enabled, and required approvals are zero. There is no release tag or npm package yet. The release App, its Actions variable and secret, and the release-version required checks still need setup.

## 1. Check branch settings and understand the first-PR exception

1. Open [repository Settings → General](https://github.com/hosefis/captain/settings). Under **Pull Requests**, confirm **Allow merge commits** and **Allow auto-merge** are enabled, and squash/rebase merges are disabled.
2. Open [Settings → Rulesets](https://github.com/hosefis/captain/settings/rules). Inspect **Protect dev through pull requests and CI** and **Protect main through pull requests and CI**. Confirm each targets its named branch, requires a PR with the **merge** method, and requires `verify` and `live-canary`. The existing zero-review setting lets the bot's version PR auto-merge; a person still chooses when to merge an ordinary PR.
3. Leave the release-version jobs out of the required-check lists for the **first** `dev` → `main` PR. The `Release version` workflow uses `pull_request_target`, which runs from default-branch `main`. The workflow is not there until the first merge. The first PR is gated by the existing checks; after merging, `Create release` verifies the merge and tests the packed package before issuing `v0.1.0`. See [GitHub's event rules](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).
4. After that first merge, add the release-version required checks as they first run. Step 7 gives the exact order. GitHub may leave a PR pending if you require a check before it has produced a status. See [required-check troubleshooting](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks).

**Verify:** The two rulesets still show `verify` and `live-canary`, with no direct-push bypass. If a check is stuck at “Expected,” inspect the PR's **Checks** tab and confirm that workflow runs for that type of PR.

## 2. Create and install the release GitHub App

Do this **before** the first `dev` → `main` merge. The `Create release` workflow needs the App to create `v0.1.0`.

1. On GitHub, click your avatar → **Settings → Developer settings → GitHub Apps → New GitHub App**. Give it a unique name, such as `captain-release`. Use `https://github.com/hosefis/captain` for the required homepage URL. Disable **Active** under **Webhook**: these workflows do not consume App webhooks. Choose **Only on this account** for installation availability.
2. Under **Repository permissions**, grant **Contents**, **Pull requests**, and **Issues** **Read and write**. Leave other permissions at their defaults. Click **Create GitHub App**. See [registration](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app) and [permission guidance](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app).
3. Copy the numeric **App ID** from the new App's settings page. Under **Private keys**, click **Generate a private key** and securely keep the downloaded `.pem` file. GitHub cannot show the private key again. See [private-key instructions](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/managing-private-keys-for-github-apps).
4. On that App page click **Install App → Install** next to `hosefis`. Select **Only select repositories**, select **captain**, and click **Install**. Confirm the installation lists `captain`. See [installing your own App](https://docs.github.com/en/apps/using-github-apps/installing-your-own-github-app).
5. Open [repository Settings → Secrets and variables → Actions](https://github.com/hosefis/captain/settings/secrets/actions). On **Variables**, click **New repository variable**, enter `RELEASE_APP_ID` and the numeric App ID, and save. On **Secrets**, click **New repository secret**, enter `RELEASE_APP_PRIVATE_KEY`, paste the **entire** PEM including BEGIN/END lines, and save. Do not commit the PEM. See GitHub's [variables](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables) and [secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets) guides.

**Verify:** Both names appear in their respective Actions lists; the secret's value is hidden. If `actions/create-github-app-token` fails later, check installation on `captain`, **App ID** versus client ID, full PEM contents, and the three permissions.

**Optional:** On the same **Variables** tab, add `RELEASE_MAINTAINER` with a GitHub username that can be assigned issues in this repository. The failed-publish notification defaults to repository owner `hosefis` if the variable is absent.

## 3. Merge `dev` into `main` for `v0.1.0`

1. Open [Pull requests → New pull request](https://github.com/hosefis/captain/compare/main...dev) with **base: `main`** and **compare: `dev`**. In **Files changed**, confirm `package.json` says `0.1.0`. Do not add `release:1.0`: the first release is fixed at `0.1.0`.
2. Create the PR and wait for `verify` and `live-canary` in **Checks**. The canary packs the CLI, generates a pnpm web project, and validates it. The first PR will have no release-version check because that workflow is not yet on `main`.
3. Click **Merge pull request → Confirm merge**. Do not squash or rebase. Open [Actions → Create release](https://github.com/hosefis/captain/actions/workflows/release.yml) and inspect the run for that `main` commit. It verifies the merge, reruns `pnpm canary:packed`, then creates the tag and Release.
4. Open [Releases](https://github.com/hosefis/captain/releases). Confirm `v0.1.0` exists and its tag points to the merged `main` commit. For a CLI cross-check, use `gh release view v0.1.0 --repo hosefis/captain` and `git ls-remote origin refs/tags/v0.1.0`.

**If blocked:** If `Create release` fails, inspect the failing step and download `main-packed-canary-diagnostics` if present. No npm publish has happened. Fix via a normal PR into `dev`, then another `dev` → `main` PR; see [recovery](#if-the-main-canary-withholds-a-release). If the App-token step alone fails, repair Step 2 and rerun the workflow on the same merge commit.

## 4. Publish the exact `v0.1.0` tag to npm once

npm's trusted publisher requires an existing package, so this first publish uses a maintainer's npm account. Confirm that account can publish the public, unscoped name `create-captain` and meets npm's current authentication requirements. See [npm's public-package guide](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages/).

1. On a maintainer machine with Git, Node 22 or newer, npm, and the pnpm version pinned by the tag's `package.json` (`packageManager`), use a **clean checkout**. In PowerShell:

   ```powershell
   git clone https://github.com/hosefis/captain.git captain-first-release
   Set-Location captain-first-release
   git fetch origin --tags
   git switch --detach v0.1.0
   node -p "require('./package.json').version"
   pnpm install --frozen-lockfile
   pnpm canary:packed
   npm pack --dry-run
   ```

2. Check the output **before publishing**: the package version must be `0.1.0`, the packed canary must pass, and `npm pack --dry-run` must include `dist/cli.js` and `templates/`. The package's `prepack` script builds `dist`. Confirm that `git rev-parse HEAD` is the commit tagged `v0.1.0`.
3. Sign in with `npm login`, then run `npm whoami` and confirm it shows the npm account authorized to publish `create-captain`. From the same tag checkout, run `npm publish --access public`. Complete npm's browser authentication or two-factor prompt if asked. This creates the public package and cannot be undone by publishing the same version again.
4. Run `npm view create-captain@0.1.0 version`; it should print `0.1.0`. If publication fails, use npm's error to resolve account, authentication, name, or package issues. If the version already exists, verify its owner and contents; npm will not replace it.

## 5. Configure npm trusted publishing

1. Sign in to [npmjs.com](https://www.npmjs.com/) as an owner of `create-captain`. Open its package page → **Settings → Trusted Publisher → Select your publisher → GitHub Actions**.
2. Enter **Organization or user** `hosefis`, **Repository** `captain`, and **Workflow filename** `publish.yml` (filename only). Leave **Environment name** empty, because the workflow declares no environment. Select the allowed action for **direct `npm publish`** and save. This selection is required for newly configured trusted publishers. See [npm's exact fields and allowed actions](https://docs.npmjs.com/trusted-publishers/).
3. Verify the saved connection shows those values. Do not add an npm token to GitHub secrets. [`publish.yml`](../.github/workflows/publish.yml) uses `id-token: write`, Node 24, and npm 11.5.1 or newer for OIDC. It deliberately skips republishing `v0.1.0`.

**If blocked:** A mismatched owner, repository, filename, environment, or allowed action prevents OIDC publishing. Correct the npm connection before the next release. The GitHub App and npm authentication are separate.

## 6. Run the first published-package canary

1. After npm shows `create-captain@0.1.0`, open [Actions → Publish to npm](https://github.com/hosefis/captain/actions/workflows/publish.yml). Click **Run workflow**. Keep **Branch: `main`**, enter `v0.1.0` for **tag**, then click **Run workflow**. This button exists only after the workflow reaches default-branch `main`; see [manual workflow runs](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).
2. Open the run. The `publish` job should be skipped on manual dispatch; `verify-published` should pass. It uses `pnpm dlx` on `create-captain@0.1.0` to generate and validate a real pnpm web project. CLI alternative: `gh workflow run publish.yml --repo hosefis/captain --ref main -f tag=v0.1.0`, then `gh run watch --repo hosefis/captain`.
3. For a user-facing smoke check, run `pnpm dlx create-captain@0.1.0 --help`. The workflow result is stronger because it exercises project generation.

**If blocked:** Allow for registry propagation, then rerun. If the canary genuinely fails, the workflow flags the Release and opens or updates an issue. Fix through `dev` and publish a **new patch version**; `0.1.0` cannot be replaced.

## 7. Activate the remaining required checks

Use [Settings → Rulesets](https://github.com/hosefis/captain/settings/rules), open the named ruleset, edit **Require status checks to pass**, and **Save changes**. Add each job only after it has run on the relevant PR type:

1. On the next ordinary PR into `dev`, check that its title follows Conventional Commits (for example `fix(cli): correct help output`). As soon as **Release version / conventional-title-gate** passes, add `conventional-title-gate` to the **dev** ruleset. There is no need to open an artificial PR just to establish this check.
2. On the next `dev` → `main` PR, the App should open a `release/version-pr-<number>` PR into `dev`. After **Release version / version-bot-pr-gate** passes, add `version-bot-pr-gate` to the **dev** ruleset. The bot PR may auto-merge before you edit the ruleset; its completed check is still enough to add the check context afterward. Do so as soon as the context is available.
3. After the bot PR updates `dev`, wait for **Release version / release-version-gate** on the `dev` → `main` PR. Add `release-version-gate` to the **main** ruleset **before** merging.
4. Confirm both rulesets still require `verify` and `live-canary`. See [editing GitHub rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/managing-rulesets-for-a-repository).

**If blocked:** Inspect **Actions → Release version**. A pending bot PR may need its gate or auto-merge setting; a failing main gate may be waiting for the bot's version PR to merge and the main PR to rerun. Never merge `main` with a failing version gate.

## 8. Make later releases

1. Merge ordinary PRs into `dev` using **merge commits**. Require Conventional Commit PR titles, for example `feat(cli): add option` or `fix(template): correct import`. The calculator reads **merged PR titles**, plus `!` in a title or `BREAKING CHANGE: ...` in its PR body. It does not rely on the individual Git commit messages. The default bump is patch; `feat` gives minor; breaking changes give minor during `0.x`.
2. Open a PR with **base `main`**, **compare `dev`**. To declare the first stable version, create the `release:1.0` label if absent: open [Issues → Labels](https://github.com/hosefis/captain/labels), click **New label**, name it exactly `release:1.0`, and save. Apply it to the `dev` → `main` PR **only** when intentionally releasing `1.0.0`. Do not use it for the first `v0.1.0` release or after 1.0. Breaking changes after 1.0 bump major.
3. The App proposes the calculated `package.json` version in a separate PR into `dev`. Confirm it changes only `package.json`. It auto-merges when its checks pass. The `dev` → `main` PR updates and reruns `verify`, `live-canary`, and `release-version-gate`. Merge with a **regular merge commit** after they pass.
4. Watch **Actions → Create release** for the new `vX.Y.Z` tag and Release, then **Actions → Publish to npm**. The latter rechecks the packed package, publishes with npm OIDC, and runs the registry `pnpm dlx` canary. Verify with `npm view create-captain@X.Y.Z version` and the passing `verify-published` job.

The App must create the GitHub Release. A Release made with the built-in `GITHUB_TOKEN` will not trigger the separate ordinary `release` workflow; see [GitHub's trigger rule](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).

## Recovery

### If the `main` canary withholds a release

1. Inspect the failed **Create release** run and download `main-packed-canary-diagnostics` if present. There should be **no** new GitHub Release or npm version.
2. Fix the cause in a normal PR into `dev` with a **patch-type** Conventional Commit title, for example `fix(cli): repair generation`. Hold feature and breaking-change PRs until the pending version releases; the version gate requires patch-type corrective PRs.
3. Open another `dev` → `main` PR **without** `release:1.0`. The gate keeps the same unpublished version. Merge after checks pass. The new `Create release` run should create the pending tag. Do not change the version manually or commit to `main`.

### If npm publication fails

1. Inspect **Actions → Publish to npm** for the failed step. Check the trusted-publisher fields against Step 5, and check whether `npm view create-captain@X.Y.Z version` already returns the version.
2. If that version is **absent**, fix the configuration and rerun the workflow for the **same GitHub Release**. If it exists, do not publish it again; use the registry canary to establish whether it works.

### If the published canary fails

1. Read the **Publish to npm** run, its GitHub Release failure note, and the assigned issue. Download `published-package-canary-diagnostics` if present.
2. Fix through a PR into `dev`, then release the **next patch version** through a `dev` → `main` PR. npm cannot replace the failed version. Close the issue only after the new registry canary passes.
