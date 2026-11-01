import {
  DepthTexture, HalfFloatType, Mesh, NearestFilter, NoBlending, OrthographicCamera, PlaneGeometry, Scene,
  ShaderMaterial, Vector2,
  WebGLRenderTarget,
} from 'three';

// 화면 필터. 장면을 한 번 텍스처에 그린 뒤, 그 그림 전체에 효과를 입혀 화면에 옮긴다.
// 스티커에 무늬를 그리는 대신 렌더링 자체가 카툰, 8비트 게임, 고장 난 화면처럼 보이게 한다.
//   toon    셀 애니메이션. 깊이가 끊기는 곳(실루엣, 조각 사이)에 먹선을 긋는다
//   pixel   8비트 게임. 낮은 해상도로 그려 칸칸이 키우고, 16색 팔레트에 바이어 디더링, 스프라이트 검은 테두리
//   glitch  고장 난 화면. 색 어긋남, 찢어지는 띠, 굴러가는 테이프 띠, 덩어리 깨짐, 주사선, 잡음, 신호 끊김

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0., 1.);
}`;

const COMMON = /* glsl */ `
uniform sampler2D tColor;
uniform vec2 uRes;
uniform float uDpr;
uniform float uTime;
uniform float uCharge;
varying vec2 vUv;
vec3 fxSrgb(vec3 c) {
  c = clamp(c, 0., 1.);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c));
}
float fxHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * .1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}`;

const TOON = /* glsl */ `
${COMMON}
uniform sampler2D tDepth;
uniform float uNear;
uniform float uFar;
uniform vec3 uInk;
float fxLin(vec2 uv) {
  float z = texture2D(tDepth, uv).x * 2. - 1.;
  return 2. * uNear * uFar / (uFar + uNear - z * (uFar - uNear));
}
void main() {
  vec4 c0 = texture2D(tColor, vUv);
  float d0 = fxLin(vUv);
  float r = 1.6 * uDpr;
  float ink = 0.;
  for (int i = 0; i < 4; i++) {
    float an = float(i) * .785398;
    vec2 o = vec2(cos(an), sin(an)) * r / uRes;
    float da = fxLin(vUv + o);
    float db = fxLin(vUv - o);
    // 깊이가 꺾이거나 끊기는 곳: 큐브 실루엣과 조각 사이 틈. 평평한 면은 비스듬해도 꺾이지 않는다
    ink = max(ink, smoothstep(.0025, .006, abs(da + db - 2. * d0) / d0));
    // 비어 있는 바탕과 맞닿은 곳(큐브와 입자 둘레)
    ink = max(ink, smoothstep(.25, .6, max(texture2D(tColor, vUv + o).a, texture2D(tColor, vUv - o).a) - c0.a));
  }
  vec3 col = fxSrgb(c0.rgb);
  float a = max(c0.a, ink);
  col = mix(col, uInk, ink);
  gl_FragColor = vec4(col * a, a);
}`;

const PIXEL = /* glsl */ `
${COMMON}
uniform vec2 uLow;
const vec3 PAL[16] = vec3[16](
  vec3(0.), vec3(.114, .169, .325), vec3(.494, .145, .325), vec3(0., .529, .318),
  vec3(.671, .322, .212), vec3(.373, .341, .31), vec3(.761, .765, .78), vec3(1., .945, .91),
  vec3(1., 0., .302), vec3(1., .639, 0.), vec3(1., .925, .153), vec3(0., .894, .212),
  vec3(.161, .678, 1.), vec3(.514, .463, .612), vec3(1., .467, .659), vec3(1., .8, .667));
