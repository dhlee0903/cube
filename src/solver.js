// 3×3을 사람이 배우는 층별 풀이(초보자 공식)로 푼다. 힌트와 공식 안내가 쓴다.
//
// 아래(D) 면을 첫 층으로 잡고, 윗(U) 면을 마지막 층으로 맞춘다. 단계마다 교과서 공식을 그대로 쓴다.
//   1 아래 십자          아래 면 모서리 넷을 제자리에
//   2 첫 층 모서리       아래 귀 넷을 R U R' U' 되풀이로
//   3 가운데 층          U R U' R' U' F' U F / U' L' U L U F U' F'
//   4 윗면 십자          F R U R' U' F'
//   5 윗 모서리 맞추기   R U R' U R U2 R' U
//   6 윗 귀 자리         U R U' L' U R' U' L
//   7 윗 귀 돌리기       R' D' R D 되풀이
// 면 색은 지금 가운데 조각 색을 따른다(가운데 층을 돌려 섞었어도 된다). 면 기호는 큐브 축에 붙어 있다:
// R 오른쪽(+x) L 왼쪽 U 위 D 아래 F 앞(+z) B 뒤. 각 면을 그 면 쪽에서 바라볼 때 시계 방향이 기본, '는 반대, 2는 반 바퀴.
import { applyMove, facing, isSolved } from './cube.js';

const NAMES = ['R', 'L', 'U', 'D', 'F', 'B'];
const U = 2;
const D = 3;
const SIDES = [4, 0, 5, 1]; // 앞, 오른쪽, 뒤, 왼쪽(위에서 봤을 때 시계 방향 차례)
const RIGHT = { 4: 0, 0: 5, 5: 1, 1: 4 };
const LEFT = { 0: 4, 5: 0, 1: 5, 4: 1 };
const NORMAL = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

export const STAGES = [
  { name: '아래 십자', how: '아래 면 모서리 넷을 제자리로 옮긴다. 옆 색이 그 면 가운데와 맞아야 한다.' },
  { name: '첫 층 모서리', how: "귀를 제자리 위로 옮기고, 맞을 때까지 R U R' U'를 되풀이한다." },
  { name: '가운데 층', how: "모서리를 같은 색 면 앞으로 돌려 오른쪽이면 U R U' R' U' F' U F, 왼쪽이면 U' L' U L U F U' F'." },
  { name: '윗면 십자', how: "윗면에 십자가 생길 때까지 F R U R' U' F'. ㄱ자는 왼쪽 위에, 일자는 가로로 두고 한다." },
  { name: '윗 모서리 맞추기', how: "옆 색이 맞은 두 모서리를 뒤와 오른쪽에 두고 R U R' U R U2 R' U." },
  { name: '윗 귀 자리', how: "자리가 맞은 귀를 오른쪽 앞에 두고 U R U' L' U R' U' L." },
  { name: '윗 귀 돌리기', how: "오른쪽 앞 위 귀를 R' D' R D 되풀이로 돌리고, U로 다음 귀를 가져온다. 끝나면 아래층도 돌아온다." },
];

/** 면 f를 k(1 시계, -1 반시계, 2 반 바퀴)만큼 — 앱의 회전으로 */
export function faceMove(f, k, n = 3) {
  const axis = f >> 1;
  const plus = f % 2 === 0;
  return { axis, layer: plus ? n - 1 : 0, turns: k === 2 ? 2 : plus ? -k : k };
}

/** 기호(앞=front 기준)를 [면, k] 목록으로. front가 오른쪽 면이면 R은 그 면의 오른쪽 이웃 */
function parse(alg, front = 4) {
  const map = { F: front, R: RIGHT[front], L: LEFT[front], B: front ^ 1, U, D };
  return alg.trim().split(/\s+/).filter(Boolean).map((tok) => [map[tok[0]], tok.endsWith("'") ? -1 : tok.endsWith('2') ? 2 : 1]);
}

const clone = (cube) => ({ n: cube.n, cubies: cube.cubies.map((p) => ({ pos: [...p.pos], rot: [...p.rot], stickers: p.stickers })) });

export function notation([f, k]) {
  return NAMES[f] + (k === 2 ? '2' : k === -1 ? "'" : '');
}

class Plan {
  constructor(cube) {
    this.cube = clone(cube);
    this.steps = [];
    this.stage = 0;
    // 면마다 맞출 색 = 지금 가운데 조각 색
    this.tgt = new Array(6);
    for (const p of this.cube.cubies) if (p.stickers.length === 1) this.tgt[facing(p, p.stickers[0])] = p.stickers[0];
  }

