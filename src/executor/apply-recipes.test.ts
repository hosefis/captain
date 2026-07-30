import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { parseProjectConfig } from "../schema/project-config.js";
import { applyProjectStructure } from "./project-structure.js";
import { applyRecipes } from "./apply-recipes.js";

function tempDir(label: string): string {
  const directory = join(
    tmpdir(),
    `captain-recipes-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, "package.json"),
    `${JSON.stringify({ name: label, scripts: {} }, null, 2)}\n`,
  );
  return directory;
}

const base = {
  name: "acme",
  scope: "@acme",
  packageManager: "pnpm",
  backend: "rest",
  locales: ["en"],
  defaultLocale: "en",
} as const;

describe("standalone recipes", () => {
  it("emits Next.js code into framework-native src directories", () => {
    const config = parseProjectConfig({
      ...base,
      topology: "web",
      auth: "clerk",
      i18n: "gt-next",
      ui: "shadcn-base-ui",
    });
    const directory = tempDir("web");
    applyProjectStructure(config, directory);

    expect(applyRecipes(config, directory).ok).toBe(true);
    expect(existsSync(join(directory, "src/lib/backend/client.ts"))).toBe(true);
    expect(existsSync(join(directory, "src/features/authorization/types.ts"))).toBe(true);
    expect(existsSync(join(directory, "src/integrations/auth/clerk.ts"))).toBe(true);
    expect(existsSync(join(directory, "src/app/layout.tsx"))).toBe(true);
    expect(existsSync(join(directory, "turbo.json"))).toBe(false);
    expect(existsSync(join(directory, "packages"))).toBe(false);
    const packageJson = JSON.parse(
      readFileSync(join(directory, "package.json"), "utf-8"),
    ) as { dependencies: Record<string, string> };
    expect(packageJson.dependencies["@clerk/nextjs"]).toBe("^6.22.0");
  });

  it("adds Clerk's Expo runtime dependencies before installation", () => {
    const config = parseProjectConfig({
      ...base,
      topology: "mobile",
      runtime: "dev-build",
      auth: "clerk",
      i18n: "gt-react-native",
      ui: "nativewind",
    });
    const directory = tempDir("mobile-clerk");
    applyProjectStructure(config, directory);

    expect(applyRecipes(config, directory).ok).toBe(true);
    const packageJson = JSON.parse(
      readFileSync(join(directory, "package.json"), "utf-8"),
    ) as { dependencies: Record<string, string> };
    expect(packageJson.dependencies["@clerk/expo"]).toBe("^2.11.0");
    expect(packageJson.dependencies["expo-secure-store"]).toBe("^14.2.3");
  });

  it("supports Expo Go with no i18n and no authentication", () => {
    const config = parseProjectConfig({
      ...base,
      topology: "mobile",
      runtime: "expo-go",
      auth: "none",
      i18n: "none",
      ui: "nativewind",
    });
    const directory = tempDir("mobile");
    applyProjectStructure(config, directory);

    const result = applyRecipes(config, directory);
    expect(result.ok).toBe(true);
    expect(existsSync(join(directory, "src/features/authorization"))).toBe(false);
    expect(existsSync(join(directory, "src/integrations/auth"))).toBe(false);
    expect(existsSync(join(directory, "src/integrations/i18n"))).toBe(false);
    expect(readFileSync(join(directory, "src/app/_layout.tsx"), "utf-8")).toContain(
      "<Stack />",
    );
  });
});
