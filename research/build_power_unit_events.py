"""Turn audited FIA report text into dated, driver-level component events."""

import csv
import json
import re
import sys
import unicodedata
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MONTHS = "January February March April May June July August September October November December".split()
MONTH_NUMBER = {name: index + 1 for index, name in enumerate(MONTHS)}
COMPONENTS = ("ICE", "TC", "MGU-H", "MGU-K", "ES", "CE", "EX")


def read_csv(name):
    with (ROOT / "data" / name).open(newline="") as file:
        return list(csv.DictReader(file))


def normalize(name):
    plain = unicodedata.normalize("NFKD", name.lower())
    return re.sub(r"[^a-z0-9]", "", "".join(c for c in plain if not unicodedata.combining(c)))


races = read_csv("races.csv")
results = read_csv("results.csv")
drivers = {
    row["driverId"]: ([normalize(part) for part in row["forename"].split()], normalize(row["surname"]))
    for row in read_csv("drivers.csv")
}
race_by_key = {(row["year"], normalize(row["name"])): row for row in races}
result_by_number = {(row["raceId"], str(int(row["number"]))): row["driverId"] for row in results if row["number"].isdigit()}
drivers_by_race = {}
for result in results:
    drivers_by_race.setdefault(result["raceId"], set()).add(result["driverId"])


def race_for(report):
    title = report["title"].replace("_", " ")
    title = re.split(r"\s+-\s+new pu elements", title, flags=re.I)[0]
    year, name = title.split(" ", 1)
    return race_by_key.get((year, normalize(name)))


def publication(text):
    head = text.split("Jo Bauer", 1)[0]
    date = re.search(r"\bDate\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})", head)
    time = re.search(r"\bTime\s+(\d{1,2}:\d{2})", head)
    if not date:
        return ""
    day, month, year = date.groups()
    return f"{year}-{MONTH_NUMBER[month]:02d}-{int(day):02d} {time.group(1) if time else '00:00'}"


def events(report):
    race = race_for(report)
    if not race or "error" in report:
        return [], f"unreadable {report['title']}"
    text = report["text"]
    sections = re.split(r"(?=(?:The following drivers?|All drivers) (?:will start|will be using|are using|is using))", text)
    out = []
    for section in sections:
        marker = re.search(r"(?:with|using) a new\s+.{0,100}?\((ICE|TC|MGU-H|MGU-K|ES|CE|EX)\)", section, re.S)
        if not marker:
            continue
        component = marker.group(1)
        if section.startswith("All drivers"):
            out.extend({
                "raceId": race["raceId"], "year": race["year"], "round": race["round"],
                "driverId": driver_id, "component": component, "previouslyUsed": "0",
                "published": publication(text), "source": report["url"],
            } for driver_id in drivers_by_race[race["raceId"]])
            continue
        lines = section[marker.end():].splitlines()
        for line in lines:
            if line.startswith("The ") or line.startswith("Formula One"):
                break
            row = re.match(r"^\s*(\d{1,2})\s+(.+?)\s+(\d+)\s*$", line)
            if not row:
                continue
            number, body, previous = row.groups()
            driver_id = result_by_number.get((race["raceId"], str(int(number))))
            if not driver_id:
                return out, f"unknown driver number {number} in {report['title']}"
            first_names, surname = drivers[driver_id]
            if surname not in normalize(body) or not any(part in normalize(body) for part in first_names):
                return out, f"driver mismatch {number} {body} in {report['title']}"
            out.append({
                "raceId": race["raceId"],
                "year": race["year"],
                "round": race["round"],
                "driverId": driver_id,
                "component": component,
                "previouslyUsed": previous,
                "published": publication(text),
                "source": report["url"],
            })
    return out, None


all_events = []
errors = []
for year in sys.argv[1:] or ["2024"]:
    path = ROOT / "tmp" / f"fia-power-unit-{year}.json"
    for report in json.loads(path.read_text()):
        rows, error = events(report)
        all_events.extend(rows)
        if error:
            errors.append(error)

keys = ["raceId", "year", "round", "driverId", "component", "previouslyUsed", "published", "source"]
all_events.sort(key=lambda row: (int(row["year"]), int(row["round"]), row["driverId"], row["component"], row["published"]))
with (ROOT / "tmp" / "power-unit-events.csv").open("w", newline="") as file:
    writer = csv.DictWriter(file, fieldnames=keys)
    writer.writeheader()
    writer.writerows(all_events)
print(f"{len(all_events)} component events in {len(set(row['raceId'] for row in all_events))} races")
for error in errors:
    print(error, file=sys.stderr)
