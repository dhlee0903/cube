// 살아 있는 무늬. 큐브 겉면 전체(여섯 면 × n×n 스티커)를 살아 있는 한 장의 피부로 보고, 그 위에서 반응-확산(Gray–Scott)
// 시뮬레이션을 GPU로 돌린다. 산호·표범 무늬·지문 같은 튜링 무늬가 스스로 자라고 갈라지고 합쳐진다.
//
// 타일 = 스티커 하나. 타일마다 RES×RES 텍셀을 atlas(cols×rows 격자) 한 장에 늘어놓고 두 장을 번갈아(ping-pong) 그린다.
// R = u(영양), G = v(생명), B = 최근 성장(v가 막 늘어난 자리, 1초쯤 남는다: 자라는 앞선이 빛난다), A = 상처(층을 돌려 이웃이
// 바뀐 변 안쪽, 2~3초에 식는다: 거기서 F가 올라 새살이 빠르게 돋고 상처 선이 빛난다).
// 타일은 전역 번호(원래 면 × n² + 원래 칸)로 부르므로, 조각이 어디로 가든 그 조각의 무늬는 그대로 따라간다.
// 이웃 스티커끼리는 확산이 통한다: 타일마다 네 변(+u, -u, +v, -v) 바깥의 점이 지금 큐브 상태에서 어느 타일의 어느 자리인지를
// 아핀 (u', v') = (a·u + b·v + ox, c·u + d·v + oy) 로 인접 텍스처에 적어 두고, 셰이더가 변 밖을 읽을 때 그리로 바꿔 읽는다.
// 큐브 모서리에서는 같은 조각의 옆 스티커로 접어 넘어간다.
//
// 움직임 세 겹: (1) 빠른 성장 — 초당 RATE 스텝, 타일마다 씨 둘이라 켜고 1초면 고리, 4초쯤 다 덮인다. (2) 숨 — F가 12초 주기로
// 크게 오르내리는 파동(F ≈ .027~.042)이 면 위를 사선으로 쓸고 지나가, 골짜기엔 능선이 가늘어져 점으로 끊어지고 마루엔 다시
// 굵어져 갈라진다. (3) 기어감 — 느린 이류로 무늬 전체가 초당 스티커 폭의 30%쯤 흐른다. 흐름은 큐브 겉을 통째로 굴리는 강체 회전
// ω × r이다(ω는 90초에 한 바퀴 도는 축): 회전은 발산이 0이라 어느 변에서도 양쪽 흐름이 갈라지거나 겹치지 않고(같은 물리 면의
// 이웃은 정확히 같은 속도, 모서리에서는 순수 전단), 그래서 빈 띠나 겹침이 생기지 않는다. 방향은 타일의 '지금' 세계 틀에서
// 세계 축마다 (0·±1, 0·±1)로 떨어지므로(flowDir) 축마다 스칼라 누적 하나를 두고 한 텍셀이 찰 때마다 통째로 한 칸 옮긴다
// (보간이 없어 수치 확산이 0, 산호 꼴이 그대로 유지된다).
// 층을 돌리면 그 순간 무늬가 조각 경계에서 잘려 상처 선이 따뜻하게 빛나고, 그 선에서 새 무늬가 이웃으로 뻗어 몇 초 안에 메워진다.
//
// 인접 계산(adjacency)과 바뀐 변 찾기(edgeChanges)는 순수 JS라 WebGL 없이 node에서 시험할 수 있다(test/life.test.js).
import {
  ClampToEdgeWrapping, DataTexture, FloatType, HalfFloatType, LinearFilter, Mesh, NearestFilter, NoBlending,
  OrthographicCamera, PlaneGeometry, Quaternion, RGBAFormat, Scene, ShaderMaterial, Vector2, Vector3, Vector4, WebGLRenderTarget,
} from 'three';
import { FACES, createCube, facing } from './cube.js';

