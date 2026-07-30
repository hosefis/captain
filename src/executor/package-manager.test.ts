import { describe, expect, it } from "vitest";
import { resolvePackageManagerDriver } from "./package-manager.js";

describe("package manager drivers", () => {
  it.each([
    [
      "pnpm",
      "pnpm",
      ["install", "--no-frozen-lockfile", "--force"],
      "pnpm-lock.yaml",
      "workspace:*",
      true,
      "pnpm@9.15.9",
    ],
    ["npm", "npm", ["install"], "package-lock.json", "*", false, "npm@10.9.2"],
    ["bun", "bun", ["install"], "bun.lock", "workspace:*", false, "bun@1.2.5"],
  ] as const)(
    "resolves %s workspace behavior",
    (id, command, args, lockfile, workspaceRange, emitsPnpmWorkspace, manifestId) => {
      const driver = resolvePackageManagerDriver(id);
      expect(driver.install).toEqual({ command, args });
      expect(driver.lockfile).toBe(lockfile);
      expect(driver.workspaceRange).toBe(workspaceRange);
      expect(driver.emitsPnpmWorkspace).toBe(emitsPnpmWorkspace);
      expect(driver.manifestId).toBe(manifestId);
      expect(driver.runScript("build")).toEqual({
        command,
        args: ["run", "build"],
      });
    },
  );
});
