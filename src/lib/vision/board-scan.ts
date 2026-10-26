/**
 * Unknown-board photo flow (not built yet).
 * User uploads top and bottom photos. Vision reads printed pin labels,
 * layout, and the module marking (ESP32-S3-WROOM-1, N16R8, RP2040, …).
 * The user confirms the 3D next to a US quarter (24.26 mm).
 * Pin safety still comes only from `specs/chips/<chip>.json`.
 * Unreadable marking or an unknown chip → pending review, never a guessed pin map.
 */
export const US_QUARTER_MM = 24.26;

export type BoardScanStatus = "ready" | "pending_review";

export type BoardScanDraft = {
  status: BoardScanStatus;
  moduleMarking?: string;
  chipId?: string;
  labels: Array<{ text: string; x_mm?: number; y_mm?: number }>;
  reason?: string;
};

export function holdForReview(reason: string): BoardScanDraft {
  return { status: "pending_review", labels: [], reason };
}
