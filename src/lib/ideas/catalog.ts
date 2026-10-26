import { rowsNeeded } from "@/lib/seat";
import type { Component } from "@/lib/specs/schema";

/** Curated first, then a few AI ideas made only from catalog parts. */
export type IdeaSource = "curated" | "ai-catalog";
export type IdeaPath = "curated" | "catalog-parts";

/** Curated, tested ideas. Filter to the user's board + breadboard before any AI ideas. */
export type CuratedIdea = {
  id: string;
  title: string;
  blurb: string;
  partIds: string[];
  minRows: number;
  boards?: string[];
};

export const CURATED_IDEAS: CuratedIdea[] = [
  {
    id: "motion-servo",
    title: "Motion servo that waves",
    blurb: "A PIR sees someone walk by and an SG90 waves.",
    partIds: ["hc-sr501-pir", "sg90-servo", "led-5mm-red", "resistor-220"],
    minRows: 30,
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
  },
];

export function ideasFor(
  board: Component,
  breadboardRows: number,
): CuratedIdea[] {
  return CURATED_IDEAS.filter((idea) => {
    if (idea.minRows > breadboardRows) return false;
    if (idea.boards?.length && !idea.boards.includes(board.id)) return false;
    const roles = {
      led: idea.partIds.includes("led-5mm-red"),
      button: idea.partIds.includes("tactile-button-6mm"),
    };
    return rowsNeeded(board, roles) <= breadboardRows;
  });
}

/** AI ideas may only name ids from the starter-kit catalog. Never invent a part. */
export function catalogOnlyParts(
  partIds: readonly string[],
  allowed: ReadonlySet<string> | readonly string[],
): boolean {
  const set = allowed instanceof Set ? allowed : new Set(allowed);
  return partIds.every((id) => set.has(id));
}
