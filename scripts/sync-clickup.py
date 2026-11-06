#!/usr/bin/env python3
import json
import re
from datetime import date, datetime, timezone, timedelta
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
    {
        "id": "03",
        "name": "Jason IP",
        "fullName": "03 - Jason's IP Social Media Campaign",
        "taskId": "z94x8e36nw",
        "token": "P7Z472HHVVY56R8",
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
    text = str(name or "").strip()
    if re.search(r"photo\s+shooting|script\s+share", text, re.I):
        return None
    if re.search(r"^R[\d,\sR]+shooting\b", text, re.I):
        return None
    colon = re.search(
        r"R(\d+)([a-z])?\s*[:：]\s*(?:Ep(?:isode)?\s*(\d+)\s*[,:：]\s*)?(.+)$",
        text,
        re.I,
    )
    if colon:
        title = colon.group(4).strip()
        if not title or re.search(r"^shooting\b|photo\s+shooting|script\s+share", title, re.I):
            return None
        episode = int(colon.group(3)) if colon.group(3) else None
        if episode is None and colon.group(2):
            episode = ord(colon.group(2).lower()) - ord("a") + 1
        if episode is None:
            trailing = re.search(r"\bEP\s*(\d+)\s*$", title, re.I)
            if trailing:
                episode = int(trailing.group(1))
        return {
            "number": int(colon.group(1)),
            "episode": episode,
            "rawTitle": title,
        }
    lettered = re.search(r"R(\d+)([a-z])\s+(.+)$", text, re.I)
    if lettered:
        title = lettered.group(3).strip()
        if not title or re.search(r"^shooting\b|photo\s+shooting|script\s+share", title, re.I):
            return None
        episode = ord(lettered.group(2).lower()) - ord("a") + 1
        trailing = re.search(r"\bEP\s*(\d+)\s*$", title, re.I)
        if trailing:
            episode = int(trailing.group(1))
        return {
            "number": int(lettered.group(1)),
            "episode": episode,
            "rawTitle": title,
        }
    spaced = re.match(r"^R(\d+)\s+(.+)$", text, re.I)
    if not spaced:
        return None
    title = spaced.group(2).strip()
    if re.search(r"^shooting\b|photo\s+shooting|script\s+share", title, re.I):
        return None
    return {"number": int(spaced.group(1)), "episode": None, "rawTitle": title}


def display_title(raw):
    wrapped = re.match(r"^《([^》]+)》(.*)$", raw)
    if wrapped:
        extra = wrapped.group(2).strip()
        title = f"{wrapped.group(1)} · {extra}" if extra else wrapped.group(1)
    else:
        title = raw.strip()
    stripped = re.sub(r"\s*\bEP\s*\d+\s*$", "", title, flags=re.I).strip()
    return stripped or title


def parse_labeled_dates(text, label):
    match = re.search(rf"{label}[^\n]*", text or "", re.I)
    line = match.group(0) if match else ""
    return [
        to_iso(year, month, day)
        for year, month, day in re.findall(
            r"(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日",
            line,
        )
    ]


def parse_labeled_date(text, label):
    dates = parse_labeled_dates(text, label)
    return dates[0] if dates else ""


def parse_remarks_shooting(remarks):
    text = remarks or ""
    match = re.search(
        r"shooting\s+on\s+(\d{1,2})\s*/\s*(\d{1,2})(?:\s*/\s*(\d{2,4}))?",
        text,
        re.I,
    )
    if not match and re.search(r"影|拍|shoot", text, re.I):
        match = re.search(
            r"(\d{1,2})\s*/\s*(\d{1,2})(?:\s*/\s*(\d{2,4}))?",
            text,
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


def add_years(iso, years=1):
    if not iso:
        return iso
    year, month, day = iso.split("-")
    return f"{int(year) + years}-{month}-{day}"


def is_year_wrap(earlier, later):
    start = date.fromisoformat(earlier)
    end = date.fromisoformat(later)
    return start.month >= 10 and end.month <= 3


def sequence_dates(shooting, submission, publish):
    notes = []
    if shooting and submission and submission < shooting and is_year_wrap(shooting, submission):
        submission = add_years(submission)
        notes.append("交片年已按拍攝日調整為翌年。")
    if submission and publish and publish < submission and is_year_wrap(submission, publish):
        publish = add_years(publish)
        notes.append("發佈年已按交片日調整為翌年。")
    elif shooting and publish and publish < shooting and is_year_wrap(shooting, publish):
        publish = add_years(publish)
        notes.append("發佈年已按拍攝日調整為翌年。")
    return shooting, submission, publish, notes


def build_post(task, source):
    reel = parse_reel(task.get("name"))
    if not reel or reel["number"] < source["minReel"]:
        return None
    text = task.get("text_content") or ""
    remarks = remarks_value(task.get("fields"))
    shooting_dates = parse_labeled_dates(text, "拍攝日")
    shooting_from_text = shooting_dates[0] if shooting_dates else ""
    shooting = shooting_from_text or parse_remarks_shooting(remarks)
    submission_from_text = parse_labeled_date(text, "交片日")
    submission = submission_from_text or due_to_iso(task.get("time_mgmt", {}).get("due_date"))
    publish = parse_labeled_date(text, "發佈日")
    shooting, submission, publish, year_notes = sequence_dates(shooting, submission, publish)
    notes = []
    if not text.strip():
        notes.append("Description 空白。")
    if not shooting_from_text and shooting:
        notes.append(f"拍攝日來自 Remarks：{remarks}")
    if not submission_from_text and submission:
        notes.append("交片日來自 Due date。")
    notes.extend(year_notes)
    ad = re.search(r"落廣告[^\n]*", text)
    if ad:
        notes.append(ad.group(0).strip())
    post = {
        "id": task["id"],
        "campaign": source["id"],
        "campaignName": source["name"],
        "number": reel["number"],
        "episode": reel.get("episode"),
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
    if len(shooting_dates) > 1:
        post["shootingDates"] = shooting_dates
    return post


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
    posts.sort(key=lambda item: (item["number"], item.get("episode") or 0, item["title"]))
    return posts


def all_dates(post):
    dates = [post.get("shooting"), post.get("submission"), post.get("publish")]
    dates.extend(post.get("shootingDates") or [])
    return [item for item in dates if item]


def assign_placeholder_dates(posts, campaign="02", window_start="2026-11-01", window_end="2026-12-31"):
    occupied = {item for post in posts for item in all_dates(post)}
    undated = [
        post
        for post in posts
        if post["campaign"] == campaign and not all_dates(post)
    ]
    if not undated:
        return
    campaign_dates = [
        item
        for post in posts
        if post["campaign"] == campaign
        for item in all_dates(post)
    ]
    start = date.fromisoformat(window_start)
    end = date.fromisoformat(window_end)
    cursor = start
    if campaign_dates:
        last = date.fromisoformat(max(campaign_dates)) + timedelta(days=1)
        if start <= last <= end:
            cursor = last
    for post in undated:
        while cursor <= end and (cursor.weekday() >= 5 or cursor.isoformat() in occupied):
            cursor += timedelta(days=1)
        if cursor > end:
            cursor = start
            while cursor <= end and cursor.isoformat() in occupied:
                cursor += timedelta(days=1)
        if cursor > end:
            break
        iso = cursor.isoformat()
        post["publish"] = iso
        extra = "月曆佔位（ClickUp 未填日子）。"
        post["note"] = f"{post['note']} {extra}".strip() if post.get("note") else extra
        occupied.add(iso)
        cursor += timedelta(days=1)


def next_open_weekday(cursor, end, occupied):
    while cursor <= end and (cursor.weekday() >= 5 or cursor.isoformat() in occupied):
        cursor += timedelta(days=1)
    return cursor


def replace_overdue_todo_shooting(posts, campaign="02", min_number=11):
    today = datetime.now(HKT).date()
    occupied = {item for post in posts for item in all_dates(post)}
    groups = {}
    for post in posts:
        if post["campaign"] != campaign or (post.get("number") or 0) < min_number:
            continue
        if (post.get("status") or "").lower() in {"complete", "closed", "done"}:
            continue
        shoot = post.get("shooting")
        if not shoot:
            continue
        shoot_day = date.fromisoformat(shoot)
        if shoot_day >= today:
            continue
        groups.setdefault(shoot, []).append(post)
    cursor = today + timedelta(days=1)
    end = date(2026, 12, 31)
    for old, items in groups.items():
        cursor = next_open_weekday(cursor, end, occupied)
        if cursor > end:
            break
        iso = cursor.isoformat()
        extra = "拍攝日已改為月曆佔位（ClickUp 拍攝日已過）。"
        for post in items:
            post["shooting"] = iso
            if post.get("shootingDates"):
                post["shootingDates"] = [
                    iso if item == old else item for item in post["shootingDates"]
                ]
            post["note"] = f"{post['note']} {extra}".strip() if post.get("note") else extra
        occupied.add(iso)
        cursor += timedelta(days=1)


def fetch_plan():
    posts = []
    for source in SOURCES:
        posts.extend(fetch_campaign_posts(source))
    assign_placeholder_dates(posts)
    replace_overdue_todo_shooting(posts)
    dates = sorted(
        item
        for post in posts
        for item in all_dates(post)
    )
    now = datetime.now(HKT).strftime("%Y/%m/%d %H:%M")
    return {
        "title": "Marketing Campaign",
        "subtitle": "What's SSF + NSCA Promotion + Jason IP",
        "source": f"ClickUp auto-sync · {now}",
        "timezone": "Asia/Hong_Kong",
        "dateRange": f"{dates[0]} – {dates[-1]}" if dates else "",
        "note": "Campaign 01 只顯示 R5 起（含 EP）。Campaign 02 含 EP1 / EP2。日期以 ClickUp description 為主；ClickUp 寫 1–2 月但早於交片日的發佈年會調到翌年。",
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
            f"{post['campaign']} R{post['number']}"
            f"{' EP' + str(post['episode']) if post.get('episode') else ''}  "
            f"shoot={post['shooting'] or '-'}  "
            f"sub={post['submission'] or '-'}  pub={post['publish'] or '-'}"
        )


if __name__ == "__main__":
    main()
