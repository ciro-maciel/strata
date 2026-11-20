import { VOX } from './config.js';

// Materials. Index 0 is air. Liquids do not block bodies; sky blocks them and
// draws the sky. Everything else is plain solid with a texture.
export const MATERIALS = [
  { name: 'air' },
  { name: 'rock', tex: 'rock' },
  { name: 'stone', tex: 'stone' },
  { name: 'brick', tex: 'brick' },
  { name: 'metal', tex: 'metal' },
  { name: 'plate', tex: 'plate' },
  { name: 'wood', tex: 'wood' },
  { name: 'rune', tex: 'rune' },
  { name: 'lava', tex: 'lava', liquid: 'lava' },
  { name: 'sky', tex: 'sky', sky: true },
  { name: 'trim', tex: 'trim' },
];

export const MAT = Object.fromEntries(MATERIALS.map((m, i) => [m.name, i]));

export const isSolid = (v) => v !== 0 && !MATERIALS[v].liquid;

// A dense 3D grid. Index order is x fastest, then y, then z, which is also the
// layout a 3D texture expects, so the light volume can be uploaded as is.
export class VoxelGrid {
  constructor(sx, sy, sz, fill = MAT.rock) {
    this.nx = Math.round(sx / VOX);
    this.ny = Math.round(sy / VOX);
    this.nz = Math.round(sz / VOX);
    this.size = [sx, sy, sz];
    this.data = new Uint8Array(this.nx * this.ny * this.nz).fill(fill);
  }

  idx(i, j, k) {
    return (k * this.ny + j) * this.nx + i;
  }

  inside(i, j, k) {
    return i >= 0 && j >= 0 && k >= 0 && i < this.nx && j < this.ny && k < this.nz;
  }

  get(i, j, k) {
    return this.inside(i, j, k) ? this.data[this.idx(i, j, k)] : MAT.rock;
  }

  set(i, j, k, v) {
    if (this.inside(i, j, k)) this.data[this.idx(i, j, k)] = v;
  }

  at(x, y, z) {
    return this.get(Math.floor(x / VOX), Math.floor(y / VOX), Math.floor(z / VOX));
  }

  // Calls fn(i, j, k) for every voxel inside a world-space box.
  each(x0, y0, z0, x1, y1, z1, fn) {
    const i0 = Math.round(Math.min(x0, x1) / VOX);
    const i1 = Math.round(Math.max(x0, x1) / VOX);
    const j0 = Math.round(Math.min(y0, y1) / VOX);
    const j1 = Math.round(Math.max(y0, y1) / VOX);
    const k0 = Math.round(Math.min(z0, z1) / VOX);
    const k1 = Math.round(Math.max(z0, z1) / VOX);
    for (let k = k0; k < k1; k++) for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) fn(i, j, k);
  }

  fill(x0, y0, z0, x1, y1, z1, v) {
    this.each(x0, y0, z0, x1, y1, z1, (i, j, k) => this.set(i, j, k, v));
  }

  // Repaints only the solid voxels of a box, so carved space stays carved.
  paint(x0, y0, z0, x1, y1, z1, v) {
    this.each(x0, y0, z0, x1, y1, z1, (i, j, k) => {
      if (this.inside(i, j, k) && isSolid(this.data[this.idx(i, j, k)])) this.set(i, j, k, v);
    });
  }

  // Whether an axis-aligned box overlaps any solid voxel.
  boxSolid(x0, y0, z0, x1, y1, z1) {
    const e = 1e-6;
    const i0 = Math.floor(x0 / VOX);
    const i1 = Math.floor((x1 - e) / VOX);
    const j0 = Math.floor(y0 / VOX);
    const j1 = Math.floor((y1 - e) / VOX);
    const k0 = Math.floor(z0 / VOX);
    const k1 = Math.floor((z1 - e) / VOX);
    for (let k = k0; k <= k1; k++)
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (isSolid(this.get(i, j, k))) return true;
    return false;
  }

  // Whether an axis-aligned box touches a liquid, and which.
  boxLiquid(x0, y0, z0, x1, y1, z1) {
    const e = 1e-6;
    for (let k = Math.floor(z0 / VOX); k <= Math.floor((z1 - e) / VOX); k++)
      for (let j = Math.floor(y0 / VOX); j <= Math.floor((y1 - e) / VOX); j++)
        for (let i = Math.floor(x0 / VOX); i <= Math.floor((x1 - e) / VOX); i++) {
          const m = MATERIALS[this.get(i, j, k)];
          if (m.liquid) return m.liquid;
        }
    return null;
  }

  // 3D grid ray march (Amanatides and Woo). Returns the distance to the first
  // voxel `stop` accepts (solid by default), the voxel and the face normal.
  ray(ox, oy, oz, dx, dy, dz, maxT, stop = isSolid) {
    let i = Math.floor(ox / VOX);
    let j = Math.floor(oy / VOX);
    let k = Math.floor(oz / VOX);
    const si = dx > 0 ? 1 : -1;
    const sj = dy > 0 ? 1 : -1;
    const sk = dz > 0 ? 1 : -1;
    const ti = dx ? Math.abs(VOX / dx) : Infinity;
    const tj = dy ? Math.abs(VOX / dy) : Infinity;
    const tk = dz ? Math.abs(VOX / dz) : Infinity;
    let mi = dx > 0 ? ((i + 1) * VOX - ox) / dx : dx < 0 ? (i * VOX - ox) / dx : Infinity;
    let mj = dy > 0 ? ((j + 1) * VOX - oy) / dy : dy < 0 ? (j * VOX - oy) / dy : Infinity;
    let mk = dz > 0 ? ((k + 1) * VOX - oz) / dz : dz < 0 ? (k * VOX - oz) / dz : Infinity;
    let t = 0;
    let normal = [0, 0, 0];
    for (;;) {
      if (mi < mj && mi < mk) {
        i += si;
        t = mi;
        mi += ti;
        normal = [-si, 0, 0];
      } else if (mj < mk) {
        j += sj;
        t = mj;
        mj += tj;
        normal = [0, -sj, 0];
      } else {
        k += sk;
        t = mk;
        mk += tk;
        normal = [0, 0, -sk];
      }
      if (t >= maxT) return { t: maxT, hit: false };
      if (stop(this.get(i, j, k))) return { t, hit: true, i, j, k, normal };
    }
  }
}

// Slab test: distance along a ray to an axis-aligned box, or null.
export function rayBox(o, d, min, max, maxT) {
  let t0 = 0;
  let t1 = maxT;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < min[a] || o[a] > max[a]) return null;
      continue;
    }
    let near = (min[a] - o[a]) / d[a];
    let far = (max[a] - o[a]) / d[a];
    if (near > far) [near, far] = [far, near];
    t0 = Math.max(t0, near);
    t1 = Math.min(t1, far);
    if (t0 > t1) return null;
  }
  return t0;
}
