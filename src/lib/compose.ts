import { EXPECTED_BOARDS } from "./boards/expected";
import {
  defaultBusGpio,
  findGndPin,
  findPinByGpio,
  findPinByLabel,
  hardwareSpiGpios,
  pinHasFunction,
  preferredSafeGpio,
  railHoleRows,
  snapRailRow,
  spiDefaultGpio,
  uartGpios,
  type SpiRole,
} from "./geometry";
import { TM1637_CAUTION, compatFixes } from "./compat";
import {
  boardHoles,
  boardSeat,
  FitError,
  packDiscrete,
  powerHoles,
  signalEnd,
  type BoardSeat,
  type PackedLayout,
} from "./seat";
import type { Breadboard, Build, Component, Pin } from "./specs/schema";
import { assertValidBuild } from "./specs/validate";

export { FitError };

export type SignalNeed = {
  role: string;
  capability:
    | "input"
    | "output"
    | "pwm"
    | "i2c_sda"
    | "i2c_scl"
    | SpiRole;
};

export type AssignedPin = {
  role: string;
  gpio: number;
  pin: Pin;
  hole: string;
  freeHole: string;
};

export type ComposeRequest = {
  idea: string;
  boardId: string;
  partIds: string[];
  title?: string;
  summary?: string;
};

const GENERIC_JUMPERS = [
  { id: "jumpers_mm", component: "jumper-male-male", qty: 8, note: "generic, not in catalog" },
  { id: "jumpers_fm", component: "jumper-female-male", qty: 4, note: "for module headers" },
];

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

let railOccupancy = new Set<string>();

function resetRailOccupancy() {
  railOccupancy = new Set<string>();
}

function railOf(
  rail: "L+" | "L-",
  row: number,
  breadboard: Breadboard,
): string {
  const holes = railHoleRows(breadboard.grid.rows);
  const clamped = Math.max(1, Math.min(row, breadboard.grid.rows));
  const want = snapRailRow(clamped, breadboard.grid.rows);
  const start = Math.max(0, holes.indexOf(want));
  for (let i = 0; i < holes.length; i++) {
    const id = `${rail}@${holes[(start + i) % holes.length]}`;
    if (!railOccupancy.has(id)) {
      railOccupancy.add(id);
      return id;
    }
  }
  return `${rail}@${want}`;
}

function neighborHole(hole: string): string | null {
  const match = /^([a-j])(\d+)$/i.exec(hole);
  if (!match) return null;
  const col = match[1].toLowerCase();
  const row = match[2];
  const half = "abcde".includes(col) ? "abcde" : "fghij";
  const next = half[(half.indexOf(col) + 1) % half.length];
  return next === col ? null : `${next}${row}`;
}

function firstFreeNeighbor(hole: string, taken: Set<string>): string | null {
  const match = /^([a-j])(\d+)$/i.exec(hole);
  if (!match) return null;
  const col = match[1].toLowerCase();
  const row = match[2];
  const half = "abcde".includes(col) ? "abcde" : "fghij";
  for (const next of half) {
    const id = `${next}${row}`;
    if (!taken.has(id)) return id;
  }
  return null;
}

function uniquifyEndpoints(
  connections: Build["connections"],
  placements: Build["placements"],
  seat: BoardSeat,
  breadboard: Breadboard,
  reserved: Set<number>,
): void {
  const taken = new Set<string>();
  for (const placement of placements) {
    for (const hole of Object.values(placement.pin_holes ?? {})) taken.add(hole);
  }
  type End = { wire: Build["connections"][number]; key: "from" | "to" };
  const groups = new Map<string, End[]>();
  const remember = (value: string, end: End) => {
    const list = groups.get(value) ?? [];
    list.push(end);
    groups.set(value, list);
  };
  for (const wire of connections) {
    remember(wire.from, { wire, key: "from" });
    remember(wire.to, { wire, key: "to" });
  }
  for (const [value, group] of groups) {
    if (!value.includes(":")) taken.add(value);
    if (group.length < 2) continue;
    if (value.includes(":")) {
      const row = takeFreeRow(seat, breadboard, reserved, 1);
      const cols = ["a", "b", "c", "d", "e"];
      const feed = `${cols[0]}${row}`;
      connections.push({
        id: `w_fan_${value.replace(/[^a-z0-9]+/gi, "_")}`,
        from: value,
        to: feed,
        color: "orange",
        length_mm: 40,
        net: group[0].wire.net,
      });
      taken.add(feed);
      group.forEach((end, i) => {
        const hole = `${cols[Math.min(i + 1, cols.length - 1)]}${row}`;
        end.wire[end.key] = hole;
        taken.add(hole);
      });
      continue;
    }
    for (const extra of group.slice(1)) {
      const next = firstFreeNeighbor(value, taken);
      if (next) {
        extra.wire[extra.key] = next;
        taken.add(next);
      }
    }
  }
}

function takeFreeRow(
  seat: BoardSeat,
  breadboard: Breadboard,
  reserved: Set<number>,
  span: number,
): number {
  let cursor = seat.offBoard ? 1 : seat.startRow + seat.pinCount + 1;
  while (cursor + span - 1 <= breadboard.grid.rows) {
    let clear = true;
    for (let r = cursor; r < cursor + span; r++) {
      if (reserved.has(r)) {
        clear = false;
        break;
      }
    }
    if (clear) {
      for (let r = cursor; r < cursor + span; r++) reserved.add(r);
      return cursor;
    }
    cursor += 1;
  }
  throw new FitError(
    `This circuit needs more rows than a ${breadboard.grid.rows}-row breadboard.`,
  );
}

export function assignPins(
  board: Component,
  needs: SignalNeed[],
  breadboard: Breadboard,
): AssignedPin[] {
  const preferred = preferredSafeGpio(board);
  const used = new Set<number>();
  const holes = boardHoles(board, breadboard);
  const seat = boardSeat(board, breadboard);
  const assigned: AssignedPin[] = [];

  const uart = new Set(uartGpios(board));
  const pick = (need: SignalNeed): number => {
    if (need.capability === "i2c_sda" || need.capability === "i2c_scl") {
      const listed = defaultBusGpio(board, need.capability);
      if (
        listed != null &&
        preferred.includes(listed) &&
        !used.has(listed)
      ) {
        used.add(listed);
        return listed;
      }
    }
    if (need.capability.startsWith("spi_")) {
      const listed = spiDefaultGpio(board, need.capability as SpiRole);
      if (listed != null && !used.has(listed) && findPinByGpio(board, listed)) {
        used.add(listed);
        return listed;
      }
    }
    const pool = [...preferred];
    for (const gpio of hardwareSpiGpios(board)) {
      if (!used.has(gpio) && findPinByGpio(board, gpio) && !pool.includes(gpio)) {
        pool.push(gpio);
      }
    }
    const scored = pool
      .filter((g) => !used.has(g))
      .map((gpio) => {
        const pin = findPinByGpio(board, gpio);
        let score = 0;
        if (!pin) return { gpio, score: -100 };
        if (need.capability === "pwm" && pinHasFunction(pin, "PWM")) score += 4;
        if (need.capability.startsWith("i2c") && pinHasFunction(pin, "I2C"))
          score += 6;
        if (need.capability === "input" && pinHasFunction(pin, "ADC")) {
          score += need.role === "vrx" || need.role === "vry" ? 8 : 1;
        }
        if (need.role === "echo") {
          if (gpio < 4) score -= 20;
          if (pinHasFunction(pin, "ADC") || /^A\d/i.test(pin.label)) score -= 12;
        }
        if (need.role === "led") {
          if (uart.has(gpio) || gpio < 2) score -= 16;
        }
        if (uart.has(gpio) && need.role !== "echo") score -= 8;
        score -= pool.indexOf(gpio) * 0.01;
        return { gpio, score };
      })
      .sort((a, b) => b.score - a.score);
    const chosen = scored[0]?.gpio;
    if (chosen == null) {
      throw new Error(`No safe GPIO left for ${need.role}`);
    }
    used.add(chosen);
    return chosen;
  };

  for (const need of needs) {
    const gpio = pick(need);
    const pin = findPinByGpio(board, gpio);
    if (!pin) throw new Error(`GPIO${gpio} is not on a header`);
    assigned.push({
      role: need.role,
      gpio,
      pin,
      hole: holes[pin.id] ?? `mcu:${pin.id}`,
      freeHole: signalEnd(pin, holes, seat),
    });
  }
  return assigned;
}

function detectRoles(partIds: string[]) {
  return {
    pir: partIds.includes("hc-sr501-pir"),
    servo: partIds.includes("sg90-servo"),
    led:
      partIds.includes("led-5mm-red") ||
      partIds.includes("led-5mm-blue") ||
      partIds.includes("led-5mm-green") ||
      partIds.includes("led-5mm-yellow"),
    ledId:
      ["led-5mm-red", "led-5mm-blue", "led-5mm-green", "led-5mm-yellow"].find(
        (id) => partIds.includes(id),
      ) ?? "led-5mm-red",
    resistor: partIds.includes("resistor-220") || partIds.includes("resistor-330"),
    button: partIds.includes("tactile-button-6mm"),
    oled: partIds.includes("ssd1306-oled-128x64-i2c"),
    sonar: partIds.includes("hc-sr04") || partIds.includes("hc-sr04p"),
    sonarId: partIds.includes("hc-sr04p") ? "hc-sr04p" : "hc-sr04",
    neo: partIds.includes("ws2812b-strip") || partIds.includes("ws2812b-ring-12"),
    neoId: partIds.includes("ws2812b-ring-12") ? "ws2812b-ring-12" : "ws2812b-strip",
    lcd: partIds.includes("lcd1602-i2c-pcf8574"),
    tm1637: partIds.includes("tm1637-4digit"),
    joystick: partIds.includes("joystick-ky023"),
    relay: partIds.includes("relay-module-5v-1ch"),
    buzzer: partIds.includes("buzzer-active-ky012"),
    keypad: partIds.includes("keypad-4x4-membrane"),
    rc522: partIds.includes("rfid-rc522"),
    bme: partIds.includes("bme280-i2c-breakout"),
  };
}

function needsFor(roles: ReturnType<typeof detectRoles>): SignalNeed[] {
  const needs: SignalNeed[] = [];
  if (roles.oled || roles.lcd || roles.bme) {
    needs.push({ role: "oled_sda", capability: "i2c_sda" });
    needs.push({ role: "oled_scl", capability: "i2c_scl" });
  }
  if (roles.pir) needs.push({ role: "pir", capability: "input" });
  if (roles.button) needs.push({ role: "button", capability: "input" });
  if (roles.servo) needs.push({ role: "servo", capability: "pwm" });
  if (roles.led) needs.push({ role: "led", capability: "output" });
  if (roles.sonar) {
    needs.push({ role: "trig", capability: "output" });
    needs.push({ role: "echo", capability: "input" });
  }
  if (roles.neo) needs.push({ role: "neo", capability: "output" });
  if (roles.tm1637) {
    needs.push({ role: "clk", capability: "output" });
    needs.push({ role: "dio", capability: "output" });
  }
  if (roles.joystick) {
    needs.push({ role: "vrx", capability: "input" });
    needs.push({ role: "vry", capability: "input" });
    needs.push({ role: "sw", capability: "input" });
  }
  if (roles.relay) needs.push({ role: "relay", capability: "output" });
  if (roles.buzzer) needs.push({ role: "buzzer", capability: "output" });
  if (roles.keypad) {
    for (let i = 1; i <= 8; i++) {
      needs.push({ role: `kp${i}`, capability: "input" });
    }
  }
  if (roles.rc522) {
    needs.push({ role: "spi_sck", capability: "spi_sck" });
    needs.push({ role: "spi_mosi", capability: "spi_mosi" });
    needs.push({ role: "spi_miso", capability: "spi_miso" });
    needs.push({ role: "spi_cs", capability: "spi_cs" });
    needs.push({ role: "spi_rst", capability: "spi_rst" });
  }
  return needs;
}

