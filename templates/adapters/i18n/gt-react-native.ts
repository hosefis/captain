/**
 * General Translation (gt-react-native) adapter for Expo.
 * Requires dev build — not compatible with Expo Go.
 */
export const gtReactNativeConfig = {
  defaultLocale: "{defaultLocale}",
  locales: "{locales}".split(","),
  projectId: process.env.EXPO_PUBLIC_GT_PROJECT_ID ?? "",
} as const;

export type GtReactNativeLocale = (typeof gtReactNativeConfig.locales)[number];
