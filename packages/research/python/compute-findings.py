"""Computes the numbers behind the website's Insights page and writes them to site/js/insights-data.js.

    node packages/research/node/export-ratings-table.mjs <work directory>
    python3 packages/research/python/compute-findings.py <work directory>

Inputs: the published ratings of every weekend (exported by export-ratings-table.mjs) and the raw race tables in data/.
Everything is relative to the field of each weekend: 1000 is the average, and 75 points is 10:1 odds. Pre-race strengths use the ratings
posted after the previous weekend, so no result is used to forecast itself. See site/js/insights-cards.js for how each finding is worded.
"""

import itertools
import json
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import statsmodels.api as sm

ROOT = Path(__file__).resolve().parents[3]
DATA_DIRECTORY = ROOT / 'data'
OUTPUT_FILE = ROOT / 'site' / 'js' / 'insights-data.js'
LOGISTIC_SLOPE = np.log(10) / 75  # rating points to log-odds
FINISHED = r'^\+\d+ Laps?$'


def rounded(value, digits=1):
    return None if value is None or (isinstance(value, float) and np.isnan(value)) else round(float(value), digits)


# ---------------------------------------------------------------- tables


class Tables:
    """The ratings of every weekend as driver rows and car rows, and the results joined to names and race details."""

    def __init__(self, work_directory):
        exported = json.load(open(work_directory / 'ratings-table.json'))
        self.driver_names = {str(key): value for key, value in exported['driverNames']}
        self.constructor_names = {str(key): value for key, value in exported['constructorNames']}
        self.status_causes = json.load(open(work_directory / 'status-causes.json'))
        driver_rows, car_rows = [], []
        for index, weekend in enumerate(exported['weekends']):
            info = dict(index=index, raceId=int(weekend['raceId']), year=weekend['year'], round=weekend['round'], grandPrix=weekend['name'], date=weekend['date'])
            driver_rows += [{**info, **row} for row in weekend['drivers']]
            car_rows += [{**info, **row} for row in weekend['cars']]
        self.drivers = pd.DataFrame(driver_rows)
        self.cars = pd.DataFrame(car_rows)
        self.drivers['driverId'] = self.drivers.driverId.astype(str)
        self.drivers['constructorId'] = self.drivers.constructorId.astype(str)
        self.cars['constructorId'] = self.cars.constructorId.astype(str)
        self.drivers['driver'] = self.drivers.driverId.map(self.driver_names)
        self.drivers['team'] = self.drivers.constructorId.map(self.constructor_names)
        self.cars['team'] = self.cars.constructorId.map(self.constructor_names)
        car_combined = self.cars.set_index(['raceId', 'constructorId']).combined
        self.drivers['carCombined'] = [car_combined.get((race, team), np.nan) for race, team in zip(self.drivers.raceId, self.drivers.constructorId)]
        self.drivers['driverRating'] = self.drivers.combined - 1000
        self.drivers['carRating'] = self.drivers.carCombined - 1000

        self.races = pd.read_csv(DATA_DIRECTORY / 'races.csv', na_values=['\\N'])
        self.people = pd.read_csv(DATA_DIRECTORY / 'drivers.csv', na_values=['\\N'])
        self.circuits = pd.read_csv(DATA_DIRECTORY / 'circuits.csv', na_values=['\\N']).set_index('circuitId')
        results = pd.read_csv(DATA_DIRECTORY / 'results.csv', na_values=['\\N'])
        results = results.merge(pd.read_csv(DATA_DIRECTORY / 'status.csv'), on='statusId')
        results = results.merge(self.races[['raceId', 'year', 'round', 'circuitId', 'name', 'date']], on='raceId')
        results['driverId'] = results.driverId.astype(str)
        results['constructorId'] = results.constructorId.astype(str)
        results['driver'] = results.driverId.map(self.driver_names)
        results['team'] = results.constructorId.map(self.constructor_names)
        results['finished'] = results.statusId.eq(1) | results.status.str.match(FINISHED)
        self.results = results
        self.snapshot_of_race = self.drivers.drop_duplicates('raceId').set_index('raceId')['index']

    def before_race_entries(self, first_year=2002, last_year=2100):
        """One row per classified finisher with the driver and car ratings posted before that race (the previous snapshot)."""
        driver_before = self.drivers.set_index(['index', 'driverId']).combined
        car_before = self.cars.set_index(['index', 'constructorId']).combined
        entries = self.results[self.results.year.between(first_year, last_year)].copy()
        entries['index'] = entries.raceId.map(self.snapshot_of_race)
        entries = entries.dropna(subset=['index'])
        entries['index'] = entries['index'].astype(int)
        entries['driverBefore'] = [driver_before.get((i - 1, d), np.nan) - 1000 for i, d in zip(entries['index'], entries.driverId)]
        entries['carBefore'] = [car_before.get((i - 1, c), np.nan) - 1000 for i, c in zip(entries['index'], entries.constructorId)]
        return entries


