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

export const RAW_COMPONENTS = [
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

export const RAW_BUILDS = [pirServoBuild] as unknown[];

export const RAW_WIRE_COLORS = wireColorsJson as unknown;

export const REFERENCE_BUILD_ID = "pir-servo-s3";
