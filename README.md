# create-captain

> *"With great scaffolding comes great maintainability."*

CAPTAIN — **C**reate **A**pps **P**roperly: **T**emplates, **A**dapters,
**I**ntegrations, **N**ow — generates owned Next.js, Expo, and Turborepo
projects. Generated applications do not depend on the CAPTAIN CLI at runtime.

This is not
[`create-captain-app`](https://www.npmjs.com/package/create-captain-app), which
targets Electron. Invoke this generator as `create-captain`.

## Requirements

- Node.js 22 or newer
- pnpm, npm, or Bun when selecting that package manager
- A Clerk application for generated authentication credentials

## Quick start

Bare invocation and explicit `init` are equivalent:

```bash
pnpm dlx create-captain@latest my-app
pnpm dlx create-captain@latest init my-app

npx create-captain@latest my-app
bunx create-captain@latest my-app
```

Without `--config`, CAPTAIN opens the interactive wizard. For repeatable agent
or CI runs, pass a configuration file:

```bash
create-captain my-app --config ./project.json --yes
create-captain my-app --config ./project.json --dry-run --json
```

`--dry-run` performs schema and compatibility validation and returns the
complete planned bootstrap, recipe, and smoke steps without writing. JSON mode
uses a status envelope such as `dry_run`, `success`, `blocked`,
`execution_failed`, or `smoke_failed` and exits non-zero for failures.

## Commands

| Command | Purpose | Command options |
| --- | --- | --- |
| `[init] [directory]` | Generate a web, mobile, or monorepo project | Uses `--config` or the wizard |
| `add-module <module>` | Add `admin-catalog`, `form-wizard`, or `user-identity` | `--project <path>` |
| `scaffold:catalog <resource>` | Generate typed catalog config, routes, server wiring, and locale files | `--fields <list>`, `--archive`, `--project <path>` |
| `migrate:to-monorepo` | Convert a standalone project while preserving existing apps and packages | `--add web\|mobile`, `--project <path>` |

```bash
create-captain add-module form-wizard
create-captain scaffold:catalog billing-types \
  --fields name:string,description:string,active:boolean --archive
create-captain migrate:to-monorepo --add mobile
```

Global execution flags apply consistently:

| Flag | Behavior |
| --- | --- |
| `--config <path>` | Read init configuration from JSON |
| `--yes` | Skip warning confirmations |
| `--dry-run` | Validate and serialize the operation without applying it |
| `--json` | Emit machine-readable status output |
| `--force` | Authorize only the replacements listed by preflight |
| `--verify-docs` | Compare bundled dependency ranges with npm metadata |

## Project configuration

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
  "modules": [
    "authorization",
    "admin-catalog",
    "form-wizard",
    "user-identity"
  ],
  "runtime": "dev-build",
  "locales": ["en", "fr"],
  "defaultLocale": "en",
  "validation": "strict"
}
```

See [`SPEC.md`](SPEC.md) for the schema and compatibility rules and
[`docs/glossary.md`](docs/glossary.md) for domain terminology. Legacy
configuration containing `payment` is rejected with a link to the standalone
[future payment release specification](docs/specs/payment-release.md).

## Supported release surface

| Capability | Supported |
| --- | --- |
| Topology | Next.js web, Expo mobile dev-build, web/mobile Turborepo |
| Package manager | pnpm, npm, Bun |
| Backend | REST adapter |
| Authentication | Clerk |
| Internationalization | GT Next, GT React Native, Expo Localization |
| UI | shadcn/Base UI, NativeWind |
| Modules | Authorization, AdminCatalog, FormWizard, User Identity |
| Follow-up generation | Optional modules, catalog resources, monorepo migration |

Convex, Supabase, Firebase, Better Auth, WorkOS, next-intl, Radix-based shadcn,
React Native Paper, Expo Go, desktop, and payment remain explicit compatibility
blocks. The authoritative boundary is
[ADR 0001](docs/adr/0001-tier-a-release-scope.md).

## Workspace and package-manager behavior

All generated projects declare `package.json` workspaces and Turbo-backed root
`dev`, `build`, `lint`, and `typecheck` tasks. CAPTAIN finalizes every manifest
before running one root install.

| Manager | Workspace range | Manager-specific metadata |
| --- | --- | --- |
| pnpm | `workspace:*` | Emits `pnpm-workspace.yaml` and `pnpm-lock.yaml` |
| npm | `*` | Uses package workspaces and `package-lock.json` |
| Bun | `workspace:*` | Uses package workspaces and `bun.lock` |

Smoke validation invokes scripts through the selected package manager, so no
generated command relies on POSIX-only environment assignment.

## Collision policy

Commands preflight their intended targets before CAPTAIN writes generated
files. An unsafe existing path aborts the operation and identifies the
collision. `--force` permits only the replacements already present in that
plan; it does not add new targets. Dry runs never write.

`add-module` preserves unrelated modules and refuses to replace an edited core
export index unless forced. Catalog scaffolding refuses duplicate resources.
Monorepo migration preserves existing app source and applies integration
recipes only to a newly requested app. Keep application code in source control
and review every forced plan before applying it.

## Development and release validation

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm test:matrix
pnpm build
```

Pull requests run the generator checks, a deterministic pnpm/npm/Bun ×
web/mobile/monorepo fixture matrix, and a live pnpm/web canary. Nightly and
release-triggered workflows exercise the complete live 3×3 matrix and retain
the generated project when a case fails.

When changing a recipe, update its generated-file contract test and dependency
range together. Architecture, generated-file ownership, version policy, and CI
policy are recorded in [`docs/adr`](docs/adr).

## License

MIT — see [`LICENSE`](LICENSE).
