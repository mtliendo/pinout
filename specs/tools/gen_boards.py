#!/usr/bin/env python3
"""Second-batch board specs (same schema as gen.py). Run gen_chips.py first. Facts sourced in each provenance; approx where not dimensioned."""
import json
D="2026-10-26"; P=2.54
def W(p,o): json.dump(o,open(p,"w"),indent=2)
def A(v,note): return {"value":v,"approx":True,"note":note}
FRAME={"units":"mm","origin":"pin 1 corner of the part (see headers[0].pin1)","x":"+X along the header, from pin 1 toward higher pin numbers","y":"+Y across the part (right-handed)","z":"+Z up, out of the top face"}
def prov(urls,rev,notes): return {"sources":urls,"revision":rev,"verified_by":"Maker","verified_on":D,"notes":notes}
CH={c:json.load(open(f"chips/{c}.json")) for c in("esp32","esp32-c6","esp32-s3","atmega328p","rp2040")}
PWR={"3V3":"3.3V out","+3V3":"3.3V out","3V3(OUT)":"3.3V out","GND":"0V","G":"0V","AGND":"0V (analog ground)"}
def mk(id_,name,chip,hdrs,spacing,safe,caut,nogo,body,colors,features,power,logic,defaults,bb,pio,prv,pin1_note,extra_pinflags=lambda g:{}):
    c=CH[chip]; fl=set(int(k) for k in c["no_go_gpio"]); pins=[]
    for hi,(hid,y,pin1,arr) in enumerate(hdrs):
        for i,e in enumerate(arr):
            lab,g,fn,w,v=(list(e)+[None]*5)[:5]
            w=list(w or [])
            if g is not None:
                f={"input_only":g in c["input_only_gpio"],"strapping":g in c["strapping_gpio"],"usb":bool(c.get("usb_gpio")) and g in c["usb_gpio"].values(),"psram_flash_reserved":g in fl or str(g) in nogo,"boot_sensitive":g in c["strapping_gpio"]}
                f.update(extra_pinflags(g))
                if str(g) in nogo: w.append("NEVER: "+nogo[str(g)])
                elif str(g) in caut: w.append("Caution: "+caut[str(g)])
                volt=v or logic["pin_voltage"]
            else:
                f={"input_only":False,"strapping":False,"usb":False,"psram_flash_reserved":False,"boot_sensitive":False}
                volt=v or PWR.get(lab,"n/a")
            pins.append({"id":f"{hid}.{i+1}","label":lab,"gpio":g,"header":hi,"position":{"index":i+1,"x":round(i*P,2),"y":y},"functions":fn,"voltage":volt,"flags":f,"warnings":w})
    return {"id":id_,"name":name,"kind":"board","chip":chip,
     "coordinate_frame":dict(FRAME,origin=pin1_note),"body":body,"colors":colors,
     "headers":[{"id":h[0],"origin_mm":[0,h[1]],"pitch":P,"count":len(h[3]),"orientation":"+X","pin1":h[2]} for h in hdrs],
     "header_row_spacing_mm":spacing,"pins":pins,"safe_gpio":safe,"caution_gpio":caut,"no_go_gpio":nogo,
     "logic":logic,"power":power,"defaults":defaults,"breadboard_fit":bb,"platformio":pio,"features":features,"provenance":prv}
G=lambda n,*f:(str(n),n,["GPIO"]+list(f))
def g(lab,n,fn,w=None): return (lab,n,["GPIO"]+fn,w)
ESP33={"logic_voltage_v":3.3,"five_v_logic":False,"pin_voltage":"3.3V logic - never apply 5V"}
out=[]
# ======== 1. ESP32-DevKitC V4 ========
U="https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32/esp32-devkitc/user_guide.html"
J2=[("3V3",None,["power"]),("EN",None,["reset"],["Pulling low resets the chip."],"3.3V logic, CHIP_PU"),g("VP",36,["ADC1_CH0"]),g("VN",39,["ADC1_CH3"]),g("IO34",34,["ADC1_CH6"]),g("IO35",35,["ADC1_CH7"]),
 g("IO32",32,["ADC1_CH4","TOUCH9","XTAL_32K_P"]),g("IO33",33,["ADC1_CH5","TOUCH8","XTAL_32K_N"]),g("IO25",25,["ADC2_CH8","DAC_1"]),g("IO26",26,["ADC2_CH9","DAC_2"]),g("IO27",27,["ADC2_CH7","TOUCH7"]),
 g("IO14",14,["ADC2_CH6","TOUCH6","MTMS"]),g("IO12",12,["ADC2_CH5","TOUCH5","MTDI"]),("GND",None,["GND"]),g("IO13",13,["ADC2_CH4","TOUCH4","MTCK"]),g("D2",9,["flash SD2"]),g("D3",10,["flash SD3"]),g("CMD",11,["flash CMD"]),
 ("5V",None,["power"],["5V from USB (via diode) or input; ESP32 GPIOs are not 5V tolerant."],"5V")]
