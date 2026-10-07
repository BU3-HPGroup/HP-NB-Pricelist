"""Tracks what changed between pricelist updates (new models, price changes, status changes).

Every time build_data.py rebuilds data/products.json or data/ltb.json it compares the new list with
the previous one and appends dated events to data/changes.json. The website shows "New",
"Price drop", "Price up" and status badges for events newer than WINDOW_DAYS.
"""
import json, os
from datetime import date, timedelta

WINDOW_DAYS = 14      # how long a badge stays on the website
KEEP_DAYS = 120       # how long events are kept in data/changes.json

TRACK = {
    "main": [("srp", "SRP"), ("dp", "DP"), ("promoDp", "Promo DP"), ("status", "Status")],
    "ltb": [("sale", "Sale price"), ("dp", "DP"), ("srp", "SRP"), ("availability", "Availability")],
}


def key_of(p):
    return str(p.get("partNo") or p.get("model") or p.get("id")).upper()


def _num(v):
    return round(float(v)) if isinstance(v, (int, float)) else v


def update(path, dataset, prev_products, new_products, today=None):
    """Compare two product lists and append events for `dataset` ("main" or "ltb")."""
    today = today or date.today().isoformat()
    data = {"windowDays": WINDOW_DAYS}
    if os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as fh:
                data = json.load(fh)
        except (OSError, ValueError):
            pass
    data["windowDays"] = WINDOW_DAYS
    ds = data.setdefault(dataset, {"events": []})
    events = ds.setdefault("events", [])

    if prev_products is not None:
        prev = {key_of(p): p for p in prev_products}
        cur = {key_of(p): p for p in new_products}
        added = []
        for k, p in cur.items():
            if k not in prev:
                added.append({"date": today, "key": k, "model": p.get("model"), "kind": "new"})
                continue
            q = prev[k]
            for field, label in TRACK[dataset]:
                a, b = _num(q.get(field)), _num(p.get(field))
                if a == b:
                    continue
                ev = {"date": today, "key": k, "model": p.get("model"), "kind": "price" if field != "status" and field != "availability" else "status",
                      "field": field, "label": label, "from": a, "to": b}
                added.append(ev)
        for k, q in prev.items():
            if k not in cur:
                added.append({"date": today, "key": k, "model": q.get("model"), "kind": "removed"})
        # same-day rebuilds: replace today's events for a key/field instead of stacking duplicates
        sig = lambda e: (e["date"], e["key"], e["kind"], e.get("field"))
        new_sigs = {sig(e) for e in added}
        events[:] = [e for e in events if sig(e) not in new_sigs] + added

    cutoff = (date.fromisoformat(today) - timedelta(days=KEEP_DAYS)).isoformat()
    events[:] = [e for e in events if e["date"] >= cutoff]
    events.sort(key=lambda e: (e["date"], e["key"]))
    ds["updatedAt"] = today
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
    return [e for e in events if e["date"] == today]


def load_previous(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh).get("products")
    except (OSError, ValueError):
        return None
