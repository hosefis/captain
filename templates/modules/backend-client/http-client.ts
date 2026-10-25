import type { BackendClient, HttpRequestOptions } from "./client.js";

export type HttpClientConfig = {
  baseUrl: string;
  /** Retrieve the current session token for authenticated requests. */
  getToken?: () => Promise<string | null>;
};

/** Create a JSON HTTP client with optional session authentication. */
export function createHttpClient(config: HttpClientConfig): BackendClient {
  return {
    /** Send an authenticated JSON request and reject unsuccessful responses. */
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
