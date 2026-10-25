/**
 * ESLint rule configuration snippet — ban hardcoded toast/alert strings in UI code.
 * Merge into your ESLint flat configuration to enforce translated messages.
 */
export const internationalizationEnforcement = {
  rules: {
    "no-restricted-syntax": [
      "warn",
      {
        selector: "CallExpression[callee.name='toast'][arguments.0.type='Literal']",
        message: "Use i18n keys for toast messages — no hardcoded strings.",
      },
    ],
  },
};
