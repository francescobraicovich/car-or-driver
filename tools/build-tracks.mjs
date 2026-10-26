// Builds site/assets/tracks.json: the outline of every circuit that can be drawn on the front page, from the GeoJSON files in
// data/source/f1-circuits/ (bacinger/f1-circuits, MIT licence; see data/source/f1-circuits/LICENSE.md). Each outline is a closed list of points,
// in the direction the cars race, starting at the start/finish line, projected to a flat plan and scaled to fit a 1000-unit square. The page smooths
// the points into a curve (site/js/track-geometry.js). Run after changing the source files or this tool:
//   node tools/build-tracks.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { csv } from '../packages/core/src/csv.js';
import { speedProfile } from '../site/js/speed-profile.js';

export const TRACK_FORMAT = 2;
const SOURCE = 'data/source/f1-circuits/circuits';
const SIZE = 1000; // the longer side of the plan, in units
const PADDING = 24; // room for the stroke and the dots at the edge

/** Our circuit (the circuitRef of data/circuits.csv) -> the file of the source that outlines it. Valencia, Fuji, Korea and India are not in the source. */
export const SOURCE_FILES = {
  albert_park: 'au-1953',
  sepang: 'my-1999',
  shanghai: 'cn-2004',
  bahrain: 'bh-2002',
  catalunya: 'es-1991',
  monaco: 'mc-1929',
  istanbul: 'tr-2005',
  silverstone: 'gb-1948',
  nurburgring: 'de-1927',
  hungaroring: 'hu-1986',
  spa: 'be-1925',
  monza: 'it-1922',
  marina_bay: 'sg-2008',
  suzuka: 'jp-1962',
  interlagos: 'br-1940',
  yas_marina: 'ae-2009',
  villeneuve: 'ca-1978',
  magny_cours: 'fr-1960',
  hockenheimring: 'de-1932',
  indianapolis: 'us-1909',
  imola: 'it-1953',
  red_bull_ring: 'at-1969',
  americas: 'us-2012',
  sochi: 'ru-2014',
  rodriguez: 'mx-1962',
  baku: 'az-2016',
  ricard: 'fr-1969',
  mugello: 'it-1914',
  portimao: 'pt-2008',
  losail: 'qa-2004',
  zandvoort: 'nl-1948',
  jeddah: 'sa-2021',
  miami: 'us-2022',
  vegas: 'us-2023',
  madring: 'es-2026',
};

/**
 * The source draws these two against the way they are raced (Wikipedia's list of Formula One circuits gives the directions: Paul Ricard is
 * clockwise, Marina Bay anticlockwise; the other 33 outlines agree with it, and Suzuka is a figure of eight). The start/finish point stays where it is.
 */
export const REVERSED = ['ricard', 'marina_bay'];

const EARTH_RADIUS = 6371008.8;
const radians = (degrees) => (degrees * Math.PI) / 180;

/** Great-circle length of a list of [longitude, latitude] points, in metres. */
export function pathLength(points) {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const [lon1, lat1] = points[i - 1];
    const [lon2, lat2] = points[i];
    const a =
      Math.sin(radians(lat2 - lat1) / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(radians(lon2 - lon1) / 2) ** 2;
    length += 2 * EARTH_RADIUS * Math.asin(Math.sqrt(a));
  }
  return length;
}

/**
 * The outline for one circuit: `coordinates` are the source's [longitude, latitude] points of a closed loop (the last equals the first), and `length` is
 * the length of a lap in metres. Returns the plan { width, height, points: [x0, y0, x1, y1, ...], speeds } with y pointing down (north is up) and the loop
 * open (the first point is not repeated); `speeds` is how fast a car goes at 200 equal steps round the lap, in km/h (speed-profile.js), worked out from
 * the points before they are rounded to whole units, which would put noise into the curvature.
 */
export function outline(coordinates, { reverse = false, length } = {}) {
  let loop = coordinates.slice(0, -1);
  if (reverse) loop = [loop[0], ...loop.slice(1).reverse()];
  const middle = loop.reduce((sum, [, lat]) => sum + lat, 0) / loop.length;
  const flat = loop.map(([lon, lat]) => [radians(lon) * Math.cos(radians(middle)) * EARTH_RADIUS, -radians(lat) * EARTH_RADIUS]);
  const xs = flat.map(([x]) => x);
  const ys = flat.map(([, y]) => y);
  const [left, top] = [Math.min(...xs), Math.min(...ys)];
  const [wide, tall] = [Math.max(...xs) - left, Math.max(...ys) - top];
  const scale = (SIZE - 2 * PADDING) / Math.max(wide, tall);
  const plan = flat.flatMap(([x, y]) => [(x - left) * scale + PADDING, (y - top) * scale + PADDING]);
  return {
    width: Math.round(wide * scale + 2 * PADDING),
    height: Math.round(tall * scale + 2 * PADDING),
    points: plan.map((value) => Math.round(value)),
    speeds: speedProfile(plan, length),
  };
}

if (import.meta.url === new URL(process.argv[1], 'file://').href) {
  const circuits = csv(await readFile('data/circuits.csv', 'utf8'));
  const tracks = {};
  for (const circuit of circuits) {
    const file = SOURCE_FILES[circuit.circuitRef];
    if (!file) continue;
    const feature = JSON.parse(await readFile(`${SOURCE}/${file}.geojson`, 'utf8')).features[0];
    tracks[circuit.circuitId] = {
      name: circuit.name,
      length: feature.properties.length,
      ...outline(feature.geometry.coordinates, { reverse: REVERSED.includes(circuit.circuitRef), length: feature.properties.length }),
    };
  }
  const missing = Object.keys(SOURCE_FILES).filter((ref) => !circuits.some((circuit) => circuit.circuitRef === ref));
  if (missing.length) throw new Error(`not in data/circuits.csv: ${missing.join(', ')}`);
  const credit =
    'Circuit outlines: bacinger/f1-circuits (MIT licence, Copyright (c) 2019-2025 Tomislav Bacinger), https://github.com/bacinger/f1-circuits. Projected, scaled and, for two circuits, reversed in direction by this project. Not approved or endorsed by Formula One Licensing B.V.';
  const lines = Object.entries(tracks).map(([id, track]) => `  ${JSON.stringify(id)}: ${JSON.stringify(track)}`);
  const text = `{\n "format": ${TRACK_FORMAT},\n "credit": ${JSON.stringify(credit)},\n "tracks": {\n${lines.join(',\n')}\n }\n}\n`;
  await writeFile('site/assets/tracks.json', text);
  console.log(`site/assets/tracks.json: ${Object.keys(tracks).length} circuits, ${(text.length / 1e3).toFixed(0)} kB`);
}
