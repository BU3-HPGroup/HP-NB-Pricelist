#!/usr/bin/env python3
"""
Build data/allocation.json (version 2) from an HP CPS program workbook with qty per dealer group.

    python tools/build_program_allocation.py \
        --program "E:/Test Pilot - HP Pricelist/Programs/Copy of Iontech CPS  Q127 M1 + M2 Program - Nov 11 to Dec 30.xlsx" \
        --sellout "E:/Test Pilot - HP Pricelist/Sell out data - Cutoff" --since 2026-11-05 \
        [--onhand "E:/Test Pilot - HP Pricelist/Allocation of onhand with Program - as of Nov 5.xlsx"] [--as-of 2026-11-19]

Rules (agreed with Ed, Nov 2026)
--------------------------------
* Program qty per model and dealer group comes from the "IONTECH Group A / B / C" sheets ("PROGRAM MAX QTY").
  Only models on the HP-NB pricelist (data/products.json) are used.
* Areas: each group's qty is split GMA 1 26% · GMA 2 46% · PROV 1 10% · PROV 2 12% · PROV 3 6%
  (largest-remainder rounding, so the areas add up exactly).
* Open to all areas (no split, group qty is still the limit): OmniBook 5, OmniBook 5 Flip, OmniBook X Flip,
  plus OPEN_GROUPS below.
* Placements (SAP billing exports, every .xlsx in --sellout): HP-NB invoice lines billed on/after --since.
  - Credit memos / returns (negative qty) are ignored.
  - Source Document starting with 8 (ignoring leading zeros) = an earlier order billed now -> not deducted.
  - Dealer -> group from the dealer lists on sheet 2 of the pricelist (data/products.json dealerGroups);
    Ultrium = Group A (under TTI Cebu); anyone not listed = Group C.
  - Area from the Department column (SDC_PROV3 -> PROV 3 ...).
  - If the dealer's group has no program qty for the model and the model is in exactly ONE group's program,
    the units come out of that group (e.g. Group A dealers buying 15-fc0932AU, which only has Group C qty).
    If the model is in several groups' programs, the line is ignored (e.g. a Group C dealer on fc0947AU).
  - An area that places more than its share keeps exactly what it placed; the rest of the group's qty is
    split across the other areas by the same %. If a whole group is used up, it shows 0 left and "N over".
"""
import argparse, glob, json, os, re, sys
from datetime import date

try:
    import openpyxl
except ImportError:
    sys.exit("pip install openpyxl")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "allocation.json")
AREAS = ["GMA 1", "GMA 2", "PROV 1", "PROV 2", "PROV 3"]
PCT = [0.26, 0.46, 0.10, 0.12, 0.06]
OPEN_TYPES = {"Omnibook 5", "Omnibook 5 Flip", "Omnibook X Flip"}
OPEN_GROUPS = {("DW4U8PA", "B"), ("DW4U8PA", "C"), ("DU5U6PA", "B")}   # 3–7 units: Ed asked to open them
GROUP_OVERRIDES = {"ULTRIUM": "A"}                                      # Ultrium is under TTI Cebu (Group A)
STOP = {"INC", "CORP", "CORPORATION", "COMPUTER", "COMPUTERS", "TRADING", "CENTER", "CENTRE", "SYSTEMS", "SYSTEM",
        "SOLUTIONS", "MARKETING", "GROUP", "PHILS", "THE", "AND", "ALSO", "KNOWN", "SALES", "TECH", "TECHNOLOGY",
        "DATA", "SHOPPE"}


def words(s):
    return [w for w in re.sub(r"[^A-Z0-9 ]", " ", str(s or "").upper().replace("'", "")).split() if w not in STOP and len(w) > 2]


