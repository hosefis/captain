# ADR 0005: Layered validation

- Status: Accepted
- Date: 2026-07-28

## Decision

Pull requests run generator checks, deterministic topology/package-manager
fixtures, and a representative live pnpm web canary. Weekly and release
workflows run the complete three-package-manager by three-topology live matrix.
The scheduled run starts on Mondays at 03:17 UTC; manual runs remain available.

## Consequences

Fast deterministic failures remain available on every pull request while
registry-dependent coverage is isolated and diagnostic artifacts are retained.
Failures create a concise tracking issue linking to the latest failed run.
Later failures update the same issue, reopening it if closed. Issue reporting
is serialized across runs to prevent duplicate issues from concurrent failures.
