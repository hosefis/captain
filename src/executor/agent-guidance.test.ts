import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const assets = vi.hoisted(() => ({ directory: "" }));
vi.mock("../lib/paths.js", () => ({ captainPackageRoot: () => assets.directory }));
import { emitAgentGuidance } from "./agent-guidance.js";

const directories: string[] = [];
function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "captain-guidance-"));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("agent guidance", () => {
  it("replaces only its canonical section and preserves framework instructions on both sides", () => {
    assets.directory = temporaryDirectory();
    const target = temporaryDirectory();
    const prefix = "Framework guidance\r\n\r\n";
    const suffix = "\r\n\r\nCustom instructions with no terminal newline";
    writeFileSync(join(assets.directory, "AGENTS.md"), "Current rules");
    writeFileSync(join(target, "AGENTS.md"), `${prefix}<!-- code-standards:start -->\nOld rules\n<!-- code-standards:end -->${suffix}`);
    emitAgentGuidance(target);
    const result = readFileSync(join(target, "AGENTS.md"), "utf-8");
    expect(result).toBe(`${prefix}<!-- code-standards:start -->\nCurrent rules\n<!-- code-standards:end -->${suffix}`);
    emitAgentGuidance(target);
    expect(readFileSync(join(target, "AGENTS.md"), "utf-8")).toBe(result);
  });
  it.each(["", "Framework rules", "Framework rules\n", "Framework rules\r\n", "# Custom\r\nKeep this byte content."])(
    "preserves existing bytes and synchronizes canonical content: %j", (original) => {
      assets.directory = temporaryDirectory();
      const target = temporaryDirectory();
      writeFileSync(join(assets.directory, "AGENTS.md"), "# Rules\nFirst rule.\n");
      writeFileSync(join(target, "AGENTS.md"), original);
      writeFileSync(join(target, "CLAUDE.md"), original);
      emitAgentGuidance(target);
      const firstGuidance = readFileSync(join(target, "AGENTS.md"), "utf-8");
      const firstClaude = readFileSync(join(target, "CLAUDE.md"), "utf-8");
      expect(firstGuidance.startsWith(original)).toBe(true);
      expect(firstClaude.startsWith(original)).toBe(true);
      expect(firstClaude).toContain("@AGENTS.md");
      emitAgentGuidance(target);
      expect(readFileSync(join(target, "AGENTS.md"), "utf-8")).toBe(firstGuidance);
      expect(readFileSync(join(target, "CLAUDE.md"), "utf-8")).toBe(firstClaude);
      writeFileSync(join(assets.directory, "AGENTS.md"), "# Rules\r\nUpdated rule.");
      emitAgentGuidance(target);
      const updated = readFileSync(join(target, "AGENTS.md"), "utf-8");
      expect(updated.startsWith(original)).toBe(true);
      expect(updated).toContain("# Rules\r\nUpdated rule.");
      expect(updated).not.toContain("First rule.");
      expect(updated.match(/code-standards:start/g)).toHaveLength(1);
    },
  );

  it.each(["@AGENTS.md", "Read @AGENTS.md for rules.\r\n", "- Follow @./AGENTS.md", "Don't forget @AGENTS.md; it's important."])(
    "preserves active imports without changes: %j", (contents) => {
      assets.directory = temporaryDirectory();
      const target = temporaryDirectory();
      writeFileSync(join(assets.directory, "AGENTS.md"), "Rules");
      writeFileSync(join(target, "CLAUDE.md"), contents);
      emitAgentGuidance(target);
      expect(readFileSync(join(target, "CLAUDE.md"), "utf-8")).toBe(contents);
    },
  );

  it.each(["`@AGENTS.md`", '"@AGENTS.md"', "'@AGENTS.md'", "```md\n@AGENTS.md\n```", "~~~md\r\n@AGENTS.md\r\n~~~", "<!-- @AGENTS.md -->", "````md\n@AGENTS.md\n````", "```md\n@AGENTS.md"])(
    "adds an active import after literal mentions: %j", (contents) => {
      assets.directory = temporaryDirectory();
      const target = temporaryDirectory();
      writeFileSync(join(assets.directory, "AGENTS.md"), "Rules");
      writeFileSync(join(target, "CLAUDE.md"), contents);
      emitAgentGuidance(target);
      const result = readFileSync(join(target, "CLAUDE.md"), "utf-8");
      expect(result.startsWith(contents)).toBe(true);
      expect(result).toMatch(/\n@AGENTS\.md\r?\n$/);
      emitAgentGuidance(target);
      expect(readFileSync(join(target, "CLAUDE.md"), "utf-8")).toBe(result);
    },
  );

  it.each([
    ["Example:\n\n    @AGENTS.md\n", "\n@AGENTS.md\n"],
    ["Example:\r\n\r\n\t@AGENTS.md\r\n", "\r\n@AGENTS.md\r\n"],
    ["<!-- Framework example is unfinished", "\n\n-->\n\n@AGENTS.md\n"],
    ["<!-- Read @AGENTS.md for example", "\n\n-->\n\n@AGENTS.md\n"],
    ["<!-- example\r\n```md\r\n@AGENTS.md", "\r\n\r\n-->\r\n\r\n@AGENTS.md\r\n"],
    ["```md\n<!-- @AGENTS.md", "\n\n```\n\n@AGENTS.md\n"],
    ["    <!-- @AGENTS.md\n\n<!-- unfinished", "\n\n-->\n\n@AGENTS.md\n"],
    ["<!-- closed -->\n\n    @AGENTS.md", "\n\n@AGENTS.md\n"],
    ["`<!--`\n\n    @AGENTS.md", "\n\n@AGENTS.md\n"],
    ["`Example:\n@AGENTS.md`", "\n\n@AGENTS.md\n"],
    ["<!-- ` --> `@AGENTS.md`", "\n\n@AGENTS.md\n"],
    ["# Example\n    @AGENTS.md", "\n\n@AGENTS.md\n"],
    ["Example\n=======\n    @AGENTS.md", "\n\n@AGENTS.md\n"],
    ["# Règles 🧭\r\n\r\n    @AGENTS.md\r\n", "\r\n@AGENTS.md\r\n"],
  ])("preserves literal bytes and appends outside their region: %j", (original, appended) => {
    assets.directory = temporaryDirectory();
    const target = temporaryDirectory();
    const claudePath = join(target, "CLAUDE.md");
    writeFileSync(join(assets.directory, "AGENTS.md"), "Rules");
    const originalBytes = Buffer.from(original, "utf-8");
    writeFileSync(claudePath, originalBytes);

    emitAgentGuidance(target);

    const result = readFileSync(claudePath);
    expect(result.subarray(0, originalBytes.length)).toEqual(originalBytes);
    expect(result).toEqual(Buffer.from(original + appended, "utf-8"));
    emitAgentGuidance(target);
    expect(readFileSync(claudePath)).toEqual(result);
  });

  it.each([
    "<!-- closed --> Read @AGENTS.md\n<!-- unfinished",
    "Example:\n\n    @AGENTS.md\n\nRead @AGENTS.md\n",
    "```md\n<!-- @AGENTS.md\n```\nRead @AGENTS.md\n",
    "<!-- example\n```\n-->\nRead @AGENTS.md\n",
    "Paragraph\n    @AGENTS.md\n",
    "<!-- ` --> Read @AGENTS.md `\n",
    "`Example:\n<!--`\nRead @AGENTS.md\n",
  ])("preserves active imports alongside literal regions byte for byte: %j", (original) => {
    assets.directory = temporaryDirectory();
    const target = temporaryDirectory();
    const claudePath = join(target, "CLAUDE.md");
    writeFileSync(join(assets.directory, "AGENTS.md"), "Rules");
    const originalBytes = Buffer.from(original, "utf-8");
    writeFileSync(claudePath, originalBytes);
    emitAgentGuidance(target);
    emitAgentGuidance(target);
    expect(readFileSync(claudePath)).toEqual(originalBytes);
  });
});
