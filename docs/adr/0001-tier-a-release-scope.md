# ADR 0001: Supported release scope

- Status: Accepted
- Date: 2026-07-30

## Decision

CAPTAIN generates framework-native standalone Next.js and Expo projects, or an
explicit web-plus-mobile Turborepo. Standalone projects are never promoted to a
workspace.

The supported integration set is REST, optional Clerk authentication, GT,
shadcn with Base UI, and NativeWind. Expo Go is generated without mobile
internationalization. Expo development builds use GT React Native.

Only completed integrations are accepted by the public schema and wizard.
Planned integrations remain checklist entries in `ROADMAP.md`.

## Consequences

Every public option must generate, install, and pass its smoke plan. Adding a
second supported option to a category makes the wizard expose that choice
through the shared option registry.
