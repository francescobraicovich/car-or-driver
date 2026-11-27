// The questions the front page scrolls (question-feed.js), each with the page that answers it, its kind, and a score: how likely a visitor is to
// want to open it, against the other questions of its kind. The feed draws a kind first, in a fixed mix (KIND_SHARE), so that no kind takes over the
// screen, then a question of that kind by its score. The score is a judgement written as a formula, not a measurement (the site counts no visits).
// People want the big questions (the best driver of all time), duels between drivers of the same era and of a similar standing, who were both very
// good, or both very poor, legends compared across eras, the current grid more than the past, and long careers more than short ones. The weights are
// named below, to be tuned by eye. A question names no result and no number, so it stays true after every Grand Prix; the score may use the
// ratings, because it is never shown.
import { INSIGHT_PAGES } from './insight-page-metadata.js';
import { addressName, comparisonPath, seasonPath, TEAMMATE_PAGE_MINIMUM_RACES, teammatePath } from './page-addresses.js';

/** The mix of kinds the feed shows, as shares of its questions (they add up to 1). */
export const KIND_SHARE = {
  insight: 0.17, // a finding: "Who is the best F1 driver of all time?"
  now: 0.08, // the best driver now, the next race
  versus: 0.16, // two drivers in the head to head: "Who is better: Verstappen or Leclerc?"
  worse: 0.06, // two poor drivers: "Who is worse: Latifi or Mazepin?"
  teammates: 0.1, // two teammates, on their page
  graph: 0.1, // a driver against every teammate, in the Graph
  career: 0.1, // a driver's rating over a career, in History
  driver: 0.09, // a driver's page
  car: 0.07, // a car's page
  season: 0.07, // the ratings at the end of a season
};
/** How many duels of two drivers the feed asks about, of each kind. */
export const DUELS = { better: 200, worse: 60 };
/**
 * How many duels have a page comparing the two drivers (tools/driver-and-team-pages.mjs): more than the feed asks about, so that a duel the feed
 * shows always has its page, even where a browser's arithmetic puts a duel near the end of the list a place or two away from the build's.
 */
export const DUEL_PAGES = { better: 300, worse: 100 };
const DUEL_CANDIDATES = 70; // duels are drawn among this many of the most wanted drivers

/** A kind already on the screen is this much less likely to come next, for each of its questions there. */
const CROWDED = 0.5;

/** How much each finding is wanted, as a share of the most wanted. */
const INSIGHT_WEIGHT = {
  'driver-peak-ratings': 1,
  'explained-share': 0.95,
  'car-peak-ratings': 0.9,
  'equal-car-titles': 0.8,
  'driver-low-ratings': 0.75,
  upsets: 0.75,
  champions: 0.7,
  'teammate-gaps': 0.7,
  'career-driver-and-car': 0.65,
  ageing: 0.6,
  'car-low-ratings': 0.6,
  'qualifying-versus-race': 0.55,
  'circuit-weights': 0.5,
};

/** Questions about the present that need no driver. */
const NOW_QUESTIONS = [
  ['Who is the best F1 driver right now?', '/ratings', 1],
  ['Who will win the next Grand Prix?', '/prediction', 0.9],
  ['What is the fastest F1 car right now?', '/teams', 0.8],
  ['How are F1 drivers connected across the eras?', '/graph', 0.45],
  ['How do you separate the driver from the car?', '/methodology/simple', 0.4],
];

/** How strongly the feed prefers a high score among the questions of a kind: the chance of a question goes with its score to this power. */
export const SHARPNESS = 1.6;

const LEGEND = 0.7; // a driver this great (0 to 1) is wanted whenever they raced
const CURRENT_FAME = 0.4; // a driver on the current grid is known, however good, and stays known for a few years after (KNOWN_YEARS)
const KNOWN_YEARS = 4;
/** World titles won before the ratings start (1994), by drivers who raced after it: fame the ratings cannot see. */
const TITLES_BEFORE_THE_RATINGS = { 'Ayrton Senna': 3, 'Nigel Mansell': 1 };
const ERA_YEARS = 4; // two careers this many years apart are about a third as comparable as two that overlap
const RECENCY_YEARS = 12; // how fast interest fades after a driver's last race
const FULL_CAREER = 80; // a career of this many Grands Prix is fully known
const SETTLING_RACES = 10; // the first races of a career are uncertain, and do not count towards a driver's peak or level
const STANDING_SPREAD = 0.08; // two drivers this far apart in the order of all drivers (0 the lowest, 1 the highest) are about a third as good a duel