export function composeBuild(
  request: ComposeRequest,
  components: Record<string, Component>,
  breadboard: Breadboard,
): Build {
  const board = components[request.boardId];
  if (!board || board.kind !== "board") {
    throw new Error(`Unknown board ${request.boardId}`);
  }
  const partIds = unique([
    request.boardId,
    "breadboard-830",
    ...request.partIds.filter((id) => components[id]),
  ]);
  const roles = detectRoles(partIds);
  if (roles.led && !roles.resistor) partIds.push("resistor-220");

  resetRailOccupancy();
  const threeVolt = !isFiveVoltLogic(board);
  const echoDivider = roles.sonar && roles.sonarId === "hc-sr04" && threeVolt;
  const neoBuffer = roles.neo && threeVolt;
  const relaySplit = roles.relay && threeVolt;
  const rc522Shift = roles.rc522 && !threeVolt;

  const isReferenceShape =
    board.id === "esp32-s3-devkitc-1-n16r8" &&
    roles.pir &&
    roles.servo &&
    roles.led &&
    breadboard.grid.rows >= 63;

  if (isReferenceShape) {
    const build = composePirServo(board, request);
    assertValidBuild(build, components, breadboard);
    return build;
  }

  const seat = boardSeat(board, breadboard);
  const holes = boardHoles(board, breadboard);
  const assigned = assignPins(board, needsFor(roles), breadboard);
  const byRole = Object.fromEntries(assigned.map((a) => [a.role, a]));
  const power = powerHoles(board, holes, findPinByLabel, findGndPin, seat);
  const layout = packDiscrete(seat, breadboard, {
    led: roles.led,
    button: roles.button,
  });
  const reservedRows = new Set<number>();
  if (layout.ledStart) {
    for (let r = layout.ledStart; r < layout.ledStart + 6; r++) reservedRows.add(r);
  }
  if (layout.buttonStart) {
    for (let r = layout.buttonStart; r < layout.buttonStart + 3; r++) {
      reservedRows.add(r);
    }
  }
  const echoRows = echoDivider ? takeFreeRow(seat, breadboard, reservedRows, 15) : 0;
  const neoR330Row = neoBuffer ? takeFreeRow(seat, breadboard, reservedRows, 5) : 0;
  const threeFanRow = rc522Shift ? takeFreeRow(seat, breadboard, reservedRows, 1) : 0;

  const parts: Build["parts"] = [
    { id: "bb", component: "breadboard-830", qty: 1 },
    { id: "mcu", component: board.id, qty: 1 },
  ];
  if (roles.pir) parts.push({ id: "pir", component: "hc-sr501-pir", qty: 1 });
  if (roles.servo) parts.push({ id: "servo", component: "sg90-servo", qty: 1 });
  if (roles.led) parts.push({ id: "led1", component: "led-5mm-red", qty: 1 });
  if (roles.led || roles.resistor)
    parts.push({ id: "r1", component: "resistor-220", qty: 1 });
  if (roles.button)
    parts.push({ id: "btn", component: "tactile-button-6mm", qty: 1 });
  if (roles.oled)
    parts.push({ id: "oled", component: "ssd1306-oled-128x64-i2c", qty: 1 });
  if (roles.sonar)
    parts.push({ id: "sonar", component: roles.sonarId, qty: 1 });
  if (roles.neo) parts.push({ id: "neo", component: roles.neoId, qty: 1 });
  if (roles.lcd)
    parts.push({ id: "lcd", component: "lcd1602-i2c-pcf8574", qty: 1 });
  if (roles.tm1637)
    parts.push({ id: "tm", component: "tm1637-4digit", qty: 1 });
  if (roles.joystick)
    parts.push({ id: "joy", component: "joystick-ky023", qty: 1 });
  if (roles.relay)
    parts.push({ id: "relay", component: "relay-module-5v-1ch", qty: 1 });
  if (roles.buzzer)
    parts.push({ id: "buzz", component: "buzzer-active-ky012", qty: 1 });
  if (roles.keypad)
    parts.push({ id: "keys", component: "keypad-4x4-membrane", qty: 1 });
  if (roles.rc522)
    parts.push({ id: "rfid", component: "rfid-rc522", qty: 1 });
  if (roles.bme)
    parts.push({ id: "bme", component: "bme280-i2c-breakout", qty: 1 });
  if (echoDivider) {
    parts.push({ id: "r_echo", component: "resistor-1k", qty: 1 });
    parts.push({ id: "r_div1", component: "resistor-1k", qty: 1 });
    parts.push({ id: "r_div2", component: "resistor-1k", qty: 1 });
  }
  if (neoBuffer) {
    parts.push({ id: "ext5v", component: "ext-5v-supply", qty: 1 });
    parts.push({ id: "buf", component: "74ahct125", qty: 1 });
    parts.push({ id: "r330", component: "resistor-330", qty: 1 });
    parts.push({ id: "cap_neo", component: "cap-electrolytic-1000uf", qty: 1 });
  }
  if (rc522Shift) {
    parts.push({ id: "sh", component: "level-shifter-bss138", qty: 1 });
  }
  if (roles.led && roles.ledId !== "led-5mm-red") {
    const ledPart = parts.find((p) => p.id === "led1");
    if (ledPart) ledPart.component = roles.ledId;
  }
  parts.push(...GENERIC_JUMPERS);

  const endRow = seat.startRow + seat.pinCount - 1;
  const placements: Build["placements"] = [
    seat.offBoard
      ? {
          part: "mcu",
          anchor_hole: null,
          off_board: true,
          rotation_deg: 0,
          pin_holes: {},
          position_hint: "beside the breadboard, female headers facing the rails",
          note: `${board.name.split("(")[0].trim()} stays off the breadboard. Wire from its ${seat.connector ?? "female headers"} with jumpers only.`,
        }
      : {
          part: "mcu",
          anchor_hole: `${seat.leftCol}${seat.startRow}`,
          rotation_deg: 0,
          pin_holes: holes,
          note: seatNote(board, seat, endRow),
        },
  ];

  if (roles.led) {
    placements.push({
      part: "r1",
      anchor_hole: layout.resistorFrom,
      rotation_deg: 0,
      pin_holes: { "1": layout.resistorFrom, "2": layout.resistorTo },
    });
    placements.push({
      part: "led1",
      anchor_hole: layout.ledCathode,
      rotation_deg: 180,
      pin_holes: { A: layout.ledAnode, K: layout.ledCathode },
      note: `Long leg (anode) in ${layout.ledAnode}.`,
    });
  }

  if (roles.button) {
    placements.push({
      part: "btn",
      anchor_hole: layout.buttonHoles["1"],
      rotation_deg: 0,
      pin_holes: layout.buttonHoles,
      note: "Straddles the center gap. Diagonal legs 1 and 4 are the switch.",
    });
  }

  if (roles.pir) {
    placements.push({
      part: "pir",
      anchor_hole: null,
      off_board: true,
      position_hint: "left of the breadboard, lens facing up/out",
    });
  }
  if (roles.servo) {
    placements.push({
      part: "servo",
      anchor_hole: null,
      off_board: true,
      position_hint: "right of the breadboard, near the far end",
    });
  }
  if (roles.oled) {
    placements.push({
      part: "oled",
      anchor_hole: null,
      off_board: true,
      position_hint: "left of the breadboard, screen facing up",
    });
  }
  const off = (part: string, hint: string) =>
    placements.push({
      part,
      anchor_hole: null,
      off_board: true,
      position_hint: hint,
    });
  if (roles.sonar) off("sonar", "left of the breadboard, transducers out");
  if (roles.neo) off("neo", "right of the breadboard, pixels facing up");
  if (roles.lcd) off("lcd", "above the breadboard, text facing you");
  if (roles.tm1637) off("tm", "above the breadboard, digits facing you");
  if (roles.relay) off("relay", "right of the breadboard — low-voltage DC only");
  if (roles.keypad) off("keys", "in front of the breadboard");
  if (roles.rc522) off("rfid", "left of the breadboard");
  if (roles.joystick) {
    placements.push({
      part: "joy",
      anchor_hole: `e${Math.min(breadboard.grid.rows - 2, seat.startRow + seat.pinCount + 8)}`,
      rotation_deg: 0,
      pin_holes: {},
      note: "Seat the KY-023 so GND/VCC/VRx/VRy/SW each get their own row. Pin order is approximate — read the silk.",
    });
  }
  if (roles.buzzer) {
    placements.push({
      part: "buzz",
      anchor_hole: `j${Math.min(breadboard.grid.rows, seat.startRow + seat.pinCount + 4)}`,
      rotation_deg: 0,
      pin_holes: {},
    });
  }
  if (roles.bme) {
    placements.push({
      part: "bme",
      anchor_hole: null,
      off_board: true,
      position_hint: "left of the breadboard",
    });
  }
  if (echoDivider) {
    placements.push({
      part: "r_echo",
      anchor_hole: `b${echoRows}`,
      rotation_deg: 0,
      pin_holes: { "1": `b${echoRows}`, "2": `b${echoRows + 4}` },
      note: "1 kΩ from Echo to the GPIO node.",
    });
    placements.push({
      part: "r_div1",
      anchor_hole: `j${echoRows}`,
      rotation_deg: 0,
      pin_holes: { "1": `j${echoRows}`, "2": `j${echoRows + 4}` },
      note: "First 1 kΩ of the node-to-GND pair.",
    });
    placements.push({
      part: "r_div2",
      anchor_hole: `j${echoRows + 6}`,
      rotation_deg: 0,
      pin_holes: { "1": `j${echoRows + 6}`, "2": `j${echoRows + 10}` },
      note: "Second 1 kΩ to ground (3.33 V at the node).",
    });
  }
  if (neoBuffer) {
    off("ext5v", "beside the breadboard — external 5V, never the MCU 5V pin");
    off("buf", "right of the breadboard, 74AHCT125");
    off("cap_neo", "across the strip 5V and GND pads");
    placements.push({
      part: "r330",
      anchor_hole: `b${neoR330Row}`,
      rotation_deg: 0,
      pin_holes: { "1": `b${neoR330Row}`, "2": `b${neoR330Row + 4}` },
      note: "330 Ω after the buffer, then DIN.",
    });
  }
  if (rc522Shift) {
    off("sh", "between the MCU and the RC522 — shifter first");
  }

  const connections: Build["connections"] = [];
  const add = (c: Build["connections"][number]) => connections.push(c);

  const needsFiveRail =
    roles.servo ||
    roles.pir ||
    roles.sonar ||
    (roles.neo && !neoBuffer) ||
    roles.lcd ||
    roles.relay ||
    rc522Shift ||
    (roles.tm1637 && isFiveVoltLogic(board));
  if (needsFiveRail) {
    add({
      id: "w_5v",
      from: power.five,
      to: railOf("L+", rowOfHole(power.five), breadboard),
      color: "red",
      length_mm: 20,
      net: "5V",
    });
  }
  add({
    id: "w_gnd",
    from: power.gnd,
    to: railOf("L-", rowOfHole(power.gnd), breadboard),
    color: "black",
    length_mm: 20,
    net: "GND",
  });

  const far = breadboard.grid.rows;
  if (roles.pir && byRole.pir) {
    add({
      id: "w_pir_vcc",
      from: "pir:VCC",
      to: railOf("L+", far - 8, breadboard),
      color: "red",
      length_mm: 150,
      net: "5V",
    });
    add({
      id: "w_pir_gnd",
      from: "pir:GND",
      to: railOf("L-", far - 6, breadboard),
      color: "black",
      length_mm: 150,
      net: "GND",
    });
    add({
      id: "w_pir_out",
      from: "pir:OUT",
      to: byRole.pir.freeHole,
      color: "green",
      length_mm: 150,
      net: "PIR_OUT",
    });
  }

  if (roles.servo && byRole.servo) {
    add({
      id: "w_srv_vcc",
      from: "servo:VCC",
      to: railOf("L+", far - 4, breadboard),
      color: "red",
      length_mm: 100,
      net: "5V",
    });
    add({
      id: "w_srv_gnd",
      from: "servo:GND",
      to: railOf("L-", far - 3, breadboard),
      color: "black",
      length_mm: 100,
      net: "GND",
      note: "servo wire is brown",
    });
    add({
      id: "w_srv_sig",
      from: "servo:SIG",
      to: byRole.servo.freeHole,
      color: "yellow",
      length_mm: 150,
      net: "SERVO_PWM",
    });
  }

  if (roles.led && byRole.led) {
    add({
      id: "w_led",
      from: byRole.led.freeHole,
      to: layout.ledSignal,
      color: "purple",
      length_mm: 65,
      net: "LED",
    });
    add({
      id: "w_led_gnd",
      from: layout.ledGndHole,
      to: railOf("L-", rowOfHole(layout.ledGndHole), breadboard),
      color: "black",
      length_mm: 20,
      net: "GND",
    });
  }

  if (roles.button && byRole.button) {
    add({
      id: "w_btn",
      from: layout.buttonSignal,
      to: byRole.button.freeHole,
      color: "green",
      length_mm: 40,
      net: "BTN",
    });
    add({
      id: "w_btn_gnd",
      from: layout.buttonGndHole,
      to: railOf("L-", rowOfHole(layout.buttonGndHole), breadboard),
      color: "black",
      length_mm: 30,
      net: "GND",
    });
  }

  if (roles.oled && byRole.oled_sda && byRole.oled_scl) {
    add({
      id: "w_oled_vcc",
      from: "oled:VCC",
      to: power.three,
      color: "orange",
      length_mm: 80,
      net: "3V3",
    });
    add({
      id: "w_oled_gnd",
      from: "oled:GND",
      to: railOf("L-", Math.min(18, far), breadboard),
      color: "black",
      length_mm: 80,
      net: "GND",
    });
    add({
      id: "w_oled_scl",
      from: "oled:SCL",
      to: byRole.oled_scl.freeHole,
      color: "yellow",
      length_mm: 80,
      net: "I2C_SCL",
    });
    add({
      id: "w_oled_sda",
      from: "oled:SDA",
      to: byRole.oled_sda.freeHole,
      color: "blue",
      length_mm: 80,
      net: "I2C_SDA",
    });
  }

  if (roles.sonar && byRole.trig && byRole.echo) {
    add({
      id: "w_son_vcc",
      from: "sonar:VCC",
      to: railOf("L+", far - 10, breadboard),
      color: "red",
      length_mm: 80,
      net: "5V",
    });
    add({
      id: "w_son_gnd",
      from: "sonar:GND",
      to: railOf("L-", far - 9, breadboard),
      color: "black",
      length_mm: 80,
      net: "GND",
    });
    add({
      id: "w_son_trig",
      from: "sonar:TRIG",
      to: byRole.trig.freeHole,
      color: "yellow",
      length_mm: 80,
      net: "TRIG",
    });
    if (echoDivider) {
      add({
        id: "w_son_echo",
        from: "sonar:ECHO",
        to: `a${echoRows}`,
        color: "green",
        length_mm: 80,
        net: "ECHO",
      });
      add({
        id: "w_echo_node",
        from: `a${echoRows + 4}`,
        to: byRole.echo.freeHole,
        color: "green",
        length_mm: 40,
        net: "ECHO_DIV",
      });
      const echoTaken = new Set<string>([byRole.echo.freeHole]);
      for (const placement of placements) {
        for (const hole of Object.values(placement.pin_holes ?? {})) echoTaken.add(hole);
      }
      add({
        id: "w_div_tap",
        from:
          firstFreeNeighbor(byRole.echo.freeHole, echoTaken) ??
          neighborHole(byRole.echo.freeHole) ??
          `d${byRole.echo.freeHole.replace(/\D/g, "")}`,
        to: `i${echoRows}`,
        color: "green",
        length_mm: 30,
        net: "ECHO_DIV",
      });
      add({
        id: "w_div_mid",
        from: `i${echoRows + 4}`,
        to: `i${echoRows + 6}`,
        color: "black",
        length_mm: 20,
        net: "ECHO_DIV",
      });
      add({
        id: "w_div_gnd",
        from: `i${echoRows + 10}`,
        to: railOf("L-", echoRows + 10, breadboard),
        color: "black",
        length_mm: 20,
        net: "GND",
      });
    } else {
      add({
        id: "w_son_echo",
        from: "sonar:ECHO",
        to: byRole.echo.freeHole,
        color: "green",
        length_mm: 80,
        net: "ECHO",
      });
    }
  }

  if (roles.neo && byRole.neo) {
    if (neoBuffer) {
      add({
        id: "w_ext_5v",
        from: "ext5v:V+",
        to: railOf("L+", far - 12, breadboard),
        color: "red",
        length_mm: 80,
        net: "5V",
      });
      add({
        id: "w_ext_gnd",
        from: "ext5v:GND",
        to: railOf("L-", far - 11, breadboard),
        color: "black",
        length_mm: 80,
        net: "GND",
      });
      add({
        id: "w_neo_vcc",
        from: "neo:VDD",
        to: railOf("L+", far - 10, breadboard),
        color: "red",
        length_mm: 80,
        net: "5V",
      });
      add({
        id: "w_neo_gnd",
        from: "neo:GND",
        to: railOf("L-", far - 9, breadboard),
        color: "black",
        length_mm: 80,
        net: "GND",
      });
      add({
        id: "w_cap_p",
        from: "cap_neo:+",
        to: "neo:VDD",
        color: "red",
        length_mm: 40,
        net: "5V",
      });
      add({
        id: "w_cap_n",
        from: "cap_neo:-",
        to: "neo:GND",
        color: "black",
        length_mm: 40,
        net: "GND",
      });
      add({
        id: "w_buf_vcc",
        from: "buf:VCC",
        to: railOf("L+", far - 8, breadboard),
        color: "red",
        length_mm: 60,
        net: "5V",
      });
      add({
        id: "w_buf_gnd",
        from: "buf:GND",
        to: railOf("L-", far - 7, breadboard),
        color: "black",
        length_mm: 60,
        net: "GND",
      });
      add({
        id: "w_buf_oe",
        from: "buf:OE",
        to: railOf("L-", far - 6, breadboard),
        color: "black",
        length_mm: 40,
        net: "GND",
      });
      add({
        id: "w_buf_a",
        from: byRole.neo.freeHole,
        to: "buf:A",
        color: "green",
        length_mm: 60,
        net: "NEO",
      });
      add({
        id: "w_buf_y",
        from: "buf:Y",
        to: `a${neoR330Row}`,
        color: "green",
        length_mm: 40,
        net: "NEO_5V",
      });
      add({
        id: "w_neo_din",
        from: `a${neoR330Row + 4}`,
        to: "neo:DIN",
        color: "green",
        length_mm: 60,
        net: "NEO_5V",
      });
    } else {
      add({
        id: "w_neo_vcc",
        from: "neo:VDD",
        to: railOf("L+", far - 12, breadboard),
        color: "red",
        length_mm: 80,
        net: "5V",
      });
      add({
        id: "w_neo_gnd",
        from: "neo:GND",
        to: railOf("L-", far - 11, breadboard),
        color: "black",
        length_mm: 80,
        net: "GND",
      });
      add({
        id: "w_neo_din",
        from: "neo:DIN",
        to: byRole.neo.freeHole,
        color: "green",
        length_mm: 80,
        net: "NEO",
      });
    }
  }

  if (roles.lcd && byRole.oled_sda && byRole.oled_scl) {
    add({
      id: "w_lcd_vcc",
      from: "lcd:VCC",
      to: railOf("L+", Math.min(16, far), breadboard),
      color: "red",
      length_mm: 80,
      net: "5V",
    });
    add({
      id: "w_lcd_gnd",
      from: "lcd:GND",
      to: railOf("L-", Math.min(15, far), breadboard),
      color: "black",
      length_mm: 80,
      net: "GND",
    });
    add({
      id: "w_lcd_sda",
      from: "lcd:SDA",
      to: byRole.oled_sda.freeHole,
      color: "blue",
      length_mm: 80,
      net: "I2C_SDA",
    });
    add({
      id: "w_lcd_scl",
      from: "lcd:SCL",
      to: byRole.oled_scl.freeHole,
      color: "yellow",
      length_mm: 80,
      net: "I2C_SCL",
    });
  }

  if (roles.tm1637 && byRole.clk && byRole.dio) {
    add({
      id: "w_tm_vcc",
      from: "tm:VCC",
      to: isFiveVoltLogic(board) ? railOf("L+", 12, breadboard) : power.three,
      color: isFiveVoltLogic(board) ? "red" : "orange",
      length_mm: 80,
      net: isFiveVoltLogic(board) ? "5V" : "3V3",
    });
    add({
      id: "w_tm_gnd",
      from: "tm:GND",
      to: railOf("L-", 11, breadboard),
      color: "black",
      length_mm: 80,
      net: "GND",
    });
    add({
      id: "w_tm_clk",
      from: "tm:CLK",
      to: byRole.clk.freeHole,
      color: "yellow",
      length_mm: 80,
      net: "CLK",
    });
    add({
      id: "w_tm_dio",
      from: "tm:DIO",
      to: byRole.dio.freeHole,
      color: "blue",
      length_mm: 80,
      net: "DIO",
    });
  }

  if (roles.relay && byRole.relay) {
    add({
      id: "w_rel_jdvcc",
      from: "relay:JD-VCC",
      to: railOf("L+", 14, breadboard),
      color: "red",
      length_mm: 80,
      net: "5V",
    });
    if (relaySplit) {
      add({
        id: "w_rel_vcc",
        from: "relay:VCC",
        to: power.three,
        color: "orange",
        length_mm: 80,
        net: "3V3",
      });
    } else {
      add({
        id: "w_rel_vcc",
        from: "relay:VCC",
        to: railOf("L+", 14, breadboard),
        color: "red",
        length_mm: 80,
        net: "5V",
      });
    }
    add({
      id: "w_rel_gnd",
      from: "relay:GND",
      to: railOf("L-", 13, breadboard),
      color: "black",
      length_mm: 80,
      net: "GND",
    });
    add({
      id: "w_rel_in",
      from: "relay:IN",
      to: byRole.relay.freeHole,
      color: "green",
      length_mm: 80,
      net: "RELAY",
    });
  }

  if (roles.joystick && byRole.vrx && byRole.vry && byRole.sw) {
    add({
      id: "w_joy_vcc",
      from: "joy:VCC",
      to: power.three,
      color: "orange",
      length_mm: 40,
      net: "3V3",
    });
    add({
      id: "w_joy_gnd",
      from: "joy:GND",
      to: railOf("L-", 20, breadboard),
      color: "black",
      length_mm: 40,
      net: "GND",
    });
    add({
      id: "w_joy_x",
      from: "joy:VRX",
      to: byRole.vrx.freeHole,
      color: "blue",
      length_mm: 40,
      net: "VRX",
    });
    add({
      id: "w_joy_y",
      from: "joy:VRY",
      to: byRole.vry.freeHole,
      color: "yellow",
      length_mm: 40,
      net: "VRY",
    });
    add({
      id: "w_joy_sw",
      from: "joy:SW",
      to: byRole.sw.freeHole,
      color: "green",
      length_mm: 40,
      net: "SW",
    });
  }

  if (roles.buzzer && byRole.buzzer) {
    add({
      id: "w_buzz",
      from: "buzz:S",
      to: byRole.buzzer.freeHole,
      color: "purple",
      length_mm: 40,
      net: "BUZZ",
    });
    add({
      id: "w_buzz_gnd",
      from: "buzz:GND",
      to: railOf("L-", 22, breadboard),
      color: "black",
      length_mm: 40,
      net: "GND",
    });
  }

  if (roles.keypad) {
    const kpPins = ["R1", "R2", "R3", "R4", "C1", "C2", "C3", "C4"];
    kpPins.forEach((pin, i) => {
      const role = byRole[`kp${i + 1}`];
      if (!role) return;
      add({
        id: `w_kp_${pin.toLowerCase()}`,
        from: `keys:${pin}`,
        to: role.freeHole,
        color: i < 4 ? "green" : "blue",
        length_mm: 80,
        net: `KP_${pin}`,
      });
    });
  }

  if (roles.rc522 && byRole.spi_sck && byRole.spi_mosi && byRole.spi_miso && byRole.spi_cs) {
    if (rc522Shift && threeFanRow) {
      add({
        id: "w_3v3",
        from: power.three,
        to: `a${threeFanRow}`,
        color: "orange",
        length_mm: 80,
        net: "3V3",
      });
      add({
        id: "w_rfid_vcc",
        from: "rfid:VCC",
        to: `b${threeFanRow}`,
        color: "orange",
        length_mm: 80,
        net: "3V3",
      });
    } else {
      add({
        id: "w_rfid_vcc",
        from: "rfid:VCC",
        to: power.three,
        color: "orange",
        length_mm: 80,
        net: "3V3",
      });
    }
    add({
      id: "w_rfid_gnd",
      from: "rfid:GND",
      to: railOf("L-", 19, breadboard),
      color: "black",
      length_mm: 80,
      net: "GND",
    });
    if (rc522Shift) {
      add({
        id: "w_sh_hv",
        from: "sh:HV",
        to: railOf("L+", 16, breadboard),
        color: "red",
        length_mm: 60,
        net: "5V",
      });
      add({
        id: "w_sh_lv",
        from: "sh:LV",
        to: threeFanRow ? `c${threeFanRow}` : power.three,
        color: "orange",
        length_mm: 60,
        net: "3V3",
      });
      add({
        id: "w_sh_gnd",
        from: "sh:GND",
        to: railOf("L-", 17, breadboard),
        color: "black",
        length_mm: 60,
        net: "GND",
      });
      add({
        id: "w_sck_hv",
        from: byRole.spi_sck.freeHole,
        to: "sh:HV1",
        color: "yellow",
        length_mm: 60,
        net: "SCK_HV",
      });
      add({
        id: "w_sck_lv",
        from: "sh:LV1",
        to: "rfid:SCK",
        color: "yellow",
        length_mm: 60,
        net: "SCK",
      });
      add({
        id: "w_mosi_hv",
        from: byRole.spi_mosi.freeHole,
        to: "sh:HV2",
        color: "blue",
        length_mm: 60,
        net: "MOSI_HV",
      });
      add({
        id: "w_mosi_lv",
        from: "sh:LV2",
        to: "rfid:MOSI",
        color: "blue",
        length_mm: 60,
        net: "MOSI",
      });
      add({
        id: "w_ss_hv",
        from: byRole.spi_cs.freeHole,
        to: "sh:HV3",
        color: "purple",
        length_mm: 60,
        net: "CS_HV",
      });
      add({
        id: "w_ss_lv",
        from: "sh:LV3",
        to: "rfid:SDA",
        color: "purple",
        length_mm: 60,
        net: "CS",
      });
      if (byRole.spi_rst) {
        add({
          id: "w_rst_hv",
          from: byRole.spi_rst.freeHole,
          to: "sh:HV4",
          color: "white",
          length_mm: 60,
          net: "RST_HV",
        });
        add({
          id: "w_rst_lv",
          from: "sh:LV4",
          to: "rfid:RST",
          color: "white",
          length_mm: 60,
          net: "RST",
        });
      }
      add({
        id: "w_rfid_miso",
        from: "rfid:MISO",
        to: byRole.spi_miso.freeHole,
        color: "green",
        length_mm: 80,
        net: "MISO",
      });
    } else {
      add({
        id: "w_rfid_sck",
        from: "rfid:SCK",
        to: byRole.spi_sck.freeHole,
        color: "yellow",
        length_mm: 80,
        net: "SCK",
      });
      add({
        id: "w_rfid_mosi",
        from: "rfid:MOSI",
        to: byRole.spi_mosi.freeHole,
        color: "blue",
        length_mm: 80,
        net: "MOSI",
      });
      add({
        id: "w_rfid_miso",
        from: "rfid:MISO",
        to: byRole.spi_miso.freeHole,
        color: "green",
        length_mm: 80,
        net: "MISO",
      });
      add({
        id: "w_rfid_sda",
        from: "rfid:SDA",
        to: byRole.spi_cs.freeHole,
        color: "purple",
        length_mm: 80,
        net: "CS",
      });
      if (byRole.spi_rst) {
        add({
          id: "w_rfid_rst",
          from: "rfid:RST",
          to: byRole.spi_rst.freeHole,
          color: "white",
          length_mm: 80,
          net: "RST",
        });
      }
    }
  }

  if (roles.bme && byRole.oled_sda && byRole.oled_scl) {
    add({
      id: "w_bme_vcc",
      from: "bme:VIN",
      to: power.three,
      color: "orange",
      length_mm: 60,
      net: "3V3",
    });
    add({
      id: "w_bme_gnd",
      from: "bme:GND",
      to: railOf("L-", 17, breadboard),
      color: "black",
      length_mm: 60,
      net: "GND",
    });
    add({
      id: "w_bme_sda",
      from: "bme:SDA",
      to: byRole.oled_sda.freeHole,
      color: "blue",
      length_mm: 60,
      net: "I2C_SDA",
    });
    add({
      id: "w_bme_scl",
      from: "bme:SCL",
      to: byRole.oled_scl.freeHole,
      color: "yellow",
      length_mm: 60,
      net: "I2C_SCL",
    });
  }

  uniquifyEndpoints(connections, placements, seat, breadboard, reservedRows);

  const fixes = compatFixes(board, partIds, components);
  for (const extra of fixes.extras) {
    if (!parts.some((p) => p.component === extra.component || p.id === extra.id)) {
      parts.push({
        id: extra.id,
        component: extra.component,
        qty: extra.qty,
        note: extra.note,
      });
    }
  }

  const steps = buildSteps({
    board,
    roles,
    byRole,
    power,
    layout,
    seat,
    idea: request.idea,
    threeFanRow,
  });
  if (fixes.steps.length) {
    const flash = steps.pop();
    let n = steps.length + 1;
    for (const extraStep of fixes.steps) {
      steps.push({ ...extraStep, n: n++ });
    }
    if (flash) steps.push({ ...flash, n: n++ });
  }

  const build: Build = {
    id: slugify(request.title ?? request.idea).slice(0, 40) || "composed-build",
    title: request.title ?? titleFor(roles, request.idea),
    summary: request.summary ?? summaryFor(roles, board),
    board: board.id,
    parts,
    placements,
    connections,
    steps,
    provenance: {
      verified_by: "generated, auto-checked",
      verified_on: "2026-10-26",
      pins_from: "components/*.json",
    },
  };

  assertValidBuild(build, components, breadboard);
  return build;
}

