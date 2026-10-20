// Build: a six-slot teambuilder with suggestions from real teams (items, abilities,
// natures, moves, spreads), suggested teammates, automatic spreads against the
// major threats, import / export / legality check. The draft is kept in this
// browser (localStorage) between visits; nothing is sent anywhere else.
import {api, apiFormat} from '../api.js';
import {clear, el, typeChip} from '../util.js';

const NATURES = ['Adamant', 'Bashful', 'Bold', 'Brave', 'Calm', 'Careful', 'Docile', 'Gentle', 'Hardy', 'Hasty',
  'Impish', 'Jolly', 'Lax', 'Lonely', 'Mild', 'Modest', 'Naive', 'Naughty', 'Quiet', 'Quirky', 'Rash', 'Relaxed',
  'Sassy', 'Serious', 'Timid'];
const STATS = [['hp', 'HP'], ['atk', 'Atk'], ['def', 'Def'], ['spa', 'SpA'], ['spd', 'SpD'], ['spe', 'Spe']];
// VGC (doubles) or singles (BSS): separate drafts, data and rules.
let fmt = apiFormat.value;  // the top bar's VGC / singles switch
const keyFor = f => (f === 'singles' ? 'vgc-build-team-singles' : 'vgc-build-team');
const empty = () => ({species: '', item: '', ability: '', nature: 'Serious', moves: ['', '', '', ''],
  sp: {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0}});

let team = load();
let speciesList = null;
const sugg = {};      // species -> suggest_set result
const stats = {};     // slot -> computed stats
const autoRes = {};   // slot -> auto spread report
let mates = null;
const why = {};       // slot -> complete_set result (move reasons, team needs)
let coverage = null;  // coverage.analyse of the whole team
let message = '';
let root = null;

function load() {
  try { const t = JSON.parse(localStorage.getItem(keyFor(fmt))); if (Array.isArray(t) && t.length === 6) return t; } catch (e) { /* none */ }
  return Array.from({length: 6}, empty);
}
function save() { try { localStorage.setItem(keyFor(fmt), JSON.stringify(team)); } catch (e) { /* private window */ } }


async function suggestions(species) {
  if (!species) return null;
  if (!sugg[species]) {
    const r = await api.get(`/api/build/suggest?species=${encodeURIComponent(species)}`);
    sugg[species] = r.ok ? r.data : {n: 0};
  }
  return sugg[species];
}

async function refreshStats(i) {
  const m = team[i];
  if (!m.species) { delete stats[i]; return; }
  const r = await api.post('/api/build/stats', {species: m.species, nature: m.nature, sp: m.sp, item: m.item});
  stats[i] = r.ok ? {...r.data.stats, form: r.data.form, types: r.data.types || []} : null;
}

async function fillUsual(i) {
  const m = team[i];
  const s = await suggestions(m.species);
  if (!s || !s.n) { message = `No sets on record for ${m.species}.`; return render(); }
  m.item = s.items[0] ? s.items[0].name : '';
  m.ability = s.abilities[0] ? s.abilities[0].name : '';
  m.nature = s.natures[0] ? s.natures[0].name : 'Serious';
  m.moves = [0, 1, 2, 3].map(k => (s.moves[k] ? s.moves[k].name : ''));
  if (s.spreads && s.spreads[0]) { m.sp = {...empty().sp, ...s.spreads[0].sp}; if (s.spreads[0].nature) m.nature = s.spreads[0].nature; }
  save(); await refreshStats(i); render();
}

// Picking a Pokemon builds its set around the team: moves for coverage the team
// lacks, item not already used, nature from the moves, spread weighted by the
// team's needs. Fields you edit yourself are kept when it is rebuilt.
async function pickSpecies(i, species) {
  team[i] = {...empty(), species};
  autoRes[i] = null; why[i] = null;
  if (!species) { save(); await refreshCoverage(); return render(); }
  await completeSlot(i);
}

function fixedOf(m) {
  const f = {...(m.fixed || {})};
  const moves = (m.fixedSlots || []).map(k => m.moves[k]).filter(Boolean);
  if (moves.length) f.moves = moves;
  return f;
}

