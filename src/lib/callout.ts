import { adjacentFreeHole, parseHole } from "./geometry";
import type { GuidePayload } from "./types";
import type { Build } from "./specs/schema";

const HOLE = /^[a-j]\d+$/i;

/** Board-hole the current step is actually wiring — not a leftover callout. */
export function stepFocus(
  step: Build["steps"][number] | undefined,
  payload: GuidePayload,
): string | undefined {
  if (!step) return undefined;
  const wires = (step.connections_added ?? [])
    .map((id) => payload.build.connections.find((row) => row.id === id))
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
  const holes = (wire: { from: string; to: string }) =>
    [wire.from, wire.to].filter((end) => HOLE.test(end));
  if (wires.length === 1) {
    return holes(wires[0])[0] ?? wires[0].from;
  }
  if (step.callout && wires.some((wire) => wire.from === step.callout || wire.to === step.callout)) {
    return step.callout;
  }
  if (wires.length === 0) return step.callout;
  for (const wire of wires) {
    const hole = holes(wire)[0];
    if (hole) return hole;
  }
  return step.callout;
}

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
