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

    mtime = datetime.fromtimestamp(os.path.getmtime(a.excel))
    as_of = a.as_of or as_of_from_name(a.excel, mtime.year) or mtime.date().isoformat()
    payload = {
        "asOf": as_of,
        "validUntil": a.valid_until,
        "areas": [n for _, n in areas],
        "count": len(rows),
        "rows": rows,
    }
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
    print(f"Wrote {OUT}: {len(rows)} models, areas {payload['areas']}, as of {as_of}, valid until {a.valid_until}")
    if fixes:
        print("Over-allocated (fixed, biggest area reduced):\n" + "\n".join(fixes))
    if warn:
        print("Check:\n" + "\n".join(warn))


if __name__ == "__main__":
    main()
