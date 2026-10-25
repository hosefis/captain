import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkCodeStandards } from "./check-code-standards.mjs";

const checkerPath = fileURLToPath(new URL("./check-code-standards.mjs", import.meta.url));

function withProject(files, inspect) {
  const directory = mkdtempSync(join(tmpdir(), "captain-standards-"));
  try {
    for (const [path, content] of Object.entries(files)) {
      const destination = join(directory, path);
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, content);
    }
    inspect(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("rejects all ESM barrel styles, including imported bindings and type-only exports", () => {
  withProject({
    "source.ts": "/** Represent a request. */ export class Request {}",
    "named.ts": 'export { Request } from "./source.js";',
    "star.ts": 'export * from "./source.js";',
    "namespace.ts": 'export * as requests from "./source.js";',
    "type.ts": 'export type { Request } from "./source.js";',
    "imported.ts": 'import { Request } from "./source.js"; export { Request };',
    "default-import.ts": 'import { Request } from "./source.js"; export default Request;',
    "common.cjs": 'module.exports = require("./source.js");',
  }, (directory) => {
    const diagnostics = checkCodeStandards([directory]);
    assert.equal(diagnostics.filter((diagnostic) => diagnostic.rule === "barrel").length, 7);
    assert.ok(diagnostics.every((diagnostic) => diagnostic.severity === "error"));
    const result = spawnSync(process.execPath, [checkerPath, directory], { encoding: "utf8" });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /error \[barrel\]/);
  });
});

test("requires intent docs for public declarations, callable variables and API methods", () => {
  withProject({
    "function.ts": "export function request() {}",
    "local.ts": "function request() {} export { request };",
    "default.ts": "export default function request() {}",
    "arrow.ts": "export const request = () => {};",
    "factory.ts": "function factory() { return () => {}; } export const request = factory();",
    "class.ts": "/** Store requests. */ export class Requests { send() {} private hidden() {} protected internal() {} #secret() {} }",
    "class-missing.ts": "export class Missing {}",
    "interface.ts": "export interface Requests { send(): void; receive: () => void; }",
    "type.ts": "export type Requests = { send(): void };",
    "object.ts": "export const requests = { send() {}, receive: () => {} };",
    "factory-object.ts": "function factory() { return { send() {} }; } export const requests = factory();",
    "namespace.ts": "export namespace Requests { export function send() {} }",
    "local-arrow.ts": "const request = () => {}; export { request };",
    "function-expression.ts": "export const request = function () {};",
    "line-comment.ts": "// Send a request.\nexport function request() {}",
    "empty-comment.ts": "/** */ export function request() {}",
    "tags-only.ts": "/** @param value input */ export function request(value: string) {}",
    "alias.ts": "interface Internal { send(): void; } export type Requests = Internal;",
    "common.cjs": "exports.request = function () {};",
    "default-arrow.mjs": "export default () => {};",
  }, (directory) => {
    const diagnostics = checkCodeStandards([directory]);
    for (const name of ["function.ts", "local.ts", "default.ts", "arrow.ts", "factory.ts", "class.ts",
      "class-missing.ts", "interface.ts", "type.ts", "object.ts", "factory-object.ts", "namespace.ts",
      "local-arrow.ts", "function-expression.ts", "line-comment.ts", "empty-comment.ts", "tags-only.ts",
      "alias.ts", "common.cjs", "default-arrow.mjs"]) {
      assert.ok(diagnostics.some((diagnostic) => diagnostic.file === join(directory, name) &&
        diagnostic.rule === "public-documentation"), `${name} must require documentation`);
    }
    assert.ok(!diagnostics.some((diagnostic) => /hidden|internal|secret/.test(diagnostic.message)));
    assert.equal(diagnostics.filter((diagnostic) => diagnostic.file === join(directory, "class.ts")).length, 1);
    for (const name of ["interface.ts", "object.ts"]) {
      for (const method of ["send", "receive"]) {
        assert.ok(diagnostics.some((diagnostic) => diagnostic.file === join(directory, name) &&
          diagnostic.message.includes(`for ${method}.`)), `${name} must document ${method}`);
      }
    }
  });
});

test("accepts documented public APIs without demanding obvious internal documentation", () => {
  withProject({
    "api.ts": `
      function internal() {}
      /** Send a request. */ function send() {}
      export { send };
      /** Receive a request. */ export const receive = () => {};
      /** Store requests. */ export class Requests {
        /** Start an empty store. */ constructor() {}
        /** Send pending requests. */ send() {}
        private hidden() {}
      }
      export interface Transport {
        /** Send pending requests. */ send(): void;
        /** Receive incoming requests. */ receive: () => void;
      }
      export const transport = { /** Send pending requests. */ send() {} };
      /** Normalize a request. */ export function normalize(value: string): string;
      export function normalize(value: string) { return value; }
    `,
    "default.ts": "/** Send a request. */ export default () => {};",
    "common.cjs": "/** Send a request. */ module.exports = function () {};",
  }, (directory) => {
    assert.deepEqual(checkCodeStandards([directory]), []);
  });
});

test("rejects CommonJS bindings re-exported through aliases, properties, and destructuring", () => {
  withProject({
    "source.cjs": "/** Send a request. */ exports.send = function () {};",
    "binding.cjs": 'const api = require("./source.cjs"); module.exports = api;',
    "alias.cjs": 'const api = require("./source.cjs"); const alias = api; module.exports = alias;',
    "property.cjs": 'const api = require("./source.cjs"); exports.send = api.send;',
    "destructured.cjs": 'const { send } = require("./source.cjs"); exports.send = send;',
  }, (directory) => {
    const diagnostics = checkCodeStandards([directory]);
    for (const name of ["binding.cjs", "alias.cjs", "property.cjs", "destructured.cjs"]) {
      assert.ok(diagnostics.some((diagnostic) => diagnostic.file === join(directory, name) &&
        diagnostic.rule === "barrel"), `${name} must reject imported bindings`);
    }
  });
});

test("accepts exported object APIs whose callable definitions carry intent docs", () => {
  withProject({
    "named.ts": "/** Send a request. */ function send() {} export const api = { send };",
    "alias.ts": "/** Send a request. */ function transmit() {} export const api = { send: transmit };",
    "default.ts": "export default { /** Send a request. */ send() {} };",
    "common.cjs": "/** Send a request. */ function send() {} module.exports = { send };",
  }, (directory) => {
    assert.deepEqual(checkCodeStandards([directory]), []);
  });
});

test("exported object container docs do not conceal undocumented public methods", () => {
  withProject({
    "named.ts": "/** Expose request operations. */ export const api = { send() {} };",
    "default.ts": "/** Expose request operations. */ export default { send: () => {} };",
    "common.cjs": "/** Expose request operations. */ module.exports = { send() {} };",
    "shorthand.ts": "function send() {} export const api = { send };",
    "alias.ts": "function transmit() {} export const api = { send: transmit };",
  }, (directory) => {
    const diagnostics = checkCodeStandards([directory]);
    for (const name of ["named.ts", "default.ts", "common.cjs", "shorthand.ts", "alias.ts"]) {
      assert.ok(diagnostics.some((diagnostic) => diagnostic.file === join(directory, name) &&
        diagnostic.rule === "public-documentation"), `${name} must document its public method`);
    }
  });
});

test("follows maintained directory links without looping or ignoring their source", () => {
  withProject({ "source/missing.ts": "export function missing() {}" }, (directory) => {
    symlinkSync(join(directory, "source"), join(directory, "linked"), "junction");
    symlinkSync(directory, join(directory, "source/loop"), "junction");
    const diagnostics = checkCodeStandards([join(directory, "linked")]);
    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0].rule, "public-documentation");
  });
});

