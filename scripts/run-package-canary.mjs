#!/usr/bin/env node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";

const repository = resolve(fileURLToPath(new URL("..", import.meta.url)));
const [mode, version] = process.argv.slice(2).filter((arg) => arg !== "--");

if (mode !== "packed" && mode !== "published") {
  throw new Error("Usage: node scripts/run-package-canary.mjs packed|published [version]");
}
if (mode === "published" && !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version ?? "")) {
  throw new Error("Pass an explicit published version, for example: pnpm canary:published -- 0.2.0");
}

const configuredRoot = process.env.CAPTAIN_CANARY_ROOT;
const root = configuredRoot
  ? resolve(configuredRoot)
  : mkdtempSync(join(tmpdir(), `captain-${mode}-canary-`));
mkdirSync(root, { recursive: true });
const project = join(root, "generated");
const config = join(root, "project.json");
const log = join(root, "canary.log");
writeFileSync(config, readFileSync(join(repository, "fixtures", "project-web.json")));

async function run(command, args, cwd, allowFailure = false) {
  const rendered = [command, ...args].join(" ");
  console.log(`$ ${rendered}`);
  const result = await execa(command, args, {
    cwd,
    reject: false,
    stdin: "ignore",
    all: true,
    env: { ...process.env, CI: "true" },
  });
  const output = String(result.all ?? "");
  writeFileSync(log, `${rendered}\n\n${output}`, { flag: "a" });
  if (output) process.stdout.write(output);
  if (result.exitCode !== 0 && !allowFailure) {
    throw new Error(`${rendered} exited ${result.exitCode}. Diagnostics: ${log}`);
  }
  return { output, exitCode: result.exitCode };
}

async function waitForPublishedVersion(packageSpec) {
  for (let attempt = 1; attempt <= 12; attempt++) {
    const { output, exitCode } = await run(
      "npm", ["view", packageSpec, "version", "--json"], root, true,
    );
    if (exitCode === 0) return;
    if (!/E404|404 Not Found|No match found for version/i.test(output)) {
      throw new Error(`Registry lookup failed for ${packageSpec}. Diagnostics: ${log}`);
    }
    if (attempt === 12) {
      throw new Error(`${packageSpec} was not available after 12 registry checks. Diagnostics: ${log}`);
    }
    console.log(`Waiting 10 seconds for ${packageSpec} to reach npm (${attempt}/12)`);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 10_000));
  }
}

try {
  let packageSpec;
  if (mode === "packed") {
    const { output } = await run("npm", ["pack", "--json", "--pack-destination", root], repository);
    const start = output.indexOf("[\n");
    const packed = JSON.parse(output.slice(start));
    packageSpec = join(root, packed[0].filename);
    if (!existsSync(packageSpec)) throw new Error(`Tarball missing: ${packageSpec}`);
  } else {
    packageSpec = `create-captain@${version}`;
    await waitForPublishedVersion(packageSpec);
  }

  // Run outside the repository so no local dist, templates, or dependencies can satisfy this check.
  await run("pnpm", ["dlx", packageSpec, project, "--config", config, "--yes", "--json"], root);

  const generatedPackage = JSON.parse(readFileSync(join(project, "package.json"), "utf8"));
  if (!existsSync(join(project, "src", "app")) || !existsSync(join(project, "node_modules"))) {
    throw new Error("Generated web project is missing src/app or installed dependencies");
  }
  for (const script of ["typecheck", "lint", "build"]) {
    if (!generatedPackage.scripts?.[script]) {
      throw new Error(`Generated web project is missing ${script} script`);
    }
  }
  console.log(`${mode} canary passed: generated pnpm web project and CLI smoke validation`);
  if (!configuredRoot) rmSync(root, { recursive: true, force: true });
} catch (error) {
  console.error(error);
  console.error(`Canary output retained at ${root}`);
  process.exitCode = 1;
}
