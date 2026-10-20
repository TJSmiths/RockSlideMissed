// Teams: find tournament teams and open sheets of high-rated ladder games by the
// Pokemon, moves and items on them; open one to see each set, copy its Showdown
// text or load it into Build; "usual sets" for each searched Pokemon (the
// reference for a closed team sheet).
import {api, apiFormat} from '../api.js';
import {clear, el, typeChip} from '../util.js';

let state = {species: [], moves: [], items: [], movesOn: false, source: 'all', results: null, picked: null, sets: []};
let names = null;   // suggestions for the filter boxes
let onLoad = null;  // loads a team's text into the Build tab
let onPractice = null;  // starts Practice with a team as the bot's

// A filter box: type (3+ letters for suggestions), Enter or comma adds a tag.
function tagBox(label, key, listId, placeholder, root, store) {
  const input = el('input', {type: 'text', placeholder, 'aria-label': label});
  const sync = () => { if (input.value.trim().length >= 3) input.setAttribute('list', listId); else input.removeAttribute('list'); };
  const add = () => {
    const v = input.value.replace(/,$/, '').trim();
    if (v && !state[key].includes(v)) state[key].push(v);
    input.value = '';
    renderTeams(root, store);
  };
  input.addEventListener('input', () => { sync(); if (input.value.endsWith(',')) add(); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (input.value.trim()) add(); else runSearch(root, store); } });
  input.addEventListener('change', () => { if (input.value.trim()) add(); });
  return el('div', {class: 'tagbox'},
    el('span', {class: 'blabel', text: label}),
    el('div', {class: 'tags'}, ...state[key].map(v => el('span', {class: 'tag'}, v,
      el('button', {class: 'tagx', 'aria-label': `remove ${v}`, text: '×', onclick: () => { state[key] = state[key].filter(x => x !== v); renderTeams(root, store); }}))),
    input));
}

async function runSearch(root, store) {
  const q = new URLSearchParams({species: state.species.join(','), moves: state.moves.join(','), items: state.items.join(','),
    source: state.source, moves_on_species: state.movesOn && state.species.length ? 'true' : 'false', limit: '60'});
  const r = await api.get(`/api/teams/search?${q}`);
  state.results = r.ok ? r.data : {error: (r.data && r.data.error) || 'Search failed.'};
  state.picked = null;
  state.sets = [];
  for (const n of state.species) {
    const s = await api.get(`/api/teams/sets?species=${encodeURIComponent(n)}`);
    if (s.ok) state.sets.push(s.data);
  }
  renderTeams(root, store);
}

async function pick(root, store, id) {
  const r = await api.get(`/api/teams/export?id=${encodeURIComponent(id)}`);
  state.picked = r.ok ? r.data : {error: 'Could not load that team.'};
  renderTeams(root, store);
  const d = root.querySelector('.team-detail');
  if (d) d.scrollIntoView({behavior: 'smooth', block: 'start'});
}

function badge(t) {
  if (t.source === 'tournament') {
    const p = t.placement;
    return el('span', {class: `badge ${p === 1 ? 'gold' : p && p <= 4 ? 'silver' : 'plain'}`, text: p ? `#${p}` : 'event'});
  }
  return el('span', {class: `badge ${t.won ? 'win' : t.won === 0 ? 'loss' : 'plain'}`, text: `${t.rating || '?'}${t.won ? ' · W' : t.won === 0 ? ' · L' : ''}`});
}

function memberTile(m, highlight) {
  const moveHit = (m.moves || []).filter(x => highlight.has(x.toLowerCase()));
  return el('div', {class: `mtile${moveHit.length ? ' hit' : ''}`},
    el('div', {class: 'mname', text: m.species}),
    el('div', {class: 'types'}, ...(m.types || []).map(typeChip)),
    el('div', {class: 'small dim mitem', text: m.item || '—'}),
    moveHit.length ? el('div', {class: 'small mhit', text: moveHit.join(', ')}) : null);
}

