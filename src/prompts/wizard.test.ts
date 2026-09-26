import { beforeEach, describe, expect, it, vi } from "vitest";
import { deriveScopeFromProjectName, runWizard } from "./wizard.js";

const prompts = vi.hoisted(() => ({
  select: vi.fn(),
  text: vi.fn(),
  confirm: vi.fn(),
  note: vi.fn(),
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock("@clack/prompts", () => ({
  ...prompts,
  isCancel: () => false,
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

    const result = await runWizard({ yes: true });

    expect(result.cancelled).toBe(false);
    if (!result.cancelled) {
      expect(result.config.backend).toBe("rest");
      expect(result.config.convexExample).toBe(false);
    }
    expect(prompts.confirm).not.toHaveBeenCalled();
    expect(prompts.note.mock.calls[0]?.[0]).toContain("Convex example: no");
  });

  it("asks about the example only after choosing Convex", async () => {
    prompts.select.mockResolvedValueOnce("convex").mockResolvedValueOnce("en");

    const result = await runWizard({ yes: true });

    expect(result.cancelled).toBe(false);
    if (!result.cancelled) {
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
