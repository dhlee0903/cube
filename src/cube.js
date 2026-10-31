// 큐브 상태. 화면과 상관없이 조각의 위치와 방향만 들고 있다.
//
// 좌표는 두 배로 잡는다. 3×3이면 -2, 0, 2이고 4×4면 -3, -1, 1, 3.
// 이렇게 하면 짝수 크기에서도 전부 정수로 떨어진다.
//
// 면 번호: 0 R(+x)  1 L(-x)  2 U(+y)  3 D(-y)  4 F(+z)  5 B(-z)
// 회전은 오른손 법칙. 축의 + 쪽에서 바라볼 때 반시계가 turns = 1.

export const MIN_SIZE = 2;
export const MAX_SIZE = 7;

export const FACES = [
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
];

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

const QUARTER = [
  [1, 0, 0, 0, 0, -1, 0, 1, 0],
  [0, 0, 1, 0, 1, 0, -1, 0, 0],
  [0, -1, 0, 1, 0, 0, 0, 0, 1],
];

const mul = (a, b) => {
  const out = new Array(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
  }
  return out;
};

const apply = (m, v) => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];

const faceOf = (v) => {
  if (v[0]) return v[0] > 0 ? 0 : 1;
  if (v[1]) return v[1] > 0 ? 2 : 3;
  return v[2] > 0 ? 4 : 5;
};

const mod4 = (t) => ((t % 4) + 4) % 4;

function turnMatrix(axis, turns) {
  let m = IDENTITY;
  for (let i = 0; i < mod4(turns); i++) m = mul(QUARTER[axis], m);
  return m;
}

export function createCube(n) {
  const max = n - 1;
  const cubies = [];
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) {
      for (let z = 0; z < n; z++) {
        const pos = [2 * x - max, 2 * y - max, 2 * z - max];
        // 속에 있는 조각은 보이지도 않고 움직여도 티가 안 난다.
        if (!pos.some((c) => Math.abs(c) === max)) continue;
        const stickers = [];
        for (let a = 0; a < 3; a++) {
          if (pos[a] === max) stickers.push(a * 2);
          if (pos[a] === -max) stickers.push(a * 2 + 1);
        }
        cubies.push({ pos, rot: IDENTITY, stickers });
      }
    }
  }
  return { n, cubies };
}

/** 축 위 좌표(두 배 값)가 몇 번째 층인지. 0이 - 쪽 끝이다. */
export const layerOf = (n, coord) => (coord + n - 1) / 2;

export function applyMove(cube, { axis, layer, turns }) {
  const t = mod4(turns);
  if (!t) return;
  const coord = 2 * layer - (cube.n - 1);
  const m = turnMatrix(axis, t);
  for (const piece of cube.cubies) {
    if (piece.pos[axis] !== coord) continue;
    piece.pos = apply(m, piece.pos);
    piece.rot = mul(m, piece.rot);
  }
}

/** 조각의 스티커 하나가 지금 어느 면을 보고 있는지. */
export const facing = (piece, sticker) => faceOf(apply(piece.rot, FACES[sticker]));

export function isSolved(cube) {
  const seen = [-1, -1, -1, -1, -1, -1];
  for (const piece of cube.cubies) {
    for (const sticker of piece.stickers) {
      const face = facing(piece, sticker);
      if (seen[face] === -1) seen[face] = sticker;
      else if (seen[face] !== sticker) return false;
    }
  }
  return true;
}

export const invert = (moves) => moves
  .slice()
  .reverse()
  .map(({ axis, layer, turns }) => ({ axis, layer, turns: mod4(-turns) }));

/**
 * 같은 축끼리 붙어 있는 회전은 서로 순서를 바꿔도 결과가 같다.
 * 그 묶음 안에서 층별로 합쳐 0이 되는 것은 지우고, 묶음이 통째로 사라지면
 * 앞뒤 묶음이 다시 붙을 수 있으니 그것까지 이어서 합친다.
 */
export function simplify(moves, n) {
  const groups = [];
  for (const { axis, layer, turns } of moves) {
    let top = groups[groups.length - 1];
    if (!top || top.axis !== axis) {
      top = { axis, turns: new Array(n).fill(0) };
      groups.push(top);
    }
    top.turns[layer] = mod4(top.turns[layer] + turns);
    if (top.turns.every((t) => t === 0)) groups.pop();
  }
  const out = [];
  for (const { axis, turns } of groups) {
    turns.forEach((t, layer) => {
      if (t) out.push({ axis, layer, turns: t });
    });
  }
  return out;
}

export const scrambleLength = (n) => ({ 2: 11, 3: 22, 4: 40, 5: 60, 6: 80, 7: 100 })[n] ?? n * 14;

export function scramble(n, random = Math.random) {
  // 홀수 크기의 가운데 층은 돌려 봐야 큐브 전체를 돌린 것과 같다.
  const layers = [];
  for (let i = 0; i < n; i++) {
    if (n % 2 === 1 && i === (n - 1) / 2) continue;
    layers.push(i);
  }
  const moves = [];
  let last = -1;
  for (let i = 0; i < scrambleLength(n); i++) {
    let axis;
    do axis = Math.floor(random() * 3); while (axis === last);
    last = axis;
    moves.push({
      axis,
      layer: layers[Math.floor(random() * layers.length)],
      turns: 1 + Math.floor(random() * 3),
    });
  }
  return moves;
}

/** 같은 축이 이어지는 회전을 한 번에 돌릴 수 있게 묶는다. */
export function steps(moves) {
  const out = [];
  for (const move of moves) {
    const last = out[out.length - 1];
    if (last && last[0].axis === move.axis && !last.some((m) => m.layer === move.layer)) last.push(move);
    else out.push([move]);
  }
  return out;
}