test("nesting beyond three warns and exits successfully; functions and else-if reset depth", () => {
  withProject({
    "deep.ts": "for (;;) { if (true) { while (true) { if (true) break; } } }",
    "flat.ts": "if (true) {} else if (false) {} else if (true) {} else if (false) {}",
    "scopes.ts": "if (true) { if (true) { if (true) { const work = () => { if (true) {} }; } } }",
  }, (directory) => {
    const diagnostics = checkCodeStandards([directory]);
    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0].severity, "warning");
    assert.equal(diagnostics[0].rule, "nesting");
    const result = spawnSync(process.execPath, [checkerPath, directory], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /0 error\(s\), 1 warning\(s\)/);
  });
});

test("scans tests, scripts, declarations and JS/TS variants while excluding generated outputs", () => {
  const files = {};
  for (const extension of ["js", "jsx", "ts", "tsx", "mjs", "cjs", "mts", "cts", "d.ts"]) {
    files[`scripts/missing.${extension}`] = "export function missing() {}";
  }
  files["src/missing.test.ts"] = "export function missing() {}";
  files["src/_generated/maintained.ts"] = "export function missing() {}";
  for (const directory of ["node_modules", "dist", "build", ".next", ".expo", "coverage", "convex/_generated"]) {
    files[`${directory}/ignored.ts`] = "export function ignored() {}";
  }
  withProject(files, (directory) => {
    const diagnostics = checkCodeStandards([directory]);
    assert.equal(diagnostics.length, 11);
    assert.ok(!diagnostics.some((diagnostic) => diagnostic.message.includes("ignored")));
    assert.equal(checkCodeStandards([join(directory, "scripts/missing.ts"),
      join(directory, "src/missing.test.ts")]).length, 2);
  });
});

