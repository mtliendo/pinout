import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Chip, Pin } from "@/lib/specs/schema";

/**
 * Pin safety is only ever read from verified `specs/chips/<chip>.json`.
 * Never infer GPIO safety from a photo or an LLM.
 * Boards may only remove pins from the chip's safe set — never add.
 */
export type ChipSpec = Chip;

export function chipIdForBoard(board: {
  chip?: string;
  defaults?: { chip?: string };
  id: string;
}): string | undefined {
  return board.chip ?? board.defaults?.chip;
}

export function mergeChipSafety<
  T extends { safe_gpio?: number[]; pins?: Pin[] },
>(board: T, chip: ChipSpec | null): T {
  if (!chip) return board;
  const chipSafe = new Set(chip.safe_gpio);
  const listed = board.safe_gpio ?? [];
  return {
    ...board,
    safe_gpio: listed.filter((gpio) => chipSafe.has(gpio)),
  };
}

export function loadChipSpecs(): Record<string, ChipSpec> {
  const dir = join(process.cwd(), "specs/chips");
  if (!existsSync(dir)) return {};
  const out: Record<string, ChipSpec> = {};
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".json"))) {
    try {
      const raw = JSON.parse(readFileSync(join(dir, file), "utf8")) as ChipSpec;
      if (raw?.id && Array.isArray(raw.safe_gpio)) out[raw.id] = raw;
    } catch {
      // Incoming files only — skip a broken chip spec rather than guess pins.
    }
  }
  return out;
}

export function chipSpecForBoard(board: {
  chip?: string;
  defaults?: { chip?: string };
  id: string;
}): ChipSpec | null {
  const id = chipIdForBoard(board);
  if (!id) return null;
  return loadChipSpecs()[id] ?? null;
}
