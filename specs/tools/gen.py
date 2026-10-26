import json
D="2026-10-26"
P=2.54
S3U="https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32s3/esp32-s3-devkitc-1/user_guide_v1.1.html"
S3DXF="https://dl.espressif.com/dl/schematics/esp_idf/DXF_ESP32-S3-DevKitC-1_V1.1_20220429.pdf"
S3SCH="https://dl.espressif.com/dl/schematics/SCH_ESP32-S3-DevKitC-1_V1.1_20221130.pdf"
C3U="https://wiki.seeedstudio.com/XIAO_ESP32C3_Getting_Started/"
XS3U="https://wiki.seeedstudio.com/xiao_esp32s3_getting_started/"
def prov(urls,rev,notes=None):
    d={"sources":urls,"revision":rev,"verified_by":"Maker","verified_on":D}
    if notes:d["notes"]=notes
    return d
FRAME={"units":"mm","origin":"pin 1 corner of the part (see headers[0].pin1)","x":"+X along the header, from pin 1 toward higher pin numbers","y":"+Y across the part (right-handed)","z":"+Z up, out of the top face"}
def W(path,obj):
    json.dump(obj,open(path,"w"),indent=2)

# ---------------- ESP32-S3-DevKitC-1 ----------------
J1=[("3V3","power",[]),("3V3","power",[]),("RST","en",[]),(4,"",["ADC1_CH3","TOUCH4"]),(5,"",["ADC1_CH4","TOUCH5"]),(6,"",["ADC1_CH5","TOUCH6"]),(7,"",["ADC1_CH6","TOUCH7"]),
(15,"",["ADC2_CH4","U0RTS","XTAL_32K_P"]),(16,"",["ADC2_CH5","U0CTS","XTAL_32K_N"]),(17,"",["ADC2_CH6","U1TXD"]),(18,"",["ADC2_CH7","U1RXD","CLK_OUT3"]),(8,"",["ADC1_CH7","TOUCH8","SUBSPICS1"]),(3,"",["ADC1_CH2","TOUCH3"]),(46,"",[]),
(9,"",["ADC1_CH8","TOUCH9","FSPIHD"]),(10,"",["ADC1_CH9","TOUCH10","FSPICS0"]),(11,"",["ADC2_CH0","TOUCH11","FSPID"]),(12,"",["ADC2_CH1","TOUCH12","FSPICLK"]),(13,"",["ADC2_CH2","TOUCH13","FSPIQ"]),(14,"",["ADC2_CH3","TOUCH14","FSPIWP"]),("5V","power",[]),("G","gnd",[])]
J3=[("G","gnd",[]),(43,"",["U0TXD","CLK_OUT1"]),(44,"",["U0RXD","CLK_OUT2"]),(1,"",["ADC1_CH0","TOUCH1"]),(2,"",["ADC1_CH1","TOUCH2"]),(42,"",["MTMS"]),(41,"",["MTDI","CLK_OUT1"]),(40,"",["MTDO","CLK_OUT2"]),(39,"",["MTCK","CLK_OUT3"]),
(38,"",["FSPIWP","RGB_LED"]),(37,"",["SPIDQS","FSPIQ"]),(36,"",["SPIIO7","FSPICLK"]),(35,"",["SPIIO6","FSPID"]),(0,"",[]),(45,"",[]),(48,"",["SPICLK_N"]),(47,"",["SPICLK_P"]),(21,"",[]),(20,"",["ADC2_CH9","U1CTS","USB_D+"]),(19,"",["ADC2_CH8","U1RTS","USB_D-"]),("G","gnd",[]),("G","gnd",[])]
S3SAFE=[1,2,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,21,39,40,41,42,47]
def s3flags(g):
    f={"input_only":False,"strapping":g in(0,3,45,46),"usb":g in(19,20),"psram_flash_reserved":g in(35,36,37),"boot_sensitive":g in(0,3,45,46)}
    w=[]
    if g in(35,36,37):w.append("NO-GO on N16R8/N8R8 (octal flash/PSRAM): used internally by the module, not available for external use (Espressif user guide note).")
    if g==0:w.append("Strapping: boot mode. Pulled low at reset = download mode. BOOT button is wired here.")
    if g==46:w.append("Strapping: boot mode + ROM message printing. Do not drive at reset.")
    if g==45:w.append("Strapping: VDD_SPI voltage select. Wrong level at reset can stop flash from working.")
    if g==3:w.append("Strapping: JTAG signal source. Avoid external pull-ups/downs at reset.")
    if g in(19,20):w.append("Native USB D-/D+ (USB port J4). Using it as GPIO breaks native USB flashing/serial.")
    if g==38:w.append("Drives the onboard addressable RGB LED on v1.1 boards.")
    if g==48:w.append("Drives the RGB LED on the initial (pre-v1.1) DevKitC-1; clones vary. Avoid unless you've checked your board.")
    if g in(43,44):w.append("UART0 TX/RX to the USB-to-UART bridge (serial console/flashing on the UART port).")
    if g in(39,40,41,42):w.append("JTAG pins (MTCK/MTDO/MTDI/MTMS). Fine as GPIO unless you use external JTAG.")
    if g in(15,16):w.append("Optional 32 kHz crystal pins; free on this board.")
    return f,w
