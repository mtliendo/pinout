# Passives, wires, power + overlay for the 7 gen.py-owned parts. exec'd by gen_parts.py.
BANDS={330:["orange","orange","brown"],1000:["brown","black","red"],4700:["yellow","violet","red"],10000:["brown","black","orange"],100000:["brown","black","yellow"]}
USE={330:"LED series resistor from 5V",1000:"transistor base, HC-SR04 divider",4700:"DS18B20 / I2C pull-up",10000:"pull-up/down, LDR divider",100000:"high-impedance divider, weak pull"}
for ohm,name,rid in((330,"330 Ω","330"),(1000,"1 kΩ","1k"),(4700,"4.7 kΩ","4k7"),(10000,"10 kΩ","10k"),(100000,"100 kΩ","100k")):
    W({"id":f"resistor-{rid}","name":f"{name} resistor, 1/4 W axial","kind":"passive","coordinate_frame":dict(FRAME,origin="lead 1"),
     "body":{"length_mm":A(6.3,"Typical 1/4 W body; not from a fetched datasheet"),"diameter_mm":A(2.4,"approx"),"span_holes":4},"colors":{"body":"#d8c49a","bands":BANDS[ohm]+["gold"]},
     "headers":[{"id":"leads","origin_mm":[0,0],"pitch":P,"count":2,"orientation":"+X","pin1":"either (non-polar)","note":"Bent to span 4 holes (10.16 mm) in builds."}],
     "pins":[pin(1,"1","lead 1",["passive"],"",x=0),pin(2,"2","lead 2",["passive"],"",x=10.16)],
     "electrical":{"ohms":ohm,"power_w":0.25,"tolerance":"±5% (gold band)","typical_use":USE[ohm]},
     "part":part("passive",{"min":0,"max":None,"note":"Limited by 1/4 W"},{"level":"n/a"},compat(("yes",[]),("yes",[])),{"type":"passive"},{"note":"P = V²/R ≤ 0.25 W"},[],"breadboard",[],["body"]),
     "provenance":prov([U["rcc"]],"4-band color code (IEC 60062)","Body size approx; 1/4 W assumed (kit standard).")})
def ecap(id_,uf,v,dia,ln,pitch,model):
    W({"id":id_,"name":f"{uf} µF {v}V electrolytic capacitor (radial)","kind":"passive","coordinate_frame":dict(FRAME,origin="negative lead"),
     "body":{"diameter_mm":dia,"height_mm":ln,"lead_spacing_mm":pitch,"source":f"Nichicon UPW {model}","note":"Kit caps are unbranded; size varies with voltage rating."},"colors":{"body":"#1a1a1a","stripe":"#d0d0d0"},
     "headers":[{"id":"leads","origin_mm":[0,0],"pitch":pitch,"count":2,"orientation":"+X","pin1":"negative (stripe side, short lead)","note":"Lead spacing isn't a 2.54 multiple: bend into 2 adjacent breadboard rows."}],
     "pins":[pin(1,"-","− (stripe, short leg)",["GND"],G5,["Polarised: reversed it can bulge or vent."],x=0),pin(2,"+","+ (long leg)",["power"],f"≤{v}V",[],x=pitch)],
     "electrical":{"capacitance_uf":uf,"rated_v":v,"tolerance":"±20% (M)"},
     "part":part("passive",{"min":0,"max":v},{"level":"n/a"},compat(("yes",[]),("yes",[])),{"type":"passive (bulk decoupling)"},{"note":"n/a"},[],"breadboard",[],[]),
     "provenance":prov([U["upw"]],f"Nichicon UPW catalog ({model})")})
ecap("cap-electrolytic-100uf",100,35,8,11.5,3.5,"UPW1V101MPD")
ecap("cap-electrolytic-1000uf",1000,6.3,10,12.5,5.0,"UPW0J102MPD")
W({"id":"diode-1n4007","name":"1N4007 rectifier diode (DO-41)","kind":"passive","coordinate_frame":dict(FRAME,origin="anode lead"),
 "body":{"length_mm":5.2,"diameter_mm":2.7,"note":"Vishay DO-41: body 4.1-5.2 mm long, 2.0-2.7 mm dia, leads 0.71-0.86 mm","span_holes":4},"colors":{"body":"#1a1a1a","band":"#d0d0d0"},
 "headers":[{"id":"leads","origin_mm":[0,0],"pitch":P,"count":2,"orientation":"+X","pin1":"anode","note":"Bent to span 4 holes."}],
 "pins":[pin(1,"A","anode",["passive"],"",x=0),pin(2,"K","cathode (band)",["passive"],"",["Band = cathode. As a flyback diode the band goes to +."],x=10.16)],
 "electrical":{"vrrm_v":1000,"if_av_a":1.0,"ifsm_a":30,"vf_v":1.1},
 "part":part("passive",{"min":0,"max":1000},{"level":"n/a"},compat(("yes",[]),("yes",[])),{"type":"passive"},{"max":1000,"note":"IF(AV) 1 A"},[],"breadboard",[],[]),
 "provenance":prov([U["n4007"]],"Vishay 1N4001-1N4007 (doc 88503)")})
