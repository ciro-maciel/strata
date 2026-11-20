import { THINK, PHYS } from './config.js';
import { walkMove, friction } from './physics.js';
import { MATERIALS, isSolid } from './voxels.js';

// Monsters decide ten times a second and move every frame. A decision is
// one of: keep chasing (head for the target, sidestep when stuck, never walk
// off a ledge or into lava), start an attack, or for the stalker, leap.

export const MONSTER_TYPES = {
  warden: {
    health: 30,
    speed: 2.6,
    half: 0.45,
    height: 1.75,
    painChance: 0.5,
    painTime: 0.3,
    ranged: 'shot',
    attackTime: 0.8,
    fireAt: 0.4,
    drop: 'shells',
    knockScale: 1,
    eye: 1.5,
  },
  stalker: {
    health: 75,
    speed: 5.2,
    half: 0.45,
    height: 1.3,
    painChance: 0.4,
    painTime: 0.25,
    melee: [10, 20],
    meleeRange: 1.5,
    attackTime: 0.5,
    fireAt: 0.25,
    leap: true,
    knockScale: 1,
    eye: 1.1,
  },
  hurler: {
    health: 200,
    speed: 2.2,
    half: 0.6,
    height: 2.2,
    painChance: 0.25,
    painTime: 0.35,
    ranged: 'grenade',
    melee: [15, 25],
    meleeRange: 1.8,
    attackTime: 1.0,
    fireAt: 0.55,
    knockScale: 0.5,
    eye: 1.9,
  },
};

export function createMonster(kind, x, y, z) {
  const def = MONSTER_TYPES[kind];
  return {
    kind,
    def,
    isMonster: true,
    solidBody: true,
    alive: true,
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    half: def.half,
    height: def.height,
    knockScale: def.knockScale,
    health: def.health,
    onGround: true,
    state: 'idle',
    timer: 0,
    think: Math.random() * THINK,
    angle: Math.random() * Math.PI * 2,
    moveAngle: 0,
    avoid: 0,
    cool: 0.5 + Math.random(),
    target: null,
    lastPos: [x, z],
    walkT: Math.random() * 10,
    hitDuringLeap: false,
  };
}

const eyeOf = (b) => [b.x, b.y + (b.def?.eye ?? b.eye ?? b.height * 0.8), b.z];

// True if there is floor within a step-and-a-bit below the point, and it is
// not a liquid.
function safeGround(grid, x, y, z) {
  for (let d = 0; d <= 1.6; d += 0.25) {
    const v = grid.at(x, y - d - 0.05, z);
    if (MATERIALS[v].liquid) return false;
    if (isSolid(v)) return true;
  }
  return false;
}

function wake(m, g) {
  if (m.state !== 'idle') return;
  m.state = 'chase';
  m.target = g.player;
  g.play('sight', m, m.kind);
}

function startAttack(m, kind) {
  m.state = 'attack';
  m.attack = kind;
  m.timer = 0;
  m.fired = false;
}

function fire(m, g) {
  const t = m.target;
  if (!t?.alive) return;
  const from = eyeOf(m);
  if (m.attack === 'melee') {
    const d = Math.hypot(t.x - m.x, t.z - m.z);
    if (d < m.def.meleeRange + 0.4 && Math.abs(t.y - m.y) < 1.5) {
      const [a, b] = m.def.melee;
      g.play('melee', m);
      g.damage(t, a + g.rand() * (b - a), m, from);
    }
  } else if (m.def.ranged === 'shot') {
    g.play('enemyShot', m);
    const to = eyeOf(t);
    to[1] -= 0.3;
    g.hitscan(m, from, to, 4, 4, 0.07);
  } else if (m.def.ranged === 'grenade') {
    g.play('fireball', m);
    g.throwGrenade(m, from, [t.x, t.y + 0.4, t.z]);
  }
}

export function damageMonster(m, amount, source, g) {
  if (!m.alive) {
    if (!m.gibbed && m.health - amount < -40) {
      m.health -= amount;
      g.gib(m);
    }
    return;
  }
  m.health -= amount;
  if (m.health <= 0) {
    m.alive = false;
    m.state = 'dead';
    m.timer = 0;
    g.play('death', m, m.kind);
    g.onKill(m);
    if (m.health < -40) g.gib(m);
    return;
  }
  // Infighting: hurt by a monster of another kind, it turns on that one.
  if (source && source !== m && source.alive && (source.isPlayer || source.kind !== m.kind)) m.target = source;
  if (m.state === 'idle') wake(m, g);
  if (m.state !== 'leap' && g.rand() < m.def.painChance) {
    m.state = 'pain';
    m.timer = 0;
    g.play('pain', m, m.kind);
  }
}

