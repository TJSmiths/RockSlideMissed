# RockSlideMissed

A teambuilder for Pokemon Champions, Reg M-C, for both VGC (doubles) and singles (BSS). It runs entirely in the browser as a static site on GitHub Pages.

It covers:

- **Build:** six slots, where picking a Pokemon builds its set around the team. Moves cover the team's gaps, the item suits the moves and isn't already on the team, the nature follows the moves, and the spread comes from an auto-spread against the most used threats.
- **Team analysis:** coverage against the top threats, plus suggested teammates.
- **Import and export:** Showdown text, with basic legality checks.
- **Teams:** search tournament teams and open team sheets by Pokemon, moves and items, then copy a team or open it in Build.

Damage calcs use [@smogon/calc](https://github.com/smogon/damage-calc) (Champions = generation 0). Game data comes from Pokemon Showdown.

## Build

```sh
npm install
# in ProjectPoke: python scripts/export_web.py      (writes build/*.json here)
npm run build                                       # docs/js/calc.bundle.js, docs/data/*
npm run serve                                       # http://localhost:8099
```

GitHub Pages serves the `docs/` folder of the `main` branch.
