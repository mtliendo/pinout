/** Boards the hardware owner will deliver. Composer, picker, and e2e loop the live catalog so these light up when the JSON lands. */
export const EXPECTED_BOARDS = [
  "esp32-s3-devkitc-1-n16r8",
  "xiao-esp32c3",
  "xiao-esp32s3",
  "esp32-devkitc-v4",
  "esp32-c6-devkitc-1",
  "arduino-nano-esp32",
  "arduino-uno-r3",
  "arduino-nano",
  "raspberry-pi-pico",
  "raspberry-pi-pico-w",
] as const;

export type ExpectedBoardId = (typeof EXPECTED_BOARDS)[number];
