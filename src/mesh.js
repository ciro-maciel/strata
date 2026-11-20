import * as THREE from 'three';
import { VOX } from './config.js';
import { MATERIALS } from './voxels.js';

export const DYNAMIC_LIGHTS = 6;

// A face exists between a visible voxel and air. Liquids show only against
// air, and solid faces under a liquid are skipped: the liquid hides them.
function faceBetween(a, b) {
  if (a !== 0 && b === 0) return a;
  if (b !== 0 && a === 0) return -b;
  return 0;
}

// Greedy meshing: per slice, merge runs of equal faces into the largest
// rectangles, so a flat wall becomes a few quads instead of thousands.
export function greedyQuads(grid) {
  const dims = [grid.nx, grid.ny, grid.nz];
  const quads = [];
  for (let axis = 0; axis < 3; axis++) {
    const u = (axis + 1) % 3;
    const v = (axis + 2) % 3;
    const x = [0, 0, 0];
    const q = [0, 0, 0];
    q[axis] = 1;
    const mask = new Int32Array(dims[u] * dims[v]);
    for (x[axis] = -1; x[axis] < dims[axis]; ) {
      let n = 0;
      for (x[v] = 0; x[v] < dims[v]; x[v]++) {
        for (x[u] = 0; x[u] < dims[u]; x[u]++) {
          // Outside the grid reads as rock, so the outer shell gets no faces.
          const a = grid.get(x[0], x[1], x[2]);
          const b = grid.get(x[0] + q[0], x[1] + q[1], x[2] + q[2]);
          mask[n++] = faceBetween(a, b);
        }
      }
      x[axis]++;
      n = 0;
      for (let j = 0; j < dims[v]; j++) {
        for (let i = 0; i < dims[u]; ) {
          const c = mask[n];
          if (!c) {
            i++;
            n++;
            continue;
          }
          let w = 1;
          while (i + w < dims[u] && mask[n + w] === c) w++;
          let h = 1;
          grow: while (j + h < dims[v]) {
            for (let k = 0; k < w; k++) if (mask[n + k + h * dims[u]] !== c) break grow;
            h++;
          }
          const base = [0, 0, 0];
          base[axis] = x[axis];
          base[u] = i;
          base[v] = j;
          quads.push({ axis, u, v, base, w, h, mat: Math.abs(c), sign: c > 0 ? 1 : -1 });
          for (let l = 0; l < h; l++) for (let k = 0; k < w; k++) mask[n + k + l * dims[u]] = 0;
          i += w;
          n += w;
        }
      }
    }
  }
  return quads;
}

const WORLD_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vNormal = normal;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const LIGHT_FN = /* glsl */ `
  precision highp sampler3D;
  uniform sampler3D lightVolume;
  uniform vec3 volumeSize;
  uniform vec4 dynPos[${DYNAMIC_LIGHTS}];
  uniform vec3 dynColor[${DYNAMIC_LIGHTS}];
  vec3 lightAt(vec3 p, vec3 n) {
    // Sample the center of the air voxel in front of the surface.
    vec3 light = texture(lightVolume, (p + n * ${(VOX * 0.5).toFixed(3)}) / volumeSize).rgb * 2.0;
    for (int i = 0; i < ${DYNAMIC_LIGHTS}; i++) {
      float r = dynPos[i].w;
      if (r <= 0.0) continue;
      vec3 d = dynPos[i].xyz - p;
      float dist = length(d);
      float lambert = dot(n, n) > 0.5 ? max(0.25, dot(d / max(dist, 0.001), n)) : 1.0;
      light += dynColor[i] * max(0.0, 1.0 - dist / r) * lambert;
    }
    // Light comes in 32 steps, like the old palette-based shading.
    return floor(light * 32.0 + 0.5) / 32.0;
  }
`;

const WORLD_FRAG = /* glsl */ `
  uniform sampler2D map;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormal;
  ${LIGHT_FN}
  void main() {
    vec3 tex = texture2D(map, vUv).rgb;
    gl_FragColor = vec4(tex * lightAt(vWorld, vNormal), 1.0);
  }
`;

