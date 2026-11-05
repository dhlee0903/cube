// 맞추기 단추가 쓰는 컴퓨터 풀이. 사람이 따라 하라고 만든 층별 풀이(solver.js)와 달리 수가 가장 적은 길을 찾는다.
//
// 3×3: 코시엠바(Kociemba)의 두 단계 풀이. 1단계는 모든 귀·모서리의 방향을 맞추고 가운데 층 모서리를 가운데 층에 모아
// U, D, R2, L2, F2, B2만으로 풀 수 있는 무리(G1)로 보내고, 2단계는 그 여섯 가지 회전만으로 다 맞춘다. 단계마다
// 좌표(방향·자리를 번호 하나로 접은 것)별 회전 표와, 그 좌표 쌍에서 목표까지 최소 몇 수인지 적은 가지치기 표를 미리
// 만들어 깊이를 늘려 가며 찾는다. 대개 20수 안팎이 나온다.
// 2×2: 귀만 있으니 DBL 귀를 붙박고 U, R, F만 돌려 가장 짧은 길(11수 이내)을 찾는다.
//
// 귀·모서리 번호와 면 순서는 코시엠바 관례를 따른다. 회전 표는 외워 둔 표가 아니라 앱의 큐브 모형에 실제로 면을
// 돌려 보고 읽어 내므로 앱의 회전 방향과 어긋날 일이 없다.
import { applyMove, createCube, facing, isSolved } from './cube.js';

// 코시엠바 면 차례 U R F D L B → 앱의 면 번호(0 R, 1 L, 2 U, 3 D, 4 F, 5 B)
const KF = [2, 0, 4, 3, 1, 5];
const [U, R, F, D, L, B] = KF;

// 귀 자리: URF UFL ULB UBR DFR DLF DBL DRB. 면은 시계 방향 차례(첫째가 위나 아래)
const CORNERS = [[U, R, F], [U, F, L], [U, L, B], [U, B, R], [D, F, R], [D, L, F], [D, B, L], [D, R, B]];
// 모서리 자리: UR UF UL UB DR DF DL DB FR FL BL BR. 첫째 면이 방향을 재는 기준
const EDGES = [[U, R], [U, F], [U, L], [U, B], [D, R], [D, F], [D, L], [D, B], [F, R], [F, L], [B, L], [B, R]];
const NORMAL = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

/** 면 f를 k(1 시계, -1 반시계, 2 반 바퀴)만큼 — 앱의 회전으로 (solver.js와 같은 규칙) */
const faceMove = (f, k, n) => {
  const axis = f >> 1;
  const plus = f % 2 === 0;
  return { axis, layer: plus ? n - 1 : 0, turns: k === 2 ? 2 : plus ? -k : k };
};

const slotPos = (faces, n) => [0, 1, 2].map((i) => faces.reduce((s, f) => s + NORMAL[f][i], 0) * (n - 1));
const same = (a, b) => a.length === b.length && a.every((v) => b.includes(v));

/**
 * 앱의 큐브를 조각 배열로 읽는다. colorFace[색] = 그 색이 가야 할 면.
 * cp[i]: 자리 i에 있는 귀 번호, co[i]: 그 귀의 위/아래 색이 자리의 몇 번째 면을 보는지. ep, eo는 모서리.
 */
function read(cube, colorFace, edges = true) {
  const n = cube.n;
  const at = new Map(cube.cubies.map((p) => [p.pos.join(','), p]));
  const cp = [];
  const co = [];
  CORNERS.forEach((slot, i) => {
    const p = at.get(slotPos(slot, n).join(','));
    const faces = p.stickers.map((s) => colorFace[s]);
    cp[i] = CORNERS.findIndex((c) => same(c, faces));
    const ud = p.stickers.find((s) => colorFace[s] === U || colorFace[s] === D);
    co[i] = slot.indexOf(facing(p, ud));
  });
  if (!edges) return { cp, co };
  const ep = [];
  const eo = [];
  EDGES.forEach((slot, i) => {
    const p = at.get(slotPos(slot, n).join(','));
    const faces = p.stickers.map((s) => colorFace[s]);
    const j = EDGES.findIndex((e) => same(e, faces));
    ep[i] = j;
    const first = p.stickers.find((s) => colorFace[s] === EDGES[j][0]);
    eo[i] = facing(p, first) === slot[0] ? 0 : 1;
  });
  return { cp, co, ep, eo };
}

