// The teambuilder's logic in the browser: JavaScript ports of ProjectPoke's
// teambuilder.py (suggestions, teammates, auto spread), coverage.py (team
// coverage, set completion), items.py (item checks and picks) and teamsearch.py
// (team finder). Damage comes from @smogon/calc (calc.bundle.js).
import {calc} from './calc.bundle.js';

let D = null;     // game data (dex.json)
let F = null;     // this format's data (data_<fmt>.json)
let FMT = 'vgc';
const CACHE = {};

export const toId = x => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const singles = () => FMT === 'singles';

export function setData(dex, data, key) {
  D = dex; F = data; FMT = key;
  for (const k of Object.keys(CACHE)) delete CACHE[k];
  if (!D._mega) {
    D._mega = {};
    for (const [sid, s] of Object.entries(D.species)) if (s.isMega && s.requiredItem) D._mega[`${s.baseSpecies}|${s.requiredItem}`] = sid;
  }
  F._suggest = {};
  for (const [name, s] of Object.entries(F.suggest)) F._suggest[toId(name)] = s;
}

// --------------------------------------------------------------------------- dex
const species = id => D.species[toId(id)] || null;
const move = id => D.moves[toId(id)] || null;
const item = id => D.items[toId(id)] || null;
const megaForme = (base, stone) => (stone ? D._mega[`${toId(base)}|${toId(stone)}`] || null : null);
export const abilityName = id => (id ? (D.abilities[toId(id)] || {}).name || id : '');
const speciesName = x => (species(x) || {}).name || x;
const itemName = x => (x ? (item(x) || {}).name || x : '');
const moveName = x => (move(x) || {}).name || x;
const natureName = x => (x ? x[0].toUpperCase() + x.slice(1).toLowerCase() : '');

const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const NATURES = {
  lonely: ['atk', 'def'], brave: ['atk', 'spe'], adamant: ['atk', 'spa'], naughty: ['atk', 'spd'],
  bold: ['def', 'atk'], relaxed: ['def', 'spe'], impish: ['def', 'spa'], lax: ['def', 'spd'],
  timid: ['spe', 'atk'], hasty: ['spe', 'def'], jolly: ['spe', 'spa'], naive: ['spe', 'spd'],
  modest: ['spa', 'atk'], mild: ['spa', 'def'], quiet: ['spa', 'spe'], rash: ['spa', 'spd'],
  calm: ['spd', 'atk'], gentle: ['spd', 'def'], sassy: ['spd', 'spe'], careful: ['spd', 'spa'],
};
const TOTAL = 66, PER_STAT = 32;

function natureMult(nature, stat) {
  const [up, down] = NATURES[toId(nature)] || [];
  return stat === up ? 1.1 : stat === down ? 0.9 : 1.0;
}
function statValue(base, sp, stat, nature) {
  const core = Math.floor((2 * base + 31) / 2);
  if (stat === 'hp') return core + 60 + sp;
  return Math.floor((core + 5 + sp) * natureMult(nature, stat));
}
export function stats(sp_, nature, sp) {
  const b = (species(sp_) || {}).baseStats;
  if (!b) return {};
  return Object.fromEntries(STATS.map(k => [k, statValue(b[k] || 0, Number((sp || {})[k]) || 0, k, nature)]));
}

// --------------------------------------------------------------------------- damage
const SPREAD = new Set(['allAdjacentFoes', 'allAdjacent']);
const isSpread = m => !singles() && SPREAD.has((move(m) || {}).target);
const DMG = new Map();

function damage(att, mv, dfn, errors) {
  const key = JSON.stringify([att, mv, dfn, FMT]);
  if (DMG.has(key)) return DMG.get(key);
  let r = null;
  try {
    r = calc({attacker: att, defender: dfn, move: moveName(mv), spread: isSpread(mv)}, singles());
  } catch (e) {
    if (errors) errors.add(String(e.message || e));
  }
  if (DMG.size > 200000) DMG.clear();
  DMG.set(key, r);
  return r;
}
const spec = m => ({species: m.species, item: m.item || null, ability: m.ability || null, nature: m.nature || 'Serious', sp: m.sp || {}});

function damagePct(att, mv, dfn) {
  const info = move(mv) || {};
  if (!['Physical', 'Special'].includes(info.category) || !info.basePower) return [0, 0];
  const r = damage(spec(att), mv, spec(dfn));
  if (!r || !r.defenderHp) return [0, 0];
  return [100 * r.min / r.defenderHp, 100 * r.max / r.defenderHp];
}

