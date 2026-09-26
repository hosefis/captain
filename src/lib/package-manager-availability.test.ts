import { beforeEach, describe, expect, it, vi } from "vitest";
import { execa } from "execa";
import { detectPackageManagers } from "./package-manager-availability.js";

vi.mock("execa", () => ({ execa: vi.fn() }));

const mockedExeca = vi.mocked(execa);

describe("detectPackageManagers", () => {
  beforeEach(() => {
    mockedExeca.mockReset();
  });

  it("checks every manager with its own version command and suppresses output", async () => {
    mockedExeca.mockResolvedValue({ exitCode: 0 } as Awaited<ReturnType<typeof execa>>);

    await expect(detectPackageManagers()).resolves.toEqual({
      pnpm: true,
      npm: true,
      bun: true,
    });
    expect(mockedExeca.mock.calls).toEqual([
      ["pnpm", ["--version"], { reject: false, stdio: "ignore", timeout: 5_000 }],
      ["npm", ["--version"], { reject: false, stdio: "ignore", timeout: 5_000 }],
      ["bun", ["--version"], { reject: false, stdio: "ignore", timeout: 5_000 }],
    ]);
  });

  it("marks failed commands, spawn errors, and timeouts unavailable", async () => {
    mockedExeca
      .mockResolvedValueOnce({ exitCode: 1 } as Awaited<ReturnType<typeof execa>>)
      .mockRejectedValueOnce(new Error("ENOENT"))
      .mockRejectedValueOnce(new Error("timed out"));

    await expect(detectPackageManagers()).resolves.toEqual({
      pnpm: false,
      npm: false,
      bun: false,
    });
  });

  it("does not wait for one check before starting the others", async () => {
    let finishFirst: ((value: Awaited<ReturnType<typeof execa>>) => void) | undefined;
    mockedExeca
      .mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }) as ReturnType<typeof execa>)
      .mockResolvedValue({ exitCode: 0 } as Awaited<ReturnType<typeof execa>>);

    const detection = detectPackageManagers();
    expect(mockedExeca).toHaveBeenCalledTimes(3);
    finishFirst?.({ exitCode: 0 } as Awaited<ReturnType<typeof execa>>);
    await expect(detection).resolves.toEqual({ pnpm: true, npm: true, bun: true });
  });
});