/** a 다음에 b를 한 상태 */
function multiply(a, b) {
  const out = {
    cp: b.cp.map((c) => a.cp[c]),
    co: b.cp.map((c, i) => (a.co[c] + b.co[i]) % 3),
  };
  if (a.ep) {
    out.ep = b.ep.map((e) => a.ep[e]);
    out.eo = b.ep.map((e, i) => (a.eo[e] + b.eo[i]) % 2);
  }
  return out;
}

// ---- 번호 매기기 ----

const FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320];

function permRank(p) {
  let r = 0;
  for (let i = 0; i < p.length; i++) {
    let less = 0;
    for (let j = i + 1; j < p.length; j++) if (p[j] < p[i]) less++;
    r += less * FACT[p.length - 1 - i];
  }
  return r;
}

function permUnrank(r, n) {
  const left = [...Array(n).keys()];
  const p = [];
  for (let i = 0; i < n; i++) {
    const f = FACT[n - 1 - i];
    p.push(left.splice(Math.floor(r / f), 1)[0]);
    r %= f;
  }
  return p;
}

const twistOf = (co) => co.slice(0, 7).reduce((s, v) => s * 3 + v, 0);
function twistCo(t) {
  const co = new Array(8);
  let sum = 0;
  for (let i = 6; i >= 0; i--) { co[i] = t % 3; sum += co[i]; t = Math.floor(t / 3); }
  co[7] = (3 - (sum % 3)) % 3;
  return co;
}
const flipOf = (eo) => eo.slice(0, 11).reduce((s, v) => s * 2 + v, 0);
function flipEo(f) {
  const eo = new Array(12);
  let sum = 0;
  for (let i = 10; i >= 0; i--) { eo[i] = f & 1; sum += eo[i]; f >>= 1; }
  eo[11] = sum % 2;
  return eo;
}

// 가운데 층 모서리(8~11번) 넷이 열두 자리 가운데 어디에 있는지: 495가지
const SLICES = [];
for (let a = 0; a < 12; a++) for (let b = a + 1; b < 12; b++) for (let c = b + 1; c < 12; c++) for (let d = c + 1; d < 12; d++) SLICES.push([a, b, c, d]);
const SLICE_INDEX = new Map(SLICES.map((s, i) => [s.join(','), i]));
const sliceOf = (ep) => SLICE_INDEX.get(ep.map((e, i) => (e >= 8 ? i : -1)).filter((i) => i >= 0).join(','));

// ---- 표 ----

let T = null;

/** 좌표 둘(a, b)을 묶은 표에서 목표까지 몇 수인지 너비 우선으로 센다. 회전 k는 a 표의 colA[k]열, b 표의 colB[k]열 */
function bfs(nA, nB, moveA, strideA, moveB, strideB, colA, colB, a0, b0) {
  const size = nA * nB;
  const dist = new Int8Array(size).fill(-1);
  const qa = new Uint16Array(size);
  const qb = new Uint16Array(size);
  const k = colA.length;
  let head = 0;
  let tail = 1;
  dist[a0 * nB + b0] = 0;
  qa[0] = a0;
  qb[0] = b0;
  while (head < tail) {
    const a = qa[head];
    const b = qb[head++];
    const d = dist[a * nB + b] + 1;
    for (let m = 0; m < k; m++) {
      const a2 = moveA[a * strideA + colA[m]];
      const b2 = moveB[b * strideB + colB[m]];
      const i = a2 * nB + b2;
      if (dist[i] < 0) { dist[i] = d; qa[tail] = a2; qb[tail++] = b2; }
    }
  }
  return dist;
}

