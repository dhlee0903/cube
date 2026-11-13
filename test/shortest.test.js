import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMove, createCube, isSolved, scramble } from '../src/cube.js';
import { solveShort } from '../src/shortest.js';

// 늘 같은 판이 나오게 씨앗 있는 난수
const seeded = (seed) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

test('3×3 컴퓨터 풀이는 섞인 큐브를 22수 안에 맞춘다(가운데 층을 돌렸어도)', () => {
  const random = seeded(7);
  for (let g = 0; g < 20; g++) {
    const cube = createCube(3);
    for (const m of scramble(3, random)) applyMove(cube, m);
    if (g % 2) applyMove(cube, { axis: g % 3, layer: 1, turns: 1 });
    const moves = solveShort(cube);
    assert.ok(moves && moves.length <= 22, `길이 ${moves?.length}`);
    for (const m of moves) applyMove(cube, m);
    assert.ok(isSolved(cube));
  }
});

test('2×2 컴퓨터 풀이는 가장 짧은 길(11수 이내)로 맞춘다', () => {
  const random = seeded(11);
  for (let g = 0; g < 30; g++) {
    const cube = createCube(2);
    for (const m of scramble(2, random)) applyMove(cube, m);
    const moves = solveShort(cube);
    assert.ok(moves && moves.length <= 11, `길이 ${moves?.length}`);
    for (const m of moves) applyMove(cube, m);
    assert.ok(isSolved(cube));
  }
  // 한 수만 돌린 큐브는 한 수로 맞춘다
  const one = createCube(2);
  applyMove(one, { axis: 0, layer: 0, turns: 1 });
  assert.equal(solveShort(one).length, 1);
});

test('다른 크기는 컴퓨터 풀이가 없다', () => {
  assert.equal(solveShort(createCube(4)), null);
  assert.deepEqual(solveShort(createCube(3)), []);
});
