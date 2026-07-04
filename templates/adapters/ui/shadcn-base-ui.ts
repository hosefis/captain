/**
 * shadcn + Base UI (base-vega) setup for Next.js.
 * After install run: npx shadcn@latest create --style base-vega
 */
export const shadcnBaseUiConfig = {
  style: "base-vega",
  tailwind: {
    config: "tailwind.config.ts",
    css: "app/globals.css",
  },
  aliases: {
    components: "@/components",
    utils: "@/lib/utils",
  },
} as const;
