import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

type CreateOperation = {
  kind: "create";
  path: string;
  content: string;
};

type UpdateOperation = {
  kind: "update";
  path: string;
  content: string;
  expectedContent?: string;
};

type DeleteOperation = {
  kind: "delete";
  path: string;
  expectedContent?: string;
};

export type CommandOperation = {
  kind: "command" | "install";
  id: string;
  command: string;
  args: string[];
  cwd?: string;
};

export type Operation =
  | CreateOperation
  | UpdateOperation
  | DeleteOperation
  | CommandOperation;

export type OperationPlan = {
  root: string;
  operations: Operation[];
};

export type OperationCollision = {
  path: string;
  reason: "already-exists" | "missing" | "content-changed";
};

export type OperationPreflight = {
  ok: boolean;
  collisions: OperationCollision[];
};

export type OperationRunner = (
  operation: CommandOperation,
  cwd: string,
) => Promise<{ exitCode: number; stderr?: string }>;

function isCommandOperation(operation: Operation): operation is CommandOperation {
  return operation.kind === "command" || operation.kind === "install";
}

function resolveTarget(root: string, path: string): string {
  if (isAbsolute(path)) {
    throw new Error(`Operation path must be relative: ${path}`);
  }

  const absoluteRoot = resolve(root);
  const target = resolve(absoluteRoot, path);
  const fromRoot = relative(absoluteRoot, target);
  if (fromRoot === ".." || fromRoot.startsWith(`..\\`) || fromRoot.startsWith("../")) {
    throw new Error(`Operation path is outside operation root: ${path}`);
  }
  return target;
}

function existingContent(target: string): string | null {
  return existsSync(target) ? readFileSync(target, "utf8") : null;
}

export function preflightOperationPlan(
  plan: OperationPlan,
  options: { force?: boolean } = {},
): OperationPreflight {
  const collisions: OperationCollision[] = [];

  for (const operation of plan.operations) {
    if (isCommandOperation(operation)) {
      continue;
    }

    const target = resolveTarget(plan.root, operation.path);
    const current = existingContent(target);
    if (operation.kind === "create") {
      if (current !== null && current !== operation.content) {
        collisions.push({ path: operation.path, reason: "already-exists" });
      }
      continue;
    }

    if (current === null) {
      if (operation.kind === "update") {
        collisions.push({ path: operation.path, reason: "missing" });
      }
      continue;
    }

    if (operation.expectedContent === undefined || current !== operation.expectedContent) {
      collisions.push({ path: operation.path, reason: "content-changed" });
    }
  }

  return {
    ok: options.force === true || collisions.length === 0,
    collisions: options.force === true ? [] : collisions,
  };
}

export async function applyOperationPlan(
  plan: OperationPlan,
  options: { force?: boolean; runner?: OperationRunner } = {},
): Promise<{ applied: string[] }> {
  const preflight = preflightOperationPlan(plan, options);
  if (!preflight.ok) {
    const paths = preflight.collisions.map((collision) => collision.path).join(", ");
    throw new Error(`Operation plan has unsafe collisions: ${paths}`);
  }

  const applied: string[] = [];
  for (const operation of plan.operations) {
    if (isCommandOperation(operation)) {
      if (!options.runner) {
        throw new Error(`Operation runner is required for "${operation.id}"`);
      }
      const cwd = operation.cwd
        ? resolveTarget(plan.root, operation.cwd)
        : resolve(plan.root);
      const result = await options.runner(operation, cwd);
      if (result.exitCode !== 0) {
        throw new Error(
          `Operation "${operation.id}" failed (exit ${result.exitCode}): ${result.stderr ?? ""}`,
        );
      }
      applied.push(operation.id);
      continue;
    }

    const target = resolveTarget(plan.root, operation.path);
    if (operation.kind === "delete") {
      if (existsSync(target)) {
        rmSync(target);
      }
    } else {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, operation.content, "utf8");
    }
    applied.push(operation.path);
  }

  return { applied };
}
