#!/usr/bin/env node
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const [packageManager, topology, backend = "rest"] = process.argv.slice(2);
if (!["pnpm", "npm", "bun"].includes(packageManager)) {
  throw new Error("package manager must be pnpm, npm, or bun");
}
if (!["web", "mobile", "monorepo"].includes(topology)) {
  throw new Error("topology must be web, mobile, or monorepo");
}
if (!["rest", "convex"].includes(backend)) {
  throw new Error("backend must be rest or convex");
}

const root = process.env.CAPTAIN_MATRIX_ROOT
  ? resolve(process.env.CAPTAIN_MATRIX_ROOT)
  : mkdtempSync(join(tmpdir(), `captain-live-${packageManager}-${topology}-${backend}-`));
mkdirSync(root, { recursive: true });
const target = join(root, "generated");
const configPath = join(root, "project.json");
const hasMobile = topology === "mobile" || topology === "monorepo";
const hasWeb = topology === "web" || topology === "monorepo";

writeFileSync(
  configPath,
  `${JSON.stringify(
    {
      name: `captain-${packageManager}-${topology}`,
      scope: "@captain-smoke",
      packageManager,
      topology,
      ...(topology === "monorepo" ? { apps: ["web", "mobile"] } : {}),
      backend,
      ...(backend === "convex" ? { convexExample: true } : {}),
      auth: "clerk",
      i18n:
        topology === "monorepo"
          ? { web: "gt-next", mobile: "gt-react-native" }
          : hasWeb
            ? "gt-next"
            : "gt-react-native",
      ui:
        topology === "monorepo"
          ? { web: "shadcn-base-ui", mobile: "nativewind" }
          : hasWeb
            ? "shadcn-base-ui"
            : "nativewind",
      ...(hasMobile ? { runtime: "dev-build" } : {}),
      locales: ["en", "fr"],
      defaultLocale: "en",
    },
    null,
    2,
  )}\n`,
);

const result = spawnSync(
  process.execPath,
  ["dist/cli.js", target, "--config", configPath, "--yes", "--json"],
  { cwd: process.cwd(), stdio: "inherit", shell: false },
);

if (result.status !== 0) {
  console.error(`Live matrix output retained at ${root}`);
  process.exit(result.status ?? 1);
}

console.log(`Live matrix passed: ${packageManager}/${topology}/${backend}`);
