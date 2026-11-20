import * as THREE from 'three';

// Every texture is drawn in code at 64x64 pixels, one tile per two world
// units, which is one texel per map unit of the old engines.

export function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvas(w = 64, h = 64) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function grain(ctx, w, h, r, amount) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${Math.min(255, ((n >> 16) & 255) * f) | 0},${Math.min(255, ((n >> 8) & 255) * f) | 0},${Math.min(255, (n & 255) * f) | 0})`;
}

function bevel(ctx, x, y, w, h, base, r) {
  ctx.fillStyle = shade(base, 0.85 + r() * 0.3);
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(255,240,210,0.12)';
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y, 1, h);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x + w - 1, y, 1, h);
}

const PAINTERS = {
  rock(ctx, r) {
    ctx.fillStyle = '#4a3f33';
    ctx.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = shade('#5a4c3d', 0.7 + r() * 0.5);
      const x = r() * 64;
      const y = r() * 64;
      const s = 3 + r() * 9;
      for (const ox of [-64, 0, 64])
        for (const oy of [-64, 0, 64]) {
          ctx.beginPath();
          ctx.ellipse(x + ox, y + oy, s, s * 0.7, r() * 3, 0, Math.PI * 2);
          ctx.fill();
        }
    }
    grain(ctx, 64, 64, r, 30);
  },
  stone(ctx, r) {
    ctx.fillStyle = '#241e18';
    ctx.fillRect(0, 0, 64, 64);
    const rows = [0, 20, 36, 52, 64];
    for (let k = 0; k < rows.length - 1; k++) {
      let x = k % 2 ? -10 : 0;
      while (x < 64) {
        const w = 14 + Math.floor(r() * 16);
        bevel(ctx, x + 1, rows[k] + 1, w - 2, rows[k + 1] - rows[k] - 2, '#6b5d4c', r);
        if (x + w > 64) bevel(ctx, x + 1 - 64, rows[k] + 1, w - 2, rows[k + 1] - rows[k] - 2, '#6b5d4c', r);
        x += w;
      }
    }
    grain(ctx, 64, 64, r, 26);
  },
  brick(ctx, r) {
    ctx.fillStyle = '#21160f';
    ctx.fillRect(0, 0, 64, 64);
    for (let row = 0; row < 8; row++) {
      const off = row % 2 ? 8 : 0;
      for (let col = -1; col < 4; col++) bevel(ctx, col * 16 + off + 1, row * 8 + 1, 14, 6, '#6e3b26', r);
    }
    grain(ctx, 64, 64, r, 24);
  },
  metal(ctx, r) {
    ctx.fillStyle = '#3c3a35';
    ctx.fillRect(0, 0, 64, 64);
    for (const [x, y, w, h] of [
      [1, 1, 30, 30],
      [33, 1, 30, 30],
      [1, 33, 30, 30],
      [33, 33, 30, 30],
    ]) {
      bevel(ctx, x, y, w, h, '#57534a', r);
      ctx.fillStyle = '#2a2824';
      for (const [a, b] of [
        [x + 3, y + 3],
        [x + w - 5, y + 3],
        [x + 3, y + h - 5],
        [x + w - 5, y + h - 5],
      ])
        ctx.fillRect(a, b, 2, 2);
    }
    ctx.fillStyle = 'rgba(120,60,20,0.25)';
    for (let i = 0; i < 12; i++) ctx.fillRect(r() * 64, r() * 64, 2 + r() * 6, 1 + r() * 4);
    grain(ctx, 64, 64, r, 18);
  },
  plate(ctx, r) {
    ctx.fillStyle = '#45403a';
    ctx.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 8)
      for (let x = (y / 8) % 2 ? 4 : 0; x < 64; x += 8) {
        ctx.fillStyle = '#5e574d';
        ctx.fillRect(x + 2, y + 3, 4, 2);
        ctx.fillStyle = '#2c2925';
        ctx.fillRect(x + 2, y + 5, 4, 1);
      }
    ctx.fillStyle = '#26231f';
    ctx.fillRect(0, 0, 64, 1);
    ctx.fillRect(0, 0, 1, 64);
    grain(ctx, 64, 64, r, 16);
  },
  wood(ctx, r) {
    ctx.fillStyle = '#3b2716';
    ctx.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 16) {
      bevel(ctx, 0, y + 1, 64, 14, '#6a4626', r);
      ctx.strokeStyle = 'rgba(30,18,8,0.5)';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        const yy = y + 4 + i * 4 + r() * 2;
        ctx.moveTo(0, yy);
        for (let x = 0; x <= 64; x += 8) ctx.lineTo(x, yy + (r() - 0.5) * 2);
        ctx.stroke();
      }
    }
    grain(ctx, 64, 64, r, 20);
  },
  rune(ctx, r) {
    PAINTERS.stone(ctx, r);
    ctx.strokeStyle = '#2f7f8f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, 14);
    ctx.lineTo(32, 26);
    ctx.lineTo(44, 14);
    ctx.moveTo(32, 26);
    ctx.lineTo(32, 50);
    ctx.moveTo(22, 40);
    ctx.lineTo(42, 40);
    ctx.stroke();
  },
  trim(ctx, r) {
    ctx.fillStyle = '#6b4f22';
    ctx.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 16) {
      bevel(ctx, 0, y, 64, 15, '#8a6a30', r);
      ctx.fillStyle = '#3b2a12';
      for (let x = 4; x < 64; x += 12) ctx.fillRect(x, y + 6, 3, 3);
    }
    grain(ctx, 64, 64, r, 18);
  },
  lava(ctx, r) {
    ctx.fillStyle = '#8f2a08';
    ctx.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = ['#ff8a1f', '#d4470f', '#ffcf4a', '#6a1a05'][Math.floor(r() * 4)];
      const x = r() * 64;
      const y = r() * 64;
      const s = 2 + r() * 8;
      for (const ox of [-64, 0, 64])
        for (const oy of [-64, 0, 64]) {
          ctx.beginPath();
          ctx.ellipse(x + ox, y + oy, s, s * 0.6, r() * 3, 0, Math.PI * 2);
          ctx.fill();
        }
    }
    grain(ctx, 64, 64, r, 20);
  },
};

// Two sky layers: a solid far one and a front one with holes, scrolled at
// different speeds by the sky shader.
function skyLayer(r, front) {
  const [c, ctx] = canvas(128, 128);
  const img = ctx.createImageData(128, 128);
  const cells = 8;
  const grid = Array.from({ length: (cells + 1) * (cells + 1) }, () => r());
  const at = (x, y) => grid[(y % cells) * (cells + 1) + (x % cells)];
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++) {
      let v = 0;
      let amp = 1;
      let total = 0;
      for (let o = 1; o <= 4; o *= 2) {
        const fx = (x / 128) * cells * o;
        const fy = (y / 128) * cells * o;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const tx = fx - ix;
        const ty = fy - iy;
        const a = at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx;
        const b = at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx;
        v += (a * (1 - ty) + b * ty) * amp;
        total += amp;
        amp *= 0.5;
      }
      v /= total;
      const p = (y * 128 + x) * 4;
      if (front) {
        img.data[p] = 120 + v * 90;
        img.data[p + 1] = 70 + v * 60;
        img.data[p + 2] = 60 + v * 50;
        img.data[p + 3] = v > 0.55 ? Math.min(255, (v - 0.55) * 900) : 0;
      } else {
        img.data[p] = 40 + v * 50;
        img.data[p + 1] = 18 + v * 22;
        img.data[p + 2] = 30 + v * 30;
        img.data[p + 3] = 255;
      }
    }
  ctx.putImageData(img, 0, 0);
  return c;
}

function toTexture(c, nearest = true) {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  return tex;
}

export function makeTextures() {
  const out = {};
  let seed = 11;
  for (const [name, paint] of Object.entries(PAINTERS)) {
    const [c, ctx] = canvas();
    paint(ctx, seeded(seed++ * 7919));
    out[name] = toTexture(c);
  }
  out.skyBack = toTexture(skyLayer(seeded(5), false), false);
  out.skyFront = toTexture(skyLayer(seeded(9), true), false);
  return out;
}
