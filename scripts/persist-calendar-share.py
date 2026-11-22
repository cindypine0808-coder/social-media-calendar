#!/usr/bin/env python3
"""Keep the public calendar date overlay in GitHub in sync with the live share store."""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OVERRIDES = ROOT / "overrides.json"
CONFIG = ROOT / "share-config.json"
SHARE_JS = ROOT / "share.js"
UA = "ssf-calendar-persist/1.0"


def request(url: str, method: str = "GET", payload: dict | None = None) -> tuple[int, str]:
    data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode()
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "User-Agent": UA,
            "Accept": "application/json, text/html;q=0.8",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as res:
        return res.status, res.read().decode("utf-8", "replace")


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text())
    except Exception:
        return default


def save_json(path: Path, obj) -> None:
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n")


def save_share_js(obj) -> None:
    SHARE_JS.write_text(
        "window.CALENDAR_SHARED_OVERRIDES = "
        + json.dumps(obj, ensure_ascii=False, indent=2)
        + ";\n"
    )


def as_record(raw) -> dict:
    if not isinstance(raw, dict):
        return {"updatedAt": "", "dates": {}}
    dates = raw.get("dates")
    if not isinstance(dates, dict):
        dates = {
            key: value
            for key, value in raw.items()
            if key not in {"_id", "updatedAt", "dates"}
        }
    return {"updatedAt": str(raw.get("updatedAt") or ""), "dates": dates}


def newer(left: dict, right: dict) -> dict:
    return left if (left.get("updatedAt") or "") >= (right.get("updatedAt") or "") else right


def allocate_endpoint() -> str:
    _, html = request("https://crudcrud.com/")
    keys = re.findall(r"https://crudcrud.com/api/([a-f0-9]{32})", html)
    if not keys:
        raise RuntimeError("Could not allocate a live share endpoint")
    return f"https://crudcrud.com/api/{keys[0]}/calendar"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def main() -> None:
    config = load_json(CONFIG, {})
    file_record = as_record(load_json(OVERRIDES, {}))
    live_record = {"updatedAt": "", "dates": {}}
    live_ok = False
    endpoint = str(config.get("endpoint") or "")
    item_id = str(config.get("itemId") or "")

    if endpoint and item_id:
        try:
            _, body = request(f"{endpoint}/{item_id}")
            live_record = as_record(json.loads(body))
            live_ok = True
        except Exception as error:
            print(f"live fetch failed: {error}")

    chosen = newer(live_record, file_record) if live_ok else file_record
    if not chosen.get("updatedAt"):
        chosen["updatedAt"] = now_iso() if chosen.get("dates") else ""

    if live_ok and (file_record.get("updatedAt") or "") > (live_record.get("updatedAt") or ""):
        request(
            f"{endpoint}/{item_id}",
            method="PUT",
            payload={"updatedAt": file_record["updatedAt"], "dates": file_record.get("dates") or {}},
        )
        print("updated live share from overrides.json")

    public = {"updatedAt": chosen.get("updatedAt") or "", "dates": chosen.get("dates") or {}}
    save_json(OVERRIDES, public)
    save_share_js(public)
    print(f"stored {len(chosen.get('dates') or {})} date overrides")


if __name__ == "__main__":
    try:
        main()
    except urllib.error.URLError as error:
        raise SystemExit(f"persist failed: {error}") from error
