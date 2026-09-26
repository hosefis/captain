import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { parseProjectConfig } from "../schema/project-config.js";
import { applyProjectStructure } from "./project-structure.js";

function directory(label: string): string {
  const target = join(
    tmpdir(),
    `captain-structure-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, "package.json"), '{"name":"seed","scripts":{}}\n');
  return target;
}

const base = {
  name: "acme",
  scope: "@acme",
  packageManager: "pnpm",
  backend: "rest",
  auth: "none",
  locales: ["en"],
  defaultLocale: "en",
} as const;

describe("applyProjectStructure", () => {
  it("keeps standalone projects at the framework root", () => {
    const config = parseProjectConfig({
      ...base,
      topology: "web",
      i18n: "gt-next",
      ui: "shadcn-base-ui",
    });
    const target = directory("web");

    applyProjectStructure(config, target);

    expect(existsSync(join(target, "src/app"))).toBe(true);
    expect(existsSync(join(target, "apps"))).toBe(false);
    expect(existsSync(join(target, "packages"))).toBe(false);
    expect(existsSync(join(target, "turbo.json"))).toBe(false);
    expect(readFileSync(join(target, "pnpm-workspace.yaml"), "utf-8")).toContain(
      'packages:\n  - "."',
    );
  });

  it("makes a scaffold-generated pnpm config valid for a standalone root", () => {
    const config = parseProjectConfig({
      ...base,
      topology: "web",
      i18n: "gt-next",
      ui: "shadcn-base-ui",
    });
    const target = directory("standalone-pnpm");
    writeFileSync(
      join(target, "pnpm-workspace.yaml"),
      "ignoredBuiltDependencies:\n  - sharp\n",
    );

    applyProjectStructure(config, target);

    const workspace = readFileSync(
      join(target, "pnpm-workspace.yaml"),
      "utf-8",
    );
    expect(workspace).toContain('packages:\n  - "."');
    expect(workspace).toContain("ignoredBuiltDependencies:");
    expect(existsSync(join(target, "turbo.json"))).toBe(false);
  });

  it("creates shared packages only for explicit monorepos", () => {
    const config = parseProjectConfig({
      ...base,
      topology: "monorepo",
      runtime: "expo-go",
      i18n: { web: "gt-next", mobile: "none" },
      ui: { web: "shadcn-base-ui", mobile: "nativewind" },
    });
    const target = directory("monorepo");
    writeFileSync(join(target, "package.json"), '{"name":"seed","devDependencies":{"typescript":"7.0.2"}}\n');
    mkdirSync(join(target, "apps/web"), { recursive: true });
    mkdirSync(join(target, "apps/mobile"), { recursive: true });
    mkdirSync(join(target, "packages/ui"), { recursive: true });
    writeFileSync(join(target, "packages/ui/package.json"), '{"name":"@repo/ui","devDependencies":{"typescript":"7.0.2"}}\n');
    writeFileSync(join(target, "apps/web/pnpm-workspace.yaml"), 'packages:\n  - "."\n');
    writeFileSync(join(target, "apps/web/package.json"), '{"name":"web","packageManager":"pnpm@11.25.0","scripts":{"build":"next build"}}\n');
    writeFileSync(join(target, "apps/mobile/package.json"), '{"name":"mobile","scripts":{"start":"expo start"}}\n');

    applyProjectStructure(config, target);

    expect(existsSync(join(target, "packages/core"))).toBe(true);
    expect(existsSync(join(target, "packages/adapters-next"))).toBe(true);
    expect(existsSync(join(target, "packages/adapters-expo"))).toBe(true);
    expect(existsSync(join(target, "turbo.json"))).toBe(true);
    expect(
      JSON.parse(readFileSync(join(target, "package.json"), "utf-8")).scripts.dev,
    ).toBe("turbo dev");
    expect(JSON.parse(readFileSync(join(target, "package.json"), "utf-8")).devDependencies.typescript).toBe("5.9.3");
    expect(JSON.parse(readFileSync(join(target, "packages/ui/package.json"), "utf-8")).devDependencies.typescript).toBe("5.9.3");
    expect(existsSync(join(target, "apps/web/pnpm-workspace.yaml"))).toBe(false);
    const web = JSON.parse(readFileSync(join(target, "apps/web/package.json"), "utf-8"));
    const mobile = JSON.parse(readFileSync(join(target, "apps/mobile/package.json"), "utf-8"));
    expect(web.packageManager).toBeUndefined();
    expect(web.scripts.typecheck).toBe("tsc --noEmit");
    expect(mobile.scripts.build).toBe("expo export");
  });

  it("resolves the shared Babel preset from its own package for Bun installs", () => {
    const config = parseProjectConfig({
      ...base,
      packageManager: "bun",
      topology: "monorepo",
      runtime: "expo-go",
      i18n: { web: "gt-next", mobile: "none" },
      ui: { web: "shadcn-base-ui", mobile: "nativewind" },
    });
    const target = directory("bun-eslint");
    const eslintDir = join(target, "packages/eslint-config");
    mkdirSync(eslintDir, { recursive: true });
    writeFileSync(
      join(eslintDir, "base.js"),
      'export const config = { presets: ["@babel/preset-typescript"] };\n',
    );

    applyProjectStructure(config, target);

    const patched = readFileSync(join(eslintDir, "base.js"), "utf-8");
    expect(patched).toContain('createRequire(import.meta.url).resolve("@babel/preset-typescript")');
    expect(patched).toContain('import { createRequire } from "node:module"');
  });
});
