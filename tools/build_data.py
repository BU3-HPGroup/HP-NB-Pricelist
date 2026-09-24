#!/usr/bin/env python3
"""
Build data/products.json (and optimized product images) from the Excel pricelist.

The Excel file is the single source of truth. Re-run this script whenever the
pricelist or the product photos change, then commit the results.

Usage (from the project root):
    pip install openpyxl pillow
    python tools/build_data.py --excel "source/Current Pricelist - HPNB.xlsx" --images "path/to/Image assets"

Image matching rule
-------------------
Images in the --images folder must be named "<exact Model from Excel> - <Angle>.<ext>",
e.g. "HP OmniBook 5 AI PC 14-kf0002TU - Front.png". A file is only assigned to a
product when its name starts with that product's exact Model text followed by " - ".
Files that do not match any model are reported and skipped (never guessed).
"""
import argparse
import hashlib
import json
import os
import re
import sys
from datetime import datetime

try:
    import openpyxl
except ImportError:
    sys.exit("Please install openpyxl:  pip install openpyxl pillow")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG_OUT = os.path.join(ROOT, "assets", "images", "products")
DATA_OUT = os.path.join(ROOT, "data")

# Preferred display order for known photo angles (unknown angles go last, alphabetically)
ANGLE_ORDER = ["front", "front right", "front left", "rear left", "rear right", "rear",
               "left profile", "right profile", "stacked profile", "open", "lifestyle"]

# Friendly labels + short descriptions for the Type codes used in the Excel.
# New Type codes found in the Excel are added automatically with a neutral description.
TYPE_INFO_DEFAULTS = {
    "HP 15": ("HP Laptop 15", "Everyday 15.6-inch laptops for home, school and small-office productivity."),
    "OB3": ("OmniBook 3", "Designed for everyday productivity with a balance of performance, portability, and value."),
    "OB5": ("OmniBook 5", "Thin-and-light 14-inch laptops for mainstream productivity and on-the-go work."),
    "OB5 FLIP": ("OmniBook 5 Flip", "Convertible 2-in-1 laptops that switch between laptop and tablet modes for work, study and creative tasks."),
    "OBX": ("OmniBook X", "Premium OmniBook X Flip convertible AI PCs for professionals who want performance in a versatile 2-in-1 design."),
}


def clean(v):
    if v is None:
        return None
    if isinstance(v, str):
        v = re.sub(r"\s+", " ", v).strip()
        return v or None
    return v


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def parse_specs(spec):
    """Split the pipe-delimited Specs string into labelled fields using keyword detection.
    Nothing is invented: a field is only set if a matching segment exists."""
    out = {}
    if not spec:
        return out
    parts = [p.strip() for p in spec.split("|") if p.strip()]
    rest = []
    for i, p in enumerate(parts):
        pl = p.lower()
        if i == 0:
            out["series"] = p
            m = re.search(r"(clamshell|x360|detachable)", pl)
            if m:
                out["formFactor"] = {"clamshell": "Clamshell", "x360": "x360 Convertible (2-in-1)",
                                     "detachable": "Detachable"}[m.group(1)]
            continue
        if "cpu" not in out and re.search(r"\b(ryzen|core|ultra|celeron|pentium|snapdragon|athlon|intel|amd)\b", pl) \
                and "graphics" not in pl:
            out["cpu"] = p
        elif "ram" not in out and re.search(r"\d+\s?gb\b.*(ddr|lpddr)", pl):
            out["ram"] = p
        elif "storage" not in out and re.search(r"\d+\s?(gb|tb)\b.*(pcie|ssd|emmc|nvme|hdd)", pl):
            out["storage"] = p
        elif "graphics" not in out and "graphics" in pl:
            out["graphics"] = p
        elif "display" not in out and re.search(r"\d{2}\.\d", pl) and re.search(r"(fhd|2k|3k|4k|hd|nits|oled|ips)", pl):
            out["display"] = p
        elif "os" not in out and re.search(r"\b(ost|w11|win|windows|dos|chrome)", pl):
            out["os"] = p
        elif "colorCamera" not in out and " - " in p:
            color, cam = p.split(" - ", 1)
            out["color"] = color.strip()
            out["camera"] = cam.strip()
            out["colorCamera"] = p
        elif "adapter" not in out and re.search(r"\bwatt\b|\bw\b adapter", pl):
            out["adapter"] = p
        elif "warranty" not in out and (re.fullmatch(r"\d\s*-\s*\d\s*-\s*\d", p) or pl.startswith("warr")):
            out["warranty"] = p
        elif "carePack" not in out and re.search(r"(care|svc|bundle|onsite)", pl):
            out["carePack"] = p
        else:
            rest.append(p)
    out.pop("colorCamera", None)
    if rest:
        out["other"] = rest
    return out


