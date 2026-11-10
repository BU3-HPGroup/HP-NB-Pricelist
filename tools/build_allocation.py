#!/usr/bin/env python3
"""
Build data/allocation.json (the "Allocation" tab) from the daily allocation workbook.

    python tools/build_allocation.py --excel "../Allocation of onhand with Program - as of Nov 5.xlsx" \
        --valid-until 2026-11-10 [--as-of 2026-11-05]

What is published
-----------------
Only the "Allocation" sheet: per model the program qty (column "Qty") and the max qty per area
(every column to the right of "Qty", e.g. GMA 1, GMA 2, PROV 1...). A model whose area cells say
"OPEN" (merged cells included) is published as open to all areas. When rounding makes the
areas add up to more than the Qty, the excess is taken off the biggest area.

What is NOT published
---------------------
The % split and peso budget rows above the header, the prices on that sheet, and the
"Onhand and Incoming" sheet. The workbook itself is never copied into the repo.

Placements (--placements, SAP billing export): only Material Group HP-NB lines are used. Each line is matched
to a model by material number / part number and deducted from the area of its Department
(SDC_PROV3 -> PROV 3, SDB_GMA2 -> GMA 2 ...) and from the program qty. Bundle items are skipped.
"""
import argparse
import json
import os
import re
import sys
from datetime import date, datetime

try:
    import openpyxl
except ImportError:
    sys.exit("Please install openpyxl:  pip install openpyxl")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "allocation.json")
MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}


def norm(v):
    return re.sub(r"\s+", " ", str(v or "")).strip()


