import { RAW_PARTS_CATALOG } from "@/lib/specs/files";
import { PICKABLE_CATEGORIES } from "./categories";

export { PICKABLE_CATEGORIES };

/**
 * Users pick only from the preloaded starter-kit catalog.
 * No photo-of-parts flow. No free-text parts.
 */
export const PARTS_POLICY = {
  source: "catalog" as const,
  photoIntake: false,
  freeText: false,
  targetCount: 49,
};

export type PartIntake = "catalog";

export function catalogPartIds(): string[] {
  const file = RAW_PARTS_CATALOG as { categories?: Record<string, string[]> };
  return Object.values(file.categories ?? {}).flat();
}

export function isCatalogPart(
  id: string,
  allowed?: ReadonlySet<string> | readonly string[],
): boolean {
  if (allowed) {
    const set = allowed instanceof Set ? allowed : new Set(allowed);
    return set.has(id);
  }
  return catalogPartIds().includes(id);
}

