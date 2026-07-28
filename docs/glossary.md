# CAPTAIN glossary

- **Adapter:** Framework- or provider-specific implementation of a core
  contract.
- **App:** A runnable web, mobile, or future desktop workspace.
- **Compatibility block:** A preflight error preventing an unsupported
  configuration from mutating the target.
- **Generated-code ownership:** The rule that emitted source belongs to the
  target project and cannot be silently overwritten by later CAPTAIN commands.
- **Module:** An optional, provider-independent capability emitted into core.
- **Operation plan:** Ordered file and command operations resolved and checked
  before application.
- **Recipe:** Deterministic logic that emits a module, adapter, integration, or
  configuration change.
- **Smoke validation:** Generated-project typecheck and lint, plus build in
  agent mode.
- **Tier A:** The combinations CAPTAIN guarantees will generate, install, and
  pass smoke validation.
- **Topology:** Web, mobile, or a monorepo containing one or more apps.
- **Workspace:** The generated root containing `apps/*` and `packages/*`.
