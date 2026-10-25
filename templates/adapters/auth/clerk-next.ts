/**
 * Clerk auth adapter for Next.js App Router.
 * Wire in middleware.ts and server actions per Next.js data security guide.
 */
export const clerkAuthConfig = {
  publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "",
  signInUrl: "/sign-in",
  signUpUrl: "/sign-up",
  afterSignInUrl: "/",
  afterSignUpUrl: "/",
} as const;

export type ClerkSessionClaims = {
  userId: string;
  roles: string[];
};

/** Map Clerk session identity and role into application authorization claims. */
export function mapClerkClaims(userId: string, role: string | undefined): ClerkSessionClaims {
  return {
    userId,
    roles: role ? [role] : [],
  };
}
