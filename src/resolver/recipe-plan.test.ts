import { describe, expect, it } from "vitest";
import { parseProjectConfig } from "../schema/project-config.js";
import { resolveRecipePlan } from "./recipe-plan.js";

function web(auth: "clerk" | "none" = "clerk") {
  return parseProjectConfig({
    name: "acme",
    scope: "@acme",
    packageManager: "pnpm",
    topology: "web",
    backend: "rest",
    auth,
    i18n: "gt-next",
    ui: "shadcn-base-ui",
    locales: ["en"],
    defaultLocale: "en",
  });
}

describe("resolveRecipePlan", () => {
  it("uses standalone project structure without workspace promotion", () => {
    const plan = resolveRecipePlan(web());
    expect(plan.some((step) => step.id === "project-structure")).toBe(true);
    expect(plan.some((step) => step.id === "workspace-promote")).toBe(false);
  });

  it("omits auth and authorization when authentication is disabled", () => {
    const ids = resolveRecipePlan(web("none")).map((step) => step.id);
    expect(ids).not.toContain("auth-clerk");
    expect(ids).not.toContain("module-authorization");
  });
});
