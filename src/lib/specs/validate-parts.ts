import { ComponentSchema, dim, type Component } from "./schema";

export type PartsCatalogFile = {
  count: number;
  categories: Record<string, string[]>;
};

export const VERIFIED_LIBS = new Set([
  "adafruit/DHT sensor library",
  "adafruit/Adafruit Unified Sensor",
  "adafruit/Adafruit BME280 Library",
  "teckel12/NewPing",
  "adafruit/Adafruit MPU6050",
  "crankyoldgit/IRremoteESP8266",
  "z3t0/IRremote",
  "paulstoffregen/OneWire",
  "milesburton/DallasTemperature",
  "marcoschwartz/LiquidCrystal_I2C",
  "smougenot/TM1637",
  "waspinator/AccelStepper",
  "adafruit/Adafruit NeoPixel",
  "fastled/FastLED",
  "mathertel/RotaryEncoder",
  "chris--a/Keypad",
  "miguelbalboa/MFRC522",
  "adafruit/Adafruit SSD1306",
  "adafruit/Adafruit GFX Library",
  "madhephaestus/ESP32Servo",
]);

const CATS = new Set([
  "sensor",
  "display",
  "actuator",
  "input",
  "passive",
  "wire",
  "power",
  "breadboard",
]);
const KINDS = new Set(["board", "breadboard", "sensor", "actuator", "passive"]);
const MOUNTS = new Set([
  "breadboard",
  "off_board",
  "off_board_or_breadboard_edge",
  "breadboard_rails",
  "base",
]);
const STATUS = new Set(["yes", "with_conditions", "no"]);
const URL = /^https?:\/\/\S+$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const I2C = /^0x[0-7][0-9A-Fa-f]$/;

function walkApprox(value: unknown, path: string, errs: string[]): void {
  if (value && typeof value === "object") {
    if (Array.isArray(value)) {
      value.forEach((item, i) => walkApprox(item, `${path}[${i}]`, errs));
      return;
    }
    const rec = value as Record<string, unknown>;
    if (rec.approx === true && !rec.note) {
      errs.push(`approx value without note at ${path}`);
    }
    for (const [k, v] of Object.entries(rec)) walkApprox(v, `${path}.${k}`, errs);
  }
}

export function checkPartBlock(
  pid: string,
  part: NonNullable<Component["part"]>,
): string[] {
  const errs: string[] = [];
  for (const key of [
    "category",
    "supply_v",
    "logic",
    "compat",
    "interface",
    "current_ma",
    "required_passives",
    "mounting",
    "lib_deps",
    "approx_fields",
  ] as const) {
    if (part[key] == null) errs.push(`${pid}: part.${key} missing`);
  }
  if (errs.length) return errs;
  if (!CATS.has(part.category)) errs.push(`${pid}: bad category ${part.category}`);
  if (
    !MOUNTS.has(part.mounting) &&
    !part.mounting.startsWith("breadboard ↔") &&
    !part.mounting.startsWith("module")
  ) {
    errs.push(`${pid}: bad mounting ${part.mounting}`);
  }
  const mn = part.supply_v.min;
  const mx = part.supply_v.max;
  if (mn == null || (mx != null && mx < mn)) {
    errs.push(`${pid}: supply_v min/max invalid`);
  }
  for (const side of ["mcu_3v3", "mcu_5v"] as const) {
    const c = part.compat[side];
    if (!c || !STATUS.has(c.status)) {
      errs.push(`${pid}: compat.${side} missing/invalid`);
      continue;
    }
    if (c.status !== "yes" && !(c.needs ?? []).length) {
      errs.push(`${pid}: compat.${side} is ${c.status} but lists no needs`);
    }
  }
  const skip = new Set(["passive", "wire", "breadboard", "power"]);
  if (
    !skip.has(part.category) &&
    mx != null &&
    mx < 4.5 &&
    part.compat.mcu_5v.status === "yes"
  ) {
    errs.push(`${pid}: 3.3V-only part (max ${mx}V) marked plain-yes on 5V MCUs`);
  }
  if (
    !skip.has(part.category) &&
    mn != null &&
    mn >= 4.5 &&
    part.compat.mcu_3v3.status === "yes" &&
    !String(part.logic.level ?? "").startsWith("3.3V")
  ) {
    errs.push(`${pid}: 5V-supply part with 5V logic marked plain-yes on 3.3V MCUs`);
  }
  for (const lib of part.lib_deps) {
    if (!VERIFIED_LIBS.has(lib)) {
      errs.push(`${pid}: lib_dep '${lib}' not in the registry-verified list`);
    }
  }
  for (const rp of part.required_passives as Array<{ kind?: string; value?: string }>) {
    if (!rp?.kind || !rp?.value) {
      errs.push(`${pid}: required_passive missing kind/value`);
    }
  }
  if (part.interface.type === "I2C") {
    const addrs = part.interface.i2c_addresses ?? [];
    if (!addrs.length || !addrs.every((a) => I2C.test(a))) {
      errs.push(`${pid}: I2C part needs 7-bit i2c_addresses`);
    }
  }
  return errs;
}

