import './style.css';
import {
  MAX_SIZE, MIN_SIZE, applyMove, createCube, invert, isSolved, scramble, simplify, steps,
} from './cube.js';
import { GROUPS, themeById } from './themes.js';
import { CubeView } from './view.js';
import { Timer, formatTime } from './timer.js';
import { Sound } from './sound.js';
import { COUNTED, STAGES, notation, progress, solveLBL } from './solver.js';
import { prepare as prepareShort, solveShort } from './shortest.js';

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
const sound = new Sound(store);

const view = new CubeView($('stage'), {
  onGrab() {
    if (timer.state === 'ready') {
      timer.start();
      tickTimer();
    }
  },
  onSnap() {
    sound.turn();
  },
  onMove(move) {
    const before = history.length;
    commit(move);
    if (before && history.length === 0) {
      if (timer.state === 'running') {
        timer.stop();
        saveBest();
      }
      view.celebrate();
    }
    refresh();
    follow(move);
    // 배우는 중이면 다음 수를 바로 알려 주고, 아니면 지난 힌트 쪽지는 치운다
    if (mode) coach();
    else $('coach').hidden = true;
  },
});
view.setCube(cube);

// 개발 서버에서만. 브라우저 테스트가 손으로 돌린 것처럼 흉내 낼 수 있게 열어 둔다.
if (import.meta.env.DEV) window.cube = { view, solution: () => solution() };

/**
 * 맞추기 길. 2×2·3×3은 컴퓨터 풀이(shortest.js)로 가장 짧게 찾고, 지금까지 돌린 걸 되감는 게 더 짧으면 되감는다.
 * 다른 크기는 되감는다.
 */
function solution() {
  const back = simplify(invert(history), size);
  const short = solveShort(cube);
  return short && short.length < back.length ? short : back;
}

/** 컴퓨터 풀이 표(0.5초쯤)를 쉬는 틈에 미리 만들어 둔다 */
function warmShort() {
  if (size > 3) return;
  const idle = window.requestIdleCallback ?? ((f) => setTimeout(f, 400));
  idle(() => prepareShort(), { timeout: 4000 });
}

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
    sound.turn(true);
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
  route = null;
  timer.reset();
  view.setCube(cube);
  refresh();
}

$('smaller').addEventListener('click', () => setSize(size - 1));
$('bigger').addEventListener('click', () => setSize(size + 1));

$('scramble').addEventListener('click', async () => {
  if (busy()) return;
  stopCoach();
  timer.reset();
  const moves = scramble(size);
  await play(moves, Math.max(24, Math.min(65, 1300 / moves.length)));
  if (history.length) timer.arm();
  refresh();
  warmShort();
});

// ---- 힌트와 배우기 ----
// 3×3은 층별 풀이(solver.js)로 지금 단계와 다음 수를 짚는다. 2×2는 컴퓨터 최단 풀이(shortest.js)의 다음 수, 4×4부터는 섞은 수를 거꾸로 짚는다.
// mode: null(힌트만), { lesson: null }(처음부터 끝까지 따라 하기), { lesson: 0~6 }(그 단계만 연습)
let mode = null;
// 정해 둔 풀이 길(3×3). 힌트대로 돌리면 앞에서부터 하나씩 지우고, 다르게 돌리면 버린다.
// 한 수마다 처음부터 다시 풀면 새 길의 첫 수가 방금 돌린 걸 되돌려 제자리를 맴돌 수 있다
let route = null;
const mod4 = (t) => ((t % 4) + 4) % 4;

function follow(move) {
  if (!route || !route.length) return;
  const step = route[0];
  const m = step.move;
  const got = mod4(move.turns);
  const want = mod4(m.turns);
  if (m.axis !== move.axis || m.layer !== move.layer) route = null;
  else if (got === want) route.shift();
  else if (want === 2 && got % 2 === 1) {
    // 반 바퀴를 한 칸씩 나눠 돌렸다: 같은 쪽으로 한 칸이 남는다
    m.turns = got === 1 ? 1 : -1;
    step.k = step.f % 2 === 0 ? -m.turns : m.turns;
    step.text = notation([step.f, step.k]);
  } else route = null;
}

