/**
 * General Translation (gt-next) adapter for Next.js App Router.
 * Install: gt-next, gtx-cli — run `pnpm i18n:extract` after adding strings.
 */
export const gtNextConfig = {
  defaultLocale: "{defaultLocale}",
  locales: "{locales}".split(","),
  projectId: process.env.GT_PROJECT_ID ?? "",
} as const;

export type GtNextLocale = (typeof gtNextConfig.locales)[number];
