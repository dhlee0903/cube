// 테마마다 다른 소리. 모두 CC0(퍼블릭 도메인) 녹음을 다듬은 것이고, 출처는 public/sounds/CREDITS.md에 있다.
// 묶음마다 돌릴 때 소리 셋(돌아가며 고른다)과 다 맞췄을 때 소리 하나가 있다.
// 브라우저는 사람이 한 번 건드리기 전엔 소리를 못 내게 막아 두므로, 첫 터치·클릭·키 입력 때 오디오를 깨운다.

const BASE = `${import.meta.env?.BASE_URL ?? './'}sounds/`;

// 녹음마다 느껴지는 크기가 달라서 묶음마다 크기를 맞춘다
const LEVEL = {
  cube: 1, candy: 0.7, dice: 0.7, squish: 0.8, molten: 0.8, pop: 0.8, paper: 0.9, nature: 0.8, water: 0.7,
  glass: 0.6, crystal: 0.5, stone: 0.9, ceramic: 0.7, wood: 0.9, metal: 0.6, mech: 0.8, cloth: 1, leather: 1,
  scale: 0.7, electric: 0.45, disco: 0.5, glitch: 0.45, pixel: 0.4, flip: 0.9, space: 0.8, fruit: 0.9,
  flesh: 0.9, eldritch: 0.8, bone: 0.8, eye: 0.8,
};

export const KITS = Object.keys(LEVEL);

export class Sound {
  constructor(store) {
    this.store = store;
    this.on = store.get('cube.sound') !== 'off';
    this.ctx = null;
    this.buffers = new Map(); // 파일 이름 -> AudioBuffer(받는 중이면 Promise)
    this.kit = 'cube';
    this.last = 0;
    const wake = () => this.wake();
    for (const type of ['pointerdown', 'touchend', 'keydown']) {
      window.addEventListener(type, wake, { capture: true, passive: true });
    }
  }

  wake() {
    if (!this.on) return;
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.8;
      this.out.connect(this.ctx.destination);
      this.load(this.kit);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setKit(kit) {
    this.kit = KITS.includes(kit) ? kit : 'cube';
    if (this.ctx) this.load(this.kit);
  }

  load(kit) {
    for (const name of [`${kit}-1`, `${kit}-2`, `${kit}-3`, `${kit}-solve`]) {
      if (this.buffers.has(name)) continue;
      const job = fetch(`${BASE}${name}.mp3`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.statusText))))
        .then((data) => new Promise((ok, fail) => this.ctx.decodeAudioData(data, ok, fail)))
        .then((buffer) => this.buffers.set(name, buffer))
        .catch(() => this.buffers.delete(name)); // 못 받으면 다음에 다시 해 본다
      this.buffers.set(name, job);
    }
  }

  play(name, { gain = 1, rate = 1 } = {}) {
    if (!this.on || !this.ctx || this.ctx.state !== 'running') return;
    const buffer = this.buffers.get(name);
    if (!buffer || typeof buffer.then === 'function') return;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const level = this.ctx.createGain();
    level.gain.value = gain * (LEVEL[this.kit] ?? 1);
    source.connect(level).connect(this.out);
    source.start();
  }

  /** 한 층이 돌아갈 때. 섞기·맞추기처럼 빠르게 이어질 땐 작고 짧게, 너무 겹치지 않게 솎는다. */
  turn(quick = false) {
    const now = performance.now();
    if (quick && now - this.last < 70) return;
    this.last = now;
    const i = 1 + Math.floor(Math.random() * 3);
    this.play(`${this.kit}-${i}`, { gain: quick ? 0.55 : 1, rate: 0.94 + Math.random() * 0.12 + (quick ? 0.08 : 0) });
  }

  solve() {
    this.play(`${this.kit}-solve`, { gain: 0.9 });
  }

  toggle() {
    this.on = !this.on;
    this.store.set('cube.sound', this.on ? 'on' : 'off');
    if (this.on) this.wake();
    else this.ctx?.suspend().catch(() => {});
    return this.on;
  }
}