function decide(m, g) {
  const p = g.player;
  if (m.state === 'idle') {
    if (!p.alive) return;
    const d = Math.hypot(p.x - m.x, p.z - m.z);
    const heard = g.noise && g.noise.t > g.time - 0.5 && Math.hypot(g.noise.x - m.x, g.noise.z - m.z) < 22;
    if ((d < 45 && g.canSee(eyeOf(m), eyeOf(p))) || heard) wake(m, g);
    return;
  }
  if (m.state !== 'chase') return;
  if (!m.target?.alive) {
    m.target = p;
    if (!p.alive) {
      m.state = 'idle';
      return;
    }
  }
  const t = m.target;
  const dx = t.x - m.x;
  const dz = t.z - m.z;
  const d = Math.hypot(dx, dz);
  const sees = g.canSee(eyeOf(m), eyeOf(t));
  m.cool -= THINK;

  if (m.def.melee && d < m.def.meleeRange && Math.abs(t.y - m.y) < 1.5) {
    startAttack(m, 'melee');
    return;
  }
  if (m.def.leap && m.onGround && sees && d > 3 && d < 9 && m.cool <= 0 && g.rand() < 0.35) {
    m.state = 'leap';
    m.timer = 0;
    m.hitDuringLeap = false;
    m.angle = Math.atan2(dz, dx);
    m.vx = (dx / d) * 10;
    m.vz = (dz / d) * 10;
    m.vy = 6;
    m.onGround = false;
    m.cool = 1.5;
    g.play('sight', m, m.kind);
    return;
  }
  if (m.def.ranged && sees && m.cool <= 0 && d < 40) {
    const chance = Math.max(0.15, Math.min(0.6, 1 - d / 30));
    if (g.rand() < chance) {
      startAttack(m, 'ranged');
      return;
    }
  }

  // Movement: straight at the target unless the last moves got nowhere.
  const moved = Math.hypot(m.x - m.lastPos[0], m.z - m.lastPos[1]);
  m.lastPos = [m.x, m.z];
  m.avoid -= THINK;
  if (moved < m.def.speed * THINK * 0.3 && m.avoid <= 0) {
    m.avoid = 0.5 + g.rand() * 0.6;
    m.avoidAngle = (g.rand() < 0.5 ? 1 : -1) * (Math.PI / 2 + (g.rand() - 0.5) * 0.8);
  }
  let want = Math.atan2(dz, dx) + (m.avoid > 0 ? m.avoidAngle : 0);
  for (const turn of [0, 0.6, -0.6, 1.3, -1.3, 2.2, -2.2]) {
    const a = want + turn;
    const ax = m.x + Math.cos(a) * (m.half + 0.5);
    const az = m.z + Math.sin(a) * (m.half + 0.5);
    if (safeGround(g.grid, ax, m.y + 0.6, az)) {
      want = a;
      break;
    }
  }
  m.moveAngle = want;
}

export function updateMonster(m, g, dt) {
  m.think -= dt;
  if (m.think <= 0) {
    m.think += THINK;
    decide(m, g);
  }
  m.timer += dt;

  if (m.state === 'chase' && m.onGround) {
    m.vx = Math.cos(m.moveAngle) * m.def.speed;
    m.vz = Math.sin(m.moveAngle) * m.def.speed;
    const diff = Math.atan2(Math.sin(m.moveAngle - m.angle), Math.cos(m.moveAngle - m.angle));
    m.angle += diff * Math.min(1, dt * 10);
    m.walkT += dt;
  } else if (m.state === 'attack') {
    if (m.onGround) friction(m, dt * 3);
    const t = m.target;
    if (t) m.angle = Math.atan2(t.z - m.z, t.x - m.x);
    if (!m.fired && m.timer >= m.def.fireAt) {
      m.fired = true;
      fire(m, g);
    }
    if (m.timer >= m.def.attackTime) {
      m.state = 'chase';
      m.cool = 0.8 + g.rand() * 1.4;
    }
  } else if (m.state === 'pain') {
    if (m.onGround) friction(m, dt * 2);
    if (m.timer >= m.def.painTime) m.state = 'chase';
  } else if (m.state === 'leap') {
    const t = m.target;
    if (t?.alive && !m.hitDuringLeap && Math.hypot(t.x - m.x, t.z - m.z) < m.half + t.half + 0.35 && Math.abs(t.y - m.y) < 1.4) {
      m.hitDuringLeap = true;
      g.play('melee', m);
      g.damage(t, 10 + g.rand() * 10, m, eyeOf(m));
    }
    if (m.onGround && m.timer > 0.15) m.state = 'chase';
  } else if (m.state === 'dead' || m.state === 'idle') {
    if (m.onGround) friction(m, dt * 2);
  }

  m.vy -= PHYS.gravity * dt;
  walkMove(g.world, m, dt);
}

export function animateMonster(m) {
  const model = m.model;
  if (!model) return;
  let state = 'stand';
  let phase = 0;
  if (m.state === 'chase') state = 'walk';
  else if (m.state === 'attack') {
    state = 'attack';
    phase = m.timer / m.def.attackTime;
  } else if (m.state === 'leap') state = 'leap';
  else if (m.state === 'pain') state = 'pain';
  else if (m.state === 'dead') {
    state = 'dead';
    phase = m.timer / 0.6;
  }
  model.animate(state, m.walkT, phase);
  model.root.position.set(m.x, m.y, m.z);
  model.root.rotation.y = Math.PI / 2 - m.angle;
}
