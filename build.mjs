// Builds the static site in docs/: bundles the damage calc for the browser and
// compresses the usage data (build/data_<fmt>.json, from ProjectPoke's
// scripts/export_web.py) into docs/data/<fmt>.json.gz.
//
//   node build.mjs
import {build} from 'esbuild';
import {copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';

mkdirSync('docs/data', {recursive: true});
await build({entryPoints: ['src/calc-entry.js'], bundle: true, format: 'esm', minify: true,
  outfile: 'docs/js/calc.bundle.js', logLevel: 'warning'});
copyFileSync('build/dex.json', 'docs/data/dex.json');

for (const key of ['vgc', 'singles']) {
  const src = `build/data_${key}.json`;
  if (!existsSync(src)) { console.error(`missing ${src}: run scripts/export_web.py in ProjectPoke`); process.exit(1); }
  const body = gzipSync(readFileSync(src), {level: 9, mtime: 0});
  writeFileSync(`docs/data/${key}.json.gz`, body);
  console.log(`docs/data/${key}.json.gz: ${(body.length / 1e6).toFixed(1)} MB`);
}
console.log('docs/ is ready.');