J3=[("GND",None,["GND"]),g("IO23",23,["VSPI MOSI"]),g("IO22",22,["I2C SCL (Arduino default)"]),g("TX",1,["U0TXD"]),g("RX",3,["U0RXD"]),g("IO21",21,["I2C SDA (Arduino default)"]),("GND",None,["GND"]),
 g("IO19",19,["VSPI MISO"]),g("IO18",18,["VSPI SCK"]),g("IO5",5,["VSPI SS"]),g("IO17",17,[]),g("IO16",16,[]),g("IO4",4,["ADC2_CH0","TOUCH0"]),g("IO0",0,["ADC2_CH1","TOUCH1","BOOT"]),g("IO2",2,["ADC2_CH2","TOUCH2"]),
 g("IO15",15,["ADC2_CH3","TOUCH3","MTDO"]),g("D1",8,["flash SD1"]),g("D0",7,["flash SD0"]),g("CLK",6,["flash CLK"])]
c=CH["esp32"]
out.append(mk("esp32-devkitc-v4","Espressif ESP32-DevKitC V4 (ESP32-WROOM-32E)","esp32",[("J2",0.0,"J2.1 (3V3), at the antenna end",J2),("J3",25.40,"J3.1 (GND), at the antenna end",J3)],
 {"value":25.40,"approx":False,"source":"Espressif DXF/PDF esp32_devkitc_v4_dimensions (25.40 = 10 × 2.54)"},
 [4,13,14,18,19,21,22,23,25,26,27,32,33], dict(c["caution_gpio"],**{"16":"Free on WROOM-32E per Espressif footnote, but WROVER variants reserve it for PSRAM; chip file keeps it caution","17":"Free on WROOM-32E per Espressif footnote, but WROVER variants reserve it for PSRAM; chip file keeps it caution"}),
 dict(c["no_go_gpio"]),
 {"length_mm":A(54.4,"Not confirmed from the DXF text (labels read 48.26/27.94/25.40/18.00/6.04); measure your board."),"width_mm":{"value":27.94,"approx":False,"source":"Espressif dimensions PDF"},"pcb_thickness_mm":A(1.6,"Typical; not dimensioned."),"height_mm":A(10,"Module + headers; estimate.")},
 {"pcb":"#1a1a1a","module_shield":"#c0c0c0","silkscreen":"#ffffff","headers":"#111111"},
 [{"id":"antenna","kind":"pcb_antenna","position_mm":{"x":-3,"y":12.7},"approx":True},{"id":"usb","kind":"usb","connector":"Micro-USB (CP2102N bridge on UART0)","position_mm":{"x":50,"y":12.7},"approx":True},
  {"id":"btn_boot","kind":"button","label":"BOOT","gpio":0,"position_mm":{"x":45,"y":22},"approx":True},{"id":"btn_reset","kind":"button","label":"EN","net":"EN","position_mm":{"x":45,"y":3},"approx":True},
  {"id":"led_power","kind":"led","label":"power","position_mm":{"x":40,"y":8},"approx":True},{"id":"c15","kind":"note","note":"Early V4 boards: C15 can force Download mode; Espressif says remove it if so.","approx":True,"position_mm":{"x":44,"y":20}}],
 {"pins":{"3V3":"3.3V out (or input; Espressif: power options are mutually exclusive)","5V":"5V in/out (USB)","GND":"0V"},"supply_options":["Micro-USB (default)","5V and GND pins","3V3 and GND pins"],"supply_note":"Espressif: use only one supply option at a time."},
 ESP33,{"i2c":{"sda":21,"scl":22,"source":"arduino-esp32 variants/esp32/pins_arduino.h"},"spi":{"mosi":23,"miso":19,"sck":18,"ss":5},"uart0":{"tx":1,"rx":3},"led_builtin":None,"led_note":"No user LED on DevKitC V4 (power LED only)."},
 {"fits_830":True,"straddle":{"J2":"a","J3":"i"},"free_holes_per_row":{"left":0,"right":1},"rows":"1-19","note":"Rows are 25.40 mm apart (10 pitches) so the board covers a-i: no free hole on the J2 side, only column j on J3 side. Use two breadboards side by side, or jumper from j / the rail under the board edge."},
 {"board":"esp32dev","platform":"espressif32","framework":"arduino","alt_frameworks":["espidf"],"source":"https://docs.platformio.org/en/latest/boards/espressif32/esp32dev.html","note":"'Espressif ESP32 Dev Module'. Official espressif32 platform is fine."},
 prov([U,"https://dl.espressif.com/dl/schematics/esp32_devkitc_v4_dimensions.pdf","https://dl.espressif.com/dl/schematics/esp32_devkitc_v4_sch.pdf","https://www.espressif.com/sites/default/files/documentation/esp32-wroom-32e_esp32-wroom-32ue_datasheet_en.pdf","https://raw.githubusercontent.com/espressif/arduino-esp32/master/variants/esp32/pins_arduino.h"],"DevKitC V4 user guide (header tables J2/J3)",
  "Header tables quoted from the user guide. 16/17 are kept out of safe_gpio because the chip file is conservative (WROVER). Feature positions approx."),
 "J2.1 (3V3) pin center; antenna end is -X, USB end is +X"))
