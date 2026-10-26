#!/usr/bin/env python3
"""Validate Pinout specs: JSON parses, connections reference real pins/holes, signals only on safe GPIOs, no 5V on a GPIO net."""
import json,glob,re,sys,os
_here=os.path.dirname(os.path.abspath(__file__))
os.chdir(_here if os.path.isdir(os.path.join(_here,"components")) else os.path.join(_here,".."))
err=[]
def load(p):
    try: return json.load(open(p))
    except Exception as e: err.append(f"{p}: invalid JSON {e}"); return None
comps={}
for p in glob.glob("components/*.json"):
    c=load(p)
    if not c: continue
    comps[c["id"]]=c
    for k in(("id","name","kind","provenance") if c.get("kind")=="breadboard" else ("id","name","kind","pins","provenance")):
        if k not in c: err.append(f"{p}: missing {k}")
    pv=c.get("provenance",{})
    if not pv.get("sources") or pv.get("verified_by")!="Maker": err.append(f"{p}: provenance incomplete")
    ids=[x["id"] for x in c.get("pins",[])]
    if len(ids)!=len(set(ids)): err.append(f"{p}: duplicate pin ids")
    gp={x.get("gpio") for x in c.get("pins",[]) if x.get("gpio") is not None}
    for g in c.get("safe_gpio",[]):
        pin=[x for x in c.get("pins",[]) if x.get("gpio")==g]
        if c["kind"]=="board" and not pin: err.append(f"{p}: safe gpio {g} not on a header pin")
        for x in pin:
            f=x["flags"]
            if f.get("strapping") or f.get("usb") or f.get("psram_flash_reserved") or f.get("input_only"): err.append(f"{p}: safe gpio {g} has a risky flag")

# ---- chips + board/chip consistency ----
chips={}
for p in glob.glob("chips/*.json"):
    ch=load(p)
    if not ch: continue
    chips[ch["id"]]=ch
    for k in("id","name","logic_voltage_v","five_v_tolerant","safe_gpio","caution_gpio","no_go_gpio","strapping_gpio","input_only_gpio","uart0","platformio","label_aliases","provenance"):
        if k not in ch: err.append(f"{p}: missing {k}")
    pv=ch.get("provenance",{})
    if not pv.get("sources") or pv.get("verified_by")!="Maker": err.append(f"{p}: provenance incomplete")
    sf=set(ch.get("safe_gpio",[])); ca={int(k) for k in ch.get("caution_gpio",{})}; ng={int(k) for k in ch.get("no_go_gpio",{})}
    if sf&ca or sf&ng or ca&ng: err.append(f"{p}: safe/caution/no_go overlap {sorted((sf&ca)|(sf&ng)|(ca&ng))}")
    risky=set(ch.get("strapping_gpio",[]))|set(ch.get("input_only_gpio",[]))|set((ch.get("usb_gpio") or {}).values() if isinstance(ch.get("usb_gpio"),dict) else [])
    if sf&risky: err.append(f"{p}: safe_gpio contains strapping/input-only/USB pins {sorted(sf&risky)}")
    if set(ch.get("uart0",{}).get(k) for k in("tx","rx"))&sf and ch["id"]!="rp2040": err.append(f"{p}: UART0 pin in safe_gpio")
    for k,v in list(ch.get("caution_gpio",{}).items())+list(ch.get("no_go_gpio",{}).items()):
        if not str(v).strip(): err.append(f"{p}: GPIO{k} has no reason")
for cid,c in comps.items():
    if c.get("kind")!="board": continue
    p=f"components/{cid}.json"
    ch=chips.get(c.get("chip"))
    if not ch: err.append(f"{p}: missing/unknown chip {c.get('chip')!r}"); continue
    bs=set(c.get("safe_gpio",[]))
    extra=bs-set(ch["safe_gpio"])
    if extra: err.append(f"{p}: safe_gpio {sorted(extra)} not safe on chip {ch['id']} (boards may only remove pins)")
    if bs&{int(k) for k in c.get("no_go_gpio",{})}: err.append(f"{p}: safe_gpio overlaps no_go_gpio")
    for x in c.get("pins",[]):
        g=x.get("gpio")
        if g is None: continue
        if g not in ch.get("gpio_numbers",[g]): err.append(f"{p}: {x['id']} GPIO{g} does not exist on {ch['id']}")
        if str(g) in ch["no_go_gpio"] and not (x["flags"].get("psram_flash_reserved") or str(g) in c.get("no_go_gpio",{})): err.append(f"{p}: {x['id']} GPIO{g} is chip no-go but not flagged on the board")
        if g in ch.get("input_only_gpio",[]) and not x["flags"].get("input_only"): err.append(f"{p}: {x['id']} GPIO{g} input-only not flagged")
    hdr={x.get("gpio") for x in c.get("pins",[])}
    if "logic" in c and not isinstance(c["logic"].get("five_v_logic"),bool): err.append(f"{p}: logic.five_v_logic must be bool")
    if "logic" in c and (c["logic"]["five_v_logic"])!=(ch["logic_voltage_v"]>=5): err.append(f"{p}: logic.five_v_logic disagrees with chip")
    if "platformio" in c:
        for k in("board","platform","framework"):
            if not c["platformio"].get(k): err.append(f"{p}: platformio.{k} missing")
    for bus in("i2c","spi"):
        for role,g in ((c.get("defaults") or {}).get(bus) or {}).items():
            if isinstance(g,int) and g not in hdr: err.append(f"{p}: default {bus}.{role}=GPIO{g} not on a header pin")
    bf=c.get("breadboard_fit")
    if bf is not None and not isinstance(bf.get("fits_830"),bool): err.append(f"{p}: breadboard_fit.fits_830 must be bool")
