import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildInitPlan, runInit } from "./init.js";

const fixturesDir = join(import.meta.dirname, "../../fixtures");

function makeTempDir(label: string): string {
  const directory = join(
    tmpdir(),
    `captain-init-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(directory, { recursive: true });
  return directory;
}

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

  it("uses the configured project name when no target directory is provided", async () => {
    const result = await runInit({
      config: join(fixturesDir, "project-web.json"),
      yes: true,
      dryRun: true,
      json: false,
      verifyDocs: false,
    });

    expect(result.status).toBe("dry_run");
    if (result.status === "dry_run") {
      expect(result.plan.phase1.bootstrap[0]?.cwd).toBe(
        join(process.cwd(), "acme-web"),
      );
    }
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

  it("includes verify-docs report on dry-run when enabled", async () => {
    const result = await runInit({
      directory: "./my-app",
      config: join(fixturesDir, "project-web.json"),
      yes: true,
      dryRun: true,
      json: false,
      verifyDocs: true,
      npmFetch: async (packageName) => ({
        ok: true,
        version:
          packageName === "create-next-app"
            ? "15.3.4"
            : packageName === "@clerk/nextjs"
              ? "6.22.0"
              : packageName === "gt-next" || packageName === "gtx-cli"
                ? "1.2.0"
                : "2.5.0",
      }),
    });

    expect(result.status).toBe("dry_run");
    if (result.status !== "dry_run") {
      return;
    }

    expect(result.verifyDocs?.ok).toBe(true);
    expect(result.verifyDocs?.entries.length).toBeGreaterThan(0);
  });

  it("blocks agent init on major doc drift", async () => {
    const result = await runInit({
      directory: "./my-app",
      config: join(fixturesDir, "project-web.json"),
      yes: true,
      dryRun: true,
      json: false,
      verifyDocs: true,
      npmFetch: async (packageName) => ({
        ok: true,
        version: packageName === "create-next-app" ? "16.0.0" : "1.0.0",
      }),
    });

    expect(result.status).toBe("doc_drift_blocked");
    if (result.status !== "doc_drift_blocked") {
      return;
    }

    expect(result.verifyDocs.ok).toBe(false);
    expect(result.verifyDocs.blocks.some((block) => block.package === "create-next-app")).toBe(
      true,
    );
  });

  it("returns successful completed smoke details", async () => {
    const result = await runInit({
      directory: makeTempDir("success"),
      config: join(fixturesDir, "project-web.json"),
      yes: true,
      dryRun: false,
      json: true,
      verifyDocs: false,
      bootstrapOptions: {
        bootstrapRunner: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
        simulateBootstrapOutput: true,
      },
      smokeRunner: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    });

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.smoke).toEqual({
        ok: true,
        steps: ["typecheck", "lint", "build"],
        completedSteps: ["typecheck", "lint", "build"],
      });
    }
  });

  it("bootstraps when project.json is inside the target directory", async () => {
    const directory = makeTempDir("in-target-config");
    const configPath = join(directory, "project.json");
    const originalConfig = readFileSync(join(fixturesDir, "project-web.json"), "utf8");
    writeFileSync(configPath, originalConfig);

    let configWasStaged = false;
    const result = await runInit({
      directory,
      config: configPath,
      yes: true,
      dryRun: false,
      json: true,
      verifyDocs: false,
      bootstrapOptions: {
        bootstrapRunner: async (step) => {
          if (step.id === "bootstrap-web") {
            configWasStaged = !existsSync(configPath);
          }
          return { exitCode: 0, stdout: "", stderr: "" };
        },
        simulateBootstrapOutput: true,
      },
      smokeRunner: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    });

    expect(result.status).toBe("success");
    expect(configWasStaged).toBe(true);
    expect(existsSync(configPath)).toBe(true);
  });

  it("restores an in-target project.json when bootstrap fails", async () => {
    const directory = makeTempDir("restore-config");
    const configPath = join(directory, "project.json");
    const originalConfig = readFileSync(join(fixturesDir, "project-web.json"), "utf8");
    writeFileSync(configPath, originalConfig);

    const result = await runInit({
      directory,
      config: configPath,
      yes: true,
      dryRun: false,
      json: true,
      verifyDocs: false,
      bootstrapOptions: {
        bootstrapRunner: async () => ({
          exitCode: 1,
          stdout: "",
          stderr: "scaffolder failed",
        }),
      },
    });

    expect(result.status).toBe("execution_failed");
    if (result.status === "execution_failed") {
      expect(result.message).toContain("scaffolder failed");
    }
    expect(readFileSync(configPath, "utf8")).toBe(originalConfig);
  });

  it("returns the failed smoke step and completed predecessors", async () => {
    const result = await runInit({
      directory: makeTempDir("smoke-failure"),
      config: join(fixturesDir, "project-web.json"),
      yes: true,
      dryRun: false,
      json: true,
      verifyDocs: false,
      bootstrapOptions: {
        bootstrapRunner: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
        simulateBootstrapOutput: true,
      },
      smokeRunner: async (step) => ({
        exitCode: step === "lint" ? 1 : 0,
        stdout: "",
        stderr: step === "lint" ? "lint failed" : "",
      }),
    });

    expect(result.status).toBe("smoke_failed");
    if (result.status === "smoke_failed") {
      expect(result.smoke.failedStep).toBe("lint");
      expect(result.smoke.completedSteps).toEqual(["typecheck"]);
    }
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
