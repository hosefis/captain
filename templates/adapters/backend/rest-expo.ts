import type { BackendClient } from "{corePackage}/backend/client";
import { createHttpClient } from "{corePackage}/backend/http-client";

export function createRestBackendClient(getToken?: () => Promise<string | null>): BackendClient {
  const baseUrl = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000/api";

  return createHttpClient({ baseUrl, getToken });
}