const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
/** Two drivers of a similar standing (their places in the order of all drivers, 0 to 1) make a better duel. */
const alike = (x, y) => 0.25 + 0.75 * Math.exp(-Math.abs(x - y) / STANDING_SPREAD);
const close = (x, y, scale) => 0.6 + 0.4 * Math.exp(-Math.abs(x - y) / scale); // two poor drivers close in level are a little more wanted

/**
 * Every driver in the ratings, with what the score uses: level, peak, titles, era, career length, and how wanted they are. `champions` are the
 * points leaders of each season ({name}, from the Insights).
 */
function driversOf(model, profiles, champions) {
  const titles = new Map(Object.entries(TITLES_BEFORE_THE_RATINGS));
  for (const { name } of champions) titles.set(name, (titles.get(name) ?? 0) + 1);
  const now = model.snaps.at(-1).year;
  const onGrid = new Set(model.snaps.at(-1).drivers.map((row) => String(row.driverId)));
  const drivers = new Map();
  const pairs = new Map();
  for (const snap of model.snaps) {
    const byTeam = new Map();
    for (const row of snap.drivers) {
      const id = String(row.driverId);
      if (!drivers.has(id)) drivers.set(id, { id, name: row.name, ratings: [], years: [] });
      drivers.get(id).ratings.push(row.overall);
      drivers.get(id).years.push(snap.year);
      const team = String(row.constructorId);
      if (!byTeam.has(team)) byTeam.set(team, { name: row.car, ids: [] });
      byTeam.get(team).ids.push(id);
    }
    for (const { name, ids } of byTeam.values())
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) {
          const key = [ids[i], ids[j]].sort().join(':');
          if (!pairs.has(key)) pairs.set(key, { ids: key.split(':'), races: 0, team: name });
          pairs.get(key).races++;
          pairs.get(key).team = name; // the latest team they shared
        }
  }
  for (const driver of drivers.values()) {
    const settled = driver.ratings.slice(Math.min(SETTLING_RACES, Math.floor(driver.ratings.length / 3)));
    driver.peak = Math.max(...settled);
    driver.level = mean(settled);
    driver.first = driver.years[0];
    driver.last = driver.years.at(-1);
    driver.races = driver.ratings.length;
    driver.current = onGrid.has(driver.id);
    driver.titles = titles.get(driver.name) ?? 0;
    const quality = clamp((driver.peak - 990) / 45); // 1 from a peak of 1035, the best of each era
    const honours = driver.titles ? clamp(0.45 + 0.18 * driver.titles) : 0; // one title is much, three are all
    driver.excellence = 0.6 * quality + 0.4 * honours;
    driver.weakness = clamp((975 - driver.level) / 45); // 1 from a level of 930, the slowest of each era
    driver.fame = Math.max(driver.excellence, driver.weakness, CURRENT_FAME * Math.exp(-(now - driver.last) / KNOWN_YEARS));
    let recency = driver.current ? 1 : 0.25 + 0.75 * Math.exp(-(now - driver.last) / RECENCY_YEARS);
    if (driver.excellence > LEGEND) recency = Math.max(recency, LEGEND); // (greatness keeps a driver wanted, slowness does not)
    driver.recency = recency;
    let presence = driver.current ? Math.max(0.6, clamp(driver.races / FULL_CAREER)) : clamp(driver.races / FULL_CAREER, 0.1, 1);
    if (quality >= 0.95) presence = Math.max(presence, 0.8); // at the very top, a driver is known however few races the ratings saw (Senna's last)
    driver.interest = (0.1 + 0.9 * driver.fame) * recency * (0.35 + 0.65 * presence);
    driver.surname = profiles?.[driver.id]?.[1] || driver.name.split(' ').at(-1);
  }
  // each driver's standing: the place of the driver's peak in the order of all drivers, from 0 (the lowest) to 1 (the highest)
  const ordered = [...drivers.values()].sort((x, y) => x.peak - y.peak);
  ordered.forEach((driver, index) => (driver.standing = index / Math.max(1, ordered.length - 1)));
  // a surname two drivers share does not say which: they are named in full; a page is linked only where its address is the name's own
  const count = (values) => values.reduce((found, value) => found.set(value, (found.get(value) ?? 0) + 1), new Map());
  const surnames = count([...drivers.values()].map((driver) => driver.surname));
  const addresses = count([...drivers.values()].map((driver) => addressName(driver.name)));
  const known = new Map(); // of the drivers who share a surname, the far better known one keeps it alone ("Verstappen"; "Jos Verstappen")
  for (const driver of drivers.values())
    known.set(
      driver.surname,
      [...(known.get(driver.surname) ?? []), driver].sort((x, y) => y.interest - x.interest),
    );
  for (const driver of drivers.values()) {
    const [first, second] = known.get(driver.surname);
    driver.short =
      surnames.get(driver.surname) === 1 || (driver === first && first.interest >= 2 * second.interest) ? driver.surname : driver.name;
    driver.path = addresses.get(addressName(driver.name)) === 1 ? `/drivers/${addressName(driver.name)}` : null;
  }
  return { drivers, pairs, now };
}

