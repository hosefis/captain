import type {
  AuthorizationDecision,
  AuthorizationAction,
  AuthorizationAdapter,
  AuthorizationClaims,
} from "./types.js";

/** Evaluates role and resource rules without an external authorization service. */
export function createInMemoryAuthorizationAdapter(
  rules: Array<{
    role: string;
    resource: string;
    action: string;
  }>,
): AuthorizationAdapter {
  return {
    /** Evaluates the configured role rules for a resource action. */
    authorize(action: AuthorizationAction, claims: AuthorizationClaims): AuthorizationDecision {
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