  do(moves) {
    for (const [f, k] of moves) {
      applyMove(this.cube, faceMove(f, k));
      const last = this.steps[this.steps.length - 1];
      // 같은 면이 이어지면 하나로 합친다(맞추기 아니라 보여 주기용이니 단계를 넘지는 않는다)
      if (last && last.stage === this.stage && last.f === f) {
        const t = (((last.k === -1 ? 3 : last.k) + (k === -1 ? 3 : k)) % 4);
        if (t === 0) this.steps.pop();
        else last.k = t === 3 ? -1 : t;
      } else this.steps.push({ stage: this.stage, f, k });
    }
  }

  alg(text, front) {
    this.do(parse(text, front));
  }

  /** 색 묶음(스티커 번호들)을 가진 조각 */
  piece(colors) {
    return this.cube.cubies.find((p) => p.stickers.length === colors.length && colors.every((c) => p.stickers.includes(c)));
  }

  where(piece, color) {
    return facing(piece, color);
  }

  edgeSolved(a, b) {
    const p = this.piece([this.tgt[a], this.tgt[b]]);
    return this.where(p, this.tgt[a]) === a && this.where(p, this.tgt[b]) === b;
  }

  cornerSolved(a, b, c) {
    const p = this.piece([this.tgt[a], this.tgt[b], this.tgt[c]]);
    return this.where(p, this.tgt[a]) === a && this.where(p, this.tgt[b]) === b && this.where(p, this.tgt[c]) === c;
  }

  /** 짧은 찾기: macros(각각 [면,k] 목록) 가운데 depth개 이내로 goal을 만족하는 차례를 찾아 실행. 같은 면 묶음은 잇달아 쓰지 않는다 */
  search(macros, depth, goal) {
    const run = (m, sign) => {
      const list = sign > 0 ? m : [...m].reverse();
      for (const [f, k] of list) applyMove(this.cube, faceMove(f, sign > 0 ? k : k === 2 ? 2 : -k));
    };
    const tryDepth = (d, seq, lastFace) => {
      if (goal()) return seq;
      if (d === 0) return null;
      for (const m of macros) {
        if (m.length === 1 && m[0][0] === lastFace) continue;
        run(m, 1);
        const r = tryDepth(d - 1, [...seq, m], m.length === 1 ? m[0][0] : -1);
        run(m, -1);
        if (r) return r;
      }
      return null;
    };
    for (let d = 0; d <= depth; d++) {
      const seq = tryDepth(d, [], -1);
      if (seq) {
        for (const m of seq) this.do(m);
        return true;
      }
    }
    return false;
  }

  cross() {
    this.stage = 0;
    const done = [];
    for (const X of SIDES) {
      const keep = () => done.every((s) => this.edgeSolved(D, s));
      const solved = () => this.edgeSolved(D, X) && keep();
      if (solved()) { done.push(X); continue; }
      const e = this.piece([this.tgt[D], this.tgt[X]]);
      const fD = this.where(e, this.tgt[D]);
      const fX = this.where(e, this.tgt[X]);
      if (e.pos[1] < 0) {
        // 아래층에 잘못 있으면 그 옆면을 반 바퀴 돌려 위로 올린다
        this.do([[fD === D ? fX : fD, 2]]);
      } else if (e.pos[1] === 0) {
        // 가운데 층이면 그 면을 돌려 위로 올리고, 위를 비켜 놓고, 되돌린다
        const S = fD;
        for (const k of [1, -1]) {
          const snap = clone(this.cube);
          applyMove(this.cube, faceMove(S, k));
          const up = this.piece([this.tgt[D], this.tgt[X]]).pos[1] > 0;
          this.cube = snap;
          if (up) { this.do([[S, k], [U, 1], [S, -k]]); break; }
        }
      }
      // 이제 위층: 제자리 위로 돌린다
      for (let i = 0; i < 4; i++) {
        const p = this.piece([this.tgt[D], this.tgt[X]]);
        if (this.where(p, this.tgt[D]) === X || this.where(p, this.tgt[X]) === X) break;
        this.do([[U, 1]]);
      }
      // 아래 색이 위를 보면 반 바퀴로 넣고, 옆을 보면 짧게 찾아 넣는다
      if (this.where(this.piece([this.tgt[D], this.tgt[X]]), this.tgt[D]) === U) this.do([[X, 2]]);
      const sides = (f) => [[[f, 1]], [[f, -1]], [[f, 2]]];
      if (!solved()) this.search([...sides(U), ...sides(X), ...sides(RIGHT[X]), ...sides(LEFT[X])], 4, solved);
      done.push(X);
    }
  }

