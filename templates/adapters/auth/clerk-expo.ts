/**
 * Clerk auth adapter for Expo.
 * Requires @clerk/expo and expo-secure-store — see Clerk Expo docs.
 */
export const clerkExpoConfiguration = {
  publishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "",
} as const;

/** Application identity and role claims derived from a Clerk mobile session. */
export type ClerkExpoSessionClaims = {
  userId: string;
  roles: string[];
};

/** Maps a Clerk mobile user and optional role into application authorization claims. */
export function mapClerkExpoClaims(userId: string, role: string | undefined): ClerkExpoSessionClaims {
  return {
    userId,
    roles: role ? [role] : [],
  };
}
