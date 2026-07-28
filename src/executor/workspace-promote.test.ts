import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { applyWorkspacePromotion } from "./workspace-promote.js";
import type { NormalizedProjectConfig } from "../schema/project-config.js";

const webConfig: NormalizedProjectConfig = {
  name: "acme-web",
  scope: "@acme",
  packageManager: "pnpm",
  topology: "web",
  apps: ["web"],
  backend: "rest",
  auth: "clerk",
  i18n: { web: "gt-next" },
  ui: { web: "shadcn-base-ui" },
  modules: ["authorization"],
  locales: ["en", "fr"],
  defaultLocale: "en",
  validation: "strict",
  stacks: { hasWeb: true, hasMobile: false, hasDesktop: false },
};

function makeTempDir(prefix: string): string {
  const dir = join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("applyWorkspacePromotion", () => {
  it.each(["pnpm", "npm", "bun"] as const)(
    "emits a valid %s standalone workspace",
    (packageManager) => {
      const targetDir = makeTempDir(`captain-${packageManager}-promote`);
      writeFileSync(
        join(targetDir, "package.json"),
        JSON.stringify({ name: "temp-next", scripts: { dev: "next dev" } }),
      );

      applyWorkspacePromotion({ ...webConfig, packageManager }, targetDir);

      const root = JSON.parse(
        readFileSync(join(targetDir, "package.json"), "utf8"),
      ) as {
        workspaces: string[];
        scripts: Record<string, string>;
        pnpm?: { onlyBuiltDependencies?: string[] };
      };
      expect(root.workspaces).toEqual(["apps/*", "packages/*"]);
      expect(root.scripts.build).toBe("turbo build");
      expect(existsSync(join(targetDir, "pnpm-workspace.yaml"))).toBe(
        packageManager === "pnpm",
      );
      if (packageManager === "pnpm") {
        expect(
          readFileSync(join(targetDir, "pnpm-workspace.yaml"), "utf8"),
        ).toContain('  "sharp": true');
      }
      expect(root.pnpm?.onlyBuiltDependencies).toEqual(
        packageManager === "pnpm"
          ? ["@clerk/shared", "esbuild", "msw", "sharp", "unrs-resolver"]
          : undefined,
      );

      const adapter = JSON.parse(
        readFileSync(
          join(targetDir, "packages/adapters-next/package.json"),
          "utf8",
        ),
      ) as { dependencies: Record<string, string> };
      expect(adapter.dependencies["@acme/core"]).toBe(
        packageManager === "npm" ? "*" : "workspace:*",
      );
    },
  );

  it("hoists standalone web app into apps/web and creates packages", () => {
    const targetDir = makeTempDir("captain-web-promote");

    writeFileSync(
      join(targetDir, "package.json"),
      JSON.stringify({ name: "temp-next", scripts: { dev: "next dev" } }),
    );
    mkdirSync(join(targetDir, "app"), { recursive: true });
    writeFileSync(join(targetDir, "app", "page.tsx"), "export default function Page() { return null; }");

    applyWorkspacePromotion(webConfig, targetDir);

    expect(readFileSync(join(targetDir, "pnpm-workspace.yaml"), "utf-8")).toContain("packages/*");
    expect(readFileSync(join(targetDir, "apps/web/package.json"), "utf-8")).toContain("@acme/web");
    expect(readFileSync(join(targetDir, "packages/core/package.json"), "utf-8")).toContain("@acme/core");
    expect(readFileSync(join(targetDir, "packages/adapters-next/package.json"), "utf-8")).toContain(
      "@acme/adapters-next",
    );
  });

  it("adds packages to existing monorepo workspace", () => {
    const targetDir = makeTempDir("captain-mono-promote");
    const monorepoConfig: NormalizedProjectConfig = {
      ...webConfig,
      name: "acme-platform",
      topology: "monorepo",
      apps: ["web", "mobile"],
      i18n: { web: "gt-next", mobile: "gt-react-native" },
      ui: { web: "shadcn-base-ui", mobile: "nativewind" },
      runtime: "dev-build",
      stacks: { hasWeb: true, hasMobile: true, hasDesktop: true },
    };

    writeFileSync(
      join(targetDir, "pnpm-workspace.yaml"),
      'packages:\n  - "apps/*"\n',
    );
    mkdirSync(join(targetDir, "apps/web"), { recursive: true });
    mkdirSync(join(targetDir, "apps/mobile"), { recursive: true });

    applyWorkspacePromotion(monorepoConfig, targetDir);

    expect(readFileSync(join(targetDir, "pnpm-workspace.yaml"), "utf-8")).toContain("packages/*");
    expect(readFileSync(join(targetDir, "packages/core/package.json"), "utf-8")).toContain("@acme/core");
    expect(readFileSync(join(targetDir, "packages/adapters-expo/package.json"), "utf-8")).toContain(
      "@acme/adapters-expo",
    );
    expect(readFileSync(join(targetDir, "apps/desktop/README.md"), "utf-8")).toContain("Desktop app slot");
  });
});