  corners() {
    this.stage = 1;
    const done = [];
    for (const X of SIDES) {
      const R = RIGHT[X];
      const slot = [0, 1, 2].map((i) => 2 * (NORMAL[X][i] + NORMAL[R][i] + NORMAL[D][i]));
      const colors = [this.tgt[D], this.tgt[X], this.tgt[R]];
      const solved = () => this.cornerSolved(D, X, R);
      if (solved()) { done.push(X); continue; }
      let c = this.piece(colors);
      if (c.pos[1] < 0) {
        // 다른 칸(또는 제자리에 비틀려) 아래층에 있으면 R U R'로 꺼낸다
        const fronts = SIDES.filter((A) => {
          const s = [0, 1, 2].map((i) => 2 * (NORMAL[A][i] + NORMAL[RIGHT[A]][i] + NORMAL[D][i]));
          return s.every((v, i) => v === c.pos[i]);
        });
        this.alg("R U R'", fronts[0]);
      }
      // 제자리 바로 위로
      for (let i = 0; i < 4; i++) {
        c = this.piece(colors);
        if (c.pos[0] === slot[0] && c.pos[2] === slot[2]) break;
        this.do([[U, 1]]);
      }
      for (let i = 0; i < 6 && !solved(); i++) this.alg("R U R' U'", X);
      done.push(X);
    }
  }

  middle() {
    this.stage = 2;
    const right = (A) => this.edgeSolved(A, RIGHT[A]);
    for (let guard = 0; guard < 12; guard++) {
      if (SIDES.every(right)) return;
      // 위층에서 윗면 색이 없는 모서리를 찾는다
      const up = this.cube.cubies.find((p) => p.stickers.length === 2 && p.pos[1] > 0 && !p.stickers.includes(this.tgt[U]));
      if (up) {
        const [a, b] = up.stickers;
        // 옆을 보는 색과 위를 보는 색
        const side = this.where(up, a) === U ? b : a;
        const top = side === a ? b : a;
        for (let i = 0; i < 4; i++) {
          const p = this.piece([a, b]);
          if (this.tgt[this.where(p, side)] === side) break;
          this.do([[U, 1]]);
        }
        const front = this.where(this.piece([a, b]), side);
        if (this.tgt[RIGHT[front]] === top) this.alg("U R U' R' U' F' U F", front);
        else this.alg("U' L' U L U F U' F'", front);
      } else {
        // 위층엔 없는데 가운데 층에 틀린 게 있으면 아무 모서리나 넣어 꺼낸다
        const A = SIDES.find((s) => !right(s));
        this.alg("U R U' R' U' F' U F", A);
      }
    }
  }

  topCross() {
    this.stage = 3;
    const oriented = () => this.cube.cubies.filter((p) => p.stickers.length === 2 && p.pos[1] > 0 && this.where(p, this.tgt[U]) === U).length === 4;
    const macros = [[[U, 1]], [[U, -1]], [[U, 2]], ...SIDES.map((f) => parse("F R U R' U' F'", f))];
    this.search(macros, 4, oriented);
  }

  topEdges() {
    this.stage = 4;
    const matched = () => SIDES.every((s) => this.edgeSolved(U, s));
    const macros = [[[U, 1]], [[U, -1]], [[U, 2]], ...SIDES.map((f) => parse("R U R' U R U2 R' U", f))];
    this.search(macros, 4, matched);
  }

  topCornersPlace() {
    this.stage = 5;
    const placed = () => SIDES.every((X) => {
      const R = RIGHT[X];
      const slot = [0, 1, 2].map((i) => 2 * (NORMAL[X][i] + NORMAL[R][i] + NORMAL[U][i]));
      const p = this.piece([this.tgt[U], this.tgt[X], this.tgt[R]]);
      return p.pos.every((v, i) => v === slot[i]);
    });
    const macros = SIDES.map((f) => parse("U R U' L' U R' U' L", f));
    this.search(macros, 3, placed);
  }

  topCornersTwist() {
    this.stage = 6;
    // 오른쪽 앞 위 귀를 R' D' R D로 돌리고, U로 다음 귀를 가져온다
    const ufr = [2, 2, 2];
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 6; j++) {
        const p = this.cube.cubies.find((c) => c.pos.every((v, a) => v === ufr[a]));
        if (this.where(p, this.tgt[U]) === U) break;
        this.alg("R' D' R D", 4);
      }
      this.do([[U, 1]]);
    }
    for (let i = 0; i < 4 && !isSolved(this.cube); i++) this.do([[U, 1]]);
  }
}

/**
 * 지금 큐브를 층별 풀이로 푼 차례. 3×3만 된다.
 * 돌려주는 값: [{ stage(0~6), f, k, move(앱 회전), text(기호) }]
 */
export function solveLBL(cube) {
  if (cube.n !== 3 || isSolved(cube)) return [];
  const plan = new Plan(cube);
  plan.cross();
  plan.corners();
  plan.middle();
  plan.topCross();
  plan.topEdges();
  plan.topCornersPlace();
  plan.topCornersTwist();
  if (!isSolved(plan.cube)) return null;
  return plan.steps.map((s) => ({ ...s, move: faceMove(s.f, s.k), text: notation([s.f, s.k]) }));
}
