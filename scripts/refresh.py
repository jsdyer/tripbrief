#!/usr/bin/env python3
"""Validate the full official advisory index before replacing a public capture."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import tempfile
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
SOURCE = "https://data.international.gc.ca/travel-voyage/index-alpha-eng.json"
CODE = re.compile(r"[A-Z]{2}(?:-[A-Z0-9]{1,4})?")
SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")


def stamp(value):
    if not isinstance(value, str):
        raise ValueError("Expected timestamp")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("Timestamp needs an explicit timezone")
    return parsed.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def text(value, maximum=4000):
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        raise ValueError("Missing or oversized source text")
    return value.strip()


def normalize(document, minimum=1):
    rows = document.get("data")
    if not isinstance(rows, dict) or len(rows) < minimum:
        raise ValueError("Incomplete advisory index")
    generated = document["metadata"]["generated"]["timestamp"]
    if not isinstance(generated, int):
        raise ValueError("Invalid source generation time")
    source_generated = datetime.fromtimestamp(generated, timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    countries = []
    for code, row in rows.items():
        if not CODE.fullmatch(code) or row.get("country-iso") != code:
            raise ValueError("Invalid or mismatched destination code")
        if row.get("has-content") != 1:
            raise ValueError("Unexpected destination without official content")
        level = row.get("advisory-state")
        if type(level) is not int or level not in range(4):
            raise ValueError("Unknown advisory level")
        regional = row.get("has-regional-advisory")
        if regional not in (0, 1):
            raise ValueError("Invalid regional advisory flag")
        en, fr = row["eng"], row["fra"]
        slug = en["url-slug"]
        if not SLUG.fullmatch(slug):
            raise ValueError("Unexpected official URL slug")
        countries.append({
            "code": code, "name": text(en["name"], 150), "name_fr": text(fr["name"], 150),
            "level": level, "regional": bool(regional), "advisory": text(en["advisory-text"], 300),
            "updated_at": stamp(row["date-published"]["asp"]),
            "change_type": text(row["recent-updates-type"], 150),
            "update": text(en["recent-updates"] or "No change summary provided in the official index."),
            "url": "https://travel.gc.ca/destinations/" + slug,
        })
    return source_generated, sorted(countries, key=lambda c: c["name"].casefold())


def signature(country):
    return {k: country[k] for k in ("level", "regional", "advisory", "updated_at", "update", "change_type")}


def changes_between(before, after, checked_at):
    old = {c["code"]: c for c in before}
    new = {c["code"]: c for c in after}
    changes = []
    for code in sorted(old.keys() | new.keys()):
        a, b = old.get(code), new.get(code)
        if a is None or b is None or signature(a) != signature(b):
            changes.append({"code": code, "name": (b or a)["name"], "detected_at": checked_at,
                            "kind": "added" if a is None else "removed" if b is None else "updated",
                            "before": signature(a) if a else None, "after": signature(b) if b else None})
    return changes


def validate_public(data):
    if data.get("schema") != 1:
        raise ValueError("Unsupported public capture")
    stamp(data["checked_at"])
    stamp(data["source_generated_at"])
    countries = data.get("countries")
    if not isinstance(countries, list) or not countries or len({c["code"] for c in countries}) != len(countries):
        raise ValueError("Empty or duplicate public destinations")
    for c in countries:
        if not CODE.fullmatch(c["code"]) or type(c["level"]) is not int or c["level"] not in range(4):
            raise ValueError("Invalid destination")
        if type(c["regional"]) is not bool or not c["url"].startswith("https://travel.gc.ca/destinations/"):
            raise ValueError("Invalid public destination details")
        stamp(c["updated_at"])
        for field in ("name", "advisory", "update"):
            text(c[field])
    return data


def refresh(root=ROOT, fetch=None, now=None):
    config = json.loads((root / "config/source.json").read_text())
    if config.get("url") != SOURCE:
        raise ValueError("Use the reviewed official source URL")
    now = stamp(now or datetime.now(timezone.utc).isoformat())
    if fetch is None:
        request = Request(SOURCE, headers={"User-Agent": "TripBrief/1.0 (+https://coolcode.ca/tripbrief/)", "Accept": "application/json"})
        with urlopen(request, timeout=45) as response:
            raw = response.read(2_000_001)
        if len(raw) > 2_000_000:
            raise ValueError("Advisory index exceeds 2 MB")
        document = json.loads(raw)
    else:
        document = fetch(SOURCE)
    generated, countries = normalize(document, config["minimum_records"])
    if generated > now or any(c["updated_at"] > now for c in countries):
        raise ValueError("Source reports a future timestamp")
    path = root / "web/data/index.json"
    previous = json.loads(path.read_text()) if path.exists() else None
    if previous and len(countries) < len(previous["countries"]) * .95:
        raise ValueError("Unexpected destination loss; retain prior capture and review")
    recent = previous.get("changes", []) if previous else []
    if previous:
        recent = changes_between(previous["countries"], countries, now) + recent
    capture = {"schema": 1, "checked_at": now, "source_generated_at": generated,
               "source_url": SOURCE, "baseline_at": previous["baseline_at"] if previous else now,
               "countries": countries, "changes": recent[:config["history_limit"]]}
    validate_public(capture)
    payload = (json.dumps(capture, ensure_ascii=False, indent=2) + "\n").encode()
    status = {"checked_at": now, "source_generated_at": generated, "count": len(countries),
              "change_count": len(recent[:config["history_limit"]]), "sha256": hashlib.sha256(payload).hexdigest()}
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=path.parent) as folder:
        staged = Path(folder)
        (staged / "index.json").write_bytes(payload)
        (staged / "status.json").write_text(json.dumps(status, indent=2) + "\n")
        (staged / "index.json").replace(path)
        (staged / "status.json").replace(path.parent / "status.json")
    print(f"Checked {len(countries)} official destinations at {now}")


if __name__ == "__main__":
    refresh()