# ---------------------------------------------------------------- findings


def best_car_against_best_driver(tables):
    entrants = season_entrants(tables)
    cars = tables.cars.groupby(['year', 'constructorId', 'team']).agg(races=('index', 'size'), pace=('combined', 'mean')).reset_index()
    cars = cars[cars.races >= 8]
    cars['pace'] -= 1000
    rows = []
    for year in range(2002, 2027):
        car = cars[cars.year == year].sort_values('pace', ascending=False).iloc[0]
        driver = entrants[entrants.year == year].sort_values('driverRating', ascending=False).iloc[0]
        rows.append(dict(year=year, carEdge=rounded(car.pace), carTeam=car.team, driverEdge=rounded(driver.driverRating), driverName=driver.driver))
    return rows


def season_entrants(tables):
    """Season averages per driver with at least 8 races."""
    entrants = (
        tables.drivers.groupby(['year', 'driverId', 'driver'])
        .agg(races=('index', 'size'), driverRating=('driverRating', 'mean'), carRating=('carRating', 'mean'), uncertainty=('combinedSd', 'mean'),
             team=('team', lambda s: s.value_counts().index[0]))
        .reset_index()
    )
    return entrants[entrants.races >= 8]


def race_pairs(tables):
    """Every pair of classified finishers in a race, with the pre-race driver and car rating gaps (cross-team pairs and teammate pairs)."""
    entries = tables.before_race_entries(2002)
    entries = entries[entries.finished & entries.driverBefore.notna() & entries.carBefore.notna()]
    rows = []
    for race_id, group in entries.groupby('raceId'):
        group = group.reset_index(drop=True)
        for a, b in itertools.combinations(range(len(group)), 2):
            x, y = group.loc[a], group.loc[b]
            rows.append((race_id, x.year, int(x.constructorId == y.constructorId), int(x.positionOrder < y.positionOrder),
                         x.driverBefore - y.driverBefore, x.carBefore - y.carBefore))
    return pd.DataFrame(rows, columns=['raceId', 'year', 'teammates', 'xAhead', 'driverGap', 'carGap'])


def symmetric(pairs):
    flipped = pairs.copy()
    flipped[['driverGap', 'carGap']] *= -1
    flipped['xAhead'] = 1 - flipped.xAhead
    return pd.concat([pairs, flipped])


def mcfadden(pairs, columns):
    sample = symmetric(pairs)
    fit = sm.Logit(sample.xAhead, sample[columns]).fit(disp=0)
    return 1 - fit.llf / (-len(sample) * np.log(2)), fit.params.values


def explained_share(tables, pairs):
    """Shapley split of the explained signal in cross-team race duels, in three-season windows, beside the model-free between-team share."""
    cross_team = pairs[pairs.teammates == 0]
    between_teams = between_team_share(tables)
    rows = []
    for year in range(2003, 2026):
        window = cross_team[cross_team.year.between(year - 1, year + 1)]
        r2 = {name: mcfadden(window, columns)[0] for name, columns in [('driver', ['driverGap']), ('car', ['carGap']), ('both', ['driverGap', 'carGap'])]}
        driver = (r2['driver'] + (r2['both'] - r2['car'])) / 2
        car = (r2['car'] + (r2['both'] - r2['driver'])) / 2
        rows.append(dict(year=year, driver=rounded(driver / (driver + car), 3), car=rounded(car / (driver + car), 3), betweenTeams=rounded(between_teams[year], 3)))
    return rows


