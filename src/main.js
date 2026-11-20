import * as THREE from 'three';
import { PHYS, PLAYER, UNIT, MAX_AMMO } from './config.js';
import { LEVELS } from './levels.js';
import { rayBox } from './voxels.js';
import { bakeLight, lightAt } from './lighting.js';
import { buildWorldMesh, makeLightUniforms, litMaterial, DYNAMIC_LIGHTS } from './mesh.js';
import { makeTextures } from './textures.js';
import { makeMonsterModel, makeItemModel, makeWeaponModel } from './models.js';
import { Particles } from './particles.js';
import { playerMove, knockback, boxOf, moverBox, updateMovers, openDoor, walkMove } from './physics.js';
import { createMonster, updateMonster, animateMonster, damageMonster } from './monsters.js';
import { WEAPONS, WEAPON_ORDER, ITEMS } from './weapons.js';
import { unlockAudio, play as playSound } from './audio.js';
import { Hud } from './hud.js';
import { T } from './i18n.js';

const $ = (id) => document.getElementById(id);
const overlay = $('overlay');
const hud = new Hud($('hud'));
THREE.ColorManagement.enabled = false;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $('view'), antialias: false, powerPreference: 'high-performance' });
} catch {
  overlay.className = 'show';
  overlay.innerHTML = `<div class="panel"><h1>Strata</h1><p>${T.noWebgl}</p></div>`;
  throw new Error('WebGL 2 unavailable');
}
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.autoClear = false;
renderer.setPixelRatio(1);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(75, 1, 0.03, 300);
camera.rotation.order = 'YXZ';
const weaponScene = new THREE.Scene();
const weaponCamera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);

const textures = makeTextures();
const particles = new Particles(scene);
const time = { value: 0 };

// The scene renders at about half the window height and scales up without
// smoothing: big pixels, like the software renderers it studies.
function resize() {
  const w = innerWidth;
  const h = innerHeight;
  const rh = Math.round(Math.max(240, Math.min(480, h / 2)));
  renderer.setSize(Math.round((rh * w) / h), rh, false);
  camera.aspect = weaponCamera.aspect = w / h;
  camera.updateProjectionMatrix();
  weaponCamera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const rand = Math.random;

const game = {
  state: 'menu',
  time: 0,
  rand,
  grid: null,
  world: null,
  light: null,
  volume: null,
  player: null,
  monsters: [],
  items: [],
  projectiles: [],
  dyn: [],
  noise: null,
  stats: null,
  levelObjects: [],
  play: (name, from, extra) => playSound(name, from, game.player && { x: game.player.x, z: game.player.z, angle: game.player.yaw }, extra),
  damage,
  hitscan: monsterHitscan,
  throwGrenade,
  canSee,
  onKill,
  gib,
};

// --- level ------------------------------------------------------------------

function worldUvBox(w, h, d) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  const faces = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++)
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * faces[f][0]) / 2, (uv.getY(i) * faces[f][1]) / 2);
    }
  return geo;
}

function clearLevel() {
  for (const o of game.levelObjects) {
    scene.remove(o);
    o.traverse?.((c) => c.geometry?.dispose());
  }
  game.levelObjects = [];
  game.worldMesh?.dispose();
  particles.clear();
  game.monsters = [];
  game.items = [];
  game.projectiles = [];
  game.dyn = [];
}

function add(obj) {
  scene.add(obj);
  game.levelObjects.push(obj);
  return obj;
}

function newPlayer() {
  return {
    isPlayer: true,
    solidBody: true,
    alive: true,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    half: PLAYER.half,
    height: PLAYER.height,
    eye: PLAYER.eye,
    onGround: true,
    jumpReleased: true,
    yaw: 0,
    pitch: 0,
    health: 100,
    armor: 0,
    armorType: 0,
    ammo: { shells: 25, nails: 0, rockets: 0 },
    owned: { scatter: true, needler: false, launcher: false },
    weapon: 'scatter',
    pending: null,
    lower: 1,
    keys: {},
    cooldown: 0,
    sinceFire: 9,
    barrel: 0,
    walkPhase: 0,
    punch: 0,
    dip: 0,
    deadT: 0,
    lavaT: 0,
    megaT: 0,
    painT: 0,
    keyMsgT: 0,
  };
}

