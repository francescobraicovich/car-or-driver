// Plain-language names and one-line descriptions for every rating, shared by
// the Ratings, History and Head-to-head views.
export const NAMES = {
  combined: 'Combined pace',
  race: 'Race pace',
  qual: 'Qualifying pace',
  effective: 'Effective pace',
  clean: 'Clean-race probability',
  survival: 'Survival probability',
  incident: 'Incident rating',
  reliability: 'Reliability rating',
};

export const DESCRIPTIONS = {
  combined: 'Race pace and qualifying pace together, weighted towards the race.',
  race: 'Pace over a race, from finishing order and lap times.',
  qual: 'Pace over one lap, from the latest qualifying session in which both drivers set a time.',
  effective: 'Combined pace, lowered by how often the driver (or car) fails to finish.',
  clean: 'Chance of finishing a standard race distance without a driver-caused retirement.',
  survival: 'Chance of the car finishing a standard race distance without a mechanical failure.',
  incident: 'How rarely a driver is involved in retirements, on the rating scale.',
  reliability: 'How rarely a car suffers a mechanical retirement, on the rating scale.',
};

export const METRICS = {
  driver: ['combined', 'race', 'qual', 'effective', 'clean', 'incident'],
  car: ['combined', 'race', 'qual', 'effective', 'survival', 'reliability'],
};

export const isProbability = (metric) => ['clean', 'survival'].includes(metric);
