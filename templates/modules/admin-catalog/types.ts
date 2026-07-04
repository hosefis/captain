export type CatalogColumnType = "string" | "number" | "boolean" | "date";

export type CatalogColumnDef = {
  key: string;
  labelKey: string;
  type: CatalogColumnType;
};

export type AdminCatalogConfig = {
  apiPath: string;
  tag: string;
  fields: Record<string, CatalogColumnType>;
  columns: CatalogColumnDef[];
  i18nNamespace: string;
  flags?: { archive?: boolean; delete?: boolean };
};

export type CatalogListItem = Record<string, unknown> & { id: string };

export type AdminCatalogDriver = {
  list(): Promise<CatalogListItem[]>;
  create(input: Record<string, unknown>): Promise<CatalogListItem>;
  update(id: string, input: Record<string, unknown>): Promise<CatalogListItem>;
  archive?(id: string): Promise<void>;
  restore?(id: string): Promise<void>;
  remove?(id: string): Promise<void>;
};
