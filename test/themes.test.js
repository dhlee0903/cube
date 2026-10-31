import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GROUPS, THEMES, themeById } from '../src/themes.js';
import { Timer, formatTime } from '../src/timer.js';

// sRGB hex → CIE Lab
function lab(hex) {
  const v = parseInt(hex.slice(1), 16);
  const lin = [v >> 16, (v >> 8) & 255, v & 255].map((c) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = lin;
  const xyz = [
    (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047,
    0.2126 * r + 0.7152 * g + 0.0722 * b,
    (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883,
  ].map((t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116));
  return [116 * xyz[1] - 16, 500 * (xyz[0] - xyz[1]), 200 * (xyz[1] - xyz[2])];
}

const distance = (a, b) => Math.hypot(...lab(a).map((x, i) => x - lab(b)[i]));

test('테마마다 면 색 여섯 개, 이름과 id는 겹치지 않는다', () => {
  assert.equal(new Set(THEMES.map((t) => t.id)).size, THEMES.length);
  assert.equal(new Set(THEMES.map((t) => t.name)).size, THEMES.length);
  for (const t of THEMES) {
    assert.equal(t.faces.length, 6, t.id);
    for (const c of [...t.faces, t.bg, t.ink, t.body.color]) assert.match(c, /^#[0-9A-F]{6}$/i, `${t.id} ${c}`);
    assert.equal(themeById(t.id), t);
  }
});

test('테마는 모두 한 무리에만 들어간다', () => {
  const listed = GROUPS.flatMap((g) => g.themes);
  assert.equal(new Set(listed).size, listed.length, '두 무리에 든 테마가 있다');
  for (const id of listed) assert.ok(themeById(id), `없는 테마 ${id}`);
  for (const t of THEMES) assert.ok(listed.includes(t.id), `무리에 없는 테마 ${t.name}`);
});

test('한 테마 안의 면 색은 서로 헷갈리지 않는다', () => {
  for (const t of THEMES) {
    for (let i = 0; i < 6; i++) {
      for (let j = i + 1; j < 6; j++) {
        const d = distance(t.faces[i], t.faces[j]);
        assert.ok(d > 25, `${t.name}: ${t.faces[i]}와 ${t.faces[j]}가 너무 비슷하다 (${d.toFixed(1)})`);
      }
    }
  }
});

test('스티커는 몸통 색에 묻히지 않는다', () => {
  for (const t of THEMES) {
    for (const c of t.faces) {
      const d = distance(c, t.body.color);
      assert.ok(d > 20, `${t.name}: ${c}가 몸통 ${t.body.color}에 묻힌다 (${d.toFixed(1)})`);
    }
  }
});

test('글자는 바탕 위에서 읽힌다', () => {
  for (const t of THEMES) {
    const d = Math.abs(lab(t.ink)[0] - lab(t.bg)[0]);
    assert.ok(d > 50, `${t.name}: 글자와 바탕의 밝기 차이가 작다 (${d.toFixed(1)})`);
  }
});

test('타이머는 준비된 뒤 잡아야 시작하고, 멈추면 그 시간에 선다', () => {
  let now = 1000;
  const timer = new Timer(() => now);
  timer.start();
  assert.equal(timer.state, 'off');
  timer.arm();
  now = 5000;
  assert.equal(timer.elapsed(), 0);
  timer.start();
  now = 7345;
  assert.equal(timer.state, 'running');
  assert.equal(timer.elapsed(), 2345);
  timer.stop();
  now = 99999;
  assert.equal(timer.state, 'done');
  assert.equal(timer.elapsed(), 2345);
  timer.reset();
  assert.equal(timer.state, 'off');
  assert.equal(timer.hinted, false);
});

test('시간 표시', () => {
  assert.equal(formatTime(0), '0:00.00');
  assert.equal(formatTime(5321), '0:05.32');
  assert.equal(formatTime(65320), '1:05.32');
  assert.equal(formatTime(3725999), '62:05.99');
});

test('테마가 쓰는 질감·움직임·입자 이름은 모두 실제로 있다', async () => {
  const { SURFACES } = await import('../src/surfaces.js');
  const { MOTIONS } = await import('../src/motions.js');
  const { SHAPES, MODES } = await import('../src/particles.js');
  const flickers = new Set(['candle', 'lava', 'lightning', 'aurora', 'disco']);
  for (const t of THEMES) {
    if (t.surface) assert.ok(SURFACES.includes(t.surface), `${t.name}: 질감 ${t.surface}`);
    if (t.motion) assert.ok(t.motion in MOTIONS, `${t.name}: 움직임 ${t.motion}`);
    if (t.flicker) assert.ok(flickers.has(t.flicker), `${t.name}: 조명 ${t.flicker}`);
    for (const a of [].concat(t.ambient ?? [])) {
      assert.ok(a.mode in MODES, `${t.name}: 떠다니는 방식 ${a.mode}`);
      assert.ok(a.shape in SHAPES, `${t.name}: 입자 모양 ${a.shape}`);
    }
    if (t.burst) assert.ok(t.burst.shape in SHAPES, `${t.name}: 튀는 입자 모양 ${t.burst.shape}`);
    // 스티커 빛 세기(glow)와 흐르는 배경(drift)은 다른 것이다. 한때 이름이 겹쳐 스티커가 까맣게 나왔다
    if (t.glow !== undefined) assert.ok(typeof t.glow === 'number' || (Array.isArray(t.glow) && t.glow.length === 6), `${t.name}: glow`);
    if (t.drift !== undefined) assert.equal(typeof t.drift, 'string', `${t.name}: drift`);
    const f = t.form ?? {};
    if (f.radius !== undefined) assert.ok(f.radius <= f.size / 2 + 1e-9, `${t.name}: 스티커 모서리가 너무 둥글다`);
  }
});

test('돌아가는 곡선은 0에서 시작해 정확히 1에서 끝난다', async () => {
  const { MOTIONS } = await import('../src/motions.js');
  for (const [name, { ease, time }] of Object.entries(MOTIONS)) {
    assert.ok(Math.abs(ease(0)) < 0.02, `${name}(0) = ${ease(0)}`);
    assert.equal(ease(1), 1, `${name}(1)`);
    assert.ok(time > 0);
  }
});
