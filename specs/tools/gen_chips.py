#!/usr/bin/env python3
"""Chip-family pin-safety files: chips/<chip>.json. Source of truth for boards added from photos.
Conservative by design: when unsure, a pin is caution. Board safe_gpio must be a subset of chip safe_gpio (validate.py)."""
import json
D="2026-10-26"
ESPDOC="https://www.espressif.com/sites/default/files/documentation/"
def W(p,o): json.dump(o,open(p,"w"),indent=2)
def prov(urls,notes): return {"sources":urls,"revision":"datasheets fetched "+D,"verified_by":"Maker","verified_on":D,"notes":notes}
def R(a,b): return list(range(a,b+1))
ESP_ALIASES={
 "chip_level":{"IO{n}":"GPIOn (Espressif silkscreen)","GPIO{n}":"GPIOn","G{n}":"GPIOn on many clones (but a bare 'G' is GND)","{n}":"bare number next to a header = GPIOn on Espressif DevKits",
   "TX / TXD / TX0":"UART0 TX (see uart0)","RX / RXD / RX0":"UART0 RX (see uart0)","EN / RST / CHIP_PU":"reset, not a GPIO","BOOT":"button on the boot strapping GPIO"},
 "board_level":{"D{n}":"Arduino/XIAO-style digital number. NOT GPIOn on XIAO or Arduino Nano ESP32; look up the board's own map","A{n}":"analog alias, board-specific","SDA / SCL":"board/framework default I2C, board-specific (ESP32 can route I2C to almost any GPIO)","MOSI/MISO/SCK/SS, COPI/CIPO/CS":"board/framework default SPI","LED / LED_BUILTIN":"board-specific","VP / VN":"classic ESP32 only: GPIO36 / GPIO39 (SENSOR_VP/VN)"},
 "never_map":["CLK","CMD","SD0","SD1","SD2","SD3","D0..D3 printed next to CLK/CMD on classic ESP32 DevKitC = flash pins, NOT Arduino D0-D3"]}
