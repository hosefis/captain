/**
 * Clerk auth adapter for Next.js App Router.
 * Wire in middleware.ts and server actions per Next.js data security guide.
 */
export const clerkAuthenticationConfiguration = {
  publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "",
  signInUrl: "/sign-in",
  signUpUrl: "/sign-up",
  afterSignInUrl: "/",
  afterSignUpUrl: "/",
} as const;

/** Application identity and role claims derived from a Clerk session. */
export type ClerkSessionClaims = {
  userId: string;
  roles: string[];
};

/** Maps a Clerk user and optional role into application authorization claims. */
export function mapClerkClaims(userId: string, role: string | undefined): ClerkSessionClaims {
  return {
    userId,
    roles: role ? [role] : [],
  };
}
