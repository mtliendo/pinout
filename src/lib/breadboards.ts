import type { Breadboard } from "@/lib/specs/schema";

export type BreadboardSizeId = "mini-170" | "half-400" | "full-830" | "custom";

export type BreadboardSize = {
  id: BreadboardSizeId;
  label: string;
  rows: number;
  columns: number;
  ties: number;
};

export const BREADBOARD_PRESETS: BreadboardSize[] = [
  { id: "mini-170", label: "Mini 170", rows: 17, columns: 10, ties: 170 },
  { id: "half-400", label: "Half 400", rows: 30, columns: 10, ties: 400 },
  { id: "full-830", label: "Full 830", rows: 63, columns: 10, ties: 830 },
];

const COLS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"] as const;

export function sizeFromSliders(rows: number, columns = 10): BreadboardSize {
  const r = Math.max(10, Math.min(63, Math.round(rows)));
  const c = 10;
  const preset = BREADBOARD_PRESETS.find((p) => p.rows === r && p.columns === c);
  return (
    preset ?? {
      id: "custom",
      label: `${r} × ${c}`,
      rows: r,
      columns: c,
      ties: r * c,
    }
  );
}

export function breadboardForSize(
  template: Breadboard,
  size: BreadboardSize,
): Breadboard {
  const pitch = template.grid.pitch;
  const cols = COLS.slice(0, size.columns);
  const column_y_mm = { ...template.grid.column_y_mm };
  return {
    ...template,
    id: `breadboard-${size.id}`,
    name: `${size.label} solderless breadboard`,
    body: {
      ...template.body,
      length_mm: (size.rows - 1) * pitch + 8,
      width_mm: 54.6,
    },
    grid: {
      ...template.grid,
      rows: size.rows,
      columns: [...cols],
      column_y_mm,
    },
  };
}

export function inferBreadboardSize(
  answers: Record<string, string | string[]>,
): BreadboardSize {
  const values = Object.values(answers).flat();
  for (const value of values) {
    const preset = BREADBOARD_PRESETS.find(
      (p) => p.id === value || value === `breadboard-${p.id}`,
    );
    if (preset) return preset;
    const custom = String(value).match(/^rows:(\d+)$/);
    if (custom) return sizeFromSliders(Number(custom[1]));
  }
  return BREADBOARD_PRESETS[2];
}