def between_team_share(tables):
    """Intraclass correlation of each driver's average finishing percentile in a season: the share of the spread that is between teams."""
    finished = tables.results[(tables.results.year >= 2000) & tables.results.finished].copy()
    finished['percentile'] = finished.groupby('raceId').positionOrder.rank(pct=True)
    seasons = finished.groupby(['year', 'driverId']).agg(starts=('percentile', 'size'), mean=('percentile', 'mean'),
                                                          team=('constructorId', lambda s: s.value_counts().index[0])).reset_index()
    seasons = seasons[seasons.starts >= 8]

    def intraclass(frame):
        values, teams = frame['mean'].values, frame.team.values
        total, names = len(values), pd.unique(teams)
        counts = np.array([(teams == t).sum() for t in names])
        means = np.array([values[teams == t].mean() for t in names])
        between = (counts * (means - values.mean()) ** 2).sum() / (len(names) - 1)
        within = sum(((values[teams == t] - means[j]) ** 2).sum() for j, t in enumerate(names)) / (total - len(names))
        weight = (total - (counts**2).sum() / total) / (len(names) - 1)
        component = max((between - within) / weight, 0)
        return component / (component + within)

    return seasons.groupby('year').apply(intraclass)


def exchange_rate(tables):
    """Finishing places per 10 rating points of driver and of car, and the spread of each across the field, by era."""
    entries = tables.before_race_entries(2002)
    finishers = entries[entries.finished & entries.driverBefore.notna() & entries.carBefore.notna()].copy()
    finishers['place'] = finishers.groupby('raceId').positionOrder.rank()
    finishers['field'] = finishers.groupby('raceId').place.transform('size')
    finishers['placesAhead'] = -(finishers.place - (finishers.field + 1) / 2)
    finishers['driverGap'] = finishers.driverBefore - finishers.groupby('raceId').driverBefore.transform('mean')
    finishers['carGap'] = finishers.carBefore - finishers.groupby('raceId').carBefore.transform('mean')
    entrants = season_entrants(tables)
    rows = []
    for first, last in [(2002, 2009), (2010, 2017), (2018, 2026)]:
        sample = finishers[finishers.year.between(first, last)]
        fit = sm.OLS(sample.placesAhead, sample[['driverGap', 'carGap']]).fit()
        era = entrants[entrants.year.between(first, last)]
        driver_spread = era.groupby('year').driverRating.std().mean()
        car_spread = era.groupby('year').carRating.std().mean()
        rows.append(dict(era=f'{first}–{last}', placesPerTenDriverPoints=rounded(fit.params['driverGap'] * 10, 2), placesPerTenCarPoints=rounded(fit.params['carGap'] * 10, 2),
                         driverSpreadPoints=rounded(driver_spread), carSpreadPoints=rounded(car_spread),
                         driverSpreadPlaces=rounded(fit.params['driverGap'] * driver_spread, 2), carSpreadPlaces=rounded(fit.params['carGap'] * car_spread, 2)))
    return rows


def champions(tables):
    entrants = season_entrants(tables)
    points = tables.results.groupby(['year', 'driverId']).points.sum().reset_index()
    leaders = points.sort_values('points', ascending=False).groupby('year').head(1)
    merged = entrants.merge(leaders[['year', 'driverId']], on=['year', 'driverId'])
    return [dict(year=int(r.year), name=r.driver, team=r.team, driverRating=rounded(r.driverRating), carRating=rounded(r.carRating)) for r in merged.itertuples() if r.year <= 2025]


