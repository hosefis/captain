# ADR 0003: Generated-file ownership

- Status: Accepted
- Date: 2026-07-28

## Decision

Generated code belongs to the target project. Follow-up commands preflight a
complete operation plan before writing. An unsafe collision aborts the entire
CAPTAIN operation. `--force` may approve only the collisions listed in that
plan.

## Consequences

`add-module` applies only the requested module and required manifest/export
changes. Catalog scaffolding and migration do not silently replace edited
source files. A failed preflight produces no partial CAPTAIN writes.
