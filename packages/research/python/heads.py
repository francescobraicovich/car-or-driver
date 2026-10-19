"""Fit, score and export the forecast heads: a regularised linear model or boosted trees over the rating
inputs, the form trackers and the weekend's own evidence, one fit per forecast mode (post, pre, qual, grid).

The designs in research/selection.json were chosen by chronological validation (data through 2007, scored on
2008-2011; data through 2011, scored on 2012-2015) and are frozen. finalize-state-space.py refits them on the
state-space rating inputs; the Elo heads in packages/core/src/elo-forecast-heads.js are an earlier fit of the same designs.

No random pair split is ever used: all pairs of a weekend stay in one temporal fold.
"""
from pathlib import Path
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import HistGradientBoostingClassifier

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'research'
CONTEXT = ['same_team', 'refuel', 'early', 'q_missing', 'inexperienced']
SIGNALS = ['race_driver', 'race_car', 'qual_driver', 'qual_car']
FORMS = [f'{c}_{s}{suffix}' for c in ['qual', 'lap', 'order'] for s in ['fast', 'slow'] for suffix in ['', '_driver', '_track']]
CURRENT = ['grid', 'qual_now', 'qual_gap', 'qual_rank']
RICH_CURRENT = ['qual_team_now', 'qual_driver_now', 'current_q1', 'current_q2', 'current_q3', 'grid_log']
# The grid-only head (a forecast with grid slots but no qualifying times) uses this fixed design.
GRID_SPEC = {'name': 'cross_session', 'family': 'linear', 'signals': 'cross', 'C': 0.1}


def matrix(df, mode, spec):
    # The Thursday baseline is the starting point for every mode: a forecast must not rely on the weather of
    # the race, so the genuinely available grid and qualifying evidence is added separately.
    cols = {'base': df['baseline_pre'].to_numpy()}
    kind = spec['signals']
    rich = kind.startswith('rich')
    if kind != 'temperature':
        for n in SIGNALS:
            cols[n] = df[n].to_numpy()
        if mode == 'post':
            cols['grid'] = df.grid.to_numpy()
    if (kind in ['weekend', 'form', 'context', 'robust'] or rich) and mode == 'post':
        for n in CURRENT:
            cols[n] = df[n].to_numpy()
        if rich:
            for n in RICH_CURRENT:
                cols[n] = df[n].to_numpy()
    if kind in ['form', 'context', 'robust'] or rich:
        for n in FORMS:
            cols[n] = df[n].to_numpy()
        if rich:
            for channel in ['qual', 'lap', 'order']:
                cols[f'{channel}_trend'] = df[f'{channel}_fast'].to_numpy() - df[f'{channel}_slow'].to_numpy()
    if kind in ['context', 'robust']:
        for n in list(cols):
            if n.endswith('_track') or n.endswith('_driver'):
                continue
            for ctx in CONTEXT:
                if mode != 'post' and ctx == 'q_missing':
                    continue
                cols[f'{n}*{ctx}'] = cols[n] * df[ctx].to_numpy()
    if kind in ['robust', 'rich_robust']:
        for n in list(cols):
            if '*' not in n and not n.endswith('_track'):
                cols[f'tanh({n})'] = np.tanh(cols[n])
    odd = len(cols)
    if spec['family'] == 'tree':
        for n in CONTEXT:
            if mode != 'post' and n == 'q_missing':
                continue
            cols[n] = df[n].to_numpy()
        if rich and mode == 'post':
            for n in ['missing_q1', 'missing_q2', 'missing_q3']:
                cols[n] = df[n].to_numpy()
    X = np.column_stack(list(cols.values())).astype(np.float64)
    # Canonicalize equivalent values across JSON readers and driver reversal.
    # Without this, trees can split on meaningless 1e-15 rounding artifacts.
    X[np.abs(X) < 1e-7] = 0
    X = X.astype(np.float32).astype(np.float64)
    return X, list(cols), odd


def fit(df, mode, spec):
    if spec['family'] == 'ensemble':
        return {'spec': spec, 'mode': mode, 'members': [fit(df, mode, s) for s in spec['members']]}
    if spec.get('recent'):
        df = df[df.year > df.year.max() - spec['recent']]
    X, names, odd = matrix(df, mode, spec)
    y = df.y.to_numpy()
    w = df.w.to_numpy()
    w = w / w.mean()
    if spec.get('uniform'):
        w = np.ones(len(df))
    if spec['family'] == 'linear':
        scale = np.sqrt(np.mean(X * X, axis=0))
        scale[scale < 1e-6] = 1
        model = LogisticRegression(C=spec['C'], fit_intercept=False, max_iter=400, tol=1e-7)
        model.fit(X / scale, y, sample_weight=w)
    else:
        # Trees see every pair in both orders, so the fitted model is swap-symmetric.
        scale = np.ones(X.shape[1])
        rev = X.copy()
        rev[:, :odd] *= -1
        model = HistGradientBoostingClassifier(
            max_leaf_nodes=spec['leaves'],
            max_iter=spec['iterations'],
            learning_rate=0.06,
            l2_regularization=spec['l2'],
            min_samples_leaf=spec.get('min_leaf', 150),
            early_stopping=False,
            random_state=1847,
        )
        model.fit(np.concatenate([X, rev]), np.concatenate([y, 1 - y]), sample_weight=np.concatenate([w, w]) / 2)
    return {'model': model, 'scale': scale, 'spec': spec, 'mode': mode, 'names': names, 'odd': odd}


def predict(bundle, df):
    if bundle['spec']['family'] == 'ensemble':
        return sum(w * predict(m, df) for w, m in zip(bundle['spec']['weights'], bundle['members']))
    X, names, odd = matrix(df, bundle['mode'], bundle['spec'])
    assert names == bundle['names']
    model = bundle['model']
    if bundle['spec']['family'] == 'linear':
        return model.predict_proba(X / bundle['scale'])[:, 1]
    rev = X.copy()
    rev[:, :odd] *= -1
    return (model.predict_proba(X)[:, 1] + 1 - model.predict_proba(rev)[:, 1]) / 2


def loss_rows(y, p):
    p = np.clip(p, 1e-7, 1 - 1e-7)
    return -(y * np.log(p) + (1 - y) * np.log1p(-p))


def metrics(df, p):
    ll = loss_rows(df.y.to_numpy(), p)
    return {
        'loss': float(np.average(ll, weights=df.w)),
        'unweighted_loss': float(ll.mean()),
        'brier': float(np.average((df.y - p) ** 2, weights=df.w)),
        'weight': float(df.w.sum()),
        'pairs': len(df),
        'weekends': int(df.raceId.nunique()),
    }


def portable(b):
    """The fitted model as plain numbers, for packages/core/src/forecast/inference.js."""
    spec = b['spec']
    out = {'family': spec['family'], 'mode': b['mode'], 'name': spec['name']}
    if spec['family'] == 'ensemble':
        return {**out, 'weights': spec['weights'], 'members': [portable(m) for m in b['members']]}
    out['names'] = b['names']
    m = b['model']
    if spec['family'] == 'linear':
        out['coefficients'] = (m.coef_[0] / b['scale']).tolist()
    else:
        out['odd'] = b['odd']
        out['intercept'] = float(m._baseline_prediction[0, 0])
        out['trees'] = []
        for iteration in m._predictors:
            assert len(iteration) == 1
            nodes = iteration[0].nodes
            out['trees'].append(
                [[(-1 if n['is_leaf'] else int(n['feature_idx'])), float(n['num_threshold']), int(n['left']), int(n['right']), float(n['value'])] for n in nodes]
            )
    return out
