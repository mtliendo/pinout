import type { Build, Component } from "@/lib/specs/schema";

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

  if (has("hc-sr04") && three) {
    extras.push(extra("resistor-1k", "1 kΩ for the Echo divider"));
    extras.push(extra("resistor-2k", "2 kΩ for the Echo divider (Echo→GPIO 1k, GPIO→GND 2k)"));
    extras.push(extra("hc-sr04p", "or use an HC-SR04P instead of the 5V-only HC-SR04"));
    steps.push(
      step(
        "3.3V board — divider on Echo",
        "The HC-SR04 Echo pin is 5V. Add a 1 kΩ / 2 kΩ divider (1k Echo to GPIO, 2k GPIO to GND), or swap in an HC-SR04P and power that from 3V3.",
        ["Never wire Echo straight into a 3.3V GPIO."],
        extras.filter((e) =>
          ["resistor-1k", "resistor-2k", "hc-sr04p"].includes(e.component),
        ).map((e) => e.id),
      ),
    );
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
    extras.push(extra("74ahct125", "74AHCT125 (or 74HCT245) on the data line"));
    extras.push(extra("resistor-330", "300–500 Ω series resistor on DIN"));
    extras.push(extra("cap-electrolytic-1000uf", "1000 µF across the strip 5V/GND"));
    steps.push(
      step(
        "3.3V board — WS2812B needs a 5V data buffer",
        "Power the pixels from an external 5V supply sized at 60 mA per LED, shared ground. Buffer DIN through a 74AHCT125, put a 300–500 Ω resistor at the strip, and a 1000 µF capacitor across 5V/GND.",
        ["Do not power a long strip from the MCU 5V pin."],
        extras
          .filter((e) =>
            ["74ahct125", "resistor-330", "cap-electrolytic-1000uf"].includes(
              e.component,
            ),
          )
          .map((e) => e.id),
      ),
    );
  }

  if (has("relay-module-5v-1ch") && three) {
    steps.push(
      step(
        "3.3V board — JD-VCC split, active LOW",
        "The relay is active LOW. Remove the JD-VCC jumper. Feed 5V to JD-VCC and 3.3V to VCC, GPIO to IN. Only switch low-voltage DC (a 5–12 V lamp or fan). This guide never covers mains.",
        [
          "Pinout guides only switch low-voltage DC loads. Never wire wall power on a breadboard.",
          "Wall power can kill.",
        ],
      ),
    );
  } else if (has("relay-module-5v-1ch")) {
    steps.push(
      step(
        "Relay is active LOW — low-voltage DC only",
        "IN is active LOW. Only switch low-voltage DC. This guide never covers mains.",
        ["Never wire wall power on a breadboard."],
      ),
    );
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
    extras.push(extra("level-shifter-spi", "level shifter on SCK/MOSI/SDA/RST"));
    steps.push(
      step(
        "5V board — RC522 is 3.3V only",
        "Power the RC522 from 3V3 only. Put a level shifter on SCK, MOSI, SDA and RST. MISO at 3.3V is fine for AVR.",
        [],
        extras.filter((e) => e.component === "level-shifter-spi").map((e) => e.id),
      ),
    );
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
    extras.push(extra("level-shifter-tm1637", "level shifter on CLK/DIO if you power the module from 5V"));
    steps.push(
      step(
        "TM1637 is caution on a 3.3V board",
        "Do not label this module safe on 3.3V. Prefer 5V power with CLK and DIO through a level shifter. If you power it from 3V3 instead, expect it dimmer and treat the wiring as caution.",
        ["Never call the TM1637 3.3V-safe."],
        extras
          .filter((e) => e.component === "level-shifter-tm1637")
          .map((e) => e.id),
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
