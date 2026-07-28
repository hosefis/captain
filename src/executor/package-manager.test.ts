import { describe, expect, it } from "vitest";
import { resolvePackageManagerDriver } from "./package-manager.js";

describe("package manager drivers", () => {
  it.each([
    ["pnpm", "pnpm", ["install"], "pnpm-lock.yaml", "workspace:*", true],
    ["npm", "npm", ["install"], "package-lock.json", "*", false],
    ["bun", "bun", ["install"], "bun.lock", "workspace:*", false],
  ] as const)(
    "resolves %s workspace behavior",
    (id, command, args, lockfile, workspaceRange, emitsPnpmWorkspace) => {
      const driver = resolvePackageManagerDriver(id);
      expect(driver.install).toEqual({ command, args });
      expect(driver.lockfile).toBe(lockfile);
      expect(driver.workspaceRange).toBe(workspaceRange);
      expect(driver.emitsPnpmWorkspace).toBe(emitsPnpmWorkspace);
      expect(driver.runScript("build")).toEqual({
        command,
        args: ["run", "build"],
      });
    },
  );
});
