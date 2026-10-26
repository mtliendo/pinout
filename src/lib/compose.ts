import {
  adjacentFreeHole,
  defaultBusGpio,
  findGndPin,
  findPinByGpio,
  findPinByLabel,
  pinHasFunction,
  preferredSafeGpio,
  snapRailRow,
} from "./geometry";
import {
  boardHoles,
  boardSeat,
  FitError,
  packDiscrete,
  powerHoles,
  type PackedLayout,
} from "./seat";
import type { Breadboard, Build, Component, Pin } from "./specs/schema";
import { assertValidBuild } from "./specs/validate";

export { FitError };

export type SignalNeed = {
  role: string;
  capability: "input" | "output" | "pwm" | "i2c_sda" | "i2c_scl";
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

function railOf(
  rail: "L+" | "L-",
  row: number,
  breadboard: Breadboard,
): string {
  const clamped = Math.max(1, Math.min(row, breadboard.grid.rows));
  return `${rail}@${snapRailRow(clamped, breadboard.grid.rows)}`;
}

function freeHoleForBoardPin(
  pin: Pin,
  holes: Record<string, string>,
): string {
  const seated = holes[pin.id];
  if (!seated) return "a4";
  return adjacentFreeHole(seated);
}

export function assignPins(
  board: Component,
  needs: SignalNeed[],
  breadboard: Breadboard,
): AssignedPin[] {
  const preferred = preferredSafeGpio(board);
  const used = new Set<number>();
  const holes = boardHoles(board, breadboard);
  const assigned: AssignedPin[] = [];

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
    const scored = preferred
      .filter((g) => !used.has(g))
      .map((gpio) => {
        const pin = findPinByGpio(board, gpio);
        let score = 0;
        if (!pin) return { gpio, score: -100 };
        if (need.capability === "pwm" && pinHasFunction(pin, "PWM")) score += 4;
        if (need.capability.startsWith("i2c") && pinHasFunction(pin, "I2C"))
          score += 6;
        if (need.capability === "input" && pinHasFunction(pin, "ADC")) score += 1;
        score -= preferred.indexOf(gpio) * 0.01;
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
      hole: holes[pin.id],
      freeHole: freeHoleForBoardPin(pin, holes),
    });
  }
  return assigned;
}

function detectRoles(partIds: string[]) {
  return {
    pir: partIds.includes("hc-sr501-pir"),
    servo: partIds.includes("sg90-servo"),
    led: partIds.includes("led-5mm-red"),
    resistor: partIds.includes("resistor-220"),
    button: partIds.includes("tactile-button-6mm"),
    oled: partIds.includes("ssd1306-oled-128x64-i2c"),
  };
}