export function checkPartComponent(raw: unknown): string[] {
  const pid = (raw as { id?: string })?.id ?? "?";
  const rec = raw as {
    kind?: string;
    provenance?: { verified_by?: string; sources?: unknown[]; revision?: string };
  };
  if (rec.kind != null && !KINDS.has(rec.kind)) {
    return [`${pid}: kind ${rec.kind} not in schema kinds`];
  }
  const pv = rec.provenance;
  if (!pv || pv.verified_by !== "Maker" || !pv.sources?.length || !pv.revision) {
    return [`${pid}: provenance incomplete`];
  }
  const parsed = ComponentSchema.safeParse(raw);
  if (!parsed.success) {
    return [`${pid}: ${parsed.error.issues.map((i) => i.message).join("; ")}`];
  }
  const c = parsed.data;
  const errs: string[] = [];
  for (const key of [
    "id",
    "name",
    "kind",
    "body",
    "headers",
    "pins",
    "provenance",
    "part",
    "coordinate_frame",
  ] as const) {
    if (c[key] == null) {
      errs.push(`${pid}: missing ${key}`);
      return errs;
    }
  }
  if (!KINDS.has(c.kind)) errs.push(`${pid}: kind ${c.kind} not in schema kinds`);
  for (const url of pv.sources ?? []) {
    if (typeof url !== "string" || !URL.test(url)) {
      errs.push(`${pid}: source is not a URL: ${url}`);
    }
  }
  for (const [k, v] of Object.entries(c.body ?? {})) {
    if (k.endsWith("_mm")) {
      const n = dim(v as never, 0);
      if (!n && v !== 0) {
        /* skip non-numeric notes */
      }
    }
  }
  walkApprox(c, pid, errs);
  for (const [k, v] of Object.entries(c.colors ?? {})) {
    if (typeof v === "string" && v.startsWith("#") && !HEX.test(v)) {
      errs.push(`${pid}: bad color ${k}`);
    }
  }
  const headers = c.headers ?? [];
  const pins = c.pins ?? [];
  const ids = pins.map((p) => p.id);
  if (ids.length !== new Set(ids).size) errs.push(`${pid}: duplicate pin ids`);
  headers.forEach((h, hi) => {
    const hp = pins.filter((p) => p.header === hi);
    if (h.id !== "ends" && h.id !== "MOTOR" && hp.length !== h.count) {
      errs.push(`${pid}: header ${h.id} count ${h.count} != ${hp.length} pins`);
    }
    const idx = hp.map((p) => p.position.index);
    const expected = hp.map((_, i) => i + 1);
    if (idx.join(",") !== expected.join(",")) {
      errs.push(`${pid}: header ${h.id} pins not in physical order 1..n (${idx})`);
    }
    if (h.pin_order_approx && !/silkscreen/i.test(h.note ?? "")) {
      errs.push(`${pid}: approx pin order without a read-the-silkscreen note`);
    }
    const pitch = dim(h.pitch, 2.54);
    if (h.id !== "leads" && h.id !== "ends" && hp.length && h.orientation === "+X") {
      const x0 = hp[0].position.x;
      for (const pin of hp) {
        const exp = Math.round((x0 + (pin.position.index - 1) * pitch) * 100) / 100;
        if (Math.abs(pin.position.x - exp) > 0.01) {
          errs.push(
            `${pid}: pin ${pin.id} x=${pin.position.x} not on ${pitch} mm pitch (exp ${exp})`,
          );
        }
      }
    }
  });
  for (const pin of pins) {
    for (const key of ["id", "label", "header", "position", "functions", "voltage", "flags", "warnings"] as const) {
      if (pin[key] == null) errs.push(`${pid}: pin ${pin.id} missing ${key}`);
    }
    if ((pin.header ?? 99) >= headers.length) {
      errs.push(`${pid}: pin ${pin.id} header index out of range`);
    }
  }
  const hasGnd = pins.some(
    (p) => p.functions.includes("GND") || p.id === "-" || p.id === "K" || p.id === "E",
  );
  const cat = c.part?.category ?? "";
  if (
    !hasGnd &&
    !["passive", "wire", "input"].includes(cat) &&
    !c.part?.no_gnd_pin
  ) {
    errs.push(`${pid}: active part has no GND pin`);
  }
  if (c.part) errs.push(...checkPartBlock(pid, c.part));
  return errs;
}

export function validatePartsCatalog(args: {
  catalog: PartsCatalogFile;
  overlay: Record<string, unknown>;
  components: Record<string, unknown>;
}): string[] {
  const errs: string[] = [];
  const ids = Object.values(args.catalog.categories ?? {}).flat();
  if (args.catalog.count !== ids.length) errs.push("catalog count mismatch");
  for (const pid of ids) {
    const overlay = args.overlay[pid];
    const raw = args.components[pid];
    if (overlay && typeof overlay === "object") {
      const part = ((raw as { part?: Component["part"] } | undefined)?.part ??
        overlay) as Component["part"];
      if (part) errs.push(...checkPartBlock(pid, part));
      else errs.push(`${pid}: overlay part block invalid`);
    } else if (raw) {
      errs.push(...checkPartComponent(raw));
    } else {
      errs.push(`${pid}: in catalog but no file`);
    }
  }
  return errs;
}
