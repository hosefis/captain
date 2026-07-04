import type { AdminCatalogConfig, AdminCatalogDriver, CatalogListItem } from "./types.js";

export type { AdminCatalogConfig, AdminCatalogDriver, CatalogColumnDef, CatalogListItem } from "./types.js";

export function createAdminCatalogDriver(config: AdminCatalogConfig): AdminCatalogDriver {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? process.env.API_BASE_URL ?? "";

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`AdminCatalog ${method} ${path} failed (${response.status})`);
    }

    return (await response.json()) as T;
  }

  return {
    list: () => request<CatalogListItem[]>("GET", config.apiPath),
    create: (input) => request<CatalogListItem>("POST", config.apiPath, input),
    update: (id, input) => request<CatalogListItem>("PATCH", `${config.apiPath}/${id}`, input),
    archive: config.flags?.archive
      ? (id) => request<void>("POST", `${config.apiPath}/${id}/archive`)
      : undefined,
    restore: config.flags?.archive
      ? (id) => request<void>("POST", `${config.apiPath}/${id}/restore`)
      : undefined,
    remove: config.flags?.delete
      ? (id) => request<void>("DELETE", `${config.apiPath}/${id}`)
      : undefined,
  };
}
