// Where the files of the website are served. The site's own files (site/) are at the root of the address space; the browser modules of the model
// (packages/core/) and the published data (data/) keep their repository paths. The local server, the publishing script and the tests share this
// map, so a page works the same locally and when deployed.
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPOSITORY_FOLDERS = ['data', 'packages'];

/** The repository file served at an address path: `/css/styles.css` is site/css/styles.css, `/data/model.json` is data/model.json. */
export function repositoryFile(pathname, root = ROOT) {
  const [first] = pathname.split('/').filter(Boolean);
  return join(root, REPOSITORY_FOLDERS.includes(first) ? '' : 'site', pathname);
}

/** The address path of a repository file (the inverse of repositoryFile). */
export function sitePath(file, root = ROOT) {
  const site = resolve(root, 'site');
  const path = file.startsWith(site + sep) ? relative(site, file) : relative(root, file);
  return `/${path.split(sep).join('/')}`;
}
