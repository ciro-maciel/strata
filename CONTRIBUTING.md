# Contributing

Thanks for wanting to help. Strata stays small on purpose: plain
JavaScript modules, three.js from a CDN, no build step, no asset files.

## Before you open a pull request

```bash
node --test test/*.test.js
```

Then play the levels you touched in a browser (`python3 -m http.server`).

## Good first contributions

- A new level in `src/levels.js` (the tests walk it and check it can be finished).
- A new monster type in `src/monsters.js` with its model in `src/models.js`.
- A new sound in `src/audio.js`.

## Rules

- No copied code, art, sound, levels, names or characters from other games.
  Study them, then write your own.
- No asset files: draw textures on canvas, build models in code, synthesize sounds.
- Every text a player reads exists in English and Brazilian Portuguese
  (`src/i18n.js`).
- Identifiers and comments in English. No emoji.
- A test counts only if it fails when you break the code it protects.

## Commits

`type(scope): imperative sentence, lowercase, no final period`, with type in
`feat fix refactor chore docs test ci perf`.
