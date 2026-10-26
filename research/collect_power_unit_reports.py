"""Collect FIA event reports about new power-unit elements for an audit."""

import html
import io
import json
import re
import sys
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

import pdfplumber


ROOT = "https://www.fia.com"
SEASON = sys.argv[1] if len(sys.argv) > 1 else "2024"
SEASON_ID = {"2023": "2042", "2024": "2043", "2025": "2071", "2026": "2072"}[SEASON]
INDEX = f"{ROOT}/documents/formula-1/season/season-{SEASON}-{SEASON_ID}"


def download(url):
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()


def event_links():
    page = download(INDEX).decode("utf-8")
    paths = set(
        html.unescape(path)
        for path in re.findall(r'<option value="([^"]+/event/[^\"]+)"', page)
        if f"season-{SEASON}-{SEASON_ID}" in path
    )
    return sorted(paths)


def reports_for_event(path):
    page = download(ROOT + path).decode("utf-8")
    links = re.findall(r'href="([^"]+\.pdf)"', page)
    out = []
    for link in links:
        link = html.unescape(link)
        title = urllib.parse.unquote(link.rsplit("/", 1)[-1])
        if not re.search(r"new[_ ]pu[_ ]elements[_ ]for[_ ]this[_ ]competition", title, re.I):
            continue
        out.append((title, urllib.parse.urljoin(ROOT, urllib.parse.quote(link, safe="/%"))))
    return out


def report_text(item):
    title, url = item
    try:
        pdf = pdfplumber.open(io.BytesIO(download(url)))
        text = "\n".join(page.extract_text() or "" for page in pdf.pages)
        return {"title": title, "url": url, "text": text}
    except Exception as error:
        return {"title": title, "url": url, "error": str(error)}


with ThreadPoolExecutor(max_workers=4) as pool:
    jobs = [pool.submit(reports_for_event, path) for path in event_links()]
    reports = []
    for job in as_completed(jobs):
        reports.extend(job.result())
    reports = sorted(set(reports))
    print(f"{SEASON}: {len(jobs)} events, {len(reports)} reports", file=sys.stderr)
    jobs = [pool.submit(report_text, item) for item in reports]
    out = [job.result() for job in as_completed(jobs)]

print(json.dumps(sorted(out, key=lambda row: row["title"]), indent=2))