async function completeSlot(i) {
  const m = team[i];
  message = `Building ${m.species} around your team...`;
  render();
  const others = team.filter((x, k) => k !== i && x.species);
  const r = await api.post('/api/build/complete', {species: m.species, team: others, fixed: fixedOf(m)});
  if (!r.ok || r.data.error) {
    message = (r.data && r.data.error) || 'Could not build a set: fill it in yourself.';
    save(); await refreshStats(i); return render();
  }
  const d = r.data;
  const keep = new Set(m.fixedSlots || []);
  const kept = [...keep].map(k => m.moves[k]);
  const rest = d.moves.filter(mv => !kept.includes(mv));
  m.species = d.species; m.item = d.item; m.ability = d.ability; m.nature = d.nature;
  m.moves = [0, 1, 2, 3].map(k => (keep.has(k) ? m.moves[k] : rest.shift() || ''));
  m.sp = {...empty().sp, ...d.sp};
  why[i] = d; autoRes[i] = d.auto_spread || null;
  message = d.spread_warning ? `Spread: ${d.spread_warning}` : '';
  save();
  await Promise.all([suggestions(m.species), refreshStats(i), refreshCoverage()]);
  render();
}

async function refreshCoverage() {
  const members = team.filter(m => m.species);
  if (!members.length) { coverage = null; return; }
  const r = await api.post('/api/build/coverage', {team: members});
  coverage = r.ok ? {...r.data, names: members.map(m => m.species)} : null;
}

const autoOpts = {};  // slot -> {required: Set of goal ids, offence}

async function autoSpread(i) {
  const m = team[i];
  const o = autoOpts[i] || (autoOpts[i] = {required: new Set(), offence: 1});
  message = `Working out a spread for ${m.species} against the top threats...`;
  render();
  const r = await api.post('/api/build/autospread', {species: m.species, nature: m.nature, item: m.item, ability: m.ability,
    moves: m.moves.filter(Boolean), required: [...o.required], offence: o.offence, team: team.filter(x => x.species)});
  if (!r.ok || r.data.error) { message = (r.data && r.data.error) || 'Auto spread failed.'; return render(); }
  m.sp = {...empty().sp, ...r.data.sp};
  autoRes[i] = r.data;
  message = r.data.required_met === false ? 'No spread meets every goal you ticked: this is the closest.' :
    (r.data.warnings && r.data.warnings.length ? `Some calcs failed: ${r.data.warnings.join('; ')}` : '');
  save(); await refreshStats(i); render();
}

function exportText() {
  const lines = [];
  for (const m of team) {
    if (!m.species) continue;
    lines.push(m.item ? `${m.species} @ ${m.item}` : m.species);
    if (m.ability) lines.push(`Ability: ${m.ability}`);
    lines.push('Level: 50');
    const sp = STATS.filter(([k]) => m.sp[k]).map(([k, n]) => `${m.sp[k]} ${n}`);
    if (sp.length) lines.push(`EVs: ${sp.join(' / ')}`);
    if (m.nature) lines.push(`${m.nature} Nature`);
    for (const mv of m.moves) if (mv) lines.push(`- ${mv}`);
    lines.push('');
  }
  return lines.join('\n');
}

async function importText(text) {
  const r = await api.post('/api/build/parse', {text});
  if (!r.ok) { message = (r.data && r.data.error) || 'Could not read that team.'; return render(); }
  const sets = r.data.sets || [];
  team = Array.from({length: 6}, (_, i) => {
    const s = sets[i];
    if (!s) return empty();
    return {species: s.species, item: s.item || '', ability: s.ability || '', nature: s.nature || 'Serious',
      moves: [0, 1, 2, 3].map(k => s.moves[k] || ''), sp: {...empty().sp, ...(s.stat_values || {})}};
  });
  message = r.data.problems && r.data.problems.length ? r.data.problems.join('; ') : `Imported ${sets.length} Pokemon.`;
  save();
  await Promise.all(team.map((_, i) => refreshStats(i)));
  render();
}