// 받침에 따라 붙는 말: 이에요/예요, 을/를
const hasCoda = (word) => {
  const c = word.trim().slice(-1).charCodeAt(0);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
};
const ieyo = (w) => `${w}${hasCoda(w) ? '이에요' : '예요'}`;
const eul = (w) => `${w}${hasCoda(w) ? '을' : '를'}`;

// 아래 두 단계는 아랫면을 만드니 아래에서 올려다보고, 그 뒤로는 위에서 내려다본다
function lookFor(stage) {
  view.tilt(stage <= 1 ? -0.45 : 0.45);
}

function coachCard({ title, next = '', sym = '', alg = [], how = '', actions = [] }) {
  $('coach-stage').textContent = title;
  const nextEl = $('coach-next');
  nextEl.replaceChildren();
  if (next) {
    nextEl.append(next);
    if (sym) {
      const s = document.createElement('span');
      s.className = 'sym';
      s.textContent = sym;
      nextEl.append(s);
    }
  }
  const algEl = $('coach-alg');
  algEl.replaceChildren();
  alg.forEach((t, i) => {
    const el = document.createElement('span');
    el.className = i === 0 ? 'next' : 'rest';
    el.textContent = t;
    algEl.append(el, ' ');
  });
  $('coach-how').textContent = how;
  const act = $('coach-actions');
  act.replaceChildren();
  for (const { label, go, run } of actions) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    if (go) b.className = 'go';
    b.addEventListener('click', run);
    act.append(b);
  }
  $('coach').hidden = false;
}

function stopCoach() {
  mode = null;
  route = null;
  $('coach').hidden = true;
}

function coach() {
  if (history.length === 0) {
    const finished = mode !== null;
    route = null;
    mode = null;
    coachCard({
      title: '다 맞췄어요!',
      how: finished ? '일곱 단계를 모두 해냈어요. 메뉴의 배우기에서 다른 단계도 연습해 보세요.' : '',
      actions: [{ label: '닫기', run: stopCoach }],
    });
    return;
  }
  timer.hinted = true;
  if (size !== 3) {
    const [next] = size === 2 ? solution() : simplify(invert(history), size);
    if (!next) return;
    const how = size === 2
      ? '2×2는 컴퓨터가 찾은 가장 짧은 길의 다음 수를 짚어 줘요. 들썩이는 줄을 그쪽으로 돌리세요.'
      : '4×4부터는 섞은 수를 거꾸로 짚어 줘요. 들썩이는 줄을 그쪽으로 돌리세요.';
    coachCard({ title: '다음 한 수', next: view.describe(next), how });
    view.nudge(next);
    return;
  }
  const prog = progress(cube);
  const lesson = mode?.lesson ?? null;
  if (lesson !== null && prog.stage > lesson) {
    // 이 단계 끝
    route = null;
    const last = lesson >= 6;
    coachCard({
      title: `${lesson + 1}단계 ${STAGES[lesson].name} 끝!`,
      how: last ? '마지막 단계까지 해냈어요.' : `잘했어요. 다음은 ${lesson + 2}단계 ${ieyo(STAGES[lesson + 1].name)}.`,
      actions: last ? [{ label: '닫기', run: stopCoach }] : [
        { label: '다음 단계', go: true, run: () => { mode = { lesson: lesson + 1 }; coach(); } },
        { label: '그만', run: stopCoach },
      ],
    });
    return;
  }
  if (!route || !route.length) {
    const limit = lesson ?? 6;
    route = (solveLBL(cube) ?? []).filter((s) => s.stage <= limit);
  }
  if (!route.length) return;
  const step = route[0];
  const stage = step.stage;
  const repair = lesson !== null && stage < lesson;
  if (mode && (mode.view ?? -1) !== (stage <= 1)) {
    mode.view = stage <= 1;
    lookFor(stage);
  }
  // 다음 면이 뒤에 숨어 있으면 큐브를 돌려 보여 준다
  view.see(step.move);
  const alg = [];
  for (const s of route) {
    if (s.stage !== stage || alg.length >= 12) break;
    alg.push(s.text);
  }
  coachCard({
    title: repair
      ? `앞 단계가 흐트러졌어요 · 먼저 ${stage + 1}단계 ${eul(STAGES[stage].name)} 되돌려요`
      : `${stage + 1}/7 ${STAGES[stage].name} · ${COUNTED[stage]} ${prog.counts[stage]}/4`,
    next: view.describe(step.move),
    sym: step.text,
    alg,
    how: STAGES[stage].how,
    actions: mode ? [{ label: '그만', run: stopCoach }] : [],
  });
  view.nudge(step.move);
}

