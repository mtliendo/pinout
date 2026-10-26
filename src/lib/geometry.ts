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

/**
 * 3/4 isometric of the whole assembly (breadboard + MCU + off-board parts)
 * with a slight look-at bias toward the step. Never a tight crop.
 */
export function cameraFor(
  name: string,
  breadboard: Breadboard,
  callout?: string,
): CameraPreset {
  void callout;
  const length = dim(breadboard.body?.length_mm, 165);
  const width = dim(breadboard.body?.width_mm, 55);
  const min: Vec3 = [-36, 0, -18];
  const max: Vec3 = [length + 36, 26, width + 32];
  const mid: Vec3 = [
    (min[0] + max[0]) / 2,
    9,
    (min[2] + max[2]) / 2,
  ];
  const bias: Vec3 =
    name === "left" || name === "left-low"
      ? [-16, 0, -4]
      : name === "right"
        ? [20, 0, 6]
        : name === "top-zoom-rows-30-35"
          ? [16, 0, 0]
          : [0, 0, 0];
  const lookAt: Vec3 = [mid[0] + bias[0], mid[1], mid[2] + bias[2]];
  const radius =
    Math.hypot(max[0] - min[0], max[2] - min[2]) / 2;
  const dist = radius * 2.15;
  const dir: Vec3 = [-0.62, 0.58, -0.53];
  const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  const position: Vec3 = [
    lookAt[0] + (dir[0] / len) * dist,
    lookAt[1] + (dir[1] / len) * dist,
    lookAt[2] + (dir[2] / len) * dist,
  ];
  return { position, lookAt, fov: 30 };
}

export function previewOrbit(t: number, breadboard: Breadboard): CameraPreset {
  const base = cameraFor("hero", breadboard);
  const look = base.lookAt;
  const radius = Math.hypot(
    base.position[0] - look[0],
    base.position[2] - look[2],
  );
  const angle = t * 0.22;
  return {
    position: [
      look[0] + Math.sin(angle) * radius,
      base.position[1],
      look[2] + Math.cos(angle) * radius,
    ],
    lookAt: look,
    fov: 30,
  };
}
