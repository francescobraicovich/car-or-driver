// Mutable app-wide state. Modules share this singleton instead of globals.

export const state = {
  model: null, // the joint state-space ratings, loaded from data/model.json (see model-loader.js)
  retrospectiveModel: null, // historical joint refit, with current estimates kept filtered
  displayModel: null, // dated reference translations for Ratings, History and Graph only
  profiles: {}, // each rated driver's first name, surname and month of birth: { driverId: [forename, surname, 'YYYY-MM'] }
  raceIndex: 0, // the weekend the ratings page shows (index into model.snaps)
  retrospectiveSourceHash: null, // fingerprint of the historical refit implementation
  modelSourceHash: null, // the fingerprint shared by the ratings and dated graph files
};
