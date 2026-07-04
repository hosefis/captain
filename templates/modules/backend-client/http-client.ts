import type { BackendClient, HttpRequestOptions } from "./client.js";

export type HttpClientConfig = {
  baseUrl: string;
  getToken?: () => Promise<string | null>;
};

export function createHttpClient(config: HttpClientConfig): BackendClient {
  return {
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
