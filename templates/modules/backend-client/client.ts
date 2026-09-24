export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type HttpRequestOptions = {
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: unknown;
  token?: string;
};

export type BackendClient = {
  request<T>(path: string, options?: HttpRequestOptions): Promise<T>;
};

export type BackendClientFactory = () => BackendClient;