/**
 * 초마다 시뮬레이션 스텝 수와 한 프레임에 몰아서 돌릴 최대 스텝(프레임이 늦거나 탭이 숨었다 돌아와도 폭주하지 않는다).
 * CPU 보정(scratchpad lv/calib.mjs: 128×64 토러스, 타일마다 씨 둘): 1초(320스텝)에 능선 비율 20%, 2초 35%, 3.5초쯤 꽉 찬다(49%)
 */
export const RATE = 320;
export const MAX_STEPS = 48;
/** 숨(F 파동) 주기(초)와 진폭, 흐름 속도(텍셀/스텝, |ω|=1일 때 가장 빠른 면의 속도)와 회전축 ω가 한 바퀴 도는 시간(초) */
export const BREATH = { period: 12, amp: 0.007, flow: 0.07, turn: 90 };
/**
 * 회전축 ω(step): 평면 법선 m에 수직인 큰 원을 turn초에 한 바퀴 돈다. m의 세 성분이 모두 0이 아니라 어느 면도 완전히 멈추지는
 * 않고(면 n의 속도 = |ω × n|·flow ≥ |m·n|·flow) 방향은 천천히 돈다
 */
const OMEGA_M = (() => { const m = [0.45, 0.9, 0.3]; const l = Math.hypot(...m); return m.map((x) => x / l); })();
const OMEGA_E1 = (() => { const e = [OMEGA_M[1], -OMEGA_M[0], 0]; const l = Math.hypot(...e); return e.map((x) => x / l); })();
const OMEGA_E2 = [OMEGA_M[1] * OMEGA_E1[2] - OMEGA_M[2] * OMEGA_E1[1], OMEGA_M[2] * OMEGA_E1[0] - OMEGA_M[0] * OMEGA_E1[2], OMEGA_M[0] * OMEGA_E1[1] - OMEGA_M[1] * OMEGA_E1[0]];
export function omegaAt(step) {
  const th = (step * 2 * Math.PI) / (BREATH.turn * RATE);
  const c = Math.cos(th), s = Math.sin(th);
  return [0, 1, 2].map((i) => c * OMEGA_E1[i] + s * OMEGA_E2[i]);
}
/** 전체 텍셀이 50만을 넘지 않게 타일 해상도를 고른다 */
export function resFor(tiles) {
  for (const r of [64, 56, 48, 40, 32]) if (tiles * r * r <= 500000) return r;
  return 24;
}

// 변: 0 +u(u>1)  1 -u(u<0)  2 +v(v>1)  3 -v(v<0). 지역 좌표에서의 바깥 방향
export const OUT = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const key = (p) => p.join(',');
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const apply = (m, v) => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];
const faceOf = (v) => (v[0] ? (v[0] > 0 ? 0 : 1) : v[1] ? (v[1] > 0 ? 2 : 3) : v[2] > 0 ? 4 : 5);

/** 면 s 스티커의 지역 가로·세로 축(조각 좌표). view.js가 스티커를 놓는 회전(+z → 면 법선)과 같은 식이라 그림이 맞는다 */
export function stickerAxes(s) {
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(...FACES[s]));
  const ax = new Vector3(1, 0, 0).applyQuaternion(q);
  const ay = new Vector3(0, 1, 0).applyQuaternion(q);
  return { ax: [ax.x, ax.y, ax.z].map(Math.round), ay: [ay.x, ay.y, ay.z].map(Math.round) };
}
const AXES = FACES.map((_, s) => stickerAxes(s));

/** 전역 타일 번호: 원래 면 s의 원래 칸 (homePos는 맞춘 큐브에서 그 조각의 자리, 두 배 좌표) */
export function tileOf(n, s, homePos) {
  const { ax, ay } = AXES[s];
  const ix = (dot(homePos, ax) + n - 1) / 2;
  const iy = (dot(homePos, ay) + n - 1) / 2;
  return s * n * n + iy * n + ix;
}

