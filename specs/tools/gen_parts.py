#!/usr/bin/env python3
"""Generate the Pinout starter-kit parts catalog (Maker, 2026-10-26).
Writes components/<id>.json for new parts, parts-overlay.json (the `part` block for the
7 parts gen.py owns) and parts-catalog.json. Does NOT touch gen.py/validate.py/schema.md.
Every number is from a source in that part's provenance; anything not dimensioned by a
source is {"value":..,"approx":true,"note":..}. Source copies are cached in sources/parts/."""
import json, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
D="2026-10-26"; P=2.54
FRAME={"units":"mm","origin":"pin 1 of the part (see headers[0].pin1)","x":"+X along the header, from pin 1 toward higher pin numbers","y":"+Y across the part (right-handed)","z":"+Z up, out of the top face"}
SILK="Breakout pin order varies by clone: read the silkscreen on YOUR board before wiring."
G5="0V"
def A(v,note): return {"value":v,"approx":True,"note":note}
def prov(urls,rev,notes=None):
    d={"sources":urls,"revision":rev,"verified_by":"Maker","verified_on":D}
    if notes: d["notes"]=notes
    return d
def pin(i,id_,label,fn,volt,warn=(),x=None,y=0.0,header=0):
    return {"id":id_,"label":label,"header":header,"position":{"index":i,"x":round((i-1)*P if x is None else x,2),"y":y},
            "functions":fn,"voltage":volt,"flags":{},"warnings":list(warn)}
def hdr(n,pin1,kind="male header",approx_order=False,note=None,id_="P1",pitch=P,origin=(0,0)):
    h={"id":id_,"kind":kind,"origin_mm":list(origin),"pitch":pitch,"count":n,"orientation":"+X","pin1":pin1}
    if approx_order: h["pin_order_approx"]=True; h["note"]=(note+" " if note else "")+SILK
    elif note: h["note"]=note
    return h
def compat(v33,v5):
    return {"mcu_3v3":{"status":v33[0],"needs":v33[1]},"mcu_5v":{"status":v5[0],"needs":v5[1]}}
def part(category,supply,logic,cmp,iface,current,passives,mounting,libs,approx_fields=()):
    return {"category":category,"supply_v":supply,"logic":logic,"compat":cmp,"interface":iface,"current_ma":current,
            "required_passives":passives,"mounting":mounting,"lib_deps":libs,"approx_fields":list(approx_fields)}
OUT={}
def W(c):
    c.setdefault("coordinate_frame",FRAME); c.setdefault("safe_gpio",[]); c.setdefault("features",[])
    OUT[c["id"]]=c
U=json.load(open("sources/parts/urls.json"))
L=dict(dht=["adafruit/DHT sensor library","adafruit/Adafruit Unified Sensor"],bme=["adafruit/Adafruit BME280 Library","adafruit/Adafruit Unified Sensor"],
 newping=["teckel12/NewPing"],mpu=["adafruit/Adafruit MPU6050","adafruit/Adafruit Unified Sensor"],ir_esp=["crankyoldgit/IRremoteESP8266"],ir=["z3t0/IRremote"],
 ds=["paulstoffregen/OneWire","milesburton/DallasTemperature"],lcd=["marcoschwartz/LiquidCrystal_I2C"],tm=["smougenot/TM1637"],step=["waspinator/AccelStepper"],
 neo=["adafruit/Adafruit NeoPixel"],fastled=["fastled/FastLED"],enc=["mathertel/RotaryEncoder"],kp=["chris--a/Keypad"],rfid=["miguelbalboa/MFRC522"],
 ssd=["adafruit/Adafruit SSD1306","adafruit/Adafruit GFX Library"],servo=["madhephaestus/ESP32Servo"])
for f in ("parts_sensors.py","parts_outputs.py","parts_passives.py"):
    exec(open(f).read())
INPUTS={"potentiometer-10k","rotary-encoder-ky040","joystick-ky023","keypad-4x4-membrane","rfid-rc522"}
OUT["ldr-gl5528"]["part"]["no_gnd_pin"]="Two-lead passive; GND comes via the 10k divider resistor."
OUT["stepper-28byj48"]["part"]["no_gnd_pin"]="Coils return through the ULN2003 board; red lead is +5V common."
for k in INPUTS: OUT[k]["part"]["category"]="input"
OVER["tactile-button-6mm"]["category"]="input"
if __name__=="__main__":
    CATS={}
    for k,c in OUT.items(): CATS.setdefault(c["part"]["category"],[]).append(k)
    for k,p in OVER.items(): CATS.setdefault(p["category"],[]).append(k)
    for k,c in OUT.items(): json.dump(c,open(f"components/{k}.json","w"),indent=2,ensure_ascii=False)
    json.dump(OVER,open("parts-overlay.json","w"),indent=2,ensure_ascii=False)
    n=sum(len(v) for v in CATS.values())
    json.dump({"generated_on":D,"by":"Maker","count":n,"categories":{k:sorted(v) for k,v in sorted(CATS.items())}},open("parts-catalog.json","w"),indent=2,ensure_ascii=False)
    print(f"wrote {len(OUT)} new parts + overlay for {len(OVER)} existing; catalog = {n} parts")
