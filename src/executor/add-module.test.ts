import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { addModuleToProject } from "./add-module.js";
import { applyRecipes } from "./apply-recipes.js";
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
  const dir = join(tmpdir(), `captain-add-module-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function seedProject(targetDir: string, config: NormalizedProjectConfig): void {
  mkdirSync(join(targetDir, "apps", "web"), { recursive: true });
  writeFileSync(
    join(targetDir, "apps", "web", "package.json"),
    JSON.stringify({ name: "@acme/web", scripts: { dev: "next dev" } }, null, 2),
  );
  writeFileSync(
    join(targetDir, "package.json"),
    JSON.stringify({ name: config.name, private: true }, null, 2),
  );
  applyWorkspacePromotion(config, targetDir);
  applyRecipes(config, targetDir);

  const { stacks: _stacks, ...serializable } = config;
  writeFileSync(join(targetDir, "project.json"), `${JSON.stringify(serializable, null, 2)}\n`, "utf-8");
}

describe("addModuleToProject", () => {
  it("adds form-wizard to an existing project", () => {
    const targetDir = makeTempDir();
    seedProject(targetDir, webConfig);

    const result = addModuleToProject({
      moduleName: "form-wizard",
      targetDir,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.module).toBe("form-wizard");
    expect(
      existsSync(join(targetDir, "packages", "core", "src", "form-wizard", "wizard.ts")),
    ).toBe(true);

    const project = JSON.parse(readFileSync(join(targetDir, "project.json"), "utf-8")) as {
      modules: string[];
    };
    expect(project.modules).toContain("form-wizard");
  });

  it("rejects duplicate modules", () => {
    const targetDir = makeTempDir();
    seedProject(targetDir, {
      ...webConfig,
      modules: ["authorization", "user-identity"],
    });

    const result = addModuleToProject({
      moduleName: "user-identity",
      targetDir,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.message).toContain("already enabled");
  });

  it("plans without writing and applies only the requested module", () => {
    const targetDir = makeTempDir();
    seedProject(targetDir, webConfig);
    const authPath = join(
      targetDir,
      "packages",
      "core",
      "src",
      "authorization",
      "types.ts",
    );
    writeFileSync(authPath, "// user-owned authorization\n");

    const planned = addModuleToProject({
      moduleName: "user-identity",
      targetDir,
      dryRun: true,
    });
    expect(planned.ok && planned.planned).toBe(true);
    expect(
      existsSync(
        join(targetDir, "packages", "core", "src", "user-identity"),
      ),
    ).toBe(false);

    const applied = addModuleToProject({
      moduleName: "user-identity",
      targetDir,
    });
    expect(applied.ok && !applied.planned).toBe(true);
    expect(readFileSync(authPath, "utf8")).toBe("// user-owned authorization\n");
  });

  it("aborts on a module directory collision unless forced", () => {
    const targetDir = makeTempDir();
    seedProject(targetDir, webConfig);
    const collision = join(
      targetDir,
      "packages",
      "core",
      "src",
      "form-wizard",
    );
    mkdirSync(collision, { recursive: true });
    writeFileSync(join(collision, "owned.ts"), "// mine\n");

    const result = addModuleToProject({
      moduleName: "form-wizard",
      targetDir,
    });
    expect(result.ok).toBe(false);
    expect(readFileSync(join(collision, "owned.ts"), "utf8")).toBe("// mine\n");
  });
});