export async function loadIntoBuilder(text) { await importText(text); }
// The current Build draft as Showdown text (Practice: "my Build team").
export function buildTeamText() { return exportText(); }

function datalist(id, items) {
  return el('datalist', {id}, ...items.map(x => el('option', {value: x.name || x, label: x.share != null ? `${Math.round(100 * x.share)}%` : ''})));
}

// Usage of this Pokemon on real teams: how often, how those teams did, and its
// items / abilities / natures / moves / partners with bars.
function usageBlock(s) {
  if (!s || !s.n) return null;
  const pct = x => `${Math.round(100 * x)}%`;
  const list = (title, items, key = 'name') => el('div', {},
    el('strong', {class: 'small', text: title}),
    el('ul', {}, ...items.map(x => {
      const bar = el('span');
      bar.style.width = `${Math.round(100 * Math.min(1, x.share))}%`;  // DOM, not inline styles (CSP)
      return el('li', {}, el('span', {text: x[key]}), el('span', {class: 'dim', text: pct(x.share)}), el('div', {class: 'ubar'}, bar));
    })));
  const u = s.usage || {};
  return el('details', {class: 'usage'},
    el('summary', {text: `Usage: on ${pct(u.share || 0)} of teams (${u.teams || 0}), those teams won ${u.win_rate != null ? pct(u.win_rate) : '?'} · ${s.n} sets`}),
    el('div', {class: 'ugrid'},
      list('Items', s.items || []), list('Abilities', s.abilities || []), list('Natures', s.natures || []),
      list('Moves', s.moves || []),
      s.partners && s.partners.length ? list('Usual partners', s.partners.map(p => ({...p, name: p.species})), 'name') : null));
}

// Suggestions from a datalist only once 3 characters are typed.
function typeahead(input, listId) {
  const sync = () => { if (input.value.trim().length >= 3) input.setAttribute('list', listId); else input.removeAttribute('list'); };
  input.addEventListener('input', sync);
  sync();
  return input;
}

function field(label, control) {
  return el('label', {class: 'bfield'}, el('span', {class: 'blabel', text: label}), control);
}

