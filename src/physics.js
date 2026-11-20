import { PHYS, UNIT } from './config.js';

// Bodies are axis-aligned boxes standing on their feet: (x, y, z) is the
// bottom center. The world is a voxel grid plus moving boxes (doors, plats).

export function boxOf(b, x = b.x, y = b.y, z = b.z) {
  return [x - b.half, y, z - b.half, x + b.half, y + b.height, z + b.half];
}

const overlaps = (a, b) => a[0] < b[3] && a[3] > b[0] && a[1] < b[4] && a[4] > b[1] && a[2] < b[5] && a[5] > b[2];

export function moverBox(m) {
  return [
    m.base[0] + m.move[0] * m.t,
    m.base[1] + m.move[1] * m.t,
    m.base[2] + m.move[2] * m.t,
    m.base[3] + m.move[0] * m.t,
    m.base[4] + m.move[1] * m.t,
    m.base[5] + m.move[2] * m.t,
  ];
}

export function blocked(world, b, x, y, z) {
  const box = boxOf(b, x, y, z);
  if (world.grid.boxSolid(...box)) return true;
  for (const m of world.movers) if (overlaps(box, moverBox(m))) return true;
  if (!b.solidBody) return false;
  for (const o of world.bodies) {
    if (o === b || !o.alive || !o.solidBody) continue;
    const ob = boxOf(o);
    if (!overlaps(box, ob)) continue;
    // Already tangled: allow any move that does not go deeper.
    if (overlaps(boxOf(b), ob)) {
      const before = Math.hypot(o.x - b.x, o.z - b.z);
      if (Math.hypot(o.x - x, o.z - z) >= before) continue;
    }
    return true;
  }
  return false;
}

// Moves along one axis; on contact, stops at the wall. Returns true if blocked.
export function moveAxis(world, b, axis, d) {
  if (!d) return false;
  const p = [b.x, b.y, b.z];
  p[axis] += d;
  if (!blocked(world, b, p[0], p[1], p[2])) {
    b.x = p[0];
    b.y = p[1];
    b.z = p[2];
    return false;
  }
  let lo = 0;
  let hi = 1;
  for (let n = 0; n < 7; n++) {
    const mid = (lo + hi) / 2;
    const q = [b.x, b.y, b.z];
    q[axis] += d * mid;
    if (blocked(world, b, q[0], q[1], q[2])) hi = mid;
    else lo = mid;
  }
  if (axis === 0) b.x += d * lo;
  else if (axis === 1) b.y += d * lo;
  else b.z += d * lo;
  return true;
}

// Horizontal move that climbs steps: try flat; if that hits something while
// on the ground, try again raised by the step height and keep whichever
// went further, then settle back down onto the step.
function stepMove(world, b, dx, dz) {
  const x0 = b.x;
  const y0 = b.y;
  const z0 = b.z;
  const hitX = moveAxis(world, b, 0, dx);
  const hitZ = moveAxis(world, b, 2, dz);
  if (!(hitX || hitZ) || !b.onGround) return [hitX, hitZ];
  const flat = [b.x, b.z];
  b.x = x0;
  b.z = z0;
  moveAxis(world, b, 1, PHYS.stepSize);
  const raised = b.y - y0;
  const hitX2 = moveAxis(world, b, 0, dx);
  const hitZ2 = moveAxis(world, b, 2, dz);
  moveAxis(world, b, 1, -raised);
  const far1 = (flat[0] - x0) ** 2 + (flat[1] - z0) ** 2;
  const far2 = (b.x - x0) ** 2 + (b.z - z0) ** 2;
  if (far2 > far1 + 1e-6) return [hitX2, hitZ2];
  b.x = flat[0];
  b.z = flat[1];
  b.y = y0;
  return [hitX, hitZ];
}

export function walkMove(world, b, dt) {
  const fastest = Math.max(Math.abs(b.vx), Math.abs(b.vy), Math.abs(b.vz)) * dt;
  const steps = Math.max(1, Math.ceil(fastest / 0.2));
  const h = dt / steps;
  for (let s = 0; s < steps; s++) {
    const [hitX, hitZ] = stepMove(world, b, b.vx * h, b.vz * h);
    if (hitX) b.vx = 0;
    if (hitZ) b.vz = 0;
    if (moveAxis(world, b, 1, b.vy * h)) {
      if (b.vy < 0) b.landSpeed = b.vy;
      b.vy = 0;
    }
  }
  b.onGround = b.vy <= 0 && blocked(world, b, b.x, b.y - 0.03, b.z);
}

export function friction(b, dt) {
  const speed = Math.hypot(b.vx, b.vz);
  if (speed < 1e-4) {
    b.vx = 0;
    b.vz = 0;
    return;
  }
  const control = speed < PHYS.stopSpeed ? PHYS.stopSpeed : speed;
  const scale = Math.max(speed - control * PHYS.friction * dt, 0) / speed;
  b.vx *= scale;
  b.vz *= scale;
}

export function accelerate(b, wx, wz, wishSpeed, accel, dt) {
  const add = wishSpeed - (b.vx * wx + b.vz * wz);
  if (add <= 0) return;
  const acc = Math.min(add, accel * dt * wishSpeed);
  b.vx += acc * wx;
  b.vz += acc * wz;
}

