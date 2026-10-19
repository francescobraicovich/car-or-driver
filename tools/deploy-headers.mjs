// Reads tools/deploy-headers.txt: { '/*': { 'Header-Name': 'value', ... } }. Shared by the publishing script and the local server.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const HEADERS_FILE = fileURLToPath(new URL('./deploy-headers.txt', import.meta.url));

export async function readDeployHeaders() {
  const rules = {};
  let path = null;
  for (const line of (await readFile(HEADERS_FILE, 'utf8')).split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    if (!line.startsWith(' ')) {
      path = line.trim();
      rules[path] = {};
    } else {
      const colon = line.indexOf(':');
      rules[path][line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
    }
  }
  return rules;
}