function slotCard(m, i) {
  const s = m.species ? sugg[m.species] : null;
  const set = (k, v) => { m[k] = v; save(); };
  const species = typeahead(el('input', {type: 'text', placeholder: 'Type a Pokemon (3+ letters)', value: m.species,
    'aria-label': `slot ${i + 1} Pokemon`,
    onchange: e => pickSpecies(i, e.target.value.trim())}),
  'build-species');
  if (!m.species) {
    return el('div', {class: 'bcard empty'},
      el('div', {class: 'bcard-empty'}, el('span', {class: 'plus', 'aria-hidden': 'true', text: '+'}),
        el('span', {class: 'dim', text: `Add a Pokemon (slot ${i + 1})`}), species));
  }
  const st = stats[i] || {};
  const item = typeahead(el('input', {type: 'text', placeholder: 'Item', value: m.item,
    onchange: async e => { set('item', e.target.value); m.fixed = {...(m.fixed || {}), item: e.target.value}; save(); await Promise.all([refreshStats(i), refreshCoverage()]); render(); }}), `items-${i}`);
  const abilities = s && s.abilities_possible ? s.abilities_possible : [];
  const ability = el('select', {onchange: e => { set('ability', e.target.value); m.fixed = {...(m.fixed || {}), ability: e.target.value}; save(); }},
    ...[...new Set([m.ability, ...abilities].filter(Boolean))].map(a => el('option', {value: a, text: a, selected: a === m.ability})));
  const nature = el('select', {onchange: async e => { set('nature', e.target.value); m.fixed = {...(m.fixed || {}), nature: e.target.value}; save(); await refreshStats(i); render(); }},
    ...NATURES.map(n => el('option', {value: n, text: n, selected: n === m.nature})));
  const moves = m.moves.map((mv, k) => typeahead(el('input', {type: 'text', placeholder: `Move ${k + 1}`, value: mv,
    'aria-label': `move ${k + 1}`, onchange: async e => {
      m.moves[k] = e.target.value.trim();
      const fs = new Set(m.fixedSlots || []);
      if (m.moves[k]) fs.add(k); else fs.delete(k);
      m.fixedSlots = [...fs]; save();
      await refreshCoverage(); render();
    }}), `moves-${i}`));
  const w = why[i];
  const reasons = w && w.move_reasons ? el('ul', {class: 'small dim reasons'},
    w.item ? el('li', {text: `${w.item}: ${w.item_reason || ''}`}) : null,
    ...(w.item_problems || []).map(x => el('li', {class: 'warnline', text: x})),
    ...w.move_reasons.map(r => el('li', {text: `${r.move}: ${r.reason}`}))) : null;
  const needs = w && w.needs && (w.needs.offence.length || w.needs.defence.length) ? el('p', {class: 'small dim',
    text: [w.needs.offence.length ? `Team needed damage on ${w.needs.offence.join(', ')}` : '',
      w.needs.defence.length ? `and answers to ${w.needs.defence.join(', ')}` : ''].filter(Boolean).join(' ') + '.'}) : null;
  const total = STATS.reduce((a, [k]) => a + (Number(m.sp[k]) || 0), 0);
  const spTable = el('div', {class: 'sptable'}, ...STATS.map(([k, n]) => el('div', {class: 'sprow2'},
    el('span', {class: 'blabel', text: n}),
    el('input', {type: 'number', min: 0, max: 32, value: m.sp[k] || 0, 'aria-label': `${n} stat points`,
      onchange: async e => { m.sp[k] = Math.max(0, Math.min(32, Number(e.target.value) || 0)); save(); await refreshStats(i); render(); }}),
    el('span', {class: 'statval', text: st[k] != null ? String(st[k]) : ''}))));
  const spreads = s && s.spreads && s.spreads.length ? el('details', {class: 'bsec'}, el('summary', {text: 'Common spreads'}),
    el('div', {class: 'spreadchips'}, ...s.spreads.map(sp => el('button', {class: 'spreadchip',
      text: `${sp.nature} ${STATS.filter(([k]) => sp.sp[k]).map(([k, n]) => `${sp.sp[k]} ${n}`).join(' / ')} · ${Math.round(100 * sp.share)}% ${sp.source}`,
      onclick: async () => { m.sp = {...empty().sp, ...sp.sp}; if (sp.nature) m.nature = sp.nature; save(); await refreshStats(i); render(); }})))) : null;
  const ar = autoRes[i];
  const o = autoOpts[i] || (autoOpts[i] = {required: new Set(), offence: 1});
  const balance = el('label', {class: 'small balance'}, 'Offence vs bulk ',
    el('select', {'aria-label': 'offence weight', onchange: e => { o.offence = Number(e.target.value); }},
      ...[[0.5, 'bulk first'], [1, 'balanced'], [1.5, 'offence first'], [2.5, 'all-out offence']].map(([v, t]) =>
        el('option', {value: v, text: t, selected: o.offence === v}))));
  const goals = ar ? el('details', {class: 'bsec', open: o.required.size > 0},
    el('summary', {text: `Auto spread: ${ar.met}/${ar.total_goals} benchmarks met vs the top threats${ar.required_met === false ? ' (not every must-meet goal)' : ''}`}),
    el('p', {class: 'small dim', text: 'Tick goals that must be met (e.g. survive Dire Claw and OHKO Garchomp), then run it again.'}),
    el('ul', {class: 'small goals'}, ...ar.goals.map(g => el('li', {class: g.met ? 'met' : 'unmet'},
      el('input', {type: 'checkbox', checked: o.required.has(g.id), 'aria-label': `must meet: ${g.goal}`,
        onchange: e => { if (e.target.checked) o.required.add(g.id); else o.required.delete(g.id); }}),
      ` ${g.met ? (g.full ? '✓' : '½') : '✗'} ${g.goal}`)))) : null;
  return el('div', {class: 'bcard'},
    el('div', {class: 'bcard-head'},
      el('div', {class: 'bcard-title'},
        el('strong', {text: st.form || m.species}),
        el('div', {class: 'types'}, ...(st.types || []).map(typeChip)),
        el('span', {class: 'small dim', text: m.item ? `@ ${m.item}` : 'no item'})),
      el('div', {class: 'bcard-tools'},
        el('button', {class: 'iconbtn', title: 'rebuild moves, item, nature and spread around the current team (keeps what you typed)',
          'aria-label': 'fit to team', text: 'Fit to team', onclick: () => completeSlot(i)}),
        el('button', {class: 'iconbtn', title: 'fill the usual set', 'aria-label': 'fill the usual set', text: 'Usual set', onclick: () => fillUsual(i)}),
        el('button', {class: 'iconbtn', title: 'remove', 'aria-label': 'remove', text: '✕', onclick: async () => { team[i] = empty(); autoRes[i] = null; why[i] = null; save(); await refreshCoverage(); render(); }}))),
    el('div', {class: 'bcard-body'},
      el('div', {class: 'bgrid3'}, field('Pokemon', species), field('Item', item), field('Ability', ability), field('Nature', nature)),
      el('div', {class: 'bsec-label blabel', text: 'Moves'}),
      el('div', {class: 'bmoves'}, ...moves),
      reasons, needs,
      el('div', {class: 'bsec-label blabel' + (total > 66 ? ' over' : ''), text: `Stat points ${total}/66`}),
      spTable,
      el('div', {class: 'actions'}, el('button', {class: 'btn', text: autoRes[i] ? 'Re-run auto spread' : 'Auto spread vs threats',
        onclick: () => autoSpread(i)}), balance),
      spreads, goals, usageBlock(s)),
    datalist(`items-${i}`, s && s.items ? s.items : []),
    datalist(`moves-${i}`, s && s.moves ? s.moves : []));
}

