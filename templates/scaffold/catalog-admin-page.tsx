import { {resourcePascal}CatalogConfig } from "{corePackage}/admin-catalog/resources/{resourceSlug}.js";

export default function {resourcePascal}AdminPage() {
  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="text-2xl font-semibold">{resourceTitle} admin</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        API: {`{apiPath}`} · i18n: {`{i18nNamespace}`}
      </p>
      <pre className="mt-6 overflow-auto rounded-md bg-muted p-4 text-xs">
        {JSON.stringify({resourcePascal}CatalogConfig, null, 2)}
      </pre>
    </main>
  );
}