# ======== 2. ESP32-C6-DevKitC-1 ========
U6="https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32c6/esp32-c6-devkitc-1/user_guide.html"
J1=[("3V3",None,["power"]),("RST",None,["reset"],["High enables the chip; low disables."],"3.3V logic"),g("4",4,["MTMS","LP_UART_RXD","ADC1_CH4"]),g("5",5,["MTDI","LP_UART_TXD","ADC1_CH5"]),g("6",6,["MTCK","LP_I2C_SDA","ADC1_CH6"]),g("7",7,["MTDO","LP_I2C_SCL"]),
 g("0",0,["XTAL_32K_P","ADC1_CH0"]),g("1",1,["XTAL_32K_N","ADC1_CH1"]),g("8",8,["RGB LED"]),g("10",10,[]),g("11",11,[]),g("2",2,["ADC1_CH2","FSPIQ"]),g("3",3,["ADC1_CH3"]),("5V",None,["power"],[],"5V"),("G",None,["GND"]),("NC",None,["nc"],["No connection."],"n/a")]
J3=[("G",None,["GND"]),g("TX",16,["U0TXD","FSPICS0"]),g("RX",17,["U0RXD","FSPICS1"]),g("15",15,[]),g("23",23,["SDIO_DATA3","I2C SDA (Arduino default)"]),g("22",22,["SDIO_DATA2","I2C SCL (Arduino default)"]),g("21",21,["SDIO_DATA1","SPI SCK"]),g("20",20,["SDIO_DATA0","SPI MISO"]),
 g("19",19,["SDIO_CLK","SPI MOSI"]),g("18",18,["SDIO_CMD","SPI SS"]),g("9",9,["BOOT"]),("G",None,["GND"]),g("13",13,["USB_D+"]),g("12",12,["USB_D-"]),("G",None,["GND"]),("NC",None,["nc"],["No connection."],"n/a")]
c=CH["esp32-c6"]
out.append(mk("esp32-c6-devkitc-1","Espressif ESP32-C6-DevKitC-1 (ESP32-C6-WROOM-1)","esp32-c6",[("J1",0.0,"J1.1 (3V3)",J1),("J3",22.86,"J3.1 (G)",J3)],
 {"value":22.86,"approx":False,"source":"Espressif esp32-c6-devkitc-1-dimensions_v1.2.pdf"},
 [0,1,2,3,6,7,10,11,18,19,20,21,22,23],dict(c["caution_gpio"]),{},
 {"length_mm":A(51.80,"Read from the dimensions PDF text label 51.80; interpreted as board length."),"width_mm":{"value":25.40,"approx":False,"source":"dimensions PDF"},"pcb_thickness_mm":A(1.6,"Typical; not dimensioned."),"height_mm":A(9,"Estimate.")},
 {"pcb":"#1a1a1a","module_shield":"#c0c0c0","silkscreen":"#ffffff","headers":"#111111"},
 [{"id":"antenna","kind":"pcb_antenna","position_mm":{"x":-3,"y":11.43},"approx":True},{"id":"usb_uart","kind":"usb","connector":"USB-C (USB-to-UART bridge)","position_mm":{"x":40,"y":5},"approx":True},{"id":"usb_native","kind":"usb","connector":"USB-C (native, GPIO12/13)","position_mm":{"x":40,"y":18},"approx":True},
  {"id":"btn_boot","kind":"button","label":"BOOT","gpio":9,"approx":True,"position_mm":{"x":34,"y":6}},{"id":"btn_reset","kind":"button","label":"RESET","approx":True,"position_mm":{"x":34,"y":17}},{"id":"led_rgb","kind":"led_rgb_addressable","gpio":8,"approx":True,"position_mm":{"x":28,"y":11}},
  {"id":"j5","kind":"jumper","note":"J5 current-measurement jumper; remove it when powering from 3V3/GND pins (Espressif).","approx":True,"position_mm":{"x":24,"y":11}}],
 {"pins":{"3V3":"3.3V out","5V":"5V in/out","G":"0V"},"supply_options":["either/both USB-C ports (default)","5V and G","3V3 and G (remove J5)"]},
 ESP33,{"i2c":{"sda":23,"scl":22,"source":"arduino-esp32 variants/esp32c6/pins_arduino.h"},"i2c_lp":{"sda":6,"scl":7},"spi":{"mosi":19,"miso":20,"sck":21,"ss":18},"uart0":{"tx":16,"rx":17},"led_builtin":8,"led_note":"GPIO8 is an addressable RGB LED (use rgbLedWrite / RGB_BUILTIN), and a strapping pin."},
 {"fits_830":True,"straddle":{"J1":"b","J3":"i"},"free_holes_per_row":{"left":1,"right":1},"rows":"1-16","note":"Same 22.86 mm row spacing as the S3 DevKitC-1."},
 {"board":"esp32-c6-devkitc-1","platform":"espressif32","framework":"espidf","arduino":{"platform":"https://github.com/pioarduino/platform-espressif32/releases/download/stable/platform-espressif32.zip","framework":"arduino","note":"The official PlatformIO board page lists ESP-IDF only. Arduino on C6 needs arduino-esp32 3.x, which PlatformIO's official platform doesn't ship; use the community pioarduino fork."},"source":"https://docs.platformio.org/en/latest/boards/espressif32/esp32-c6-devkitc-1.html"},
 prov([U6,"https://dl.espressif.com/dl/schematics/esp32-c6-devkitc-1-dimensions_v1.2.pdf","https://dl.espressif.com/dl/schematics/esp32-c6-devkitc-1-schematics_v1.4.pdf","https://raw.githubusercontent.com/espressif/arduino-esp32/master/variants/esp32c6/pins_arduino.h"],"DevKitC-1 v1.2 user guide",
  "Header tables quoted from the user guide; strapping MTMS/MTDI/8/9/15 from its footnote. Pin-1 end vs antenna assumed (approx) from the board photo layout."),
 "J1.1 (3V3) pin center; antenna end is -X (approx)"))