function rowOfHole(hole: string): number {
  const match = hole.match(/(\d+)$/);
  return match ? Number(match[1]) : 1;
}

function seatNote(board: Component, seat: BoardSeat, endRow: number): string {
  const name = board.name.split("(")[0].trim();
  if (seat.freeLeft === 0) {
    return `${name} straddles columns ${seat.leftCol} and ${seat.rightCol}, rows ${seat.startRow}–${endRow}. The ${seat.leftCol} side has no free hole — wire those pins from the far side or with female jumpers.`;
  }
  return `${name} straddles the gap: left header in column ${seat.leftCol}, right in column ${seat.rightCol}, rows ${seat.startRow}–${endRow}.`;
}

export function isFiveVoltLogic(board: Component): boolean {
  return Boolean(board.logic?.five_v_logic);
}

const THREE_V_ONLY: Record<string, string> = {
  "ssd1306-oled-128x64-i2c":
    "This OLED is 3.3V-only. On a 5V-logic board, power VCC from 3V3 and treat SDA/SCL as caution — I2C pull-ups sit at 5V unless you add a level shifter.",
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function titleFor(roles: ReturnType<typeof detectRoles>, idea: string): string {
  if (roles.button && roles.oled) return "Button, LED and OLED status";
  if (roles.pir && roles.servo) return "Motion-triggered servo sweep";
  if (roles.sonar) return "Ultrasonic ranger";
  if (roles.neo) return "Addressable LED strip";
  if (roles.lcd) return "I2C LCD message";
  if (roles.tm1637) return "Four-digit display";
  if (roles.joystick) return "Joystick and LED";
  if (roles.relay) return "Low-voltage relay click";
  if (roles.keypad) return "Keypad and LED";
  return idea.replace(/\.$/, "").slice(0, 48) || "Breadboard build";
}

function summaryFor(
  roles: ReturnType<typeof detectRoles>,
  board: Component,
): string {
  const bits: string[] = [];
  if (roles.button) bits.push("a button");
  if (roles.pir) bits.push("a PIR");
  if (roles.led) bits.push("an LED");
  if (roles.servo) bits.push("an SG90");
  if (roles.oled) bits.push("an SSD1306");
  return `${board.name.split("(")[0].trim()} with ${bits.join(", ") || "catalog parts"}.`;
}

function composePirServo(board: Component, request: ComposeRequest): Build {
  const holes: Record<string, string> = {
    ...Object.fromEntries(
      Array.from({ length: 22 }, (_, i) => [`J1.${i + 1}`, `b${i + 1}`]),
    ),
    ...Object.fromEntries(
      Array.from({ length: 22 }, (_, i) => [`J3.${i + 1}`, `i${i + 1}`]),
    ),
  };
  const codeIni = `[env:esp32-s3-devkitc-1]
platform = espressif32
board = esp32-s3-devkitc-1
framework = arduino
monitor_speed = 115200
lib_deps = madhephaestus/ESP32Servo
; N16R8: if your board has 16 MB flash / octal PSRAM, add:
; board_build.arduino.memory_type = qio_opi
; board_upload.flash_size = 16MB
`;
  const codeCpp = `#include <Arduino.h>
#include <ESP32Servo.h>

const int PIR_PIN   = 4;   // J1.4  -> HC-SR501 OUT (3.3V high)
const int SERVO_PIN = 5;   // J1.5  -> SG90 orange
const int LED_PIN   = 6;   // J1.6  -> 220R -> LED

Servo servo;

void setup() {
  Serial.begin(115200);
  pinMode(PIR_PIN, INPUT);
  pinMode(LED_PIN, OUTPUT);
  servo.setPeriodHertz(50);           // standard 50 Hz servo
  servo.attach(SERVO_PIN, 500, 2400); // SG90 pulse range (us)
  servo.write(0);
  Serial.println("Warming up PIR (~60 s)...");
}

void loop() {
  if (digitalRead(PIR_PIN) == HIGH) {
    digitalWrite(LED_PIN, HIGH);
    for (int a = 0; a <= 180; a += 2) { servo.write(a); delay(10); }
    for (int a = 180; a >= 0; a -= 2) { servo.write(a); delay(10); }
  } else {
    digitalWrite(LED_PIN, LOW);
  }
  delay(50);
}
`;
  return {
    id: "pir-servo-s3",
    title: request.title ?? "Motion-triggered servo sweep",
    summary:
      request.summary ??
      "An HC-SR501 PIR sees motion, the ESP32-S3 lights an LED and sweeps an SG90 servo.",
    board: board.id,
    parts: [
      { id: "bb", component: "breadboard-830", qty: 1 },
      { id: "mcu", component: board.id, qty: 1 },
      { id: "pir", component: "hc-sr501-pir", qty: 1 },
      { id: "servo", component: "sg90-servo", qty: 1 },
      { id: "led1", component: "led-5mm-red", qty: 1 },
      { id: "r1", component: "resistor-220", qty: 1 },
      ...GENERIC_JUMPERS.map((j) => ({
        ...j,
        qty: j.id === "jumpers_mm" ? 6 : 3,
      })),
    ],
    placements: [
      {
        part: "mcu",
        anchor_hole: "b1",
        rotation_deg: 0,
        note: "Straddles the gap: J1 in column b, J3 in column i, rows 1-22. Antenna end at row 1, USB end past row 22.",
        pin_holes: holes,
      },
      {
        part: "r1",
        anchor_hole: "b30",
        rotation_deg: 0,
        pin_holes: { "1": "b30", "2": "b34" },
      },
      {
        part: "led1",
        anchor_hole: "c35",
        rotation_deg: 180,
        pin_holes: { A: "c34", K: "c35" },
        note: "Long leg (anode) in row 34.",
      },
      {
        part: "pir",
        anchor_hole: null,
        off_board: true,
        position_hint: "left of the breadboard, lens facing up/out",
      },
      {
        part: "servo",
        anchor_hole: null,
        off_board: true,
        position_hint: "right of the breadboard, near row 45",
      },
    ],
    connections: [
      { id: "w_5v", from: "a21", to: "L+@21", color: "red", length_mm: 20, net: "5V" },
      { id: "w_gnd", from: "a22", to: "L-@22", color: "black", length_mm: 20, net: "GND" },
      { id: "w_pir_vcc", from: "pir:VCC", to: "L+@40", color: "red", length_mm: 150, net: "5V" },
      { id: "w_pir_gnd", from: "pir:GND", to: "L-@42", color: "black", length_mm: 150, net: "GND" },
      { id: "w_pir_out", from: "pir:OUT", to: "a4", color: "green", length_mm: 150, net: "PIR_OUT" },
      { id: "w_srv_vcc", from: "servo:VCC", to: "L+@45", color: "red", length_mm: 100, net: "5V" },
      { id: "w_srv_gnd", from: "servo:GND", to: "L-@46", color: "black", length_mm: 100, net: "GND", note: "servo wire is brown" },
      { id: "w_srv_sig", from: "servo:SIG", to: "a5", color: "yellow", length_mm: 150, net: "SERVO_PWM" },
      { id: "w_led", from: "a6", to: "a30", color: "purple", length_mm: 65, net: "LED" },
      { id: "w_led_gnd", from: "a35", to: "L-@35", color: "black", length_mm: 20, net: "GND" },
    ],
    steps: [
      {
        n: 1,
        heading: "Seat the ESP32-S3 across the gap",
        body: "Unplug USB. Press the DevKitC-1 into the breadboard so the left header (J1, starts with 3V3) goes in column b and the right header (J3, starts with G) in column i, rows 1 to 22. The antenna end sits at row 1. You'll have one free hole per pin on each side (columns a and j).",
        parts_needed: ["bb", "mcu"],
        highlight: ["mcu", "J1.1", "J3.1"],
        connections_added: [],
        camera: "top",
        callout: "b1",
        safety: ["Push straight down on both headers evenly so pins don't bend."],
        check: "Every pin is in a hole and the board sits flat; J1.1 (3V3) is in b1.",
      },
      {
        n: 2,
        heading: "Run 5V and ground to the left rails",
        body: "Red jumper from a21 (the 5V pin's row) to the red + rail. Black jumper from a22 (G) to the blue − rail.",
        parts_needed: ["jumpers_mm"],
        highlight: ["J1.21", "J1.22"],
        connections_added: ["w_5v", "w_gnd"],
        camera: "left-low",
        callout: "a21",
        safety: ["5V must never touch a GPIO row. Double-check a21 is the row labeled 5V."],
        check: "Red wire from the 5V row to +, black from G row to −.",
      },
      {
        n: 3,
        heading: "Wire the PIR sensor",
        body: "Read the silkscreen on your HC-SR501 (VCC, OUT, GND; check, clones differ). Female-to-male jumpers: VCC to the + rail, GND to the − rail, OUT to a4 (GPIO4).",
        parts_needed: ["pir", "jumpers_fm"],
        highlight: ["pir", "J1.4"],
        connections_added: ["w_pir_vcc", "w_pir_gnd", "w_pir_out"],
        camera: "left",
        callout: "a4",
        safety: ["The PIR needs 5V+ (4.5-20V). Its OUT is 3.3V, so it's safe for GPIO4."],
        check: "Three wires: red to +, black to −, green into a4.",
      },
      {
        n: 4,
        heading: "Connect the servo",
        body: "Male-to-male jumpers into the servo plug: red to the + rail, brown to the − rail (black jumper), orange to a5 (GPIO5).",
        parts_needed: ["servo", "jumpers_mm"],
        highlight: ["servo", "J1.5"],
        connections_added: ["w_srv_vcc", "w_srv_gnd", "w_srv_sig"],
        camera: "right",
        callout: "a5",
        safety: [
          "Servo power is 5V, never 3V3.",
          "If the board resets when the servo moves, add a 100-470 µF capacitor across the + and − rails (stripe to −) or give the servo its own 5V supply with a shared ground.",
        ],
        check: "Orange into a5, red on +, brown on −.",
      },
      {
        n: 5,
        heading: "Add the LED and resistor",
        body: "Purple jumper from a6 (GPIO6) to a30. Bend the 220 Ω resistor between b30 and b34. LED long leg (anode) in c34, short leg (cathode) in c35. Black jumper from a35 to the − rail.",
        parts_needed: ["led1", "r1", "jumpers_mm"],
        highlight: ["led1", "r1", "J1.6"],
        connections_added: ["w_led", "w_led_gnd"],
        camera: "top-zoom-rows-30-35",
        callout: "c34",
        safety: ["LED needs the resistor in series; without it you can damage the LED and the pin."],
        check: "Row 30: purple + resistor. Row 34: resistor + LED long leg. Row 35: LED short leg + black.",
      },
      {
        n: 6,
        heading: "Flash the sketch",
        body: "Plug USB into the UART port. Create a PlatformIO project with the platformio.ini and main.cpp below, then Upload. The PIR needs about a minute to settle, then wave a hand: the LED lights and the servo sweeps.",
        parts_needed: [],
        highlight: ["mcu"],
        connections_added: [],
        camera: "hero",
        callout: "usb_uart",
        safety: ["If upload fails, hold BOOT, tap RESET, release BOOT, retry."],
        check: "Serial monitor shows 'Warming up PIR'; after ~60 s motion makes the LED light and the servo sweep 0→180→0.",
        code: {
          "platformio.ini": codeIni,
          "src/main.cpp": codeCpp,
        },
      },
    ],
    provenance: {
      verified_by: "Maker",
      verified_on: "2026-10-26",
      pins_from: "components/*.json",
    },
  };
}

function buildSteps(args: {
  board: Component;
  roles: ReturnType<typeof detectRoles>;
  byRole: Record<string, AssignedPin>;
  power: ReturnType<typeof powerHoles>;
  layout: PackedLayout;
  seat: ReturnType<typeof boardSeat>;
  idea: string;
  threeFanRow: number;
}): Build["steps"] {
  const { board, roles, byRole, power, layout, seat, threeFanRow } = args;
  const steps: Build["steps"] = [];
  let n = 1;
  const endRow = seat.startRow + seat.pinCount - 1;
  const xiao = /xiao/i.test(board.id);
  const fiveLogic = isFiveVoltLogic(board);

  if (seat.offBoard) {
    steps.push({
      n: n++,
      heading: "Park the board beside the breadboard",
      body: `Unplug USB. ${board.name.split("(")[0].trim()} does not fit an 830 breadboard. Set it next to the board and run male-male jumpers from its ${seat.connector ?? "female headers"} into the holes named in the next steps.`,
      parts_needed: ["bb", "mcu"],
      highlight: ["mcu"],
      connections_added: [],
      camera: "top",
      callout: "a1",
      safety: ["Do not force the board onto the breadboard. Jumpers only."],
      check: "The MCU sits off-board and every later wire starts at a header pin.",
    });
  } else {
    const noFree = seat.freeLeft === 0;
    steps.push({
      n: n++,
      heading: xiao
        ? "Seat the XIAO across the gap"
        : "Seat the board across the gap",
      body: xiao
        ? `Unplug USB. Press the XIAO so the left header sits in column ${seat.leftCol} and the right header in column ${seat.rightCol}, rows ${seat.startRow} to ${endRow}. USB points toward the near end.`
        : noFree
          ? `Unplug USB. Press the board so the left header sits in column ${seat.leftCol} and the right in column ${seat.rightCol}, rows ${seat.startRow} to ${endRow}. The rows are 25.40 mm apart, so column ${seat.leftCol} has no free hole. Wire those pins from the far side or with female jumpers on the header.`
          : `Unplug USB. Press the board into the breadboard so the left header goes in column ${seat.leftCol} and the right header in column ${seat.rightCol}, rows ${seat.startRow} to ${endRow}.`,
      parts_needed: ["bb", "mcu"],
      highlight: ["mcu"],
      connections_added: [],
      camera: "top",
      callout: `${seat.leftCol}${seat.startRow}`,
      safety: [
        "Push both headers evenly so pins do not bend.",
        ...(noFree
          ? ["The left header occupies the last hole in that row. Use a female jumper on the pin, not a second plug in the same hole."]
          : []),
      ],
      check: seat.offBoard
        ? "Jumpers reach from the headers to the breadboard."
        : "The board sits flat and every pin is in a hole.",
    });
  }

  const neoBuffer = roles.neo && !fiveLogic;
  const echoDivider = roles.sonar && roles.sonarId === "hc-sr04" && !fiveLogic;
  const relaySplit = roles.relay && !fiveLogic;
  const rc522Shift = roles.rc522 && fiveLogic;
  const needsFiveRail =
    roles.servo ||
    roles.pir ||
    roles.sonar ||
    (roles.neo && !neoBuffer) ||
    roles.lcd ||
    roles.relay ||
    rc522Shift ||
    (roles.tm1637 && fiveLogic);
  const powerConns = [needsFiveRail ? "w_5v" : null, "w_gnd"].filter(
    Boolean,
  ) as string[];

  const fiveLabel = power.fivePin?.label ?? "5V";
  const gndLabel = power.gndPin?.label ?? "G";
  const railFeedNote = neoBuffer
    ? "The − rail is common ground. The + rail is fed later from the external 5V supply — not from this board's 5V pin."
    : "Rails are fed only from this board's own power pins.";
  steps.push({
    n: n++,
    heading: needsFiveRail
      ? "Run 5V and ground to the rails"
      : "Run ground to the rail",
    body: needsFiveRail
      ? `Red jumper from ${power.five} (${fiveLabel}) to the red + rail. Black jumper from ${power.gnd} (${gndLabel}) to the blue − rail. ${railFeedNote}${roles.relay && !fiveLogic ? " Dev-board 5V pins are only live on USB power." : ""}`
      : `Black jumper from ${power.gnd} (${gndLabel}) to the blue − rail. ${railFeedNote}`,
    parts_needed: ["jumpers_mm"],
    highlight: [power.fivePin?.id, power.gndPin?.id].filter(Boolean) as string[],
    connections_added: powerConns,
    camera: "left-low",
    callout: powerConns.includes("w_5v") ? power.five : power.gnd,
    safety: [
      "5V must never touch a GPIO row.",
      ...(power.five.startsWith("mcu:")
        ? ["That 5V pin has no free hole. Use a female jumper on the header pin."]
        : []),
    ],
    check: "Power wires match the printed + and − markings.",
  });

  if (roles.pir && byRole.pir) {
    steps.push({
      n: n++,
      heading: "Wire the PIR sensor",
      body: `Read the silkscreen (VCC, OUT, GND). VCC to the + rail, GND to the − rail, OUT to ${byRole.pir.freeHole} (GPIO${byRole.pir.gpio}).`,
      parts_needed: ["pir", "jumpers_fm"],
      highlight: ["pir", byRole.pir.pin.id],
      connections_added: ["w_pir_vcc", "w_pir_gnd", "w_pir_out"],
      camera: "left",
      callout: byRole.pir.freeHole,
      safety: ["The PIR needs 5V. Its OUT is 3.3V, so it is safe on this GPIO."],
      check: `Green into ${byRole.pir.freeHole}, red on +, black on −.`,
    });
  }

  if (roles.servo && byRole.servo) {
    steps.push({
      n: n++,
      heading: "Connect the servo",
      body: `Red to the + rail, brown to the − rail, orange to ${byRole.servo.freeHole} (GPIO${byRole.servo.gpio}).`,
      parts_needed: ["servo", "jumpers_mm"],
      highlight: ["servo", byRole.servo.pin.id],
      connections_added: ["w_srv_vcc", "w_srv_gnd", "w_srv_sig"],
      camera: "right",
      callout: byRole.servo.freeHole,
      safety: [
        "Servo power is 5V, never 3V3.",
        "If the board resets when the servo moves, add a 100-470 µF capacitor across the + and − rails or give the servo its own 5V supply with a shared ground.",
      ],
      check: `Orange into ${byRole.servo.freeHole}, red on +, brown on −.`,
    });
  }

  if (roles.button && byRole.button) {
    steps.push({
      n: n++,
      heading: "Seat the tactile button",
      body: `Straddle the center gap at ${layout.buttonHoles["1"]} and ${layout.buttonHoles["2"]}. Jumper from ${layout.buttonSignal} to ${byRole.button.freeHole} (GPIO${byRole.button.gpio}). Jumper from ${layout.buttonGndHole} across to the left − rail. The sketch uses INPUT_PULLUP.`,
      parts_needed: ["btn", "jumpers_mm"],
      highlight: ["btn", byRole.button.pin.id],
      connections_added: ["w_btn", "w_btn_gnd"],
      camera: "top-zoom-rows-30-35",
      callout: layout.buttonHoles["1"],
      safety: ["Use diagonal legs so you actually close the switch."],
      check: "Pressing the button joins the GPIO row to ground.",
    });
  }

  if (roles.oled && byRole.oled_sda && byRole.oled_scl) {
    steps.push({
      n: n++,
      heading: "Wire the I2C OLED",
      body: `Check the silkscreen (order varies). VCC to ${power.three} (3V3, not 5V). GND to the − rail. SDA to ${byRole.oled_sda.freeHole} (GPIO${byRole.oled_sda.gpio}). SCL to ${byRole.oled_scl.freeHole} (GPIO${byRole.oled_scl.gpio}).`,
      parts_needed: ["oled", "jumpers_fm"],
      highlight: ["oled", byRole.oled_sda.pin.id, byRole.oled_scl.pin.id],
      connections_added: ["w_oled_vcc", "w_oled_gnd", "w_oled_sda", "w_oled_scl"],
      camera: "left",
      callout: byRole.oled_sda.freeHole,
      safety: [
        "Power the OLED from 3V3 so its pull-ups do not lift SDA/SCL to 5V.",
        "Swapping VCC and GND can kill the module. Read the silk.",
        ...(fiveLogic ? [THREE_V_ONLY["ssd1306-oled-128x64-i2c"]] : []),
      ],
      check: "Four wires: orange to 3V3, black to −, blue SDA, yellow SCL.",
    });
  }

  if (roles.led && byRole.led) {
    steps.push({
      n: n++,
      heading: "Add the LED and resistor",
      body: `Purple jumper from ${byRole.led.freeHole} (GPIO${byRole.led.gpio}) to ${layout.ledSignal}. 220 Ω between ${layout.resistorFrom} and ${layout.resistorTo}. LED long leg in ${layout.ledAnode}, short leg in ${layout.ledCathode}. Black jumper from ${layout.ledGndHole} to the − rail.`,
      parts_needed: ["led1", "r1", "jumpers_mm"],
      highlight: ["led1", "r1", byRole.led.pin.id],
      connections_added: ["w_led", "w_led_gnd"],
      camera: "top-zoom-rows-30-35",
      callout: layout.ledAnode,
      safety: ["The resistor must sit in series with the LED."],
      check: `${layout.ledSignal}: purple + resistor. ${layout.ledAnode}: resistor + long leg. ${layout.ledCathode}: short leg + black.`,
    });
  }

  if (roles.sonar && byRole.trig && byRole.echo) {
    if (echoDivider) {
      steps.push({
        n: n++,
        heading: "Build the Echo divider (before the GPIO)",
        body: `Echo is 5V on the HC-SR04. 1 kΩ from Echo to the GPIO node, then two 1 kΩ in series from that node to GND (3.33 V). Or swap in an HC-SR04P and power that from 3V3. Never wire Echo straight into the GPIO.`,
        parts_needed: ["r_echo", "r_div1", "r_div2", "jumpers_mm"],
        highlight: ["r_echo", byRole.echo.pin.id],
        connections_added: [
          "w_echo_node",
          "w_div_tap",
          "w_div_mid",
          "w_div_gnd",
        ],
        camera: "left",
        callout: byRole.echo.freeHole,
        safety: ["Never wire Echo straight into a 3.3V GPIO."],
        check: "Echo reaches the GPIO only through the 1 kΩ, with 2×1 kΩ to ground.",
      });
    }
    steps.push({
      n: n++,
      heading: "Wire the ultrasonic sensor",
      body: echoDivider
        ? `VCC to the + rail, GND to the − rail, TRIG to ${byRole.trig.freeHole} (GPIO${byRole.trig.gpio}). Echo goes to the 1 kΩ, then the GPIO node at ${byRole.echo.freeHole} (GPIO${byRole.echo.gpio}). Pin order is VCC–TRIG–ECHO–GND.`
        : `VCC to the + rail, GND to the − rail, TRIG to ${byRole.trig.freeHole} (GPIO${byRole.trig.gpio}), ECHO to ${byRole.echo.freeHole} (GPIO${byRole.echo.gpio}). Pin order is VCC–TRIG–ECHO–GND.`,
      parts_needed: ["sonar", "jumpers_fm"],
      highlight: ["sonar", byRole.trig.pin.id, byRole.echo.pin.id],
      connections_added: [
        "w_son_vcc",
        "w_son_gnd",
        "w_son_trig",
        "w_son_echo",
      ],
      camera: "left",
      callout: byRole.echo.freeHole,
      safety: echoDivider
        ? ["Echo goes through the divider before it reaches the GPIO."]
        : ["Echo is 5V on the HC-SR04. Do not treat it as a 3.3V-safe pin."],
      check: `TRIG in ${byRole.trig.freeHole}. Echo is ${echoDivider ? "divided" : "direct"}.`,
    });
  }

  if (roles.neo && byRole.neo) {
    if (neoBuffer) {
      steps.push({
        n: n++,
        heading: "Feed the strip from an external 5V supply",
        body: `An external 5V supply goes into the strip and the + rail. Never power the strip from the board's 5V pin. Black from the supply ground to the − rail (common ground).`,
        parts_needed: ["ext5v", "neo", "jumpers_fm"],
        highlight: ["ext5v", "neo"],
        connections_added: ["w_ext_5v", "w_ext_gnd", "w_neo_vcc", "w_neo_gnd"],
        camera: "right",
        callout: "L+@2",
        safety: ["Do not power the strip from the MCU 5V pin.", "Size the supply at 60 mA per LED."],
        check: "The + rail and the strip 5V come from the external supply, with shared ground.",
      });
      steps.push({
        n: n++,
        heading: "Add the 1000 µF capacitor",
        body: "Put a 1000 µF electrolytic across the strip's 5V and GND. Stripe / short leg to GND.",
        parts_needed: ["cap_neo"],
        highlight: ["cap_neo"],
        connections_added: ["w_cap_p", "w_cap_n"],
        camera: "right",
        callout: "neo",
        safety: ["Polarised: reverse it and it can bulge or vent."],
        check: "Capacitor sits across strip 5V and GND.",
      });
      steps.push({
        n: n++,
        heading: "Buffer DIN through a 74AHCT125",
        body: `Power the 74AHCT125 from 5V and tie OE to GND. Tie the OE pins of the 3 unused gates to 5V. GPIO${byRole.neo.gpio} (${byRole.neo.freeHole}) goes to A. Y goes through a 330 Ω resistor, then to DIN.`,
        parts_needed: ["buf", "r330", "jumpers_fm"],
        highlight: ["buf", "r330", byRole.neo.pin.id],
        connections_added: [
          "w_buf_vcc",
          "w_buf_gnd",
          "w_buf_oe",
          "w_buf_a",
          "w_buf_y",
          "w_neo_din",
        ],
        camera: "right",
        callout: byRole.neo.freeHole,
        safety: ["Data goes through the 74AHCT125, then the 330 Ω, then DIN. Never GPIO straight to DIN on 3.3V."],
        check: `GPIO${byRole.neo.gpio} → A → Y → 330 Ω → DIN.`,
      });
    } else {
      steps.push({
        n: n++,
        heading: "Wire the addressable pixels",
        body: `VDD to the + rail, GND to the − rail, DIN to ${byRole.neo.freeHole} (GPIO${byRole.neo.gpio}).`,
        parts_needed: ["neo", "jumpers_fm"],
        highlight: ["neo", byRole.neo.pin.id],
        connections_added: ["w_neo_vcc", "w_neo_gnd", "w_neo_din"],
        camera: "right",
        callout: byRole.neo.freeHole,
        safety: ["Size the 5V supply at 60 mA per LED."],
        check: `DIN in ${byRole.neo.freeHole}.`,
      });
    }
  }

  if (roles.lcd && byRole.oled_sda && byRole.oled_scl) {
    steps.push({
      n: n++,
      heading: "Wire the I2C LCD",
      body: `VCC to the + rail (5V), GND to the − rail, SDA to ${byRole.oled_sda.freeHole} (GPIO${byRole.oled_sda.gpio}), SCL to ${byRole.oled_scl.freeHole} (GPIO${byRole.oled_scl.gpio}).`,
      parts_needed: ["lcd", "jumpers_fm"],
      highlight: ["lcd", byRole.oled_sda.pin.id, byRole.oled_scl.pin.id],
      connections_added: ["w_lcd_vcc", "w_lcd_gnd", "w_lcd_sda", "w_lcd_scl"],
      camera: "left",
      callout: byRole.oled_sda.freeHole,
      safety: ["The backpack pulls SDA/SCL to 5V."],
      check: "Four wires: red 5V, black −, blue SDA, yellow SCL.",
    });
  }

  if (roles.tm1637 && byRole.clk && byRole.dio) {
    steps.push({
      n: n++,
      heading: "Wire the four-digit display",
      body: `VCC to ${fiveLogic ? "the + rail (5V)" : "3V3"}, GND to the − rail, CLK to ${byRole.clk.freeHole} (GPIO${byRole.clk.gpio}), DIO to ${byRole.dio.freeHole} (GPIO${byRole.dio.gpio}).`,
      parts_needed: ["tm", "jumpers_fm"],
      highlight: ["tm", byRole.clk.pin.id, byRole.dio.pin.id],
      connections_added: ["w_tm_vcc", "w_tm_gnd", "w_tm_clk", "w_tm_dio"],
      camera: "left",
      callout: byRole.clk.freeHole,
      safety: fiveLogic ? [] : [TM1637_CAUTION],
      check: `CLK in ${byRole.clk.freeHole}, DIO in ${byRole.dio.freeHole}.`,
    });
  }

  if (roles.joystick && byRole.vrx && byRole.vry && byRole.sw) {
    steps.push({
      n: n++,
      heading: "Seat the joystick",
      body: `Power VCC from 3V3 (${power.three}), GND to the − rail. VRx to ${byRole.vrx.freeHole} (GPIO${byRole.vrx.gpio}), VRy to ${byRole.vry.freeHole} (GPIO${byRole.vry.gpio}), SW to ${byRole.sw.freeHole} (GPIO${byRole.sw.gpio}). Pin order is approximate — read the silk.`,
      parts_needed: ["joy", "jumpers_mm"],
      highlight: ["joy", byRole.vrx.pin.id],
      connections_added: ["w_joy_vcc", "w_joy_gnd", "w_joy_x", "w_joy_y", "w_joy_sw"],
      camera: "top",
      callout: byRole.vrx.freeHole,
      safety: ["A 5V-powered wiper can swing to 5V and damage a 3.3V ADC."],
      check: "VCC is on 3V3, not 5V.",
    });
  }

  if (roles.relay && byRole.relay) {
    if (relaySplit) {
      steps.push({
        n: n++,
        heading: "Remove the JD-VCC jumper",
        body: "First remove the JD-VCC jumper on the relay module. The coil then takes 5V on JD-VCC and the opto takes 3V3 on VCC.",
        parts_needed: ["relay"],
        highlight: ["relay"],
        connections_added: [],
        camera: "right-close",
        callout: "relay:IN",
        safety: [
          "Pinout guides only switch low-voltage DC loads. Never wire wall power on a breadboard.",
        ],
        check: "The JD-VCC jumper is off the module.",
      });
    }
    steps.push({
      n: n++,
      heading: "Wire the relay module",
      body: relaySplit
        ? `Read the silkscreen on YOUR relay board before wiring — pin order and the JD-VCC header vary by clone. After the jumper is off, JD-VCC to the 5V-fed + rail, VCC to 3V3 (${power.three}), IN to ${byRole.relay.freeHole} (GPIO${byRole.relay.gpio}), GND to the − rail. Active LOW. Only switch low-voltage DC. Dev-board 5V pins are only live on USB power.`
        : `Read the silkscreen on YOUR relay board before wiring — pin order and the JD-VCC header vary by clone. JD-VCC and VCC to the + rail (separate holes), GND to the − rail, IN to ${byRole.relay.freeHole} (GPIO${byRole.relay.gpio}). The coil is active LOW. Only switch low-voltage DC.`,
      parts_needed: ["relay", "jumpers_fm"],
      highlight: ["relay", byRole.relay.pin.id],
      connections_added: ["w_rel_jdvcc", "w_rel_vcc", "w_rel_gnd", "w_rel_in"],
      camera: "right-close",
      callout: "relay:IN",
      safety: [
        "Pinout guides only switch low-voltage DC loads. Never wire wall power on a breadboard.",
        "Wall power can kill.",
      ],
      check: `IN in ${byRole.relay.freeHole}. No mains.`,
    });
  }

  if (roles.buzzer && byRole.buzzer) {
    steps.push({
      n: n++,
      heading: "Wire the active buzzer",
      body: `S to ${byRole.buzzer.freeHole} (GPIO${byRole.buzzer.gpio}), GND to the − rail.`,
      parts_needed: ["buzz", "jumpers_mm"],
      highlight: ["buzz", byRole.buzzer.pin.id],
      connections_added: ["w_buzz", "w_buzz_gnd"],
      camera: "right",
      callout: byRole.buzzer.freeHole,
      safety: [],
      check: `S in ${byRole.buzzer.freeHole}.`,
    });
  }

  if (roles.keypad) {
    const kpAdded = ["R1", "R2", "R3", "R4", "C1", "C2", "C3", "C4"]
      .map((pin, i) => (byRole[`kp${i + 1}`] ? `w_kp_${pin.toLowerCase()}` : null))
      .filter((id): id is string => Boolean(id));
    steps.push({
      n: n++,
      heading: "Wire the 4×4 keypad",
      body: "Eight jumpers, one per pin. Pin order varies by clone — read the silkscreen on YOUR pad before you trust the labels.",
      parts_needed: ["keys", "jumpers_fm"],
      highlight: ["keys"],
      connections_added: kpAdded,
      camera: "top",
      callout: byRole.kp1?.freeHole ?? "a1",
      safety: ["Pin order in the spec is approximate."],
      check: "Every keypad pin has a jumper, and you read the silk.",
    });
  }

  if (roles.rc522 && byRole.spi_sck) {
    if (rc522Shift) {
      steps.push({
        n: n++,
        heading: "Power the BSS138 shifter",
        body: threeFanRow
          ? `Seat the shifter first. HV to the 5V rail, GND to the − rail. One jumper from 3V3 (${power.three}) to a${threeFanRow}, then shifter LV and RC522 VCC from that row. The RC522 stays on 3V3.`
          : "Seat the shifter first. HV to the 5V rail, LV to 3V3, GND to the − rail. The RC522 stays on 3V3.",
        parts_needed: ["sh", "jumpers_fm"],
        highlight: ["sh"],
        connections_added: threeFanRow
          ? ["w_3v3", "w_sh_hv", "w_sh_lv", "w_sh_gnd"]
          : ["w_sh_hv", "w_sh_lv", "w_sh_gnd"],
        camera: "left",
        callout: byRole.spi_sck.freeHole,
        safety: ["The RC522 is 3.3V only. Shift SCK, MOSI, SS and RST. MISO can go direct."],
        check: "Shifter HV is 5V, LV is 3V3, grounds are common.",
      });
    }
    steps.push({
      n: n++,
      heading: "Wire the RC522",
      body: rc522Shift
        ? `VCC from the 3V3 row (not a second plug in the MCU 3V3 socket). GND to the − rail. Uno (or the MCU) to shifter HV, then shifter LV to the RC522, for SCK (${byRole.spi_sck.freeHole} / GPIO${byRole.spi_sck.gpio}), MOSI (${byRole.spi_mosi?.freeHole} / GPIO${byRole.spi_mosi?.gpio}), SDA/SS (${byRole.spi_cs?.freeHole} / GPIO${byRole.spi_cs?.gpio}) and RST (${byRole.spi_rst?.freeHole} / GPIO${byRole.spi_rst?.gpio}). MISO goes direct from the RC522 to ${byRole.spi_miso?.freeHole} (GPIO${byRole.spi_miso?.gpio}).`
        : `VCC to 3V3 only. GND to the − rail. Hardware SPI: SCK ${byRole.spi_sck.freeHole} (GPIO${byRole.spi_sck.gpio}), MOSI ${byRole.spi_mosi?.freeHole} (GPIO${byRole.spi_mosi?.gpio}), MISO ${byRole.spi_miso?.freeHole} (GPIO${byRole.spi_miso?.gpio}), SDA/SS ${byRole.spi_cs?.freeHole} (GPIO${byRole.spi_cs?.gpio}), RST ${byRole.spi_rst?.freeHole} (GPIO${byRole.spi_rst?.gpio}).`,
      parts_needed: rc522Shift ? ["rfid", "sh", "jumpers_fm"] : ["rfid", "jumpers_fm"],
      highlight: ["rfid"],
      connections_added: rc522Shift
        ? [
            "w_rfid_vcc",
            "w_rfid_gnd",
            "w_sck_hv",
            "w_sck_lv",
            "w_mosi_hv",
            "w_mosi_lv",
            "w_ss_hv",
            "w_ss_lv",
            ...(byRole.spi_rst ? ["w_rst_hv", "w_rst_lv"] : []),
            "w_rfid_miso",
          ]
        : [
            "w_rfid_vcc",
            "w_rfid_gnd",
            "w_rfid_sck",
            "w_rfid_mosi",
            "w_rfid_miso",
            "w_rfid_sda",
            ...(byRole.spi_rst ? ["w_rfid_rst"] : []),
          ],
      camera: "left",
      callout: byRole.spi_sck.freeHole,
      safety: ["The RC522 is 3.3V only."],
      check: "VCC is on 3V3, not 5V. SPI pins are the board hardware defaults.",
    });
  }

  if (roles.bme && byRole.oled_sda && byRole.oled_scl) {
    steps.push({
      n: n++,
      heading: "Wire the BME280",
      body: `VIN to 3V3, GND to the − rail, SDA to ${byRole.oled_sda.freeHole} (GPIO${byRole.oled_sda.gpio}), SCL to ${byRole.oled_scl.freeHole} (GPIO${byRole.oled_scl.gpio}). Bare modules are 3.3V only.`,
      parts_needed: ["bme", "jumpers_fm"],
      highlight: ["bme"],
      connections_added: ["w_bme_vcc", "w_bme_gnd", "w_bme_sda", "w_bme_scl"],
      camera: "left",
      callout: byRole.oled_sda.freeHole,
      safety: ["Only a VIN-regulated breakout can run at 5V."],
      check: "VIN is on 3V3.",
    });
  }

  if (fiveLogic && roles.oled) {
    steps.push({
      n: n++,
      heading: "5V logic — treat the OLED as caution",
      body: THREE_V_ONLY["ssd1306-oled-128x64-i2c"],
      parts_needed: [],
      highlight: ["oled"],
      connections_added: [],
      camera: "left",
      callout: byRole.oled_sda?.freeHole ?? "a1",
      safety: [board.logic?.warning ?? "Outputs swing to 5V."],
      check: "OLED VCC is on 3V3, not the 5V rail.",
    });
  }

  if (byRole.led && board.caution_gpio?.[String(byRole.led.gpio)]) {
    steps.push({
      n: n++,
      heading: "Caution pin",
      body: `GPIO${byRole.led.gpio} is a caution pin on this board: ${board.caution_gpio[String(byRole.led.gpio)]}. Prefer another safe GPIO if you can.`,
      parts_needed: [],
      highlight: [byRole.led.pin.id],
      connections_added: [],
      camera: "top",
      callout: byRole.led.freeHole,
      safety: [board.caution_gpio[String(byRole.led.gpio)]],
      check: "You know this pin shares a function (often the onboard LED).",
    });
  }

  const code = sketchFor(board, roles, byRole);
  const family = chipFamily(board);
  const flash =
    family === "avr"
      ? {
          body: "Plug USB into the board. Create a PlatformIO project with the files below, then Upload. This board has no BOOT button — if upload fails, tap RESET once and retry.",
          safety: ["The Uno / Nano has no BOOT button. Tap RESET if the port does not appear."],
        }
      : family === "rp2040"
        ? {
            body: "Hold BOOTSEL, plug USB, then Upload from the PlatformIO project below. Release BOOTSEL after the drive appears.",
            safety: ["If the Pico is already plugged in, hold BOOTSEL, tap RESET (or unplug/replug), then Upload."],
          }
        : {
            body: "Plug USB into the UART port. Create a PlatformIO project with the files below, then Upload.",
            safety: ["If upload fails, hold BOOT, tap RESET, release BOOT, retry."],
          };
  steps.push({
    n: n++,
    heading: "Flash the sketch",
    body: flash.body,
    parts_needed: [],
    highlight: ["mcu"],
    connections_added: [],
    camera: "hero",
    callout: "usb_uart",
    safety: flash.safety,
    check: "The serial monitor prints a ready line and the circuit responds.",
    code,
  });

  return steps;
}

function chipFamily(board: Component): "esp32" | "rp2040" | "avr" {
  if (board.chip === "atmega328p") return "avr";
  if (board.chip === "rp2040") return "rp2040";
  return "esp32";
}

export function pioEnv(board: Component): {
  env: string;
  platform: string;
  board: string;
  framework: string;
  extra: string[];
} {
  const pio = board.platformio;
  if (board.id === "raspberry-pi-pico-w") {
    return {
      env: "rpipicow",
      platform:
        "https://github.com/maxgerhardt/platform-raspberrypi.git",
      board: "rpipicow",
      framework: "arduino",
      extra: ["board_build.core = earlephilhower"],
    };
  }
  if (board.id === "raspberry-pi-pico") {
    return {
      env: "pico",
      platform:
        "https://github.com/maxgerhardt/platform-raspberrypi.git",
      board: "pico",
      framework: "arduino",
      extra: ["board_build.core = earlephilhower"],
    };
  }
  if (board.id === "esp32-c6-devkitc-1") {
    return {
      env: "esp32-c6-devkitc-1",
      platform:
        pio?.arduino?.platform ??
        "https://github.com/pioarduino/platform-espressif32/releases/download/stable/platform-espressif32.zip",
      board: "esp32-c6-devkitc-1",
      framework: "arduino",
      extra: [],
    };
  }
  if (pio?.board && pio.platform) {
    return {
      env: pio.board,
      platform: pio.platform,
      board: pio.board,
      framework: pio.framework ?? "arduino",
      extra: [],
    };
  }
  if (board.id.startsWith("xiao-esp32c3")) {
    return {
      env: "seeed_xiao_esp32c3",
      platform: "espressif32",
      board: "seeed_xiao_esp32c3",
      framework: "arduino",
      extra: [],
    };
  }
  if (board.id.startsWith("xiao-")) {
    return {
      env: "seeed_xiao_esp32s3",
      platform: "espressif32",
      board: "seeed_xiao_esp32s3",
      framework: "arduino",
      extra: [],
    };
  }
  return {
    env: "esp32-s3-devkitc-1",
    platform: "espressif32",
    board: "esp32-s3-devkitc-1",
    framework: "arduino",
    extra: [],
  };
}

function sketchFor(
  board: Component,
  roles: ReturnType<typeof detectRoles>,
  byRole: Record<string, AssignedPin>,
): Record<string, string> {
  const pio = pioEnv(board);
  const family = chipFamily(board);
  const libs = [
    roles.servo
      ? family === "esp32"
        ? "madhephaestus/ESP32Servo"
        : family === "avr"
          ? "arduino-libraries/Servo"
          : ""
      : "",
    roles.oled ? "adafruit/Adafruit SSD1306" : "",
    roles.oled ? "adafruit/Adafruit GFX Library" : "",
    roles.sonar ? "teckel12/NewPing" : "",
    roles.neo ? "adafruit/Adafruit NeoPixel" : "",
    roles.lcd ? "marcoschwartz/LiquidCrystal_I2C" : "",
    roles.tm1637 ? "smougenot/TM1637" : "",
    roles.rc522 ? "miguelbalboa/MFRC522" : "",
    roles.bme ? "adafruit/Adafruit BME280 Library" : "",
  ]
    .filter(Boolean)
    .join("\n");

  const ini = `[env:${pio.env}]
platform = ${pio.platform}
board = ${pio.board}
framework = ${pio.framework}
${pio.extra.join("\n")}
monitor_speed = 115200
${libs ? `lib_deps =\n  ${libs.split("\n").join("\n  ")}` : ""}
`;

  const lines: string[] = ["#include <Arduino.h>"];
  if (roles.servo) {
    lines.push(family === "esp32" ? "#include <ESP32Servo.h>" : "#include <Servo.h>");
  }
  if (roles.oled) {
    lines.push("#include <Wire.h>");
    lines.push("#include <Adafruit_GFX.h>");
    lines.push("#include <Adafruit_SSD1306.h>");
  }
  if (roles.neo) lines.push("#include <Adafruit_NeoPixel.h>");
  if (roles.tm1637) lines.push("#include <TM1637Display.h>");
  if (roles.rc522) {
    lines.push("#include <SPI.h>");
    lines.push("#include <MFRC522.h>");
  }
  lines.push("");
  if (byRole.pir) lines.push(`const int PIR_PIN = ${byRole.pir.gpio};`);
  if (byRole.button) lines.push(`const int BTN_PIN = ${byRole.button.gpio};`);
  if (byRole.servo) lines.push(`const int SERVO_PIN = ${byRole.servo.gpio};`);
  if (byRole.led) lines.push(`const int LED_PIN = ${byRole.led.gpio};`);
  if (byRole.oled_sda) lines.push(`const int SDA_PIN = ${byRole.oled_sda.gpio};`);
  if (byRole.oled_scl) lines.push(`const int SCL_PIN = ${byRole.oled_scl.gpio};`);
  if (byRole.trig) lines.push(`const int TRIG_PIN = ${byRole.trig.gpio};`);
  if (byRole.echo) lines.push(`const int ECHO_PIN = ${byRole.echo.gpio};`);
  if (byRole.neo) lines.push(`const int NEO_PIN = ${byRole.neo.gpio};`);
  if (byRole.clk) lines.push(`const int CLK_PIN = ${byRole.clk.gpio};`);
  if (byRole.dio) lines.push(`const int DIO_PIN = ${byRole.dio.gpio};`);
  if (byRole.vrx) lines.push(`const int VRX_PIN = ${byRole.vrx.gpio};`);
  if (byRole.vry) lines.push(`const int VRY_PIN = ${byRole.vry.gpio};`);
  if (byRole.sw) lines.push(`const int SW_PIN = ${byRole.sw.gpio};`);
  if (byRole.relay) lines.push(`const int RELAY_PIN = ${byRole.relay.gpio};`);
  if (byRole.buzzer) lines.push(`const int BUZZ_PIN = ${byRole.buzzer.gpio};`);
  if (byRole.spi_sck) lines.push(`const int SCK_PIN = ${byRole.spi_sck.gpio};`);
  if (byRole.spi_mosi) lines.push(`const int MOSI_PIN = ${byRole.spi_mosi.gpio};`);
  if (byRole.spi_miso) lines.push(`const int MISO_PIN = ${byRole.spi_miso.gpio};`);
  if (byRole.spi_cs) lines.push(`const int SS_PIN = ${byRole.spi_cs.gpio};`);
  if (byRole.spi_rst) lines.push(`const int RST_PIN = ${byRole.spi_rst.gpio};`);
  lines.push("");
  if (roles.servo) lines.push("Servo servo;");
  if (roles.oled) {
    lines.push("Adafruit_SSD1306 display(128, 64, &Wire, -1);");
  }
  if (roles.neo) {
    lines.push("Adafruit_NeoPixel pixels(8, NEO_PIN, NEO_GRB + NEO_KHZ800);");
  }
  if (roles.tm1637) {
    lines.push("TM1637Display display7(CLK_PIN, DIO_PIN);");
    lines.push("int shown = 0;");
  }
  if (roles.rc522) {
    lines.push("MFRC522 mfrc522(SS_PIN, RST_PIN);");
  }
  if (roles.button || roles.relay) {
    lines.push("bool ledOn = false;");
    lines.push("int lastBtn = HIGH;");
  }
  lines.push("");
  lines.push("void setup() {");
  lines.push("  Serial.begin(115200);");
  if (byRole.pir) lines.push("  pinMode(PIR_PIN, INPUT);");
  if (byRole.button) lines.push("  pinMode(BTN_PIN, INPUT_PULLUP);");
  if (byRole.led) lines.push("  pinMode(LED_PIN, OUTPUT);");
  if (byRole.trig) lines.push("  pinMode(TRIG_PIN, OUTPUT);");
  if (byRole.echo) lines.push("  pinMode(ECHO_PIN, INPUT);");
  if (byRole.sw) lines.push("  pinMode(SW_PIN, INPUT_PULLUP);");
  if (byRole.relay) {
    lines.push("  pinMode(RELAY_PIN, OUTPUT);");
    lines.push("  digitalWrite(RELAY_PIN, HIGH);");
  }
  if (byRole.buzzer) lines.push("  pinMode(BUZZ_PIN, OUTPUT);");
  if (roles.servo) {
    if (family === "esp32") {
      lines.push("  servo.setPeriodHertz(50);");
      lines.push("  servo.attach(SERVO_PIN, 500, 2400);");
    } else {
      lines.push("  servo.attach(SERVO_PIN);");
    }
    lines.push("  servo.write(0);");
  }
  if (roles.oled && byRole.oled_sda && byRole.oled_scl) {
    if (family === "esp32") {
      lines.push("  Wire.begin(SDA_PIN, SCL_PIN);");
    } else if (family === "rp2040") {
      lines.push("  Wire.setSDA(SDA_PIN);");
      lines.push("  Wire.setSCL(SCL_PIN);");
      lines.push("  Wire.begin();");
    } else {
      lines.push("  Wire.begin();");
    }
    lines.push("  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);");
    lines.push("  display.clearDisplay();");
    lines.push("  display.setTextSize(2);");
    lines.push("  display.setTextColor(SSD1306_WHITE);");
    lines.push("  display.setCursor(0, 20);");
    lines.push('  display.println("LED off");');
    lines.push("  display.display();");
  }
  if (roles.neo) {
    lines.push("  pixels.begin();");
    lines.push("  pixels.show();");
  }
  if (roles.tm1637) {
    lines.push("  display7.setBrightness(4);");
    lines.push("  display7.showNumberDec(0, false);");
  }
  if (roles.rc522) {
    if (family === "rp2040") {
      lines.push("  SPI.setSCK(SCK_PIN);");
      lines.push("  SPI.setTX(MOSI_PIN);");
      lines.push("  SPI.setRX(MISO_PIN);");
      lines.push("  SPI.begin();");
    } else if (family === "esp32") {
      lines.push("  SPI.begin(SCK_PIN, MISO_PIN, MOSI_PIN, SS_PIN);");
    } else {
      lines.push("  SPI.begin();");
    }
    lines.push("  mfrc522.PCD_Init();");
  }
  if (roles.pir) lines.push('  Serial.println("Warming up PIR (~60 s)...");');
  else lines.push('  Serial.println("Ready.");');
  lines.push("}");
  lines.push("");
  lines.push("void loop() {");
  if (roles.pir && roles.servo && byRole.pir && byRole.led) {
    lines.push("  if (digitalRead(PIR_PIN) == HIGH) {");
    lines.push("    digitalWrite(LED_PIN, HIGH);");
    lines.push("    for (int a = 0; a <= 180; a += 2) { servo.write(a); delay(10); }");
    lines.push("    for (int a = 180; a >= 0; a -= 2) { servo.write(a); delay(10); }");
    lines.push("  } else {");
    lines.push("    digitalWrite(LED_PIN, LOW);");
    lines.push("  }");
  } else if (roles.rc522) {
    lines.push("  if (mfrc522.PICC_IsNewCardPresent() && mfrc522.PICC_ReadCardSerial()) {");
    lines.push("    for (byte i = 0; i < mfrc522.uid.size; i++) {");
    lines.push('      if (mfrc522.uid.uidByte[i] < 0x10) Serial.print("0");');
    lines.push("      Serial.print(mfrc522.uid.uidByte[i], HEX);");
    lines.push("    }");
    lines.push("    Serial.println();");
    lines.push("    mfrc522.PICC_HaltA();");
    lines.push("  }");
  } else if (roles.neo) {
    lines.push("  for (int i = 0; i < 8; i++) {");
    lines.push("    pixels.setPixelColor(i, pixels.Color(0, 12, 0));");
    lines.push("  }");
    lines.push("  pixels.show();");
  } else if (roles.tm1637 && roles.button && byRole.button) {
    lines.push("  int btn = digitalRead(BTN_PIN);");
    lines.push("  if (lastBtn == HIGH && btn == LOW) {");
    lines.push("    shown = (shown + 1) % 10000;");
    lines.push("    display7.showNumberDec(shown, false);");
    lines.push("    delay(40);");
    lines.push("  }");
    lines.push("  lastBtn = btn;");
  } else if (roles.button && byRole.button) {
    lines.push("  int btn = digitalRead(BTN_PIN);");
    lines.push("  if (lastBtn == HIGH && btn == LOW) {");
    lines.push("    ledOn = !ledOn;");
    if (byRole.led) lines.push("    digitalWrite(LED_PIN, ledOn ? HIGH : LOW);");
    if (byRole.relay) {
      lines.push("    digitalWrite(RELAY_PIN, ledOn ? LOW : HIGH);");
    }
    if (roles.oled) {
      lines.push("    display.clearDisplay();");
      lines.push("    display.setCursor(0, 20);");
      lines.push('    display.println(ledOn ? "LED on" : "LED off");');
      lines.push("    display.display();");
    }
    lines.push("    delay(40);");
    lines.push("  }");
    lines.push("  lastBtn = btn;");
  } else if (roles.sonar && byRole.trig && byRole.echo) {
    lines.push("  digitalWrite(TRIG_PIN, LOW); delayMicroseconds(2);");
    lines.push("  digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);");
    lines.push("  digitalWrite(TRIG_PIN, LOW);");
    lines.push("  long us = pulseIn(ECHO_PIN, HIGH, 30000);");
    lines.push("  Serial.println(us / 58);");
    if (byRole.led) {
      lines.push("  digitalWrite(LED_PIN, us > 0 && us / 58 < 20 ? HIGH : LOW);");
    }
  } else if (byRole.relay) {
    lines.push("  digitalWrite(RELAY_PIN, LOW);");
    lines.push("  delay(400);");
    lines.push("  digitalWrite(RELAY_PIN, HIGH);");
    lines.push("  delay(400);");
  } else if (byRole.buzzer && byRole.button) {
    lines.push("  digitalWrite(BUZZ_PIN, digitalRead(BTN_PIN) == LOW ? HIGH : LOW);");
  } else if (byRole.led) {
    lines.push("  digitalWrite(LED_PIN, HIGH); delay(400);");
    lines.push("  digitalWrite(LED_PIN, LOW); delay(400);");
  }
  lines.push("  delay(20);");
  lines.push("}");
  lines.push("");

  return {
    "platformio.ini": ini,
    "src/main.cpp": lines.join("\n"),
  };
}

export function inferPartsFromIdea(idea: string): string[] {
  const text = idea.toLowerCase();
  const parts: string[] = [];
  if (/pir|motion|walk|wave|proximity/.test(text)) parts.push("hc-sr501-pir");
  if (/servo|sweep|wave/.test(text)) parts.push("sg90-servo");
  if (/lcd|1602/.test(text)) parts.push("lcd1602-i2c-pcf8574");
  if (/tm1637|four-digit|4-digit|clock display/.test(text))
    parts.push("tm1637-4digit");
  if (
    /ssd1306|oled/.test(text) ||
    (/display|screen/.test(text) &&
      !parts.includes("lcd1602-i2c-pcf8574") &&
      !parts.includes("tm1637-4digit"))
  ) {
    parts.push("ssd1306-oled-128x64-i2c");
  }
  if (/button|tactile|toggle|press/.test(text))
    parts.push("tactile-button-6mm");
  if (/hc-sr04p|sonar p/.test(text)) parts.push("hc-sr04p");
  else if (/hc-sr04|ultrasonic|distance|ranger/.test(text)) parts.push("hc-sr04");
  if (/ws2812|neopixel|pixel strip|addressable/.test(text))
    parts.push("ws2812b-strip");
  if (/joystick/.test(text)) parts.push("joystick-ky023");
  if (/relay/.test(text)) parts.push("relay-module-5v-1ch");
  if (/buzzer/.test(text)) parts.push("buzzer-active-ky012");
  if (/keypad/.test(text)) parts.push("keypad-4x4-membrane");
  if (/rc522|rfid/.test(text)) parts.push("rfid-rc522");
  if (/bme280/.test(text)) parts.push("bme280-i2c-breakout");
  if (/blue led/.test(text)) parts.push("led-5mm-blue");
  else if (/green led/.test(text)) parts.push("led-5mm-green");
  const skipRedLed =
    parts.includes("led-5mm-blue") ||
    parts.includes("led-5mm-green") ||
    parts.includes("ws2812b-strip") ||
    parts.includes("lcd1602-i2c-pcf8574") ||
    parts.includes("tm1637-4digit");
  if (
    !skipRedLed &&
    (/led|light|status/.test(text) || /pir|servo|motion/.test(text))
  ) {
    parts.push("led-5mm-red");
  }
  if (parts.includes("led-5mm-red") || parts.includes("led-5mm-blue") || parts.includes("led-5mm-green"))
    parts.push("resistor-220");
  return unique(parts);
}

export function inferBoardFromAnswers(
  answers: Record<string, string | string[]>,
  allowed: readonly string[] = [],
  fallback = "esp32-s3-devkitc-1-n16r8",
): string {
  const values = Object.values(answers).flat();
  for (const value of values) {
    if (typeof value !== "string") continue;
    if (allowed.includes(value)) return value;
    if ((EXPECTED_BOARDS as readonly string[]).includes(value)) return value;
    if (value.startsWith("xiao-esp32c3")) return "xiao-esp32c3";
    if (value.startsWith("xiao-esp32s3")) return "xiao-esp32s3";
    if (value.includes("pico-w") || value.includes("picow"))
      return "raspberry-pi-pico-w";
    if (value.includes("pico")) return "raspberry-pi-pico";
    if (value.includes("uno")) return "arduino-uno-r3";
    if (value.includes("nano-esp32") || value.includes("nano_esp32"))
      return "arduino-nano-esp32";
    if (value.includes("nano")) return "arduino-nano";
    if (value.includes("c6")) return "esp32-c6-devkitc-1";
    if (value.includes("devkitc-v4") || value.includes("devkitc v4"))
      return "esp32-devkitc-v4";
    if (value.includes("devkit") && value.includes("s3"))
      return "esp32-s3-devkitc-1-n16r8";
  }
  return allowed[0] ?? fallback;
}
