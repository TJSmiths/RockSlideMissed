// Entry point: format switch, Build and Teams pages.
import {apiFormat, ready} from './api.js';
import {loadIntoBuilder, renderBuild} from './panels/build.js';
import {renderTeams} from './panels/teams.js';

const $ = id => document.getElementById(id);
const view = (() => {
  let v = {scale: 1, theme: 'dark'};
  try { v = {...v, ...JSON.parse(localStorage.getItem('vgc-view') || '{}')}; } catch (e) { /* defaults */ }
  return v;
})();
function applyView() {
  document.documentElement.style.setProperty('--scale', String(view.scale));
  if (view.theme === 'dark') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', view.theme);
  $('theme').value = view.theme;
  try { localStorage.setItem('vgc-view', JSON.stringify(view)); } catch (e) { /* private window */ }
}
$('text-smaller').addEventListener('click', () => { view.scale = Math.max(0.85, +(view.scale - 0.1).toFixed(2)); applyView(); });
$('text-larger').addEventListener('click', () => { view.scale = Math.min(1.6, +(view.scale + 0.1).toFixed(2)); applyView(); });
$('theme').addEventListener('change', e => { view.theme = e.target.value; applyView(); });
applyView();

let page = 'build';
const store = {};
function show(name) {
  page = name;
  for (const b of document.querySelectorAll('.navbtn')) {
    if (b.dataset.page === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  for (const s of document.querySelectorAll('.page')) s.hidden = s.id !== `page-${name}`;
  if (name === 'build') renderBuild($('build-panel'));
  if (name === 'teams') renderTeams($('teams-panel'), store, async text => { await loadIntoBuilder(text); show('build'); });
}
for (const b of document.querySelectorAll('.navbtn')) b.addEventListener('click', () => show(b.dataset.page));

$('format').value = apiFormat.value;
$('format').addEventListener('change', async e => {
  apiFormat.value = e.target.value;
  try { localStorage.setItem('vgc-build-format', e.target.value); } catch (x) { /* private window */ }
  if (await load()) show(page);
});

// This format's data (a few MB): loaded once, before the first page.
async function load() {
  try {
    await ready();
    return true;
  } catch (e) {
    $(`${page}-panel`).replaceChildren(Object.assign(document.createElement('p'),
      {className: 'validation', textContent: `Could not load the data: ${e.message}`}));
    return false;
  }
}
if (await load()) show('build');
