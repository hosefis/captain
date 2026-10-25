import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { parseProjectConfiguration } from "../schema/project-configuration.js";
import { applyProjectStructure } from "./project-structure.js";
import { applyRecipes } from "./apply-recipes.js";

const generatedDirectories: string[] = [];

afterEach(() => {
  for (const directory of generatedDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function createProjectDirectory(label: string): string {
  const directory = join(
    tmpdir(),
    `captain-recipes-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(directory, { recursive: true });
  generatedDirectories.push(directory);
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
  it.each(["js", "mjs", "cjs", "ts", "mts", "cts"])("preserves custom Expo framework lint configuration in %s", (extension) => {
    const configuration = parseProjectConfiguration({ ...base, topology: "mobile", runtime: "expo-go", auth: "none", i18n: "none", ui: "nativewind" });
    const directory = createProjectDirectory("mobile-preserved-eslint");
    applyProjectStructure(configuration, directory);
    const eslintConfiguration = '[{ rules: { "no-console": "error" } }]';
    const original = ["js", "cjs", "cts"].includes(extension)
      ? `// Application-owned rules.\r\nmodule.exports = ${eslintConfiguration};`
      : `// Application-owned rules.\r\nexport default ${eslintConfiguration};`;
    writeFileSync(join(directory, `eslint.config.${extension}`), original);
    expect(applyRecipes(configuration, directory).ok).toBe(true);
    expect(readFileSync(join(directory, `eslint.config.${extension}`), "utf-8")).toBe(original);
    expect(existsSync(join(directory, "eslint.config.js"))).toBe(extension === "js");
  });
  it("emits Next.js code into framework-native src directories", () => {
    const configuration = parseProjectConfiguration({
      ...base,
      topology: "web",
      auth: "clerk",
      i18n: "gt-next",
      ui: "shadcn-base-ui",
    });
    const directory = createProjectDirectory("web");
    applyProjectStructure(configuration, directory);

    expect(applyRecipes(configuration, directory).ok).toBe(true);
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
    const manifest = JSON.parse(
      readFileSync(join(directory, "package.json"), "utf-8"),
    ) as { dependencies: Record<string, string> };
    expect(manifest.dependencies["@clerk/nextjs"]).toBe("^6.22.0");
  });

  it("adds Clerk's Expo runtime dependencies before installation", () => {
    const configuration = parseProjectConfiguration({
      ...base,
      topology: "mobile",
      runtime: "dev-build",
      auth: "clerk",
      i18n: "gt-react-native",
      ui: "nativewind",
    });
    const directory = createProjectDirectory("mobile-clerk");
    applyProjectStructure(configuration, directory);

    expect(applyRecipes(configuration, directory).ok).toBe(true);
    const manifest = JSON.parse(
      readFileSync(join(directory, "package.json"), "utf-8"),
    ) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
    expect(manifest.dependencies["@clerk/expo"]).toBe("^4.7.1");
    expect(manifest.dependencies["expo-secure-store"]).toBe("^57.0.4");
    expect(manifest.dependencies["expo-auth-session"]).toBe("^57.0.13");
    expect(manifest.devDependencies["@babel/core"]).toBe("^7.29.7");
    expect(manifest.devDependencies["@babel/plugin-transform-react-jsx"]).toBe("^7.29.7");
    expect(manifest.devDependencies["@babel/plugin-transform-react-jsx-development"]).toBe(
      "^7.29.7",
    );
    expect(manifest.devDependencies["@babel/types"]).toBe("^7.29.8");
  });

  it("supports Expo Go with no i18n and no authentication", () => {
    const configuration = parseProjectConfiguration({
      ...base,
      topology: "mobile",
      runtime: "expo-go",
      auth: "none",
      i18n: "none",
      ui: "nativewind",
    });
    const directory = createProjectDirectory("mobile");
    applyProjectStructure(configuration, directory);

    const result = applyRecipes(configuration, directory);
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
    const configuration = parseProjectConfiguration({
      ...base,
      topology: "monorepo",
      apps: ["web", "mobile"],
      runtime: "dev-build",
      auth: "clerk",
      i18n: { web: "gt-next", mobile: "gt-react-native" },
      ui: { web: "shadcn-base-ui", mobile: "nativewind" },
    });
    const directory = createProjectDirectory("monorepo-direct-imports");
    applyProjectStructure(configuration, directory);
    mkdirSync(join(directory, "apps/mobile"), { recursive: true });
    writeFileSync(join(directory, "apps/mobile/package.json"), '{"name":"mobile"}\n');

    expect(applyRecipes(configuration, directory).ok).toBe(true);
    const mobileManifest = JSON.parse(
      readFileSync(join(directory, "apps/mobile/package.json"), "utf-8"),
    ) as { devDependencies: Record<string, string> };
    expect(mobileManifest.devDependencies["@babel/plugin-transform-react-jsx"]).toBe("^7.29.7");
    expect(mobileManifest.devDependencies["@babel/plugin-transform-react-jsx-development"]).toBe(
      "^7.29.7",
    );
    for (const packageName of ["core", "adapters-next", "adapters-expo"]) {
      const packageDirectory = join(directory, "packages", packageName);
      const manifest = JSON.parse(readFileSync(join(packageDirectory, "package.json"), "utf-8")) as {
        exports: Record<string, string>;
      };
      expect(existsSync(join(packageDirectory, "src/index.ts"))).toBe(false);
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
    const configuration = parseProjectConfiguration({
      ...base,
      backend: "convex",
      topology: "web",
      auth: "none",
      i18n: "gt-next",
      ui: "shadcn-base-ui",
    });
    const directory = createProjectDirectory("convex-web");
    applyProjectStructure(configuration, directory);

    expect(applyRecipes(configuration, directory)).toEqual(expect.objectContaining({ ok: true }));
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
    const configuration = parseProjectConfiguration({
      ...base,
      backend: "convex",
      convexExample: true,
      topology: "mobile",
      runtime: "expo-go",
      auth: "none",
      i18n: "none",
      ui: "nativewind",
    });
    const directory = createProjectDirectory("convex-mobile");
    applyProjectStructure(configuration, directory);

    expect(applyRecipes(configuration, directory).ok).toBe(true);
    expect(existsSync(join(directory, "src/app/example.tsx"))).toBe(true);
    expect(existsSync(join(directory, "src/app/sign-in.tsx"))).toBe(false);
    expect(readFileSync(join(directory, "src/app/index.tsx"), "utf-8")).toContain("/example");
    expect(readFileSync(join(directory, "src/app/example.tsx"), "utf-8")).toContain(
      "../../convex/_generated/api",
    );
  });

  it("shares one Clerk-protected backend across monorepo apps", () => {
    const configuration = parseProjectConfiguration({
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
    const directory = createProjectDirectory("convex-monorepo");
    applyProjectStructure(configuration, directory);

    expect(applyRecipes(configuration, directory).ok).toBe(true);
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