/** 타일 목록: tiles[id] = { piece, sticker }. 조각 번호는 createCube 순서(돌려도 바뀌지 않는다) */
export function tilesOf(n) {
  const home = createCube(n).cubies;
  const tiles = new Array(6 * n * n);
  home.forEach((p, i) => {
    for (const s of p.stickers) tiles[tileOf(n, s, p.pos)] = { piece: i, sticker: s };
  });
  return tiles;
}

/** 타일의 지금 세계 틀: 스티커 가운데, 가로·세로 축, 법선(두 배 좌표, 조각 간격 2). 스티커 지역 (u,v)∈[0,1]²이 조각 한 칸이다 */
export function frameOf(cube, piece, sticker) {
  const p = cube.cubies[piece];
  const { ax, ay } = AXES[sticker];
  const axw = apply(p.rot, ax);
  const ayw = apply(p.rot, ay);
  const nw = apply(p.rot, FACES[sticker]);
  return { piece, sticker, pos: p.pos, axw, ayw, nw, center: add(p.pos, nw) };
}
export const toWorld = (f, u, v) => add(f.center, add(scale(f.axw, (u - 0.5) * 2), scale(f.ayw, (v - 0.5) * 2)));
export const toLocal = (f, P) => {
  const d = sub(P, f.center);
  return [0.5 + dot(d, f.axw) / 2, 0.5 + dot(d, f.ayw) / 2];
};

/**
 * 지금 큐브 상태에서 모든 타일의 네 변 이웃. links[tile][edge] = { id, a, b, c, d, ox, oy, fold }.
 * 변 e 바깥의 점 (u,v)는 타일 id의 (a·u + b·v + ox, c·u + d·v + oy)이다. 계수는 모두 0·±1, 오프셋은 정수.
 * 같은 면 이웃: 그 자리에 조각이 있으면 그 조각에서 같은 쪽을 보는 스티커로, 점은 그대로 옮긴다.
 * 모서리 이웃(fold): 자리에 조각이 없으면 같은 조각의 그쪽 스티커로, 점은 모서리를 접어 넘긴다(변 밖으로 t만큼 나간 점은
 * 모서리에서 아래로 t만큼 내려간 점).
 */
export function adjacency(cube) {
  const { n } = cube;
  const tiles = tilesOf(n);
  const frames = tiles.map(({ piece, sticker }) => frameOf(cube, piece, sticker));
  const byPos = new Map();
  cube.cubies.forEach((p, i) => byPos.set(key(p.pos), i));
  const idOf = (piece, face) => {
    const p = cube.cubies[piece];
    const s = p.stickers.find((st) => facing(p, st) === face);
    return tiles.findIndex((t) => t.piece === piece && t.sticker === s);
  };
  return frames.map((f) => OUT.map(([du, dv], e) => {
    const ew = add(scale(f.axw, du), scale(f.ayw, dv));
    const site = add(f.pos, scale(ew, 2));
    const j = byPos.get(key(site));
    let id;
    let fold = false;
    let map;
    if (j !== undefined) {
      id = idOf(j, faceOf(f.nw));
      map = (u, v) => toLocal(frames[id], toWorld(f, u, v));
    } else {
      fold = true;
      id = idOf(f.piece, faceOf(ew));
      map = (u, v) => {
        const t = du ? (du > 0 ? u - 1 : -u) : (dv > 0 ? v - 1 : -v);
        return toLocal(frames[id], sub(toWorld(f, u, v), scale(add(ew, f.nw), 2 * t)));
      };
    }
    // 아핀 계수: 변 바깥의 세 점을 옮겨 본다
    const p0 = [0.5 + du, 0.5 + dv];
    const A = map(p0[0], p0[1]);
    const B = map(p0[0] + 1, p0[1]);
    const C = map(p0[0], p0[1] + 1);
    const a = B[0] - A[0];
    const c = B[1] - A[1];
    const b = C[0] - A[0];
    const d = C[1] - A[1];
    const r = (x) => Math.round(x * 1e6) / 1e6;
    return { id, edge: e, fold, a: r(a), b: r(b), c: r(c), d: r(d), ox: r(A[0] - a * p0[0] - b * p0[1]), oy: r(A[1] - c * p0[0] - d * p0[1]) };
  }));
}

