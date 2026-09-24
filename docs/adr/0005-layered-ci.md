# ADR 0005: Layered validation

- Status: Accepted
- Date: 2026-07-28

## Decision

Pull requests run generator checks, deterministic topology/package-manager
fixtures, and a representative live pnpm web canary. Nightly and release
workflows run the complete three-package-manager by three-topology live matrix.

## Consequences

Fast deterministic failures remain available on every pull request while
registry-dependent coverage is isolated and diagnostic artifacts are retained.
