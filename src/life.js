// 살아 있는 무늬. 큐브 겉면 전체(여섯 면 × n×n 스티커)를 살아 있는 한 장의 피부로 보고, 그 위에서 반응-확산(Gray–Scott)
// 시뮬레이션을 GPU로 돌린다. 산호·표범 무늬·지문 같은 튜링 무늬가 스스로 자라고 갈라지고 합쳐진다.
//
// 타일 = 스티커 하나. 타일마다 RES×RES 텍셀을 atlas(cols×rows 격자) 한 장에 늘어놓고 두 장을 번갈아(ping-pong) 그린다.
// R = u(영양), G = v(생명). 타일은 전역 번호(원래 면 × n² + 원래 칸)로 부르므로, 조각이 어디로 가든 그 조각의 무늬는 그대로
// 따라간다. 이웃 스티커끼리는 확산이 통한다: 타일마다 네 변(+u, -u, +v, -v) 바깥의 점이 지금 큐브 상태에서 어느 타일의
// 어느 자리인지를 아핀 (u', v') = (a·u + b·v + ox, c·u + d·v + oy) 로 인접 텍스처에 적어 두고, 셰이더가 변 밖을 읽을 때 그리로
// 바꿔 읽는다. 큐브 모서리에서는 같은 조각의 옆 스티커로 접어 넘어간다. 그래서 층을 돌리면 그 순간 무늬가 조각 경계에서
// 잘리고, 돌아간 뒤에는 새 이웃과 다시 이어 자라며 흉터가 아물듯 메워진다.
//
// 인접 계산(adjacency, 순수 JS)은 WebGL 없이 node에서 시험할 수 있다(test/life.test.js).
import {
  ClampToEdgeWrapping, DataTexture, FloatType, HalfFloatType, LinearFilter, Mesh, NearestFilter, NoBlending,
  OrthographicCamera, PlaneGeometry, Quaternion, RGBAFormat, Scene, ShaderMaterial, Vector3, Vector4, WebGLRenderTarget,
} from 'three';
import { FACES, createCube, facing } from './cube.js';