# ======== 3. Arduino Nano ESP32 ========
UN="https://docs.arduino.cc/resources/datasheets/ABX00083-datasheet.pdf"; UNP="https://docs.arduino.cc/resources/pinouts/ABX00083-full-pinout.pdf"
JP1=[g("D13",48,["SPI SCK","LED_BUILTIN"]),("3V3",None,["power"]),g("B0",46,["boot"],["Board boot pad, not a user pin."]),g("A0",1,["ADC1_CH0"]),g("A1",2,["ADC1_CH1"]),g("A2",3,["ADC1_CH2"]),g("A3",4,["ADC1_CH3"]),
 g("A4",11,["ADC2_CH0","I2C SDA"]),g("A5",12,["ADC2_CH1","I2C SCL"]),g("A6",13,["ADC2_CH2"]),g("A7",14,["ADC2_CH3"]),("VBUS",None,["power"],["5V only when powered from USB; dead when powered from VIN (Arduino)."],"5V (USB only)"),g("B1",0,["boot"],["Board boot pad, not a user pin."]),("GND",None,["GND"]),("VIN",None,["power"],["6-21V input to the MP2322 buck."],"6-21V in")]
JP2=[g("D12",47,["SPI CIPO"]),g("D11",38,["SPI COPI"]),g("D10",21,["SPI CS"]),g("D9",18,["ADC2_CH7"]),g("D8",17,["ADC2_CH6"]),g("D7",10,["ADC1_CH9"]),g("D6",9,["ADC1_CH8"]),g("D5",8,["ADC1_CH7"]),g("D4",7,["ADC1_CH6"]),g("D3",6,["ADC1_CH5"]),g("D2",5,["ADC1_CH4"]),
 ("GND",None,["GND"]),("RST",None,["reset"],[],"3.3V logic"),g("D0/RX",44,["U0RXD"]),g("D1/TX",43,["U0TXD"])]