/** 인접 텍스처 데이터: 타일마다 변 넷 × 텍셀 둘. texel0 = (id, a, b, c), texel1 = (d, ox, oy, 0) */
export function linksData(links, out) {
  const data = out ?? new Float32Array(links.length * 8 * 4);
  links.forEach((edges, t) => edges.forEach((l, e) => {
    const k = (t * 8 + e * 2) * 4;
    data[k] = l.id; data[k + 1] = l.a; data[k + 2] = l.b; data[k + 3] = l.c;
    data[k + 4] = l.d; data[k + 5] = l.ox; data[k + 6] = l.oy; data[k + 7] = 0;
  }));
  return data;
}
export const adjacencyData = (cube, out) => linksData(adjacency(cube), out);

/**
 * 세계 축 axis(0 x, 1 y, 2 z) 둘레의 강체 회전이 타일 f 위에서 흐르는 방향(타일 지역 좌표, 성분은 0·±1): ê × n̂을 가로·세로 축에
 * 내린 것. 축이 법선과 나란하면 (0, 0)이고, 아니면 한 성분만 ±1이다. 같은 물리 면 위의 이웃 타일은 같은 세계 속도를 가지므로
 * 변에서 흐름이 이어진다(순수 함수, test/life.test.js)
 */
export function flowDir(f, axis) {
  const e = [0, 0, 0];
  e[axis] = 1;
  const vel = cross(e, f.nw);
  return [dot(vel, f.axw) + 0, dot(vel, f.ayw) + 0]; // + 0: -0을 0으로
}
/** 흐름 방향 텍스처 데이터: 타일마다 텍셀 둘. texel0 = (x축 dir, y축 dir), texel1 = (z축 dir, 0, 0) */
export function flowDirs(cube, out) {
  const tiles = tilesOf(cube.n);
  const data = out ?? new Float32Array(tiles.length * 8);
  tiles.forEach(({ piece, sticker }, t) => {
    const f = frameOf(cube, piece, sticker);
    for (let a = 0; a < 3; a++) {
      const [dx, dy] = flowDir(f, a);
      data[t * 8 + a * 2] = dx; data[t * 8 + a * 2 + 1] = dy;
    }
    data[t * 8 + 6] = 0; data[t * 8 + 7] = 0;
  });
  return data;
}

/**
 * 이웃이 바뀐 변. 돌린 뒤의 인접(next)을 돌리기 전(prev)과 견줘, 타일 t의 변 e가 다른 타일·다른 자리로 이어지게 됐으면
 * out[t·4 + e] = 1. 층을 돌리면 그 층과 옆 층 사이를 건너는 변만 바뀐다(같은 층 안의 이웃과 같은 조각의 모서리 이웃은 함께 돈다).
 * 이 변 안쪽이 상처가 된다
 */