function loadLevel(index) {
  clearLevel();
  hud.clearMessages();
  const t0 = performance.now();
  const { grid, entities } = LEVELS[index].build();
  game.grid = grid;
  const lights = entities.filter((e) => e.type === 'light');
  game.volume = bakeLight(grid, lights);
  game.bakeMs = Math.round(performance.now() - t0);
  game.light = makeLightUniforms(grid, game.volume);
  game.worldMesh = buildWorldMesh(grid, textures, game.light, time);
  add(game.worldMesh.group);

  const movers = [];
  for (const e of entities.filter((x) => x.type === 'door' || x.type === 'plat')) {
    const [x0, y0, z0, x1, y1, z1] = e.base;
    const m = {
      kind: e.type,
      base: e.base,
      move: e.move,
      key: e.key,
      t: 0,
      speed: e.type === 'door' ? 3.4 : 3.1,
      state: e.type === 'door' ? 'closed' : 'down',
      waitTime: e.wait ?? 3,
      wait: 0,
    };
    m.mesh = add(new THREE.Mesh(worldUvBox(x1 - x0, y1 - y0, z1 - z0), litMaterial(e.type === 'door' ? (e.key ? textures.rune : textures.metal) : textures.trim, game.light)));
    movers.push(m);
  }

  const p = newPlayer();
  const start = entities.find((e) => e.type === 'start');
  Object.assign(p, { x: start.x, y: start.y, z: start.z, yaw: start.angle });
  game.player = p;

  for (const e of entities.filter((x) => x.type === 'monster')) {
    const m = createMonster(e.kind, e.x, e.y, e.z);
    m.model = makeMonsterModel(e.kind);
    m.model.root.rotation.order = 'YXZ';
    add(m.model.root);
    game.monsters.push(m);
  }
  for (const e of entities.filter((x) => x.type === 'item')) addItem(e.item, e.x, e.y, e.z, { optional: e.optional });

  const exit = entities.find((e) => e.type === 'exit');
  game.exitBox = exit.box;
  const [ex0, ey0, ez0, ex1, ey1, ez1] = exit.box;
  const portal = add(
    new THREE.Mesh(
      new THREE.BoxGeometry(ex1 - ex0, ey1 - ey0, ez1 - ez0),
      new THREE.ShaderMaterial({
        uniforms: { time },
        transparent: true,
        depthWrite: false,
        vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader:
          'uniform float time; varying vec3 vP; void main(){ float s = sin(vP.y*9.0 - time*5.0 + sin(vP.x*7.0+vP.z*7.0+time*2.0)*2.0); vec3 c = mix(vec3(0.1,0.35,0.9), vec3(0.6,0.95,1.0), s*0.5+0.5); gl_FragColor = vec4(c, 0.75); }',
      }),
    ),
  );
  portal.position.set((ex0 + ex1) / 2, (ey0 + ey1) / 2, (ez0 + ez1) / 2);

  game.world = { grid, movers, bodies: [p, ...game.monsters] };
  game.world.onMoverSound = (m) => {
    const b = moverBox(m);
    game.play(m.kind === 'door' ? 'door' : 'lift', { x: (b[0] + b[3]) / 2, z: (b[2] + b[5]) / 2 });
  };
  game.stats = {
    kills: 0,
    totalKills: game.monsters.length,
    items: 0,
    totalItems: game.items.filter((i) => !i.optional).length,
    secrets: 0,
    totalSecrets: 1,
    time: 0,
  };
  game.time = 0;
}

function addItem(item, x, y, z, { optional = false, dropped = false, amount } = {}) {
  const model = makeItemModel(item);
  model.root.position.set(x, y, z);
  add(model.root);
  const it = { item, def: ITEMS[item], x, y, z, model, optional, dropped, amount, phase: rand() * 6 };
  game.items.push(it);
  return it;
}

// --- combat -----------------------------------------------------------------

function canSee(a, b) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(...d);
  if (len < 1e-4) return true;
  const dir = d.map((v) => v / len);
  if (game.grid.ray(a[0], a[1], a[2], dir[0], dir[1], dir[2], len).hit) return false;
  for (const m of game.world.movers) {
    const box = moverBox(m);
    const t = rayBox(a, dir, box.slice(0, 3), box.slice(3), len);
    if (t !== null && t < len) return false;
  }
  return true;
}

// The first thing a ray hits: a voxel, a mover or a body.
function trace(from, dir, maxT, ignore) {
  const wall = game.grid.ray(from[0], from[1], from[2], dir[0], dir[1], dir[2], maxT);
  let t = wall.t;
  let normal = wall.hit ? wall.normal : null;
  let body = null;
  for (const m of game.world.movers) {
    const box = moverBox(m);
    const tm = rayBox(from, dir, box.slice(0, 3), box.slice(3), t);
    if (tm !== null && tm < t) {
      t = tm;
      normal = [0, 1, 0];
    }
  }
  for (const b of game.world.bodies) {
    if (b === ignore || !b.alive) continue;
    const box = boxOf(b);
    const tb = rayBox(from, dir, box.slice(0, 3), box.slice(3), t);
    if (tb !== null && tb < t) {
      t = tb;
      body = b;
    }
  }
  return { t, body, normal, point: from.map((v, i) => v + dir[i] * t), hit: !!(body || normal) };
}

