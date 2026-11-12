// Exercise the packed covariance format using JavaScript DataView and gzip decoding.
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

const root = 'tmp/retrospective-refit';
const [metadataFile, covarianceFile, originalFile] = await Promise.all([
  readFile(`${root}/artifact-metadata.json.gz`),
  readFile(`${root}/artifact-covariance-f32.bin.gz`),
  readFile(`${root}/result.json`, 'utf8'),
]);
const metadata = JSON.parse(gunzipSync(metadataFile).toString('utf8'));
const bytes = gunzipSync(covarianceFile);
const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const original = JSON.parse(originalFile);
if (metadata.format !== 'retrospective-packed-f32-research-v1' || metadata.blocks.length !== original.history.length)
  throw Error('Unexpected artifact format or weekend count');
if (JSON.stringify(metadata.history) !== JSON.stringify(original.history)) throw Error('History mismatch');
let values = 0;
for (let index = 0; index < metadata.blocks.length; index++) {
  const packed = metadata.blocks[index];
  const source = original.covariance[String(index)];
  if (JSON.stringify(packed.keys) !== JSON.stringify(source.keys)) throw Error(`Covariance keys differ at ${index}`);
  let offset = packed.offset;
  for (let row = 0; row < source.matrix.length; row++) {
    for (let column = row; column < source.matrix.length; column++) {
      const actual = data.getFloat32(offset++ * 4, true);
      if (actual !== Math.fround(source.matrix[row][column])) throw Error(`Value mismatch at ${index}:${row}:${column}`);
      values++;
    }
  }
  if (offset - packed.offset !== packed.length) throw Error(`Block length differs at ${index}`);
  if (index && packed.offset !== metadata.blocks[index - 1].offset + metadata.blocks[index - 1].length)
    throw Error(`Block offset differs at ${index}`);
}
if (values * 4 !== bytes.byteLength) throw Error('Packed byte count differs');
const report = {
  weekends: metadata.blocks.length,
  float32Values: values,
  bytes: bytes.byteLength,
  verified: true,
  limitations:
    'Node gzip and JavaScript DataView were verified. Browser delivery, decompression support, loader integration and names/hazards metadata remain untested.',
};
await writeFile('research/retrospective-refit/verification-packed-artifact.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
