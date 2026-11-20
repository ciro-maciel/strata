# Notes for coding agents

- Plain ES modules, no bundler, no npm dependencies. three.js comes from the
  import map in `index.html`. WebGL 2 is required (3D textures).
- `src/voxels.js`, `src/physics.js`, `src/lighting.js` and `src/levels.js`
  must not import three.js: the tests run them in Node with
  `node --test test/*.test.js`.
- Movement constants in `src/config.js` are the old engine's numbers divided
  by 32. Change them only on purpose; `test/physics.test.js` pins them.
- The level is code in `src/levels.js`. Run the tests after editing it; they
  walk it and prove it can be finished.
- Every player-facing string goes in both languages in `src/i18n.js`.
- `strata.advance(seconds)` in the browser console runs the game without
  animation frames, useful to script a scenario and look at the result.
- Do not add copied material from other games. See CONTRIBUTING.md.