function spreadDir(dir, spread) {
  const up = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const r = [dir[1] * up[2] - dir[2] * up[1], dir[2] * up[0] - dir[0] * up[2], dir[0] * up[1] - dir[1] * up[0]];
  const rl = Math.hypot(...r);
  const rr = r.map((v) => v / rl);
  const u = [rr[1] * dir[2] - rr[2] * dir[1], rr[2] * dir[0] - rr[0] * dir[2], rr[0] * dir[1] - rr[1] * dir[0]];
  const a = (rand() + rand() - 1) * spread;
  const b = (rand() + rand() - 1) * spread;
  const d = dir.map((v, i) => v + rr[i] * a + u[i] * b);
  const l = Math.hypot(...d);
  return d.map((v) => v / l);
}

function shotgun(shooter, from, dir, pellets, dmg, spread) {
  const hits = new Map();
  for (let i = 0; i < pellets; i++) {
    const tr = trace(from, spreadDir(dir, spread), 80, shooter);
    if (tr.body) {
      hits.set(tr.body, (hits.get(tr.body) || 0) + dmg);
      particles.blood(tr.point, 4);
    } else if (tr.hit) {
      particles.puff(tr.point.map((v, k) => v - dir[k] * 0.05));
    }
  }
  for (const [b, total] of hits) damage(b, total, shooter, from);
}

function monsterHitscan(m, from, to, pellets, dmg, spread) {
  const d = to.map((v, i) => v - from[i]);
  const l = Math.hypot(...d);
  shotgun(m, from, d.map((v) => v / l), pellets, dmg, spread);
}

function damage(t, amount, source, from) {
  if (amount <= 0) return;
  if (t.isPlayer) {
    if (!t.alive) return;
    const save = Math.min(t.armor, Math.ceil(t.armorType * amount));
    t.armor -= save;
    if (t.armor <= 0) t.armorType = 0;
    t.health -= amount - save;
    hud.hurt(amount);
    t.punch -= Math.min(0.08, amount / 400);
    if (from) knockback(t, from, amount);
    if (t.health <= 0) {
      t.health = 0;
      t.alive = false;
      t.deadT = 0;
      game.play('playerDeath');
    } else if (t.painT <= 0) {
      t.painT = 0.3;
      game.play('playerPain');
    }
    return;
  }
  if (from && t.alive) knockback(t, from, amount);
  damageMonster(t, amount, source, game);
}

// Splash: everyone in line of sight takes the damage minus half the distance
// in map units; the attacker takes half of that, and all of it pushes.
function radiusDamage(origin, dmg, attacker) {
  for (const b of game.world.bodies) {
    if (b.gibbed) continue;
    const c = [b.x, b.y + b.height / 2, b.z];
    const dist = Math.max(0, Math.hypot(c[0] - origin[0], c[1] - origin[1], c[2] - origin[2]) - b.half);
    let points = dmg - 0.5 * dist * UNIT;
    if (b === attacker) points *= 0.5;
    if (points <= 0 || !canSee(origin, c)) continue;
    damage(b, points, attacker, origin);
  }
}

function explode(p, x, y, z) {
  p.dead = true;
  if (p.mesh) {
    scene.remove(p.mesh);
    p.mesh.geometry.dispose();
  }
  const o = [x, y, z];
  radiusDamage(o, p.damage, p.owner);
  particles.explosion(o);
  game.dyn.push({ x, y, z, r: 7, color: [1.6, 0.9, 0.35], ttl: 0.35, life: 0.35 });
  game.play('explode', { x, z });
}

const PROJECTILE_LOOK = {
  rocket: () => new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.42), new THREE.MeshBasicMaterial({ color: 0x6b6b5a })),
  nail: () => new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.26), new THREE.MeshBasicMaterial({ color: 0xc8c8c0 })),
  grenade: () => new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshBasicMaterial({ color: 0x3f4f2a })),
};

function spawnProjectile(kind, owner, from, dir, speed, dmg, extra = {}) {
  const mesh = PROJECTILE_LOOK[kind]();
  mesh.position.set(...from);
  mesh.lookAt(from[0] + dir[0], from[1] + dir[1], from[2] + dir[2]);
  scene.add(mesh);
  game.projectiles.push({ kind, owner, x: from[0], y: from[1], z: from[2], vx: dir[0] * speed, vy: dir[1] * speed, vz: dir[2] * speed, damage: dmg, life: 6, mesh, age: 0, ...extra });
}

