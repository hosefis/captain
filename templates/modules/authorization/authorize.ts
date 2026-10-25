import type {
  AuthorizationDecision,
  AuthorizationAction,
  AuthorizationAdapter,
  AuthorizationClaims,
} from "./types.js";

/** Delegates a resource action to the configured authorization policy. */
export function authorize(
  adapter: AuthorizationAdapter,
  action: AuthorizationAction,
  claims: AuthorizationClaims,
): AuthorizationDecision {
  return adapter.authorize(action, claims);
}