def equal_car_titles(tables):
    """With rating uncertainty simulated, the chance each driver is the best of a season; summed over seasons they are the expected titles in equal cars."""
    generator = np.random.default_rng(7)
    entrants = season_entrants(tables)
    points = tables.results.groupby(['year', 'driverId']).points.sum().reset_index()
    leaders = points.sort_values('points', ascending=False).groupby('year').head(1).set_index('year').driverId
    expected, seasons = {}, []
    for year in range(2002, 2026):
        field = entrants[entrants.year == year]
        field = field[field.races >= 0.5 * tables.drivers[tables.drivers.year == year]['round'].max()]
        draws = generator.normal(field.driverRating.values[:, None], field.uncertainty.values[:, None], size=(len(field), 6000))
        best_chance = (draws == draws.max(0)).mean(1)
        for name, chance in zip(field.driver, best_chance):
            expected[name] = expected.get(name, 0) + chance
        top = field.assign(chance=best_chance).sort_values('chance', ascending=False).iloc[0]
        seasons.append(dict(year=year, likeliestBest=top.driver, probability=rounded(top.chance, 2), champion=tables.driver_names[leaders[year]]))
    actual = pd.Series([tables.driver_names[leaders[y]] for y in range(2002, 2026)]).value_counts().to_dict()
    return dict(expected=sorted([[name, rounded(value, 2)] for name, value in expected.items() if value >= 0.25], key=lambda item: -item[1]), actual=actual, seasons=seasons)


def career_driver_and_car(tables):
    careers = tables.drivers.groupby(['driverId', 'driver']).agg(starts=('index', 'size'), driverRating=('driverRating', 'mean'), carRating=('carRating', 'mean')).reset_index()
    return [dict(name=r.driver, starts=int(r.starts), driverRating=rounded(r.driverRating), carRating=rounded(r.carRating)) for r in careers[careers.starts >= 60].itertuples()]


def driver_car_sorting(tables):
    entrants = season_entrants(tables)
    return [dict(year=int(year), correlation=rounded(group.driverRating.corr(group.carRating), 2)) for year, group in entrants.groupby('year')]


def upsets(tables, count=14):
    """The winners with the lowest pre-race chance, from a softmax over every entry's pre-race driver plus car strength (retirements ignored)."""
    entries = tables.before_race_entries(2003)
    entries = entries.dropna(subset=['driverBefore', 'carBefore']).copy()
    entries['strength'] = entries.driverBefore + entries.carBefore
    entries['weight'] = np.exp(LOGISTIC_SLOPE * entries.strength)
    entries['chance'] = entries.weight / entries.groupby('raceId').weight.transform('sum')
    winners = entries[(entries.positionOrder == 1) & (entries.groupby('raceId').raceId.transform('size') >= 10) & (entries['index'] >= 30)]
    lowest = winners.sort_values('chance').head(count)
    return [dict(year=int(r.year), grandPrix=r['name'].replace(' Grand Prix', ''), driver=r.driver, team=r.team, oddsAgainst=int(round(1 / r.chance))) for _, r in lowest.iterrows()]


def dominance(tables):
    def lead(group):
        ordered = group.combined.sort_values(ascending=False)
        return ordered.iloc[0] - ordered.iloc[1]

    leads = tables.cars.groupby(['year', 'round']).apply(lead).reset_index(name='lead')
    leading_team = tables.cars.loc[tables.cars.groupby(['year', 'round']).combined.idxmax()].groupby('year').team.agg(lambda s: s.value_counts().index[0])
    yearly = leads.groupby('year').lead.agg(['mean', 'max'])
    return [dict(year=int(year), team=leading_team[year], meanLead=rounded(row['mean']), largestLead=rounded(row['max'])) for year, row in yearly.iterrows()]


def winter_order(tables):
    last_of_season = tables.cars.sort_values('index').groupby(['year', 'constructorId']).tail(1).set_index(['year', 'constructorId']).combined
    correlations, changes = [], []
    for year in range(2001, 2026):
        before, after = last_of_season.xs(year - 1, level=0), last_of_season.xs(year, level=0)
        shared = before.index.intersection(after.index)
        if len(shared) >= 6:
            correlations.append(dict(year=year, correlation=rounded(pd.Series(before[shared]).rank().corr(pd.Series(after[shared]).rank()), 2)))
        for constructor in shared:
            changes.append((year, tables.constructor_names[constructor], before[constructor] - before.mean(), after[constructor] - after.mean()))
    frame = pd.DataFrame(changes, columns=['year', 'team', 'before', 'after'])
    frame['change'] = frame.after - frame.before
    frame = frame.sort_values('change')
    describe = lambda rows: [dict(year=int(r.year), team=r.team, before=rounded(r.before), after=rounded(r.after)) for r in rows.itertuples()]
    return dict(correlations=correlations, falls=describe(frame.head(6)), rises=describe(frame.tail(6)[::-1]))