function throwGrenade(m, from, to) {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const horiz = Math.hypot(dx, dz);
  const speed = 11;
  const tFlight = Math.max(0.35, horiz / speed);
  const vy = (to[1] - from[1] + 0.5 * PHYS.gravity * tFlight * tFlight) / tFlight;
  const dir = [dx / horiz, 0, dz / horiz];
  spawnProjectile('grenade', m, from, dir, speed, 40, { fuse: 2.5 });
  game.projectiles[game.projectiles.length - 1].vy = vy;
}

function updateProjectiles(dt) {
  for (const p of game.projectiles) {
    if (p.dead) continue;
    p.age += dt;
    if (p.kind === 'grenade') {
      p.vy -= PHYS.gravity * dt;
      p.fuse -= dt;
      if (p.fuse <= 0) {
        explode(p, p.x, p.y, p.z);
        continue;
      }
    }
    const v = [p.vx, p.vy, p.vz];
    const speed = Math.hypot(...v);
    const step = speed * dt;
    const dir = v.map((c) => c / (speed || 1));
    const tr = trace([p.x, p.y, p.z], dir, step, p.age < 0.15 ? p.owner : null);
    if (tr.hit) {
      if (p.kind === 'grenade' && !tr.body) {
        // Bounce: reflect on the face normal and lose half the speed.
        const n = tr.normal;
        const dot = p.vx * n[0] + p.vy * n[1] + p.vz * n[2];
        p.vx = (p.vx - 2 * dot * n[0]) * 0.5;
        p.vy = (p.vy - 2 * dot * n[1]) * 0.5;
        p.vz = (p.vz - 2 * dot * n[2]) * 0.5;
        p.x = tr.point[0] + n[0] * 0.05;
        p.y = tr.point[1] + n[1] * 0.05;
        p.z = tr.point[2] + n[2] * 0.05;
        if (Math.abs(dot) > 1.5) game.play('bounce', p);
      } else if (p.kind === 'nail') {
        p.dead = true;
        scene.remove(p.mesh);
        if (tr.body) {
          damage(tr.body, p.damage, p.owner, [p.x, p.y, p.z]);
          particles.blood(tr.point, 4);
        } else particles.puff(tr.point.map((c, k) => c - dir[k] * 0.05));
      } else {
        const back = tr.point.map((c, k) => c - dir[k] * 0.1);
        if (tr.body) damage(tr.body, p.damage, p.owner, back);
        explode(p, ...back);
      }
      continue;
    }
    p.x += v[0] * dt;
    p.y += v[1] * dt;
    p.z += v[2] * dt;
    p.mesh.position.set(p.x, p.y, p.z);
    if (p.kind === 'rocket') {
      p.mesh.lookAt(p.x + dir[0], p.y + dir[1], p.z + dir[2]);
      particles.trail([p.x - dir[0] * 0.3, p.y - dir[1] * 0.3, p.z - dir[2] * 0.3]);
    } else if (p.kind === 'grenade') {
      p.mesh.rotation.x += dt * 8;
      particles.trail([p.x, p.y, p.z]);
    }
    p.life -= dt;
    if (p.life <= 0) {
      p.dead = true;
      scene.remove(p.mesh);
    }
  }
  game.projectiles = game.projectiles.filter((p) => !p.dead);
}

function onKill(m) {
  game.stats.kills++;
  if (m.def.drop) addItem(m.def.drop, m.x, m.y, m.z, { dropped: true, amount: 5 });
}

function gib(m) {
  m.gibbed = true;
  m.model.root.visible = false;
  const c = [m.x, m.y + m.height / 2, m.z];
  particles.burst(c, 80, [0.55, 0.04, 0.03], 6, 1.2, 0.08, 1, 2);
  particles.burst(c, 14, [0.4, 0.18, 0.12], 5, 1.6, 0.16, 1, 2);
  game.play('explode', m);
}

// --- player -----------------------------------------------------------------

const keys = new Set();
let fireHeld = false;

function viewDir(p) {
  const cp = Math.cos(p.pitch);
  return [Math.cos(p.yaw) * cp, Math.sin(p.pitch), Math.sin(p.yaw) * cp];
}

function eyePos(p) {
  return [p.x, p.y + PLAYER.eye, p.z];
}

function selectWeapon(name) {
  const p = game.player;
  if (!p.owned[name] || (p.weapon === name && !p.pending)) return;
  p.pending = name;
}

