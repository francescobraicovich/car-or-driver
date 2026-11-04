import { FormFeatures } from './form.js';
import { ContinuousFormFeatures } from './continuous-form.js';

/** Saved form state and forecast heads identify their feature-generation method. */
export function createFormFeatures(lapPace, method = 'continuous', options = {}) {
  if (method === 'continuous') return new ContinuousFormFeatures(lapPace);
  if (method === 'legacy') return new FormFeatures(lapPace, options);
  throw Error(`Unknown form method: ${method}`);
}
