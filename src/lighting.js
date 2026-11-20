import { VOX } from './config.js';
import { isSolid } from './voxels.js';

// Static light is baked once per level into a volume with one sample per
// voxel. Each light falls off linearly to zero at its radius, as the old
// light compiler did, and a voxel the light cannot see by a straight line
// gets nothing from it: that is the shadow. Values are stored at half
// brightness so the shader can double them, giving the same "overbright"
// headroom the old renderer had.

export function bakeLight(grid, lights, ambient = [0.06, 0.06, 0.07]) {
  const { nx, ny, nz, data } = grid;
  const n = nx * ny * nz;
  const acc = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    if (isSolid(data[v])) continue;
    acc[v * 3] = ambient[0];
    acc[v * 3 + 1] = ambient[1];
    acc[v * 3 + 2] = ambient[2];
  }

  for (const L of lights) {
    const r = L.radius;
    const reach = Math.ceil(r / VOX);
    const ci = Math.floor(L.x / VOX);
    const cj = Math.floor(L.y / VOX);
    const ck = Math.floor(L.z / VOX);
    const [cr, cg, cb] = L.color || [1, 1, 1];
    const power = L.intensity ?? 1;
    for (let k = Math.max(0, ck - reach); k <= Math.min(nz - 1, ck + reach); k++) {
      for (let j = Math.max(0, cj - reach); j <= Math.min(ny - 1, cj + reach); j++) {
        for (let i = Math.max(0, ci - reach); i <= Math.min(nx - 1, ci + reach); i++) {
          const v = (k * ny + j) * nx + i;
          if (isSolid(data[v])) continue;
          const dx = (i + 0.5) * VOX - L.x;
          const dy = (j + 0.5) * VOX - L.y;
          const dz = (k + 0.5) * VOX - L.z;
          const d = Math.hypot(dx, dy, dz);
          if (d >= r) continue;
          if (d > VOX && grid.ray(L.x, L.y, L.z, dx / d, dy / d, dz / d, d).hit) continue;
          const f = (1 - d / r) * power;
          acc[v * 3] += f * cr;
          acc[v * 3 + 1] += f * cg;
          acc[v * 3 + 2] += f * cb;
        }
      }
    }
  }

  // Solid voxels take the average of their open neighbors, so filtering the
  // volume near a wall does not pull the light toward black.
  const out = new Uint8Array(n * 4);
  const NB = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const v = (k * ny + j) * nx + i;
        let r = 0;
        let g = 0;
        let b = 0;
        if (!isSolid(data[v])) {
          r = acc[v * 3];
          g = acc[v * 3 + 1];
          b = acc[v * 3 + 2];
        } else {
          let count = 0;
          for (const [a, c, e] of NB) {
            if (!grid.inside(i + a, j + c, k + e)) continue;
            const w = ((k + e) * ny + (j + c)) * nx + (i + a);
            if (isSolid(data[w])) continue;
            r += acc[w * 3];
            g += acc[w * 3 + 1];
            b += acc[w * 3 + 2];
            count++;
          }
          if (count) {
            r /= count;
            g /= count;
            b /= count;
          }
        }
        out[v * 4] = Math.min(255, r * 127.5);
        out[v * 4 + 1] = Math.min(255, g * 127.5);
        out[v * 4 + 2] = Math.min(255, b * 127.5);
        out[v * 4 + 3] = 255;
      }
    }
  }
  return out;
}

// The light at a point, for models: the old engine sampled the lightmap under
// a model's feet; here the volume answers directly.
export function lightAt(grid, volume, x, y, z) {
  const i = Math.max(0, Math.min(grid.nx - 1, Math.floor(x / VOX)));
  const j = Math.max(0, Math.min(grid.ny - 1, Math.floor(y / VOX)));
  const k = Math.max(0, Math.min(grid.nz - 1, Math.floor(z / VOX)));
  const v = ((k * grid.ny + j) * grid.nx + i) * 4;
  return [(volume[v] / 255) * 2, (volume[v + 1] / 255) * 2, (volume[v + 2] / 255) * 2];
}