def s3pins(hdr,arr,hi,yv):
    out=[]
    for i,(n,k,alt) in enumerate(arr):
        pos={"index":i+1,"x":round(i*P,2),"y":yv}
        if isinstance(n,int):
            f,w=s3flags(n)
            fn=["GPIO"]+(["ADC"] if any(a.startswith("ADC") for a in alt) else [])+(["PWM"] if n not in(35,36,37) else [])+(["I2C"] if n not in(35,36,37,19,20) else [])
            out.append({"id":f"{hdr}.{i+1}","label":str(n),"gpio":n,"header":hi,"position":pos,"functions":fn,"alt_functions":alt,"voltage":"3.3V logic - never apply 5V (see notes)","flags":f,"warnings":w})
        else:
            fn={"power":["power"],"gnd":["GND"],"en":["reset"]}[k]
            v={"3V3":"3.3V out","5V":"5V (USB VBUS after 1N5819 Schottky diode D1/D7)","G":"0V","RST":"3.3V logic, EN/CHIP_PU"}[n]
            w=["Pulling low resets the chip."] if n=="RST" else (["Do not connect an external 5V supply while USB is also plugged in unless you understand the diode path (see notes)."] if n=="5V" else [])
            out.append({"id":f"{hdr}.{i+1}","label":n,"gpio":None,"header":hi,"position":pos,"functions":fn,"voltage":v,"flags":{"input_only":False,"strapping":False,"usb":False,"psram_flash_reserved":False,"boot_sensitive":False},"warnings":w})
    return out