chips=[]
# ---------- ESP32 classic ----------
chips.append({"id":"esp32","name":"Espressif ESP32 (classic, Xtensa LX6)","logic_voltage_v":3.3,"five_v_tolerant":False,
"gpio_numbers":R(0,19)+[21,22,23,25,26,27]+R(32,39),
"strapping_gpio":[0,2,5,12,15],
"flash_psram_gpio":{"spi_flash":[6,7,8,9,10,11],"wrover_or_inpackage_psram":[16,17],"notes":"GPIO6-11 connect to SPI flash on all modules (DevKitC footnote: 'Avoid using these pins'). On ESP32-WROVER modules and chips with in-package PSRAM (e.g. ESP32-D0WDR2-V3) GPIO16/17 are reserved for PSRAM; on WROOM/SOLO they are free. ESP32-U4WDH / in-package flash parts use six GPIOs internally (datasheet 2-5)."},
"usb_gpio":None,"usb_note":"No native USB; boards use a USB-UART bridge on UART0.",
"uart0":{"tx":1,"rx":3},"input_only_gpio":[34,35,36,37,38,39],
"adc2_wifi_conflict":{"gpio":[0,2,4,12,13,14,15,25,26,27],"note":"ADC2 can't be used while Wi-Fi is on (ESP-IDF ADC docs). Digital use is fine.","approx":True,"approx_note":"Not quoted from the chip datasheet text; from ESP-IDF ADC documentation."},
"safe_gpio":[4,13,14,18,19,21,22,23,25,26,27,32,33],
"caution_gpio":{"0":"strapping: boot mode; BOOT button on most boards","2":"strapping: boot mode (must be low/floating for download)","5":"strapping: SDIO slave timing (with MTDO)","12":"strapping MTDI: flash voltage (VDD_SDIO). High at reset on a 3.3V-flash module = boot failure","15":"strapping MTDO: ROM log + SDIO timing","1":"UART0 TX (USB-serial console/flashing)","3":"UART0 RX (USB-serial console/flashing)","16":"PSRAM on WROVER/in-package-PSRAM parts; free on WROOM (kept caution: photo can't always tell)","17":"PSRAM on WROVER/in-package-PSRAM parts; free on WROOM (kept caution)","34":"input-only, no pull-ups","35":"input-only, no pull-ups","36":"input-only (SENSOR_VP), no pull-ups","37":"input-only; usually not broken out","38":"input-only; usually not broken out","39":"input-only (SENSOR_VN), no pull-ups"},
"no_go_gpio":{str(g):"SPI flash (CLK/SD0-3/CMD)" for g in (6,7,8,9,10,11)},
"platformio":{"platform":"espressif32","frameworks":["arduino","espidf"],"example_boards":["esp32dev"]},
"label_aliases":ESP_ALIASES,
"provenance":prov([ESPDOC+"esp32_datasheet_en.pdf","https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32/esp32-devkitc/user_guide.html","https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/peripherals/adc_oneshot.html"],"Strapping GPIO0/2/MTDI(12)/MTDO(15)/GPIO5 and input-only 34-39 quoted from datasheet section 3 / IO_MUX notes.")})
# ---------- ESP32-S2 ----------
chips.append({"id":"esp32-s2","name":"Espressif ESP32-S2 (Xtensa LX7, single core)","logic_voltage_v":3.3,"five_v_tolerant":False,
"gpio_numbers":R(0,21)+R(26,46),"strapping_gpio":[0,45,46],
"flash_psram_gpio":{"spi_flash_psram":[26,27,28,29,30,31,32],"notes":"GPIO26-32 are the SPI flash/PSRAM bus (SPICS1=26 is PSRAM CS). In-package flash/PSRAM variants use them internally."},
"usb_gpio":{"dm":19,"dp":20},"uart0":{"tx":43,"rx":44},"input_only_gpio":[46],
"adc2_wifi_conflict":{"gpio":R(11,20),"note":"ADC2 shares with Wi-Fi; readings can fail while Wi-Fi is on.","approx":True,"approx_note":"From ESP-IDF ADC docs, not quoted from datasheet text."},
"safe_gpio":R(1,18)+[21]+R(38,42),
"caution_gpio":{"0":"strapping: boot mode, BOOT button","45":"strapping: VDD_SPI voltage","46":"strapping: boot mode/ROM log; input-only","19":"native USB D-","20":"native USB D+","43":"UART0 TX console","44":"UART0 RX console","33":"octal PSRAM on some modules","34":"octal PSRAM on some modules","35":"octal PSRAM on some modules","36":"octal PSRAM on some modules","37":"octal PSRAM on some modules"},
"no_go_gpio":{str(g):"SPI flash/PSRAM bus" for g in R(26,32)},
"platformio":{"platform":"espressif32","frameworks":["arduino","espidf"],"example_boards":["esp32-s2-saola-1"]},
"label_aliases":ESP_ALIASES,
"provenance":prov([ESPDOC+"esp32-s2_datasheet_en.pdf"],"Strapping GPIO0/45/46 and USB_D-/D+ = GPIO19/20 quoted from the datasheet pin table. GPIO46 input-only per datasheet IO table (approx: verify on your module). Conservative: 33-37 kept caution (octal PSRAM on some modules).")})
# ---------- ESP32-S3 ----------
chips.append({"id":"esp32-s3","name":"Espressif ESP32-S3 (Xtensa LX7, dual core)","logic_voltage_v":3.3,"five_v_tolerant":False,
"gpio_numbers":R(0,21)+R(26,48),"strapping_gpio":[0,3,45,46],
"flash_psram_gpio":{"spi_flash":[26,27,28,29,30,31,32],"octal_psram_or_flash":[33,34,35,36,37],"notes":"GPIO26-32 carry SPI flash/PSRAM on every module. On octal (OPI) flash/PSRAM modules (WROOM-1 N16R8/N8R8, WROOM-2) GPIO33-37 are also used and are 'not available for external use'. Quad modules leave 33-37 free; we keep them caution at chip level, and an octal board must list 35-37 (and any broken-out 33/34) as never."},
"usb_gpio":{"dm":19,"dp":20},"uart0":{"tx":43,"rx":44},"input_only_gpio":[],
"adc2_wifi_conflict":{"gpio":R(11,20),"note":"Datasheet: 'ADC2_CH… analog functions cannot be used with Wi-Fi simultaneously'. Digital use is fine.","approx":False},
"safe_gpio":R(1,2)+R(4,18)+[21]+R(38,42)+[47,48],
"caution_gpio":{"0":"strapping: boot mode, BOOT button","3":"strapping: JTAG signal source","45":"strapping: VDD_SPI voltage","46":"strapping: boot mode/ROM log","19":"native USB D-","20":"native USB D+","43":"UART0 TX console","44":"UART0 RX console","33":"octal flash/PSRAM on OPI modules","34":"octal flash/PSRAM on OPI modules","35":"octal flash/PSRAM on OPI modules","36":"octal flash/PSRAM on OPI modules","37":"octal flash/PSRAM on OPI modules"},
"no_go_gpio":{str(g):"SPI flash/PSRAM bus" for g in R(26,32)},
"notes":"GPIO38/48 often drive an onboard RGB LED and 39-42 are JTAG; boards remove them as needed.",
"platformio":{"platform":"espressif32","frameworks":["arduino","espidf"],"example_boards":["esp32-s3-devkitc-1","arduino_nano_esp32","seeed_xiao_esp32s3"]},
"label_aliases":ESP_ALIASES,
"provenance":prov([ESPDOC+"esp32-s3_datasheet_en.pdf","https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32s3/esp32-s3-devkitc-1/user_guide_v1.1.html"],"Strapping GPIO0/3/45/46, USB 19/20 and ADC2/Wi-Fi sentence quoted from the datasheet.")})
# ---------- ESP32-C3 ----------
chips.append({"id":"esp32-c3","name":"Espressif ESP32-C3 (RISC-V single core)","logic_voltage_v":3.3,"five_v_tolerant":False,
"gpio_numbers":R(0,21),"strapping_gpio":[2,8,9],
"flash_psram_gpio":{"spi_flash":[12,13,14,15,16,17],"vdd_spi":[11],"notes":"GPIO12-17 are the SPI flash bus (in-package flash on C3FN4/FH4 uses them internally). GPIO11 is VDD_SPI by default (usable as GPIO only after an eFuse change)."},
"usb_gpio":{"dm":18,"dp":19},"uart0":{"tx":21,"rx":20},"input_only_gpio":[],
"adc2_wifi_conflict":{"gpio":[5],"note":"GPIO5 is ADC2_CH0; Espressif/Seeed say ADC2 is unreliable, use ADC1 (GPIO0-4) for analog.","approx":True,"approx_note":"From Seeed wiki + ESP-IDF docs, not datasheet text."},
"safe_gpio":[0,1,3,4,5,6,7,10],
"caution_gpio":{"2":"strapping: boot mode","8":"strapping: boot mode/ROM log (must be high for download)","9":"strapping: boot mode, BOOT button","18":"native USB D-","19":"native USB D+","20":"UART0 RX","21":"UART0 TX","11":"VDD_SPI by default"},
"no_go_gpio":{str(g):"SPI flash bus" for g in R(12,17)},
"notes":"GPIO0/1 are the 32 kHz crystal pins if one is fitted; GPIO4-7 are JTAG (fine as GPIO).",
"platformio":{"platform":"espressif32","frameworks":["arduino","espidf"],"example_boards":["esp32-c3-devkitm-1","seeed_xiao_esp32c3"]},
"label_aliases":ESP_ALIASES,
"provenance":prov([ESPDOC+"esp32-c3_datasheet_en.pdf","https://wiki.seeedstudio.com/XIAO_ESP32C3_Getting_Started/"],"Strapping GPIO2/8/9 and USB GPIO18/19 quoted from the datasheet. GPIO11 VDD_SPI and flash 12-17: datasheet pin table (approx for your exact package).")})
# ---------- ESP32-C6 ----------
chips.append({"id":"esp32-c6","name":"Espressif ESP32-C6 (RISC-V, Wi-Fi 6, 802.15.4)","logic_voltage_v":3.3,"five_v_tolerant":False,
"gpio_numbers":R(0,30),"strapping_gpio":[4,5,8,9,15],
"flash_psram_gpio":{"spi_flash":[24,25,26,27,28,29,30],"notes":"GPIO24-30 are the SPI flash bus on modules/in-package flash; not broken out on DevKitC-1."},
"usb_gpio":{"dm":12,"dp":13},"uart0":{"tx":16,"rx":17},"input_only_gpio":[],
"adc2_wifi_conflict":{"gpio":[],"note":"C6 has only ADC1 (GPIO0-6), so no ADC2/Wi-Fi conflict.","approx":True,"approx_note":"From the datasheet analog table summary; verify."},
"safe_gpio":[0,1,2,3,6,7,10,11,18,19,20,21,22,23],
"caution_gpio":{"4":"strapping (MTMS)","5":"strapping (MTDI)","8":"strapping; RGB LED on DevKitC-1","9":"strapping, BOOT button","15":"strapping","12":"native USB D-","13":"native USB D+","16":"UART0 TX","17":"UART0 RX","14":"not bonded on every package (approx); avoid"},
"no_go_gpio":{str(g):"SPI flash bus" for g in R(24,30)},
"notes":"GPIO0/1 are XTAL_32K if a crystal is fitted; 4-7 are JTAG.",
"platformio":{"platform":"espressif32 (official: ESP-IDF only for this board) or pioarduino for Arduino","frameworks":["espidf","arduino (pioarduino)"],"example_boards":["esp32-c6-devkitc-1"]},
"label_aliases":ESP_ALIASES,
"provenance":prov([ESPDOC+"esp32-c6_datasheet_en.pdf","https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32c6/esp32-c6-devkitc-1/user_guide.html","https://docs.platformio.org/en/latest/boards/espressif32/esp32-c6-devkitc-1.html"],"Strapping GPIO4/5/8/9/15 and USB GPIO12/13 quoted from the datasheet.")})
# ---------- RP2040 ----------
chips.append({"id":"rp2040","name":"Raspberry Pi RP2040","logic_voltage_v":3.3,"five_v_tolerant":False,
"five_v_note":"RP2040 datasheet: 'Fault Tolerant' pins only means little current flows below 3.63V when IOVDD is 0V. Not 5V tolerant.",
"gpio_numbers":R(0,29),"strapping_gpio":[],"flash_psram_gpio":{"notes":"Flash is on dedicated QSPI pins (not GPIO). BOOTSEL is on QSPI_SS, not a GPIO."},
"usb_gpio":None,"usb_note":"USB D+/D- are dedicated pins, not GPIO.","uart0":{"tx":0,"rx":1,"note":"Pico SDK default UART0 (PICO_DEFAULT_UART_TX/RX_PIN)"},
"input_only_gpio":[],"adc_gpio":[26,27,28,29],"adc2_wifi_conflict":None,
"safe_gpio":R(0,29),"caution_gpio":{},"no_go_gpio":{},
"notes":"Every chip GPIO is safe at chip level; boards remove the ones they use internally (Pico: 23/24/25/29; Pico W: 23/24/25/29 radio).",
"platformio":{"platform":"raspberrypi (official, Arduino-Mbed core) or https://github.com/maxgerhardt/platform-raspberrypi.git (community, Earle Philhower arduino-pico core)","frameworks":["arduino"],"example_boards":["pico","rpipicow (community platform only)"]},
"label_aliases":{"chip_level":{"GP{n}":"GPIOn (Pico silkscreen)","GPIO{n}":"GPIOn","ADC{k}":"GPIO26+k (k=0..3)"},"board_level":{"physical pin 1-40":"Pico header number, NOT a GPIO","D{n}":"some RP2040 boards (e.g. Arduino Nano RP2040 Connect) use Arduino numbers; look up the board"},"never_map":["RUN","3V3_EN","VSYS","VBUS","ADC_VREF","AGND"]},
"provenance":prov(["https://datasheets.raspberrypi.com/rp2040/rp2040-datasheet.pdf","https://github.com/raspberrypi/pico-sdk/blob/master/src/boards/include/boards/pico.h"],"Fault-tolerant definition quoted from datasheet pad table.")})
# ---------- ATmega328P ----------
chips.append({"id":"atmega328p","name":"Microchip ATmega328P (AVR, 5V on Uno/Nano)","logic_voltage_v":5.0,"logic_voltage_note":"Logic = VCC (1.8-5.5V). Uno and Nano run it at 5V: outputs swing to 5V. 3.3V-only parts (SSD1306 bare chip, many sensors) need a level shifter or a 3.3V-tolerant module.","five_v_tolerant":True,
"gpio_numbering":"Arduino pin numbers (D0-D13, A0-A5 = 14-19, A6/A7 = 20/21 analog-only on TQFP/QFN). Port aliases in label_aliases.",
"gpio_numbers":R(0,21),"strapping_gpio":[],"flash_psram_gpio":{"notes":"Internal flash; no external memory pins. ISP programming uses D11-D13 (MOSI/MISO/SCK) + RESET."},
"usb_gpio":None,"usb_note":"No native USB; Uno/Nano use a USB-serial chip on D0/D1.","uart0":{"tx":1,"rx":0},"input_only_gpio":[20,21],"adc2_wifi_conflict":None,
"safe_gpio":R(2,12)+R(14,19),
"caution_gpio":{"0":"RX, wired to the USB-serial chip; using it blocks uploads/Serial","1":"TX, wired to the USB-serial chip","13":"SPI SCK and the onboard LED on Arduino boards","20":"A6: analog input only (TQFP/QFN packages)","21":"A7: analog input only (TQFP/QFN packages)"},
"no_go_gpio":{},
"platformio":{"platform":"atmelavr","frameworks":["arduino"],"example_boards":["uno","nanoatmega328"]},
"label_aliases":{"chip_level":{"PB0-PB5":"D8-D13","PD0-PD7":"D0-D7","PC0-PC5":"A0-A5 = 14-19","ADC6/ADC7":"A6/A7"},"board_level":{"D{n} / ~D{n}":"Arduino digital n (~ = PWM)","A{n}":"Arduino analog n = 14+n","SDA/SCL":"A4/A5 (Uno R3 also duplicates them near AREF)","TX/RX, TX1/RX0":"D1/D0"},"never_map":["AREF","IOREF","RESET","VIN"]},
"provenance":prov(["https://ww1.microchip.com/downloads/en/DeviceDoc/Atmel-7810-Automotive-Microcontrollers-ATmega328P_Datasheet.pdf","https://docs.arduino.cc/resources/pinouts/A000005-full-pinout.pdf"],"Pin voltage limit VCC+0.5V quoted from datasheet absolute max. 'five_v_tolerant' is true only because VCC is 5V on Uno/Nano.")})
for c in chips: W(f"chips/{c['id']}.json",c)
print("chips:",[c["id"] for c in chips])
