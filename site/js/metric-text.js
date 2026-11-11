// Plain-language names and one-line descriptions for every rating, shared by
// the Ratings, History and Head-to-head views.
export const NAMES = {
  overall: 'Overall strength',
  race: 'Race pace',
  qual: 'Qualifying pace',
  effective: 'Effective pace',
  clean: 'Clean-race probability',
  survival: 'Survival probability',
  incident: 'Incident rating',
  reliability: 'Reliability rating',
};

export const DESCRIPTIONS = {
  overall:
    'Expected race competitiveness before the weekend, learned directly from finishing order with information shared across the three outputs. Retirement risk is separate.',
  race: 'Sustained speed from matching retained laps, without awarding credit for starting ahead. Traffic, tyres and strategy can still affect it.',
  qual: 'Pace over one lap, from a valid shared qualifying phase, with format adjustments described in Methodology.',
  effective: 'Overall strength adjusted for retirement risk; retained only for older exports.',
  clean: 'Chance of finishing a standard race distance without a driver-caused retirement.',
  survival: 'Chance of the car finishing a standard race distance without a mechanical failure.',
  incident: 'How rarely a driver is involved in retirements, on the rating scale.',
  reliability: 'How rarely a car suffers a mechanical retirement, on the rating scale.',
};

export const METRICS = {
  driver: ['overall', 'race', 'qual', 'clean', 'incident'],
  car: ['overall', 'race', 'qual', 'survival', 'reliability'],
};

export const isProbability = (metric) => ['clean', 'survival'].includes(metric);