/** 면마다 한 번 돌린 열(base)만 채워 둔 표에서 두 번·세 번 돌린 열을 표를 거듭 밟아 채운다 */
function powers(table, rows, stride, base) {
  for (let r = 0; r < rows; r++) {
    for (const c of base) {
      const once = table[r * stride + c];
      const twice = table[once * stride + c];
      table[r * stride + c + 1] = twice;
      table[r * stride + c + 2] = table[twice * stride + c];
    }
  }
}

/** 표를 만든다(처음 한 번, 0.3초쯤) */
export function prepare() {
  if (T) return T;
  // 회전 18가지: 면 f(코시엠바 차례) × 1, 2, 3번
  const colorFace = [0, 1, 2, 3, 4, 5];
  const base = KF.map((f) => {
    const c = createCube(3);
    applyMove(c, faceMove(f, 1, 3));
    return read(c, colorFace);
  });
  const id = read(createCube(3), colorFace);
  const MOVES = [];
  for (let f = 0; f < 6; f++) {
    let s = id;
    for (let p = 1; p <= 3; p++) { s = multiply(s, base[f]); MOVES.push(s); }
  }
  const ONCE = [0, 3, 6, 9, 12, 15];
  const P2 = [0, 1, 2, 4, 7, 9, 10, 11, 13, 16]; // U U2 U' R2 F2 D D2 D' L2 B2

  const twistMove = new Uint16Array(2187 * 18);
  for (let t = 0; t < 2187; t++) {
    const co = twistCo(t);
    for (const m of ONCE) twistMove[t * 18 + m] = twistOf(MOVES[m].cp.map((c, i) => (co[c] + MOVES[m].co[i]) % 3));
  }
  powers(twistMove, 2187, 18, ONCE);
  const flipMove = new Uint16Array(2048 * 18);
  for (let f = 0; f < 2048; f++) {
    const eo = flipEo(f);
    for (const m of ONCE) flipMove[f * 18 + m] = flipOf(MOVES[m].ep.map((e, i) => (eo[e] + MOVES[m].eo[i]) % 2));
  }
  powers(flipMove, 2048, 18, ONCE);
  const sliceMove = new Uint16Array(495 * 18);
  SLICES.forEach((s, k) => {
    const ep = new Array(12).fill(0);
    s.forEach((i, j) => { ep[i] = 8 + j; });
    for (const m of ONCE) sliceMove[k * 18 + m] = sliceOf(MOVES[m].ep.map((e) => ep[e]));
  });
  powers(sliceMove, 495, 18, ONCE);
  const cpMove = new Uint16Array(40320 * 18);
  const tmp = new Array(8);
  for (let r = 0; r < 40320; r++) {
    const cp = permUnrank(r, 8);
    for (const m of ONCE) {
      const mc = MOVES[m].cp;
      for (let i = 0; i < 8; i++) tmp[i] = cp[mc[i]];
      cpMove[r * 18 + m] = permRank(tmp);
    }
  }
  powers(cpMove, 40320, 18, ONCE);
  // 2단계: 위·아래 층 모서리 여덟(0~7)의 자리와 가운데 층 모서리 넷(8~11)의 자리. 열은 P2 차례
  // U(0)와 D(5)는 한 번 돌린 것만 셈해 거듭 밟고, R2 F2 L2 B2(3, 4, 8, 9)는 바로 셈한다
  const udMove = new Uint16Array(40320 * 10);
  for (let r = 0; r < 40320; r++) {
    const ep = permUnrank(r, 8);
    for (const j of [0, 5, 3, 4, 8, 9]) {
      const me = MOVES[P2[j]].ep;
      for (let i = 0; i < 8; i++) tmp[i] = ep[me[i]];
      udMove[r * 10 + j] = permRank(tmp);
    }
  }
  powers(udMove, 40320, 10, [0, 5]);
  const spMove = new Uint8Array(24 * 10);
  for (let r = 0; r < 24; r++) {
    const ep = permUnrank(r, 4);
    P2.forEach((m, j) => { spMove[r * 10 + j] = permRank(MOVES[m].ep.slice(8).map((e) => ep[e - 8])); });
  }

  const SLICE0 = sliceOf(id.ep);
  const all = Int32Array.from({ length: 18 }, (_, i) => i);
  const ten = Int32Array.from({ length: 10 }, (_, i) => i);
  const p2 = Int32Array.from(P2);
  // 1단계: (가운데 층 자리, 귀 방향), (가운데 층 자리, 모서리 방향)
  const pTwist = bfs(495, 2187, sliceMove, 18, twistMove, 18, all, all, SLICE0, 0);
  const pFlip = bfs(495, 2048, sliceMove, 18, flipMove, 18, all, all, SLICE0, 0);
  // 2단계: (가운데 층 순서, 귀 자리), (가운데 층 순서, 위·아래 모서리 자리)
  const pCorner = bfs(24, 40320, spMove, 10, cpMove, 18, ten, p2, 0, 0);
  const pEdge = bfs(24, 40320, spMove, 10, udMove, 10, ten, ten, 0, 0);
  // 2×2: 귀 자리와 귀 방향만, U R F 아홉 가지 회전
  const nine = Int32Array.from({ length: 9 }, (_, i) => i);
  const zero = new Uint16Array(18);
  const pCp = bfs(1, 40320, zero, 0, cpMove, 18, nine, nine, 0, 0);
  const pCo = bfs(1, 2187, zero, 0, twistMove, 18, nine, nine, 0, 0);

  T = { MOVES, P2, twistMove, flipMove, sliceMove, cpMove, udMove, spMove, SLICE0, pTwist, pFlip, pCorner, pEdge, pCp, pCo };
  return T;
}