/** Every car in the ratings, with how wanted its page is. */
function carsOf(model, now) {
  const cars = new Map();
  const onGrid = new Set(model.snaps.at(-1).cars.map((row) => String(row.constructorId)));
  for (const snap of model.snaps)
    for (const row of snap.cars) {
      const id = String(row.constructorId);
      if (!cars.has(id)) cars.set(id, { id, name: row.name, peak: -Infinity, races: 0, last: snap.year });
      const car = cars.get(id);
      car.peak = Math.max(car.peak, row.overall);
      car.races++;
      car.last = snap.year;
    }
  const latest = new Map(model.snaps.at(-1).cars.map((row) => [String(row.constructorId), row.overall]));
  const addresses = new Map();
  for (const car of cars.values()) addresses.set(addressName(car.name), (addresses.get(addressName(car.name)) ?? 0) + 1);
  for (const car of cars.values()) {
    car.current = onGrid.has(car.id);
    const presence = 0.35 + 0.65 * clamp(car.races / FULL_CAREER);
    const recency = 0.25 + 0.75 * Math.exp(-(now - car.last) / RECENCY_YEARS);
    car.interest = car.current
      ? (0.3 + 0.7 * clamp((latest.get(car.id) - 960) / 100)) * presence // a car now: how fast it is now
      : (0.2 + 0.8 * clamp((car.peak - 1000) / 80)) * Math.max(recency, car.peak > 1080 ? LEGEND : 0) * presence; // a car of the past: its best
    car.path = addresses.get(addressName(car.name)) === 1 ? `/teams/${addressName(car.name)}` : null;
  }
  return cars;
}

/** The most wanted duels of two drivers, `counts` of each kind ({better, worse}), the more wanted driver first: [{a, b, kind, score}]. */
function rankDuels(drivers, counts) {
  const candidates = [...drivers.values()].sort((x, y) => y.interest - x.interest).slice(0, DUEL_CANDIDATES);
  const duels = [];
  for (let i = 0; i < candidates.length; i++)
    for (let j = i + 1; j < candidates.length; j++)
      duels.push({ a: candidates[i], b: candidates[j], ...pairScores(candidates[i], candidates[j]) });
  return ['better', 'worse'].flatMap((kind) =>
    duels
      .filter((duel) => duel[kind] > 0)
      .sort((x, y) => y[kind] - x[kind])
      .slice(0, counts[kind])
      .map((duel) => ({ a: duel.a, b: duel.b, kind, score: duel[kind] })),
  );
}