load("wire-colors.json")
bb=comps["breadboard-830"]; cols=bb["grid"]["columns"]; rows=bb["grid"]["rows"]; rails={r["id"]:r for r in bb["rails"]}
HOLE=re.compile(r"^([a-j])(\d+)$"); RAIL=re.compile(r"^(L\+|L-|R\+|R-)@(\d+)$")
def hole_node(h):
    m=HOLE.match(h)
    if m:
        if not 1<=int(m[2])<=rows: return None
        return f"strip:{'L' if m[1] in 'abcde' else 'R'}{m[2]}"
    m=RAIL.match(h)
    if m and 1<=int(m[2])<=rows: return f"rail:{m[1]}"  # rails treated continuous; split boards bridged
    return None
for bp in glob.glob("builds/*.json"):
    b=load(bp)
    if not b: continue
    parts={x["id"]:x["component"] for x in b["parts"]}
    par={}
    def f(a):
        par.setdefault(a,a)
        while par[a]!=a: par[a]=par[par[a]]; a=par[a]
        return a
    def u(a,b_): par[f(a)]=f(b_)
    used={}
    pinmeta={}
    for pl in b["placements"]:
        c=comps.get(parts.get(pl["part"]))
        if not c: err.append(f"{bp}: placement part {pl['part']} unknown"); continue
        pids={x["id"]:x for x in c["pins"]}
        for pid,h in (pl.get("pin_holes") or {}).items():
            if pid not in pids: err.append(f"{bp}: {pl['part']}.{pid} not a pin of {c['id']}"); continue
            n=hole_node(h)
            if not n: err.append(f"{bp}: bad hole {h}"); continue
            if h in used: err.append(f"{bp}: hole {h} used twice ({used[h]})")
            used[h]=f"{pl['part']}:{pid}"
            node=f"{pl['part']}:{pid}"; u(node,n); pinmeta[node]=(c,pids[pid])
    def endpoint(e):
        if ":" in e:
            pt,pid=e.split(":",1); c=comps.get(parts.get(pt))
            if not c or pid not in {x["id"] for x in c["pins"]}: err.append(f"{bp}: endpoint {e} not a real pin"); return None
            pinmeta[e]=(c,[x for x in c["pins"] if x["id"]==pid][0]); return e
        n=hole_node(e)
        if not n: err.append(f"{bp}: endpoint {e} not a real hole")
        return n
    cids=set(); touched=set()
    for w in b["connections"]:
        cids.add(w["id"]); a=endpoint(w["from"]); z=endpoint(w["to"])
        if a and z: u(a,z); touched.update([a,z])
    for s in b["steps"]:
        for cid in s.get("connections_added",[]):
            if cid not in cids: err.append(f"{bp}: step {s['n']} unknown connection {cid}")
    # net checks
    nets={}
    for node,(c,p) in pinmeta.items(): nets.setdefault(f(node),[]).append((node,c,p))
    nets_rails={f("rail:L+"):"5V"}
    for root,mem in nets.items():
        if not any(f(t)==root for t in touched): continue
        five=any(p["label"]=="5V" or p["id"]=="VCC" and c["id"] in("hc-sr501-pir","sg90-servo") for _,c,p in mem) or nets_rails.get(root)=="5V"
        for node,c,p in mem:
            g=p.get("gpio")
            if c["kind"]=="board" and g is not None:
                if g not in c.get("safe_gpio",[]): err.append(f"{bp}: signal on non-safe GPIO{g} ({node})")
                if five: err.append(f"{bp}: GPIO{g} shares a net with 5V!")
    # every board GPIO used must have a connection beyond its own hole
print("\n".join(err) if err else f"PASS: {len(comps)} components ({sum(1 for c in comps.values() if c.get('kind')=='board')} boards), {len(chips)} chips, builds OK")
sys.exit(1 if err else 0)
