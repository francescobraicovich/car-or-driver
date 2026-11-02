// Race-level ranking metrics. Larger strength means a better predicted finish.
export function scoreRace(entries) {
  if (entries.length < 2) throw Error('A race needs at least two entrants');
  if (entries.some((entry) => !Number.isFinite(entry.strength) || !Number.isInteger(entry.position) || entry.position < 1))
    throw Error('Every entrant needs a finite strength and a positive integer position');
  if (new Set(entries.map((entry) => entry.position)).size !== entries.length) throw Error('Finishing positions must be unique');

  // Average ranks avoid resolving a forecast tie using the observed result.
  const predicted = [...entries].sort((a, b) => b.strength - a.strength);
  const ranks = new Map();
  for (let first = 0; first < predicted.length;) {
    let last = first + 1;
    while (last < predicted.length && predicted[last].strength === predicted[first].strength) last++;
    const rank = (first + 1 + last) / 2;
    for (let index = first; index < last; index++) ranks.set(predicted[index], rank);
    first = last;
  }
  const observed = [...entries].sort((a, b) => a.position - b.position);
  let concordance = 0;
  for (let first = 0; first < observed.length; first++)
    for (let second = first + 1; second < observed.length; second++)
      concordance += Math.sign(observed[first].strength - observed[second].strength);
  return {
    entrants: entries.length,
    kendallTau: concordance / ((entries.length * (entries.length - 1)) / 2),
    meanAbsoluteError: observed.reduce((sum, entry, index) => sum + Math.abs(ranks.get(entry) - (index + 1)), 0) / entries.length,
  };
}

export function aggregateRaces(races) {
  if (!races.length) throw Error('No races to score');
  const entrants = races.reduce((sum, race) => sum + race.entrants, 0);
  return {
    races: races.length,
    entrants,
    kendallTau: races.reduce((sum, race) => sum + race.kendallTau, 0) / races.length,
    meanAbsoluteError: races.reduce((sum, race) => sum + race.meanAbsoluteError * race.entrants, 0) / entrants,
    meanRaceAbsoluteError: races.reduce((sum, race) => sum + race.meanAbsoluteError, 0) / races.length,
  };
}
