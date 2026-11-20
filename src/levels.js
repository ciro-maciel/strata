import { VoxelGrid, MAT } from './voxels.js';

// A level is a program: start from solid rock, carve rooms, fill stairs and
// ledges, paint walls. Coordinates are world units (x east, y up, z south).
// Everything a level needs besides geometry goes in `entities`:
//   start    { x, y, z, angle }
//   light    { x, y, z, radius, intensity, color }
//   monster  { kind: 'warden' | 'stalker' | 'hurler', x, y, z }
//   item     { item, x, y, z, optional }   optional: needs a rocket jump
//   door     { base: [x0,y0,z0,x1,y1,z1], move: [dx,dy,dz], key, wait }
//   plat     { base, move }                rises when stood on
//   exit     { box }

function room(g, [x0, y0, z0, x1, y1, z1], { wall, floor, ceil, floorThick = 1 }) {
  g.paint(x0 - 1, y0, z0 - 1, x1 + 1, y1, z1 + 1, MAT[wall]);
  g.paint(x0 - 1, y0 - floorThick, z0 - 1, x1 + 1, y0, z1 + 1, MAT[floor]);
  g.paint(x0 - 1, y1, z0 - 1, x1 + 1, y1 + 1, z1 + 1, MAT[ceil]);
  g.fill(x0, y0, z0, x1, y1, z1, MAT.air);
}

const WARM = [1, 0.88, 0.7];
const LAVA = [1, 0.42, 0.12];
const COLD = [0.75, 0.82, 1];

