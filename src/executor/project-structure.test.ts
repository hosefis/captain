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
    mkdirSync(join(target, "apps/web"), { recursive: true });
    mkdirSync(join(target, "apps/mobile"), { recursive: true });
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
    expect(existsSync(join(target, "apps/web/pnpm-workspace.yaml"))).toBe(false);
    const web = JSON.parse(readFileSync(join(target, "apps/web/package.json"), "utf-8"));
    const mobile = JSON.parse(readFileSync(join(target, "apps/mobile/package.json"), "utf-8"));
    expect(web.packageManager).toBeUndefined();
    expect(web.scripts.typecheck).toBe("tsc --noEmit");
    expect(mobile.scripts.build).toBe("expo export");
  });
});
