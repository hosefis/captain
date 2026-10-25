/** HTTP methods supported by the backend client. */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Request payload, headers, and authentication overrides for a backend call. */
export type HttpRequestOptions = {
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: unknown;
  token?: string;
};

/** Typed request interface for application backend access. */
export type BackendClient = {
  /** Sends a backend request and decodes its JSON response. */
  request<T>(path: string, options?: HttpRequestOptions): Promise<T>;
};

/** Creates a backend client for the current application context. */
export type BackendClientFactory = () => BackendClient;
