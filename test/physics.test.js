import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VoxelGrid, MAT } from '../src/voxels.js';
import { playerMove, knockback, walkMove, updateMovers, openDoor } from '../src/physics.js';
import { PHYS, PLAYER } from '../src/config.js';
import { bakeLight, lightAt } from '../src/lighting.js';

function flatWorld() {
  const grid = new VoxelGrid(40, 12, 40);
  grid.fill(1, 2, 1, 39, 11, 39, MAT.air);
  return { grid, movers: [], bodies: [] };
}

function player(x = 10, z = 10) {
  return { x, y: 2, z, vx: 0, vy: 0, vz: 0, half: PLAYER.half, height: PLAYER.height, onGround: true, jumpReleased: true, alive: true };
}

const run = (world, b, input, seconds, dt = 1 / 120) => {
  for (let t = 0; t < seconds; t += dt) playerMove(world, b, typeof input === 'function' ? input(t) : input, dt);
};

test('on the ground, running tops out at the ground limit', () => {
  const world = flatWorld();
  const b = player(5, 20);
  run(world, b, { wx: 1, wz: 0, wishSpeed: PHYS.maxSpeed, jump: false }, 2);
  const speed = Math.hypot(b.vx, b.vz);
  assert.ok(Math.abs(speed - PHYS.maxSpeed) < 0.05, `speed ${speed}`);
});

test('a jump rises about 45 map units, 1.42 world units', () => {
  const world = flatWorld();
  const b = player();
  let top = 0;
  run(world, b, (t) => ({ wx: 0, wz: 0, wishSpeed: 0, jump: t < 0.05 }), 1.2);
  // second pass measuring the peak
  const c = player();
  for (let t = 0; t < 1; t += 1 / 240) {
    playerMove(world, c, { wx: 0, wz: 0, wishSpeed: 0, jump: t < 0.02 }, 1 / 240);
    top = Math.max(top, c.y - 2);
  }
  const expected = PHYS.jumpSpeed ** 2 / (2 * PHYS.gravity);
  assert.ok(Math.abs(top - expected) < 0.05, `peak ${top}, expected ${expected}`);
  assert.ok(b.onGround, 'did not land');
});

test('steps up to the step height are climbed, taller ones are not', () => {
  const world = flatWorld();
  world.grid.fill(15, 2, 1, 20, 2.5, 39, MAT.stone);
  world.grid.fill(25, 2, 1, 30, 3, 39, MAT.stone);
  const b = player(12, 20);
  let peak = 0;
  for (let t = 0; t < 3; t += 1 / 120) {
    playerMove(world, b, { wx: 1, wz: 0, wishSpeed: PHYS.maxSpeed, jump: false }, 1 / 120);
    peak = Math.max(peak, b.y);
  }
  assert.ok(Math.abs(peak - 2.5) < 0.05, `never stood on the 0.5 step, peak ${peak}`);
  assert.ok(b.x < 25 - PLAYER.half + 0.01, `walked onto the 1.0 block, x ${b.x}`);
});

const strafe = (b, offset) => {
  for (let t = 0; t < 0.4; t += 1 / 120) {
    const a = Math.atan2(b.vz, b.vx) + offset;
    playerMove(flatWorld(), b, { wx: Math.cos(a), wz: Math.sin(a), wishSpeed: PHYS.maxSpeed, jump: false }, 1 / 120);
  }
  return Math.hypot(b.vx, b.vz);
};

const airborne = () => Object.assign(player(20, 20), { vx: PHYS.maxSpeed, onGround: false, y: 8 });

test('air strafing: wishing almost sideways while airborne gains speed past the ground limit', () => {
  const speed = strafe(airborne(), Math.PI / 2 - 0.05);
  assert.ok(speed > PHYS.maxSpeed * 1.1, `speed ${speed} did not grow`);
});

test('in the air, holding forward at full speed adds nothing', () => {
  const speed = strafe(airborne(), 0);
  assert.ok(Math.abs(speed - PHYS.maxSpeed) < 1e-6, `speed ${speed}`);
});

test('an explosion at the feet throws a body higher than a jump', () => {
  const world = flatWorld();
  const b = player();
  knockback(b, [b.x, b.y, b.z], 50);
  let top = 0;
  for (let t = 0; t < 2; t += 1 / 120) {
    b.vy -= PHYS.gravity / 120;
    walkMove(world, b, 1 / 120);
    top = Math.max(top, b.y - 2);
  }
  assert.ok(top > 2.5, `rose only ${top}`);
});

test('a door blocks until opened, and reopens if it would close on a body', () => {
  const world = flatWorld();
  world.grid.fill(15, 2, 1, 16, 11, 39, MAT.stone);
  world.grid.fill(15, 2, 19, 16, 6, 21, MAT.air);
  const door = { kind: 'door', base: [15, 2, 19, 16, 6, 21], move: [0, 3.9, 0], t: 0, speed: 4, state: 'closed', waitTime: 1, wait: 0 };
  world.movers.push(door);
  const b = player(13, 20);
  world.bodies.push(b);
  run(world, b, { wx: 1, wz: 0, wishSpeed: PHYS.maxSpeed, jump: false }, 1);
  assert.ok(b.x < 15, 'walked through a closed door');
  openDoor(world, door);
  for (let i = 0; i < 70; i++) updateMovers(world, 1 / 60);
  assert.equal(door.state, 'open');
  b.x = 15.5;
  door.t = 0.45;
  door.state = 'closing';
  updateMovers(world, 1 / 60);
  assert.equal(door.state, 'opening');
});

test('baked light: a point behind a wall is darker than one in view of the light', () => {
  const world = flatWorld();
  world.grid.fill(20, 2, 1, 21, 11, 39, MAT.stone);
  const vol = bakeLight(world.grid, [{ x: 15, y: 6, z: 20, radius: 14, intensity: 1 }]);
  const lit = lightAt(world.grid, vol, 18, 4, 20)[0];
  const shadow = lightAt(world.grid, vol, 23, 4, 20)[0];
  assert.ok(lit > shadow * 3, `lit ${lit}, shadow ${shadow}`);
});