$('hint').addEventListener('click', () => {
  if (busy() || history.length === 0) return;
  coach();
});

$('coach-close').addEventListener('click', stopCoach);

// 메뉴: 배우기, 기호, 공식
const guide = $('guide');
const menuButton = $('menu');
function openGuide(open) {
  guide.hidden = !open;
  menuButton.setAttribute('aria-expanded', String(open));
}
menuButton.addEventListener('click', () => openGuide(guide.hidden));
document.addEventListener('pointerdown', (e) => {
  if (!guide.hidden && !guide.contains(e.target) && !menuButton.contains(e.target)) openGuide(false);
}, true);
for (const name of ['learn', 'moves', 'algs']) {
  $(`tab-${name}`).addEventListener('click', () => {
    for (const other of ['learn', 'moves', 'algs']) {
      $(`tab-${other}`).setAttribute('aria-selected', String(other === name));
      $(`pane-${other}`).hidden = other !== name;
    }
  });
}
const ALGS = [
  '(경우마다 다름)',
  "R U R' U'  (맞을 때까지 되풀이)",
  "오른쪽으로: U R U' R' U' F' U F\n왼쪽으로:  U' L' U L U F U' F'",
  "F R U R' U' F'",
  "R U R' U R U2 R' U",
  "U R U' L' U R' U' L",
  "R' D' R D  (윗면 색이 위를 볼 때까지)",
];
const GOALS = [
  '아래 면에 같은 색 십자를 만들고, 십자 끝 모서리의 옆 색을 옆면 가운데 색과 맞춰요.',
  '아래 귀 넷을 채워 아래 면을 한 색으로 만들고, 첫 층 옆 줄도 맞춰요.',
  '가운데 층 모서리 넷을 넣어 아래 두 층을 끝내요.',
  '윗 모서리 넷의 윗면 색이 위를 보게 해 윗면에 십자를 만들어요.',
  '윗 모서리 넷의 옆 색을 옆면 가운데 색과 맞춰요.',
  '윗 귀 넷을 제자리로 옮겨요. 돌아가 있어도 괜찮아요.',
  '윗 귀를 돌려 윗면을 한 색으로 만들면 끝이에요.',
];
STAGES.forEach((stage, i) => {
  // 공식 판
  const item = document.createElement('div');
  item.className = 'guide-alg';
  const title = document.createElement('b');
  title.textContent = `${i + 1}. ${stage.name}`;
  const code = document.createElement('code');
  code.textContent = ALGS[i];
  const how = document.createElement('p');
  how.textContent = stage.how;
  item.append(title, code, how);
  $('pane-algs').append(item);
  // 배우기 판의 단계 연습
  const li = document.createElement('li');
  li.className = 'lesson';
  const name = document.createElement('b');
  name.textContent = `${i + 1}. ${stage.name}`;
  const goal = document.createElement('p');
  goal.textContent = GOALS[i];
  const formula = document.createElement('code');
  formula.textContent = ALGS[i].split('\n')[0];
  const go = document.createElement('button');
  go.type = 'button';
  go.textContent = '연습';
  go.addEventListener('click', () => startLesson(i));
  li.append(name, goal, formula, go);
  $('lessons').append(li);
});

