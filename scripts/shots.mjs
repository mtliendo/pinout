import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base = process.env.PLAYWRIGHT_BASE_URL;
const share = process.env.PLAYWRIGHT_SHARE;
const out = "/opt/cursor/artifacts/screenshots";
const tag = process.env.SHOT_TAG ? `_${process.env.SHOT_TAG}` : "";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const first = share ? `${base}/?_vercel_share=${share}` : `${base}/`;
await page.goto(first, { waitUntil: "domcontentloaded" });
await page.getByRole("heading", { name: "Wiring, step by step." }).waitFor();
await page.waitForTimeout(2200);
await page.screenshot({ path: `${out}/home_desktop${tag}.png` });

await page.goto(`${base}/ask?idea=${encodeURIComponent("motion-triggered servo that waves when someone walks by")}`);
await page.locator(".ask-card h1").waitFor({ timeout: 60000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/questions_parts${tag}.png` });

await page.goto(`${base}/guide?id=pir-servo-s3`);
await page.locator(".bench").waitFor({ timeout: 30000 });
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/guide_step1${tag}.png` });
await page.getByRole("button", { name: /Done, next step/ }).click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/guide_step2${tag}.png` });
await page.getByRole("button", { name: /Done, next step/ }).click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/guide_step3_pir_magnifier${tag}.png` });
for (let i = 0; i < 4; i++) {
  const finish = page.getByRole("button", { name: "Finish the build" });
  if (await finish.isVisible()) {
    await finish.click();
    break;
  }
  await page.getByRole("button", { name: /Done, next step/ }).click();
  await page.waitForTimeout(800);
}
await page.getByText(/You built/).waitFor();
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/completion_sketch${tag}.png` });

await page.setViewportSize({ width: 820, height: 1180 });
await page.goto(`${base}/`);
await page.getByRole("heading", { name: "Wiring, step by step." }).waitFor();
await page.waitForTimeout(2400);
await page.screenshot({ path: `${out}/home_tablet_820${tag}.png` });
await page.goto(`${base}/guide?id=pir-servo-s3`);
await page.locator(".bench").waitFor();
await page.waitForTimeout(1600);
await page.screenshot({ path: `${out}/guide_step1_tablet_820${tag}.png` });
await page.getByRole("button", { name: /Done, next step/ }).click();
await page.waitForTimeout(1400);
await page.screenshot({ path: `${out}/guide_step2_tablet_820${tag}.png` });

const oledIdea = "button that toggles an LED and shows status on an OLED";
const composed = await page.request.post(
  share ? `${base}/api/compose?_vercel_share=${share}` : `${base}/api/compose`,
  { data: { idea: oledIdea, answers: { board: ["esp32-s3-devkitc-1-n16r8"] } } },
);
const oledGuide = await composed.json();
await page.addInitScript((guide) => {
  sessionStorage.setItem("pinout:guide", JSON.stringify(guide));
}, oledGuide);
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto(share ? `${base}/guide?_vercel_share=${share}` : `${base}/guide`);
await page.locator(".bench").waitFor({ timeout: 30000 });
await page.getByRole("button", { name: /Done, next step/ }).click();
await page.waitForTimeout(1000);
await page.screenshot({ path: `${out}/oled_step2${tag}.png` });
await page.getByRole("button", { name: /Done, next step/ }).click();
await page.waitForTimeout(1000);
await page.screenshot({ path: `${out}/oled_step3${tag}.png` });
for (let i = 0; i < 5; i++) {
  const finish = page.getByRole("button", { name: "Finish the build" });
  if (await finish.isVisible()) {
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/oled_step6${tag}.png` });
    await finish.click();
    break;
  }
  await page.getByRole("button", { name: /Done, next step/ }).click();
  await page.waitForTimeout(800);
}
await page.getByText(/You built/).waitFor();
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/oled_completion${tag}.png` });

await browser.close();
console.log("wrote screenshots");
