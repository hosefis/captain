import { describe, expect, it } from "vitest";
import { runBootstrapPlan } from "./bootstrap-run.js";
import type { BootstrapStep } from "../resolver/bootstrap.js";

const sampleStep: BootstrapStep = {
  id: "bootstrap-web",
  description: "test",
  command: "pnpm",
  args: ["dlx", "create-next-app@latest"],
  cwd: "/tmp/test",
};

describe("runBootstrapPlan", () => {
  it("runs steps sequentially with injected runner", async () => {
    const seen: string[] = [];

    const result = await runBootstrapPlan([sampleStep], {
      runner: async (step) => {
        seen.push(step.id);
        return { exitCode: 0, stdout: "ok", stderr: "" };
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.completedSteps).toEqual(["bootstrap-web"]);
    }
    expect(seen).toEqual(["bootstrap-web"]);
  });

  it("skips slot steps without calling runner", async () => {
    const slotStep: BootstrapStep = {
      id: "bootstrap-apps-desktop",
      description: "slot",
      command: "(slot)",
      args: [],
      cwd: "/tmp/test",
    };

    let runnerCalls = 0;
    const result = await runBootstrapPlan([slotStep], {
      runner: async () => {
        runnerCalls += 1;
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    });

    expect(result.ok).toBe(true);
    expect(runnerCalls).toBe(0);
  });

  it("returns failure when a step exits non-zero", async () => {
    const result = await runBootstrapPlan([sampleStep], {
      runner: async () => ({
        exitCode: 1,
        stdout: "",
        stderr: "spawn failed",
      }),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failedStep.id).toBe("bootstrap-web");
      expect(result.stderr).toContain("spawn failed");
    }
  });

  it("captures readable stderr from the real child process", async () => {
    const result = await runBootstrapPlan([
      {
        ...sampleStep,
        command: process.execPath,
        args: [
          "-e",
          "console.error('visible bootstrap failure'); process.exit(1)",
        ],
        cwd: process.cwd(),
      },
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stderr).toContain("visible bootstrap failure");
      expect(result.stderr).not.toContain("[object Object]");
    }
  });
});