function cycleWeapon(dir) {
  const p = game.player;
  const owned = WEAPON_ORDER.filter((w) => p.owned[w]);
  const i = owned.indexOf(p.pending || p.weapon);
  selectWeapon(owned[(i + dir + owned.length) % owned.length]);
}

function fire() {
  const p = game.player;
  const def = WEAPONS[p.weapon];
  if (p.cooldown > 0 || p.pending || p.lower > 0) return;
  if (p.ammo[def.ammo] < 1) {
    const next = ['launcher', 'needler', 'scatter'].find((w) => p.owned[w] && p.ammo[WEAPONS[w].ammo] > 0 && w !== 'launcher');
    if (next && next !== p.weapon) selectWeapon(next);
    else {
      game.play('click');
      p.cooldown = 0.4;
    }
    return;
  }
  p.ammo[def.ammo]--;
  p.cooldown = def.cooldown;
  p.sinceFire = 0;
  p.barrel++;
  p.punch -= def.kick * 0.4;
  game.play(def.sound);
  game.noise = { x: p.x, z: p.z, t: game.time };
  const eye = eyePos(p);
  const dir = viewDir(p);
  game.dyn.push({ x: eye[0] + dir[0], y: eye[1], z: eye[2] + dir[2], r: 5, color: [1, 0.8, 0.5], ttl: 0.06, life: 0.06 });
  if (def.pellets) {
    shotgun(p, eye, dir, def.pellets, def.damage, def.spread);
  } else if (def.projectile === 'nail') {
    const side = p.barrel % 2 ? 0.08 : -0.08;
    const from = [eye[0] - Math.sin(p.yaw) * side, eye[1] - 0.12, eye[2] + Math.cos(p.yaw) * side];
    spawnProjectile('nail', p, from, dir, def.speed, def.damage);
  } else if (def.projectile === 'rocket') {
    const from = [eye[0] + dir[0] * 0.4, eye[1] - 0.15 + dir[1] * 0.4, eye[2] + dir[2] * 0.4];
    spawnProjectile('rocket', p, from, dir, def.speed, def.damage + rand() * 20);
  }
}

function pickUp(it) {
  const p = game.player;
  const d = it.def;
  const amount = it.amount ?? d.amount;
  if (d.kind === 'health') {
    if (p.health >= d.max) return false;
    p.health = Math.min(d.max, p.health + amount);
  } else if (d.kind === 'armor') {
    if (p.armor * p.armorType >= amount * d.type) return false;
    p.armor = amount;
    p.armorType = d.type;
  } else if (d.kind === 'ammo') {
    if (p.ammo[d.ammo] >= MAX_AMMO[d.ammo]) return false;
    p.ammo[d.ammo] = Math.min(MAX_AMMO[d.ammo], p.ammo[d.ammo] + amount);
  } else if (d.kind === 'weapon') {
    const isNew = !p.owned[d.weapon];
    p.owned[d.weapon] = true;
    p.ammo[d.ammo] = Math.min(MAX_AMMO[d.ammo], p.ammo[d.ammo] + amount);
    if (isNew) selectWeapon(d.weapon);
  } else if (d.kind === 'key') {
    p.keys[d.key] = true;
  }
  game.play(d.kind === 'weapon' ? 'weapon' : 'pickup');
  hud.message(T.pickups[it.item]);
  hud.bonus();
  if (d.secret && !game.stats.secrets) {
    game.stats.secrets = 1;
    hud.message(T.secret);
  }
  return true;
}

