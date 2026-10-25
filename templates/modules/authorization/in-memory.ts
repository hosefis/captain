import type {
  AuthDecision,
  AuthorizationAction,
  AuthorizationAdapter,
  AuthorizationClaims,
} from "./types.js";

/** Create a role-based authorization policy backed by in-memory rules. */
export function createInMemoryAuthorizationAdapter(
  rules: Array<{
    role: string;
    resource: string;
    action: string;
  }>,
): AuthorizationAdapter {
  return {
    /** Allow actions matching a role rule and deny all others. */
    authorize(action: AuthorizationAction, claims: AuthorizationClaims): AuthDecision {
      const allowed = rules.some(
        (rule) =>
          claims.roles.includes(rule.role) &&
          rule.resource === action.resource &&
          rule.action === action.action,
      );

      if (allowed) {
        return { kind: "allow" };
      }

      return { kind: "deny", reason: "Insufficient permissions" };
    },
  };
}
