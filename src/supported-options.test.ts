import { describe, expect, it } from "vitest";
import { compatibleMobileI18n, SUPPORTED_OPTIONS } from "./supported-options.js";

describe("supported option registry", () => {
  it("exposes only implemented integrations", () => {
    expect(SUPPORTED_OPTIONS.backends.map(({ value }) => value)).toEqual([
      "rest",
      "convex",
    ]);
    expect(SUPPORTED_OPTIONS.authentication.map(({ value }) => value)).toEqual([
      "clerk",
      "none",
    ]);
  });

  it("progressively filters mobile i18n by runtime", () => {
    expect(compatibleMobileI18n("expo-go").map(({ value }) => value)).toEqual([
      "none",
    ]);
    expect(compatibleMobileI18n("dev-build").map(({ value }) => value)).toEqual([
      "gt-react-native",
    ]);
  });
});
