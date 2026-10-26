import { breadboardForSize, BREADBOARD_PRESETS } from "../src/lib/breadboards";
import { EXPECTED_BOARDS } from "../src/lib/boards/expected";
import { composeBuild, inferPartsFromIdea, pioEnv } from "../src/lib/compose";
import { hardwareSpiGpios } from "../src/lib/geometry";
import { CURATED_IDEAS, ideasFor } from "../src/lib/ideas/catalog";
import { catalogPartIds } from "../src/lib/parts/catalog";
import { compileCatalog, shouldCompile } from "./check-compile";
import { TM1637_CAUTION } from "../src/lib/compat";
import {
  RAW_BUILDS,
  RAW_CHIPS,
  RAW_COMPONENTS,
  RAW_PARTS_CATALOG,
  RAW_PARTS_OVERLAY,
  RAW_WIRE_COLORS,
} from "../src/lib/specs/files";
import type { Build, Component } from "../src/lib/specs/schema";
import { checkPartComponent, validatePartsCatalog } from "../src/lib/specs/validate-parts";
import { validateBuild, validateCatalog } from "../src/lib/specs/validate";

const { catalog, issues } = validateCatalog({
  components: RAW_COMPONENTS,
  builds: RAW_BUILDS,
  wireColors: RAW_WIRE_COLORS,
  chips: RAW_CHIPS,
  partsCatalog: RAW_PARTS_CATALOG,
  partsOverlay: RAW_PARTS_OVERLAY,
});

if (!catalog || issues.length) {
  console.error("FAIL: spec catalog");
  for (const issue of issues) {
    console.error(`  ${issue.path}: ${issue.message}`);
  }
  process.exit(1);
}

const loaded = catalog;

const boardCount = Object.values(loaded.components).filter((c) => c.kind === "board").length;
const chipCount = Object.keys(loaded.chips).length;
console.log(
  `PASS: ${Object.keys(loaded.components).length} components (${boardCount} boards), ${chipCount} chips, ${
    Object.keys(loaded.builds).length
  } builds`,
);

const missingBoards = EXPECTED_BOARDS.filter((id) => !loaded.components[id]);
if (missingBoards.length) {
  console.error(`FAIL: missing boards ${missingBoards.join(", ")}`);
  process.exit(1);
}

const ref = loaded.builds["pir-servo-s3"];
if (!ref) {
  console.error("FAIL: missing reference build pir-servo-s3");
  process.exit(1);
}

function expectRejects(label: string, mutate: (build: Build) => void, needle: RegExp) {
  const bad = structuredClone(ref);
  mutate(bad);
  const errors = validateBuild(bad, loaded.components, loaded.breadboard);
  const hit = errors.find((line) => needle.test(line));
  if (!hit) {
    console.error(`FAIL: ${label}`);
    console.error(`  expected /${needle.source}/`);
    console.error(`  got: ${errors.join(" | ") || "(no errors)"}`);
    process.exit(1);
  }
  console.log(`PASS: ${label} -> ${hit}`);
}

// Same three catches as specs/tools/validate.py.
expectRejects(
  "made-up pin",
  (build) => {
    build.connections.push({
      id: "w_fake_pin",
      from: "mcu:J9.9",
      to: "a10",
      color: "yellow",
      net: "FAKE",
    });
  },
  /not a real pin/,
);

expectRejects(
  "GPIO wired to 5V",
  (build) => {
    build.connections.push({
      id: "w_gpio_to_5v",
      from: "mcu:J1.4",
      to: "L+@10",
      color: "red",
      net: "5V",
    });
  },
  /GPIO4 shares a net with 5V/,
);

expectRejects(
  "duplicate rail hole",
  (build) => {
    build.connections.push({
      id: "w_dup_rail",
      from: "a35",
      to: "L-@22",
      color: "black",
      net: "GND",
    });
  },
  /hole L-@22 used twice/,
);

expectRejects(
  "duplicate breadboard hole",
  (build) => {
    build.connections.push({
      id: "w_dup_hole_a",
      from: "j50",
      to: "a50",
      color: "green",
      net: "SIG",
    });
    build.connections.push({
      id: "w_dup_hole_b",
      from: "j51",
      to: "a50",
      color: "green",
      net: "SIG",
    });
  },
  /hole a50 used twice/,
);

expectRejects(
  "duplicate MCU header socket",
  (build) => {
    build.connections.push({
      id: "w_dup_sock_a",
      from: "mcu:J1.1",
      to: "a50",
      color: "orange",
      net: "3V3",
    });
    build.connections.push({
      id: "w_dup_sock_b",
      from: "mcu:J1.1",
      to: "a51",
      color: "orange",
      net: "3V3",
    });
  },
  /socket mcu:J1.1 used twice/,
);

expectRejects(
  "unfed right ground rail",
  (build) => {
    build.connections.push({
      id: "w_unfed_rail",
      from: "j40",
      to: "R-@40",
      color: "black",
      net: "GND",
    });
  },
  /rail R- is used but never fed/,
);

expectRejects(
  "non-safe PSRAM GPIO35",
  (build) => {
    build.connections.push({
      id: "w_psram",
      from: "mcu:J3.13",
      to: "a40",
      color: "yellow",
      net: "BAD",
    });
  },
  /non-safe GPIO35/,
);

