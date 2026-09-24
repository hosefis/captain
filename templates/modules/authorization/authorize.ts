import type {
  AuthDecision,
  AuthorizationAction,
  AuthorizationAdapter,
  AuthorizationClaims,
} from "./types.js";

export function authorize(
  adapter: AuthorizationAdapter,
  action: AuthorizationAction,
  claims: AuthorizationClaims,
): AuthDecision {
  return adapter.authorize(action, claims);
}