// 같은 면을 잇달아 돌리지 않고, 마주 보는 면은 한 차례(U 다음 D)로만 센다
const skip = (face, last) => last >= 0 && (face === last || (face % 3 === last % 3 && face < last));

/** 3×3 두 단계 풀이. 돌려주는 값: 코시엠바 회전 번호(면*3 + 횟수-1) 목록 */
function twoPhase(state, { target = 20, ms = 120 } = {}) {
  const t = prepare();
  const started = performance.now();
  const seq = [];
  let best = null;
  let limit = 23;
  let nodes = 0;
  let stop = false;

  const phase2 = (cp, ud, sp, togo, last, depth) => {
    if (togo === 0) return cp === 0 && ud === 0 && sp === 0;
    for (let j = 0; j < 10; j++) {
      const m = t.P2[j];
      const face = (m / 3) | 0;
      if (skip(face, last)) continue;
      const cp2 = t.cpMove[cp * 18 + m];
      const sp2 = t.spMove[sp * 10 + j];
      if (t.pCorner[sp2 * 40320 + cp2] >= togo) continue;
      const ud2 = t.udMove[ud * 10 + j];
      if (t.pEdge[sp2 * 40320 + ud2] >= togo) continue;
      seq[depth] = m;
      if (phase2(cp2, ud2, sp2, togo - 1, face, depth + 1)) return true;
    }
    return false;
  };

  const startPhase2 = (depth) => {
    let s = state;
    for (let i = 0; i < depth; i++) s = multiply(s, t.MOVES[seq[i]]);
    const cp = permRank(s.cp);
    const ud = permRank(s.ep.slice(0, 8));
    const sp = permRank(s.ep.slice(8).map((e) => e - 8));
    const h = Math.max(t.pCorner[sp * 40320 + cp], t.pEdge[sp * 40320 + ud]);
    const last = depth ? (seq[depth - 1] / 3) | 0 : -1;
    for (let d2 = h; depth + d2 <= limit; d2++) {
      if (phase2(cp, ud, sp, d2, last, depth)) {
        best = seq.slice(0, depth + d2);
        limit = best.length - 1;
        return best.length <= target;
      }
    }
    return false;
  };

  const phase1 = (tw, fl, sl, togo, last, depth) => {
    if (togo === 0) return startPhase2(depth);
    if ((++nodes & 1023) === 0 && best && performance.now() - started > ms) { stop = true; return true; }
    for (let m = 0; m < 18; m++) {
      const face = (m / 3) | 0;
      if (skip(face, last)) continue;
      // 1단계의 마지막 수가 G1 안의 회전이면 더 짧은 1단계가 이미 있었으니 건너뛴다
      if (togo === 1 && t.P2.includes(m)) continue;
      const tw2 = t.twistMove[tw * 18 + m];
      const sl2 = t.sliceMove[sl * 18 + m];
      if (t.pTwist[sl2 * 2187 + tw2] >= togo) continue;
      const fl2 = t.flipMove[fl * 18 + m];
      if (t.pFlip[sl2 * 2048 + fl2] >= togo) continue;
      seq[depth] = m;
      if (phase1(tw2, fl2, sl2, togo - 1, face, depth + 1)) return true;
    }
    return false;
  };

  const tw = twistOf(state.co);
  const fl = flipOf(state.eo);
  const sl = sliceOf(state.ep);
  const h1 = Math.max(t.pTwist[sl * 2187 + tw], t.pFlip[sl * 2048 + fl]);
  if (h1 === 0 && startPhase2(0)) return best;
  for (let d1 = Math.max(1, h1); d1 <= limit && !stop; d1++) {
    if (phase1(tw, fl, sl, d1, -1, 0)) break;
  }
  return best;
}

