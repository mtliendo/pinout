import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const SHARE = process.env.PLAYWRIGHT_SHARE ?? "";
const SAFE_S3 = new Set([
  1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 21, 39, 40, 41, 42,
  47,
]);

type Guide = {
  build: {
    id: string;
    title: string;
    board: string;
    steps: Array<{ n: number; heading: string }>;
    connections: Array<{ from: string; to: string; net?: string }>;
    parts: Array<{ component: string }>;
  };
  components: Record<string, { pins?: Array<{ id: string; gpio?: number | null }> }>;
};

function shareUrl(path = "/") {
  if (!SHARE) return path;
  const join = path.includes("?") ? "&" : "?";
  return `${path}${join}_vercel_share=${SHARE}`;
}

async function unlock(page: Page) {
  await page.goto(shareUrl("/"));
  await expect(page.getByRole("heading", { name: "Wiring, step by step." })).toBeVisible({
    timeout: 30_000,
  });
}

function trackConsole(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return () =>
    errors.filter(
      (line) =>
        !/Download the React DevTools|THREE\.WebGL|WebGL|Failed to load resource: the server responded with a status of 40[13]/.test(
          line,
        ),
    );
}

async function pickRelevantPills(page: Page) {
  const pills = page.locator(".pill");
  await expect(pills.first()).toBeVisible({ timeout: 60_000 });
  const preferred =
    /DevKitC|ESP32-S3|USB|capacitor|PIR|servo|OLED|button|LED|I already|red LED/i;
  const count = await pills.count();
  let clicked = 0;
  for (let i = 0; i < count; i++) {
    const text = (await pills.nth(i).textContent()) ?? "";
    if (preferred.test(text)) {
      await pills.nth(i).click();
      clicked += 1;
    }
  }
  if (clicked === 0) await pills.first().click();
}

async function answerQuestions(page: Page) {
  await expect(page.locator(".ask-card h1")).toBeVisible({ timeout: 90_000 });
  const meta = (await page.locator(".top-meta").textContent()) ?? "";
  const questions = Number(meta.match(/Question\s+\d+\s+of\s+(\d+)/)?.[1] ?? "0");
  expect(questions).toBeGreaterThan(0);
  expect(questions).toBeLessThanOrEqual(5);
  const left = Number(
    ((await page.locator(".ask-hint").textContent()) ?? "").match(/(\d+) left/)?.[1] ?? "-1",
  );
  expect(left).toBe(questions - 1);

  for (let i = 0; i < 5; i++) {
    await pickRelevantPills(page);
    const compose = page.getByRole("button", { name: "Compose the guide" });
    if (await compose.isVisible()) {
      await compose.click();
      return questions;
    }
    const next = page.getByRole("button", { name: "Next" });
    await expect(next).toBeVisible();
    await next.click();
    await expect(page.locator(".ask-card h1")).toBeVisible();
  }
  throw new Error("Did not reach compose after 5 questions");
}

async function walkGuide(page: Page, dwell = 950) {
  await expect(page.locator(".bench")).toBeVisible({ timeout: 90_000 });
  await expect(page.locator(".progress-nav")).toContainText(/Build 1\/\d/);
  await expect(page.getByRole("button", { name: "Back" })).toBeDisabled();
  await page.waitForTimeout(dwell);

  const next = page.getByRole("button", { name: /Done, next step/ });
  await expect(next).toBeVisible();
  await next.click();
  await page.waitForTimeout(280);
  const mid = Number(await page.getByTestId("motion").getAttribute("data-progress"));
  expect(mid, `expected in-flight progress, got ${mid}`).toBeGreaterThan(0.1);
  expect(mid).toBeLessThan(0.92);
  await expect(page.getByText(/Step 2 of/)).toBeVisible();
  await expect(page.locator(".you-need strong").first()).toHaveText(/^\d+x$/);
  const step2Qty = Number(
    ((await page.locator(".you-need strong").first().textContent()) ?? "0").replace("x", ""),
  );
  expect(step2Qty).toBeLessThanOrEqual(3);
  await page.waitForTimeout(dwell);
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByText(/Step 1 of/)).toBeVisible();
  await page.waitForTimeout(dwell);

  for (let i = 0; i < 12; i++) {
    const finish = page.getByRole("button", { name: "Finish the build" });
    if (await finish.isVisible()) {
      await finish.click();
      break;
    }
    const stepNext = page.getByRole("button", { name: "Done, next step" });
    await expect(stepNext).toBeVisible();
    await stepNext.click();
    await page.waitForTimeout(dwell);
  }

  await expect(page.getByText(/You built/)).toBeVisible();
  await expect(page.locator(".code-block")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy" }).first()).toBeVisible();
}

function assertSafePins(guide: Guide) {
  expect(guide.build.board).toBe("esp32-s3-devkitc-1-n16r8");
  const pins = new Map(
    (guide.components[guide.build.board]?.pins ?? []).map((pin) => [pin.id, pin.gpio]),
  );
  const used = new Set<number>();
  for (const wire of guide.build.connections) {
    for (const end of [wire.from, wire.to]) {
      const pinId = end.startsWith("mcu:") ? end.slice(4) : end.replace(/^J/, "J");
      const gpio = pins.get(end.startsWith("mcu:") ? pinId : end);
      if (typeof gpio === "number") used.add(gpio);
      const hole = end.match(/^([aj])(\d+)$/);
      if (hole) {
        const row = Number(hole[2]);
        const header = hole[1] === "a" ? `J1.${row}` : `J3.${row}`;
        const mapped = pins.get(header);
        if (typeof mapped === "number") used.add(mapped);
      }
    }
    expect(endIsReal(wire.from)).toBeTruthy();
    expect(endIsReal(wire.to)).toBeTruthy();
  }
  for (const gpio of used) {
    expect(SAFE_S3.has(gpio), `GPIO${gpio} is not safe`).toBe(true);
    expect([35, 36, 37]).not.toContain(gpio);
  }
}

