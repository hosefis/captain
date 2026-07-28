# ADR 0001: Tier A release scope

- Status: Accepted
- Date: 2026-07-28

## Decision

The first supported CAPTAIN release generates Next.js web apps, Expo dev-build
mobile apps, and web-plus-mobile Turborepo workspaces. The supported integration
set is REST, Clerk, GT, shadcn/Base UI, and NativeWind. AdminCatalog,
FormWizard, and User Identity are supported optional modules.

Convex, Supabase, Firebase, Better Auth, WorkOS, alternate i18n/UI adapters,
desktop apps, and payment are rejected by compatibility checks until their own
release criteria are met.

## Consequences

Every advertised combination must install and pass its generated typecheck,
lint, and build smoke plan. Unsupported selections fail before filesystem
mutation and include an actionable explanation.