// In the air the speed toward the wish direction is capped very low, but the
// acceleration is not. Turning while strafing keeps that direction fresh, so
// speed grows past the ground limit: air strafing and bunny hopping.
export function airAccelerate(b, wx, wz, wishSpeed, dt) {
  const add = Math.min(wishSpeed, PHYS.airWishCap) - (b.vx * wx + b.vz * wz);
  if (add <= 0) return;
  const acc = Math.min(add, PHYS.airAccelerate * wishSpeed * dt);
  b.vx += acc * wx;
  b.vz += acc * wz;
}

// input: { wx, wz } unit wish direction (or zeros), wishSpeed, jump (held).
export function playerMove(world, b, input, dt) {
  if (b.onGround) {
    if (input.jump && b.jumpReleased) {
      b.vy = PHYS.jumpSpeed;
      b.onGround = false;
      b.jumpReleased = false;
    } else {
      friction(b, dt);
    }
  }
  if (!input.jump) b.jumpReleased = true;
  if (b.onGround) accelerate(b, input.wx, input.wz, input.wishSpeed, PHYS.accelerate, dt);
  else airAccelerate(b, input.wx, input.wz, input.wishSpeed, dt);
  b.vy -= PHYS.gravity * dt;
  walkMove(world, b, dt);
}

// Push from damage: away from the source, 8 map units per second per point
// of damage, the old rule that makes rocket jumps work.
export function knockback(b, from, damage) {
  const c = [b.x, b.y + b.height / 2, b.z];
  let d = [c[0] - from[0], c[1] - from[1], c[2] - from[2]];
  const len = Math.hypot(...d) || 1;
  d = d.map((v) => v / len);
  const k = ((damage * 8) / UNIT) * (b.knockScale ?? 1);
  b.vx += d[0] * k;
  b.vy += d[1] * k;
  b.vz += d[2] * k;
  if (d[1] * k > 0.5) b.onGround = false;
}

// --- movers -----------------------------------------------------------------

function ridersOf(world, m) {
  const box = moverBox(m);
  return world.bodies.filter(
    (b) =>
      b.alive &&
      Math.abs(b.y - box[4]) < 0.12 &&
      b.x + b.half > box[0] &&
      b.x - b.half < box[3] &&
      b.z + b.half > box[2] &&
      b.z - b.half < box[5],
  );
}

function wouldCrush(world, m, t, riders) {
  const save = m.t;
  m.t = t;
  const box = moverBox(m);
  m.t = save;
  return world.bodies.some((b) => b.alive && !riders.includes(b) && overlaps(boxOf(b), box));
}

function slide(world, m, toward, dt) {
  const length = Math.hypot(...m.move) || 1;
  const step = (m.speed * dt) / length;
  const next = toward > m.t ? Math.min(toward, m.t + step) : Math.max(toward, m.t - step);
  const riders = ridersOf(world, m);
  if (wouldCrush(world, m, next, riders)) return false;
  const dy = m.move[1] * (next - m.t);
  const dx = m.move[0] * (next - m.t);
  const dz = m.move[2] * (next - m.t);
  m.t = next;
  for (const r of riders) {
    r.x += dx;
    r.y += dy;
    r.z += dz;
    if (dy > 0) r.vy = Math.max(r.vy, 0);
  }
  return true;
}

export function openDoor(world, m) {
  if (m.state === 'opening' || m.state === 'open') {
    if (m.state === 'open') m.wait = m.waitTime;
    return false;
  }
  m.state = 'opening';
  world.onMoverSound?.(m);
  return true;
}

export function updateMovers(world, dt) {
  for (const m of world.movers) {
    if (m.kind === 'door') {
      if (m.state === 'opening') {
        slide(world, m, 1, dt);
        if (m.t >= 1) {
          m.state = 'open';
          m.wait = m.waitTime;
        }
      } else if (m.state === 'open' && m.waitTime >= 0) {
        m.wait -= dt;
        if (m.wait <= 0) {
          m.state = 'closing';
          world.onMoverSound?.(m);
        }
      } else if (m.state === 'closing') {
        if (!slide(world, m, 0, dt)) {
          m.state = 'opening';
          world.onMoverSound?.(m);
        } else if (m.t <= 0) m.state = 'closed';
      }
    } else if (m.kind === 'plat') {
      const riders = ridersOf(world, m);
      if (m.state === 'down') {
        m.wait = riders.length ? m.wait + dt : 0;
        if (m.wait > 0.4) {
          m.state = 'rising';
          world.onMoverSound?.(m);
        }
      } else if (m.state === 'rising') {
        slide(world, m, 1, dt);
        if (m.t >= 1) {
          m.state = 'up';
          m.wait = 0;
        }
      } else if (m.state === 'up') {
        m.wait = riders.length ? 0 : m.wait + dt;
        if (m.wait > 2) {
          m.state = 'lowering';
          world.onMoverSound?.(m);
        }
      } else if (m.state === 'lowering') {
        slide(world, m, 0, dt);
        if (m.t <= 0) {
          m.state = 'down';
          m.wait = 0;
        }
      }
    }
  }
}
