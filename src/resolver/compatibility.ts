import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  Auth,
  Backend,
  NormalizedProjectConfig,
  PaymentProcessor,
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
  paymentProcessor?: PaymentProcessor;
  orchestration?: string;
  multipleGlobalMor?: boolean;
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

type PaymentProcessorBlockRule = {
  id: string;
  paymentProcessor: PaymentProcessor | "scaffold";
  unlessAuth?: Auth;
  message: string;
};

export type CompatibilityMatrix = {
  version: number;
  agentMode: { softWarn: "upgrade-to-block" };
  humanMode: { softWarn: "confirm-prompt" };
  hardBlocks: HardBlockRule[];
  softWarns: SoftWarnRule[];
  recipeBlocks: RecipeBlockRule[];
  payment: {
    implementedProcessors: PaymentProcessor[];
    scaffoldProcessors: PaymentProcessor[];
    globalMorProcessors: PaymentProcessor[];
    allowedCombos: Array<{
      id: string;
      auth?: Auth;
      backend?: Backend;
      paymentProcessor?: PaymentProcessor;
      message: string;
    }>;
    processorBlocks: PaymentProcessorBlockRule[];
  };
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
  if (rule.multipleGlobalMor) {
    const globalMor = config.payment.processors.filter((processor) =>
      ["stripe", "lemon-squeezy", "polar", "paddle", "clerk-billing"].includes(processor),
    );
    return globalMor.length > 1;
  }

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

  if (rule.paymentProcessor !== undefined) {
    if (!config.payment.processors.includes(rule.paymentProcessor)) {
      return false;
    }
    if (rule.stack === "expo" && !config.stacks.hasMobile) {
      return false;
    }
  }

  if (
    rule.orchestration !== undefined &&
    config.payment.orchestration !== rule.orchestration
  ) {
    return false;
  }

  if (rule.stack === undefined && rule.paymentProcessor === undefined && !rule.multipleGlobalMor) {
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

function resolvePaymentProcessors(config: NormalizedProjectConfig): PaymentProcessor[] {
  const processors = [...config.payment.processors];
  if (
    config.payment.enabled &&
    processors.includes("stripe") &&
    config.auth === "clerk" &&
    !processors.includes("clerk-billing")
  ) {
    processors.push("clerk-billing");
  }
  return processors;
}

function evaluatePaymentBlocks(
  config: NormalizedProjectConfig,
  matrix: CompatibilityMatrix,
): CompatibilityIssue[] {
  if (!config.payment.enabled && !config.modules.includes("payment")) {
    return [];
  }

  const blocks: CompatibilityIssue[] = [];
  const processors = resolvePaymentProcessors(config);

  for (const processor of processors) {
    if (matrix.payment.scaffoldProcessors.includes(processor)) {
      blocks.push({
        id: `payment:scaffold:${processor}`,
        severity: "block",
        message: `Payment processor "${processor}" is scaffold-only in v1.`,
        hint: "Disable payment or choose clerk-billing, custom-api, fedapay, or paystack.",
      });
    }

    if (
      !matrix.payment.implementedProcessors.includes(processor) &&
      processor !== "stripe"
    ) {
      blocks.push({
        id: `payment:unimplemented:${processor}`,
        severity: "block",
        message: `Payment processor "${processor}" is not implemented in v1.`,
      });
    }
  }

  for (const rule of matrix.payment.processorBlocks) {
    if (rule.paymentProcessor === "scaffold") {
      continue;
    }

    if (!processors.includes(rule.paymentProcessor)) {
      continue;
    }

    if (rule.unlessAuth !== undefined && config.auth === rule.unlessAuth) {
      continue;
    }

    blocks.push({
      id: rule.id,
      severity: "block",
      message: rule.message,
    });
  }

  return blocks;
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

  blocks.push(...evaluatePaymentBlocks(config, matrix));

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
