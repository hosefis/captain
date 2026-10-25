export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type HttpRequestOptions = {
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: unknown;
  token?: string;
};

export type BackendClient = {
  /** Send a backend request and decode its response. */
  request<T>(path: string, options?: HttpRequestOptions): Promise<T>;
};

/** Create a backend client for the current application context. */
export type BackendClientFactory = () => BackendClient;
