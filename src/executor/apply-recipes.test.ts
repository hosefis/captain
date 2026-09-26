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
    expect(existsSync(join(directory, "src/lib/index.ts"))).toBe(false);
    expect(existsSync(join(directory, "src/features/authorization/types.ts"))).toBe(true);
    expect(existsSync(join(directory, "src/features/authorization/index.ts"))).toBe(false);
    expect(existsSync(join(directory, "src/integrations/auth/clerk.ts"))).toBe(true);
    expect(existsSync(join(directory, "src/integrations/index.ts"))).toBe(false);
    expect(readFileSync(join(directory, "src/integrations/backend/rest.ts"), "utf-8")).toContain(
      'from "@/lib/backend/http-client"',
    );
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
    ) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
    expect(packageJson.dependencies["@clerk/expo"]).toBe("^4.7.1");
    expect(packageJson.dependencies["expo-secure-store"]).toBe("^57.0.4");
    expect(packageJson.dependencies["expo-auth-session"]).toBe("^57.0.13");
    expect(packageJson.devDependencies["@babel/core"]).toBe("^7.29.7");
    expect(packageJson.devDependencies["@babel/types"]).toBe("^7.29.8");
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

describe("monorepo recipes", () => {
  it("exports direct module paths without package barrels", () => {
    const config = parseProjectConfig({
      ...base,
      topology: "monorepo",
      apps: ["web", "mobile"],
      runtime: "dev-build",
      auth: "clerk",
      i18n: { web: "gt-next", mobile: "gt-react-native" },
      ui: { web: "shadcn-base-ui", mobile: "nativewind" },
    });
    const directory = tempDir("monorepo-direct-imports");
    applyProjectStructure(config, directory);

    expect(applyRecipes(config, directory).ok).toBe(true);
    for (const packageName of ["core", "adapters-next", "adapters-expo"]) {
      const packageDir = join(directory, "packages", packageName);
      const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf-8")) as {
        exports: Record<string, string>;
      };
      expect(existsSync(join(packageDir, "src/index.ts"))).toBe(false);
      expect(manifest.exports["."]).toBeUndefined();
      expect(manifest.exports["./backend/*"]).toBe("./src/backend/*.ts");
    }
    expect(
      readFileSync(join(directory, "packages/adapters-next/src/backend/rest.ts"), "utf-8"),
    ).toContain('from "@acme/core/backend/http-client"');
    expect(
      readFileSync(join(directory, "packages/adapters-expo/src/backend/rest.ts"), "utf-8"),
    ).toContain('from "@acme/core/backend/client"');
  });
});

describe("Convex recipes", () => {
  it("generates web providers and server access without the optional example", () => {
    const config = parseProjectConfig({
      ...base,
      backend: "convex",
      topology: "web",
      auth: "none",
      i18n: "gt-next",
      ui: "shadcn-base-ui",
    });
    const directory = tempDir("convex-web");
    applyProjectStructure(config, directory);

    expect(applyRecipes(config, directory)).toEqual(expect.objectContaining({ ok: true }));
    expect(existsSync(join(directory, "convex/schema.ts"))).toBe(true);
    expect(existsSync(join(directory, "convex/_generated/api.d.ts"))).toBe(true);
    expect(existsSync(join(directory, "src/integrations/convex/server.ts"))).toBe(true);
    expect(existsSync(join(directory, "src/app/example/page.tsx"))).toBe(false);
    expect(existsSync(join(directory, "src/lib/backend/client.ts"))).toBe(false);
    const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf-8")) as {
      dependencies: Record<string, string>;
      scripts: Record<string, string>;
    };
    expect(manifest.dependencies.convex).toBe("^1.46.0");
    expect(manifest.scripts["convex:dev"]).toBe("convex dev");
  });

  it("generates an Expo Go public task example on a separate route", () => {
    const config = parseProjectConfig({
      ...base,
      backend: "convex",
      convexExample: true,
      topology: "mobile",
      runtime: "expo-go",
      auth: "none",
      i18n: "none",
      ui: "nativewind",
    });
    const directory = tempDir("convex-mobile");
    applyProjectStructure(config, directory);

    expect(applyRecipes(config, directory).ok).toBe(true);
    expect(existsSync(join(directory, "src/app/example.tsx"))).toBe(true);
    expect(existsSync(join(directory, "src/app/sign-in.tsx"))).toBe(false);
    expect(readFileSync(join(directory, "src/app/index.tsx"), "utf-8")).toContain("/example");
    expect(readFileSync(join(directory, "src/app/example.tsx"), "utf-8")).toContain(
      "../../convex/_generated/api",
    );
  });

  it("shares one Clerk-protected backend across monorepo apps", () => {
    const config = parseProjectConfig({
      ...base,
      backend: "convex",
      convexExample: true,
      topology: "monorepo",
      apps: ["web", "mobile"],
      runtime: "dev-build",
      auth: "clerk",
      i18n: { web: "gt-next", mobile: "gt-react-native" },
      ui: { web: "shadcn-base-ui", mobile: "nativewind" },
    });
    const directory = tempDir("convex-monorepo");
    applyProjectStructure(config, directory);

    expect(applyRecipes(config, directory).ok).toBe(true);
    expect(existsSync(join(directory, "packages/convex/convex/auth.config.ts"))).toBe(true);
    expect(existsSync(join(directory, "packages/convex/convex/tasks.ts"))).toBe(true);
    expect(existsSync(join(directory, "apps/web/src/app/example/page.tsx"))).toBe(true);
    expect(existsSync(join(directory, "apps/mobile/src/app/example.tsx"))).toBe(true);
    expect(existsSync(join(directory, "apps/mobile/src/app/sign-in.tsx"))).toBe(true);
    expect(readFileSync(join(directory, "convex.json"), "utf-8")).toContain(
      "packages/convex/convex/",
    );
    for (const app of ["web", "mobile"]) {
      expect(readFileSync(join(directory, `apps/${app}/src/app/example${app === "web" ? "/page" : ""}.tsx`), "utf-8")).toContain(
        "@acme/convex/_generated/api",
      );
    }
  });
});
