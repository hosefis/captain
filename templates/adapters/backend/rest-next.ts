import type { BackendClient } from "{corePackage}/backend/client";
import { createHttpClient } from "{corePackage}/backend/http-client";

/** Create an authenticated REST client using the Next.js backend URL. */
export function createRestBackendClient(getToken?: () => Promise<string | null>): BackendClient {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api";

  return createHttpClient({ baseUrl, getToken });
}