def development(tables):
    rows = []
    for (year, constructor), group in tables.cars.groupby(['year', 'constructorId']):
        group = group.sort_values('round')
        if len(group) >= 12:
            rows.append((year, tables.constructor_names[constructor], group.combined.iloc[-3:].mean() - group.combined.iloc[2:5].mean()))
    frame = pd.DataFrame(rows, columns=['year', 'team', 'change']).sort_values('change')
    describe = lambda rows_: [dict(year=int(r.year), team=r.team, change=rounded(r.change)) for r in rows_.itertuples()]
    trajectory = lambda team: [rounded(v, 0) for v in (tables.cars[(tables.cars.year == 2024) & (tables.cars.team == team)].sort_values('round').combined - 1000)]
    return dict(slides=describe(frame.head(8)), climbs=describe(frame.tail(8)[::-1]), season2024={team: trajectory(team) for team in ['Red Bull', 'McLaren', 'Ferrari', 'Mercedes']})


def teammate_gaps(tables):
    rows = []
    for (year, constructor), group in tables.drivers.groupby(['year', 'constructorId']):
        for (_, first), (_, second) in itertools.combinations(group.groupby('driverId'), 2):
            shared = first.merge(second, on='index', suffixes=('_a', '_b'))
            if len(shared) >= 8:
                rows.append((year, tables.constructor_names[constructor], first.driver.iloc[0], second.driver.iloc[0], len(shared), (shared.combined_a - shared.combined_b).mean()))
    gaps = pd.DataFrame(rows, columns=['year', 'team', 'first', 'second', 'races', 'gap'])
    gaps['size'] = gaps.gap.abs()

    def describe(row):
        ahead, behind = (row['first'], row['second']) if row.gap > 0 else (row['second'], row['first'])
        return dict(year=int(row.year), team=row.team, ahead=ahead, behind=behind, gap=rounded(row['size']), races=int(row.races))

    career = pd.DataFrame([(r['first'], r.gap, r.races) for _, r in gaps.iterrows()] + [(r['second'], -r.gap, r.races) for _, r in gaps.iterrows()], columns=['driver', 'gap', 'races'])
    averaged = career.groupby('driver').apply(lambda g: pd.Series({'gap': np.average(g.gap, weights=g.races), 'races': g.races.sum()}))
    averaged = averaged[averaged.races >= 80].sort_values('gap', ascending=False)
    verstappen = gaps[(gaps['first'] == 'Max Verstappen') | (gaps['second'] == 'Max Verstappen')]
    by_team = gaps.groupby('team').agg(pairings=('size', 'size'), gap=('size', 'mean')).query('pairings >= 6').sort_values('gap')
    return dict(
        largestGaps=[describe(r) for _, r in gaps.sort_values('size', ascending=False).head(10).iterrows()],
        careerGaps=[dict(name=name, gap=rounded(r.gap), races=int(r.races)) for name, r in averaged.iterrows()],
        verstappen=[dict(year=int(r.year), teammate=r.second if r['first'] == 'Max Verstappen' else r['first'], gap=rounded(r.gap if r['first'] == 'Max Verstappen' else -r.gap)) for _, r in verstappen.iterrows()],
        teamAverages=[dict(team=team, gap=rounded(r.gap), pairings=int(r.pairings)) for team, r in by_team.iterrows()],
    )


