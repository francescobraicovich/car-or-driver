// Mutable app-wide state. Modules share this singleton instead of globals.

export const state = {
  model: null, // the joint state-space ratings, loaded from data/model.json (see model-loader.js)
  raceIndex: 0, // the weekend the ratings page shows (index into model.snaps)
};
