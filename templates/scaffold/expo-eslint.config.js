const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  { ignores: ["dist/*", "convex/_generated/*"] },
  {
    // The Expo starter's web hydration hook intentionally marks hydration in an effect.
    files: ["src/hooks/use-color-scheme.web.ts"],
    rules: { "react-hooks/set-state-in-effect": "off" },
  },
]);
