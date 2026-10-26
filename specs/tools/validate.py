#!/usr/bin/env python3
"""Validate Pinout specs: JSON parses, connections reference real pins/holes, signals only on safe GPIOs, no 5V on a GPIO net."""
import json,glob,re,sys,os
_here = os.path.dirname(os.path.abspath(__file__))
_root = _here if os.path.isdir(os.path.join(_here, "components")) else os.path.dirname(_here)
os.chdir(_root)
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
    used_rails=set()
    for w in b["connections"]:
        for e in (w["from"], w["to"]):
            m=RAIL.match(e)
            if m: used_rails.add(m[1])
    POWER={"G","GND","5V","3V3","3.3V"}
    for rid in used_rails:
        root=f(f"rail:{rid}")
        fed=any(f(node)==root and c.get("kind")=="board" and ((p.get("label") or "").upper() in POWER or p.get("id","").upper() in POWER) for node,(c,p) in pinmeta.items())
        if not fed: err.append(f"{bp}: rail {rid} is used but never fed from a board power pin")
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
print("\n".join(err) if err else f"PASS: {len(comps)} components, builds OK")
sys.exit(1 if err else 0)