c=CH["esp32-s3"]
out.append(mk("arduino-nano-esp32","Arduino Nano ESP32 (ABX00083, u-blox NORA-W106 / ESP32-S3)","esp32-s3",[("JP1",0.0,"JP1.1 (D13), USB-C end",JP1),("JP2",15.24,"JP2.1 (D12), USB-C end",JP2)],
 A(15.24,"Standard Nano 0.6\" row spacing; Arduino's mechanical drawing is an image, not text."),
 [1,2,4,5,6,7,8,9,10,11,12,13,14,17,18,21,38,47],
 {"3":"strapping (A2)","48":"D13 is also LED_BUILTIN (GPIO48)","43":"UART0 TX (D1)","44":"UART0 RX (D0)","45":"blue RGB LED; not on header","46":"strapping; B0 pad; red RGB LED","0":"strapping; B1 pad; green RGB LED"},
 {"46":"B0 boot pad + strapping - not a user pin","0":"B1 boot pad + strapping - not a user pin"},
 {"length_mm":A(45,"Nano form factor 45 × 18 mm (Arduino Nano product page); not in ABX00083 datasheet text."),"width_mm":A(18,"Nano form factor."),"pcb_thickness_mm":A(1.6,"Typical."),"height_mm":A(4.5,"Estimate.")},
 {"pcb":"#008184","shield":"#c0c0c0","silkscreen":"#ffffff"},
 [{"id":"usb_c","kind":"usb","connector":"USB-C (native USB, GPIO19/20)","position_mm":{"x":-2,"y":7.62},"approx":True},{"id":"led_builtin","kind":"led","gpio":48,"approx":True,"position_mm":{"x":6,"y":3}},
  {"id":"led_rgb","kind":"led_rgb","gpio":{"red":46,"green":0,"blue":45},"active":"LOW (approx)","approx":True,"position_mm":{"x":6,"y":12}},{"id":"btn_reset","kind":"button","label":"RESET (PB1)","approx":True,"position_mm":{"x":20,"y":7.6}},{"id":"antenna","kind":"pcb_antenna","approx":True,"position_mm":{"x":38,"y":7.6}}],
 {"pins":{"3V3":"3.3V out from MP2322GQH buck","VBUS":"5V from USB only","VIN":"6-21V in","GND":"0V"},"note":"Arduino: there is no 5V pin; VBUS only has 5V when powered over USB."},
 dict(ESP33,pin_voltage="3.3V logic - 'All digital & analog pins are 3.3 V' (Arduino)"),
 {"i2c":{"sda":11,"scl":12,"labels":"A4/A5"},"spi":{"sck":48,"cipo":47,"copi":38,"cs":21,"labels":"D13/D12/D11/D10"},"uart0":{"tx":43,"rx":44},"led_builtin":48,"rgb":{"red":46,"green":0,"blue":45},"pin_numbering_note":"Arduino core defaults to Dn/An labels; GPIO numbers above are what the chip uses."},
 {"fits_830":True,"straddle":{"JP1":"d","JP2":"h"},"free_holes_per_row":{"left":3,"right":2},"rows":"1-15","note":"Row spacing approx 15.24 (see header_row_spacing_mm)."},
 {"board":"arduino_nano_esp32","platform":"espressif32","framework":"arduino","source":"https://docs.platformio.org/en/latest/boards/espressif32/arduino_nano_esp32.html","note":"Official platform works (arduino-esp32 2.x). Pin names follow the Arduino 'Dn' mapping by default."},
 prov([UN,UNP,"https://docs.arduino.cc/hardware/nano/"],"ABX00083 datasheet + full pinout PDF",
  "Header order from datasheet tables JP1/JP2; GPIO numbers from the full pinout PDF. Datasheet lists D0/RX and D1/TX descriptions swapped; trust the label."),
 "JP1.1 (D13) pin center; USB-C end is -X"))
# ======== 4/5. ATmega328P boards ========
c=CH["atmega328p"]
AVR5={"logic_voltage_v":5.0,"five_v_logic":True,"pin_voltage":"5V logic (ATmega328P at VCC=5V)","warning":"5V LOGIC: outputs swing to 5V. 3.3V-only parts (bare SSD1306 at 1.65-3.3V logic, many sensors) need a level shifter or a module rated for 5V. I2C pull-ups go to 5V."}
def avr(lab,n,fn,w=None): return (lab,n,["GPIO"]+fn,w)
UNO=[("JANALOG",0.0,"JANALOG.1 (NC), end nearest the barrel jack/USB side (approx)",[("NC",None,["nc"],[],"n/a"),("IOREF",None,["power"],["Reference for logic level; tied to 5V."],"5V"),("RESET",None,["reset"],[],"5V logic"),("3V3",None,["power"],["Max 50 mA (Arduino Nano pinout sheet figure; approx for Uno)."],"3.3V out"),("5V",None,["power"],[],"5V"),("GND",None,["GND"]),("GND",None,["GND"]),("VIN",None,["power"],["6-20V in (max per datasheet)"],"6-20V in"),
  avr("A0",14,["ADC0"]),avr("A1",15,["ADC1"]),avr("A2",16,["ADC2"]),avr("A3",17,["ADC3"]),avr("A4/SDA",18,["ADC4","I2C SDA"]),avr("A5/SCL",19,["ADC5","I2C SCL"])]),
 ("JDIGITAL",A(48.26,"Opposite header; Uno headers are not a DIP pair. Approx."),"JDIGITAL.1 (D0)",[avr("D0/RX",0,["UART RX"]),avr("D1/TX",1,["UART TX"])]+[avr(f"D{i}",i,(["PWM"] if i in(3,5,6) else [])) for i in range(2,10)]+[avr("D10/SS",10,["PWM","SPI SS"]),avr("D11/MOSI",11,["PWM","SPI MOSI"]),avr("D12/MISO",12,["SPI MISO"]),avr("D13/SCK",13,["SPI SCK","LED_BUILTIN"]),("GND",None,["GND"]),("AREF",None,["analog ref"],["Analog reference input. Not a GPIO."],"0-5V"),avr("SDA",18,["I2C SDA (dup of A4)"],["Same pin as A4."]),avr("SCL",19,["I2C SCL (dup of A5)"],["Same pin as A5."])])]
