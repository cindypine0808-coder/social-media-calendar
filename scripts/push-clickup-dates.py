#!/usr/bin/env python3
"""Push shooting / submission / publish dates from data.js into ClickUp descriptions."""
import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
import importlib.util

spec = importlib.util.spec_from_file_location("sync_clickup", ROOT / "scripts" / "sync-clickup.py")
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)

CLICKUP_API = "https://api.clickup.com/api/v2"
TEAM = sync.TEAM
YEAR = "\u5e74"
MONTH = "\u6708"
DAY = "\u65e5"
AND = "\u53ca"
SHOOT = "\u62cd\u651d\u65e5"
SUBMIT = "\u4ea4\u7247\u65e5"
PUBLISH = "\u767c\u4f48\u65e5"
COLON = "\uff1a"


def load_plan(path):
    text = Path(path).read_text(encoding="utf-8").strip()
    text = re.sub(r"^const PLAN = ", "", text)
    text = re.sub(r";\s*$", "", text)
    return json.loads(text)


def zh_date(iso):
    year, month, day = iso.split("-")
    return f"{int(year)}{YEAR}{int(month)}{MONTH}{int(day)}{DAY}"


def zh_dates(values):
    dates = [item for item in values if item]
    return AND.join(zh_date(item) for item in dates)


def date_values(post, field):
    if field == "shooting":
        return post.get("shootingDates") or ([post.get("shooting")] if post.get("shooting") else [])
    value = post.get(field)
    return [value] if value else []


def parsed_dates(text, label):
    dates = sync.parse_labeled_dates(text, label)
    if dates:
        return dates
    single = sync.parse_labeled_date(text, label)
    return [single] if single else []


def patch_description(text, post):
    updated = text or ""
    replacements = [
        (SHOOT, date_values(post, "shooting")),
        (SUBMIT, date_values(post, "submission")),
        (PUBLISH, date_values(post, "publish")),
    ]
    for label, desired in replacements:
        desired = [item for item in desired if item]
        if not desired or desired == parsed_dates(updated, label):
            continue
        value = zh_dates(desired)
        pattern = rf"(^|\n)({re.escape(label)}[^\n]*[:{COLON}]\s*)([^\n]*)"
        if re.search(pattern, updated):
            updated = re.sub(pattern, rf"\1\2{value}", updated)
        else:
            updated = updated.rstrip() + f"\n{label}{COLON}{value}\n"
    return updated


def campaign_token(campaign):
    for source in sync.SOURCES:
        if source["id"] == campaign:
            return source["token"]
    return ""


def api_token():
    return (
        os.environ.get("CLICKUP_TOKEN")
        or os.environ.get("CLICKUP_API_TOKEN")
        or os.environ.get("CLICKUP_API_KEY")
        or ""
    ).strip()


def put_clickup(task_id, markdown, token):
    query = urlencode({"custom_task_ids": "true", "team_id": TEAM})
    url = f"{CLICKUP_API}/task/{task_id}?{query}"
    body = json.dumps({"markdown_content": markdown}).encode("utf-8")
    request = Request(
        url,
        data=body,
        method="PUT",
        headers={
            "Authorization": token,
            "Content-Type": "application/json",
            "User-Agent": "ssf-calendar-sync",
        },
    )
    with urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def main():
    args = [item for item in sys.argv[1:] if item != "--apply"]
    apply = "--apply" in sys.argv
    path = Path(args[0] if args else ROOT / "data.js")
    plan = load_plan(path)
    token = api_token()
    changed = 0
    for post in plan["posts"]:
        share = campaign_token(post["campaign"])
        task = sync.fetch_task(post["id"], share)
        current = task.get("text_content") or ""
        updated = patch_description(current, post)
        if updated == current:
            continue
        ep = f" EP{post['episode']}" if post.get("episode") else ""
        print(f"{post['campaign']} R{post['number']}{ep}  {post['title']}")
        for line in updated.splitlines():
            if SHOOT in line or SUBMIT in line or PUBLISH in line:
                print(f"  {line}")
        changed += 1
        if apply:
            if not token:
                raise SystemExit(
                    "Set CLICKUP_TOKEN to a ClickUp personal API token, then rerun with --apply."
                )
            put_clickup(post["id"], updated, token)
            print("  -> updated")
    print(f"{'Wrote' if apply else 'Would update'} {changed} ClickUp descriptions")


if __name__ == "__main__":
    main()
