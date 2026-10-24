# {name} — Project context

Project stack, layout, and development commands for developers and coding agents.

## Stack

| Setting | Value |
|---------|-------|
| Topology | `{topology}` |
| Apps | `{apps}` |
| Scope | `{scope}` |
| Package manager | `{packageManager}` |
| Backend | `{backend}` |
| Convex example | {convexExample} |
| Auth | `{auth}` |
| Web i18n | `{i18nWeb}` |
| Mobile i18n | `{i18nMobile}` |
| Web UI | `{uiWeb}` |
| Mobile UI | `{uiMobile}` |
| Locales | `{locales}` (default: `{defaultLocale}`) |
| Expo runtime | `{runtime}` |

## Layout

- Standalone projects keep routes in `src/app`, shared code in `src/lib`, and
  provider wiring in `src/integrations`.
- Monorepos keep applications in `apps/*` and shared code in `packages/*`.

## Commands

Use `{packageManager}` to install dependencies and run the generated
`typecheck`, `lint`, `build`, and `dev` scripts.

## Agent notes

- Dependency versions and scripts are defined in each `package.json`.
- Import modules by their file or package subpath; avoid barrel files.
{backendNotes}