UNOU="https://docs.arduino.cc/resources/datasheets/A000066-datasheet.pdf"
uno=mk("arduino-uno-r3","Arduino UNO R3 (ATmega328P, 5V logic)","atmega328p",UNO,A(48.26,"Not a straddling DIP; header rows are ~1.9\" apart on the Uno outline drawing (image only). Approx."),
 [2,3,4,5,6,7,8,9,10,11,12,14,15,16,17,18,19],{"0":c["caution_gpio"]["0"],"1":c["caution_gpio"]["1"],"13":c["caution_gpio"]["13"]},{},
 {"length_mm":A(68.6,"Commonly published 68.6 × 53.4 mm; Arduino's outline is an image and the store page didn't load during verification."),"width_mm":A(53.4,"See length."),"pcb_thickness_mm":A(1.6,"Typical."),"height_mm":A(15,"Female headers + USB-B; estimate.")},
 {"pcb":"#00878f","silkscreen":"#ffffff","headers":"#111111"},
 [{"id":"usb_b","kind":"usb","connector":"USB-B (ATmega16U2 USB-serial on D0/D1)","approx":True,"position_mm":{"x":-6,"y":38}},{"id":"barrel","kind":"dc_jack","note":"barrel jack to VIN","approx":True,"position_mm":{"x":-6,"y":8}},{"id":"led_l","kind":"led","label":"L","gpio":13,"approx":True,"position_mm":{"x":30,"y":40}},{"id":"btn_reset","kind":"button","approx":True,"position_mm":{"x":2,"y":45}},{"id":"icsp","kind":"connector","note":"ICSP 2×3 (D11-D13 + RESET)","approx":True,"position_mm":{"x":62,"y":26}}],
 {"pins":{"5V":"5V rail","3V3":"3.3V out (small current)","VIN":"6-20V in","IOREF":"tied to 5V","GND":"0V"},"usb_vmax_v":5.5},
 AVR5,{"i2c":{"sda":18,"scl":19,"labels":"A4/A5 (duplicated as SDA/SCL near AREF)"},"spi":{"ss":10,"mosi":11,"miso":12,"sck":13},"uart0":{"tx":1,"rx":0},"led_builtin":13},
 {"fits_830":False,"off_board":True,"connector":"female headers","note":"Doesn't fit a breadboard. Place it beside the breadboard (off_board placement) and run male-male jumpers from its female headers to the breadboard."},
 {"board":"uno","platform":"atmelavr","framework":"arduino","source":"https://docs.platformio.org/en/latest/boards/atmelavr/uno.html"},
 prov([UNOU,"https://docs.arduino.cc/resources/pinouts/A000066-full-pinout.pdf","https://docs.platformio.org/en/latest/boards/atmelavr/uno.html"],"UNO R3 datasheet (JANALOG/JDIGITAL tables)",
  "Pin order from datasheet tables. Header x/y positions are logical (index × 2.54); the real Uno has a 160 mil offset between D7 and D8 and non-DIP header placement, so physical positions are approx."),
 "JANALOG.1 pin center (approx; Uno is off-board)")
# Uno JDIGITAL sits on the other side; fix pin y to header y value
uno["headers"][1]["origin_mm"]=[0,48.26]; uno["headers"][1]["origin_approx"]=True
for p in uno["pins"]:
    if p["header"]==1: p["position"]["y"]=48.26; p["position"]["approx"]=True
out.append(uno)
NANO=[("L",0.0,"L.1 (D13), mini-USB end",[avr("D13",13,["SPI SCK","LED_BUILTIN"]),("3V3",None,["power"],["Max 50 mA (Arduino pinout sheet). From the FT232 on original Nanos."],"3.3V out"),("AREF",None,["analog ref"],[],"0-5V"),
  avr("A0",14,["ADC0"]),avr("A1",15,["ADC1"]),avr("A2",16,["ADC2"]),avr("A3",17,["ADC3"]),avr("A4",18,["ADC4","I2C SDA"]),avr("A5",19,["ADC5","I2C SCL"]),
  ("A6",20,["ADC6"],["Analog input only: no digital I/O."]),("A7",21,["ADC7"],["Analog input only: no digital I/O."]),("+5V",None,["power"],[],"5V"),("RESET",None,["reset"],[],"5V logic"),("GND",None,["GND"]),("VIN",None,["power"],["7-12V in (Arduino pinout sheet)."],"7-12V in")]),
 ("R",15.24,"R.1 (D12), mini-USB end",[avr("D12",12,["SPI MISO/CIPO"]),avr("D11",11,["PWM","SPI MOSI/COPI"]),avr("D10",10,["PWM","SPI SS"]),avr("D9",9,["PWM"]),avr("D8",8,[]),avr("D7",7,[]),avr("D6",6,["PWM"]),avr("D5",5,["PWM"]),avr("D4",4,[]),avr("D3",3,["PWM"]),avr("D2",2,[]),
  ("GND",None,["GND"]),("RESET",None,["reset"],[],"5V logic"),avr("D0/RX",0,["UART RX"]),avr("D1/TX",1,["UART TX"])])]