def as_of_from_name(path, year):
    m = re.search(r"as of\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})", os.path.basename(path), re.I)
    if not m or m.group(1).lower() not in MONTHS:
        return None
    return date(year, MONTHS[m.group(1).lower()], int(m.group(2))).isoformat()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--excel", required=True)
    ap.add_argument("--sheet", default="Allocation")
    ap.add_argument("--valid-until", required=True, help="Last day the area allocation applies, e.g. 2026-11-10")
    ap.add_argument("--as-of", default=None, help="Defaults to the 'as of <Mon> <day>' in the file name")
    ap.add_argument("--placements", action="append", default=[],
                    help="SAP billing export(s) of placements to deduct (e.g. '1101 TO 1109 PLACEMENTS.XLSX'); repeatable")
    ap.add_argument("--placements-label", default=None, help='Shown on the site, e.g. "Nov 1–9" (defaults to the file name)')
    a = ap.parse_args()

    wb = openpyxl.load_workbook(a.excel, data_only=True)
    if a.sheet not in wb.sheetnames:
        sys.exit(f"Sheet '{a.sheet}' not found; sheets are {wb.sheetnames}")
    ws = wb[a.sheet]

    # merged cells: every cell in the range takes the top-left value ("OPEN" across a block of models)
    merged = {}
    for rng in ws.merged_cells.ranges:
        v = ws.cell(rng.min_row, rng.min_col).value
        for r in range(rng.min_row, rng.max_row + 1):
            for c in range(rng.min_col, rng.max_col + 1):
                merged[(r, c)] = v
    val = lambda r, c: merged.get((r, c), ws.cell(r, c).value)

    # header row = the row that has "Part Number" and "Qty"
    hdr = None
    for r in range(1, min(ws.max_row, 30) + 1):
        names = [norm(ws.cell(r, c).value).lower() for c in range(1, ws.max_column + 1)]
        if "part number" in names and "qty" in names:
            hdr = r
            break
    if not hdr:
        sys.exit("Could not find the header row (needs 'Part Number' and 'Qty').")
    head = {norm(ws.cell(hdr, c).value).lower(): c for c in range(1, ws.max_column + 1) if norm(ws.cell(hdr, c).value)}
    c_pn, c_qty = head["part number"], head["qty"]
    c_model, c_type, c_mat = head.get("model"), head.get("type"), head.get("material number")
    areas = [(c, norm(ws.cell(hdr, c).value)) for c in range(c_qty + 1, ws.max_column + 1) if norm(ws.cell(hdr, c).value)]
    if not areas:
        sys.exit("No area columns found to the right of 'Qty'.")

    # match to the pricelist so the tab can link to product details
    prod = {}
    try:
        for p in json.load(open(os.path.join(ROOT, "data", "products.json"), encoding="utf-8"))["products"]:
            prod[norm(p.get("partNo") or p.get("sku")).upper()] = p["id"]
    except (OSError, KeyError, ValueError):
        pass

    rows, warn, fixes = [], [], []
    for r in range(hdr + 1, ws.max_row + 1):
        pn = norm(ws.cell(r, c_pn).value).upper()
        if not pn:
            continue
        qty = ws.cell(r, c_qty).value
        qty = int(round(qty)) if isinstance(qty, (int, float)) else None
        vals = [val(r, c) for c, _ in areas]
        is_open = any(isinstance(v, str) and v.strip().upper() == "OPEN" for v in vals)
        row = {
            "pn": pn,
            "mat": norm(ws.cell(r, c_mat).value) if c_mat else "",
            "model": norm(ws.cell(r, c_model).value) if c_model else pn,
            "type": norm(ws.cell(r, c_type).value) if c_type else "",
            "id": prod.get(pn),
            "qty": qty,
        }
        if is_open:
            row["open"] = True
        else:
            q = [int(round(v)) if isinstance(v, (int, float)) else None for v in vals]
            s = sum(x for x in q if x is not None)
            # rounding can give the areas more than the Qty: take the excess off the biggest area
            if qty is not None and s > qty and any(x is not None for x in q):
                big = max(range(len(q)), key=lambda k: q[k] if q[k] is not None else -1)
                fixes.append(f"  {row['model']}: {areas[big][1]} {q[big]} -> {q[big] - (s - qty)} (areas were {s}, Qty {qty})")
                q[big] -= s - qty
                s = qty
            row["areas"] = q
            if qty is not None and s < qty:
                warn.append(f"  {row['model']}: areas add up to {s}, Qty is {qty} ({qty - s} not allocated)")
        if not row["id"]:
            warn.append(f"  {pn} {row['model']}: not on the pricelist (no details link)")
        rows.append(row)

    # ---- deduct placements (HP-NB lines only) from the area of the selling department ----
    placed, plog, pskip, entries = {}, [], [], []
    def area_of(dept):
        d = re.sub(r"[^A-Z0-9]", "", str(dept or "").upper())          # SDC_PROV3 / SDC-PROV3 / SDB_GMA2 -> SDCPROV3 / SDBGMA2
        for i, (_, name) in enumerate(areas):
            if d.endswith(re.sub(r"[^A-Z0-9]", "", name.upper())):
                return i
        return None
    by_pn = {r["pn"]: r for r in rows}
    by_mat = {r["mat"]: r for r in rows if r.get("mat")}
    files = []
    for pf in a.placements:   # a file, or a folder of SAP billing exports (e.g. "Sell out data - Cutoff")
        if os.path.isdir(pf):
            files += sorted(os.path.join(pf, f) for f in os.listdir(pf) if f.lower().endswith((".xlsx", ".xlsm")) and not f.startswith("~$"))
        else:
            files.append(pf)
    seen = set()
    for pf in files:
        pw = openpyxl.load_workbook(pf, data_only=True).worksheets[0]
        prow = list(pw.iter_rows(values_only=True))
        ph = [norm(x).lower() for x in prow[0]]
        col = lambda name: ph.index(name) if name in ph else None
        c_grp, c_mat2, c_desc, c_dep, c_qty = col("material group"), col("material no."), col("description"), col("department"), col("net quantity")
        c_ext2, c_cust, c_doc = col("ext. description 2"), col("name"), col("billing document")
        c_rep, c_date, c_line = col("sales group"), col("billing date"), col("bd line")
        for r in prow[1:]:
            if not r or c_grp is None or norm(r[c_grp]).upper() != "HP-NB":
                continue
            uid = (norm(r[c_doc]), norm(r[c_line]) if c_line is not None else "", norm(r[c_mat2]))
            if uid in seen:          # same billing line in two files: count it once
                continue
            seen.add(uid)
            q = r[c_qty] if c_qty is not None else None
            if not isinstance(q, (int, float)) or q == 0:
                continue
            row = by_mat.get(norm(r[c_mat2])) or by_pn.get(norm(r[c_ext2]).upper() if c_ext2 is not None else "")
            if not row:
                m = re.search(r"\b([A-Z0-9]{5,7}PA)\b", norm(r[c_desc]).upper())
                row = by_pn.get(m.group(1)) if m else None
            if not row:
                pskip.append(f"  {norm(r[c_desc])} x{int(q)} ({norm(r[c_cust])}) — not on the allocation (e.g. bundle item), skipped")
                continue
            ai = area_of(r[c_dep])
            if ai is None and not row.get("open"):
                sys.exit(f"Department '{r[c_dep]}' on {norm(r[c_desc])} does not match an area {[n for _, n in areas]}")
            key = (row["pn"], ai)
            placed[key] = placed.get(key, 0) + int(q)
            bd = r[c_date] if c_date is not None else None
            entries.append({
                "date": bd.date().isoformat() if hasattr(bd, "date") else norm(bd)[:10],
                "rep": norm(r[c_rep]) if c_rep is not None else "",
                "dept": norm(r[c_dep]),
                "area": areas[ai][1] if ai is not None else "",
                "customer": norm(r[c_cust]),
                "pn": row["pn"], "model": row["model"], "id": row.get("id"),
                "qty": int(q),
                "doc": norm(r[c_doc]),
            })
            plog.append(f"  {row['model']}: -{int(q)} {areas[ai][1] if ai is not None else '(open)'}  [{norm(r[c_cust])}, {norm(r[c_dep])}, BD {norm(r[c_doc])}]")
    total_placed, over = 0, []
    for (pn, ai), q in placed.items():
        row = by_pn[pn]
        total_placed += q
        if row.get("qty") is not None:
            row["qty"] = max(0, row["qty"] - q)
        row["placed"] = row.get("placed", 0) + q
        if not row.get("open") and ai is not None:
            if row["areas"][ai] is not None and q > row["areas"][ai]:
                warn.append(f"  {row['model']}: {areas[ai][1]} placed {q} but only {row['areas'][ai]} allocated — set to 0 (over by {q - row['areas'][ai]})")
                over.append({"pn": pn, "model": row["model"], "id": row.get("id"), "area": areas[ai][1], "allocated": row["areas"][ai], "placed": q, "over": q - row["areas"][ai]})
                row.setdefault("over", {})[areas[ai][1]] = q - row["areas"][ai]
            row["areas"][ai] = max(0, (row["areas"][ai] or 0) - q)

    mtime = datetime.fromtimestamp(os.path.getmtime(a.excel))
    as_of = a.as_of or as_of_from_name(a.excel, mtime.year) or mtime.date().isoformat()
    payload = {
        "asOf": as_of,
        "validUntil": a.valid_until,
        "areas": [n for _, n in areas],
        "count": len(rows),
        "rows": rows,
    }
    if a.placements:
        lab = a.placements_label or ", ".join(os.path.splitext(os.path.basename(f))[0] for f in a.placements)
        entries.sort(key=lambda e: (e["date"], e["doc"]), reverse=True)
        payload["placements"] = {"label": lab, "units": total_placed, "models": len({pn for pn, _ in placed}), "entries": entries, "over": over}
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
    print(f"Wrote {OUT}: {len(rows)} models, areas {payload['areas']}, as of {as_of}, valid until {a.valid_until}")
    if plog:
        print("Placements deducted:\n" + "\n".join(plog))
    if pskip:
        print("Placements skipped:\n" + "\n".join(pskip))
    if fixes:
        print("Over-allocated (fixed, biggest area reduced):\n" + "\n".join(fixes))
    if warn:
        print("Check:\n" + "\n".join(warn))


if __name__ == "__main__":
    main()
