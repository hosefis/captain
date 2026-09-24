import { describe, expect, it } from "vitest";
import { deriveScopeFromProjectName } from "./wizard.js";

describe("deriveScopeFromProjectName", () => {
  it("derives the internal workspace scope without another wizard question", () => {
    expect(deriveScopeFromProjectName("Acme-Platform")).toBe("@acme-platform");
  });
});