PIN1_X=1.40
s3={"id":"esp32-s3-devkitc-1-n16r8","name":"ESP32-S3-DevKitC-1 (N16R8: WROOM-1, 16 MB flash, 8 MB octal PSRAM)","kind":"board",
"coordinate_frame":dict(FRAME,origin="J1 pin 1 center is at (1.40, 1.27) from the board corner nearest it; all pin positions below are relative to the J1 pin 1 center",note="Board outline spans x=-1.40..61.34, y=-1.27..24.13 relative to J1 pin 1."),
"body":{"length_mm":62.74,"width_mm":25.40,"pcb_thickness_mm":{"value":1.6,"approx":True,"note":"Not dimensioned in the Espressif DXF; typical PCB thickness."},"height_mm":{"value":10,"approx":True,"note":"Module + headers height not dimensioned in sources; visual estimate."},
 "outline_offset_from_pin1":{"x":-1.40,"y":-1.27},"pin1_from_top_edge":{"value":1.40,"approx":True,"note":"Derived: 62.74 total − 8.00 (last pin to USB edge, DXF) − 21×2.54."}},
"colors":{"pcb":"#1a1a1a","module_shield":"#c0c0c0","silkscreen":"#ffffff","headers":"#111111"},
"headers":[{"id":"J1","origin_mm":[0,0],"pitch":P,"count":22,"orientation":"+X","pin1":"J1.1 (3V3), at the antenna end","side":"left (front view, antenna up)"},
           {"id":"J3","origin_mm":[0,22.86],"pitch":P,"count":22,"orientation":"+X","pin1":"J3.1 (G), at the antenna end","side":"right"}],
"header_row_spacing_mm":22.86,
"pins":s3pins("J1",J1,0,0.0)+s3pins("J3",J3,1,22.86),
"safe_gpio":S3SAFE,
"caution_gpio":{"0":"strapping/BOOT","3":"strapping (JTAG source)","45":"strapping (VDD_SPI)","46":"strapping (boot/ROM log)","19":"USB D-","20":"USB D+","38":"RGB LED (v1.1)","48":"RGB LED on initial version","43":"UART0 TX console","44":"UART0 RX console"},
"no_go_gpio":{"35":"octal PSRAM/flash","36":"octal PSRAM/flash","37":"octal PSRAM/flash"},
"features":[
 {"id":"antenna","kind":"pcb_antenna","position_mm":{"x":-1.4,"y":11.43},"approx":True,"note":"Module PCB antenna at the J1.1/J3.1 end; keep-out area beyond board edge per DXF."},
 {"id":"usb_uart","kind":"usb","connector":"Micro-USB on the official board; many N16R8 clones use USB-C","label":"UART","position_mm":{"x":61.3,"y":4.5},"approx":True,"note":"Left connector (J2) at the far end, next to J1 side."},
 {"id":"usb_native","kind":"usb","connector":"Micro-USB on official board; USB-C on many clones","label":"USB","position_mm":{"x":61.3,"y":18.4},"approx":True,"note":"Right connector (J4), native USB on GPIO19/20."},
 {"id":"btn_boot","kind":"button","label":"BOOT","gpio":0,"position_mm":{"x":49.5,"y":6.5},"approx":True},
 {"id":"btn_reset","kind":"button","label":"RESET","net":"EN","position_mm":{"x":49.5,"y":16.5},"approx":True},
 {"id":"led_rgb","kind":"led_rgb_addressable","gpio":38,"silk":"RGB@IO38","position_mm":{"x":31,"y":7},"approx":True},
 {"id":"led_power","kind":"led","label":"3.3V power on","position_mm":{"x":27,"y":19.5},"approx":True}],
"power":{"regulator":"SGM2212-3.3 LDO (from schematic)","5v_pin":"Connected to USB VBUS through 1N5819HW Schottky diodes (D1 for UART port, D7 for USB port) per schematic","supply_options":["USB-to-UART port and/or native USB port (default, recommended)","5V and G pins","3V3 and G pins"],"supply_note":"Espressif: the three options are mutually exclusive."},
"provenance":prov([S3U,S3DXF,S3SCH],"DevKitC-1 v1.1 (user guide v1.1; DXF 2022-04-29; schematic 2022-11-30)",
 "N16R8 is not in Espressif's own DevKitC-1 ordering table (it lists N8R8 and N32R16V); it is a common retail variant with an ESP32-S3-WROOM-1-N16R8 module. Pinout and the octal-PSRAM 35-37 note are identical for WROOM-1 octal modules. Feature positions are read off the DXF image and marked approx.")}
W("components/esp32-s3-devkitc-1-n16r8.json",s3)

# ---------------- XIAO ----------------
def xiao(id_,name,url,left,right,safe,caut,feat,extra):
    pins=[]
    for side,arr,y in((0,left,0.0),(1,right,15.24)):
        for i,(lab,g,fn,w,fl) in enumerate(arr):
            pins.append({"id":f"{'L' if side==0 else 'R'}.{i+1}","label":lab,"gpio":g,"header":side,"position":{"index":i+1,"x":round(i*P,2),"y":y},"functions":fn,
              "voltage":"3.3V logic" if g is not None else {"5V":"5V (USB VBUS)","GND":"0V","3V3":"3.3V out (regulator, up to 700 mA per Seeed)"}[lab],
              "flags":dict({"input_only":False,"strapping":False,"usb":False,"psram_flash_reserved":False,"boot_sensitive":False},**fl),"warnings":w})
    return {"id":id_,"name":name,"kind":"board","coordinate_frame":dict(FRAME,origin="L.1 (D0) pin center; USB-C end is -X"),
      "body":{"length_mm":21.0,"width_mm":17.8,"height_mm":{"value":3.5,"approx":True,"note":"Not given in wiki text; shield + USB-C estimate."}},
      "colors":{"pcb":"#1d1d1d","shield":"#c0c0c0","silkscreen":"#ffffff"},
      "headers":[{"id":"L","origin_mm":[0,0],"pitch":P,"count":7,"orientation":"+X","pin1":"D0, next to USB-C"},
                 {"id":"R","origin_mm":[0,15.24],"pitch":P,"count":7,"orientation":"+X","pin1":"5V, next to USB-C"}],
      "header_row_spacing_mm":{"value":15.24,"approx":True,"note":"Row spacing (6 × 2.54) and pin order are read from the Seeed pinout diagram image, not text. Headers ship unsoldered."},
      "pins":pins,"safe_gpio":safe,"caution_gpio":caut,"features":feat,
      "provenance":prov([url],"Seeed wiki, fetched 2026-10-26",extra)}
