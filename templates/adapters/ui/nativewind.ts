/**
 * NativeWind v4 setup for Expo.
 * See nativewind.dev for metro/babel plugin configuration.
 */
export const nativeWindConfig = {
  input: "./src/global.css",
  presets: ["nativewind/preset"],
} as const;

export const nativeWindGlobalCss = `@tailwind base;
@tailwind components;
@tailwind utilities;
`;
