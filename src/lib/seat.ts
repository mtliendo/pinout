import { adjacentFreeHole, headerSide, parseHole } from "./geometry";
import type { Breadboard, Component, Pin } from "./specs/schema";

export function boardPinCount(board: Component): number {
  const left =
    board.headers?.find((h) => /^(J1|L)$/i.test(h.id)) ?? board.headers?.[0];
  return (
    left?.count ??
    Math.max(1, ...(board.pins ?? []).map((p) => p.position.index), 1)
  );
}

/** Rows the MCU plus packed discrete parts need, including a one-row gap. */
export function rowsNeeded(
  board: Component,
  roles: { led?: boolean; button?: boolean },
): number {
  let rows = boardPinCount(board);
  if (roles.led) rows += 1 + 6;
  if (roles.button) rows += 3;
  return rows;
}

export class FitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FitError";
  }
}

export type BoardSeat = {
  startRow: number;
  pinCount: number;
  leftCol: string;
  rightCol: string;
  narrow: boolean;
};

export function boardSeat(board: Component, breadboard: Breadboard): BoardSeat {
  if (board.placement === "off_board_headers") {
    throw new FitError(
      `${board.name} sits off the breadboard. Off-board header seating lands with the spec.`,
    );
  }
  const pinCount = boardPinCount(board);
  const cols = breadboard.grid.columns;
  const place = board.placement;
  const narrow =
    pinCount <= 8 ||
    /xiao|nano|pico/i.test(board.id) ||
    (place === "breadboard" && pinCount <= 10);
  const leftCol = cols.includes("b") ? "b" : cols[0];
  const rightCol = narrow
    ? cols.includes("f")
      ? "f"
      : cols[Math.min(5, cols.length - 1)]
    : cols.includes("i")
      ? "i"
      : cols[cols.length - 1];
  const startRow = 1;
  if (startRow + pinCount - 1 > breadboard.grid.rows) {
    throw new FitError(
      `${board.name} needs ${pinCount} rows; this breadboard only has ${breadboard.grid.rows}.`,
    );
  }
  return { startRow, pinCount, leftCol, rightCol, narrow };
}

export function boardHoles(
  board: Component,
  breadboard: Breadboard,
): Record<string, string> {
  const seat = boardSeat(board, breadboard);
  const holes: Record<string, string> = {};
  for (const pin of board.pins ?? []) {
    const row = seat.startRow + pin.position.index - 1;
    if (row < 1 || row > breadboard.grid.rows) continue;
    const left = headerSide(board, pin) === "left";
    holes[pin.id] = `${left ? seat.leftCol : seat.rightCol}${row}`;
  }
  return holes;
}

export function freeHoleOf(seated: string | undefined, fallback: string): string {
  if (!seated) return fallback;
  return adjacentFreeHole(seated);
}

export function rowOf(hole: string, fallback = 1): number {
  const parsed = parseHole(hole);
  if (parsed?.kind === "hole" || parsed?.kind === "rail") return parsed.row;
  return fallback;
}

export type PackedLayout = {
  ledStart: number;
  buttonStart: number;
  resistorFrom: string;
  resistorTo: string;
  ledAnode: string;
  ledCathode: string;
  ledSignal: string;
  ledGndHole: string;
  buttonHoles: Record<string, string>;
  buttonSignal: string;
  buttonGndHole: string;
};

export function packDiscrete(
  seat: BoardSeat,
  breadboard: Breadboard,
  roles: { led?: boolean; button?: boolean },
): PackedLayout {
  const used = new Set<number>();
  for (let r = seat.startRow; r < seat.startRow + seat.pinCount; r++) used.add(r);

  const take = (span: number) => {
    let cursor = seat.startRow + seat.pinCount + 1;
    while (cursor + span - 1 <= breadboard.grid.rows) {
      let clear = true;
      for (let r = cursor; r < cursor + span; r++) {
        if (used.has(r)) {
          clear = false;
          break;
        }
      }
      if (clear) {
        for (let r = cursor; r < cursor + span; r++) used.add(r);
        return cursor;
      }
      cursor += 1;
    }
    throw new FitError(
      `This circuit needs more rows than a ${breadboard.grid.rows}-row breadboard.`,
    );
  };

  const ledStart = roles.led ? take(6) : 0;
  const buttonStart = roles.button ? take(3) : 0;

  return {
    ledStart,
    buttonStart,
    resistorFrom: `b${ledStart}`,
    resistorTo: `b${ledStart + 4}`,
    ledAnode: `c${ledStart + 4}`,
    ledCathode: `c${ledStart + 5}`,
    ledSignal: `a${ledStart}`,
    ledGndHole: `a${ledStart + 5}`,
    buttonHoles: {
      "1": `e${buttonStart}`,
      "2": `e${buttonStart + 2}`,
      "3": `f${buttonStart}`,
      "4": `f${buttonStart + 2}`,
    },
    buttonSignal: `a${buttonStart}`,
    buttonGndHole: `j${buttonStart + 2}`,
  };
}

export function powerHoles(
  board: Component,
  holes: Record<string, string>,
  findPinByLabel: (board: Component, label: string) => Pin | undefined,
  findGndPin: (board: Component) => Pin | undefined,
) {
  const five = findPinByLabel(board, "5V");
  const gnd =
    findPinByLabel(board, "G") ??
    findPinByLabel(board, "GND") ??
    findGndPin(board);
  const three = findPinByLabel(board, "3V3");
  const free = (pin: Pin | undefined, fallback: string) =>
    freeHoleOf(pin ? holes[pin.id] : undefined, fallback);
  const gndHole = free(gnd, "a1");
  return {
    five: free(five, gndHole),
    gnd: gndHole,
    three: free(three, gndHole),
    fivePin: five,
    gndPin: gnd,
    threePin: three,
  };
}
