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
    m = re.search(r"(\d{2}-[A-Za-z]{2}\d{4}[A-Za-z]{2})\s*$", model) or \
        re.search(r"\b(\d{2}-[A-Za-z]{1,2}\d{4}[A-Za-z]{2})\b", model)
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


def build_images(models, img_dir, max_px=1200, thumb_px=360, out_dir=None, url_prefix="assets/images/products"):
    """Return {model: [ {angle, src, thumb}, ... ]} using exact model-name prefix matching."""
    from PIL import Image
    out_dir = out_dir or IMG_OUT
    os.makedirs(out_dir, exist_ok=True)
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
        out_main = os.path.join(out_dir, base + ".webp")
        out_thumb = os.path.join(out_dir, base + "-thumb.webp")
        with open(src_path, "rb") as fh:
            h = hashlib.md5(fh.read()).hexdigest()
        if h in cache:
            import shutil
            prev_main, prev_thumb, w, hh = cache[h]
            shutil.copyfile(prev_main, out_main)
            shutil.copyfile(prev_thumb, out_thumb)
            result[owner].append({"angle": angle, "src": f"{url_prefix}/{base}.webp",
                                  "thumb": f"{url_prefix}/{base}-thumb.webp",
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
            "src": f"{url_prefix}/{base}.webp",
            "thumb": f"{url_prefix}/{base}-thumb.webp",
            "width": w, "height": hgt,
            "sourceFile": f,
        })
    for m in result:
        result[m].sort(key=lambda x: angle_key(x["angle"]))
    return result, unmatched


