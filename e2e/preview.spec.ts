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
    steps: Array<{
      n: number;
      heading: string;
      body?: string;
      callout?: string;
      connections_added?: string[];
    }>;
    connections: Array<{ id?: string; from: string; to: string; net?: string }>;
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

async function pickBoard(page: Page, name = /S3-DevKitC|N16R8/) {
  await expect(page.getByTestId("board-picker")).toBeVisible({ timeout: 60_000 });
  const cards = page.locator(".board-card");
  const count = await cards.count();
  expect(count).toBe(10);
  let clicked = false;
  for (let i = 0; i < count; i++) {
    const text = (await cards.nth(i).textContent()) ?? "";
    if (name.test(text)) {
      await cards.nth(i).click();
      clicked = true;
      break;
    }
  }
  if (!clicked) await cards.first().click();
  await page.getByRole("button", { name: "This is the board" }).click();
}

async function confirmBoard(page: Page) {
  await expect(page.getByTestId("board-confirm")).toBeVisible();
  await expect(page.getByText("US quarter · 24.26 mm across")).toBeVisible();
  await page.getByRole("button", { name: "Yes, this is mine" }).click();
}

async function pickPathIdea(page: Page, idea = /Motion servo|Button, LED/) {
  await expect(page.getByTestId("breadboard-picker")).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByTestId("path-picker")).toBeVisible();
  await page.getByRole("button", { name: /tested idea/i }).click();
  await expect(page.getByTestId("idea-list").first()).toBeVisible();
  const cards = page.locator("[data-testid=idea-list] .path-card");
  const count = await cards.count();
  let clicked = false;
  for (let i = 0; i < count; i++) {
    const text = (await cards.nth(i).textContent()) ?? "";
    if (idea.test(text)) {
      await cards.nth(i).click();
      clicked = true;
      break;
    }
  }
  if (!clicked) await cards.first().click();
  await page.getByRole("button", { name: "Compose the guide" }).click();
}

async function answerQuestions(page: Page) {
  await expect(page.locator(".ask-card h1")).toBeVisible({ timeout: 90_000 });
  await pickBoard(page);
  await confirmBoard(page);
  await pickPathIdea(page);
  return 4;
}

function targetHoleForStep(guide: Guide, n: number) {
  const step = guide.build.steps.find((row) => row.n === n);
  if (!step) return null;
  const wires = (step.connections_added ?? [])
    .map((id) => guide.build.connections.find((row) => row.id === id))
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
  const holes = (wire: { from: string; to: string }) =>
    [wire.from, wire.to].filter((end) => /^[a-j]\d+$/i.test(end));
  if (wires.length === 1) return holes(wires[0])[0] ?? null;
  if (step.callout && wires.some((wire) => wire.from === step.callout || wire.to === step.callout)) {
    return /^[a-j]\d+$/i.test(step.callout) ? step.callout : null;
  }
  return holes(wires[0] ?? { from: "", to: "" })[0] ?? null;
}

