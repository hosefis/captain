/**
 * General Translation (gt-react-native) adapter for Expo.
 * Requires dev build — not compatible with Expo Go.
 */
export const gtReactNativeConfiguration = {
  defaultLocale: "{defaultLocale}",
  locales: "{locales}".split(","),
  projectId: process.env.EXPO_PUBLIC_GT_PROJECT_ID ?? "",
} as const;

/** Locale accepted by the configured mobile translation adapter. */
export type GtReactNativeLocale = (typeof gtReactNativeConfiguration.locales)[number];
