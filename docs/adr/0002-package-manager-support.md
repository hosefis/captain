# ADR 0002: Package-manager support

- Status: Accepted
- Date: 2026-07-30

## Decision

CAPTAIN supports pnpm, npm, and Bun.

Standalone projects retain the selected framework's root manifest and lockfile.
Only explicit monorepos receive workspace metadata, Turbo scripts, shared
package ranges, and `pnpm-workspace.yaml` when pnpm is selected.

## Consequences

Bootstrap, dependency installation, and smoke commands use the selected
package-manager driver. The generated-project test matrix covers every package
manager across web, mobile, and monorepo project types.
