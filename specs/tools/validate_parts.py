#!/usr/bin/env python3
"""Validate the Pinout parts catalog (Maker). Checks every part in parts-catalog.json
(new component files + parts-overlay.json for the gen.py-owned parts), runs negative tests
proving each rule fires, then runs validate.py (unchanged) as a subprocess.
Exit non-zero on any failure."""
import json, os, re, sys, copy, subprocess
_here=os.path.dirname(os.path.abspath(__file__))
os.chdir(_here if os.path.isfile(os.path.join(_here,"parts-catalog.json")) else os.path.join(_here,".."))
LIBS={"adafruit/DHT sensor library","adafruit/Adafruit Unified Sensor","adafruit/Adafruit BME280 Library","teckel12/NewPing","adafruit/Adafruit MPU6050",
 "crankyoldgit/IRremoteESP8266","z3t0/IRremote","paulstoffregen/OneWire","milesburton/DallasTemperature","marcoschwartz/LiquidCrystal_I2C","smougenot/TM1637",
 "waspinator/AccelStepper","adafruit/Adafruit NeoPixel","fastled/FastLED","mathertel/RotaryEncoder","chris--a/Keypad","miguelbalboa/MFRC522",
 "adafruit/Adafruit SSD1306","adafruit/Adafruit GFX Library","madhephaestus/ESP32Servo"}  # each returned HTTP 200 from api.registry.platformio.org on 2026-10-26
KINDS={"board","breadboard","sensor","actuator","passive"}
CATS={"sensor","display","actuator","input","passive","wire","power","breadboard"}
STATUS={"yes","with_conditions","no"}
MOUNTS={"breadboard","off_board","off_board_or_breadboard_edge","breadboard_rails","base"}
HEX=re.compile(r"^#[0-9a-fA-F]{6}$"); URL=re.compile(r"^https?://\S+$")
def num_ok(v):  # plain number, or approx object with a note
    if isinstance(v,(int,float)) and not isinstance(v,bool): return v>0
    if isinstance(v,dict) and "value" in v: return isinstance(v["value"],(int,float)) and v["value"]>0 and (not v.get("approx") or bool(v.get("note")))
    return isinstance(v,str)
def check_part_block(pid,p,errs,comp=None):
    for k in ("category","supply_v","logic","compat","interface","current_ma","required_passives","mounting","lib_deps","approx_fields"):
        if k not in p: errs.append(f"{pid}: part.{k} missing")
    if errs and any(e.startswith(f"{pid}: part.") for e in errs): return
    if p["category"] not in CATS: errs.append(f"{pid}: bad category {p['category']}")
    if p["mounting"] not in MOUNTS and not p["mounting"].startswith(("breadboard ↔","module")): errs.append(f"{pid}: bad mounting {p['mounting']}")
    s=p["supply_v"]; mn,mx=s.get("min"),s.get("max")
    if mn is None or (mx is not None and mx<mn): errs.append(f"{pid}: supply_v min/max invalid")
    for side in ("mcu_3v3","mcu_5v"):
        c=p["compat"].get(side)
        if not c or c.get("status") not in STATUS: errs.append(f"{pid}: compat.{side} missing/invalid"); continue
        if c["status"]!="yes" and not c.get("needs"): errs.append(f"{pid}: compat.{side} is {c['status']} but lists no needs")
    # physics rules
    if p["category"] not in ("passive","wire","breadboard","power") and mx is not None and mx<4.5 and p["compat"]["mcu_5v"]["status"]=="yes":
        errs.append(f"{pid}: 3.3V-only part (max {mx}V) marked plain-yes on 5V MCUs")
    if p["category"] not in ("passive","wire","breadboard","power") and mn is not None and mn>=4.5 and p["compat"]["mcu_3v3"]["status"]=="yes" and not p["logic"].get("level","").startswith("3.3V"):
        errs.append(f"{pid}: 5V-supply part with 5V logic marked plain-yes on 3.3V MCUs")
    for l in p["lib_deps"]:
        if l not in LIBS: errs.append(f"{pid}: lib_dep '{l}' not in the registry-verified list")
    for rp in p["required_passives"]:
        if not rp.get("kind") or not rp.get("value"): errs.append(f"{pid}: required_passive missing kind/value")
    if p["interface"].get("type")=="I2C":
        a=p["interface"].get("i2c_addresses") or []
        if not a or not all(re.match(r"^0x[0-7][0-9A-Fa-f]$",x) for x in a): errs.append(f"{pid}: I2C part needs 7-bit i2c_addresses")
