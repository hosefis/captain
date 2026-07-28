# ADR 0006: Defer payment support

- Status: Accepted
- Date: 2026-07-28

## Decision

Payment is removed from the current schema, wizard, recipes, templates, and
public claims. Its intended design is preserved in
[`../specs/payment-release.md`](../specs/payment-release.md).

## Consequences

Legacy configuration containing payment selections is rejected with a pointer
to the future specification. No partial or experimental payment adapter ships
in the Tier A release.
