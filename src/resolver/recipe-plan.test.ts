import { describe, expect, it } from "vitest";
import { parseProjectConfiguration } from "../schema/project-configuration.js";
import { resolveRecipePlan } from "./recipe-plan.js";

function web(authentication: "clerk" | "none" = "clerk") {
  return parseProjectConfiguration({
    name: "acme",
    scope: "@acme",
    packageManager: "pnpm",
    topology: "web",
    backend: "rest",
    auth: authentication,
    i18n: "gt-next",
    ui: "shadcn-base-ui",
    locales: ["en"],
    defaultLocale: "en",
  });
}

describe("resolveRecipePlan", () => {
  it.each([
    { topology: "mobile", enforceCodeStandards: false },
    { topology: "mobile", enforceCodeStandards: true },
    { topology: "monorepo", enforceCodeStandards: false },
    { topology: "monorepo", enforceCodeStandards: true },
  ] as const)("plans $topology starter preparation with enforcement $enforceCodeStandards", ({ topology, enforceCodeStandards }) => {
    const configuration = parseProjectConfiguration({
      name: "mobile", scope: "@mobile", topology, runtime: "expo-go", auth: "none", enforceCodeStandards,
      i18n: topology === "monorepo" ? { web: "gt-next", mobile: "none" } : "none",
      ui: topology === "monorepo" ? { web: "shadcn-base-ui", mobile: "nativewind" } : "nativewind",
    });
    const plan = resolveRecipePlan(configuration);
    expect(plan.slice(-3).map((step) => ({ id: step.id, phase: step.phase }))).toEqual([
      { id: "starter-documentation", phase: "install" },
      { id: "expo-starter-ref", phase: "install" },
      { id: "expo-starter-lint", phase: "install" },
    ]);
    expect(plan.find((step) => step.id === "expo-starter-ref")?.description).toBe("Align Expo starter tab refs with React Native");
    expect(plan.some((step) => step.id === "code-standards")).toBe(enforceCodeStandards);
  });
  it.each([false, true])("always plans guidance and reflects enforcement %j", (enabled) => {
    const plan = resolveRecipePlan({ ...web(), enforceCodeStandards: enabled });
    expect(plan.some((step) => step.id === "agent-guidance")).toBe(true);
    expect(plan.some((step) => step.id === "code-standards")).toBe(enabled);
    expect(plan.at(-1)?.id).toBe("starter-documentation");
    expect(plan.some((step) => step.id.startsWith("expo-starter-"))).toBe(false);
  });
  it("uses standalone project structure without workspace promotion", () => {
    const plan = resolveRecipePlan(web());
    expect(plan.some((step) => step.id === "project-structure")).toBe(true);
    expect(plan.some((step) => step.id === "workspace-promote")).toBe(false);
    expect(plan.some((step) => step.id === "project-json")).toBe(false);
  });

  it("omits auth and authorization when authentication is disabled", () => {
    const ids = resolveRecipePlan(web("none")).map((step) => step.id);
    expect(ids).not.toContain("auth-clerk");
    expect(ids).not.toContain("module-authorization");
  });

  it("applies Convex after provider-writing auth and UI recipes", () => {
    const ids = resolveRecipePlan({ ...web(), backend: "convex" }).map((step) => step.id);
    expect(ids).not.toContain("backend-rest");
    expect(ids.at(-1)).toBe("starter-documentation");
    expect(ids.indexOf("backend-convex")).toBeGreaterThan(ids.indexOf("auth-clerk"));
  });
});