// Per threat: the team's best hit on it (who, which move), who takes its best hit
// well (half HP or less) and who it OHKOs; then tools and warnings.
function coveragePanel() {
  const c = coverage;
  if (!c) return el('p', {class: 'small dim', text: 'Add Pokemon to see how the team handles the most used threats.'});
  const n = k => c.names[k] || '?';
  const mark = (v, good, ok) => (v >= good ? 'met' : v >= ok ? '' : 'unmet');
  const rows = c.threats.map(t => el('tr', {},
    el('td', {text: t.threat}),
    el('td', {class: mark(t.offence, 0.8, 0.5), text: t.by != null ? `${Math.round(t.best_pct)}% (${n(t.by)}, ${t.move})` : 'nothing'}),
    el('td', {class: mark(t.defence, 0.75, 0.5), text: t.checks.length ? t.checks.map(n).join(', ') : 'none'}),
    el('td', {class: t.weak.length >= 2 ? 'unmet' : '', text: t.weak.length ? t.weak.map(n).join(', ') : '-'})));
  const tl = c.tools || {};
  const sup = Object.entries(tl.support || {}).map(([k, v]) => `${k} (${v.join(', ')})`);
  return el('div', {class: 'coverage'},
    el('p', {class: 'small', text: `Offence ${Math.round(100 * c.offence)}% · defence ${Math.round(100 * c.defence)}% (usage-weighted over the threats)`}),
    el('div', {class: 'tablewrap'}, el('table', {class: 'small covtable'},
      el('thead', {}, el('tr', {}, ...['Threat', 'Your best hit', 'Takes its best hit (≤50%)', "OHKO'd by it"].map(h => el('th', {text: h})))),
      el('tbody', {}, ...rows))),
    el('p', {class: 'small', text: `Speed control: ${(tl.speed_control || []).join(', ') || 'none'}`}),
    sup.length || (tl.intimidate || []).length ? el('p', {class: 'small',
      text: `Support: ${[...sup, ...(tl.intimidate || []).length ? [`Intimidate (${tl.intimidate.join(', ')})`] : []].join(' · ')}`}) : null,
    c.warnings && c.warnings.length ? el('ul', {class: 'small warn'}, ...c.warnings.map(w => el('li', {text: w}))) : null);
}

