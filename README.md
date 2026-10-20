# RockSlideMissed

A teambuilder for Pokemon Champions, Reg M-C, for both VGC (doubles) and singles (BSS). It runs entirely in the browser as a static site on GitHub Pages.

It covers:

- **Build:** six slots, where picking a Pokemon builds its set around the team. Moves cover the team's gaps, the item suits the moves and isn't already on the team, the nature follows the moves, and the spread comes from an auto-spread against the most used threats.
- **Team analysis:** coverage against the top threats, plus suggested teammates.
- **Import and export:** Showdown text, with basic legality checks.
- **Teams:** search tournament teams and open team sheets by Pokemon, moves and items, then copy a team or open it in Build.

Damage calcs use [@smogon/calc](https://github.com/smogon/damage-calc) (Champions = generation 0). Game data comes from Pokemon Showdown.

## Data

Usage sets, spreads, threats and teams come from public sources: Smogon's monthly usage stats, public Showdown replays rated 1300+ (VGC) or 1100+ (singles), and tournament team lists from the Limitless API. Ladder teams are anonymous: no usernames, replay IDs or times. The data is refreshed and pushed by ProjectPoke's scripts/publish_web.py.

This repository is only the teambuilder; the battle trainer is not part of it.

## Build

```sh
npm install
# in ProjectPoke: python scripts/export_web.py      (writes build/*.json here)
npm run build                                       # docs/js/calc.bundle.js, docs/data/*
npm run serve                                       # http://localhost:8099
```

GitHub Pages serves the `docs/` folder of the `main` branch.