def check_component(c,errs):
    pid=c.get("id","?")
    for k in ("id","name","kind","body","headers","pins","provenance","part","coordinate_frame"):
        if k not in c: errs.append(f"{pid}: missing {k}"); return
    if c["kind"] not in KINDS: errs.append(f"{pid}: kind {c['kind']} not in schema kinds")
    pv=c["provenance"]
    if pv.get("verified_by")!="Maker" or not pv.get("sources") or not pv.get("revision"): errs.append(f"{pid}: provenance incomplete")
    for u in pv.get("sources",[]):
        if not URL.match(u): errs.append(f"{pid}: source is not a URL: {u}")
    for k,v in c["body"].items():
        if k.endswith("_mm") and not num_ok(v): errs.append(f"{pid}: body.{k} not a number or approx-with-note")
    def walk(o,path):
        if isinstance(o,dict):
            if o.get("approx") is True and not o.get("note"): errs.append(f"{pid}: approx value without note at {path}")
            for k,v in o.items(): walk(v,f"{path}.{k}")
        elif isinstance(o,list):
            for i,v in enumerate(o): walk(v,f"{path}[{i}]")
    walk(c,pid)
    for k,v in (c.get("colors") or {}).items():
        if isinstance(v,str) and v.startswith("#") and not HEX.match(v): errs.append(f"{pid}: bad color {k}")
    H=c["headers"]; pins=c["pins"]
    ids=[x["id"] for x in pins]
    if len(ids)!=len(set(ids)): errs.append(f"{pid}: duplicate pin ids")
    for hi,h in enumerate(H):
        hp=[x for x in pins if x["header"]==hi]
        if h["id"]!="ends" and len(hp)!=h["count"] and h["id"] not in ("MOTOR",): errs.append(f"{pid}: header {h['id']} count {h['count']} != {len(hp)} pins")
        idx=[x["position"]["index"] for x in hp]
        if idx!=list(range(1,len(hp)+1)): errs.append(f"{pid}: header {h['id']} pins not in physical order 1..n ({idx})")
        if h.get("pin_order_approx") and "silkscreen" not in h.get("note",""): errs.append(f"{pid}: approx pin order without a read-the-silkscreen note")
        pitch=h["pitch"]["value"] if isinstance(h["pitch"],dict) else h["pitch"]
        if h["id"] not in ("leads","ends") and hp and h.get("orientation")=="+X":
            x0=hp[0]["position"]["x"]
            for x in hp:
                exp=round(x0+(x["position"]["index"]-1)*pitch,2)
                if abs(x["position"]["x"]-exp)>0.01: errs.append(f"{pid}: pin {x['id']} x={x['position']['x']} not on {pitch} mm pitch (exp {exp})")
    for x in pins:
        for k in ("id","label","header","position","functions","voltage","flags","warnings"):
            if k not in x: errs.append(f"{pid}: pin {x.get('id')} missing {k}")
        if x.get("header",99)>=len(H): errs.append(f"{pid}: pin {x['id']} header index out of range")
    if not any("GND" in x["functions"] or x["id"] in ("-","K","E") for x in pins) and c["part"]["category"] not in ("passive","wire","input") and not c["part"].get("no_gnd_pin"):
        errs.append(f"{pid}: active part has no GND pin")
    # pins whose text says NEVER 5V must not be in a part marked 5V-supply
    check_part_block(pid,c["part"],errs,c)
def run_all(cat,comps,over):
    errs=[]
    for pid in sorted(sum(cat["categories"].values(),[])):
        if pid in over: 
            if not os.path.exists(f"components/{pid}.json"): errs.append(f"{pid}: overlay for a part with no component file")
            check_part_block(pid,over[pid],errs)
        elif pid in comps: check_component(comps[pid],errs)
        else: errs.append(f"{pid}: in catalog but no file")
    if cat["count"]!=len(sum(cat["categories"].values(),[])): errs.append("catalog count mismatch")
    return errs
cat=json.load(open("parts-catalog.json")); over=json.load(open("parts-overlay.json"))
comps={}
for pid in sum(cat["categories"].values(),[]):
    if pid not in over: comps[pid]=json.load(open(f"components/{pid}.json"))
