import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const BASE =
  process.env.PLAYWRIGHT_BASE_URL ??
  "https://pinout-git-cursor-v2-ten-boards-e5ea-focus-otters-projects.vercel.app";
const SHARE = process.env.PLAYWRIGHT_SHARE ?? "";
const OUT = "/opt/cursor/artifacts/screenshots";

function shareUrl(path = "/") {
  if (!SHARE) return new URL(path, BASE).toString();
  const url = new URL(path, BASE);
  url.searchParams.set("_vercel_share", SHARE);
  return url.toString();
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  await page.goto(shareUrl("/"), { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Wiring, step by step." }).waitFor({
    timeout: 30_000,
  });

  await page.goto(shareUrl("/ask?idea=catalog"), { waitUntil: "domcontentloaded" });
  await page.locator(".ask-card h1").waitFor({ timeout: 90_000 });
  const cards = page.locator(".board-card");
  const count = await cards.count();
  for (let i = 0; i < count; i++) {
    const text = (await cards.nth(i).textContent()) ?? "";
    if (/DevKitC-1|ESP32-S3-DevKitC/.test(text)) {
      await cards.nth(i).click();
      break;
    }
  }
  await page.getByRole("button", { name: "This is the board" }).click();
  await page.getByRole("button", { name: "Yes, this is mine" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: /Choose parts/i }).click();
  await page.getByTestId("parts-picker").waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: `${OUT}/iphone390_parts_picker.png`,
    fullPage: false,
  });

  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: /tested idea/i }).click();
  await page.getByTestId("idea-list").first().waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: `${OUT}/iphone390_idea_list.png`,
    fullPage: false,
  });

  const res = await page.request.post(shareUrl("/api/compose"), {
    data: {
      idea: "An HC-SR04 measures distance and lights an LED when something is close.",
      answers: {
        board: ["esp32-s3-devkitc-1-n16r8"],
        breadboard: ["full-830"],
        parts: ["hc-sr04", "led-5mm-red", "resistor-220"],
      },
    },
  });
  if (!res.ok()) {
    throw new Error(`compose failed: ${res.status()} ${await res.text()}`);
  }
  const payload = await res.json();
  await page.goto(shareUrl("/guide"), { waitUntil: "domcontentloaded" });
  await page.evaluate((data) => {
    sessionStorage.setItem("pinout:guide", JSON.stringify(data));
  }, payload);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".bench").waitFor({ timeout: 90_000 });

  const target = /divider on Echo|1 kΩ|HC-SR04P/i;
  for (let i = 0; i < 12; i++) {
    const heading = (await page.locator(".card h2").textContent()) ?? "";
    const body = (await page.locator(".step-body").textContent().catch(() => "")) ?? "";
    if (target.test(`${heading} ${body}`)) break;
    const next = page.getByRole("button", { name: "Done, next step" });
    if (await next.isVisible()) await next.click();
    else break;
    await page.waitForTimeout(300);
  }
  await page.locator(".card").evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.locator(".card h2").waitFor();
  await page.waitForTimeout(400);
  await page.locator(".card").screenshot({
    path: `${OUT}/iphone390_compat_echo_divider.png`,
  });

  await browser.close();
  console.log("wrote stills to", OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