const float BAYER[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
void main() {
  vec2 cell = floor(vUv * uLow);
  vec2 uv = (cell + .5) / uLow;
  vec2 t = 1. / uLow;
  vec4 c = texture2D(tColor, uv);
  if (c.a < .5) {
    // 스프라이트처럼 한 칸짜리 검은 테두리
    float near = max(max(texture2D(tColor, uv + vec2(t.x, 0.)).a, texture2D(tColor, uv - vec2(t.x, 0.)).a),
                     max(texture2D(tColor, uv + vec2(0., t.y)).a, texture2D(tColor, uv - vec2(0., t.y)).a));
    gl_FragColor = near > .5 ? vec4(0., 0., 0., 1.) : vec4(0.);
    return;
  }
  vec3 col = fxSrgb(c.rgb / c.a);
  int bi = int(mod(cell.x, 4.)) + int(mod(cell.y, 4.)) * 4;
  col += (BAYER[bi] / 16. - .47) * .2;
  vec3 best = PAL[0];
  float bd = 1e9;
  for (int i = 0; i < 16; i++) {
    vec3 e = (col - PAL[i]) * vec3(.9, 1.2, .7);
    float d = dot(e, e);
    if (d < bd) { bd = d; best = PAL[i]; }
  }
  gl_FragColor = vec4(best, 1.);
}`;

const GLITCH = /* glsl */ `
${COMMON}
void main() {
  vec2 uv = vUv;
  float t = uTime;
  float fr = floor(t * 15.);
  // 찢어지는 띠: 이따금 가로 띠째 옆으로 밀린다. 돌리면 더 자주
  float band = floor(uv.y * 26. + fxHash(vec2(fr, 3.)) * 3.);
  float tearOn = step(.94 - uCharge * .35, fxHash(vec2(band, fr)));
  float tear = tearOn * (fxHash(vec2(band, fr + 7.)) - .5) * .14;
  // 굴러가는 테이프 띠: 위에서 아래로 천천히 내려가며 줄마다 흔들린다
  float roll = 1.15 - fract(t * .11) * 1.3;
  float track = exp(-pow((uv.y - roll) / .03, 2.));
  float wob = (fxHash(vec2(floor(gl_FragCoord.y / (2. * uDpr)), fr)) - .5) * .03 * track;
  uv.x += tear + wob + sin(uv.y * 30. + t * 2.) * .0012;
  // 덩어리 깨짐(데이터모싱): 네모 덩어리가 엉뚱한 자리를 가져다 쓰고 색이 뒤섞인다
  vec2 blk = floor(uv * vec2(18., 10.));
  float moshT = floor(t * 3.);
  float mosh = step(.975 - uCharge * .2, fxHash(blk + moshT * 1.7));
  uv += mosh * (vec2(fxHash(blk + 1.1 + moshT), fxHash(blk + 2.3 + moshT)) - .5) * .1;
  // 색 어긋남
  float split = .004 + .014 * uCharge + .012 * tearOn + .008 * track;
  vec4 cr = texture2D(tColor, uv + vec2(split, 0.));
  vec4 cg = texture2D(tColor, uv);
  vec4 cb = texture2D(tColor, uv - vec2(split, 0.));
  vec3 col = vec3(fxSrgb(cr.rgb).r, fxSrgb(cg.rgb).g, fxSrgb(cb.rgb).b);
  float a = max(max(cr.a, cg.a), cb.a);
  if (mosh > .5) col = fxHash(blk + 5.) > .5 ? col.gbr : vec3(1.) - col;
  // 주사선과 잡음
  float line = mod(floor(gl_FragCoord.y / max(1., uDpr * 1.5)), 2.);
  float grain = fxHash(gl_FragCoord.xy + fr * 13.1);
  col *= .84 + .16 * line;
  col += (grain - .5) * .14 + track * .12;
  // 신호 끊김: 아주 가끔 화면 전체가 눈보라처럼 지지직거린다
  float lost = step(.985, fxHash(vec2(floor(t * 5.), 9.)));
  vec3 snow = vec3(fxHash(floor(gl_FragCoord.xy / (2. * uDpr)) + fr));
  // 바탕 위에도 잡음과 테이프 띠가 반투명하게 덮인다
  vec3 bg = vec3(grain) * (.5 + .5 * track);
  float bga = (.05 + .3 * track) * (.4 + grain) * (.7 + .3 * line);
  vec3 outc = mix(bg, col, a);
  float outa = max(a, bga);
  outc = mix(outc, snow, lost * .85);
  outa = max(outa, lost * .85);
  gl_FragColor = vec4(clamp(outc, 0., 1.) * outa, outa);
}`;

export class Filter {
  constructor(renderer, uniforms) {
    this.renderer = renderer;
    this.mode = null;
    this.size = new Vector2(1, 1);
    this.dpr = 1;
    this.block = 1;
    this.scene = new Scene();
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new Mesh(new PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    const shared = {
      tColor: { value: null },
      uRes: { value: new Vector2() },
      uDpr: { value: 1 },
      uTime: uniforms.uTime,
      uCharge: uniforms.uCharge,
    };
    const make = (fragmentShader, extra = {}) => new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader,
      uniforms: { ...shared, ...extra },
      blending: NoBlending,
      depthTest: false,
      depthWrite: false,
    });
    this.shared = shared;
    this.materials = {
      toon: make(TOON, {
        tDepth: { value: null },
        uNear: { value: 0.1 },
        uFar: { value: 100 },
        uInk: { value: [0.07, 0.06, 0.11] },
      }),
      pixel: make(PIXEL, { uLow: { value: new Vector2() } }),
      glitch: make(GLITCH),
    };
  }

  /** 필터를 고른다. 없으면 null */
  set(mode) {
    const next = this.materials[mode] ? mode : null;
    if (next === this.mode) return;
    this.mode = next;
    this.alloc();
  }

  /** 그리는 버퍼 크기(장치 픽셀)와 픽셀 비율 */
  setSize(width, height, dpr) {
    this.size.set(width, height);
    this.dpr = dpr;
    this.alloc();
  }

  alloc() {
    this.target?.depthTexture?.dispose();
    this.target?.dispose();
    this.target = null;
    this.block = 1;
    if (!this.mode) return;
    const { x: w, y: h } = this.size;
    if (this.mode === 'pixel') {
      // 큐브가 가로세로 일흔 칸 남짓으로 보이게
      this.block = Math.max(2, Math.round(Math.min(w, h) / 125));
      const lw = Math.ceil(w / this.block);
      const lh = Math.ceil(h / this.block);
      this.target = new WebGLRenderTarget(lw, lh, { type: HalfFloatType, minFilter: NearestFilter, magFilter: NearestFilter });
      this.materials.pixel.uniforms.uLow.value.set(lw, lh);
    } else if (this.mode === 'toon') {
      this.target = new WebGLRenderTarget(w, h, { type: HalfFloatType, depthTexture: new DepthTexture(w, h) });
      this.materials.toon.uniforms.tDepth.value = this.target.depthTexture;
    } else {
      this.target = new WebGLRenderTarget(w, h, { type: HalfFloatType, samples: 4 });
    }
    this.shared.tColor.value = this.target.texture;
    this.shared.uRes.value.set(w, h);
    this.shared.uDpr.value = this.dpr;
  }

  render(scene, camera) {
    const r = this.renderer;
    if (this.mode === 'toon') {
      this.materials.toon.uniforms.uNear.value = camera.near;
      this.materials.toon.uniforms.uFar.value = camera.far;
    }
    r.setRenderTarget(this.target);
    r.render(scene, camera);
    r.setRenderTarget(null);
    this.quad.material = this.materials[this.mode];
    r.render(this.scene, this.camera);
  }
}
