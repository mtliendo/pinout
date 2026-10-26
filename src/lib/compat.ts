import type { Build, Component } from "@/lib/specs/schema";

export const TM1637_CAUTION =
  "Caution: the TM1637 chip is only characterised at 4.5-5.5V. Common shortcut: power VCC from 3V3 and wire CLK/DIO direct (out of chip spec, usually works, a bit dimmer). In-spec option: VCC from 5V with CLK and DIO through a bidirectional level shifter (BSS138 type), since module pull-ups go to VCC. Never 5V VCC with CLK/DIO wired direct.";

export type ExtraNeed = {
  id: string;
  component: string;
  qty: number;
  note: string;
  inCatalog: boolean;
};

export type CompatFix = {
  extras: ExtraNeed[];
  steps: Build["steps"];
  warnings: string[];
};

const CATALOG_FIX_PARTS = new Set([
  "resistor-1k",
  "resistor-220",
  "resistor-330",
  "transistor-pn2222a",
  "cap-electrolytic-1000uf",
  "cap-electrolytic-100uf",
  "hc-sr04p",
  "74ahct125",
  "level-shifter-bss138",
  "ext-5v-supply",
]);

function extra(
  component: string,
  note: string,
  qty = 1,
): ExtraNeed {
  return {
    id: `need_${component.replace(/[^a-z0-9]+/g, "_")}`,
    component,
    qty,
    note: CATALOG_FIX_PARTS.has(component)
      ? note
      : `you'll also need — ${note}`,
    inCatalog: CATALOG_FIX_PARTS.has(component),
  };
}

function step(
  heading: string,
  body: string,
  safety: string[] = [],
  partsNeeded: string[] = [],
): Build["steps"][number] {
  return {
    n: 0,
    heading,
    body,
    parts_needed: partsNeeded,
    highlight: [],
    connections_added: [],
    camera: "hero",
    callout: "a1",
    safety,
    check: heading,
  };
}

export function logicSide(board: Component): "mcu_3v3" | "mcu_5v" {
  return board.logic?.five_v_logic ? "mcu_5v" : "mcu_3v3";
}

export function compatFixes(
  board: Component,
  partIds: string[],
  components: Record<string, Component>,
): CompatFix {
  const side = logicSide(board);
  const three = side === "mcu_3v3";
  const extras: ExtraNeed[] = [];
  const steps: Build["steps"] = [];
  const warnings: string[] = [];
  const has = (id: string) => partIds.includes(id);

  const addNeeds = (id: string) => {
    const part = components[id]?.part;
    if (!part) return;
    const block = part.compat[side];
    if (!block) return;
    if (block.status !== "yes" || block.needs.length) {
      for (const need of block.needs) {
        if (!warnings.includes(need)) warnings.push(need);
      }
    }
    if (part.approx_fields?.includes("pin_order") || part.approx_fields?.includes("body")) {
      warnings.push(
        `${components[id].name}: some fields are approximate — do not treat pin order or module size as exact.`,
      );
    }
  };

  for (const id of partIds) addNeeds(id);

  // Wired in compose (echo divider, neo buffer, relay split, RC522 shifter).
  // Keep extras on the BOM; do not emit text-only steps after the risky wiring.
  if (has("hc-sr04") && three) {
    extras.push(extra("resistor-1k", "1 kΩ Echo to the GPIO node", 1));
    extras.push(extra("resistor-1k", "two 1 kΩ in series from the node to GND (3.33 V)", 2));
    extras.push(extra("hc-sr04p", "or use an HC-SR04P instead of the 5V-only HC-SR04"));
  }

  if (has("lcd1602-i2c-pcf8574") && three) {
    extras.push(extra("level-shifter-i2c", "bidirectional I2C level shifter (BSS138 type)"));
    steps.push(
      step(
        "3.3V board — LCD backpack is 5V",
        "The LCD1602 I2C backpack pulls SDA/SCL up to 5V. Power VCC from 5V and put a bidirectional level shifter on SDA and SCL. Pinout will not wire it direct.",
        [],
        extras.filter((e) => e.component === "level-shifter-i2c").map((e) => e.id),
      ),
    );
  }

  if ((has("ws2812b-strip") || has("ws2812b-ring-12")) && three) {
    extras.push(extra("ext-5v-supply", "external 5V supply into the strip and the + rail"));
    extras.push(extra("74ahct125", "74AHCT125 on the data line, powered from 5V, OE to GND"));
    extras.push(extra("resistor-330", "330 Ω after the buffer, then DIN"));
    extras.push(extra("cap-electrolytic-1000uf", "1000 µF across the strip 5V/GND"));
  }

  if (has("buzzer-active-ky012") && three) {
    extras.push(extra("transistor-pn2222a", "PN2222A to switch the buzzer"));
    extras.push(extra("resistor-1k", "1 kΩ base resistor"));
    steps.push(
      step(
        "3.3V board — drive the active buzzer through a PN2222A",
        "The KY-012 can draw ~30 mA from S. Switch it with a PN2222A and a 1 kΩ base resistor rather than a GPIO directly.",
        [],
        extras
          .filter((e) =>
            ["transistor-pn2222a", "resistor-1k"].includes(e.component),
          )
          .map((e) => e.id),
      ),
    );
  }

  if (three && (has("led-5mm-blue") || has("led-5mm-green") || has("rgb-led-5mm-cc"))) {
    steps.push(
      step(
        "3.3V board — blue/green may look dim",
        "Blue and green LEDs (and the blue/green channels of an RGB LED) have a Vf near 3.3 V. On this board they may look dim or stay off. That is expected — not a wiring fault.",
      ),
    );
  }

  if (has("joystick-ky023") && three) {
    steps.push(
      step(
        "3.3V board — power the joystick from 3V3",
        "Power VCC from 3V3, not 5V. A 5V-powered wiper can swing to 5V and damage a 3.3V ADC.",
      ),
    );
  }

  if (has("rfid-rc522") && !three) {
    extras.push(extra("level-shifter-bss138", "BSS138 shifter on SCK, MOSI, SS and RST"));
  }

  if (has("bme280-i2c-breakout") && !three) {
    steps.push(
      step(
        "5V board — BME280 is 3.3V unless it has VIN",
        "Only a regulated VIN board (Adafruit-style) can run at 5V. A bare BME280 is 3.3V only: power from 3V3 and level-shift SDA/SCL.",
      ),
    );
  }

  if (has("tm1637-4digit") && three) {
    steps.push(
      step(
        "TM1637 — caution on 3.3V",
        TM1637_CAUTION,
        [TM1637_CAUTION],
      ),
    );
  }

  if (has("keypad-4x4-membrane")) {
    steps.push(
      step(
        "Read the keypad silkscreen",
        "4×4 keypad pin order varies by clone (rows then columns, or columns first). Read the silkscreen on YOUR pad before you wire it. Pin order in the spec is approximate.",
      ),
    );
  }

  const seen = new Set<string>();
  return {
    extras: extras.filter((e) => {
      if (seen.has(e.component)) return false;
      seen.add(e.component);
      return true;
    }),
    steps,
    warnings,
  };
}