// --------------------------------------------------------------------------- sets on record
function commonSets(name) {
  const sid = toId(name);
  if (F._suggest[sid]) return F._suggest[sid];
  const key = `common:${sid}`;
  if (CACHE[key]) return CACHE[key];
  const sets = F.finder.filter(t => !t.partial).flatMap(t => t.sets).filter(s => toId(s.species).startsWith(sid));
  const n = sets.length;
  const share = list => {
    const c = new Map();
    for (const x of list) if (x) c.set(x, (c.get(x) || 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({name: k, share: Math.round(100 * v / n) / 100}));
  };
  const out = !n ? {species: speciesName(sid), n: 0} : {species: speciesName(sid), n,
    items: share(sets.map(s => itemName(s.item))), abilities: share(sets.map(s => abilityName(s.ability))),
    natures: share(sets.map(s => natureName(s.nature))), moves: share(sets.flatMap(s => (s.moves || []).map(moveName)))};
  return (CACHE[key] = out);
}

export function suggestSet(name) {
  const sid = toId(name);
  const s = {...commonSets(name)};
  if (!s.n) return s;
  if (!s.abilities_possible) s.abilities_possible = ((species(sid) || {}).abilities || []).map(abilityName);
  if (!s.spreads) s.spreads = (F.spreads[speciesName(sid)] || []).slice(0, 3).map(([sp, nat, sh]) => ({sp, nature: natureName(nat), share: Math.round(100 * sh) / 100, source: 'ladder 1760+'}));
  return s;
}

function smogonSpreads(name) {
  return F.spreads[speciesName(name)] || [];
}
function playersSpread(name, nature) {
  const rows = smogonSpreads(name);
  const same = rows.filter(r => toId(r[1]) === toId(nature));
  const use = same.length ? same : rows;
  return use.length ? {...use[0][0]} : null;
}

export function speciesList() { return F.species; }

export function suggestTeammates(team, top = 12) {
  const have = team.filter(Boolean).map(toId);
  const teams = F.teams;
  const n = teams.length;
  if (!have.length || !n) return [];
  const count = new Map();
  for (const [t] of teams) for (const x of new Set(t)) count.set(x, (count.get(x) || 0) + 1);
  let withYours = 0;
  const cand = new Map();
  for (const [t, w] of teams) {
    const ts = new Set(t);
    const hits = have.filter(h => ts.has(h)).length;
    if (!hits) continue;
    withYours += 1;
    for (const c of ts) {
      if (have.includes(c)) continue;
      const s = cand.get(c) || [0, 0, 0];
      s[0] += 1; s[1] += w; s[2] += hits;
      cand.set(c, s);
    }
  }
  const out = [];
  for (const [c, [together, wins, hits]] of cand) {
    if (together < 15) continue;
    const expected = (count.get(c) || 0) / n * have.reduce((a, h) => a + (count.get(h) || 0), 0);
    const lift = (hits + 1) / (expected + 1);
    const win = (wins + 5) / (together + 10);
    const share = together / Math.max(1, withYours);
    out.push({species: speciesName(c), together, share: +share.toFixed(3), win_rate: +win.toFixed(3),
      score: Math.log(share) + 0.3 * Math.log(lift) + 2 * (win - 0.5)});
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, top);
}

// --------------------------------------------------------------------------- items (items.py)
const TYPE_BOOST = {charcoal: 'Fire', mysticwater: 'Water', miracleseed: 'Grass', magnet: 'Electric', nevermeltice: 'Ice',
  blackbelt: 'Fighting', poisonbarb: 'Poison', softsand: 'Ground', sharpbeak: 'Flying', twistedspoon: 'Psychic',
  silverpowder: 'Bug', hardstone: 'Rock', spelltag: 'Ghost', dragonfang: 'Dragon', blackglasses: 'Dark',
  metalcoat: 'Steel', silkscarf: 'Normal', fairyfeather: 'Fairy', normalgem: 'Normal'};
const RESIST_BERRY = {occaberry: 'Fire', passhoberry: 'Water', rindoberry: 'Grass', wacanberry: 'Electric',
  yacheberry: 'Ice', chopleberry: 'Fighting', kebiaberry: 'Poison', shucaberry: 'Ground', cobaberry: 'Flying',
  payapaberry: 'Psychic', tangaberry: 'Bug', chartiberry: 'Rock', kasibberry: 'Ghost', habanberry: 'Dragon',
  colburberry: 'Dark', babiriberry: 'Steel', roseliberry: 'Fairy', chilanberry: 'Normal'};
const WEATHER_ROCK = {damprock: ['raindance', ['drizzle']], heatrock: ['sunnyday', ['drought']],
  smoothrock: ['sandstorm', ['sandstream']], icyrock: ['snowscape', ['snowwarning']]};
const SEED = {electricseed: ['electricterrain', ['electricsurge', 'hadronengine']], grassyseed: ['grassyterrain', ['grassysurge']],
  psychicseed: ['psychicterrain', ['psychicsurge']], mistyseed: ['mistyterrain', ['mistysurge']]};
const SCREENS = new Set(['reflect', 'lightscreen', 'auroraveil']);
const ATE = {pixilate: 'Fairy', aerilate: 'Flying', refrigerate: 'Ice', galvanize: 'Electric'};
const SELF_DROPS = new Set(['armorcannon', 'clangingscales', 'closecombat', 'dracometeor', 'dragonascent', 'fleurcannon',
  'hammerarm', 'headlongrush', 'hyperspacefury', 'icehammer', 'leafstorm', 'makeitrain', 'overheat', 'psychoboost',
  'scaleshot', 'spinout', 'superpower']);
const FRAIL_BULK = 12;

const attacks = moves => moves.map(m => move(m) || {}).filter(mv => ['Physical', 'Special'].includes(mv.category) && (mv.basePower || 0) > 40);
const attackType = (mv, ability) => (ATE[toId(ability)] && mv.type === 'Normal' ? ATE[toId(ability)] : mv.type || 'Normal');
function weakTo(sp_, mtype) {
  let e = 1;
  for (const t of (species(sp_) || {}).types || []) e *= ({0: 1, 1: 2, 2: 0.5, 3: 0})[(D.typechart[toId(t)] || {})[mtype] || 0] ?? 1;
  return e > 1;
}
function battleForme(sp_, it) {
  const form = megaForme(sp_, it) || toId(sp_);
  const s = species(form) || {};
  return [form, s.isMega && s.abilities ? s.abilities[0] : null];
}
function teamHas(team, ability, moves, setMoves, abilities) {
  if (abilities.includes(toId(ability)) || moves.some(m => setMoves.has(m))) return true;
  return team.some(m => abilities.includes(toId(m.ability)) || (m.moves || []).some(x => x && setMoves.has(toId(x))));
}

export function checkItem(it, sp_, ability, moves, sp, team = []) {
  const iid = toId(it);
  if (!iid) return [];
  const info = item(iid);
  if (!info) return [`${it} is not in this game`];
  const name = info.name;
  const [form, megaAbility] = battleForme(sp_, iid);
  ability = megaAbility || ability;
  const ids = moves.filter(Boolean).map(toId);
  const atk = attacks(ids);
  const out = [];
  if (info.megaStone) {
    if (!megaForme(sp_, iid)) out.push(`${name} does nothing for ${speciesName(sp_)}`);
    return out;
  }
  if (iid === 'choicescarf') {
    const bad = ids.filter(m => (move(m) || {}).category === 'Status').map(moveName);
    if (bad.length) out.push(`Choice Scarf locks you into one move: ${bad.join(', ')} would waste it`);
    if (atk.length < 2) out.push('Choice Scarf wants several attacks to choose from');
  } else if (TYPE_BOOST[iid]) {
    const t = TYPE_BOOST[iid];
    if (!atk.some(mv => attackType(mv, ability) === t)) out.push(`${name} boosts ${t} attacks and this set has none`);
  } else if (iid === 'lifeorb' || iid === 'expertbelt') {
    if (atk.length < 2) out.push(`${name} wants at least two real attacks`);
  } else if (iid === 'muscleband') {
    if (!atk.some(mv => mv.category === 'Physical')) out.push('Muscle Band boosts physical attacks and this set has none');
  } else if (iid === 'wiseglasses') {
    if (!atk.some(mv => mv.category === 'Special')) out.push('Wise Glasses boosts special attacks and this set has none');
  } else if (RESIST_BERRY[iid]) {
    const t = RESIST_BERRY[iid];
    if (t !== 'Normal' && !weakTo(form, t)) out.push(`${name} halves super effective ${t} hits, and ${t} is not super effective on it`);
  } else if (iid === 'whiteherb') {
    if (!ids.some(m => SELF_DROPS.has(m))) out.push('White Herb restores lowered stats and nothing on this set lowers them');
  } else if (WEATHER_ROCK[iid]) {
    const [w, abs] = WEATHER_ROCK[iid];
    if (!teamHas(team, ability, ids, new Set([w]), abs)) out.push(`${name} extends ${moveName(w)}, and nothing sets it`);
  } else if (SEED[iid]) {
    const [t, abs] = SEED[iid];
    if (!teamHas(team, ability, ids, new Set([t]), abs)) out.push(`${name} needs ${moveName(t)} on the team`);
  } else if (iid === 'lightclay') {
    if (!ids.some(m => SCREENS.has(m))) out.push('Light Clay extends screens and this set has none');
  } else if (iid === 'focussash' && sp) {
    const bulk = (Number(sp.hp) || 0) + (Number(sp.def) || 0) + (Number(sp.spd) || 0);
    if (bulk > FRAIL_BULK) out.push(`Focus Sash suits a frail spread; this one has ${bulk} points in HP and defences`);
  }
  return out;
}

function usageWithMoves(name, moves) {
  const sid = toId(name);
  const mine = new Set(moves.filter(Boolean).map(toId));
  const c = new Map();
  let n = 0;
  for (const [k, list] of Object.entries(F.itemsets)) {
    if (!k.startsWith(sid)) continue;
    for (const [it, mvs] of list) {
      n += 1;
      const shared = mvs.filter(m => mine.has(m)).length;
      c.set(it, (c.get(it) || 0) + (1 + shared) ** 2);
    }
  }
  if (!n) {
    const cs = commonSets(name);
    return [Object.fromEntries((cs.items || []).map(i => [i.name, i.share])), cs.n || 0];
  }
  const tot = [...c.values()].reduce((a, b) => a + b, 0) || 1;
  return [Object.fromEntries([...c].map(([k, v]) => [k, v / tot])), n];
}

export function pickItem(name, ability, moves, sp, team = [], fixed = null, stone = null) {
  const used = new Set(team.filter(m => m.species).map(m => toId(m.item)));
  if (fixed) return {item: fixed, reason: 'your choice', problems: checkItem(fixed, name, ability, moves, sp, team), alternatives: []};
  if (stone) return {item: stone, reason: 'Mega Stone', problems: [], alternatives: []};
  const [shares, n] = usageWithMoves(name, moves);
  const ranked = Object.entries(shares).sort((a, b) => b[1] - a[1]);
  const alts = [];
  let chosen = null;
  for (const [nm, share] of ranked) {
    if (!nm || !item(nm)) continue;
    if (item(nm).megaStone && !megaForme(name, nm)) continue;
    let problems = checkItem(nm, name, ability, moves, sp, team);
    if (used.has(toId(nm))) problems = [...problems, 'already on the team (Item Clause)'];
    const entry = {item: nm, share: +share.toFixed(3), problems};
    if (!chosen && !problems.length) chosen = entry;
    else if (alts.length < 4) alts.push(entry);
  }
  if (!chosen) return {item: '', reason: n ? 'no item on record suits this set' : 'no sets on record', problems: [], alternatives: alts};
  let reason = `${Math.round(100 * chosen.share)}% of sets with moves like these`;
  const first = ranked.length ? ranked[0][0] : null;
  if (first && toId(first) !== toId(chosen.item)) {
    const skipped = alts.find(a => toId(a.item) === toId(first));
    if (skipped && skipped.problems.length) reason += ` (${first} skipped: ${skipped.problems[0]})`;
  }
  return {item: chosen.item, reason, problems: [], alternatives: alts};
}

// --------------------------------------------------------------------------- coverage (coverage.py)
const N_THREATS = 16, CHECK_PCT = 50, MOVE_USAGE_MIN = 0.02, COVER_WEIGHT = 20, FIT_WEIGHT = 3;
const offValue = b => 1 - Math.exp(-Math.max(0, b) / 60);
const defValue = c => 1 - 0.5 ** c;

function normaliseSpecies(text) {
  let sid = toId(text);
  if (sid.startsWith('mega') && species(sid.slice(4) + 'mega')) sid = sid.slice(4) + 'mega';
  const s = species(sid) || {};
  if (s.isMega) return [(species(s.baseSpecies) || {}).name || text, (item(s.requiredItem) || {}).name || null];
  return [s.name || text, null];
}

function memberMon(s) {
  if (!s || !s.species) return null;
  const formId = megaForme(s.species, s.item) || toId(s.species);
  const form = species(formId);
  if (!form) return null;
  let ability = s.ability;
  if (form.isMega && form.abilities) ability = form.abilities[0];
  return {species: formId, item: toId(s.item) || null, ability: toId(ability) || null, nature: toId(s.nature) || null,
    moves: (s.moves || []).filter(Boolean).map(toId), sp: s.sp || {}};
}

function threatsOf(n) {
  return F.threats.slice(0, n);
}
function threatList(n = N_THREATS) {
  const key = `threats:${n}`;
  if (CACHE[key]) return CACHE[key];
  const out = [];
  for (const t0 of threatsOf(n)) {
    const t = {...t0};
    const m = memberMon({species: t.base, item: t.item, ability: t.ability, nature: t.nature, moves: t.moves || [], sp: t.sp || {}});
    if (m) out.push([t, m]);
  }
  const tot = out.reduce((a, [t]) => a + t.usage, 0) || 1;
  for (const [t] of out) t.weight = t.usage / tot;
  return (CACHE[key] = out);
}

function bestOn(mons, target) {
  let best = [0, null, null];
  mons.forEach((m, i) => {
    for (const mv of m.moves) {
      const [lo, hi] = damagePct(m, mv, target);
      if ((lo + hi) / 2 > best[0]) best = [(lo + hi) / 2, i, mv];
    }
  });
  return best;
}

// Share of m's HP the threat's best hit takes (the calc applies resist berries); Focus Sash survives one hit.
function taken(threat, m) {
  let best = 0;
  for (const mv of threat.moves) {
    const [lo, hi] = damagePct(threat, mv, m);
    best = Math.max(best, (lo + hi) / 2);
  }
  if (toId(m.item) === 'focussash' && best >= 100) best = 99;
  return best;
}

export function analyse(team, th = null) {
  th = th || threatList();
  const slots = team.map((s, i) => [i, memberMon(s)]).filter(([, m]) => m);
  const mons = slots.map(([, m]) => m);
  const rows = [];
  let offTotal = 0, defTotal = 0;
  for (const [t, tm] of th) {
    const [best, who, mv] = bestOn(mons, tm);
    const tk = mons.map(m => taken(tm, m));
    const checks = slots.filter((_, k) => tk[k] <= CHECK_PCT).map(([i]) => i);
    const weak = slots.filter((_, k) => tk[k] >= 100).map(([i]) => i);
    const ov = offValue(best), dv = defValue(checks.length);
    offTotal += t.weight * ov; defTotal += t.weight * dv;
    rows.push({threat: t.species, weight: +t.weight.toFixed(3), best_pct: Math.round(best * 10) / 10,
      by: who != null ? slots[who][0] : null, move: mv ? moveName(mv) : null, checks, weak,
      offence: +ov.toFixed(3), defence: +dv.toFixed(3)});
  }
  return {threats: rows, offence: +offTotal.toFixed(3), defence: +defTotal.toFixed(3), tools: tools(team), warnings: warnings(rows, team)};
}

const SPEED_CONTROL = new Set(['tailwind', 'trickroom', 'icywind', 'electroweb', 'thunderwave', 'scaryface', 'bulldoze', 'rocktomb']);
const SUPPORT = {fakeout: 'Fake Out', followme: 'Follow Me', ragepowder: 'Rage Powder', wideguard: 'Wide Guard',
  helpinghand: 'Helping Hand', taunt: 'Taunt', partingshot: 'Parting Shot', spore: 'Spore', sleeppowder: 'Sleep Powder',
  willowisp: 'Will-O-Wisp', encore: 'Encore'};
const SINGLES_TOOLS = {
  'Entry hazards': ['stealthrock', 'spikes', 'toxicspikes', 'stickyweb'],
  'Hazard removal': ['rapidspin', 'defog', 'mortalspin', 'courtchange', 'tidyup'],
  Pivot: ['uturn', 'voltswitch', 'flipturn', 'partingshot', 'teleport', 'chillyreception'],
  Priority: ['suckerpunch', 'aquajet', 'bulletpunch', 'extremespeed', 'machpunch', 'iceshard', 'shadowsneak', 'quickattack',
    'grassyglide', 'jetpunch', 'vacuumwave'],
  Setup: ['swordsdance', 'nastyplot', 'dragondance', 'calmmind', 'quiverdance', 'bulkup', 'shellsmash', 'irondefense', 'agility', 'bellydrum'],
  Recovery: ['recover', 'roost', 'slackoff', 'softboiled', 'moonlight', 'synthesis', 'morningsun', 'shoreup', 'wish', 'strengthsap', 'milkdrink'],
};

function tools(team) {
  const members = team.filter(m => m.species);
  const intimidate = members.filter(m => toId(m.ability) === 'intimidate').map(m => m.species);
  if (singles()) {
    const support = {};
    for (const [name, mvs] of Object.entries(SINGLES_TOOLS)) {
      const who = members.filter(m => (m.moves || []).some(x => x && mvs.includes(toId(x)))).map(m => m.species);
      if (who.length) support[name] = who;
    }
    return {speed_control: members.filter(m => toId(m.item) === 'choicescarf').map(m => `${m.species} (Choice Scarf)`), support, intimidate};
  }
  const speed = [], support = {};
  for (const m of members) {
    const ids = new Set((m.moves || []).filter(Boolean).map(toId));
    for (const mv of [...ids].filter(x => SPEED_CONTROL.has(x)).sort()) speed.push(`${m.species} (${moveName(mv)})`);
    if (toId(m.item) === 'choicescarf') speed.push(`${m.species} (Choice Scarf)`);
    for (const mv of ids) if (SUPPORT[mv]) (support[SUPPORT[mv]] = support[SUPPORT[mv]] || []).push(m.species);
  }
  return {speed_control: speed, support, intimidate};
}

function warnings(rows, team) {
  const names = team.filter(m => m.species);
  const out = [];
  for (const r of rows) {
    if (r.weak.length >= 3) out.push(`${r.threat} OHKOs ${r.weak.length} of your Pokemon (${r.weak.map(i => team[i].species).join(', ')}): a shared weakness`);
    if (r.weight >= 0.05 && !r.checks.length && r.offence < 0.5) out.push(`Nothing takes ${r.threat}'s hits well and nothing hits it hard`);
  }
  for (const m of names) {
    if (m.item) for (const p of checkItem(m.item, m.species, m.ability, m.moves || [], m.sp, team)) out.push(`${m.species}: ${p}`);
  }
  const t = tools(team);
  if (singles()) {
    if (names.length >= 4 && !t.support['Hazard removal'] && !t.support.Pivot) out.push('No hazard removal or pivot: entry hazards will chip every switch-in');
    if (names.length >= 4 && !t.support.Priority && !t.speed_control.length) out.push('No priority or Choice Scarf: faster setup sweepers have free turns');
    return out;
  }
  if (names.length >= 4 && !t.speed_control.length) out.push('No speed control (Tailwind, Trick Room, Icy Wind, Electroweb, Thunder Wave, Choice Scarf)');
  return out;
}

function needs(others, th) {
  const off = {}, def = {};
  for (const [t, tm] of th) {
    off[t.species] = 1 - offValue(bestOn(others, tm)[0]);
    def[t.species] = 0.5 ** others.filter(m => taken(tm, m) <= CHECK_PCT).length;
  }
  return [off, def];
}

function pickMoves(slot, others, th, candidates, fixed = []) {
  const chosen = fixed.filter(Boolean).map(toId).slice(0, 4);
  const out = chosen.map(m => ({move: moveName(m), share: null, reason: 'your choice'}));
  const share = Object.fromEntries(candidates.map(([m, s]) => [toId(m), s]));
  const pool = Object.keys(share).filter(m => !chosen.includes(m) && share[m] >= MOVE_USAGE_MIN && move(m));
  const teamOff = moves => {
    const me = memberMon({...slot, moves});
    const mons = [...others, ...(me ? [me] : [])];
    return th.map(([t, tm]) => offValue(bestOn(mons, tm)[0]));
  };
  while (chosen.length < 4 && pool.length) {
    const base = teamOff(chosen);
    let best = null;
    for (const m of pool) {
      const gain = teamOff([...chosen, m]);
      const delta = th.reduce((a, [t], k) => a + t.weight * (gain[k] - base[k]), 0);
      const score = Math.log(share[m] + 0.02) + COVER_WEIGHT * delta;
      const covers = th.filter((_, k) => gain[k] - base[k] >= 0.15).map(([t]) => t.species);
      if (!best || score > best[0]) best = [score, m, delta, covers];
    }
    const [, m, delta, covers] = best;
    chosen.push(m);
    pool.splice(pool.indexOf(m), 1);
    const pct = Math.round(100 * share[m]);
    const reason = covers.length && delta > 0.01 ? `covers ${covers.slice(0, 3).join(', ')}` + (pct ? ` (${pct}% of sets)` : '') : `usual (${pct}% of sets)`;
    out.push({move: moveName(m), share: +share[m].toFixed(3), reason});
  }
  return out;
}

const ATTACK_NATURES = {atk: 'Adamant', spa: 'Modest'};
function pickNature(moves, natures, dflt) {
  const cats = moves.map(m => (move(m) || {}).category);
  const phys = cats.filter(c => c === 'Physical').length, spec_ = cats.filter(c => c === 'Special').length;
  if (!phys && !spec_) return dflt;
  const key = phys > spec_ ? 'atk' : 'spa';
  for (const [name] of natures) {
    const [up, down] = NATURES[toId(name)] || [];
    if (!up) continue;
    if (down === key || down === 'def' || down === 'spd' || ((down === 'atk' || down === 'spa') && phys && spec_)) continue;
    return name;
  }
  return ATTACK_NATURES[key];
}

function suitedMoves(name, it, moves) {
  const form = species(megaForme(name, it) || toId(name)) || {};
  const b = form.baseStats || {};
  let worse = null;
  if (b.atk && b.spa) {
    if (b.spa >= 1.05 * b.atk) worse = 'Physical';
    else if (b.atk >= 1.05 * b.spa) worse = 'Special';
  }
  return (moves || []).filter(m => {
    const mv = move(m.name) || {};
    return !(worse && mv.category === worse && (mv.basePower || 0) > 40);
  }).map(m => [m.name, m.share]);
}

const SETTER_WEATHER = {drizzle: 'raindance', drought: 'sunnyday', sandstream: 'sandstorm', snowwarning: 'snowscape'};
const WEATHER_MOVES = new Set(['raindance', 'sunnyday', 'sandstorm', 'snowscape']);
const WEATHER_SPEED = {swiftswim: 'raindance', chlorophyll: 'sunnyday', sandrush: 'sandstorm', slushrush: 'snowscape'};

function teamWeathers(team) {
  const out = new Set();
  for (const m of team) {
    if (!m || !m.species) continue;
    const form = species(megaForme(m.species, m.item) || toId(m.species)) || {};
    for (const a of [toId(m.ability), ...(form.isMega ? (form.abilities || []).slice(0, 1) : [])]) if (SETTER_WEATHER[a]) out.add(SETTER_WEATHER[a]);
    for (const x of m.moves || []) if (WEATHER_MOVES.has(toId(x))) out.add(toId(x));
  }
  return [...out].sort();
}

export function completeSet(name0, team, fixed = {}) {
  const [name, stone] = normaliseSpecies(name0);
  const s = suggestSet(name);
  if (!s.n) return {error: `no sets on record for ${name}`};
  const used = new Set(team.filter(m => m.species).map(m => toId(m.item)));
  const it0 = fixed.item || stone || ((s.items || []).find(i => !used.has(toId(i.name))) || {}).name || '';
  const ability = fixed.ability || (s.abilities && s.abilities[0] ? s.abilities[0].name : '');
  let nature = fixed.nature || (s.natures && s.natures[0] ? s.natures[0].name : 'Serious');
  const sp = s.spreads && s.spreads[0] ? {...s.spreads[0].sp} : {};
  if (s.spreads && s.spreads[0] && !fixed.nature && s.spreads[0].nature) nature = s.spreads[0].nature;
  const th = threatList();
  const others = team.map(memberMon).filter(Boolean);
  const slot = {species: name, item: it0, ability, nature, sp};
  const moves = pickMoves(slot, others, th, suitedMoves(name, it0, s.moves), fixed.moves || []);
  slot.moves = moves.map(m => m.move);
  if (!fixed.nature) {
    nature = pickNature(slot.moves, (s.natures || []).map(x => [x.name, x.share]), nature);
    slot.nature = nature;
  }
  const it = pickItem(name, ability, slot.moves, sp, team, fixed.item, stone);
  slot.item = it.item;
  const [offNeed, defNeed] = needs(others, th);
  const sortDesc = o => Object.entries(o).sort((a, b) => b[1] - a[1]);
  const out = {species: name, item: it.item, ability, nature, moves: slot.moves, item_reason: it.reason,
    item_problems: it.problems, item_alternatives: it.alternatives, move_reasons: moves, sp, spread_source: 'most common spread',
    needs: {offence: sortDesc(offNeed).filter(([, v]) => v >= 0.6).map(([k]) => k).slice(0, 5),
      defence: sortDesc(defNeed).filter(([, v]) => v >= 1).map(([k]) => k).slice(0, 5)}};
  const weights = {};
  for (const [t] of th) {
    weights[`ko:${t.species}`] = 1 + offNeed[t.species];
    weights[`survive:${t.species}`] = 1 + defNeed[t.species];
  }
  const r = autoSpread({species: name, nature, item: it.item, ability, moves: slot.moves, weights,
    team_weather: teamWeathers([...team, slot])});
  if (!r.error) { out.sp = r.sp; out.spread_source = 'auto spread (team needs weighted)'; out.auto_spread = r; }
  else out.spread_warning = r.error;
  out.coverage = analyse([...team, {...slot, sp: out.sp}], th);
  return out;
}

function usualSlot(name0, usedItems = []) {
  const [name, stone] = normaliseSpecies(name0);
  const s = commonSets(name);
  if (!s.n) return null;
  const used = new Set(usedItems.map(toId));
  let it = stone || ((s.items || []).find(i => !used.has(toId(i.name))) || {}).name || '';
  const moves = suitedMoves(name, it, s.moves).slice(0, 4).map(([m]) => m);
  const ability = s.abilities && s.abilities[0] ? s.abilities[0].name : '';
  if (!stone) it = pickItem(name, ability || null, moves, null, usedItems.map(i => ({species: 'x', item: i}))).item;
  const nature = pickNature(moves, (s.natures || []).map(x => [x.name, x.share]), s.natures && s.natures[0] ? s.natures[0].name : 'Serious');
  return {species: name, item: it, ability, nature, moves, sp: playersSpread(name, nature) || {}};
}

export function teammateFit(team, top = 12) {
  const names = team.filter(m => m.species).map(m => m.species);
  const cands = suggestTeammates(names, top * 2);
  const th = threatList();
  const base = analyse(team, th);
  const used = team.map(m => m.item || '');
  const out = [];
  for (const c of cands) {
    const slot = usualSlot(c.species, used);
    const mon = slot ? memberMon(slot) : null;
    if (!mon) continue;
    let dOff = 0, dDef = 0;
    const covers = [], checks = [];
    base.threats.forEach((row, k) => {
      const [t, tm] = th[k];
      const off = offValue(Math.max(row.best_pct, bestOn([mon], tm)[0]));
      const nChecks = row.checks.length + (taken(tm, mon) <= CHECK_PCT ? 1 : 0);
      dOff += t.weight * (off - row.offence);
      dDef += t.weight * (defValue(nChecks) - row.defence);
      if (off - row.offence >= 0.15) covers.push(t.species);
      if (nChecks > row.checks.length && row.defence < 0.75) checks.push(t.species);
    });
    out.push({...c, offence_gain: +dOff.toFixed(3), defence_gain: +dDef.toFixed(3), covers: covers.slice(0, 4),
      checks: checks.slice(0, 4), fit_score: c.score + FIT_WEIGHT * (dOff + dDef)});
  }
  out.sort((a, b) => b.fit_score - a.fit_score);
  return out.slice(0, top);
}

// --------------------------------------------------------------------------- auto spread (teambuilder.auto_spread)
const damaging = moves => moves.map(m => move(m)).filter(i => i && ['Physical', 'Special'].includes(i.category) && (i.basePower || 0) > 0).map(i => i.name);

export function autoSpread({species: name, nature, item: it, ability, moves, step = 2, required = [], offence = null,
  weights = {}, team_weather = []}) {
  const W = F.weights;
  let speedW = W.speed;
  const form = megaForme(name, it) || toId(name);
  const mega = species(form) || {};
  if (mega.isMega && mega.abilities) ability = abilityName(mega.abilities[0]);
  const th = threatsOf(12).filter(t => toId(t.base) !== toId(name));
  let anchor = playersSpread(name, nature);
  const grid = [...new Set([...Array(PER_STAT / step + 1).keys()].map(k => k * step)
    .concat(anchor ? ['hp', 'def', 'spd', 'atk', 'spa'].map(k => anchor[k] || 0) : []))].sort((a, b) => a - b);
  const mine = damaging(moves).filter(m => !((move(m) || {}).flags || []).includes('recharge'));
  const main = mine.filter(m => ((move(m) || {}).basePower || 0) > 40);
  const mainOr = main.length ? main : mine;
  const phys = mainOr.filter(m => (move(m) || {}).category === 'Physical').length;
  const bs = mega.baseStats || {};
  const offKey = phys * 2 > mainOr.length || (phys * 2 === mainOr.length && phys && (bs.atk || 0) >= (bs.spa || 0)) ? 'atk' : 'spa';
  const slow = (NATURES[toId(nature)] || [])[1] === 'spe';
  const req = new Set(required);
  offence = offence == null ? W.offence : offence;
  const errors = new Set();
  let ownScarf = toId(it) === 'choicescarf' ? 1.5 : 1.0;
  const inWeather = team_weather.map(toId).includes(WEATHER_SPEED[toId(ability)]);
  if (inWeather) ownScarf *= 2;
  const mySpec = sp => ({species: form, item: it || null, ability: ability || null, nature: nature || 'Serious', sp});
  const tSpec = t => ({species: t.species, item: t.item || null, ability: t.ability || null, nature: t.nature || 'Serious', sp: t.sp || {}});

  const goals = {};
  for (const t of th) {
    let ts = stats(t.species, t.nature, t.sp).spe || 0;
    if (toId(t.item) === 'choicescarf') ts = Math.floor(ts * 1.5);
    const need = grid.find(p => Math.floor((stats(form, nature, {spe: p}).spe || 0) * ownScarf) > ts);
    if (!slow && need !== undefined) {
      goals[`speed:${t.species}`] = {kind: 'speed', usage: t.usage, need, label: `Outspeed ${t.species} (${ts} Spe)` + (inWeather ? ' in your weather' : '')};
    }
  }
  const gi = Object.fromEntries(grid.map((p, k) => [p, k]));
  const G = grid.length;
  const survive = {}, takenS = {};
  for (const t of th) {
    const att = tSpec(t);
    let best = null;
    for (const m of damaging(t.moves || [])) {
      const r = damage(att, m, mySpec({}), errors);
      if (r && (!best || r.max > best[0])) best = [r.max, m];
    }
    if (!best || best[0] <= 0) continue;
    const mv = best[1];
    const dkey = (move(mv) || {}).category === 'Physical' ? 'def' : 'spd';
    const gid = `survive:${t.species}`;
    const sv = new Uint8Array(G * G), tk = new Float32Array(G * G).fill(1);
    let any = false;
    for (const hp of grid) for (const d of grid) {
      const r = damage(att, mv, mySpec({hp, [dkey]: d}), errors);
      if (!r) continue;
      any = true;
      sv[gi[hp] * G + gi[d]] = r.max < r.defenderHp ? 1 : 0;
      tk[gi[hp] * G + gi[d]] = Math.min(1, r.max / Math.max(1, r.defenderHp));
    }
    if (any) {
      survive[gid] = sv; takenS[gid] = tk;
      goals[gid] = {kind: 'survive', usage: t.usage, dkey, label: `Survive ${t.species}'s ${mv}`};
    }
  }
  const ko = {}, dealt = {};
  for (const t of th) {
    const dfn = tSpec(t);
    const gid = `ko:${t.species}`;
    for (const m of mine) for (const p of grid) {
      const r = damage(mySpec({[offKey]: p}), m, dfn, errors);
      if (!r) continue;
      const hp = r.defenderHp || 1;
      const v = r.min >= hp ? 1 : r.min * 2 >= hp ? 0.5 : 0;
      const cur = ko[gid] || (ko[gid] = {});
      if (v > (cur[p] || [0, ''])[0]) cur[p] = [v, m];
      const dd = dealt[gid] || (dealt[gid] = {});
      dd[p] = Math.max(dd[p] || 0, Math.min(1, (r.min + r.max) / 2 / hp));
      goals[gid] = goals[gid] || {kind: 'ko', usage: t.usage, label: `KO ${t.species}`};
    }
  }
  const gids = Object.keys(goals);
  const met = (gid, spe, off, hp, df, sd) => {
    const g = goals[gid];
    if (g.kind === 'speed') return spe >= g.need ? 1 : 0;
    if (g.kind === 'survive') return survive[gid][gi[hp] * G + gi[g.dkey === 'def' ? df : sd]];
    return ((ko[gid] || {})[off] || [0])[0];
  };
  const part = (gid, spe, off, hp, df, sd) => {
    const g = goals[gid];
    if (g.kind === 'survive') return 1 - takenS[gid][gi[hp] * G + gi[g.dkey === 'def' ? df : sd]];
    if (g.kind === 'ko') return (dealt[gid] || {})[off] || 0;
    return 0;
  };
  if (anchor) speedW *= Math.min(1, (anchor.spe || 0) / PER_STAT);  // players' speed investment: how much speed matters
  const kindW = {ko: offence, speed: speedW};
  const gw = gids.map(gid => goals[gid].usage * (kindW[goals[gid].kind] ?? 1) * (weights[gid] ?? 1));
  const score = a => gids.reduce((s, gid, k) => s + gw[k] * (met(gid, ...a) + W.partial * part(gid, ...a)), 0);

  const otherKey = offKey === 'atk' ? 'spa' : 'atk';
  if (anchor && (anchor[otherKey] || 0) > (anchor[offKey] || 0)) [anchor[offKey], anchor[otherKey]] = [anchor[otherKey] || 0, anchor[offKey] || 0];
  const speOpts = slow ? [0] : [...new Set([0, PER_STAT, ...gids.filter(g => goals[g].kind === 'speed').map(g => goals[g].need), ...(anchor ? [anchor.spe || 0] : [])])].sort((a, b) => a - b);
  const avgGoal = gids.reduce((a, g) => a + goals[g].usage, 0) / Math.max(1, gids.length);

  const spreadOf = ([spe, off, hp, df, sd]) => {
    const sp = {hp, atk: 0, def: df, spa: 0, spd: sd, spe};
    sp[offKey] = off;
    let left = TOTAL - Object.values(sp).reduce((a, b) => a + b, 0);
    for (const k of [offKey, 'hp']) {
      const add = Math.min(left, PER_STAT - sp[k]);
      if (add > 0) { sp[k] += add; left -= add; }
    }
    return sp;
  };
  const moved = sp => (anchor ? STATS.reduce((a, k) => a + Math.abs(sp[k] - (anchor[k] || 0)), 0) / 2 : 0);

  let best = null;
  for (const spe of speOpts) for (const off of grid) {
    const rest = TOTAL - spe - off;
    if (rest < 0) continue;
    for (const hp of grid) for (const df of grid) {
      const top = Math.min(PER_STAT, rest - hp - df);
      if (top < 0) continue;
      const sds = new Set([top - top % step]);
      if (anchor && (anchor.spd || 0) <= top && gi[anchor.spd || 0] !== undefined) sds.add(anchor.spd || 0);
      for (const sd of sds) {
        if (gi[sd] === undefined) continue;
        const a = [spe, off, hp, df, sd];
        const reqOk = [...req].filter(g => goals[g] && met(g, ...a) >= 1).length;
        const val = score(a) - W.point_cost * avgGoal * moved(spreadOf(a)) + 1e-4 * (hp + df + sd + off + spe);
        if (!best || reqOk > best[0] || (reqOk === best[0] && val > best[1])) best = [reqOk, val, a];
      }
    }
  }
  if (!best) return {error: 'no spread found'};
  const a = best[2];
  const sp = spreadOf(a);
  const report = gids.map(gid => {
    const g = goals[gid];
    const v = met(gid, ...a);
    let label = g.label;
    if (g.kind === 'ko') {
      const mv = ((ko[gid] || {})[a[1]] || [0, ''])[1];
      const nm = gid.split(':').slice(1).join(':');
      label = v === 1 ? `OHKO ${nm} with ${mv}` : v === 0.5 ? `2HKO ${nm} with ${mv}` : `KO ${nm} (not reached)`;
    }
    return {id: gid, goal: label, met: v > 0, full: v >= 1, usage: +g.usage.toFixed(3), kind: g.kind, required: req.has(gid)};
  });
  report.sort((x, y) => (x.required === y.required ? 0 : x.required ? -1 : 1) || y.usage - x.usage || x.kind.localeCompare(y.kind));
  const reqMet = [...req].filter(g => goals[g]).every(g => report.some(r => r.id === g && r.full));
  if (errors.size && !gids.some(g => goals[g].kind !== 'speed')) return {error: 'the damage calc rejected this set: ' + [...errors].sort().join('; ')};
  return {species: speciesName(form), nature, sp, stats: stats(form, nature, sp), warnings: [...errors].sort(), goals: report,
    met: report.filter(r => r.met).length, total_goals: report.length, required_met: reqMet, offence,
    threats: th.map(t => t.species), anchor, moved: moved(sp)};
}

export function autoSpreadRequest(b) {
  const offence = F.weights.offence * Math.max(0.25, Math.min(3, Number(b.offence) || 1));
  return autoSpread({species: b.species || '', nature: b.nature || 'Serious', item: b.item, ability: b.ability,
    moves: b.moves || [], required: (b.required || []).slice(0, 12).map(String), offence,
    team_weather: teamWeathers((b.team || []).slice(0, 6))});
}

export function statsRequest(b) {
  const form = megaForme(b.species, b.item) || b.species;
  return {stats: stats(form, b.nature, b.sp || {}), form: form !== b.species ? speciesName(form) : null,
    types: (species(form) || {}).types || []};
}

// --------------------------------------------------------------------------- team finder (teamsearch.py)
const match = (team, wanted) => {
  const ids = team.map(toId);
  return wanted.every(w => ids.some(t => t === w || t.startsWith(w)));
};
const member = st => {
  const d = species(st.species) || {};
  return {species: d.name || st.species, item: itemName(st.item || ''), types: d.types || [], moves: (st.moves || []).map(m => moveName(m))};
};
function summary(t) {
  const out = {id: t.id, source: t.source, species: t.sets.map(s => speciesName(s.species)), members: t.sets.map(member), date: t.date};
  if (t.source === 'tournament') {
    const p = t.placement;
    Object.assign(out, {event: t.event || 'tournament', placement: p, record: t.record});
    out.label = [t.event || 'tournament', p ? `#${p}` : null, t.record].filter(Boolean).join(' · ');
  } else {
    Object.assign(out, {rating: t.rating, won: t.won});
    out.label = `ladder ${t.rating || '?'}` + (t.won ? ' · won' : t.won === 0 ? ' · lost' : '');
  }
  return out;
}

export function search({species: sp = [], source = 'all', limit = 40, moves = [], items = [], moves_on_species = false}) {
  const wanted = sp.map(toId).filter(Boolean);
  const mv = moves.map(toId).filter(Boolean);
  const it = items.map(toId).filter(Boolean);
  const on = moves_on_species ? wanted : [];
  const keep = t => {
    if (!match(t.sets.map(s => s.species), wanted)) return false;
    if (mv.length) {
      const have = new Set(t.sets.filter(s => !on.length || on.some(w => toId(s.species).startsWith(w))).flatMap(s => (s.moves || []).map(toId)));
      if (!mv.every(m => have.has(m))) return false;
    }
    if (it.length) {
      const have = new Set(t.sets.map(s => toId(s.item)));
      if (!it.every(i => have.has(i))) return false;
    }
    return true;
  };
  let found = [];
  if (source === 'all' || source === 'tournament') {
    const ts = F.finder.filter(t => t.source === 'tournament' && keep(t));
    ts.sort((a, b) => (a.placement || 999) - (b.placement || 999) || (parseInt(String(b.date || '0').slice(0, 4)) || 0) - (parseInt(String(a.date || '0').slice(0, 4)) || 0));
    found = found.concat(ts);
  }
  if (source === 'all' || source === 'ladder') {
    const ls = F.finder.filter(t => t.source !== 'tournament' && keep(t));
    ls.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    found = found.concat(ls);
  }
  const tour = found.filter(t => t.source === 'tournament').length;
  if (source === 'all') {
    const a = found.filter(t => t.source === 'tournament'), b = found.filter(t => t.source !== 'tournament');
    const mixed = [];
    for (let k = 0; k < Math.min(a.length, b.length); k++) mixed.push(a[k], b[k]);
    found = mixed.concat(a.slice(b.length), b.slice(a.length));
  }
  return {total: found.length, tournament: tour, ladder: found.length - tour, teams: found.slice(0, limit).map(summary)};
}

function filled(t) {
  const sets = [], used = [];
  for (const st of t.sets) {
    const u = usualSlot(st.species, [...used, st.item || '']) || {};
    const moves = [...(st.moves || [])];
    for (const m of u.moves || []) {
      if (moves.length >= 4) break;
      if (!moves.map(toId).includes(toId(m))) moves.push(toId(m));
    }
    const it = st.item || toId(u.item || '');
    used.push(it);
    sets.push({...st, moves: moves.slice(0, 4), item: it, ability: st.ability || toId(u.ability || ''),
      nature: st.nature || toId(u.nature || ''), stat_points: u.sp || null});
  }
  return {...t, sets, filled: true};
}

const SP_NAMES = {hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe'};
export function exportTeam(id) {
  let t = F.finder.find(x => x.id === id);
  if (!t) return null;
  if (t.partial) t = filled(t);
  const lines = [];
  for (const s of t.sets) {
    const nm = speciesName(s.species);
    lines.push(s.item ? `${nm} @ ${itemName(s.item)}` : nm);
    if (s.ability) lines.push(`Ability: ${abilityName(s.ability)}`);
    lines.push('Level: 50');
    const pts = s.stat_points;
    if (pts && Object.values(pts).some(Boolean)) lines.push('EVs: ' + Object.entries(pts).filter(([, v]) => v).map(([k, v]) => `${v} ${SP_NAMES[k]}`).join(' / '));
    if (s.nature) lines.push(`${natureName(s.nature)} Nature`);
    for (const m of s.moves || []) lines.push(`- ${moveName(m)}`);
    lines.push('');
  }
  const note = t.source === 'tournament' ? null : t.filled
    ? 'From a replay: moves, items and abilities seen in the battle are kept; the rest (and every spread) is the usual singles set, assumed.'
    : 'Open team sheet: no stat points shown; add your own spreads.';
  const sets = t.sets.map(st => ({...member(st), ability: st.ability ? abilityName(st.ability) : '', nature: natureName(st.nature || ''),
    stat_points: Object.fromEntries(Object.entries(st.stat_points || {}).filter(([, v]) => v))}));
  return {...summary(t), text: lines.join('\n').trim() + '\n', note, sets};
}

export function names() {
  if (CACHE.names) return CACHE.names;
  const sp = new Map(), mv = new Map(), it = new Map();
  const inc = (m, k) => { if (k) m.set(k, (m.get(k) || 0) + 1); };
  for (const t of F.finder) for (const st of t.sets) {
    inc(sp, speciesName(st.species)); inc(it, itemName(st.item || ''));
    for (const m of st.moves || []) inc(mv, moveName(m));
  }
  const order = m => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  return (CACHE.names = {species: order(sp), moves: order(mv), items: order(it)});
}

export const teamSets = name => commonSets(name);

// --------------------------------------------------------------------------- Showdown text
const STAT_KEYS = {hp: 'hp', atk: 'atk', def: 'def', spa: 'spa', spd: 'spd', spe: 'spe', spatk: 'spa', spdef: 'spd'};

export function parseTeam(text) {
  const sets = [], problems = [];
  for (const block of String(text || '').replace(/\r/g, '').split(/\n\s*\n/)) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length || lines[0].startsWith('===')) continue;
    let [head, it] = lines[0].split(' @ ');
    head = head.replace(/\s*\((M|F)\)\s*$/, '');
    const nick = head.match(/\(([^)]+)\)\s*$/);
    const name = nick ? nick[1] : head.trim();
    const sp = species(name);
    if (!sp) { problems.push(`Unknown Pokemon: ${name}`); continue; }
    const s = {species: sp.name, item: it ? itemName(it.trim()) : '', ability: '', nature: '', moves: [], stat_values: {}};
    if (it && !item(it)) problems.push(`${sp.name}: unknown item ${it.trim()}`);
    for (const l of lines.slice(1)) {
      if (l.startsWith('Ability:')) s.ability = abilityName(l.slice(8).trim());
      else if (/^EVs:/i.test(l)) {
        for (const part of l.slice(4).split('/')) {
          const m = part.trim().match(/^(\d+)\s+(\w+)$/);
          if (m && STAT_KEYS[toId(m[2])]) s.stat_values[STAT_KEYS[toId(m[2])]] = Number(m[1]);
        }
      } else if (/ Nature$/.test(l)) s.nature = natureName(l.replace(/ Nature$/, '').trim());
      else if (l.startsWith('-')) {
        const mv = l.slice(1).trim();
        if (!move(mv)) problems.push(`${sp.name}: unknown move ${mv}`);
        s.moves.push(moveName(mv));
      }
    }
    sets.push(s);
  }
  return {sets, problems};
}

