import { EXPECTED_BOARDS } from "./boards/expected";
import {
  defaultBusGpio,
  findGndPin,
  findPinByGpio,
  findPinByLabel,
  pinHasFunction,
  preferredSafeGpio,
  snapRailRow,
} from "./geometry";
import { compatFixes } from "./compat";
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
        if (need.capability === "input" && pinHasFunction(pin, "ADC")) {
          score += need.role === "vrx" || need.role === "vry" ? 8 : 1;
        }
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
    needs.push({ role: "spi_sck", capability: "output" });
    needs.push({ role: "spi_mosi", capability: "output" });
    needs.push({ role: "spi_miso", capability: "input" });
    needs.push({ role: "spi_cs", capability: "output" });
    needs.push({ role: "spi_rst", capability: "output" });
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

  const connections: Build["connections"] = [];
  const add = (c: Build["connections"][number]) => connections.push(c);

  const needsFiveRail =
    roles.servo ||
    roles.pir ||
    roles.sonar ||
    roles.neo ||
    roles.lcd ||
    roles.relay ||
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
    add({
      id: "w_son_echo",
      from: "sonar:ECHO",
      to: byRole.echo.freeHole,
      color: "green",
      length_mm: 80,
      net: "ECHO",
    });
  }

  if (roles.neo && byRole.neo) {
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
      id: "w_rel_vcc",
      from: "relay:VCC",
      to: isFiveVoltLogic(board) ? railOf("L+", 14, breadboard) : power.three,
      color: isFiveVoltLogic(board) ? "red" : "orange",
      length_mm: 80,
      net: isFiveVoltLogic(board) ? "5V" : "3V3",
    });
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
    add({
      id: "w_rfid_vcc",
      from: "rfid:VCC",
      to: power.three,
      color: "orange",
      length_mm: 80,
      net: "3V3",
    });
    add({
      id: "w_rfid_gnd",
      from: "rfid:GND",
      to: railOf("L-", 19, breadboard),
      color: "black",
      length_mm: 80,
      net: "GND",
    });
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
}): Build["steps"] {
  const { board, roles, byRole, power, layout, seat } = args;
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

  const needsFiveRail =
    roles.servo ||
    roles.pir ||
    roles.sonar ||
    roles.neo ||
    roles.lcd ||
    roles.relay ||
    (roles.tm1637 && fiveLogic);
  const powerConns = [needsFiveRail ? "w_5v" : null, "w_gnd"].filter(
    Boolean,
  ) as string[];

  const fiveLabel = power.fivePin?.label ?? "5V";
  const gndLabel = power.gndPin?.label ?? "G";
  steps.push({
    n: n++,
    heading: needsFiveRail
      ? "Run 5V and ground to the rails"
      : "Run ground to the rail",
    body: needsFiveRail
      ? `Red jumper from ${power.five} (${fiveLabel}) to the red + rail. Black jumper from ${power.gnd} (${gndLabel}) to the blue − rail. Rails are fed only from this board's own power pins.`
      : `Black jumper from ${power.gnd} (${gndLabel}) to the blue − rail. Rails are fed only from this board's own power pins.`,
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
    steps.push({
      n: n++,
      heading: "Wire the ultrasonic sensor",
      body: `VCC to the + rail, GND to the − rail, TRIG to ${byRole.trig.freeHole} (GPIO${byRole.trig.gpio}), ECHO to ${byRole.echo.freeHole} (GPIO${byRole.echo.gpio}). Pin order is VCC–TRIG–ECHO–GND.`,
      parts_needed: ["sonar", "jumpers_fm"],
      highlight: ["sonar", byRole.trig.pin.id, byRole.echo.pin.id],
      connections_added: ["w_son_vcc", "w_son_gnd", "w_son_trig", "w_son_echo"],
      camera: "left",
      callout: byRole.echo.freeHole,
      safety: ["Echo is 5V on the HC-SR04. Do not treat it as a 3.3V-safe pin."],
      check: `TRIG in ${byRole.trig.freeHole}, ECHO in ${byRole.echo.freeHole}.`,
    });
  }

  if (roles.neo && byRole.neo) {
    steps.push({
      n: n++,
      heading: "Wire the addressable pixels",
      body: `VDD to the + rail (or an external 5V supply with shared ground), GND to the − rail, DIN to ${byRole.neo.freeHole} (GPIO${byRole.neo.gpio}).`,
      parts_needed: ["neo", "jumpers_fm"],
      highlight: ["neo", byRole.neo.pin.id],
      connections_added: ["w_neo_vcc", "w_neo_gnd", "w_neo_din"],
      camera: "right",
      callout: byRole.neo.freeHole,
      safety: ["Size the 5V supply at 60 mA per LED. Do not feed a long strip from the MCU pin."],
      check: `DIN in ${byRole.neo.freeHole}.`,
    });
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
      safety: fiveLogic
        ? []
        : ["Do not label the TM1637 safe on a 3.3V board."],
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
    steps.push({
      n: n++,
      heading: "Wire the relay module",
      body: `VCC to ${fiveLogic ? "the + rail" : "3V3"}, GND to the − rail, IN to ${byRole.relay.freeHole} (GPIO${byRole.relay.gpio}). The coil is active LOW. Only switch low-voltage DC.`,
      parts_needed: ["relay", "jumpers_fm"],
      highlight: ["relay", byRole.relay.pin.id],
      connections_added: ["w_rel_vcc", "w_rel_gnd", "w_rel_in"],
      camera: "right",
      callout: byRole.relay.freeHole,
      safety: [
        "Pinout guides only switch low-voltage DC loads. Never wire wall power on a breadboard.",
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
    steps.push({
      n: n++,
      heading: "Wire the RC522",
      body: `VCC to 3V3 only. GND to the − rail. SCK ${byRole.spi_sck.freeHole}, MOSI ${byRole.spi_mosi?.freeHole}, MISO ${byRole.spi_miso?.freeHole}, SDA/SS ${byRole.spi_cs?.freeHole}, RST ${byRole.spi_rst?.freeHole}.`,
      parts_needed: ["rfid", "jumpers_fm"],
      highlight: ["rfid"],
      connections_added: [
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
      check: "VCC is on 3V3, not 5V.",
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
  if (byRole.trig) lines.push("  pinMode(TRIG_PIN, OUTPUT);");
  if (byRole.echo) lines.push("  pinMode(ECHO_PIN, INPUT);");
  if (byRole.neo) lines.push("  pinMode(NEO_PIN, OUTPUT);");
  if (byRole.clk) lines.push("  pinMode(CLK_PIN, OUTPUT);");
  if (byRole.dio) lines.push("  pinMode(DIO_PIN, OUTPUT);");
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
  } else if (roles.sonar && byRole.trig && byRole.echo) {
    lines.push("  digitalWrite(TRIG_PIN, LOW); delayMicroseconds(2);");
    lines.push("  digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);");
    lines.push("  digitalWrite(TRIG_PIN, LOW);");
    lines.push("  long us = pulseIn(ECHO_PIN, HIGH, 30000);");
    lines.push("  Serial.println(us / 58);");
    if (byRole.led) {
      lines.push("  digitalWrite(LED_PIN, us > 0 && us / 58 < 20 ? HIGH : LOW);");
    }
  } else if (byRole.relay && byRole.button) {
    lines.push("  digitalWrite(RELAY_PIN, digitalRead(BTN_PIN));");
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
