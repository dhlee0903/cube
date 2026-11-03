import {
  DepthTexture, HalfFloatType, Mesh, NearestFilter, NoBlending, OrthographicCamera, PlaneGeometry, Scene,
  ShaderMaterial, Vector2, Vector3, Vector4, WebGLRenderTarget,
} from 'three';
import { PAINT_TYPES, paintShader } from './paint.js';

// 화면 필터. 장면을 한 번 텍스처에 그린 뒤, 그 그림 전체에 효과를 입혀 화면에 옮긴다.
// 스티커에 무늬를 그리는 대신 렌더링 자체가 카툰, 8비트 게임, 고장 난 화면처럼 보이게 한다.
//   toon    셀 애니메이션. 깊이가 끊기는 곳(실루엣, 조각 사이)에 먹선을 긋는다
//   pixel   8비트 게임. 낮은 해상도로 그려 칸칸이 키우고, 적은 색 팔레트에 바이어 디더링, 스프라이트 테두리.
//           팔레트와 칸 모양을 바꿔 휴대 게임기 액정, 1비트, CGA, LED 전광판, 아스키, 블록 모자이크, 플립닷,
//           텔레텍스트, 망점 인쇄, 리소 인쇄, 모자이크 타일, 점자 등이 된다
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
uniform vec3 uPal[16];
uniform int uPalN;
uniform int uMode;
uniform int uCell;
uniform float uDither;
uniform float uGamma;
uniform float uLevels;
uniform float uGain;
uniform vec4 uBg;
uniform vec4 uLine;
const float BAYER[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
// 아스키 글자 5×7: 빈칸 - . : + = % * # @ (성긴 것부터 빽빽한 것)
const int GLYPH[70] = int[70](
  0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 14, 0, 0, 0,
  0, 0, 0, 0, 0, 12, 12,
  0, 12, 12, 0, 12, 12, 0,
  0, 4, 4, 31, 4, 4, 0,
  0, 0, 31, 0, 31, 0, 0,
  24, 25, 2, 4, 8, 19, 3,
  0, 21, 14, 31, 14, 21, 0,
  10, 10, 31, 10, 31, 10, 10,
  14, 17, 23, 21, 23, 16, 15);

float fxBayer(vec2 c) { return BAYER[int(mod(c.x, 4.)) + int(mod(c.y, 4.)) * 4] / 16. - .47; }
float fxLum(vec3 c) { return dot(c, vec3(.3, .59, .11)); }

// 팔레트에서 가장 가까운 색
vec3 fxNearest(vec3 col) {
  vec3 best = uPal[0];
  float bd = 1e9;
  for (int i = 0; i < 16; i++) {
    if (i >= uPalN) break;
    vec3 e = (col - uPal[i]) * vec3(.9, 1.2, .7);
    float d = dot(e, e);
    if (d < bd) { bd = d; best = uPal[i]; }
  }
  return best;
}

// 장면 색 그대로(sRGB). 빈 칸은 a가 0
vec4 fxRaw(vec2 cell) {
  vec4 c = texture2D(tColor, (cell + .5) / uLow);
  return c.a > .5 ? vec4(fxSrgb(c.rgb / c.a), 1.) : vec4(0.);
}

// 칸 하나의 색. a: 1 채움, .5 스프라이트 테두리, 0 빈 칸
vec4 fxCell(vec2 cell) {
  vec4 r = fxRaw(cell);
  if (r.a < .5) {
    if (uLine.a > 0.) {
      float near = max(max(fxRaw(cell + vec2(1., 0.)).a, fxRaw(cell - vec2(1., 0.)).a),
                       max(fxRaw(cell + vec2(0., 1.)).a, fxRaw(cell - vec2(0., 1.)).a));
      if (near > .5) return vec4(uLine.rgb, .5);
    }
    return vec4(0.);
  }
  vec3 col = min(r.rgb * uGain, vec3(1.));
  float b = fxBayer(cell);
  if (uMode == 1) {
    // 밝기 사다리(단색 화면): 팔레트는 어두운 색부터 밝은 색 순서
    float n = float(uPalN - 1);
    float l = pow(clamp(fxLum(col), 0., 1.), uGamma);
    return vec4(uPal[int(clamp(floor(l * n + .5 + b * uDither), 0., n))], 1.);
  }
  if (uMode == 4) {
    // 채널마다 몇 단으로 끊기
    float n = uLevels - 1.;
    return vec4(clamp(floor(col * n + .5 + b * uDither), 0., n) / n, 1.);
  }
  return vec4(fxNearest(col + b * uDither), 1.);
}


// 장면을 아무 자리에서나 읽는다(sRGB). 빈 곳은 r이 -1
vec3 fxAt(vec2 g) {
  vec4 c = texture2D(tColor, clamp(g / uLow, 0., 1.));
  return c.a > .5 ? min(fxSrgb(c.rgb / c.a) * uGain, vec3(1.)) : vec3(-1.);
}

// 텔레텍스트 여덟 색: 가장 밝은 채널의 6할을 넘는 채널만 켠다(그늘져도 같은 색)
vec3 fxTtx(vec4 s) {
  if (s.a < .5) return vec3(0.);
  vec3 c = s.rgb * uGain;
  float m = max(max(c.r, c.g), c.b);
  float n = min(min(c.r, c.g), c.b);
  // 어두운 회색(몸통, 틈)은 검정으로 둔다
  if (m < .12 || (m - n < m * .25 && m < .62)) return vec3(0.);
  return step(m * .6, c);
}

// 텔레텍스트: 글자 칸 하나가 2×3 블록. 글자 칸마다 한 색만 쓰고, 블록 둘레로 틈이 벌어진다(떨어진 모자이크)
vec4 fxTeletext(vec2 g) {
  vec2 cell = floor(g), f = fract(g);
  vec2 o = floor(cell / vec2(2., 3.)) * vec2(2., 3.);
  vec3 cs[6];
  for (int i = 0; i < 6; i++) cs[i] = fxTtx(fxRaw(o + vec2(float(i % 2), float(i / 2))));
  vec3 fg = vec3(0.);
  float bn = 0.;
  for (int i = 0; i < 6; i++) {
    if (cs[i] == vec3(0.)) continue;
    float n = fxLum(cs[i]) * .1;
    for (int j = 0; j < 6; j++) n += cs[j] == cs[i] ? 1. : 0.;
    if (n > bn) { bn = n; fg = cs[i]; }
  }
  vec3 me = fxTtx(fxRaw(cell));
  float on = me == fg && fg != vec3(0.) ? 1. : 0.;
  float blk = step(.16, f.x) * step(f.x, .96) * step(.04, f.y) * step(f.y, .86);
  vec3 col = mix(uBg.rgb, fg, on * blk);
  col *= .9 + .1 * smoothstep(.0, .5, abs(fract(g.y * .5) - .5));
  return vec4(col, 1.);
}

// 망점 인쇄: 시안, 마젠타, 노랑, 먹 네 판을 각도를 달리한 망점으로 찍어 종이 위에 겹친다
vec4 fxHalftone(vec2 g) {
  vec3 outc = uBg.rgb * (.95 + .05 * fxHash(floor(gl_FragCoord.xy / uDpr * .5)));
  for (int k = 0; k < 4; k++) {
    float a = k == 0 ? .2618 : (k == 1 ? 1.309 : (k == 2 ? 0. : .7854));
    mat2 rot = mat2(cos(a), sin(a), -sin(a), cos(a));
    vec2 rp = rot * g;
    vec2 c = floor(rp) + .5;
    vec3 s = fxAt(transpose(rot) * c);
    if (s.r < 0.) continue;
    float kk = pow(1. - max(max(s.r, s.g), s.b), 1.4) * .9;
    float ch = k == 0 ? s.r : (k == 1 ? s.g : s.b);
    float cov = k == 3 ? kk : clamp((1. - ch - kk) / max(1. - kk, .01), 0., 1.);
    float r = sqrt(cov) * .68;
    float ink = 1. - smoothstep(r - .06, r + .06, length(rp - c));
    vec3 ic = k == 0 ? vec3(0., .62, .9) : (k == 1 ? vec3(.9, .08, .52) : (k == 2 ? vec3(1., .9, 0.) : vec3(.13, .11, .12)));
    outc *= mix(vec3(1.), ic, ink * .94);
  }
  return vec4(outc, 1.);
}

// 리소 인쇄: 형광 잉크 세 판(uPal 0~2)을 거친 알갱이로 찍는다. 판마다 살짝 어긋나 가장자리에 색이 비어져 나온다
vec4 fxRiso(vec2 g) {
  vec3 paper = uBg.rgb;
  vec3 outc = paper * (.95 + .05 * fxHash(floor(gl_FragCoord.xy / uDpr)));
  mat3 A = mat3(-log(max(uPal[0], .04)), -log(max(uPal[1], .04)), -log(max(uPal[2], .04)));
  mat3 Ai = inverse(A);
  for (int k = 0; k < 3; k++) {
    vec2 off = k == 0 ? vec2(.45, -.3) : (k == 1 ? vec2(-.4, .25) : vec2(.1, .4));
    vec3 s = fxAt(g + off);
    if (s.r < 0.) continue;
    vec3 d = Ai * (-log(clamp(s, .03, 1.) / paper));
    float dk = smoothstep(.04, .8, k == 0 ? d.x : (k == 1 ? d.y : d.z));
    float grain = fxHash(floor(gl_FragCoord.xy / (uDpr * 1.5)) + float(k) * 17.3);
    float on = step(grain, dk * 1.08 - .04);
    outc *= mix(vec3(1.), uPal[k], on * .92);
  }
  return vec4(outc, 1.);
}

// 이웃 네 칸을 섞어 부드럽게 읽는다(빈 칸은 바탕색)
vec4 fxAtL(vec2 g) {
  vec2 p = g - .5;
  vec2 i = floor(p), t = fract(p);
  vec4 s00 = fxRaw(i), s10 = fxRaw(i + vec2(1., 0.)), s01 = fxRaw(i + vec2(0., 1.)), s11 = fxRaw(i + vec2(1., 1.));
  vec3 c00 = mix(uBg.rgb, s00.rgb, s00.a), c10 = mix(uBg.rgb, s10.rgb, s10.a);
  vec3 c01 = mix(uBg.rgb, s01.rgb, s01.a), c11 = mix(uBg.rgb, s11.rgb, s11.a);
  vec3 c = mix(mix(c00, c10, t.x), mix(c01, c11, t.x), t.y);
  return vec4(min(c * uGain, vec3(1.)), mix(mix(s00.a, s10.a, t.x), mix(s01.a, s11.a, t.x), t.y));
}

// 만화 스크린톤: 흰 종이에 먹. 색마다 다른 톤을 붙이고(노랑 잔 망점, 주황 굵은 망점, 빨강 빗금, 초록 가로줄, 파랑 십자 빗금,
// 보라 세로줄, 흰색은 종이), 짙을수록 촘촘하며 아주 어두운 데는 먹으로 칠한다. 색과 밝기가 바뀌는 경계엔 먹선
vec4 fxTone(vec2 g) {
  vec4 r = fxAtL(g);
  vec3 c = r.rgb;
  vec2 sp = gl_FragCoord.xy / uDpr;
  vec3 paper = uBg.rgb, ink = uPal[0];
  float e = .6;
  vec4 rx1 = fxAtL(g + vec2(e, 0.)), rx0 = fxAtL(g - vec2(e, 0.)), ry1 = fxAtL(g + vec2(0., e)), ry0 = fxAtL(g - vec2(0., e));
  float edge = length(vec2(fxLum(rx1.rgb) - fxLum(rx0.rgb), fxLum(ry1.rgb) - fxLum(ry0.rgb))) * 2.2
    + length(vec2(rx1.a - rx0.a, ry1.a - ry0.a)) + (distance(rx1.rgb, rx0.rgb) + distance(ry1.rgb, ry0.rgb)) * .6;
  float mx = max(max(c.r, c.g), c.b), mn = min(min(c.r, c.g), c.b);
  float sat = (mx - mn) / max(mx, .01);
  float h = 0.;
  if (mx - mn > .001) {
    if (mx == c.r) h = mod((c.g - c.b) / (mx - mn), 6.);
    else if (mx == c.g) h = (c.b - c.r) / (mx - mn) + 2.;
    else h = (c.r - c.g) / (mx - mn) + 4.;
  }
  h /= 6.;
  float dark = clamp(1. - mx, 0., 1.);
  float o = 0.;
  if (r.a > .3) {
    vec2 rd = mat2(.7071, .7071, -.7071, .7071) * sp / 7.;
    float dotD = length(fract(rd) - .5);
    float diag = abs(fract((sp.x + sp.y) / 9.) - .5);
    float hor = abs(fract(sp.y / 6.) - .5);
    float ver = abs(fract(sp.x / 6.) - .5);
    float anti = abs(fract((sp.x - sp.y) / 9.) - .5);
    if (sat < .3) o = mx > .72 ? 0. : 1. - smoothstep(.22, .26, dotD + (mx - .72) * .5);
    else if (h < .04 || h > .93) o = 1. - smoothstep(.12 + dark * .25, .16 + dark * .25, diag);
    else if (h < .11) o = 1. - smoothstep(.3 + dark * .15, .34 + dark * .15, dotD);
    else if (h < .21) o = 1. - smoothstep(.16 + dark * .2, .2 + dark * .2, dotD);
    else if (h < .47) o = 1. - smoothstep(.12 + dark * .25, .16 + dark * .25, hor);
    else if (h < .75) o = max(1. - smoothstep(.09 + dark * .2, .13 + dark * .2, diag), 1. - smoothstep(.09 + dark * .2, .13 + dark * .2, anti));
    else o = 1. - smoothstep(.12 + dark * .25, .16 + dark * .25, ver);
    o = max(o, smoothstep(.82, .9, dark));
  }
  o = max(o, smoothstep(.35, .6, edge));
  return vec4(mix(paper * (.97 + .03 * fxHash(floor(sp))), ink, o), 1.);
}

// 유리 블록: 줄눈 사이로 쌓은 두꺼운 유리 블록. 블록마다 가운데 동심 물결이 뒤의 장면을 뒤집고 일그러뜨리며,
// 가장자리는 두꺼워 짙고 비스듬한 반사 줄이 지나간다
vec4 fxGlassBlock(vec2 g) {
  float B = 5.;
  vec2 bp = g / B;
  vec2 bi = floor(bp), q = fract(bp) - .5;
  float rr = length(q);
  float box = max(abs(q.x), abs(q.y));
  vec2 lens = -q * .55 + normalize(q + 1e-4) * sin(rr * 44.) * .03;
  vec4 s = fxAtL((bi + .5 + lens) * B);
  vec3 glass = s.rgb * vec3(.9, 1., .96) * (.8 + .25 * smoothstep(.45, .1, rr));
  float rim = smoothstep(.33, .43, box);
  glass = mix(glass, glass * .55 + vec3(.1, .13, .12), rim * .6);
  glass += (1. - smoothstep(.0, .03, abs(q.x + q.y + .12))) * .12 * (1. - rim);
  glass += smoothstep(.43, .45, box) * (1. - smoothstep(.45, .46, box)) * .25 * step(0., q.y - q.x);
  float mortar = smoothstep(.45, .47, box);
  vec3 mt = uLine.rgb * (.85 + .15 * fxHash(floor(gl_FragCoord.xy / uDpr)));
  return vec4(mix(glass, mt, mortar), 1.);
}

// 도트 프린터: 양옆에 송곳 구멍이 난 초록 줄 연속 용지에, 네 색 리본으로 점을 찍어 그린다.
// 헤드가 지나간 줄마다 살짝 어긋나고 리본 진하기가 다르며, 줄 사이엔 가는 틈
vec4 fxPrinter(vec2 g) {
  vec2 sp = gl_FragCoord.xy / uDpr;
  float W = uRes.x / uDpr;
  float margin = min(sp.x, W - sp.x);
  vec3 paper = mod(floor(sp.y / 36.), 2.) > .5 ? vec3(.84, .93, .85) : uBg.rgb;
  paper = mix(paper, uBg.rgb, step(margin, 34.));
  paper *= .97 + .03 * fxHash(floor(sp / 2.));
  float pass = floor(g.y / 8.);
  vec2 gg = g + vec2((fxHash(vec2(pass, 3.)) - .5) * .35, 0.);
  vec2 c2 = floor(gg), f2 = fract(gg);
  vec4 r = fxRaw(c2);
  vec3 o = paper;
  if (r.a > .5) {
    vec3 ink = fxNearest(min(r.rgb * uGain, vec3(1.)) + fxBayer(c2) * uDither);
    float dt = 1. - smoothstep(.4, .56, length(f2 - .5 + (vec2(fxHash(c2), fxHash(c2 + 3.)) - .5) * .08));
    float wear = .82 + .18 * fxHash(vec2(pass, 9.));
    o = mix(o, o * mix(vec3(1.), ink, wear), dt * step(fxLum(ink), .97));
  }
  o *= 1. - .06 * (1. - smoothstep(0., .1, fract(gg.y / 8.)));
  float hole = 1. - smoothstep(4., 5., length(vec2(margin - 15., mod(sp.y, 20.) - 10.)));
  float perf = (1. - smoothstep(.4, 1., abs(margin - 32.))) * step(mod(sp.y, 6.), 3.);
  o = mix(o, o * .8, perf);
  return vec4(mix(o, vec3(.18, .17, .16), hole), 1.);
}

// 십자수: 아이다 천의 칸마다 X자 땀 하나. 실은 꼬인 여러 가닥이라 결 따라 빛줄이 비스듬히 돌고, 둥근 단면이라 가운데가
// 밝고 가장자리가 짙다. 위 땀(/)이 아래 땀(\)을 덮고 천에 그림자를 드리운다. 칸 귀마다 바늘구멍, 빈 칸은 천이 보인다
vec4 fxStitch(vec2 g) {
  vec2 cell = floor(g), f = fract(g);
  vec4 r = fxRaw(cell);
  // 천: 성글게 짠 올과 귀의 구멍
  vec2 cq = min(f, 1. - f);
  float hole = 1. - smoothstep(.08, .14, length(cq));
  float weave = .5 + .5 * sin(f.x * 25.13) * sin(f.y * 25.13);
  vec3 cloth = uBg.rgb * (.9 + .1 * weave) * (1. - .55 * hole);
  if (r.a < .5) return vec4(cloth, 1.);
  vec3 th = fxNearest(min(r.rgb * uGain, vec3(1.)));
  float w = .19;
  // 아래 땀 \ 와 위 땀 /
  float d1 = abs(f.x - (1. - f.y)) * .7071, t1 = (f.x + 1. - f.y) * .5;
  float d2 = abs(f.x - f.y) * .7071, t2 = (f.x + f.y) * .5;
  float taper1 = smoothstep(.0, .12, min(t1, 1. - t1)) * .6 + .4;
  float taper2 = smoothstep(.0, .12, min(t2, 1. - t2)) * .6 + .4;
  float s1 = 1. - smoothstep(w * taper1 - .02, w * taper1 + .02, d1);
  float s2 = 1. - smoothstep(w * taper2 - .02, w * taper2 + .02, d2);
  // 위 땀이 아래 천에 드리운 그림자
  float d2s = abs((f.x - .05) - (f.y + .05)) * .7071;
  float sh = (1. - smoothstep(w, w + .08, d2s)) * (1. - s2);
  vec3 col = cloth * (1. - .35 * sh);
  // 실 한 가닥의 빛: 둥근 단면 + 꼬인 결
  float cyl1 = sqrt(max(0., 1. - pow(d1 / (w * taper1), 2.)));
  float tw1 = .5 + .5 * sin(t1 * 44. + d1 * 60.);
  vec3 c1 = th * (.55 + .5 * cyl1) * (.85 + .25 * tw1) + vec3(.12) * pow(cyl1, 6.) * tw1;
  col = mix(col, c1, s1);
  float cyl2 = sqrt(max(0., 1. - pow(d2 / (w * taper2), 2.)));
  float tw2 = .5 + .5 * sin(t2 * 44. - d2 * 60.);
  vec3 c2 = th * (.6 + .55 * cyl2) * (.85 + .25 * tw2) + vec3(.16) * pow(cyl2, 6.) * tw2;
  col = mix(col, c2, s2);
  return vec4(col, 1.);
}

// 펜 플로터 낙서: 종이 위에 펜이 가로줄 하나씩을 물결로 긋는다. 어두운 곳일수록 물결이 크게 출렁여 선 한 줄의 떨림만으로
// 큐브가 떠오른다. 큐브 위에선 그 색 펜, 바탕에선 옅은 회색 펜. 펜이 조금씩 떨려 줄이 살아 움직인다
vec4 fxSquiggle(vec2 g) {
  float row = floor(g.y);
  float yc = row + .5;
  vec4 r = fxAtL(vec2(g.x, yc));
  float L = fxLum(r.rgb);
  // 큐브 위는 늘 크게 출렁이고(어두울수록 더), 바탕은 거의 곧은 줄
  float D = r.a > .3 ? max(1. - L, .5) : 0.;
  float amp = .015 + .45 * D;
  float k = 6.2832 * 1.15;
  float ph = g.x * k + fxHash(vec2(row, 3.)) * 6.28 + uTime * .9;
  float y = yc + amp * sin(ph);
  float dy = amp * k * cos(ph);
  float d = abs(g.y - y) / sqrt(1. + dy * dy);
  float px = fwidth(g.y);
  float wdt = .055 + px * .5;
  float ln = 1. - smoothstep(wdt, wdt + px * 1.2, d);
  vec3 pen = r.a > .3 ? r.rgb / max(max(max(r.r, r.g), r.b), .2) * .82 : vec3(.62, .6, .58);
  vec2 sp = gl_FragCoord.xy / uDpr;
  vec3 paper = uBg.rgb * (.97 + .03 * fxHash(floor(sp * .5)));
  return vec4(mix(paper, pen, ln * mix(.45, 1., smoothstep(.2, .6, r.a))), 1.);
}

// 스크래치 아트: 검은 왁스를 바른 종이를 긁어 밑의 색을 드러낸다. 긁은 자국은 길쭉한 빗금이고 스티커 위는 촘촘히,
// 밝은 스티커는 십자로 한 번 더 긁는다. 밑종이는 큐브가 있는 곳은 그 조각의 색(몸통은 검정), 나머지는 무지개라 바탕에
// 드문드문 난 자국으로만 비친다
float fxScratchLayer(vec2 g, float ang, float thr, out float side) {
  float c = cos(ang), sn = sin(ang);
  vec2 q = mat2(c, sn, -sn, c) * g * 1.5;
  float row = floor(q.y);
  float L = 4.2;
  float off = fxHash(vec2(row, ang * 7.)) * L;
  float seg = floor((q.x + off) / L);
  float h1 = fxHash(vec2(seg, row + ang * 13.));
  float h2 = fxHash(vec2(row * 1.7 + ang, seg * 3.1));
  // 이 자국 한가운데가 스티커인지, 얼마나 밝은지로 긁을지 정한다
  vec2 mid = vec2((seg + .5) * L - off, row + .5) / 1.5;
  vec4 m = fxAtL(mat2(c, -sn, sn, c) * mid);
  float chroma = max(max(m.r, m.g), m.b) - min(min(m.r, m.g), m.b);
  float stk = smoothstep(.12, .25, chroma) * step(.7, m.a);
  float dens = stk > .5 ? .86 + .3 * fxLum(m.rgb) : .014;
  if (h1 > dens - thr) { side = 0.; return 0.; }
  float u = (q.x + off) / L - seg;
  float y = q.y - row - .5 - (h2 - .5) * .25 - (u - .5) * (h2 - .5) * .2;
  float taper = smoothstep(0., .12, u) * smoothstep(1., .88 - h2 * .08, u);
  float w = (.2 + .08 * h2) * taper;
  float px = fwidth(q.y);
  side = y;
  return 1. - smoothstep(w - px * .7, w + px * .7, abs(y));
}
vec4 fxScratch(vec2 g) {
  vec4 r = fxAtL(g);
  vec2 sp = gl_FragCoord.xy / uDpr;
  // 왁스 바탕: 아주 옅은 광택과 결
  float grain = fxHash(floor(sp * .7));
  vec3 coat = vec3(.045, .043, .042) * (.85 + .3 * grain) + .03 * smoothstep(.6, 0., length(vUv - vec2(.3, .8)));
  float s1, s2;
  float a1 = fxScratchLayer(g, .55, 0., s1);
  float a2 = fxScratchLayer(g, -.62, .62, s2);
  float cut = max(a1, a2);
  vec3 bow = .55 + .45 * cos(6.2832 * (g.x / uLow.x * .9 + g.y / uLow.y * .35 + vec3(0., .33, .67)));
  vec3 under = r.a > .7 ? r.rgb / max(max(max(r.r, r.g), r.b), .45) : bow;
  // 홈 바닥은 살짝 거칠고, 한쪽 가장자리가 그늘진다
  float rough = .88 + .12 * fxHash(floor(sp * 1.5));
  float edge = a1 >= a2 ? s1 : s2;
  vec3 groove = under * rough * (.8 + .2 * smoothstep(.15, -.1, edge));
  return vec4(mix(coat, groove, cut), 1.);
}

// 디지털 비: 칸마다 낯선 글자가 바뀌고, 줄마다 빛나는 머리가 위에서 아래로 떨어지며 꼬리를 끈다.
// 큐브는 제 색 글자로 늘 보이고 비가 지나갈 때 더 밝아진다
vec4 fxRain(vec2 g) {
  vec2 cell = floor(g), f = fract(g);
  float spd = .6 + fxHash(vec2(cell.x, 1.)) * 1.2;
  float span = uLow.y * 1.6;
  float head = mod(uTime * spd * 9. + fxHash(vec2(cell.x, 2.)) * span, span);
  float dy = head - (uLow.y - cell.y);
  float trail = dy >= 0. ? exp(-dy * .13) : 0.;
  float isHead = dy >= 0. && dy < 1. ? 1. : 0.;
  float gid = floor(fxHash(cell) * 64. + floor(uTime * (1. + fxHash(cell + 4.) * 3.)) * step(.75, fxHash(cell + 8.)));
  vec2 gp = floor(vec2(f.x * 7. - 1., f.y * 9. - 1.));
  float bit = gp.x >= 0. && gp.x < 5. && gp.y >= 0. && gp.y < 7. ? step(.48, fxHash(vec2(min(gp.x, 4. - gp.x) * 3.1 + gp.y * 7.7, gid))) : 0.;
  vec4 r = fxRaw(cell);
  vec3 o;
  if (r.a > .5) {
    vec3 c = min(r.rgb * uGain, vec3(1.));
    float m = max(max(c.r, c.g), c.b);
    vec3 hue = c / max(m, .05);
    o = hue * bit * (.2 + .55 * m + .35 * trail + .4 * isHead) + hue * .05;
  } else {
    o = uPal[0] * bit * trail * .85 + vec3(.75, 1., .8) * bit * isHead;
  }
  return vec4(uBg.rgb + o, 1.);
}

// 야간 투시경: 초록 형광 한 빛깔로 증폭한 상. 알갱이 잡음이 쉬지 않고 끓고, 밝은 데는 번지며 가끔 흰 점이 튄다.
// 광섬유판의 벌집 무늬가 비치고 둘레는 둥글게 어둡다
vec4 fxNight(vec2 g) {
  vec2 sp = gl_FragCoord.xy / uDpr;
  vec4 r = fxAtL(g);
  float l = fxLum(r.rgb);
  float bl = 0.;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * .785;
    bl += fxLum(fxAtL(g + vec2(cos(a), sin(a)) * 2.5).rgb);
  }
  bl /= 8.;
  float n = fxHash(floor(sp / 1.5) + floor(uTime * 24.) * 1.37) - .5;
  float v = pow(clamp(l, 0., 1.), uGamma) + bl * .3 * smoothstep(.45, 1., bl) + n * .2;
  v += step(.9988, fxHash(floor(sp / 2.) + floor(uTime * 12.) * 3.1)) * .9;
  vec2 hp = sp / 2.6;
  float hc = cos(hp.x * 6.2832) * cos((hp.y * 1.1547 + hp.x * .5) * 6.2832) + cos((hp.y * 1.1547 - hp.x * .5) * 6.2832);
  v *= .93 + .03 * hc;
  vec2 uv = (gl_FragCoord.xy - uRes * .5) / min(uRes.x, uRes.y);
  float vig = 1. - smoothstep(.52, .7, length(uv));
  v = clamp(v, 0., 1.4) * vig;
  vec3 o = mix(uPal[0], uPal[1], clamp(v, 0., 1.)) + uPal[2] * smoothstep(.9, 1.4, v);
  return vec4(o, 1.);
}

