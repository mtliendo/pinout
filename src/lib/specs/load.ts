import { RAW_BUILDS, RAW_COMPONENTS, RAW_WIRE_COLORS } from "./files";
import { validateCatalog, type Catalog } from "./validate";

let cached: Catalog | null = null;

export function loadCatalog(): Catalog {
  if (cached) return cached;
  const { catalog, issues } = validateCatalog({
    components: RAW_COMPONENTS,
    builds: RAW_BUILDS,
    wireColors: RAW_WIRE_COLORS,
  });
  if (!catalog) {
    throw new Error(
      `Spec catalog failed validation:\n${issues
        .map((i) => `${i.path}: ${i.message}`)
        .join("\n")}`,
    );
  }
  cached = catalog;
  return catalog;
}

export function catalogSummary() {
  const catalog = loadCatalog();
  return {
    boards: Object.values(catalog.components)
      .filter((c) => c.kind === "board")
      .map((c) => ({
        id: c.id,
        name: c.name,
        safe_gpio: c.safe_gpio ?? [],
        caution_gpio: c.caution_gpio ?? {},
        no_go_gpio: c.no_go_gpio ?? {},
      })),
    parts: Object.values(catalog.components)
      .filter((c) => c.kind !== "board" && c.kind !== "breadboard")
      .map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
      })),
    breadboard: {
      id: catalog.breadboard.id,
      name: catalog.breadboard.name,
    },
    referenceBuildId: "pir-servo-s3",
  };
}
