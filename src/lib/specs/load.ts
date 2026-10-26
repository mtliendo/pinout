import { chipIdForBoard, loadChipSpecs, mergeChipSafety } from "@/lib/chips";
import {
  RAW_BUILDS,
  RAW_CHIPS,
  RAW_COMPONENTS,
  RAW_PARTS_CATALOG,
  RAW_PARTS_OVERLAY,
  RAW_WIRE_COLORS,
} from "./files";
import { validateCatalog, type Catalog } from "./validate";

let cached: Catalog | null = null;

export function loadCatalog(): Catalog {
  if (cached) return cached;
  const { catalog, issues } = validateCatalog({
    components: RAW_COMPONENTS,
    builds: RAW_BUILDS,
    wireColors: RAW_WIRE_COLORS,
    chips: RAW_CHIPS,
    partsCatalog: RAW_PARTS_CATALOG,
    partsOverlay: RAW_PARTS_OVERLAY,
  });
  if (!catalog) {
    throw new Error(
      `Spec catalog failed validation:\n${issues
        .map((i) => `${i.path}: ${i.message}`)
        .join("\n")}`,
    );
  }
  const chips = loadChipSpecs();
  for (const [id, component] of Object.entries(catalog.components)) {
    if (component.kind !== "board") continue;
    const chipId = chipIdForBoard(component);
    catalog.components[id] = mergeChipSafety(
      component,
      chipId ? chips[chipId] ?? null : null,
    );
  }
  for (const [id, block] of Object.entries(RAW_PARTS_OVERLAY)) {
    const comp = catalog.components[id];
    if (comp && !comp.part && block && typeof block === "object") {
      catalog.components[id] = {
        ...comp,
        part: block as NonNullable<(typeof comp)["part"]>,
      };
    }
  }
  cached = catalog;
  return catalog;
}

function catalogPartEntries(components: Catalog["components"]) {
  const catalog = RAW_PARTS_CATALOG as {
    categories?: Record<string, string[]>;
  };
  const ids = Object.values(catalog.categories ?? {}).flat();
  return ids
    .map((id) => components[id])
    .filter(Boolean)
    .filter((c) => c.kind !== "board")
    .map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      category: c.part?.category ?? "passive",
      approx_fields: c.part?.approx_fields ?? [],
    }));
}

export function catalogSummary() {
  const catalog = loadCatalog();
  return {
    boards: Object.values(catalog.components)
      .filter((c) => c.kind === "board")
      .map((c) => ({
        id: c.id,
        name: c.name,
        chip: c.chip,
        safe_gpio: c.safe_gpio ?? [],
        caution_gpio: c.caution_gpio ?? {},
        no_go_gpio: c.no_go_gpio ?? {},
        five_v_logic: Boolean(c.logic?.five_v_logic),
        fits_830: c.breadboard_fit?.fits_830 ?? true,
        off_board: Boolean(c.breadboard_fit?.off_board),
        breadboard_fit: c.breadboard_fit,
        logic: c.logic,
        defaults: c.defaults,
        body: c.body,
        colors: c.colors,
        headers: c.headers,
        pins: c.pins,
        features: c.features,
        kind: c.kind,
      })),
    partsCatalog: RAW_PARTS_CATALOG,
    parts: catalogPartEntries(catalog.components),
    breadboard: {
      id: catalog.breadboard.id,
      name: catalog.breadboard.name,
    },
    referenceBuildId: "pir-servo-s3",
  };
}