out.append(mk("arduino-nano","Arduino Nano (classic, ATmega328P, 5V logic)","atmega328p",NANO,A(15.24,"Standard 0.6\" DIP spacing; Arduino's mechanical drawing is an image."),
 [2,3,4,5,6,7,8,9,10,11,12,14,15,16,17,18,19],{k:c["caution_gpio"][k] for k in("0","1","13","20","21")},{},
 {"length_mm":{"value":45,"approx":False,"source":"docs.arduino.cc/hardware/nano: 'length of 45 mm and a width of 18 mm'"},"width_mm":{"value":18,"approx":False,"source":"docs.arduino.cc/hardware/nano"},"pcb_thickness_mm":A(1.6,"Typical."),"height_mm":A(8,"Estimate incl. Mini-USB.")},
 {"pcb":"#1f5fa8","silkscreen":"#ffffff","headers":"#111111"},
 [{"id":"usb_mini","kind":"usb","connector":"Mini-USB (FT232RL on D0/D1; clones often CH340)","approx":True,"position_mm":{"x":-2,"y":7.62}},{"id":"led_l","kind":"led","gpio":13,"approx":True,"position_mm":{"x":8,"y":7.6}},{"id":"btn_reset","kind":"button","approx":True,"position_mm":{"x":20,"y":7.6}},{"id":"icsp","kind":"connector","approx":True,"position_mm":{"x":40,"y":7.6}}],
 {"pins":{"+5V":"5V rail (USB or regulator)","3V3":"3.3V out, max 50 mA","VIN":"7-12V in","GND":"0V"}},
 AVR5,{"i2c":{"sda":18,"scl":19,"labels":"A4/A5"},"spi":{"ss":10,"mosi":11,"miso":12,"sck":13},"uart0":{"tx":1,"rx":0},"led_builtin":13},
 {"fits_830":True,"straddle":{"L":"d","R":"h"},"free_holes_per_row":{"left":3,"right":2},"rows":"1-15"},
 {"board":"nanoatmega328","platform":"atmelavr","framework":"arduino","alt_boards":{"nanoatmega328new":"new (Optiboot) bootloader; use if uploads fail with the default (old bootloader) setting"},"source":"https://docs.platformio.org/en/latest/boards/atmelavr/nanoatmega328.html","note":"nanoatmega328new is from PlatformIO's board list (approx: verify page)."},
 prov(["https://docs.arduino.cc/resources/datasheets/A000005-datasheet.pdf","https://docs.arduino.cc/resources/pinouts/A000005-full-pinout.pdf","https://docs.arduino.cc/hardware/nano/"],"A000005 datasheet + full pinout PDF (2021-06-30)",
  "Datasheet pin tables have errors (lists +3V3 as '5V USB Power', duplicate 12); header order taken from the full pinout PDF."),
 "L.1 (D13) pin center; mini-USB end is -X"))
# ======== 6/7. Pico / Pico W ========
c=CH["rp2040"]
def pico_hdr():
    L=[("GP0",0,["UART0 TX"]),("GP1",1,["UART0 RX"]),("GND",None,["GND"]),("GP2",2,[]),("GP3",3,[]),("GP4",4,["I2C0 SDA (SDK default)"]),("GP5",5,["I2C0 SCL (SDK default)"]),("GND",None,["GND"]),("GP6",6,[]),("GP7",7,[]),
       ("GP8",8,[]),("GP9",9,[]),("GND",None,["GND"]),("GP10",10,[]),("GP11",11,[]),("GP12",12,[]),("GP13",13,[]),("GND",None,["GND"]),("GP14",14,[]),("GP15",15,[])]
    R=[("VBUS",None,["power"],["Micro-USB 5V (0V if USB not connected)."],"5V"),("VSYS",None,["power"],["Main input 1.8-5.5V to the SMPS."],"1.8-5.5V"),("GND",None,["GND"]),("3V3_EN",None,["enable"],["Pull low to disable 3.3V."],"VSYS via 100k"),("3V3(OUT)",None,["power"],["Keep load under 300 mA (datasheet recommendation)."],"3.3V out"),("ADC_VREF",None,["analog ref"],[],"3.3V filtered"),
       ("GP28",28,["ADC2"]),("AGND",None,["GND"]),("GP27",27,["ADC1"]),("GP26",26,["ADC0"]),("RUN",None,["reset"],["Pull low to reset."],"3.3V logic"),("GP22",22,[]),("GND",None,["GND"]),("GP21",21,[]),("GP20",20,[]),("GP19",19,["SPI0 TX (SDK default)"]),("GP18",18,["SPI0 SCK"]),("GND",None,["GND"]),("GP17",17,["SPI0 CSn"]),("GP16",16,["SPI0 RX"])]
    fix=lambda a:[(l,n,(["GPIO"]+f if n is not None else f))+tuple(r) for (l,n,f,*r) in a]
    return [("L",0.0,"L.1 = physical pin 1 (GP0), USB end",fix(L)),("R",17.78,"R.1 = physical pin 40 (VBUS), USB end; R.n = physical pin 41-n",fix(R))]
