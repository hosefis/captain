import { describe, expect, it } from "vitest";
import { parseProjectConfiguration, projectConfigurationJsonSchema } from "./project-configuration.js";

const webConfiguration = {
  name: "sample-app",
  scope: "@sample-app",
  topology: "web",
  i18n: "gt-next",
  ui: "shadcn-base-ui",
} as const;

describe("optional standards configuration", () => {
  it("supports older configurations with enforcement disabled", () => {
    expect(parseProjectConfiguration(webConfiguration).enforceCodeStandards).toBe(false);
  });

  it.each([false, true])("retains explicit enforcement %j", (enabled) => {
    expect(parseProjectConfiguration({ ...webConfiguration, enforceCodeStandards: enabled }).enforceCodeStandards).toBe(enabled);
  });

  it("publishes the optional boolean and default in the JSON schema", () => {
    const schema = projectConfigurationJsonSchema();
    expect((schema.properties as Record<string, unknown>).enforceCodeStandards).toEqual({ type: "boolean", default: false });
    expect(schema.required).not.toContain("enforceCodeStandards");
    expect(() => parseProjectConfiguration({ ...webConfiguration, enforceCodeStandards: "true" })).toThrow();
  });
});

describe("Convex project configuration", () => {
  it("keeps REST as the default and disables the example", () => {
    const configuration = parseProjectConfiguration(webConfiguration);
    expect(configuration.backend).toBe("rest");
    expect(configuration.convexExample).toBe(false);
  });

  it("accepts Convex with or without its example", () => {
    expect(parseProjectConfiguration({ ...webConfiguration, backend: "convex" }).convexExample).toBe(false);
    expect(parseProjectConfiguration({ ...webConfiguration, backend: "convex", convexExample: true }).convexExample).toBe(true);
  });

  it("rejects the Convex example with REST", () => {
    expect(() => parseProjectConfiguration({ ...webConfiguration, convexExample: true })).toThrow(
      "convexExample requires the Convex backend",
    );
  });
});