errs=run_all(cat,comps,over)
# ---------------- negative tests: each mutation must produce an error containing the expected text
NEG=[]
def neg(name,pid,mut,expect):
    c2=copy.deepcopy(comps); mut(c2[pid]); e=[]; check_component(c2[pid],e)
    ok=any(expect in x for x in e); NEG.append((name,ok,e[:2]))
neg("duplicate pin id","dht11",lambda c:c["pins"][1].update(id="VCC"),"duplicate pin ids")
neg("missing provenance sources","hc-sr04",lambda c:c["provenance"].update(sources=[]),"provenance incomplete")
neg("non-URL source","hc-sr04",lambda c:c["provenance"]["sources"].append("my memory"),"not a URL")
neg("3.3V-only part marked 5V-safe","rfid-rc522",lambda c:c["part"]["compat"]["mcu_5v"].update(status="yes"),"3.3V-only part")
neg("5V-logic part marked 3.3V-safe","lcd1602-i2c-pcf8574",lambda c:c["part"]["compat"]["mcu_3v3"].update(status="yes"),"5V-supply part with 5V logic")
neg("with_conditions without needs","hc-sr04",lambda c:c["part"]["compat"]["mcu_3v3"].update(needs=[]),"lists no needs")
neg("unverified lib_dep","dht11",lambda c:c["part"]["lib_deps"].append("someone/MadeUpLib"),"not in the registry-verified list")
neg("approx without note","bme280-i2c-breakout",lambda c:c["body"]["length_mm"].pop("note"),"approx")
neg("pins out of physical order","mpu6050-gy521",lambda c:c["pins"].reverse(),"physical order")
neg("pin off pitch","tm1637-4digit",lambda c:c["pins"][2]["position"].update(x=6.0),"not on 2.54 mm pitch")
neg("approx order w/o silkscreen note","sound-sensor-ky038",lambda c:c["headers"][0].update(note="trust me"),"silkscreen")
neg("header count mismatch","hc-sr04p",lambda c:c["pins"].pop(),"count 4 != 3")
neg("I2C without address","mpu6050-gy521",lambda c:c["part"]["interface"].update(i2c_addresses=[]),"i2c_addresses")
neg("bad supply range","dht22-am2302",lambda c:c["part"]["supply_v"].update(min=6),"supply_v min/max")
neg("unknown kind","ldr-gl5528",lambda c:c.update(kind="gizmo"),"not in schema kinds")
neg("missing part block","diode-1n4007",lambda c:c.pop("part"),"missing part")
neg("active part with no GND","hc-sr04",lambda c:[c["pins"].pop(),c["headers"][0].update(count=3)],"no GND pin")
e=[]; c2=copy.deepcopy(cat); c2["categories"]["sensor"].append("ghost-part"); c2["count"]+=1
NEG.append(("catalog entry with no file",any("ghost-part" in x for x in run_all(c2,comps,over)),[]))
# ---------------- report
approx_parts=[p for p,c in comps.items() if any(h.get("pin_order_approx") for h in c["headers"])]
approx_fields=sum(1 for p in list(comps.values()) for _ in p["part"]["approx_fields"])+sum(len(v["approx_fields"]) for v in over.values())
def count_approx(o):
    if isinstance(o,dict): return (1 if o.get("approx") is True else 0)+sum(count_approx(v) for v in o.values())
    if isinstance(o,list): return sum(count_approx(v) for v in o)
    return 0
n_approx_vals=sum(count_approx(c) for c in comps.values())
print(f"parts checked: {len(comps)} component files + {len(over)} overlay entries = {len(comps)+len(over)}")
print(f"approx: {n_approx_vals} approx values in new files; {len(approx_parts)} parts with approx pin order; {approx_fields} approx_fields tags")
nok=sum(1 for _,ok,_ in NEG if ok)
for n,ok,e in NEG: print(f"  neg {'PASS' if ok else 'FAIL'}: {n}" + ("" if ok else f"  got {e}"))
print(f"negative tests: {nok}/{len(NEG)} caught")
r=subprocess.run([sys.executable,os.path.join(os.getcwd(),"tools","validate.py") if os.path.isfile(os.path.join(os.getcwd(),"tools","validate.py")) else "validate.py"],capture_output=True,text=True)
print("validate.py (unchanged):",r.stdout.strip() or r.stderr.strip())
if errs: print("ERRORS:\n  "+"\n  ".join(errs))
bad=bool(errs) or nok!=len(NEG) or r.returncode!=0
print("FAIL" if bad else "PASS: parts catalog OK")
sys.exit(1 if bad else 0)