P3={"logic_voltage_v":3.3,"five_v_logic":False,"pin_voltage":"3.3V logic - RP2040 is not 5V tolerant"}
def pico(id_,name,w,urls,internal,ledinfo,pio,notes):
    b=mk(id_,name,"rp2040",pico_hdr(),A(17.78,"0.7\" (7 × 2.54) row spacing; Raspberry Pi's mechanical drawing is an image."),
      [x for x in range(0,29) if x not in(23,24,25)],{},internal,
      {"length_mm":{"value":51,"approx":False,"source":"Pico datasheet: '51×21 mm 1 mm thick PCB'"},"width_mm":{"value":21,"approx":False,"source":"Pico datasheet"},"pcb_thickness_mm":{"value":1.0,"approx":False,"source":"Pico datasheet"},"height_mm":A(4,"Micro-USB + RP2040; estimate."),"mounting_holes":"4 × 2.1 mm (datasheet)"},
      {"pcb":"#1e7a36","silkscreen":"#ffffff","headers":"#111111"},
      [{"id":"usb","kind":"usb","connector":"Micro-USB (native RP2040 USB)","approx":True,"position_mm":{"x":-2,"y":8.89}},{"id":"btn_bootsel","kind":"button","label":"BOOTSEL","note":"on QSPI_SS, not a GPIO","approx":True,"position_mm":{"x":8,"y":4}},ledinfo]+([{"id":"radio","kind":"module","note":"CYW43439 + PCB antenna at the far end","approx":True,"position_mm":{"x":44,"y":8.89}}] if w else []),
      {"pins":{"VBUS":"5V from USB","VSYS":"1.8-5.5V in","3V3(OUT)":"3.3V out, <300 mA recommended","3V3_EN":"SMPS enable","GND":"0V"}},
      P3,{"i2c":{"sda":4,"scl":5,"source":"pico-sdk PICO_DEFAULT_I2C_SDA/SCL_PIN"},"spi":{"rx_miso":16,"csn":17,"sck":18,"tx_mosi":19},"uart0":{"tx":0,"rx":1},"led_builtin":(None if w else 25),"led_note":("LED is on the CYW43 radio (WL_GPIO0), not an RP2040 GPIO. Arduino LED_BUILTIN works via the radio driver." if w else "GPIO25 user LED (PICO_DEFAULT_LED_PIN).")},
      {"fits_830":True,"straddle":{"L":"c","R":"h"},"free_holes_per_row":{"left":2,"right":2},"rows":"1-20"},pio,prov(urls,"Pico datasheets fetched "+D,notes),"L.1 (physical pin 1, GP0) pin center; USB end is -X")
    for p in b["pins"]: p["physical_pin"]=p["position"]["index"] if p["header"]==0 else 41-p["position"]["index"]
    return b
PIOP={"board":"pico","platform":"raspberrypi","framework":"arduino","core":"Arduino-Mbed (official platform)","alt":{"platform":"https://github.com/maxgerhardt/platform-raspberrypi.git","board_build.core":"earlephilhower","why":"Earle Philhower's arduino-pico core is what most tutorials and libraries assume; the official platform only ships the Mbed core."},"source":"https://docs.platformio.org/en/latest/boards/raspberrypi/pico.html"}
out.append(pico("raspberry-pi-pico","Raspberry Pi Pico (RP2040)",False,["https://datasheets.raspberrypi.com/pico/pico-datasheet.pdf","https://github.com/raspberrypi/pico-sdk/blob/master/src/boards/include/boards/pico.h","https://docs.platformio.org/en/latest/boards/raspberrypi/pico.html"],
 {"23":"SMPS power-save control (internal, not on header)","24":"VBUS sense (internal)","25":"user LED (internal)","29":"VSYS/3 ADC (internal)"},
 {"id":"led_user","kind":"led","gpio":25,"approx":True,"position_mm":{"x":2,"y":14}},PIOP,"Internal GPIO23/24/25/29 quoted from datasheet section 2.1. Header order from datasheet Figure 2 pinout (image) cross-checked with pico.h defaults; approx positions for features."))
out.append(pico("raspberry-pi-pico-w","Raspberry Pi Pico W (RP2040 + CYW43439)",True,["https://datasheets.raspberrypi.com/picow/pico-w-datasheet.pdf","https://github.com/raspberrypi/pico-sdk/blob/master/src/boards/include/boards/pico_w.h"],
 {"23":"radio power on (WL_REG_ON)","24":"radio SPI data/IRQ","25":"radio SPI CS","29":"radio SPI CLK / VSYS ADC"},
 {"id":"led_user","kind":"led","note":"on CYW43 WL_GPIO0","approx":True,"position_mm":{"x":2,"y":14}},
 dict(PIOP,board="rpipicow",platform="https://github.com/maxgerhardt/platform-raspberrypi.git",core="earlephilhower",source="https://github.com/maxgerhardt/platform-raspberrypi",note="docs.platformio.org has no rpipicow page (404): the official raspberrypi platform has no Pico W board. Use the community platform."),
 "GPIO23/24/25/29 radio use quoted from Pico W datasheet; CYW43 pin defines from pico_w.h."))
for b in out: W(f"components/{b['id']}.json",b)
print("boards:",[b["id"] for b in out])