N={}
c3L=[("D0",2,["GPIO","ADC","PWM"],["Strapping pin (GPIO2). Wrong level at reset can block boot/upload."],{"strapping":True,"boot_sensitive":True}),
("D1",3,["GPIO","ADC","PWM"],[],N),("D2",4,["GPIO","ADC","PWM"],["Also JTAG MTMS."],N),("D3",5,["GPIO","ADC","PWM"],["ADC2: Seeed says unreliable for analog; use A0-A2. Also JTAG MTDI."],N),
("D4",6,["GPIO","I2C","PWM"],["Default I2C SDA. Also JTAG MTCK."],N),("D5",7,["GPIO","I2C","PWM"],["Default I2C SCL. Also JTAG MTDO."],N),("D6",21,["GPIO","PWM"],["UART0 TX (U0TXD)."],N)]
c3R=[("5V",None,["power"],["USB VBUS out. Feeding it from outside needs a diode (Seeed)."],N),("GND",None,["GND"],[],N),("3V3",None,["power"],[],N),
("D10",10,["GPIO","PWM"],["SPI MOSI."],N),("D9",9,["GPIO","PWM"],["Strapping pin (GPIO9) and the BOOT button. Avoid pulling low at reset."],{"strapping":True,"boot_sensitive":True}),
("D8",8,["GPIO","PWM"],["Strapping pin (GPIO8). Avoid external pull-down at reset."],{"strapping":True,"boot_sensitive":True}),("D7",20,["GPIO","PWM"],["UART0 RX (U0RXD)."],N)]
W("components/xiao-esp32c3.json",xiao("xiao-esp32c3","Seeed Studio XIAO ESP32C3",C3U,c3L,c3R,[3,4,5,6,7,10],{"2":"strapping","8":"strapping","9":"strapping + BOOT button","20":"UART0 RX","21":"UART0 TX","5":"ADC2 unreliable analog"},
 [{"id":"usb_c","kind":"usb","connector":"USB-C","position_mm":{"x":-2.5,"y":7.62},"approx":True},{"id":"btn_boot","kind":"button","gpio":9,"approx":True,"position_mm":{"x":3,"y":3}},{"id":"btn_reset","kind":"button","net":"CHIP_EN","approx":True,"position_mm":{"x":3,"y":12}},{"id":"ufl","kind":"antenna_connector","note":"U.FL, external antenna included","approx":True,"position_mm":{"x":14,"y":3}},{"id":"led_charge","kind":"led","note":"Charge LED only; no user LED (no LED_BUILTIN)","approx":True,"position_mm":{"x":1,"y":10}}],
 "No user LED. Strapping GPIO2/8/9 per Seeed wiki."))
