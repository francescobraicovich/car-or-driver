// Loads the ratings. They are computed once, when the site is published (tools/build-model.mjs), so a visit downloads data/model.json and shows it;
// nothing is recomputed in the browser. The file is revalidated on every visit (an unchanged file costs a short request that the server answers with
// "not modified"), so a new publication is never hidden behind a stored copy.
import { state } from './state.js';
import { el } from './dom.js';
import { setStatus } from './utils.js';
import { populate } from './ratings-view.js';
import { withHistories } from '../../packages/core/src/weekend-histories.js';
import { deserialize } from '../../packages/core/src/json-serialization.js';

const FILE_FORMAT = 1; // must match tools/build-model.mjs

async function fetchFile(name) {
  const response = await fetch(`../data/${name}`, { cache: 'no-cache' });
  if (!response.ok) throw Error(`${name}: HTTP ${response.status}`);
  const file = deserialize(await response.text());
  if (file.format !== FILE_FORMAT)
    throw Error(`${name} has format ${file.format}; this page reads format ${FILE_FORMAT}. Reload the page.`);
  return file;
}

/** The Ratings page at its latest weekend: the address names no other page and no particular weekend. */
function showsRatingsFirst() {
  const [path, query = ''] = location.hash.slice(1).split('?');
  return ['', '/', '/ratings'].includes(path) && !new URLSearchParams(query).has('race');
}

/**
 * Fetch the ratings, show them and tell the pages. Throws (after setting the status line) if they cannot be had.
 * A visit to the Ratings page first fetches data/model-latest.json (the latest weekend, a few tens of kilobytes) and shows it at once; the whole
 * history (data/model.json) is fetched once that is on screen, so the two do not share the connection, and takes over when it arrives. Any other page waits for the whole file.
 */
export async function loadModel() {
  try {
    setStatus(el.status, 'Downloading the ratings…');
    if (showsRatingsFirst()) {
      const latest = await fetchFile('model-latest.json');
      state.model = latest.model;
      state.profiles = latest.driverProfiles ?? {};
      populate();
      setStatus(el.status, 'Latest ratings loaded; the full history is still downloading…');
      document.body.dataset.ratingsReady = '1';
      window.dispatchEvent(new CustomEvent('f1:ratings-ready'));
    }
    const { model: shipped, lastRace, driverProfiles } = await fetchFile('model.json');
    const model = withHistories(shipped);
    state.model = model;
    state.profiles = driverProfiles ?? {};
    populate();
    const through = lastRace ? ` Latest race: ${lastRace.year} round ${lastRace.round}, ${lastRace.name}.` : '';
    setStatus(el.status, `Ratings loaded: ${model.snaps.length} weekends, ${model.qualWeekends} with qualifying data.${through}`, 'ok');
    document.body.dataset.ready = '1';
    window.dispatchEvent(new CustomEvent('f1:model-ready'));
  } catch (error) {
    console.error(error);
    setStatus(el.status, `Could not load the ratings: ${error.message}`, 'bad');
    throw error;
  }
}
