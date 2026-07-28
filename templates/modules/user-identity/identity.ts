import type { UserIdentityAdapter, UserIdentityConfig, UserProfile, UserRole } from "./types.js";

export type { UserIdentityAdapter, UserIdentityConfig, UserProfile, UserRole } from "./types.js";

export function createUserIdentity(config: UserIdentityConfig, adapter: UserIdentityAdapter) {
  const role: UserRole = config.role;

  return {
    role,
    getProfile: (userId: string) => adapter.getProfile(userId),
    updateProfile: (
      userId: string,
      input: Partial<Omit<UserProfile, "id" | "role">>,
    ) => adapter.updateProfile(userId, input),
    list: () => {
      if (!adapter.listByRole) {
        throw new Error(`UserIdentity list is not configured for role "${role}"`);
      }
      return adapter.listByRole(role);
    },
  };
}

export type UserIdentity = ReturnType<typeof createUserIdentity>;
