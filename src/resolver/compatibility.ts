import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  Auth,
  Backend,
  NormalizedProjectConfig,
} from "../schema/project-config.js";

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

export type StackKind = "next" | "expo" | "electron";

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
  backend?: Backend;
  auth?: Auth | "authjs";
  i18n?: string;
  ui?: string;
  module?: string;
  app?: string;
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

function findPackageRoot(startDir: string): string {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (existsSync(path.join(dir, "compatibility.json"))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  throw new Error("compatibility.json not found");
}

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

function activeStacks(config: NormalizedProjectConfig): StackKind[] {
  const stacks: StackKind[] = [];
  if (config.stacks.hasWeb) {
    stacks.push("next");
  }
  if (config.stacks.hasMobile) {
    stacks.push("expo");
  }
  if (config.stacks.hasDesktop) {
    stacks.push("electron");
  }
  return stacks;
}

function i18nForStack(
  config: NormalizedProjectConfig,
  stack: StackKind,
): string | undefined {
  if (stack === "next") {
    return config.i18n.web;
  }
  if (stack === "expo") {
    return config.i18n.mobile;
  }
  return config.i18n.web;
}

function matchesHardBlock(
  config: NormalizedProjectConfig,
  rule: HardBlockRule,
): boolean {
  if (!rule.stack) {
    return false;
  }

  const stacks = activeStacks(config);
  if (!stacks.includes(rule.stack)) {
    return false;
  }

  if (rule.i18n !== undefined && i18nForStack(config, rule.stack) !== rule.i18n) {
    return false;
  }

  if (rule.auth !== undefined && config.auth !== rule.auth) {
    return false;
  }

  if (rule.runtime !== undefined && config.runtime !== rule.runtime) {
    return false;
  }

  return true;
}

function matchesSoftWarn(
  config: NormalizedProjectConfig,
  rule: SoftWarnRule,
): boolean {
  if (rule.stack) {
    if (!activeStacks(config).includes(rule.stack)) {
      return false;
    }

    if (rule.i18n !== undefined && i18nForStack(config, rule.stack) !== rule.i18n) {
      return false;
    }

    if (rule.auth !== undefined && config.auth !== rule.auth) {
      return false;
    }

    if (rule.runtime !== undefined && config.runtime !== rule.runtime) {
      return false;
    }
  }

  if (rule.stack === undefined) {
    return false;
  }

  return true;
}

function matchesRecipeBlock(
  config: NormalizedProjectConfig,
  rule: RecipeBlockRule,
): boolean {
  if (rule.backend !== undefined && config.backend !== rule.backend) {
    return false;
  }

  if (rule.auth !== undefined && config.auth !== rule.auth) {
    return false;
  }

  if (rule.i18n !== undefined) {
    const values = [config.i18n.web, config.i18n.mobile].filter(Boolean);
    if (!values.includes(rule.i18n as typeof values[number])) {
      return false;
    }
  }

  if (rule.ui !== undefined) {
    const values = [config.ui.web, config.ui.mobile].filter(Boolean);
    if (!values.includes(rule.ui as typeof values[number])) {
      return false;
    }
  }

  if (rule.module !== undefined && !config.modules.includes(rule.module as never)) {
    return false;
  }

  if (rule.app !== undefined && !config.apps.includes(rule.app as never)) {
    return false;
  }

  return true;
}

export function resolveCompatibility(
  config: NormalizedProjectConfig,
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
    if (matchesHardBlock(config, rule)) {
      blocks.push({
        id: issueId("hard", rule.id, rule.message),
        severity: "block",
        message: rule.message,
      });
    }
  }

  for (const rule of matrix.recipeBlocks) {
    if (matchesRecipeBlock(config, rule)) {
      blocks.push({
        id: rule.id,
        severity: "block",
        message: rule.message,
      });
    }
  }

  for (const rule of matrix.softWarns) {
    if (matchesSoftWarn(config, rule)) {
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
