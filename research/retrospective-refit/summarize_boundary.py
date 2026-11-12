"""Summarize initial-weekend sensitivity to the amount of later evidence."""
import hashlib
import json
from pathlib import Path

import numpy as np

input_path = Path('tmp/retrospective-refit/input.json')
weekends = json.loads(input_path.read_text())
prefix = json.loads(Path('tmp/retrospective-refit/boundary-prefix.json').read_text())
full = json.loads(Path('tmp/retrospective-refit/boundary-full.json').read_text())
published = json.loads(Path('data/model.json').read_text())
first = published['model']['snaps'][0]
if (prefix['inputSha256'] != hashlib.sha256(input_path.read_bytes()).hexdigest()
        or full['weekends'] != len(weekends)
        or full.get('inputSha256') != prefix['inputSha256']
        or str(first['raceId']) != str(weekends[0]['raceId'])
        or '0' not in full['covariance']):
    raise ValueError('Boundary prefixes, full fit and published model must use matching complete inputs')
cutoffs = prefix['cutoffs'] + [{'weekends': len(weekends), 'through': weekends[-1]['date'],
                                'ratings': full['history'][0],
                                'standardDeviation': full['covariance']['0']['standardDeviation']}]
reference = {'driver': {str(row['driverId']): row for row in first['drivers']},
             'car': {str(row['carId']): row for row in first['cars']}}
labels = {'driver': {'30': 'Michael Schumacher', '102': 'Ayrton Senna'},
          'car': {'30': 'Pacific', '1': 'McLaren'}}
result = {'inputSha256': prefix['inputSha256'], 'settingsSha256': prefix['settingsSha256'],
          'filterSourceHash': published['sourceHash'], 'firstDate': prefix['firstDate'],
          'firstObservationCounts': prefix['firstObservationCounts'], 'cutoffs': [],
          'limitations': prefix['limitations'] + ' Raw ratings use the fixed prior reference; within-weekend gaps are unaffected by a common display translation.'}
for cutoff in cutoffs:
    summary = {'weekends': cutoff['weekends'], 'through': cutoff['through'], 'entities': {}, 'absoluteChanges': {}}
    for kind, names in labels.items():
        summary['entities'][kind] = {}
        for identity, name in names.items():
            original = reference[kind][identity]['overall']
            rating = 1000 + cutoff['ratings'][kind][identity][2]
            summary['entities'][kind][identity] = {'name': name, 'rating': rating, 'change': rating - original,
                                                   'sd': cutoff['standardDeviation'][kind][identity][2]}
        differences = [abs(1000 + values[2] - reference[kind][identity]['overall'])
                       for identity, values in cutoff['ratings'][kind].items()]
        summary['absoluteChanges'][kind] = {'median': float(np.median(differences)),
                                            'maximum': float(max(differences))}
    driver = summary['entities']['driver']
    car = summary['entities']['car']
    summary['schumacherSennaGap'] = driver['30']['rating'] - driver['102']['rating']
    summary['pacificMcLarenGap'] = car['30']['rating'] - car['1']['rating']
    result['cutoffs'].append(summary)
result['targetEvidence'] = {}
for kind, identity in (('driver', '30'), ('car', '30')):
    result['targetEvidence'][kind] = []
    for cutoff in (1, 2, 5, 16, 32):
        races = weekends[:cutoff]
        def involves(row):
            return identity in ([str(row['a']), str(row['b'])] if kind == 'driver' else [str(row['ca']), str(row['cb'])])
        selected = [row for race in races for row in race['observations'] if involves(row)]
        result['targetEvidence'][kind].append({'throughWeekends': cutoff,
            'appearances': sum(any(str(entry[kind]) == identity for entry in race['entries']) for race in races),
            'comparisons': [sum(row['channel'] == channel for row in selected) for channel in range(3)],
            'totalWeight': [sum(row['weight'] for row in selected if row['channel'] == channel) for channel in range(3)]})
Path('research/retrospective-refit/validation-boundary.json').write_text(json.dumps(result, indent=2, allow_nan=False))
print(json.dumps(result, indent=2), flush=True)
