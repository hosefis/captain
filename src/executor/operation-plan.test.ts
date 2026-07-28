import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyOperationPlan,
  preflightOperationPlan,
  type OperationPlan,
} from "./operation-plan.js";

function makeRoot(): string {
  const root = join(
    tmpdir(),
    `captain-operations-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(root, { recursive: true });
  return root;
}

describe("operation plans", () => {
  it("reports every collision before writing", async () => {
    const root = makeRoot();
    writeFileSync(join(root, "owned.ts"), "user edit\n");
    writeFileSync(join(root, "remove.ts"), "user edit\n");

    const plan: OperationPlan = {
      root,
      operations: [
        { kind: "create", path: "new.ts", content: "new\n" },
        {
          kind: "update",
          path: "owned.ts",
          expectedContent: "generated\n",
          content: "updated\n",
        },
        {
          kind: "delete",
          path: "remove.ts",
          expectedContent: "generated\n",
        },
      ],
    };

    const preflight = preflightOperationPlan(plan);
    expect(preflight.ok).toBe(false);
    expect(preflight.collisions.map((item) => item.path)).toEqual([
      "owned.ts",
      "remove.ts",
    ]);

    await expect(applyOperationPlan(plan)).rejects.toThrow(/collision/i);
    expect(existsSync(join(root, "new.ts"))).toBe(false);
    expect(readFileSync(join(root, "owned.ts"), "utf8")).toBe("user edit\n");
  });

  it("allows identical creates and expected updates", async () => {
    const root = makeRoot();
    writeFileSync(join(root, "same.ts"), "same\n");
    writeFileSync(join(root, "update.ts"), "before\n");

    const result = await applyOperationPlan({
      root,
      operations: [
        { kind: "create", path: "same.ts", content: "same\n" },
        {
          kind: "update",
          path: "update.ts",
          expectedContent: "before\n",
          content: "after\n",
        },
      ],
    });

    expect(result.applied).toEqual(["same.ts", "update.ts"]);
    expect(readFileSync(join(root, "update.ts"), "utf8")).toBe("after\n");
  });

  it("requires force for an unexpected replacement", async () => {
    const root = makeRoot();
    writeFileSync(join(root, "owned.ts"), "user edit\n");
    const plan: OperationPlan = {
      root,
      operations: [
        {
          kind: "update",
          path: "owned.ts",
          expectedContent: "generated\n",
          content: "forced\n",
        },
      ],
    };

    expect(preflightOperationPlan(plan).ok).toBe(false);
    expect(preflightOperationPlan(plan, { force: true }).ok).toBe(true);
    await applyOperationPlan(plan, { force: true });
    expect(readFileSync(join(root, "owned.ts"), "utf8")).toBe("forced\n");
  });

  it("rejects paths that escape the operation root", () => {
    const root = makeRoot();
    const plan: OperationPlan = {
      root,
      operations: [{ kind: "create", path: "../outside.ts", content: "no\n" }],
    };

    expect(() => preflightOperationPlan(plan)).toThrow(/outside operation root/i);
  });

  it("serializes command and install operations without executing during preflight", async () => {
    const root = makeRoot();
    const seen: string[] = [];
    const plan: OperationPlan = {
      root,
      operations: [
        { kind: "command", id: "setup", command: "tool", args: ["setup"] },
        { kind: "install", id: "install", command: "pm", args: ["install"] },
      ],
    };

    expect(preflightOperationPlan(plan)).toEqual({ ok: true, collisions: [] });
    expect(seen).toEqual([]);

    await applyOperationPlan(plan, {
      runner: async (operation) => {
        seen.push(operation.id);
        return { exitCode: 0 };
      },
    });
    expect(seen).toEqual(["setup", "install"]);
  });
});
