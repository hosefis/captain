import type { CatalogListItem } from "{corePackage}";

export async function list{resourcePascal}(request: Request): Promise<Response> {
  void request;
  const items: CatalogListItem[] = [];
  return Response.json(items);
}

export async function create{resourcePascal}(request: Request): Promise<Response> {
  const body = (await request.json()) as Record<string, unknown>;
  return Response.json({ id: crypto.randomUUID(), ...body });
}

export async function update{resourcePascal}(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const body = (await request.json()) as Record<string, unknown>;
  return Response.json({ id, ...body });
}

{archiveHandlers}
