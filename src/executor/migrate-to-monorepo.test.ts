import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { applyRecipes } from "./apply-recipes.js";
import { migrateToMonorepo } from "./migrate-to-monorepo.js";
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

function makeTempDir(): string {
  const dir = join(
    tmpdir(),
    `captain-migrate-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function seedStandaloneWeb(targetDir: string): void {
  mkdirSync(join(targetDir, "apps", "web"), { recursive: true });
  writeFileSync(
    join(targetDir, "apps", "web", "package.json"),
    JSON.stringify({ name: "@acme/web", scripts: { dev: "next dev" } }, null, 2),
  );
  writeFileSync(
    join(targetDir, "package.json"),
    JSON.stringify({ name: webConfig.name, private: true }, null, 2),
  );
  applyWorkspacePromotion(webConfig, targetDir);
  applyRecipes(webConfig, targetDir);

  const { stacks: _stacks, ...serializable } = webConfig;
  writeFileSync(join(targetDir, "project.json"), `${JSON.stringify(serializable, null, 2)}\n`, "utf-8");
}

describe("migrateToMonorepo", () => {
  it("converts standalone web project to monorepo topology", async () => {
    const targetDir = makeTempDir();
    seedStandaloneWeb(targetDir);

    const result = await migrateToMonorepo({ targetDir });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.config.topology).toBe("monorepo");
    expect(result.config.apps).toEqual(["web"]);

    const project = JSON.parse(readFileSync(join(targetDir, "project.json"), "utf-8")) as {
      topology: string;
      apps: string[];
    };
    expect(project.topology).toBe("monorepo");
    expect(project.apps).toEqual(["web"]);
    expect(existsSync(join(targetDir, "turbo.json"))).toBe(true);

    const rootPkg = JSON.parse(readFileSync(join(targetDir, "package.json"), "utf-8")) as {
      scripts: Record<string, string>;
    };
    expect(rootPkg.scripts.dev).toBe("turbo dev");
  });

  it("bootstraps a mobile app when --add mobile", async () => {
    const targetDir = makeTempDir();
    seedStandaloneWeb(targetDir);

    const seen: string[] = [];
    const result = await migrateToMonorepo({
      targetDir,
      addApp: "mobile",
      bootstrapRunner: async (step) => {
        seen.push(step.id);
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.config.apps).toEqual(["web", "mobile"]);
    expect(result.addedApps).toEqual(["mobile"]);
    expect(seen).toEqual(["bootstrap-apps-mobile"]);
    expect(existsSync(join(targetDir, "apps", "mobile", "package.json"))).toBe(true);
    expect(existsSync(join(targetDir, "packages", "adapters-expo"))).toBe(true);
  });

  it("rejects migrating an already-monorepo project", async () => {
    const targetDir = makeTempDir();
    seedStandaloneWeb(targetDir);

    await migrateToMonorepo({ targetDir });
    const second = await migrateToMonorepo({ targetDir });

    expect(second.ok).toBe(false);
    if (second.ok) {
      return;
    }
    expect(second.message).toContain("already a monorepo");
  });

  it("dry-runs without changing project.json", async () => {
    const targetDir = makeTempDir();
    seedStandaloneWeb(targetDir);
    const before = readFileSync(join(targetDir, "project.json"), "utf8");

    const result = await migrateToMonorepo({
      targetDir,
      addApp: "mobile",
      dryRun: true,
    });

    expect(result.ok && result.planned).toBe(true);
    expect(readFileSync(join(targetDir, "project.json"), "utf8")).toBe(before);
    expect(existsSync(join(targetDir, "apps", "mobile"))).toBe(false);
  });
});
