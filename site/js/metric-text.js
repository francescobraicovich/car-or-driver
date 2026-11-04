// Plain-language names and one-line descriptions for every rating, shared by
// the Ratings, History and Head-to-head views.
export const NAMES = {
  race: 'Race pace',
  qual: 'Qualifying pace',
  effective: 'Effective pace',
  clean: 'Clean-race probability',
  survival: 'Survival probability',
  incident: 'Incident rating',
  reliability: 'Reliability rating',
};

export const DESCRIPTIONS = {
  race: 'Estimated race pace, informed by qualifying, finishing order and valid lap times.',
  qual: 'Pace over one lap, from the latest qualifying session in which both drivers set a time.',
  effective: 'The historical blend of race and qualifying pace, adjusted for the driver’s or car’s retirement risk.',
  clean: 'Chance of finishing a standard race distance without a driver-caused retirement.',
  survival: 'Chance of the car finishing a standard race distance without a mechanical failure.',
  incident: 'How rarely a driver is involved in retirements, on the rating scale.',
  reliability: 'How rarely a car suffers a mechanical retirement, on the rating scale.',
};

export const METRICS = {
  driver: ['race', 'qual', 'effective', 'clean', 'incident'],
  car: ['race', 'qual', 'effective', 'survival', 'reliability'],
};

export const isProbability = (metric) => ['clean', 'survival'].includes(metric);
