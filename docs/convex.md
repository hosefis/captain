# Convex projects

Choose `"backend": "convex"` in the wizard or `project.json` to generate a
native Convex integration. Web and mobile use typed Convex function references,
queries, mutations, and reactive subscriptions. Next.js projects also include
server access for Server Components and Server Actions. A web and mobile
monorepo uses one shared backend in `packages/convex/convex/`, connected to
both apps; standalone projects keep `convex/` at the project root.

CAPTAIN generates the project without signing in to Convex or creating a
deployment. The app displays setup guidance until its Convex URL is configured.
[Convex's deployment URL guide](https://docs.convex.dev/client/react/deployment-urls)
explains the `convex dev` setup flow.

## Connect a development deployment

1. From the generated project root, run `npx convex dev`. For a monorepo, the
   generated `convex:dev` script runs the same command from the root. Complete
   the Convex CLI's project setup, then leave the command running while you
   develop. It creates the deployment and generates typed API files.
2. Copy the development deployment URL into each app's local environment file:

   | Project | File | Variable |
   |---|---|---|
   | Standalone Next.js | `.env.local` | `NEXT_PUBLIC_CONVEX_URL` |
   | Standalone Expo | `.env.local` | `EXPO_PUBLIC_CONVEX_URL` |
   | Monorepo web | `apps/web/.env.local` | `NEXT_PUBLIC_CONVEX_URL` |
   | Monorepo mobile | `apps/mobile/.env.local` | `EXPO_PUBLIC_CONVEX_URL` |

   Both monorepo variables must contain the **same** deployment URL. Find it
   in the root `.env.local` created by `convex dev`, or in the Convex dashboard.
   Expo reads `EXPO_PUBLIC_` variables from its app's `.env` files and embeds
   them in the client bundle; these variables must not hold secrets. See
   [Expo's environment variable guide](https://docs.expo.dev/guides/environment-variables/).
3. Start the web or mobile app using its generated development script. Reload
   Expo after changing its environment variables.

The application may be generated and checked before this setup. Its Convex
views show a clear setup message until the required URL and, where applicable,
Clerk keys are supplied.

## Authentication

Projects with `"auth": "none"` use Convex without a login. If the optional
task example is enabled, everyone connected to that deployment sees the same
task list.

For `"auth": "clerk"`, use **one Clerk application** for web and mobile when
they share a Convex backend. Add the Clerk publishable key to each app's local
environment file under its framework's variable name
(`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` or
`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`). Add `CLERK_SECRET_KEY` to the Next.js
environment when a web app is present. In the Clerk dashboard, activate its
Convex integration and copy the Clerk Frontend API URL. Set that URL as the
`CLERK_JWT_ISSUER_DOMAIN` environment variable on the **Convex development
deployment**, for example with `npx convex env set CLERK_JWT_ISSUER_DOMAIN`
from the generated project root. This is a Convex deployment setting, not an
`EXPO_PUBLIC_` variable. Sync the backend with `npx convex dev` after setting
it. The [Convex and Clerk guide](https://docs.convex.dev/auth/clerk) describes
the issuer and identity configuration, and the
[Convex environment CLI](https://docs.convex.dev/cli/reference/env) describes
how deployment variables are set.

For Expo, enable Clerk's Native API and hosted authentication. The generated
example sign-in route opens Clerk's hosted flow, which works in Expo Go and
development builds. [Clerk's Expo quickstart](https://clerk.com/docs/expo/getting-started/quickstart)
describes those dashboard settings.

With Clerk, the optional task example uses the authenticated identity in
Convex functions to restrict each user's queries and mutations to their own
tasks. Client calls use Convex's authenticated provider. On Next.js, server
calls obtain a Clerk token and pass it to Convex's server helpers. See
[Next.js server rendering with Convex](https://docs.convex.dev/client/nextjs/app-router/server-rendering).

## Optional task example

Set `"convexExample": true` alongside `"backend": "convex"` to generate a
small task schema, a live list query, add and complete mutations, and a linked
`/example` route. The option defaults to `false` and cannot be used with REST.
In a monorepo both apps have an example route backed by the same data. The
example route is separate from the starter home screen. Convex client and
Next.js server support are included even when the example is off.

## Production

1. Create or select the production deployment for the same Convex project and
   deploy the backend with `npx convex deploy` from the generated project root.
   In CI, set `CONVEX_DEPLOY_KEY` for the deployment you intend to update.
2. Configure the production Convex URL in the web hosting environment as
   `NEXT_PUBLIC_CONVEX_URL` and in the mobile build/update environment as
   `EXPO_PUBLIC_CONVEX_URL`. Both must point to the same production deployment
   in a monorepo. Rebuild the clients after changing these values.
3. If using Clerk, configure the production Clerk publishable and secret keys
   in the relevant app environments. Set `CLERK_JWT_ISSUER_DOMAIN` on the
   **production Convex deployment** to the production Clerk Frontend API URL,
   then deploy the backend configuration. Keep the Clerk application and issuer
   consistent across web and mobile.

Convex documents the production deployment and CI key flow in its
[project configuration guide](https://docs.convex.dev/production/project-configuration).
The [Convex and Clerk guide](https://docs.convex.dev/auth/clerk#configuring-dev-and-prod-instances)
explains separate development and production issuer settings. Expo documents
[environment variables for EAS builds and updates](https://docs.expo.dev/eas/environment-variables/usage/).