test("fails closed for a missing scan root", () => {
  withProject({}, (directory) => {
    const result = spawnSync(process.execPath, [checkerPath, join(directory, "absent")], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /ENOENT/);
  });
});

test("the unchanged copied checker runs from a standalone project and checks itself", () => {
  withProject({
    "package.json": '{"type":"module"}',
    "src/missing.ts": "export const request = () => {};",
  }, (directory) => {
    const destination = join(directory, "tools/check-code-standards.mjs");
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(checkerPath, destination);
    assert.deepEqual(readFileSync(destination), readFileSync(checkerPath));
    const require = createRequire(import.meta.url);
    const compilerDirectory = dirname(require.resolve("typescript/package.json"));
    mkdirSync(join(directory, "node_modules"));
    symlinkSync(compilerDirectory, join(directory, "node_modules/typescript"), "junction");
    const result = spawnSync(process.execPath, [destination], { cwd: directory, encoding: "utf8" });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /src[\\/]missing.ts:1:.*error \[public-documentation\]/);
    assert.doesNotMatch(result.stdout, /tools[\\/]check-code-standards.mjs:.*error/);
    writeFileSync(join(directory, "src/missing.ts"), "/** Send a request. */ export const request = () => {};");
    const passing = spawnSync(process.execPath, [destination], { cwd: directory, encoding: "utf8" });
    assert.equal(passing.status, 0, passing.stdout + passing.stderr);
    assert.deepEqual(readFileSync(destination), readFileSync(checkerPath));
  });
});

test("published assets include the single canonical rules and portable checker", () => {
  const repository = fileURLToPath(new URL("..", import.meta.url));
  const manifest = JSON.parse(readFileSync(join(repository, "package.json"), "utf8"));
  assert.ok(manifest.files.includes("AGENTS.md"));
  assert.ok(manifest.files.includes("scripts/check-code-standards.mjs"));
  assert.equal(readFileSync(join(repository, "CLAUDE.md"), "utf8").trim(), "@AGENTS.md");
});

test("AR1 scans projects under excluded ancestor names and a project itself named build", () => {
  const projects = ["build/project", "out/project", "dist/project", "build"];
  const files = {};
  for (const project of projects) {
    files[`${project}/api.ts`] = "export function undocumented() {}";
    files[`${project}/src/_generated/api.ts`] = "export function maintained() {}";
    for (const child of ["build", "out", "dist", "node_modules", "convex/_generated"]) {
      files[`${project}/${child}/ignored.ts`] = "export function ignored() {}";
    }
  }
  withProject(files, (directory) => {
    for (const project of projects) {
      const result = spawnSync(process.execPath, [checkerPath, "."], {
        cwd: join(directory, project), encoding: "utf8",
      });
      assert.equal(result.status, 1, `${project}: ${result.stdout}${result.stderr}`);
      assert.match(result.stdout, /Missing intent documentation for undocumented/);
      assert.match(result.stdout, /Missing intent documentation for maintained/);
      assert.doesNotMatch(result.stdout, /for ignored/);
    }
  });
});

test("AR1 excludes linked generated ownership while retaining maintained links and cycles", () => {
  withProject({
    "build/output.ts": "export function ignored() {}",
    "convex/_generated/api.ts": "export function ignored() {}",
    "src/_generated/api.ts": "export function maintained() {}",
  }, (directory) => {
    symlinkSync(join(directory, "build"), join(directory, "output-link"), "junction");
    symlinkSync(join(directory, "convex/_generated"), join(directory, "convex-link"), "junction");
    symlinkSync(directory, join(directory, "src/loop"), "junction");
    const diagnostics = checkCodeStandards([directory]);
    assert.equal(diagnostics.length, 1);
    assert.match(diagnostics[0].message, /for maintained/);
  });
});

