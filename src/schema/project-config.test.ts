import { describe, expect, it } from "vitest";
import { parseProjectConfig } from "./project-config.js";

const webConfig = {
  name: "sample-app",
  scope: "@sample-app",
  topology: "web",
  i18n: "gt-next",
  ui: "shadcn-base-ui",
} as const;

describe("Convex project config", () => {
  it("keeps REST as the default and disables the example", () => {
    const config = parseProjectConfig(webConfig);
    expect(config.backend).toBe("rest");
    expect(config.convexExample).toBe(false);
  });

  it("accepts Convex with or without its example", () => {
    expect(parseProjectConfig({ ...webConfig, backend: "convex" }).convexExample).toBe(false);
    expect(parseProjectConfig({ ...webConfig, backend: "convex", convexExample: true }).convexExample).toBe(true);
  });

  it("rejects the Convex example with REST", () => {
    expect(() => parseProjectConfig({ ...webConfig, convexExample: true })).toThrow(
      "convexExample requires the Convex backend",
    );
  });
});
