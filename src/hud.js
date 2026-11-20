import { T } from './i18n.js';
import { WEAPONS, WEAPON_ORDER } from './weapons.js';

// Status bar and messages in plain DOM, touched only when a value changes.
export class Hud {
  constructor(root) {
    root.innerHTML = `
      <div class="cell"><span class="value" data-k="ammo">0</span><span class="label">${T.ammo}</span></div>
      <div class="cell"><span class="value" data-k="health">100</span><span class="label">${T.health}</span></div>
      <div class="cell"><span class="value" data-k="armor">0</span><span class="label">${T.armor}</span></div>
      <div class="cell"><span class="arms">${WEAPON_ORDER.map((w) => `<b data-w="${w}">${WEAPONS[w].slot}</b>`).join('')}</span><span class="label">${T.arms}</span></div>
      <div class="cell"><span class="keys"><i data-key="rune"></i></span><span class="label">${T.key}</span></div>
      <div class="cell reserve"><span data-k="shells">0</span><span data-k="nails">0</span><span data-k="rockets">0</span></div>
    `;
    this.values = {};
    this.el = {};
    for (const node of root.querySelectorAll('[data-k]')) this.el[node.dataset.k] = node;
    this.arms = [...root.querySelectorAll('[data-w]')];
    this.keyEl = root.querySelector('[data-key]');
    this.messages = document.getElementById('messages');
    this.flash = document.getElementById('flash');
    this.flashLevel = 0;
    this.flashColor = '255,0,0';
  }

  set(k, v) {
    if (this.values[k] === v) return;
    this.values[k] = v;
    this.el[k].textContent = v;
  }

  update(p, dt) {
    this.set('ammo', String(p.ammo[WEAPONS[p.weapon].ammo]));
    this.set('health', String(Math.max(0, Math.ceil(p.health))));
    this.set('armor', String(Math.ceil(p.armor)));
    this.set('shells', String(p.ammo.shells));
    this.set('nails', String(p.ammo.nails));
    this.set('rockets', String(p.ammo.rockets));
    this.el.health.classList.toggle('low', p.health <= 25);
    const arms = WEAPON_ORDER.map((w) => (p.owned[w] ? 1 : 0)).join('') + p.weapon;
    if (this.values.arms !== arms) {
      this.values.arms = arms;
      for (const n of this.arms) {
        n.classList.toggle('owned', !!p.owned[n.dataset.w]);
        n.classList.toggle('current', n.dataset.w === p.weapon);
      }
    }
    this.keyEl.classList.toggle('has', !!p.keys.rune);
    this.flashLevel = Math.max(0, this.flashLevel - dt * 2.2);
    this.flash.style.background = `rgba(${this.flashColor},${Math.min(0.55, this.flashLevel)})`;
  }

  hurt(amount) {
    this.flashColor = '190,0,0';
    this.flashLevel = Math.min(0.9, this.flashLevel + amount / 40);
  }

  bonus() {
    this.flashColor = '255,200,90';
    this.flashLevel = Math.max(this.flashLevel, 0.15);
  }

  message(text) {
    const line = document.createElement('div');
    line.textContent = text;
    this.messages.prepend(line);
    while (this.messages.children.length > 3) this.messages.lastChild.remove();
    setTimeout(() => line.remove(), 3500);
  }

  clearMessages() {
    this.messages.textContent = '';
  }
}
