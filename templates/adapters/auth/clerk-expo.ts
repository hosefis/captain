/**
 * Clerk auth adapter for Expo.
 * Requires @clerk/expo and expo-secure-store — see Clerk Expo docs.
 */
export const clerkExpoConfig = {
  publishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "",
} as const;

export type ClerkExpoSessionClaims = {
  userId: string;
  roles: string[];
};

export function mapClerkExpoClaims(userId: string, role: string | undefined): ClerkExpoSessionClaims {
  return {
    userId,
    roles: role ? [role] : [],
  };
}
