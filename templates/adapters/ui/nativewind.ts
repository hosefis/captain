/**
 * NativeWind v4 setup for Expo.
 * See nativewind.dev for metro/babel plugin configuration.
 */
export const nativeWindConfiguration = {
  input: "./src/global.css",
  presets: ["nativewind/preset"],
} as const;

/** Tailwind layers used by the NativeWind application stylesheet. */
export const nativeWindGlobalCss = `@tailwind base;
@tailwind components;
@tailwind utilities;
`;