def qualifying_versus_race(tables):
    rated = tables.drivers[tables.drivers.races >= 10].copy()
    rated['difference'] = rated.qual - rated.race
    seasons = rated.groupby(['driverId', 'driver', 'year']).agg(difference=('difference', 'mean'), races=('index', 'size')).reset_index()
    seasons = seasons[seasons.races >= 8]
    careers = seasons.groupby('driver').agg(difference=('difference', 'mean'), spread=('difference', 'std'), count=('year', 'size')).query('count >= 4')
    careers['standardError'] = careers.spread / np.sqrt(careers['count'])
    careers = careers.sort_values('difference', ascending=False)
    ordered = seasons.sort_values('year')
    halves = ordered.groupby('driverId').apply(lambda g: pd.Series({'even': g.difference.iloc[::2].mean(), 'odd': g.difference.iloc[1::2].mean(), 'count': len(g)}))
    halves = halves[halves['count'] >= 4].dropna()
    cars = tables.cars[tables.cars['round'] >= 3].copy()
    cars['difference'] = cars.qual - cars.race
    team_seasons = cars.groupby(['team', 'year']).difference.mean().reset_index().sort_values('difference')
    extreme = pd.concat([team_seasons.head(5), team_seasons.tail(5)])
    return dict(
        drivers=[dict(name=name, difference=rounded(r.difference), standardError=rounded(r.standardError)) for name, r in pd.concat([careers.head(8), careers.tail(8)]).iterrows()],
        cars=[dict(team=r.team, year=int(r.year), difference=rounded(r.difference)) for r in extreme.itertuples()],
        splitHalfCorrelation=rounded(halves.even.corr(halves.odd), 2),
    )


def circuit_weights(pairs, tables):
    """Weights on the driver and car rating gaps in cross-team race duels at each circuit (1 means the ratings predict it as well as elsewhere)."""
    cross_team = pairs[pairs.teammates == 0].copy()
    cross_team['circuitId'] = cross_team.raceId.map(tables.races.set_index('raceId').circuitId)
    rows = []
    for circuit, group in cross_team.groupby('circuitId'):
        races = group.raceId.nunique()
        if races < 10:
            continue
        _, weights = mcfadden(group, ['driverGap', 'carGap'])
        rows.append(dict(name=tables.circuits.loc[circuit, 'name'], races=int(races), driverWeight=rounded(weights[0] / LOGISTIC_SLOPE, 2), carWeight=rounded(weights[1] / LOGISTIC_SLOPE, 2)))
    return sorted(rows, key=lambda row: row['driverWeight'] / (row['driverWeight'] + row['carWeight']))


NATIONALITY_COUNTRY = {'British': 'UK', 'German': 'Germany', 'Italian': 'Italy', 'Spanish': 'Spain', 'French': 'France', 'Brazilian': 'Brazil', 'Australian': 'Australia',
                       'Japanese': 'Japan', 'Mexican': 'Mexico', 'Canadian': 'Canada', 'Dutch': 'Netherlands', 'Monegasque': 'Monaco', 'Austrian': 'Austria',
                       'Hungarian': 'Hungary', 'Belgian': 'Belgium', 'American': 'USA', 'Chinese': 'China', 'Russian': 'Russia', 'Malaysian': 'Malaysia',
                       'Swiss': 'Switzerland', 'Argentine': 'Argentina', 'Swedish': 'Sweden', 'Portuguese': 'Portugal', 'Indian': 'India', 'Thai': 'Thailand'}