xs3L=[("D0",1,["GPIO","ADC","PWM"],[],N),("D1",2,["GPIO","ADC","PWM"],[],N),("D2",3,["GPIO","ADC","PWM"],["GPIO3 is a strapping pin (JTAG signal source) per Seeed/Espressif."],{"strapping":True,"boot_sensitive":True}),
("D3",4,["GPIO","ADC","PWM"],[],N),("D4",5,["GPIO","ADC","I2C","PWM"],["Default I2C SDA."],N),("D5",6,["GPIO","ADC","I2C","PWM"],["Default I2C SCL."],N),("D6",43,["GPIO","PWM"],["UART0 TX."],N)]
xs3R=[("5V",None,["power"],["USB VBUS out; no voltage here on battery power. External feed needs a diode (Seeed)."],N),("GND",None,["GND"],[],N),("3V3",None,["power"],[],N),
("D10",9,["GPIO","ADC","PWM"],["SPI MOSI. On Sense: SD card MOSI."],N),("D9",8,["GPIO","ADC","PWM"],["SPI MISO. On Sense: SD card MISO."],N),("D8",7,["GPIO","ADC","PWM"],["SPI SCK. On Sense: SD card SCK."],N),("D7",44,["GPIO","PWM"],["UART0 RX."],N)]
W("components/xiao-esp32s3.json",xiao("xiao-esp32s3","Seeed Studio XIAO ESP32S3 (also Sense)",XS3U,xs3L,xs3R,[1,2,4,5,6,7,8,9],{"3":"strapping","43":"UART0 TX","44":"UART0 RX","0":"BOOT button (not broken out)","21":"user LED, active LOW (Sense: also SD CS)","41":"D12 via back pads; JTAG MTDI; Sense mic DATA; no ADC","42":"D11 via back pads; JTAG MTMS; Sense mic CLK; no ADC"},
 [{"id":"usb_c","kind":"usb","connector":"USB-C","position_mm":{"x":-2.5,"y":7.62},"approx":True},{"id":"led_user","kind":"led","gpio":21,"active":"LOW","color":"orange","approx":True,"position_mm":{"x":1,"y":13}},{"id":"led_charge","kind":"led","color":"red","approx":True,"position_mm":{"x":1,"y":11}},{"id":"btn_boot","kind":"button","gpio":0,"approx":True,"position_mm":{"x":3,"y":3}},{"id":"btn_reset","kind":"button","net":"CHIP_PU","approx":True,"position_mm":{"x":3,"y":12}},{"id":"ufl","kind":"antenna_connector","approx":True,"position_mm":{"x":14,"y":3}},{"id":"b2b","kind":"connector","note":"B2B connector for Sense camera board","approx":True,"position_mm":{"x":10,"y":7.6}}],
 "On the Sense, D8-D10 (GPIO7-9) are shared with the SD card and GPIO41/42 with the mic; camera uses GPIO10-18,38-40,47,48 (not broken out). D11/D12 are back pads, not edge pins, so they are omitted from pins[]."))

