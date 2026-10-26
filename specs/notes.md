# Pinout hardware notes (verified by Maker, 2026-10-26)

## ESP32-S3-DevKitC-1 (N16R8): no-go and caution pins
Source: Espressif DevKitC-1 v1.1 user guide (header tables J1/J3, RGB LED, octal note), https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32s3/esp32-s3-devkitc-1/user_guide_v1.1.html ; strapping list from Seeed's ESP32-S3 strapping section (quotes the chip manual), https://wiki.seeedstudio.com/xiao_esp32s3_getting_started/

**No-go**
- GPIO35, 36, 37: on octal flash/PSRAM modules (N16R8, N8R8, WROOM-2) these pins are used internally for the flash/PSRAM link and are "not available for external use" (Espressif).

**Caution (not in safe_gpio)**
- GPIO0: strapping (boot mode); also the BOOT button.
- GPIO3: strapping (JTAG signal source).
- GPIO45: strapping (VDD_SPI voltage).
- GPIO46: strapping (boot mode, ROM message printing).
- GPIO19 / GPIO20: native USB D- / D+ (the "USB" port).
- GPIO43 / GPIO44: UART0 TX/RX to the USB-to-UART bridge (the "UART" port).
- GPIO38: onboard addressable RGB LED (v1.1). GPIO48 drove it on the initial board version, and clones vary, so 48 is also kept out of safe_gpio.
- GPIO39-42: JTAG (MTCK/MTDO/MTDI/MTMS). They're fine as GPIO and are in safe_gpio, but flagged.
- RST (J1.3) is EN: pulling it low resets the chip.

**Safe for general signals:** 1, 2, 4-18, 21, 39-42, 47.

**Board facts:** the board is 62.74 x 25.40 mm and the header rows are 22.86 mm apart (Espressif DXF). The 5V pin is fed from USB VBUS through a 1N5819 Schottky diode on each USB port, and 3.3V comes from an SGM2212-3.3 LDO (schematic SCH_ESP32-S3-DevKitC-1_V1.1_20221130). The official board uses Micro-USB; many N16R8 retail boards use USB-C.

## XIAO caution pins
**XIAO ESP32C3** (Seeed wiki):
- GPIO2 (D0), GPIO8 (D8) and GPIO9 (D9/BOOT) are strapping pins.
- GPIO20/21 (D7/D6) are UART0.
- D3 (GPIO5) is ADC2, which Seeed calls unreliable for analog.
- There's no user LED.
- Safe: GPIO3, 4, 5, 6, 7, 10.

**XIAO ESP32S3** (Seeed wiki):
- GPIO3 (D2) is a strapping pin.
- GPIO43/44 (D6/D7) are UART0.
- GPIO0 is BOOT.
- GPIO21 is the user LED (active LOW).
- On the **Sense**:
  - D8-D10 (GPIO7-9) are shared with the SD card, and GPIO21 is SD CS.
  - GPIO41/42 are the mic.
  - The camera uses GPIO10-18, 38-40, 47 and 48.
- A11/A12 (GPIO41/42) have no ADC.
- Safe: GPIO1, 2, 4, 5, 6, 7, 8, 9.

**Both XIAOs:**
- The 3V3 pin can supply 700 mA (Seeed).
- Feeding the 5V pin from outside needs a diode.
- On battery power there's no voltage on 5V.

## Power
**SG90 on the DevKit 5V pin:**
- TowerPro rates the SG90 at 4.8V, with 1.8 kg·cm stall torque and 0.1 s/60°, and says "Power Supply: Through External Adapter".
- **TowerPro publishes no current figures.** A reseller sheet (auselectronicsdirect TA0132) says "up to 200 mA under load". Stall current is unverified.
- The DevKit 5V pin is VBUS minus a Schottky drop, so a single SG90 on a light load over USB generally works.
- Motor start and stall spikes can brown out the S3, so the build step recommends:
  - A 100-470 µF electrolytic across the 5V/GND rails near the servo. This is engineering practice, not a datasheet figure.
  - A separate 5V supply with a shared GND for more than one servo, any real load, or if resets happen.

**HC-SR501:**
- Supply is 4.5-20V DC (some sheets say 5-20V), so use 5V. The output is 3.3V high and 0V low.
- That makes the output **3.3V-safe** for ESP32 inputs.
- Don't power it from 3V3, which is below its rated minimum.
- Warm-up takes about 1 minute, with false triggers during that time.
- Sources: Particle-hosted sheet, Pollin D810590, Tayda A-4432 and Adafruit's PIR guide.

**General:** ESP32 GPIOs are 3.3V. Never put 5V on a GPIO; validate.py fails any net that joins a GPIO to 5V.

## Breadboard fit: DevKitC-1 on an 830-point board
- The header rows are 22.86 mm apart (9 × 2.54 mm). On an 830 board the columns are a-e, then a 0.3" gap, then f-j (j is 11 pitches from a).
- Straddling the gap puts J1 in column **b** and J3 in column **i**. That leaves **1 free hole per pin on each side** (column a on the left, column j on the right). The board body covers c-h.
- Recommended layout:
  - Straddle like that, and take wires from columns a and j into the rails (used in builds/pir-servo-s3.json).
  - If you need more room, either use two breadboards side by side (one header per board) or plug only one header in and run jumpers.
- Rails: 4 × 50 tie points (BusBoard BB830). Some boards split each rail at the middle; look for a break in the red/blue line and bridge it. Rail order varies, so trust the printed + and - markings.

## Second batch (2026-10-26)
- Chip files in `chips/` are the pin-safety source of truth; boards reference them with `chip`.
- ESP32 classic: GPIO16/17 are kept caution at chip level (PSRAM on WROVER), so the DevKitC V4 (WROOM-32E, where they're free) still leaves them out of safe_gpio.
- DevKitC V4 rows are 25.40 mm apart: no free hole on the J2 side of an 830 breadboard.
- Uno and Nano are 5V logic: SSD1306 and other 3.3V parts need care.
- C6 Arduino needs the pioarduino platform; Pico W needs maxgerhardt's platform (`rpipicow`).
- XIAO ESP32C3 re-checked against Seeed wiki: GPIO2/8/9 strapping, D4=GPIO6 SDA, D5=GPIO7 SCL. Spec is correct.
