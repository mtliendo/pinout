import { loadCatalog } from "@/lib/specs/load";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const catalog = loadCatalog();
  const build = catalog.builds[id];
  if (!build) {
    return Response.json({ error: "Build not found" }, { status: 404 });
  }
  const used = new Set(build.parts.map((p) => p.component));
  used.add("breadboard-830");
  used.add(build.board);
  const components = Object.fromEntries(
    Object.entries(catalog.components).filter(([key]) => used.has(key)),
  );
  return Response.json({
    build,
    components,
    breadboard: catalog.breadboard,
    wireColors: catalog.wireColors,
  });
}
