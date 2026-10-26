/** Catalog groups shown in the picker. Breadboard and wire stay off the list. */
export const PICKABLE_CATEGORIES = [
  "sensor",
  "display",
  "actuator",
  "input",
  "passive",
  "power",
] as const;

export type PickableCategory = (typeof PICKABLE_CATEGORIES)[number];
