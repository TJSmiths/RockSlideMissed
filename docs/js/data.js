// Loads the game data and this format's usage data (gzipped JSON, unpacked here:
// GitHub Pages serves .gz files as they are).
let dex = null;
const loaded = {};

export async function loadDex() {
  if (!dex) dex = await (await fetch('data/dex.json')).json();
  return dex;
}

export async function loadFormat(key) {
  if (loaded[key]) return loaded[key];
  const res = await fetch(`data/${key}.json.gz`);
  if (!res.ok) throw new Error(`could not load data/${key}.json.gz (${res.status})`);
  const text = await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).text();
  loaded[key] = JSON.parse(text);
  return loaded[key];
}
