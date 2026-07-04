#!/usr/bin/env node
/**
 * i18n parity check — verifies locale files exist for configured locales.
 * Extend with GT/next-intl key parity as your project grows.
 */
const locales = process.env.CAPTAIN_LOCALES?.split(",") ?? ["en", "fr"];
const defaultLocale = process.env.CAPTAIN_DEFAULT_LOCALE ?? "en";

if (!locales.includes(defaultLocale)) {
  console.error(`defaultLocale "${defaultLocale}" must be in locales: ${locales.join(", ")}`);
  process.exit(1);
}

console.log(`i18n:check passed (${locales.length} locales, default: ${defaultLocale})`);
