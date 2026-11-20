import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../src/levels.js';
import { isSolid, MATERIALS } from '../src/voxels.js';
import { VOX, PLAYER } from '../src/config.js';

// Walks the level the way a player can without tricks: two voxels wide, four
// tall, up a one-voxel step, up a two-voxel jump, down any drop, never into a
// liquid. Doors are open unless they need a key the walker lacks. A plat
// carries the walker from its bottom to its top.
function walk(level, keys) {
  const { grid, entities } = level;
  const W = 2;
  const H = Math.ceil(PLAYER.height / VOX);
  const locked = entities.filter((e) => e.type === 'door' && e.key && !keys.has(e.key));
  const plats = entities
    .filter((e) => e.type === 'plat')
    .map((p) => ({
      i0: Math.round(p.base[0] / VOX),
      i1: Math.round(p.base[3] / VOX),
      k0: Math.round(p.base[2] / VOX),
      k1: Math.round(p.base[5] / VOX),
      jb: Math.round(p.base[4] / VOX),
      jt: Math.round((p.base[4] + p.move[1]) / VOX),
    }));
  const inBox = (i, j, k, b) =>
    (i + 0.5) * VOX > b[0] && (i + 0.5) * VOX < b[3] && (j + 0.5) * VOX > b[1] && (j + 0.5) * VOX < b[4] && (k + 0.5) * VOX > b[2] && (k + 0.5) * VOX < b[5];
  const blocks = (i, j, k) => {
    const v = grid.get(i, j, k);
    if (isSolid(v) || MATERIALS[v].liquid) return true;
    return locked.some((d) => inBox(i, j, k, d.base));
  };
  const onPlat = (i, k, j) => plats.find((p) => i >= p.i0 && i + W <= p.i1 && k >= p.k0 && k + W <= p.k1 && (j === p.jb || j === p.jt));
  const fits = (i, j, k) => {
    for (let a = 0; a < W; a++) for (let c = 0; c < W; c++) for (let b = 0; b < H; b++) if (blocks(i + a, j + b, k + c)) return false;
    return true;
  };
  const grounded = (i, j, k) => {
    if (onPlat(i, k, j)) return true;
    for (let a = 0; a < W; a++) for (let c = 0; c < W; c++) if (isSolid(grid.get(i + a, j - 1, k + c))) return true;
    return false;
  };
  const key = (i, j, k) => `${i},${j},${k}`;
  const start = entities.find((e) => e.type === 'start');
  const s = [Math.round(start.x / VOX) - 1, Math.round(start.y / VOX), Math.round(start.z / VOX) - 1];
  const seen = new Set([key(...s)]);
  const queue = [s];
  const push = (i, j, k) => {
    const id = key(i, j, k);
    if (seen.has(id)) return;
    seen.add(id);
    queue.push([i, j, k]);
  };
  while (queue.length) {
    const [i, j, k] = queue.pop();
    const plat = onPlat(i, k, j);
    if (plat && fits(i, plat.jt, k)) push(i, plat.jt, k);
    for (const [di, dk] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const ni = i + di;
      const nk = k + dk;
      for (const up of [0, 1, 2]) {
        if (up === 2 && !fits(i, j + 2, k)) continue;
        if (fits(ni, j + up, nk) && grounded(ni, j + up, nk)) {
          push(ni, j + up, nk);
          break;
        }
      }
      if (fits(ni, j, nk) && !grounded(ni, j, nk)) {
        let d = j;
        while (d > 0 && fits(ni, d - 1, nk) && !grounded(ni, d, nk)) d--;
        if (grounded(ni, d, nk)) push(ni, d, nk);
      }
    }
  }
  return [...seen].map((s) => s.split(',').map(Number));
}

const touches = (spots, x, y, z) => {
  const ti = Math.floor(x / VOX);
  const tj = Math.round(y / VOX);
  const tk = Math.floor(z / VOX);
  return spots.some(([i, j, k]) => ti >= i - 1 && ti <= i + 2 && tk >= k - 1 && tk <= k + 2 && Math.abs(j - tj) <= 1);
};

const reachesBox = (spots, b) =>
  spots.some(([i, j, k]) => {
    const x = (i + 1) * VOX;
    const y = j * VOX;
    const z = (k + 1) * VOX;
    return x > b[0] && x < b[3] && z > b[2] && z < b[5] && y >= b[1] - 0.6 && y < b[4];
  });

for (const def of LEVELS) {
  const level = def.build();
  const { entities, grid } = level;

  test(`${def.id}: bodies spawn in open space, standing on something`, () => {
    for (const e of entities.filter((x) => x.type === 'start' || x.type === 'monster' || x.type === 'item')) {
      const v = grid.at(e.x, e.y + 0.1, e.z);
      assert.ok(!isSolid(v), `${e.type} ${e.kind || e.item || ''} at ${e.x},${e.y},${e.z} is inside a wall`);
      assert.ok(isSolid(grid.at(e.x, e.y - 0.1, e.z)), `${e.type} ${e.kind || e.item || ''} at ${e.x},${e.y},${e.z} floats`);
    }
  });

  test(`${def.id}: every light sits in open space`, () => {
    for (const l of entities.filter((x) => x.type === 'light')) {
      assert.ok(!isSolid(grid.at(l.x, l.y, l.z)), `light at ${l.x},${l.y},${l.z} is inside a wall`);
    }
  });

  test(`${def.id}: the key is reachable, and with it the exit`, () => {
    const keyItem = entities.find((e) => e.type === 'item' && e.item === 'key');
    const exit = entities.find((e) => e.type === 'exit');
    const without = walk(level, new Set());
    assert.ok(touches(without, keyItem.x, keyItem.y, keyItem.z), 'the key cannot be reached');
    assert.equal(reachesBox(without, exit.box), false, 'the exit is reachable without the key');
    const withKey = walk(level, new Set(['rune']));
    assert.ok(reachesBox(withKey, exit.box), 'the exit cannot be reached even with the key');
    for (const it of entities.filter((e) => e.type === 'item' && !e.optional)) {
      assert.ok(touches(withKey, it.x, it.y, it.z), `item ${it.item} at ${it.x},${it.y},${it.z} is unreachable`);
    }
  });

  test(`${def.id}: the rocket jump ledge cannot be walked to`, () => {
    const spots = walk(level, new Set(['rune']));
    const optional = entities.filter((e) => e.type === 'item' && e.optional);
    assert.ok(optional.length > 0);
    for (const it of optional) assert.equal(touches(spots, it.x, it.y, it.z), false, `${it.item} is reachable by walking`);
  });
}
