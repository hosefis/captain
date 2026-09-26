import type { AuthConfig } from "convex/server";

// The first `convex dev` can create a deployment before its issuer is known.
// After setting CLERK_JWT_ISSUER_DOMAIN on that deployment, rerun `convex dev`.
const issuer = process.env.CLERK_JWT_ISSUER_DOMAIN;

export default {
  providers: issuer ? [{ domain: issuer, applicationID: "convex" }] : [],
} satisfies AuthConfig;
