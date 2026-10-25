import type { BackendClient, HttpRequestOptions } from "./client.js";

/** Backend base URL and optional asynchronous token provider. */
export type HttpClientConfig = {
  baseUrl: string;
  /** Resolves the authentication token for a request when no override is supplied. */
  getToken?: () => Promise<string | null>;
};

/** Creates an authenticated JSON client for the configured backend URL. */
export function createHttpClient(config: HttpClientConfig): BackendClient {
  return {
    /** Sends an authenticated JSON request and rejects unsuccessful responses. */
    async request<T>(path: string, options: HttpRequestOptions = {}): Promise<T> {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...options.headers,
      };

      const token = options.token ?? (config.getToken ? await config.getToken() : null);
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(`${config.baseUrl}${path}`, {
        method: options.method ?? "GET",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${path}`);
      }

      return (await response.json()) as T;
    },
  };
}
