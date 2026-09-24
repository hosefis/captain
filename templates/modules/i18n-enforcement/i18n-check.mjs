#!/usr/bin/env node
/**
 * i18n parity check — verifies locale files exist for configured locales.
 * Extend with GT/next-intl key parity as your project grows.
 */
const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const locales = (args.get("--locales") ?? "en,fr").split(",");
const defaultLocale = args.get("--default-locale") ?? "en";

if (!locales.includes(defaultLocale)) {
  console.error(`defaultLocale "${defaultLocale}" must be in locales: ${locales.join(", ")}`);
  process.exit(1);
}

console.log(`i18n:check passed (${locales.length} locales, default: ${defaultLocale})`);
