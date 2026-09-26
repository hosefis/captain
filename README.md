# create-captain

CAPTAIN (**C**reate **A**pps **P**roperly — **T**emplates, **A**dapters,
**I**ntegrations, **N**ow) is an interactive CLI for creating owned Next.js,
Expo, and Turborepo projects.

Standalone projects remain normal framework projects. A monorepo is created
only when you explicitly choose the monorepo project type.

## Requirements

- Node.js 22 or newer
- pnpm, npm, or Bun

## Create a project

Run the interactive wizard:

```bash
pnpm dlx create-captain@latest my-app
npx create-captain@latest my-app
bunx create-captain@latest my-app
```

These registry commands become available after the first npm release. See the
[release guide](docs/releasing.md) for the bootstrap and automated release flow.

The `init` command is optional:

```bash
create-captain init my-app
```

When the directory argument is omitted, CAPTAIN creates a directory using the
project name from the wizard or config file. Pass `.` explicitly to generate in
the current directory.

The wizard asks trajectory-changing questions first:

1. Project name
2. Package manager
3. Project type
4. Expo runtime when the project contains mobile
5. Authentication
6. Backend
7. Compatible follow-up settings, including the optional Convex example
8. Locales when internationalization is enabled
9. Final configuration review

The wizard checks `pnpm --version`, `npm --version`, and `bun --version` and
marks managers that cannot run as unavailable. It suggests the first available
manager in that order. Choosing an unavailable manager stops creation before
the target directory is changed; the same check applies to `project.json`
configurations. Install the selected manager or choose one shown as available
and try again. `--dry-run` still shows the plan and warns if the selected
manager is unavailable.

Choices that have only one supported answer are resolved automatically and
shown in the final review. Later questions are filtered using earlier answers.
For example, Expo Go disables mobile internationalization, while an Expo
development build uses GT React Native.

## Current project types

| Project type | Generated structure |
|---|---|
| Web | Standalone Next.js App Router project using `src/` |
| Mobile | Standalone Expo Router project using `src/` |
| Monorepo | Turborepo with `apps/web`, `apps/mobile`, and shared packages |

Standalone application code follows the framework-native layout:

```text
src/
  app/
  components/
  features/
  lib/
  integrations/
```

The project root keeps framework configuration, dependency manifests, public
assets, and generated CAPTAIN context files.

## Supported stack

- REST backend client or native Convex queries, mutations, and subscriptions
- Clerk or no authentication
- Authorization when Clerk is enabled
- GT for Next.js
- GT React Native for Expo development builds
- No mobile internationalization for Expo Go
- shadcn with Base UI for web
- NativeWind for mobile
- pnpm, npm, and Bun

Convex works with all three project types and with Expo Go or an Expo
development build. A monorepo uses one shared Convex backend for web and
mobile. CAPTAIN generates the integration without requiring a Convex account;
connect a deployment afterward using the [Convex setup guide](docs/convex.md).

Only implemented values are accepted by the wizard and JSON schema. Planned
integrations are tracked in [ROADMAP.md](ROADMAP.md).

## Config-file usage

Use `--config` for repeatable or agent-driven generation:

```bash
create-captain my-app --config ./project.json --yes
create-captain my-app --config ./project.json --dry-run --json
```

Standalone web example:

```json
{
  "name": "acme-web",
  "scope": "@acme",
  "packageManager": "pnpm",
  "topology": "web",
  "backend": "rest",
  "auth": "clerk",
  "i18n": "gt-next",
  "ui": "shadcn-base-ui",
  "locales": ["en", "fr"],
  "defaultLocale": "en"
}
```

Expo Go example:

```json
{
  "name": "acme-mobile",
  "scope": "@acme",
  "packageManager": "pnpm",
  "topology": "mobile",
  "runtime": "expo-go",
  "backend": "rest",
  "auth": "none",
  "i18n": "none",
  "ui": "nativewind",
  "locales": ["en"],
  "defaultLocale": "en"
}
```

Monorepo example:

```json
{
  "name": "acme-platform",
  "scope": "@acme",
  "packageManager": "pnpm",
  "topology": "monorepo",
  "apps": ["web", "mobile"],
  "runtime": "dev-build",
  "backend": "rest",
  "auth": "clerk",
  "i18n": {
    "web": "gt-next",
    "mobile": "gt-react-native"
  },
  "ui": {
    "web": "shadcn-base-ui",
    "mobile": "nativewind"
  },
  "locales": ["en", "fr"],
  "defaultLocale": "en"
}
```

Convex example, with the optional working task list enabled:

```json
{
  "name": "acme-convex",
  "scope": "@acme",
  "packageManager": "pnpm",
  "topology": "web",
  "backend": "convex",
  "convexExample": true,
  "auth": "clerk",
  "i18n": "gt-next",
  "ui": "shadcn-base-ui",
  "locales": ["en"],
  "defaultLocale": "en"
}
```

`convexExample` defaults to `false` and is valid only with `"backend":
"convex"`. When enabled, it adds a task list at a separate `/example` route;
in a monorepo, both apps get the route and share the same data. Clerk users see
their own tasks, while projects without authentication use a shared list.

## Options

| Option | Purpose |
|---|---|
| `--config <path>` | Load a JSON project configuration |
| `--yes` | Skip the final interactive confirmation |
| `--dry-run` | Validate and print the complete plan without writing |
| `--json` | Emit machine-readable final output without spinners |
| `--verify-docs` | Check selected package versions against tested versions |

## How generation works

CAPTAIN validates the resolved configuration before touching the target. It
then runs the official framework scaffold, creates the selected standalone or
monorepo structure, applies supported integrations, installs dependencies, and
runs smoke validation.

Human runs show live progress for each scaffold, generation, installation, and
validation step. Command output is captured and displayed when a step fails.
JSON mode suppresses interactive progress and returns a single status envelope.

Generated projects include:

- `project.json` with the resolved configuration
- `CONTEXT.md` with the generated stack and layout
- `.env.example` containing only relevant integration variables

Convex projects also include client providers and Next.js server access where
web is present. Before deployment variables are configured, the generated app
shows a setup message. See the [Convex setup guide](docs/convex.md) for local
and production configuration.

Generated shared modules use direct file imports. Monorepo packages expose
module subpaths such as `@acme/core/backend/http-client` instead of root barrel
exports.

## Develop CAPTAIN

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

The test suite covers supported package managers across standalone web,
standalone mobile, and explicit web-plus-mobile monorepo generation.
