const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

/** Applies Expo lint rules and permits the starter's web hydration hook. */
module.exports = defineConfig([
  expoConfig,
  { ignores: ["dist/*", "convex/_generated/*"] },
  /** Expo starter hydration compatibility. */
  {
    files: ["src/hooks/use-color-scheme.web.ts"],
    rules: { "react-hooks/set-state-in-effect": "off" },
  },
]);
