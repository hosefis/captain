/** Result of evaluating an application authorization policy. */
export type AuthorizationDecision =
  | { kind: "allow" }
  | { kind: "redirect"; to: string }
  | { kind: "deny"; reason?: string };

/** Identity and roles used to evaluate access to a resource. */
export type AuthorizationClaims = {
  userId: string;
  roles: string[];
  permissions?: string[];
};

/** Resource operation being checked by an authorization policy. */
export type AuthorizationAction = {
  resource: string;
  action: string;
};

/** Contract for application authorization policy implementations. */
export type AuthorizationAdapter = {
  /** Evaluates whether the supplied identity can perform a resource action. */
  authorize(action: AuthorizationAction, claims: AuthorizationClaims): AuthorizationDecision;
};
