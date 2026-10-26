import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const BASE =
  process.env.PLAYWRIGHT_BASE_URL ??
  "https://pinout-git-cursor-v2-ten-boards-e5ea-focus-otters-projects.vercel.app";
const SHARE = process.env.PLAYWRIGHT_SHARE ?? "";
const OUT = process.env.STILLS_DIR ?? "/opt/cursor/artifacts";

function shareUrl(path = "/") {
  if (!SHARE) return `${BASE}${path}`;
  const join = path.includes("?") ? "&" : "?";
  return `${BASE}${path}${join}_vercel_share=${SHARE}`;
}

const cases = [
  {
    file: "still-390-pico-w-hcsr04.png",
    idea: "An HC-SR04 measures distance and lights an LED when something is close.",
    board: "raspberry-pi-pico-w",
    parts: ["hc-sr04", "led-5mm-red", "resistor-220"],
    heading: /Echo divider|Wire the ultrasonic/,
  },
  {
    file: "still-390-rc522-uno.png",
    idea: "RC522 RFID reader",
    board: "arduino-uno-r3",
    parts: ["rfid-rc522"],
    heading: /BSS138 shifter|Wire the RC522/,
  },
  {
    file: "still-390-relay.png",
    idea: "A button clicks a 5V relay. Low-voltage DC only — never mains.",
    board: "esp32-s3-devkitc-1-n16r8",
    parts: ["tactile-button-6mm", "relay-module-5v-1ch"],
    heading: /Wire the relay/,
  },
];

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(shareUrl("/"), { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.getByRole("heading", { name: "Wiring, step by step." }).waitFor({ timeout: 30_000 });

  for (const job of cases) {
    const res = await page.request.post(shareUrl("/api/compose"), {
      data: {
        idea: job.idea,
        answers: { board: [job.board], breadboard: ["full-830"], parts: job.parts },
      },
    });
    if (!res.ok()) {
      throw new Error(`${job.file} compose failed: ${await res.text()}`);
    }
    const payload = await res.json();
    await page.goto(shareUrl("/"), { waitUntil: "domcontentloaded" });
    await page.evaluate((data) => {
      sessionStorage.setItem("pinout:guide", JSON.stringify(data));
    }, payload);
    await page.goto(shareUrl("/guide"), { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.locator(".bench").waitFor({ timeout: 90_000 });
    const total = payload.build.steps.length as number;
    let found = false;
    for (let i = 0; i < total; i++) {
      const heading = (await page.locator(".card h2").textContent()) ?? "";
      if (job.heading.test(heading)) {
        found = true;
        break;
      }
      await page.getByRole("button", { name: /Done, next step|Finish the build/ }).click();
      await page.waitForTimeout(400);
    }
    if (!found) {
      throw new Error(`${job.file} never reached ${job.heading}`);
    }
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/${job.file}`, fullPage: true });
    console.log("wrote", `${OUT}/${job.file}`);
  }
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