function teamCard(t, root, store, highlight) {
  const sub = t.source === 'tournament' ? [t.event, t.record].filter(Boolean).join(' · ') : 'ladder sheet (1300+)';
  return el('div', {class: `tcard${state.picked && state.picked.id === t.id ? ' active' : ''}`, tabindex: 0, 'data-team': t.id,
    onclick: () => pick(root, store, t.id), onkeydown: e => { if (e.key === 'Enter') pick(root, store, t.id); }},
    el('div', {class: 'tcard-head'}, badge(t), el('span', {class: 'small dim tsub', text: sub}),
      onLoad ? el('button', {class: 'iconbtn tbuild', title: 'open this team in Build', text: 'Open in Build', onclick: async e => {
        e.stopPropagation();
        const r = await api.get(`/api/teams/export?id=${encodeURIComponent(t.id)}`);
        if (r.ok) onLoad(r.data.text);
      }}) : null,
      onPractice ? el('button', {class: 'iconbtn tbuild', title: 'the bot plays this team in Practice', text: 'Practice against', onclick: async e => {
        e.stopPropagation();
        const r = await api.get(`/api/teams/export?id=${encodeURIComponent(t.id)}`);
        if (r.ok) onPractice(t.label, r.data.text);
      }}) : null),
    el('div', {class: 'mgrid'}, ...(t.members || []).map(m => memberTile(m, highlight))));
}

function setCard(s) {
  const sp = Object.entries(s.stat_points || {}).map(([k, v]) => `${v} ${({hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe'})[k]}`).join(' / ');
  return el('div', {class: 'scard'},
    el('div', {class: 'scard-head'}, el('strong', {text: s.species}), el('div', {class: 'types'}, ...(s.types || []).map(typeChip))),
    el('div', {class: 'small'}, el('span', {class: 'dim', text: 'Item '}), s.item || '—'),
    el('div', {class: 'small'}, el('span', {class: 'dim', text: 'Ability '}), s.ability || '—'),
    el('div', {class: 'small'}, el('span', {class: 'dim', text: 'Nature '}), s.nature || '—', sp ? el('span', {class: 'dim', text: ` · ${sp}`}) : null),
    el('ul', {class: 'smoves'}, ...(s.moves || []).map(m => el('li', {text: m}))));
}

function setsCard(s) {
  if (!s.n) return el('div', {class: 'setcard'}, el('strong', {text: s.species}), el('p', {class: 'small dim', text: 'No sets on record.'}));
  const row = (label, xs) => el('div', {class: 'small'}, el('span', {class: 'dim', text: `${label}: `}),
    xs.map(x => `${x.name} ${Math.round(100 * x.share)}%`).join(' · '));
  return el('div', {class: 'setcard'},
    el('div', {}, el('strong', {text: s.species}), el('span', {class: 'small dim', text: ` · ${s.n} sets`})),
    row('Item', s.items), row('Ability', s.abilities), row('Nature', s.natures), row('Moves', s.moves));
}

let lastFormat = null;

