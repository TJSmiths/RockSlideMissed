// The trainer's /api/build and /api/teams endpoints, answered in the browser
// (tb.js) instead of by a server: the panels are unchanged.
import {loadDex, loadFormat} from './data.js';
import * as TB from './tb.js';

export const apiFormat = {value: (() => {
  try { return localStorage.getItem('vgc-build-format') || 'vgc'; } catch (e) { return 'vgc'; }
})()};

let current = null;
export async function ready() {
  if (current !== apiFormat.value) {
    const [dex, data] = await Promise.all([loadDex(), loadFormat(apiFormat.value)]);
    TB.setData(dex, data, apiFormat.value);
    current = apiFormat.value;
  }
}
const list = (x, n) => String(x || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, n);
const members = (b, n) => (b.team || []).filter(m => m && m.species).slice(0, n);

const ROUTES = {
  'GET /api/build/species': () => ({species: TB.speciesList()}),
  'GET /api/build/suggest': q => TB.suggestSet(q.get('species') || ''),
  'POST /api/build/stats': (q, b) => TB.statsRequest(b),
  'POST /api/build/autospread': (q, b) => TB.autoSpreadRequest(b),
  'POST /api/build/benchmarks': (q, b) => TB.benchmarks(b),
  'POST /api/build/complete': (q, b) => TB.completeSet(b.species || '', members(b, 5), b.fixed || {}),
  'POST /api/build/coverage': (q, b) => TB.analyse(members(b, 6)),
  'POST /api/build/teammates': (q, b) => ({teammates: TB.teammateFit(members(b, 5))}),
  'POST /api/build/parse': (q, b) => TB.parseTeam(b.text),
  'POST /api/build/validate': (q, b) => TB.validate(b.text),
  'GET /api/teams/search': q => TB.search({species: list(q.get('species'), 6), source: q.get('source') || 'all',
    limit: Math.max(1, Math.min(200, Number(q.get('limit')) || 40)), moves: list(q.get('moves'), 8),
    items: list(q.get('items'), 6), moves_on_species: q.get('moves_on_species') === 'true'}),
  'GET /api/teams/names': () => TB.names(),
  'GET /api/teams/export': q => TB.exportTeam(q.get('id') || ''),
  'GET /api/teams/sets': q => TB.teamSets(q.get('species') || ''),
  'GET /api/myteams': () => ({teams: myTeams().sort((a, b) => b.saved - a.saved).map(t => ({...t,
    pokemon: t.text.replace(/\r/g, '').split('\n\n').filter(x => x.trim()).map(x => x.split('\n')[0].split(' @ ')[0].trim())}))}),
  'POST /api/myteams': (q, b) => {
    const name = String(b.name || '').trim().slice(0, 60), text = String(b.text || '').trim();
    if (!name || !text) return {error: 'a team needs a name and its Showdown text'};
    const teams = myTeams().filter(t => t.name.toLowerCase() !== name.toLowerCase());
    teams.push({name, text: text + '\n', saved: Date.now() / 1000});
    storeMyTeams(teams.slice(-200));
    return {name, saved: true};
  },
  'POST /api/myteams/delete': (q, b) => {
    const before = myTeams();
    const after = before.filter(t => t.name.toLowerCase() !== String(b.name || '').trim().toLowerCase());
    storeMyTeams(after);
    return {deleted: before.length - after.length};
  },
};

// Your saved teams on the website: kept in this browser (VGC and singles apart).
const myTeamsKey = () => `tb-my-teams-${apiFormat.value}`;
function myTeams() {
  try { const t = JSON.parse(localStorage.getItem(myTeamsKey())); return Array.isArray(t) ? t : []; } catch (e) { return []; }
}
function storeMyTeams(teams) {
  try { localStorage.setItem(myTeamsKey(), JSON.stringify(teams)); } catch (e) { /* private window: not kept */ }
}

async function call(method, path, body) {
  const url = new URL(path, 'http://local');
  const fn = ROUTES[`${method} ${url.pathname}`];
  if (!fn) return {ok: false, status: 404, data: {error: 'not available in the web version'}};
  try {
    await ready();
    await new Promise(r => setTimeout(r, 0));  // let "working..." messages paint first
    const data = fn(url.searchParams, body || {});
    return data == null ? {ok: false, status: 404, data: {error: 'not found'}} : {ok: true, status: 200, data};
  } catch (e) {
    console.error(e);
    return {ok: false, status: 500, data: {error: String(e.message || e)}};
  }
}

export const api = {get: path => call('GET', path), post: (path, body) => call('POST', path, body)};
