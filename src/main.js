import './style.css';
import {
  MAX_SIZE, MIN_SIZE, applyMove, createCube, invert, isSolved, scramble, simplify, steps,
} from './cube.js';
import { THEMES, themeById } from './themes.js';
import { CubeView } from './view.js';
import { Timer, formatTime } from './timer.js';

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
let history = []; // 맞춘 상태에서부터 돌린 것들. 맞추기와 힌트는 이걸 거꾸로 본다.
let playing = false;

const timer = new Timer();

const view = new CubeView($('stage'), {
  onGrab() {
    if (timer.state === 'ready') {
      timer.start();
      tickTimer();
    }
  },
  onMove(move) {
    commit(move);
    if (timer.state === 'running' && history.length === 0) {
      timer.stop();
      saveBest();
    }
    refresh();
  },
});
view.setCube(cube);

// 개발 서버에서만. 브라우저 테스트가 손으로 돌린 것처럼 흉내 낼 수 있게 열어 둔다.
if (import.meta.env.DEV) window.cube = { view, solution: () => simplify(invert(history), size) };

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
  $('hint').disabled = playing || history.length === 0;
  $('solve').disabled = playing || history.length === 0;
  showTimer();
}

function setSize(next) {
  next = clampSize(next);
  if (next === size || busy()) return;
  size = next;
  store.set('cube.size', String(size));
  cube = createCube(size);
  history = [];
  timer.reset();
  view.setCube(cube);
  refresh();
}

$('smaller').addEventListener('click', () => setSize(size - 1));
$('bigger').addEventListener('click', () => setSize(size + 1));

$('scramble').addEventListener('click', async () => {
  if (busy()) return;
  timer.reset();
  const moves = scramble(size);
  await play(moves, Math.max(40, Math.min(110, 2400 / moves.length)));
  if (history.length) timer.arm();
  refresh();
});

$('hint').addEventListener('click', () => {
  if (busy() || history.length === 0) return;
  const [next] = simplify(invert(history), size);
  if (!next) return;
  timer.hinted = true;
  view.nudge(next);
});

$('solve').addEventListener('click', () => {
  if (busy() || history.length === 0) return;
  timer.reset();
  const moves = simplify(invert(history), size);
  play(moves, Math.max(55, Math.min(170, 5000 / moves.length)));
});

// ---- 타이머 ----

const bestKey = () => `cube.best.${size}`;
let newBest = false;

function saveBest() {
  newBest = false;
  if (timer.hinted) return; // 힌트를 봤으면 기록으로 치지 않는다
  const prev = Number(store.get(bestKey())) || Infinity;
  if (timer.elapsed() < prev) {
    store.set(bestKey(), String(Math.round(timer.elapsed())));
    newBest = true;
  }
}

function showTimer() {
  const box = $('timer');
  box.hidden = timer.state === 'off';
  if (box.hidden) return;
  box.className = `timer ${timer.state}`;
  $('time').textContent = formatTime(timer.elapsed());
  const best = Number(store.get(bestKey()));
  const bestEl = $('best');
  bestEl.textContent = best ? `최고 ${formatTime(best)}` : '';
  bestEl.classList.toggle('new', timer.state === 'done' && newBest);
}

function tickTimer() {
  showTimer();
  if (timer.state === 'running') requestAnimationFrame(tickTimer);
}

// ---- 색 ----

const swatchOrder = [2, 4, 0, 3, 5, 1]; // 위-앞-오른쪽-아래-뒤-왼쪽 순으로 둘러 칠한다

function paintSwatch(el, theme) {
  const stops = swatchOrder.map((f, i) => `${theme.faces[f]} ${i * 60}deg ${(i + 1) * 60}deg`);
  el.style.setProperty('--swatch', `conic-gradient(${stops.join(', ')})`);
  el.style.setProperty('--rim', theme.body.color);
}

const palette = $('themes');
const themeButton = $('theme');

const choices = THEMES.map((theme) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.setAttribute('role', 'radio');
  b.innerHTML = '<span class="tile"><span class="dot"></span></span><span class="name"></span>';
  b.querySelector('.name').textContent = theme.name;
  b.querySelector('.tile').style.setProperty('--tile', theme.backdrop ?? theme.bg);
  paintSwatch(b, theme);
  b.addEventListener('click', () => useTheme(theme));
  palette.append(b);
  return { theme, b };
});

function openPalette(open) {
  palette.hidden = !open;
  themeButton.setAttribute('aria-expanded', String(open));
}

themeButton.addEventListener('click', () => openPalette(palette.hidden));
document.addEventListener('pointerdown', (e) => {
  if (!palette.hidden && !palette.contains(e.target) && !themeButton.contains(e.target)) openPalette(false);
}, true);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !palette.hidden) {
    openPalette(false);
    themeButton.focus();
  }
});

function isDark(hex) {
  const v = parseInt(hex.slice(1), 16);
  return 0.299 * (v >> 16) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255) < 128;
}

function useTheme(theme) {
  const root = document.documentElement;
  root.style.setProperty('--bg', theme.bg);
  root.style.setProperty('--ink', theme.ink);
  root.style.setProperty('--backdrop', theme.backdrop ?? theme.bg);
  root.style.colorScheme = isDark(theme.bg) ? 'dark' : 'light';
  document.body.classList.toggle('drift', Boolean(theme.drift));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.bg);
  for (const { theme: t, b } of choices) b.setAttribute('aria-checked', String(t === theme));
  paintSwatch(themeButton, theme);
  view.setTheme(theme);
  store.set('cube.theme', theme.id);
}

// 처음 오면 기기 설정을 따라 밝은 쪽/어두운 쪽을 고른다
const forced = document.documentElement.dataset.theme;
const prefersDark = forced ? forced === 'dark' : window.matchMedia?.('(prefers-color-scheme: dark)').matches;
useTheme(themeById(store.get('cube.theme')) ?? themeById(prefersDark ? 'neon' : 'classic'));
refresh();
