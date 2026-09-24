import type {
  AuthDecision,
  AuthorizationAction,
  AuthorizationAdapter,
  AuthorizationClaims,
} from "./types.js";

export function createInMemoryAuthorizationAdapter(
  rules: Array<{
    role: string;
    resource: string;
    action: string;
  }>,
): AuthorizationAdapter {
  return {
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
