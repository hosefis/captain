import { describe, expect, it } from "vitest";
import {
  formatBootstrapCommand,
  resolveBootstrapPlan,
} from "./bootstrap.js";
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
  payment: {
    enabled: false,
    processors: [],
    orchestration: "backend-mediated",
    primary: null,
  },
  locales: ["en", "fr"],
  defaultLocale: "en",
  validation: "strict",
  stacks: { hasWeb: true, hasMobile: false, hasDesktop: false },
};

const monorepoConfig: NormalizedProjectConfig = {
  ...webConfig,
  name: "acme-platform",
  topology: "monorepo",
  apps: ["web", "mobile"],
  i18n: { web: "gt-next", mobile: "gt-react-native" },
  ui: { web: "shadcn-base-ui", mobile: "nativewind" },
  runtime: "dev-build",
  stacks: { hasWeb: true, hasMobile: true, hasDesktop: false },
};

describe("resolveBootstrapPlan", () => {
  it("plans create-next-app for web topology", () => {
    const steps = resolveBootstrapPlan(webConfig, "/tmp/acme-web");

    expect(steps).toHaveLength(1);
    expect(steps[0]?.id).toBe("bootstrap-web");
    expect(formatBootstrapCommand(steps[0]!)).toContain("create-next-app@latest");
    expect(formatBootstrapCommand(steps[0]!)).toContain("--typescript");
    expect(formatBootstrapCommand(steps[0]!)).toContain("--yes");
  });

  it("plans create-expo-app for mobile topology", () => {
    const mobileConfig: NormalizedProjectConfig = {
      ...webConfig,
      topology: "mobile",
      apps: ["mobile"],
      runtime: "dev-build",
      i18n: { mobile: "gt-react-native" },
      ui: { mobile: "nativewind" },
      stacks: { hasWeb: false, hasMobile: true, hasDesktop: false },
    };

    const steps = resolveBootstrapPlan(mobileConfig, "/tmp/acme-mobile");

    expect(steps).toHaveLength(1);
    expect(steps[0]?.id).toBe("bootstrap-mobile");
    expect(formatBootstrapCommand(steps[0]!)).toContain("create-expo-app@latest");
  });

  it("plans turbo plus nested apps for monorepo", () => {
    const steps = resolveBootstrapPlan(monorepoConfig, "/tmp/acme-platform");

    expect(steps.map((step) => step.id)).toEqual([
      "bootstrap-monorepo",
      "bootstrap-apps-web",
      "bootstrap-apps-mobile",
    ]);
    expect(formatBootstrapCommand(steps[0]!)).toContain("create-turbo@latest");
    expect(formatBootstrapCommand(steps[1]!)).toContain("apps/web");
    expect(formatBootstrapCommand(steps[2]!)).toContain("apps/mobile");
  });

  it("uses npx for npm package manager", () => {
    const npmConfig: NormalizedProjectConfig = {
      ...webConfig,
      packageManager: "npm",
    };

    const steps = resolveBootstrapPlan(npmConfig, "/tmp/acme");
    expect(formatBootstrapCommand(steps[0]!)).toMatch(/^npx create-next-app@latest/);
    expect(formatBootstrapCommand(steps[0]!)).toContain("--use-npm");
  });
});
