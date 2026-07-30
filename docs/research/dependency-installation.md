# Dependency installation strategy

Research date: 2026-07-30

## Recommendation

CAPTAIN should not use one universal dependency-installation mechanism.

- Let the official framework scaffolder choose the base framework dependency
  graph. `create-next-app` is Next.js's recommended setup path, and the Expo
  template establishes the Expo SDK baseline.
- Represent every optional integration as dependency operations with a target
  package, dependency kind (`runtime` or `dev`), and installer kind
  (`package-manager` or `expo`).
- Aggregate compatible operations so each target receives at most one runtime
  add and one development add, rather than installing once per recipe.
- Use the selected package manager's add command for ordinary web and
  JavaScript tooling dependencies. This lets the package manager update both
  the manifest and its lockfile.
- Use `npx expo install` for mobile runtime dependencies, especially Expo SDK
  and native React Native packages. Explicitly pass `--pnpm`, `--npm`, or
  `--bun` so Expo cannot infer the wrong manager.
- Do not patch all dependency versions into manifests and finish with a
  blanket forced install. A manifest-first install is acceptable for
  CAPTAIN-owned workspace packages and scripts, but it should not replace
  Expo's compatibility resolver or the package managers' add semantics.
- Keep exactly one lockfile for the selected package manager. Use mutable
  installs while generating, then immutable/frozen installs in CI.
  `--force` is a narrowly scoped recovery action, not the normal generation
  path.

This favors framework compatibility and a trustworthy lockfile over minimizing
the raw number of package-manager invocations.

## Why

Expo states that React Native packages often need versions matched to the
installed React Native version. Its `expo install` command selects known
compatible versions, accepts multiple packages in one invocation, supports
pnpm/npm/Bun explicitly, and provides `--check` and `--fix` validation.
Therefore CAPTAIN's static compatibility table should not be the authority for
Expo-sensitive versions. See the [Expo CLI install documentation](https://docs.expo.dev/more/expo-cli/)
and [Expo library guidance](https://docs.expo.dev/workflow/using-libraries/).

For normal packages, all three supported managers provide an add operation
that saves dependencies:

- [`pnpm add`](https://pnpm.io/cli/add) saves runtime packages by default and
  supports `-D` for development dependencies. In a workspace, CAPTAIN must
  target the intended package rather than accidentally adding to the root.
- [`npm install <package>`](https://docs.npmjs.com/cli/v11/commands/npm-install/)
  saves by default and updates `package-lock.json`.
- [`bun add`](https://bun.sh/docs/pm/cli/add) saves dependencies and updates
  Bun's lockfile.

The managers' ordinary install commands should reconcile an already-correct
manifest. They should not be used as a repair strategy after mixing lockfiles
or package-manager state. pnpm documents `--force` as recreating incompatible
lockfile or modules state, while frozen lockfiles are intended to prohibit
updates; Bun likewise recommends frozen installs/`bun ci` for reproducible CI.
See [`pnpm install`](https://pnpm.io/cli/install) and
[`bun install`](https://bun.sh/docs/pm/cli/install).

## Framework and integration routing

### Next.js

Use `create-next-app` as the owner of the initial Next/React versions. Next.js
describes it as the quickest supported setup and says it installs the required
dependencies. Optional web integrations should then use the selected package
manager's batched add commands. See the
[Next.js installation guide](https://nextjs.org/docs/app/getting-started/installation).

Clerk's Next.js quickstart uses the ordinary package-manager add command for
`@clerk/nextjs`; it does not require a separate Clerk scaffolder. CAPTAIN can
then apply its provider, environment, and proxy/middleware templates. See the
[Clerk Next.js quickstart](https://clerk.com/docs/nextjs/getting-started/quickstart).

General Translation documents `gt-next` as a runtime dependency and `gtx-cli`
as development tooling. Route both through the selected package manager, in
separate aggregated runtime/dev groups. See the
[GT Next.js quickstart](https://generaltranslation.com/en-US/docs/next).

### Expo

Use one batched `expo install` operation for mobile runtime dependencies after
the Expo base project is available. Follow it with
`npx expo install --check` as a smoke check.

Clerk officially specifies:

```text
npx expo install @clerk/expo expo-secure-store expo-dev-client
```

It says this ensures SDK-compatible versions and configures the required Expo
plugins. `expo-dev-client` belongs only to the development-build/native-UI
trajectory; an Expo Go/custom JavaScript flow should not receive it
automatically. See the
[Clerk Expo quickstart](https://clerk.com/docs/expo/getting-started/quickstart).

NativeWind requires `nativewind` plus React Native Reanimated and Safe Area
Context, as well as Tailwind/Babel development tooling. Route the runtime/native
set through `expo install`, and add the dev-only tooling through the selected
package manager. Its file, Metro, Babel, CSS, and type setup remains a recipe
rather than an installation side effect. See the
[NativeWind Expo installation guide](https://www.nativewind.dev/docs/getting-started/installation).

General Translation documents `gt-react-native` as runtime and `gtx-cli` as
development tooling. In an Expo project, route the runtime package through the
framework-aware `expo install` path and the CLI through the package manager's
dev add. See the
[GT React Native quickstart](https://generaltranslation.com/en-US/docs/react-native).

## Standalone and monorepo execution

For a standalone project:

1. Scaffold with the selected manager.
2. Apply CAPTAIN's configuration recipes.
3. Execute aggregated package-manager adds, or the Expo-aware add for mobile.
4. Run Expo version checking when applicable.
5. Run project smoke checks.

For a monorepo:

1. Scaffold app manifests without producing independent child lockfiles.
2. Create the root workspace and its single selected-manager lockfile.
3. Install the base workspace graph once so the local Expo CLI matches the
   scaffolded Expo SDK.
4. Run aggregated dependency operations against the correct workspace/app.
5. Run `expo install --check` inside the mobile app and then root smoke checks.

CAPTAIN should fail if a foreign package-manager lockfile appears instead of
silently migrating it. This is particularly important for Bun, whose installer
can automatically migrate a detected pnpm lockfile when no Bun lock exists, as
documented by [`bun install`](https://bun.sh/docs/pm/cli/install).

## Proposed internal dependency record

```ts
type DependencyOperation = {
  target: "root" | "web" | "mobile";
  kind: "runtime" | "dev";
  installer: "package-manager" | "expo";
  packages: string[];
};
```

Recipes should declare these operations rather than directly mutating
`package.json`. The executor can deduplicate them, detect conflicting requested
ranges, group commands, target the correct workspace, and produce useful
progress/error output.
