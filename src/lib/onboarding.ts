/**
 * Final onboarding order. Current UI covers board (ask) + breadboard + guide.
 * Board-confirm, path, and catalog parts list light up when specs land.
 */
export const ONBOARDING_STEPS = [
  "board",
  "board-confirm",
  "breadboard",
  "path",
  "parts",
  "guide",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const ONBOARDING_SHIPPED: OnboardingStep[] = [
  "board",
  "board-confirm",
  "breadboard",
  "path",
  "parts",
  "guide",
];
