import { describe, expect, it } from "vitest";
import {
  normalizeProjectConfig,
  parseProjectConfig,
  projectConfigJsonSchema,
  type ProjectConfig,
} from "../schema/project-config.js";
import {
  loadCompatibilityMatrix,
  resolveCompatibility,
  type CompatibilityMatrix,
} from "./compatibility.js";

function baseConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    name: "acme-platform",
    scope: "@acme",
    packageManager: "pnpm",
    topology: "web",
    backend: "rest",
    auth: "clerk",
    i18n: "gt-next",
    ui: "shadcn-base-ui",
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
    ...overrides,
  };
}

describe("projectConfigSchema", () => {
  it("parses Tier A web defaults", () => {
    const config = parseProjectConfig(baseConfig());
    expect(config.topology).toBe("web");
    expect(config.i18n.web).toBe("gt-next");
    expect(config.ui.web).toBe("shadcn-base-ui");
    expect(config.apps).toEqual(["web"]);
  });

  it("parses monorepo stack objects", () => {
    const config = parseProjectConfig(
      baseConfig({
        topology: "monorepo",
        apps: ["web", "mobile"],
        runtime: "dev-build",
        i18n: { web: "gt-next", mobile: "gt-react-native" },
        ui: { web: "shadcn-base-ui", mobile: "nativewind" },
      }),
    );

    expect(config.stacks.hasWeb).toBe(true);
    expect(config.stacks.hasMobile).toBe(true);
    expect(config.i18n.mobile).toBe("gt-react-native");
  });

  it("rejects defaultLocale outside locales", () => {
    expect(() =>
      parseProjectConfig(
        baseConfig({
          locales: ["en"],
          defaultLocale: "fr",
        }),
      ),
    ).toThrow();
  });

  it("requires runtime for mobile topology", () => {
    expect(() =>
      parseProjectConfig(
        baseConfig({
          topology: "mobile",
          i18n: "gt-react-native",
          ui: "nativewind",
        }),
      ),
    ).toThrow(/runtime/i);
  });

  it("exports JSON Schema", () => {
    const schema = projectConfigJsonSchema();
    expect(schema).toHaveProperty("type", "object");
  });
});

describe("resolveCompatibility hard blocks", () => {
  const matrix = loadCompatibilityMatrix();

  it("blocks expo + next-intl", () => {
    const config = normalizeProjectConfig(
      baseConfig({
        topology: "mobile",
        runtime: "dev-build",
        i18n: "next-intl" as never,
        ui: "nativewind",
      }),
    );

    const result = resolveCompatibility(config, { matrix });
    expect(result.ok).toBe(false);
    expect(result.blocks.some((block) => block.id === "expo-next-intl")).toBe(true);
  });

  it("blocks expo + gt-next", () => {
    const config = normalizeProjectConfig(
      baseConfig({
        topology: "mobile",
        runtime: "dev-build",
        i18n: "gt-next" as never,
        ui: "nativewind",
      }),
    );

    const result = resolveCompatibility(config, { matrix });
    expect(result.blocks.some((block) => block.id === "expo-gt-next")).toBe(true);
  });

  it("blocks next + gt-react-native", () => {
    const config = normalizeProjectConfig(
      baseConfig({
        i18n: "gt-react-native" as never,
      }),
    );

    const result = resolveCompatibility(config, { matrix });
    expect(result.blocks.some((block) => block.id === "next-gt-react-native")).toBe(true);
  });

  it("blocks expo + gt-react-native + expo-go", () => {
    const config = normalizeProjectConfig(
      baseConfig({
        topology: "mobile",
        runtime: "expo-go",
        i18n: "gt-react-native",
        ui: "nativewind",
      }),
    );

    const result = resolveCompatibility(config, { matrix });
    expect(result.blocks.some((block) => block.id === "expo-gt-rn-expo-go")).toBe(true);
  });
});

describe("resolveCompatibility recipe blocks (Tier B)", () => {
  const matrix = loadCompatibilityMatrix();

  it("passes Tier A web defaults", () => {
    const config = normalizeProjectConfig(baseConfig());
    const result = resolveCompatibility(config, { matrix, mode: "agent" });
    expect(result.ok).toBe(true);
    expect(result.blocks).toHaveLength(0);
  });

  it("passes Tier A mobile dev-build defaults", () => {
    const config = normalizeProjectConfig(
      baseConfig({
        topology: "mobile",
        runtime: "dev-build",
        i18n: "gt-react-native",
        ui: "nativewind",
      }),
    );

    const result = resolveCompatibility(config, { matrix, mode: "agent" });
    expect(result.ok).toBe(true);
  });

  it("blocks unimplemented backends", () => {
    for (const backend of ["convex", "supabase", "firebase"] as const) {
      const config = normalizeProjectConfig(baseConfig({ backend }));
      const result = resolveCompatibility(config, { matrix });
      expect(result.ok).toBe(false);
      expect(result.blocks.some((block) => block.id === `backend-${backend}`)).toBe(true);
    }
  });

  it("blocks unimplemented auth providers", () => {
    for (const auth of ["better-auth", "workos", "skip"] as const) {
      const config = normalizeProjectConfig(baseConfig({ auth }));
      const result = resolveCompatibility(config, { matrix });
      expect(result.ok).toBe(false);
      expect(result.blocks.some((block) => block.id === `auth-${auth}`)).toBe(true);
    }
  });

  it("blocks optional modules until implemented", () => {
    for (const moduleName of ["admin-catalog", "form-wizard", "user-identity", "payment"] as const) {
      const config = normalizeProjectConfig(
        baseConfig({
          modules: ["authorization", moduleName],
          payment: {
            enabled: moduleName === "payment",
            processors: moduleName === "payment" ? ["custom-api"] : [],
            orchestration: "backend-mediated",
            primary: moduleName === "payment" ? "custom-api" : null,
          },
        }),
      );

      const result = resolveCompatibility(config, { matrix });
      expect(result.ok).toBe(false);
      expect(result.blocks.some((block) => block.id === `module-${moduleName}`)).toBe(true);
    }
  });

  it("blocks desktop app in monorepo", () => {
    const config = normalizeProjectConfig(
      baseConfig({
        topology: "monorepo",
        apps: ["web", "desktop"],
        i18n: { web: "gt-next" },
        ui: { web: "shadcn-base-ui" },
      }),
    );

    const result = resolveCompatibility(config, { matrix });
    expect(result.blocks.some((block) => block.id === "topology-desktop")).toBe(true);
  });
});

