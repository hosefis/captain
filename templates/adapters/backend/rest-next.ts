export type { BackendClient, HttpRequestOptions } from "{corePackage}";
export { createHttpClient } from "{corePackage}";

import type { BackendClient } from "{corePackage}";
import { createHttpClient } from "{corePackage}";

export function createRestBackendClient(getToken?: () => Promise<string | null>): BackendClient {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api";

  return createHttpClient({ baseUrl, getToken });
}