function cistern() {
  const g = new VoxelGrid(62, 26, 66);
  const e = [];
  const light = (x, y, z, radius, intensity = 1, color = WARM) => e.push({ type: 'light', x, y, z, radius, intensity, color });
  const monster = (kind, x, y, z) => e.push({ type: 'monster', kind, x, y, z });
  const item = (name, x, y, z, optional = false) => e.push({ type: 'item', item: name, x, y, z, optional });

  // Start room, with the key room built right on top of it.
  room(g, [4, 4, 4, 14, 9, 14], { wall: 'metal', floor: 'plate', ceil: 'metal' });
  e.push({ type: 'start', x: 6.5, y: 4, z: 9, angle: 0 });
  light(9, 8, 9, 9, 1.1);
  item('shells', 12, 4, 6);
  item('health', 12, 4, 12);

  // Corridor east, with a door that opens on approach.
  room(g, [14, 4, 8, 22, 7, 10], { wall: 'metal', floor: 'plate', ceil: 'metal' });
  e.push({ type: 'door', base: [17.5, 4, 8, 18, 7, 10], move: [0, 2.9, 0], wait: 3 });
  light(15.5, 6.4, 9, 5, 0.8);
  light(20.5, 6.4, 9, 5, 0.8);

  // The great hall: a lava pit with a bridge, a balcony with space under it.
  room(g, [22, 4, 2, 50, 16, 34], { wall: 'stone', floor: 'plate', ceil: 'stone' });
  g.paint(29, 1, 11, 43, 4, 27, MAT.brick);
  g.fill(30, 1.5, 12, 42, 4, 18, MAT.air);
  g.fill(30, 1.5, 20, 42, 4, 26, MAT.air);
  g.fill(30, 1.5, 12, 42, 3, 18, MAT.lava);
  g.fill(30, 1.5, 20, 42, 3, 26, MAT.lava);
  g.fill(30, 3.5, 18, 42, 4, 20, MAT.trim);
  for (const [x, z] of [
    [28, 10],
    [43, 10],
    [28, 27],
    [43, 27],
  ])
    g.fill(x, 4, z, x + 1, 16, z + 1, MAT.stone);
  g.fill(22, 8, 2, 50, 9, 8, MAT.plate);
  g.fill(26, 9, 7.5, 46, 10, 8, MAT.trim);
  for (let i = 1; i <= 10; i++) g.fill(46, 4, 28 - 2 * i, 50, 4 + 0.5 * i, 30 - 2 * i, MAT.plate);
  e.push({ type: 'plat', base: [23, -0.75, 8.25, 25, 4.25, 10.25], move: [0, 4.75, 0] });
  light(28, 14, 12, 14, 0.85);
  light(44, 14, 12, 14, 0.85);
  light(28, 14, 28, 14, 0.85);
  light(44, 14, 28, 14, 0.85);
  light(36, 3.6, 15, 9, 1.3, LAVA);
  light(36, 3.6, 23, 9, 1.3, LAVA);
  light(30, 7.4, 4, 6, 0.9);
  light(42, 7.4, 4, 6, 0.9);
  light(36, 12, 5, 8, 0.8);
  item('needler', 36, 9, 4.5);
  item('nails', 40, 9, 4.5);
  item('nails', 32, 4, 5);
  item('health', 24, 4, 32);
  item('shells', 48, 4, 32);
  monster('warden', 34, 4, 30);
  monster('warden', 38, 4, 6);
  monster('warden', 30, 9, 4.5);
  monster('warden', 44, 9, 5);
  monster('stalker', 26, 4, 20);

  // Up from the balcony, west, three small steps into the key room.
  room(g, [18, 9, 3, 22, 12, 5], { wall: 'metal', floor: 'plate', ceil: 'metal' });
  g.fill(19, 9, 3, 20, 9.5, 5, MAT.plate);
  g.fill(18, 9, 3, 19, 10, 5, MAT.plate);
  room(g, [4, 10, 2, 18, 15, 14], { wall: 'brick', floor: 'wood', ceil: 'wood', floorThick: 0.5 });
  g.fill(10.5, 10, 7.5, 11.5, 10.5, 8.5, MAT.rune);
  item('key', 11, 10.5, 8);
  item('launcher', 6, 10, 12);
  item('rockets', 8, 10, 12.5);
  item('rockets', 6, 10, 3.5);
  item('armor', 15, 10, 3.5);
  monster('stalker', 14, 10, 11);
  monster('stalker', 8, 10, 4);
  monster('hurler', 6, 10, 8);
  light(11, 14, 8, 9, 1, COLD);
  light(6, 13, 12, 6, 0.8);
  light(20, 11.4, 4, 4, 0.8);

  // South through the locked door into the open courtyard.
  room(g, [34, 4, 34, 38, 8, 40], { wall: 'metal', floor: 'plate', ceil: 'metal' });
  e.push({ type: 'door', base: [34, 4, 36, 38, 8, 36.5], move: [0, 3.9, 0], key: 'rune', wait: 4 });
  light(36, 7.4, 35, 4, 0.8);
  light(36, 7.4, 39, 4, 0.8);
  room(g, [24, 4, 40, 58, 20, 64], { wall: 'stone', floor: 'stone', ceil: 'sky' });
  g.fill(38, 4, 56, 44, 4.5, 62, MAT.rune);
  g.fill(39, 4.5, 57, 43, 5, 61, MAT.rune);
  e.push({ type: 'exit', box: [40, 5, 58, 42, 7.5, 60] });
  for (const [x, z] of [
    [32, 48],
    [50, 48],
    [32, 56],
    [50, 56],
  ])
    g.fill(x, 4, z, x + 1.5, 11, z + 1.5, MAT.brick);
  // A ledge five units up the west wall: only a rocket jump reaches it.
  g.fill(21, 9, 48, 24, 12, 52, MAT.air);
  g.paint(20, 8, 47, 24, 13, 53, MAT.rune);
  item('heavyArmor', 22.5, 9, 49.2, true);
  item('mega', 22.5, 9, 50.8, true);
  light(22.5, 11.5, 50, 4, 1, COLD);
  light(41, 18, 52, 22, 0.75, COLD);
  light(30, 10, 44, 9, 0.9);
  light(52, 10, 44, 9, 0.9);
  light(30, 10, 61, 9, 0.9);
  light(52, 10, 61, 9, 0.9);
  light(41, 6.5, 59, 6, 1.2, [0.5, 0.7, 1]);
  item('rockets', 26, 4, 62);
  item('health', 56, 4, 42);
  item('health', 26, 4, 42);
  item('armor', 56, 4, 62);
  item('shells', 41, 4, 42);
  monster('hurler', 41, 4, 50);
  monster('warden', 28, 4, 46);
  monster('warden', 54, 4, 46);
  monster('stalker', 28, 4, 60);
  monster('stalker', 54, 4, 60);

  return { grid: g, entities: e };
}

export const LEVELS = [{ id: 'cistern', build: cistern }];
