import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { captainPackageRoot } from "../lib/paths.js";

const sectionStart = "<!-- code-standards:start -->";
const sectionEnd = "<!-- code-standards:end -->";

function readExisting(filePath: string): string {
  return existsSync(filePath) ? readFileSync(filePath, "utf-8") : "";
}

function appendSection(contents: string, section: string): string {
  const newline = contents.includes("\r\n") ? "\r\n" : "\n";
  const separator = contents.length === 0 ? "" : contents.endsWith("\n") ? newline : newline.repeat(2);
  return `${contents}${separator}${section}`;
}

function guidanceImportState(contents: string): { exists: boolean; openFence?: string } {
  const lines: string[] = [];
  let fence: string | undefined;
  for (const line of contents.replace(/<!--[^]*?-->/g, "").split(/\r?\n/)) {
    const match = line.match(/^[ \t]*(`{3,}|~{3,})(.*)$/);
    const marker = match?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length && !match?.[2]?.trim()) fence = undefined;
      continue;
    }
    if (!fence) lines.push(line);
  }
  const prose = lines.join("\n")
    .replace(/(`+)[^]*?\1/g, "")
    .replace(/(^|[\s(])(?:"[^"\r\n]*"|'[^'\r\n]*')/gm, "$1");
  return {
    exists: /(?:^|[\s(])@(?:\.\/)?AGENTS\.md(?=$|[\s),;:!?])/m.test(prose),
    openFence: fence,
  };
}

/** Synchronizes canonical rules while retaining framework and user instructions. */
export function emitAgentGuidance(targetDirectory: string): void {
  const canonical = readFileSync(join(captainPackageRoot(), "AGENTS.md"), "utf-8");
  const guidancePath = join(targetDirectory, "AGENTS.md");
  const existingGuidance = readExisting(guidancePath);
  const section = `${sectionStart}\n${canonical}${canonical.endsWith("\n") ? "" : "\n"}${sectionEnd}\n`;
  const start = existingGuidance.indexOf(sectionStart);
  const end = existingGuidance.indexOf(sectionEnd, start);
  const guidance = start >= 0 && end >= start
    ? `${existingGuidance.slice(0, start)}${section.trimEnd()}${existingGuidance.slice(end + sectionEnd.length)}`
    : appendSection(existingGuidance, section);
  writeFileSync(guidancePath, guidance, "utf-8");

  const claudePath = join(targetDirectory, "CLAUDE.md");
  const existingClaude = readExisting(claudePath);
  const importState = guidanceImportState(existingClaude);
  if (!importState.exists) {
    const newline = existingClaude.includes("\r\n") ? "\r\n" : "\n";
    const closingFence = importState.openFence ? `${importState.openFence}${newline}${newline}` : "";
    writeFileSync(claudePath, appendSection(existingClaude, `${closingFence}@AGENTS.md${newline}`), "utf-8");
  }
}
