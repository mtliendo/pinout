/**
 * Users pick only from the preloaded starter-kit catalog (~40 parts, incoming).
 * No photo-of-parts flow. No free-text parts.
 */
export const PARTS_POLICY = {
  source: "catalog" as const,
  photoIntake: false,
  freeText: false,
  targetCount: 40,
};

export type PartIntake = "catalog";

export function isCatalogPart(
  id: string,
  allowed: ReadonlySet<string> | readonly string[],
): boolean {
  const set = allowed instanceof Set ? allowed : new Set(allowed);
  return set.has(id);
}