/** 2×2 가장 짧은 풀이(U R F만) */
function corners2(state) {
  const t = prepare();
  let cp = permRank(state.cp);
  let tw = twistOf(state.co);
  const seq = [];
  const dfs = (cp, tw, togo, last, depth) => {
    if (togo === 0) return cp === 0 && tw === 0;
    for (let m = 0; m < 9; m++) {
      const face = (m / 3) | 0;
      if (face === last) continue;
      const cp2 = t.cpMove[cp * 18 + m];
      if (t.pCp[cp2] >= togo) continue;
      const tw2 = t.twistMove[tw * 18 + m];
      if (t.pCo[tw2] >= togo) continue;
      seq[depth] = m;
      if (dfs(cp2, tw2, togo - 1, face, depth + 1)) return true;
    }
    return false;
  };
  for (let d = Math.max(t.pCp[cp], t.pCo[tw]); d <= 14; d++) if (dfs(cp, tw, d, -1, 0)) return seq.slice(0, d);
  return null;
}

/**
 * 지금 큐브를 가장 짧게(3×3은 거의 가장 짧게) 맞추는 앱 회전 목록. 2×2와 3×3만 되고, 다른 크기는 null.
 * 3×3은 가운데 조각 색을 기준으로 맞춘다(가운데 층을 돌렸어도 된다).
 */
export function solveShort(cube, opts) {
  const n = cube.n;
  if (n !== 2 && n !== 3) return null;
  if (isSolved(cube)) return [];
  const colorFace = new Array(6);
  if (n === 3) {
    for (const p of cube.cubies) if (p.stickers.length === 1) colorFace[p.stickers[0]] = facing(p, p.stickers[0]);
  } else {
    // 2×2는 가운데가 없으니 DBL 귀를 붙박고 그 색으로 아래·뒤·왼쪽을 정한다. 마주 보는 색은 번호가 짝(0↔1, 2↔3, 4↔5)
    const dbl = cube.cubies.find((p) => p.pos.every((v) => v < 0));
    for (const s of dbl.stickers) { colorFace[s] = facing(dbl, s); colorFace[s ^ 1] = facing(dbl, s) ^ 1; }
  }
  const state = read(cube, colorFace, n === 3);
  const seq = n === 3 ? twoPhase(state, opts) : corners2(state);
  if (!seq) return null;
  return seq.map((m) => {
    const p = (m % 3) + 1;
    return faceMove(KF[(m / 3) | 0], p === 3 ? -1 : p, n);
  });
}

// 시험용
export const _internal = { read, multiply, KF };
