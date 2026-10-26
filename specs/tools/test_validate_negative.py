#!/usr/bin/env python3
"""Negative tests: each mutation must make validate.py FAIL."""
import json,shutil,subprocess,tempfile,os,sys
HERE=os.path.dirname(os.path.abspath(__file__))
SPECS=os.path.dirname(HERE)
def J(d,p): return json.load(open(os.path.join(d,p)))
def S(d,p,o): json.dump(o,open(os.path.join(d,p),"w"))
def copy_specs(d):
    for name in("components","chips","builds","wire-colors.json"):
        src=os.path.join(SPECS,name); dst=os.path.join(d,name)
        if os.path.isdir(src): shutil.copytree(src,dst)
        elif os.path.isfile(src): shutil.copy2(src,dst)
    shutil.copy2(os.path.join(HERE,"validate.py"),os.path.join(d,"validate.py"))
def m_safe(f,g):
    def go(d): c=J(d,f); c["safe_gpio"].append(g); S(d,f,c)
    return go
def m_chip_missing(d): c=J(d,"components/arduino-nano.json"); c.pop("chip"); S(d,"components/arduino-nano.json",c)
def m_chip_safe_strap(d): c=J(d,"chips/esp32-c6.json"); c["safe_gpio"].append(9); S(d,"chips/esp32-c6.json",c)
def m_flash_unflagged(d):
    f="components/esp32-devkitc-v4.json"; c=J(d,f); c["no_go_gpio"].pop("6")
    for x in c["pins"]:
        if x["gpio"]==6: x["flags"]["psram_flash_reserved"]=False
    S(d,f,c)
def m_logic(d): f="components/arduino-uno-r3.json"; c=J(d,f); c["logic"]["five_v_logic"]=False; S(d,f,c)
def m_build_pin(d):
    f="builds/pir-servo-s3.json"; b=J(d,f)
    for w in b["connections"]:
        if w["from"]=="a4" or w["to"]=="a4": pass
    # move the PIR signal wire onto J1.3? use GPIO0 hole: find J3.14 (GPIO0) hole
    pl=[p for p in b["placements"] if p["part"]=="mcu"][0]; h=pl["pin_holes"]["J3.14"]
    b["connections"].append({"id":"bad","from":"j14" if h.startswith("i") else h,"to":"pir:OUT","color":"green","net":"bad"}); S(d,f,b)
def m_i2c(d): f="components/raspberry-pi-pico.json"; c=J(d,f); c["defaults"]["i2c"]["sda"]=25; S(d,f,c)
T=[("DevKitC V4 safe gets flash GPIO6",m_safe("components/esp32-devkitc-v4.json",6)),("DevKitC V4 safe gets input-only GPIO34",m_safe("components/esp32-devkitc-v4.json",34)),
 ("DevKitC V4 safe gets strapping GPIO12",m_safe("components/esp32-devkitc-v4.json",12)),("Pico W safe gets radio GPIO23 (not on header)",m_safe("components/raspberry-pi-pico-w.json",23)),
 ("XIAO C3 safe gets strapping GPIO2",m_safe("components/xiao-esp32c3.json",2)),("Nano ESP32 safe gets B0/GPIO46",m_safe("components/arduino-nano-esp32.json",46)),
 ("Uno safe gets D0/RX",m_safe("components/arduino-uno-r3.json",0)),("C6 board safe gets USB GPIO12",m_safe("components/esp32-c6-devkitc-1.json",12)),
 ("board missing chip",m_chip_missing),("chip safe gets strapping GPIO9",m_chip_safe_strap),("flash pin unflagged on board",m_flash_unflagged),
 ("Uno logic says 3.3V",m_logic),("build wires GPIO0 signal",m_build_pin),("Pico default SDA off-header",m_i2c)]
bad=0
for name,mut in T:
    d=tempfile.mkdtemp(); copy_specs(d)
    mut(d); r=subprocess.run([sys.executable,os.path.join(d,"validate.py")],capture_output=True,text=True)
    ok=r.returncode!=0; bad+=not ok
    print(("CAUGHT  " if ok else "MISSED  ")+name+"  -> "+(r.stdout.strip().splitlines()[0] if r.stdout.strip() else ""))
    shutil.rmtree(d)
print(f"{len(T)-bad}/{len(T)} negative tests caught"); sys.exit(1 if bad else 0)
