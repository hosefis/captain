# ADR 0002: Package-manager support

- Status: Accepted
- Date: 2026-07-28

## Decision

pnpm, npm, and Bun are first-class generated-project package managers. CAPTAIN
uses a package-manager driver for bootstrap flags, workspace metadata,
installation, script execution, and lockfile expectations.

All generated workspaces declare `workspaces` in `package.json`. Only pnpm
projects additionally receive `pnpm-workspace.yaml`.

## Consequences

Each package manager is tested across web, mobile, and monorepo topologies.
Package-manager-specific shell fragments must not leak into shared templates.
