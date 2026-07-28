export type UserRole = string;

export type UserProfile = {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  metadata?: Record<string, unknown>;
};

export type UserIdentityConfig = {
  role: UserRole;
  apiPath: string;
};

export type UserIdentityAdapter = {
  getProfile(userId: string): Promise<UserProfile | null>;
  updateProfile(userId: string, input: Partial<Omit<UserProfile, "id" | "role">>): Promise<UserProfile>;
  listByRole?(role: UserRole): Promise<UserProfile[]>;
};
