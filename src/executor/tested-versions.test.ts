import { describe, expect, it } from "vitest";
import { testedRange } from "./tested-versions.js";

describe("testedRange", () => {
  it("returns a compatible range from the bundled manifest", () => {
    expect(testedRange("@clerk/nextjs")).toBe("^6.22.0");
  });

  it("rejects dependencies without a validated baseline", () => {
    expect(() => testedRange("not-recorded")).toThrow(/No tested version/);
  });
});
