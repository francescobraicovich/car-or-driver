// Loads the ratings. They are computed once, when the site is published (tools/build-model.mjs), so a visit downloads data/model.json and shows it;
// no model fitting runs in the browser. Display references translate the saved strengths without changing the model. The file is revalidated on every visit (an unchanged file costs a short request that the server answers with
// "not modified"), so a new publication is never hidden behind a stored copy.
import { state } from './state.js';
import { populate } from './ratings-view.js';
import { withHistories } from '../../packages/core/src/weekend-histories.js';
import { deserialize } from '../../packages/core/src/json-serialization.js';
import { centredRatings } from './rating-reference.js';

const FILE_FORMAT = 3; // must match tools/build-model.mjs

async function fetchFile(name, format = FILE_FORMAT) {
  const response = await fetch(`../data/${name}`, { cache: 'no-cache' });
  if (!response.ok) throw Error(`${name}: HTTP ${response.status}`);
  const file = deserialize(await response.text());
  if (file.format !== format) throw Error(`${name} has format ${file.format}; this page reads format ${format}. Reload the page.`);
  return file;
}

/** The Ratings page at its latest weekend: the address names no other page and no particular weekend. */
function showsRatingsFirst() {
  const [path, query = ''] = location.hash.slice(1).split('?');
  return ['', '/', '/ratings'].includes(path) && !new URLSearchParams(query).has('race');
}

/**
 * Fetch the ratings, show them and tell the pages. Throws if they cannot be had.
 * A visit to the Ratings page first fetches data/model-latest.json (the latest weekend, a few tens of kilobytes) and shows it at once; the whole
 * history (data/model.json) is fetched once that is on screen, so the two do not share the connection, and takes over when it arrives. Any other page waits for the whole file.
 */
export async function loadModel() {
  try {
    const firstScreen = showsRatingsFirst();
    const [reference, first] = await Promise.all([
      fetchFile('rating-reference.json', 1),
      fetchFile(firstScreen ? 'model-latest.json' : 'model.json'),
    ]);
    if (firstScreen) {
      const latest = first;
      state.model = latest.model;
      state.displayModel = centredRatings(latest.model, reference, latest.sourceHash);
      state.profiles = latest.driverProfiles ?? {};
      populate();
      document.body.dataset.ratingsReady = '1';
      window.dispatchEvent(new CustomEvent('f1:ratings-ready'));
    }
    const { model: shipped, driverProfiles, sourceHash } = firstScreen ? await fetchFile('model.json') : first;
    const model = withHistories(shipped);
    state.model = model;
    state.displayModel = centredRatings(shipped, reference, sourceHash);
    state.profiles = driverProfiles ?? {};
    state.modelSourceHash = sourceHash;
    populate();
    document.body.dataset.ready = '1';
    window.dispatchEvent(new CustomEvent('f1:model-ready'));
  } catch (error) {
    console.error(error);
    throw error;
  }
}
