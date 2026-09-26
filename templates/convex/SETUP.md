# Convex setup

CAPTAIN generated a Convex backend and native Convex clients. If you selected the optional task example, it lives at `/example` in each app. In a monorepo, web and mobile use the same backend and task data.

## Local development

1. Install dependencies with this project's package manager.
2. From the project root, run `npx convex dev`. Sign in to Convex and choose or create a project. This creates a development deployment, syncs the backend, and generates typed bindings. Leave the command running while developing.
3. Put that deployment's URL in every app's local environment file:
   - Next.js: `NEXT_PUBLIC_CONVEX_URL=https://...convex.cloud` in `.env.local` (or `apps/web/.env.local` in a monorepo).
   - Expo: `EXPO_PUBLIC_CONVEX_URL=https://...convex.cloud` in `.env.local` (or `apps/mobile/.env.local` in a monorepo).
4. Restart the web and Expo development servers after editing environment files. Until the URL is present, each app shows a setup message.

## Clerk projects

Use the same Clerk application for web and mobile when both are generated. Add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` to the web environment, and `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` to the Expo environment. Enable Clerk's Convex integration, then copy the Clerk Frontend API URL (the issuer domain) from the Clerk dashboard.

After `convex dev` has created the deployment, run `npx convex env set CLERK_JWT_ISSUER_DOMAIN https://your-clerk-issuer` from the project root and rerun or keep `npx convex dev` running so it syncs `auth.config.ts`. The initial sync permits an empty provider list while this value is unset. Enable Clerk's Native API and hosted authentication for Expo. The Expo example opens Clerk's hosted sign-in flow, which works in Expo Go and development builds. The example functions enforce task ownership on the backend.

## Next.js server access

Import `convexServerOptions` from `src/integrations/convex/server.ts` (or `apps/web/src/integrations/convex/server.ts`). Pass its result as the third argument to `fetchQuery`, `preloadQuery`, `fetchMutation`, or `fetchAction` from `convex/nextjs`. In Clerk projects, await it for an authenticated token. For example, in a Server Component or Server Action:

```ts
import { fetchQuery } from "convex/nextjs";
import { api } from "YOUR_CONVEX_API_IMPORT";
import { convexServerOptions } from "@/integrations/convex/server";

const tasks = await fetchQuery(api.tasks.list, {}, await convexServerOptions());
```

Replace `YOUR_CONVEX_API_IMPORT` with a relative import to `convex/_generated/api` in a standalone app or `{scope}/convex/_generated/api` in a monorepo. The task API exists only when the example option was selected; use your own query otherwise.

## Production

Create or choose a production deployment in the Convex dashboard. Set `CLERK_JWT_ISSUER_DOMAIN` on that deployment if Clerk is enabled, using the production Clerk issuer. Configure a `CONVEX_DEPLOY_KEY` as a secret in the CI or hosting environment and run `npx convex deploy` from the project root. Set the production deployment URL as `NEXT_PUBLIC_CONVEX_URL` for the web build and `EXPO_PUBLIC_CONVEX_URL` for the mobile build. Configure production Clerk keys in the matching app environments. In a monorepo, both apps must use the same production Convex URL.
