// Convert the supplied FBX assets, then optimize and restyle them with Blender.
// Usage: node tools/build-stage-models.mjs /absolute/path/to/blender
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const directory = join(root, 'tmp/model-inspection');
await mkdir(directory, { recursive: true });
const run = (command, arguments_) => new Promise((resolve, reject) => {
  const process_ = spawn(command, arguments_, { cwd: root, stdio: 'inherit' });
  process_.on('error', reject);
  process_.on('exit', code => code === 0 ? resolve() : reject(Error(`${command} exited with ${code}`)));
});

// Blender does not import FBX 6.1. This pinned, temporary converter bakes the original seated pose.
for (const [name, fingerprint] of [
  ['ufbx.h', '05362d987b3bf646932d89758c43d94458620c409b51b06948a32d33b37472f3'],
  ['ufbx.c', '2f7dbfa8f2c7f45fe2d468b13fb8954ef8f502feb43c264c70f29007cc68fa2a'],
]) {
  const path = join(directory, name);
  let bytes;
  try { bytes = await readFile(path); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const response = await fetch(`https://raw.githubusercontent.com/ufbx/ufbx/v0.20.0/${name}`);
    if (!response.ok) throw Error(`Could not download ${name}: ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(path, bytes);
  }
  if (createHash('sha256').update(bytes).digest('hex') !== fingerprint) throw Error(`${name}: converter checksum mismatch`);
}
await run('tar', ['-xf', 'site/assets/f1-driver/source/rhp_bell_hp77_driver_f1.7z', '-C', directory]);
const converter = join(directory, 'read-stage-driver');
await run('cc', ['-O2', '-I', directory, 'tools/read-stage-driver.c', join(directory, 'ufbx.c'), '-lm', '-o', converter]);
const input = join(directory, 'driver-meshes.json');
await run(converter, [join(directory, 'rhp_bell_hp77_driver_f1/rhp_bell_hp77_driver_f1.fbx'), input]);
await run(process.argv[2] || process.env.BLENDER_BIN || '/Applications/Blender.app/Contents/MacOS/Blender', [
  '--background', '--factory-startup', '--python-exit-code', '1', '--python', 'tools/build-stage-scene.py', '--',
  '--input', input,
  '--output', join(root, 'site/assets/models'),
  '--project', join(root, 'tmp/design-preview/car-and-driver.blend'),
]);
