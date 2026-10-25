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

function visibleProse(
  contents: string,
  start: number,
  end: number,
  openComment: boolean,
): { prose: string; openComment: boolean; inlineEndOffset: number } {
  let prose = "";
  let position = start;
  const tokens = /(`+)[^]*?\1|<!--/g;
  while (position < end) {
    if (openComment) {
      const commentEndOffset = contents.indexOf("-->", position);
      if (commentEndOffset < 0 || commentEndOffset >= end) return { prose, openComment, inlineEndOffset: 0 };
      position = commentEndOffset + 3;
      openComment = false;
      continue;
    }
    tokens.lastIndex = position;
    const token = tokens.exec(contents);
    if (!token || token.index >= end) break;
    prose += contents.slice(position, token.index);
    openComment = token[0] === "<!--";
    position = token.index + token[0].length;
  }
  if (!openComment && position < end) prose += contents.slice(position, end);
  return { prose, openComment, inlineEndOffset: position > end ? position : 0 };
}

function guidanceImportState(contents: string): { exists: boolean; literalClosing?: string } {
  const lines: string[] = [];
  let fence: string | undefined;
  let openComment = false;
  let indentedCodeAllowed = true;
  let inlineEndOffset = 0;
  for (const originalLine of contents.matchAll(/[^\n]*(?:\n|$)/g)) {
    const line = originalLine[0].replace(/\r?\n$/, "");
    const start = Math.max(originalLine.index, inlineEndOffset);
    const end = originalLine.index + line.length;
    if (inlineEndOffset > 0 && start >= end) continue;
    const match = !openComment && start === originalLine.index ? line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/) : null;
    const marker = match?.[1];
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length && !match?.[2]?.trim()) fence = undefined;
      indentedCodeAllowed = true;
      continue;
    }
    if (marker) {
      fence = marker;
      continue;
    }
    if (!openComment && indentedCodeAllowed && /^(?: {4}| {0,3}\t)/.test(line)) {
      continue;
    }
    const visible = visibleProse(contents, start, end, openComment);
    openComment = visible.openComment;
    inlineEndOffset = visible.inlineEndOffset;
    lines.push(visible.prose);
    indentedCodeAllowed = !visible.prose.trim() || /^ {0,3}(?:#{1,6}(?:\s|$)|(?:[-*_]\s*){3,}$|[=-]+\s*$)/.test(visible.prose);
  }
  const prose = lines.join("\n")
    .replace(/(^|[\s(])(?:"[^"\r\n]*"|'[^'\r\n]*')/gm, "$1");
  return {
    exists: /(?:^|[\s(])@(?:\.\/)?AGENTS\.md(?=$|[\s),;:!?])/m.test(prose),
    literalClosing: fence ?? (openComment ? "-->" : undefined),
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
    const literalClosing = importState.literalClosing ? `${importState.literalClosing}${newline}${newline}` : "";
    writeFileSync(claudePath, appendSection(existingClaude, `${literalClosing}@AGENTS.md${newline}`), "utf-8");
  }
}
