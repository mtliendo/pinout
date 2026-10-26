import { adjacentFreeHole, parseHole } from "./geometry";
import type { GuidePayload } from "./types";

/** Human label for the magnifier, e.g. "a4 · GPIO4". */
export function labelForCallout(
  callout: string | undefined,
  payload: GuidePayload,
): string {
  if (!callout) return "";
  if (callout === "usb_uart") return "USB · UART";
  const parsed = parseHole(callout);
  const board = payload.components[payload.build.board];
  const mcu = payload.build.placements.find((p) => p.part === "mcu");
  if (parsed?.kind === "rail") return `${parsed.rail}`;
  if (parsed?.kind === "hole" && mcu && board) {
    for (const [pinId, hole] of Object.entries(mcu.pin_holes ?? {})) {
      const free = adjacentFreeHole(hole);
      if (hole === callout || free === callout) {
        const pin = board.pins?.find((p) => p.id === pinId);
        if (pin?.gpio != null) return `${callout} · GPIO${pin.gpio}`;
        if (pin?.label) return `${callout} · ${pin.label}`;
      }
    }
    return callout;
  }
  if (callout.includes(":")) {
    const [part, pin] = callout.split(":");
    return `${part} · ${pin}`;
  }
  return callout;
}