def lr(total, weights):
    s = sum(weights)
    if total <= 0 or s <= 0:
        return [0] * len(weights)
    raw = [total * w / s for w in weights]
    base = [int(x) for x in raw]
    for i in sorted(range(len(weights)), key=lambda i: (-(raw[i] - base[i]), -weights[i]))[:total - sum(base)]:
        base[i] += 1
    return base


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--program", required=True)
    ap.add_argument("--sellout", action="append", default=[], help="folder or file(s) of SAP billing exports")
    ap.add_argument("--since", default="2026-11-05")
    ap.add_argument("--onhand", default=None)
    ap.add_argument("--as-of", default=date.today().isoformat())
    ap.add_argument("--label", default=None, help='placements label, e.g. "Nov 5–16"')
    ap.add_argument("--program-name", default="CPS Q127 M1 + M2")
    ap.add_argument("--valid-from", default=None, help="first day the allocation applies, e.g. 2026-11-19")
    ap.add_argument("--valid-until", default=None, help="last day, e.g. 2026-11-30")
    ap.add_argument("--reallocation", default=None, help="date of the next reallocation, e.g. 2026-12-01")
    ap.add_argument("--fresh-from", default=None,
                    help="start fresh logging on this date: placements before it are taken off quietly (the qty shown "
                         "starts from what was left), and only placements from this date are listed")
    a = ap.parse_args()

    data = json.load(open(os.path.join(ROOT, "data", "products.json"), encoding="utf-8"))
    prods = {p["partNo"]: p for p in data["products"] if p.get("partNo")}
    dealer_groups = data.get("dealerGroups") or []

    def group_of(cust):
        c = str(cust).upper()
        for k, g in GROUP_OVERRIDES.items():
            if k in c:
                return g
        cw = words(cust)
        for g in dealer_groups:
            for d in g.get("dealers", []):
                if (cw and cw[0] in set(words(d))) or ("ELECTROCOMPUTER" in c and "ELECTROCOMPUTER" in d.upper()):
                    return g["code"]
        return "C"

    def area_of(dep):
        d = re.sub(r"[^A-Z0-9]", "", str(dep or "").upper())
        return next((i for i, n in enumerate(AREAS) if d.endswith(n.replace(" ", ""))), None)

    # ---- program qty ----
    wb = openpyxl.load_workbook(a.program, data_only=True)
    rows, order, skipped = {}, [], []
    for ws in wb.worksheets:
        m = re.match(r"IONTECH Group ([A-Z])$", ws.title.strip(), re.I)
        if not m:
            continue
        g = m.group(1).upper()
        R = list(ws.iter_rows(values_only=True))
        hi = next(i for i, r in enumerate(R) if r and "Part #" in r)
        h = R[hi]; ix = h.index
        for r in R[hi + 1:]:
            pn = r[ix("Part #")]
            if not pn or "#" not in str(pn):
                continue
            pn = str(pn).split("#")[0].strip().upper()
            q = r[ix("PROGRAM MAX QTY")]
            if pn not in prods:
                skipped.append(f"{pn} {r[ix('Description')]} (Group {g}) — not on the HP-NB pricelist")
                continue
            if not isinstance(q, (int, float)) or q <= 0:
                continue
            p = prods[pn]
            if pn not in rows:
                rows[pn] = {"pn": pn, "model": p["model"], "id": p["id"], "type": p["type"], "groups": {}}
                order.append(pn)
            op = p["type"] in OPEN_TYPES or (pn, g) in OPEN_GROUPS
            q = int(q)
            rows[pn]["groups"][g] = {"g": g, "qty": q, "open": op, "split": None if op else lr(q, PCT),
                                     "placedAreas": [0] * 5, "placed": 0}

    # ---- placements ----
    files = []
    for s in a.sellout:
        files += sorted(os.path.join(s, f) for f in os.listdir(s) if f.lower().endswith((".xlsx", ".xlsm"))) if os.path.isdir(s) else [s]
    files = [f for f in files if not os.path.basename(f).startswith("~$")]
    entries, earlier, ignored, seen = [], [], [], set()
    for f in files:
        ws = openpyxl.load_workbook(f, data_only=True).worksheets[0]
        R = list(ws.iter_rows(values_only=True)); h = [str(x or "").strip() for x in R[0]]; ix = h.index
        for x in R[1:]:
            if not x or str(x[ix("Material Group")] or "") != "HP-NB":
                continue
            pn = str(x[ix("Ext. Description 2")] or "").strip().upper()
            q = x[ix("Net Quantity")]
            if pn not in rows or not isinstance(q, (int, float)) or q == 0:
                continue
            uid = (str(x[ix("Billing Document")]), str(x[ix("BD Line")]))
            if uid in seen:
                continue
            seen.add(uid)
            bd = x[ix("Billing Date")]
            d = bd.date().isoformat() if hasattr(bd, "date") else str(bd)[:10]
            if d < a.since:
                continue
            src = str(x[ix("Source Document")] or "")
            ai = area_of(x[ix("Department")])
            g0 = group_of(x[ix("Name")])
            e = {"date": d, "pn": pn, "model": rows[pn]["model"], "id": rows[pn]["id"], "qty": int(q),
                 "rep": str(x[ix("Sales Group")] or ""), "dept": str(x[ix("Department")] or ""),
                 "area": AREAS[ai] if ai is not None else "", "customer": str(x[ix("Name")] or ""),
                 "dealerGroup": g0, "group": g0, "doc": str(x[ix("Billing Document")]), "src": src}
            if q < 0 or "CM" in str(x[ix("Document Type")] or "").upper():
                e["why"] = "Return / credit memo"; ignored.append(e); continue
            if src.lstrip("0").startswith("8"):
                earlier.append(e); continue
            G = rows[pn]["groups"]
            if g0 not in G:
                if len(G) == 1:
                    e["group"] = next(iter(G))            # e.g. Group A dealer on a Group C-only model
                else:
                    e["why"] = f"No Group {g0} program qty for this model"; ignored.append(e); continue
            v = G[e["group"]]
            if ai is None and not v["open"]:
                e["why"] = f"Department {e['dept']} is not one of the areas"; ignored.append(e); continue
            v["placed"] += e["qty"]
            if ai is not None:
                v["placedAreas"][ai] += e["qty"]
            entries.append(e)

    # ---- remaining, rebalance, overs ----
    over = []
    for r in rows.values():
        for g, v in r["groups"].items():
            q, p = v["qty"], v["placedAreas"]
            v["left"] = max(0, q - v["placed"])
            v["over"] = max(0, v["placed"] - q)
            if v["over"]:
                over.append({"model": r["model"], "id": r["id"], "group": g, "qty": q, "placed": v["placed"], "over": v["over"]})
            if v["open"]:
                v["areas"] = None; v.pop("split"); v.pop("placedAreas"); continue
            alloc = list(v["split"]); v["rebalanced"] = False
            if any(pi > si for pi, si in zip(p, alloc)):
                locked = set()
                while True:
                    free = [i for i in range(5) if i not in locked]
                    rest = q - sum(p[i] for i in locked)
                    if not free or rest <= 0:
                        break
                    new = {i for i in free if rest * PCT[i] / sum(PCT[j] for j in free) < p[i]}
                    if not new:
                        break
                    locked |= new
                free = [i for i in range(5) if i not in locked]
                alloc = [0] * 5
                for i in locked:
                    alloc[i] = p[i]
                for i, x in zip(free, lr(max(0, q - sum(p[i] for i in locked)), [PCT[i] for i in free])):
                    alloc[i] = x
                v["rebalanced"] = True
            v["alloc"] = alloc
            v["areas"] = [max(0, s - pi) for s, pi in zip(alloc, p)]
        r["qty"] = sum(v["qty"] for v in r["groups"].values())
        r["placed"] = sum(v["placed"] for v in r["groups"].values())
        r["left"] = sum(v["left"] for v in r["groups"].values())
        r["open"] = all(v["open"] for v in r["groups"].values())
        r["groups"] = [r["groups"][g] for g in sorted(r["groups"])]

    # ---- fresh start: earlier placements become part of the starting qty and are not shown ----
    if a.fresh_from:
        before = {}
        for e in entries:
            if e["date"] < a.fresh_from:
                before[(e["pn"], e["group"])] = before.get((e["pn"], e["group"]), 0) + e["qty"]
        over = []
        for pn in list(order):
            r = rows[pn]
            keep = []
            for v in r["groups"]:
                b = before.get((pn, v["g"]), 0)
                full_q, full_p = v["qty"], v["placed"]
                v["qty"] = max(0, full_q - b)                 # what this group starts with today
                v["placed"] = full_p - b                      # fresh placements only
                v["left"] = max(0, full_q - full_p)
                v["over"] = max(0, full_p - full_q) - max(0, b - full_q)
                for k in ("split", "alloc", "placedAreas", "rebalanced"):
                    v.pop(k, None)
                if v["over"]:
                    over.append({"model": r["model"], "id": r["id"], "group": v["g"], "qty": v["qty"], "placed": v["placed"], "over": v["over"]})
                if v["qty"] > 0 or v["placed"] > 0:
                    keep.append(v)
            r["groups"] = keep
            if not keep:
                order.remove(pn); rows.pop(pn)
                continue
            r["qty"] = sum(v["qty"] for v in keep); r["placed"] = sum(v["placed"] for v in keep); r["left"] = sum(v["left"] for v in keep)
            r["open"] = all(v["open"] for v in keep)
        entries = [e for e in entries if e["date"] >= a.fresh_from]
        earlier = [e for e in earlier if e["date"] >= a.fresh_from]
        ignored = [e for e in ignored if e["date"] >= a.fresh_from]
        a.since = a.fresh_from

    onhand = {}
    if a.onhand:
        ws = openpyxl.load_workbook(a.onhand, data_only=True)["Onhand and Incoming"]
        for x in list(ws.iter_rows(values_only=True))[1:]:
            if x and x[0]:
                onhand[str(x[0]).strip().upper()] = x[2]

    key = lambda e: (e["date"], e["doc"])
    first = min((e["date"] for e in entries), default=a.since)
    last = max((e["date"] for e in entries + earlier), default=a.since)
    if not entries and not earlier:
        a.label = a.label or f"since {date.fromisoformat(a.since).strftime('%b %-d')}"
    fmt = lambda iso: date.fromisoformat(iso).strftime("%b %-d")
    label = a.label or (f"{fmt(a.since)}–{date.fromisoformat(last).day}" if last[:7] == a.since[:7] else f"{fmt(a.since)}–{fmt(last)}")
    payload = {
        "version": 2,
        "program": a.program_name,
        "asOf": a.as_of,
        "validFrom": a.valid_from or a.as_of,
        "validUntil": a.valid_until,
        "reallocation": a.reallocation,
        "areas": AREAS,
        "groups": sorted({v["g"] for r in rows.values() for v in r["groups"]}),
        "count": len(rows),
        "rows": [rows[pn] for pn in order],
        "placements": {
            "label": label, "since": a.since, "fresh": bool(a.fresh_from),
            "units": sum(e["qty"] for e in entries),
            "models": len({e["pn"] for e in entries}),
            "entries": sorted(entries, key=key, reverse=True),
            "earlier": sorted(earlier, key=key, reverse=True),
            "ignored": sorted(ignored, key=key, reverse=True),
            "over": over,
        },
    }
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=1)
    tot = {g: [0, 0] for g in payload["groups"]}
    for r in payload["rows"]:
        for v in r["groups"]:
            tot[v["g"]][0] += v["qty"]; tot[v["g"]][1] += v["left"]
    print(f"Wrote {OUT}: {len(rows)} models; " + ", ".join(f"Group {g} {l}/{q} left" for g, (q, l) in tot.items()))
    print(f"Placements {label}: {payload['placements']['units']} units deducted ({len(entries)} lines); "
          f"{len(earlier)} earlier orders and {len(ignored)} other lines not deducted")
    for e in entries:
        if e["group"] != e["dealerGroup"]:
            print(f"  moved to Group {e['group']}: {e['customer']} (Group {e['dealerGroup']}) {e['model']} x{e['qty']}")
    for e in ignored:
        print(f"  ignored: {e['customer']} {e['model']} x{e['qty']} — {e['why']}")
    for o in over:
        print(f"  OVER PROGRAM: {o['model']} Group {o['group']}: {o['placed']} placed vs {o['qty']} ({o['over']} over)")
    if skipped:
        print("Not on the HP-NB pricelist (skipped): " + "; ".join(skipped[:6]) + (" …" if len(skipped) > 6 else ""))


if __name__ == "__main__":
    main()
