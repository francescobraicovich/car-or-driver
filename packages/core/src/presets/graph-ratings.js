import { STATE_SPACE } from './state-space.js';

// Fixed teammate-graph contribution to each published driver rating.
export const GRAPH_RATINGS = Object.freeze({ share: 0.05, halfLifeYears: 3, annualDriftPoints: STATE_SPACE.race.yearD });
