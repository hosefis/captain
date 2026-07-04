export type { BackendClient, BackendClientFactory, HttpMethod, HttpRequestOptions } from "./backend/client.js";
export { createHttpClient, type HttpClientConfig } from "./backend/http-client.js";

export type {
  AuthDecision,
  AuthorizationAction,
  AuthorizationAdapter,
  AuthorizationClaims,
} from "./authorization/types.js";
export { authorize } from "./authorization/authorize.js";
export { createInMemoryAuthorizationAdapter } from "./authorization/in-memory.js";

export const CAPTAIN_CORE_VERSION = "0.1.0";
