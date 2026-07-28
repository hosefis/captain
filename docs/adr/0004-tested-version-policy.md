# ADR 0004: Tested dependency ranges

- Status: Accepted
- Date: 2026-07-28

## Decision

Official framework bootstrappers run at `@latest` after CAPTAIN's document
version preflight. Recipe dependencies use compatible semver ranges recorded in
the bundled version manifest rather than unconstrained `latest` values.

## Consequences

Recipe upgrades are deliberate maintenance changes. Major bootstrap drift
blocks agent mode and warns in human mode until the associated recipes and
fixtures are revalidated.
