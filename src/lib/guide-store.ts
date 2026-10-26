import { GUIDE_KEY, type GuidePayload } from "./types";

export function saveGuide(payload: GuidePayload): void {
  sessionStorage.setItem(GUIDE_KEY, JSON.stringify(payload));
}

export function readGuide(): GuidePayload | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(GUIDE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GuidePayload;
  } catch {
    return null;
  }
}