function endIsReal(end: string) {
  return (
    /^[a-j]\d+$/.test(end) ||
    /^(L\+|L-|R\+|R-)@\d+$/.test(end) ||
    end.includes(":")
  );
}

async function composeIdea(request: APIRequestContext, idea: string) {
  if (SHARE) {
    await request.get(shareUrl("/"));
  }
  const res = await request.post(shareUrl("/api/compose"), {
    data: { idea, answers: { board: ["esp32-s3-devkitc-1-n16r8"] } },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()) as Guide;
}

test.describe("Pinout preview", () => {
  test("home preview is the reference build", async ({ page }) => {
    const flush = trackConsole(page);
    await unlock(page);
    await expect(page.getByText("Motion-triggered servo sweep")).toBeVisible();
    await expect(page.getByText("6 steps · ESP32-S3 DevKitC-1")).toBeVisible();
    await expect(page.locator(".preview-stage canvas")).toBeVisible({ timeout: 20_000 });
    expect(flush()).toEqual([]);
  });

  test("motion servo idea composes the 6-step reference", async ({ request }) => {
    const guide = await composeIdea(
      request,
      "motion-triggered servo that waves when someone walks by",
    );
    expect(guide.build.id).toBe("pir-servo-s3");
    expect(guide.build.steps).toHaveLength(6);
    expect(guide.build.connections).toHaveLength(10);
    const nets = guide.build.connections.map((w) => `${w.from}->${w.to}:${w.net ?? ""}`);
    expect(nets).toContain("pir:OUT->a4:PIR_OUT");
    expect(nets).toContain("servo:SIG->a5:SERVO_PWM");
    expect(nets).toContain("pir:VCC->L+@40:5V");
    expect(nets).toContain("servo:VCC->L+@45:5V");
    assertSafePins(guide);
  });

  test("button + LED + OLED idea is a valid 6-step guide", async ({ request }) => {
    const guide = await composeIdea(
      request,
      "button that toggles an LED and shows status on an OLED",
    );
    expect(guide.build.steps).toHaveLength(6);
    const parts = guide.build.parts.map((p) => p.component);
    expect(parts).toEqual(
      expect.arrayContaining([
        "tactile-button-6mm",
        "led-5mm-red",
        "resistor-220",
        "ssd1306-oled-128x64-i2c",
      ]),
    );
    const oledVcc = guide.build.connections.find((w) => w.from === "oled:VCC" || w.to === "oled:VCC");
    expect(oledVcc?.net === "3V3" || oledVcc?.to === "a1" || oledVcc?.from === "a1").toBeTruthy();
    expect(JSON.stringify(oledVcc)).not.toMatch(/L\+|R\+|5V/);
    assertSafePins(guide);
  });

  test("motion idea walks home → questions → completion", async ({ page }) => {
    const flush = trackConsole(page);
    const composed = page.waitForResponse(
      (res) => res.url().includes("/api/compose") && res.request().method() === "POST",
    );
    await unlock(page);
    await page.getByRole("button", { name: "Motion servo that waves" }).click();
    const asked = await answerQuestions(page);
    expect(asked).toBeLessThanOrEqual(5);
    const payload = (await (await composed).json()) as Guide;
    expect(payload.build.id).toBe("pir-servo-s3");
    await walkGuide(page);
    expect(flush()).toEqual([]);
  });

  test("button + LED + OLED walks to a valid completion", async ({ page }) => {
    const flush = trackConsole(page);
    const composed = page.waitForResponse(
      (res) => res.url().includes("/api/compose") && res.request().method() === "POST",
    );
    await unlock(page);
    await page.getByRole("button", { name: "Button, LED and OLED" }).click();
    const asked = await answerQuestions(page);
    expect(asked).toBeLessThanOrEqual(5);
    const payload = (await (await composed).json()) as Guide;
    assertSafePins(payload);
    await walkGuide(page);
    expect(flush()).toEqual([]);
  });

  test("reference guide film", async ({ page }) => {
    const flush = trackConsole(page);
    await unlock(page);
    await page.locator(".preview-meta").getByRole("button", { name: "Build this" }).click();
    await walkGuide(page);
    expect(flush()).toEqual([]);
  });

  test("tablet width stacks the bench and still finishes the reference", async ({
    page,
  }) => {
    const flush = trackConsole(page);
    await page.setViewportSize({ width: 820, height: 1180 });
    await unlock(page);
    await page.locator(".preview-meta").getByRole("button", { name: "Build this" }).click();
    await expect(page).toHaveURL(/\/guide\?id=pir-servo-s3/);
    await walkGuide(page);
    const bench = page.locator(".bench");
    const box = await bench.boundingBox();
    expect(box?.width).toBeLessThanOrEqual(820);
    expect(flush()).toEqual([]);
  });
});
