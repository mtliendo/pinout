import { adjacentFreeHole, headerSide, parseHole } from "./geometry";
import type { Breadboard, Component, Pin } from "./specs/schema";

export function boardPinCount(board: Component): number {
  const counts = (board.headers ?? []).map((h) => h.count);
  if (counts.length) return Math.max(...counts);
  return Math.max(1, ...(board.pins ?? []).map((p) => p.position.index), 1);
}

/** Rows the MCU plus packed discrete parts need, including a one-row gap. */
export function rowsNeeded(
  board: Component,
  roles: { led?: boolean; button?: boolean },
): number {
  const fit = board.breadboard_fit;
  let rows = fit?.off_board || fit?.fits_830 === false ? 0 : boardPinCount(board);
  if (roles.led) rows += 1 + 6;
  if (roles.button) rows += 3;
  return Math.max(rows, 1);
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
  offBoard: boolean;
  freeLeft: number;
  freeRight: number;
  connector?: string;
};

const LEFT_HEADERS = /^(J1|J2|L|JP1|JANALOG)$/i;
const RIGHT_HEADERS = /^(J3|R|JP2|JDIGITAL)$/i;

function fallbackStraddle(board: Component): { left: string; right: string } {
  const narrow =
    boardPinCount(board) <= 8 || /xiao|nano|pico/i.test(board.id);
  if (narrow) return { left: "b", right: "f" };
  return { left: "b", right: "i" };
}

export function boardSeat(board: Component, breadboard: Breadboard): BoardSeat {
  const fit = board.breadboard_fit;
  const pinCount = boardPinCount(board);
  const cols = breadboard.grid.columns;
  const pick = (col: string, fallback: string) =>
    cols.includes(col) ? col : fallback;

  if (fit?.fits_830 === false || fit?.off_board) {
    return {
      startRow: 1,
      pinCount: 0,
      leftCol: "b",
      rightCol: "i",
      narrow: false,
      offBoard: true,
      freeLeft: 0,
      freeRight: 0,
      connector: fit.connector,
    };
  }

  const fallback = fallbackStraddle(board);
  let leftCol = fallback.left;
  let rightCol = fallback.right;
  const straddle = fit?.straddle;
  if (straddle) {
    for (const [header, col] of Object.entries(straddle)) {
      if (LEFT_HEADERS.test(header)) leftCol = col;
      else if (RIGHT_HEADERS.test(header)) rightCol = col;
    }
  }
  leftCol = pick(leftCol, cols[0]);
  rightCol = pick(rightCol, cols[cols.length - 1]);

  const freeLeft = fit?.free_holes_per_row?.left ?? (leftCol === "a" ? 0 : 1);
  const freeRight = fit?.free_holes_per_row?.right ?? 1;
  const startRow = 1;
  const seatedCount = fit?.off_board ? 0 : pinCount;
  if (startRow + seatedCount - 1 > breadboard.grid.rows) {
    throw new FitError(
      `${board.name} needs ${pinCount} rows; this breadboard only has ${breadboard.grid.rows}.`,
    );
  }
  return {
    startRow,
    pinCount: seatedCount,
    leftCol,
    rightCol,
    narrow: seatedCount <= 8 || /xiao|nano|pico/i.test(board.id),
    offBoard: false,
    freeLeft,
    freeRight,
    connector: fit?.connector,
  };
}

export function boardHoles(
  board: Component,
  breadboard: Breadboard,
): Record<string, string> {
  const seat = boardSeat(board, breadboard);
  if (seat.offBoard) return {};
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

function pinHeaderSide(pin: Pin): "left" | "right" {
  const header = pin.id.split(".")[0] ?? "";
  if (/^(J3|R|JP2|JDIGITAL)$/i.test(header)) return "right";
  return "left";
}

/** Hole a jumper can land in, or `mcu:pinId` when there is no free hole. */
export function signalEnd(
  pin: Pin,
  holes: Record<string, string>,
  seat: BoardSeat,
): string {
  if (seat.offBoard) return `mcu:${pin.id}`;
  const seated = holes[pin.id];
  if (!seated) return `mcu:${pin.id}`;
  const free =
    pinHeaderSide(pin) === "left" ? seat.freeLeft : seat.freeRight;
  if (free === 0) return `mcu:${pin.id}`;
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
    let cursor = seat.offBoard
      ? 1
      : seat.startRow + seat.pinCount + 1;
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
  seat?: BoardSeat,
) {
  const five =
    findPinByLabel(board, "5V") ?? findPinByLabel(board, "VBUS");
  const gnd =
    findPinByLabel(board, "G") ??
    findPinByLabel(board, "GND") ??
    findGndPin(board);
  const three = findPinByLabel(board, "3V3");
  const endFor = (pin: Pin | undefined, fallback: string) => {
    if (!pin) return fallback;
    if (seat) return signalEnd(pin, holes, seat);
    return freeHoleOf(holes[pin.id], fallback);
  };
  const gndHole = endFor(gnd, "a1");
  return {
    five: endFor(five, gndHole),
    gnd: gndHole,
    three: endFor(three, gndHole),
    fivePin: five,
    gndPin: gnd,
    threePin: three,
  };
}
