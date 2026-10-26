import json
board_holes={f"J1.{n}":f"b{n}" for n in range(1,23)}|{f"J3.{n}":f"i{n}" for n in range(1,23)}
code='''#include <Arduino.h>
#include <ESP32Servo.h>

const int PIR_PIN   = 4;   // J1.4  -> HC-SR501 OUT (3.3V high)
const int SERVO_PIN = 5;   // J1.5  -> SG90 orange
const int LED_PIN   = 6;   // J1.6  -> 220R -> LED

Servo servo;

void setup() {
  Serial.begin(115200);
  pinMode(PIR_PIN, INPUT);
  pinMode(LED_PIN, OUTPUT);
  servo.setPeriodHertz(50);           // standard 50 Hz servo
  servo.attach(SERVO_PIN, 500, 2400); // SG90 pulse range (us)
  servo.write(0);
  Serial.println("Warming up PIR (~60 s)...");
}

void loop() {
  if (digitalRead(PIR_PIN) == HIGH) {
    digitalWrite(LED_PIN, HIGH);
    for (int a = 0; a <= 180; a += 2) { servo.write(a); delay(10); }
    for (int a = 180; a >= 0; a -= 2) { servo.write(a); delay(10); }
  } else {
    digitalWrite(LED_PIN, LOW);
  }
  delay(50);
}
'''
ini='''[env:esp32-s3-devkitc-1]
platform = espressif32
board = esp32-s3-devkitc-1
framework = arduino
monitor_speed = 115200
lib_deps = madhephaestus/ESP32Servo
; N16R8: if your board has 16 MB flash / octal PSRAM, add:
; board_build.arduino.memory_type = qio_opi
; board_upload.flash_size = 16MB
'''
b={"id":"pir-servo-s3","title":"Motion-triggered servo sweep","summary":"An HC-SR501 PIR sees motion, the ESP32-S3 lights an LED and sweeps an SG90 servo.","board":"esp32-s3-devkitc-1-n16r8",
"parts":[{"id":"bb","component":"breadboard-830","qty":1},{"id":"mcu","component":"esp32-s3-devkitc-1-n16r8","qty":1},{"id":"pir","component":"hc-sr501-pir","qty":1},{"id":"servo","component":"sg90-servo","qty":1},{"id":"led1","component":"led-5mm-red","qty":1},{"id":"r1","component":"resistor-220","qty":1},{"id":"jumpers_mm","component":"jumper-male-male","qty":6,"note":"generic, not in catalog"},{"id":"jumpers_fm","component":"jumper-female-male","qty":3,"note":"for PIR header"}],
"placements":[
 {"part":"mcu","anchor_hole":"b1","rotation_deg":0,"note":"Straddles the gap: J1 in column b, J3 in column i, rows 1-22. Antenna end at row 1, USB end past row 22.","pin_holes":board_holes},
 {"part":"r1","anchor_hole":"b30","rotation_deg":0,"pin_holes":{"1":"b30","2":"b34"}},
 {"part":"led1","anchor_hole":"c35","rotation_deg":180,"pin_holes":{"A":"c34","K":"c35"},"note":"Long leg (anode) in row 34."},
 {"part":"pir","anchor_hole":None,"off_board":True,"position_hint":"left of the breadboard, lens facing up/out"},
 {"part":"servo","anchor_hole":None,"off_board":True,"position_hint":"right of the breadboard, near row 45"}],
"connections":[
 {"id":"w_5v","from":"a21","to":"L+@21","color":"red","length_mm":20,"net":"5V"},
 {"id":"w_gnd","from":"a22","to":"L-@22","color":"black","length_mm":20,"net":"GND"},
 {"id":"w_pir_vcc","from":"pir:VCC","to":"L+@40","color":"red","length_mm":150,"net":"5V"},
 {"id":"w_pir_gnd","from":"pir:GND","to":"L-@42","color":"black","length_mm":150,"net":"GND"},
 {"id":"w_pir_out","from":"pir:OUT","to":"a4","color":"green","length_mm":150,"net":"PIR_OUT"},
 {"id":"w_srv_vcc","from":"servo:VCC","to":"L+@45","color":"red","length_mm":100,"net":"5V"},
 {"id":"w_srv_gnd","from":"servo:GND","to":"L-@46","color":"black","length_mm":100,"net":"GND","note":"servo wire is brown"},
 {"id":"w_srv_sig","from":"servo:SIG","to":"a5","color":"yellow","length_mm":150,"net":"SERVO_PWM"},
 {"id":"w_led","from":"a6","to":"a30","color":"purple","length_mm":65,"net":"LED"},
 {"id":"w_led_gnd","from":"a35","to":"L-@35","color":"black","length_mm":20,"net":"GND"}],
"steps":[
 {"n":1,"heading":"Seat the ESP32-S3 across the gap","body":"Unplug USB. Press the DevKitC-1 into the breadboard so the left header (J1, starts with 3V3) goes in column b and the right header (J3, starts with G) in column i, rows 1 to 22. The antenna end sits at row 1. You'll have one free hole per pin on each side (columns a and j).","parts_needed":["bb","mcu"],"highlight":["mcu","J1.1","J3.1"],"connections_added":[],"camera":"top","callout":"b1","safety":["Push straight down on both headers evenly so pins don't bend."],"check":"Every pin is in a hole and the board sits flat; J1.1 (3V3) is in b1."},
 {"n":2,"heading":"Run 5V and ground to the left rails","body":"Red jumper from a21 (the 5V pin's row) to the red + rail. Black jumper from a22 (G) to the blue − rail.","parts_needed":["jumpers_mm"],"highlight":["J1.21","J1.22"],"connections_added":["w_5v","w_gnd"],"camera":"left-low","callout":"a21","safety":["5V must never touch a GPIO row. Double-check a21 is the row labeled 5V."],"check":"Red wire from the 5V row to +, black from G row to −."},
 {"n":3,"heading":"Wire the PIR sensor","body":"Read the silkscreen on your HC-SR501 (VCC, OUT, GND; check, clones differ). Female-to-male jumpers: VCC to the + rail, GND to the − rail, OUT to a4 (GPIO4).","parts_needed":["pir","jumpers_fm"],"highlight":["pir","J1.4"],"connections_added":["w_pir_vcc","w_pir_gnd","w_pir_out"],"camera":"left","callout":"a4","safety":["The PIR needs 5V+ (4.5-20V). Its OUT is 3.3V, so it's safe for GPIO4."],"check":"Three wires: red to +, black to −, green into a4."},
 {"n":4,"heading":"Connect the servo","body":"Male-to-male jumpers into the servo plug: red to the + rail, brown to the − rail (black jumper), orange to a5 (GPIO5).","parts_needed":["servo","jumpers_mm"],"highlight":["servo","J1.5"],"connections_added":["w_srv_vcc","w_srv_gnd","w_srv_sig"],"camera":"right","callout":"a5","safety":["Servo power is 5V, never 3V3.","If the board resets when the servo moves, add a 100-470 µF capacitor across the + and − rails (stripe to −) or give the servo its own 5V supply with a shared ground."],"check":"Orange into a5, red on +, brown on −."},
 {"n":5,"heading":"Add the LED and resistor","body":"Purple jumper from a6 (GPIO6) to a30. Bend the 220 Ω resistor between b30 and b34. LED long leg (anode) in c34, short leg (cathode) in c35. Black jumper from a35 to the − rail.","parts_needed":["led1","r1","jumpers_mm"],"highlight":["led1","r1","J1.6"],"connections_added":["w_led","w_led_gnd"],"camera":"top-zoom-rows-30-35","callout":"c34","safety":["LED needs the resistor in series; without it you can damage the LED and the pin."],"check":"Row 30: purple + resistor. Row 34: resistor + LED long leg. Row 35: LED short leg + black."},
 {"n":6,"heading":"Flash the sketch","body":"Plug USB into the UART port. Create a PlatformIO project with the platformio.ini and main.cpp below, then Upload. The PIR needs about a minute to settle, then wave a hand: the LED lights and the servo sweeps.","parts_needed":[],"highlight":["mcu"],"connections_added":[],"camera":"hero","callout":"usb_uart","safety":["If upload fails, hold BOOT, tap RESET, release BOOT, retry."],"check":"Serial monitor shows 'Warming up PIR'; after ~60 s motion makes the LED light and the servo sweep 0→180→0.",
  "code":{"platformio.ini":ini,"src/main.cpp":code}}],
"provenance":{"verified_by":"Maker","verified_on":"2026-10-26","pins_from":"components/*.json"}}
json.dump(b,open("builds/pir-servo-s3.json","w"),indent=2)
