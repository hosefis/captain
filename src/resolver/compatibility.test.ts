import { describe, expect, it } from "vitest";
import {
  parseProjectConfig,
  projectConfigJsonSchema,
} from "../schema/project-config.js";
import { loadCompatibilityMatrix, resolveCompatibility } from "./compatibility.js";

const webInput = {
  name: "acme-web",
  scope: "@acme",
  packageManager: "pnpm",
  topology: "web",
  backend: "rest",
  auth: "clerk",
  i18n: "gt-next",
  ui: "shadcn-base-ui",
  locales: ["en", "fr"],
  defaultLocale: "en",
} as const;

describe("project config", () => {
  it("normalizes standalone web", () => {
    const config = parseProjectConfig(webInput);
    expect(config.apps).toEqual(["web"]);
    expect(config.i18n).toEqual({ web: "gt-next" });
  });

  it("normalizes the supported monorepo composition", () => {
    const config = parseProjectConfig({
      ...webInput,
      topology: "monorepo",
      runtime: "dev-build",
      i18n: { web: "gt-next", mobile: "gt-react-native" },
      ui: { web: "shadcn-base-ui", mobile: "nativewind" },
    });
    expect(config.apps).toEqual(["web", "mobile"]);
  });

  it("supports Expo Go without mobile i18n", () => {
    const config = parseProjectConfig({
      ...webInput,
      topology: "mobile",
      runtime: "expo-go",
      i18n: "none",
      ui: "nativewind",
    });
    expect(config.i18n.mobile).toBe("none");
  });

  it("rejects GT React Native with Expo Go", () => {
    expect(() =>
      parseProjectConfig({
        ...webInput,
        topology: "mobile",
        runtime: "expo-go",
        i18n: "gt-react-native",
        ui: "nativewind",
      }),
    ).toThrow(/Expo Go/);
  });

  it("rejects removed options and fields", () => {
    for (const input of [
      { ...webInput, backend: "convex" },
      { ...webInput, auth: "workos" },
      { ...webInput, modules: ["authorization"] },
      { ...webInput, validation: "relaxed" },
    ]) {
      expect(() => parseProjectConfig(input)).toThrow();
    }
  });

  it("exports JSON Schema", () => {
    expect(projectConfigJsonSchema()).toHaveProperty("type", "object");
  });
});

describe("compatibility policy", () => {
  it("loads the current matrix", () => {
    expect(loadCompatibilityMatrix().version).toBe(2);
  });

  it("passes every schema-supported configuration", () => {
    const config = parseProjectConfig({
      ...webInput,
      topology: "mobile",
      runtime: "dev-build",
      i18n: "gt-react-native",
      ui: "nativewind",
    });
    const matrix = loadCompatibilityMatrix();
    expect(resolveCompatibility(config, { matrix, mode: "human" }).warns).toHaveLength(0);
    expect(resolveCompatibility(config, { matrix, mode: "agent" }).ok).toBe(true);
  });
});
