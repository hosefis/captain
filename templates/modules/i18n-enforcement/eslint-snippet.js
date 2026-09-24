/**
 * ESLint rule config snippet — ban hardcoded toast/alert strings in UI code.
 * Merge into your ESLint flat config after CAPTAIN init.
 */
export const captainI18nEnforcement = {
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
