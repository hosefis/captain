#!/usr/bin/env node
/**
 * Validates that the default locale belongs to the configured locales.
 */
const argumentsByFlag = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  argumentsByFlag.set(process.argv[index], process.argv[index + 1]);
}

const locales = (argumentsByFlag.get("--locales") ?? "en,fr").split(",");
const defaultLocale = argumentsByFlag.get("--default-locale") ?? "en";

if (!locales.includes(defaultLocale)) {
  console.error(`defaultLocale "${defaultLocale}" must be in locales: ${locales.join(", ")}`);
  process.exit(1);
}

console.log(`i18n:check passed (${locales.length} locales, default: ${defaultLocale})`);