def home_advantage(tables):
    """Extra effect, in rating points, of racing in the driver's own country, from duels between a home driver and a visitor (2002 onward)."""
    country_of_driver = tables.people.assign(driverId=tables.people.driverId.astype(str)).set_index('driverId').nationality.map(NATIONALITY_COUNTRY)
    country_of_race = tables.races.set_index('raceId').circuitId.map(tables.circuits.country).replace({'United States': 'USA'})
    entries = tables.before_race_entries(2002)
    entries = entries[entries.finished & entries.driverBefore.notna() & entries.carBefore.notna()].copy()
    entries['home'] = (entries.driverId.map(country_of_driver) == entries.raceId.map(country_of_race)).astype(int)
    rows = []
    for race_id, group in entries.groupby('raceId'):
        if group.home.sum() == 0:
            continue
        group = group.reset_index(drop=True)
        for a, b in itertools.combinations(range(len(group)), 2):
            x, y = group.loc[a], group.loc[b]
            if x.home != y.home:
                rows.append((race_id, int(x.positionOrder < y.positionOrder), (x.driverBefore - y.driverBefore) + (x.carBefore - y.carBefore), x.home - y.home))
    duels = pd.DataFrame(rows, columns=['raceId', 'xAhead', 'ratingGap', 'homeDifference'])

    def estimate(sample):
        flipped = sample.copy()
        flipped[['ratingGap', 'homeDifference']] *= -1
        flipped['xAhead'] = 1 - flipped.xAhead
        both = pd.concat([sample, flipped])
        both['logOdds'] = LOGISTIC_SLOPE * both.ratingGap
        fit = sm.Logit(both.xAhead, both[['logOdds', 'homeDifference']]).fit(disp=0)
        return fit.params['homeDifference'] / (fit.params['logOdds'] * LOGISTIC_SLOPE)

    generator = np.random.default_rng(0)
    by_race = {race: group for race, group in duels.groupby('raceId')}
    races = np.array(list(by_race))
    draws = [estimate(pd.concat([by_race[race] for race in generator.choice(races, len(races))])) for _ in range(200)]
    return dict(points=rounded(estimate(duels)), low=rounded(np.percentile(draws, 5)), high=rounded(np.percentile(draws, 95)), duels=len(duels), homeStarts=int(entries.home.sum()))


def ageing(tables):
    birth = tables.people.assign(driverId=tables.people.driverId.astype(str)).set_index('driverId').dob
    seasons = tables.drivers.groupby(['driverId', 'driver', 'year']).agg(rating=('driverRating', 'mean'), races=('index', 'size')).reset_index()
    seasons = seasons[seasons.races >= 8]
    seasons['age'] = [(pd.Timestamp(f'{y}-07-01') - pd.Timestamp(birth[i])).days / 365.25 for i, y in zip(seasons.driverId, seasons.year)]
    seasons = seasons.sort_values(['driverId', 'year'])
    for column in ['rating', 'year', 'age']:
        seasons['previous_' + column] = seasons.groupby('driverId')[column].shift()
    consecutive = seasons[seasons.year - seasons.previous_year == 1].copy()
    consecutive['change'] = consecutive.rating - consecutive.previous_rating
    consecutive['startAge'] = np.floor(consecutive.previous_age).astype(int)
    by_age = consecutive.groupby('startAge').change.agg(['mean', 'sem', 'size'])
    by_age = by_age[by_age['size'] >= 8]
    careers = ['Michael Schumacher', 'Fernando Alonso', 'Lewis Hamilton', 'Sebastian Vettel', 'Max Verstappen', 'Kimi Räikkönen']
    return dict(
        yearlyChange=[dict(age=int(age), mean=rounded(r['mean']), standardError=rounded(r['sem']), cases=int(r['size'])) for age, r in by_age.iterrows()],
        careers={name: [dict(age=rounded(r.age), rating=rounded(r.rating), year=int(r.year)) for r in seasons[seasons.driver == name].itertuples()] for name in careers},
    )


def mechanical_retirements(tables):
    starts = tables.results[~tables.results.status.isin(['Did not start', 'Did not qualify', 'Did not prequalify', 'Withdrew'])].copy()
    starts['finishedOrLapped'] = starts.finished | starts.status.eq('Lapped')
    starts['mechanical'] = starts.statusId.astype(str).map(lambda s: tables.status_causes[s]['mech']) >= 0.5
    starts['mechanicalRetirement'] = starts.mechanical & ~starts.finishedOrLapped
    return starts


def mechanical_retirement_trend(starts):
    yearly = starts.groupby('year').mechanicalRetirement.mean() * 100
    return [dict(year=int(year), percent=rounded(value)) for year, value in yearly.items()]


