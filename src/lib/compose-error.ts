import { FitError } from "./seat";

export const COMPOSE_FAILED =
  "Pinout could not seat that circuit on this board. Try another board, or different catalog parts.";

export function friendlyComposeError(error: unknown): {
  error: string;
  code: "does_not_fit" | "compose_failed";
} {
  if (error instanceof FitError) {
    return { error: error.message, code: "does_not_fit" };
  }
  const raw = error instanceof Error ? error.message : String(error ?? "");
  if (/needs more rows|only has \d+ rows/i.test(raw)) {
    return { error: raw, code: "does_not_fit" };
  }
  return { error: COMPOSE_FAILED, code: "compose_failed" };
}

export function stripValidatorText(raw: string): string {
  if (/Invalid build|hole .+ used|non-safe GPIO|never fed|bad hole/i.test(raw)) {
    return COMPOSE_FAILED;
  }
  return raw || COMPOSE_FAILED;
}
