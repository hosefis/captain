import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NormalizedProjectConfig } from "../schema/project-config.js";

export type CompatibilityMode = "agent" | "human";

export type CompatibilityIssue = {
  id: string;
  severity: "block" | "warn";
  message: string;
  hint?: string;
};

export type CompatibilityResult = {
  ok: boolean;
  blocks: CompatibilityIssue[];
  warns: CompatibilityIssue[];
};

export type StackKind = "next" | "expo";

type HardBlockRule = {
  id?: string;
  stack?: StackKind;
  i18n?: string;
  auth?: string;
  runtime?: string;
  message: string;
};

type SoftWarnRule = {
  id: string;
  stack?: StackKind;
  i18n?: string;
  auth?: string;
  runtime?: string;
  humanOnly?: boolean;
  message: string;
};

type RecipeBlockRule = {
  id: string;
  backend?: string;
  auth?: string;
  i18n?: string;
  ui?: string;
  message: string;
};

export type CompatibilityMatrix = {
  version: number;
  agentMode: { softWarn: "upgrade-to-block" };
  humanMode: { softWarn: "confirm-prompt" };
  hardBlocks: HardBlockRule[];
  softWarns: SoftWarnRule[];
  recipeBlocks: RecipeBlockRule[];
};

function findPackageRoot(startDirectory: string): string {
  let directory = startDirectory;
  while (directory !== path.dirname(directory)) {
    if (existsSync(path.join(directory, "compatibility.json"))) {
      return directory;
    }
    directory = path.dirname(directory);
  }
  throw new Error("compatibility.json not found");
}

/** Load supported stack constraints from the bundled or supplied compatibility matrix. */
export function loadCompatibilityMatrix(
  matrixPath?: string,
): CompatibilityMatrix {
  const resolvedPath =
    matrixPath ??
    path.join(findPackageRoot(path.dirname(fileURLToPath(import.meta.url))), "compatibility.json");
  const raw = readFileSync(resolvedPath, "utf-8");
  return JSON.parse(raw) as CompatibilityMatrix;
}

function issueId(prefix: string, id: string | undefined, fallback: string): string {
  return id ?? `${prefix}:${fallback}`;
}

function activeStacks(configuration: NormalizedProjectConfig): StackKind[] {
  const stacks: StackKind[] = [];
  if (configuration.stacks.hasWeb) {
    stacks.push("next");
  }
  if (configuration.stacks.hasMobile) {
    stacks.push("expo");
  }
  return stacks;
}

function i18nForStack(
  configuration: NormalizedProjectConfig,
  stack: StackKind,
): string | undefined {
  if (stack === "next") {
    return configuration.i18n.web;
  }
  if (stack === "expo") {
    return configuration.i18n.mobile;
  }
  return configuration.i18n.web;
}

function matchesHardBlock(
  configuration: NormalizedProjectConfig,
  rule: HardBlockRule,
): boolean {
  if (!rule.stack) {
    return false;
  }

  const stacks = activeStacks(configuration);
  if (!stacks.includes(rule.stack)) {
    return false;
  }

  if (rule.i18n !== undefined && i18nForStack(configuration, rule.stack) !== rule.i18n) {
    return false;
  }

  if (rule.auth !== undefined && configuration.auth !== rule.auth) {
    return false;
  }

  if (rule.runtime !== undefined && configuration.runtime !== rule.runtime) {
    return false;
  }

  return true;
}

function matchesSoftWarn(
  configuration: NormalizedProjectConfig,
  rule: SoftWarnRule,
): boolean {
  if (rule.stack) {
    if (!activeStacks(configuration).includes(rule.stack)) {
      return false;
    }

    if (rule.i18n !== undefined && i18nForStack(configuration, rule.stack) !== rule.i18n) {
      return false;
    }

    if (rule.auth !== undefined && configuration.auth !== rule.auth) {
      return false;
    }

    if (rule.runtime !== undefined && configuration.runtime !== rule.runtime) {
      return false;
    }
  }

  if (rule.stack === undefined) {
    return false;
  }

  return true;
}

function matchesRecipeBlock(
  configuration: NormalizedProjectConfig,
  rule: RecipeBlockRule,
): boolean {
  if (rule.backend !== undefined && configuration.backend !== rule.backend) {
    return false;
  }

  if (rule.auth !== undefined && configuration.auth !== rule.auth) {
    return false;
  }

  if (rule.i18n !== undefined) {
    const values = [configuration.i18n.web, configuration.i18n.mobile].filter(Boolean);
    if (!values.includes(rule.i18n as typeof values[number])) {
      return false;
    }
  }

  if (rule.ui !== undefined) {
    const values = [configuration.ui.web, configuration.ui.mobile].filter(Boolean);
    if (!values.includes(rule.ui as typeof values[number])) {
      return false;
    }
  }

  return true;
}

/** Classify stack constraints as warnings or blocks for human and agent execution. */
export function resolveCompatibility(
  configuration: NormalizedProjectConfig,
  options: {
    mode?: CompatibilityMode;
    matrix?: CompatibilityMatrix;
  } = {},
): CompatibilityResult {
  const mode = options.mode ?? "human";
  const matrix = options.matrix ?? loadCompatibilityMatrix();

  const blocks: CompatibilityIssue[] = [];
  const warns: CompatibilityIssue[] = [];

  for (const rule of matrix.hardBlocks) {
    if (matchesHardBlock(configuration, rule)) {
      blocks.push({
        id: issueId("hard", rule.id, rule.message),
        severity: "block",
        message: rule.message,
      });
    }
  }

  for (const rule of matrix.recipeBlocks) {
    if (matchesRecipeBlock(configuration, rule)) {
      blocks.push({
        id: rule.id,
        severity: "block",
        message: rule.message,
      });
    }
  }

  for (const rule of matrix.softWarns) {
    if (matchesSoftWarn(configuration, rule)) {
      warns.push({
        id: rule.id,
        severity: "warn",
        message: rule.message,
      });
    }
  }

  const agentWarnBlocks = warns
    .filter((warn) => {
      const rule = matrix.softWarns.find((entry) => entry.id === warn.id);
      return rule?.humanOnly !== true;
    })
    .map((warn) => ({ ...warn, severity: "block" as const }));

  const effectiveBlocks = mode === "agent" ? [...blocks, ...agentWarnBlocks] : blocks;

  const effectiveWarns = mode === "agent" ? [] : warns;

  return {
    ok: effectiveBlocks.length === 0,
    blocks: effectiveBlocks,
    warns: effectiveWarns,
  };
}

/** Format compatibility decisions and corrective hints for terminal output. */
export function formatCompatibilityResult(result: CompatibilityResult): string {
  const lines: string[] = [];

  for (const block of result.blocks) {
    lines.push(`[block] ${block.message}`);
    if (block.hint) {
      lines.push(`  hint: ${block.hint}`);
    }
  }

  for (const warn of result.warns) {
    lines.push(`[warn] ${warn.message}`);
    if (warn.hint) {
      lines.push(`  hint: ${warn.hint}`);
    }
  }

  if (lines.length === 0) {
    return "Compatibility check passed.";
  }

  return lines.join("\n");
}
