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

// 컬러 클래시: 8×8 칸 묶음 안에서는 두 색(잉크와 종이)만 쓴다
vec3 fxClash(vec2 cell, vec3 col, float b) {
  vec2 blk = floor(cell / 8.) * 8.;
  vec3 hi = vec3(0.), lo = vec3(1.);
  float lhi = -1., llo = 2.;
  for (int y = 0; y < 8; y += 2) {
    for (int x = 0; x < 8; x += 2) {
      vec4 s = fxRaw(blk + vec2(float(x), float(y)));
      float l = fxLum(s.rgb) + (s.a > 0. ? length(s.rgb - vec3(fxLum(s.rgb))) * .5 : 0.);
      if (l > lhi) { lhi = l; hi = s.rgb; }
      if (l < llo) { llo = l; lo = s.rgb; }
    }
  }
  vec3 paper = fxNearest(hi);
  vec3 ink = fxNearest(lo);
  float dp = distance(col, paper), di = distance(col, ink);
  return di / max(di + dp, 1e-3) + b * uDither > .5 ? paper : ink;
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
  if (uMode == 2) return vec4(fxClash(cell, col, b), 1.);
  if (uMode == 3) {
    // LED: 색은 팔레트의 꽉 찬 색, 밝기는 네 단
    float m = max(max(col.r, col.g), col.b);
    float lv = clamp(floor(m * 3. + .5 + b * uDither), 0., 3.) / 3.;
    return vec4(fxNearest(col / max(m, .01)) * lv, 1.);
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
  return m < .12 ? vec3(0.) : step(m * .6, c);
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

// 점자 아트: 글자 칸 하나가 2×4 점. 밝은 자리만 점을 찍고, 글자마다 가장 밝은 점의 색으로 쓴다
vec4 fxBraille(vec2 g) {
  vec2 cell = floor(g), f = fract(g);
  vec2 o = floor(cell / vec2(2., 4.)) * vec2(2., 4.);
  vec2 sub = cell - o;
  vec3 fg = vec3(0.);
  float bl = -1.;
  for (int i = 0; i < 8; i++) {
    vec4 s = fxRaw(o + vec2(float(i % 2), float(i / 2)));
    if (s.a < .5) continue;
    float l = fxLum(s.rgb);
    if (l > bl) { bl = l; fg = s.rgb; }
  }
  vec4 me = fxRaw(cell);
  float l = me.a > .5 ? pow(clamp(fxLum(me.rgb * uGain), 0., 1.), uGamma) : 0.;
  float on = step(.5, l + fxBayer(cell) * uDither) * step(.5, me.a);
  vec3 ink = fxNearest(fg / max(max(max(fg.r, fg.g), fg.b), .05));
  vec2 c = vec2(sub.x < .5 ? .64 : .36, .5 + (sub.y - 1.5) * .08);
  float d = 1. - smoothstep(.2, .27, length(f - c));
  return vec4(mix(uBg.rgb, ink, d * on), 1.);
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
    float kk = (1. - max(max(s.r, s.g), s.b)) * .85;
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
    float dk = clamp(k == 0 ? d.x : (k == 1 ? d.y : d.z), 0., 1.);
    float grain = fxHash(floor(gl_FragCoord.xy / (uDpr * 1.5)) + float(k) * 17.3);
    float on = step(grain, dk * 1.08 - .04);
    outc *= mix(vec3(1.), uPal[k], on * .92);
  }
  return vec4(outc, 1.);
}

// 모자이크 타일: 손으로 쪼갠 네모난 돌·유리 조각을 줄눈 사이로 박았다. 조각마다 빛깔이 조금씩 다르고 유리 조각은 반짝인다
vec4 fxTessera(vec2 g) {
  vec2 ip = floor(g);
  float d1 = 9., d2 = 9.;
  vec2 best = ip, bp = ip;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 c = ip + vec2(float(x), float(y));
      vec2 p = c + .5 + (vec2(fxHash(c), fxHash(c + 7.31)) - .5) * .5;
      vec2 dv = abs(g - p);
      float dd = pow(pow(dv.x, 4.) + pow(dv.y, 4.), .25);
      if (dd < d1) { d2 = d1; d1 = dd; best = c; bp = p; }
      else if (dd < d2) d2 = dd;
    }
  }
  float edge = d2 - d1;
  vec4 r = fxRaw(best);
  float h = fxHash(best + 3.7);
  vec3 tile = r.a > .5 ? fxNearest(min(r.rgb * uGain, vec3(1.))) : uLine.rgb;
  tile *= .88 + .2 * h;
  vec2 q = g - bp;
  tile *= 1. + dot(normalize(q + 1e-4), vec2(-.7071, .7071)) * .12 * smoothstep(.05, .3, length(q)) * (1. - smoothstep(.0, .25, edge));
  tile *= 1. - .2 * (1. - smoothstep(.06, .2, edge));
  float glass = step(.55, h);
  tile += glass * exp(-dot(q - vec2(-.15, .15), q - vec2(-.15, .15)) * 40.) * .35;
  tile *= .94 + .06 * fxHash(floor(gl_FragCoord.xy / uDpr));
  vec3 grout = uBg.rgb * (.85 + .15 * fxHash(floor(gl_FragCoord.xy / uDpr * .7)));
  return vec4(mix(grout, tile, smoothstep(.05, .1, edge)), 1.);
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
  if (uCell == 15) { gl_FragColor = fxTessera(g); return; }
  if (uCell == 16) { gl_FragColor = fxBraille(g); return; }
  // 핀보드는 줄마다 반 칸씩 엇갈린다
  if (uCell == 14) g.x -= mod(floor(g.y), 2.) * .5;
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
  } else if (uCell == 2) {
    // LED 전광판: 둥근 알 하나하나, 꺼진 알은 어둡게 보이고 켜진 알은 둘레로 번진다
    float r = length(q);
    float dotM = 1. - smoothstep(.3, .38, r);
    vec3 lit = cc.a > .75 ? col : vec3(0.);
    outc = mix(vec3(.012), max(uBg.rgb, lit), dotM);
    outc += lit * exp(-r * r * 9.) * .35;
    vec3 glow = vec3(0.);
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        if (x == 0 && y == 0) continue;
        vec2 o = vec2(float(x), float(y));
        vec4 n = fxRaw(cell + o);
        vec2 dv = q - o;
        glow += n.rgb * n.a * exp(-dot(dv, dv) * 4.5);
      }
    }
    outc += glow * .12;
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
  } else if (uCell == 8) {
    // 플립닷: 칸마다 한쪽은 형광, 한쪽은 검은 원판이 축에 매달려 뒤집힌다. 원판 아래로 그림자, 가운데 축
    float r = length(q);
    float disc = 1. - smoothstep(.4, .44, r);
    vec3 face = cc.a > 0. ? col : uPal[0];
    vec3 dsc = face * (.82 + .3 * dot(q, vec2(-.7071, .7071)) * 2.) * (1. - .4 * (1. - smoothstep(.015, .04, abs(q.y))));
    dsc += vec3(1.) * exp(-dot(q - vec2(-.16, .16), q - vec2(-.16, .16)) * 50.) * .12 * fxLum(face);
    float shadow = (1. - smoothstep(.36, .5, length(q - vec2(.06, -.06)))) * (1. - disc);
    outc = mix(uBg.rgb * (1. - shadow * .7), dsc, disc);
  } else if (uCell == 9) {
    // VGA: 줄을 두 번 그려 화소 줄 사이로 가는 어두운 틈이 진다
    if (cc.a > 0.) outc = col * (1. - .3 * smoothstep(.8, .95, 1. - f.y));
    else { outc = uBg.rgb; outa = uBg.a; }
  } else if (uCell == 11) {
    // 액정 확대: 화소 하나가 빨강·초록·파랑 막대 셋, 사이는 검은 격자
    vec3 base = cc.a > 0. ? col : uBg.rgb;
    float k = floor(f.x * 3.);
    float fx = fract(f.x * 3.);
    float bar = smoothstep(.08, .16, fx) * (1. - smoothstep(.8, .88, fx)) * smoothstep(.05, .12, f.y) * (1. - smoothstep(.88, .95, f.y));
    vec3 chn = k < .5 ? vec3(base.r, 0., 0.) : (k < 1.5 ? vec3(0., base.g, 0.) : vec3(0., 0., base.b));
    outc = chn * bar * 1.9 + base * .06;
  } else if (uCell == 14) {
    // 빛 핀보드: 검은 종이에 꽂은 반투명 핀. 켜진 핀은 속에서 빛나고 꼭대기 면이 각지게 반짝인다
    float r = length(q);
    vec3 hole = uBg.rgb * (1. - (1. - smoothstep(.1, .14, r)) * .6);
    if (cc.a > .75 && fxLum(col) > .04) {
      float peg = 1. - smoothstep(.37, .43, r);
      float facet = .5 + .5 * cos(atan(q.y, q.x) * 6.);
      vec3 pc = col * (.7 + .65 * exp(-r * r * 9.)) * (.9 + .18 * facet * smoothstep(.12, .35, r));
      pc += exp(-dot(q - vec2(-.13, .13), q - vec2(-.13, .13)) * 70.) * .45;
      outc = mix(hole, pc, peg) + col * exp(-r * r * 2.5) * .3 * (1. - peg);
    } else outc = hole;
  } else if (uCell == 17) {
    // 빨간 고글: 빨간 빛줄이 줄줄이 그어지고, 비껴 겹친 흐린 상이 깊이를 준다
    vec3 base = cc.a > 0. ? col : uBg.rgb;
    float row = exp(-pow((f.y - .5) / .27, 2.));
    vec4 gh = fxCell(cell + vec2(2., 0.));
    outc = base * row * 1.15 + (gh.a > 0. ? gh.rgb : vec3(0.)) * row * .16 + base * .07;
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
//   mode     palette 가장 가까운 색 | ramp 밝기 사다리(단색 화면) | clash 8×8 칸마다 두 색 | led 꽉 찬 색 × 네 단 밝기 | levels 채널마다 몇 단
//   cell     square 네모 | lcd 액정 | led 전광판 알 | brick 돌기 블록 | bead 비즈 | ascii 글자 | crt 단색 모니터 | arcade 형광 줄
//            flipdot 뒤집히는 원판 | vga 두 번 그린 줄 | teletext 2×3 모자이크 글자 | subpixel 빨강·초록·파랑 막대
//            halftone 네 판 망점 | riso 형광 잉크 세 판 | peg 엇갈린 빛 핀 | tessera 돌·유리 조각 | braille 2×4 점자 | scope 빨간 빛줄
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
  bg: null, line: '#000000',
};
const MODES = { palette: 0, ramp: 1, clash: 2, led: 3, levels: 4 };
const CELLS = {
  square: 0, lcd: 1, led: 2, brick: 3, bead: 4, ascii: 5, crt: 6, arcade: 7, flipdot: 8, vga: 9, teletext: 10,
  subpixel: 11, halftone: 12, riso: 13, peg: 14, tessera: 15, braille: 16, scope: 17,
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
    this.animated = next === 'glitch';
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