test("AR2 rejects named imported aliases and exported forwarded bindings through the CLI", () => {
  withProject({
    "source.ts": "/** Send requests. */ export function send() {}",
    "named.ts": 'import { send } from "./source.js"; /** Send requests. */ const alias = send; export { alias };',
    "binding.ts": 'import { send } from "./source.js"; /** Send requests. */ export const alias = send;',
    "chain.ts": 'import * as api from "./source.js"; const first = api.send; /** Send requests. */ const second = (first satisfies typeof first); export { second as send };',
    "destructured.ts": 'import * as api from "./source.js"; /** Send requests. */ export const { send } = api;',
  }, (directory) => {
    const result = spawnSync(process.execPath, [checkerPath, "."], { cwd: directory, encoding: "utf8" });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    for (const name of ["named", "binding", "chain", "destructured"]) {
      assert.match(result.stdout, new RegExp(`${name}\\.ts:.*error \\[barrel\\]`));
    }
  });
});

test("AR2 accepts documented new wrapper and factory operations", () => {
  withProject({
    "source.ts": "/** Send requests. */ export function send() {} /** Create a sender. */ export function factory() { return () => {}; }",
    "api.ts": `import { send, factory } from "./source.js";
      /** Send a normalized request. */ export function forward() { return send(); }
      /** Schedule a request. */ const schedule = () => send(); export { schedule };
      /** Execute a request. */ export const execute = factory();`,
  }, (directory) => {
    const result = spawnSync(process.execPath, [checkerPath, "."], { cwd: directory, encoding: "utf8" });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });
});

test("AR3 uses nearest extended workspace configurations without suppressing excluded maintained files", () => {
  const files = {
    "tsconfig.json": JSON.stringify({ compilerOptions: { paths: { "@/*": ["./root/*"] } } }),
    "root/local.ts": "/** Create an ordinary value. */ export function factory() { return 1; }",
    "configuration/base.json": JSON.stringify({ compilerOptions: { moduleResolution: "bundler", module: "esnext", strict: true } }),
  };
  for (const project of ["apps/web", "packages/core"]) {
    files[`${project}/tsconfig.json`] = JSON.stringify({
      extends: "../../configuration/base.json",
      compilerOptions: { paths: { "@/*": ["./src/*"] } },
      include: ["src/**/*.ts"], exclude: ["tests", "scripts", "configuration.ts"],
    });
    files[`${project}/src/local.ts`] = "/** Create a request operation. */ export function factory() { return () => {}; }";
    for (const path of ["src/public.ts", "tests/api.ts", "scripts/api.ts", "configuration.ts"]) {
      files[`${project}/${path}`] = 'import { factory } from "@/local"; export const execute = factory();';
    }
  }
  files["root/public.ts"] = 'import { factory } from "@/local"; export const value = factory();';
  withProject(files, (directory) => {
    const diagnostics = checkCodeStandards([directory]);
    assert.equal(diagnostics.filter((diagnostic) => diagnostic.rule === "public-documentation").length, 8);
    assert.ok(!diagnostics.some((diagnostic) => diagnostic.file === join(directory, "root/public.ts")));
    const result = spawnSync(process.execPath, [checkerPath, "."], { cwd: directory, encoding: "utf8" });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /Missing intent documentation for execute/);
  });
});

test("AR3 surfaces malformed configuration and unresolved configured aliases", () => {
  withProject({
    "malformed/tsconfig.json": '{"compilerOptions":{"strict": "yes"}}',
    "malformed/api.ts": "/** Send requests. */ export function send() {}",
    "missing-extends/tsconfig.json": '{"extends":"./absent.json"}',
    "missing-extends/api.ts": "/** Send requests. */ export function send() {}",
    "unresolved/tsconfig.json": '{"compilerOptions":{"paths":{"@/*":["./src/*"]}}}',
    "unresolved/api.ts": 'import { factory } from "@/absent"; export const execute = factory();',
  }, (directory) => {
    for (const project of ["malformed", "missing-extends", "unresolved"]) {
      const result = spawnSync(process.execPath, [checkerPath, "."], {
        cwd: join(directory, project), encoding: "utf8",
      });
      assert.equal(result.status, 1, `${project}: ${result.stdout}${result.stderr}`);
      assert.match(result.stdout + result.stderr, /strict|absent/);
    }
  });
});

