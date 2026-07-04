import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildInitPlan, runInit } from "./init.js";

const fixturesDir = join(import.meta.dirname, "../../fixtures");

describe("runInit", () => {
  it("returns dry-run plan for Tier A web config", async () => {
    const result = await runInit({
      directory: "./my-app",
      config: join(fixturesDir, "project-web.json"),
      yes: true,
      dryRun: true,
      json: false,
      verifyDocs: false,
    });

    expect(result.status).toBe("dry_run");
    if (result.status !== "dry_run") {
      return;
    }

    expect(result.compatibility.ok).toBe(true);
    expect(result.plan.phase1.bootstrap).toHaveLength(1);
    expect(result.plan.phase1.bootstrap[0]?.command).toContain("create-next-app@latest");
    expect(result.plan.phase2.recipes.some((step) => step.id === "module-authorization")).toBe(
      true,
    );
    expect(result.plan.phase3.smoke).toEqual(["typecheck", "lint", "build"]);
  });

  it("blocks convex backend in agent mode", async () => {
    const result = await runInit({
      directory: ".",
      config: join(fixturesDir, "project-convex-blocked.json"),
      yes: true,
      dryRun: true,
      json: false,
      verifyDocs: false,
    });

    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") {
      return;
    }

    expect(result.compatibility.blocks.some((block) => block.id === "backend-convex")).toBe(true);
  });

  it("returns validation error for invalid config file", async () => {
    const result = await runInit({
      directory: ".",
      config: join(fixturesDir, "project-invalid.json"),
      yes: true,
      dryRun: true,
      json: false,
      verifyDocs: false,
    });

    expect(result.status).toBe("validation_error");
  });
});

describe("buildInitPlan", () => {
  it("uses lint-only smoke for human mode", () => {
    const plan = buildInitPlan(
      {
        name: "demo",
        scope: "@demo",
        packageManager: "pnpm",
        topology: "web",
        apps: ["web"],
        backend: "rest",
        auth: "clerk",
        i18n: { web: "gt-next" },
        ui: { web: "shadcn-base-ui" },
        modules: ["authorization"],
        payment: {
          enabled: false,
          processors: [],
          orchestration: "backend-mediated",
          primary: null,
        },
        locales: ["en"],
        defaultLocale: "en",
        validation: "strict",
        stacks: { hasWeb: true, hasMobile: false, hasDesktop: false },
      },
      "/tmp/demo",
      false,
    );

    expect(plan.phase3.smoke).toEqual(["typecheck", "lint"]);
  });
});
