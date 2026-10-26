import type { Breadboard, Build, Component, WireColors } from "./specs/schema";

export type GuidePayload = {
  build: Build;
  components: Record<string, Component>;
  breadboard: Breadboard;
  wireColors: WireColors;
};

export const GUIDE_KEY = "pinout:guide";