export function edgeChanges(prev, next, out) {
  const flags = out ?? new Uint8Array(next.length * 4);
  next.forEach((edges, t) => edges.forEach((l, e) => {
    const p = prev[t]?.[e];
    const same = p && p.id === l.id && p.a === l.a && p.b === l.b && p.c === l.c && p.d === l.d && p.ox === l.ox && p.oy === l.oy;
    flags[t * 4 + e] = same ? 0 : 1;
  }));
  return flags;
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0., 1.);
}`;

// uMode 0: Gray–Scott 한 스텝(+ 이류, F 파동, 상처의 F 보강, B·A 갱신)  1: 씨 뿌리기  2: 상처 표시(상태 복사 + 바뀐 변 안쪽 A=1).
// 5점 라플라시안. 변 밖은 인접 텍스처로 이웃 타일에서 읽는다(대각선은 모서리를 두 번 넘어야 해서 쓰지 않는다).
// 모든 읽기는 텍셀 가운데만 짚는다(atlas에서 선형 필터로 옆 타일이 섞이면 안 된다)
const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uState;
uniform sampler2D uAdj;
uniform sampler2D uWound;  // 1×타일 수: 변마다(x=+u, y=-u, z=+v, w=-v) 이웃이 바뀌었으면 1
uniform sampler2D uDir;    // 2×타일 수: 세계 축 x·y·z 둘레 회전이 이 타일 위에서 흐르는 방향(지역 좌표, 0·±1). texel0=(x, y) texel1=(z, -)
uniform vec4 uGrid;   // cols, rows, RES, 타일 수
uniform vec4 uParam;  // F, k, Du, Dv
uniform vec2 uWave;   // 숨 진폭 A, 숨 각속도(rad/스텝)
uniform float uMode;
uniform float uStep;  // 지금까지 돈 스텝 수
uniform float uN;     // 한 면 칸 수
uniform vec3 uShiftStep; // 세계 축마다 이번 스텝에 무늬를 옮길 텍셀 수(-1·0·1)
varying vec2 vUv;

float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }

// 타일 안 좌표(0~1)를 atlas에서 읽는다(텍셀 가운데를 짚으면 선형 필터여도 그 값 그대로). 타일 밖으로 나간 좌표는 변의 텍셀로
// 눌러 둔다(모서리 대각선처럼 두 변을 한꺼번에 넘는 자리는 이웃 타일의 모서리 텍셀로 친다)
vec4 at(float tile, vec2 uv) {
  uv = clamp(uv, .5 / uGrid.z, 1. - .5 / uGrid.z);
  vec2 o = vec2(mod(tile, uGrid.x), floor(tile / uGrid.x));
  return texture2D(uState, (o + uv) / uGrid.xy);
}
// 변 밖이면 이웃 타일의 자리로 바꿔 읽는다
vec4 fetch(float tile, vec2 uv) {
  float e = -1.;
  if (uv.x > 1.) e = 0.; else if (uv.x < 0.) e = 1.; else if (uv.y > 1.) e = 2.; else if (uv.y < 0.) e = 3.;
  if (e >= 0.) {
    vec2 ts = vec2(8., uGrid.w);
    vec4 a = texture2D(uAdj, (vec2(e * 2., tile) + .5) / ts);
    vec4 b = texture2D(uAdj, (vec2(e * 2. + 1., tile) + .5) / ts);
    uv = vec2(a.y * uv.x + a.z * uv.y + b.y, a.w * uv.x + b.x * uv.y + b.z);
    tile = a.x;
  }
  return at(tile, uv);
}
void main() {
  vec2 cell = vUv * uGrid.xy;
  vec2 t = floor(cell);
  float tile = t.y * uGrid.x + t.x;
  if (tile >= uGrid.w) { gl_FragColor = vec4(0., 0., 0., 0.); return; }
  vec2 l = floor((cell - t) * uGrid.z);
  vec2 uv = (l + .5) / uGrid.z;
  if (uMode > 1.5) {
    // 상처 표시: 이웃이 바뀐 변에서 3텍셀 안쪽에 A=1. 나머지는 그대로 복사
    vec4 c = at(tile, uv);
    vec4 w = texture2D(uWound, vec2(.5, (tile + .5) / uGrid.w));
    float band = 4.;
    float m = max(max(w.x * step(uGrid.z - band, l.x), w.y * step(l.x, band - 1.)), max(w.z * step(uGrid.z - band, l.y), w.w * step(l.y, band - 1.)));
    gl_FragColor = vec4(c.rgb, max(c.a, m));
    return;
  }
  if (uMode > .5) {
    // 씨: 타일마다 작은 v 점 둘(자리는 타일 번호로 정해져 다시 뿌려도 같다)
    float spot = 0.;
    for (int s = 0; s < 2; s++) {
      vec2 c = vec2(hash(vec2(tile, 7.7 + float(s) * 5.1)), hash(vec2(tile, 11.3 + float(s) * 5.1))) * .7 + .15;
      spot = max(spot, smoothstep(3., 1.2, length((uv - c) * uGrid.z)));
    }
    gl_FragColor = vec4(1. - .5 * spot, .5 * spot, 0., 0.);
    return;
  }
  float face = floor(tile / (uN * uN) + 1e-4);
  float rem = tile - face * uN * uN;
  float iy = floor(rem / uN + 1e-4);
  float ix = rem - iy * uN;
  float h = 1. / uGrid.z;
  vec4 c0 = at(tile, uv);
  // 이류: 무늬 전체가 큐브를 통째로 굴리는 강체 회전을 타고 기어간다(발산 0이라 어느 변에서도 갈라지거나 겹치지 않는다).
  // 텍셀 사이를 보간하면 그 수치 확산이 흐름 방향을 따라 능선을 줄무늬로 눕히므로, JS가 세계 축마다 흐름을 쌓아 두었다가
  // 한 텍셀이 찰 때마다 통째로 한 칸 옮긴다(uShiftStep, 축마다 -1·0·1). 이 타일에서 각 축 회전이 흐르는 방향은 지금 세계 틀에서
  // 미리 구해 둔 uDir이라, 같은 면에 붙은 이웃 타일은 섞인 뒤에도 정확히 같은 쪽으로 옮겨진다. 옮겨 온 값이 이 텍셀의 '지난 값'이 된다
  vec2 ds = vec2(2., uGrid.w);
  vec4 d0 = texture2D(uDir, (vec2(0., tile) + .5) / ds);
  vec4 d1 = texture2D(uDir, (vec2(1., tile) + .5) / ds);
  vec2 sh = d0.xy * uShiftStep.x + d0.zw * uShiftStep.y + d1.xy * uShiftStep.z;
  vec2 p = uv - sh * h;
  vec4 c = dot(sh, sh) > .5 ? fetch(tile, p) : c0;
  // 라플라시안도 옮겨 온 자리 둘레에서 잰다(틀이 어긋나면 그 차이가 성장(B)으로 잘못 잡힌다)
  vec2 lap = fetch(tile, p + vec2(h, 0.)).rg + fetch(tile, p - vec2(h, 0.)).rg + fetch(tile, p + vec2(0., h)).rg + fetch(tile, p - vec2(0., h)).rg - 4. * c.rg;
  // 숨: F가 큰 파동으로 오르내린다. 위상은 면 위 자리(칸 + 칸 안 좌표)의 사선이라 성장과 후퇴의 물결이 면을 쓸고 지나가고,
  // 면마다 조금 어긋난다. 상처(A)에서는 F를 더 올려 새살이 빠르게 돋는다. k는 면마다 아주 조금 다르다
  float phi = ((ix + uv.x) + (iy + uv.y)) * 3.14159 / uN + face * 1.3;
  float F = uParam.x + hash(vec2(face, 1.)) * .001 + uWave.x * sin(uStep * uWave.y + phi) + c0.a * .02;
  float k = uParam.y + (hash(vec2(face, 2.)) - .5) * .0006;
  float uvv = c.x * c.y * c.y;
  vec2 nx = clamp(c.rg + vec2(uParam.z * lap.x - uvv + F * (1. - c.x), uParam.w * lap.y + uvv - (F + k) * c.y), 0., 1.);
  // B: 방금 v가 늘어난 만큼(흐름을 따라 움직인 틀에서 재서 흐름 자체는 성장으로 치지 않는다). 1초쯤에 식는다
  float B = clamp(max(c.b * .99, (nx.y - c.y) * 500.), 0., 1.);
  // A: 상처. 2~3초에 식는다
  float A = c0.a * .996;
  // 안전장치: 100스텝마다, 타일 안 다섯 점이 모두 죽어 있으면(v≈0, u≈1) 작은 씨를 다시 뿌린다. 살아 있는 타일의 골짜기는
  // 다섯 점(한 변 길이의 ¼ 간격 십자)을 다 덮을 만큼 넓지 않다
  if (mod(uStep, 100.) < .5) {
    vec2 cs = vec2(hash(vec2(tile, 7.7)), hash(vec2(tile, 11.3))) * .5 + .25;
    vec4 p0 = at(tile, cs), p1 = at(tile, cs + vec2(.25, 0.)), p2 = at(tile, cs - vec2(.25, 0.)), p3 = at(tile, cs + vec2(0., .25)), p4 = at(tile, cs - vec2(0., .25));
    float dead = step(max(max(p0.y, p1.y), max(max(p2.y, p3.y), p4.y)), .02) * step(.9, min(min(p0.x, p1.x), min(min(p2.x, p3.x), p4.x)));
    float spot = dead * smoothstep(3., 1.2, length((uv - cs) * uGrid.z));
    nx = mix(nx, vec2(.5), spot);
  }
  gl_FragColor = vec4(nx, B, A);
}`;

