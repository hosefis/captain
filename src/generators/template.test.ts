import { renderTemplate } from "../generators/template.js";
import { describe, expect, it } from "vitest";

describe("renderTemplate", () => {
  it("replaces placeholders", () => {
    const output = renderTemplate("Hello {name} from {scope}", {
      name: "acme",
      scope: "@acme",
    });

    expect(output).toBe("Hello acme from @acme");
  });

  it("leaves unknown placeholders intact", () => {
    const output = renderTemplate("{known} {unknown}", { known: "yes" });
    expect(output).toBe("yes {unknown}");
  });
});