function updatePlayer(dt) {
  const p = game.player;
  p.cooldown = Math.max(0, p.cooldown - dt);
  p.sinceFire += dt;
  p.painT -= dt;
  p.keyMsgT -= dt;
  p.punch *= Math.exp(-dt * 10);
  p.dip *= Math.exp(-dt * 9);
  if (p.pending) {
    p.lower = Math.min(1, p.lower + dt * 5);
    if (p.lower >= 1) {
      p.weapon = p.pending;
      p.pending = null;
    }
  } else if (p.lower > 0) p.lower = Math.max(0, p.lower - dt * 5);

  if (!p.alive) {
    p.deadT += dt;
    p.vx *= 0.95;
    p.vz *= 0.95;
    p.vy -= PHYS.gravity * dt;
    walkMove(game.world, p, dt);
    return;
  }

  const turn = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
  p.yaw += turn * 2.6 * dt;
  const fwd = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  const str = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  const c = Math.cos(p.yaw);
  const s = Math.sin(p.yaw);
  let wx = c * fwd - s * str;
  let wz = s * fwd + c * str;
  const len = Math.hypot(wx, wz);
  if (len > 0) {
    wx /= len;
    wz /= len;
  }
  const walking = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const wishSpeed = len > 0 ? (walking ? PHYS.walkSpeed : PHYS.maxSpeed) : 0;
  const wasGround = p.onGround;
  p.landSpeed = 0;
  for (let left = dt; left > 1e-6; left -= 1 / 120) {
    playerMove(game.world, p, { wx, wz, wishSpeed, jump: keys.has('Space') }, Math.min(left, 1 / 120));
  }
  if (wasGround && !p.onGround && p.vy > PHYS.jumpSpeed * 0.9) game.play('jump');
  if (p.landSpeed < -8) {
    p.dip = Math.min(0.25, -p.landSpeed / 60);
    game.play('land');
    if (p.landSpeed < -20) damage(p, Math.round((-p.landSpeed - 20) * 1.5), null, null);
  }
  const speed = Math.hypot(p.vx, p.vz);
  if (p.onGround) p.walkPhase += dt * speed * 1.4;

  // Lava burns ten points every fifth of a second.
  const box = boxOf(p);
  if (game.grid.boxLiquid(box[0], box[1], box[2], box[3], box[1] + 0.5, box[5]) === 'lava') {
    p.lavaT -= dt;
    if (p.lavaT <= 0) {
      p.lavaT = 0.2;
      damage(p, 10, null, null);
      particles.burst([p.x, p.y + 0.2, p.z], 8, [1, 0.5, 0.1], 2, 0.4, 0.06, 1);
    }
  }
  if (p.health > 100) {
    p.megaT -= dt;
    if (p.megaT <= 0) {
      p.megaT = 1;
      p.health -= 1;
    }
  }

  for (const it of game.items) {
    if (it.taken) continue;
    // Touch, as box against box: the item counts as a box half a unit wide.
    if (Math.abs(it.x - p.x) > p.half + 0.55 || Math.abs(it.z - p.z) > p.half + 0.55 || it.y < p.y - 0.6 || it.y > p.y + PLAYER.height) continue;
    if (pickUp(it)) {
      it.taken = true;
      scene.remove(it.model.root);
      if (!it.dropped && !it.optional) game.stats.items++;
    }
  }
  game.items = game.items.filter((i) => !i.taken);

  // Doors open when someone walks up to them; key doors only for the key.
  for (const m of game.world.movers) {
    if (m.kind !== 'door' || m.state === 'opening' || m.state === 'open') continue;
    const b = moverBox(m);
    const near = (q) => q.alive && q.x > b[0] - 1.6 && q.x < b[3] + 1.6 && q.z > b[2] - 1.6 && q.z < b[5] + 1.6 && q.y < b[4] && q.y + q.height > b[1];
    if (near(p)) {
      if (m.key && !p.keys[m.key]) {
        if (p.keyMsgT <= 0) {
          hud.message(T.needKey);
          game.play('denied');
          p.keyMsgT = 2;
        }
      } else openDoor(game.world, m);
    } else if (!m.key && game.monsters.some(near)) openDoor(game.world, m);
  }

  const e = game.exitBox;
  if (p.x > e[0] && p.x < e[3] && p.z > e[2] && p.z < e[5] && p.y >= e[1] - 0.6 && p.y < e[4]) finish();

  if (fireHeld) fire();
}

// --- frame ------------------------------------------------------------------

function setLight(material, x, y, z, boost = 0) {
  const [r, g, b] = lightAt(game.grid, game.volume, x, y, z);
  material.color.setRGB(r + boost, g + boost, b + boost);
}

const weapons = Object.fromEntries(
  WEAPON_ORDER.map((w) => {
    const m = makeWeaponModel(w);
    m.root.visible = false;
    weaponScene.add(m.root);
    return [w, m];
  }),
);

function updateDynamicLights(dt) {
  const list = [];
  for (const d of game.dyn) {
    d.ttl -= dt;
    if (d.ttl > 0) list.push({ ...d, k: d.ttl / d.life });
  }
  game.dyn = game.dyn.filter((d) => d.ttl > 0);
  for (const p of game.projectiles) if (p.kind === 'rocket') list.push({ x: p.x, y: p.y, z: p.z, r: 4, color: [1, 0.6, 0.25], k: 1 });
  const u = game.light;
  for (let i = 0; i < DYNAMIC_LIGHTS; i++) {
    const d = list[i];
    if (d) {
      u.dynPos.value[i].set(d.x, d.y, d.z, d.r);
      u.dynColor.value[i].set(d.color[0] * d.k, d.color[1] * d.k, d.color[2] * d.k);
    } else u.dynPos.value[i].set(0, 0, 0, 0);
  }
  return list;
}

