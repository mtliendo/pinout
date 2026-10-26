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

const FIVE_LABELS = new Set(["5V", "+5V", "VBUS"]);
const THREE_LABELS = new Set(["3V3", "3.3V", "3V3(OUT)"]);
const GND_LABELS = new Set(["G", "GND", "AGND"]);

export function normalizePinLabel(label: string): string {
  return label.trim().toUpperCase();
}

export function isFiveVoltLabel(label: string): boolean {
  return FIVE_LABELS.has(normalizePinLabel(label));
}

export function isThreeVoltLabel(label: string): boolean {
  return THREE_LABELS.has(normalizePinLabel(label));
}

export function isGndLabel(label: string): boolean {
  return GND_LABELS.has(normalizePinLabel(label));
}

export function findPinByLabel(
  board: Component,
  label: string,
): Pin | undefined {
  const want = normalizePinLabel(label);
  const aliases =
    want === "5V"
      ? FIVE_LABELS
      : want === "3V3" || want === "3.3V"
        ? THREE_LABELS
        : want === "G" || want === "GND"
          ? GND_LABELS
          : new Set([want]);
  return board.pins?.find((p) => aliases.has(normalizePinLabel(p.label)));
}

export function findGndPin(board: Component): Pin | undefined {
  return board.pins?.find(
    (p) =>
      isGndLabel(p.label) ||
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
  const id = header?.id ?? "";
  if (/^(J3|R|JP2|JDIGITAL)$/i.test(id)) return "right";
  if (/^(J1|J2|L|JP1|JANALOG)$/i.test(id)) return "left";
  return y > 8 ? "right" : "left";
}

export function uartGpios(board: Component): number[] {
  const uart = board.defaults?.uart0 as
    | { tx?: number; rx?: number }
    | undefined;
  return [uart?.tx, uart?.rx].filter((n): n is number => typeof n === "number");
}

export function preferredSafeGpio(board: Component): number[] {
  const jtag = new Set([39, 40, 41, 42]);
  const caution = new Set(
    Object.keys(board.caution_gpio ?? {}).map((k) => Number(k)),
  );
  const noGo = new Set(Object.keys(board.no_go_gpio ?? {}).map((k) => Number(k)));
  const uart = new Set(uartGpios(board));
  const listed = new Set(board.safe_gpio ?? []);
  const safe = [...listed].filter((gpio) => {
    if (caution.has(gpio) || noGo.has(gpio)) return false;
    const pin = findPinByGpio(board, gpio);
    if (!pin) return false;
    const flags = pin.flags ?? {};
    if (flags.strapping || flags.usb || flags.psram_flash_reserved) return false;
    return true;
  });
  const rest = safe.filter((g) => !jtag.has(g));
  return [
    ...rest.filter((g) => !uart.has(g)),
    ...rest.filter((g) => uart.has(g)),
    ...safe.filter((g) => jtag.has(g)),
  ];
}

export type SpiRole = "spi_sck" | "spi_mosi" | "spi_miso" | "spi_cs" | "spi_rst";

function spiNum(
  spi: Record<string, unknown> | undefined,
  ...keys: string[]
): number | undefined {
  if (!spi) return undefined;
  for (const key of keys) {
    if (typeof spi[key] === "number") return spi[key] as number;
  }
  return undefined;
}

/** Hardware SPI from the board spec only — never inferred, even if caution. */
export function spiDefaultGpio(
  board: Component,
  role: SpiRole,
): number | undefined {
  const spi = board.defaults?.spi as Record<string, unknown> | undefined;
  if (role === "spi_sck") return spiNum(spi, "sck");
  if (role === "spi_mosi") return spiNum(spi, "mosi", "tx_mosi", "copi");
  if (role === "spi_miso") return spiNum(spi, "miso", "rx_miso", "cipo");
  if (role === "spi_cs") return spiNum(spi, "ss", "cs", "csn");
  if (role === "spi_rst") {
    return spiNum(spi, "rst") ?? (board.chip === "atmega328p" ? 9 : undefined);
  }
  return undefined;
}

export function hardwareSpiGpios(board: Component): number[] {
  const roles: SpiRole[] = [
    "spi_sck",
    "spi_mosi",
    "spi_miso",
    "spi_cs",
    "spi_rst",
  ];
  return [
    ...new Set(
      roles
        .map((role) => spiDefaultGpio(board, role))
        .filter((n): n is number => typeof n === "number"),
    ),
  ];
}

/** Default I2C/SPI GPIOs from the spec only — never inferred. */
export function defaultBusGpio(
  board: Component,
  which:
    | "i2c_sda"
    | "i2c_scl"
    | "spi_sck"
    | "spi_mosi"
    | "spi_miso"
    | "spi_cs"
    | "spi_rst",
): number | undefined {
  const i2c = board.defaults?.i2c;
  if (which === "i2c_sda" && typeof i2c?.sda === "number") return i2c.sda;
  if (which === "i2c_scl" && typeof i2c?.scl === "number") return i2c.scl;
  if (which.startsWith("spi_")) return spiDefaultGpio(board, which as SpiRole);
  const needle =
    which === "i2c_sda"
      ? /default i2c sda/i
      : which === "i2c_scl"
        ? /default i2c scl/i
        : null;
  if (!needle) return undefined;
  const pin = board.pins?.find((p) => p.warnings?.some((w) => needle.test(w)));
  return typeof pin?.gpio === "number" ? pin.gpio : undefined;
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
  const found = palette.find((p) => p.name.toLowerCase() === lower);
  return found?.hex ?? "#9e9e9e";
}

export function bezierWire(
  from: Vec3,
  to: Vec3,
  lift = 10,
  lane = 0,
): Vec3[] {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const len = Math.hypot(dx, dz) || 1;
  const nx = -dz / len;
  const nz = dx / len;
  const midX = (from[0] + to[0]) / 2 + nx * lane;
  const midZ = (from[2] + to[2]) / 2 + nz * lane;
  const peak = Math.max(from[1], to[1]) + lift;
  return [
    from,
    [from[0] + nx * lane * 0.3, from[1] + lift * 0.42, from[2] + nz * lane * 0.3],
    [midX, peak, midZ],
    [to[0] + nx * lane * 0.3, to[1] + lift * 0.42, to[2] + nz * lane * 0.3],
    to,
  ];
}

export type CameraPreset = {
  position: Vec3;
  lookAt: Vec3;
  fov?: number;
  frustum: number;
};

const ISO_DIR: Vec3 = [-1, 1.08, -1];

/** Whole-assembly AABB including off-board PIR (left) and servo (right). */
export function assemblyFrame(breadboard: Breadboard) {
  const length = dim(breadboard.body?.length_mm, 165);
  const width = dim(breadboard.body?.width_mm, 55);
  const min: Vec3 = [-52, -9, -22];
  const max: Vec3 = [length + 80, 34, width + 16];
  const lookAt: Vec3 = [
    (min[0] + max[0]) / 2,
    8,
    (min[2] + max[2]) / 2,
  ];
  return { min, max, lookAt, length, width };
}

/**
 * Orthographic 3/4 isometric of the whole assembly with paper margin.
 * Never a tight crop — every step shows board + breadboard + the part being wired.
 */
export function cameraFor(
  name: string,
  breadboard: Breadboard,
  callout?: string,
): CameraPreset {
  void callout;
  const { lookAt } = assemblyFrame(breadboard);
  const bias: Vec3 =
    name === "left" || name === "left-low"
      ? [-10, 0, -2]
      : name === "right-close"
        ? [88, 0, 10]
        : name === "right"
          ? [12, 0, 3]
          : name === "top-zoom-rows-30-35"
            ? [8, 0, 0]
            : [0, 0, 0];
  const target: Vec3 = [lookAt[0] + bias[0], lookAt[1], lookAt[2] + bias[2]];
  const len = Math.hypot(ISO_DIR[0], ISO_DIR[1], ISO_DIR[2]) || 1;
  const dist = 420;
  const position: Vec3 = [
    target[0] + (ISO_DIR[0] / len) * dist,
    target[1] + (ISO_DIR[1] / len) * dist,
    target[2] + (ISO_DIR[2] / len) * dist,
  ];
  return { position, lookAt: target, frustum: name === "right-close" ? 168 : 300 };
}

export function previewOrbit(t: number, breadboard: Breadboard): CameraPreset {
  const base = cameraFor("hero", breadboard);
  const look = base.lookAt;
  const radius = Math.hypot(
    base.position[0] - look[0],
    base.position[2] - look[2],
  );
  const angle = t * 0.18;
  return {
    position: [
      look[0] + Math.sin(angle) * radius,
      base.position[1],
      look[2] + Math.cos(angle) * radius,
    ],
    lookAt: look,
    frustum: 236,
  };
}