describe("resolveCompatibility payment rules", () => {
  const matrix = loadCompatibilityMatrix();

  function paymentConfig(processors: ProjectConfig["payment"]["processors"]) {
    return normalizeProjectConfig(
      baseConfig({
        modules: ["authorization", "payment"],
        payment: {
          enabled: true,
          processors,
          orchestration: "backend-mediated",
          primary: processors[0] ?? null,
        },
      }),
    );
  }

  it("blocks scaffold-only processors", () => {
    const config = paymentConfig(["polar"]);
    const result = resolveCompatibility(config, { matrix });
    expect(result.ok).toBe(false);
    expect(result.blocks.some((block) => block.id === "payment:scaffold:polar")).toBe(true);
  });

  it("blocks stripe without clerk (direct stripe not implemented)", () => {
    const config = normalizeProjectConfig(
      baseConfig({
        auth: "clerk",
        modules: ["authorization", "payment"],
        payment: {
          enabled: true,
          processors: ["stripe"],
          orchestration: "provider-direct",
          primary: "stripe",
        },
      }),
    );

    const result = resolveCompatibility(config, { matrix });
    expect(result.blocks.some((block) => block.id === "module-payment")).toBe(true);
  });

  it("soft-warns fedapay + provider-direct in human mode", () => {
    const config = paymentConfig(["fedapay"]);
    const human = resolveCompatibility(
      normalizeProjectConfig({
        ...config,
        payment: {
          ...config.payment,
          orchestration: "provider-direct",
        },
      }),
      { matrix, mode: "human" },
    );

    expect(human.warns.some((warn) => warn.id === "fedapay-provider-direct")).toBe(true);
    expect(human.ok).toBe(false);
  });

  it("upgrades fedapay provider-direct warn to block in agent mode", () => {
    const config = normalizeProjectConfig({
      ...paymentConfig(["fedapay"]),
      payment: {
        enabled: true,
        processors: ["fedapay"],
        orchestration: "provider-direct",
        primary: "fedapay",
      },
    });

    const agent = resolveCompatibility(config, { matrix, mode: "agent" });
    expect(agent.warns).toHaveLength(0);
    expect(agent.blocks.some((block) => block.id === "fedapay-provider-direct")).toBe(true);
  });

  it("soft-warns multiple global MoR processors", () => {
    const config = paymentConfig(["lemon-squeezy", "paddle"]);
    const result = resolveCompatibility(config, { matrix, mode: "human" });
    expect(result.warns.some((warn) => warn.id === "multiple-global-mor")).toBe(true);
  });
});

describe("resolveCompatibility mode policy", () => {
  it("promotes soft warns to blocks in agent mode", () => {
    const matrix: CompatibilityMatrix = {
      version: 1,
      agentMode: { softWarn: "upgrade-to-block" },
      humanMode: { softWarn: "confirm-prompt" },
      hardBlocks: [],
      softWarns: [
        {
          id: "test-warn",
          stack: "expo",
          i18n: "gt-react-native",
          message: "experimental",
        },
      ],
      recipeBlocks: [],
      payment: {
        implementedProcessors: [],
        scaffoldProcessors: [],
        globalMorProcessors: [],
        allowedCombos: [],
        processorBlocks: [],
      },
    };

    const config = normalizeProjectConfig(
      baseConfig({
        topology: "mobile",
        runtime: "dev-build",
        i18n: "gt-react-native",
        ui: "nativewind",
      }),
    );

    const human = resolveCompatibility(config, { matrix, mode: "human" });
    expect(human.ok).toBe(true);
    expect(human.warns).toHaveLength(1);

    const agent = resolveCompatibility(config, { matrix, mode: "agent" });
    expect(agent.ok).toBe(false);
    expect(agent.blocks.some((block) => block.id === "test-warn")).toBe(true);
  });
});

describe("loadCompatibilityMatrix", () => {
  it("loads bundled compatibility.json", () => {
    const matrix = loadCompatibilityMatrix();
    expect(matrix.version).toBe(1);
    expect(matrix.hardBlocks.length).toBeGreaterThan(0);
    expect(matrix.payment.implementedProcessors).toContain("custom-api");
  });
});
