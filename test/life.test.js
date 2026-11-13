import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMove, createCube, scramble } from '../src/cube.js';
import { OUT, adjacency, adjacencyData, frameOf, resFor, tileOf, tilesOf, toLocal, toWorld } from '../src/life.js';

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} ≠ ${b}`);
const nearV = (a, b, msg) => a.forEach((x, i) => near(x, b[i], msg));
const isInt = (x) => Math.abs(x - Math.round(x)) < 1e-9;

function scrambled(n, seedValue) {
  let s = seedValue;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const cube = createCube(n);
  for (const m of scramble(n, rnd)) applyMove(cube, m);
  return cube;
}

test('타일 번호는 면마다 n×n이 빠짐없이 한 번씩', () => {
  for (const n of [2, 3, 4, 5]) {
    const tiles = tilesOf(n);
    assert.equal(tiles.length, 6 * n * n);
    assert.ok(tiles.every(Boolean), `${n}: 빈 타일`);
    const home = createCube(n).cubies;
    for (const p of home) for (const s of p.stickers) {
      const id = tileOf(n, s, p.pos);
      assert.ok(Number.isInteger(id) && id >= 0 && id < 6 * n * n, `${n}: 타일 번호 ${id}`);
      assert.equal(Math.floor(id / (n * n)), s, '앞자리는 면 번호');
    }
  }
});

test('해상도는 전체 텍셀 50만 아래', () => {
  for (const n of [2, 3, 4, 5, 6, 7]) {
    const tiles = 6 * n * n;
    assert.ok(tiles * resFor(tiles) ** 2 <= 500000, `${n}`);
  }
  assert.equal(resFor(54), 64);
});

function check(cube, label) {
  const { n } = cube;
  const tiles = tilesOf(n);
  const frames = tiles.map(({ piece, sticker }) => frameOf(cube, piece, sticker));
  const links = adjacency(cube);
  assert.equal(links.length, tiles.length);
  const at = (l, u, v) => [l.a * u + l.b * v + l.ox, l.c * u + l.d * v + l.oy];
  let folds = 0;
  links.forEach((edges, t) => {
    assert.equal(edges.length, 4, `${label} ${t}`);
    edges.forEach((l, e) => {
      // (1) 이웃이 있고 계수는 0·±1, 오프셋은 정수
      assert.ok(l.id >= 0 && l.id < tiles.length && l.id !== t, `${label} ${t}/${e}: 이웃 ${l.id}`);
      for (const k of [l.a, l.b, l.c, l.d]) assert.ok([-1, 0, 1].includes(k), `${label} ${t}/${e}: 계수 ${k}`);
      assert.ok(isInt(l.ox) && isInt(l.oy), `${label} ${t}/${e}: 오프셋 ${l.ox} ${l.oy}`);
      // 행렬은 직교(축 뒤바뀜·뒤집기만)
      assert.equal(Math.abs(l.a * l.d - l.b * l.c), 1, `${label} ${t}/${e}: 행렬식`);
      // 변 바깥의 점 몇 개가 이웃 안으로 들어간다
      const [du, dv] = OUT[e];
      const pts = [[0.5 + du * 0.7, 0.5 + dv * 0.7], [0.5 + du * 0.6 + dv * 0.3, 0.5 + dv * 0.6 + du * 0.3], [0.5 + du * 0.95 - dv * 0.45, 0.5 + dv * 0.95 - du * 0.45]];
      for (const [u, v] of pts) {
        const [u2, v2] = at(l, u, v);
        assert.ok(u2 > -1e-9 && u2 < 1 + 1e-9 && v2 > -1e-9 && v2 < 1 + 1e-9, `${label} ${t}/${e}: (${u},${v}) → (${u2},${v2})`);
        // (3) 세계 점이 맞는다: 같은 면이면 그대로, 모서리면 접은 점
        const P = toWorld(frames[t], u, v);
        const f = frames[t];
        const out = du ? (du > 0 ? u - 1 : -u) : (dv > 0 ? v - 1 : -v);
        const ew = [0, 1, 2].map((i) => f.axw[i] * du + f.ayw[i] * dv);
        const expect = l.fold ? P.map((x, i) => x - 2 * out * (ew[i] + f.nw[i])) : P;
        nearV(toWorld(frames[l.id], u2, v2), expect, `${label} ${t}/${e}: 세계 점`);
        nearV(toLocal(frames[l.id], expect), [u2, v2], `${label} ${t}/${e}: 지역 점`);
      }
      // (2) 왕복: 이웃의 어느 변은 나를 가리키고 아핀을 이어 붙이면 항등
      const back = links[l.id].filter((m) => m.id === t);
      assert.ok(back.length >= 1, `${label} ${t}/${e}: ${l.id}에서 돌아오는 변이 없다`);
      const ok = back.some((m) => pts.every(([u, v]) => {
        const [u2, v2] = at(m, ...at(l, u, v));
        return Math.abs(u2 - u) < 1e-9 && Math.abs(v2 - v) < 1e-9;
      }));
      assert.ok(ok, `${label} ${t}/${e}: 왕복이 항등이 아니다`);
      if (l.fold) folds++;
    });
  });
  // 모서리 이웃은 큐브 모서리 12개 × n칸 × 양쪽 = 24n
  assert.equal(folds, 24 * n, `${label}: 모서리 이웃 수`);
  // 텍스처 데이터 크기와 배치
  const data = adjacencyData(cube);
  assert.equal(data.length, tiles.length * 32);
  const l = links[5][2];
  const k = (5 * 8 + 2 * 2) * 4;
  assert.deepEqual(Array.from(data.slice(k, k + 7)), [l.id, l.a, l.b, l.c, l.d, l.ox, l.oy]);
}

test('맞춘 큐브에서 모든 타일의 네 변이 이어진다', () => {
  for (const n of [2, 3, 4, 5]) check(createCube(n), `맞춤 ${n}`);
});

test('섞은 큐브에서도 모든 타일의 네 변이 이어진다', () => {
  for (const n of [2, 3, 4]) for (const seed of [7, 99, 12345]) check(scrambled(n, seed), `섞음 ${n}/${seed}`);
});

test('맞춘 큐브에서 같은 면 이웃은 면 위 옆 칸이고 축이 그대로다', () => {
  const cube = createCube(3);
  const links = adjacency(cube);
  // 앞면(4) 가운데 칸(타일 4·9 + 1·3 + 1 = 40)의 +u 이웃은 오른쪽 칸(41), 좌표는 u만 1 줄어든다
  const l = links[40][0];
  assert.equal(l.id, 41);
  assert.deepEqual([l.a, l.b, l.c, l.d, l.ox, l.oy], [1, 0, 0, 1, -1, 0]);
  assert.equal(l.fold, false);
});

test('층을 돌리면 돌린 조각의 이웃만 바뀐다', () => {
  const a = adjacency(createCube(3));
  const cube = createCube(3);
  applyMove(cube, { axis: 1, layer: 2, turns: 1 });
  const b = adjacency(cube);
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  let changed = 0;
  a.forEach((edges, t) => { if (!same(edges, b[t])) changed++; });
  // 윗층 조각(스티커 21개)과 그 밑 층에서 윗층을 바라보는 변을 가진 스티커(8개)만 바뀐다
  assert.ok(changed > 0 && changed <= 29, `바뀐 타일 ${changed}`);
});
