// Tiny DOM helpers. Event data is always inserted as text (never as HTML).
export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return e;
}

export function clear(node, ...children) {
  node.replaceChildren(...children.flat().filter(Boolean));
  return node;
}

export const ratingClass = r => 'r-' + String(r || 'none').toLowerCase();
export const typeChip = t => el('span', {class: `chip t-${String(t).toLowerCase()}`, text: t});

// Pokemon icon (Showdown's dex sprites, named after the display name: "Salamence-Mega"
// -> salamence-mega.png). Falls back through the compressed forme (urshifu-rapidstrike)
// and the base species, then disappears; nothing breaks on an unknown name.
export function pokeIcon(name, cls = 'picon') {
  const slug = String(name || '').toLowerCase().replace(/♀/g, '-f').replace(/♂/g, '-m').replace(/\s+/g, '-');
  const parts = slug.split('-');
  const c2 = parts.length > 2 ? `${parts[0]}-${parts.slice(1).join('')}` : slug;
  const url = step => `https://play.pokemonshowdown.com/sprites/dex/${[slug, c2, parts[0]][step]}.png`;
  const img = el('img', {class: cls, src: url(0), alt: '', loading: 'lazy'});
  img.addEventListener('error', () => {
    const step = Number(img.dataset.step || '0') + 1;
    if (step > 2) { img.remove(); return; }
    img.dataset.step = String(step);
    img.src = url(step);
  });
  return img;
}

export function hpBar(pct) {
  const cls = pct > 50 ? '' : pct > 20 ? 'mid' : 'low';
  const inner = el('span');
  inner.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  return el('div', {class: `hpbar ${cls}`, role: 'img', 'aria-label': `${Math.round(pct)}% HP`}, inner);
}

// "Their likely moves" and "suggested line vs their likely replies" (explain.predictions).
export function predictionBlock(preds, versus) {
  if (!preds || !preds.length) return null;
  const pct = x => `${Math.round(100 * x)}%`;
  const option = o => {
    const bar = el('span', {class: 'bar'});
    bar.style.width = `${Math.round(60 * o.share)}px`;  // set via the DOM: the page's CSP forbids inline styles
    return el('li', {}, bar, el('span', {text: ` ${pct(o.share)} ${o.action}`}));
  };
  const cards = preds.map(p => el('div', {class: 'pred'}, el('strong', {text: p.pokemon}), el('ul', {}, ...p.options.map(option))));
  let vs = null;
  if (versus && versus.length) {
    const items = versus.map(v => el('li', {}, el('strong', {text: `${pct(v.share)} `}), v.reply,
      el('span', {class: 'dim', text: ` → ${v.result}`})));
    vs = el('details', {}, el('summary', {text: 'Suggested line against their likely replies'}), el('ul', {class: 'small'}, ...items));
  }
  return el('div', {class: 'preds'}, el('h3', {text: 'Their likely moves'}), el('div', {class: 'predgrid'}, ...cards), vs);
}
