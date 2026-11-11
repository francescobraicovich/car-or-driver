"""Chronological full-field and newcomer validation against the saved reference."""
import json
from pathlib import Path
import sys

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'research/unified-form'))
from evaluate import FOLDS, binary_summary, weighted_mean, season_interval
from unified_calibration import fit_calibration, timing_distribution, outcome_probability, binary_loss
from unified_grid import fit_grid_head, grid_rows, grid_probability

DIRECTORY = ROOT / 'tmp/newcomer-priors'
REPORTS = ROOT / 'research/newcomer-priors'


def evaluate_candidate(name):
    saved = np.load(DIRECTORY / f'{name}.npz')
    rows, contexts = saved['rows'], saved['contexts']
    predictions, scales = np.full(len(rows), np.nan), np.full(len(rows), np.nan)
    grid_input = np.column_stack([rows, contexts[:, 4:6]])
    grid_scores, heads, calibration = [], [], []
    for first, last in FOLDS:
        for channel in range(3):
            past = rows[(rows[:, 1] >= 2002) & (rows[:, 1] < first) & (rows[:, 2] == channel)]
            current = (rows[:, 1] >= first) & (rows[:, 1] <= last) & (rows[:, 2] == channel)
            fitted = fit_calibration(past, channel)
            calibration.append(dict(fromYear=first, channel=channel, **fitted))
            if channel == 2:
                predictions[current] = outcome_probability(rows[current], np.log(fitted['slope']))
            else:
                predictions[current], scales[current], _ = timing_distribution(rows[current], np.log([fitted['slope'], fitted['noise']]))
        head = fit_grid_head(grid_input, first)
        current = grid_rows(grid_input[(rows[:, 1] >= first) & (rows[:, 1] <= last)])
        grid_scores.append(np.column_stack([current, grid_probability(current, head)]))
        heads.append(head)
    grid = np.concatenate(grid_scores)
    masks = {'all': np.ones(len(rows), dtype=bool)}
    for kind, columns in (('driver', [0, 1]), ('car', [2, 3])):
        for horizon in (1, 5):
            masks[f'{kind}First{horizon}'] = np.min(contexts[:, columns], axis=1) < horizon
            if kind == 'car':
                masks[f'{kind}First{horizon}'] &= rows[:, 6] == 0
    def summary(mask):
        result = {}
        for channel, label in enumerate(('qualifying', 'racePace', 'overall')):
            use = mask & (rows[:, 2] == channel)
            if not use.any():
                result[label] = None
            elif channel == 2:
                result[label] = binary_summary(rows[use], predictions[use])
            else:
                errors = np.abs(rows[use, 3] - predictions[use])
                result[label] = dict(mae=weighted_mean(errors, rows[use]),
                                     coverage90=weighted_mean(errors <= np.log(19) * scales[use], rows[use]),
                                     pairs=int(use.sum()), weekends=int(len(np.unique(rows[use, 0]))))
        return result
    periods = [(2008, 2025), *FOLDS]
    report = {'periods': [], 'calibration': calibration, 'gridHeads': heads}
    for first, last in periods:
        years = (rows[:, 1] >= first) & (rows[:, 1] <= last)
        selected = grid[(grid[:, 1] >= first) & (grid[:, 1] <= last)]
        report['periods'].append(dict(fromYear=first, toYear=last, slices={label: summary(years & mask) for label, mask in masks.items()},
                                      knownGrid=binary_summary(selected, selected[:, 13])))
    history = json.loads((DIRECTORY / f'{name}-history.json').read_text())
    report['latestMeans'] = {kind: (1000 + np.mean(list(history[-1][kind].values()),axis=0)).tolist() for kind in ('drivers','cars')}
    report['overallMovement90'] = {}
    for kind in ('drivers','cars'):
        values=[]
        for before,after in zip(history,history[1:]):
            if not 2008 <= after['year'] <= 2025 or (np.datetime64(after['date'])-np.datetime64(before['date'])).astype(int)>60:
                continue
            values.extend(abs(after[kind][identity][2]-before[kind][identity][2]) for identity in set(before[kind]) & set(after[kind]))
        report['overallMovement90'][kind]=float(np.quantile(values,.9))
    np.savez_compressed(DIRECTORY / f'{name}-scores.npz',predictions=predictions,scales=scales,grid=grid)
    return report, rows, predictions, masks


def main():
    reference, rows, original, masks = evaluate_candidate('reference')
    candidate, candidate_rows, proposed, _ = evaluate_candidate('candidate')
    np.testing.assert_array_equal(rows[:, :4],candidate_rows[:, :4])
    comparison={}
    for label, slice_mask in masks.items():
        use=slice_mask & (rows[:,1]>=2008) & (rows[:,1]<=2025) & (rows[:,2]==2)
        difference=binary_loss(rows[use,3],proposed[use])-binary_loss(rows[use,3],original[use])
        comparison[label]=dict(logLossDifference=weighted_mean(difference,rows[use]),seasonInterval95=season_interval(rows[use],difference))
    old=reference['periods'][0]['slices'];new=candidate['periods'][0]['slices']
    np.testing.assert_allclose(old['all']['overall']['logLoss'], .5301171921210698, rtol=0, atol=1e-10)
    guards={
        'overall':new['all']['overall']['logLoss']<=old['all']['overall']['logLoss']+.002,
        'blocks':all(b['slices']['all']['overall']['logLoss']<=a['slices']['all']['overall']['logLoss']+.005 for a,b in zip(reference['periods'][1:5],candidate['periods'][1:5])),
        'timing':all(new['all'][channel]['mae']<=1.02*old['all'][channel]['mae'] for channel in ('qualifying','racePace')),
        'driverStability':candidate['overallMovement90']['drivers']<=1.1*reference['overallMovement90']['drivers'],
    }
    for kind in ('driver','car'):
        label=f'{kind}First5'
        guards[kind]=dict(logLossChange=new[label]['overall']['logLoss']-old[label]['overall']['logLoss'],
                          qualifyingErrorRatio=new[label]['qualifying']['mae']/old[label]['qualifying']['mae'],
                          racePaceErrorRatio=new[label]['racePace']['mae']/old[label]['racePace']['mae'])
        metrics=guards[kind]
        metrics['accepted']=(any([metrics['logLossChange']<0, metrics['qualifyingErrorRatio']<1, metrics['racePaceErrorRatio']<1])
                             and metrics['logLossChange']<=.005 and metrics['qualifyingErrorRatio']<=1.02 and metrics['racePaceErrorRatio']<=1.02)
    accepted=all(guards[key] for key in ('overall','blocks','timing','driverStability')) and all(guards[key]['accepted'] for key in ('driver','car'))
    result=dict(referenceSourceHash='dc909062c7273b74',reference=reference,candidate=candidate,comparisons=comparison,guards=guards)
    result['accepted']=accepted
    (REPORTS/'results.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({'comparisons':comparison,'guards':guards,'latestMeans':candidate['latestMeans']},indent=2))
    for label in masks:
        print(label,json.dumps({'reference':old[label],'candidate':new[label]}))


if __name__=='__main__':
    main()