function dynamicBoost(list, x, y, z) {
  let b = 0;
  for (const d of list) b += Math.max(0, 1 - Math.hypot(d.x - x, d.y - y, d.z - z) / d.r) * d.k * 0.8;
  return b;
}

function simulate(dt) {
  game.time += dt;
  time.value += dt;
  updatePlayer(dt);
  updateMovers(game.world, dt);
  for (const m of game.monsters) {
    updateMonster(m, game, dt);
    if (m.alive && game.grid.boxLiquid(m.x - m.half, m.y, m.z - m.half, m.x + m.half, m.y + 0.5, m.z + m.half) === 'lava') {
      m.lavaT = (m.lavaT ?? 0) - dt;
      if (m.lavaT <= 0) {
        m.lavaT = 0.2;
        damage(m, 10, null, null);
      }
    }
  }
  updateProjectiles(dt);
  particles.update(dt, PHYS.gravity);
  const e = game.exitBox;
  if (rand() < dt * 30) particles.spark([e[0] + rand() * (e[3] - e[0]), e[1], e[2] + rand() * (e[5] - e[2])], [0.5, 0.85, 1]);
  if (game.state === 'playing') {
    game.stats.time += dt;
    if (!game.player.alive && game.player.deadT > 1.4) showDead();
  }
}

function draw(dt) {
  const p = game.player;
  const lights = updateDynamicLights(dt);
  for (const m of game.world.movers) {
    const b = moverBox(m);
    m.mesh.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2);
  }
  for (const m of game.monsters) {
    animateMonster(m);
    setLight(m.model.b.lit, m.x, m.y + 1, m.z, dynamicBoost(lights, m.x, m.y + 1, m.z));
  }
  for (const it of game.items) {
    it.model.spin.rotation.y = time.value * 1.6 + it.phase;
    it.model.spin.position.y = (it.item === 'key' ? 0.55 : 0.3) + Math.sin(time.value * 2 + it.phase) * 0.06;
    setLight(it.model.b.lit, it.x, it.y + 0.5, it.z, dynamicBoost(lights, it.x, it.y + 0.5, it.z));
  }

  const speed = Math.hypot(p.vx, p.vz);
  const bob = p.onGround ? Math.sin(p.walkPhase) * 0.035 * Math.min(1, speed / PHYS.maxSpeed) : 0;
  const side = -Math.sin(p.yaw) * p.vx + Math.cos(p.yaw) * p.vz;
  const dead = !p.alive;
  camera.position.set(p.x, p.y + (dead ? Math.max(0.25, PLAYER.eye - p.deadT * 2) : PLAYER.eye) + bob - p.dip, p.z);
  camera.rotation.y = -p.yaw - Math.PI / 2;
  camera.rotation.x = p.pitch + p.punch;
  camera.rotation.z = dead ? Math.min(0.6, p.deadT) : -Math.max(-1, Math.min(1, side / PHYS.maxSpeed)) * 0.035;

  for (const [name, w] of Object.entries(weapons)) w.root.visible = name === p.weapon && p.alive && game.state !== 'menu';
  const w = weapons[p.weapon];
  const recoil = p.sinceFire < 0.18 ? (1 - p.sinceFire / 0.18) * WEAPONS[p.weapon].kick : 0;
  const sway = Math.min(1, speed / PHYS.maxSpeed);
  w.root.scale.setScalar(0.8);
  w.root.position.set(0.22 + Math.cos(p.walkPhase * 0.5) * 0.012 * sway, -0.27 + Math.abs(Math.sin(p.walkPhase * 0.5)) * 0.012 * sway - p.lower * 0.4 - p.dip * 0.3, -0.5 + recoil);
  if (w.parts.drum && p.sinceFire < 0.2) w.parts.drum.rotation.z += dt * 25;
  const eye = eyePos(p);
  setLight(w.b.lit, eye[0], eye[1], eye[2], dynamicBoost(lights, eye[0], eye[1], eye[2]));

  renderer.clear();
  renderer.render(scene, camera);
  renderer.clearDepth();
  renderer.render(weaponScene, weaponCamera);
  hud.update(p, dt);
}

let last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!game.world) return;
  if (game.state === 'playing' || game.state === 'dead') simulate(dt);
  draw(dt);
}

// --- screens ----------------------------------------------------------------

