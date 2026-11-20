import * as THREE from 'three';

// Blood, smoke, sparks and explosions are particles: square points with a
// velocity, a life and optional gravity, drawn as one Points object. The old
// engines did the same with single pixels; these keep a size with distance.

const MAX = 4096;

export class Particles {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);
    this.next = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute float size;
        attribute vec3 color;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = min(3.0, size * 200.0 / max(0.1, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        void main() { gl_FragColor = vec4(vColor, 1.0); }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  spawn(x, y, z, vx, vy, vz, color, life, size = 0.06, gravity = 1) {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.col.set(color, i * 3);
    this.life[i] = life;
    this.size[i] = size;
    this.grav[i] = gravity;
  }

  burst(p, n, color, speed, life, size, gravity = 1, spread = 1) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const e = (Math.random() - 0.5) * Math.PI * spread;
      const s = speed * (0.3 + Math.random() * 0.7);
      const c = color.map((v) => v * (0.7 + Math.random() * 0.4));
      this.spawn(p[0], p[1], p[2], Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s, Math.sin(a) * Math.cos(e) * s, c, life * (0.5 + Math.random()), size, gravity);
    }
  }

  blood(p, n = 10) {
    this.burst(p, n, [0.55, 0.03, 0.02], 2.5, 0.6, 0.05, 1);
  }

  puff(p) {
    this.burst(p, 6, [0.5, 0.47, 0.42], 1.2, 0.4, 0.04, 0.2);
    this.burst(p, 3, [1, 0.8, 0.4], 3, 0.15, 0.03, 0.5);
  }

  explosion(p) {
    this.burst(p, 70, [1, 0.6, 0.15], 7, 0.5, 0.09, 0.3, 2);
    this.burst(p, 40, [1, 0.9, 0.5], 4, 0.3, 0.07, 0.1, 2);
    this.burst(p, 30, [0.3, 0.28, 0.26], 1.5, 1.1, 0.1, -0.15, 2);
  }

  trail(p) {
    this.spawn(p[0], p[1], p[2], (Math.random() - 0.5) * 0.3, 0.3, (Math.random() - 0.5) * 0.3, [0.42, 0.4, 0.38], 0.7, 0.07, -0.1);
  }

  spark(p, color) {
    this.spawn(p[0], p[1], p[2], (Math.random() - 0.5) * 0.6, Math.random() * 1.2, (Math.random() - 0.5) * 0.6, color, 0.8, 0.05, -0.2);
  }

  update(dt, gravity) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.size[i] = 0;
        continue;
      }
      this.vel[i * 3 + 1] -= gravity * this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    this.size.fill(0);
  }
}