float fxGlyph(int ch, vec2 f) {
  vec2 g = floor(vec2(f.x * 7. - 1., (1. - f.y) * 10. - 1.5));
  if (g.x < 0. || g.x > 4. || g.y < 0. || g.y > 6.) return 0.;
  return float((GLYPH[ch * 7 + int(g.y)] >> (4 - int(g.x))) & 1);
}

void main() {
  vec2 g = vUv * uLow;
  if (uCell == 10) { gl_FragColor = fxTeletext(g); return; }
  if (uCell == 12) { gl_FragColor = fxHalftone(g); return; }
  if (uCell == 13) { gl_FragColor = fxRiso(g); return; }
  if (uCell == 22) { gl_FragColor = fxTone(g); return; }
  if (uCell == 23) { gl_FragColor = fxGlassBlock(g); return; }
  if (uCell == 24) { gl_FragColor = fxPrinter(g); return; }
  if (uCell == 25) { gl_FragColor = fxRain(g); return; }
  if (uCell == 26) { gl_FragColor = fxNight(g); return; }
  if (uCell == 28) { gl_FragColor = fxStitch(g); return; }
  if (uCell == 29) { gl_FragColor = fxSquiggle(g); return; }
  if (uCell == 30) { gl_FragColor = fxScratch(g); return; }
  vec2 cell = floor(g);
  vec2 f = fract(g);
  vec2 q = f - .5;
  vec4 cc = fxCell(cell);
  float on = step(.75, cc.a);
  float edge = step(.25, cc.a) * (1. - on);
  vec3 col = cc.rgb;
  vec3 outc;
  float outa = 1.;
  if (uCell == 1) {
    // 액정: 화소 사이로 옅은 격자, 짙은 화소는 뒤판에 살짝 그림자를 드리운다
    vec3 base = cc.a > 0. ? col : uBg.rgb;
    float gap = step(.86, max(f.x, 1. - f.y));
    outc = mix(base, mix(base, uBg.rgb, .5), gap);
    vec4 nb = fxCell(cell + vec2(-1., 1.));
    float shade = (cc.a > 0. ? 0. : 1.) * (nb.a > 0. ? 1. - fxLum(nb.rgb) : 0.) * step(f.x, .25) * step(.75, f.y);
    outc *= 1. - shade * .12;
  } else if (uCell == 3) {
    // 블록 모자이크: 판마다 둥근 돌기 하나, 왼쪽 위에서 빛이 들어 돌기 오른쪽 아래로 그늘
    vec3 base = cc.a > 0. ? col : uBg.rgb;
    float seam = 1. - smoothstep(0., .07, min(min(f.x, f.y), min(1. - f.x, 1. - f.y)));
    float r = length(q);
    float stud = 1. - smoothstep(.26, .29, r);
    float drop = (1. - smoothstep(.24, .33, length(q - vec2(.06, -.07)))) * (1. - stud);
    float side = dot(q / max(r, 1e-3), vec2(-.7071, .7071));
    outc = base * (1. - seam * .35) * (1. - drop * .4);
    outc *= 1. + stud * smoothstep(.17, .28, r) * side * .35;
    outc += stud * (1. - smoothstep(0., .14, length(q - vec2(-.09, .09)))) * .12;
  } else if (uCell == 4) {
    // 비즈: 녹여 붙인 구슬 고리, 가운데 구멍으로 판이 비친다
    float r = length(q);
    vec3 board = uBg.rgb * (1. - (1. - smoothstep(.06, .1, r)) * .18);
    if (cc.a > .75) {
      float ring = smoothstep(.12, .16, r) * (1. - smoothstep(.46, .52, r));
      float side = dot(q / max(r, 1e-3), vec2(-.7071, .7071));
      vec3 bead = col * (.82 + .3 * side * smoothstep(.14, .46, r));
      bead += pow(max(0., 1. - abs(r - .3) * 7.), 3.) * .14 * max(side, 0.);
      outc = mix(board * .8, bead, ring);
    } else outc = board;
  } else if (uCell == 5) {
    // 아스키: 칸마다 밝기에 맞는 글자 하나
    float l = cc.a > .75 ? pow(clamp(fxLum(fxRaw(cell).rgb) * uGain, 0., 1.), uGamma) : 0.;
    int ch = cc.a > .75 ? int(clamp(floor(l * 9. + .7), 1., 9.)) : 0;
    outc = mix(uBg.rgb, col, fxGlyph(ch, f));
  } else if (uCell == 6) {
    // 단색 모니터: 줄마다 빛나는 주사선, 옆으로 번지는 형광
    vec3 base = cc.a > 0. ? col : uBg.rgb;
    float scan = exp(-pow((f.y - .5) / .3, 2.));
    vec4 lft = fxCell(cell - vec2(1., 0.)), rgt = fxCell(cell + vec2(1., 0.));
    vec3 bleed = (lft.a > 0. ? lft.rgb : uBg.rgb) * (1. - f.x) + (rgt.a > 0. ? rgt.rgb : uBg.rgb) * f.x;
    outc = (base * .8 + bleed * .2) * (.3 + .85 * scan);
  } else if (uCell == 7) {
    // 오락실 화면: 화소마다 빨강·초록·파랑 형광 줄과 주사선
    vec3 base = cc.a > 0. ? col : uBg.rgb;
    float k = floor(f.x * 3.);
    vec3 mask = k < .5 ? vec3(1., .25, .25) : (k < 1.5 ? vec3(.25, 1., .25) : vec3(.25, .25, 1.));
    float scan = .45 + .55 * exp(-pow((f.y - .5) / .34, 2.));
    outc = base * mask * scan * 1.55;
    vec3 glow = fxRaw(cell + vec2(1., 0.)).rgb + fxRaw(cell - vec2(1., 0.)).rgb + fxRaw(cell + vec2(0., 1.)).rgb + fxRaw(cell - vec2(0., 1.)).rgb;
    outc += glow * .06;
  } else if (uCell == 9) {
    // VGA: 줄을 두 번 그려 화소 줄 사이로 가는 어두운 틈이 진다
    if (cc.a > 0.) outc = col * (1. - .3 * smoothstep(.8, .95, 1. - f.y));
    else { outc = uBg.rgb; outa = uBg.a; }
  } else if (uCell == 27) {
    // 복셀: 화소 하나가 작은 정육면체. 앞면 위로 밝은 윗면, 오른쪽으로 어두운 옆면
    float s = .22;
    bool front = f.x < 1. - s && f.y < 1. - s;
    bool top = f.y >= 1. - s && f.x >= f.y - (1. - s) && f.x < f.y - (1. - s) + 1. - s;
    bool side = f.x >= 1. - s && f.y >= f.x - (1. - s) && f.y < f.x - (1. - s) + 1. - s;
    if (cc.a > 0.) {
      vec3 face = front ? col : top ? min(col * 1.3 + .06, vec3(1.)) : side ? col * .62 : col * .25;
      float edgeL = front ? 1. - smoothstep(.0, .05, min(min(f.x, f.y), min(1. - s - f.x, 1. - s - f.y))) : 0.;
      outc = mix(face, face * .7, edgeL * .5);
      if (!front && !top && !side) { outc = uBg.a > 0. ? uBg.rgb : col * .2; }
    } else {
      outc = uBg.rgb;
      outa = uBg.a;
      vec4 lf = fxCell(cell - vec2(1., 0.)), dn = fxCell(cell - vec2(0., 1.));
      // 이웃 블록이 드리운 그늘
      float sh = max(lf.a > .75 ? (1. - smoothstep(0., .25, f.x)) : 0., dn.a > .75 ? (1. - smoothstep(0., .25, f.y)) * 0. : 0.);
      outa = max(outa, sh * .35);
    }
  } else {
    // 네모 화소
    if (cc.a > 0.) outc = col;
    else { outc = uBg.rgb; outa = uBg.a; }
  }
  gl_FragColor = vec4(clamp(outc, 0., 1.) * outa, outa);
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

// 8비트 필터의 기본값. 테마의 filter에 { type: 'pixel', ... }로 덮어쓴다
//   palette  쓸 수 있는 색(최대 16). ramp일 때는 어두운 색부터
//   mode     palette 가장 가까운 색 | ramp 밝기 사다리(단색 화면) | levels 채널마다 몇 단
//   cell     square 네모 | lcd 액정 | brick 돌기 블록 | bead 비즈 | ascii 글자 | crt 단색 모니터 | arcade 형광 줄
//            vga 두 번 그린 줄 | teletext 2×3 모자이크 글자 | halftone 네 판 망점 | riso 형광 잉크 세 판
//            tone 만화 스크린톤 | glassblock 유리 블록
//            printer 도트 프린터 | rain 디지털 비 | night 야간 투시경 | voxel 작은 정육면체
//            stitch 십자수 | squiggle 펜 플로터 낙서 | scratch 스크래치 아트
//   animated 가만히 있어도 움직이는지(디지털 비, 야간 투시경)
//   res      화면 짧은 쪽을 몇 칸으로 볼지(클수록 촘촘)
//   aspect   칸 세로/가로 비(아스키 글자 칸)
//   gamma    밝기 사다리와 아스키 글자 고르기의 밝기 곡선(1보다 작으면 밝게)
//   gain     색을 고르기 전에 곱하는 밝기
//   bg       빈 칸을 채우는 색(null이면 비워서 배경이 보인다)
//   line     스프라이트 테두리 색(null이면 없음)
const PICO = ['#000000', '#1D2B53', '#7E2553', '#008751', '#AB5236', '#5F574F', '#C2C3C7', '#FFF1E8',
  '#FF004D', '#FFA300', '#FFEC27', '#00E436', '#29ADFF', '#83769C', '#FF77A8', '#FFCCAA'];
const PIXEL_BASE = {
  palette: PICO, mode: 'palette', cell: 'square', res: 125, aspect: 1, dither: 0.2, gamma: 1, levels: 6, gain: 1,
  bg: null, line: '#000000', animated: false,
};
const MODES = { palette: 0, ramp: 1, levels: 4 };
const CELLS = {
  square: 0, lcd: 1, brick: 3, bead: 4, ascii: 5, crt: 6, arcade: 7, vga: 9, teletext: 10,
  halftone: 12, riso: 13, tone: 22, glassblock: 23, printer: 24, rain: 25, night: 26, voxel: 27, stitch: 28, squiggle: 29, scratch: 30,
};
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

// 명화 필터의 기본값. 테마의 filter에 { type: 'oil', ... }로 덮어쓴다
//   bg       그림 속 배경 색 셋(필터마다 쓰는 법이 다르다)
//   palette  물감(최대 12). 우키요에 안료, 쇠라풍 순색, 워홀풍 칸 바탕 넷과 흰 면 대신 칠할 색 넷
//   tiles    화면을 몇 칸으로 나눠 같은 장면을 되풀이하는지(워홀풍 2)
//   animated 가만히 있어도 움직이는지
//   dab, len, swirl, dot, relief, jitter, pastel, line  붓 자국 필터(dabs)의 크기, 길이, 소용돌이, 점 여부, 요철, 색 흔들림, 파스텔, 윤곽
//   align, blunt, varnish, width  붓질을 형태 경계에 맞출지, 붓 끝이 뭉툭한 정도, 니스, 붓 폭
const PAINT_BASE = {
  bg: ['#202020', '#606060', '#A0A0A0'], palette: [], tiles: 1, animated: false,
  dab: 8, len: 1.8, swirl: 1, dot: 0, relief: 0.6, jitter: 0.06, pastel: 0, line: 0, align: 0, blunt: 0, varnish: 0, width: 0.36,
};

export class Filter {
  constructor(renderer, uniforms) {
    this.renderer = renderer;
    this.mode = null;
    this.key = '';
    this.pixel = PIXEL_BASE;
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
    this.make = make;
    this.tiles = 1;
    this.animated = false;
    this.paintUniforms = {
      uBgA: { value: new Vector3() },
      uBgB: { value: new Vector3() },
      uBgC: { value: new Vector3() },
      uPal: { value: new Float32Array(36) },
      uPalN: { value: 0 },
      uDab: { value: 8 },
      uLen: { value: 1.8 },
      uSwirl: { value: 1 },
      uDot: { value: 0 },
      uRelief: { value: 0.6 },
      uJit: { value: 0.06 },
      uPastel: { value: 0 },
      uLine: { value: 0 },
      uAlign: { value: 0 },
      uBlunt: { value: 0 },
      uVarnish: { value: 0 },
      uWide: { value: 0.36 },
    };
    this.materials = {
      toon: make(TOON, {
        tDepth: { value: null },
        uNear: { value: 0.1 },
        uFar: { value: 100 },
        uInk: { value: [0.07, 0.06, 0.11] },
      }),
      pixel: make(PIXEL, {
        uLow: { value: new Vector2() },
        uPal: { value: new Float32Array(48) },
        uPalN: { value: 16 },
        uMode: { value: 0 },
        uCell: { value: 0 },
        uDither: { value: 0.2 },
        uGamma: { value: 1 },
        uLevels: { value: 6 },
        uGain: { value: 1 },
        uBg: { value: new Vector4(0, 0, 0, 0) },
        uLine: { value: new Vector4(0, 0, 0, 1) },
      }),
      glitch: make(GLITCH),
    };
  }

  /** 필터를 고른다. 'toon'·'glitch'·'pixel' 이름이나 { type, ... } 설정. 없으면 null. 화면 크기 계산이 바뀌면 true */
  set(spec) {
    const type = typeof spec === 'string' ? spec : spec?.type;
    // 명화 필터는 처음 쓸 때 셰이더를 만든다
    if (PAINT_TYPES.includes(type) && !this.materials[type]) {
      this.materials[type] = this.make(paintShader(type, COMMON), this.paintUniforms);
    }
    const next = this.materials[type] ? type : null;
    const key = JSON.stringify(spec ?? null);
    if (key === this.key) return false;
    this.key = key;
    this.mode = next;
    if (next === 'pixel') {
      const p = { ...PIXEL_BASE, ...(typeof spec === 'object' ? spec : {}) };
      this.pixel = p;
      const u = this.materials.pixel.uniforms;
      u.uPal.value.fill(0);
      p.palette.slice(0, 16).forEach((c, i) => u.uPal.value.set(rgb(c), i * 3));
      u.uPalN.value = Math.min(16, p.palette.length);
      u.uMode.value = MODES[p.mode] ?? 0;
      u.uCell.value = CELLS[p.cell] ?? 0;
      u.uDither.value = p.dither;
      u.uGamma.value = p.gamma;
      u.uLevels.value = p.levels;
      u.uGain.value = p.gain;
      u.uBg.value.set(...(p.bg ? rgb(p.bg) : [0, 0, 0]), p.bg ? 1 : 0);
      u.uLine.value.set(...(p.line ? rgb(p.line) : [0, 0, 0]), p.line ? 1 : 0);
    }
    this.tiles = 1;
    this.animated = next === 'glitch' || (next === 'pixel' && Boolean(this.pixel.animated));
    if (PAINT_TYPES.includes(next)) {
      const p = { ...PAINT_BASE, ...spec };
      const u = this.paintUniforms;
      u.uBgA.value.set(...rgb(p.bg[0]));
      u.uBgB.value.set(...rgb(p.bg[1]));
      u.uBgC.value.set(...rgb(p.bg[2]));
      u.uPal.value.fill(0);
      p.palette.slice(0, 12).forEach((c, i) => u.uPal.value.set(rgb(c), i * 3));
      u.uPalN.value = Math.min(12, p.palette.length);
      u.uDab.value = p.dab;
      u.uLen.value = p.len;
      u.uSwirl.value = p.swirl;
      u.uDot.value = p.dot;
      u.uRelief.value = p.relief;
      u.uJit.value = p.jitter;
      u.uPastel.value = p.pastel;
      u.uLine.value = p.line;
      u.uAlign.value = p.align;
      u.uBlunt.value = p.blunt;
      u.uVarnish.value = p.varnish;
      u.uWide.value = p.width;
      this.tiles = p.tiles;
      this.animated = p.animated;
    }
    this.alloc();
    return true;
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
      const p = this.pixel;
      this.block = Math.max(2, Math.round(Math.min(w, h) / p.res));
      const lw = Math.ceil(w / this.block);
      const lh = Math.ceil(h / (this.block * p.aspect));
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