/** The page of two drivers: their teammates' page if they were teammates for long enough, otherwise the page comparing them (null without pages). */
function duelPath(a, b, pairs) {
  if (!a.path || !b.path) return null;
  const together = pairs.get([a.id, b.id].sort().join(':'));
  return together && together.races >= TEAMMATE_PAGE_MINIMUM_RACES ? teammatePath(a.path, b.path) : comparisonPath(a.path, b.path);
}

/**
 * The pairs of drivers with a page comparing them (written by tools/driver-and-team-pages.mjs): the duels that may be asked about (DUEL_PAGES of each
 * kind) whose drivers were not teammates for long enough to have a teammates' page, the more wanted first: [{ids: [a, b], path}].
 */
export function comparedPairs(model, profiles, champions = []) {
  const { drivers, pairs } = driversOf(model, profiles, champions);
  const found = new Map();
  for (const { a, b } of rankDuels(drivers, DUEL_PAGES)) {
    const path = duelPath(a, b, pairs);
    if (path?.startsWith('/compare/') && !found.has(path)) found.set(path, { ids: [a.id, b.id], path });
  }
  return [...found.values()];
}

/** The questions that need no ratings (the findings, and the present): the feed starts with them, before the ratings arrive. */
export function questionsWithoutRatings() {
  return [
    ...Object.entries(INSIGHT_WEIGHT).map(([id, weight]) => ({
      kind: 'insight',
      text: INSIGHT_PAGES[id].heading,
      href: `/insights/${INSIGHT_PAGES[id].slug}`,
      score: weight,
      topic: `insight:${id}`,
    })),
    ...NOW_QUESTIONS.map(([text, href, weight]) => ({ kind: 'now', text, href, score: weight, topic: `now:${href}` })),
  ];
}

/** How wanted a comparison of two drivers is, as better ones (`better`) or as worse ones (`worse`). */
export function pairScores(a, b) {
  const gap = a.last < b.first ? b.first - a.last : b.last < a.first ? a.first - b.last : 0; // years between the two careers (0: they overlap)
  const sameEra = Math.exp(-gap / ERA_YEARS);
  const strong = Math.sqrt(a.excellence * b.excellence);
  const weak = Math.sqrt(a.weakness * b.weakness);
  const base = Math.sqrt(a.interest * b.interest);
  return {
    better: base * Math.max(sameEra, 0.85 * strong ** 2) * (0.3 + 0.7 * strong) * alike(a.standing, b.standing), // legends across eras too
    // two poor drivers of the same years, close in level, remembered: the poor drivers people joke about are recent ones
    worse: weak > 0.15 ? base * sameEra * (0.6 + 0.4 * weak) * close(a.level, b.level, 25) * Math.sqrt(Math.min(a.recency, b.recency)) : 0,
  };
}

/**
 * The questions, with their pages and scores, from the displayed ratings (state.displayModel), the drivers' names (state.profiles) and the points
 * leaders of each season (INSIGHTS_DATA.champions).
 * @returns {{kind: string, text: string, href: string, score: number, topic: string}[]} the most wanted first
 */