function expectCatalogRejects(
  label: string,
  mutate: (raw: {
    components: unknown[];
    chips: unknown[];
    builds: unknown[];
    wireColors: unknown;
  }) => void,
  needle: RegExp,
) {
  const raw = {
    components: structuredClone(RAW_COMPONENTS),
    chips: structuredClone(RAW_CHIPS),
    builds: structuredClone(RAW_BUILDS),
    wireColors: structuredClone(RAW_WIRE_COLORS),
    partsCatalog: structuredClone(RAW_PARTS_CATALOG),
    partsOverlay: structuredClone(RAW_PARTS_OVERLAY),
  };
  mutate(raw);
  const result = validateCatalog(raw);
  const hit = result.issues.find((issue) => needle.test(`${issue.path}: ${issue.message}`));
  if (!hit) {
    console.error(`FAIL: ${label}`);
    console.error(`  expected /${needle.source}/`);
    console.error(
      `  got: ${result.issues.map((i) => `${i.path}: ${i.message}`).join(" | ") || "(no issues)"}`,
    );
    process.exit(1);
  }
  console.log(`PASS: ${label} -> ${hit.path}: ${hit.message}`);
}

function boardOf(raw: { components: unknown[] }, id: string): Component {
  return raw.components.find((c) => (c as Component).id === id) as Component;
}

function chipOf(raw: { chips: unknown[] }, id: string): { safe_gpio: number[] } {
  return raw.chips.find((c) => (c as { id: string }).id === id) as { safe_gpio: number[] };
}

expectCatalogRejects(
  "DevKitC V4 safe gets flash GPIO6",
  (raw) => boardOf(raw, "esp32-devkitc-v4").safe_gpio!.push(6),
  /not safe on chip|risky flag|safe gpio 6/,
);
expectCatalogRejects(
  "DevKitC V4 safe gets input-only GPIO34",
  (raw) => boardOf(raw, "esp32-devkitc-v4").safe_gpio!.push(34),
  /not safe on chip|risky flag|safe gpio 34/,
);
expectCatalogRejects(
  "DevKitC V4 safe gets strapping GPIO12",
  (raw) => boardOf(raw, "esp32-devkitc-v4").safe_gpio!.push(12),
  /not safe on chip|risky flag|safe gpio 12/,
);
expectCatalogRejects(
  "Pico W safe gets radio GPIO23 (not on header)",
  (raw) => boardOf(raw, "raspberry-pi-pico-w").safe_gpio!.push(23),
  /not on a header pin|not safe on chip/,
);
expectCatalogRejects(
  "XIAO C3 safe gets strapping GPIO2",
  (raw) => boardOf(raw, "xiao-esp32c3").safe_gpio!.push(2),
  /not safe on chip|risky flag|safe gpio 2/,
);
expectCatalogRejects(
  "Nano ESP32 safe gets B0/GPIO46",
  (raw) => boardOf(raw, "arduino-nano-esp32").safe_gpio!.push(46),
  /not safe on chip|risky flag|safe gpio 46/,
);
expectCatalogRejects(
  "Uno safe gets D0/RX",
  (raw) => boardOf(raw, "arduino-uno-r3").safe_gpio!.push(0),
  /not safe on chip|risky flag|safe gpio 0/,
);
expectCatalogRejects(
  "C6 board safe gets USB GPIO12",
  (raw) => boardOf(raw, "esp32-c6-devkitc-1").safe_gpio!.push(12),
  /not safe on chip|risky flag|safe gpio 12/,
);
expectCatalogRejects(
  "board missing chip",
  (raw) => {
    delete boardOf(raw, "arduino-nano").chip;
  },
  /missing\/unknown chip/,
);
expectCatalogRejects(
  "chip safe gets strapping GPIO9",
  (raw) => chipOf(raw, "esp32-c6").safe_gpio.push(9),
  /strapping\/input-only\/USB/,
);
expectCatalogRejects(
  "flash pin unflagged on board",
  (raw) => {
    const board = boardOf(raw, "esp32-devkitc-v4");
    delete board.no_go_gpio!["6"];
    for (const pin of board.pins ?? []) {
      if (pin.gpio === 6 && pin.flags) pin.flags.psram_flash_reserved = false;
    }
  },
  /chip no-go but not flagged/,
);
expectCatalogRejects(
  "Uno logic says 3.3V",
  (raw) => {
    boardOf(raw, "arduino-uno-r3").logic!.five_v_logic = false;
  },
  /five_v_logic disagrees/,
);
expectCatalogRejects(
  "Pico default SDA off-header",
  (raw) => {
    boardOf(raw, "raspberry-pi-pico").defaults!.i2c!.sda = 25;
  },
  /default i2c.sda=GPIO25 not on a header pin/,
);

expectRejects(
  "build wires GPIO0 signal",
  (build) => {
    const pl = build.placements.find((p) => p.part === "mcu");
    const hole = pl?.pin_holes?.["J3.14"] ?? "i14";
    build.connections.push({
      id: "bad",
      from: hole.startsWith("i") ? "j14" : hole,
      to: "pir:OUT",
      color: "green",
      net: "bad",
    });
  },
  /non-safe GPIO0/,
);

const motion = composeBuild(
  {
    idea: "motion-triggered servo that waves when someone walks by",
    boardId: "esp32-s3-devkitc-1-n16r8",
    partIds: inferPartsFromIdea(
      "motion-triggered servo that waves when someone walks by",
    ),
  },
  loaded.components,
  loaded.breadboard,
);

if (motion.id !== "pir-servo-s3" || motion.steps.length !== 6) {
  console.error(
    `FAIL: motion idea should compose the 6-step reference (got ${motion.id}, ${motion.steps.length} steps)`,
  );
  process.exit(1);
}

