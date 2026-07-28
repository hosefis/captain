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
    locales: ["en", "fr"],
    defaultLocale: "en",
    validation: "strict",
    ...overrides,
  };
}

describe("projectConfigSchema", () => {
  it("rejects deferred payment configuration with a migration hint", () => {
    expect(() =>
      parseProjectConfig({
        ...baseConfig(),
        payment: { enabled: true },
      }),
    ).toThrow(/docs\/specs\/payment-release\.md/);
  });

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

  it("allows form-wizard and user-identity modules", () => {
    for (const moduleName of ["form-wizard", "user-identity"] as const) {
      const config = normalizeProjectConfig(
        baseConfig({
          modules: ["authorization", moduleName],
        }),
      );

      const result = resolveCompatibility(config, { matrix, mode: "agent" });
      expect(result.ok).toBe(true);
    }
  });

  it("allows admin-catalog when its recipe exists", () => {
    const adminCatalog = normalizeProjectConfig(
      baseConfig({
        modules: ["authorization", "admin-catalog"],
      }),
    );
    expect(resolveCompatibility(adminCatalog, { matrix, mode: "agent" }).ok).toBe(true);
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
    expect(matrix.recipeBlocks.length).toBeGreaterThan(0);
  });
});
