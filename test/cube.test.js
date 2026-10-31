import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SIZE, MIN_SIZE, applyMove, createCube, facing, invert, isSolved, scramble, simplify, steps,
} from '../src/cube.js';

// 매번 같은 수열이 나오는 난수
const seeded = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const run = (cube, moves) => {
  for (const m of moves) applyMove(cube, m);
  return cube;
};

const snapshot = (cube) => cube.cubies.map((p) => `${p.pos}|${p.stickers.map((s) => facing(p, s))}`).join(';');

const sizes = [];
for (let n = MIN_SIZE; n <= MAX_SIZE; n++) sizes.push(n);

test('겉에 있는 조각만 만든다', () => {
  assert.equal(createCube(2).cubies.length, 8);
  assert.equal(createCube(3).cubies.length, 26);
  assert.equal(createCube(4).cubies.length, 56);
  assert.equal(createCube(5).cubies.length, 98);
});

test('스티커 수는 6n²', () => {
  for (const n of sizes) {
    const count = createCube(n).cubies.reduce((sum, p) => sum + p.stickers.length, 0);
    assert.equal(count, 6 * n * n);
  }
});

test('처음 상태는 맞춰져 있다', () => {
  for (const n of sizes) assert.ok(isSolved(createCube(n)));
});

test('한 층을 네 번 돌리면 제자리', () => {
  for (const n of sizes) {
    for (let axis = 0; axis < 3; axis++) {
      for (let layer = 0; layer < n; layer++) {
        const cube = createCube(n);
        applyMove(cube, { axis, layer, turns: 1 });
        if (layer !== (n - 1) / 2) assert.ok(!isSolved(cube));
        run(cube, [1, 2, 3].map(() => ({ axis, layer, turns: 1 })));
        assert.ok(isSolved(cube));
      }
    }
  }
});

test('R을 돌리면 F 오른쪽 줄이 U로 간다', () => {
  // R은 오른쪽에서 볼 때 시계 방향이라 x축 기준 -90도(turns 3)다.
  // 앞(+z)에 있던 것이 위(+y)로 올라가야 한다.
  const cube = createCube(3);
  applyMove(cube, { axis: 0, layer: 2, turns: 3 });
  const piece = cube.cubies.find((p) => p.pos.join() === '2,2,0');
  assert.ok(piece);
  assert.ok(piece.stickers.includes(4));
  assert.equal(facing(piece, 4), 2);
});

test('가운데 층만 돌려도 면마다 색은 섞인다', () => {
  const cube = createCube(3);
  applyMove(cube, { axis: 1, layer: 1, turns: 1 });
  assert.ok(!isSolved(cube));
});

test('큐브 전체를 돌린 것은 맞춘 것으로 본다', () => {
  for (const n of sizes) {
    const cube = createCube(n);
    for (let layer = 0; layer < n; layer++) applyMove(cube, { axis: 2, layer, turns: 1 });
    assert.ok(isSolved(cube));
  }
});

test('섞은 것을 거꾸로 되돌리면 맞춰진다', () => {
  for (const n of sizes) {
    const random = seeded(n * 31);
    const moves = scramble(n, random);
    const cube = run(createCube(n), moves);
    assert.ok(!isSolved(cube), `${n}×${n}가 섞이지 않았다`);
    run(cube, invert(moves));
    assert.ok(isSolved(cube));
  }
});

test('섞기는 홀수 크기의 가운데 층을 건드리지 않는다', () => {
  for (const n of [3, 5, 7]) {
    for (const m of scramble(n, seeded(n))) assert.notEqual(m.layer, (n - 1) / 2);
  }
});

test('줄여도 결과는 같다', () => {
  for (const n of sizes) {
    const random = seeded(n * 7 + 1);
    for (let round = 0; round < 30; round++) {
      // 같은 축이 몰리도록 일부러 축을 두 개만 쓴다
      const moves = Array.from({ length: 40 }, () => ({
        axis: random() < 0.5 ? 0 : 2,
        layer: Math.floor(random() * n),
        turns: 1 + Math.floor(random() * 3),
      }));
      const short = simplify(moves, n);
      assert.ok(short.length <= moves.length);
      assert.equal(snapshot(run(createCube(n), short)), snapshot(run(createCube(n), moves)));
    }
  }
});

test('주고받은 회전은 사라진다', () => {
  const moves = [
    { axis: 0, layer: 2, turns: 1 },
    { axis: 1, layer: 0, turns: 1 },
    { axis: 1, layer: 0, turns: 3 },
    { axis: 0, layer: 2, turns: 3 },
  ];
  assert.deepEqual(simplify(moves, 3), []);
});

test('줄이면서 앞뒤가 다시 붙는다', () => {
  const moves = [
    { axis: 0, layer: 0, turns: 1 },
    { axis: 2, layer: 1, turns: 2 },
    { axis: 2, layer: 1, turns: 2 },
    { axis: 0, layer: 0, turns: 1 },
  ];
  assert.deepEqual(simplify(moves, 3), [{ axis: 0, layer: 0, turns: 2 }]);
});

test('섞은 것과 그 역을 줄이면 하나도 안 남는다', () => {
  for (const n of sizes) {
    const moves = scramble(n, seeded(n + 100));
    assert.deepEqual(simplify([...moves, ...invert(moves)], n), []);
  }
});

test('한 번에 돌리는 묶음은 같은 축, 서로 다른 층', () => {
  const moves = [
    { axis: 0, layer: 0, turns: 1 },
    { axis: 0, layer: 2, turns: 3 },
    { axis: 0, layer: 2, turns: 1 },
    { axis: 1, layer: 0, turns: 2 },
  ];
  assert.deepEqual(steps(moves).map((s) => s.length), [2, 1, 1]);
});