/** 그 단계만 연습: 섞은 뒤 앞 단계까지는 맞춰 둔 큐브를 준비한다 */
function startLesson(k) {
  openGuide(false);
  if (busy()) return;
  if (size !== 3) setSize(3);
  timer.reset();
  route = null;
  // 섞고 앞 단계까지 맞춘다. 그 단계가 우연히 이미 끝나 있으면 다시 섞는다
  for (let tries = 0; tries < 20; tries++) {
    for (const m of scramble(3)) commit(m);
    if (k > 0) {
      for (const s of solveLBL(cube) ?? []) {
        if (s.stage >= k) break;
        commit(s.move);
      }
    }
    if (progress(cube).stage === k) break;
  }
  view.sync();
  refresh();
  mode = { lesson: k };
  coach();
}

$('practice').addEventListener('click', async () => {
  openGuide(false);
  if (busy()) return;
  if (size !== 3) setSize(3);
  route = null;
  timer.reset();
  const moves = scramble(3);
  await play(moves, Math.max(24, Math.min(65, 1300 / moves.length)));
  if (history.length) timer.arm();
  refresh();
  mode = { lesson: null };
  coach();
});

$('solve').addEventListener('click', async () => {
  if (busy() || history.length === 0) return;
  stopCoach();
  timer.reset();
  const moves = solution();
  await play(moves, Math.max(32, Math.min(95, 2400 / moves.length)));
  if (history.length === 0) view.celebrate(0.5);
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

// 테마 색으로 그린 작은 큐브. 위, 앞, 오른쪽 세 면이 보이고 몸통 색이 틈으로 비친다
function cubeIcon(theme) {
  const top = [[20, 3], [36, 12], [20, 21], [4, 12]];
  const front = [[4, 12], [20, 21], [20, 39], [4, 30]];
  const right = [[20, 21], [36, 12], [36, 30], [20, 39]];
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const at = ([p0, p1, p2, p3], u, v) => lerp(lerp(p0, p1, u), lerp(p3, p2, u), v);
  const pts = (list) => list.map((p) => p.map((x) => x.toFixed(2)).join(',')).join(' ');
  const face = (quad, color, shade) => {
    let cells = '';
    const g = 0.09;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const [u0, u1, v0, v1] = [(i + g) / 3, (i + 1 - g) / 3, (j + g) / 3, (j + 1 - g) / 3];
        cells += `<polygon points="${pts([at(quad, u0, v0), at(quad, u1, v0), at(quad, u1, v1), at(quad, u0, v1)])}" fill="${color}"/>`;
      }
    }
    return `<polygon points="${pts(quad)}" fill="${theme.body.color}"/>${cells}`
      + (shade ? `<polygon points="${pts(quad)}" fill="#000" opacity="${shade}"/>` : '');
  };
  return `<svg viewBox="0 0 40 42" aria-hidden="true">${face(top, theme.faces[2], 0)}${face(front, theme.faces[4], 0.12)}${face(right, theme.faces[0], 0.28)}</svg>`;
}

const palette = $('themes');
const themeButton = $('theme');
const chips = document.createElement('div');
chips.className = 'chips';
palette.append(chips);

