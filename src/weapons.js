// Weapons. Numbers come from the old engine converted to world units:
// rockets and nails fly at 1000 map units per second (31 world units),
// a rocket hits for 100 to 120 and splashes for the same minus half the
// distance in map units.

export const WEAPONS = {
  scatter: { slot: 1, ammo: 'shells', cooldown: 0.5, pellets: 6, damage: 4, spread: 0.04, sound: 'scatter', kick: 0.08 },
  needler: { slot: 2, ammo: 'nails', cooldown: 0.1, projectile: 'nail', speed: 31, damage: 9, sound: 'rivet', kick: 0.02 },
  launcher: { slot: 3, ammo: 'rockets', cooldown: 0.8, projectile: 'rocket', speed: 31, damage: 100, sound: 'rocket', kick: 0.12 },
};

export const WEAPON_ORDER = ['scatter', 'needler', 'launcher'];

export const ITEMS = {
  health: { kind: 'health', amount: 25, max: 100 },
  mega: { kind: 'health', amount: 100, max: 250, secret: true },
  armor: { kind: 'armor', amount: 100, type: 0.3 },
  heavyArmor: { kind: 'armor', amount: 150, type: 0.6, secret: true },
  shells: { kind: 'ammo', ammo: 'shells', amount: 20 },
  nails: { kind: 'ammo', ammo: 'nails', amount: 25 },
  rockets: { kind: 'ammo', ammo: 'rockets', amount: 5 },
  needler: { kind: 'weapon', weapon: 'needler', ammo: 'nails', amount: 30 },
  launcher: { kind: 'weapon', weapon: 'launcher', ammo: 'rockets', amount: 5 },
  key: { kind: 'key', key: 'rune' },
};