const REPO = 'https://github.com/ciro-maciel/strata';
const controlsList = () => `<dl class="controls">${T.controls.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;

function showMenu() {
  game.state = 'menu';
  overlay.className = 'show';
  overlay.innerHTML = `
    <div class="panel">
      <h1>Strata</h1>
      <p class="tagline">${T.tagline}</p>
      <button class="go" data-action="start">${T.start}</button>
      ${controlsList()}
      <p class="tip">${T.tip}</p>
      <p class="links">
        <a href="${REPO}/blob/main/docs/ENGINE.md" target="_blank" rel="noopener">${T.engineNotes}</a>
        <span>·</span>
        <a href="https://ciromaciel.click/?ref=oss-strata" target="_blank" rel="noopener">${T.by}</a>
      </p>
    </div>`;
}

function showPaused() {
  game.state = 'paused';
  overlay.className = 'show';
  overlay.innerHTML = `<div class="panel"><h2>${T.resume}</h2>${controlsList()}</div>`;
}

function showDead() {
  game.state = 'dead';
  overlay.className = 'show dim';
  overlay.innerHTML = `<div class="panel"><h2>${T.died}</h2><button class="go" data-action="restart">${T.restart}</button></div>`;
  document.exitPointerLock?.();
}

const pct = (a, b) => (b ? `${a} / ${b}` : '0 / 0');
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function finish() {
  if (game.state !== 'playing') return;
  game.play('exit');
  game.state = 'intermission';
  const s = game.stats;
  overlay.className = 'show';
  overlay.innerHTML = `
    <div class="panel">
      <h2>${T.level} ${T.completed}</h2>
      <dl class="stats">
        <dt>${T.kills}</dt><dd>${pct(s.kills, s.totalKills)}</dd>
        <dt>${T.items}</dt><dd>${pct(s.items, s.totalItems)}</dd>
        <dt>${T.secrets}</dt><dd>${pct(s.secrets, s.totalSecrets)}</dd>
        <dt>${T.time}</dt><dd>${clock(s.time)}</dd>
      </dl>
      <p>${T.finishedSub}</p>
      <button class="go" data-action="again">${T.again}</button>
    </div>`;
  document.exitPointerLock?.();
}

function lockPointer() {
  const req = document.body.requestPointerLock?.();
  if (req?.catch) req.catch(() => {});
}

function startPlaying() {
  overlay.className = '';
  overlay.innerHTML = '';
  game.state = 'playing';
  last = performance.now();
  lockPointer();
}

overlay.addEventListener('click', (e) => {
  unlockAudio();
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (game.state === 'menu' || game.state === 'paused') {
    if (game.state === 'menu') hud.message(T.level);
    startPlaying();
  } else if ((game.state === 'dead' && action === 'restart') || (game.state === 'intermission' && action === 'again')) {
    loadLevel(0);
    hud.message(T.level);
    startPlaying();
  }
});

document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && game.state === 'playing') showPaused();
});

document.addEventListener('mousemove', (e) => {
  if (game.state !== 'playing' || !document.pointerLockElement || !game.player.alive) return;
  const p = game.player;
  p.yaw += e.movementX * 0.0022;
  p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch - e.movementY * 0.0022));
});
document.addEventListener('mousedown', (e) => {
  if (e.button === 0 && game.state === 'playing' && document.pointerLockElement) fireHeld = true;
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) fireHeld = false;
});
document.addEventListener(
  'wheel',
  (e) => {
    if (game.state === 'playing') cycleWeapon(e.deltaY > 0 ? 1 : -1);
  },
  { passive: true },
);
addEventListener('keydown', (e) => {
  if (game.state !== 'playing') return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.repeat) return;
  if (e.code === 'Digit1') selectWeapon('scatter');
  if (e.code === 'Digit2') selectWeapon('needler');
  if (e.code === 'Digit3') selectWeapon('launcher');
  if (e.code === 'ControlLeft') fireHeld = true;
});
addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'ControlLeft') fireHeld = false;
});
addEventListener('blur', () => {
  keys.clear();
  fireHeld = false;
});

loadLevel(0);
showMenu();
requestAnimationFrame(frame);

// For the console and for scripted checks: strata.advance(2) runs two seconds
// of game time and draws the result, even in a background tab where the
// browser pauses animation frames.
game.advance = (seconds) => {
  if (game.state === 'menu' || game.state === 'paused') {
    overlay.className = '';
    overlay.innerHTML = '';
    game.state = 'playing';
  }
  for (let t = 0; t < seconds; t += 1 / 60) simulate(1 / 60);
  draw(1 / 60);
  const p = game.player;
  return { state: game.state, health: Math.round(p.health), x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) };
};
game.keys = keys;
game.fire = () => {
  game.player.cooldown = 0;
  fire();
};
game.select = selectWeapon;
globalThis.strata = game;