test("AR4 checks locally inherited interface and class callable members across files", () => {
  withProject({
    "internal.ts": `export interface Internal { send(): void; receive: () => void; }
      /** Store internal requests. */ export class InternalStore {
        send() {} receive = () => {}; private hidden() {} protected internal() {} #secret() {}
      }`,
    "api.ts": `import { Internal, InternalStore } from "./internal.js";
      interface Local { local(): void; }
      class LocalStore { enqueue() {} dequeue = () => {}; private hidden() {} protected internal() {} }
      export interface Public extends Local, Internal {}
      /** Store public requests. */ export class PublicStore extends InternalStore {}
      /** Store queued requests. */ export class Queue extends LocalStore {}`,
  }, (directory) => {
    const diagnostics = checkCodeStandards([join(directory, "api.ts"), join(directory, "internal.ts")]);
    for (const name of ["send", "receive", "local", "enqueue", "dequeue"]) {
      assert.ok(diagnostics.some((diagnostic) => diagnostic.message === `Missing intent documentation for ${name}.`), name);
    }
    assert.ok(!diagnostics.some((diagnostic) => /hidden|internal|secret/.test(diagnostic.message)));
    const result = spawnSync(process.execPath, [checkerPath, "."], { cwd: directory, encoding: "utf8" });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /for local/);
  });
});

test("AR3 parses invalid JSON and still scans files outside every configured input", () => {
  withProject({
    "malformed/tsconfig.json": '{"compilerOptions": {',
    "malformed/api.ts": "/** Send requests. */ export function send() {}",
    "empty-files/tsconfig.json": '{"files":[]}',
    "empty-files/api.ts": "export function send() {}",
    "excluded/tsconfig.json": '{"compilerOptions":{"paths":{"@/*":["./src/*"]}},"include":["absent/**/*.ts"]}',
    "excluded/src/local.ts": "/** Create an operation. */ export function factory() { return () => {}; }",
    "excluded/scripts/api.ts": 'import { factory } from "@/local"; export const execute = factory();',
  }, (directory) => {
    const malformed = spawnSync(process.execPath, [checkerPath, "."], {
      cwd: join(directory, "malformed"), encoding: "utf8",
    });
    assert.equal(malformed.status, 1, malformed.stdout + malformed.stderr);
    assert.match(malformed.stderr, /tsconfig\.json/);
    const emptyFiles = spawnSync(process.execPath, [checkerPath, "."], {
      cwd: join(directory, "empty-files"), encoding: "utf8",
    });
    assert.equal(emptyFiles.status, 1, emptyFiles.stdout + emptyFiles.stderr);
    assert.match(emptyFiles.stdout, /Missing intent documentation for send/);
    const excluded = spawnSync(process.execPath, [checkerPath, "."], {
      cwd: join(directory, "excluded"), encoding: "utf8",
    });
    assert.equal(excluded.status, 1, excluded.stdout + excluded.stderr);
    assert.match(excluded.stdout, /Missing intent documentation for execute/);
    writeFileSync(join(directory, "excluded/scripts/api.ts"), `import { factory } from "@/local";
      export type Path = "@/literal";
      /** Execute requests. */ export const execute = factory();`);
    const documented = spawnSync(process.execPath, [checkerPath, "."], {
      cwd: join(directory, "excluded"), encoding: "utf8",
    });
    assert.equal(documented.status, 0, documented.stdout + documented.stderr);
  });
});

test("AR4 accepts documented local inheritance and exempts dependency methods", () => {
  withProject({
    "node_modules/external/index.d.ts": "export interface Remote { send(): void; } export class RemoteStore { send(): void; }",
    "api.ts": `import { Remote, RemoteStore } from "external";
      interface Internal { /** Send pending requests. */ send(): void; }
      export interface Public extends Internal, Remote {}
      /** Store requests. */ class InternalStore { /** Receive pending requests. */ receive() {} private hidden() {} protected internal() {} }
      /** Store public requests. */ export class PublicStore extends InternalStore {}
      /** Store remote requests. */ export class PublicRemoteStore extends RemoteStore {}`,
  }, (directory) => {
    const result = spawnSync(process.execPath, [checkerPath, "."], { cwd: directory, encoding: "utf8" });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });
});