def fast_but_fragile(tables, starts):
    """Car pace against how much more (or less) often the car retired with a mechanical failure than the rest of the same season's field."""
    season_rate = starts.groupby('year').mechanicalRetirement.mean()
    teams = starts[starts.year >= 2000].groupby(['team', 'year']).agg(starts=('mechanicalRetirement', 'size'), rate=('mechanicalRetirement', 'mean')).reset_index()
    teams = teams[teams.starts >= 30]
    teams['excess'] = (teams.rate - teams.year.map(season_rate)) * 100
    pace = tables.cars.groupby(['team', 'year']).agg(races=('index', 'size'), pace=('combined', 'mean')).reset_index()
    pace = pace[pace.races >= 12]
    pace['pace'] -= 1000
    merged = teams.merge(pace, on=['team', 'year'])
    return [dict(team=r.team, year=int(r.year), pace=rounded(r.pace), excessRetirementPoints=rounded(r.excess)) for r in merged.itertuples()]


def grid_dependence(tables):
    modern = tables.results[tables.results.year >= 2010]
    started = modern[modern.finished & (modern.grid > 0)]
    circuits = []
    for circuit, group in started.groupby('circuitId'):
        if group.raceId.nunique() < 8:
            continue
        correlation = np.mean([race.grid.rank().corr(race.positionOrder.rank()) for _, race in group.groupby('raceId')])
        circuits.append(dict(name=tables.circuits.loc[circuit, 'name'], correlation=rounded(correlation, 2)))
    poles = []
    for first, last in [(2000, 2005), (2006, 2013), (2014, 2021), (2022, 2026)]:
        sample = tables.results[tables.results.year.between(first, last) & (tables.results.grid == 1)]
        poles.append(dict(period=f'{first}–{last}', percent=rounded((sample.positionOrder == 1).mean() * 100, 0), poles=len(sample)))
    return dict(circuits=sorted(circuits, key=lambda row: -row['correlation']), poleToWin=poles)


def current_grid(tables):
    year = tables.drivers.year.max()
    latest = tables.drivers[tables.drivers.year == year].sort_values('index').groupby('driverId').tail(1)
    return [dict(name=r.driver, team=r.team, driverRating=rounded(r.driverRating), carRating=rounded(r.carRating), uncertainty=rounded(r.combinedSd)) for r in latest.sort_values('combined', ascending=False).itertuples()]


def main():
    work_directory = Path(sys.argv[1])
    tables = Tables(work_directory)
    pairs = race_pairs(tables)
    starts = mechanical_retirements(tables)
    manifest = json.load(open(DATA_DIRECTORY / 'manifest.json'))
    findings = dict(
        dataThrough=manifest['lastRace'],
        bestCarAgainstBestDriver=best_car_against_best_driver(tables),
        explainedShare=explained_share(tables, pairs),
        exchangeRate=exchange_rate(tables),
        champions=champions(tables),
        equalCarTitles=equal_car_titles(tables),
        careerDriverAndCar=career_driver_and_car(tables),
        driverCarSorting=driver_car_sorting(tables),
        upsets=upsets(tables),
        dominance=dominance(tables),
        winterOrder=winter_order(tables),
        development=development(tables),
        teammates=teammate_gaps(tables),
        qualifyingVersusRace=qualifying_versus_race(tables),
        circuitWeights=circuit_weights(pairs, tables),
        homeAdvantage=home_advantage(tables),
        ageing=ageing(tables),
        mechanicalRetirements=mechanical_retirement_trend(starts),
        fastButFragile=fast_but_fragile(tables, starts),
        gridDependence=grid_dependence(tables),
        currentGrid=current_grid(tables),
    )
    text = '// GENERATED by packages/research/python/compute-findings.py: do not edit by hand.\n// The numbers behind the Insights page (site/js/insights-cards.js).\n'
    text += 'export const INSIGHTS_DATA = ' + json.dumps(findings, ensure_ascii=False, separators=(',', ':')) + ';\n'
    OUTPUT_FILE.write_text(text)
    print(f'wrote {OUTPUT_FILE.relative_to(ROOT)} ({len(text) // 1024} KB)')


if __name__ == '__main__':
    main()
