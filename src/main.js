import './style.css';
import {
  MAX_SIZE, MIN_SIZE, applyMove, createCube, invert, isSolved, scramble, simplify, steps,
} from './cube.js';
import { THEMES, themeById } from './themes.js';
import { CubeView } from './view.js';

const $ = (id) => document.getElementById(id);

// 사생활 보호 창 같은 데서는 localStorage가 아예 던진다
const store = {
  get(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch { /* 기억 못 해도 그만 */ }
  },
};

const clampSize = (n) => Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(n) || 3));

let size = clampSize(Number(store.get('cube.size')));
let cube = createCube(size);
let history = []; // 맞춘 상태에서부터 돌린 것들. 맞추기는 이걸 거꾸로 돈다.
let playing = false;

const view = new CubeView($('stage'), {
  onMove(move) {
    commit(move);
    refresh();
  },
});
view.setCube(cube);

function commit(move) {
  applyMove(cube, move);
  history.push(move);
  if (isSolved(cube)) history = [];
}

async function play(moves, ms) {
  playing = true;
  view.locked = true;
  refresh();
  for (const step of steps(moves)) {
    await view.turn(step, ms);
    for (const move of step) commit(move);
    view.sync();
  }
  playing = false;
  view.locked = false;
  refresh();
}

const busy = () => playing || view.turning;

function refresh() {
  $('size').textContent = `${size}×${size}`;
  $('smaller').disabled = playing || size <= MIN_SIZE;
  $('bigger').disabled = playing || size >= MAX_SIZE;
  $('scramble').disabled = playing;
  $('solve').disabled = playing || history.length === 0;
}

function setSize(next) {
  next = clampSize(next);
  if (next === size || busy()) return;
  size = next;
  store.set('cube.size', String(size));
  cube = createCube(size);
  history = [];
  view.setCube(cube);
  refresh();
}

$('smaller').addEventListener('click', () => setSize(size - 1));
$('bigger').addEventListener('click', () => setSize(size + 1));

$('scramble').addEventListener('click', () => {
  if (busy()) return;
  const moves = scramble(size);
  play(moves, Math.max(40, Math.min(110, 2400 / moves.length)));
});

$('solve').addEventListener('click', () => {
  if (busy() || history.length === 0) return;
  const moves = simplify(invert(history), size);
  play(moves, Math.max(55, Math.min(170, 5000 / moves.length)));
});

// ---- 색 ----

const swatchOrder = [2, 4, 0, 3, 5, 1]; // 흰-초-빨-노-파-주 순으로 둘러 칠한다

const swatches = THEMES.map((theme) => {
  const b = document.createElement('button');
  b.className = 'swatch';
  b.type = 'button';
  b.setAttribute('role', 'radio');
  b.setAttribute('aria-label', theme.name);
  b.title = theme.name;
  const stops = swatchOrder.map((f, i) => `${theme.faces[f]} ${i * 60}deg ${(i + 1) * 60}deg`);
  b.style.setProperty('--swatch', `conic-gradient(${stops.join(', ')})`);
  b.style.setProperty('--rim', theme.body);
  b.addEventListener('click', () => useTheme(theme));
  $('themes').append(b);
  return { theme, b };
});

function isDark(hex) {
  const v = parseInt(hex.slice(1), 16);
  return 0.299 * (v >> 16) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255) < 128;
}

function useTheme(theme) {
  const root = document.documentElement;
  root.style.setProperty('--bg', theme.bg);
  root.style.setProperty('--ink', theme.ink);
  root.style.colorScheme = isDark(theme.bg) ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.bg);
  for (const { theme: t, b } of swatches) b.setAttribute('aria-checked', String(t === theme));
  view.setTheme(theme);
  store.set('cube.theme', theme.id);
}

// 처음 오면 기기 설정을 따라 밝은 쪽/어두운 쪽을 고른다
const forced = document.documentElement.dataset.theme;
const prefersDark = forced ? forced === 'dark' : window.matchMedia?.('(prefers-color-scheme: dark)').matches;
useTheme(themeById(store.get('cube.theme')) ?? (prefersDark ? themeById('night') : THEMES[0]));
refresh();