// Basic checks (not Showdown's validator: learnsets are not checked here).
export function validate(text) {
  const {sets, problems} = parseTeam(text);
  const out = [...problems];
  const min = singles() ? 3 : 4;
  if (sets.length < min || sets.length > 6) out.push(`A team has ${min} to 6 Pokemon (this one has ${sets.length})`);
  const seen = new Set(), items = new Set();
  for (const s of sets) {
    const d = species(s.species) || {};
    const base = toId(d.baseSpecies || s.species);
    if (d.legal === false) out.push(`${s.species} is not allowed in Reg M-C`);
    if (seen.has(base)) out.push(`Species Clause: two ${s.species}`);
    seen.add(base);
    if (s.item) {
      if (items.has(toId(s.item))) out.push(`Item Clause: two ${s.item}`);
      items.add(toId(s.item));
    }
    if (s.ability && !(d.abilities || []).includes(toId(s.ability))) out.push(`${s.species} cannot have ${s.ability}`);
    if (s.moves.length > 4) out.push(`${s.species} has more than 4 moves`);
    if (new Set(s.moves.map(toId)).size < s.moves.length) out.push(`${s.species} repeats a move`);
    const vals = Object.values(s.stat_values);
    if (vals.some(v => v > PER_STAT)) out.push(`${s.species}: at most ${PER_STAT} stat points in one stat`);
    if (vals.reduce((a, b) => a + b, 0) > TOTAL) out.push(`${s.species}: at most ${TOTAL} stat points in total`);
  }
  return out.length ? {ok: false, legal: false, problems: out} : {ok: true, legal: true, problems: [], note: 'Basic checks only: learnsets are not checked here.'};
}