export class Life {
  constructor(renderer, cube) {
    this.renderer = renderer;
    this.n = cube.n;
    this.count = 6 * cube.n * cube.n;
    this.res = resFor(this.count);
    this.cols = Math.ceil(Math.sqrt(this.count));
    this.rows = Math.ceil(this.count / this.cols);
    this.grid = new Vector4(this.cols, this.rows, this.res, this.count);
    const make = () => new WebGLRenderTarget(this.cols * this.res, this.rows * this.res, {
      type: HalfFloatType,
      format: RGBAFormat,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      wrapS: ClampToEdgeWrapping,
      wrapT: ClampToEdgeWrapping,
      generateMipmaps: false,
      depthBuffer: false,
      stencilBuffer: false,
    });
    this.targets = [make(), make()];
    this.read = 0;
    this.adj = new DataTexture(new Float32Array(this.count * 8 * 4), 8, this.count, RGBAFormat, FloatType);
    this.adj.magFilter = this.adj.minFilter = NearestFilter;
    // 상처: 타일마다 변 넷(+u, -u, +v, -v)에 이웃이 바뀌었으면 1
    this.wound = new DataTexture(new Float32Array(this.count * 4), 1, this.count, RGBAFormat, FloatType);
    this.wound.magFilter = this.wound.minFilter = NearestFilter;
    // 흐름 방향: 타일마다 세계 축 셋 × (dx, dy)
    this.dir = new DataTexture(new Float32Array(this.count * 8), 2, this.count, RGBAFormat, FloatType);
    this.dir.magFilter = this.dir.minFilter = NearestFilter;
    this.links = null;
    const twoPi = Math.PI * 2;
    this.material = new ShaderMaterial({
      uniforms: {
        uState: { value: null },
        uAdj: { value: this.adj },
        uWound: { value: this.wound },
        uDir: { value: this.dir },
        uGrid: { value: this.grid },
        // F, k, Du, Dv. 산호형(F≈.0345, k≈.0585). CPU 보정(scratchpad lv/calib.mjs): F가 .0275~.0415 사이를 오가는 채로
        // 20000스텝 뒤에도 능선 비율이 34~63% 사이를 숨 쉬듯 오가며 한 번도 죽지 않는다
        uParam: { value: new Vector4(0.0345, 0.0585, 0.2, 0.1) },
        uWave: { value: new Vector2(BREATH.amp, twoPi / (BREATH.period * RATE)) },
        uMode: { value: 0 },
        uStep: { value: 0 },
        uN: { value: cube.n },
        uShiftStep: { value: new Vector3() },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
      toneMapped: false,
    });
    this.scene = new Scene();
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new Mesh(new PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.pending = 0;
    this.last = 0;
    this.steps = 0;
    // 세계 축마다 쌓인 흐름(텍셀)의 소수부(정수가 차면 그 칸을 옮기고 소수부만 남겨 끝없이 커지지 않는다)와, 지금까지 옮긴 칸 수(진단용)
    this.flow = new Float64Array(3);
    this.shifted = [0, 0, 0];
    this.update(cube);
    this.seed();
  }

  /** 지금 읽을 쪽(가장 최근에 그린 장) */
  get texture() {
    return this.targets[this.read].texture;
  }

  /**
   * 큐브 상태가 바뀌면(수가 확정될 때마다) 이웃을 다시 잇는다. 무늬 자체는 타일에 남아 조각을 따라간다.
   * 이웃이 바뀐 변이 있으면 그 변 안쪽을 상처로 표시한다(처음 켤 때는 상처가 없다)
   */
  update(cube) {
    if (cube.n !== this.n) return; // 크기가 바뀌면 view가 새 Life를 만든다
    const links = adjacency(cube);
    linksData(links, this.adj.image.data);
    this.adj.needsUpdate = true;
    flowDirs(cube, this.dir.image.data);
    this.dir.needsUpdate = true;
    if (this.links) {
      const flags = edgeChanges(this.links, links);
      if (flags.some(Boolean)) {
        this.wound.image.data.set(flags);
        this.wound.needsUpdate = true;
        this.pass(2);
      }
    }
    this.links = links;
  }

  /** 읽는 장에서 쓰는 장으로 uMode 패스를 한 번 그리고 장을 바꾼다 */
  pass(mode) {
    const r = this.renderer;
    const write = 1 - this.read;
    this.material.uniforms.uMode.value = mode;
    this.material.uniforms.uState.value = mode === 1 ? null : this.targets[this.read].texture;
    r.setRenderTarget(this.targets[write]);
    r.render(this.scene, this.camera);
    r.setRenderTarget(null);
    this.material.uniforms.uState.value = null;
    this.material.uniforms.uMode.value = 0;
    this.read = write;
  }

  /** u=1, v=0에 타일마다 작은 v 점 둘을 뿌린다. 테마를 켤 때와 큐브 크기가 바뀔 때만. 상처는 없다 */
  seed() {
    this.pass(1);
    this.pending = 0;
  }

  /**
   * 지난 시간만큼 스텝을 돌린다(초 단위 시각). 읽는 장과 쓰는 장을 번갈아 써서 feedback loop가 없다.
   * 한 프레임에 MAX_STEPS까지만, 밀린 양도 MAX_STEPS까지만 쌓인다(탭이 숨었다 돌아와도 폭주하지 않는다)
   */
  step(seconds) {
    if (this.last) this.pending += Math.min(0.25, Math.max(0, seconds - this.last)) * RATE;
    this.last = seconds;
    const k = Math.min(MAX_STEPS, Math.floor(this.pending));
    this.pending = Math.min(MAX_STEPS, this.pending - k);
    if (!k) return 0;
    const r = this.renderer;
    const shift = this.material.uniforms.uShiftStep.value;
    for (let i = 0; i < k; i++) {
      const write = 1 - this.read;
      const step = this.steps + i;
      // 강체 회전 ω(step)의 축 성분마다 흐름을 쌓고, 정수가 차면 그 칸만큼(−1·0·1) 옮긴다
      const w = omegaAt(step);
      for (let a = 0; a < 3; a++) {
        const nx = this.flow[a] + BREATH.flow * w[a];
        const s = Math.floor(nx);
        this.flow[a] = nx - s;
        this.shifted[a] += s;
        shift.setComponent(a, s);
      }
      this.material.uniforms.uState.value = this.targets[this.read].texture;
      this.material.uniforms.uStep.value = step;
      r.setRenderTarget(this.targets[write]);
      r.render(this.scene, this.camera);
      this.read = write;
    }
    r.setRenderTarget(null);
    this.material.uniforms.uState.value = null;
    this.steps += k;
    return k;
  }

  dispose() {
    for (const t of this.targets) t.dispose();
    this.adj.dispose();
    this.wound.dispose();
    this.dir.dispose();
    this.material.dispose();
    this.quad.geometry.dispose();
  }
}