W({"id":"transistor-pn2222a","name":"PN2222A NPN transistor (TO-92)","kind":"passive",
 "body":{"length_mm":A(4.8,"TO-92 typical"),"width_mm":A(3.8,"TO-92"),"height_mm":A(4.8,"TO-92")},"colors":{"body":"#1a1a1a"},
 "headers":[hdr(3,"E (emitter)",kind="leads",note="MCC PN2222A: 1=E 2=B 3=C, flat face toward you. TO-92 2N2222A from other makers can be C-B-E, and TO-18 cans differ: check YOUR part's datasheet.")],
 "pins":[pin(1,"E","emitter",["GND"],G5),pin(2,"B","base",["digital in"],"through 1k from the GPIO"),pin(3,"C","collector",["low-side switch"],"≤40V")],
 "electrical":{"vceo_v":40,"vcbo_v":75,"vebo_v":6,"ic_max_ma":600,"pd_mw":625,"hfe":"100-300 @150 mA, VCE 10V"},
 "part":part("passive",{"min":0,"max":40},{"level":"base driven by GPIO"},compat(("yes",["1k base resistor: ~2.6 mA base drive from 3.3V (arithmetic)."]),("yes",["1k base resistor."])),{"type":"low-side switch"},{"max":600},
   [{"kind":"resistor","value":"1k","between":["GPIO","B"]},{"kind":"flyback diode","value":"1N4007","between":["load+","C"],"for":"inductive loads (relay coil, motor)"}],"breadboard",[],["body"]),
 "provenance":prov([U["pn"]],"MCC PN2222A (TO-92)","Picked PN2222A over 2N2222: it's the TO-92 part kits ship; the classic 2N2222 is a TO-18 can.")})
def jumper(id_,a,b,url,title,mount):
    W({"id":id_,"name":f"Jumper wires {a}/{b}, 150 mm","kind":"passive","body":{"length_mm":150,"source":f"Adafruit {title}"},"colors":{"wire":"rainbow"},
     "headers":[{"id":"ends","origin_mm":[0,0],"pitch":150,"count":2,"orientation":"+X","pin1":f"end A ({a})","note":"0.1\" (2.54 mm) connectors"}],
     "pins":[pin(1,"A",f"end A ({a})",["wire"],"",x=0),pin(2,"B",f"end B ({b})",["wire"],"",x=150)],
     "electrical":{"note":"Fine for signals and small loads; not for multi-amp LED strip power."},
     "part":part("wire",{"min":0,"max":None},{"level":"n/a"},compat(("yes",[]),("yes",[])),{"type":"wire"},{"note":"n/a"},[],mount,[]),
     "provenance":prov([url],title)})