export function questionPool(model, profiles, champions = []) {
  const { drivers, pairs, now } = driversOf(model, profiles, champions);
  const cars = carsOf(model, now);
  const questions = questionsWithoutRatings();
  const add = (kind, text, href, score, topic, extra = {}) => {
    if (score > 0.002) questions.push({ kind, text, href, score, topic, ...extra });
  };

  const ranked = [...drivers.values()].sort((x, y) => y.interest - x.interest);
  // two drivers, the more wanted named first, on the page of the two (their teammates' page, if they were teammates for long enough)
  for (const { a, b, kind, score } of rankDuels(drivers, DUELS)) {
    const href = duelPath(a, b, pairs) ?? `/head-to-head?a=${a.id}&b=${b.id}`;
    const text = kind === 'better' ? `Who is better: ${a.short} or ${b.short}?` : `Who is worse: ${a.short} or ${b.short}?`;
    add(kind === 'better' ? 'versus' : 'worse', text, href, score, `pair:${[a.id, b.id].sort().join(':')}`);
  }

  // two teammates, on their page: a battle in the same car is wanted for its own sake, more so between two very good or two very poor drivers
  for (const pair of pairs.values()) {
    const [a, b] = pair.ids.map((id) => drivers.get(id)).sort((x, y) => y.interest - x.interest);
    if (pair.races < TEAMMATE_PAGE_MINIMUM_RACES || !a.path || !b.path) continue;
    const extremes = Math.max(Math.sqrt(a.excellence * b.excellence), Math.sqrt(a.weakness * b.weakness));
    const score = Math.sqrt(a.interest * b.interest) * (0.4 + 0.6 * extremes) * alike(a.standing, b.standing);
    add(
      'teammates',
      `${a.short} or ${b.short}: who won the battle at ${pair.team}?`,
      teammatePath(a.path, b.path),
      score,
      `pair:${pair.ids.join(':')}`,
    );
  }

  // one driver: against every teammate (the Graph), over a career (History), and on their own page
  const mates = new Map();
  for (const pair of pairs.values()) for (const id of pair.ids) mates.set(id, (mates.get(id) ?? 0) + 1);
  for (const driver of ranked.slice(0, 80)) {
    const topic = `driver:${driver.id}`;
    if ((mates.get(driver.id) ?? 0) >= 2)
      add(
        'graph',
        `How does ${driver.short} compare with every teammate?`,
        `/graph?v=1&driver=${driver.id}`,
        driver.interest * clamp(mates.get(driver.id) / 3),
        topic,
      );
    const career = driver.current
      ? `How has ${driver.short}’s rating changed since ${driver.first}?`
      : driver.first === driver.last
        ? `How did ${driver.short}’s rating change in ${driver.first}?`
        : `How did ${driver.short}’s rating change from ${driver.first} to ${driver.last}?`;
    add('career', career, `/history?v=1&h=driver&drivers=${driver.id}&from=${driver.first}&to=${driver.last}`, driver.interest, topic);
    if (driver.path) add('driver', `How good is ${driver.short} without the car?`, driver.path, driver.interest, topic);
  }

  // a car, on its page
  for (const car of cars.values()) {
    if (!car.path) continue;
    const text = car.current ? `How fast is the ${car.name} car right now?` : `How fast was the ${car.name} car at its best?`;
    add('car', text, car.path, car.interest, `car:${car.id}`);
  }

  // the ratings at the end of each finished season, the recent ones most
  for (const year of new Set(model.snaps.map((snap) => snap.year)))
    if (year < now)
      add('season', `Who was the best F1 driver in ${year}?`, seasonPath(year), 0.3 + 0.7 * Math.exp(-(now - year) / 8), `season:${year}`);

  const seen = new Set();
  return questions.sort((x, y) => y.score - x.score).filter((question) => !seen.has(question.text) && seen.add(question.text));
}

/**
 * The next question for the feed: a kind drawn by its share of the mix (KIND_SHARE), less likely for each question of it on the screen, then a
 * question of that kind drawn with a chance that goes with its score (to the power SHARPNESS), among those whose topic is neither on the screen
 * nor among the recent ones. `kindsOnScreen` lists the kinds of the questions on the screen; `random` is a number generator in [0, 1) (tests pass a
 * fixed one).
 */
export function drawQuestion(pool, excludedTopics, random = Math.random, kindsOnScreen = []) {
  const byKind = new Map();
  for (const question of pool)
    if (!excludedTopics.has(question.topic)) byKind.set(question.kind, [...(byKind.get(question.kind) ?? []), question]);
  if (!byKind.size) return null;
  const crowding = (kind) => CROWDED ** kindsOnScreen.filter((shown) => shown === kind).length;
  const pick = (items, weights) => {
    let target = random() * weights.reduce((sum, weight) => sum + weight, 0);
    for (let i = 0; i < items.length; i++) if ((target -= weights[i]) < 0) return items[i];
    return items.at(-1);
  };
  const kinds = [...byKind.keys()];
  const kind = pick(
    kinds,
    kinds.map((name) => (KIND_SHARE[name] ?? 0) * crowding(name)),
  );
  const questions = byKind.get(kind);
  return pick(
    questions,
    questions.map((question) => question.score ** SHARPNESS),
  );
}
