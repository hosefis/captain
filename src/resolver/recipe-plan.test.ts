import { describe, expect, it } from "vitest";
import { parseProjectConfig } from "../schema/project-config.js";
import { resolveRecipePlan } from "./recipe-plan.js";

function webConfig(packageManager: "pnpm" | "npm" | "bun") {
  return parseProjectConfig({
    name: `acme-${packageManager}`,
    scope: "@acme",
    packageManager,
    topology: "web",
    backend: "rest",
    auth: "clerk",
    i18n: "gt-next",
    ui: "shadcn-base-ui",
    modules: ["authorization"],
    locales: ["en"],
    defaultLocale: "en",
  });
}

describe("resolveRecipePlan", () => {
  it.each(["pnpm", "npm", "bun"] as const)(
    "describes only %s workspace metadata",
    (packageManager) => {
      const workspace = resolveRecipePlan(webConfig(packageManager)).find(
        (step) => step.id === "workspace-promote",
      );

      expect(workspace).toBeDefined();
      if (!workspace) {
        return;
      }
      expect(workspace.description).toContain("package.json workspaces");
      expect(workspace.description.includes("pnpm-workspace.yaml")).toBe(
        packageManager === "pnpm",
      );
    },
  );
});
