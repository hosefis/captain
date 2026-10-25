import type {
  AuthDecision,
  AuthorizationAction,
  AuthorizationAdapter,
  AuthorizationClaims,
} from "./types.js";

/** Evaluate an action against the selected authorization policy. */
export function authorize(
  adapter: AuthorizationAdapter,
  action: AuthorizationAction,
  claims: AuthorizationClaims,
): AuthDecision {
  return adapter.authorize(action, claims);
}
