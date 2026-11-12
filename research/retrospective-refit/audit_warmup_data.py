"""Audit coverage and consistency of pre-1994 and nearby reference data."""
import csv
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path

root = Path('data')
def rows(name):
    with (root / name).open(newline='', encoding='utf8') as source:
        return list(csv.DictReader(source))
def numeric(value):
    try:
        return int(value)
    except (ValueError, TypeError):
        return None

races = [row for row in rows('races.csv') if 1990 <= int(row['year']) <= 1997]
race_year = {row['raceId']: int(row['year']) for row in races}
results = [row for row in rows('results.csv') if row['raceId'] in race_year]
qualifying = [row for row in rows('qualifying.csv') if row['raceId'] in race_year]
drivers = {row['driverId'] for row in rows('drivers.csv')}
cars = {row['constructorId'] for row in rows('constructors.csv')}
statuses = {row['statusId'] for row in rows('status.csv')}
result_map = defaultdict(list)
for row in results:
    result_map[(row['raceId'], row['driverId'])].append(row)
laps = defaultdict(list)
with (root / 'lap_times.csv').open(newline='', encoding='utf8') as source:
    for row in csv.DictReader(source):
        if row['raceId'] in race_year:
            laps[(row['raceId'], row['driverId'], row['lap'])].append(row)

per_year = {}
for year in range(1990, 1998):
    race_ids = {row['raceId'] for row in races if int(row['year']) == year}
    result_rows = [row for row in results if row['raceId'] in race_ids]
    qualifying_rows = [row for row in qualifying if row['raceId'] in race_ids]
    year_laps = {key: value for key, value in laps.items() if key[0] in race_ids}
    positive = [row for row in result_rows if (numeric(row['laps']) or 0) > 0]
    by_entry = Counter((race, driver) for race, driver, _ in year_laps)
    maximum_lap = defaultdict(int)
    lap_numbers = defaultdict(set)
    for race, driver, lap in year_laps:
        maximum_lap[(race, driver)] = max(maximum_lap[(race, driver)], numeric(lap) or 0)
        if numeric(lap) is not None:
            lap_numbers[(race, driver)].add(numeric(lap))
    ratios = []
    inconsistent = []
    incomplete = []
    for row in positive:
        key = row['raceId'], row['driverId']
        completed = numeric(row['laps'])
        count = sum(1 <= lap <= completed for lap in lap_numbers[key])
        ratios.append(count / completed)
        if count < completed:
            incomplete.append({'raceId': key[0], 'driverId': key[1], 'resultLaps': completed, 'recordedLapsWithinResult': count})
        if maximum_lap[key] > completed:
            inconsistent.append({'raceId': key[0], 'driverId': key[1], 'resultLaps': completed})
    fastest = {}
    for (race, driver, lap), records in year_laps.items():
        for row in records:
            if (numeric(lap) or 0) > 1 and (numeric(row['milliseconds']) or 0) > 0:
                key = (race, driver)
                fastest[key] = min(fastest.get(key, float('inf')), numeric(row['milliseconds']))
    retained_beyond, retained_extreme = [], []
    for (race, driver, lap), records in year_laps.items():
        key = (race, driver)
        for row in records:
            if not ((numeric(lap) or 0) > 1 and 0 < (numeric(row['milliseconds']) or 0) <= fastest.get(key, 0) * 1.05):
                continue
            if result_map.get(key) and (numeric(lap) or 0) > (numeric(result_map[key][0]['laps']) or 0):
                retained_beyond.append({field: row[field] for field in ('raceId', 'driverId', 'lap', 'milliseconds')})
            if (numeric(row['milliseconds']) or 0) > 600000 or 0 < (numeric(row['milliseconds']) or 0) < 20000:
                retained_extreme.append(row)
    duplicate_laps = [value for value in year_laps.values() if len(value) > 1]
    conflicts = [value for value in duplicate_laps if len({(item['milliseconds'], item['position']) for item in value}) > 1]
    invalid = [row for values in year_laps.values() for row in values if (numeric(row['milliseconds']) or 0) <= 0 or (numeric(row['lap']) or 0) <= 0]
    extreme = [row for values in year_laps.values() for row in values if (numeric(row['milliseconds']) or 0) > 600000 or 0 < (numeric(row['milliseconds']) or 0) < 20000]
    unknown = [row for row in result_rows if row['driverId'] not in drivers or row['constructorId'] not in cars or row['statusId'] not in statuses]
    duplicate_results = [values for key, values in result_map.items() if key[0] in race_ids and len(values) > 1]
    per_year[str(year)] = {'races': len(race_ids), 'resultRows': len(result_rows), 'positiveLapEntries': len(positive),
                           'entriesWithoutLapRows': sum(by_entry[(row['raceId'], row['driverId'])] == 0 for row in positive),
                           'entriesWithAllReportedLaps': sum(ratio >= 1 for ratio in ratios),
                           'meanRecordedLapFractionCappedAtOne': sum(ratios) / len(ratios) if ratios else None,
                           'racesWithAnyQualifyingRows': len({row['raceId'] for row in qualifying_rows}),
                           'qualifyingRows': len(qualifying_rows), 'lapRows': sum(len(value) for value in year_laps.values()),
                           'lapKeys': len(year_laps), 'duplicateLapKeys': len(duplicate_laps),
                           'conflictingDuplicateLapKeys': len(conflicts), 'invalidLapRows': len(invalid),
                           'extremeDurationRows': len(extreme), 'retainedExtremeDurationRows': len(retained_extreme),
                           'retainedLapsBeyondResult': len(retained_beyond), 'entriesWithLapBeyondResult': len(inconsistent),
                           'lapEntriesAbsentFromResults': len({(r, d) for r, d, _ in year_laps if (r, d) not in result_map}),
                           'duplicateResultKeys': len(duplicate_results), 'unknownResultReferences': len(unknown),
                           'examples': {'conflictingLaps': [[{k: item[k] for k in ('raceId', 'driverId', 'lap', 'position', 'milliseconds')} for item in value] for value in conflicts[:5]],
                                        'lapBeyondResult': inconsistent[:5], 'incompleteLaps': incomplete[:10], 'retainedBeyondResult': retained_beyond[:10],
                                        'extremeDurations': [{k: row[k] for k in ('raceId', 'driverId', 'lap', 'milliseconds')} for row in extreme[:5]]}}

