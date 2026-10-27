// Your saved teams (stored by the trainer in data/my_teams.json; VGC and singles apart):
// a cached list, save / delete, and a picker used by Build, Plan and Teams.
import {api} from './api.js';
import {el} from './util.js';

let cache = [];

export async function refreshMyTeams() {
  const r = await api.get('/api/myteams');
  cache = r.ok ? r.data.teams : [];
  return cache;
}

export function myTeams() { return cache; }

export async function saveMyTeam(name, text) {
  const r = await api.post('/api/myteams', {name, text});
  await refreshMyTeams();
  return r.ok ? null : ((r.data && r.data.error) || 'Could not save the team.');
}

export async function deleteMyTeam(name) {
  await api.post('/api/myteams/delete', {name});
  await refreshMyTeams();
}

// A "My teams" dropdown: choosing a team loads it (onPick(text, name)); Delete removes the
// chosen one (after a confirmation) and onDeleted(name) lets the page re-draw.
export function myTeamPicker(label, onPick, onDeleted) {
  if (!cache.length) return el('span', {class: 'small dim', text: 'No saved teams yet.'});
  const select = el('select', {'aria-label': label, onchange: e => {
    const t = cache.find(x => x.name === e.target.value);
    if (t) onPick(t.text, t.name);
  }},
  el('option', {value: '', text: `choose (${cache.length})...`}),
  ...cache.map(t => el('option', {value: t.name, text: `${t.name} · ${t.pokemon.slice(0, 6).join(', ')}`})));
  const del = el('button', {class: 'btn secondary', text: 'Delete', title: 'delete the team chosen in the list',
    'aria-label': `delete the chosen team (${label})`, onclick: async () => {
      const name = select.value;
      if (!name) { alert('Choose a team in the list first.'); return; }
      if (!confirm(`Delete "${name}" from your teams?`)) return;
      await deleteMyTeam(name);
      if (onDeleted) onDeleted(name);
    }});
  return el('span', {class: 'myteampick'}, el('label', {class: 'small'}, `${label} `, select), del);
}

// Save box: a name field and a button; text() gives the Showdown text to save.
export function saveTeamBox(text, defaultName, onDone) {
  const name = el('input', {type: 'text', placeholder: 'Team name', value: defaultName || '', 'aria-label': 'team name'});
  return el('span', {class: 'savebox'}, name,
    el('button', {class: 'btn secondary', text: 'Save to my teams', onclick: async () => {
      const t = text();
      const err = !t.trim() ? 'Nothing to save yet.' : !name.value.trim() ? 'Give the team a name first.' : await saveMyTeam(name.value, t);
      onDone(err || `Saved "${name.value.trim()}" to your teams.`);
    }}));
}