// Liquids warp their texture coordinates with a sine of the other axis, the
// same "turbulence" trick the old engines used, and are not lit.
const LIQUID_FRAG = /* glsl */ `
  uniform sampler2D map;
  uniform float time;
  varying vec2 vUv;
  void main() {
    vec2 uv = vUv + 0.12 * sin(vUv.yx * 3.14159 + time);
    gl_FragColor = vec4(texture2D(map, uv).rgb * 1.05, 1.0);
  }
`;

// The sky ignores its surface: it projects the view direction onto a
// flattened dome and draws two cloud layers scrolling at different speeds.
const SKY_FRAG = /* glsl */ `
  uniform sampler2D back;
  uniform sampler2D front;
  uniform float time;
  varying vec3 vWorld;
  void main() {
    vec3 d = vWorld - cameraPosition;
    d.y *= 3.0;
    d = normalize(d);
    vec2 uv = d.xz * 1.6;
    vec4 b = texture2D(back, uv + time * vec2(0.020, 0.012));
    vec4 f = texture2D(front, uv * 1.3 + time * vec2(0.045, 0.030));
    gl_FragColor = vec4(mix(b.rgb, f.rgb, f.a), 1.0);
  }
`;

export function makeLightUniforms(grid, volume) {
  const tex = new THREE.Data3DTexture(volume, grid.nx, grid.ny, grid.nz);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return {
    lightVolume: { value: tex },
    volumeSize: { value: new THREE.Vector3(...grid.size) },
    dynPos: { value: Array.from({ length: DYNAMIC_LIGHTS }, () => new THREE.Vector4(0, 0, 0, 0)) },
    dynColor: { value: Array.from({ length: DYNAMIC_LIGHTS }, () => new THREE.Vector3()) },
  };
}

export function litMaterial(map, light) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, ...light },
    vertexShader: WORLD_VERT,
    fragmentShader: WORLD_FRAG,
  });
}

export function buildWorldMesh(grid, textures, light, time) {
  const buckets = new Map();
  for (const q of greedyQuads(grid)) {
    if (!buckets.has(q.mat)) buckets.set(q.mat, { pos: [], nor: [], uv: [] });
    const b = buckets.get(q.mat);
    const p0 = q.base.slice();
    const du = [0, 0, 0];
    const dv = [0, 0, 0];
    du[q.u] = q.w;
    dv[q.v] = q.h;
    const corners = [p0, p0.map((c, i) => c + du[i]), p0.map((c, i) => c + du[i] + dv[i]), p0.map((c, i) => c + dv[i])].map(
      (c) => c.map((x) => x * VOX),
    );
    const order = q.sign > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    const n = [0, 0, 0];
    n[q.axis] = q.sign;
    for (const k of order) {
      const c = corners[k];
      b.pos.push(...c);
      b.nor.push(...n);
      // World-aligned texture coordinates: a 64-pixel tile spans 2 units.
      const s = q.axis === 0 ? c[2] : c[0];
      const t = q.axis === 1 ? c[2] : c[1];
      b.uv.push(s / 2, t / 2);
    }
  }

  const group = new THREE.Group();
  const materials = [];
  for (const [mat, b] of buckets) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    const def = MATERIALS[mat];
    let material;
    if (def.sky) {
      material = new THREE.ShaderMaterial({
        uniforms: { back: { value: textures.skyBack }, front: { value: textures.skyFront }, time },
        vertexShader: WORLD_VERT,
        fragmentShader: SKY_FRAG,
      });
    } else if (def.liquid) {
      material = new THREE.ShaderMaterial({
        uniforms: { map: { value: textures[def.tex] }, time },
        vertexShader: WORLD_VERT,
        fragmentShader: LIQUID_FRAG,
      });
    } else {
      material = litMaterial(textures[def.tex], light);
    }
    materials.push(material);
    group.add(new THREE.Mesh(geo, material));
  }
  return {
    group,
    dispose() {
      group.traverse((o) => o.geometry?.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
