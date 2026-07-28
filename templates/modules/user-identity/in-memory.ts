import type { UserIdentityAdapter, UserProfile, UserRole } from "./types.js";

export function createInMemoryUserIdentityAdapter(
  seed: UserProfile[] = [],
): UserIdentityAdapter {
  const store = new Map<string, UserProfile>(seed.map((profile) => [profile.id, profile]));

  return {
    getProfile: async (userId) => store.get(userId) ?? null,
    updateProfile: async (userId, input) => {
      const existing = store.get(userId);
      if (!existing) {
        throw new Error(`User "${userId}" not found`);
      }
      const updated: UserProfile = { ...existing, ...input, id: userId, role: existing.role };
      store.set(userId, updated);
      return updated;
    },
    listByRole: async (role: UserRole) =>
      [...store.values()].filter((profile) => profile.role === role),
  };
}