export async function renderTeams(root, store, load, practiceWith) {
  if (lastFormat !== apiFormat.value) {  // VGC / singles switched: their own teams and suggestions
    lastFormat = apiFormat.value; names = null;
    state = {...state, results: null, picked: null, sets: []};
  }
  if (load) onLoad = load;
  if (practiceWith) onPractice = practiceWith;
  if (!names) {
    const r = await api.get('/api/teams/names');
    names = r.ok ? r.data : {species: [], moves: [], items: []};
  }
  const source = el('select', {'aria-label': 'source', onchange: e => { state.source = e.target.value; }},
    ...[['all', 'All teams'], ['tournament', 'Tournament teams'], ['ladder', 'Ladder sheets (1300+)']].map(([v, t]) =>
      el('option', {value: v, text: t, selected: state.source === v})));
  const movesOn = el('label', {class: 'small checkline'},
    el('input', {type: 'checkbox', checked: state.movesOn, onchange: e => { state.movesOn = e.target.checked; }}),
    ' moves must be on these Pokemon');
  const opp = store.board ? [...store.board.opp.active.filter(Boolean), ...store.board.opp.bench].map(m => m.name) : [];
  const filters = el('div', {class: 'tfilters'},
    tagBox('Pokemon', 'species', 'tn-species', 'e.g. Gengar', root, store),
    tagBox('Moves', 'moves', 'tn-moves', 'e.g. Perish Song', root, store),
    tagBox('Items', 'items', 'tn-items', 'e.g. Focus Sash', root, store),
    el('div', {class: 'tfilter-actions'}, source, movesOn,
      el('button', {class: 'btn', text: 'Search', onclick: () => runSearch(root, store)}),
      opp.length ? el('button', {class: 'btn secondary', text: "Use my opponent's team", onclick: () => {
        state.species = opp.slice(0, 6); runSearch(root, store);
      }}) : null,
      el('button', {class: 'btn secondary', text: 'Clear', onclick: () => {
        state = {...state, species: [], moves: [], items: [], results: null, picked: null, sets: []}; renderTeams(root, store);
      }})),
    el('datalist', {id: 'tn-species'}, ...names.species.map(x => el('option', {value: x}))),
    el('datalist', {id: 'tn-moves'}, ...names.moves.map(x => el('option', {value: x}))),
    el('datalist', {id: 'tn-items'}, ...names.items.map(x => el('option', {value: x}))));
  const res = state.results;
  const highlight = new Set(state.moves.map(m => m.toLowerCase()));
  let list = el('p', {class: 'dim', text: 'Add Pokemon, moves or items (all must be on a team), then Search.'});
  if (res && res.error) list = el('p', {class: 'validation', text: res.error});
  else if (res) {
    list = el('div', {},
      el('p', {class: 'small dim', text: `${res.total} teams (${res.tournament} tournament, ${res.ladder} ladder sheets)${res.total > res.teams.length ? ` · showing ${res.teams.length}` : ''}`}),
      el('div', {class: 'tcards'}, ...res.teams.map(t => teamCard(t, root, store, highlight))));
  }
  let detail = null;
  if (state.picked && state.picked.error) detail = el('p', {class: 'validation', text: state.picked.error});
  else if (state.picked) {
    const p = state.picked;
    const text = el('textarea', {rows: 14, class: 'mono', 'aria-label': 'team text'});
    text.value = p.text;
    const status = el('span', {class: 'small dim', 'aria-live': 'polite'});
    detail = el('div', {class: 'team-detail panel'},
      el('h2', {text: p.label}),
      p.note ? el('p', {class: 'small dim', text: p.note}) : null,
      el('div', {class: 'scards'}, ...(p.sets || []).map(setCard)),
      el('div', {class: 'actions'},
        el('button', {class: 'btn', text: 'Copy Showdown text', onclick: async () => {
          try { await navigator.clipboard.writeText(text.value); status.textContent = 'Copied: paste it into the Showdown teambuilder (Import).'; }
          catch (e) { text.select(); status.textContent = 'Press Ctrl+C.'; }
        }}),
        onLoad ? el('button', {class: 'btn secondary', text: 'Open in Build', onclick: () => onLoad(text.value)}) : null,
        onPractice ? el('button', {class: 'btn secondary', text: 'Practice against this', onclick: () => onPractice(p.label, text.value)}) : null,
        status),
      el('details', {}, el('summary', {text: 'Showdown text'}), text));
  }
  clear(root, el('h2', {text: apiFormat.value === 'singles' ? 'Teams: singles (BSS)' : 'Teams: VGC'}), filters, detail,
    state.sets.length ? el('details', {class: 'usualsets'}, el('summary', {text: 'Usual sets of these Pokemon (for closed sheets)'}),
      el('div', {class: 'setcards'}, ...state.sets.map(setsCard))) : null,
    list);
}
