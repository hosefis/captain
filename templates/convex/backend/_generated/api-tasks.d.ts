/* eslint-disable */
// Preseeded by CAPTAIN. `convex dev` replaces this with Convex-generated code.
import type * as tasks from "../tasks.js";
import type { ApiFromModules, FilterApi, FunctionReference } from "convex/server";

declare const fullApi: ApiFromModules<{ tasks: typeof tasks }>;
export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;
export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">>;