const choices = [];
const sections = [];
// 칩을 눌러 내려간 무리. 목록 끝 쪽 무리는 맨 위까지 올라오지 못하니, 손으로 넘기기 전까지 그 칩을 켜 둔다
let pinned = null;
for (const group of GROUPS) {
  const section = document.createElement('section');
  section.className = 'group';
  section.setAttribute('role', 'group');
  section.setAttribute('aria-label', group.name);
  section.innerHTML = '<h3></h3><div class="grid"></div>';
  section.querySelector('h3').textContent = group.name;
  const grid = section.querySelector('.grid');
  for (const id of group.themes) {
    const theme = themeById(id);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pick';
    b.setAttribute('role', 'radio');
    b.innerHTML = `<span class="tile">${cubeIcon(theme)}</span><span class="name"></span>`;
    b.querySelector('.name').textContent = theme.name;
    b.querySelector('.tile').style.setProperty('--tile', theme.tile ?? theme.backdrop ?? theme.bg);
    b.addEventListener('click', () => useTheme(theme));
    grid.append(b);
    choices.push({ theme, b });
  }
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'chip';
  chip.textContent = group.name;
  chip.addEventListener('click', () => {
    pinned = sections.find((x) => x.chip === chip);
    palette.scrollTo({ top: section.offsetTop - chips.offsetHeight, behavior: 'smooth' });
    markChip();
  });
  chips.append(chip);
  palette.append(section);
  sections.push({ section, chip });
}

// 목록을 내리면 지금 보이는 무리의 칩이 켜진다
function markChip() {
  const y = palette.scrollTop + chips.offsetHeight + 12;
  let on = sections[0];
  for (const s of sections) if (s.section.offsetTop <= y) on = s;
  if (pinned) on = pinned;
  for (const s of sections) s.chip.classList.toggle('on', s === on);
  // scrollIntoView는 목록 전체도 움직여 칩을 눌러 내려가던 것을 끊어 버린다. 칩 줄만 옆으로 민다
  const c = on.chip;
  if (c.offsetLeft < chips.scrollLeft || c.offsetLeft + c.offsetWidth > chips.scrollLeft + chips.clientWidth) {
    chips.scrollTo({ left: c.offsetLeft - chips.clientWidth / 2 + c.offsetWidth / 2, behavior: 'smooth' });
  }
}
palette.addEventListener('scroll', markChip, { passive: true });
for (const type of ['wheel', 'touchstart', 'keydown']) {
  palette.addEventListener(type, () => { pinned = null; }, { passive: true });
}

function openPalette(open) {
  palette.hidden = !open;
  themeButton.setAttribute('aria-expanded', String(open));
  if (!open) return;
  pinned = null;
  // 열면 지금 테마가 보이게
  const current = choices.find(({ b }) => b.getAttribute('aria-checked') === 'true');
  if (current) {
    const section = current.b.closest('.group');
    palette.scrollTop = Math.max(0, section.offsetTop - chips.offsetHeight);
  }
  markChip();
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
  root.style.setProperty('--glow', theme.drift ?? 'none');
  root.style.setProperty('--timer-top', `${theme.timerTop ?? 18}px`);
  root.style.colorScheme = isDark(theme.bg) ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.bg);
  for (const { theme: t, b } of choices) b.setAttribute('aria-checked', String(t === theme));
  themeButton.querySelector('.dot').innerHTML = cubeIcon(theme);
  view.setTheme(theme);
  sound.setKit(theme.sound);
  store.set('cube.theme', theme.id);
}

// ---- 소리 ----

const soundButton = $('sound');
function showSound() {
  soundButton.setAttribute('aria-pressed', String(sound.on));
  soundButton.setAttribute('aria-label', sound.on ? '소리 끄기' : '소리 켜기');
  soundButton.classList.toggle('off', !sound.on);
}
soundButton.addEventListener('click', () => {
  sound.toggle();
  showSound();
});
showSound();

// 처음 오면 기기 설정을 따라 밝은 쪽/어두운 쪽을 고른다
const forced = document.documentElement.dataset.theme;
const prefersDark = forced ? forced === 'dark' : window.matchMedia?.('(prefers-color-scheme: dark)').matches;
useTheme(themeById(store.get('cube.theme')) ?? themeById(prefersDark ? 'neon' : 'classic'));
refresh();