jumper("jumper-male-male","male","male",U["jmm"],"Premium Male/Male Jumper Wires - 40 x 6\" (150mm) #758","breadboard ↔ breadboard / female header")
jumper("jumper-male-female","male","female",U["jmf"],"Premium Female/Male 'Extension' Jumper Wires - 40 x 6\" (150mm) #826","breadboard ↔ module male pins")
jumper("jumper-female-female","female","female",U["jff"],"Premium Female/Female Jumper Wires - 40 x 6\" (150mm) #266","module pins ↔ board pins (no breadboard)")
W({"id":"breadboard-power-mb102","name":"MB102 breadboard power module (3.3V / 5V)","kind":"passive",
 "body":{"length_mm":A(53,"Not dimensioned in Handsontec text"),"width_mm":A(33,"approx"),"height_mm":A(20,"Barrel jack height")},"colors":{"pcb":"#c62828"},
 "headers":[{"id":"RAIL_A","kind":"2-pin rail plug","origin_mm":[0,0],"pitch":P,"count":2,"orientation":"+Y","pin1":"+","pin_order_approx":True,"note":"Plugs into one end of a rail pair. "+SILK},
            {"id":"RAIL_B","kind":"2-pin rail plug","origin_mm":[A(48.26,"Matches 830-board rail pair spacing approx")["value"],0],"pitch":P,"count":2,"orientation":"+Y","pin1":"+","pin_order_approx":True,"note":"Other rail pair. "+SILK}],
 "pins":[pin(1,"A+","+ (3.3V/5V/off, jumper)",["power"],"3.3V or 5V by jumper",["Set each side's jumper BEFORE plugging in."],x=0,y=0),
         pin(2,"A-","−",["GND"],G5,x=0,y=2.54),
         pin(1,"B+","+ (3.3V/5V/off, jumper)",["power"],"3.3V or 5V by jumper",[],x=48.26,y=0,header=1),
         pin(2,"B-","−",["GND"],G5,x=48.26,y=2.54,header=1)],
 "electrical":{"input":"6.5-12V DC barrel, or 5V USB","output":"3.3V and 5V (AMS1117-5 / AMS1117-3.3 per schematic)","max_current_ma":700},
 "part":part("power",{"min":6.5,"max":12,"note":"Barrel input (or 5V USB)"},{"level":"n/a"},
   compat(("with_conditions",["Don't also power the MCU board over USB while feeding its 5V/3V3 pin from this (back-feed).","Share GND with the MCU."]),("with_conditions",["Same back-feed rule."])),
   {"type":"power"},{"max":700,"note":"Handsontec: <700 mA"},[],"breadboard_rails",[],["body","pin_order"]),
 "provenance":prov([U["mb102"]],"Handsontec MB102 sheet","Check that the module's + lines up with the breadboard's red line before powering.")})
OVER={
 "sg90-servo":part("actuator",{"min":4.8,"max":6.6,"note":"4.8 nominal (TowerPro); 6.6 per reseller"},{"level":"PWM in"},compat(("with_conditions",["Power from 5V, not 3V3; 3.3V signal normally works."]),("yes",[])),{"type":"PWM (50 Hz servo)"},{"note":"TowerPro publishes none; reseller 'up to 200 mA'"},[{"kind":"capacitor","value":"100-470µF","between":["5V","GND"],"note":"Engineering practice (notes.md)"}],"off_board",L["servo"],["current_ma"]),
 "hc-sr501-pir":part("sensor",{"min":4.5,"max":20},{"level":"3.3V out"},compat(("yes",["Power from 5V; OUT is 3.3V."]),("yes",[])),{"type":"digital"},{"note":"<50 µA quiescent"},[],"off_board",[],["pin_order"]),
 "led-5mm-red":part("passive",{"min":0,"max":2.5},{"level":"n/a"},compat(("yes",["220Ω from 3.3V ≈ 6 mA."]),("yes",["330Ω from 5V."])),{"type":"digital / PWM"},{"max":30},[{"kind":"resistor","value":"220Ω","between":["GPIO","A"]}],"breadboard",[],["height"]),
 "resistor-220":part("passive",{"min":0,"max":None},{"level":"n/a"},compat(("yes",[]),("yes",[])),{"type":"passive"},{"note":"≤0.25 W"},[],"breadboard",[],["body"]),
 "tactile-button-6mm":part("sensor",{"min":0,"max":24},{"level":"= MCU"},compat(("yes",["INPUT_PULLUP, other leg to GND."]),("yes",[])),{"type":"digital"},{"max":50},[],"breadboard",[],[]),
 "ssd1306-oled-128x64-i2c":part("display",{"min":3.3,"max":5,"note":"5V only on regulated modules"},{"level":"= VCC (pull-ups to VCC)"},compat(("yes",["Power from 3V3."]),("with_conditions",["Only if the module has a regulator; pull-ups then go to 5V, fine for AVR."])),{"type":"I2C","i2c_addresses":["0x3C","0x3D"]},{"note":"Not in fetched sources"},[],"off_board",L["ssd"],["body","pin_order"]),
 "breadboard-830":part("breadboard",{"min":0,"max":36},{"level":"n/a"},compat(("yes",[]),("yes",[])),{"type":"n/a"},{"max":2000,"note":"2 A rating (BusBoard)"},[],"base",[],[]),
}
