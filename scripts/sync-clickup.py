#!/usr/bin/env python3
import json
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

TEAM = "25623340"
API = f"https://frontdoor-prod-ap-southeast-1-1.clickup.com/task-v3/experience/{TEAM}"
YEAR = 2026
HKT = timezone(timedelta(hours=8))
ROOT = Path(__file__).resolve().parent.parent

SOURCES = [
    {
        "id": "01",
        "name": "What's SSF",
        "fullName": "01 - What's SSF Social Media Campaign",
        "taskId": "z94x8e0nh2",
        "token": "KELEM2HV2WFDWMA",
        "minReel": 5,
    },
    {
        "id": "02",
        "name": "NSCA Promotion",
        "fullName": "02 - NSCA Promotion Campaign (Nov)",
        "taskId": "z94x8e22v3",
        "token": "EY1ML8HT56DRLRM",
        "minReel": 1,
    },
]


def fetch_json(url):
    request = Request(url, headers={"User-Agent": "ssf-calendar-sync"})
    with urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def share_url(task_id, token):
    return f"https://sharing.clickup.com/{TEAM}/t/h/{task_id}/{token}"


def to_iso(year, month, day):
    return f"{int(year):04d}-{int(month):02d}-{int(day):02d}"


def due_to_iso(ms):
    if not ms:
        return ""
    return datetime.fromtimestamp(int(ms) / 1000, tz=HKT).strftime("%Y-%m-%d")


def parse_reel(name):
    match = re.match(r"^R(\d+)\s*[:：]\s*(.+)$", str(name or ""), re.I)
    if not match:
        return None
    return {"number": int(match.group(1)), "rawTitle": match.group(2).strip()}


def display_title(raw):
    wrapped = re.match(r"^《([^》]+)》(.*)$", raw)
    if wrapped:
        extra = wrapped.group(2).strip()
        return f"{wrapped.group(1)} · {extra}" if extra else wrapped.group(1)
    return raw.strip()


def parse_labeled_date(text, label):
    match = re.search(
        rf"{label}[^\d]{{0,40}}(\d{{4}})\s*年\s*(\d{{1,2}})\s*月\s*(\d{{1,2}})\s*日",
        text or "",
        re.I,
    )
    if not match:
        return ""
    return to_iso(*match.groups())


def parse_remarks_shooting(remarks):
    match = re.search(
        r"shooting\s+on\s+(\d{1,2})\s*/\s*(\d{1,2})(?:\s*/\s*(\d{2,4}))?",
        remarks or "",
        re.I,
    )
    if not match:
        return ""
    day, month, year = match.group(1), match.group(2), match.group(3)
    if year:
        year = 2000 + int(year) if len(year) == 2 else int(year)
    else:
        year = YEAR
    return to_iso(year, month, day)


def line_value(text, label):
    match = re.search(rf"{label}\s*[:：]\s*(.+)", text or "", re.I)
    return match.group(1).strip() if match else ""


def remarks_value(fields):
    for field in fields or []:
        value = field.get("value")
        if value:
            return str(value)
    return ""


def build_post(task, source):
    reel = parse_reel(task.get("name"))
    if not reel or reel["number"] < source["minReel"]:
        return None
    text = task.get("text_content") or ""
    remarks = remarks_value(task.get("fields"))
    shooting_from_text = parse_labeled_date(text, "拍攝日")
    shooting = shooting_from_text or parse_remarks_shooting(remarks)
    submission_from_text = parse_labeled_date(text, "交片日")
    submission = submission_from_text or due_to_iso(task.get("time_mgmt", {}).get("due_date"))
    publish = parse_labeled_date(text, "發佈日")
    notes = []
    if not text.strip():
        notes.append("Description 空白。")
    if not shooting_from_text and shooting:
        notes.append(f"拍攝日來自 Remarks：{remarks}")
    if not submission_from_text and submission:
        notes.append("交片日來自 Due date。")
    ad = re.search(r"落廣告[^\n]*", text)
    if ad:
        notes.append(ad.group(0).strip())
    return {
        "id": task["id"],
        "campaign": source["id"],
        "campaignName": source["name"],
        "number": reel["number"],
        "title": display_title(reel["rawTitle"]),
        "status": (task.get("status") or {}).get("status") or "",
        "purpose": line_value(text, "目的") or line_value(text, "主要目的"),
        "hook": line_value(text, "Hook"),
        "shooting": shooting,
        "submission": submission,
        "publish": publish,
        "note": " ".join(notes),
        "url": share_url(task["id"], source["token"]),
    }


def fetch_task(task_id, token):
    query = urlencode(
        [("fields[]", "core"), ("fields[]", "custom_fields"), ("token", token)]
    )
    data = fetch_json(f"{API}/publicTasks/{task_id}?{query}")
    return data.get("task") or data


def fetch_campaign_posts(source):
    rows = fetch_json(
        f"{API}/publicTasks/{source['taskId']}/subtasks?include_archived=true&fields=custom_type&token={source['token']}"
    )
    posts = []
    for row in rows:
        summary = row.get("task") or row
        if not parse_reel(summary.get("name")):
            continue
        task = fetch_task(summary["id"], source["token"])
        post = build_post(task, source)
        if post:
            posts.append(post)
    posts.sort(key=lambda item: item["number"])
    return posts


def fetch_plan():
    posts = []
    for source in SOURCES:
        posts.extend(fetch_campaign_posts(source))
    dates = sorted(
        date
        for post in posts
        for date in (post["shooting"], post["submission"], post["publish"])
        if date
    )
    now = datetime.now(HKT).strftime("%Y/%m/%d %H:%M")
    return {
        "title": "Campaign 01 + 02",
        "subtitle": "What's SSF + NSCA Promotion",
        "source": f"ClickUp auto-sync · {now}",
        "timezone": "Asia/Hong_Kong",
        "dateRange": f"{dates[0]} – {dates[-1]}" if dates else "",
        "note": "Campaign 01 只顯示 R5 起。日期以 ClickUp description 為主，Remarks / Due date 作後備。",
        "campaigns": [
            {
                "id": source["id"],
                "name": source["name"],
                "fullName": source["fullName"],
                "url": share_url(source["taskId"], source["token"]),
            }
            for source in SOURCES
        ],
        "posts": posts,
    }


def main():
    plan = fetch_plan()
    (ROOT / "data.js").write_text(
        "const PLAN = " + json.dumps(plan, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(plan['posts'])} posts from ClickUp")
    for post in plan["posts"]:
        print(
            f"{post['campaign']} R{post['number']}  shoot={post['shooting'] or '-'}  "
            f"sub={post['submission'] or '-'}  pub={post['publish'] or '-'}"
        )


if __name__ == "__main__":
    main()
