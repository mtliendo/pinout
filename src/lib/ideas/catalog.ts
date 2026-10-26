import { preferredSafeGpio } from "@/lib/geometry";
import { rowsNeeded } from "@/lib/seat";
import type { Component } from "@/lib/specs/schema";

/** Curated first, then a few AI ideas made only from catalog parts. */
export type IdeaSource = "curated" | "ai-catalog";
export type IdeaPath = "curated" | "catalog-parts";

export type CuratedIdea = {
  id: string;
  title: string;
  blurb: string;
  partIds: string[];
  minRows: number;
  minSafeGpio?: number;
  boards?: string[];
  source?: IdeaSource;
};

export const CURATED_IDEAS: CuratedIdea[] = [
  {
    id: "motion-servo",
    title: "Motion servo that waves",
    blurb: "A PIR sees someone walk by and an SG90 waves.",
    partIds: ["hc-sr501-pir", "sg90-servo", "led-5mm-red", "resistor-220"],
    minRows: 30,
    source: "curated",
  },
  {
    id: "button-led-oled",
    title: "Button, LED and OLED",
    blurb: "A button toggles an LED and writes the state on an SSD1306.",
    partIds: [
      "tactile-button-6mm",
      "led-5mm-red",
      "resistor-220",
      "ssd1306-oled-128x64-i2c",
    ],
    minRows: 17,
    source: "curated",
  },
  {
    id: "ultrasonic-ranger",
    title: "Ultrasonic ranger",
    blurb: "An HC-SR04 measures distance and lights an LED when something is close.",
    partIds: ["hc-sr04", "led-5mm-red", "resistor-220"],
    minRows: 17,
    minSafeGpio: 3,
    source: "curated",
  },
  {
    id: "neo-strip",
    title: "Addressable LED strip",
    blurb: "A short WS2812B strip on one safe GPIO.",
    partIds: ["ws2812b-strip"],
    minRows: 10,
    minSafeGpio: 1,
    source: "curated",
  },
  {
    id: "i2c-lcd",
    title: "I2C LCD message",
    blurb: "A 1602 LCD on the default I2C pins.",
    partIds: ["lcd1602-i2c-pcf8574"],
    minRows: 10,
    minSafeGpio: 2,
    source: "curated",
  },
  {
    id: "four-digit",
    title: "Four-digit counter",
    blurb: "A TM1637 display and a button.",
    partIds: ["tm1637-4digit", "tactile-button-6mm"],
    minRows: 17,
    minSafeGpio: 3,
    source: "curated",
  },
  {
    id: "joystick-led",
    title: "Joystick and LED",
    blurb: "A KY-023 joystick steers an LED.",
    partIds: ["joystick-ky023", "led-5mm-red", "resistor-220"],
    minRows: 17,
    minSafeGpio: 4,
    source: "curated",
  },
  {
    id: "relay-click",
    title: "Low-voltage relay click",
    blurb: "A button clicks a 5V relay. Low-voltage DC only — never mains.",
    partIds: ["tactile-button-6mm", "relay-module-5v-1ch"],
    minRows: 17,
    minSafeGpio: 2,
    source: "curated",
  },
];

/** Fresh ideas named only from catalog parts. Still composed and validated. */
export const AI_CATALOG_IDEAS: CuratedIdea[] = [
  {
    id: "ai-blue-dim",
    title: "Blue LED status",
    blurb: "A blue LED on a safe GPIO. On 3.3V boards it may look dim.",
    partIds: ["led-5mm-blue", "resistor-220", "tactile-button-6mm"],
    minRows: 17,
    minSafeGpio: 2,
    source: "ai-catalog",
  },
  {
    id: "ai-active-buzzer",
    title: "Button buzzer",
    blurb: "A button drives an active buzzer.",
    partIds: ["tactile-button-6mm", "buzzer-active-ky012"],
    minRows: 14,
    minSafeGpio: 2,
    source: "ai-catalog",
  },
];

export function ideasFor(
  board: Pick<Component, "id"> & Partial<Component>,
  breadboardRows: number,
  includeAi = false,
): CuratedIdea[] {
  const list = includeAi
    ? [...CURATED_IDEAS, ...AI_CATALOG_IDEAS]
    : CURATED_IDEAS;
  const safe = preferredSafeGpio(board as Component).length;
  return list.filter((idea) => {
    if (idea.minRows > breadboardRows) return false;
    if (idea.boards?.length && !idea.boards.includes(board.id)) return false;
    if ((idea.minSafeGpio ?? 0) > safe) return false;
    const roles = {
      led: idea.partIds.some((id) => id.startsWith("led-5mm")),
      button: idea.partIds.includes("tactile-button-6mm"),
    };
    return rowsNeeded(board as Component, roles) <= breadboardRows;
  });
}

export function catalogOnlyParts(
  partIds: readonly string[],
  allowed: ReadonlySet<string> | readonly string[],
): boolean {
  const set = allowed instanceof Set ? allowed : new Set(allowed);
  return partIds.every((id) => set.has(id));
}
