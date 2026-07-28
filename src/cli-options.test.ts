import { describe, expect, it } from "vitest";
import { getGlobalOptions } from "./cli-options.js";

describe("getGlobalOptions", () => {
  it("returns defaults when no globals are set", () => {
    const command = {
      optsWithGlobals: () => ({}),
    };

    expect(getGlobalOptions(command as never)).toEqual({
      config: undefined,
      yes: false,
      dryRun: false,
      json: false,
      verifyDocs: false,
      force: false,
    });
  });

  it("maps commander global option names", () => {
    const command = {
      optsWithGlobals: () => ({
        config: "./project.json",
        yes: true,
        dryRun: true,
        json: true,
        verifyDocs: true,
        force: true,
      }),
    };

    expect(getGlobalOptions(command as never)).toEqual({
      config: "./project.json",
      yes: true,
      dryRun: true,
      json: true,
      verifyDocs: true,
      force: true,
    });
  });
});