# ---------------- SG90 ----------------
SGU=["https://towerpro.com.tw/product/sg90-analog/","https://www.auselectronicsdirect.com.au/assets/brochures/TA0132.pdf"]
W("components/sg90-servo.json",{"id":"sg90-servo","name":"TowerPro SG90 micro servo","kind":"actuator","coordinate_frame":dict(FRAME,origin="Connector pin 1 (brown/GND)"),
"body":{"length_mm":23.0,"width_mm":12.2,"height_mm":29.0,"source":"TowerPro product page"},"wire_length_mm":250,
"colors":{"body":"#2f5fd0","wires":{"gnd":"brown","vcc":"red","signal":"orange"}},
"headers":[{"id":"plug","kind":"female JR plug (use male-male jumpers into breadboard)","origin_mm":[0,0],"pitch":P,"count":3,"orientation":"+X","pin1":"brown (GND)"}],
"pins":[{"id":"GND","label":"brown","header":0,"position":{"index":1,"x":0,"y":0},"functions":["GND"],"voltage":"0V","flags":{},"warnings":[]},
 {"id":"VCC","label":"red","header":0,"position":{"index":2,"x":2.54,"y":0},"functions":["power"],"voltage":"4.8V nominal (TowerPro); ~5V OK","flags":{},"warnings":["Feed from 5V, never from 3V3. Servo current spikes can brown out the board."]},
 {"id":"SIG","label":"orange","header":0,"position":{"index":3,"x":5.08,"y":0},"functions":["PWM in"],"voltage":"PWM, ~20 ms period, ~0.5-2.4 ms pulse (secondary source); 3.3V drive normally works","flags":{},"warnings":[]}],
"electrical":{"operating_voltage_v":4.8,"max_voltage_v":{"value":6.6,"source":"auselectronicsdirect TA0132 (reseller sheet, not TowerPro)"},"stall_torque_kgcm":1.8,"speed_s_per_60deg":0.1,
 "current":{"published_by_manufacturer":False,"note":"TowerPro publishes no running/stall current. Reseller sheet TA0132 says 'up to 200 mA under load'. Stall current is NOT verified."},"power_supply_note":"TowerPro: 'Power Supply: Through External Adapter'."},
"safe_gpio":[],"features":[{"id":"horn","kind":"output_shaft","position_mm":{"x":5.9,"y":6.1,"z":29},"approx":True}],
"provenance":prov(SGU,"SG90 analog, TowerPro page","Clones vary; 180° travel approx.")})
# ---------------- PIR ----------------
PIRU=["https://docs.particle.io/assets/datasheets/electronsensorkit/HC-SR501.pdf","https://www.pollin.de/media/6e/aa/f1/1701728988/D810590-B.pdf?ts=1719377543","https://www.taydaelectronics.com/datasheets/files/A-4432.pdf","https://cdn-learn.adafruit.com/downloads/pdf/pir-passive-infrared-proximity-motion-sensor.pdf"]
W("components/hc-sr501-pir.json",{"id":"hc-sr501-pir","name":"HC-SR501 PIR motion sensor","kind":"sensor","coordinate_frame":dict(FRAME,origin="Header pin 1 (VCC), viewed from the component (back) side"),
"body":{"length_mm":32,"width_mm":24,"height_mm":{"value":24,"note":"Pollin: 34x24x24 incl. lens"},"lens_diameter_mm":23,"mount_holes":"M2, 28 mm apart"},
"colors":{"pcb":"#1f6b2a","lens":"#f4f4f0"},
"headers":[{"id":"P1","kind":"3-pin male header","origin_mm":[0,0],"pitch":P,"count":3,"orientation":"+X","pin1":"VCC (Pollin silkscreen order VCC OUT GND)"}],
"pins":[{"id":"VCC","label":"VCC","header":0,"position":{"index":1,"x":0,"y":0},"functions":["power"],"voltage":"4.5-20V DC (some sheets say 5-20V); use 5V","flags":{},"warnings":["Do not feed from 3V3: below rated minimum."]},
 {"id":"OUT","label":"OUT","header":0,"position":{"index":2,"x":2.54,"y":0},"functions":["digital out"],"voltage":"High 3.3V / Low 0V","flags":{},"warnings":["3.3V-safe for ESP32 inputs."]},
 {"id":"GND","label":"GND","header":0,"position":{"index":3,"x":5.08,"y":0},"functions":["GND"],"voltage":"0V","flags":{},"warnings":["Pin order varies on clones: read the silkscreen (often under the lens) before wiring."]}],
"controls":[{"id":"jumper_trigger","kind":"jumper","options":{"L":"single trigger (non-repeatable)","H":"repeatable trigger (default)"}},{"id":"pot_time","label":"Tx / TIME","kind":"trimpot","range":"~0.3 s to ~5 min (sheets vary: 5-300 s)"},{"id":"pot_sens","label":"Sx / SENS","kind":"trimpot","range":"~3-7 m"}],
"electrical":{"quiescent_current":"<50 uA","block_time_s":2.5,"warmup":"~1 minute; false triggers during warm-up (Tayda)","angle":"<110-120°"},
"safe_gpio":[],"features":[{"id":"lens","kind":"fresnel_dome","position_mm":{"x":2.54,"y":12,"z":-12},"approx":True,"note":"Dome is on the opposite face from the pots and header."}],
"provenance":prov(PIRU,"HC-SR501 generic module","No single manufacturer; sheets agree on 3.3V output and 4.5/5-20V supply.")})
# ---------------- passives ----------------
W("components/led-5mm-red.json",{"id":"led-5mm-red","name":"5 mm red LED","kind":"passive","coordinate_frame":dict(FRAME,origin="cathode lead"),
"body":{"diameter_mm":5.0,"height_mm":{"value":8.6,"approx":True},"lead_spacing_mm":2.54},"colors":{"body":"#e02020"},
"headers":[{"id":"leads","origin_mm":[0,0],"pitch":P,"count":2,"orientation":"+X","pin1":"cathode (short lead, flat side)"}],
"pins":[{"id":"K","label":"cathode (−, short leg, flat edge)","header":0,"position":{"index":1,"x":0,"y":0},"functions":["GND"],"voltage":"","flags":{},"warnings":[]},
 {"id":"A","label":"anode (+, long leg)","header":0,"position":{"index":2,"x":2.54,"y":0},"functions":["power"],"voltage":"Vf ~2.0V typ @20mA","flags":{},"warnings":["Always use a series resistor."]}],
"electrical":{"vf_typ_v":2.0,"if_max_ma":30,"note":"Kingbright L-53ID max 30 mA; Futurlec 35 mA. With 3.3V GPIO and 220Ω: (3.3−2.0)/220 ≈ 6 mA."},"safe_gpio":[],"features":[],
"provenance":prov(["https://www.futurlec.com/LED/LED5R.shtml","https://store.comet.bg/en/Catalogue/Product/24536/"],"generic T-1 3/4")})
W("components/resistor-220.json",{"id":"resistor-220","name":"220 Ω resistor, 1/4 W axial","kind":"passive","coordinate_frame":dict(FRAME,origin="lead 1"),
"body":{"length_mm":{"value":6.3,"approx":True,"note":"Typical 1/4 W body; not from a fetched datasheet"},"diameter_mm":{"value":2.4,"approx":True},"span_holes":4},
"colors":{"body":"#d8c49a","bands":["red","red","brown","gold"]},
"headers":[{"id":"leads","origin_mm":[0,0],"pitch":P,"count":2,"orientation":"+X","pin1":"either (non-polar)","note":"Bent to span 4 holes (10.16 mm) in builds."}],
"pins":[{"id":"1","label":"lead 1","header":0,"position":{"index":1,"x":0,"y":0},"functions":["passive"],"voltage":"","flags":{},"warnings":[]},{"id":"2","label":"lead 2","header":0,"position":{"index":2,"x":10.16,"y":0},"functions":["passive"],"voltage":"","flags":{},"warnings":[]}],
"safe_gpio":[],"features":[],"provenance":prov(["https://www.futurlec.com/LED/LED5R.shtml"],"generic","Color code red-red-brown = 220 Ω is the standard resistor code; dimensions approx.")})
W("components/tactile-button-6mm.json",{"id":"tactile-button-6mm","name":"6×6 mm 4-pin tactile push button","kind":"passive","coordinate_frame":dict(FRAME,origin="pin 1"),
"body":{"length_mm":6.0,"width_mm":6.0,"height_mm":4.3,"lead_pitch_mm":{"x":6.5,"y":4.5,"approx":True,"note":"Typical THT footprint; doesn't land on a 2.54 grid exactly. Straddle the breadboard center gap."}},
"colors":{"body":"#1a1a1a","cap":"#222222"},
"headers":[{"id":"legs","origin_mm":[0,0],"pitch":P,"count":4,"orientation":"+X","pin1":"any corner","note":"Legs: 1-2 internally connected, 3-4 internally connected; pressing joins 1/2 to 3/4. Verify with a multimeter."}],
"pins":[{"id":str(i),"label":f"leg {i}","header":0,"position":{"index":i,"x":[0,0,6.5,6.5][i-1],"y":[0,4.5,0,4.5][i-1]},"functions":["switch"],"voltage":"","flags":{},"warnings":[]} for i in (1,2,3,4)],
"electrical":{"rating":"12-24V DC, 50 mA max","bounce_ms":"≤5-10 ms"},"safe_gpio":[],"features":[],
"provenance":prov(["https://www.sunrom.com/download/685.pdf","https://www.swiclick.com/product/6x6mm-4-pin-micro-tact-switch/"],"generic SPST-NO","Wire to a GPIO with INPUT_PULLUP and the other side to GND; use diagonal legs to be safe.")})
W("components/ssd1306-oled-128x64-i2c.json",{"id":"ssd1306-oled-128x64-i2c","name":"0.96\" SSD1306 128×64 I2C OLED (4-pin)","kind":"sensor","coordinate_frame":dict(FRAME,origin="header pin 1"),
"body":{"length_mm":{"value":27,"approx":True},"width_mm":{"value":27,"approx":True},"note":"Module size varies by vendor; not from a datasheet."},"colors":{"pcb":"#1b3fa0","glass":"#111111"},
"headers":[{"id":"P1","origin_mm":[0,0],"pitch":P,"count":4,"orientation":"+X","pin1":"VCC in the most common order — CHECK SILKSCREEN","note":"Pin order varies by vendor: VCC-GND-SCL-SDA and GND-VCC-SCL-SDA both exist. Swapping VCC/GND can kill it."}],
"pins":[{"id":"VCC","label":"VCC","header":0,"position":{"index":1,"x":0,"y":0},"functions":["power"],"voltage":"3.3V safest; many modules accept 5V via onboard regulator (vendor-dependent)","flags":{},"warnings":["Order varies by vendor."]},
 {"id":"GND","label":"GND","header":0,"position":{"index":2,"x":2.54,"y":0},"functions":["GND"],"voltage":"0V","flags":{},"warnings":["Order varies by vendor."]},
 {"id":"SCL","label":"SCL","header":0,"position":{"index":3,"x":5.08,"y":0},"functions":["I2C"],"voltage":"logic = VCC on most modules (pull-ups to VCC)","flags":{},"warnings":["Power from 3V3 on ESP32 so the pull-ups don't pull SCL/SDA to 5V."]},
 {"id":"SDA","label":"SDA","header":0,"position":{"index":4,"x":7.62,"y":0},"functions":["I2C"],"voltage":"logic = VCC","flags":{},"warnings":[]}],
"electrical":{"i2c_address_7bit":"0x3C (SA0/D-C# low; most modules) or 0x3D (SA0 high)","ic_vdd":"1.65-3.3V logic (SSD1306 datasheet)"},"safe_gpio":[],"features":[{"id":"display","kind":"oled_128x64","approx":True,"position_mm":{"x":3.8,"y":-14}}],
"provenance":prov(["https://cdn-shop.adafruit.com/datasheets/SSD1306.pdf","https://wiki.elegoo.com/oshw-parts-&-accessories/iic-oled"],"SSD1306 rev 1.1")})
# ---------------- breadboard ----------------
W("components/breadboard-830.json",{"id":"breadboard-830","name":"830 tie-point solderless breadboard (BB830 / MB102 style)","kind":"breadboard",
"body":{"length_mm":165.1,"width_mm":54.6,"height_mm":8.5},"colors":{"body":"#f5f3ee","rail_pos":"#d62828","rail_neg":"#1d4ed8"},
"coordinate_frame":dict(FRAME,origin="hole a1",x="+X along rows 1→63",y="+Y from column a toward j"),
"grid":{"rows":63,"columns":["a","b","c","d","e","f","g","h","i","j"],"pitch":P,"hole_id_format":"<col><row>, e.g. e10",
 "column_y_mm":{"a":0,"b":2.54,"c":5.08,"d":7.62,"e":10.16,"f":17.78,"g":20.32,"h":22.86,"i":25.4,"j":27.94},
 "connected_strips":"a-e of a row are connected; f-j of a row are connected; the two halves are NOT connected.",
 "center_gap":{"between":["e","f"],"width_pitches":3,"approx":True,"note":"Standard 0.3\" DIP gap (e→f = 7.62 mm). Not dimensioned in BB830 datasheet."}},
"rails":[{"id":"L-","side":"near a","polarity":"negative","color":"blue","y_mm":{"value":-7.62,"approx":True}},{"id":"L+","side":"near a","polarity":"positive","color":"red","y_mm":{"value":-5.08,"approx":True}},
 {"id":"R+","side":"near j","polarity":"positive","color":"red","y_mm":{"value":33.02,"approx":True}},{"id":"R-","side":"near j","polarity":"negative","color":"blue","y_mm":{"value":35.56,"approx":True}}],
"rail_hole_id_format":"<rail>@<row>, e.g. L+@20 — the hole in that rail nearest breadboard row <row>. Rails have 50 holes in groups of 5, so renderers snap to the nearest real hole.",
"rail_notes":["4 rails × 50 tie points (BusBoard).","Some boards split each rail in the middle (look for a gap in the red/blue line); bridge with a jumper if so.","Rail order (+ outer vs inner) varies; trust the printed red/blue lines."],
"electrical":{"rating":"36V, 2A","wire_awg":"21-26"},
"provenance":prov(["https://www.busboard.com/BB830T","https://www.jameco.com/Jameco/Products/ProdDS/2125026.pdf","https://www.taydaelectronics.com/830-point-solder-less-plug-in-breadboard.html"],"BB830")})
W("wire-colors.json",{"power":{"5V":"#e53935","3V3":"#fb8c00","GND":"#212121"},"names":{"5V":"red","3V3":"orange","GND":"black"},
"signal_palette":[{"name":"yellow","hex":"#fdd835"},{"name":"green","hex":"#43a047"},{"name":"blue","hex":"#1e88e5"},{"name":"purple","hex":"#8e24aa"},{"name":"white","hex":"#f5f5f5"},{"name":"gray","hex":"#9e9e9e"},{"name":"brown","hex":"#6d4c41"}],
"conventions":{"I2C_SDA":"blue","I2C_SCL":"yellow","PWM_servo":"yellow","digital_in":"green","led":"purple"}})
