// Damage calcs in the browser: @smogon/calc, Champions = generation 0 (a port of
// ProjectPoke's engine/calc.js without the battle-simulator fallback).
import {calculate, Generations, Pokemon, Move, Field, NATURES} from '@smogon/calc';

const GEN = Generations.get(0);
const NATURE_NAMES = Object.keys(NATURES);
const toId = x => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function nameOf(table, id, kind) {
  if (!id) return undefined;
  const e = table.get(toId(id));
  if (!e) throw new Error(`unknown ${kind} ${id}`);
  return e.name;
}

const MONS = new Map();  // spec -> Pokemon (calculate() works on copies)
function makePokemon(s) {
  const key = JSON.stringify([s.species, s.item, s.ability, s.nature, s.sp]);
  let m = MONS.get(key);
  if (!m) {
    const sp = GEN.species.get(toId(s.species));
    if (!sp) throw new Error(`unknown species ${s.species}`);
    m = new Pokemon(GEN, sp.name, {
      level: 50, ability: nameOf(GEN.abilities, s.ability, 'ability'), item: nameOf(GEN.items, s.item, 'item'),
      nature: NATURE_NAMES.find(n => toId(n) === toId(s.nature)) || 'Serious', evs: s.sp || {},
    });
    if (MONS.size > 20000) MONS.clear();
    MONS.set(key, m);
  }
  return m;
}

const FIELDS = {Doubles: new Field({gameType: 'Doubles'}), Singles: new Field({gameType: 'Singles'})};

// {attacker, defender, move, spread} -> {min, max, defenderHp}; throws on unknown names.
export function calc(a, singles = false) {
  const att = makePokemon(a.attacker);
  const dfn = makePokemon(a.defender);
  const move = new Move(GEN, a.move, {isSpread: !singles && !!a.spread});
  if (!move || !move.name || move.name === '(No Move)') throw new Error(`unknown move ${a.move}`);
  const r = calculate(GEN, att, dfn, move, FIELDS[singles ? 'Singles' : 'Doubles']);
  const [min, max] = r.range();
  return {min, max, defenderHp: dfn.maxHP()};
}
