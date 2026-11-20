import * as THREE from 'three';

// Models are built from boxes and cylinders with per-face shading baked into
// vertex colors (top faces bright, bottoms dark). Each model gets one
// material whose color is set every frame to the light where it stands.
// Glowing parts (eyes, visors) use a second material that ignores the light.

const SHADE = (n) => (n.y > 0.5 ? 1 : n.y < -0.5 ? 0.5 : Math.abs(n.x) > 0.5 ? 0.8 : 0.68);

function colored(geo, hex) {
  const c = new THREE.Color(hex);
  const nor = geo.attributes.normal;
  const col = new Float32Array(nor.count * 3);
  const n = new THREE.Vector3();
  for (let i = 0; i < nor.count; i++) {
    n.fromBufferAttribute(nor, i);
    const f = SHADE(n);
    col[i * 3] = c.r * f;
    col[i * 3 + 1] = c.g * f;
    col[i * 3 + 2] = c.b * f;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

class Builder {
  constructor() {
    this.lit = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.glow = new THREE.MeshBasicMaterial({ vertexColors: true });
  }

  box(parent, w, h, d, hex, [x, y, z] = [0, 0, 0], glow = false) {
    const mesh = new THREE.Mesh(colored(new THREE.BoxGeometry(w, h, d), hex), glow ? this.glow : this.lit);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  cyl(parent, r, len, hex, [x, y, z] = [0, 0, 0], axis = 'z', glow = false) {
    const geo = new THREE.CylinderGeometry(r, r, len, 8);
    if (axis === 'z') geo.rotateX(Math.PI / 2);
    if (axis === 'x') geo.rotateZ(Math.PI / 2);
    const mesh = new THREE.Mesh(colored(geo, hex), glow ? this.glow : this.lit);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  pivot(parent, [x, y, z]) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  }
}

// --- monsters -----------------------------------------------------------

function warden() {
  const b = new Builder();
  const root = new THREE.Group();
  const hips = b.pivot(root, [0, 0.86, 0]);
  const legL = b.pivot(hips, [-0.14, 0, 0]);
  const legR = b.pivot(hips, [0.14, 0, 0]);
  for (const leg of [legL, legR]) {
    b.box(leg, 0.22, 0.48, 0.24, '#3a4048', [0, -0.22, 0]);
    b.box(leg, 0.2, 0.42, 0.22, '#2e3238', [0, -0.64, 0]);
    b.box(leg, 0.22, 0.1, 0.32, '#1e2024', [0, -0.82, 0.04]);
  }
  const torso = b.pivot(hips, [0, 0, 0]);
  b.box(torso, 0.6, 0.62, 0.34, '#4d5966', [0, 0.32, 0]);
  b.box(torso, 0.5, 0.3, 0.06, '#66727e', [0, 0.42, 0.19]);
  b.box(torso, 0.62, 0.1, 0.36, '#2a2d31', [0, 0.04, 0]);
  const head = b.pivot(torso, [0, 0.7, 0]);
  b.box(head, 0.3, 0.32, 0.32, '#3d4650', [0, 0.06, 0]);
  b.box(head, 0.24, 0.07, 0.03, '#ffb347', [0, 0.1, 0.17], true);
  const armL = b.pivot(torso, [-0.38, 0.55, 0]);
  const armR = b.pivot(torso, [0.38, 0.55, 0]);
  for (const arm of [armL, armR]) b.box(arm, 0.16, 0.56, 0.18, '#46515c', [0, -0.26, 0]);
  const gun = b.box(armR, 0.1, 0.12, 0.62, '#1f2124', [0, -0.5, 0.22]);
  b.cyl(gun, 0.035, 0.2, '#111', [0, 0.02, 0.36]);
  return { root, b, hips, legL, legR, torso, head, armL, armR, height: 1.75 };
}

function stalker() {
  const b = new Builder();
  const root = new THREE.Group();
  const hips = b.pivot(root, [0, 0.62, 0]);
  const legL = b.pivot(hips, [-0.16, 0, 0]);
  const legR = b.pivot(hips, [0.16, 0, 0]);
  for (const leg of [legL, legR]) {
    b.box(leg, 0.16, 0.36, 0.2, '#4d241c', [0, -0.14, 0.08]);
    b.box(leg, 0.12, 0.34, 0.14, '#3e1c16', [0, -0.42, -0.06]);
    b.box(leg, 0.18, 0.06, 0.28, '#d8ccb0', [0, -0.6, 0.06]);
  }
  const torso = b.pivot(hips, [0, 0, 0]);
  torso.rotation.x = 0.55;
  b.box(torso, 0.5, 0.62, 0.36, '#5e2c22', [0, 0.32, 0]);
  for (const x of [-0.12, 0, 0.12]) b.box(torso, 0.06, 0.16, 0.12, '#d8ccb0', [x, 0.5, -0.2]);
  const head = b.pivot(torso, [0, 0.66, 0.08]);
  b.box(head, 0.28, 0.22, 0.34, '#6a3226', [0, 0, 0.08]);
  b.box(head, 0.24, 0.06, 0.2, '#2a0f0b', [0, -0.12, 0.16]);
  for (const x of [-0.07, 0.07]) b.box(head, 0.05, 0.04, 0.02, '#ffe14a', [x, 0.04, 0.26], true);
  const armL = b.pivot(torso, [-0.3, 0.55, 0]);
  const armR = b.pivot(torso, [0.3, 0.55, 0]);
  for (const arm of [armL, armR]) {
    b.box(arm, 0.12, 0.7, 0.14, '#4d241c', [0, -0.34, 0]);
    for (const x of [-0.04, 0, 0.04]) b.box(arm, 0.025, 0.16, 0.03, '#e8dcc0', [x, -0.76, 0.03]);
  }
  return { root, b, hips, legL, legR, torso, head, armL, armR, height: 1.3 };
}

function hurler() {
  const b = new Builder();
  const root = new THREE.Group();
  const hips = b.pivot(root, [0, 0.9, 0]);
  const legL = b.pivot(hips, [-0.25, 0, 0]);
  const legR = b.pivot(hips, [0.25, 0, 0]);
  for (const leg of [legL, legR]) {
    b.box(leg, 0.32, 0.5, 0.36, '#5c4026', [0, -0.24, 0]);
    b.box(leg, 0.3, 0.42, 0.32, '#4a3320', [0, -0.66, 0]);
    b.box(leg, 0.34, 0.1, 0.44, '#2c2c2a', [0, -0.86, 0.05]);
  }
  const torso = b.pivot(hips, [0, 0, 0]);
  b.box(torso, 0.96, 0.84, 0.62, '#6a4a2c', [0, 0.44, 0]);
  b.box(torso, 0.8, 0.44, 0.1, '#7d5a38', [0, 0.28, 0.33]);
  b.box(torso, 1.04, 0.2, 0.68, '#6a6a64', [0, 0.84, 0]);
  const head = b.pivot(torso, [0, 1.0, 0.08]);
  b.box(head, 0.32, 0.3, 0.32, '#5c4026', [0, 0.06, 0]);
  b.box(head, 0.36, 0.08, 0.36, '#6a6a64', [0, 0.18, 0]);
  for (const x of [-0.07, 0.07]) b.box(head, 0.05, 0.04, 0.02, '#ff5a2a', [x, 0.06, 0.17], true);
  const armL = b.pivot(torso, [-0.6, 0.78, 0]);
  const armR = b.pivot(torso, [0.6, 0.78, 0]);
  for (const arm of [armL, armR]) {
    b.box(arm, 0.26, 0.74, 0.28, '#5c4026', [0, -0.34, 0]);
    b.box(arm, 0.3, 0.14, 0.32, '#6a6a64', [0, -0.02, 0]);
  }
  const tube = b.cyl(armR, 0.11, 0.8, '#3a3a36', [0, -0.66, 0.22]);
  b.cyl(tube, 0.07, 0.06, '#0b0b0b', [0, 0, 0.42]);
  return { root, b, hips, legL, legR, torso, head, armL, armR, height: 2.2 };
}

const MONSTER_BUILDERS = { warden, stalker, hurler };

export function makeMonsterModel(kind) {
  const m = MONSTER_BUILDERS[kind]();
  const baseTorso = m.torso.rotation.x;
  m.animate = (state, t, phase = 0) => {
    const s = Math.sin(t * (kind === 'stalker' ? 13 : 8));
    if (m.hips.userData.y === undefined) m.hips.userData.y = m.hips.position.y;
    m.hips.position.y = m.hips.userData.y;
    m.root.rotation.x = 0;
    m.torso.rotation.x = baseTorso;
    m.torso.rotation.z = 0;
    m.legL.rotation.x = 0;
    m.legR.rotation.x = 0;
    m.armL.rotation.x = 0;
    m.armR.rotation.x = 0;
    if (state === 'walk') {
      m.legL.rotation.x = s * 0.65;
      m.legR.rotation.x = -s * 0.65;
      m.armL.rotation.x = -s * 0.4;
      m.armR.rotation.x = kind === 'stalker' ? s * 0.4 : -0.6;
      m.hips.position.y += Math.abs(s) * 0.04;
    } else if (state === 'attack') {
      // phase goes 0 -> 1 across the attack
      const lift = Math.sin(Math.min(1, phase * 1.6) * Math.PI * 0.5);
      if (kind === 'stalker') {
        m.armL.rotation.x = -2.4 * lift + 0.6;
        m.armR.rotation.x = -2.4 * lift + 0.6;
      } else if (kind === 'hurler') {
        m.armR.rotation.x = -1.5 * lift;
        m.armL.rotation.x = -0.6 * lift;
      } else {
        m.armR.rotation.x = -1.5;
        m.armL.rotation.x = -1.3;
      }
    } else if (state === 'leap') {
      m.torso.rotation.x = baseTorso + 0.4;
      m.armL.rotation.x = -2.2;
      m.armR.rotation.x = -2.2;
      m.legL.rotation.x = 0.8;
      m.legR.rotation.x = 0.8;
    } else if (state === 'pain') {
      m.torso.rotation.x = baseTorso - 0.35;
      m.armL.rotation.x = -0.5;
      m.armR.rotation.x = -0.3;
    } else if (state === 'dead') {
      const f = Math.min(1, phase);
      m.root.rotation.x = -f * Math.PI * 0.5;
      m.torso.rotation.z = f * 0.2;
      m.armL.rotation.x = -f * 2.6;
      m.armR.rotation.x = -f * 2.2;
    }
  };
  return m;
}

// --- items --------------------------------------------------------------

export function makeItemModel(item) {
  const b = new Builder();
  const root = new THREE.Group();
  const spin = b.pivot(root, [0, 0.3, 0]);
  switch (item) {
    case 'health':
      b.box(spin, 0.5, 0.32, 0.5, '#d9d6cc');
      b.box(spin, 0.52, 0.1, 0.52, '#2f9e44', [0, 0, 0]);
      break;
    case 'mega':
      spin.add(new THREE.Mesh(colored(new THREE.OctahedronGeometry(0.3), '#5ff0ff'), b.glow));
      break;
    case 'armor':
    case 'heavyArmor': {
      const hex = item === 'armor' ? '#3f8f4f' : '#d0a020';
      b.box(spin, 0.62, 0.5, 0.24, hex);
      b.box(spin, 0.2, 0.2, 0.26, '#2a2a2a', [0, 0.18, 0]);
      b.box(spin, 0.66, 0.14, 0.28, hex, [0, -0.2, 0]);
      break;
    }
    case 'shells':
      b.box(spin, 0.4, 0.26, 0.3, '#8f2f1f');
      b.box(spin, 0.42, 0.06, 0.32, '#d9a441', [0, 0.1, 0]);
      break;
    case 'nails':
      b.box(spin, 0.44, 0.28, 0.32, '#55595e');
      b.box(spin, 0.46, 0.08, 0.34, '#2f6fd6', [0, 0, 0]);
      break;
    case 'rockets':
      for (const x of [-0.1, 0.1]) {
        b.cyl(spin, 0.08, 0.5, '#5a6630', [x, 0, 0], 'y');
        b.cyl(spin, 0.05, 0.12, '#a33a1f', [x, 0.3, 0], 'y');
      }
      break;
    case 'key':
      spin.add(new THREE.Mesh(colored(new THREE.TorusGeometry(0.12, 0.035, 6, 12), '#4fe3d0'), b.glow));
      b.box(spin, 0.05, 0.36, 0.05, '#4fe3d0', [0, -0.26, 0], true);
      b.box(spin, 0.14, 0.05, 0.05, '#4fe3d0', [0.05, -0.38, 0], true);
      spin.position.y = 0.55;
      break;
    default: {
      const w = makeWeaponModel(item);
      w.root.scale.setScalar(0.9);
      w.root.rotation.y = Math.PI / 2;
      spin.add(w.root);
      w.root.traverse((o) => {
        if (o.material === w.b.lit) o.material = b.lit;
      });
    }
  }
  return { root, spin, b };
}

// --- weapons (also used for the first-person view) ------------------------

export function makeWeaponModel(name) {
  const b = new Builder();
  const root = new THREE.Group();
  const parts = {};
  if (name === 'scatter') {
    for (const x of [-0.04, 0.04]) b.cyl(root, 0.035, 0.7, '#2a2b2e', [x, 0, -0.3]);
    b.box(root, 0.16, 0.12, 0.2, '#3a3c40', [0, -0.02, 0.06]);
    b.box(root, 0.12, 0.16, 0.36, '#6b4a2b', [0, -0.08, 0.3]);
  } else if (name === 'needler') {
    b.box(root, 0.16, 0.18, 0.42, '#45484d', [0, -0.03, 0.08]);
    b.box(root, 0.1, 0.14, 0.18, '#2f6fd6', [0, -0.03, 0.34]);
    parts.drum = b.pivot(root, [0, 0, -0.18]);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      b.cyl(parts.drum, 0.022, 0.5, '#1f2023', [Math.cos(a) * 0.045, Math.sin(a) * 0.045, -0.16]);
    }
  } else if (name === 'launcher') {
    b.cyl(root, 0.085, 0.82, '#4a4f3a', [0, 0, -0.18]);
    b.cyl(root, 0.06, 0.06, '#0b0b0b', [0, 0, -0.6]);
    b.box(root, 0.08, 0.16, 0.12, '#2c2c2a', [0, -0.14, 0.06]);
    b.box(root, 0.03, 0.06, 0.16, '#7a2a1a', [0, 0.11, -0.05]);
  }
  return { root, parts, b };
}
