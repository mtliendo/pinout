import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import breadboard from "../../../specs/components/breadboard-830.json";
import s3devkit from "../../../specs/components/esp32-s3-devkitc-1-n16r8.json";
import pir from "../../../specs/components/hc-sr501-pir.json";
import led from "../../../specs/components/led-5mm-red.json";
import resistor from "../../../specs/components/resistor-220.json";
import servo from "../../../specs/components/sg90-servo.json";
import oled from "../../../specs/components/ssd1306-oled-128x64-i2c.json";
import button from "../../../specs/components/tactile-button-6mm.json";
import xiaoC3 from "../../../specs/components/xiao-esp32c3.json";
import xiaoS3 from "../../../specs/components/xiao-esp32s3.json";
import pirServoBuild from "../../../specs/builds/pir-servo-s3.json";
import wireColorsJson from "../../../specs/wire-colors.json";

const FALLBACK_COMPONENTS = [
  breadboard,
  s3devkit,
  pir,
  led,
  resistor,
  servo,
  oled,
  button,
  xiaoC3,
  xiaoS3,
] as unknown[];

const FALLBACK_BUILDS = [pirServoBuild] as unknown[];

function readJsonDir(dir: string): unknown[] {
  try {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map((name) => JSON.parse(readFileSync(join(dir, name), "utf8")));
  } catch {
    return [];
  }
}

const scannedComponents = readJsonDir(join(process.cwd(), "specs/components"));
const scannedBuilds = readJsonDir(join(process.cwd(), "specs/builds"));
const scannedChips = readJsonDir(join(process.cwd(), "specs/chips"));

/** Live catalog: every JSON under specs/components and specs/builds. New spec files light up without a code change. */
export const RAW_COMPONENTS =
  scannedComponents.length > 0 ? scannedComponents : FALLBACK_COMPONENTS;

export const RAW_BUILDS = scannedBuilds.length > 0 ? scannedBuilds : FALLBACK_BUILDS;

export const RAW_CHIPS = scannedChips;

export const RAW_WIRE_COLORS = wireColorsJson as unknown;

function readJsonFile(path: string, fallback: unknown = null): unknown {
  try {
    if (!existsSync(path)) return fallback;
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

export const RAW_PARTS_CATALOG = readJsonFile(
  join(process.cwd(), "specs/parts-catalog.json"),
  { count: 0, categories: {} },
);

export const RAW_PARTS_OVERLAY = readJsonFile(
  join(process.cwd(), "specs/parts-overlay.json"),
  {},
) as Record<string, unknown>;

export const REFERENCE_BUILD_ID = "pir-servo-s3";