def cpu_brand(cpu):
    if not cpu:
        return None
    c = cpu.lower()
    if re.search(r"\b(ryzen|athlon|amd)\b", c):
        return "AMD"
    if re.search(r"\b(core|ultra|celeron|pentium|intel|xeon)\b", c):
        return "Intel"
    if "snapdragon" in c:
        return "Qualcomm"
    return None


def display_short(d):
    if not d:
        return None
    touch = d.lower().startswith("touch")
    d2 = re.sub(r"^touch/", "", d, flags=re.I)
    size = re.search(r"(\d{2}\.\d)", d2)
    res = re.search(r"\b(FHD|2K|3K|4K|2\.8K|HD\+?)\b(?:\s*\((\d+x\d+)\))?", d2)
    bits = []
    if size:
        bits.append(size.group(1) + '"')
    if res:
        bits.append(res.group(1) + (f" ({res.group(2)})" if res.group(2) else ""))
    if re.search(r"\boled\b", d2, re.I):
        bits.append("OLED")
    if touch:
        bits.append("Touch")
    return " ".join(bits) if bits else d


def sku_from_model(model):
    m = re.search(r"(\d{2}-[A-Za-z]{2}\d{4}[A-Za-z]{2})\s*$", model)
    return m.group(1) if m else model.split()[-1]


