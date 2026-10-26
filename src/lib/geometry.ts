import { dim, type Breadboard, type Component, type Pin } from "./specs/schema";

export const PITCH = 2.54;

const HOLE = /^([a-j])(\d+)$/i;
const RAIL = /^(L\+|L-|R\+|R-)@(\d+)$/;

export type HoleRef =
  | { kind: "hole"; col: string; row: number }
  | { kind: "rail"; rail: "L+" | "L-" | "R+" | "R-"; row: number };

export function parseHole(id: string): HoleRef | null {
  const h = HOLE.exec(id);
  if (h) return { kind: "hole", col: h[1].toLowerCase(), row: Number(h[2]) };
  const r = RAIL.exec(id);
  if (r) {
    return {
      kind: "rail",
      rail: r[1] as HoleRef extends { rail: infer R } ? R : never,
      row: Number(r[2]),
    };
  }
  return null;
}

/** 50 rail holes in groups of 5, snapped to the nearest real hole. */
export function railHoleRows(totalRows = 63): number[] {
  const rows: number[] = [];
  let row = 2;
  for (let group = 0; group < 10; group++) {
    for (let i = 0; i < 5; i++) rows.push(row++);
    row += 1;
  }
  return rows.filter((r) => r <= totalRows);
}

export function snapRailRow(row: number, totalRows = 63): number {
  const holes = railHoleRows(totalRows);
  return holes.reduce((best, current) =>
    Math.abs(current - row) < Math.abs(best - row) ? current : best,
  );
}

export type Vec3 = [number, number, number];

/** World millimetres: +X along rows, +Y up, +Z along columns a→j. Origin at a1 on the top face. */
export function holeWorld(
  id: string,
  breadboard: Breadboard,
  surfaceY = 0,
): Vec3 {
  const parsed = parseHole(id);
  if (!parsed) return [0, surfaceY, 0];
  const pitch = breadboard.grid.pitch;
  const x = (parsed.row - 1) * pitch;
  if (parsed.kind === "hole") {
    const z = breadboard.grid.column_y_mm[parsed.col] ?? 0;
    return [x, surfaceY, z];
  }
  const rail = breadboard.rails.find((r) => r.id === parsed.rail);
  const snapped = snapRailRow(parsed.row, breadboard.grid.rows);
  const sx = (snapped - 1) * pitch;
  return [sx, surfaceY, dim(rail?.y_mm, 0)];
}

export function columnForY(y: number, breadboard: Breadboard): string {
  let best = breadboard.grid.columns[0];
  let bestD = Infinity;
  for (const col of breadboard.grid.columns) {
    const d = Math.abs(breadboard.grid.column_y_mm[col] - y);
    if (d < bestD) {
      bestD = d;
      best = col;
    }
  }
  return best;
}

export function adjacentFreeHole(pinHole: string): string {
  const parsed = parseHole(pinHole);
  if (!parsed || parsed.kind !== "hole") return pinHole;
  if ("abcde".includes(parsed.col)) return `a${parsed.row}`;
  return `j${parsed.row}`;
}

export function findPinByGpio(
  board: Component,
  gpio: number,
): Pin | undefined {
  return board.pins?.find((p) => p.gpio === gpio);
}

export function findPinByLabel(
  board: Component,
  label: string,
): Pin | undefined {
  return board.pins?.find((p) => p.label === label);
}

export function findGndPin(board: Component): Pin | undefined {
  return board.pins?.find(
    (p) =>
      p.label === "G" ||
      p.label === "GND" ||
      p.functions.includes("GND") ||
      p.id.endsWith(".GND"),
  );
}

export function headerSide(
  board: Component,
  pin: Pin,
): "left" | "right" {
  const header = board.headers?.[pin.header ?? 0];
  const y = pin.position.y;
  if (header?.id === "J3" || header?.id === "R") return "right";
  if (header?.id === "J1" || header?.id === "L") return "left";
  return y > 8 ? "right" : "left";
}

export function preferredSafeGpio(board: Component): number[] {
  const jtag = new Set([39, 40, 41, 42]);
  const safe = board.safe_gpio ?? [];
  return [...safe.filter((g) => !jtag.has(g)), ...safe.filter((g) => jtag.has(g))];
}

export function pinHasFunction(pin: Pin, fn: string): boolean {
  const needle = fn.toLowerCase();
  return (
    pin.functions.some((f) => f.toLowerCase().includes(needle)) ||
    (pin.alt_functions ?? []).some((f) => f.toLowerCase().includes(needle))
  );
}

export function wireColorHex(
  name: string,
  palette: { name: string; hex: string }[],
  power: Record<string, string>,
): string {
  const lower = name.toLowerCase();
  if (lower === "red") return power["5V"] ?? "#e53935";
  if (lower === "orange") return power["3V3"] ?? "#fb8c00";
  if (lower === "black") return power.GND ?? "#212121";
  const found = palette.find((p) => p.name === lower);
  return found?.hex ?? "#9e9e9e";
}

export function bezierWire(from: Vec3, to: Vec3, lift = 10): Vec3[] {
  const midX = (from[0] + to[0]) / 2;
  const midZ = (from[2] + to[2]) / 2;
  const peak = Math.max(from[1], to[1]) + lift;
  return [
    from,
    [from[0], peak * 0.55, from[2]],
    [midX, peak, midZ],
    [to[0], peak * 0.55, to[2]],
    to,
  ];
}

export type CameraPreset = {
  position: Vec3;
  lookAt: Vec3;
  fov?: number;
};

export function cameraFor(
  name: string,
  breadboard: Breadboard,
  callout?: string,
): CameraPreset {
  const length = dim(breadboard.body?.length_mm, 165);
  const width = dim(breadboard.body?.width_mm, 55);
  const center: Vec3 = [length / 2, 0, width / 2];
  const target = callout ? holeWorld(callout, breadboard, 4) : center;
  switch (name) {
    case "left-low":
      return { position: [-20, 40, -10], lookAt: target, fov: 32 };
    case "left":
      return { position: [-10, 70, -20], lookAt: target, fov: 34 };
    case "right":
      return { position: [length + 20, 70, width + 30], lookAt: target, fov: 34 };
    case "top-zoom-rows-30-35":
      return { position: [80, 55, 8], lookAt: [80, 0, 8], fov: 28 };
    case "hero":
      return { position: [-40, 110, -50], lookAt: center, fov: 36 };
    case "top":
    default:
      return { position: [center[0] - 10, 140, center[2] - 70], lookAt: center, fov: 32 };
  }
}
