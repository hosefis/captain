# create-captain

> *"With great scaffolding comes great maintainability."*  
> — probably Uncle Ben, if he shipped B2B2C SaaS

**CAPTAIN** — **C**reate **A**pps **P**roperly: **T**emplates, **A**dapters, **I**ntegrations, **N**ow.

Scaffolds **Next.js**, **Expo**, and **Turborepo** monorepos with composable auth, i18n, UI, backend, and payment modules. Generated code is fully owned by your project — copy-out recipes, no runtime CLI dependency.

> **Not** [create-captain-app](https://www.npmjs.com/package/create-captain-app) — that package scaffolds Electron apps. Always invoke CAPTAIN via `create-captain`.

## Requirements

- Node.js **22+** (see `.nvmrc`)

## Usage

```bash
# Interactive wizard (human mode)
pnpm dlx create-captain@latest

# Agent mode — no prompts
pnpm dlx create-captain@latest --config ./project.json --yes

# Preview plan without writing files
pnpm dlx create-captain@latest --config ./project.json --dry-run --json
```

### Commands

| Command | Description |
|---------|-------------|
| `init [directory]` | Scaffold a new project (default: current directory) |
| `add-module <module>` | Add an optional module to an existing project |
| `scaffold:catalog <resource>` | Generate an admin catalog resource |
| `migrate:to-monorepo` | Hoist a standalone app into a Turborepo monorepo |

```bash
pnpm dlx create-captain add-module admin-catalog
pnpm dlx create-captain scaffold:catalog billing-types \
  --fields name:string,description:string --archive
pnpm dlx create-captain migrate:to-monorepo --add mobile
```

### Global flags

| Flag | Purpose |
|------|---------|
| `--config <path>` | Agent input: path to `project.json` (skips wizard) |
| `--yes` | Accept defaults and skip confirmations |
| `--dry-run` | Print execution plan without making changes |
| `--json` | Emit machine-readable output |
| `--verify-docs` | Report npm-latest vs bundled recipe version drift |

## `project.json` (agent mode)

```json
{
  "name": "acme-platform",
  "scope": "@acme",
  "packageManager": "pnpm",
  "topology": "monorepo",
  "apps": ["web", "mobile"],
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
  "modules": ["authorization"],
  "payment": {
    "enabled": false,
    "processors": [],
    "orchestration": "backend-mediated",
    "primary": null
  },
  "locales": ["en", "fr"],
  "defaultLocale": "en",
  "validation": "strict"
}
```

Full schema and compatibility rules are defined in [`SPEC.md`](SPEC.md).

## What works today (v0.1)

**CLI shell** — commander entry, global flags, command registration. Subcommands other than `init` are stubs that exit with a message.

| Tier | Status |
|------|--------|
| **Tier A** (default web/mobile/monorepo + rest + clerk + gt-* + shadcn/nativewind) | Planned — bootstrap and recipes in progress |
| **Tier B** (convex/supabase/firebase, non-default auth/i18n/ui, payment, extra modules) | Blocked or stubbed until recipes land |

See the [implementation plan](.cursor/plans/bootstrap_create-captain_05e9ac88.plan.md) for milestone status.

## Development

```bash
pnpm install
pnpm build          # bundle src/cli.ts → dist/cli.js
pnpm typecheck
pnpm test

# Run locally
node dist/cli.js --help
```

## License

MIT — see [LICENSE](LICENSE).
