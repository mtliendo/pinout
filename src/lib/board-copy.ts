import { dim, isApprox, type Component } from "@/lib/specs/schema";

export type BoardCard = Pick<
  Component,
  | "id"
  | "name"
  | "chip"
  | "body"
  | "colors"
  | "headers"
  | "pins"
  | "features"
  | "kind"
  | "breadboard_fit"
  | "logic"
> & {
  five_v_logic?: boolean;
  fits_830?: boolean;
  off_board?: boolean;
};

export function boardShortName(board: { name: string }): string {
  return board.name.split("(")[0].trim();
}

export function boardFitLine(board: BoardCard): string {
  const fit = board.breadboard_fit;
  if (fit?.fits_830 === false || fit?.off_board) {
    return "Off the breadboard — jumpers from female headers.";
  }
  const cols = fit?.straddle ? Object.values(fit.straddle).join(" / ") : null;
  if (cols) return `Sits on an 830 in columns ${cols}.`;
  return "Sits on a solderless breadboard.";
}

export function formatDim(
  value: unknown,
  unit = "mm",
): { text: string; approx: boolean } {
  const n = dim(value as never, 0);
  const approx = isApprox(value);
  if (!n) return { text: "", approx };
  return {
    text: approx ? `about ${n} ${unit}` : `${n} ${unit}`,
    approx,
  };
}

export function boardSizeLines(board: BoardCard): string[] {
  const body = board.body ?? {};
  const lines: string[] = [];
  const length = formatDim(body.length_mm);
  const width = formatDim(body.width_mm);
  if (length.text && width.text) {
    lines.push(
      length.approx || width.approx
        ? `About ${dim(body.length_mm)} × ${dim(body.width_mm)} mm`
        : `${dim(body.length_mm)} × ${dim(body.width_mm)} mm`,
    );
  }
  const thick = formatDim(body.pcb_thickness_mm);
  if (thick.text) {
    lines.push(thick.approx ? `Thickness ${thick.text}` : `${thick.text} thick`);
  }
  const height = formatDim(body.height_mm);
  if (height.text) {
    lines.push(height.approx ? `Height ${height.text}` : `${height.text} tall`);
  }
  if (board.logic?.five_v_logic) lines.push("5V logic");
  return lines;
}

export const US_QUARTER = {
  diameter_mm: 24.26,
  thickness_mm: 1.75,
  label: "US quarter · 24.26 mm across",
};
