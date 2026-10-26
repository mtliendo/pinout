import { loadCatalog } from "../src/lib/specs/load";
import { composeBuild } from "../src/lib/compose";

const cat = loadCatalog();
const comps = cat.components;
const bb = cat.breadboard;
const cases: [string, string[]][] = [
  ["esp32-s3-devkitc-1-n16r8", ["tactile-button-6mm", "relay-module-5v-1ch"]],
  ["arduino-uno-r3", ["rfid-rc522"]],
  ["esp32-s3-devkitc-1-n16r8", ["tm1637-4digit", "tactile-button-6mm"]],
  ["raspberry-pi-pico", ["tactile-button-6mm", "led-5mm-red", "resistor-220", "ssd1306-oled-128x64-i2c"]],
  ["raspberry-pi-pico-w", ["hc-sr04", "led-5mm-red", "resistor-220"]],
  ["arduino-uno-r3", ["hc-sr04", "led-5mm-red", "resistor-220"]],
  ["xiao-esp32c3", ["tactile-button-6mm", "led-5mm-red", "resistor-220", "ssd1306-oled-128x64-i2c"]],
  ["esp32-c6-devkitc-1", ["ws2812b-strip"]],
];
for (const [b, p] of cases) {
  console.log("\n######## " + b + " " + p.join(","));
  const r = composeBuild({ idea: p.join("+"), boardId: b, partIds: p }, comps, bb);
  console.log("PARTS", r.parts.map((x) => x.component).join(" | "));
  for (const pl of r.placements) {
    console.log(
      "PLACE",
      pl.part,
      pl.anchor_hole,
      pl.off_board ? "OFF" : "",
      pl.note ?? pl.position_hint ?? "",
      pl.pin_holes ? JSON.stringify(pl.pin_holes).slice(0, 400) : "",
    );
  }
  for (const c of r.connections) console.log("CONN", c.id, c.from, "->", c.to, c.net);
  for (const s of r.steps) {
    console.log(`STEP ${s.n} ${s.heading} :: ${s.body} [safety: ${s.safety.join(" / ")}]`);
    if (s.code) {
      for (const [k, v] of Object.entries(s.code)) console.log("CODE " + k + "\n" + v);
    }
  }
}