warm_path = Path('tmp/retrospective-refit/boundary-warmup-input.json')
warm = json.loads(warm_path.read_text())
for year in range(1990, 1998):
    selected = [weekend for weekend in warm if weekend['date'].startswith(str(year))]
    per_year[str(year)]['evidenceCounts'] = [sum(row['channel'] == channel for weekend in selected for row in weekend['observations']) for channel in range(3)]
    per_year[str(year)]['evidenceWeight'] = [sum(row['weight'] for weekend in selected for row in weekend['observations'] if row['channel'] == channel) for channel in range(3)]
clipped_path = Path('tmp/retrospective-refit/boundary-warmup-clipped-input.json')
clipped = json.loads(clipped_path.read_text())
if len(clipped) != len(warm) or any(a['raceId'] != b['raceId'] for a, b in zip(warm, clipped)):
    raise ValueError('Clipped evidence is not aligned with original warm-up evidence')
evidence_changes = []
for original, corrected in zip(warm, clipped):
    left = {(row['a'], row['b'], row['channel']): row for row in original['observations']}
    right = {(row['a'], row['b'], row['channel']): row for row in corrected['observations']}
    modified = sum(left[key] != right[key] for key in left.keys() & right.keys())
    if left.keys() != right.keys() or modified:
        evidence_changes.append({'raceId': original['raceId'], 'date': original['date'],
                                 'removed': len(left.keys() - right.keys()), 'added': len(right.keys() - left.keys()),
                                 'modified': modified})
result = {'clippedInputSha256': hashlib.sha256(clipped_path.read_bytes()).hexdigest(),
          'clippedEvidenceChanges': evidence_changes, 'dataManifestVersion': json.loads((root / 'manifest.json').read_text())['version'],
          'warmupInputSha256': hashlib.sha256(warm_path.read_bytes()).hexdigest(), 'perYear': per_year,
          'limitations': 'Internal consistency and completeness checks only: this does not independently verify historical lap times, event selection, timing conditions, source provenance by row or race outcomes. Lap fractions are capped at one; pit stops and extreme-duration rows may be legitimate. Pre-1994 qualifying data are absent from these files.'}
Path('research/retrospective-refit/audit-warmup-data.json').write_text(json.dumps(result, indent=2, allow_nan=False))
print(json.dumps({year: {key: value for key, value in data.items() if key != 'examples'} for year, data in per_year.items()}, indent=2))