/** 초마다 시뮬레이션 스텝 수와 한 프레임에 몰아서 돌릴 최대 스텝. 10초쯤이면 무늬가 눈에 띄고 30초쯤 면을 덮게 맞췄다 */
export const RATE = 100;
export const MAX_STEPS = 24;
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
export function adjacencyData(cube, out) {
  const links = adjacency(cube);
  const data = out ?? new Float32Array(links.length * 8 * 4);
  links.forEach((edges, t) => edges.forEach((l, e) => {
    const k = (t * 8 + e * 2) * 4;
    data[k] = l.id; data[k + 1] = l.a; data[k + 2] = l.b; data[k + 3] = l.c;
    data[k + 4] = l.d; data[k + 5] = l.ox; data[k + 6] = l.oy; data[k + 7] = 0;
  }));
  return data;
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0., 1.);
}`;

// Gray–Scott 한 스텝(uMode 0) 또는 씨 뿌리기(uMode 1). 5점 라플라시안. 변 밖은 인접 텍스처로 이웃 타일에서 읽는다
// (대각선은 모서리를 두 번 넘어야 해서 쓰지 않는다)
const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uState;
uniform sampler2D uAdj;
uniform vec4 uGrid;   // cols, rows, RES, 타일 수
uniform vec4 uParam;  // F, k, Du, Dv
uniform float uMode;
uniform float uTide;  // 느린 물때(스텝 수): F를 천천히 오르내려 다 덮인 뒤에도 무늬가 굳지 않는다
varying vec2 vUv;

float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }

// 타일 안 좌표(0~1)를 atlas에서 읽는다(텍셀 가운데를 짚으면 선형 필터여도 그 값 그대로)
vec2 at(float tile, vec2 uv) {
  vec2 o = vec2(mod(tile, uGrid.x), floor(tile / uGrid.x));
  return texture2D(uState, (o + uv) / uGrid.xy).rg;
}
// 변 밖이면 이웃 타일의 자리로 바꿔 읽는다
vec2 fetch(float tile, vec2 uv) {
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
  if (tile >= uGrid.w) { gl_FragColor = vec4(0., 0., 0., 1.); return; }
  vec2 l = floor((cell - t) * uGrid.z);
  vec2 uv = (l + .5) / uGrid.z;
  if (uMode > .5) {
    // 씨: 타일 절반쯤에 작은 v 점 하나(자리는 타일 번호로 정해져 다시 뿌려도 같다)
    vec2 c = vec2(hash(vec2(tile, 7.7)), hash(vec2(tile, 11.3))) * .7 + .15;
    float d = length((uv - c) * uGrid.z);
    float spot = hash(vec2(tile, 3.1)) < .55 ? smoothstep(3., 1.2, d) : 0.;
    gl_FragColor = vec4(1. - .5 * spot, .5 * spot, 0., 1.);
    return;
  }
  float h = 1. / uGrid.z;
  vec2 c = at(tile, uv);
  vec2 lap = fetch(tile, uv + vec2(h, 0.)) + fetch(tile, uv - vec2(h, 0.)) + fetch(tile, uv + vec2(0., h)) + fetch(tile, uv - vec2(0., h)) - 4. * c;
  // 면마다 조금 다른 F, k(모두 산호 꼴이 나오는 범위 안). 굳는 쪽(F 작음)으로는 가지 않고,
  // 50초 주기로 F가 ±.003 오르내려 평형이 계속 옮겨 가므로 능선이 멈추지 않고 갈라지고 합쳐진다
  float face = floor(tile / (uGrid.w / 6.) + 1e-4);
  float F = uParam.x + hash(vec2(face, 1.)) * .001 + .003 * sin(uTide * .0012566 + face * 1.7);
  float k = uParam.y + (hash(vec2(face, 2.)) - .5) * .001;
  float uvv = c.x * c.y * c.y;
  vec2 nx = c + vec2(uParam.z * lap.x - uvv + F * (1. - c.x), uParam.w * lap.y + uvv - (F + k) * c.y);
  gl_FragColor = vec4(clamp(nx, 0., 1.), 0., 1.);
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
    this.material = new ShaderMaterial({
      uniforms: {
        uState: { value: null },
        uAdj: { value: this.adj },
        uGrid: { value: this.grid },
        // F, k, Du, Dv. 산호형(F≈.034, k≈.0585): CPU 보정(scratchpad gs-calib6)에서 16000스텝 뒤에도 능선의 7~13%가 2000스텝마다 바뀐다
        uParam: { value: new Vector4(0.034, 0.0585, 0.2, 0.1) },
        uMode: { value: 0 },
        uTide: { value: 0 },
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
    this.update(cube);
    this.seed();
  }

  /** 지금 읽을 쪽(가장 최근에 그린 장) */
  get texture() {
    return this.targets[this.read].texture;
  }

  /** 큐브 상태가 바뀌면(수가 확정될 때마다) 이웃을 다시 잇는다. 무늬 자체는 타일에 남아 조각을 따라간다 */
  update(cube) {
    if (cube.n !== this.n) return; // 크기가 바뀌면 view가 새 Life를 만든다
    adjacencyData(cube, this.adj.image.data);
    this.adj.needsUpdate = true;
  }

  /** u=1, v=0에 타일마다 작은 v 점을 뿌린다. 테마를 켤 때와 큐브 크기가 바뀔 때만 */
  seed() {
    this.material.uniforms.uMode.value = 1;
    this.material.uniforms.uState.value = null;
    this.renderer.setRenderTarget(this.targets[0]);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.material.uniforms.uMode.value = 0;
    this.read = 0;
    this.pending = 0;
  }

  /** 지난 시간만큼 스텝을 돌린다(초 단위 시각). 읽는 장과 쓰는 장을 번갈아 써서 feedback loop가 없다 */
  step(seconds) {
    if (this.last) this.pending += Math.min(0.25, Math.max(0, seconds - this.last)) * RATE;
    this.last = seconds;
    const k = Math.min(MAX_STEPS, Math.floor(this.pending));
    this.pending = Math.min(MAX_STEPS, this.pending - k);
    if (!k) return 0;
    const r = this.renderer;
    for (let i = 0; i < k; i++) {
      const write = 1 - this.read;
      this.material.uniforms.uState.value = this.targets[this.read].texture;
      this.material.uniforms.uTide.value = this.steps + i;
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
    this.material.dispose();
    this.quad.geometry.dispose();
  }
}
