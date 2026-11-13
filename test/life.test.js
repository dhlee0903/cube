import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMove, createCube, scramble } from '../src/cube.js';
import { OUT, adjacency, adjacencyData, edgeChanges, flowDir, flowDirs, frameOf, linksData, omegaAt, resFor, tileOf, tilesOf, toLocal, toWorld } from '../src/life.js';

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

test('한 층을 돌리면 바뀐 변이 있고, 그 변은 돌아간 층의 경계에 있는 타일에만 있다', () => {
  for (const n of [2, 3, 4]) for (const move of [{ axis: 1, layer: n - 1, turns: 1 }, { axis: 0, layer: 0, turns: -1 }, { axis: 2, layer: 1, turns: 1 }, { axis: 1, layer: 0, turns: 2 }]) {
    const label = `${n} ${JSON.stringify(move)}`;
    const cube = createCube(n);
    const before = adjacency(cube);
    const tiles = tilesOf(n);
    const frames = tiles.map(({ piece, sticker }) => frameOf(cube, piece, sticker));
    applyMove(cube, move);
    const after = adjacency(cube);
    const flags = edgeChanges(before, after);
    assert.equal(flags.length, tiles.length * 4, label);
    // 돌린 층의 좌표(두 배 좌표)와, 층 경계를 건너는 변: 변 바깥 자리(큐브 안)와 조각 자리 중 하나만 그 층에 있다(모서리 이웃은 같은 조각이라 제외)
    const coord = 2 * move.layer - (n - 1);
    const crossing = new Set();
    frames.forEach((f, t) => OUT.forEach(([du, dv], e) => {
      const ew = [0, 1, 2].map((i) => f.axw[i] * du + f.ayw[i] * dv);
      const site = f.pos[move.axis] + 2 * ew[move.axis];
      if (Math.abs(site) <= n - 1 && (f.pos[move.axis] === coord) !== (site === coord)) crossing.add(t * 4 + e);
    }));
    let changed = 0;
    flags.forEach((x, i) => {
      if (!x) return;
      changed++;
      assert.ok(crossing.has(i), `${label}: 타일 ${i >> 2} 변 ${i & 3}은 돌아간 층의 경계가 아닌데 바뀌었다`);
    });
    assert.ok(changed > 0, `${label}: 바뀐 변이 없다`);
    // 90°면 경계를 건너는 변은 모두 이웃 조각이 달라져 바뀐다
    if (Math.abs(move.turns) === 1) assert.equal(changed, crossing.size, `${label}: 바뀐 변 ${changed} ≠ 건너는 변 ${crossing.size}`);
    // 그대로면 바뀐 변이 없고, 텍스처 데이터는 인접에서 바로 만든 것과 같다
    assert.ok(edgeChanges(after, after).every((x) => !x), `${label}: 같은 상태인데 바뀐 변`);
    assert.deepEqual(linksData(after), adjacencyData(cube), label);
  }
});

// 흐름(이류)은 큐브 전체의 강체 회전이라, 어느 변에서도 양쪽 흐름의 변 수직 성분이 같아야 한다(멀어지면 빈 띠, 가까워지면 겹침).
// 이웃 타일의 방향을 내 틀로 가져올 때는 인접 아핀의 선형부(직교 행렬)의 역 = 전치를 쓴다
function checkFlow(cube, label) {
  const { n } = cube;
  const tiles = tilesOf(n);
  const frames = tiles.map(({ piece, sticker }) => frameOf(cube, piece, sticker));
  const links = adjacency(cube);
  const data = flowDirs(cube);
  assert.equal(data.length, tiles.length * 8, label);
  for (let axis = 0; axis < 3; axis++) {
    const dirs = frames.map((f) => flowDir(f, axis));
    let moving = 0;
    dirs.forEach((d, t) => {
      // 성분은 0·±1이고 한 성분만 0이 아니다. 축이 법선과 나란한 면은 멈춘다. 텍스처 데이터와 같다
      for (const x of d) assert.ok([-1, 0, 1].includes(x), `${label} 축 ${axis} 타일 ${t}: 성분 ${x}`);
      const f = frames[t];
      const along = Math.abs(f.nw[axis]) === 1;
      assert.equal(Math.abs(d[0]) + Math.abs(d[1]), along ? 0 : 1, `${label} 축 ${axis} 타일 ${t}: ${d}`);
      if (!along) moving++;
      assert.deepEqual(Array.from(data.slice(t * 8 + axis * 2, t * 8 + axis * 2 + 2)), d, `${label} 축 ${axis} 타일 ${t}: 데이터`);
    });
    assert.equal(moving, 4 * n * n, `${label} 축 ${axis}: 움직이는 타일 수`);
    links.forEach((edges, t) => edges.forEach((l, e) => {
      const [du, dv] = OUT[e];
      const mine = dirs[t][0] * du + dirs[t][1] * dv + 0;
      const dn = dirs[l.id];
      const back = [l.a * dn[0] + l.c * dn[1], l.b * dn[0] + l.d * dn[1]];
      const theirs = back[0] * du + back[1] * dv + 0; // + 0: -0을 0으로
      assert.equal(mine, theirs, `${label} 축 ${axis} 타일 ${t} 변 ${e}${l.fold ? '(모서리)' : ''}: 내 쪽 ${mine}, 이웃 ${theirs}`);
    }));
  }
}

test('흐름은 강체 회전이라 맞춘 큐브의 어느 변에서도 양쪽이 갈라지지 않는다', () => {
  for (const n of [2, 3, 4, 5]) checkFlow(createCube(n), `맞춤 ${n}`);
  // 맞춘 3×3, y축 회전: 옆면 넷은 고리를 따라 같은 쪽으로, 윗·아랫면은 멈춘다
  const frames = tilesOf(3).map(({ piece, sticker }) => frameOf(createCube(3), piece, sticker));
  assert.deepEqual(flowDir(frames[4 * 9 + 4], 1), [1, 0], '앞면(+z)은 +x = 지역 +u');
  assert.deepEqual(flowDir(frames[2 * 9 + 4], 1), [0, 0], '윗면(+y)은 멈춘다');
});

test('섞은 큐브에서도 흐름은 어느 변에서도 갈라지지 않는다', () => {
  for (const n of [2, 3, 4]) for (const seed of [7, 99, 12345]) checkFlow(scrambled(n, seed), `섞음 ${n}/${seed}`);
});

test('회전축은 단위 벡터이고 어느 면도 완전히 멈추지 않는다', () => {
  let minSpeed = 1;
  for (let step = 0; step < 90 * 320; step += 97) {
    const w = omegaAt(step);
    near(Math.hypot(...w), 1, `step ${step}: |ω|`);
    for (let a = 0; a < 3; a++) minSpeed = Math.min(minSpeed, Math.sqrt(Math.max(0, 1 - w[a] * w[a])));
  }
  assert.ok(minSpeed > 0.25, `가장 느린 면의 속도 ${minSpeed}`);
});
