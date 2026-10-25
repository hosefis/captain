export type AuthDecision =
  | { kind: "allow" }
  | { kind: "redirect"; to: string }
  | { kind: "deny"; reason?: string };

export type AuthorizationClaims = {
  userId: string;
  roles: string[];
  permissions?: string[];
};

export type AuthorizationAction = {
  resource: string;
  action: string;
};

export type AuthorizationAdapter = {
  /** Decide whether the supplied claims permit an action. */
  authorize(action: AuthorizationAction, claims: AuthorizationClaims): AuthDecision;
};
