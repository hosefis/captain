import type { AdminCatalogConfig } from "{corePackage}";

export const {resourcePascal}CatalogConfig: AdminCatalogConfig = {
  apiPath: "{apiPath}",
  tag: "{resourceSlug}",
  fields: {
{fieldEntries}
  },
  columns: [
{columnsEntries}
  ],
  i18nNamespace: "{i18nNamespace}",
  flags: { archive: {archiveFlag}, delete: false },
};
