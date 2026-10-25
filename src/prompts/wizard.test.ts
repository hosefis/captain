import { beforeEach, describe, expect, it, vi } from "vitest";
import { deriveScopeFromProjectName, runWizard } from "./wizard.js";

const allAvailable = { pnpm: true, npm: true, bun: true };

const prompts = vi.hoisted(() => ({
  select: vi.fn(),
  text: vi.fn(),
  confirm: vi.fn(),
  note: vi.fn(),
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  log: { warn: vi.fn() },
}));

vi.mock("@clack/prompts", () => ({
  ...prompts,
  isCancel: (value: unknown) => typeof value === "symbol",
}));

beforeEach(() => {
  vi.resetAllMocks();
  prompts.text.mockResolvedValueOnce("sample-app").mockResolvedValueOnce("en, fr");
  prompts.select
    .mockResolvedValueOnce("pnpm")
    .mockResolvedValueOnce("web")
    .mockResolvedValueOnce("clerk");
  prompts.confirm.mockResolvedValue(true);
});

describe("deriveScopeFromProjectName", () => {
  it("derives the internal workspace scope without another wizard question", () => {
    expect(deriveScopeFromProjectName("Acme-Platform")).toBe("@acme-platform");
  });
});

describe("runWizard backend selection", () => {
  it("defaults to REST without asking about the Convex example", async () => {
    prompts.select.mockResolvedValueOnce("rest").mockResolvedValueOnce("en");

    const result = await runWizard({ yes: true, packageManagerAvailability: allAvailable });

    expect("config" in result).toBe(true);
    if ("config" in result) {
      expect(result.config.backend).toBe("rest");
      expect(result.config.convexExample).toBe(false);
    }
    expect(prompts.confirm).toHaveBeenCalledOnce();
    expect(prompts.confirm).toHaveBeenCalledWith({ message: "Enforce code standards during lint?", initialValue: false });
    expect(prompts.note.mock.calls[0]?.[0]).toContain("Convex example: no");
  });

  it("asks about the example only after choosing Convex", async () => {
    prompts.select.mockResolvedValueOnce("convex").mockResolvedValueOnce("en");

    const result = await runWizard({ yes: true, packageManagerAvailability: allAvailable });

    expect("config" in result).toBe(true);
    if ("config" in result) {
      expect(result.config.backend).toBe("convex");
      expect(result.config.convexExample).toBe(true);
    }
    expect(prompts.confirm).toHaveBeenCalledWith({
      message: "Include a working Convex task list example?",
      initialValue: false,
    });
    expect(prompts.note.mock.calls[0]?.[0]).toContain("Convex example: yes");
  });
});

describe("runWizard code standards", () => {
  it.each([false, true])("retains the enforcement choice %j in configuration and summary", async (enabled) => {
    prompts.select.mockResolvedValueOnce("rest").mockResolvedValueOnce("en");
    prompts.confirm.mockResolvedValueOnce(enabled);
    const result = await runWizard({ yes: true, packageManagerAvailability: allAvailable });
    expect("config" in result && result.config.enforceCodeStandards).toBe(enabled);
    expect(prompts.note.mock.calls[0]?.[0]).toContain(`Code standards enforcement: ${enabled ? "yes" : "no"}`);
  });

  it("cancels before the final review when the standards question is cancelled", async () => {
    prompts.select.mockResolvedValueOnce("rest").mockResolvedValueOnce("en");
    prompts.confirm.mockResolvedValueOnce(Symbol("cancel"));
    expect(await runWizard({ yes: true, packageManagerAvailability: allAvailable })).toEqual({ cancelled: true });
    expect(prompts.note).not.toHaveBeenCalled();
    expect(prompts.cancel).toHaveBeenCalledWith("Init cancelled.");
  });
});

describe("runWizard package manager availability", () => {
  it("marks missing managers and defaults to the first available manager", async () => {
    prompts.select.mockReset()
      .mockResolvedValueOnce("npm")
      .mockResolvedValueOnce("web")
      .mockResolvedValueOnce("clerk")
      .mockResolvedValueOnce("rest")
      .mockResolvedValueOnce("en");

    const result = await runWizard({
      yes: true,
      packageManagerAvailability: { pnpm: false, npm: true, bun: true },
    });

    expect("config" in result && result.config.packageManager).toBe("npm");
    expect(prompts.select).toHaveBeenCalledWith(expect.objectContaining({
      message: "Package manager",
      initialValue: "npm",
      options: [
        { value: "pnpm", label: expect.stringContaining("unavailable") },
        { value: "npm", label: "npm" },
        { value: "bun", label: "bun" },
      ],
    }));
  });

  it("stops immediately after an unavailable selection", async () => {
    prompts.select.mockReset().mockResolvedValueOnce("bun");

    const result = await runWizard({
      packageManagerAvailability: { pnpm: true, npm: true, bun: false },
    });

    expect(result).toEqual({
      error: "bun --version failed. Install bun and retry. Available package managers: pnpm, npm.",
    });
    expect(prompts.select).toHaveBeenCalledTimes(1);
    expect(prompts.confirm).not.toHaveBeenCalled();
  });

  it("stops before questions if no manager passes its version check", async () => {
    const result = await runWizard({
      packageManagerAvailability: { pnpm: false, npm: false, bun: false },
    });

    expect(result).toEqual({
      error: "No package manager passed its version check. Install pnpm, npm, or bun and retry.",
    });
    expect(prompts.text).not.toHaveBeenCalled();
    expect(prompts.select).not.toHaveBeenCalled();
  });

  it("allows an unavailable selection during dry run with a warning", async () => {
    prompts.select.mockReset()
      .mockResolvedValueOnce("bun")
      .mockResolvedValueOnce("web")
      .mockResolvedValueOnce("clerk")
      .mockResolvedValueOnce("rest")
      .mockResolvedValueOnce("en");

    const result = await runWizard({
      yes: true,
      dryRun: true,
      packageManagerAvailability: { pnpm: false, npm: false, bun: false },
    });

    expect("config" in result && result.config.packageManager).toBe("bun");
    expect(prompts.log.warn).toHaveBeenCalledWith(expect.stringContaining("A real run would stop here"));
  });
});