function render() {
  if (!root) return;
  const species = team.map(m => m.species).filter(Boolean);
  const out = el('textarea', {rows: 10, class: 'mono', 'aria-label': 'team text'});
  out.value = exportText();
  const status = el('span', {class: 'small dim', 'aria-live': 'polite', text: message});
  const matesBlock = el('div', {},
    el('div', {class: 'actions'}, el('button', {class: 'btn secondary', text: 'Suggest teammates', disabled: !species.length,
      onclick: async () => {
        message = 'Ranking teammates by what strong teams pair and the gaps each fills...'; render();
        const r = await api.post('/api/build/teammates', {team: team.filter(m => m.species)});
        mates = r.ok ? r.data.teammates : []; message = ''; render();
      }})),
    mates ? el('ul', {class: 'list mates'}, ...mates.map(t => el('li', {},
      el('strong', {text: t.species}),
      el('span', {class: 'small dim', text: ` on ${Math.round(100 * t.share)}% of teams with yours (${t.together}), those teams won ${Math.round(100 * t.win_rate)}%`}),
      t.covers && t.covers.length ? el('span', {class: 'small', text: ` · hits ${t.covers.join(', ')}`}) : null,
      t.checks && t.checks.length ? el('span', {class: 'small', text: ` · takes on ${t.checks.join(', ')}`}) : null,
      el('button', {class: 'linkbtn', text: 'add', disabled: species.length >= 6, onclick: async () => {
        const i = team.findIndex(m => !m.species); if (i < 0) return;
        mates = null; await pickSpecies(i, t.species);
      }})))) : null);
  clear(root,
    el('h2', {text: fmt === 'singles' ? 'Build: singles (BSS Reg M-C)' : 'Build: VGC (Reg M-C)'}),
    datalist('build-species', (speciesList || []).map(x => ({name: x}))),
    el('p', {class: 'small dim', text: 'Suggestions come from Reg M-C tournament teams, open sheets of 1300+ ladder games and 1760+ ladder statistics. Auto spread meets as many usage-weighted benchmarks as it can against the 12 most used threats (outspeed, survive their strongest hit, KO or 2HKO).'}),
    el('div', {class: 'bcards'}, ...team.map(slotCard)),
    el('h3', {text: 'Team coverage vs the top threats'}), coveragePanel(),
    el('h3', {text: 'Teammates'}), matesBlock,
    el('h3', {text: 'Import / export'}),
    out,
    el('div', {class: 'actions'},
      el('button', {class: 'btn', text: 'Copy', onclick: async () => { try { await navigator.clipboard.writeText(out.value); message = 'Copied: paste into the Showdown teambuilder (Import).'; } catch (e) { out.select(); message = 'Press Ctrl+C.'; } render(); }}),
      el('button', {class: 'btn secondary', text: 'Import this text', onclick: () => importText(out.value)}),
      el('button', {class: 'btn secondary', text: 'Check legality', onclick: async () => {
        const r = await api.post('/api/build/validate', {text: out.value});
        message = !r.ok ? 'Could not check.' : r.data.legal ? 'Passes the basic checks (species, items, abilities, stat points; learnsets are not checked here: Showdown checks them on import).' : `Not legal yet: ${(r.data.problems || []).join('; ')}`;
        render();
      }}),
      status));
}

export async function renderBuild(el_) {
  root = el_;
  if (apiFormat.value !== fmt) {  // switched on the Teams tab
    fmt = apiFormat.value; team = load(); speciesList = null; mates = null; coverage = null;
    for (const o of [sugg, stats, autoRes, why]) for (const k of Object.keys(o)) delete o[k];
  }
  if (!speciesList) {
    const r = await api.get('/api/build/species');
    speciesList = r.ok ? r.data.species : [];
  }
  await Promise.all(team.map(async (m, i) => { if (m.species) { await suggestions(m.species); await refreshStats(i); } }));
  await refreshCoverage();
  render();
}