# ---------------------------------------------------------------------------
# Last-time-buy (separate Excel)
# ---------------------------------------------------------------------------
def parse_php(v):
    """'PHP 48,310.00' -> 48310 ; numbers pass through ; anything else -> None."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return int(v) if float(v).is_integer() else float(v)
    t = re.sub(r"[^0-9.]", "", str(v))
    if not t:
        return None
    f = float(t)
    return int(f) if f.is_integer() else f


def ltb_cpu_brand(cpu):
    c = (cpu or "").upper()
    if re.search(r"\b(RAI|RYZEN|R[3579]|R[3579]-|AMD)\b", c) or re.match(r"R[3579][ -]", c):
        return "AMD"
    if re.search(r"\b(I[3579]|U[3579]|C[3579]|CORE|ULTRA|INTEL|CELERON|PENTIUM)\b", c) or re.match(r"(I|U|C)[3579]-", c):
        return "Intel"
    if re.search(r"\b(QC|SD|SNAPDRAGON|X1E|X1P|X1)\b", c) or c.startswith("QC-"):
        return "Qualcomm"
    return None


def parse_ltb_specs(spec):
    """Split the short spec string ('RAI 5 330 16GB 512GB 15.6 IPS W11 OPI') into
    processor / memory / storage / the rest. Nothing is rewritten, only split."""
    out = {}
    if not spec:
        return out
    m_ram = re.search(r"\b(\d{1,2}GB)\b((?:\s+(?:D5|D4|DDR5|DDR4|5X|LPDDR5X?|OB))*)", spec)
    if not m_ram:
        out["rest"] = spec
        return out
    cpu = spec[:m_ram.start()].strip()
    out["cpu"] = cpu or None
    out["ram"] = (m_ram.group(1) + m_ram.group(2)).strip()
    after = spec[m_ram.end():]
    m_sto = re.search(r"\b(\d{3,4}GB|\d(?:\.\d)?TB)\b", after)
    if m_sto:
        out["storage"] = m_sto.group(1)
        rest = (after[:m_sto.start()] + " " + after[m_sto.end():]).strip()
    else:
        rest = after.strip()
    rest = re.sub(r"\s+", " ", rest)
    out["rest"] = rest or None
    disp = []
    m_size = re.search(r'\b(1[1-7](?:\.\d)?)(?:"|\b|(?=WUXGA|WQXGA|FHD|OLED))', rest)
    if m_size:
        disp.append(m_size.group(1) + '"')
    for tok in re.findall(r"(?:\b|(?<=\d))(2\.2K|2K|3K|WQXGA|WUXGA|FHD|OLED|IPS|TOUCH|120HZ)\b", rest, re.I):
        disp.append(tok.upper().replace("TOUCH", "Touch").replace("120HZ", "120Hz"))
    if disp:
        out["displayShort"] = " ".join(dict.fromkeys(disp))
    return out


def build_ltb(excel_path, images_dir=None):
    wb = openpyxl.load_workbook(excel_path, data_only=True)
    ws = wb.worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    hi = next(i for i, r in enumerate(rows) if r and any(str(c).strip().lower() == "model" for c in r if c))
    headers = [clean(h) for h in rows[hi]]
    recs = []
    for r in rows[hi + 1:]:
        rec = {str(h): clean(v) for h, v in zip(headers, r) if h}
        if rec.get("Model"):
            recs.append(rec)
    seen, uniq, dups = set(), [], []
    for r in recs:
        if r["Model"] in seen:
            dups.append(r["Model"]); continue
        seen.add(r["Model"]); uniq.append(r)
    if dups:
        print("WARNING duplicate LTB models skipped:", dups)

    images = {}
    if images_dir:
        images, unmatched = build_images([r["Model"] for r in uniq], images_dir,
                                         out_dir=os.path.join(ROOT, "assets", "images", "ltb"),
                                         url_prefix="assets/images/ltb")
        if unmatched:
            print("LTB image files NOT matched (skipped):", unmatched)
    else:
        prev = os.path.join(DATA_OUT, "ltb.json")
        if os.path.exists(prev):
            with open(prev, encoding="utf-8") as fh:
                for p in json.load(fh).get("products", []):
                    images[p["model"]] = p.get("images", [])

    out = []
    for i, r in enumerate(uniq):
        tag = r.get("Tagging") or ""
        seg, _, cat = tag.partition(" - ")
        spec = parse_ltb_specs(r.get("Specs"))
        sku = sku_from_model(r["Model"])
        p = {
            "id": "ltb-" + slug(sku),
            "model": r["Model"],
            "sku": sku,
            "matNo": str(r["Mat No."]) if r.get("Mat No.") is not None else None,
            "tagging": tag or None,
            "segment": seg.strip() if cat else None,
            "type": (cat or tag).strip() or "Other",
            "cpu": spec.get("cpu"),
            "cpuBrand": ltb_cpu_brand(spec.get("cpu")),
            "ram": spec.get("ram"),
            "storage": spec.get("storage"),
            "displayShort": spec.get("displayShort"),
            "otherSpecs": [spec["rest"]] if spec.get("rest") else None,
            "specsRaw": r.get("Specs"),
            "dp": parse_php(r.get("DP")),
            "srp": parse_php(r.get("SRP")),
            "sale": parse_php(r.get("Special Price")),
            "qty": r.get("Qty") if isinstance(r.get("Qty"), (int, float)) else None,
            "priceText": {"dp": r.get("DP"), "srp": r.get("SRP"), "sale": r.get("Special Price")},
            "images": images.get(r["Model"], []),
            "row": i + 1,
        }
        out.append({k: v for k, v in p.items() if v not in (None, [], "")})

    with open(excel_path, "rb") as fh:
        digest = hashlib.sha1(fh.read()).hexdigest()[:10]
    payload = {"generatedAt": datetime.now().isoformat(timespec="seconds"),
               "sourceFile": os.path.basename(excel_path), "sourceHash": digest,
               "currency": "PHP", "count": len(out), "products": out}
    with open(os.path.join(DATA_OUT, "ltb.json"), "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
    no_img = [p["model"] for p in out if not p.get("images")]
    print(f"Wrote {len(out)} last-time-buy products." + (f" Without photos (silhouette shown): {no_img}" if no_img else ""))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--excel", default=os.path.join(ROOT, "source", "Current Pricelist - HPNB.xlsx"))
    ap.add_argument("--images", default=None, help="Folder of product photos named '<Model> - <Angle>.png'")
    ap.add_argument("--ltb-excel", default=os.path.join(ROOT, "source", "Last-time-buy models.xlsx"))
    ap.add_argument("--ltb-images", default=None, help="Folder of Last-time-buy photos named '<Model> - <Angle>.png'")
    ap.add_argument("--only-ltb", action="store_true", help="Only rebuild data/ltb.json")
    args = ap.parse_args()
    if os.path.exists(args.ltb_excel):
        build_ltb(args.ltb_excel, args.ltb_images)
    else:
        print("No Last-time-buy Excel found at", args.ltb_excel, "(skipped)")
    if args.only_ltb:
        return

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