def read_excel(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb.worksheets[0]
    header_row, headers = None, None
    for r in ws.iter_rows(min_row=1, max_row=20):
        vals = [clean(c.value) for c in r]
        low = [str(v).lower() if v is not None else "" for v in vals]
        if "model" in low and "srp" in low:
            header_row = r[0].row
            headers = vals
            break
    if not headers:
        sys.exit("Could not find a header row containing 'Model' and 'SRP'.")
    rows = []
    for r in ws.iter_rows(min_row=header_row + 1, values_only=True):
        rec = {}
        for h, v in zip(headers, r):
            if h is None:
                continue
            rec[str(h)] = clean(v)
        if rec.get("Model"):
            rows.append(rec)
    return headers, rows


def angle_key(a):
    a = a.lower()
    return (ANGLE_ORDER.index(a) if a in ANGLE_ORDER else len(ANGLE_ORDER), a)


def build_images(models, img_dir, max_px=1200, thumb_px=360):
    """Return {model: [ {angle, src, thumb}, ... ]} using exact model-name prefix matching."""
    from PIL import Image
    os.makedirs(IMG_OUT, exist_ok=True)
    result = {m: [] for m in models}
    unmatched = []
    files = sorted(f for f in os.listdir(img_dir) if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp")))
    # longest model names first so "... 14-kb0100TU" can never swallow a longer name
    ordered = sorted(models, key=len, reverse=True)
    cache = {}  # identical photos shared by several models are only encoded once
    for f in files:
        stem = os.path.splitext(f)[0]
        owner = next((m for m in ordered if stem.startswith(m + " - ")), None)
        if not owner:
            unmatched.append(f)
            continue
        angle = stem[len(owner) + 3:].strip()
        sku = sku_from_model(owner)
        base = f"{slug(sku)}-{slug(angle)}"
        src_path = os.path.join(img_dir, f)
        out_main = os.path.join(IMG_OUT, base + ".webp")
        out_thumb = os.path.join(IMG_OUT, base + "-thumb.webp")
        with open(src_path, "rb") as fh:
            h = hashlib.md5(fh.read()).hexdigest()
        if h in cache:
            import shutil
            prev_main, prev_thumb, w, hh = cache[h]
            shutil.copyfile(prev_main, out_main)
            shutil.copyfile(prev_thumb, out_thumb)
            result[owner].append({"angle": angle, "src": f"assets/images/products/{base}.webp",
                                  "thumb": f"assets/images/products/{base}-thumb.webp",
                                  "width": w, "height": hh, "sourceFile": f})
            continue
        with Image.open(src_path) as im:
            im = im.convert("RGBA")
            bbox = im.getbbox()  # trim transparent margins
            if bbox:
                im = im.crop(bbox)
            big = im.copy()
            big.thumbnail((max_px, max_px), Image.LANCZOS)
            big.save(out_main, "WEBP", quality=82, method=4)
            small = im.copy()
            small.thumbnail((thumb_px, thumb_px), Image.LANCZOS)
            small.save(out_thumb, "WEBP", quality=80, method=4)
            w, hgt = big.size
        cache[h] = (out_main, out_thumb, w, hgt)
        result[owner].append({
            "angle": angle,
            "src": f"assets/images/products/{base}.webp",
            "thumb": f"assets/images/products/{base}-thumb.webp",
            "width": w, "height": hgt,
            "sourceFile": f,
        })
    for m in result:
        result[m].sort(key=lambda x: angle_key(x["angle"]))
    return result, unmatched


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--excel", default=os.path.join(ROOT, "source", "Current Pricelist - HPNB.xlsx"))
    ap.add_argument("--images", default=None, help="Folder of product photos named '<Model> - <Angle>.png'")
    args = ap.parse_args()

    headers, rows = read_excel(args.excel)
    print(f"Read {len(rows)} rows from {os.path.basename(args.excel)}; columns: {[h for h in headers if h]}")

    # de-duplicate by exact model (keep first occurrence, report the rest)
    seen, products, dups = set(), [], []
    for r in rows:
        if r["Model"] in seen:
            dups.append(r["Model"])
            continue
        seen.add(r["Model"])
        products.append(r)
    if dups:
        print("WARNING duplicate models skipped:", dups)

    images = {}
    unmatched = []
    if args.images:
        images, unmatched = build_images([p["Model"] for p in products], args.images)
    else:
        # keep previously generated image list if present
        prev = os.path.join(DATA_OUT, "products.json")
        if os.path.exists(prev):
            with open(prev, encoding="utf-8") as fh:
                for p in json.load(fh).get("products", []):
                    images[p["model"]] = p.get("images", [])

    # type info (keep any edits made by hand in data/types.json)
    types_path = os.path.join(DATA_OUT, "types.json")
    type_info = {}
    if os.path.exists(types_path):
        with open(types_path, encoding="utf-8") as fh:
            type_info = {t["code"]: t for t in json.load(fh)}

    known_cols = {"Platform", "Type", "Model", "Specs", "SRP", "DP", "Qty"}
    out, type_order = [], []
    for i, r in enumerate(products):
        spec = parse_specs(r.get("Specs"))
        norm = lambda x: re.sub(r"[^a-z0-9]", "", str(x).lower())
        if spec.get("other") and r.get("Platform"):
            # the platform codename repeated inside Specs is already shown from the Platform column
            spec["other"] = [o for o in spec["other"] if not (norm(o).startswith(norm(r["Platform"])) or norm(r["Platform"]).startswith(norm(o)))] or None
        t = r.get("Type") or "Other"
        if t not in type_order:
            type_order.append(t)
        srp, dp = r.get("SRP"), r.get("DP")
        p = {
            "id": slug(sku_from_model(r["Model"])),
            "model": r["Model"],
            "sku": sku_from_model(r["Model"]),
            "type": t,
            "platform": r.get("Platform"),
            "srp": srp if isinstance(srp, (int, float)) else None,
            "dp": dp if isinstance(dp, (int, float)) else None,
            "cpu": spec.get("cpu"),
            "cpuBrand": cpu_brand(spec.get("cpu")),
            "ram": spec.get("ram"),
            "storage": spec.get("storage"),
            "graphics": spec.get("graphics"),
            "display": spec.get("display"),
            "displayShort": display_short(spec.get("display")),
            "os": spec.get("os"),
            "color": spec.get("color"),
            "camera": spec.get("camera"),
            "formFactor": spec.get("formFactor"),
            "series": spec.get("series"),
            "adapter": spec.get("adapter"),
            "warranty": spec.get("warranty"),
            "carePack": spec.get("carePack"),
            "otherSpecs": spec.get("other"),
            "specsRaw": r.get("Specs"),
            "images": images.get(r["Model"], []),
            "row": i + 1,
        }
        # extra, unknown columns are carried through (never invented)
        extra = {k: v for k, v in r.items() if k not in known_cols and v is not None}
        if extra:
            p["extra"] = extra
        out.append({k: v for k, v in p.items() if v not in (None, [], "")})

    types = []
    for code in type_order:
        prev = type_info.get(code)
        if prev:
            types.append(prev)
        else:
            label, desc = TYPE_INFO_DEFAULTS.get(code, (code, f"HP {code} models currently on the pricelist."))
            types.append({"code": code, "label": label, "description": desc})

    os.makedirs(DATA_OUT, exist_ok=True)
    with open(args.excel, "rb") as fh:
        digest = hashlib.sha1(fh.read()).hexdigest()[:10]
    payload = {
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "sourceFile": os.path.basename(args.excel),
        "sourceHash": digest,
        "currency": "PHP",
        "count": len(out),
        "products": out,
    }
    with open(os.path.join(DATA_OUT, "products.json"), "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
    with open(types_path, "w", encoding="utf-8") as fh:
        json.dump(types, fh, ensure_ascii=False, indent=2)

    no_img = [p["model"] for p in out if not p.get("images")]
    print(f"Wrote {len(out)} products, {len(types)} types.")
    if no_img:
        print("Products without images:", no_img)
    if unmatched:
        print("Image files NOT matched to any model (skipped):", unmatched)


if __name__ == "__main__":
    main()