const refNets = new Set(ref.connections.map((w) => `${w.from}->${w.to}:${w.net}`));
const motionNets = new Set(
  motion.connections.map((w) => `${w.from}->${w.to}:${w.net}`),
);
for (const net of refNets) {
  if (!motionNets.has(net)) {
    console.error(`FAIL: motion compose missing reference net ${net}`);
    process.exit(1);
  }
}
console.log("PASS: motion idea composes equivalent pir-servo-s3 nets");

const IDEAS = [
  {
    label: "motion",
    idea: "motion-triggered servo that waves when someone walks by",
  },
  {
    label: "button-oled",
    idea: "button that toggles an LED and shows status on an OLED",
  },
] as const;

for (const board of Object.values(loaded.components).filter((c) => c.kind === "board")) {
  for (const idea of IDEAS) {
    try {
      const built = composeBuild(
        {
          idea: idea.idea,
          boardId: board.id,
          partIds: inferPartsFromIdea(idea.idea),
        },
        loaded.components,
        loaded.breadboard,
      );
      const errors = validateBuild(built, loaded.components, loaded.breadboard);
      if (errors.length) {
        console.error(`FAIL: ${board.id} × ${idea.label}`);
        for (const line of errors) console.error(`  ${line}`);
        process.exit(1);
      }
      const usedGpio = new Set<number>();
      for (const wire of built.connections) {
        for (const end of [wire.from, wire.to]) {
          const pinId = end.startsWith("mcu:") ? end.slice(4) : "";
          const pin = pinId
            ? board.pins?.find((p) => p.id === pinId)
            : undefined;
          if (typeof pin?.gpio === "number") usedGpio.add(pin.gpio);
        }
      }
      for (const step of built.steps) {
        const cpp = step.code?.["src/main.cpp"] ?? "";
        for (const match of cpp.matchAll(/PIN = (\d+)/g)) {
          usedGpio.add(Number(match[1]));
        }
      }
      const spiOk = new Set(hardwareSpiGpios(board));
      for (const gpio of usedGpio) {
        if (!(board.safe_gpio ?? []).includes(gpio) && !spiOk.has(gpio)) {
          console.error(`FAIL: ${board.id} × ${idea.label} used non-safe GPIO${gpio}`);
          process.exit(1);
        }
      }
      if (board.id === "xiao-esp32c3" && idea.label === "button-oled") {
        const cpp = built.steps.find((s) => s.code)?.code?.["src/main.cpp"] ?? "";
        if (!/SDA_PIN = 6/.test(cpp) || !/SCL_PIN = 7/.test(cpp)) {
          console.error(`FAIL: XIAO C3 I2C must be GPIO6/7\n${cpp}`);
          process.exit(1);
        }
      }
      const ini = built.steps.find((s) => s.code)?.code?.["platformio.ini"] ?? "";
      const env = pioEnv(board);
      if (!ini.includes(`platform = ${env.platform}`) || !ini.includes(`board = ${env.board}`)) {
        console.error(`FAIL: ${board.id} PlatformIO env\n${ini}`);
        process.exit(1);
      }
      if (board.id === "esp32-c6-devkitc-1" && !ini.includes("pioarduino/platform-espressif32")) {
        console.error(`FAIL: C6 Arduino must use pioarduino\n${ini}`);
        process.exit(1);
      }
      if (
        board.id.startsWith("raspberry-pi-pico") &&
        (!ini.includes("maxgerhardt/platform-raspberrypi") ||
          !ini.includes("board_build.core = earlephilhower"))
      ) {
        console.error(`FAIL: Pico must use maxgerhardt + earlephilhower\n${ini}`);
        process.exit(1);
      }
      if (
        (board.id === "arduino-uno-r3" || board.id === "arduino-nano") &&
        !ini.includes("platform = atmelavr")
      ) {
        console.error(`FAIL: ${board.id} must use atmelavr\n${ini}`);
        process.exit(1);
      }
      if (board.id === "arduino-uno-r3") {
        const mcu = built.placements.find((p) => p.part === "mcu");
        if (!mcu?.off_board) {
          console.error("FAIL: Uno must sit off-board");
          process.exit(1);
        }
        const mcuEnds = built.connections.filter(
          (w) => w.from.startsWith("mcu:") || w.to.startsWith("mcu:"),
        );
        if (!mcuEnds.length) {
          console.error("FAIL: Uno wires must use mcu:pin ends");
          process.exit(1);
        }
      }
      if (board.id === "esp32-devkitc-v4") {
        const j2 = built.connections.some(
          (w) =>
            (w.from.startsWith("mcu:J2.") || w.to.startsWith("mcu:J2.")) &&
            (w.net === "5V" || /PIR|SERVO|LED|BTN|I2C/.test(w.net ?? "")),
        );
        if (!j2 && idea.label === "motion") {
          const five = built.connections.find((w) => w.id === "w_5v");
          if (!five?.from.startsWith("mcu:") && !five?.to.startsWith("mcu:")) {
            console.error(`FAIL: V4 J2 5V needs a female jumper (${five?.from} ${five?.to})`);
            process.exit(1);
          }
        }
      }
      if (board.logic?.five_v_logic && idea.label === "button-oled") {
        const warn = built.steps.some((s) => /5V logic|3\.3V-only/i.test(s.heading + s.body));
        if (!warn) {
          console.error(`FAIL: ${board.id} must warn about 3.3V OLED`);
          process.exit(1);
        }
      }
      if (board.id === "arduino-nano-esp32") {
        const usedLed = [...usedGpio].includes(48);
        if (usedLed) {
          console.error("FAIL: Nano ESP32 D13/GPIO48 must not be a signal pin");
          process.exit(1);
        }
      }
      console.log(`PASS: ${board.id} × ${idea.label} (${built.steps.length} steps)`);
    } catch (error) {
      console.error(`FAIL: ${board.id} × ${idea.label}`);
      console.error(`  ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  }
}

const mini = breadboardForSize(loaded.breadboard, BREADBOARD_PRESETS[0]);
const c3Mini = composeBuild(
  {
    idea: "button that toggles an LED and shows status on an OLED",
    boardId: "xiao-esp32c3",
    partIds: inferPartsFromIdea("button that toggles an LED and shows status on an OLED"),
  },
  loaded.components,
  mini,
);
const miniErrors = validateBuild(c3Mini, loaded.components, mini);
if (miniErrors.length) {
  console.error("FAIL: XIAO C3 on mini-170");
  for (const line of miniErrors) console.error(`  ${line}`);
  process.exit(1);
}
console.log(`PASS: xiao-esp32c3 × button-oled on mini-170 (${c3Mini.steps.length} steps)`);

function rawById(): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    (RAW_COMPONENTS as Array<{ id: string }>).map((c) => [c.id, structuredClone(c)]),
  ) as Record<string, Record<string, unknown>>;
}

function expectPartRejects(
  label: string,
  pid: string,
  mutate: (comp: Record<string, unknown>) => void,
  needle: string,
) {
  const copy = rawById();
  mutate(copy[pid]);
  const errors = checkPartComponent(copy[pid]);
  const hit = errors.find((line) => line.includes(needle));
  if (!hit) {
    console.error(`FAIL: ${label}`);
    console.error(`  expected "${needle}"`);
    console.error(`  got: ${errors.join(" | ") || "(no errors)"}`);
    process.exit(1);
  }
  console.log(`PASS: ${label} -> ${hit}`);
}

expectPartRejects(
  "duplicate pin id",
  "dht11",
  (c) => {
    (c.pins as Array<{ id: string }>)[1].id = "VCC";
  },
  "duplicate pin ids",
);
expectPartRejects(
  "missing provenance sources",
  "hc-sr04",
  (c) => {
    (c.provenance as { sources: string[] }).sources = [];
  },
  "provenance incomplete",
);
expectPartRejects(
  "non-URL source",
  "hc-sr04",
  (c) => {
    (c.provenance as { sources: string[] }).sources.push("my memory");
  },
  "not a URL",
);
expectPartRejects(
  "3.3V-only part marked 5V-safe",
  "rfid-rc522",
  (c) => {
    ((c.part as { compat: { mcu_5v: { status: string } } }).compat.mcu_5v.status = "yes");
  },
  "3.3V-only part",
);
expectPartRejects(
  "5V-logic part marked 3.3V-safe",
  "lcd1602-i2c-pcf8574",
  (c) => {
    ((c.part as { compat: { mcu_3v3: { status: string } } }).compat.mcu_3v3.status = "yes");
  },
  "5V-supply part with 5V logic",
);
expectPartRejects(
  "with_conditions without needs",
  "hc-sr04",
  (c) => {
    (c.part as { compat: { mcu_3v3: { needs: string[] } } }).compat.mcu_3v3.needs = [];
  },
  "lists no needs",
);
expectPartRejects(
  "unverified lib_dep",
  "dht11",
  (c) => {
    (c.part as { lib_deps: string[] }).lib_deps.push("someone/MadeUpLib");
  },
  "not in the registry-verified list",
);
expectPartRejects(
  "approx without note",
  "bme280-i2c-breakout",
  (c) => {
    delete (c.body as { length_mm: { note?: string } }).length_mm.note;
  },
  "approx",
);
expectPartRejects(
  "pins out of physical order",
  "mpu6050-gy521",
  (c) => {
    (c.pins as unknown[]).reverse();
  },
  "physical order",
);
expectPartRejects(
  "pin off pitch",
  "tm1637-4digit",
  (c) => {
    (c.pins as Array<{ position: { x: number } }>)[2].position.x = 6.0;
  },
  "not on 2.54 mm pitch",
);
expectPartRejects(
  "approx order w/o silkscreen note",
  "sound-sensor-ky038",
  (c) => {
    (c.headers as Array<{ note: string }>)[0].note = "trust me";
  },
  "silkscreen",
);
expectPartRejects(
  "header count mismatch",
  "hc-sr04p",
  (c) => {
    (c.pins as unknown[]).pop();
  },
  "count 4 != 3",
);
expectPartRejects(
  "I2C without address",
  "mpu6050-gy521",
  (c) => {
    (c.part as { interface: { i2c_addresses: string[] } }).interface.i2c_addresses = [];
  },
  "i2c_addresses",
);
expectPartRejects(
  "bad supply range",
  "dht22-am2302",
  (c) => {
    (c.part as { supply_v: { min: number } }).supply_v.min = 6;
  },
  "supply_v min/max",
);
expectPartRejects(
  "unknown kind",
  "ldr-gl5528",
  (c) => {
    c.kind = "gizmo";
  },
  "not in schema kinds",
);
expectPartRejects(
  "missing part block",
  "diode-1n4007",
  (c) => {
    delete c.part;
  },
  "missing part",
);
expectPartRejects(
  "active part with no GND",
  "hc-sr04",
  (c) => {
    (c.pins as unknown[]).pop();
    (c.headers as Array<{ count: number }>)[0].count = 3;
  },
  "no GND pin",
);

{
  const cat = structuredClone(RAW_PARTS_CATALOG) as {
    count: number;
    categories: Record<string, string[]>;
  };
  cat.categories.sensor.push("ghost-part");
  cat.count += 1;
  const ghost = validatePartsCatalog({
    catalog: cat,
    overlay: RAW_PARTS_OVERLAY,
    components: Object.fromEntries(
      (RAW_COMPONENTS as Array<{ id: string }>).map((c) => [c.id, c]),
    ),
  });
  if (!ghost.some((line) => line.includes("ghost-part"))) {
    console.error("FAIL: catalog entry with no file");
    process.exit(1);
  }
  console.log("PASS: catalog entry with no file -> ghost-part");
}

function expectCompat(
  label: string,
  boardId: string,
  partIds: string[],
  needle: RegExp,
  extraNeedle?: RegExp,
) {
  const built = composeBuild(
    { idea: label, boardId, partIds },
    loaded.components,
    loaded.breadboard,
  );
  const text = built.steps.map((s) => `${s.heading} ${s.body} ${s.safety.join(" ")}`).join("\n");
  if (!needle.test(text)) {
    console.error(`FAIL: ${label}`);
    console.error(`  expected /${needle.source}/`);
    console.error(`  got: ${text}`);
    process.exit(1);
  }
  if (extraNeedle) {
    const extras = built.parts.map((p) => `${p.component} ${p.note ?? ""}`).join("\n");
    if (!extraNeedle.test(extras)) {
      console.error(`FAIL: ${label} extras`);
      console.error(`  expected /${extraNeedle.source}/`);
      console.error(`  got: ${extras}`);
      process.exit(1);
    }
  }
  const errors = validateBuild(built, loaded.components, loaded.breadboard);
  if (errors.length) {
    console.error(`FAIL: ${label} validate`);
    for (const line of errors) console.error(`  ${line}`);
    process.exit(1);
  }
  console.log(`PASS: ${label}`);
}

const V3 = "esp32-s3-devkitc-1-n16r8";
const UNO = "arduino-uno-r3";

expectCompat(
  "HC-SR04 divider on 3.3V",
  V3,
  ["hc-sr04", "led-5mm-red", "resistor-220"],
  /divider|1 kΩ|HC-SR04P|two 1 kΩ/,
  /resistor-1k|hc-sr04p/,
);
expectCompat(
  "LCD backpack level shifter on 3.3V",
  V3,
  ["lcd1602-i2c-pcf8574"],
  /LCD backpack is 5V|level shifter/,
  /you'll also need|level-shifter-i2c/,
);
expectCompat(
  "WS2812B buffer on 3.3V",
  V3,
  ["ws2812b-strip"],
  /74AHCT125|330 Ω|1000 µF|external 5V/,
  /74ahct125|ext-5v-supply/,
);
expectCompat(
  "relay JD-VCC split on 3.3V",
  V3,
  ["relay-module-5v-1ch", "tactile-button-6mm"],
  /JD-VCC|active LOW|never covers mains|low-voltage DC/,
);
expectCompat(
  "active buzzer through PN2222A on 3.3V",
  V3,
  ["buzzer-active-ky012", "tactile-button-6mm"],
  /PN2222A/,
  /transistor-pn2222a/,
);
expectCompat(
  "blue LED dim warning on 3.3V",
  V3,
  ["led-5mm-blue", "resistor-220"],
  /blue\/green may look dim|may look dim/,
);
expectCompat(
  "green LED dim warning on 3.3V",
  V3,
  ["led-5mm-green", "resistor-220"],
  /blue\/green may look dim|may look dim/,
);
expectCompat(
  "RGB LED dim warning on 3.3V",
  V3,
  ["rgb-led-5mm-cc"],
  /blue\/green may look dim|RGB LED/,
);
expectCompat(
  "joystick from 3V3",
  V3,
  ["joystick-ky023", "led-5mm-red", "resistor-220"],
  /power the joystick from 3V3|Power VCC from 3V3/,
);
expectCompat(
  "RC522 level shifter on 5V",
  UNO,
  ["rfid-rc522"],
  /RC522 is 3\.3V only|shifter|MISO/,
  /level-shifter-bss138/,
);
expectCompat(
  "BME280 VIN-only on 5V",
  UNO,
  ["bme280-i2c-breakout"],
  /BME280 is 3\.3V unless|VIN board|bare BME280/,
);
expectCompat(
  "TM1637 caution on 3.3V never safe",
  V3,
  ["tm1637-4digit", "tactile-button-6mm"],
  new RegExp(TM1637_CAUTION.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
);
{
  const built = composeBuild(
    { idea: "tm1637 caution", boardId: V3, partIds: ["tm1637-4digit"] },
    loaded.components,
    loaded.breadboard,
  );
  const text = built.steps.map((s) => `${s.heading} ${s.body} ${s.safety.join(" ")}`).join("\n");
  if (!text.includes(TM1637_CAUTION)) {
    console.error("FAIL: TM1637 missing the v4 caution sentence");
    process.exit(1);
  }
  if (/\bsafe\b/i.test(text)) {
    console.error("FAIL: TM1637 labeled safe on 3.3V");
    process.exit(1);
  }
  if (built.provenance?.verified_by === "Maker") {
    console.error("FAIL: generated guide used verified_by Maker");
    process.exit(1);
  }
  console.log("PASS: TM1637 never labeled safe on 3.3V");
}
expectCompat(
  "keypad silkscreen always",
  V3,
  ["keypad-4x4-membrane"],
  /Read the keypad silkscreen|pin order varies/,
);
expectCompat(
  "approx fields never exact",
  V3,
  ["keypad-4x4-membrane", "joystick-ky023"],
  /approximate|do not treat pin order|read the silkscreen/i,
);

const boards = Object.values(loaded.components).filter((c) => c.kind === "board");
for (const board of boards) {
  const fits = ideasFor(board, loaded.breadboard.grid.rows, false);
  for (const idea of CURATED_IDEAS) {
    if (!fits.some((f) => f.id === idea.id)) {
      console.log(`SKIP: ${board.id} × ${idea.id} (does not fit)`);
      continue;
    }
    try {
      const built = composeBuild(
        { idea: idea.blurb, boardId: board.id, partIds: idea.partIds },
        loaded.components,
        loaded.breadboard,
      );
      const errors = validateBuild(built, loaded.components, loaded.breadboard);
      if (errors.length) {
        console.error(`FAIL: ${board.id} × ${idea.id}`);
        for (const line of errors) console.error(`  ${line}`);
        process.exit(1);
      }
      const usedGpio = new Set<number>();
      for (const wire of built.connections) {
        for (const end of [wire.from, wire.to]) {
          const pinId = end.startsWith("mcu:") ? end.slice(4) : "";
          const pin = pinId ? board.pins?.find((p) => p.id === pinId) : undefined;
          if (typeof pin?.gpio === "number") usedGpio.add(pin.gpio);
        }
      }
      const spiOk = new Set(hardwareSpiGpios(board));
      for (const gpio of usedGpio) {
        if (!(board.safe_gpio ?? []).includes(gpio) && !spiOk.has(gpio)) {
          console.error(`FAIL: ${board.id} × ${idea.id} used non-safe GPIO${gpio}`);
          process.exit(1);
        }
      }
      if (built.provenance?.verified_by === "Maker" && built.id !== "pir-servo-s3") {
        console.error(`FAIL: ${board.id} × ${idea.id} generated provenance is Maker`);
        process.exit(1);
      }
      console.log(`PASS: ${board.id} × ${idea.id} (${built.steps.length} steps)`);
    } catch (error) {
      console.error(`FAIL: ${board.id} × ${idea.id}`);
      console.error(`  ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  }
}

{
  const covered = new Set(CURATED_IDEAS.flatMap((idea) => idea.partIds));
  const host =
    loaded.components["esp32-s3-devkitc-1-n16r8"] ??
    Object.values(loaded.components).find((c) => c.kind === "board");
  if (!host) {
    console.error("FAIL: no host board for catalog occupancy sweep");
    process.exit(1);
  }
  for (const partId of catalogPartIds()) {
    if (
      covered.has(partId) ||
      ["breadboard-830", "jumper-male-male", "jumper-male-female", "jumper-female-female"].includes(
        partId,
      )
    ) {
      continue;
    }
    if (!loaded.components[partId]) continue;
    try {
      const built = composeBuild(
        { idea: `catalog ${partId}`, boardId: host.id, partIds: [partId] },
        loaded.components,
        loaded.breadboard,
      );
      const errors = validateBuild(built, loaded.components, loaded.breadboard);
      if (errors.length) {
        console.error(`FAIL: occupancy ${host.id} × ${partId}`);
        for (const line of errors) console.error(`  ${line}`);
        process.exit(1);
      }
      console.log(`PASS: occupancy ${host.id} × ${partId}`);
    } catch (error) {
      console.error(`FAIL: occupancy ${host.id} × ${partId}`);
      console.error(`  ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  }
}

function requireMatch(label: string, text: string, needle: RegExp) {
  if (!needle.test(text)) {
    console.error(`FAIL: ${label}`);
    console.error(`  expected /${needle.source}/`);
    console.error(`  got: ${text.slice(0, 800)}`);
    process.exit(1);
  }
  console.log(`PASS: ${label}`);
}

{
  const unoRfid = composeBuild(
    { idea: "rc522", boardId: UNO, partIds: ["rfid-rc522"] },
    loaded.components,
    loaded.breadboard,
  );
  const conn = unoRfid.connections.map((c) => `${c.id} ${c.from} ${c.to}`).join("\n");
  requireMatch("Uno RC522 SCK D13", conn, /JDIGITAL\.14/);
  requireMatch("Uno RC522 MOSI D11", conn, /JDIGITAL\.12/);
  requireMatch("Uno RC522 MISO D12", conn, /JDIGITAL\.13/);
  requireMatch("Uno RC522 SS D10", conn, /JDIGITAL\.11/);
  requireMatch("Uno RC522 RST D9", conn, /JDIGITAL\.10/);
  requireMatch("Uno RC522 shifter HV first", unoRfid.steps.map((s) => s.heading).join("\n"), /Power the BSS138 shifter/);
  requireMatch("Uno RC522 3V3 fanout", conn, /w_3v3 mcu:JANALOG\.4 a\d+/);
  const threeEnds = unoRfid.connections.filter(
    (c) => c.from === "mcu:JANALOG.4" || c.to === "mcu:JANALOG.4",
  );
  if (threeEnds.length !== 1) {
    console.error(`FAIL: Uno 3V3 socket used ${threeEnds.length} times`);
    process.exit(1);
  }
  const cpp = unoRfid.steps.find((s) => s.code)?.code?.["src/main.cpp"] ?? "";
  requireMatch("Uno RC522 sketch inits", cpp, /SPI\.begin[\s\S]*PCD_Init[\s\S]*PICC_ReadCardSerial/);
  if (unoRfid.connections.some((c) => c.from === "rfid:SCK" && c.to.startsWith("mcu:"))) {
    console.error("FAIL: RC522 SCK must go through the shifter on Uno");
    process.exit(1);
  }
}

{
  const pico = composeBuild(
    {
      idea: "button oled",
      boardId: "raspberry-pi-pico",
      partIds: [
        "tactile-button-6mm",
        "led-5mm-red",
        "resistor-220",
        "ssd1306-oled-128x64-i2c",
      ],
    },
    loaded.components,
    loaded.breadboard,
  );
  const cpp = pico.steps.find((s) => s.code)?.code?.["src/main.cpp"] ?? "";
  requireMatch("Pico lastBtn declared", cpp, /int lastBtn = HIGH;/);
  requireMatch("Pico OLED I2C 4/5", cpp, /SDA_PIN = 4[\s\S]*SCL_PIN = 5/);
  requireMatch("Pico Wire.setSDA", cpp, /Wire\.setSDA\(SDA_PIN\)/);
  requireMatch("Pico button GP26", cpp, /BTN_PIN = 26/);
  requireMatch("Pico LED not UART0", cpp, /LED_PIN = (?!0\b)\d+/);
}

{
  const sonar = composeBuild(
    {
      idea: "sonar",
      boardId: "raspberry-pi-pico-w",
      partIds: ["hc-sr04", "led-5mm-red", "resistor-220"],
    },
    loaded.components,
    loaded.breadboard,
  );
  if (sonar.connections.some((c) => c.from === "sonar:ECHO" && /^(j|a|mcu:)/.test(c.to))) {
    const direct = sonar.connections.find((c) => c.id === "w_son_echo");
    if (direct && (direct.to.startsWith("mcu:") || /^[aj]\d+$/.test(direct.to))) {
      const toGpio = sonar.connections.some(
        (c) => c.id === "w_son_echo" && c.to === sonar.connections.find((x) => x.net === "ECHO_DIV")?.to,
      );
      void toGpio;
    }
  }
  const echoWire = sonar.connections.find((c) => c.id === "w_son_echo");
  if (!echoWire || echoWire.to === echoWire.from) {
    console.error("FAIL: Pico W echo wire missing");
    process.exit(1);
  }
  if (/^(mcu:|j\d+|a\d+)$/.test(echoWire.to) && echoWire.to.startsWith("mcu:")) {
    console.error("FAIL: Echo wired direct to MCU");
    process.exit(1);
  }
  requireMatch("Pico W divider parts", sonar.parts.map((p) => p.id).join(" "), /r_echo|r_div1|r_div2/);
  const tap = sonar.connections.find((c) => c.id === "w_div_tap");
  const node = sonar.connections.find((c) => c.id === "w_echo_node");
  if (!tap || !node || tap.from === node.to) {
    console.error(`FAIL: Pico W divider tap shares the GPIO hole (${tap?.from} / ${node?.to})`);
    process.exit(1);
  }
  requireMatch("Pico W divider tap on b-column", `${tap.from} ${tap.to}`, /^b\d+ /);
}

{
  const unoSonar = composeBuild(
    {
      idea: "sonar",
      boardId: UNO,
      partIds: ["hc-sr04", "led-5mm-red", "resistor-220"],
    },
    loaded.components,
    loaded.breadboard,
  );
  const cpp = unoSonar.steps.find((s) => s.code)?.code?.["src/main.cpp"] ?? "";
  const echo = Number(/ECHO_PIN = (\d+)/.exec(cpp)?.[1] ?? 0);
  if (echo < 4) {
    console.error(`FAIL: Uno Echo on GPIO${echo}, want D4+`);
    process.exit(1);
  }
  const rails = unoSonar.connections
    .flatMap((c) => [c.from, c.to])
    .filter((end) => /^L-@/.test(end));
  if (new Set(rails).size !== rails.length) {
    console.error(`FAIL: Uno sonar duplicate rail ${rails.join(",")}`);
    process.exit(1);
  }
  const flash = unoSonar.steps.find((s) => /flash/i.test(s.heading));
  if (/hold BOOT/i.test(`${flash?.body} ${flash?.safety.join(" ")}`)) {
    console.error("FAIL: Uno flash says hold BOOT");
    process.exit(1);
  }
  console.log("PASS: Uno sonar Echo D4+ and no BOOT");
}

{
  const relay = composeBuild(
    {
      idea: "relay",
      boardId: V3,
      partIds: ["tactile-button-6mm", "relay-module-5v-1ch"],
    },
    loaded.components,
    loaded.breadboard,
  );
  const jd = relay.connections.find((c) => c.id === "w_rel_jdvcc");
  if (!jd || jd.from !== "relay:JD-VCC" || !/^L\+@/.test(jd.to)) {
    console.error(
      `FAIL: S3 relay missing JD-VCC → L+ wire (got ${jd ? `${jd.from} ${jd.to}` : "none"})`,
    );
    process.exit(1);
  }
  const wireStep = relay.steps.find((s) => /Wire the relay/.test(s.heading));
  if (!wireStep?.connections_added?.includes("w_rel_jdvcc")) {
    console.error("FAIL: step 5 must draw w_rel_jdvcc");
    process.exit(1);
  }
  requireMatch(
    "relay remove jumper first",
    relay.steps.map((s) => s.heading).join("\n"),
    /Remove the JD-VCC jumper/,
  );
  requireMatch(
    "relay silkscreen before wiring",
    relay.steps.map((s) => s.body).join("\n"),
    /silkscreen/,
  );
  const cpp = relay.steps.find((s) => s.code)?.code?.["src/main.cpp"] ?? "";
  requireMatch("relay writes RELAY_PIN", cpp, /digitalWrite\(RELAY_PIN/);

  const stripped = structuredClone(relay);
  stripped.connections = stripped.connections.filter((c) => c.id !== "w_rel_jdvcc");
  for (const step of stripped.steps) {
    step.connections_added = (step.connections_added ?? []).filter((id) => id !== "w_rel_jdvcc");
  }
  const strippedErrors = validateBuild(stripped, loaded.components, loaded.breadboard);
  if (!strippedErrors.some((line) => /JD-VCC wire/.test(line))) {
    console.error("FAIL: jumper-removal without JD-VCC must fail validateBuild");
    console.error(`  got: ${strippedErrors.join(" | ") || "(no errors)"}`);
    process.exit(1);
  }
  console.log("PASS: jumper-removal without JD-VCC is rejected");
}

{
  const boardsWithRelay = Object.values(loaded.components).filter((c) => c.kind === "board");
  for (const board of boardsWithRelay) {
    const built = composeBuild(
      {
        idea: "relay",
        boardId: board.id,
        partIds: ["tactile-button-6mm", "relay-module-5v-1ch"],
      },
      loaded.components,
      loaded.breadboard,
    );
    const jd = built.connections.find((c) => c.id === "w_rel_jdvcc");
    const ends = jd ? [jd.from, jd.to] : [];
    if (!jd || !ends.includes("relay:JD-VCC") || !ends.some((end) => /^L\+@/.test(end))) {
      console.error(`FAIL: ${board.id} relay missing JD-VCC → L+`);
      process.exit(1);
    }
    const wireStep = built.steps.find((s) => /Wire the relay/.test(s.heading));
    if (!wireStep?.connections_added?.includes("w_rel_jdvcc")) {
      console.error(`FAIL: ${board.id} relay step does not draw w_rel_jdvcc`);
      process.exit(1);
    }
    const errors = validateBuild(built, loaded.components, loaded.breadboard);
    if (errors.length) {
      console.error(`FAIL: ${board.id} relay validate`);
      for (const line of errors) console.error(`  ${line}`);
      process.exit(1);
    }
  }
  console.log(`PASS: ${boardsWithRelay.length} boards wire relay JD-VCC to L+`);
}

{
  const unoServo = composeBuild(
    {
      idea: "motion servo",
      boardId: "arduino-uno-r3",
      partIds: ["hc-sr501-pir", "sg90-servo", "led-5mm-red", "resistor-220"],
    },
    loaded.components,
    loaded.breadboard,
  );
  const ini = unoServo.steps.find((s) => s.code)?.code?.["platformio.ini"] ?? "";
  requireMatch("Uno servo lib_deps", ini, /arduino-libraries\/Servo/);
  const picoServo = composeBuild(
    {
      idea: "motion servo",
      boardId: "raspberry-pi-pico",
      partIds: ["hc-sr501-pir", "sg90-servo", "led-5mm-red", "resistor-220"],
    },
    loaded.components,
    loaded.breadboard,
  );
  const picoIni = picoServo.steps.find((s) => s.code)?.code?.["platformio.ini"] ?? "";
  if (/arduino-libraries\/Servo/.test(picoIni)) {
    console.error("FAIL: Pico servo must use the earlephilhower Servo.h, not arduino-libraries/Servo");
    process.exit(1);
  }
  console.log("PASS: Pico servo uses core Servo.h");
}

{
  const neo = composeBuild(
    { idea: "neo", boardId: "esp32-c6-devkitc-1", partIds: ["ws2812b-strip"] },
    loaded.components,
    loaded.breadboard,
  );
  if (neo.connections.some((c) => c.id === "w_5v")) {
    console.error("FAIL: C6 neo must not feed L+ from the MCU 5V pin");
    process.exit(1);
  }
  requireMatch("C6 neo ext 5V", neo.connections.map((c) => c.id).join(" "), /w_ext_5v/);
  const railStep = neo.steps.find((s) => /rail/i.test(s.heading));
  if (/Rails are fed only from this board/.test(railStep?.body ?? "")) {
    console.error("FAIL: C6 neo rail text still says only the board feeds the rails");
    process.exit(1);
  }
  requireMatch(
    "C6 unused 74AHCT125 OE",
    neo.steps.map((s) => s.body).join("\n"),
    /unused gates to 5V/,
  );
  const cpp = neo.steps.find((s) => s.code)?.code?.["src/main.cpp"] ?? "";
  if (/pinMode\(NEO_PIN/.test(cpp)) {
    console.error("FAIL: NeoPixel sketch must not pinMode the data pin");
    process.exit(1);
  }
  requireMatch("NeoPixel begin/show", cpp, /pixels\.begin\(\)[\s\S]*pixels\.show\(\)/);
  const nanoNeo = composeBuild(
    { idea: "neo", boardId: "arduino-nano-esp32", partIds: ["ws2812b-strip"] },
    loaded.components,
    loaded.breadboard,
  );
  const nanoIni = nanoNeo.steps.find((s) => s.code)?.code?.["platformio.ini"] ?? "";
  requireMatch(
    "Nano ESP32 NeoPixel pinned for Arduino 2.x",
    nanoIni,
    /adafruit\/Adafruit NeoPixel@1\.12\.3/,
  );
}

if (loaded.builds["pir-servo-s3"]?.provenance?.verified_by !== "Maker") {
  console.error("FAIL: hand-verified pir-servo-s3 lost Maker provenance");
  process.exit(1);
}
console.log("PASS: hand-verified pir-servo-s3 keeps Maker");

if (shouldCompile()) {
  const { ran, failed } = compileCatalog(loaded.components, loaded.breadboard);
  if (failed.length) {
    console.error(`FAIL: compile (${failed.length}/${ran})`);
    for (const line of failed) console.error(line);
    process.exit(1);
  }
  console.log(`PASS: compiled ${ran} sketches`);
} else {
  console.log("SKIP: compile (no pio or VERCEL=1)");
}