async function walkGuide(page: Page, dwell = 950, guide?: Guide) {
  await expect(page.locator(".bench")).toBeVisible({ timeout: 90_000 });
  await expect(page.locator(".progress-nav")).toContainText(/Build 1\/\d/);
  await expect(page.getByRole("button", { name: "Back" })).toBeDisabled();
  await page.waitForTimeout(dwell);

  const next = page.getByRole("button", { name: /Done, next step/ });
  await expect(next).toBeVisible();
  await page.evaluate(() => {
    const w = window as unknown as { __pinoutHistory?: number[]; __pinoutProgress?: number };
    w.__pinoutHistory = [];
    w.__pinoutProgress = -1;
  });
  await next.click({ noWaitAfter: true });
  let mid = 1;
  let history: number[] = [];
  for (let i = 0; i < 25; i++) {
    const sample = await page.evaluate(() => {
      const w = window as unknown as { __pinoutHistory?: number[]; __pinoutProgress?: number };
      return { now: w.__pinoutProgress ?? 1, history: w.__pinoutHistory ?? [] };
    });
    mid = sample.now;
    history = sample.history;
    if (history.some((n) => n > 0.05 && n < 0.95) || (mid > 0.05 && mid < 0.95)) break;
    await page.waitForTimeout(30);
  }
  const sawFlight = history.some((n) => n > 0.05 && n < 0.95) || (mid > 0.05 && mid < 0.95);
  expect(sawFlight, `expected in-flight progress, last=${mid} history=${history.join(",")}`).toBe(
    true,
  );
  await expect(page.getByText(/Step 2 of/)).toBeVisible();
  await expect(page.locator(".you-need strong").first()).toHaveText(/^\d+x$/);
  const step2Qty = Number(
    ((await page.locator(".you-need strong").first().textContent()) ?? "0").replace("x", ""),
  );
  expect(step2Qty).toBeLessThanOrEqual(3);
  await page.waitForTimeout(dwell);
  if (guide) {
    const hole = targetHoleForStep(guide, 2);
    if (hole) {
      await expect(page.locator(".magnifier-label")).toContainText(hole);
    }
  }
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

function assertSafePins(guide: Guide, allowed?: Set<number>) {
  const board = guide.components[guide.build.board];
  const safe =
    allowed ??
    new Set(
      ((board as { safe_gpio?: number[] } | undefined)?.safe_gpio ?? []).filter(
        (n): n is number => typeof n === "number",
      ),
    );
  if (!allowed && !safe.size) {
    expect(guide.build.board).toBe("esp32-s3-devkitc-1-n16r8");
    for (const gpio of SAFE_S3) safe.add(gpio);
  }
  const pins = new Map(
    (guide.components[guide.build.board]?.pins ?? []).map((pin) => [pin.id, pin.gpio]),
  );
  const used = new Set<number>();
  for (const wire of guide.build.connections) {
    for (const end of [wire.from, wire.to]) {
      const pinId = end.startsWith("mcu:") ? end.slice(4) : end.replace(/^J/, "J");
      const gpio = pins.get(end.startsWith("mcu:") ? pinId : end);
      if (typeof gpio === "number") used.add(gpio);
      if (guide.build.board === "esp32-s3-devkitc-1-n16r8") {
        const hole = end.match(/^([aj])(\d+)$/);
        if (hole) {
          const row = Number(hole[2]);
          const header = hole[1] === "a" ? `J1.${row}` : `J3.${row}`;
          const mapped = pins.get(header);
          if (typeof mapped === "number") used.add(mapped);
        }
      }
    }
    expect(endIsReal(wire.from)).toBeTruthy();
    expect(endIsReal(wire.to)).toBeTruthy();
  }
  for (const gpio of used) {
    expect(safe.has(gpio), `GPIO${gpio} is not safe on ${guide.build.board}`).toBe(true);
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
    data: {
      idea,
      answers: {
        board: ["esp32-s3-devkitc-1-n16r8"],
        breadboard: ["full-830"],
      },
    },
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
    const groundStep = guide.build.steps.find((step) => /ground to the rail/i.test(step.heading));
    const groundWire = guide.build.connections.find((wire) => wire.id === "w_gnd");
    const hole = groundWire?.from.match(/^[a-j]\d+$/i)?.[0] ?? groundWire?.to;
    expect(groundStep?.callout).toBe(hole);
    const btnGnd = guide.build.connections.find((wire) => wire.id === "w_btn_gnd");
    expect(btnGnd?.to).toMatch(/^L-/);
    expect(JSON.stringify(guide.build.connections)).not.toMatch(/R[+-]@/);
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
    await walkGuide(page, 950, payload);
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
    await walkGuide(page, 950, payload);
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

  test("parts picker is catalog-only, grouped, and searchable", async ({ page }) => {
    await unlock(page);
    await page.goto(shareUrl("/ask?idea=catalog"));
    await expect(page.locator(".ask-card h1")).toBeVisible({ timeout: 90_000 });
    await pickBoard(page);
    await confirmBoard(page);
    await expect(page.getByTestId("breadboard-picker")).toBeVisible();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByTestId("path-picker")).toBeVisible();
    await page.getByRole("button", { name: /Choose parts/i }).click();
    await expect(page.getByTestId("parts-picker")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sensors" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Displays" })).toBeVisible();
    await page.getByPlaceholder("Search the catalog").fill("HC-SR04");
    await expect(page.getByRole("button", { name: "HC-SR04 ultrasonic distance sensor (5V)" })).toBeVisible();
    await expect(page.getByRole("button", { name: /HC-SR04P/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /SG90|servo/i })).toHaveCount(0);
  });

  test("idea list shows curated ideas first", async ({ page }) => {
    await unlock(page);
    await page.goto(
      shareUrl(
        `/ask?idea=${encodeURIComponent("motion-triggered servo that waves when someone walks by")}`,
      ),
    );
    await expect(page.locator(".ask-card h1")).toBeVisible({ timeout: 90_000 });
    await pickBoard(page);
    await confirmBoard(page);
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: /tested idea/i }).click();
    const lists = page.getByTestId("idea-list");
    await expect(lists.first()).toBeVisible();
    await expect(lists.first()).toContainText(/Motion servo|Ultrasonic ranger|I2C LCD/);
    await expect(page.getByText(/fresh ideas from the catalog/i)).toBeVisible();
  });

  test("every catalog board composes the reference idea set", async ({ request }) => {
    if (SHARE) await request.get(shareUrl("/"));
    const catalogRes = await request.get(shareUrl("/api/catalog"));
    expect(catalogRes.ok()).toBeTruthy();
    const catalog = (await catalogRes.json()) as {
      boards: Array<{ id: string; safe_gpio: number[] }>;
    };
    expect(catalog.boards.length).toBe(10);
    const ideas = [
      "motion-triggered servo that waves when someone walks by",
      "button that toggles an LED and shows status on an OLED",
    ];
    for (const board of catalog.boards) {
      for (const idea of ideas) {
        const res = await request.post(shareUrl("/api/compose"), {
          data: {
            idea,
            answers: { board: [board.id], breadboard: ["full-830"] },
          },
        });
        expect(res.ok(), `${board.id} × ${idea}: ${await res.text()}`).toBeTruthy();
        const guide = (await res.json()) as Guide;
        expect(guide.build.board).toBe(board.id);
        assertSafePins(guide, new Set(board.safe_gpio));
        if (board.id === "xiao-esp32c3" && /oled/i.test(idea)) {
          const cpp =
            guide.build.steps.find((step) => step.heading.toLowerCase().includes("flash"))
              ?.n != null
              ? JSON.stringify(guide)
              : "";
          expect(cpp).toMatch(/SDA_PIN = 6/);
          expect(cpp).toMatch(/SCL_PIN = 7/);
        }
      }
      const curated = [
        {
          idea: "An HC-SR04 measures distance and lights an LED when something is close.",
          parts: ["hc-sr04", "led-5mm-red", "resistor-220"],
        },
        { idea: "A short WS2812B strip on one safe GPIO.", parts: ["ws2812b-strip"] },
        { idea: "A 1602 LCD on the default I2C pins.", parts: ["lcd1602-i2c-pcf8574"] },
        {
          idea: "A TM1637 display and a button.",
          parts: ["tm1637-4digit", "tactile-button-6mm"],
        },
        {
          idea: "A KY-023 joystick steers an LED.",
          parts: ["joystick-ky023", "led-5mm-red", "resistor-220"],
        },
        {
          idea: "A button clicks a 5V relay. Low-voltage DC only — never mains.",
          parts: ["tactile-button-6mm", "relay-module-5v-1ch"],
        },
      ];
      for (const idea of curated) {
        const res = await request.post(shareUrl("/api/compose"), {
          data: {
            idea: idea.idea,
            answers: {
              board: [board.id],
              breadboard: ["full-830"],
              parts: idea.parts,
            },
          },
        });
        expect(res.ok(), `${board.id} × ${idea.idea}: ${await res.text()}`).toBeTruthy();
        const guide = (await res.json()) as Guide;
        expect(guide.build.board).toBe(board.id);
        assertSafePins(guide, new Set(board.safe_gpio));
      }
    }
  });

  test("compat-fix steps appear in the guide", async ({ request }) => {
    if (SHARE) await request.get(shareUrl("/"));
    const sonar = await request.post(shareUrl("/api/compose"), {
      data: {
        idea: "An HC-SR04 measures distance and lights an LED when something is close.",
        answers: {
          board: ["esp32-s3-devkitc-1-n16r8"],
          breadboard: ["full-830"],
          parts: ["hc-sr04", "led-5mm-red", "resistor-220"],
        },
      },
    });
    expect(sonar.ok(), await sonar.text()).toBeTruthy();
    const guide = (await sonar.json()) as Guide;
    const text = guide.build.steps.map((s) => `${s.heading} ${s.body}`).join("\n");
    expect(text).toMatch(/divider|1 kΩ|HC-SR04P/);
    expect(guide.build.parts.some((p) => /you'll also need/i.test((p as { note?: string }).note ?? "") || p.component === "resistor-1k")).toBeTruthy();
  });

  test("iPhone 390 shows the breadboard picker, reset view, and a C3 compose", async ({
    page,
    request,
  }) => {
    const flush = trackConsole(page);
    await page.setViewportSize({ width: 390, height: 844 });
    if (SHARE) await request.get(shareUrl("/"));
    const c3 = await request.post(shareUrl("/api/compose"), {
      data: {
        idea: "button that toggles an LED and shows status on an OLED",
        answers: { board: ["xiao-esp32c3"], breadboard: ["mini-170"] },
      },
    });
    expect(c3.ok(), await c3.text()).toBeTruthy();
    const guide = (await c3.json()) as Guide;
    expect(guide.build.board).toBe("xiao-esp32c3");
    assertSafePins(guide, new Set([3, 4, 5, 6, 7, 10]));
    expect(JSON.stringify(guide)).toMatch(/SDA_PIN = 6/);
    expect(JSON.stringify(guide)).toMatch(/SCL_PIN = 7/);

    await page.goto(
      shareUrl(
        `/ask?idea=${encodeURIComponent("button that toggles an LED and shows status on an OLED")}`,
      ),
    );
    await expect(page.locator(".ask-card h1")).toBeVisible({ timeout: 90_000 });
    await pickBoard(page, /XIAO ESP32C3|Seeed Studio XIAO ESP32C3/);
    await confirmBoard(page);
    await expect(page.getByTestId("breadboard-picker")).toBeVisible();
    await expect(page.getByText("Mini 170")).toBeVisible();

    await page.goto(shareUrl("/guide?id=pir-servo-s3"));
    await expect(page.locator(".bench")).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId("reset-view")).toBeVisible();
    await page.getByTestId("reset-view").click();
    expect(flush()).toEqual([]);
  });
});