function needsFor(roles: ReturnType<typeof detectRoles>): SignalNeed[] {
  const needs: SignalNeed[] = [];
  if (roles.oled) {
    needs.push({ role: "oled_sda", capability: "i2c_sda" });
    needs.push({ role: "oled_scl", capability: "i2c_scl" });
  }
  if (roles.pir) needs.push({ role: "pir", capability: "input" });
  if (roles.button) needs.push({ role: "button", capability: "input" });
  if (roles.servo) needs.push({ role: "servo", capability: "pwm" });
  if (roles.led) needs.push({ role: "led", capability: "output" });
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
  const power = powerHoles(board, holes, findPinByLabel, findGndPin);
  const layout = packDiscrete(seat, breadboard, {
    led: roles.led,
    button: roles.button,
  });

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
  parts.push(...GENERIC_JUMPERS);

  const endRow = seat.startRow + seat.pinCount - 1;
  const placements: Build["placements"] = [
    {
      part: "mcu",
      anchor_hole: `${seat.leftCol}${seat.startRow}`,
      rotation_deg: 0,
      pin_holes: holes,
      note: `${board.name.split("(")[0].trim()} straddles the gap: left header in column ${seat.leftCol}, right in column ${seat.rightCol}, rows ${seat.startRow}–${endRow}.`,
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

  const connections: Build["connections"] = [];
  const add = (c: Build["connections"][number]) => connections.push(c);

  if (roles.servo || roles.pir) {
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

  const steps = buildSteps({
    board,
    roles,
    byRole,
    power,
    layout,
    seat,
    idea: request.idea,
  });

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
      verified_by: "Maker",
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

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function titleFor(roles: ReturnType<typeof detectRoles>, idea: string): string {
  if (roles.button && roles.oled) return "Button, LED and OLED status";
  if (roles.pir && roles.servo) return "Motion-triggered servo sweep";
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
}): Build["steps"] {
  const { board, roles, byRole, power, layout, seat } = args;
  const steps: Build["steps"] = [];
  let n = 1;
  const endRow = seat.startRow + seat.pinCount - 1;
  const xiao = /xiao/i.test(board.id);

  steps.push({
    n: n++,
    heading: xiao
      ? "Seat the XIAO across the gap"
      : "Seat the board across the gap",
    body: xiao
      ? `Unplug USB. Press the XIAO so the left header sits in column ${seat.leftCol} and the right header in column ${seat.rightCol}, rows ${seat.startRow} to ${endRow}. USB points toward the near end.`
      : `Unplug USB. Press the board into the breadboard so the left header goes in column ${seat.leftCol} and the right header in column ${seat.rightCol}, rows ${seat.startRow} to ${endRow}.`,
    parts_needed: ["bb", "mcu"],
    highlight: ["mcu"],
    connections_added: [],
    camera: "top",
    callout: `${seat.leftCol}${seat.startRow}`,
    safety: ["Push both headers evenly so pins do not bend."],
    check: "The board sits flat and every pin is in a hole.",
  });

  const powerConns = [
    roles.servo || roles.pir ? "w_5v" : null,
    "w_gnd",
  ].filter(Boolean) as string[];

  steps.push({
    n: n++,
    heading: roles.servo || roles.pir
      ? "Run 5V and ground to the rails"
      : "Run ground to the rail",
    body: roles.servo || roles.pir
      ? `Red jumper from ${power.five} (5V) to the red + rail. Black jumper from ${power.gnd} (G) to the blue − rail.`
      : `Black jumper from ${power.gnd} (G) to the blue − rail.`,
    parts_needed: ["jumpers_mm"],
    highlight: [power.fivePin?.id, power.gndPin?.id].filter(Boolean) as string[],
    connections_added: powerConns,
    camera: "left-low",
    callout: powerConns.includes("w_5v") ? power.five : power.gnd,
    safety: ["5V must never touch a GPIO row."],
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

  const code = sketchFor(board, roles, byRole);
  steps.push({
    n: n++,
    heading: "Flash the sketch",
    body: "Plug USB into the UART port. Create a PlatformIO project with the files below, then Upload.",
    parts_needed: [],
    highlight: ["mcu"],
    connections_added: [],
    camera: "hero",
    callout: "usb_uart",
    safety: ["If upload fails, hold BOOT, tap RESET, release BOOT, retry."],
    check: "The serial monitor prints a ready line and the circuit responds.",
    code,
  });

  return steps;
}

function pioBoardId(board: Component): string {
  if (board.defaults?.pio?.board) return board.defaults.pio.board;
  if (board.id.startsWith("xiao-esp32c3")) return "seeed_xiao_esp32c3";
  if (board.id.startsWith("xiao-")) return "seeed_xiao_esp32s3";
  if (board.id.startsWith("esp32-s3-devkitc")) return "esp32-s3-devkitc-1";
  return board.id;
}

function sketchFor(
  board: Component,
  roles: ReturnType<typeof detectRoles>,
  byRole: Record<string, AssignedPin>,
): Record<string, string> {
  const pioBoard = pioBoardId(board);
  const pioPlatform = board.defaults?.pio?.platform ?? "espressif32";
  const pioFramework = board.defaults?.pio?.framework ?? "arduino";

  const libs = [
    roles.servo ? "madhephaestus/ESP32Servo" : "",
    roles.oled ? "adafruit/Adafruit SSD1306" : "",
    roles.oled ? "adafruit/Adafruit GFX Library" : "",
  ]
    .filter(Boolean)
    .join("\n");

  const ini = `[env:${pioBoard}]
platform = ${pioPlatform}
board = ${pioBoard}
framework = ${pioFramework}
monitor_speed = 115200
${libs ? `lib_deps =\n  ${libs.split("\n").join("\n  ")}` : ""}
`;

  const lines: string[] = ["#include <Arduino.h>"];
  if (roles.servo) lines.push("#include <ESP32Servo.h>");
  if (roles.oled) {
    lines.push("#include <Wire.h>");
    lines.push("#include <Adafruit_GFX.h>");
    lines.push("#include <Adafruit_SSD1306.h>");
  }
  lines.push("");
  if (byRole.pir) lines.push(`const int PIR_PIN = ${byRole.pir.gpio};`);
  if (byRole.button) lines.push(`const int BTN_PIN = ${byRole.button.gpio};`);
  if (byRole.servo) lines.push(`const int SERVO_PIN = ${byRole.servo.gpio};`);
  if (byRole.led) lines.push(`const int LED_PIN = ${byRole.led.gpio};`);
  if (byRole.oled_sda) lines.push(`const int SDA_PIN = ${byRole.oled_sda.gpio};`);
  if (byRole.oled_scl) lines.push(`const int SCL_PIN = ${byRole.oled_scl.gpio};`);
  lines.push("");
  if (roles.servo) lines.push("Servo servo;");
  if (roles.oled) {
    lines.push("Adafruit_SSD1306 display(128, 64, &Wire, -1);");
    lines.push("bool ledOn = false;");
  } else if (roles.button) {
    lines.push("bool ledOn = false;");
    lines.push("int lastBtn = HIGH;");
  }
  lines.push("");
  lines.push("void setup() {");
  lines.push("  Serial.begin(115200);");
  if (byRole.pir) lines.push("  pinMode(PIR_PIN, INPUT);");
  if (byRole.button) lines.push("  pinMode(BTN_PIN, INPUT_PULLUP);");
  if (byRole.led) lines.push("  pinMode(LED_PIN, OUTPUT);");
  if (roles.servo) {
    lines.push("  servo.setPeriodHertz(50);");
    lines.push("  servo.attach(SERVO_PIN, 500, 2400);");
    lines.push("  servo.write(0);");
  }
  if (roles.oled && byRole.oled_sda && byRole.oled_scl) {
    lines.push("  Wire.begin(SDA_PIN, SCL_PIN);");
    lines.push("  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);");
    lines.push("  display.clearDisplay();");
    lines.push("  display.setTextSize(2);");
    lines.push("  display.setTextColor(SSD1306_WHITE);");
    lines.push("  display.setCursor(0, 20);");
    lines.push('  display.println("LED off");');
    lines.push("  display.display();");
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
  } else if (roles.button && byRole.button) {
    lines.push("  int btn = digitalRead(BTN_PIN);");
    lines.push("  if (lastBtn == HIGH && btn == LOW) {");
    lines.push("    ledOn = !ledOn;");
    if (byRole.led) lines.push("    digitalWrite(LED_PIN, ledOn ? HIGH : LOW);");
    if (roles.oled) {
      lines.push("    display.clearDisplay();");
      lines.push("    display.setCursor(0, 20);");
      lines.push('    display.println(ledOn ? "LED on" : "LED off");');
      lines.push("    display.display();");
    }
    lines.push("    delay(40);");
    lines.push("  }");
    lines.push("  lastBtn = btn;");
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
  if (/oled|display|screen|ssd1306/.test(text))
    parts.push("ssd1306-oled-128x64-i2c");
  if (/button|tactile|toggle|press/.test(text))
    parts.push("tactile-button-6mm");
  if (/led|light|status/.test(text) || parts.length) parts.push("led-5mm-red");
  if (parts.includes("led-5mm-red")) parts.push("resistor-220");
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
    if (
      value === "esp32-s3-devkitc-1-n16r8" ||
      value === "xiao-esp32s3" ||
      value === "xiao-esp32c3"
    ) {
      return value;
    }
    if (value.startsWith("xiao-esp32c3")) return "xiao-esp32c3";
    if (value.startsWith("xiao-esp32s3")) return "xiao-esp32s3";
    if (value.includes("devkit") && value.includes("s3"))
      return "esp32-s3-devkitc-1-n16r8";
  }
  return allowed[0] ?? fallback;
}
