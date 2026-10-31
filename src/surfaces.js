// 테마마다 큐브 겉면에 입히는 질감. MeshStandardMaterial 셰이더 사이사이에 끼워 넣는다.
//
// vLocal   조각 안쪽 좌표. 스티커는 xy 평면(반폭 uSticker.x), 몸통은 ±0.48인 상자
// vSeed    조각(스티커)마다 다른 난수. 같은 무늬가 반복되지 않게 한다
// vTx, vTy 그 면의 가로·세로 방향(시점 공간). 법선을 기울일 때 쓴다
// uFace    스티커가 원래 어느 면 것인지(0~5). 몸통은 -1
// uTime    초      uIntro  테마를 고른 뒤 지난 초
// uCharge  방금 돌린 만큼 차올랐다 빠지는 값(0~1)
// uBlink   조각을 잡는 순간 1, 곧 0으로
// uPointer 손가락·마우스가 가리키는 곳(시점 공간)
// vHome    스티커가 원래 있던 면 위 칸 자리. xy 면 전체를 -1~1로 본 칸 가운데, z 조각 한 칸이 면 좌표로 얼마인지.
//          fxFace()가 면 전체 좌표를 준다. 면 하나에 그림 한 장을 그리면 다 맞췄을 때 그림이 이어진다
//
// 각 질감은 네 군데에 들어간다. 앞에서 선언한 변수는 뒤에서 그대로 쓴다(같은 main 안).
//   color     diffuseColor(바탕색)
//   surface   roughnessFactor, metalnessFactor
//   normal    normal(시점 공간)
//   emissive  totalEmissiveRadiance(스스로 내는 빛)

const UNIFORMS = /* glsl */ `
uniform float uTime;
uniform float uIntro;
uniform float uFlash;
uniform float uCharge;
uniform float uBlink;
uniform vec3 uPointer;
uniform vec3 uBodyGlow;
uniform vec2 uSticker;
uniform float uFace;
`;

const VARYINGS = /* glsl */ `
varying float vSeed;
varying vec3 vLocal;
varying vec3 vTx;
varying vec3 vTy;
varying vec3 vTz;
varying vec3 vHome;
`;

// 정점·조각 셰이더 양쪽에서 쓰는 것
const NOISE = /* glsl */ `
float fxH1(float p) { p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float fxH2(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float fxH3(vec3 q) { q = fract(q * .1031); q += dot(q, q.zyx + 31.32); return fract((q.x + q.y) * q.z); }

float fxN2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3. - 2. * f);
  return mix(mix(fxH2(i), fxH2(i + vec2(1, 0)), u.x), mix(fxH2(i + vec2(0, 1)), fxH2(i + vec2(1, 1)), u.x), u.y);
}

float fxN3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3. - 2. * f);
  return mix(
    mix(mix(fxH3(i), fxH3(i + vec3(1, 0, 0)), u.x), mix(fxH3(i + vec3(0, 1, 0)), fxH3(i + vec3(1, 1, 0)), u.x), u.y),
    mix(mix(fxH3(i + vec3(0, 0, 1)), fxH3(i + vec3(1, 0, 1)), u.x), mix(fxH3(i + vec3(0, 1, 1)), fxH3(i + vec3(1, 1, 1)), u.x), u.y),
    u.z);
}

float fxF2(vec2 p) {
  float s = 0., a = .5;
  for (int i = 0; i < 4; i++) { s += a * fxN2(p); p = p * 2.03 + 17.1; a *= .5; }
  return s;
}

float fxF3(vec3 p) {
  float s = 0., a = .5;
  for (int i = 0; i < 3; i++) { s += a * fxN3(p); p = p * 2.03 + 17.1; a *= .5; }
  return s;
}

float fxBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r;
}

// 스티커 평면 위 점 p가 가장자리에서 안쪽으로 얼마나 들어왔는지(0이 가장자리)
float fxEdgeAt(vec2 p) { return -fxBox(p, vec2(uSticker.x), uSticker.y); }

float fxBeat() {
  float t = fract(uTime * 1.15);
  return exp(-pow((t - .08) / .035, 2.)) + .6 * exp(-pow((t - .26) / .045, 2.));
}

mat2 fxRot(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }

// 보로노이 조각: x 가장 가까운 점까지, y 경계까지(대략), z 조각마다 다른 난수
vec3 fxVoronoi(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 8., d2 = 8., id = 0.;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(x, y);
      vec2 o = vec2(fxH2(i + g), fxH2(i + g + 17.3));
      float d = length(g + o - f);
      if (d < d1) { d2 = d1; d1 = d; id = fxH2(i + g + 41.7); }
      else if (d < d2) d2 = d;
    }
  }
  return vec3(d1, d2 - d1, id);
}

// 손끝·마우스가 가리키는 곳이 스티커 위 점 p와 화면에서 얼마나 가까운지(1이 바로 위). 가리킨 지 오래되면 0으로 사그라든다.
// 정점 셰이더에서는 p로 위치를 계산하고, 조각 셰이더에서는 지금 그리는 점을 쓴다
float fxTouch(vec2 p, float radius) {
#ifdef FX_VERTEX
  #ifdef USE_INSTANCING
  vec3 v = (modelViewMatrix * instanceMatrix * vec4(p, 0., 1.)).xyz;
  #else
  vec3 v = (modelViewMatrix * vec4(p, 0., 1.)).xyz;
  #endif
#else
  vec3 v = -vViewPosition;
#endif
  float on = smoothstep(.3, 1.5, length(uPointer));
  vec2 a = v.xy / max(-v.z, .01);
  vec2 b = uPointer.xy / max(-uPointer.z, .01);
  return on * exp(-dot(a - b, a - b) / (radius * radius));
}

// 육각 칸: xy 칸 중심에서의 위치, z 칸마다 다른 난수, w 벽까지 거리(가운데 약 .5)
vec4 fxHex(vec2 p) {
  vec2 r = vec2(1., 1.7320508);
  vec2 h = r * .5;
  vec2 a = mod(p, r) - h;
  vec2 b = mod(p - h, r) - h;
  vec2 g = dot(a, a) < dot(b, b) ? a : b;
  vec2 q = abs(g);
  float d = max(dot(q, vec2(.5, .8660254)), q.x);
  return vec4(g, fxH2(floor((p - g) * 10. + .5)), .5 - d);
}
`;

// 조각 셰이더에서만 쓰는 것
const FRAG = /* glsl */ `

// 스티커 안 좌표. fxQ는 -1~1, fxUV는 0~1
vec2 fxQ() { return vLocal.xy / uSticker.x; }
// 원래 면 전체 좌표(-1~1). 다 맞추면 면 하나가 그림 한 장이 된다
vec2 fxFace() { return vHome.xy + vLocal.xy * vHome.z; }
vec2 fxUV() { return vLocal.xy / (2. * uSticker.x) + .5; }
// 스티커 가장자리에서 안쪽으로 얼마나 들어왔는지(0이 가장자리)
float fxEdge() { return fxEdgeAt(vLocal.xy); }

// 높이 h만큼 겉이 솟았다고 치고 법선을 기울인다(화면 미분으로 잔결을 살린다)
vec3 fxBump(vec3 n, float h) {
  vec3 dpx = dFdx(-vViewPosition);
  vec3 dpy = dFdy(-vViewPosition);
  float dhx = dFdx(h);
  float dhy = dFdy(h);
  vec3 r1 = cross(dpy, n);
  vec3 r2 = cross(n, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
  return normalize(abs(det) * n - grad);
}

// 몸통 면 위의 2차원 좌표와, 모서리 쪽으로 얼마나 붙었는지
vec2 fxBodyUV() {
  vec3 a = abs(vLocal);
  return a.x > a.y && a.x > a.z ? vLocal.yz : (a.y > a.z ? vLocal.xz : vLocal.xy);
}
float fxBodyRim() {
  vec3 a = abs(vLocal) / .48;
  return max(min(a.x, a.y), max(min(a.y, a.z), min(a.x, a.z)));
}

float fxCaustic(vec2 p, float t) {
  vec2 i = p;
  float c = 1.;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1. - 3.5 / float(n + 1));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1. / length(vec2(p.x / ((sin(i.x + tt) + 1e-4) / .005), p.y / ((cos(i.y + tt) + 1e-4) / .005)));
  }
  c = 1.17 - pow(c / 4., 1.4);
  return clamp(pow(abs(c), 8.), 0., 1.);
}

float fxGlint(vec2 p, float density, float speed) {
  vec2 cell = floor(p);
  float h = fxH2(cell);
  vec2 o = vec2(fxH2(cell + 7.1), fxH2(cell + 3.7)) - .5;
  float d = length(fract(p) - .5 - o * .5);
  return step(1. - density, h) * (1. - smoothstep(0., .22, d)) * pow(max(0., sin(uTime * speed * (1. + h * 2.) + h * 60.)), 10.);
}

// 이 스티커 평면에서 중력이 당기는 쪽(화면 아래)
vec2 fxDown() {
  vec2 d = -vec2(vTx.y, vTy.y);
  return length(d) > .05 ? normalize(d) : vec2(0., -1.);
}

float fxFresnel(vec3 n, float k) { return pow(1. - abs(dot(n, normalize(vViewPosition))), k); }

float fxLine(float d, float w) { return 1. - smoothstep(w - .025, w, d); }

// 멀리서 실이 픽셀보다 작아지면 실 무늬 대신 섞인 색으로 바꿀 정도(물결무늬가 끼지 않게). n은 면 폭당 실 수
float fxClothAA(vec2 F, float n) { return smoothstep(.7, 1.6, max(fwidth(F.x * n * .5), fwidth(F.y * n * .5))); }

// 사막 타일에 새긴 그림. 면마다 다르다(해, 눈, 물결, 피라미드, 앙크, 깃털)
float fxGlyph(vec2 q) {
  float w = .075;
  float d;
  if (uFace < .5) {
    d = min(abs(length(q) - .42), length(q) - .1);
    float ray = abs(fract(atan(q.y, q.x) / 6.2832 * 8.) - .5) * length(q) * 6.2832 / 8.;
    if (length(q) > .55 && length(q) < .78) d = min(d, ray);
  } else if (uFace < 1.5) {
    d = abs(length(q / vec2(.66, .36)) - 1.) * .36;
    d = min(d, length(q) - .12);
    if (q.y < -.2 && q.x > -.1) d = min(d, abs(q.x - .05 + (q.y + .2) * .3) * 1. + max(0., -q.y - .7));
  } else if (uFace < 2.5) {
    float k = abs(fract(q.x * 2.2) - .5) * .32;
    float y = q.y + k;
    d = min(min(abs(y - .38), abs(y)), abs(y + .38));
    d = max(d, abs(q.x) - .66);
  } else if (uFace < 3.5) {
    vec2 p = vec2(abs(q.x), q.y + .1);
    d = max(p.x * .9 + p.y * .45 - .38, -p.y - .42);
    d = abs(d);
    d = min(d, abs(p.y + .05) + max(0., p.x - .3) * 9.);
  } else if (uFace < 4.5) {
    d = abs(length((q - vec2(0., .38)) / vec2(.75, 1.)) - .2);
    d = min(d, max(abs(q.x) - .4, abs(q.y - .08)));
    d = min(d, max(abs(q.x), abs(q.y + .36) - .38));
  } else {
    vec2 e = (q - vec2(.0, .02)) / vec2(.3, .68);
    d = abs(length(e) - 1.) * .3;
    d = min(d, max(abs(q.x), abs(q.y + .1) - .7));
    d = min(d, max(abs(q.x * .6 + q.y * .35 - .1), abs(q.y - .15) - .2) + step(.18, abs(q.x)));
  }
  return fxLine(d, w);
}

// 8비트 타일. 면마다 다르다. 10×10 칸 기준 밝기 배율
`;

const S = {}; // 스티커
const B = {}; // 몸통

// 직물 짜임. 실 하나하나가 날실·씨실 중 어느 쪽이 위로 올라왔는지 계산해서 무늬가 짜임에서 그대로 나오게 한다
const WEAVE = /* glsl */ `
  // x 올라온 실이 날실(1)인지 씨실(0)인지, y 날실 번호, z 씨실 번호, w 실 단면(0 가장자리 ~ 1 가운데)
  // kind 0 평직, 1 2/2 능직, 2 헤링본(능직 방향이 여덟 올마다 뒤집힌다)
  vec4 fxWeave(vec2 F, float n, float kind) {
    vec2 T = (F + 1.) * n * .5;
    vec2 c = floor(T);
    vec2 f = fract(T);
    float top;
    if (kind < .5) top = mod(c.x + c.y, 2.);
    else if (kind < 1.5) top = step(mod(c.x + c.y, 4.), 1.5);
    else top = step(mod(c.x + (mod(floor(c.x / 8.), 2.) > .5 ? c.y : 3. * c.y), 4.), 1.5);
    return vec4(top, c.x, c.y, sin(3.1416 * (top > .5 ? f.x : f.y)));
  }
  // 실결: 꼬인 올이 비스듬히 비친다
  float fxPly(vec2 F, float n, vec4 w) {
    vec2 T = (F + 1.) * n * .5;
    return .5 + .5 * sin((w.x > .5 ? T.y : T.x) * 9. + (w.x > .5 ? fract(T.x) : fract(T.y)) * 5.);
  }
  // 실의 밝기: 단면이 둥근 실, 꼬인 올, 잔털. 멀리서는 고르게
  float fxYarn(vec4 w, float ply, float fuzz, float aa) {
    return (.55 + .5 * mix(w.w, .64, aa)) * (.88 + .14 * mix(ply, .5, aa)) * (.92 + .1 * fuzz);
  }
  // 천을 씌운 쿠션처럼 칸 가운데가 도톰하다
  float fxPillowH(vec2 p, float seed) {
    return smoothstep(0., .06, fxEdgeAt(p)) * (.004 + .014 * smoothstep(0., .45, fxEdgeAt(p) / uSticker.x));
  }
`;

// 5×7 점 글꼴 A~Z. 줄마다 다섯 칸을 비트로(왼쪽이 높은 자리)
const FONT = /* glsl */ `
  const int fxFont[182] = int[182](14, 17, 17, 31, 17, 17, 17, 30, 17, 17, 30, 17, 17, 30, 14, 17, 16, 16, 16, 17, 14, 28, 18, 17, 17, 17, 18, 28, 31, 16, 16, 30, 16, 16, 31, 31, 16, 16, 30, 16, 16, 16, 14, 17, 16, 23, 17, 17, 15, 17, 17, 17, 31, 17, 17, 17, 14, 4, 4, 4, 4, 4, 14, 7, 2, 2, 2, 2, 18, 12, 17, 18, 20, 24, 20, 18, 17, 16, 16, 16, 16, 16, 16, 31, 17, 27, 21, 21, 17, 17, 17, 17, 17, 25, 21, 19, 17, 17, 14, 17, 17, 17, 17, 17, 14, 30, 17, 17, 30, 16, 16, 16, 14, 17, 17, 17, 21, 18, 13, 30, 17, 17, 30, 20, 18, 17, 15, 16, 16, 14, 1, 1, 30, 31, 4, 4, 4, 4, 4, 4, 17, 17, 17, 17, 17, 17, 14, 17, 17, 17, 17, 17, 10, 4, 17, 17, 17, 21, 21, 21, 10, 17, 17, 10, 4, 10, 17, 17, 17, 17, 10, 4, 4, 4, 4, 31, 1, 2, 4, 8, 16, 31);
  // 글자 하나: g는 글자 칸 안 좌표(가로 0~5, 세로 0~7, 위가 0). 칸마다 모서리를 살짝 둥글린다
  float fxGlyph(int ch, vec2 g) {
    if (g.x < 0. || g.x >= 5. || g.y < 0. || g.y >= 7.) return 0.;
    int row = fxFont[ch * 7 + int(g.y)];
    float bit = float((row >> (4 - int(g.x))) & 1);
    vec2 f = fract(g) - .5;
    return bit * (1. - smoothstep(.4, .55, max(abs(f.x), abs(f.y))));
  }
`;

// 니트 코. 다 맞추면 면 하나가 한 판으로 떠진 니트 무늬용
const KNIT = /* glsl */ `
  // 코 하나 안에서: x 실 두께(0~1), y 꼬인 올 결, z 실 방향 좌표
  vec3 fxStitch(vec2 c) {
    vec2 l = vec2(abs(c.x), c.y);
    vec2 q = fxRot(-.6) * (l - vec2(.21, .04));
    float d = length(q * vec2(2.1, 1.));
    float yarn = 1. - smoothstep(.3, .46, d);
    float ply = pow(.5 + .5 * sin(q.y * 50. + q.x * 26.), .7);
    return vec3(yarn * (1. - d / .46), ply, q.y);
  }
  float fxKnitFaceH(vec2 p, float seed) {
    vec2 g = (aHome.xy + p * aHome.z + 1.) * .5 * vec2(42., 54.);
    vec3 st = fxStitch(fract(g) - .5);
    return smoothstep(0., .08, fxEdgeAt(p)) * (.01 + .012 * pow(max(st.x, 0.), .6));
  }
`;


S.plain = {};
B.plain = {};

S.classic = {
  // 비닐 스티커: 아주 잔잔한 결과 매끈한 윤기
  color: `
    float fxV = fxN2(vLocal.xy * 160. + vSeed * 9.);
    diffuseColor.rgb *= .97 + .05 * fxV;`,
  surface: 'roughnessFactor = .14 + .08 * fxV;',
};
B.classic = {
  // 무광 플라스틱의 미세한 결
  color: `
    float fxV = fxN3(vLocal * 140. + vSeed * 5.);
    diffuseColor.rgb *= .9 + .2 * fxV;`,
  surface: 'roughnessFactor = .42 + .12 * fxV;',
};

S.neon = {
  // 가장자리를 따라 빛나는 유리관. 테마를 고르면 칸마다 제각각 깜빡이다 켜진다
  color: `
    float fxE = fxEdge();
    float fxTube = exp(-pow((fxE - .05) / .022, 2.));
    float fxIn = exp(-fxE * 9.);
    float fxFl = .9 + .1 * sin(uTime * (2. + vSeed * 3.) + vSeed * 40.);
    fxFl *= 1. - .7 * step(.994, fxH1(floor(uTime * 14.) + vSeed * 97.));
    float fxBoot = step(fxH1(vSeed * 13. + floor(uIntro * 16.)) * .8 + fxH1(vSeed * 7.) * .5, uIntro * 1.2);
    fxFl *= mix(.03, 1., fxBoot);
    diffuseColor.rgb *= .05 + .45 * fxTube * fxBoot;`,
  surface: 'roughnessFactor = .2;',
  emissive: 'totalEmissiveRadiance = diffuse * (fxTube * 2.6 + fxIn * .55 + .08) * fxFl;',
};
B.neon = {
  // 검은 유리. 가장자리에 옅은 빛줄
  color: `float fxRim = smoothstep(.9, 1., fxBodyRim());`,
  surface: 'roughnessFactor = .12;',
  emissive: 'totalEmissiveRadiance = vec3(.6, .25, 1.) * fxRim * .3;',
};

S.lava = {
  // 용암 호수. 검게 굳은 현무암 판들이 녹은 용암 위를 천천히 떠다니고, 판 사이 틈으로 쇳물이 빛난다.
  // 녹아 있는 광물이 달라 면마다 불빛이 다르다(주황 용암, 붉은 용암, 노란 유황, 파랗게 타는 유황불,
  // 초록으로 타는 구리, 하얗게 달아오른 쇳물). 판 가장자리는 달아올라 있고, 돌리면 판이 녹아 줄어든다
  color: `
    vec2 fxP = fxQ() * 1.35 + vSeed * 9.;
    vec2 fxFlow = vec2(uTime * .04, uTime * .025);
    vec2 fxWp = fxP + (vec2(fxF2(fxP * 1.1 + fxFlow), fxF2(fxP * 1.1 - fxFlow + 7.)) - .5) * 1.1;
    vec3 fxV = fxVoronoi(fxWp + fxFlow);
    float fxGap = .1 + .08 * fxN2(fxWp * 3.) + uCharge * .12 + .03 * sin(uTime * .8 + fxV.z * 20.);
    float fxPlate = smoothstep(fxGap, fxGap + .05, fxV.y);
    float fxCrack = (1. - smoothstep(0., .035, abs(fxN2(fxWp * 5. + fxV.z * 9.) - .5))) * fxPlate;
    float fxMolten = 1. - fxPlate;
    float fxStream = .5 + .5 * sin((fxWp.x + fxWp.y) * 8. - uTime * 1.1 + fxN2(fxWp * 3.) * 4.);
    float fxHotEdge = (1. - smoothstep(fxGap, fxGap + .2, fxV.y)) * fxPlate;
    vec3 fxHot = diffuseColor.rgb;
    vec3 fxRock = vec3(.06, .055, .055) * (.6 + .8 * fxF2(fxWp * 7.)) * (1. - fxCrack * .5);
    diffuseColor.rgb = mix(fxHot * (.7 + .3 * fxStream), fxRock, fxPlate);`,
  surface: 'roughnessFactor = mix(.3, .95, fxPlate);',
  normal: 'normal = fxBump(normal, fxPlate * .004 - fxCrack * .0012);',
  emissive: `
    float fxPulse = .9 + .1 * sin(uTime * 1.7 + vSeed * 12.) + uCharge * .5;
    totalEmissiveRadiance = fxHot * (fxMolten * (.75 + .3 * fxStream) + fxHotEdge * .55 + fxCrack * .35) * fxPulse;`,
};
B.lava = {
  // 현무암 틈새로 빛이 샌다
  color: `
    float fxN = fxF3(vLocal * 5. + vSeed * 17.);
    float fxCrack = 1. - smoothstep(0., .035 + uCharge * .02, abs(fxN - .5));
    diffuseColor.rgb *= .6 + .7 * fxN3(vLocal * 34. + vSeed * 3.);`,
  surface: 'roughnessFactor = .95;',
  emissive: `
    float fxPulse = .65 + .35 * sin(uTime * 1.3 + vSeed * 9. + fxN * 8.) + uCharge;
    totalEmissiveRadiance = uBodyGlow * fxCrack * 1.8 * fxPulse;`,
};

S.water = {
  // 맑은 물 아래 타일 바닥. 칸마다 작은 수영장처럼 면 색 타일이 깔려 있고, 물결에 굴절돼 일렁이며
  // 그 위로 빛그물이 춤춘다. 물 겉도 실제로 일렁여 하늘빛이 비치고 반짝인다
  head: `
    float fxWave(vec2 p, float t) {
      return sin(dot(p, vec2(7.3, 3.1)) + t * 1.7) * .5
           + sin(dot(p, vec2(-4.1, 6.7)) + t * 1.3) * .35
           + sin(dot(p, vec2(2.3, -8.9)) - t * 2.1) * .2
           + (fxN2(p * 3. + t * .4) - .5) * .6;
    }`,
  color: `
    vec2 fxP = fxQ();
    float fxT = uTime + vSeed * 20.;
    float fxW0 = fxWave(fxP, fxT);
    vec2 fxGrad = vec2(fxWave(fxP + vec2(.01, 0.), fxT) - fxW0, fxWave(fxP + vec2(0., .01), fxT) - fxW0) / .01;
    vec2 fxR = fxP + fxGrad * .02;
    vec2 fxTg = fxR * 2. + 2.;
    vec2 fxTf = fract(fxTg) - .5;
    float fxGrout = smoothstep(.41, .47, max(abs(fxTf.x), abs(fxTf.y)));
    float fxTileN = fxH2(floor(fxTg) + vSeed * 7.);
    vec3 fxSat = mix(vec3(dot(diffuseColor.rgb, vec3(.3, .59, .11))), diffuseColor.rgb, 1.3);
    vec3 fxTile = max(fxSat, 0.) * (.82 + .2 * fxTileN) * (1. - .1 * smoothstep(.2, .45, max(abs(fxTf.x), abs(fxTf.y))));
    vec3 fxFloor = mix(fxTile, vec3(.78, .86, .88), fxGrout * .8);
    float fxCau = fxCaustic(fxR * 3.6 + vSeed * 13., fxT * .6);
    diffuseColor.rgb = mix(fxFloor, fxFloor * vec3(.55, .8, .95), .35) + fxCau * .14;`,
  normal: 'normal = fxBump(normal, fxW0 * .003);',
  surface: 'roughnessFactor = .08;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .08 + vec3(.8, 1., 1.) * fxCau * .3 + vec3(.5, .85, 1.) * fxFresnel(normal, 3.) * .12;',
};
B.water = {
  // 물에 잠긴 유리 몸통에 빛무늬가 어른거린다
  color: `
    vec2 fxP = fxBodyUV();
    float fxC = fxCaustic(fxP * 6. + vSeed * 9., uTime * .45);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.6, .9, 1.), fxC * .35);`,
  surface: 'roughnessFactor = .2;',
  emissive: 'totalEmissiveRadiance = vec3(.3, .75, 1.) * (fxFresnel(normal, 2.) * .12 + fxC * .12);',
};

S.forest = {
  // 이끼 방석. 잎맥이 지나가고, 나뭇잎 사이로 햇빛 조각이 흘러간다
  color: `
    float fxN = fxF2(vLocal.xy * 14. + vSeed * 19.);
    float fxFuzz = fxN2(vLocal.xy * 120. + vSeed * 3.);
    float fxV = abs(sin((vLocal.x + vLocal.y * .35) * 26. + fxN * 5.));
    float fxSun = smoothstep(.56, .72, fxF2(vLocal.xy * 2.2 + vec2(uTime * .06, uTime * .035) + vSeed * 4.));
    diffuseColor.rgb *= .68 + .45 * fxN + .1 * fxFuzz;
    diffuseColor.rgb *= .86 + .14 * smoothstep(0., .3, fxV);`,
  surface: 'roughnessFactor = .85;',
  emissive: 'totalEmissiveRadiance = diffuse * fxSun * .55 + vec3(1., .9, .55) * fxSun * .08;',
};
B.forest = {
  // 나뭇결. 윗면은 나이테, 옆면은 줄결. 햇빛 조각이 같이 흐른다
  color: `
    float fxN = fxF3(vLocal * 6. + vSeed * 11.);
    float fxR = fract(length(vLocal.xz + vec2(vSeed - .5, fxH1(vSeed * 7.) - .5)) * 20. + fxN * 2.5);
    vec2 fxP = fxBodyUV();
    float fxSun = smoothstep(.56, .72, fxF2(fxP * 2.2 + vec2(uTime * .06, uTime * .035) + vSeed * 4.));
    diffuseColor.rgb *= .7 + .6 * smoothstep(0., .55, fxR) * (.65 + .35 * fxN);`,
  surface: 'roughnessFactor = .8;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * fxSun * .5;',
};

S.sunset = {
  // 법랑 같은 매끈한 면에 지는 해와 수평선이 비친다
  color: `
    diffuseColor.rgb *= .8 + .3 * fxUV().y;`,
  surface: 'roughnessFactor = .12;',
  emissive: `
    float fxBand = exp(-pow((normal.y + .05) / .14, 2.));
    totalEmissiveRadiance += vec3(1., .55, .25) * (fxBand * .45 + fxFresnel(normal, 3.) * .8);
    totalEmissiveRadiance += vec3(.55, .2, .7) * max(0., -normal.y) * .25;`,
};
B.sunset = {
  surface: 'roughnessFactor = .25;',
  emissive: `
    float fxBand = exp(-pow((normal.y + .05) / .14, 2.));
    totalEmissiveRadiance += vec3(1., .45, .35) * (fxBand * .25 + fxFresnel(normal, 3.) * .45);`,
};

S.space = {
  // 칸마다 작은 성운이 하나씩
  color: `
    vec2 fxP = vLocal.xy * 3. + vSeed * 41.;
    float fxNeb = fxF2(fxP + vec2(uTime * .03, 0.));
    float fxNeb2 = fxF2(fxP * 2.3 - vec2(0., uTime * .02));
    float fxCloud = smoothstep(.3, .8, fxNeb * .7 + fxNeb2 * .5);
    float fxStar = fxGlint(vLocal.xy * 22. + vSeed * 13., .2, 1.2) * 2. + fxGlint(vLocal.xy * 40. + vSeed * 5., .3, .6);
    diffuseColor.rgb *= .25 + .75 * fxCloud;`,
  surface: 'roughnessFactor = .15;',
  emissive: 'totalEmissiveRadiance = emissive * (.3 + fxCloud * 1.3) + vec3(fxStar);',
};
B.space = {
  // 우주선 선체: 판 이음매, 깜빡이는 표시등
  color: `
    vec2 fxP = fxBodyUV() * 5. + vSeed * 3.;
    vec2 fxF = abs(fract(fxP) - .5);
    float fxSeam = smoothstep(.45, .49, max(fxF.x, fxF.y));
    float fxPanel = fxH2(floor(fxP));
    float fxLed = fxGlint(fxBodyUV() * 14. + vSeed * 9., .06, 1.8);
    diffuseColor.rgb *= (.75 + .35 * fxPanel) * (1. - fxSeam * .6);`,
  surface: 'roughnessFactor = .35 + .3 * fxPanel; metalnessFactor = .6;',
  emissive: 'totalEmissiveRadiance = uBodyGlow * fxLed * 3.;',
};

S.candy = {
  // 동그란 알사탕. 가운데부터 빙글 도는 소용돌이, 설탕 반짝임
  color: `
    vec2 fxP = fxQ();
    float fxA = atan(fxP.y, fxP.x) / 6.2832;
    float fxR = length(fxP);
    float fxSw = smoothstep(.35, .65, abs(fract(fxA * 2. + fxR * 1.4 - uTime * .12 + vSeed) - .5) * 2.);
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(diffuseColor.rgb, vec3(1.), .55), fxSw * .8);`,
  surface: 'roughnessFactor = .06;',
  emissive: 'totalEmissiveRadiance = diffuse * .16 + vec3(fxGlint(vLocal.xy * 40. + vSeed * 3., .1, 1.3) * 1.2);',
};
B.candy = {
  // 반질반질한 사탕 막대 같은 몸통, 사선 줄무늬
  color: `
    vec2 fxP = fxBodyUV();
    float fxS = step(.5, fract((fxP.x + fxP.y) * 4. + vSeed));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.), fxS * .55);`,
  surface: 'roughnessFactor = .1;',
};

S.desert = {
  // 햇볕에 바랜 채색 타일. 면마다 다른 그림이 새겨져 있고, 칠이 벗겨진 곳엔 사암이 드러난다
  color: `
    vec2 fxQd = fxQ();
    float fxG = fxGlyph(fxQd * 1.12);
    float fxChip = smoothstep(.64, .68, fxF2(fxQd * 2.5 + vSeed * 13.));
    float fxGrain = fxH2(floor(vLocal.xy * 260. + vSeed * 50.));
    diffuseColor.rgb *= .9 + .12 * fxGrain;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.78, .62, .42) * (.9 + .15 * fxGrain), fxChip);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * .42, fxG);`,
  surface: 'roughnessFactor = .92;',
};
B.desert = {
  // 사암의 지층
  color: `
    float fxN = fxF3(vLocal * 4. + vSeed * 5.);
    float fxB = sin(vLocal.y * 40. + fxN * 5. + vSeed * 3.);
    diffuseColor.rgb *= .82 + .12 * fxB + .25 * fxN;
    diffuseColor.rgb *= .9 + .2 * fxH3(floor(vLocal * 200.));`,
  surface: 'roughnessFactor = .95;',
};

S.ice = {
  // 얼음 속에 갇힌 색. 가장자리부터 성에가 들쭉날쭉 파고들고, 가끔 반짝
  color: `
    float fxE = fxEdge();
    float fxN = fxF2(vLocal.xy * 7. + vSeed * 17.);
    float fxFine = fxN2(vLocal.xy * 90. + vSeed * 5.);
    float fxFrost = 1. - smoothstep(.03, .14, fxE - (fxN - .5) * .22);
    fxFrost *= .75 + .25 * fxFine;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.96, .985, 1.), fxFrost * .7);
    diffuseColor.rgb *= .94 + .1 * smoothstep(.15, .4, fxE);`,
  surface: 'roughnessFactor = mix(.04, .7, fxFrost);',
  emissive: 'totalEmissiveRadiance = vec3(fxGlint(vLocal.xy * 34. + vSeed * 11., .1, 1.) * 2.2);',
};
B.ice = {
  // 투명한 얼음 덩어리처럼: 가장자리가 푸르게 비치고, 속에 금이 가 있다
  color: `
    float fxN = fxF3(vLocal * 7. + vSeed * 3.);
    float fxCr = 1. - smoothstep(0., .03, abs(fxN - .5));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.55, .78, .95), fxCr * .55);`,
  surface: 'roughnessFactor = .05;',
  emissive: `
    totalEmissiveRadiance = vec3(.35, .65, 1.) * fxFresnel(normal, 2.) * .45
      + vec3(fxGlint(fxBodyUV() * 30. + vSeed * 5., .08, .9) * 1.6);`,
};

S.metal = {
  // 알루마이트 캡: 선반에서 깎은 동심원 결, 모서리는 깎아 낸 면(형태가 맡는다)
  color: `
    float fxR = length(vLocal.xy);
    float fxSpin = fxN2(vec2(fxR * 320., vSeed * 50.));
    float fxSpin2 = fxN2(vec2(fxR * 60., vSeed * 7.));
    diffuseColor.rgb *= .82 + .22 * fxSpin + .08 * fxSpin2;`,
  surface: 'roughnessFactor = .12 + .22 * fxSpin;',
};
B.metal = {
  // 건메탈 몸통. 면 네 귀퉁이에 십자 나사
  color: `
    vec2 fxP = fxBodyUV();
    float fxB = fxN2(vec2(fxP.x * 6., fxP.y * 360.) + vSeed * 30.);
    vec2 fxC = abs(fxP) - .37;
    float fxScrew = 1. - smoothstep(.03, .04, length(fxC));
    float fxCross = fxScrew * (1. - smoothstep(.004, .009, min(abs(fxC.x), abs(fxC.y))));
    diffuseColor.rgb *= .75 + .4 * fxB;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.55), fxScrew * .6);
    diffuseColor.rgb *= 1. - fxCross * .8;`,
  surface: 'roughnessFactor = .25 + .3 * fxB;',
};

S.paper = {
  // 색종이를 손으로 찢어 붙인 것: 들쭉날쭉한 가장자리, 섬유, 가장자리로 갈수록 짙은 색
  color: `
    float fxE = fxEdge();
    float fxRag = fxF2(vLocal.xy * 25. + vSeed * 3.) * .035;
    if (fxE < fxRag) discard;
    float fxN = fxF2(vLocal.xy * 60. + vSeed * 13.);
    float fxFib = fxN2(vec2(vLocal.x * 300., vLocal.y * 20.) + vSeed * 9.);
    diffuseColor.rgb *= .88 + .12 * fxN + .06 * fxFib;
    diffuseColor.rgb *= mix(.78, 1., smoothstep(0., .07, fxE - fxRag));`,
  surface: 'roughnessFactor = 1.;',
};
B.paper = {
  // 골판지: 결 따라 옅은 골, 종이 섬유
  color: `
    vec2 fxP = fxBodyUV();
    diffuseColor.rgb *= .9 + .08 * sin(fxP.y * 140.) + .1 * fxF3(vLocal * 45. + vSeed * 4.);`,
  surface: 'roughnessFactor = 1.;',
};

S.electric = {
  // 칸마다 플라스마 구. 검은 유리 속 가운데 전극에서 번개 가닥이 가장자리로 뻗어 꿈틀거리고,
  // 가닥이 닿는 유리 가장자리가 빛난다. 손가락을 가져가면 가닥들이 그쪽으로 몰려든다.
  // 가닥 색이 곧 면 색이고, 돌리면 가닥이 굵고 빨라진다
  color: `
    vec2 fxQe = fxQ();
    float fxR = length(fxQe);
    float fxTh = atan(fxQe.y, fxQe.x);
    vec3 fxTo = uPointer + vViewPosition;
    vec2 fxPd = vec2(dot(fxTo, vTx), dot(fxTo, vTy));
    float fxPull = exp(-dot(fxTo, fxTo) * .9);
    float fxPa = atan(fxPd.y, fxPd.x);
    float fxT = uTime * (1. + uCharge * 1.5);
    float fxArc = 0.;
    float fxHit = 0.;
    for (int i = 0; i < 6; i++) {
      float fi = float(i);
      float a = fi * 1.0472 + vSeed * 6. + sin(fxT * .3 + fi * 2.1) * .5;
      a += (mod(fxPa - a + 3.1416, 6.2832) - 3.1416) * fxPull * .85;
      float wig = (fxN2(vec2(fxR * 5. - fxT * 2.5, fi * 7. + vSeed * 3.)) - .5) * 1.1 * fxR
                + (fxN2(vec2(fxR * 15. - fxT * 7., fi * 3.1)) - .5) * .3 * fxR;
      float d = abs(mod(fxTh - a - wig + 3.1416, 6.2832) - 3.1416) * fxR;
      float w = .01 + .016 * (1. - fxR) + uCharge * .01;
      float flick = .55 + .45 * fxN2(vec2(fxT * 9., fi * 4.));
      fxArc += exp(-d * d / (w * w)) * (1. - smoothstep(.92, 1.02, fxR)) * flick;
      fxHit += exp(-d * d / (.006 + w * w * 4.)) * smoothstep(.75, .95, fxR) * (1. - smoothstep(.95, 1.05, fxR));
    }
    float fxCore = exp(-fxR * fxR * 22.);
    float fxHalo = exp(-fxR * fxR * 2.2);
    float fxGlass = 1. - smoothstep(.98, 1.03, fxR);
    diffuseColor.rgb = diffuseColor.rgb * (.05 + .1 * fxHalo * fxGlass);`,
  surface: 'roughnessFactor = .08; metalnessFactor = .2;',
  emissive: `
    vec3 fxCol = mix(diffuse, vec3(1.), .3);
    totalEmissiveRadiance = fxCol * (fxArc * (1.5 + uCharge * 1.5) + fxHit * .8 + fxCore * 2.2 + fxHalo * .2 * fxGlass)
      + vec3(1.) * (fxCore * .9 + fxArc * .25);`,
};
B.electric = {
  // 모서리를 따라 전기가 튄다
  color: `
    float fxRim = smoothstep(.8, 1., fxBodyRim());
    float fxT = floor(uTime * 10.);
    float fxN = fxF3(vLocal * 6. + fxH1(fxT + vSeed * 13.) * 9.);
    float fxArc = (1. - smoothstep(0., .04, abs(fxN - .5))) * step(.55 - uCharge * .4, fxH1(fxT * .7 + vSeed * 3.)) * fxRim;`,
  surface: 'roughnessFactor = .3; metalnessFactor = .5;',
  emissive: 'totalEmissiveRadiance = uBodyGlow * fxArc * (2.5 + uCharge * 2.);',
};

S.tesla = {
  // 테슬라 코일. 다 맞추면 면 하나가 코일 2차 권선의 한 토막이다. 에나멜을 입힌 가는 구리선이 면을 가로질러 촘촘하게 감겼고
  // (선 한 가닥 한 가닥이 둥글게 솟았다), 선 사이 골엔 절연 니스가 군데군데 고였다. 이따금 면 위로 보랏빛 번개가 탁 튀어
  // 구불구불 갈라지며 지나가고, 번개가 스친 선은 잠깐 달아오른다. 가장자리엔 코로나가 희미하게 일렁인다.
  // 에나멜 빛깔이 곧 면 색(맨 구리, 빨강, 초록, 파랑, 금빛, 은 도금)
  head: `
    // 권선: x 선 단면(0 골 ~ 1 선 꼭대기), y 선 번호
    vec2 fxWind(vec2 F) {
      float t = F.y * 46. + F.x * .2;
      return vec2(sin(3.1416 * fract(t)), floor(t));
    }
    float fxTeslaH(vec2 p, float seed) {
      vec2 w = fxWind(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.01 + .002 * w.x);
    }
    // 번개 가닥 하나: x 밝은 심, y 둘레 빛. 가닥마다 제 박자로 탁 튀었다 사라진다
    vec2 fxBolt(vec2 F, float k) {
      float period = .8 + fxH1(k * 7. + uFace) * 1.2;
      float tt = uTime / period + fxH1(k * 3. + uFace * 5.);
      float n = floor(tt);
      float live = step(fract(tt), .22) * (.55 + .45 * step(.4, fxH1(floor(uTime * 40.) + k * 13.)));
      if (live <= 0.) return vec2(0.);
      vec2 a = (vec2(fxH1(n * 1.3 + k + uFace), fxH1(n * 2.7 + k + 5.)) - .5) * 1.9;
      vec2 b = (vec2(fxH1(n * 3.1 + k + 9.), fxH1(n * 4.3 + k + 2. + uFace)) - .5) * 1.9;
      vec2 ab = b - a;
      float len = max(length(ab), .3);
      vec2 dir = ab / len;
      vec2 r = F - a;
      float s = dot(r, dir) / len;
      float perp = dot(r, vec2(-dir.y, dir.x));
      float sc = clamp(s, 0., 1.);
      float off = (fxF2(vec2(sc * 7. * len, n * 3. + k * 11.)) - .5) * .45 * len * sin(3.1416 * sc)
        + (fxN2(vec2(sc * 40. * len, n + k)) - .5) * .05;
      float d = abs(perp - off) + max(0., abs(s - .5) - .5) * len;
      return vec2(exp(-d * d / .0001), exp(-d * 12.)) * live;
    }`,
  height: 'fxTeslaH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec2 fxW = fxWind(fxF);
    vec3 fxBase = diffuseColor.rgb;
    float fxGap = 1. - smoothstep(0., .35, fxW.x);
    float fxLine = fxH1(fxW.y * 1.7 + uFace * 3.);
    vec3 fxC = fxBase * (.55 + .55 * fxW.x) * (.92 + .1 * fxLine);
    float fxVarn = smoothstep(.6, .8, fxF2(fxF * 3. + uFace)) * fxGap;
    fxC = mix(fxC, vec3(.35, .2, .05), fxVarn * .6);
    fxC = mix(fxC, vec3(.06, .04, .03), fxGap * .6);
    float fxArc = 0.;
    float fxGlowA = 0.;
    for (int i = 0; i < 3; i++) {
      vec2 bolt = fxBolt(fxF, float(i));
      fxArc = max(fxArc, bolt.x);
      fxGlowA = max(fxGlowA, bolt.y);
    }
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, sqrt(fxW.x) * .0012 + fxLine * .0003);',
  surface: 'roughnessFactor = mix(.18, .5, fxGap); metalnessFactor = mix(.85, .3, fxGap);',
  emissive: `
    float fxCorona = (1. - smoothstep(0., .12, fxEdge() / uSticker.x)) * (.5 + .5 * sin(uTime * 9. + fxF.x * 20.)) * .15;
    totalEmissiveRadiance = vec3(.85, .75, 1.) * fxArc * 3. + vec3(.55, .35, 1.) * fxGlowA * .9
      + vec3(1., .45, .15) * fxGlowA * fxW.x * .5 + vec3(.5, .4, 1.) * fxCorona + fxBase * .03;`,
};
B.tesla = {
  color: `float fxRim = smoothstep(.9, .96, fxBodyRim());`,
  surface: 'roughnessFactor = .35; metalnessFactor = .5;',
  emissive: 'totalEmissiveRadiance = vec3(.5, .4, 1.) * fxRim * (.1 + .1 * sin(uTime * 11. + vSeed * 9.));',
};

S.flesh = {
  // 생고기 덩어리. 울퉁불퉁한 혹과 도드라진 핏줄, 고름 주머니가 실제로 솟아 있고
  // 심장 박동에 맞춰 부풀었다 꺼진다. 가끔 혼자 움찔한다
  head: `
    float fxFleshH(vec2 p, float seed) {
      float dome = smoothstep(0., .15, fxEdgeAt(p));
      vec2 q = p * 5. + seed * 23.;
      float lump = fxF2(q * .4 + 4.);
      lump = lump * lump * 1.6;
      float vein = 1. - smoothstep(0., .06, abs(fxF2(q * .8 + 5.) - .5));
      vec2 pc = floor(q * .55);
      vec2 po = (vec2(fxH2(pc + 1.3), fxH2(pc + 7.7)) - .5) * .5;
      float pus = step(.76, fxH2(pc + seed * 3.)) * (1. - smoothstep(0., .3, length(fract(q * .55) - .5 - po)));
      float twitch = 1. + .25 * sin(uTime * 31. + seed * 40.) * step(.985, fxH1(floor(uTime * 3.) + seed * 17.));
      return dome * ((.03 + .1 * lump) * (1. + fxBeat() * .3) * twitch + .02 * vein + .035 * pus * pus);
    }`,
  height: 'fxFleshH',
  color: `
    // 칼로 찢어 낸 듯 들쭉날쭉한 가장자리
    float fxTear = fxF2(vLocal.xy * 14. + vSeed * 5.) * .06;
    float fxEd = fxEdge() - fxTear;
    if (fxEd < 0.) discard;
    vec2 fxP = vLocal.xy;
    float fxB = fxBeat();
    vec2 fxQ5 = fxP * 5. + vSeed * 23.;
    float fxN = fxF2(fxQ5);
    float fxLump = fxF2(fxQ5 * .4 + 4.);
    fxLump = fxLump * fxLump * 1.6;
    float fxVein = 1. - smoothstep(0., .06, abs(fxF2(fxQ5 * .8 + 5.) - .5));
    float fxHt = smoothstep(0., .15, fxEdgeAt(fxP)) * (.03 + .1 * fxLump);
    float fxSilver = smoothstep(.62, .7, fxN2(vec2(fxP.x * 3. + vSeed * 9., fxP.y * 12.) + fxN * 2.));
    float fxCut = 1. - smoothstep(0., .05, fxEd);
    float fxA = vSeed * 6.2832;
    vec2 fxFq = mat2(cos(fxA), -sin(fxA), sin(fxA), cos(fxA)) * fxP;
    float fxFib = .5 + .5 * sin(fxFq.y * 95. + fxN2(fxFq * 9.) * 6.);
    float fxFib2 = fxN2(vec2(fxFq.x * 8., fxFq.y * 170.));
    vec2 fxWp = fxQ5 + vec2(fxN2(fxQ5 * .7 + 3.), fxN2(fxQ5 * .7 + 9.)) * 1.5;
    float fxFat = smoothstep(.63, .7, fxF2(fxWp * 1.2));
    float fxCap = 1. - smoothstep(0., .022, abs(fxF2(fxQ5 * 2.1 + 11.) - .5));
    vec2 fxPc = floor(fxQ5 * .55);
    vec2 fxPo = (vec2(fxH2(fxPc + 1.3), fxH2(fxPc + 7.7)) - .5) * .5;
    float fxPd = length(fract(fxQ5 * .55) - .5 - fxPo);
    float fxHas = step(.76, fxH2(fxPc + vSeed * 3.));
    float fxPus = fxHas * (1. - smoothstep(.08, .2, fxPd));
    float fxInfl = fxHas * (1. - smoothstep(.14, .4, fxPd));
    float fxBruise = smoothstep(.6, .8, fxN2(fxQ5 * .45 + 31.));
    float fxCav = smoothstep(.0, .07, fxHt);
    vec3 fxC = diffuseColor.rgb;
    fxC *= .55 + .32 * fxFib + .14 * fxFib2 + .22 * fxN;
    fxC = mix(fxC, fxC * vec3(.6, .38, .7), fxBruise * .55);
    fxC = mix(fxC, mix(fxC, vec3(1., .93, .84), .72), fxFat);
    fxC = mix(fxC, vec3(.78, .06, .1), fxInfl * .55);
    fxC = mix(fxC, vec3(.97, .87, .42), fxPus);
    fxC = mix(fxC, vec3(.2, .02, .12), fxVein * .85);
    fxC = mix(fxC, vec3(.5, .02, .07), fxCap * .45);
    fxC *= mix(.3, 1., fxCav);
    fxC = mix(fxC, vec3(.3, 0., .02), (1. - fxCav) * .55);
    fxC = mix(fxC, vec3(.42, .02, .05), fxCut * .85);
    fxC = mix(fxC, vec3(.88, .86, .92), fxSilver * .3 * (1. - fxCut));
    diffuseColor.rgb = fxC;`,
  normal: `
    normal = fxBump(normal, fxFib * .006 + fxFib2 * .002 + fxVein * .01 + fxCap * .004 - fxPus * .004);`,
  surface: 'roughnessFactor = mix(.03, .34, fxN) * (1. - fxPus * .6) * (.6 + .4 * fxCav) * (1. - fxSilver * .7) * (1. - fxCut * .6);',
  emissive: `
    totalEmissiveRadiance = diffuse * vec3(1., .32, .26) * (.12 + .28 * fxB) * fxCav
      + diffuse * vec3(1., .45, .4) * fxFresnel(normal, 2.) * .35
      + vec3(.95, .03, .08) * (fxVein + fxInfl * .6 + fxCap * .3) * fxB * .9;`,
};
B.flesh = {
  // 덩어리 사이의 젖은 막. 핏줄이 박동에 맞춰 붉게 뛴다
  color: `
    float fxV = fxF3(vLocal * 5. + vSeed * 7.);
    float fxVein = 1. - smoothstep(0., .035, abs(fxV - .5));
    float fxB = fxBeat();
    float fxM = fxF3(vLocal * 18. + vSeed);
    diffuseColor.rgb *= .75 + .5 * fxM;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.3, .02, .1), fxVein * .8);`,
  normal: 'normal = fxBump(normal, fxM * .01 + fxVein * .006);',
  surface: 'roughnessFactor = .08 + .15 * fxM;',
  emissive: 'totalEmissiveRadiance = vec3(.65, .03, .08) * (fxVein * 1.1 + .15) * fxB + diffuseColor.rgb * fxFresnel(normal, 2.) * .3;',
};

S.eldritch = {
  // 심해의 것. 칸마다 눈이 하나, 셋, 또는 없이 빨판만.
  // 눈은 진짜로 솟은 안구다. 두툼한 눈꺼풀이 그 위로 덮였다 열리고, 구면 위로 홍채와 세로 동공이
  // 굴러가며 손끝을(기본은 보는 사람을) 쳐다본다. 이따금 휙 시선을 옮기고, 큐브를 잡으면 질끈 감는다
  head: `
    int fxEyeCount(float seed) {
      float k = fxH1(seed * 91.7);
      return k < .28 ? 0 : (k < .7 ? 1 : 3);
    }
    void fxEyeAt(float seed, int i, int count, out vec2 c, out float r, out float ang) {
      float s = uSticker.x;
      if (count == 1) {
        c = (vec2(fxH1(seed * 7.), fxH1(seed * 11.)) - .5) * .08 * s;
        r = .7 * s;
      } else {
        c = i == 0 ? vec2(-.44, .4) : (i == 1 ? vec2(.46, .3) : vec2(.02, -.42));
        c *= s;
        r = (.34 + .07 * fxH1(seed * 13. + float(i))) * s;
      }
      ang = (fxH1(seed * 17. + float(i)) - .5) * .7;
    }
    float fxEyeOpen(float seed, float i) {
      float ph = fract(uTime * (.1 + fxH1(seed * 3. + i) * .08) + fxH1(seed * 5. + i));
      return min(smoothstep(0., .035, abs(ph - .035)), 1. - uBlink * .97);
    }
    // 눈꺼풀이 열린 아몬드 모양까지의 거리(안쪽이 음수)
    float fxAlmond(vec2 q, float a, float b) {
      float t = clamp(q.x / a, -1., 1.);
      return max(abs(q.y) - b * (1. - t * t), abs(q.x) - a);
    }
    float fxEldH(vec2 p, float seed) {
      float s = uSticker.x;
      float dome = smoothstep(0., .14, fxEdgeAt(p));
      float ridge = 1. - abs(fxF2(p * 9.7 + seed * 13.) * 2. - 1.);
      float h = dome * (.02 + .014 * ridge * ridge);
      int count = fxEyeCount(seed);
      if (count == 0) {
        // 촉수 빨판
        vec2 g = p / (s * .36) + seed * 3.;
        g.x += .5 * mod(floor(g.y), 2.);
        float d = length(fract(g) - .5);
        return h + dome * (.024 * exp(-pow((d - .3) / .07, 2.)) - .018 * (1. - smoothstep(.05, .27, d)));
      }
      for (int i = 0; i < 3; i++) {
        if (i >= count) break;
        vec2 c; float r; float ang;
        fxEyeAt(seed, i, count, c, r, ang);
        vec2 d = p - c;
        float rr = length(d);
        if (rr > r * 1.4) continue;
        vec2 ql = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * d;
        float sd = fxAlmond(ql, r * 1.1, r * .78 * fxEyeOpen(seed, float(i)));
        float ball = sqrt(max(r * r - rr * rr, 0.)) * .6;
        float inside = 1. - smoothstep(-.006, .006, sd);
        float lid = ball + .014;
        float rim = .024 * exp(-pow(sd / .03, 2.)) * (1. - smoothstep(r * .9, r * 1.3, rr));
        h += (mix(lid, ball, inside) + rim) * (1. - smoothstep(r * .95, r * 1.35, rr));
      }
      return h;
    }`,
  height: 'fxEldH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxP = vLocal.xy;
    float fxS = uSticker.x;
    vec3 fxTint = diffuseColor.rgb;
    vec2 fxW = vec2(fxN2(fxP * 6. + uTime * .08), fxN2(fxP * 6. - uTime * .07 + 5.2));
    float fxRidge = 1. - abs(fxF2(fxP * 9.7 + vSeed * 13. + fxW * .6) * 2. - 1.);
    vec3 fxCol = fxTint * (.5 + .6 * pow(fxRidge, 2.));
    float fxWet = smoothstep(.55, .85, fxRidge);
    float fxRelief = fxRidge * .006;
    int fxCount = fxEyeCount(vSeed);
    float fxEyeIn = 0.;
    vec3 fxNl = vec3(0., 0., 1.);
    float fxIrisM = 0.;
    float fxPupM = 0.;
    float fxAO = 1.;
    float fxCup = 0.;
    if (fxCount == 0) {
      vec2 g = fxP / (fxS * .36) + vSeed * 3.;
      g.x += .5 * mod(floor(g.y), 2.);
      float d = length(fract(g) - .5);
      float ring = exp(-pow((d - .3) / .07, 2.));
      fxCup = 1. - smoothstep(.05, .27, d);
      fxCol = mix(fxCol, fxTint * 1.35 + .08, ring * .6);
      fxCol = mix(fxCol, fxTint * .25 + vec3(.25, .05, .12), fxCup * .8);
      fxRelief += ring * .004;
    }
    for (int i = 0; i < 3; i++) {
      if (i >= fxCount) break;
      vec2 c; float r; float ang;
      fxEyeAt(vSeed, i, fxCount, c, r, ang);
      vec2 d = fxP - c;
      float rr = length(d);
      if (rr > r * 1.4) continue;
      vec2 ql = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * d;
      float sd = fxAlmond(ql, r * 1.1, r * .78 * fxEyeOpen(vSeed, float(i)));
      float near = 1. - smoothstep(r * .95, r * 1.35, rr);
      // 눈꺼풀 주름과 짙은 테두리
      float fold = .5 + .5 * sin(sd * 170.);
      fxCol = mix(fxCol, fxCol * (.7 + .35 * fold), step(0., sd) * exp(-sd * 22.) * near);
      fxRelief += fold * .003 * step(0., sd) * exp(-sd * 22.) * near;
      fxAO = min(fxAO, mix(1., .3, exp(-pow(sd / .014, 2.)) * near));
      if (sd < 0.) {
        fxEyeIn = 1.;
        vec3 n = normalize(vec3(d, sqrt(max(r * r - rr * rr, 1e-5))));
        fxNl = n;
        // 시선: 가리키는 곳을 이 스티커의 좌표로 옮긴다. 가끔 휙 옮겨 간다
        vec3 to = uPointer + vViewPosition;
        vec3 gz = vec3(dot(to, vTx), dot(to, vTy), dot(to, vTz));
        gz = normalize(gz);
        // 눈꺼풀 밑으로 숨지 않게 시선이 돌아가는 폭을 줄인다
        gz.xy *= .5;
        float sac = floor(uTime * 1.2 + vSeed * 7. + float(i) * 3.);
        gz.xy += (vec2(fxH1(sac + vSeed), fxH1(sac * 1.7 + vSeed)) - .5) * .16;
        gz.z = max(gz.z, .8);
        gz = normalize(gz);
        float ca = dot(n, gz);
        vec3 u = n - gz * ca;
        vec3 up = vec3(-sin(ang), cos(ang), 0.);
        vec3 ey = normalize(up - gz * dot(up, gz));
        vec3 ex = cross(ey, gz);
        vec2 iu = vec2(dot(u, ex), dot(u, ey)) / .56;
        float ir = length(iu);
        float iris = (1. - smoothstep(.93, 1., ir)) * step(0., ca);
        float dil = .16 + .1 * (1. - uCharge) + .03 * sin(uTime * .6 + vSeed * 9.);
        float slit = abs(iu.x) - dil * sqrt(max(0., 1. - iu.y * iu.y / .72));
        float pupil = (1. - smoothstep(-.02, .02, slit)) * iris;
        float phi = atan(iu.y, iu.x);
        float fib = .5 + .5 * sin(phi * 46. + fxF2(iu * 5. + vSeed * 3.) * 9.);
        float limb = smoothstep(.68, 1., ir);
        float collar = exp(-pow((ir - .4) / .08, 2.));
        vec3 irisCol = mix(fxTint, vec3(1., .86, .3), .1) * (1.1 + .7 * fib) * (1. - .88 * limb) + vec3(1., .9, .45) * collar * .3;
        float cap = 1. - smoothstep(0., .03, abs(fxF2(d / r * 3.2 + vSeed * 9.) - .5));
        vec3 sclera = mix(vec3(.84, .8, .46), fxTint, .1);
        sclera = mix(sclera, vec3(.62, .05, .05), cap * .8 * smoothstep(.1, .95, rr / r));
        sclera *= .5 + .5 * smoothstep(0., .07, -sd);
        vec3 eye = mix(sclera, irisCol, iris);
        eye = mix(eye, vec3(.006), pupil);
        fxCol = eye;
        fxIrisM = iris * (1. - pupil);
        fxPupM = pupil;
        fxRelief = 0.;
      }
    }
    diffuseColor.rgb = fxCol * fxAO;`,
  normal: `
    if (fxEyeIn > .5) normal = normalize(vTx * fxNl.x + vTy * fxNl.y + vTz * fxNl.z);
    else normal = fxBump(normal, fxRelief);`,
  surface: 'roughnessFactor = fxEyeIn > .5 ? .03 : mix(.3, .06, fxWet);',
  emissive: `
    totalEmissiveRadiance = diffuseColor.rgb * fxIrisM * .9 + diffuse * (pow(fxRidge, 6.) * .3 * (1. - fxEyeIn) + fxCup * .25)
      + diffuse * fxFresnel(normal, 2.5) * .3 * (1. - fxEyeIn);`,
};
B.eldritch = {
  // 끈적한 몸통. 능선을 따라 희미하게 빛나는 핏줄이 천천히 기어다닌다
  color: `
    vec3 fxP = vLocal * 5. + vSeed * 9.;
    float fxR = 1. - abs(fxF3(fxP + vec3(0., uTime * .1, 0.)) * 2. - 1.);
    diffuseColor.rgb *= .7 + .5 * fxR;`,
  normal: 'normal = fxBump(normal, fxR * .008);',
  surface: 'roughnessFactor = .08;',
  emissive: 'totalEmissiveRadiance = uBodyGlow * pow(fxR, 10.) * (.6 + .4 * sin(uTime * 1.5 + vSeed * 6.));',
};

S.gem = {
  // 솟아오른 원석, 계단처럼 깎인 면. 면마다 실제로 기울어 빛이 면마다 다르게 맺히고,
  // 무지갯빛 섬광이 튄다
  color: `
    vec2 fxQg = fxQ();
    float fxM = max(abs(fxQg.x), abs(fxQg.y));
    float fxSeam = (1. - smoothstep(0., .03, abs(abs(fxQg.x) - abs(fxQg.y)))) * step(.42, fxM)
      + (1. - smoothstep(0., .02, abs(fxM - .42))) + (1. - smoothstep(0., .02, abs(fxM - .74)));
    diffuseColor.rgb *= .8;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.), clamp(fxSeam, 0., 1.) * .22);`,
  normal: `
    vec2 fxTilt = vec2(0.);
    if (fxM > .42) {
      float fxK = fxM > .74 ? .8 : .4;
      if (abs(fxQg.x) > abs(fxQg.y)) fxTilt.x = sign(fxQg.x) * fxK;
      else fxTilt.y = sign(fxQg.y) * fxK;
    }
    normal = normalize(normal + vTx * fxTilt.x + vTy * fxTilt.y);`,
  surface: 'roughnessFactor = .03;',
  emissive: `
    float fxGl = fxGlint(vLocal.xy * 18. + vSeed * 7., .25, 1.4);
    vec3 fxFire = .55 + .45 * cos(6.2832 * (fxH1(vSeed * 3. + floor(uTime * 2.)) + vec3(0., .33, .67)));
    totalEmissiveRadiance = diffuse * (.22 + fxFresnel(normal, 2.) * .5) + fxFire * fxGl * 2.6;`,
};
B.gem = {
  // 두드려 편 금
  color: `
    float fxH = fxF3(vLocal * 22. + vSeed * 5.);
    diffuseColor.rgb *= .85 + .3 * fxH;`,
  surface: 'roughnessFactor = .2 + .2 * fxH;',
};

S.glitch = {
  // 망가진 화면. 늘 색이 조금 어긋나 있고 주사선이 흐르며, 늘어난 테이프 같은 띠가 위에서 아래로 굴러가며
  // 화면을 옆으로 민다. 이따금 칸이 네모 덩어리째 깨져 색이 뒤섞이거나 뒤집히고(데이터모싱),
  // 밝은 줄이 아래로 녹아 흘러내리고(픽셀 정렬), 아주 가끔 신호가 끊겨 지지직거린다
  color: `
    vec2 fxUv = fxUV();
    float fxT = uTime;
    float fxF = floor(fxT * 12.);
    float fxBurst = max(step(.9, fxH1(fxF * .37 + vSeed * 17.)), step(.4, uCharge) * step(.5, fxH1(fxF * 1.3 + vSeed)));
    float fxBandY = 1.2 - fract(fxT * .21 + vSeed * .7) * 1.4;
    float fxBand = exp(-pow((fxUv.y - fxBandY) / .07, 2.));
    float fxJag = fxH1(floor(fxUv.y * 70.) + fxF) - .5;
    float fxShift = fxBand * (.05 + .12 * fxJag) + fxBurst * (fxH1(floor(fxUv.y * 12.) + fxF * 3.1) - .5) * .3;
    vec2 fxBlk = floor(fxUv * 6.);
    float fxMoshT = floor(fxT * 2.5);
    float fxMosh = step(.8, fxH2(fxBlk + fxMoshT + vSeed * 5.)) * step(.55, fxH1(fxMoshT * .3 + vSeed * 9.));
    vec2 fxSrc = fxUv + vec2(fxShift, 0.) + fxMosh * (vec2(fxH2(fxBlk + 1.), fxH2(fxBlk + 2.)) - .5) * .35;
    vec2 fxQs = (fxSrc - .5) * 2. * uSticker.x;
    vec2 fxB2 = vec2(uSticker.x);
    float fxSplit = .018 + .05 * fxBurst + .035 * fxBand;
    float fxRr = step(fxBox(fxQs + vec2(fxSplit, 0.), fxB2, uSticker.y), 0.);
    float fxGg = step(fxBox(fxQs, fxB2, uSticker.y), 0.);
    float fxBb = step(fxBox(fxQs - vec2(fxSplit, 0.), fxB2, uSticker.y), 0.);
    vec3 fxC = diffuseColor.rgb;
    // 화면 속 잔무늬: 덩어리가 밀리면 같이 어긋나 보인다
    float fxInner = step(.5, fract(fxSrc.x * 9.)) * step(.5, fract(fxSrc.y * 9.)) * .06;
    fxC *= 1. - fxInner;
    fxC = mix(fxC, fxC.gbr, fxMosh * step(.45, fxH2(fxBlk + 9.)));
    fxC = mix(fxC, vec3(1.) - fxC, fxMosh * step(.8, fxH2(fxBlk + 4.)));
    float fxScan = .8 + .2 * step(.5, fract(vLocal.y * 60. + fxT * 4.));
    fxC = vec3(fxC.r * fxRr, fxC.g * fxGg, fxC.b * fxBb) * fxScan;
    fxC += fxBand * (.1 + (fxH2(vec2(floor(fxUv.x * 80.), floor(fxUv.y * 90.) + fxF)) - .5) * .35);
    // 픽셀 정렬: 몇 줄이 아래로 녹아 흐른다
    float fxColX = floor(fxUv.x * 40.);
    float fxSortT = floor(fxT * .7);
    float fxSortOn = step(.86, fxH1(fxColX * .71 + fxSortT * 3.3 + vSeed * 3.));
    float fxSortStart = .2 + .7 * fxH1(fxColX + fxSortT);
    float fxSortLen = fract(fxT * .7) * .8;
    float fxSort = fxSortOn * step(fxUv.y, fxSortStart) * step(fxSortStart - fxSortLen, fxUv.y);
    fxC = mix(fxC, mix(fxC, vec3(1.), .45) * (1. - (fxSortStart - fxUv.y) * .8), fxSort * fxGg);
    // 신호 끊김
    float fxLost = step(.986, fxH1(floor(fxT * 4.) + vSeed * 31.));
    float fxStatic = fxH2(floor(fxUv * vec2(90., 70.)) + fxF * 13.);
    fxC = mix(fxC, vec3(fxStatic), fxLost * .92);
    // 죽은 화소 줄
    fxC *= 1. - step(.995, fxH1(floor(fxUv.y * 120.) + vSeed * 7.)) * .7;
    diffuseColor.rgb = fxC + .02;`,
  surface: 'roughnessFactor = .3;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * (.3 + .5 * fxBurst + .3 * fxBand);',
};
B.glitch = {
  color: `
    float fxScan = .75 + .25 * step(.5, fract(vLocal.y * 40. - uTime * 2.));
    diffuseColor.rgb *= fxScan;`,
};

S.pixel = {
  // 16×16 픽셀 그림 타일. 면마다 다르다: 벽돌, 돌길, 흘러가는 구름, 깜빡이는 물음표 블록,
  // 풀잎이 흔들리고 꽃이 핀 풀밭, 물결이 밀려가는 물. 칸마다 윤곽선과 위왼쪽 밝음, 아래오른쪽 그늘
  head: `
    const int fxQm[8] = int[8](30, 51, 3, 6, 12, 12, 0, 12);
    // 0~3 면 색의 짙기(0이 가장 짙다), 4 흰 빛, 5 검은 윤곽, 6 다른 색, 7 회색
    float fxPix(vec2 px, float fr) {
      if (px.x < .5 || px.y < .5 || px.x > 14.5 || px.y > 14.5) return 5.;
      vec2 p = px - 1.;
      if (uFace < .5) {
        float row = floor(p.y / 4.5);
        float ly = p.y - row * 4.5;
        float lx = mod(p.x + mod(row, 2.) * 3.5, 7.);
        if (ly > 3.4 || lx > 6.) return 7.;
        float k = fxH2(vec2(floor((p.x + mod(row, 2.) * 3.5) / 7.), row) + vSeed);
        if (ly > 2.4 || lx > 5.) return 1.;
        if (ly < .6 || lx < 1.) return 3.;
        return k > .8 ? 1. : 2.;
      } else if (uFace < 1.5) {
        vec3 v = fxVoronoi(p / 4.2 + vSeed * 3.);
        if (v.y < .12) return 0.;
        vec2 o = p / 4.2 - floor(p / 4.2);
        float k = fxH2(floor(p / 4.2 + .5) + vSeed);
        if (v.y < .25) return 1.;
        return v.z > .7 ? 3. : 2.;
      } else if (uFace < 2.5) {
        vec2 c = vec2(mod(p.x + floor(fr / 2.), 14.), p.y);
        float puff = 0.;
        puff = max(puff, step(length(c - vec2(3., 8.)), 3.6));
        puff = max(puff, step(length(c - vec2(8., 9.5)), 4.2));
        puff = max(puff, step(length(c - vec2(12.5, 7.)), 3.2));
        puff = max(puff, step(length(c - vec2(-1.5, 7.)), 3.2));
        puff = max(puff, step(abs(c.y - 4.), 2.5));
        if (puff < .5) return 6.;
        if (c.y < 2.5) return 1.;
        if (c.y > 11.5 || (puff > .5 && step(length(c - vec2(8., 11.)), 2.) > .5)) return 3.;
        return 2.;
      } else if (uFace < 3.5) {
        if ((p.x < 1.5 || p.x > 11.5) && (p.y < 1.5 || p.y > 11.5)) return length(fract(p / 2.) - .5) < .3 ? 0. : 1.;
        vec2 g = p - vec2(4., 3.);
        int row = 7 - int(g.y);
        int col = int(g.x);
        if (row >= 0 && row < 8 && col >= 0 && col < 6) {
          if (((fxQm[row] >> (5 - col)) & 1) == 1) return 4.;
          int r2 = row - 1, c2 = col - 1;
          if (r2 >= 0 && c2 >= 0 && ((fxQm[r2] >> (5 - c2)) & 1) == 1) return 0.;
        }
        float blink = step(.75, fract(fr / 6.));
        if (p.y > 12.5 || p.x < .5) return 3.;
        if (p.y < .5 || p.x > 12.5) return 1.;
        return blink > .5 ? 3. : 2.;
      } else if (uFace < 4.5) {
        float sway = mod(floor(fr / 3.) + p.x, 2.);
        float bladeTop = 10. + mod(p.x * 3., 3.);
        if (p.y > bladeTop + .5) return 6.5;
        if (p.y > bladeTop - .5) return (mod(p.x + sway, 2.) < 1.) ? 3. : 6.5;
        vec2 fl = floor(p / 4.);
        vec2 fo = p - fl * 4.;
        if (fxH2(fl + vSeed) > .7 && length(fo - 2.) < .8) return 6.;
        float k = fxH2(p + vSeed * 5.);
        return k > .82 ? 1. : (k < .14 ? 3. : 2.);
      } else {
        float w = mod(p.x + floor(p.y / 3.5) * 3. + fr, 8.);
        float ly = mod(p.y, 3.5);
        if (ly > 2.4 && w < 3.) return 4.;
        if (ly > 2.4 && w < 5.) return 3.;
        if (ly < .6) return 1.;
        if (fxH2(p + floor(fr / 2.) + vSeed) > .985) return 4.;
        return 2.;
      }
    }`,
  color: `
    // 풀은 위로 자라고 물음표는 바로 서도록, 화면 위쪽에 맞춰 90도 단위로 돌려 그린다
    vec2 fxUpP = -fxDown();
    float fxSnapP = floor(atan(fxUpP.y, fxUpP.x) / 1.5708 + .5) * 1.5708;
    vec2 fxSuP = vec2(cos(fxSnapP), sin(fxSnapP));
    vec2 fxUvP = vec2(dot(fxQ(), vec2(fxSuP.y, -fxSuP.x)), dot(fxQ(), fxSuP)) * .5 + .5;
    vec2 fxPx = floor(clamp(fxUvP, 0., .999) * 16.);
    float fxFr = floor(uTime * 6.);
    float fxK = fxPix(fxPx, fxFr);
    vec3 fxB = diffuseColor.rgb;
    vec3 fxAccent = uFace < 2.5 ? vec3(.45, .7, 1.) : (uFace < 4.5 ? (fxK > 6.2 ? vec3(.0) : vec3(.95, .3, .35)) : vec3(1.));
    vec3 fxC = fxK < .5 ? fxB * .45 : fxK < 1.5 ? fxB * .7 : fxK < 2.5 ? fxB : fxK < 3.5 ? min(fxB * 1.2 + .08, vec3(1.))
      : fxK < 4.5 ? vec3(1., .98, .9) : fxK < 5.5 ? vec3(.07, .06, .1) : fxK < 6.2 ? fxAccent : fxK < 6.7 ? fxB * .45 : vec3(.72, .7, .66);
    if (uFace > 3.5 && uFace < 4.5 && fxK > 6.2) fxC = fxB * .45;
    diffuseColor.rgb = fxC;`,
  surface: 'roughnessFactor = 1.;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .14;',
};
B.pixel = {
  color: `
    diffuseColor.rgb *= .8 + .4 * fxH3(floor(vLocal * 16.) + vSeed * 20.);`,
  surface: 'roughnessFactor = 1.;',
};

S.circuit = {
  // 인쇄 회로 기판. 면마다 솔더 마스크 색이 다르고(빨강, 보라, 하양, 노랑, 초록, 파랑 기판),
  // 마스크 아래로 구리 배선이 45도로 꺾여 지나가고 끝엔 금도금 비아, 가운데엔 다리가 달린 검은 칩과
  // 흰 실크 인쇄(칩 외곽선, 1번 핀 표시, 글자 자리). 모서리엔 작은 저항과 콘덴서, 깜빡이는 LED.
  // 배선을 따라 신호가 흘러 나가고, 돌리면 신호가 몰린다
  head: `
    float fxSq(vec2 p, vec2 b) { vec2 d = abs(p) - b; return max(d.x, d.y); }`,
  color: `
    vec2 fxQc = fxQ();
    vec2 fxA = abs(fxQc);
    bool fxXs = fxA.x > fxA.y;
    float fxU = fxXs ? fxQc.y : fxQc.x;
    float fxV = max(fxA.x, fxA.y);
    float fxSideI = fxXs ? (fxQc.x > 0. ? 0. : 1.) : (fxQc.y > 0. ? 2. : 3.);
    float fxK = floor(fxU / .13 + .5);
    float fxKs = fxK + fxSideI * 17. + vSeed * 31.;
    float fxHas = step(.22, fxH1(fxKs)) * step(abs(fxK), 3.);
    float fxJ0 = .45 + .25 * fxH1(fxKs + 3.);
    float fxJd = (fxH1(fxKs + 5.) > .5 ? 1. : -1.) * .065;
    float fxJt = clamp((fxV - fxJ0) / .065, 0., 1.);
    float fxUc = fxK * .13 + fxJd * fxJt;
    float fxDt = abs(fxU - fxUc) * (fxJt > 0. && fxJt < 1. ? .7071 : 1.);
    float fxEnd = fxJ0 + .12 + .3 * fxH1(fxKs + 7.);
    float fxViaOn = fxHas * step(fxEnd, .9);
    float fxTrace = fxHas * step(.36, fxV) * (1. - smoothstep(.02, .03, fxDt)) * (fxViaOn > .5 ? step(fxV, fxEnd) : 1.);
    float fxVd = length(vec2(fxU - (fxK * .13 + fxJd), fxV - fxEnd));
    float fxVia = fxViaOn * (1. - smoothstep(.045, .055, fxVd));
    float fxHole = fxViaOn * (1. - smoothstep(.017, .025, fxVd));
    float fxChip = step(fxSq(fxQc, vec2(.28)), 0.);
    float fxLeg = step(.28, fxV) * step(fxV, .36) * step(fract(fxU / .065 + .5), .5) * step(abs(fxU), .24);
    float fxSilk = (1. - smoothstep(.006, .014, abs(fxSq(fxQc, vec2(.41))))) * (1. - step(.36, fxV) * fxHas * step(fxV, .45) * (1. - smoothstep(.03, .05, fxDt)));
    float fxDot1 = 1. - smoothstep(.02, .03, length(fxQc - vec2(-.19, .19)));
    float fxTri = step(fxSq(fxQc - vec2(-.47, .47), vec2(.03)), 0.) * step(fxQc.y - .47, -(fxQc.x + .47));
    float fxLabel = fxChip * step(abs(fxQc.y + .02), .025) * step(abs(fxQc.x), .16) * step(.35, fract(fxQc.x * 22.))
                  + fxChip * step(abs(fxQc.y + .1), .015) * step(abs(fxQc.x + .04), .1) * step(.4, fract(fxQc.x * 30.));
    float fxCorner = step(.56, min(fxA.x, fxA.y));
    float fxPid = fxH2(sign(fxQc) + floor(vSeed * 7.));
    vec2 fxPl = (fxPid > .5 ? fxA.yx : fxA) - vec2(.76);
    float fxPart = fxCorner * step(.3, fxPid) * step(fxSq(fxPl, vec2(.1, .05)), 0.);
    float fxPartEnd = fxPart * step(.065, abs(fxPl.x));
    float fxLedM = fxCorner * step(fxPid, .3) * (1. - smoothstep(.04, .05, length(fxPl)));
    float fxLedOn = step(.5, fract(uTime * (.5 + fxPid) + fxPid * 3.));
    float fxSig = pow(max(0., 1. - abs(fract(fxV * 1.3 - uTime * (.6 + uCharge * 1.5) + fxH1(fxKs + 9.)) - .5) * 4.), 3.);
    vec3 fxMask = diffuseColor.rgb;
    float fxLum = dot(fxMask, vec3(.3, .59, .11));
    vec3 fxSilkC = fxLum > .7 ? vec3(.08) : vec3(.96);
    vec3 fxGold = vec3(.86, .68, .32);
    vec3 fxC = fxMask * (.8 + .08 * fxN2(vLocal.xy * 90.));
    fxC = mix(fxC, fxMask * 1.2 + .06, fxTrace);
    fxC = mix(fxC, fxSilkC, clamp(fxSilk + fxTri, 0., 1.) * (1. - fxChip));
    fxC = mix(fxC, fxGold, max(fxVia, fxLeg));
    fxC = mix(fxC, vec3(.04), fxHole);
    vec3 fxChipC = vec3(.06, .06, .07) * (.85 + .3 * fxN2(vLocal.xy * 220.));
    fxChipC = mix(fxChipC, vec3(.55), clamp(fxLabel, 0., 1.) * .7);
    fxChipC = mix(fxChipC, vec3(.2), fxDot1);
    fxC = mix(fxC, fxChipC, fxChip);
    vec3 fxPartC = fxPid > .65 ? vec3(.72, .58, .38) : vec3(.07);
    fxC = mix(fxC, fxPartC, fxPart);
    fxC = mix(fxC, vec3(.82), fxPartEnd);
    fxC = mix(fxC, vec3(.9, .95, .9), fxLedM);
    float fxMetal = max(max(fxVia, fxLeg), fxPartEnd) * (1. - fxHole);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxTrace * .0012 + fxChip * .004 + fxLeg * .0015 + fxPart * .004 + fxLedM * .003 - fxHole * .002);',
  surface: 'roughnessFactor = mix(mix(.35, .6, fxChip), .22, fxMetal); metalnessFactor = fxMetal;',
  emissive: `
    totalEmissiveRadiance = mix(fxMask, vec3(1.), .35) * fxTrace * fxSig * (1.3 + uCharge * 1.5)
      + vec3(.4, 1., .5) * fxLedM * (fxLedOn * 2.2 + .1)
      + fxMask * .06;`,
};
B.circuit = {
  // 몸통에는 구리 배선
  color: `
    vec2 fxP = fxBodyUV() * 9. + vSeed * 13.;
    vec2 fxC = floor(fxP);
    vec2 fxF = fract(fxP);
    float fxH = fxH2(fxC);
    float fxLn = (1. - smoothstep(.05, .09, abs((fxH > .5 ? fxF.y : fxF.x) - .5))) * step(.4, fxH2(fxC + 5.));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.78, .52, .22), fxLn * .75);`,
  surface: 'roughnessFactor = mix(.6, .25, fxLn); metalnessFactor = fxLn * .8;',
};

S.aurora = {
  // 밤하늘 같은 어두운 판 위로 오로라 커튼이 너울거리고 세로로 빛살이 내린다
  color: `
    vec2 fxP = vLocal.xy * 2.2 + vSeed * 7.;
    float fxW = fxF2(vec2(fxP.y * .6 + uTime * .12, vSeed * 3.));
    float fxCurtain = fxF2(vec2(fxP.x * 1.4 + fxW * 2.2 + uTime * .08, fxP.y * .25));
    float fxRay = .55 + .45 * fxN2(vec2(fxP.x * 14. + fxW * 6., fxP.y * .4 - uTime * .3));
    float fxA = smoothstep(.42, .72, fxCurtain) * fxRay;
    float fxFade = smoothstep(-.4, .4, fxQ().y * .4);
    float fxStar = fxGlint(vLocal.xy * 30. + vSeed * 9., .15, .8);
    diffuseColor.rgb *= .14 + .16 * fxA;`,
  surface: 'roughnessFactor = .25;',
  emissive: `
    totalEmissiveRadiance = diffuse * (.2 + fxA * 1.7 * (1. - .4 * fxFade))
      + mix(vec3(.2, 1., .6), vec3(.7, .3, 1.), fxFade) * fxA * .3 + vec3(fxStar);`,
};
B.aurora = {
  // 눈 덮인 밤의 얼음. 오로라 빛이 비친다
  color: `
    float fxStar = fxGlint(fxBodyUV() * 30. + vSeed * 9., .1, .7);`,
  surface: 'roughnessFactor = .2;',
  emissive: `
    totalEmissiveRadiance = vec3(fxStar * 1.3)
      + mix(vec3(.15, .9, .55), vec3(.55, .25, .95), .5 + .5 * sin(uTime * .3)) * fxFresnel(normal, 2.5) * .35;`,
};

S.marble = {
  // 색 돌을 박아 넣은 상감. 금테를 두르고, 돌마다 결이 다르게 지나간다
  color: `
    vec2 fxP = vLocal.xy * 3. + vSeed * 29.;
    float fxN = fxF2(fxP * 1.3);
    float fxVein = pow(1. - abs(sin((fxP.x * .8 + fxP.y * .6) * 3. + fxN * 7.)), 10.);
    float fxVein2 = pow(1. - abs(sin((fxP.y * .9 - fxP.x * .3) * 5. + fxN * 9.)), 24.);
    vec3 fxVc = dot(diffuseColor.rgb, vec3(.3, .59, .11)) > .45 ? diffuseColor.rgb * .45 : mix(diffuseColor.rgb, vec3(1.), .65);
    diffuseColor.rgb *= .86 + .22 * fxF2(fxP * 2.5);
    diffuseColor.rgb = mix(diffuseColor.rgb, fxVc, clamp(fxVein * .8 + fxVein2 * .5, 0., 1.));
    float fxGold = 1. - smoothstep(.022, .032, fxEdge());
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.92, .72, .34), fxGold);`,
  surface: 'roughnessFactor = mix(.06, .22, fxGold); metalnessFactor = fxGold;',
};
B.marble = {
  // 흰 카라라 대리석. 잿빛 결이 굽이친다
  color: `
    vec3 fxP = vLocal * 3. + vSeed * 17.;
    float fxN = fxF3(fxP);
    float fxVein = pow(1. - abs(sin((fxP.x * .7 + fxP.y * .5 + fxP.z * .4) * 3. + fxN * 8.)), 12.);
    float fxVein2 = pow(1. - abs(sin((fxP.y * .8 - fxP.z * .5) * 6. + fxN * 10.)), 30.);
    diffuseColor.rgb *= .93 + .1 * fxN;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.42, .43, .46), clamp(fxVein * .7 + fxVein2 * .4, 0., 1.));`,
  surface: 'roughnessFactor = .08;',
};

S.dancheong = {
  // 단청 머리초. 가장자리부터 먹선, 진한 색, 본색, 흰 선, 밝은 색으로 층층이 쌓는 '휘',
  // 가운데는 뇌록 바탕에 연꽃. 꽃잎 수가 면마다 다르다(6~16장)
  color: `
    vec2 fxQd = fxQ();
    float fxE = fxEdge() / uSticker.x;
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxDark = fxBase * .5;
    vec3 fxLight = mix(fxBase, vec3(1.), .5);
    vec3 fxInk = vec3(.07, .06, .05);
    vec3 fxWhite = vec3(.96, .94, .88);
    vec3 fxC;
    if (fxE < .05) fxC = fxInk;
    else if (fxE < .13) fxC = fxDark;
    else if (fxE < .21) fxC = fxBase;
    else if (fxE < .25) fxC = fxWhite;
    else if (fxE < .31) fxC = fxLight;
    else if (fxE < .34) fxC = fxInk;
    else {
      float fxR = length(fxQd) / .6;
      float fxTh = atan(fxQd.y, fxQd.x);
      float fxPetals = 6. + uFace * 2.;
      float fxPr = .55 + .45 * abs(cos(fxTh * fxPetals * .5));
      float fxPt = fxR / fxPr;
      vec3 fxPetal = fxPt < .3 ? fxWhite : (fxPt < .55 ? fxLight : (fxPt < .82 ? fxBase : fxDark));
      fxC = fxR < fxPr ? fxPetal : vec3(.36, .56, .46);
      if (abs(fxR - fxPr) < .035 && fxR < 1.05) fxC = fxInk;
      if (fxR < .2) fxC = vec3(.91, .71, .2);
      if (fxR < .1) fxC = vec3(.77, .18, .17);
    }
    diffuseColor.rgb = fxC * (.94 + .08 * fxN2(vLocal.xy * 90. + vSeed * 9.));`,
  surface: 'roughnessFactor = .78;',
};
B.dancheong = {
  // 뇌록을 가칠한 나무. 모서리를 따라 먹선과 흰 선
  color: `
    float fxRim = fxBodyRim();
    vec3 fxC = diffuseColor.rgb * (.9 + .15 * fxN3(vLocal * vec3(4., 60., 4.) + vSeed * 3.));
    if (fxRim > .94) fxC = vec3(.07, .06, .05);
    else if (fxRim > .9) fxC = vec3(.95, .93, .86);
    diffuseColor.rgb = fxC;`,
  surface: 'roughnessFactor = .8;',
};

S.stained = {
  // 납선으로 이은 색유리. 조각마다 두께와 색이 조금씩 다르고, 뒤에서 들어온 빛이 일렁인다
  color: `
    vec3 fxV = fxVoronoi(vLocal.xy / uSticker.x * 1.7 + vSeed * 11.);
    float fxLead = max(1. - smoothstep(.04, .09, fxV.y), 1. - smoothstep(.02, .06, fxEdge()));
    float fxGlassM = 1. - fxLead;
    float fxStreak = fxN2(vec2(vLocal.x * 30., vLocal.y * 4.) + fxV.z * 10.);
    float fxSeed = 1. - smoothstep(.0, .015, length(fract(vLocal.xy * 34. + fxV.z * 5.) - .5) - .07);
    fxSeed *= step(.86, fxH2(floor(vLocal.xy * 34. + fxV.z * 5.)));
    vec3 fxGlass = diffuseColor.rgb * (.7 + .55 * fxV.z) * (.85 + .3 * fxStreak);
    diffuseColor.rgb = mix(vec3(.07, .07, .08), fxGlass * .3, fxGlassM);`,
  normal: 'normal = fxBump(normal, fxLead * .01 + fxStreak * .002 * fxGlassM);',
  surface: 'roughnessFactor = mix(.45, .06, fxGlassM); metalnessFactor = fxLead * .6;',
  emissive: `
    float fxSun = .8 + .35 * fxN2(vLocal.xy * 2.5 + vec2(uTime * .15, uTime * .07));
    totalEmissiveRadiance = fxGlass * fxGlassM * (1.25 + .2 * sin(uTime * .5 + fxV.z * 6.)) * fxSun + vec3(fxSeed * fxGlassM * .5);`,
};
B.stained = {
  surface: 'roughnessFactor = .4; metalnessFactor = .6;',
};

S.najeon = {
  // 옻칠 위에 박은 자개. 조각마다 놓인 각이 달라서 보는 각도에 따라 무지갯빛이 바뀐다
  color: `
    vec3 fxV = fxVoronoi(vLocal.xy / uSticker.x * 2.6 + vSeed * 7.);
    float fxLacq = max(1. - smoothstep(.03, .07, fxV.y), 1. - smoothstep(.015, .05, fxEdge()));
    float fxLayer = fxN2(vLocal.xy * 70. + fxV.z * 20.);
    float fxWave = fxN2(vLocal.xy * 9. + fxV.z * 7.);
    diffuseColor.rgb = mix(diffuseColor.rgb * (.65 + .35 * fxLayer), vec3(.02, .01, .01), fxLacq);`,
  normal: `
    normal = normalize(normal + (vTx * (fxV.z - .5) + vTy * (fxH1(fxV.z * 9.) - .5)) * .3 * (1. - fxLacq));
    normal = fxBump(normal, fxLayer * .002 * (1. - fxLacq));`,
  surface: 'roughnessFactor = mix(.1, .03, fxLacq);',
  emissive: `
    float fxVd = abs(dot(normal, normalize(vViewPosition)));
    float fxT = fxVd * 1.9 + fxV.z * 1.3 + fxLayer * .35 + fxWave * .6 + uTime * .03;
    vec3 fxIrid = .5 + .5 * cos(6.2832 * (fxT + vec3(0., .33, .67)));
    totalEmissiveRadiance = mix(diffuse, fxIrid, .5) * (1. - fxLacq) * (.3 + .45 * pow(1. - fxVd, 1.5));`,
};
B.najeon = {
  // 검은 옻칠. 거울처럼 비친다
  surface: 'roughnessFactor = .04;',
};

S.rain = {
  // 비 오는 밤의 유리창. 김 서린 유리에 물방울이 맺혔다 사라지고, 큰 물방울이 아래로 흘러내리며
  // 지나간 자리는 맑아져 뒤의 불빛이 또렷하다
  color: `
    vec2 fxUp = -fxDown();
    vec2 fxSide = vec2(fxUp.y, -fxUp.x);
    vec2 fxPr = vec2(dot(vLocal.xy, fxSide), dot(vLocal.xy, fxUp)) / uSticker.x;
    vec2 fxG = fxPr * 6. + vSeed * 9.;
    vec2 fxGi = floor(fxG);
    float fxH = fxH2(fxGi);
    vec2 fxO = (vec2(fxH, fxH2(fxGi + 3.1)) - .5) * .6;
    float fxLife = fract(uTime * .07 + fxH * 7.);
    float fxRad = (.08 + .14 * fxH2(fxGi + 7.7)) * smoothstep(0., .1, fxLife) * (1. - smoothstep(.85, 1., fxLife));
    vec2 fxDv = fract(fxG) - .5 - fxO;
    float fxBead = 1. - smoothstep(fxRad * .75, fxRad, length(fxDv));
    vec2 fxOff = fxDv / max(fxRad, 1e-3) * fxBead;
    float fxCol = floor(fxPr.x * 2. + .5) / 2.;
    float fxHc = fxH1(fxCol * 7. + vSeed * 13.);
    float fxCx = fxCol + sin(fxPr.y * 5. + fxHc * 6.) * .05;
    float fxYy = 1.3 - fract(uTime * (.1 + .16 * fxHc) + fxHc) * 2.8;
    vec2 fxRd = (fxPr - vec2(fxCx, fxYy)) * vec2(1., .8);
    float fxRun = 1. - smoothstep(.07, .095, length(fxRd));
    float fxTrail = (1. - smoothstep(.015, .045, abs(fxPr.x - fxCx))) * step(fxYy, fxPr.y) * exp(-(fxPr.y - fxYy) * 1.6);
    float fxTrailDots = fxTrail * step(.75, fxH2(floor(vec2(fxCx * 9., fxPr.y * 14.)))) * (1. - smoothstep(.0, .03, length(vec2(fxPr.x - fxCx, fract(fxPr.y * 14.) / 14. - .035))));
    fxOff += fxRd / .09 * fxRun;
    float fxDrop = clamp(fxBead + fxRun + fxTrailDots, 0., 1.);
    float fxFog = (1. - fxTrail * .9) * (1. - fxDrop);
    float fxLights = smoothstep(.55, .85, fxN2(fxPr * 1.6 + vec2(uTime * .04, 0.) + vSeed * 4.));
    float fxLights2 = smoothstep(.6, .9, fxN2(fxPr * 2.4 - vec2(0., uTime * .03) + vSeed * 8.));
    vec3 fxGlass = diffuseColor.rgb * .32;
    diffuseColor.rgb = mix(fxGlass, diffuseColor.rgb * .45 + .22, fxFog * .65);
    vec2 fxLo = fxSide * fxOff.x + fxUp * fxOff.y;`,
  normal: 'normal = normalize(normal + (vTx * fxLo.x + vTy * fxLo.y) * .9);',
  surface: 'roughnessFactor = mix(.02, .4, fxFog);',
  emissive: `
    vec3 fxBokeh = mix(diffuse, vec3(1., .85, .6), .35) * fxLights + mix(diffuse, vec3(.6, .8, 1.), .4) * fxLights2;
    totalEmissiveRadiance = diffuse * .12 + fxBokeh * mix(1.1, .35, fxFog) + vec3(.6, .75, 1.) * fxDrop * .12;`,
};
B.rain = {
  // 젖은 검은 창틀
  surface: 'roughnessFactor = .12; metalnessFactor = .5;',
};

S.mercury = {
  // 액체 금속 웅덩이. 겉이 실제로 출렁이고, 돌리면 가운데서 물결이 퍼져 나간다
  head: `
    float fxMercH(vec2 p, float seed) {
      float dome = smoothstep(0., .12, fxEdgeAt(p));
      float t = uTime;
      float w = sin(p.x * 13. + t * 1.3 + seed * 6.) * sin(p.y * 11. - t * 1.1 + seed * 3.) * .007;
      w += sin((p.x + p.y) * 21. - t * 2.3 + seed * 9.) * .003;
      float r = length(p);
      float ring = sin(r * 55. - t * 14.) * exp(-r * 4.) * uCharge * .022;
      return dome * (.05 + w + ring);
    }`,
  height: 'fxMercH',
  color: `
    if (fxEdge() < 0.) discard;
    diffuseColor.rgb *= .8 + .2 * smoothstep(0., .1, fxEdge());`,
  surface: 'roughnessFactor = .04;',
  emissive: 'totalEmissiveRadiance = diffuse * fxFresnel(normal, 3.) * .35;',
};
B.mercury = {
  surface: 'roughnessFactor = .08;',
};

S.gauge = {
  // 놋쇠 테두리를 두른 압력계. 칸마다 바늘이 떨리고, 돌리면 압력이 확 올랐다 내려온다
  color: `
    vec2 fxQg = fxQ();
    float fxR = length(fxQg);
    float fxTh = atan(fxQg.y, fxQg.x);
    vec3 fxBrass = vec3(.8, .62, .3);
    float fxA0 = 3.927;
    float fxSpan = 4.712;
    float fxAng = mod(fxA0 - fxTh, 6.2832);
    float fxOn = step(fxAng, fxSpan);
    float fxF = fxAng / fxSpan * 10.;
    float fxMajor = (1. - smoothstep(.012, .022, abs(fract(fxF + .5) - .5) * fxSpan / 10. * fxR)) * step(.54, fxR) * step(fxR, .7) * fxOn;
    float fxMinor = (1. - smoothstep(.006, .012, abs(fract(fxF * 5. + .5) - .5) * fxSpan / 50. * fxR)) * step(.61, fxR) * step(fxR, .7) * fxOn;
    float fxRed = step(fxSpan * .8, fxAng) * fxOn * step(.62, fxR) * step(fxR, .7);
    float fxP = clamp(.35 + .15 * sin(uTime * .8 + vSeed * 9.) + .015 * sin(uTime * 23. + vSeed * 5.) + uCharge * .55, 0., 1.);
    float fxNa = fxA0 - fxP * fxSpan;
    vec2 fxNd = vec2(cos(fxNa), sin(fxNa));
    float fxS = clamp(dot(fxQg, fxNd), -.14, .64);
    float fxW = .045 * (1. - (fxS + .14) / .78 * .75);
    float fxNeedle = 1. - smoothstep(fxW, fxW + .012, length(fxQg - fxNd * fxS));
    float fxHub = 1. - smoothstep(.07, .085, fxR);
    float fxBezel = smoothstep(.76, .79, fxR);
    float fxRa = floor(fxTh / .7854 + .5) * .7854;
    float fxRivet = (1. - smoothstep(.035, .05, length(fxQg - .88 * vec2(cos(fxRa), sin(fxRa))))) * fxBezel;
    vec3 fxDial = diffuseColor.rgb * (.9 + .1 * fxN2(fxQg * 9. + vSeed * 4.)) * (1. - .3 * smoothstep(.45, .76, fxR));
    fxDial = mix(fxDial, fxDial * .75 + vec3(.06, .04, 0.), smoothstep(.6, .75, fxN2(fxQg * 3. + vSeed * 11.)));
    vec3 fxC = fxDial;
    fxC = mix(fxC, vec3(.05), max(fxMajor, fxMinor * .8));
    fxC = mix(fxC, vec3(.75, .08, .06), fxRed * .85);
    fxC = mix(fxC, vec3(.08, .05, .04), fxNeedle);
    fxC = mix(fxC, fxBrass, max(fxHub, fxBezel));
    fxC = mix(fxC, fxBrass * 1.2, fxRivet);
    float fxMetal = max(max(fxHub, fxBezel), fxRivet);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxBezel * (.012 - abs(fxR - .885) * .1) + fxRivet * .01 + fxNeedle * .004 + fxHub * .006);',
  surface: 'roughnessFactor = mix(.06, .28, fxMetal); metalnessFactor = fxMetal;',
  emissive: `
    float fxHl = (1. - smoothstep(0., .5, length(fxQg - vec2(-.28, .34)))) * (1. - fxBezel);
    totalEmissiveRadiance = vec3(1., .97, .9) * fxHl * .22;`,
};
B.gauge = {
  // 리벳 박은 놋쇠판, 군데군데 푸른 녹(동록)
  color: `
    vec2 fxP = fxBodyUV();
    vec2 fxC = abs(fxP) - .38;
    float fxRiv = 1. - smoothstep(.028, .04, length(fxC));
    float fxPat = smoothstep(.58, .72, fxF3(vLocal * 6. + vSeed * 9.));
    float fxBr = fxN2(vec2(fxP.x * 4., fxP.y * 200.) + vSeed * 3.);
    diffuseColor.rgb *= .8 + .3 * fxBr;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.27, .55, .45), fxPat * .75);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.25, fxRiv);`,
  normal: 'normal = fxBump(normal, fxRiv * (.04 - length(fxC)) * .2);',
  surface: 'roughnessFactor = mix(.3, .8, fxPat); metalnessFactor = 1. - fxPat;',
};

S.honey = {
  // 벌통에서 막 꺼낸 벌집. 칸이 실제로 움푹 패여 꿀이 고여 있고 몇 칸은 밀랍 뚜껑으로 볼록하다.
  // 넘친 꿀이 아래로 흘러내리고, 칸마다 다른 꽃꿀이 안에서 빛난다. 벌이 기어다닌다
  head: `
    float fxHoneyH(vec2 p, float seed) {
      vec4 hx = fxHex(p / uSticker.x * 2.2 + seed * 3.);
      float wall = 1. - smoothstep(.04, .1, hx.w);
      float cap = step(.86, hx.z);
      float cell = cap > .5 ? .022 + .02 * hx.w : .01 - .014 * smoothstep(.1, .45, hx.w);
      return smoothstep(0., .08, fxEdgeAt(p)) * mix(cell, .032, wall);
    }`,
  height: 'fxHoneyH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxP = vLocal.xy;
    vec4 fxHx = fxHex(fxP / uSticker.x * 2.2 + vSeed * 3.);
    float fxWall = 1. - smoothstep(.04, .1, fxHx.w);
    float fxCap = step(.86, fxHx.z);
    float fxDeep = smoothstep(0., .45, fxHx.w);
    vec2 fxBq = fxP / uSticker.x * 14. + fxHx.z * 9.;
    float fxBub = (1. - smoothstep(0., .02, length(fract(fxBq) - .5) - .07)) * step(.84, fxH2(floor(fxBq))) * (1. - fxCap);
    vec3 fxHoney = diffuseColor.rgb * mix(.5, 1.15, fxDeep) + fxBub * .22;
    vec3 fxLid = vec3(.96, .88, .62) * (.88 + .12 * fxN2(fxP * 160.));
    vec3 fxWax = vec3(.93, .79, .46) * (.85 + .15 * fxN2(fxP * 220.));
    vec3 fxC = mix(fxHoney, fxLid, fxCap);
    fxC = mix(fxC, fxWax, fxWall);
    // 넘쳐 흘러내린 꿀
    vec2 fxUp = -fxDown();
    vec2 fxSide = vec2(fxUp.y, -fxUp.x);
    vec2 fxPr = vec2(dot(fxP, fxSide), dot(fxP, fxUp)) / uSticker.x;
    float fxCol = floor(fxPr.x * 2.5 + .5) / 2.5;
    float fxHc = fxH1(fxCol * 7. + vSeed * 13.);
    float fxTop = .5 - fxHc * .4;
    float fxBot = fxTop - .3 - .5 * fract(uTime * .04 + fxHc);
    float fxW = .045 * (1. + .4 * sin(fxPr.y * 9. + fxHc * 7.));
    float fxDrip = step(.45, fxHc) * (1. - smoothstep(fxW * .7, fxW, abs(fxPr.x - fxCol))) * step(fxBot, fxPr.y) * step(fxPr.y, fxTop);
    fxDrip = max(fxDrip, step(.45, fxHc) * (1. - smoothstep(.06, .075, length((fxPr - vec2(fxCol, fxBot)) * vec2(1., .8)))));
    fxC = mix(fxC, diffuseColor.rgb * 1.1, fxDrip * .9);
    // 기어다니는 벌
    float fxBee = 0.;
    float fxWing = 0.;
    float fxStripe = 0.;
    if (fxH1(vSeed * 31.) > .45) {
      float t = uTime * (.12 + .08 * fxH1(vSeed * 3.)) + vSeed * 20.;
      vec2 bp = vec2(sin(t * 1.3), cos(t * .9)) * .45 * uSticker.x;
      vec2 vel = normalize(vec2(1.3 * cos(t * 1.3), -.9 * sin(t * .9)) + 1e-4);
      vec2 lp = fxP - bp;
      vec2 bq = vec2(dot(lp, vec2(vel.y, -vel.x)), dot(lp, vel)) / uSticker.x;
      float body = length(bq * vec2(1. / .07, 1. / .12));
      fxBee = 1. - smoothstep(.9, 1., body);
      fxStripe = step(.5, fract(bq.y * 22.)) * step(bq.y, .06);
      float head = 1. - smoothstep(.04, .05, length(bq - vec2(0., .13)));
      fxBee = max(fxBee, head);
      float flap = .8 + .2 * sin(uTime * 60.);
      fxWing = (1. - smoothstep(.9, 1., length((vec2(abs(bq.x), bq.y) - vec2(.08, .03)) * vec2(1. / (.08 * flap), 1. / .05)))) * (1. - fxBee);
      vec3 beeC = mix(vec3(.95, .7, .1), vec3(.06, .04, .02), max(fxStripe, head));
      fxC = mix(fxC, beeC, fxBee);
      fxC = mix(fxC, vec3(.92, .95, 1.), fxWing * .45);
    }
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxDrip * .006 + fxBee * .01 + fxWall * fxN2(fxP * 200.) * .001);',
  surface: 'roughnessFactor = mix(mix(.03, .5, fxCap), .55, fxWall) * (1. - fxDrip * .9) + fxBee * .3;',
  emissive: `
    totalEmissiveRadiance = diffuse * ((1. - fxWall) * (1. - fxCap) * (.42 + .38 * fxDeep) + fxDrip * .4) * (1. - fxBee)
      + diffuse * fxFresnel(normal, 3.) * .2 * (1. - fxCap);`,
};
B.honey = {
  // 벌통 나무틀
  color: `
    float fxN = fxF3(vLocal * vec3(3., 40., 3.) + vSeed * 7.);
    diffuseColor.rgb *= .75 + .45 * fxN;`,
  surface: 'roughnessFactor = .7;',
};

S.clay = {
  // 찰흙을 꾹 눌러 붙였다. 지문과 문지른 자국이 남아 있고, 스톱모션처럼 1초에 여덟 번 모양이 조금씩 바뀐다
  head: `
    vec2 fxClayWob(vec2 p, float seed) {
      float boil = floor(uTime * 8.);
      return (vec2(fxN2(p * 6. + seed * 9. + boil * .41), fxN2(p * 6. + seed * 3. - boil * .29)) - .5) * .05;
    }
    float fxClayH(vec2 p, float seed) {
      float dome = smoothstep(0., .2, fxEdgeAt(p + fxClayWob(p, seed)));
      float lump = fxN2(p * 7. + seed * 13. + floor(uTime * 8.) * .37);
      return dome * (.04 + .022 * lump);
    }`,
  height: 'fxClayH',
  color: `
    if (fxEdgeAt(vLocal.xy + fxClayWob(vLocal.xy, vSeed)) < 0.) discard;
    vec2 fxP = vLocal.xy;
    vec2 fxFc = (vec2(fxH1(vSeed * 3.), fxH1(vSeed * 5.)) - .5) * .5 * uSticker.x;
    float fxFd = length(fxRot(vSeed * 6.) * (fxP - fxFc) * vec2(1., 1.35));
    float fxPrint = (.5 + .5 * sin(fxFd * 200. + fxN2(fxP * 25.) * 5.)) * (1. - smoothstep(.07, .2, fxFd));
    float fxSmudge = fxN2(fxRot(vSeed * 4.) * fxP * vec2(45., 6.) + vSeed * 7.);
    diffuseColor.rgb *= .9 + .1 * fxSmudge;`,
  normal: 'normal = fxBump(normal, fxPrint * .0035 + fxSmudge * .0025);',
  surface: 'roughnessFactor = .6 + .12 * fxSmudge;',
  emissive: 'totalEmissiveRadiance = diffuse * .07;',
};
B.clay = {
  color: `
    float fxSm = fxN3(vLocal * vec3(30., 5., 30.) + vSeed * 4.);
    diffuseColor.rgb *= .85 + .2 * fxSm;`,
  normal: 'normal = fxBump(normal, fxSm * .004);',
  surface: 'roughnessFactor = .65;',
};

S.rust = {
  // 칠이 바랜 철판. 가장자리부터 칠이 벗겨져 녹이 슬고, 녹물이 아래로 흘러내린다. 네 귀퉁이 리벳
  color: `
    vec2 fxP = vLocal.xy;
    vec2 fxUp = -fxDown();
    float fxN = fxF2(fxP * 7. + vSeed * 11.);
    float fxNearEdge = 1. - smoothstep(0., .12, fxEdge());
    float fxPeel = smoothstep(.5, .54, fxN + fxNearEdge * .25);
    float fxPrimer = smoothstep(.46, .5, fxN + fxNearEdge * .25) * (1. - fxPeel);
    float fxAlong = dot(fxP, fxUp) / uSticker.x;
    float fxAcross = dot(fxP, vec2(fxUp.y, -fxUp.x));
    float fxStreak = smoothstep(.45, .8, fxN2(vec2(fxAcross * 38. + vSeed * 9., fxAlong * 1.5))) * (1. - smoothstep(-.6, .4, fxAlong));
    vec3 fxRust = mix(vec3(.4, .15, .05), vec3(.72, .36, .12), fxN2(fxP * 40. + vSeed)) * (.7 + .3 * fxN2(fxP * 120.));
    vec3 fxPaint = diffuseColor.rgb * (.82 + .1 * fxN2(fxP * 50.));
    fxPaint = mix(fxPaint, fxPaint * .72 + vec3(.08, .05, 0.), fxF2(fxP * 3. + 7.) * .35);
    vec2 fxRv = abs(fxQ()) - .8;
    float fxRivet = 1. - smoothstep(.06, .08, length(fxRv));
    vec3 fxC = mix(fxPaint, vec3(.56, .56, .53), fxPrimer);
    fxC = mix(fxC, fxRust, fxPeel);
    fxC = mix(fxC, fxC * vec3(.7, .45, .3), fxStreak * .6 * (1. - fxPeel));
    fxC = mix(fxC, fxRust * 1.1, fxRivet);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxPeel * .004 + fxPrimer * .002 + fxRivet * (.08 - length(fxRv)) * .12 + fxN2(fxP * 90.) * fxPeel * .002);',
  surface: 'roughnessFactor = mix(.45, .95, fxPeel);',
};
B.rust = {
  // 삭은 무쇠. 녹 무늬와 패인 자국
  color: `
    float fxN = fxF3(vLocal * 6. + vSeed * 5.);
    float fxPit = step(.86, fxN3(vLocal * 60. + vSeed));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.55, .25, .08), smoothstep(.4, .7, fxN) * .7);
    diffuseColor.rgb *= 1. - fxPit * .5;`,
  normal: 'normal = fxBump(normal, fxN * .006 - fxPit * .003);',
  surface: 'roughnessFactor = .9;',
};

S.holo = {
  // 트레이딩카드 홀로 포일. 보는 각도에 따라 무지개 띠가 쓸려 가고, 별 무늬가 다른 결로 빛나며 반짝이가 튄다
  color: `
    vec2 fxUv = fxUV();
    vec2 fxSg = fract(fxUv * 5. + vSeed * 3.) - .5;
    vec2 fxSq = abs(fxSg);
    float fxStars = 1. - smoothstep(.26, .3, min(fxSq.x, fxSq.y) * 6. + max(fxSq.x, fxSq.y) * 1.1);
    float fxLines = .5 + .5 * sin((fxUv.x * .8 + fxUv.y) * 220.);
    float fxGlit = fxGlint(vLocal.xy * 50. + vSeed * 4., .35, 2.);
    diffuseColor.rgb *= .3;`,
  surface: 'roughnessFactor = .22; metalnessFactor = .85;',
  emissive: `
    vec3 fxVd = normalize(vViewPosition);
    float fxT = fxVd.x * 1.8 + fxVd.y * 1.4 + (fxUv.x + fxUv.y) * 1.3 + fxStars * .35 + uTime * .04;
    vec3 fxRb = .5 + .5 * cos(6.2832 * (fxT + vec3(0., .33, .67)));
    vec3 fxFoil = mix(diffuse, fxRb, .6) * (.55 + .45 * fxLines) * (.7 + .5 * fxStars);
    totalEmissiveRadiance = fxFoil * (.45 + .5 * fxFresnel(normal, 1.5)) + vec3(fxGlit * 1.8);`,
};
B.holo = {
  surface: 'roughnessFactor = .15; metalnessFactor = .9;',
  emissive: `
    vec3 fxRb = .5 + .5 * cos(6.2832 * (dot(normalize(vViewPosition), vec3(1.2, .9, 0.)) + vec3(0., .33, .67)));
    totalEmissiveRadiance = fxRb * fxFresnel(normal, 2.) * .35;`,
};

S.knit = {
  // 굵은 실로 뜬 니트. 코마다 V자 두 가닥이 실제로 도톰하게 솟아 있고, 두 올이 꼬인 실결과
  // 섞인 색 털(헤더), 삐져나온 잔털이 빛을 받는다. 면마다 다른 페어아일 도안(하트, 눈송이, 나무, 마름모,
  // 북유럽 십자, 모래시계)을 한 코씩 떠 넣었고, 위아래 단엔 세 번째 색으로 잔무늬를 둘렀다.
  // 테마를 고르면 무늬가 아래 단부터 한 단씩 떠진다
  head: `
    const int fxHeart[7] = int[7](54, 127, 127, 62, 28, 8, 0);
    const int fxFlake[7] = int[7](73, 42, 28, 127, 28, 42, 73);
    const int fxTree[7] = int[7](8, 28, 62, 28, 62, 127, 8);
    const int fxDiamond[7] = int[7](8, 20, 42, 93, 42, 20, 8);
    const int fxCross[7] = int[7](28, 20, 119, 65, 119, 20, 28);
    const int fxGlass[7] = int[7](65, 99, 119, 127, 119, 99, 65);
    // 이 코가 무늬 실로 떠졌는지. 7코 × 9단, 가운데 7단에 도안
    float fxKnitBit(vec2 cell) {
      int row = 7 - int(cell.y);
      int col = int(cell.x);
      if (row < 0 || row > 6 || col < 0 || col > 6) return 0.;
      int bits = uFace < .5 ? fxHeart[row] : (uFace < 1.5 ? fxFlake[row] : (uFace < 2.5 ? fxTree[row] : (uFace < 3.5 ? fxDiamond[row] : (uFace < 4.5 ? fxCross[row] : fxGlass[row]))));
      return float((bits >> (6 - col)) & 1);
    }
    // 코 하나 안에서: x 실 두께(0~1), y 꼬인 올 결, z 실 방향 좌표
    vec3 fxStitch(vec2 c) {
      vec2 l = vec2(abs(c.x), c.y);
      vec2 q = fxRot(-.6) * (l - vec2(.21, .04));
      float d = length(q * vec2(2.1, 1.));
      float yarn = 1. - smoothstep(.3, .46, d);
      float ply = pow(.5 + .5 * sin(q.y * 50. + q.x * 26.), .7);
      return vec3(yarn * (1. - d / .46), ply, q.y);
    }
    float fxKnitH(vec2 p, float seed) {
      vec2 g = (p / uSticker.x * .5 + .5) * vec2(7., 9.);
      vec2 cell = floor(g);
      vec3 st = fxStitch(fract(g) - .5 + (vec2(fxH2(cell + seed), fxH2(cell + seed + 3.)) - .5) * .06);
      return smoothstep(0., .1, fxEdgeAt(p)) * (.014 + .022 * pow(max(st.x, 0.), .6) + .0015 * st.y * step(.05, st.x));
    }`,
  height: 'fxKnitH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxG = fxUV() * vec2(7., 9.);
    vec2 fxCell = floor(fxG);
    vec3 fxSt = fxStitch(fract(fxG) - .5 + (vec2(fxH2(fxCell + vSeed), fxH2(fxCell + vSeed + 3.)) - .5) * .06);
    float fxDone = step(fxCell.y, uIntro * 6. - 1.);
    float fxMotif = fxKnitBit(fxCell) * fxDone;
    float fxPeerie = (step(fxCell.y, .5) + step(7.5, fxCell.y)) * step(mod(fxCell.x, 2.), .5) * fxDone;
    vec3 fxMain = diffuseColor.rgb;
    vec3 fxAlt = dot(fxMain, vec3(.3, .59, .11)) > .6 ? vec3(.62, .12, .14) : vec3(.96, .93, .86);
    vec3 fxAcc = uFace < .5 ? vec3(.14, .25, .48) : uFace < 1.5 ? vec3(.86, .64, .18) : uFace < 2.5 ? vec3(.22, .42, .26)
      : uFace < 3.5 ? vec3(.14, .25, .48) : uFace < 4.5 ? vec3(.86, .64, .18) : vec3(.22, .42, .26);
    vec3 fxY = mix(mix(fxMain, fxAlt, fxMotif), fxAcc, fxPeerie);
    // 헤더: 섞어 자은 털 몇 올이 다른 빛을 띤다
    float fxHeath = fxN2(vec2(fxSt.z * 160., fxCell.x * 7. + fxCell.y * 13.) + vSeed);
    fxY *= (.9 + .15 * fxH2(fxCell + vSeed * 9.)) * mix(vec3(.92, .95, 1.), vec3(1.08, 1.03, .96), fxHeath);
    // 잔털: 실 위로 삐져나온 가는 털
    float fxHair = (1. - smoothstep(0., .035, abs(fxN2(vLocal.xy * 22. + vSeed * 5.) - .5))) * step(.55, fxN2(vLocal.xy * 7. + 3.));
    float fxFuzz = fxN2(vLocal.xy * 260. + vSeed);
    vec3 fxCol = fxY * (.3 + .7 * smoothstep(0., .5, fxSt.x)) * (.78 + .3 * fxSt.y) * (.92 + .1 * fxFuzz);
    diffuseColor.rgb = mix(fxCol, fxY * 1.15 + .05, fxHair * .35);`,
  normal: 'normal = fxBump(normal, fxSt.y * .0015 * step(.05, fxSt.x) + fxFuzz * .0008 + fxHair * .0006);',
  surface: 'roughnessFactor = .95;',
  emissive: 'totalEmissiveRadiance = fxY * (fxFresnel(normal, 1.4) * .45 + fxHair * .12);',
};
B.knit = {
  // 소매 끝처럼 세로 골이 진 고무뜨기
  color: `
    vec2 fxP = fxBodyUV();
    float fxRib = .5 + .5 * cos(fxP.x * 90.);
    float fxRow = .5 + .5 * sin(fxP.y * 140.);
    diffuseColor.rgb *= .55 + .45 * fxRib * (.8 + .2 * fxRow);`,
  normal: 'normal = fxBump(normal, fxRib * .006);',
  surface: 'roughnessFactor = .95;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * fxFresnel(normal, 1.5) * .3;',
};

S.fossil = {
  // 박물관 진열장의 돌판. 칸마다 화석이 하나씩 실제로 도드라져 있고, 칸마다 놓인 방향과 크기가 조금씩 다르다.
  // 화석 둘레는 돌을 긁어낸 자국이 옅고 거칠게 남았다. 면마다 돌과 화석이 다르다:
  // 암모나이트(나선 껍질에 갈비 같은 늑과 고사리잎처럼 주름진 봉합선, 조각조각 붉고 푸르게 비치는 암몰라이트, 짙은 셰일),
  // 삼엽충(머리방패의 볼록한 미간 돌기와 초승달 겹눈, 볼가시, 가운데 축과 양옆 늑엽으로 나뉜 가슴마디, 작은 꼬리방패, 석회암),
  // 고사리(둥근 작은잎이 줄지은 깃이 엇갈려 달린 탄화된 잎, 청회색 셰일), 물고기(그린리버층의 작은 청어처럼
  // 척추뼈와 갈비뼈, 지느러미살, 갈라진 꼬리, 크림빛 석회암에 검은 수지상 무늬), 성게(다섯 꽃잎과 숨구멍 줄, 잔 돌기, 사문석),
  // 공룡 발자국(발톱 자국이 뾰족한 세 발가락이 움푹 패고 둘레로 진흙이 밀려 올라왔다. 갈라진 진흙과 물결 자국, 붉은 사암)
  head: `
    float fxSegF(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0., 1.)); }
    // 화석 높이(-1~1). inside 화석 안쪽 정도, mark 무늬 선(봉합선, 마디 골, 잎맥, 뼈, 숨구멍)
    float fxFossil(vec2 q, out float inside, out float mark) {
      float r = length(q);
      float th = atan(q.y, q.x);
      float h = 0.;
      inside = 0.;
      mark = 0.;
      if (uFace < .5) {
        float s = log(max(r, .02)) / .22 - th / 6.2832;
        float wf = fract(s);
        float whorl = abs(wf - .5);
        inside = 1. - smoothstep(.66, .7, r);
        float rib = .5 + .5 * sin(th * 30. + s * 2.);
        float sa = th / 6.2832 * 14. + floor(s) * .37 + wf * .25;
        float frill = .07 * sin(wf * 38.) + .035 * sin(wf * 97. + 1.) + .018 * sin(wf * 210.);
        float sx = fract(sa + frill);
        mark = (1. - smoothstep(.018, .04, min(sx, 1. - sx) * r * 6.2832 / 14.)) * smoothstep(.06, .2, r) * inside * smoothstep(.04, .12, whorl);
        float umb = 1. - smoothstep(.05, .1, r);
        h = inside * (smoothstep(.04, .22, whorl) * .7 + rib * .3 * smoothstep(.15, .5, whorl)) - umb * .5;
      } else if (uFace < 1.5) {
        vec2 p = vec2(abs(q.x), q.y) * 1.08;
        float ceph = step(.24, p.y) * (1. - smoothstep(.98, 1.02, length((p - vec2(0., .24)) / vec2(.44, .34))));
        float gen = 1. - smoothstep(.02, .035, fxSegF(p, vec2(.4, .27), vec2(.47, -.16)) - .035 * (1. - clamp((.27 - p.y) / .43, 0., 1.)));
        float glab = 1. - smoothstep(.95, 1.05, length((p - vec2(0., .4)) / vec2(.12 + .04 * (p.y - .3), .17)));
        float gfur = glab * (1. - smoothstep(.006, .016, min(abs(p.y - .37), abs(p.y - .45)))) * step(.05, p.x);
        float eye = 1. - smoothstep(.015, .025, abs(length(p - vec2(.22, .39)) - .06));
        eye *= step(.36, p.y) * step(p.x, .29);
        float lens = eye * step(.5, fract(atan(p.y - .39, p.x - .22) * 6.));
        float hw = mix(.4, .3, clamp((.24 - p.y) / .62, 0., 1.));
        float thor = step(-.4, p.y) * step(p.y, .24) * step(p.x, hw - .02 * fract((.24 - p.y) / .056));
        float segL = fract((.24 - p.y) / .056);
        float groove = thor * (1. - smoothstep(.0, .12, min(segL, 1. - segL)));
        float axial = 1. - smoothstep(.1, .13, p.x);
        float axFur = thor * (1. - smoothstep(.0, .015, abs(p.x - .115)));
        float pleuFur = thor * step(.13, p.x) * (1. - smoothstep(.0, .1, abs(segL - .45)));
        float pyg = step(p.y, -.4) * (1. - smoothstep(.95, 1.05, length((p - vec2(0., -.4)) / vec2(.3, .2))));
        float pygSeg = pyg * (1. - smoothstep(.0, .12, abs(fract((-.4 - p.y) / .05) - .5) - .38)) * step(p.x, .2);
        inside = max(max(ceph, gen), max(thor, pyg));
        mark = clamp(max(max(gfur, groove), max(axFur, max(pleuFur * .7, pygSeg))) + lens * .8, 0., 1.);
        h = inside * (.4 + .35 * axial * (1. - ceph * (1. - glab)) + .45 * glab + .35 * eye - .25 * groove - .15 * pleuFur);
      } else if (uFace < 2.5) {
        vec2 p = fxRot(.35) * q;
        float rach = 1. - smoothstep(.012, .03, abs(p.x + sin(p.y * 2.) * .03));
        float leaf = 0.;
        float vein = 0.;
        float L0 = .72 * (1. - smoothstep(-.75, .85, p.y));
        for (int k = -6; k <= 6; k++) {
          float fk = float(k);
          float side = mod(fk, 2.) < .5 ? 1. : -1.;
          float y0 = fk * .12 + side * .03;
          float u = p.x * side;
          if (u < 0.) continue;
          float L = L0 * (1. - abs(fk) * .04);
          float v = p.y - y0 - u * .45;
          float hw = .095 * (1. - u / max(L, .01) * .8);
          float lobe = .5 + .5 * abs(cos(u * 32.));
          float pin = step(u, L) * (1. - smoothstep(hw * lobe * .9, hw * lobe, abs(v)));
          leaf = max(leaf, pin);
          vein = max(vein, pin * (1. - smoothstep(.003, .009, abs(v))));
        }
        inside = max(rach, leaf) * step(abs(p.y), .82);
        mark = max(vein, rach * .5) * inside;
        h = inside * (.4 + .5 * rach);
      } else if (uFace < 3.5) {
        vec2 p = q - vec2(.02, 0.);
        float bx = clamp((p.x + .58) / 1.2, 0., 1.);
        float hw = .21 * pow(max(0., sin(bx * 3.1416)), .7) + .03;
        float body = step(-.58, p.x) * step(p.x, .62) * (1. - smoothstep(hw - .01, hw, abs(p.y)));
        float spineY = .015 * sin(p.x * 4.);
        float vert = step(-.5, p.x) * step(p.x, .4) * (1. - smoothstep(.016, .024, abs(p.y - spineY))) * step(.18, abs(fract(p.x / .042) - .5));
        float ribX = fract((p.x + abs(p.y - spineY) * .45) / .042);
        float ribs = step(-.3, p.x) * step(p.x, .38) * (1. - smoothstep(.0, .2, min(ribX, 1. - ribX) * 2.)) * step(abs(p.y - spineY), hw * .85) * step(.02, abs(p.y - spineY));
        float skull = step(.4, p.x) * body;
        float orbit = 1. - smoothstep(.006, .014, abs(length(p - vec2(.52, .04)) - .045));
        float oper = (1. - smoothstep(.006, .014, abs(length(p - vec2(.62, 0.)) - .2))) * step(p.x, .45) * step(.38, p.x) * step(abs(p.y), .16);
        float df = step(abs(p.x - .05), .12) * step(hw - .01, p.y) * step(p.y, hw + .17 - abs(p.x - .02) * .6);
        float dfRay = df * (1. - smoothstep(.0, .25, abs(fract((p.x + (p.y - hw) * .5) / .025) - .5) * 2. - .5));
        float tx = -.58 - p.x;
        float tail = step(-.05, tx) * step(tx, .24) * step(abs(p.y), .05 + tx * 1.05) * (1. - step(abs(p.y), max(0., tx - .1) * .9));
        float tRay = tail * (1. - smoothstep(.0, .25, abs(fract(atan(p.y, tx + .08) * 9.) - .5) * 2. - .45));
        inside = max(body, max(df, tail));
        mark = clamp(max(max(vert, ribs), max(orbit + oper, max(dfRay, tRay))) + skull * .55, 0., 1.);
        h = inside * (.25 + .35 * mark);
      } else if (uFace < 4.5) {
        inside = 1. - smoothstep(.64, .68, r);
        float pet = 0.;
        float pores = 0.;
        for (int k = 0; k < 5; k++) {
          float a = 1.5708 + float(k) * 1.2566;
          vec2 dir = vec2(cos(a), sin(a));
          float u = dot(q, dir);
          float v = dot(q, vec2(-dir.y, dir.x));
          float w = .11 * sin(3.1416 * clamp((u - .06) / .44, 0., 1.));
          float inP = step(.06, u) * step(u, .5) * (1. - smoothstep(w - .01, w, abs(v)));
          pet = max(pet, inP);
          float rowD = abs(abs(v) - w * .82);
          float dots = 1. - smoothstep(.006, .012, length(vec2(rowD, (fract(u / .028) - .5) * .028)));
          pores = max(pores, dots * step(.08, u) * step(u, .48));
        }
        vec2 tg = fract(q * 26.) - .5;
        float tub = (1. - smoothstep(.12, .25, length(tg))) * (1. - pet) * inside;
        float apex = 1. - smoothstep(.04, .06, r);
        mark = clamp(pores + apex * .6, 0., 1.) * inside;
        h = inside * (.4 + .4 * (1. - r) + pet * .12 + tub * .1) - pores * .12;
      } else {
        // 세 발가락 공룡 발자국. 발가락 끝은 발톱으로 뾰족하고 마디마다 살짝 패며, 둘레로 진흙이 밀려 올라왔다
        vec2 p = q / .9 + vec2(0., .1);
        float heel = length(p * vec2(1., 1.25)) - .2;
        float toes = 1e3;
        float pads = 0.;
        for (int i = 0; i < 3; i++) {
          float a = 1.5708 + (float(i) - 1.) * .52;
          vec2 dir = vec2(cos(a), sin(a));
          float t = clamp(dot(p, dir), 0., .7);
          vec2 tp = p - dir * t;
          float w = .085 * (1. - t / .78) + .006;
          toes = min(toes, length(tp) - w);
          pads = max(pads, (.5 + .5 * cos(t * 30.)) * (1. - smoothstep(0., w, length(tp))) * step(t, .55));
        }
        float d = min(heel, toes) * .9;
        inside = 1. - smoothstep(-.015, .015, d);
        float rim = exp(-pow((d - .06) / .045, 2.)) * (1. - inside);
        h = -inside * (.55 + .35 * (1. - smoothstep(-.14, 0., d)) - pads * .2) + rim * .35;
        mark = rim;
      }
      return h;
    }
    // 칸마다 화석이 놓인 자세: 조금 돌고 크기가 다르다
    vec2 fxPose(vec2 q, float seed) {
      return fxRot((fxH1(seed * 7.1) - .5) * .8) * q * (.92 + .14 * fxH1(seed * 3.3));
    }
    float fxFossilH(vec2 p, float seed) {
      float inside, mark, wide, m2;
      vec2 q = fxPose(p / uSticker.x, seed);
      float f = fxFossil(q, inside, mark);
      fxFossil(q * .9, wide, m2);
      float prep = clamp(wide - inside, 0., 1.);
      float rough = fxN2(p * 40. + seed * 7.);
      return smoothstep(0., .1, fxEdgeAt(p)) * (.012 + .004 * rough * (1. + prep * 2.) + f * .026 - prep * .003);
    }`,
  height: 'fxFossilH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxQf = fxPose(fxQ(), vSeed);
    float fxIn, fxMk, fxWide, fxM2;
    float fxH = fxFossil(fxQf, fxIn, fxMk);
    fxFossil(fxQf * .9, fxWide, fxM2);
    // 화석 둘레를 긁어낸 자리: 옅고 잔 자국이 거칠다
    float fxPrep = clamp(fxWide - fxIn, 0., 1.);
    float fxStone = fxF2(vLocal.xy * 9. + vSeed * 7.);
    float fxLayer = fxN2(vec2(vLocal.y * 34. + fxStone * 3., vSeed));
    // 칸 가장자리는 정으로 쪼아 낸 듯 거칠고 어둡다
    float fxChip = (1. - smoothstep(.0, .06, fxEdge() / uSticker.x + (fxN2(vLocal.xy * 60.) - .5) * .03)) * .3;
    vec3 fxRock = diffuseColor.rgb * (.78 + .32 * fxStone) * (.92 + .08 * fxLayer);
    vec3 fxFos;
    if (uFace < .5) {
      fxRock *= .9 + .12 * step(.5, fract(vLocal.y * 60. + fxStone * 2.));
      fxFos = vec3(.3, .24, .2) * (.6 + .6 * smoothstep(.1, .5, fxH));
      fxFos = mix(fxFos, vec3(.9, .84, .7), fxMk * .95);
    } else if (uFace < 1.5) {
      vec3 sh = fxVoronoi(fxQf * 7. + vSeed);
      fxRock = mix(fxRock, fxRock * 1.15, (1. - smoothstep(.05, .12, sh.x)) * step(.85, sh.z));
      fxFos = vec3(.44, .36, .28) * (.65 + .55 * fxH);
      fxFos *= 1. - fxMk * .6;
    } else if (uFace < 2.5) {
      float nod = length(fxQf * vec2(.95, 1.1));
      fxRock = mix(fxRock, fxRock * vec3(1.15, .95, .75), smoothstep(.75, .95, nod) * .6);
      fxFos = vec3(.07, .065, .06) + fxMk * .12;
    } else if (uFace < 3.5) {
      float dend = (1. - smoothstep(.0, .06, abs(fxN2(fxQf * 7. + vSeed * 3.) * 2. - 1.))) * smoothstep(.55, .8, fxN2(fxQf * 1.5 + 4.)) * (1. - fxIn);
      fxRock = mix(fxRock, vec3(.15, .12, .1), dend * .7);
      fxFos = mix(fxRock * .8, vec3(.4, .25, .11), fxMk);
    } else if (uFace < 4.5) {
      float vein = 1. - smoothstep(0., .03, abs(fxN2(fxQf * 3. + vSeed) - .5));
      fxRock = mix(fxRock, vec3(.85, .9, .82), vein * .5);
      fxFos = vec3(.88, .84, .72) * (.82 + .25 * fxH);
      fxFos = mix(fxFos, vec3(.32, .28, .22), fxMk * .8);
    } else {
      vec3 mc = fxVoronoi(fxQf * 3. + vSeed * 4.);
      float crack = (1. - smoothstep(0., .04, mc.y)) * (1. - fxIn) * (1. - fxMk);
      float ripple = .5 + .5 * sin(fxQf.y * 30. + fxN2(fxQf * 3.) * 3.);
      fxRock *= (.92 + .1 * ripple) * (1. - crack * .45);
      fxRock = mix(fxRock, fxRock * 1.15, fxMk);
      fxFos = diffuseColor.rgb * .58;
    }
    float fxAm = step(uFace, .5) * smoothstep(.68, .78, fxN2(fxQf * 2.6 + vSeed * 3.)) * (1. - fxMk) * smoothstep(.15, .5, fxH);
    float fxScratch = fxPrep * (1. - smoothstep(0., .25, abs(fract(dot(fxQf, vec2(.7, .7)) * 70. + fxN2(fxQf * 9.) * 2.) - .5) * 2.));
    fxRock = mix(fxRock, fxRock * 1.18 + .03, fxPrep * .6);
    fxRock *= 1. - fxScratch * .12;
    diffuseColor.rgb = mix(fxRock, fxFos, clamp(fxIn, 0., 1.)) * (1. - fxChip);`,
  normal: 'normal = fxBump(normal, fxStone * .003 + fxLayer * .001 + fxMk * fxIn * .0012 + fxChip * fxN2(vLocal.xy * 120.) * .004 + fxScratch * .0008 + fxPrep * fxN2(vLocal.xy * 160.) * .0015);',
  surface: 'roughnessFactor = mix(.88, uFace < .5 ? mix(.4, .12, fxAm) : .45, fxIn); metalnessFactor = uFace < .5 ? fxIn * fxAm * .5 : 0.;',
  emissive: `
    // 암몰라이트: 붉은빛과 초록빛이 조각조각, 보는 각도에 따라 바뀐다
    float fxVd = abs(dot(normal, normalize(vViewPosition)));
    vec3 fxIrid = .5 + .5 * cos(6.2832 * (fxVd * .6 + fxN2(fxQf * 1.4 + vSeed) * .5 + vec3(0., .33, .67) * .6));
    totalEmissiveRadiance = fxIrid * fxIn * fxAm * .55;`,
};
B.fossil = {
  // 거친 화강암 받침
  color: `
    float fxG = fxN3(vLocal * 70. + vSeed * 3.);
    float fxS = step(.82, fxN3(vLocal * 140. + vSeed));
    diffuseColor.rgb *= .75 + .4 * fxG;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.7), fxS * .5);`,
  normal: 'normal = fxBump(normal, fxG * .004);',
  surface: 'roughnessFactor = .85;',
};

S.jelly = {
  // 말랑한 구미. 실제로 볼록하고 돌리면 출렁출렁 흔들린다. 두꺼운 가운데가 더 밝게 비치고 기포와 설탕 알갱이
  head: `
    float fxJellyH(vec2 p, float seed) {
      float dome = smoothstep(0., .22, fxEdgeAt(p));
      float wob = sin(uTime * 22. + seed * 6.) * uCharge * .022 * (1. - length(p) * 1.5);
      return dome * (.06 + wob) * (1. + .05 * sin(uTime * 3. + seed * 9.));
    }`,
  height: 'fxJellyH',
  color: `
    if (fxEdge() < 0.) discard;
    float fxE = smoothstep(0., .2, fxEdge());
    vec2 fxBq = vLocal.xy * 18. + vSeed * 5.;
    float fxBub = (1. - smoothstep(0., .02, length(fract(fxBq) - .5) - .06)) * step(.88, fxH2(floor(fxBq)));
    float fxSugar = fxGlint(vLocal.xy * 70. + vSeed, .25, .8);
    diffuseColor.rgb *= mix(.4, .7, fxE);`,
  surface: 'roughnessFactor = .05;',
  emissive: `
    float fxF = fxFresnel(normal, 2.);
    totalEmissiveRadiance = diffuse * (.35 + .6 * fxE) * (1. - fxF * .5) + vec3(1.) * fxF * .2 + vec3(fxBub * .25 + fxSugar * 1.4);`,
};
B.jelly = {
  surface: 'roughnessFactor = .08;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * (.25 + fxFresnel(normal, 2.) * .6);',
};

S.planet = {
  // 네모난 행성. 다 맞추면 면 하나가 행성 하나의 얼굴이 된다. 면마다 실제 천체를 본떴다:
  // 목성(폭이 제각각인 크림빛 대와 적갈색 띠, 띠 경계의 소용돌이, 적도대의 푸른 꽃줄 구름, 하얀 타원 줄, 띠에 파인 자리의 대적점),
  // 지구(얕고 깊은 바다, 숲과 사막의 대륙, 극관, 소용돌이치는 태풍, 밤쪽 도시 불빛, 바다에 비친 해),
  // 유로파(희푸른 얼음을 가로지르는 갈색 이중 능선, 얼음이 깨져 떠다니다 다시 언 지대, 갈색 반점),
  // 화성(버터스카치빛 먼지와 바람에 드러난 검은 현무암, 운석구덩이, 면을 가로지르는 거대한 협곡, 방패 화산, 소용돌이 홈의 극관),
  // 이오(노란 유황 들판, 붉은 고리를 두른 화산, 초록 테의 검은 용암 호수, 하얀 서리, 밤쪽에 달아오르는 용암),
  // 해왕성(짙은 하늘빛의 옅은 띠, 대암점과 그 곁의 하얀 구름, 빠르게 흐르는 메탄 구름 줄).
  // 지표가 천천히 자전하고, 낮밤 경계가 면을 가로질러 오가며, 면 테두리를 따라 대기가 빛난다
  head: `
    float fxPlanetH(vec2 p, float seed) {
      vec2 q = p / uSticker.x;
      vec2 w = 1. - pow(abs(q), vec2(8.));
      return .016 * w.x * w.y + .004;
    }`,
  height: 'fxPlanetH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    float fxSpin = uTime * .02;
    vec2 fxS = fxF + vec2(fxSpin, 0.);
    vec2 fxCl = fxF + vec2(fxSpin * 1.6, 0.);
    float fxBorder = 1. - max(abs(fxF.x), abs(fxF.y));
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxC = fxBase;
    float fxCloud = 0.;
    float fxLand = 0.;
    float fxSea = 0.;
    float fxHotSpot = 0.;
    vec3 fxAtm = mix(fxBase, vec3(.55, .8, 1.), .55);
    float fxAtmK = 1.;
    float fxWrapX = mod(fxS.x + 1., 2.) - 1.;
    if (uFace < .5) {
      float lat = fxF.y;
      float turb = fxF2(vec2(fxS.x * 1.3, lat * 2.6) + vec2(uTime * .008, 0.));
      float yb = lat + (turb - .5) * .14 + sin(fxS.x * 5. + lat * 8.) * .015;
      float bv = sin(yb * 9.5) * .5 + sin(yb * 21. + 1.3) * .3 + sin(yb * 39. + 2.) * .2;
      float streakJ = fxN2(vec2(fxS.x * 2.5, yb * 60.));
      vec3 zone = vec3(.95, .9, .8);
      vec3 beltC = mix(fxBase * .72, vec3(.55, .32, .2), .5);
      fxC = mix(zone, fxBase * 1.05, smoothstep(-.3, .2, bv));
      fxC = mix(fxC, beltC, smoothstep(.25, .6, bv));
      fxC = mix(fxC, vec3(.86, .56, .3), smoothstep(.0, .2, bv) * (1. - smoothstep(.2, .4, bv)) * .45);
      fxC *= .9 + .2 * streakJ;
      float edge = 1. - abs(bv) * 1.6;
      float eddy = smoothstep(.55, .8, fxN2(vec2(fxS.x * 7., lat * 11.))) * smoothstep(.6, 1., edge);
      fxC = mix(fxC, mix(zone, beltC, .5) * 1.05, eddy * .5);
      float fest = (1. - smoothstep(.0, .05, abs(fract(fxS.x * 2. + lat * 2.4) - .5) - .38)) * step(abs(lat - .05), .1);
      fxC = mix(fxC, vec3(.45, .5, .62), fest * .45);
      vec2 ov = vec2(fract((fxS.x + .3) * 1.2) * 1.67 - .83, lat + .62) / vec2(.07, .045);
      fxC = mix(fxC, vec3(.98, .97, .94), (1. - smoothstep(.8, 1., length(ov))) * .9);
      vec2 sp = vec2(fxWrapX - .15, lat + .3) / vec2(.3, .17);
      float spr = length(sp);
      float swirl = .5 + .5 * sin(atan(sp.y, sp.x) * 2. + spr * 8. - uTime * .4);
      fxC = mix(fxC, vec3(.96, .9, .8), (1. - smoothstep(1., 1.3, spr)) * smoothstep(.85, 1., spr));
      fxC = mix(fxC, mix(vec3(.72, .3, .17), vec3(.9, .55, .38), swirl), 1. - smoothstep(.8, 1., spr));
      fxAtm = vec3(.95, .82, .62);
    } else if (uFace < 1.5) {
      float h = fxF2(fxS * 1.1 + 7.);
      fxLand = smoothstep(.52, .55, h);
      fxSea = 1. - fxLand;
      vec3 sea = mix(vec3(.02, .07, .22), fxBase * 1.15, smoothstep(.3, .52, h));
      float dry = smoothstep(.45, .7, fxN2(fxS * 1.6 + 3.)) * (1. - smoothstep(.45, .8, abs(fxF.y)));
      vec3 land = mix(vec3(.16, .36, .14), vec3(.74, .6, .38), dry);
      land = mix(land, vec3(.45, .4, .32), smoothstep(.68, .8, h));
      fxC = mix(sea, land, fxLand);
      fxC = mix(fxC, vec3(.97), smoothstep(.8, .88, abs(fxF.y) + fxN2(vec2(fxS.x * 3., 2.)) * .08));
      vec2 cy = vec2(mod(fxCl.x - .35 + 1., 2.) - 1., fxF.y - .25);
      float cyr = length(cy);
      float spiral = .5 + .5 * sin(atan(cy.y, cy.x) * 2. - cyr * 22.);
      fxCloud = smoothstep(.55, .75, fxF2(fxCl * 1.9 + vec2(0., uTime * .015)));
      fxCloud = max(fxCloud, spiral * (1. - smoothstep(.06, .24, cyr)) * .95);
      fxAtm = vec3(.45, .7, 1.);
    } else if (uFace < 2.5) {
      fxC = fxBase * (.9 + .12 * fxN2(fxS * 7.));
      fxC = mix(fxC, vec3(.62, .78, .95), smoothstep(.55, .85, fxN2(fxS * 1.3 + 9.)) * .35);
      float lin = 0.;
      for (int i = 0; i < 7; i++) {
        float fi = float(i);
        float ang = fxH1(fi + 3.) * 3.1416;
        vec2 n = vec2(cos(ang), sin(ang));
        float off = (fxH1(fi * 7. + 1.) - .5) * 1.8;
        float dd = dot(fxS, n) - off + sin(dot(fxS, vec2(-n.y, n.x)) * 1.4 + fi) * .1;
        float wid = .012 + .016 * fxH1(fi * 3.);
        float dbl = (1. - smoothstep(.005, .011, abs(abs(dd) - wid))) + (1. - smoothstep(wid * .8, wid * 2.4, abs(dd))) * .45;
        lin = max(lin, dbl * (.6 + .4 * fxH1(fi + 9.)));
      }
      vec3 v = fxVoronoi(fxS * 6. + 5.);
      float chaos = smoothstep(.66, .72, fxN2(fxS * 1.1 + 2.));
      float block = chaos * (1. - smoothstep(.02, .05, v.y));
      vec3 brown = vec3(.55, .3, .17);
      fxC = mix(fxC, brown, max(lin * .85, chaos * .4));
      fxC = mix(fxC, fxC * 1.2 + .1, chaos * (1. - block) * step(.5, v.z) * .4);
      vec3 lv = fxVoronoi(fxS * 9. + 21.);
      fxC = mix(fxC, brown * .9, (1. - smoothstep(.08, .14, lv.x)) * step(.88, lv.z) * .7);
      fxAtmK = .35;
    } else if (uFace < 3.5) {
      float dark = smoothstep(.48, .62, fxF2(fxS * 1.1 + 4.));
      float streak = fxN2(vec2(fxS.x * 1.2, fxS.y * 6.) + 2.);
      fxC = mix(fxBase * vec3(1.08, .98, .82), vec3(.3, .22, .18), dark * (.6 + .3 * streak));
      vec3 v = fxVoronoi(fxS * 4. + 5.);
      float crater = (1. - smoothstep(.14, .2, v.x)) * step(.55, v.z);
      float crim = (1. - smoothstep(0., .035, abs(v.x - .2))) * step(.55, v.z);
      float canyon = 1. - smoothstep(0., .035, abs(fxS.y + .05 + fxN2(vec2(fxS.x * 2.4, 3.)) * .2 - .1));
      float branch = (1. - smoothstep(0., .02, abs(fxS.y + .14 - fxS.x * .3 + fxN2(vec2(fxS.x * 4., 7.)) * .1))) * step(abs(fxWrapX + .3), .3);
      vec2 om = vec2(fxWrapX + .45, fxF.y - .35);
      float shield = 1. - smoothstep(.13, .17, length(om));
      float caldera = 1. - smoothstep(.025, .035, length(om));
      fxC *= 1. - crater * .3 - max(canyon, branch) * .45;
      fxC += crim * .15;
      fxC = mix(fxC, fxBase * 1.15, shield * .5);
      fxC *= 1. - caldera * .4;
      float cap = smoothstep(.72, .78, fxF.y + fxN2(vec2(fxS.x * 3., 1.)) * .1);
      float trough = (1. - smoothstep(0., .05, abs(fract(atan(fxF.y - 1.2, fxF.x) * 2.5 + length(vec2(fxF.x, fxF.y - 1.2)) * 7.) - .5) - .38)) * cap;
      fxC = mix(fxC, vec3(.97, .95, .92), cap * (1. - trough * .5));
      fxCloud = smoothstep(.62, .82, fxF2(fxCl * 1.3 + 4.)) * .3;
      fxAtm = vec3(1., .7, .55);
      fxAtmK = .55;
    } else if (uFace < 4.5) {
      // 유황 들판: 노랑 바탕에 하얀 서리, 주황과 황갈색 얼룩
      float m1 = fxF2(fxS * 2.2);
      float m2 = fxF2(fxS * 3.4 + 7.);
      fxC = fxBase * vec3(1.02, .98, .8) * (.8 + .3 * m1);
      fxC = mix(fxC, vec3(.95, .93, .84), smoothstep(.58, .7, m2) * .7);
      fxC = mix(fxC, vec3(.82, .5, .2), smoothstep(.52, .68, fxF2(fxS * 1.8 + 3.)) * .6);
      fxC = mix(fxC, vec3(.5, .44, .26), smoothstep(.58, .74, fxF2(fxS * 2.8 + 11.)) * .55);
      // 화산: 모양과 크기가 제각각인 검은 용암 호수, 그 둘레 초록빛 테, 드물게 붉은 분출 고리
      vec3 v = fxVoronoi(fxS * 3. + 5.);
      float wob = (fxN2(fxS * 10.) - .5) * .05 + (fxN2(fxS * 3.) - .5) * .05;
      float pr = .03 + .08 * fract(v.z * 7.3);
      float vol = step(.45, v.z);
      float patera = vol * (1. - smoothstep(pr - .01, pr + .01, v.x + wob));
      float greenEdge = vol * (1. - smoothstep(0., .03, abs(v.x + wob - pr - .02))) * .7;
      float ringN = fxN2(vec2(atan(v.y, v.x) * 2., v.z * 9.));
      float redRing = step(.8, v.z) * (1. - smoothstep(.02, .09, abs(v.x + wob * 2. - .28 - ringN * .08))) * smoothstep(.3, .5, ringN);
      fxC = mix(fxC, vec3(.78, .3, .12), redRing * .75);
      fxC = mix(fxC, vec3(.55, .58, .22), greenEdge * (1. - patera));
      fxC = mix(fxC, vec3(.06, .05, .05), patera);
      fxHotSpot = patera * (1. - smoothstep(0., pr, v.x)) * (.6 + .4 * sin(uTime * 2. + v.z * 40.));
      fxAtmK = .3;
    } else {
      float band = .5 + .5 * sin(fxF.y * 8. + fxF2(fxS * vec2(.8, 3.)) * 2.);
      fxC = fxBase * (.82 + .3 * band);
      vec2 ds = vec2(fxWrapX + .1, fxF.y + .2) / vec2(.28, .15);
      float dsr = length(ds);
      fxC = mix(fxC, fxBase * .4, 1. - smoothstep(.75, 1., dsr));
      float comp = 1. - smoothstep(0., .5, length(vec2(fxWrapX + .05, fxF.y - .0) / vec2(.22, .035)));
      vec2 sc = fxF + vec2(uTime * .07, 0.);
      float streaks = smoothstep(.62, .8, fxN2(vec2(sc.x * 1.6, sc.y * 14.))) * (1. - smoothstep(.0, .5, abs(fxF.y - .45)));
      fxCloud = max(comp, streaks) * .85;
      fxAtm = vec3(.4, .65, 1.);
    }
    float fxDay = smoothstep(-.3, .3, fxF.x * .8 + fxF.y * .3 + .75 + .5 * sin(uTime * .05 + uFace * 1.7));
    fxC = mix(fxC, vec3(1.), fxCloud * .9);
    fxC *= mix(.38, 1., fxDay);
    float fxCity = (1. - fxDay) * fxLand * (1. - fxCloud) * step(.82, fxH2(floor(fxS * 60.))) * step(.5, uFace) * step(uFace, 1.5);
    vec2 fxGl = fxF - vec2(-.4, .35);
    float fxSunGlint = fxSea * fxDay * exp(-dot(fxGl, fxGl) * 5.) * (1. - fxCloud);
    diffuseColor.rgb = fxC;`,
  surface: 'roughnessFactor = mix(.6, .12, fxSea);',
  emissive: `
    float fxRim = 1. - smoothstep(0., .1, fxBorder);
    totalEmissiveRadiance = fxAtm * fxAtmK * (fxRim * fxRim * 1.2 + fxFresnel(normal, 3.) * .25)
      + vec3(1., .78, .4) * fxCity * 1.6
      + vec3(1., .45, .1) * fxHotSpot * mix(.6, 2.2, 1. - fxDay)
      + vec3(1., .95, .85) * fxSunGlint * .45
      + diffuseColor.rgb * (.08 + .3 * fxDay);`,
};
B.planet = {
  // 우주 정거장 선체
  color: `
    vec2 fxP = fxBodyUV() * 5. + vSeed * 3.;
    vec2 fxF = abs(fract(fxP) - .5);
    float fxSeam = smoothstep(.45, .49, max(fxF.x, fxF.y));
    diffuseColor.rgb *= (.8 + .3 * fxH2(floor(fxP))) * (1. - fxSeam * .6);`,
  surface: 'roughnessFactor = .45; metalnessFactor = .6;',
};

S.fruit = {
  // 깍둑썰기한 과일. 조각마다 네모난 과일 덩어리이고, 다 맞추면 면 하나가 과일 한 덩이를 자른 단면이 된다.
  // 면마다 과일이 다르다: 수박(네모난 수박. 테두리를 따라 흰 속껍질과 줄무늬 껍질, 반짝이는 과육, 가운데를 두른 씨 고리),
  // 배(가운데 별 모양 씨방과 갈색 씨, 둘레로 사각거리는 돌세포), 파인애플(가운데 옅고 질긴 심에서 바깥으로 뻗는 섬유),
  // 망고(가운데 납작한 씨를 감싼 섬유, 진한 주황에서 바깥으로 노랗게), 키위(가운데 하얀 심, 그 둘레 옅은 격벽선 사이로
  // 줄지은 까만 씨, 바깥은 짙은 초록 과육), 용과(고르게 박힌 까만 씨와 씨 둘레의 맑은 젤).
  // 칸마다 과즙이 맺혀 번들거린다
  head: `
    float fxPip(vec2 f, float a, vec2 s) {
      vec2 p = fxRot(a) * f;
      p.x *= 1. + .7 * clamp(p.y / s.y, -1., 1.);
      return length(p / s);
    }
    // 가운데를 두른 씨 고리. r0~r1 사이, 둘레에 n개, 씨 크기 s(면 좌표)
    float fxSeedRing(vec2 F, float r0, float r1, float n, vec2 s, float seed) {
      float r = length(F);
      float a = atan(F.y, F.x);
      float ac = a / 6.2832 * n;
      float cell = floor(ac);
      float rr = mix(r0, r1, fxH1(cell * 1.3 + seed));
      vec2 f = vec2((fract(ac) - .5) * r * 6.2832 / n, r - rr);
      return step(.22, fxH1(cell * 2.7 + seed)) * (1. - smoothstep(.8, 1., fxPip(f, 3.1416, s)));
    }`,
  color: `
    vec2 fxF = fxFace();
    vec2 fxQf = fxQ();
    float fxR = length(fxF);
    float fxA = atan(fxF.y, fxF.x);
    float fxBorder = 1. - max(abs(fxF.x), abs(fxF.y));
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxCv = fxVoronoi(fxF * 26. + uFace * 7.);
    float fxGrainK = uFace < .5 ? 1. : .3;
    vec3 fxC = fxBase * (1. + (fxCv.z - .5) * .14 * fxGrainK) * (1. - (1. - smoothstep(0., .12, fxCv.y)) * .08 * fxGrainK) * (.94 + .1 * fxN2(fxF * 3. + uFace));
    float fxSeed = 0.;
    vec3 fxSeedC = vec3(.04, .03, .025);
    float fxFiber = 0.;
    float fxSkinM = 0.;
    float fxTrans = .14;
    if (uFace < .5) {
      // 수박
      float streak = 1. - smoothstep(0., .25, abs(fract(fxA / 6.2832 * 26. + fxN2(vec2(fxR * 3., fxA)) * .3) - .5) * 2.);
      fxC = mix(fxC, fxC * 1.1 + .04, streak * .15 * smoothstep(.1, .3, fxR));
      float s1 = fxSeedRing(fxF, .38, .58, 24., vec2(.028, .05), 3.);
      float s2 = fxSeedRing(fxF * 1.15 + .02, .18, .26, 11., vec2(.024, .044), 9.) * .9;
      fxSeed = max(s1, s2);
      vec2 sc = vec2(floor(fxA / 6.2832 * 24.), 0.);
      fxSeedC = mix(vec3(.04, .03, .025), vec3(.93, .88, .74), step(.8, fxH1(sc.x * 5.1)));
      float pale = 1. - smoothstep(.06, .13, fxBorder);
      fxC = mix(fxC, vec3(.97, .86, .82), pale * .75);
      fxC = mix(fxC, vec3(.96, .95, .86), 1. - smoothstep(.045, .06, fxBorder));
      float stripe = step(.5, fract((fxF.x + fxF.y) * 3. + fxN2(fxF * 4.) * .7));
      fxSkinM = 1. - smoothstep(.022, .03, fxBorder);
      vec3 skin = mix(vec3(.55, .78, .32), vec3(.1, .32, .12), stripe);
      fxC = mix(fxC, vec3(.62, .84, .42), 1. - smoothstep(.03, .045, fxBorder));
      fxC = mix(fxC, skin, fxSkinM);
      fxTrans = .16;
    } else if (uFace < 1.5) {
      // 배: 가운데 별 모양 씨방
      float grit = step(.9, fxH2(floor(fxF * 90.))) * (.4 + .6 * (1. - smoothstep(.2, .45, abs(fxR - .32))));
      fxC = fxC * (1. - grit * .12) + grit * .04;
      float pet = .13 + .045 * cos(fxA * 5.);
      float core = 1. - smoothstep(pet - .01, pet + .01, fxR);
      float coreRing = 1. - smoothstep(.0, .03, abs(fxR - (.27 + .02 * sin(fxA * 5. + 1.))));
      fxC = mix(fxC, fxBase * vec3(.9, .9, .82), (1. - smoothstep(.2, .3, fxR)) * .5);
      fxC *= 1. - coreRing * .08;
      fxC = mix(fxC, vec3(.86, .8, .66), core * .8);
      float sd = 9.;
      for (int k = 0; k < 5; k++) {
        float a = float(k) * 1.2566 + .3;
        vec2 dir = vec2(cos(a), sin(a));
        vec2 sp = fxF - dir * .09;
        sd = min(sd, fxPip(vec2(dot(sp, vec2(-dir.y, dir.x)), dot(sp, dir)), 0., vec2(.022, .045)));
      }
      fxSeed = 1. - smoothstep(.85, 1., sd);
      fxSeedC = vec3(.3, .16, .07);
      vec2 vb = vec2(fract(fxA / 6.2832 * 10.) - .5, (fxR - .42) * 6.);
      fxC = mix(fxC, fxC * .95, (1. - smoothstep(.05, .1, length(vb))) * .6);
      fxTrans = .14;
    } else if (uFace < 2.5) {
      // 파인애플: 심에서 바깥으로 섬유
      float core = 1. - smoothstep(.2, .24, fxR + fxN2(vec2(fxA * 3., 1.)) * .02);
      fxFiber = .5 + .5 * sin(fxA * 200. + fxN2(vec2(fxA * 30., fxR * 5.)) * 5.);
      vec4 hx = fxHex(vec2(fxA * fxR * 3., fxR * 3.4) * 1.8);
      float cellLine = (1. - smoothstep(0., .07, hx.w)) * smoothstep(.24, .3, fxR);
      fxC *= (.86 + .16 * fxFiber) * (1. - cellLine * .12);
      fxC = mix(fxC, fxC * 1.08 + vec3(.04, .02, -.02), smoothstep(.6, 1., 1. - fxBorder) * .4);
      vec3 coreC = vec3(.98, .93, .7) * (.92 + .1 * (.5 + .5 * sin(fxA * 120.)));
      fxC = mix(fxC, coreC, core);
      fxTrans = .2;
    } else if (uFace < 3.5) {
      // 망고: 가운데 납작한 씨와 그걸 감싼 섬유
      vec2 pq = fxF / vec2(.46, .12);
      float pr = length(pq);
      float pit = 1. - smoothstep(.95, 1.05, pr);
      float hairs = (1. - smoothstep(.0, .3, abs(fract(atan(pq.y, pq.x) * 14. + fxN2(fxF * 9.) * .6) - .5) * 2. - .4)) * smoothstep(1., 1.15, pr) * (1. - smoothstep(1.15, 1.9, pr));
      fxC = mix(fxC * vec3(1.02, .88, .7), fxC * vec3(1.06, 1.12, .78), smoothstep(.2, 1., fxR));
      fxC = mix(fxC, fxC * 1.12, hairs * .5);
      vec3 pitC = vec3(.93, .88, .72) * (.85 + .15 * sin(fxF.x * 60. + fxN2(fxF * 20.) * 4.));
      fxC = mix(fxC, pitC, pit);
      fxFiber = hairs + pit * .5;
      fxTrans = .22;
    } else if (uFace < 4.5) {
      // 키위: 가운데에만 하얀 심, 둘레는 씨 고리와 과육
      vec2 cq = fxF / vec2(.21, .17);
      float cr = length(cq) + fxN2(vec2(fxA * 4., 2.)) * .08;
      float core = 1. - smoothstep(.9, 1.05, cr);
      float septa = (1. - smoothstep(.0, .25, abs(fract(fxA / 6.2832 * 30. + fxN2(vec2(fxR * 3., fxA)) * .15) - .5) * 2.)) * smoothstep(.2, .26, fxR) * (1. - smoothstep(.5, .6, fxR));
      float inner = smoothstep(.2, .26, fxR) * (1. - smoothstep(.5, .58, fxR));
      fxSeed = max(fxSeedRing(fxF, .28, .36, 60., vec2(.012, .03), 4.), fxSeedRing(fxF, .38, .47, 70., vec2(.012, .03), 8.));
      fxC = mix(fxC, fxC * vec3(1.12, 1.14, .82) + .04, inner * .55);
      fxC = mix(fxC, vec3(.86, .93, .62), septa * .5);
      fxC = mix(fxC, fxC * 1.08, (.5 + .5 * sin(fxA * 90.)) * smoothstep(.55, .7, fxR) * .4);
      vec2 vb = fract(fxF * 14.) - .5;
      fxC = mix(fxC, fxC * 1.2 + .04, (1. - smoothstep(.04, .07, length(vb))) * step(.8, fxH2(floor(fxF * 14.))) * smoothstep(.6, .7, fxR) * .5);
      fxC = mix(fxC, vec3(.94, .93, .8) * (.95 + .05 * sin(fxA * 40.)), core);
      fxFiber = septa;
      fxTrans = .16;
    } else {
      // 용과
      vec2 g = fxF * 13.;
      vec2 cell = floor(g);
      vec2 f = fract(g) - .5 - (vec2(fxH2(cell + 1.3), fxH2(cell + 2.9)) - .5) * .45;
      float pd = fxPip(f, fxH2(cell + 4.1) * 6.28, vec2(.11, .17));
      float on = step(.12, fxH2(cell + 7.7));
      fxSeed = on * (1. - smoothstep(.8, 1., pd));
      fxC = mix(fxC, fxC * 1.22 + .07, on * (1. - smoothstep(1., 2.6, pd)) * .5);
      fxTrans = .18;
    }
    fxC = mix(fxC, fxSeedC, fxSeed);
    // 과즙 방울: 칸마다 몇 개 맺혀 빛을 모은다
    vec2 fxDg = fxQf * 4. + vSeed * 9.;
    vec2 fxDc = floor(fxDg);
    vec2 fxDf = fract(fxDg) - .5 - (vec2(fxH2(fxDc + 2.), fxH2(fxDc + 6.)) - .5) * .5;
    float fxDr = .11 + .08 * fxH2(fxDc + 4.);
    float fxDrop = step(.84, fxH2(fxDc + 8.)) * (1. - smoothstep(fxDr - .02, fxDr, length(fxDf))) * (1. - fxSkinM);
    float fxDropH = fxDrop * sqrt(max(0., 1. - dot(fxDf, fxDf) / (fxDr * fxDr)));
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, (fxCv.z * .0004 - (1. - smoothstep(0., .12, fxCv.y)) * .0004) * fxGrainK - fxSeed * .002 + fxFiber * .0005 + fxSkinM * .002 + fxDropH * .004);',
  surface: 'roughnessFactor = mix(.22, .45, fxSkinM) * (1. - fxDrop * .9);',
  emissive: `
    totalEmissiveRadiance = diffuseColor.rgb * fxTrans * (1. - fxSeed) * (1. - fxSkinM)
      + vec3(1.) * fxGlint(fxF * 30., .05 + .07 * step(uFace, .5), 1.3) * .5 * (1. - fxSkinM) * (1. - fxSeed)
      + vec3(1.) * fxDropH * fxFresnel(normal, 1.5) * .3;`,
};
B.fruit = {
  // 나무 도마: 결과 칼자국
  color: `
    vec2 fxP = fxBodyUV();
    float fxG = fxN2(vec2(fxP.x * 4. + vSeed * 9., fxP.y * 60.));
    float fxCut = 1. - smoothstep(0., .01, abs(fract(fxP.x * 3. + fxP.y * 1.3 + vSeed) - .5) - .495);
    diffuseColor.rgb *= .82 + .3 * fxG;
    diffuseColor.rgb *= 1. - fxCut * .25;`,
  normal: 'normal = fxBump(normal, fxG * .004 - fxCut * .002);',
  surface: 'roughnessFactor = .7;',
};

S.disco = {
  // 미러볼 조각. 조각마다 조금씩 기울어 있어 돌아가는 색 조명이 걸리는 순간 번쩍인다
  color: `
    vec2 fxG = fxUV() * 6.;
    vec2 fxCell = floor(fxG);
    vec2 fxF = fract(fxG) - .5;
    float fxMir = 1. - smoothstep(.4, .46, max(abs(fxF.x), abs(fxF.y)));
    vec2 fxTilt = (vec2(fxH2(fxCell + vSeed * 7.), fxH2(fxCell + vSeed * 3. + 9.)) - .5) * .5;
    diffuseColor.rgb = mix(vec3(.03), diffuseColor.rgb * .5, fxMir);`,
  normal: 'normal = normalize(normal + (vTx * fxTilt.x + vTy * fxTilt.y) * fxMir);',
  surface: 'roughnessFactor = mix(.6, .04, fxMir); metalnessFactor = fxMir;',
  emissive: `
    vec3 fxRf = reflect(-normalize(vViewPosition), normal);
    vec3 fxSum = vec3(0.);
    for (int i = 0; i < 3; i++) {
      float fa = uTime * (.6 + float(i) * .25) + float(i) * 2.1;
      vec3 fl = normalize(vec3(cos(fa), .4 + .3 * sin(fa * 1.3), sin(fa) * .6 + .5));
      vec3 fc = .5 + .5 * cos(6.2832 * (float(i) * .33 + uTime * .05 + vec3(0., .33, .67)));
      fxSum += fc * pow(max(dot(fxRf, fl), 0.), 60.);
    }
    totalEmissiveRadiance = (fxSum * 3. + diffuse * .18) * fxMir;`,
};
B.disco = {
  surface: 'roughnessFactor = .2; metalnessFactor = .8;',
};

S.comic = {
  // 만화 칸. 빛을 세 단으로 끊어 칠하고, 그늘은 인쇄 망점, 굵은 먹 윤곽선, 하얀 하이라이트
  color: `
    float fxOutline = 1. - smoothstep(.025, .035, fxEdge());
    vec3 fxBase = diffuseColor.rgb;
    diffuseColor.rgb = vec3(0.);`,
  surface: 'roughnessFactor = 1.; metalnessFactor = 0.;',
  emissive: `
    vec3 fxLd = normalize(vec3(-.45, .65, .6));
    float fxNdl = dot(normal, fxLd);
    float fxDot = length(fract(gl_FragCoord.xy / 7.) - .5);
    vec3 fxCol = fxBase;
    if (fxNdl < .15) fxCol = fxBase * .5 * (fxDot < .32 ? .65 : 1.);
    else if (fxNdl < .5) fxCol = fxBase * (fxDot < .2 ? .72 : 1.);
    float fxSpec = pow(max(dot(reflect(-fxLd, normal), normalize(vViewPosition)), 0.), 40.);
    fxCol = mix(fxCol, vec3(1.), step(.5, fxSpec));
    totalEmissiveRadiance = mix(fxCol, vec3(.02), fxOutline);`,
};
B.comic = {
  color: `
    float fxRim = fxBodyRim();
    vec3 fxBc = diffuseColor.rgb;
    diffuseColor.rgb = vec3(0.);`,
  surface: 'roughnessFactor = 1.; metalnessFactor = 0.;',
  emissive: `
    float fxNdl = dot(normal, normalize(vec3(-.45, .65, .6)));
    vec3 fxCol = fxBc * (fxNdl < .2 ? .55 : 1.);
    totalEmissiveRadiance = mix(fxCol, vec3(.02), smoothstep(.9, .93, fxRim));`,
};

S.glass = {
  // 색유리 판. 두꺼운 모서리는 짙고 가운데는 맑게 비친다. 작은 기포, 비스듬히 보면 짙어지고, 분광 무지개
  color: `
    float fxE = smoothstep(0., .12, fxEdge());
    vec2 fxBq = vLocal.xy * 26. + vSeed * 5.;
    float fxBub = (1. - smoothstep(0., .02, length(fract(fxBq) - .5) - .05)) * step(.9, fxH2(floor(fxBq)));
    float fxWave = fxN2(vLocal.xy * 5. + vSeed * 3.);
    diffuseColor.rgb *= .5 + .25 * fxWave;`,
  surface: 'roughnessFactor = .03;',
  emissive: `
    float fxF = fxFresnel(normal, 2.5);
    vec3 fxDisp = .5 + .5 * cos(6.2832 * (fxF * 2. + fxWave + vec3(0., .33, .67)));
    totalEmissiveRadiance = diffuse * (.3 + .3 * (1. - fxE)) + fxDisp * fxF * .3 + vec3(fxBub * .4);
    diffuseColor.a = clamp(diffuseColor.a * mix(1., .72, fxE) + fxF * .3, 0., 1.);`,
};
B.glass = {
  // 맑은 유리 덩어리. 모서리가 빛을 모아 반짝이고 비스듬한 곳일수록 덜 비친다
  color: `float fxRim = smoothstep(.85, 1., fxBodyRim());`,
  surface: 'roughnessFactor = .02;',
  emissive: `
    float fxF = fxFresnel(normal, 2.);
    vec3 fxDisp = .5 + .5 * cos(6.2832 * (fxF * 2.5 + vec3(0., .33, .67)));
    totalEmissiveRadiance = vec3(.85, .95, 1.) * (fxRim * .5 + fxF * .35) + fxDisp * fxF * .25;
    diffuseColor.a = clamp(diffuseColor.a + fxF * .45 + fxRim * .35, 0., 1.);`,
};

S.brick = {
  // 장난감 블록. 2×2 돌기가 실제로 솟아 있고, 돌기 위엔 살짝 오목한 테두리. 반질한 플라스틱
  head: `
    float fxStud(vec2 q) {
      vec2 g = abs(q) - .48;
      float d = length(g);
      return 1. - smoothstep(.24, .27, d);
    }
    float fxBrickH(vec2 p, float seed) {
      vec2 q = p / uSticker.x;
      float s = fxStud(q);
      float top = 1. - smoothstep(.0, .22, length(abs(q) - .48));
      return smoothstep(0., .04, fxEdgeAt(p)) * (.012 + .045 * s + .004 * s * (1. - top));
    }`,
  height: 'fxBrickH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxQk = fxQ();
    float fxS = fxStud(fxQk);
    float fxTop = 1. - smoothstep(.0, .22, length(abs(fxQk) - .48));
    float fxRing = (1. - smoothstep(.0, .025, abs(length(abs(fxQk) - .48) - .16))) * fxS;
    diffuseColor.rgb *= (.97 + .05 * fxN2(vLocal.xy * 120.)) * (1. - fxRing * .12);`,
  surface: 'roughnessFactor = .22;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .06;',
};
B.brick = {
  surface: 'roughnessFactor = .3;',
};

S.doodle = {
  // 공책에 마커로 그린 낙서. 면마다 그림이 다르고(별, 하트, 웃는 얼굴, 나선, 번개, 꽃), 손그림 애니메이션처럼
  // 1초에 여섯 번 선이 꿈틀거린다. 안은 마커로 빗금 칠, 선 끝이 번지고 겹친 곳은 짙다
  head: `
    float fxDSeg(vec2 p, vec2 a, vec2 b) {
      vec2 pa = p - a, ba = b - a;
      return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0., 1.));
    }
    float fxDoodleSD(vec2 q) {
      float r = length(q);
      float th = atan(q.y, q.x);
      if (uFace < .5) {
        float k = abs(fract(th / 6.2832 * 5. + .25) - .5) * 2.;
        return r - (.32 + .32 * pow(k, 1.6));
      } else if (uFace < 1.5) {
        // 하트 곡선 (x² + y² - 1)³ - x²y³ = 0. 기울기로 나눠 거리처럼 쓴다
        vec2 p = q * 1.45 + vec2(0., .12);
        float a = dot(p, p) - 1.;
        float f = a * a * a - p.x * p.x * p.y * p.y * p.y;
        vec2 g = vec2(6. * p.x * a * a - 2. * p.x * p.y * p.y * p.y, 6. * p.y * a * a - 3. * p.x * p.x * p.y * p.y);
        return f / max(length(g), .3) / 1.45;
      } else if (uFace < 2.5) {
        return abs(r - .58) - .001;
      } else if (uFace < 3.5) {
        float s = r / .62 - th / 6.2832 * .25;
        return (abs(fract(s * 4.) - .5) - .001) / 4. * .62 + max(0., r - .64);
      } else if (uFace < 4.5) {
        vec2 a = vec2(.15, .7), b = vec2(-.3, .02), c = vec2(.12, .05), d = vec2(-.12, -.68);
        return min(min(fxDSeg(q, a, b), fxDSeg(q, b, c)), fxDSeg(q, c, d)) - .001;
      } else {
        float pet = .38 + .2 * cos(th * 5.);
        return r - pet;
      }
    }`,
  color: `
    vec2 fxQd = fxQ();
    float fxBoil = floor(uTime * 6.);
    vec2 fxWob = (vec2(fxN2(fxQd * 3. + fxBoil * 1.7), fxN2(fxQd * 3. + 9. - fxBoil * 1.3)) - .5) * .06;
    vec2 fxQw = fxQd + fxWob;
    float fxSd = fxDoodleSD(fxQw);
    float fxOutline = 1. - smoothstep(.025, .045, abs(fxSd));
    float fxFill = step(fxSd, 0.) * step(uFace, 1.5) + step(fxSd, 0.) * step(4.5, uFace);
    fxFill *= step(.45, fract((fxQw.x + fxQw.y) * 9. + fxN2(fxQw * 4.) * .6));
    if (uFace > 1.5 && uFace < 2.5) {
      fxFill = 0.;
      float eyes = 1. - smoothstep(.06, .08, length(vec2(abs(fxQw.x) - .2, fxQw.y - .15)));
      float smile = (1. - smoothstep(.025, .045, abs(length(fxQw - vec2(0., .08)) - .36))) * step(fxQw.y, -.05);
      fxOutline = max(fxOutline, max(eyes, smile));
    }
    float fxInk = clamp(fxOutline + fxFill * .55, 0., 1.);
    vec3 fxPaper = vec3(.97, .96, .92) * (.95 + .05 * fxN2(vLocal.xy * 90.));
    float fxLines = (1. - smoothstep(0., .01, abs(fract(fxUV().y * 7.) - .5) - .49)) * .3;
    fxPaper = mix(fxPaper, vec3(.55, .7, .9), fxLines);
    vec3 fxMarker = diffuseColor.rgb * (.85 + .2 * fxN2(vec2(fxQw.x * 30., fxQw.y * 4.)));
    diffuseColor.rgb = mix(fxPaper, fxMarker, fxInk);`,
  surface: 'roughnessFactor = .85;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .1;',
};
B.doodle = {
  // 공책 표지 같은 판지
  color: `diffuseColor.rgb *= .88 + .2 * fxN3(vLocal * 50. + vSeed);`,
  surface: 'roughnessFactor = .9;',
};

S.dice = {
  // 면마다 주사위 한 면. 진짜 주사위처럼 마주 보는 면의 눈을 더하면 7이고(R1·L6, U2·D5, F3·B4),
  // 눈은 움푹 파여 있다. 1은 크게
  head: `
    float fxPipCount() { return uFace < .5 ? 1. : (uFace < 1.5 ? 6. : (uFace < 2.5 ? 2. : (uFace < 3.5 ? 5. : (uFace < 4.5 ? 3. : 4.)))); }
    float fxPip(vec2 q) {
      float n = fxPipCount();
      float d = 9.;
      if (mod(n, 2.) > .5) d = min(d, length(q));
      if (n > 1.5) d = min(d, min(length(q - vec2(-.5, .5)), length(q - vec2(.5, -.5))));
      if (n > 3.5) d = min(d, min(length(q - vec2(.5, .5)), length(q - vec2(-.5, -.5))));
      if (n > 5.5) d = min(d, min(length(q - vec2(-.5, 0.)), length(q - vec2(.5, 0.))));
      return d;
    }
    float fxPipR() { return fxPipCount() < 1.5 ? .28 : .17; }
    float fxDiceH(vec2 p, float seed) {
      float d = fxPip(p / uSticker.x);
      float r = fxPipR();
      float pit = (1. - smoothstep(r - .03, r, d)) * sqrt(max(0., 1. - (d / r) * (d / r)));
      return smoothstep(0., .12, fxEdgeAt(p)) * (.03 - .022 * pit);
    }`,
  height: 'fxDiceH',
  color: `
    if (fxEdge() < 0.) discard;
    float fxD = fxPip(fxQ());
    float fxIn = 1. - smoothstep(fxPipR() - .015, fxPipR(), fxD);
    vec3 fxBody = diffuseColor.rgb;
    vec3 fxDot = dot(fxBody, vec3(.3, .59, .11)) > .6 ? vec3(.08, .07, .07) : vec3(.97, .96, .92);
    diffuseColor.rgb = mix(fxBody * (.97 + .05 * fxN2(vLocal.xy * 90.)), fxDot, fxIn);`,
  surface: 'roughnessFactor = mix(.12, .4, fxIn);',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .05;',
};
B.dice = {
  surface: 'roughnessFactor = .25;',
};

S.mosaic = {
  // 비잔틴 모자이크. 줄마다 어긋나게 박은 작은 돌 조각, 사이사이 줄눈, 마름모 띠는 금 조각, 가운데는 짙은 돌.
  // 조각마다 조금씩 기울게 박혀 있어 보는 각도에 따라 금이 반짝인다
  color: `
    vec2 fxU = fxUV() * 9.;
    float fxRow = floor(fxU.y);
    vec2 fxG = vec2(fxU.x + fxH1(fxRow + vSeed) * .5, fxU.y);
    vec2 fxCell = floor(fxG);
    vec2 fxF = fract(fxG);
    vec2 fxJit = (vec2(fxH2(fxCell + 1.7), fxH2(fxCell + 9.1)) - .5) * .12;
    vec2 fxFd = abs(fxF - .5 - fxJit);
    float fxGrout = smoothstep(.36, .46, max(fxFd.x, fxFd.y));
    vec2 fxCq = (fxCell + .5) / 9. * 2. - 1.;
    float fxDia = abs(fxCq.x) + abs(fxCq.y);
    float fxGold = step(abs(fxDia - .667), .05);
    float fxHub = step(fxDia, .25);
    vec3 fxTint = diffuseColor.rgb * (.78 + .38 * fxH2(fxCell + vSeed * 3.));
    vec3 fxC = mix(fxTint, diffuseColor.rgb * .55, fxHub);
    fxC = mix(fxC, vec3(.86, .58, .16) * (.75 + .4 * fxH2(fxCell + 5.)), fxGold);
    fxC = mix(fxC, vec3(.2, .18, .15), fxGrout);
    vec2 fxTilt = (vec2(fxH2(fxCell + 3.3), fxH2(fxCell + 7.7)) - .5) * .35;
    diffuseColor.rgb = fxC;`,
  normal: `
    normal = normalize(normal + (vTx * fxTilt.x + vTy * fxTilt.y) * (1. - fxGrout));
    normal = fxBump(normal, -fxGrout * .004 + fxN2(fxF * 6. + fxCell) * .001);`,
  surface: 'roughnessFactor = mix(mix(.35, .26, fxGold), .9, fxGrout); metalnessFactor = fxGold * (1. - fxGrout) * .75;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .05;',
};
B.mosaic = {
  // 회반죽
  color: `diffuseColor.rgb *= .85 + .2 * fxN3(vLocal * 40. + vSeed);`,
  surface: 'roughnessFactor = .9;',
};

S.ink = {
  // 한지에 떨어뜨린 먹. 방울이 번지며 번지는 끝에 먹이 고여 테가 지고, 다 번지면 스러졌다 다시 떨어진다.
  // 면마다 먹 색이 다르다(먹, 주홍, 쪽빛, 송화색, 녹색, 자주)
  color: `
    vec2 fxQi = fxQ();
    float fxInk = 0.;
    // 값 노이즈를 격자 그대로 쓰면 번진 자리가 네모 모자이크처럼 보여서 겹마다 축을 돌린다
    float fxFeather = smoothstep(.3, .75, fxN2(fxRot(.6) * fxQi * 4. + vSeed) * .62 + fxN2(fxRot(1.9) * fxQi * 9.5 + vSeed) * .38);
    for (int k = 0; k < 2; k++) {
      float fk = float(k);
      float ph = uTime / 9. + fxH1(vSeed * 3.) + fk * .5;
      float t = fract(ph);
      float n0 = floor(ph) * 2. + fk;
      vec2 c0 = (vec2(fxH1(vSeed * 5. + n0), fxH1(vSeed * 9. + n0 * 1.3)) - .5) * .7;
      float dist = length(fxQi - c0) + (fxN2(fxRot(.4) * fxQi * 2.6 + vSeed * 7. + n0) * .65 + fxN2(fxRot(2.2) * fxQi * 6. + n0) * .35 - .5) * .55;
      float rad = smoothstep(0., .6, t) * 1.05;
      float bloom = 1. - smoothstep(rad - .3, rad, dist);
      float rim = exp(-pow((dist - rad + .04) / .05, 2.)) * bloom;
      float fade = 1. - smoothstep(.6, 1., t);
      fxInk = max(fxInk, clamp(bloom * (.72 + .2 * fxFeather) + rim * .4, 0., 1.) * fade);
    }
    float fxWash = .42 + .12 * fxN2(fxRot(1.1) * fxQi * 1.4 + vSeed * 2.);
    fxInk = max(fxInk, fxWash);
    float fxFiber = fxN2(vec2(vLocal.x * 40., vLocal.y * 400.) + vSeed) * fxN2(vLocal.xy * 25.);
    vec3 fxPaper = vec3(.95, .92, .85) * (.9 + .12 * fxF2(vLocal.xy * 60.)) * (1. - fxFiber * .08);
    diffuseColor.rgb = mix(fxPaper, diffuseColor.rgb * (.8 + .25 * fxFeather), fxInk);`,
  surface: 'roughnessFactor = .95;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .08;',
};
B.ink = {
  // 연한 나무 액자
  color: `diffuseColor.rgb *= .82 + .3 * fxN2(vec2(fxBodyUV().x * 5. + vSeed * 9., fxBodyUV().y * 60.));`,
  surface: 'roughnessFactor = .6;',
};

S.marquetry = {
  // 나무 상감. 면마다 나무가 다르고(호두, 단풍, 체리, 흑단, 올리브, 퍼플하트), 네 조각의 결이 바람개비처럼
  // 엇갈린다. 가운데엔 대비되는 나무로 나침반 별을 박고, 둘레와 테두리엔 밝은 나무 띠를 가늘게 둘렀다
  color: `
    vec2 fxQm = fxQ();
    float fxQuad = (fxQm.x > 0. ? 1. : 0.) + (fxQm.y > 0. ? 2. : 0.);
    vec2 fxGq = fxRot(fxQuad * 1.5708 + .785) * fxQm;
    float fxGrain = fxN2(vec2(fxGq.x * 2. + vSeed * 9. + fxQuad * 3., fxGq.y * 26. + fxN2(fxGq * 3.) * 4.));
    float fxFig = .5 + .5 * sin(fxGq.y * 22. + fxF2(fxGq * 2. + fxQuad) * 7.);
    float fxSeam = 1. - smoothstep(.004, .012, min(abs(fxQm.x), abs(fxQm.y)));
    vec3 fxWood = diffuseColor.rgb * (.7 + .32 * fxGrain) * (.82 + .26 * fxFig) * (1. - fxSeam * .35);
    // 가운데 나침반 별. 큰 네 갈래와 작은 네 갈래, 갈래마다 양쪽을 다른 결로 붙여 입체처럼 보인다
    float fxR = length(fxQm);
    float fxTh = atan(fxQm.y, fxQm.x);
    float fxStar = max(step(fxR, .4 * (.22 + .78 * pow(abs(cos(fxTh * 2.)), 5.))), step(fxR, .26 * (.3 + .7 * pow(abs(sin(fxTh * 2.)), 5.))));
    float fxHalf = step(0., sin(fxTh * 8.));
    float fxString = max(1. - smoothstep(.012, .025, abs(fxEdge() / uSticker.x - .1)), 1. - smoothstep(.01, .02, abs(fxR - .44)));
    vec3 fxLight = dot(diffuseColor.rgb, vec3(.3, .59, .11)) > .55 ? vec3(.28, .18, .12) : vec3(.92, .84, .66);
    vec3 fxStarC = fxLight * mix(.72, 1., fxHalf) * (.88 + .18 * fxN2(vec2(fxTh * 3., fxR * 40.)));
    vec3 fxC = mix(fxWood, fxStarC, fxStar);
    fxC = mix(fxC, fxLight, fxString);
    float fxInlay = fxStar;
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxGrain * .0015 - fxString * .001);',
  surface: 'roughnessFactor = .28 + .15 * fxGrain;',
};
B.marquetry = {
  color: `diffuseColor.rgb *= .78 + .3 * fxN2(vec2(fxBodyUV().x * 4. + vSeed * 9., fxBodyUV().y * 60.));`,
  surface: 'roughnessFactor = .35;',
};

S.lavalamp = {
  // 70년대 거실의 라바램프. 다 맞추면 면 하나가 램프 한 개의 유리창이 된다. 아래서 데워진 밀랍 덩어리가 천천히 떠올랐다 가라앉고,
  // 서로 붙었다 갈라지며, 바닥엔 녹은 밀랍이 고여 있다. 덩어리는 둥글게 볼록해 윗면에 빛이 맺히고 가장자리가 밝게 비치며,
  // 속은 더 짙게 달아올랐다. 밀랍 색이 곧 면 색이고, 둘레 액체는 바닥 전구 빛을 받아 아래가 밝다.
  // 유리관에 세로로 빛줄이 맺히고 작은 기포가 오른다
  color: `
    vec2 fxF = fxFace();
    float fxT = uTime * .2;
    float fxField = 0.;
    vec2 fxGrad = vec2(0.);
    for (int i = 0; i < 7; i++) {
      float fi = float(i);
      float h = fxH1(fi * 7.3 + uFace * 3.1);
      vec2 c = vec2((h - .5) * 1.3 + .15 * sin(fxT * .7 + fi * 2.), sin(fxT * (.35 + h * .4) + fi * 1.7) * .82);
      float r = .15 + .13 * fxH1(fi * 3.1 + uFace);
      vec2 d = fxF - c;
      float dd = max(dot(d, d), 1e-4);
      fxField += r * r / dd;
      fxGrad += -2. * r * r * d / (dd * dd);
    }
    float fxYb = fxF.y + 1.18;
    fxField += .05 / max(fxYb * fxYb, 1e-3);
    fxGrad.y += -.1 / max(fxYb * fxYb * fxYb, 1e-3);
    float fxBlob = smoothstep(.96, 1.04, fxField);
    vec3 fxN = normalize(vec3(-fxGrad * .06, 1.));
    vec3 fxLd = normalize(vec3(-.4, .6, .7));
    float fxDiff = max(dot(fxN, fxLd), 0.);
    float fxSpec = pow(max(dot(reflect(-fxLd, fxN), vec3(0., 0., 1.)), 0.), 30.);
    float fxRim = 1. - fxN.z;
    float fxCore = smoothstep(1.3, 3., fxField);
    float fxHeat = 1. - smoothstep(-1., .3, fxF.y);
    vec3 fxWax = diffuseColor.rgb;
    vec3 fxWaxC = fxWax * (.45 + .55 * fxDiff) + fxWax * fxCore * .45 + mix(fxWax, vec3(1.), .4) * fxRim * .5 + vec3(1.) * fxSpec * .7;
    vec3 fxLiquid = mix(vec3(.04, .02, .06), fxWax * .2, .5) + fxWax * fxHeat * .22;
    fxLiquid *= .85 + .3 * fxN2(vec2(fxF.x * 3., fxF.y * .8 - uTime * .05));
    vec2 fxBg = fract(vec2(fxF.x * 9., fxF.y * 6. - uTime * .25)) - .5;
    float fxBubble = (1. - smoothstep(.04, .07, length(fxBg))) * step(.88, fxH2(floor(vec2(fxF.x * 9., fxF.y * 6. - uTime * .25))));
    fxLiquid += vec3(.5) * fxBubble * (1. - fxBlob) * .5;
    float fxGlassHi = (1. - smoothstep(0., .05, abs(fxF.x + .62))) * .45 + (1. - smoothstep(0., .025, abs(fxF.x - .7))) * .25;
    vec3 fxCol = mix(fxLiquid, fxWaxC, fxBlob) + vec3(fxGlassHi);
    diffuseColor.rgb = fxCol * .15;`,
  surface: 'roughnessFactor = .06;',
  emissive: 'totalEmissiveRadiance = fxCol * (1. + fxHeat * .25);',
};
B.lavalamp = {
  // 크롬 받침
  surface: 'roughnessFactor = .18; metalnessFactor = 1.;',
};

S.bubblewrap = {
  // 뽁뽁이로 싼 큐브. 칸마다 색종이 위에 공기 방울이 4×4로 실제로 볼록 솟아 있고, 반질한 비닐에
  // 빛이 맺힌다. 방울이 하나씩 톡 터지며 반짝하고 납작하게 구겨졌다가, 한참 지나면 다시 부푼다
  head: `
    // xy 방울 안 위치, z 터지는 주기(0~1), w 부푼 정도
    vec4 fxBub(vec2 q, float seed) {
      vec2 g = q * 2. + 2.;
      vec2 cell = floor(g);
      vec2 f = fract(g) - .5;
      float cyc = fract(uTime / 40. + fxH2(cell + seed * 7.));
      float popped = smoothstep(.7, .705, cyc) * (1. - smoothstep(.93, 1., cyc));
      return vec4(f, cyc, 1. - popped);
    }
    float fxBubbleH(vec2 p, float seed) {
      vec2 q = p / uSticker.x;
      vec4 b = fxBub(q, seed);
      float r = length(b.xy) / .4;
      float dome = sqrt(max(0., 1. - r * r));
      float crumple = ((fxN2(q * 30. + seed) - .5) * .004 + .002) * step(r, 1.);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + mix(crumple, .04 * dome, b.w));
    }`,
  height: 'fxBubbleH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxQb = fxQ();
    vec4 fxB = fxBub(fxQb, vSeed);
    float fxR = length(fxB.xy) / .4;
    float fxIn = 1. - smoothstep(.95, 1.02, fxR);
    float fxRing = 1. - smoothstep(0., .1, abs(fxR - 1.));
    vec3 fxPaper = diffuseColor.rgb * (.92 + .08 * fxN2(vLocal.xy * 120.));
    fxPaper *= dot(diffuseColor.rgb, vec3(.3, .59, .11)) > .85 ? .78 : 1.;
    vec3 fxC = fxPaper * (1. + .14 * fxIn * fxB.w);
    vec3 fxRingC = dot(fxPaper, vec3(.3, .59, .11)) > .8 ? vec3(.62, .68, .74) : vec3(.92, .96, 1.);
    fxC = mix(fxC, fxRingC, fxRing * .35);
    vec2 fxUpB = -fxDown();
    vec2 fxHo = fxUpB * .13 + vec2(-fxUpB.y, fxUpB.x) * .1;
    float fxSpec = exp(-dot(fxB.xy - fxHo, fxB.xy - fxHo) / .003) * fxB.w;
    float fxPop = (1. - fxB.w) * fxIn;
    vec2 fxCell = floor(fxQb * 2. + 2.);
    float fxCrease = (1. - smoothstep(0., .07, abs(fxN2(fxB.xy * 9. + fxCell * 3.7) - .5))) * fxPop;
    fxC = mix(fxC, vec3(.95), fxCrease * .5);
    float fxFlash = exp(-pow((fxB.z - .703) / .005, 2.)) * fxIn;
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxCrease * .0015);',
  surface: 'roughnessFactor = mix(.1, .3, fxPop);',
  emissive: `
    totalEmissiveRadiance = vec3(.9, .95, 1.) * (fxFresnel(normal, 2.5) * .35 * fxIn + fxRing * .06)
      + vec3(1.) * (fxFlash * 1.4 + fxSpec * .9) + diffuseColor.rgb * .05;`,
};
B.bubblewrap = {
  surface: 'roughnessFactor = .35;',
};

S.thermal = {
  // 열화상 카메라 화면. 면마다 온도가 다르고(차가운 남색, 보라, 자홍, 주황, 노랑, 하얗게 달아오른 것),
  // 그 위로 열이 아지랑이처럼 일렁인다. 손가락을 가져가면 그 자리가 데워져 밝아지고,
  // 돌리면 가장자리부터 마찰열이 오른다. 센서 잡음과 뷰파인더 모서리 표시
  head: `
    vec3 fxIron(float t) {
      t = clamp(t, 0., 1.);
      vec3 c0 = vec3(.02, .01, .08), c1 = vec3(.2, .05, .5), c2 = vec3(.66, .06, .56), c3 = vec3(.96, .26, .14);
      vec3 c4 = vec3(1., .64, .06), c5 = vec3(1., .94, .5), c6 = vec3(1.);
      if (t < .16) return mix(c0, c1, t / .16);
      if (t < .34) return mix(c1, c2, (t - .16) / .18);
      if (t < .52) return mix(c2, c3, (t - .34) / .18);
      if (t < .7) return mix(c3, c4, (t - .52) / .18);
      if (t < .87) return mix(c4, c5, (t - .7) / .17);
      return mix(c5, c6, (t - .87) / .13);
    }
    float fxBaseTemp() {
      return uFace < .5 ? .43 : uFace < 1.5 ? .08 : uFace < 2.5 ? .98 : uFace < 3.5 ? .27 : uFace < 4.5 ? .57 : .75;
    }`,
  color: `
    vec2 fxQt = floor(fxQ() * 24.) / 24.;
    float fxBlob = fxF2(fxQt * 1.6 + vec2(uTime * .07, -uTime * .045) + vSeed * 5.);
    float fxTemp = fxBaseTemp() + (fxBlob - .5) * .13;
    vec3 fxTo = uPointer + vViewPosition;
    fxTemp += exp(-dot(fxTo, fxTo) * 1.6) * .35;
    fxTemp += uCharge * .25 * (1. - smoothstep(0., .4, fxEdge() / uSticker.x));
    fxTemp += (fxH2(floor(fxQ() * 40.) + floor(uTime * 15.)) - .5) * .025;
    vec3 fxCol = fxIron(fxTemp);
    vec2 fxA = abs(fxQ());
    float fxBr = step(.78, max(fxA.x, fxA.y)) * step(max(fxA.x, fxA.y), .82) * step(.6, min(fxA.x, fxA.y));
    float fxCross = step(max(fxA.x, fxA.y), .1) * step(min(fxA.x, fxA.y), .012);
    float fxMark = max(fxBr, fxCross);
    diffuseColor.rgb = fxCol * .12;`,
  surface: 'roughnessFactor = .3;',
  emissive: 'totalEmissiveRadiance = fxCol * .8 * (1. - fxMark * .6) + vec3(fxMark * .8);',
};
B.thermal = {
  // 몸통도 화면에 잡힌다. 차갑게 남색이고, 돌리면 모서리부터 데워진다
  head: `
    vec3 fxIronB(float t) {
      t = clamp(t, 0., 1.);
      return t < .16 ? mix(vec3(.02, .01, .08), vec3(.2, .05, .5), t / .16) : mix(vec3(.2, .05, .5), vec3(.66, .06, .56), (t - .16) / .18);
    }`,
  color: `
    float fxRim = smoothstep(.85, 1., fxBodyRim());
    float fxTb = .05 + .08 * fxN3(vLocal * 4. + vec3(0., uTime * .1, 0.)) + uCharge * .2 * fxRim;
    vec3 fxCb = fxIronB(fxTb);
    diffuseColor.rgb = fxCb * .2;`,
  surface: 'roughnessFactor = .4;',
  emissive: 'totalEmissiveRadiance = fxCb * .9;',
};

S.kaleido = {
  // 만화경 속. 칸마다 거울 세 장이 비춘 색유리 조각이 천천히 돌며 무늬가 피었다 진다.
  // 면 색 유리가 가장 많고 다른 색 조각이 섞이며, 조각 사이 검은 틈과 반짝임. 둥근 통 바깥은 어둡다
  color: `
    vec2 fxQk = fxQ();
    float fxR = length(fxQk);
    float fxDirK = fxH1(vSeed) > .5 ? 1. : -1.;
    float fxA = atan(fxQk.y, fxQk.x) + uTime * .1 * fxDirK;
    float fxSeg = .5236;
    float fxAm = abs(mod(fxA, 2. * fxSeg) - fxSeg);
    vec2 fxK = vec2(cos(fxAm), sin(fxAm)) * fxR;
    vec2 fxDrift = vec2(uTime * .06, uTime * .035);
    vec3 fxV = fxVoronoi(fxK * 4.6 + vSeed * 7. + fxDrift);
    float fxLead = 1. - smoothstep(.02, .06, fxV.y);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxAcc = .5 + .5 * cos(6.2832 * (fxV.z + vec3(0., .33, .67)));
    vec3 fxGlassK = fxV.z < .62 ? fxBase * (.7 + .5 * fxH1(fxV.z * 31.)) : mix(fxAcc, fxBase, .25);
    float fxTube = 1. - smoothstep(.93, 1., fxR);
    float fxSpark = pow(max(0., 1. - fxV.x * 2.4), 6.);
    diffuseColor.rgb = mix(vec3(.02), fxGlassK * (1. - fxLead * .85), fxTube);`,
  surface: 'roughnessFactor = .15;',
  emissive: 'totalEmissiveRadiance = fxGlassK * (1. - fxLead * .9) * (.8 + .4 * fxSpark) * fxTube;',
};
B.kaleido = {
  // 놋쇠 통. 둘레에 가는 고리가 패여 있다
  color: `float fxRing = step(.6, fract(fxBodyUV().y * 12.));`,
  normal: 'normal = fxBump(normal, fxRing * .002);',
  surface: 'roughnessFactor = .3; metalnessFactor = 1.;',
};

S.flip = {
  // 역 대합실의 플립 보드. 칸마다 반으로 갈린 판에 숫자가 적혀 있다가, 때가 되면 위쪽 판이 툭 떨어지며
  // 다음 숫자로 넘어간다. 판 색이 곧 면 색이고, 가운데 갈라진 틈과 경첩, 떨어지는 판 밑의 그늘.
  // 판은 늘 화면 아래쪽으로 떨어지도록 90도 단위로 세워 그린다(큐브를 굴리면 숫자도 따라 선다)
  head: `
    const int fxSegs[10] = int[10](63, 6, 91, 79, 102, 109, 125, 7, 127, 111);
    float fxSegD(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0., 1.)); }
    // 7획 숫자 n까지의 거리
    float fxDigit(vec2 p, float n) {
      int m = fxSegs[int(mod(n, 10.))];
      float d = 9.;
      float w = .24, h = .4;
      if ((m & 1) != 0) d = min(d, fxSegD(p, vec2(-w, h), vec2(w, h)));
      if ((m & 2) != 0) d = min(d, fxSegD(p, vec2(w, h), vec2(w, 0.)));
      if ((m & 4) != 0) d = min(d, fxSegD(p, vec2(w, 0.), vec2(w, -h)));
      if ((m & 8) != 0) d = min(d, fxSegD(p, vec2(-w, -h), vec2(w, -h)));
      if ((m & 16) != 0) d = min(d, fxSegD(p, vec2(-w, 0.), vec2(-w, -h)));
      if ((m & 32) != 0) d = min(d, fxSegD(p, vec2(-w, h), vec2(-w, 0.)));
      if ((m & 64) != 0) d = min(d, fxSegD(p, vec2(-w, 0.), vec2(w, 0.)));
      return d;
    }`,
  color: `
    vec2 fxUpS = -fxDown();
    float fxSnap = floor(atan(fxUpS.y, fxUpS.x) / 1.5708 + .5) * 1.5708;
    vec2 fxSu = vec2(cos(fxSnap), sin(fxSnap));
    vec2 fxQf = vec2(dot(fxQ(), vec2(fxSu.y, -fxSu.x)), dot(fxQ(), fxSu));
    float fxPer = 3. + 5. * fxH1(vSeed * 7.);
    float fxTt = uTime / fxPer + fxH1(vSeed * 3.) * 10.;
    float fxN = floor(fxTt);
    float fxPh = fract(fxTt) * fxPer;
    float fxFlipK = clamp((fxPh - (fxPer - .32)) / .32, 0., 1.);
    float fxCur = floor(fxH1(fxN * .37 + vSeed) * 10.);
    float fxNext = floor(fxH1((fxN + 1.) * .37 + vSeed) * 10.);
    vec2 fxCard = vec2(.86, .86);
    float fxIn = step(fxBox(fxQf, fxCard, .1), 0.);
    float fxTopH = step(0., fxQf.y);
    float fxShow = fxTopH > .5 ? (fxFlipK > 0. ? fxNext : fxCur) : (fxFlipK >= 1. ? fxNext : fxCur);
    vec2 fxSample = fxQf;
    float fxFlap = 0.;
    float fxCs = cos(fxFlipK * 3.1416);
    if (fxFlipK > 0. && fxFlipK < 1.) {
      if (fxFlipK < .5 && fxQf.y > 0. && fxQf.y < fxCard.y * fxCs) { fxFlap = 1.; fxShow = fxCur; fxSample = vec2(fxQf.x, fxQf.y / max(fxCs, .05)); }
      if (fxFlipK >= .5 && fxQf.y < 0. && fxQf.y > -fxCard.y * abs(fxCs)) { fxFlap = 1.; fxShow = fxNext; fxSample = vec2(fxQf.x, fxQf.y / max(abs(fxCs), .05)); }
    }
    float fxDd = fxDigit(fxSample * vec2(1., 1.), fxShow);
    float fxInk = 1. - smoothstep(.07, .085, fxDd);
    float fxGap = 1. - smoothstep(.008, .018, abs(fxQf.y));
    float fxHinge = (1. - smoothstep(.03, .04, length(vec2(abs(fxQf.x) - .9, fxQf.y))));
    float fxShade = fxFlap * (fxFlipK < .5 ? fxFlipK * 1.2 : (1. - fxFlipK) * 1.2);
    float fxUnder = (fxFlipK > 0. && fxFlipK < .5 && fxQf.y < 0.) ? (1. - smoothstep(0., .25, -fxQf.y)) * .4 * fxFlipK * 2. : 0.;
    vec3 fxCardC = diffuseColor.rgb * mix(1., .9, step(fxQf.y, 0.)) * (1. - fxShade * .5) * (1. - fxUnder);
    vec3 fxInkC = dot(diffuseColor.rgb, vec3(.3, .59, .11)) > .62 ? vec3(.08) : vec3(.97, .96, .92);
    vec3 fxC = mix(fxCardC, fxInkC * (1. - fxShade * .4), fxInk);
    fxC = mix(fxC, vec3(.02), fxGap);
    fxC = mix(vec3(.05), fxC, fxIn);
    fxC = mix(fxC, vec3(.35), fxHinge);
    diffuseColor.rgb = fxC;`,
  surface: 'roughnessFactor = .45;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .05;',
};
B.flip = {
  surface: 'roughnessFactor = .5; metalnessFactor = .3;',
};

S.blackhole = {
  // 블랙홀. 다 맞추면 면 하나에 블랙홀 하나가 들어앉는다. 가운데 그림자와 그 둘레의 가는 광자 고리,
  // 뒤편 원반이 중력에 휘어 그림자 위아래로 넘어온 빛 고리, 앞을 가로지르는 얇은 강착 원반.
  // 다가오는 왼쪽이 더 밝고(도플러 빔), 원반이 돌며 뜨거운 가스 줄기가 흐른다. 둘레 별빛은 휘어 늘어진다.
  // 원반 빛이 곧 면 색
  color: `
    vec2 fxF = fxFace();
    float fxR = length(fxF);
    float fxA = atan(fxF.y, fxF.x);
    float fxT = uTime;
    vec3 fxHot = diffuseColor.rgb;
    vec2 fxLens = fxF * (1. + .05 / (fxR * fxR + .03));
    float fxStar = step(.985, fxH2(floor(fxLens * 70.))) * (.5 + .5 * sin(fxT * 3. + fxH2(floor(fxLens * 70.) + 3.) * 20.));
    vec3 fxBg = fxHot * .1 * exp(-fxR * 1.4) + vec3(.6, .7, 1.) * fxStar * .6 + fxHot * .03 * fxN2(fxF * 3.);
    float fxShadow = 1. - smoothstep(.18, .195, fxR);
    float fxPhoton = exp(-pow((fxR - .205) / .011, 2.));
    float fxSwirl = fxN2(vec2(fxA * 3. - fxT * .5 / max(fxR, .2), fxR * 14.));
    float fxHalo = smoothstep(.2, .23, fxR) * exp(-pow(max(fxR - .23, 0.) / .14, 1.4)) * (.6 + .6 * fxSwirl);
    vec2 fxDp = vec2(fxF.x, fxF.y / .14);
    float fxDr = length(fxDp);
    float fxDa = atan(fxDp.y, fxDp.x);
    float fxGas = fxN2(vec2(fxDa * 4. - fxT * .9 / max(fxDr, .25), fxDr * 9.)) * .6 + fxN2(vec2(fxDa * 9. - fxT * 1.4 / max(fxDr, .25), fxDr * 22.)) * .4;
    float fxDop = 1. + .6 * clamp(-fxDp.x / max(fxDr, .01), -1., 1.);
    float fxDisk = smoothstep(.26, .32, fxDr) * (1. - smoothstep(.75, 1.02, fxDr)) * pow(.32 / max(fxDr, .32), 1.2) * (.45 + .8 * fxGas) * fxDop;
    float fxFront = step(fxF.y, 0.);
    vec3 fxHeat = mix(vec3(1., .97, .9), fxHot, smoothstep(.28, .7, fxDr));
    vec3 fxCol = fxBg + fxHot * fxHalo * 1.1 + fxHeat * fxDisk * (1. - fxFront) * 1.6;
    fxCol *= 1. - fxShadow;
    fxCol += mix(vec3(1.), fxHot, .4) * fxPhoton * 1.4;
    fxCol += fxHeat * fxDisk * fxFront * 1.8;
    diffuseColor.rgb = vec3(.005);`,
  surface: 'roughnessFactor = .2;',
  emissive: 'totalEmissiveRadiance = fxCol;',
};
B.blackhole = {
  color: `float fxRim = smoothstep(.9, 1., fxBodyRim());`,
  surface: 'roughnessFactor = .3; metalnessFactor = .6;',
  emissive: 'totalEmissiveRadiance = uBodyGlow * fxRim * .3;',
};

S.opal = {
  // 블랙 오팔. 짙은 바탕 속에서 색 얼룩이 일렁이고, 보는 각도가 바뀌면 빛 얼룩이 굴러가듯 자리를 옮긴다(롤링 플래시).
  // 사이사이 바늘 끝 같은 핀파이어가 반짝이고, 색이 빠진 젖빛 자리도 있다. 면마다 도는 빛깔이 다르다
  color: `
    vec2 fxF = fxFace();
    float fxPotch = smoothstep(.6, .8, fxN2(fxF * 2.2 + 5.));
    diffuseColor.rgb = mix(vec3(.025, .025, .04), vec3(.22, .24, .27), fxPotch * .5);`,
  surface: 'roughnessFactor = .05;',
  normal: 'normal = fxBump(normal, fxPotch * .0006);',
  emissive: `
    float fxVd = 1. - abs(dot(normal, normalize(vViewPosition)));
    vec2 fxWp = fxF * 2.6 + vec2(fxVd * 1.6, -fxVd) + uTime * .01;
    float fxN = fxF2(fxWp + fxF2(fxWp * 1.7 + 3.) * .8);
    float fxFlashA = smoothstep(.42, .62, fxN);
    float fxHueV = fxF2(fxWp * .8 + 11.);
    vec3 fxB = diffuse;
    vec3 fxFlash = mix(fxB, fxHueV > .5 ? fxB.brg : fxB.gbr, abs(fxHueV - .5) * .3) * (.7 + .6 * fxN);
    vec3 fxV2 = fxVoronoi(fxF * 14. + 7.);
    float fxPin = (1. - smoothstep(0., .22, fxV2.x)) * step(.6, fract(fxV2.z * 3. + fxVd * 2.));
    totalEmissiveRadiance = fxFlash * (fxFlashA * 1.25 + fxPin * .7) * (1. - fxPotch * .7) + fxB * .06;`,
};
B.opal = {
  surface: 'roughnessFactor = .25; metalnessFactor = .5;',
};

S.agate = {
  // 마노 단면. 다 맞추면 면 하나가 반으로 가른 마노 한 덩이다. 가운데 동굴엔 반짝이는 수정이 빽빽이 돋았고,
  // 그 둘레로 굵고 가는 띠가 겹겹이 물결치며, 가장 바깥은 거친 껍질. 매끈하게 갈아 빛이 비쳐 든다
  color: `
    vec2 fxF = fxFace();
    vec2 fxWp = fxF + (vec2(fxN2(fxF * 2. + 1.), fxN2(fxF * 2. + 7.)) - .5) * .28;
    float fxD = max(abs(fxWp.x), abs(fxWp.y)) * .55 + length(fxWp) * .45;
    float fxCav = .2 + .05 * fxN2(vec2(atan(fxF.y, fxF.x) * 2., 3.));
    float fxIn = 1. - smoothstep(fxCav - .01, fxCav + .01, fxD);
    float fxBandP = (fxD - fxCav) * 22. + fxN2(fxF * 8.) * .6;
    float fxBand = fract(fxBandP);
    float fxBandId = floor(fxBandP);
    float fxWhite = step(.7, fxH1(fxBandId * 1.7));
    float fxThin = 1. - smoothstep(0., .12, abs(fxBand - .5) - .36);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxCol = fxBase * (.55 + .65 * fxH1(fxBandId * 3.1));
    fxCol = mix(fxCol, vec3(.95, .95, .92), fxWhite * .75);
    fxCol = mix(fxCol, fxCol * .65, fxThin * .45);
    float fxBorder = 1. - max(abs(fxF.x), abs(fxF.y));
    float fxRind = 1. - smoothstep(.03, .06, fxBorder + (fxN2(fxF * 12.) - .5) * .025);
    fxCol = mix(fxCol, vec3(.42, .36, .3) * (.75 + .35 * fxN2(fxF * 40.)), fxRind);
    vec3 fxCr = fxVoronoi(fxF * 30.);
    float fxFacet = 1. - smoothstep(0., .1, fxCr.y);
    vec3 fxDruzy = mix(fxBase * .5 + .45, vec3(1.), .3) * (.7 + .5 * fxCr.z) * (1. - fxFacet * .4);
    fxCol = mix(fxCol, fxDruzy, fxIn);
    diffuseColor.rgb = fxCol;`,
  normal: 'normal = fxBump(normal, fxIn * (fxCr.z * .003 - fxFacet * .002) + fxRind * fxN2(fxF * 50.) * .003);',
  surface: 'roughnessFactor = mix(mix(.07, .25, fxIn), .8, fxRind);',
  emissive: 'totalEmissiveRadiance = fxCol * .2 * (1. - fxWhite * .5) * (1. - fxRind) + vec3(1.) * fxGlint(fxF * 30., .25, 2.) * fxIn * 1.2;',
};
B.agate = {
  color: `diffuseColor.rgb *= .75 + .35 * fxN3(vLocal * 30. + vSeed);`,
  surface: 'roughnessFactor = .85;',
};

S.camo = {
  // 위장 무늬 립스톱 천. 다 맞추면 면마다 한 장으로 이어진다. 면마다 무늬가 다르다: 숲(붓으로 그린 듯한 초록·갈색·검정·황토 얼룩),
  // 사막(모래색 바탕, 갈색 얼룩과 검고 흰 초콜릿칩 잔점), 디지털 바다(크고 작은 네모 화소로 깨진 파랑), 사냥용 주황(나뭇가지 그림자),
  // 분홍, 설원(흰 바탕에 옅은 회청색 화소). 잉크가 천에 살짝 번지고, 촘촘한 격자 립스톱과 능직 결, 큰 주름,
  // 모서리는 닳아 색이 바랬다
  color: `
    vec2 fxF = fxFace();
    vec3 fxBase = diffuseColor.rgb;
    vec2 fxWp = fxF + (vec2(fxN2(fxF * 3. + 1.), fxN2(fxF * 3. + 5.)) - .5) * .12;
    float fxBleed = (fxN2(fxF * 40.) - .5) * .015;
    float fxA1 = fxF2(fxWp * 2.2 + uFace * 3.) + fxBleed;
    float fxA2 = fxF2(fxWp * 2.2 + 17. + uFace) + fxBleed;
    float fxA3 = fxF2(fxWp * 3.3 + 31.) + fxBleed;
    float fxW = .008;
    vec3 fxC = fxBase;
    if (uFace < .5) {
      fxC = mix(fxC, vec3(.4, .29, .17), smoothstep(.55 - fxW, .55 + fxW, fxA1));
      fxC = mix(fxC, vec3(.07, .07, .05), smoothstep(.6 - fxW, .6 + fxW, fxA2));
      fxC = mix(fxC, vec3(.66, .6, .42), smoothstep(.62 - fxW, .62 + fxW, fxA3));
    } else if (uFace < 1.5) {
      fxC = mix(fxC, vec3(.6, .46, .3), smoothstep(.56 - fxW, .56 + fxW, fxA1));
      fxC = mix(fxC, vec3(.86, .79, .62), smoothstep(.6 - fxW, .6 + fxW, fxA2));
      vec3 cv = fxVoronoi(fxF * 14. + 5.);
      fxC = mix(fxC, cv.z > .5 ? vec3(.1, .08, .06) : vec3(.95, .93, .88), (1. - smoothstep(.06, .1, cv.x + fxBleed * 3.)) * step(.7, fract(cv.z * 7.)));
    } else if (uFace < 2.5) {
      vec2 px = floor(fxF * 26.) / 26.;
      vec2 pxS = floor(fxF * 52.) / 52.;
      fxC = mix(fxC, vec3(.1, .18, .36), step(.55, fxF2(px * 2.4 + 3.)));
      fxC = mix(fxC, vec3(.55, .7, .86), step(.6, fxF2(px * 2.4 + 21.)));
      fxC = mix(fxC, vec3(.04, .07, .14), step(.62, fxF2(pxS * 3. + 40.)) * step(.5, fxF2(px * 1.4 + 9.)));
    } else if (uFace < 3.5) {
      float br = 1. - smoothstep(0., .05, abs(fxN2(fxWp * 3. + 2.) - .5));
      float br2 = 1. - smoothstep(0., .03, abs(fxN2(fxWp * 7. + 9.) - .5));
      float leaf = smoothstep(.7, .72, fxN2(fxF * 16. + 3.)) * step(.5, fxA2);
      fxC = mix(fxC, fxBase * .7, smoothstep(.54, .56, fxA1) * .6);
      fxC = mix(fxC, vec3(.15, .1, .06), max(max(br * .85, br2 * .6 * step(.5, fxA2)), leaf * .7));
    } else if (uFace < 4.5) {
      fxC = mix(fxC, vec3(.96, .8, .88), smoothstep(.55 - fxW, .55 + fxW, fxA1));
      fxC = mix(fxC, fxBase * .58, smoothstep(.6 - fxW, .6 + fxW, fxA2));
      fxC = mix(fxC, vec3(.35, .12, .25), smoothstep(.64 - fxW, .64 + fxW, fxA3));
    } else {
      vec2 px = floor(fxF * 30.) / 30.;
      fxC = mix(fxC, vec3(.72, .76, .8), smoothstep(.56 - fxW, .56 + fxW, fxA1));
      fxC = mix(fxC, vec3(.5, .55, .6), smoothstep(.63 - fxW, .63 + fxW, fxA2));
      fxC = mix(fxC, vec3(.85, .88, .92), step(.66, fxF2(px * 3.)));
    }
    // 립스톱: 굵은 실이 일정한 간격으로 격자를 이룬다
    vec2 fxRs = abs(fract(fxF * 26.) - .5);
    float fxRip = 1. - smoothstep(.43, .47, max(fxRs.x, fxRs.y));
    fxRip = 1. - fxRip;
    vec2 fxTw = vLocal.xy * 240.;
    float fxTwill = .5 + .5 * sin((fxTw.x + fxTw.y) * 1.5);
    // 큰 주름: 능선은 밝고 골은 어둡다
    float fxFold = fxF2(fxF * 1.3 + uFace * 2.);
    float fxCrease = 1. - abs(fxN2(fxF * 2.2 + 7.) * 2. - 1.);
    // 닳은 자리: 모서리와 군데군데 색이 바랬다
    float fxWear = (1. - smoothstep(0., .05, fxEdge())) * .5 + smoothstep(.72, .85, fxN2(fxF * 5. + 3.)) * fxN2(vLocal.xy * 200.) * .5;
    fxC = mix(fxC, mix(fxC, vec3(.85, .83, .78), .45), fxWear);
    fxC *= (.9 + .12 * fxTwill) * (1. + fxRip * .07) * (.9 + .16 * fxFold);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxTwill * .0005 + fxRip * .0008 + fxFold * .006 + fxCrease * .002);',
  surface: 'roughnessFactor = .9;',
};
B.camo = {
  color: `diffuseColor.rgb *= .85 + .2 * fxN3(vLocal * 60. + vSeed);`,
  surface: 'roughnessFactor = .9;',
};

S.tartan = {
  // 타탄 체크 모직. 다 맞추면 면 하나가 한 장의 천이다. 날실과 씨실의 줄무늬가 엇갈려 체크를 이루고,
  // 2/2 능직이라 비스듬한 결이 보인다. 바탕색이 곧 면 색이고 면마다 짙은 띠와 가는 줄 색이 다르다. 보풀이 인다
  head: `
    vec3 fxSett(float x, vec3 base, vec3 dark, vec3 line) {
      float s = abs(fract(x) * 2. - 1.);
      vec3 c = base;
      if (s < .05) c = line;
      else if (s > .33 && s < .37) c = dark;
      else if (s > .37 && s < .63) c = mix(dark, base, .2);
      else if (s > .66 && s < .69) c = line;
      return c;
    }`,
  color: `
    vec2 fxF = fxFace() * 1.6;
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxDark = uFace < .5 ? vec3(.07, .11, .24) : uFace < 1.5 ? vec3(.05, .08, .13) : uFace < 2.5 ? vec3(.05, .18, .1)
      : uFace < 3.5 ? vec3(.06) : uFace < 4.5 ? vec3(.6, .1, .1) : vec3(.05);
    vec3 fxLine = uFace < .5 ? vec3(.95, .85, .3) : uFace < 1.5 ? vec3(.95, .85, .3) : uFace < 2.5 ? vec3(.95)
      : uFace < 3.5 ? vec3(.7, .1, .1) : uFace < 4.5 ? vec3(.05) : vec3(.95);
    vec3 fxWarp = fxSett(fxF.x, fxBase, fxDark, fxLine);
    vec3 fxWeft = fxSett(fxF.y, fxBase, fxDark, fxLine);
    vec2 fxTh = vLocal.xy * 180.;
    float fxTwill = step(.5, fract((fxTh.x + fxTh.y) * .25));
    float fxThread = .5 + .5 * sin(fxTwill > .5 ? fxTh.y * 6.2832 : fxTh.x * 6.2832);
    float fxFuzz = fxN2(vLocal.xy * 300.);
    diffuseColor.rgb = mix(fxWeft, fxWarp, fxTwill) * (.82 + .18 * fxThread) * (.92 + .1 * fxFuzz);`,
  normal: 'normal = fxBump(normal, fxThread * .0006 + fxFuzz * .0004);',
  surface: 'roughnessFactor = .95;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * fxFresnel(normal, 1.5) * .3;',
};
B.tartan = {
  // 가죽 덧댐
  color: `diffuseColor.rgb *= .8 + .25 * fxN3(vLocal * 40. + vSeed);`,
  surface: 'roughnessFactor = .55;',
};

S.houndstooth = {
  // 하운드투스(사냥개 이빨). 다 맞추면 면 하나가 한 폭의 모직이다. 짙은 실 넷·면 색 실 넷을 번갈아 날실과 씨실로 걸고
  // 2/2 능직으로 짜면 저절로 뾰족한 이빨 무늬가 나온다(무늬를 그린 게 아니라 짜임을 그대로 계산했다). 실마다 꼬인 올이
  // 비스듬히 보이고 털이 살짝 일었다. 칸은 천을 씌운 쿠션처럼 도톰하다
  head: WEAVE,
  height: 'fxPillowH',
  color: `
    vec2 fxF = fxFace();
    float fxN = 72.;
    vec4 fxW = fxWeave(fxF, fxN, 1.);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxDark = vec3(.035, .03, .03);
    vec3 fxWarp = mod(fxW.y, 8.) < 4. ? fxDark : fxBase;
    vec3 fxWeft = mod(fxW.z, 8.) < 4. ? fxDark : fxBase;
    vec3 fxY = mix(fxW.x > .5 ? fxWarp : fxWeft, mix(fxDark, fxBase, .5), fxClothAA(fxF, fxN));
    float fxPl = fxPly(fxF, fxN, fxW);
    float fxFuzz = fxN2(vLocal.xy * 300. + vSeed);
    diffuseColor.rgb = fxY * fxYarn(fxW, fxPl, fxFuzz, fxClothAA(fxF, fxN));`,
  normal: 'normal = fxBump(normal, (fxW.w * .0009 + fxPl * .0003) * (1. - fxClothAA(fxF, fxN)) + fxFuzz * .0003);',
  surface: 'roughnessFactor = .92;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * fxFresnel(normal, 1.5) * .3;',
};

B.houndstooth = {
  color: `diffuseColor.rgb *= .85 + .2 * fxN3(vLocal * 80. + vSeed);`,
  surface: 'roughnessFactor = .9;',
};

S.glencheck = {
  // 글렌체크(프린스 오브 웨일스). 다 맞추면 면 하나가 한 폭의 양복감이다. 짙은 실과 옅은 실을 넷씩 번갈아 건 굵은 칸과
  // 둘씩 번갈아 건 잔 칸이 2/2 능직으로 짜여 큰 체크 안에 잔 하운드투스와 줄이 생기고, 그 위로 가는 색실(오버체크)이
  // 지나간다. 실 빛깔은 면 색을 짙게·옅게 물들인 것
  head: WEAVE + `
    // 이 실이 짙은 실인지(1)
    float fxGlen(float i) {
      float s = mod(i, 32.);
      return s < 16. ? step(mod(s, 8.), 3.5) : step(mod(s, 4.), 1.5);
    }`,
  height: 'fxPillowH',
  color: `
    vec2 fxF = fxFace();
    float fxN = 96.;
    vec4 fxW = fxWeave(fxF, fxN, 1.);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxD = mix(fxBase, vec3(.02), .62);
    vec3 fxL = mix(fxBase, vec3(.95, .93, .88), .55);
    vec3 fxOver = fxBase.b > fxBase.r * 1.3 ? vec3(.7, .12, .1) : vec3(.12, .3, .75);
    vec3 fxWarp = mix(fxL, fxD, fxGlen(fxW.y));
    vec3 fxWeft = mix(fxL, fxD, fxGlen(fxW.z));
    if (mod(fxW.y, 64.) == 40.) fxWarp = fxOver;
    if (mod(fxW.z, 64.) == 40.) fxWeft = fxOver;
    vec3 fxY = mix(fxW.x > .5 ? fxWarp : fxWeft, mix(fxD, fxL, .5), fxClothAA(fxF, fxN));
    float fxPl = fxPly(fxF, fxN, fxW);
    float fxFuzz = fxN2(vLocal.xy * 300. + vSeed);
    diffuseColor.rgb = fxY * fxYarn(fxW, fxPl, fxFuzz, fxClothAA(fxF, fxN));`,
  normal: 'normal = fxBump(normal, (fxW.w * .0008 + fxPl * .0003) * (1. - fxClothAA(fxF, fxN)) + fxFuzz * .0003);',
  surface: 'roughnessFactor = .9;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * fxFresnel(normal, 1.5) * .25;',
};

B.glencheck = {
  color: `diffuseColor.rgb *= .85 + .2 * fxN3(vLocal * 80. + vSeed);`,
  surface: 'roughnessFactor = .9;',
};

S.herringbone = {
  // 헤링본 트위드. 다 맞추면 면 하나가 한 폭의 트위드다. 면 색 날실과 크림색 씨실을 능직으로 짜되 여덟 올마다 사선 방향을
  // 뒤집어 청어 뼈 같은 V자 줄이 생긴다. 굵고 거친 모사라 실마다 굵기가 고르지 않고, 군데군데 다른 색 털 뭉치(넵)가 박혔다
  head: WEAVE,
  height: 'fxPillowH',
  color: `
    vec2 fxF = fxFace();
    float fxN = 80.;
    vec4 fxW = fxWeave(fxF, fxN, 2.);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxWarp = fxBase * (.75 + .3 * fxH1(fxW.y * 1.3 + uFace));
    vec3 fxWeft = vec3(.86, .8, .7) * (.85 + .2 * fxH1(fxW.z * 2.1 + uFace));
    vec3 fxY = mix(fxW.x > .5 ? fxWarp : fxWeft, mix(fxBase * .9, vec3(.86, .8, .7), .5), fxClothAA(fxF, fxN));
    vec2 fxNg = floor((fxF + 1.) * 160.);
    float fxNep = step(.992, fxH2(fxNg + uFace * 17.));
    vec3 fxNepC = .5 + .5 * cos(6.2832 * (fxH2(fxNg + 3.) + vec3(0., .33, .67)));
    fxY = mix(fxY, fxNepC, fxNep * .8);
    float fxPl = fxPly(fxF, fxN, fxW);
    float fxFuzz = fxN2(vLocal.xy * 260. + vSeed);
    diffuseColor.rgb = fxY * fxYarn(fxW, fxPl, fxFuzz, fxClothAA(fxF, fxN));`,
  normal: 'normal = fxBump(normal, (fxW.w * .0011 + fxPl * .0004) * (1. - fxClothAA(fxF, fxN)) + fxFuzz * .0005);',
  surface: 'roughnessFactor = .95;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * fxFresnel(normal, 1.5) * .3;',
};

B.herringbone = {
  color: `diffuseColor.rgb *= .85 + .2 * fxN3(vLocal * 80. + vSeed);`,
  surface: 'roughnessFactor = .9;',
};

S.gingham = {
  // 깅엄. 다 맞추면 면 하나가 한 폭의 면직이다. 면 색 실과 흰 실을 여섯 올씩 번갈아 날실과 씨실로 걸어 평직으로 짜면,
  // 둘 다 색실인 칸은 진하게, 하나만 색실인 칸은 반쯤 옅게, 둘 다 흰 칸은 하얗게 나와 바둑판이 된다. 가까이 보면 올이
  // 하나 걸러 하나씩 엇갈려 있다
  head: WEAVE,
  height: 'fxPillowH',
  color: `
    vec2 fxF = fxFace();
    float fxN = 120.;
    vec4 fxW = fxWeave(fxF, fxN, 0.);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxWhite = vec3(.95, .94, .92);
    vec3 fxWarp = mod(fxW.y, 12.) < 6. ? fxBase : fxWhite;
    vec3 fxWeft = mod(fxW.z, 12.) < 6. ? fxBase : fxWhite;
    vec3 fxY = mix(fxW.x > .5 ? fxWarp : fxWeft, (fxWarp + fxWeft) * .5, fxClothAA(fxF, fxN));
    float fxPl = fxPly(fxF, fxN, fxW);
    float fxFuzz = fxN2(vLocal.xy * 400. + vSeed);
    diffuseColor.rgb = fxY * fxYarn(fxW, fxPl, fxFuzz, fxClothAA(fxF, fxN));`,
  normal: 'normal = fxBump(normal, (fxW.w * .0007 + fxPl * .0002) * (1. - fxClothAA(fxF, fxN)) + fxFuzz * .0002);',
  surface: 'roughnessFactor = .85;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * fxFresnel(normal, 1.5) * .2;',
};

B.gingham = {
  color: `diffuseColor.rgb *= .9 + .12 * fxN3(vLocal * 80. + vSeed);`,
  surface: 'roughnessFactor = .85;',
};

S.argyle = {
  // 아가일 니트. 다 맞추면 면 하나가 스웨터 앞판이다. 길쭉한 마름모가 면 색과 짙은 색으로 번갈아 떠졌고, 마름모 한가운데를
  // 비스듬히 가로지르는 가는 겹줄(오버체크)이 크림색으로 지나간다. 무늬가 코 단위로 떠져 가장자리가 잘게 계단지고,
  // 코마다 V자 두 가닥이 도톰하게 솟았다
  head: KNIT + `
    // 아가일 색 번호: 0 면 색 마름모, 1 짙은 마름모, 2 겹줄
    float fxArgyle(vec2 F) {
      vec2 u = vec2((F.x + 1.) * 1.5, (F.y + 1.) * 1.);
      vec2 f = fract(u) - .5;
      float inD = step(abs(f.x) + abs(f.y), .5);
      float line = max(abs(fract(u.x + u.y) - .5), abs(fract(u.x - u.y) - .5));
      if (line > .47) return 2.;
      return inD > .5 ? 0. : 1.;
    }`,
  height: 'fxKnitFaceH',
  color: `
    vec2 fxF = fxFace();
    vec2 fxG = (fxF + 1.) * .5 * vec2(42., 54.);
    vec2 fxCell = floor(fxG);
    vec3 fxSt = fxStitch(fract(fxG) - .5);
    float fxK = fxArgyle((fxCell + .5) / vec2(42., 54.) * 2. - 1.);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxY = fxK < .5 ? fxBase : (fxK < 1.5 ? mix(fxBase, vec3(.02), .6) : vec3(.92, .88, .8));
    float fxFuzz = fxN2(vLocal.xy * 260. + vSeed);
    fxY *= .92 + .14 * fxH2(fxCell + vSeed * 9.);
    diffuseColor.rgb = fxY * (.32 + .68 * smoothstep(0., .5, fxSt.x)) * (.8 + .28 * fxSt.y) * (.92 + .1 * fxFuzz);`,
  normal: 'normal = fxBump(normal, fxSt.y * .0012 * step(.05, fxSt.x) + fxFuzz * .0006);',
  surface: 'roughnessFactor = .95;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * fxFresnel(normal, 1.4) * .4;',
};

B.argyle = {
  color: `diffuseColor.rgb *= .85 + .2 * fxN3(vLocal * 60. + vSeed);`,
  surface: 'roughnessFactor = .95;',
};

S.swissdot = {
  // 스위스 도트. 다 맞추면 면 하나가 한 폭의 얇은 면 보일이다. 면 색으로 물들인 성근 평직 위에 하얀 실 뭉치를 엇갈린 줄로
  // 짜 넣고 잘라 내 도톰한 물방울이 실제로 솟았다(인쇄가 아니라 실이다). 물방울은 올이 사방으로 뻗친 보송한 술이고,
  // 바탕은 얇아 살짝 비친다
  head: WEAVE + `
    // 가장 가까운 물방울: x 중심까지 거리(물방울 반지름 1)
    float fxDot(vec2 F) {
      vec2 g = (F + 1.) * 4.5;
      g.x += .5 * mod(floor(g.y), 2.);
      vec2 f = fract(g) - .5;
      return length(f) / .17;
    }
    float fxDotH(vec2 p, float seed) {
      float d = fxDot(aHome.xy + p * aHome.z);
      float tuft = 1. - smoothstep(.7, 1.1, d);
      return smoothstep(0., .08, fxEdgeAt(p)) * (.006 + .004 * smoothstep(0., .25, fxEdgeAt(p)) + .012 * tuft * sqrt(max(0., 1. - d * d * .8)));
    }`,
  height: 'fxDotH',
  color: `
    vec2 fxF = fxFace();
    float fxN = 150.;
    vec4 fxW = fxWeave(fxF, fxN, 0.);
    vec3 fxBase = diffuseColor.rgb;
    float fxD = fxDot(fxF);
    float fxTuft = 1. - smoothstep(.85, 1.05, fxD + (fxN2(fxF * 90.) - .5) * .25);
    float fxFib = .5 + .5 * sin(atan(fract((fxF.y + 1.) * 4.5) - .5, fract((fxF.x + 1.) * 4.5 + .5 * mod(floor((fxF.y + 1.) * 4.5), 2.)) - .5) * 40. + fxD * 6.);
    float fxPl = fxPly(fxF, fxN, fxW);
    float fxAA = fxClothAA(fxF, fxN);
    vec3 fxGround = fxBase * fxYarn(fxW, fxPl, 0.5, fxAA) * (1. - .25 * (1. - fxW.w) * (1. - fxAA));
    vec3 fxDotC = vec3(.97, .96, .94) * (.82 + .18 * fxFib) * (.85 + .15 * (1. - fxD));
    diffuseColor.rgb = mix(fxGround, fxDotC, fxTuft);`,
  normal: 'normal = fxBump(normal, (fxW.w * .0006 * (1. - fxAA)) * (1. - fxTuft) + fxFib * fxTuft * .0012);',
  surface: 'roughnessFactor = mix(.8, .98, fxTuft);',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * (fxFresnel(normal, 1.5) * .25 + fxTuft * .05);',
};

B.swissdot = {
  color: `diffuseColor.rgb *= .92 + .1 * fxN3(vLocal * 80. + vSeed);`,
  surface: 'roughnessFactor = .85;',
};

S.chevron = {
  // 셰브론 니트. 다 맞추면 면 하나가 지그재그 줄무늬 스웨터다(이탈리아 니트 공방 식). 면 색, 크림, 짙은 색, 반쯤 옅은 면 색 줄이
  // 산 모양으로 오르내리며 번갈아 떠졌고, 무늬가 코 단위라 비탈이 잘게 계단진다. 코마다 V자 두 가닥이 도톰하다
  head: KNIT + `
    float fxChev(vec2 F) {
      float z = abs(fract((F.x + 1.) * 2.5) - .5) * .5;
      return mod(floor((F.y + 1. + z) * 6.), 5.);
    }`,
  height: 'fxKnitFaceH',
  color: `
    vec2 fxF = fxFace();
    vec2 fxG = (fxF + 1.) * .5 * vec2(42., 54.);
    vec2 fxCell = floor(fxG);
    vec3 fxSt = fxStitch(fract(fxG) - .5);
    float fxK = fxChev((fxCell + .5) / vec2(42., 54.) * 2. - 1.);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxY = fxK < .5 ? fxBase : (fxK < 1.5 ? vec3(.93, .89, .8) : (fxK < 2.5 ? mix(fxBase, vec3(.02), .65) : (fxK < 3.5 ? fxBase : mix(fxBase, vec3(.95), .45))));
    float fxFuzz = fxN2(vLocal.xy * 260. + vSeed);
    fxY *= .92 + .14 * fxH2(fxCell + vSeed * 9.);
    diffuseColor.rgb = fxY * (.32 + .68 * smoothstep(0., .5, fxSt.x)) * (.8 + .28 * fxSt.y) * (.92 + .1 * fxFuzz);`,
  normal: 'normal = fxBump(normal, fxSt.y * .0012 * step(.05, fxSt.x) + fxFuzz * .0006);',
  surface: 'roughnessFactor = .95;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * fxFresnel(normal, 1.4) * .4;',
};

B.chevron = {
  color: `diffuseColor.rgb *= .85 + .2 * fxN3(vLocal * 60. + vSeed);`,
  surface: 'roughnessFactor = .95;',
};

S.postit = {
  // 포스트잇. 칸마다 면 색 메모지 한 장이 붙었다. 위쪽 끈끈이 띠는 판판하게 붙었고 아래 한쪽 모서리는 실제로 들려
  // 말려 있다. 손끝을 가까이 대면 그 메모지 모서리가 더 들린다. 종이 섬유 결, 볼펜으로 휘갈긴 몇 줄 메모와 밑줄,
  // 가끔 동그라미 친 낙서. 메모지마다 글씨가 다르다
  head: `
    // 들린 정도(0 붙음 ~ 1 모서리 끝)
    float fxCurl(vec2 q, float seed, float touch) {
      vec2 dir = normalize(vec2(fxH1(seed * 3.) > .5 ? 1. : -1., -1.));
      float t = dot(q, dir);
      float lift = smoothstep(.75 - .45 * touch, 1.42, t);
      return lift * lift;
    }
    float fxPostitH(vec2 p, float seed) {
      float lift = fxCurl(p / uSticker.x, seed, fxTouch(p, .06));
      return smoothstep(0., .03, fxEdgeAt(p)) * (.004 + .002 * fxN2(p * 30. + seed) + lift * .045);
    }
    // 볼펜 글씨 한 줄: 구불구불 이어지다 끊기는 획
    float fxScrawl(vec2 q, float y0, float x1, float seed) {
      float x = q.x;
      float y = y0 + .025 * sin(x * 38. + seed * 9.) * (.5 + .5 * sin(x * 7. + seed)) + .012 * sin(x * 91. + seed * 3.);
      float on = step(-.62, x) * step(x, x1) * step(.22, fract(x * 5.5 + seed * 3.));
      return on * (1. - smoothstep(.006, .014, abs(q.y - y)));
    }`,
  height: 'fxPostitH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxQp = fxQ();
    float fxTouchP = fxTouch(vLocal.xy, .06);
    float fxLift = fxCurl(fxQp, vSeed, fxTouchP);
    vec3 fxBase = diffuseColor.rgb;
    float fxFib = fxN2(vLocal.xy * 320. + vSeed) * .6 + fxN2(vLocal.xy * 90.) * .4;
    vec3 fxC = fxBase * (.92 + .1 * fxFib);
    float fxGlue = smoothstep(.5, .56, fxQp.y);
    fxC *= 1. - fxGlue * .06;
    float fxInk = 0.;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      fxInk = max(fxInk, fxScrawl(fxQp, .28 - fi * .24, .1 + .5 * fxH1(vSeed * 7. + fi), vSeed + fi * 1.7));
    }
    float fxUnder = (1. - smoothstep(.006, .012, abs(fxQp.y + .5 + .02 * sin(fxQp.x * 20.)))) * step(-.55, fxQp.x) * step(fxQp.x, .2) * step(.5, fxH1(vSeed * 13.));
    float fxRing = (1. - smoothstep(.008, .016, abs(length((fxQp - vec2(.45, .3)) / vec2(1., .8)) - .17 + .02 * sin(atan(fxQp.y - .3, fxQp.x - .45) * 3.)))) * step(.6, fxH1(vSeed * 17.));
    fxInk = max(fxInk, max(fxUnder, fxRing));
    fxC = mix(fxC, vec3(.1, .14, .42), fxInk * .9);
    // 들린 모서리: 빛을 더 받고 가장자리에 접힌 그늘
    fxC *= 1. + fxLift * .12;
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxFib * .0006 + fxInk * .0002);',
  surface: 'roughnessFactor = mix(.85, .55, fxGlue);',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * (.08 + .1 * fxFresnel(normal, 2.));',
};

B.postit = {
  color: `diffuseColor.rgb *= .9 + .15 * fxN3(vLocal * 40. + vSeed);`,
  surface: 'roughnessFactor = .5;',
};

S.keycap = {
  // 기계식 키보드 키캡. 칸마다 키캡 하나: 가장자리로 비스듬히 내려가는 옆면, 손가락이 닿는 윗면은 원통처럼 오목하게 파였고
  // 왼쪽 위에 글자가 찍혔다(칸마다 다른 글자). 거친 PBT 플라스틱 결. 손끝을 대면 그 키가 쑥 눌리고,
  // 가끔 누가 타자를 치듯 여기저기 키가 혼자 눌렸다 올라온다
  head: FONT + `
    float fxKeyPress(vec2 p, float seed) {
      float rate = .5 + fxH1(seed * 5.) * .4;
      float tt = uTime * rate + fxH1(seed * 9.);
      float typing = step(fract(tt), .07) * step(.72, fxH1(floor(tt) + seed * 3.));
      return max(smoothstep(.3, .8, fxTouch(p, .05)), typing);
    }
    // 키캡 모양: x 높이(0~1), y 윗면인지
    vec2 fxKeyShape(vec2 q) {
      vec2 k = q - vec2(0., .06);
      float m = max(abs(k.x), abs(k.y));
      float top = 1. - smoothstep(.6, .64, m);
      float side = 1. - smoothstep(.62, .96, m);
      float dish = 1. - .14 * (1. - k.x * k.x / .36);
      return vec2(mix(side * .9, dish, top), top);
    }
    float fxKeyH(vec2 p, float seed) {
      vec2 s = fxKeyShape(p / uSticker.x);
      return smoothstep(0., .03, fxEdgeAt(p)) * (.004 + .04 * s.x * (1. - .55 * fxKeyPress(p, seed)));
    }`,
  height: 'fxKeyH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxQk = fxQ();
    vec2 fxKs = fxKeyShape(fxQk);
    vec3 fxBase = diffuseColor.rgb;
    float fxLum = dot(fxBase, vec3(.3, .59, .11));
    float fxGrainK = fxN2(vLocal.xy * 420. + vSeed) * .6 + fxN2(vLocal.xy * 150.) * .4;
    vec3 fxC = fxBase * (.92 + .1 * fxGrainK) * mix(.8, 1., fxKs.y);
    int fxCh = int(floor(fxH1(vSeed * 13.) * 25.99));
    vec2 fxGl = (fxQk - vec2(-.5, .55)) / vec2(.06, -.06);
    float fxLeg = fxGlyph(fxCh, fxGl) * fxKs.y;
    vec3 fxLegC = fxLum > .25 ? vec3(.12, .12, .14) : vec3(.94, .93, .9);
    fxC = mix(fxC, fxLegC, fxLeg);
    float fxPress = fxKeyPress(vLocal.xy, vSeed);
    diffuseColor.rgb = fxC * (1. - fxPress * .12);`,
  normal: 'normal = fxBump(normal, fxGrainK * .0006);',
  surface: 'roughnessFactor = .72;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * (.05 + .12 * fxFresnel(normal, 2.5));',
};

B.keycap = {
  color: `diffuseColor.rgb *= .85 + .2 * fxN2(vec2(fxBodyUV().x * 200., fxBodyUV().y * 4.) + vSeed);`,
  surface: 'roughnessFactor = .35; metalnessFactor = .8;',
};

S.cork = {
  // 코르크 게시판. 칸마다 거친 코르크판 위에 면 색 색인 카드 한 장이 압정으로 꽂혔다. 코르크는 크고 작은 알갱이가
  // 다져진 결이라 알갱이마다 빛깔이 다르고 구멍이 숭숭하다. 카드는 조금 비뚤게 꽂혀 가장자리가 들떴고 그 둘레로
  // 그림자가 진다. 카드엔 옅은 괘선과 맨 위 빨간 줄, 둥근 머리 압정이 실제로 솟았다
  head: `
    // 카드: x 카드 가장자리까지 거리(안이 음수), y 압정 머리 볼록함, z 카드 위 세로 좌표
    vec3 fxCard(vec2 q, float seed) {
      float ang = (fxH1(seed * 3.) - .5) * .35;
      vec2 c = (vec2(fxH1(seed * 5.), fxH1(seed * 7.)) - .5) * .2 - vec2(0., .05);
      vec2 k = fxRot(ang) * (q - c);
      float d = fxBox(k, vec2(.74, .62), .02);
      vec2 pin = k - vec2(0., .48);
      float head = sqrt(max(0., 1. - dot(pin, pin) / (.13 * .13)));
      return vec3(d, head, k.y);
    }
    float fxCorkH(vec2 p, float seed) {
      vec2 q = p / uSticker.x;
      vec3 c = fxCard(q, seed);
      float card = (1. - smoothstep(-.01, .01, c.x)) * (.01 + .006 * smoothstep(-.14, 0., c.x));
      return smoothstep(0., .04, fxEdgeAt(p)) * (.004 + .003 * fxN2(q * 18. + seed) + card + .03 * c.y);
    }`,
  height: 'fxCorkH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxQc = fxQ();
    vec3 fxCd = fxCard(fxQc, vSeed);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxV = fxVoronoi(fxQc * 16. + vSeed * 5.);
    vec3 fxCork = mix(vec3(.55, .36, .2), vec3(.78, .58, .36), fxV.z) * (.8 + .25 * fxN2(fxQc * 60.));
    fxCork *= 1. - (1. - smoothstep(0., .08, fxV.y)) * .45;
    float fxHoleC = (1. - smoothstep(0., .06, fxV.x)) * step(.82, fxV.z);
    fxCork = mix(fxCork, vec3(.12, .07, .04), fxHoleC);
    float fxShadow = (1. - smoothstep(0., .1, fxCd.x - .02)) * step(0., fxCd.x);
    fxCork *= 1. - fxShadow * .5;
    float fxIn = 1. - smoothstep(-.006, .004, fxCd.x);
    float fxRule = (1. - smoothstep(.004, .009, abs(fract((fxCd.z + .5) / .13) - .5) * .13)) * step(fxCd.z, .3);
    float fxRed = 1. - smoothstep(.004, .01, abs(fxCd.z - .36));
    vec3 fxPaper = fxBase * (.94 + .06 * fxN2(vLocal.xy * 300.));
    fxPaper = mix(fxPaper, vec3(.45, .62, .85), fxRule * .5);
    fxPaper = mix(fxPaper, vec3(.85, .25, .25), fxRed * .7);
    vec3 fxPinC = fxBase.r > fxBase.b * 1.4 && fxBase.g < fxBase.r * .8 ? vec3(.95, .78, .1) : vec3(.86, .12, .1);
    float fxPin = step(.02, fxCd.y);
    vec3 fxC = mix(fxCork, fxPaper, fxIn);
    fxC = mix(fxC, fxPinC * (.7 + .4 * fxCd.y), fxPin);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, (1. - fxIn) * (fxV.z * .0015 - fxHoleC * .002) + fxIn * fxN2(vLocal.xy * 300.) * .0003);',
  surface: 'roughnessFactor = mix(mix(.95, .8, fxIn), .15, fxPin);',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .05 + fxPinC * fxPin * fxFresnel(normal, 2.) * .3;',
};

B.cork = {
  color: `diffuseColor.rgb *= .8 + .3 * fxVoronoi(fxBodyUV() * 60. + vSeed).z;`,
  surface: 'roughnessFactor = .95;',
};

S.notebook = {
  // 스프링 공책. 칸마다 면 색으로 물들인 줄 공책 한 쪽이다. 파란 괘선과 빨간 여백 선, 연필로 끄적인 글씨와 낙서, 지운 자국.
  // 위쪽엔 철사 스프링 고리가 실제로 솟아 종이 구멍을 꿰고 지나간다. 종이는 살짝 물결진다
  head: `
    // 스프링: x 철사 볼록함, y 종이 구멍
    vec2 fxSpring(vec2 q) {
      float k = floor(q.x / .2 + .5);
      vec2 h = q - vec2(k * .2, .78);
      float hole = 1. - smoothstep(.035, .05, fxBox(h, vec2(.025, .045), .02));
      vec2 w = fxRot(.3) * (q - vec2(k * .2 + .02, .88));
      float ring = abs(length(w / vec2(.07, .13)) - 1.) * .07;
      float wire = sqrt(max(0., 1. - ring * ring / (.022 * .022))) * step(.74, q.y);
      return vec2(wire, hole);
    }
    float fxNoteH(vec2 p, float seed) {
      vec2 q = p / uSticker.x;
      vec2 s = fxSpring(q);
      return smoothstep(0., .04, fxEdgeAt(p)) * (.006 + .003 * sin(q.x * 3. + q.y * 2. + seed * 6.) - s.y * .004) + s.x * .03;
    }`,
  height: 'fxNoteH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxQn = fxQ();
    vec2 fxSp = fxSpring(fxQn);
    vec3 fxBase = mix(diffuseColor.rgb, vec3(.97, .96, .93), .3);
    vec3 fxC = fxBase * (.94 + .06 * fxN2(vLocal.xy * 300. + vSeed));
    float fxRuleN = 1. - smoothstep(.004, .008, abs(fract((fxQn.y + .5) / .16) - .5) * .16);
    fxC = mix(fxC, vec3(.42, .6, .86), fxRuleN * step(fxQn.y, .62) * .6);
    fxC = mix(fxC, vec3(.88, .3, .3), (1. - smoothstep(.004, .008, abs(fxQn.x + .58))) * step(fxQn.y, .66) * .7);
    float fxPen = 0.;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float y0 = .4 - fi * .32 + .05;
      float x1 = -.1 + .7 * fxH1(vSeed * 5. + fi);
      float y = y0 + .02 * sin(fxQn.x * 44. + vSeed * 9. + fi) * (.5 + .5 * sin(fxQn.x * 9. + fi));
      fxPen = max(fxPen, step(-.5, fxQn.x) * step(fxQn.x, x1) * step(.25, fract(fxQn.x * 6. + vSeed * 3. + fi)) * (1. - smoothstep(.005, .012, abs(fxQn.y - y))));
    }
    vec2 fxSc = fxQn - vec2(.45, -.45);
    float fxSpiralD = abs(fract((length(fxSc) - atan(fxSc.y, fxSc.x) * .03) / .045) - .5) * .045;
    fxPen = max(fxPen, (1. - smoothstep(.004, .01, fxSpiralD)) * step(length(fxSc), .2) * step(.5, fxH1(vSeed * 11.)));
    float fxErase = smoothstep(.65, .8, fxN2(fxQn * 3. + vSeed * 4.)) * .12;
    fxC = mix(fxC, vec3(.32, .32, .36), fxPen * .75);
    fxC = mix(fxC, fxC * vec3(.95, .93, .9), fxErase);
    fxC = mix(fxC, vec3(.08, .07, .07), fxSp.y);
    fxC = mix(fxC, vec3(.8, .8, .82) * (.7 + .4 * fxSp.x), step(.02, fxSp.x));
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxN2(vLocal.xy * 300.) * .0003 + fxPen * .0002);',
  surface: 'roughnessFactor = mix(.9, .25, step(.02, fxSp.x)); metalnessFactor = step(.02, fxSp.x);',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .06;',
};

B.notebook = {
  color: `diffuseColor.rgb *= .9 + .12 * fxN3(vLocal * 50. + vSeed);`,
  surface: 'roughnessFactor = .8;',
};

S.tape = {
  // 마스킹테이프. 칸마다 면 색 종이테이프 세 가닥이 엇갈려 붙었다. 테이프는 잔주름진 크레이프 종이라 반투명해서
  // 겹친 데는 더 짙고, 끝은 손으로 찢어 들쭉날쭉하다. 가닥마다 잔무늬(물방울, 줄, 격자)가 찍혔고 겹친 만큼 실제로 도톰하다.
  // 그 아래로 누런 크라프트 종이가 비친다
  head: `
    // 가닥 하나: x 가닥 안인지, y 가닥 길이 방향 좌표, z 너비 방향 좌표
    vec3 fxStrip(vec2 q, float seed, float i) {
      float ang = fxH1(seed * 3. + i * 7.) * 3.1416;
      vec2 dir = vec2(cos(ang), sin(ang));
      vec2 c = (vec2(fxH1(seed * 5. + i), fxH1(seed * 9. + i * 3.)) - .5) * .8;
      vec2 r = q - c;
      float along = dot(r, dir);
      float across = dot(r, vec2(-dir.y, dir.x));
      float len = .9 + .5 * fxH1(seed + i * 11.);
      float jag = (fxN2(vec2(across * 40., i + seed)) - .5) * .08;
      float inside = step(abs(across), .24) * step(abs(along + jag * sign(along)), len);
      return vec3(inside, along, across);
    }
    float fxTapeH(vec2 p, float seed) {
      vec2 q = p / uSticker.x;
      float h = 0.;
      for (int i = 0; i < 3; i++) h += fxStrip(q, seed, float(i)).x;
      return smoothstep(0., .04, fxEdgeAt(p)) * (.004 + .004 * h);
    }`,
  height: 'fxTapeH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxQt = fxQ();
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxC = vec3(.72, .56, .36) * (.85 + .2 * fxN2(vLocal.xy * 200. + vSeed));
    float fxLayers = 0.;
    float fxCrepe = 0.;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      vec3 st = fxStrip(fxQt, vSeed, fi);
      if (st.x < .5) continue;
      float kind = floor(fxH1(vSeed * 19. + fi) * 3.);
      vec2 tc = vec2(st.y, st.z) * 14.;
      float print = kind < .5 ? 1. - smoothstep(.18, .26, length(fract(tc) - .5))
        : (kind < 1.5 ? step(.5, fract(tc.x * .5)) : max(step(.85, fract(tc.x)), step(.85, fract(tc.y))));
      vec3 tapeC = mix(fxBase, mix(fxBase, vec3(.98), .6), print * .7);
      float wr = fxN2(vec2(st.z * 6., st.y * 120.) + fi * 7.);
      tapeC *= .9 + .12 * wr;
      fxC = mix(fxC, tapeC, .85) * (1. - fxLayers * .06);
      fxLayers += 1.;
      fxCrepe = wr;
    }
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxCrepe * .0007 + fxLayers * .0003);',
  surface: 'roughnessFactor = .9;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .06;',
};

B.tape = {
  color: `diffuseColor.rgb *= .85 + .2 * fxN3(vLocal * 60. + vSeed);`,
  surface: 'roughnessFactor = .9;',
};

S.clips = {
  // 클립. 칸마다 면 색 비닐을 입힌 종이 클립 세 개가 모눈종이 위에 흩어졌다. 클립은 철사가 두 겹으로 감긴 고리 모양으로
  // 실제로 둥글게 솟았고, 겹친 데는 위 클립이 아래 클립을 덮는다. 반들거리는 비닐 겉과 종이 위 그림자
  head: `
    // 클립 하나: 두 겹 고리의 철사 가운데까지 거리
    float fxClipD(vec2 p) {
      vec2 a = p - vec2(clamp(p.x, -.3, .3), 0.);
      float outer = abs(length(a) - .15);
      vec2 b = p - vec2(.06, 0.);
      vec2 b2 = b - vec2(clamp(b.x, -.2, .2), 0.);
      float inner = b.x < -.2 && b.y > 0. ? 9. : abs(length(b2) - .085);
      return min(outer, inner);
    }
    // 가장 위에 놓인 클립: x 철사 볼록함, y 몇 번째 클립인지(+1), z 그림자
    vec3 fxClips(vec2 q, float seed) {
      vec3 r = vec3(0.);
      for (int i = 0; i < 4; i++) {
        float fi = float(i);
        vec2 c = (vec2(fxH1(seed * 3. + fi * 5.), fxH1(seed * 7. + fi * 3.)) - .5) * 1.1;
        vec2 k = fxRot(fxH1(seed * 11. + fi) * 6.2832) * (q - c) * .9;
        float d = fxClipD(k);
        float w = .032;
        float wire = sqrt(max(0., 1. - d * d / (w * w)));
        float sh = 1. - smoothstep(w, w + .05, fxClipD(k - vec2(.03, -.03)));
        r.z = max(r.z, sh);
        if (wire > 0.) r = vec3(wire, fi + 1., r.z);
      }
      return r;
    }
    float fxClipsH(vec2 p, float seed) {
      vec3 c = fxClips(p / uSticker.x, seed);
      return smoothstep(0., .04, fxEdgeAt(p)) * .004 + c.x * (.01 + .006 * c.y);
    }`,
  height: 'fxClipsH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxQl = fxQ();
    vec3 fxCl = fxClips(fxQl, vSeed);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxPaper = vec3(.95, .95, .93) * (.95 + .05 * fxN2(vLocal.xy * 300.));
    float fxGridL = 1. - smoothstep(.003, .007, min(abs(fract(fxQl.x / .125) - .5), abs(fract(fxQl.y / .125) - .5)) * .125);
    fxPaper = mix(fxPaper, vec3(.6, .8, .75), fxGridL * .5);
    fxPaper *= 1. - fxCl.z * .3 * step(fxCl.x, 0.);
    float fxOn = step(.001, fxCl.x);
    vec3 fxVinyl = fxBase * (.55 + .5 * fxCl.x) * (1. - (fxCl.y - 1.) * .06);
    diffuseColor.rgb = mix(fxPaper, fxVinyl, fxOn);`,
  normal: 'normal = fxBump(normal, fxN2(vLocal.xy * 300.) * .0002 * (1. - fxOn));',
  surface: 'roughnessFactor = mix(.85, .18, fxOn);',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .05 + fxBase * fxOn * fxFresnel(normal, 3.) * .3;',
};

B.clips = {
  color: `diffuseColor.rgb *= .92 + .1 * fxN3(vLocal * 60. + vSeed);`,
  surface: 'roughnessFactor = .6;',
};

S.armor = {
  // 판금 갑옷. 칸마다 두드려 편 강철판 한 장: 가장자리를 말아 올린 두툼한 테, 판을 가로질러 비스듬히 솟은 홈줄(고딕 갑옷의
  // 플루팅), 네 귀의 둥근 리벳. 테 안쪽엔 면 색(문장 색)으로 칠한 띠를 두르고 금박 선을 그었다. 칼자국과 찍힌 자국,
  // 반들반들 닦인 강철에 비친 빛
  head: `
    // 판: x 높이, y 리벳, z 문장 띠, w 홈줄 단면
    vec4 fxPlate(vec2 q) {
      float m = max(abs(q.x), abs(q.y));
      float roll = exp(-pow((m - .86) / .05, 2.));
      float band = step(.64, m) * step(m, .8);
      vec2 r = abs(q) - .72;
      float rivet = sqrt(max(0., 1. - dot(r, r) / (.07 * .07)));
      float flute = (.5 + .5 * cos((q.x + q.y) * 3.5 * 6.2832)) * (1. - smoothstep(.58, .64, m));
      float h = (1. - m * m * .5) * .5 + roll * .5 + flute * .12 + rivet * .45 - band * .06;
      return vec4(h, rivet, band, flute);
    }
    float fxArmorH(vec2 p, float seed) {
      return smoothstep(0., .04, fxEdgeAt(p)) * (.006 + .03 * fxPlate(p / uSticker.x).x);
    }`,
  height: 'fxArmorH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxQa = fxQ();
    vec4 fxPl = fxPlate(fxQa);
    vec3 fxBase = diffuseColor.rgb;
    float fxM = max(abs(fxQa.x), abs(fxQa.y));
    vec3 fxSteel = mix(vec3(.62, .64, .68), fxBase, .18) * (.9 + .1 * fxN2(vLocal.xy * 40. + vSeed));
    vec3 fxSc = fxVoronoi(vec2(fxQa.x * 3. + fxQa.y * 9., fxQa.y * 2.) + vSeed * 7.);
    float fxScratch = (1. - smoothstep(0., .015, fxSc.y)) * step(.6, fxSc.z);
    float fxDent = smoothstep(.75, .9, fxN2(fxQa * 5. + vSeed * 3.));
    float fxGoldL = (1. - smoothstep(.004, .01, abs(fxM - .655))) + (1. - smoothstep(.004, .01, abs(fxM - .785)));
    vec3 fxC = fxSteel;
    fxC = mix(fxC, fxBase * (.85 + .1 * fxN2(vLocal.xy * 90.)), fxPl.z * (1. - step(.02, fxPl.y)));
    fxC = mix(fxC, vec3(.95, .72, .28), clamp(fxGoldL, 0., 1.));
    fxC *= 1. - fxScratch * .25;
    float fxMetalA = 1. - fxPl.z * (1. - step(.02, fxPl.y));
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxScratch * -.0008 - fxDent * .0015 + fxN2(vLocal.xy * 300.) * .0001);',
  surface: 'roughnessFactor = mix(.45, mix(.16, .3, fxScratch), fxMetalA); metalnessFactor = mix(.1, 1., max(fxMetalA, clamp(fxGoldL, 0., 1.)));',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03;',
};

B.armor = {
  color: `diffuseColor.rgb *= .85 + .2 * fxN2(vec2(fxBodyUV().x * 120., fxBodyUV().y * 3.) + vSeed);`,
  surface: 'roughnessFactor = .35; metalnessFactor = .9;',
};

S.treasure = {
  // 보물 더미. 칸마다 금화가 겹겹이 쌓였고 그 사이에 면 색 보석 하나가 박혔다. 금화는 테가 솟고 가운데 별 무늬가 찍혔으며
  // 저마다 다른 각도로 기울어 빛이 동전마다 다르게 번쩍인다. 보석은 팔각으로 깎여 면마다 빛이 다르고 안에서 반짝인다
  head: `
    // 가장 위 금화: x 높이, y 동전 번호(-1이면 빈 틈), z 동전 안 반지름, w 동전 안 각도
    vec4 fxCoins(vec2 q, float seed) {
      vec4 best = vec4(0., -1., 1., 0.);
      for (int i = 0; i < 9; i++) {
        float fi = float(i);
        vec2 c = (vec2(fxH1(seed * 3. + fi * 1.7), fxH1(seed * 5. + fi * 2.3)) - .5) * 1.9;
        float rad = .3 + .06 * fxH1(seed * 7. + fi);
        vec2 tilt = (vec2(fxH1(seed * 11. + fi), fxH1(seed * 13. + fi)) - .5) * .5;
        vec2 d = q - c;
        float r = length(d) / rad;
        if (r > 1.) continue;
        float h = .3 + fi * .07 + dot(d, tilt);
        if (h > best.x) best = vec4(h, fi, r, atan(d.y, d.x));
      }
      return best;
    }
    // 보석: x 안인지, y 깎인 면 번호, z 가운데에서(가장자리가 1)
    vec3 fxGem(vec2 q, float seed) {
      vec2 d = q - (vec2(fxH1(seed * 17.), fxH1(seed * 19.)) - .5) * .5;
      float a = atan(d.y, d.x);
      float k = floor(a / .7854 + .5);
      float oct = length(d) * cos(a - k * .7854);
      return vec3(1. - smoothstep(.36, .38, oct), k + step(.2, oct) * 8., oct / .38);
    }
    float fxTreasureH(vec2 p, float seed) {
      vec2 q = p / uSticker.x;
      vec4 c = fxCoins(q, seed);
      float rim = c.y < 0. ? 0. : smoothstep(.8, .95, c.z) * (1. - smoothstep(.95, 1., c.z));
      vec3 g = fxGem(q, seed);
      return smoothstep(0., .04, fxEdgeAt(p)) * (.004 + .025 * max(c.x + rim * .05, g.x * (1.3 - .5 * smoothstep(.2, 1., g.z))));
    }`,
  height: 'fxTreasureH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxQt = fxQ();
    vec4 fxCo = fxCoins(fxQt, vSeed);
    vec3 fxGm = fxGem(fxQt, vSeed);
    vec3 fxBase = diffuseColor.rgb;
    float fxCoinOn = step(0., fxCo.y);
    float fxRim = smoothstep(.8, .92, fxCo.z);
    float fxStar = .5 + .5 * cos(fxCo.w * 7.);
    float fxEmb = (1. - smoothstep(.55, .62, fxCo.z)) * smoothstep(.15, .3, fxCo.z) * smoothstep(.55, .9, fxStar - fxCo.z * .4);
    vec3 fxGold = mix(vec3(1., .76, .3), fxBase, .12) * (.75 + .25 * fxH1(fxCo.y * 3.1 + vSeed)) * (1. - fxRim * .15 + fxEmb * .2);
    vec3 fxC = mix(vec3(.05, .03, .01), fxGold, fxCoinOn);
    float fxFacet = fxH1(fxGm.y * 1.7 + vSeed * 5.);
    float fxGemOn = fxGm.x;
    vec3 fxGemC = fxBase * (.45 + .7 * fxFacet) * (fxGm.y > 7.5 ? 1.25 : 1.);
    fxC = mix(fxC, fxGemC, fxGemOn);
    float fxMetalT = fxCoinOn * (1. - fxGemOn);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, (fxEmb * .0012 + fxRim * .0006) * fxMetalT);',
  surface: 'roughnessFactor = mix(.25, .05, fxGemOn); metalnessFactor = fxMetalT;',
  emissive: `
    float fxSpark = fxGlint(fxQt * 6. + vSeed * 3., .3, 2.);
    totalEmissiveRadiance = fxBase * fxGemOn * (.25 + .5 * fxFresnel(normal, 2.) + fxSpark * 1.5) + vec3(1., .9, .6) * fxMetalT * fxSpark * .6;`,
};

B.treasure = {
  color: `diffuseColor.rgb *= .75 + .35 * fxN2(vec2(fxBodyUV().x * 3. + vSeed * 9., fxBodyUV().y * 50.));`,
  surface: 'roughnessFactor = .7;',
};

S.potion = {
  // 물약 진열장. 칸마다 두꺼운 유리창 너머로 면 색 물약이 반쯤 찼다. 물약은 늘 화면 아래쪽으로 고여, 큐브를 돌리면
  // 수평을 지키며 출렁이고, 바닥에서 거품이 올라와 수면에서 사라진다. 물약은 속에서 은은히 빛나 아래로 갈수록 짙고,
  // 수면엔 밝은 띠, 유리엔 빛이 길게 맺힌다. 둘레는 놋쇠 못을 박은 나무 틀
  head: `
    float fxPotionH(vec2 p, float seed) {
      float e = fxEdgeAt(p) / uSticker.x;
      float frame = 1. - smoothstep(.08, .13, e);
      return smoothstep(0., .04, fxEdgeAt(p)) * (.006 + .02 * frame + .01 * (1. - frame) * smoothstep(.1, .6, e));
    }`,
  height: 'fxPotionH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxQo = fxQ();
    float fxE = fxEdge() / uSticker.x;
    float fxFrame = 1. - smoothstep(.08, .13, fxE);
    vec2 fxDn = fxDown();
    float fxS = dot(fxQo, fxDn);
    float fxAlong = dot(fxQo, vec2(-fxDn.y, fxDn.x));
    float fxLevel = .1 + (fxH1(vSeed * 3.) - .5) * .35 + .04 * sin(uTime * 1.3 + vSeed * 6.);
    float fxWave = .035 * sin(fxAlong * 5. + uTime * 2.4 + vSeed * 3.) + .015 * sin(fxAlong * 13. - uTime * 3.1);
    float fxSurfD = fxS + fxLevel + fxWave;
    float fxLiquid = smoothstep(-.01, .01, fxSurfD);
    float fxMenis = exp(-pow(fxSurfD / .018, 2.));
    float fxBub = 0.;
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float x0 = (fxH1(vSeed * 7. + fi) - .5) * 1.4;
      float sp = .2 + .15 * fxH1(vSeed * 11. + fi);
      float v = .9 - fract(uTime * sp + fxH1(vSeed * 13. + fi)) * 2.;
      float rad = .025 + .025 * fxH1(vSeed * 17. + fi);
      vec2 bd = vec2(fxAlong - x0 - .03 * sin(v * 12. + uTime * 3.), fxS - v);
      fxBub = max(fxBub, (1. - smoothstep(rad * .6, rad, length(bd))) * step(fxS, .9) * step(-fxLevel - fxWave, fxS));
    }
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxLiq = fxBase * (.55 + .45 * smoothstep(-.9, .4, -fxS));
    vec3 fxEmpty = vec3(.05, .04, .05) + fxBase * .04;
    vec3 fxC = mix(fxEmpty, fxLiq, fxLiquid);
    fxC = mix(fxC, mix(fxBase, vec3(1.), .5), fxMenis * .6);
    fxC = mix(fxC, mix(fxBase, vec3(1.), .6), fxBub * .7);
    vec3 fxWood = vec3(.28, .16, .08) * (.75 + .35 * fxN2(vec2(fxQo.x * 4. + fxQo.y * 40., fxQo.y * 3.)));
    vec2 fxNail = abs(fxQo) - .9;
    float fxBrass = 1. - smoothstep(.04, .06, length(fxNail));
    fxWood = mix(fxWood, vec3(.85, .62, .25), fxBrass);
    fxC = mix(fxC, fxWood, fxFrame);
    float fxGlassOn = 1. - fxFrame;
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxFrame * fxN2(vLocal.xy * 120.) * .0008);',
  surface: 'roughnessFactor = mix(.04, .6, fxFrame); metalnessFactor = fxBrass;',
  emissive: `
    float fxStreak = exp(-pow((fxQo.x + fxQo.y * .2 + .5) / .05, 2.)) * .35 + fxFresnel(normal, 3.) * .25;
    totalEmissiveRadiance = fxBase * fxLiquid * fxGlassOn * (.45 + .25 * sin(uTime * 1.7 + vSeed * 5.) * .3) + fxBase * fxBub * .6
      + vec3(1.) * fxStreak * fxGlassOn + fxBase * fxMenis * .5;`,
};

B.potion = {
  color: `diffuseColor.rgb *= .75 + .35 * fxN2(vec2(fxBodyUV().x * 3. + vSeed * 9., fxBodyUV().y * 50.));`,
  surface: 'roughnessFactor = .6;',
};

S.runestone = {
  // 룬스톤. 칸마다 거친 화강암 판에 북유럽 룬 문자 여섯 자를 두 줄로 끌로 새겼다. 새긴 홈엔 면 색 안료를 칠했고
  // 바위 겉에도 그 물감이 엷게 남았다. 손끝을 가까이 대면 그 칸의 룬이 깨어나 홈 바닥부터 빛이 차오른다.
  // 돌엔 운모 알갱이가 반짝이고 지의류가 군데군데 피었다
  head: `
    float fxSegR(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0., 1.)); }
    // 룬 한 자까지 거리. g는 글자 칸 안 좌표(-1~1), k는 글자 번호
    float fxRune(vec2 g, float k) {
      float d = fxSegR(g, vec2(0., -1.), vec2(0., 1.));
      float b = fxH1(k * 7.31);
      if (fract(b * 2.) > .5) d = min(d, fxSegR(g, vec2(0., .9), vec2(.6, .4)));
      if (fract(b * 4.) > .5) d = min(d, fxSegR(g, vec2(0., .2), vec2(.6, -.3)));
      if (fract(b * 8.) > .5) d = min(d, fxSegR(g, vec2(0., .5), vec2(-.6, 0.)));
      if (fract(b * 16.) > .5) d = min(d, fxSegR(g, vec2(.6, .4), vec2(.6, -.6)));
      if (fract(b * 32.) > .5) d = min(d, fxSegR(g, vec2(-.6, .9), vec2(.6, -.9)));
      return d;
    }
    // 새긴 홈까지 거리(칸 좌표 기준)
    float fxRunes(vec2 q, float seed) {
      float col = clamp(floor((q.x + .75) / .5), 0., 2.);
      float row = q.y > 0. ? 0. : 1.;
      vec2 c = vec2((q.x - (-.5 + col * .5)) / .17, (q.y - (row < .5 ? .38 : -.38)) / .28);
      if (abs(c.x) > 1.6 || abs(c.y) > 1.4) return 9.;
      return fxRune(c, seed * 13. + col + row * 3.) * .17;
    }
    float fxRuneH(vec2 p, float seed) {
      vec2 q = p / uSticker.x;
      float d = fxRunes(q, seed);
      return smoothstep(0., .04, fxEdgeAt(p)) * (.014 + .005 * fxF2(q * 4. + seed) - .011 * (1. - smoothstep(.02, .05, d)));
    }`,
  height: 'fxRuneH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxQr = fxQ();
    float fxD = fxRunes(fxQr, vSeed);
    float fxGroove = 1. - smoothstep(.018, .035, fxD);
    float fxCore = 1. - smoothstep(0., .018, fxD);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxG = fxVoronoi(vLocal.xy * 90. + vSeed);
    vec3 fxStone = mix(vec3(.42, .4, .38), vec3(.62, .58, .54), fxG.z) * (.8 + .3 * fxF2(fxQr * 5. + vSeed * 3.));
    fxStone = mix(fxStone, vec3(.12, .11, .11), step(.82, fxG.z) * (1. - smoothstep(0., .2, fxG.x)));
    fxStone = mix(fxStone, fxBase * .8, .3 * smoothstep(.3, .7, fxN2(fxQr * 3. + vSeed * 5.)));
    vec3 fxLv = fxVoronoi(fxQr * 10. + vSeed * 9.);
    float fxLichen = smoothstep(.6, .7, fxF2(fxQr * 2.5 + vSeed * 2.)) * (1. - smoothstep(.2, .45, fxLv.x));
    fxStone = mix(fxStone, vec3(.78, .72, .42), fxLichen * .8);
    vec3 fxC = mix(fxStone, fxBase * .7, fxGroove);
    float fxWake = smoothstep(.15, .7, fxTouch(vLocal.xy, .07));
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxG.z * .0012 + fxLichen * .0006 - fxGroove * .001);',
  surface: 'roughnessFactor = mix(.85, .6, fxGroove);',
  emissive: `
    float fxMica = fxGlint(vLocal.xy * 120. + vSeed, .25, 1.5);
    totalEmissiveRadiance = mix(fxBase, vec3(1.), .25) * (fxCore * (.15 + 2.2 * fxWake) + fxGroove * fxWake * .6)
      + vec3(.9) * fxMica * .4;`,
};

B.runestone = {
  color: `diffuseColor.rgb *= .7 + .4 * fxF3(vLocal * 10. + vSeed);`,
  surface: 'roughnessFactor = .9;',
};

S.grimoire = {
  // 마법서 표지. 칸마다 면 색으로 물들인 두꺼운 가죽 표지다. 가운데엔 가죽을 도드라지게 눌러 낸 봉인 문장(겹 원과 오각 별),
  // 네 귀엔 솟은 놋쇠 모서리 장식과 리벳, 가장자리를 따라 금박 겹줄을 눌러 찍었다. 가죽엔 오돌토돌한 결과 주름, 긁힌 자국,
  // 손때로 반들거리는 모서리. 문장 한가운데 박힌 보석은 손끝이 다가오면 깨어나 빛난다
  head: `
    float fxSegG(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0., 1.)); }
    // 표지: x 높이, y 놋쇠, z 금박 줄, w 보석
    vec4 fxCover(vec2 q) {
      float r = length(q);
      float sig = 1. - smoothstep(.012, .03, min(abs(r - .42), abs(r - .36)));
      float star = 9.;
      for (int i = 0; i < 5; i++) {
        float a0 = 1.5708 + float(i) * 1.2566;
        float a1 = a0 + 2.5133;
        star = min(star, fxSegG(q, .36 * vec2(cos(a0), sin(a0)), .36 * vec2(cos(a1), sin(a1))));
      }
      sig = max(sig, 1. - smoothstep(.012, .03, star));
      vec2 aq = abs(q);
      float corner = step(1.25, aq.x + aq.y) * step(.6, min(aq.x, aq.y) + .1);
      vec2 rv = aq - .78;
      float rivet = sqrt(max(0., 1. - dot(rv, rv) / (.05 * .05)));
      float m = max(aq.x, aq.y);
      float gold = (1. - smoothstep(.006, .014, abs(m - .7))) + (1. - smoothstep(.006, .014, abs(m - .76)));
      float gem = sqrt(max(0., 1. - r * r / (.1 * .1)));
      float h = .5 + sig * .2 + corner * .45 + rivet * .25 + gem * .5 - gold * .06;
      return vec4(h, max(corner, step(.01, rivet)), clamp(gold, 0., 1.), gem);
    }
    float fxGrimH(vec2 p, float seed) {
      return smoothstep(0., .04, fxEdgeAt(p)) * (.006 + .026 * fxCover(p / uSticker.x).x + .003 * fxN2(p * 40. + seed));
    }`,
  height: 'fxGrimH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxQg = fxQ();
    vec4 fxCv = fxCover(fxQg);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxPb = fxVoronoi(vLocal.xy * 70. + vSeed * 3.);
    float fxPebble = smoothstep(0., .3, fxPb.y);
    float fxWrinkle = 1. - smoothstep(0., .02, abs(fxF2(fxQg * 3. + vSeed * 5.) - .5));
    float fxWear = (1. - smoothstep(0., .2, fxEdge() / uSticker.x)) * .35;
    vec3 fxLeather = fxBase * (.75 + .25 * fxPebble) * (1. - fxWrinkle * .3) * (1. + fxWear);
    float fxSigil = smoothstep(.62, .7, fxCv.x - fxCv.y * .5 - fxCv.w * .5);
    fxLeather *= 1. + fxSigil * .25;
    vec3 fxBrassC = vec3(.82, .6, .26) * (.8 + .3 * fxN2(vLocal.xy * 60.));
    vec3 fxC = mix(fxLeather, vec3(.95, .76, .32), fxCv.z);
    fxC = mix(fxC, fxBrassC, fxCv.y);
    float fxGemOn = step(.01, fxCv.w);
    float fxWake = smoothstep(.15, .7, fxTouch(vLocal.xy, .07));
    vec3 fxGemC = mix(vec3(.8, .1, .15), vec3(.15, .7, 1.), step(.5, fxH1(vSeed * 3.)));
    fxC = mix(fxC, fxGemC * (.4 + .6 * fxCv.w), fxGemOn);
    float fxMet = max(fxCv.y, fxCv.z);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, (fxPebble * .0008 - fxWrinkle * .0006) * (1. - fxMet));',
  surface: 'roughnessFactor = mix(mix(.6, .45, fxWear), .3, fxMet) - fxGemOn * .25; metalnessFactor = fxMet;',
  emissive: 'totalEmissiveRadiance = fxGemC * fxGemOn * (.2 + 2.5 * fxWake) + diffuseColor.rgb * .03;',
};

B.grimoire = {
  color: `diffuseColor.rgb *= .8 + .3 * fxN2(vec2(fxBodyUV().x * 80., fxBodyUV().y * 2.) + vSeed);`,
  surface: 'roughnessFactor = .5; metalnessFactor = .6;',
};

S.pinart = {
  // 핀아트. 칸마다 검은 판에 면 색으로 물들인 금속 핀이 벌집처럼 촘촘히 꽂혔다. 손끝(마우스)이 가리키는 자리의 핀이
  // 뒤에서 손바닥으로 민 것처럼 쑥 밀려 나오고, 가만히 두면 핀들이 물결처럼 천천히 오르내린다. 핀 머리는 둥글고
  // 밀려 나온 핀은 은빛 기둥이 드러난다
  head: `
    // 핀: x 핀 머리 안인지(볼록함), y 밀려 나온 정도, z 핀마다 난수
    vec3 fxPin(vec2 p, float seed) {
      vec2 q = p / uSticker.x;
      vec4 hx = fxHex(q * 4.6 + seed * 3.);
      vec2 cq = q - hx.xy / 4.6;
      vec2 cp = cq * uSticker.x;
      float push = smoothstep(.05, .9, fxTouch(cp, .075));
      float idle = .5 + .5 * sin(uTime * 1.1 + dot(cq, vec2(3.1, 2.3)) + uFace * 1.7);
      float ext = max(push, idle * .22);
      float r = length(hx.xy);
      return vec3(sqrt(max(0., 1. - r * r / (.36 * .36))), ext, hx.z);
    }
    float fxPinH(vec2 p, float seed) {
      vec3 pin = fxPin(p, seed);
      return smoothstep(0., .03, fxEdgeAt(p)) * (.003 + step(.001, pin.x) * (.006 + .09 * pin.y + .006 * pin.x));
    }`,
  height: 'fxPinH',
  color: `
    if (fxEdge() < 0.) discard;
    vec3 fxPn = fxPin(vLocal.xy, vSeed);
    vec3 fxBase = diffuseColor.rgb;
    float fxHead = step(.001, fxPn.x);
    vec3 fxBoard = vec3(.03) * (.8 + .3 * fxN2(vLocal.xy * 200.));
    vec3 fxPinC = fxBase * (.65 + .45 * fxPn.x) * (.9 + .15 * fxPn.z);
    diffuseColor.rgb = mix(fxBoard, fxPinC, fxHead);`,
  normal: 'normal = fxBump(normal, fxPn.x * .002);',
  surface: 'roughnessFactor = mix(.8, .22, fxHead); metalnessFactor = fxHead * .85;',
  emissive: 'totalEmissiveRadiance = fxBase * fxHead * (.04 + fxPn.y * .25) + vec3(1.) * fxHead * pow(fxPn.x, 8.) * .15;',
};

B.pinart = {
  color: `diffuseColor.rgb *= .8 + .3 * fxN3(vLocal * 60. + vSeed);`,
  surface: 'roughnessFactor = .5; metalnessFactor = .5;',
};

S.sequin = {
  // 스팽글. 칸마다 앞뒤 색이 다른 동그란 스팽글이 물고기 비늘처럼 겹겹이 달렸다. 앞은 면 색 금속, 뒤는 은빛 홀로그램.
  // 손끝으로 쓸면 그 자리 스팽글이 휙 뒤집혀 뒷면이 드러나고(뒤집히는 순간엔 옆으로 서서 얇게 보인다),
  // 손을 떼면 다시 넘어간다. 스팽글마다 가운데 실 구멍과 반짝임
  head: `
    // 가장 위 스팽글: x 볼록함(0~1), y 뒤집힌 정도(0 앞 ~ 1 뒤), z 스팽글마다 난수, w 가운데 구멍
    vec4 fxSequin(vec2 p, float seed) {
      vec2 q = p / uSticker.x;
      vec2 g = q * 4.2 + seed * 5.;
      vec4 best = vec4(0., 0., 0., 0.);
      float row0 = floor(g.y);
      for (int j = -1; j <= 1; j++) {
        float row = row0 + float(j);
        float off = mod(row, 2.) * .5;
        float col0 = floor(g.x - off);
        for (int i = -1; i <= 1; i++) {
          vec2 c = vec2(col0 + float(i) + off + .5, row + .5);
          vec2 d = g - c;
          float r = length(d * vec2(1., 1.)) / .66;
          if (r > 1.) continue;
          // 아래 줄이 위 줄을 덮는다(비늘처럼)
          float order = -row;
          if (best.x > 0. && order < best.z) continue;
          vec2 cp = (c - seed * 5.) / 4.2 * uSticker.x;
          float flip = smoothstep(.15, .6, fxTouch(cp, .08));
          float squash = abs(cos(flip * 3.1416));
          float rr = length(d / vec2(max(squash, .08), 1.)) / .66;
          if (rr > 1.) continue;
          best = vec4(sqrt(max(0., 1. - rr * rr)), flip, order, 1. - smoothstep(.08, .12, length(d)));
        }
      }
      return best;
    }
    float fxSeqH(vec2 p, float seed) {
      vec4 s = fxSequin(p, seed);
      return smoothstep(0., .03, fxEdgeAt(p)) * (.004 + step(.001, s.x) * (.008 + .006 * s.x));
    }`,
  height: 'fxSeqH',
  color: `
    if (fxEdge() < 0.) discard;
    vec4 fxSq = fxSequin(vLocal.xy, vSeed);
    vec3 fxBase = diffuseColor.rgb;
    float fxOnS = step(.001, fxSq.x);
    bool fxBack = fxSq.y > .5;
    vec3 fxFront = fxBase * (.6 + .5 * fxSq.x);
    float fxIr = fxFresnel(normalize(vTz), 1.2);
    vec3 fxHolo = (.6 + .4 * cos(6.2832 * (fxIr * 1.4 + fxSq.x * .5 + vec3(0., .33, .67)))) * .9;
    vec3 fxC = fxBack ? fxHolo : fxFront;
    fxC *= .6 + .4 * abs(cos(fxSq.y * 3.1416));
    fxC = mix(vec3(.04, .03, .05), fxC, fxOnS);
    fxC = mix(fxC, vec3(.06), fxSq.w * fxOnS);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxSq.x * .002);',
  surface: 'roughnessFactor = mix(.8, .15, fxOnS); metalnessFactor = fxOnS * .9;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .05 + vec3(1.) * fxOnS * fxGlint(vLocal.xy * 40. + vSeed, .35, 2.5) * .9;',
};

B.sequin = {
  color: `diffuseColor.rgb *= .85 + .2 * fxN3(vLocal * 80. + vSeed);`,
  surface: 'roughnessFactor = .7;',
};

S.thermo = {
  // 열변색 플라스틱. 칸마다 매끈한 면 색 판인데 열을 받으면 색이 바뀐다(무드링처럼). 손끝이 가리키는 자리가 데워져
  // 무지갯빛 고리를 그리며 옅어지고, 큐브를 돌리는 동안엔 잡은 손 열기에 판 전체가 살짝 달아오른다. 군데군데 남은
  // 손바닥 자국이 천천히 식어 가며 무늬가 흐른다
  head: `
    float fxHeat(vec2 p, float seed) {
      float touch = fxTouch(p, .085);
      vec2 q = p / uSticker.x;
      float print = smoothstep(.55, .85, fxF2(q * 1.2 + vec2(uTime * .03, -uTime * .02) + seed * 7.)) * .45;
      return clamp(touch * 1.2 + print + uCharge * .35, 0., 1.);
    }
    float fxThermoH(vec2 p, float seed) {
      return smoothstep(0., .06, fxEdgeAt(p)) * (.006 + .01 * smoothstep(0., .4, fxEdgeAt(p) / uSticker.x));
    }`,
  height: 'fxThermoH',
  color: `
    if (fxEdge() < 0.) discard;
    float fxH = fxHeat(vLocal.xy, vSeed);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxCold = fxBase * .75;
    vec3 fxRain = .55 + .45 * cos(6.2832 * (fxH * .9 + vec3(.0, .33, .67) + .55));
    vec3 fxWarm = mix(fxRain, vec3(.96, .94, .9), smoothstep(.55, 1., fxH));
    diffuseColor.rgb = mix(fxCold, fxWarm, smoothstep(.12, .45, fxH));`,
  normal: 'normal = fxBump(normal, fxN2(vLocal.xy * 300.) * .0001);',
  surface: 'roughnessFactor = .28;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * (.06 + .1 * fxFresnel(normal, 2.));',
};

B.thermo = {
  surface: 'roughnessFactor = .3;',
};

S.sand = {
  // 모래 그림 상자. 칸마다 얇은 유리 상자에 여러 색 모래가 층층이 담겼다. 모래는 늘 화면 아래쪽으로 쏠려 쌓이고 큐브를 돌리면
  // 새 바닥 쪽으로 다시 내려앉는다. 층은 면 색, 크림, 짙은 색이 물결치듯 번갈아 쌓였고, 맨 위는 기울어진 비탈에
  // 굴러다니는 낱알. 유리엔 빛이 비치고 둘레는 얇은 금속 테
  head: `
    float fxSandH(vec2 p, float seed) {
      float e = fxEdgeAt(p) / uSticker.x;
      float frame = 1. - smoothstep(.05, .08, e);
      return smoothstep(0., .03, fxEdgeAt(p)) * (.006 + .012 * frame + .004 * (1. - frame));
    }`,
  height: 'fxSandH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxQs = fxQ();
    float fxE = fxEdge() / uSticker.x;
    float fxFrame = 1. - smoothstep(.05, .08, fxE);
    vec2 fxDn = fxDown();
    float fxS = dot(fxQs, fxDn);
    float fxAlong = dot(fxQs, vec2(-fxDn.y, fxDn.x));
    float fxSlope = (fxH1(vSeed * 3.) - .5) * .5;
    float fxTopD = fxS + .42 - fxAlong * fxSlope + .04 * (fxN2(vec2(fxAlong * 6., vSeed)) - .5);
    float fxIn = smoothstep(-.012, .012, fxTopD);
    float fxStrata = fxTopD * 5. + .25 * sin(fxAlong * 4. + vSeed * 6.) + .1 * fxN2(vec2(fxAlong * 3., fxS * 2.));
    float fxBand = mod(floor(fxStrata), 4.);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxSandC = fxBand < .5 ? fxBase : (fxBand < 1.5 ? vec3(.92, .86, .72) : (fxBand < 2.5 ? mix(fxBase, vec3(.05), .55) : mix(fxBase, vec3(.95), .4)));
    float fxGrain = fxN2(vLocal.xy * 520. + vSeed) * .6 + fxN2(vLocal.xy * 190.) * .4;
    fxSandC *= .78 + .35 * fxGrain;
    float fxLoose = (1. - smoothstep(0., .05, abs(fxTopD))) * step(.75, fxN2(vLocal.xy * 260. + uTime));
    vec3 fxEmptyC = vec3(.05, .05, .06);
    vec3 fxC = mix(fxEmptyC, fxSandC, max(fxIn, fxLoose * .8));
    fxC = mix(fxC, vec3(.6, .6, .64), fxFrame);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxGrain * .001 * fxIn * (1. - fxFrame));',
  surface: 'roughnessFactor = mix(.06, .3, fxFrame); metalnessFactor = fxFrame;',
  emissive: `
    float fxStreak = exp(-pow((fxQs.x - fxQs.y * .3 + .45) / .05, 2.)) * .3 + fxFresnel(normal, 3.) * .2;
    totalEmissiveRadiance = diffuseColor.rgb * .05 + vec3(1.) * fxStreak * (1. - fxFrame);`,
};

B.sand = {
  color: `diffuseColor.rgb *= .85 + .2 * fxN3(vLocal * 60. + vSeed);`,
  surface: 'roughnessFactor = .4; metalnessFactor = .6;',
};

S.soap = {
  // 비눗방울 막. 칸마다 면 색 플라스틱 고리에 비누막이 걸렸다. 막은 두께에 따라 무지갯빛이 생기는데(얇은 막 간섭),
  // 중력에 막이 흘러내려 화면 위쪽은 얇아 검게 비고 아래로 갈수록 두꺼워져 색 띠가 겹겹이 진다. 막 속에서 소용돌이가
  // 천천히 돌고 막은 숨 쉬듯 부풀었다 가라앉는다. 비눗물엔 면 색이 살짝 돈다
  head: `
    float fxSoapH(vec2 p, float seed) {
      float e = fxEdgeAt(p) / uSticker.x;
      float ring = exp(-pow((e - .07) / .05, 2.));
      float film = smoothstep(.1, .5, e) * (.6 + .4 * sin(uTime * .9 + seed * 6.));
      return smoothstep(0., .03, fxEdgeAt(p)) * (.005 + .02 * ring + .012 * film);
    }`,
  height: 'fxSoapH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxQf = fxQ();
    float fxE = fxEdge() / uSticker.x;
    float fxRing = 1. - smoothstep(.14, .18, fxE);
    vec2 fxDn = fxDown();
    float fxS = dot(fxQf, fxDn);
    vec2 fxW = fxQf * 1.4 + vec2(fxF2(fxQf * 1.6 + uTime * .08 + vSeed), fxF2(fxQf * 1.6 - uTime * .07 + vSeed * 3.)) * 1.5;
    float fxSwirl = fxF2(fxW + vec2(uTime * .05, 0.));
    float fxThick = clamp(.35 + .45 * fxS + .35 * (fxSwirl - .5), 0., 1.);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxIri = .5 + .5 * cos(6.2832 * (fxThick * 2.6 + vec3(0., .33, .67)));
    fxIri = mix(vec3(dot(fxIri, vec3(.33))), fxIri, 1. - fxThick * .4);
    float fxBlack = 1. - smoothstep(.06, .16, fxThick);
    vec3 fxFilm = fxBase * (.35 + .95 * fxIri) * (1. - fxBlack * .85);
    vec3 fxC = mix(fxFilm * .35, fxBase * .9, fxRing);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxSwirl * .0006 * (1. - fxRing));',
  surface: 'roughnessFactor = mix(.04, .25, fxRing);',
  emissive: 'totalEmissiveRadiance = fxFilm * (1. - fxRing) * (.55 + .4 * fxFresnel(normal, 1.5)) + fxBase * fxRing * .04;',
};

B.soap = {
  surface: 'roughnessFactor = .3;',
};

S.lenticular = {
  // 렌티큘러 카드. 칸마다 가는 원통 렌즈가 세로로 촘촘히 늘어선 플라스틱 판(손가락으로 쓸면 오돌토돌한 그 판)이다.
  // 렌즈 아래엔 그림 세 장이 잘게 엇갈려 인쇄돼 있어 보는 각도에 따라 동그라미 → 네모 → 별로 그림이 바뀌고,
  // 큐브를 돌리면 칸마다 그림이 따로 휙휙 넘어간다. 렌즈마다 빛이 가늘게 맺히고 가장자리엔 무지갯빛이 번진다
  head: `
    float fxLensH(vec2 p, float seed) {
      vec2 q = p / uSticker.x;
      float ridge = sqrt(max(0., sin(3.1416 * fract(q.x * 6.5))));
      return smoothstep(0., .03, fxEdgeAt(p)) * (.006 + .006 * ridge);
    }
    // 다섯 꼭지 별까지 거리(대략)
    float fxStar5(vec2 p, float r) {
      float a = atan(p.y, p.x) - 1.5708;
      float rb = r * (.48 + .52 * pow(.5 + .5 * cos(5. * a), 2.5));
      return length(p) - rb;
    }`,
  height: 'fxLensH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxQl = fxQ();
    vec3 fxV = normalize(vViewPosition);
    float fxVx = dot(fxV, vTx);
    float fxFrame = clamp(floor((fxVx * 1.6 + .5) * 3.), 0., 2.);
    float fxRidgeX = fract(fxQl.x * 6.5);
    vec2 fxP = fxQl * .95;
    float fxShape;
    if (fxFrame < .5) fxShape = length(fxP) - .55;
    else if (fxFrame < 1.5) fxShape = fxBox(fxP, vec2(.48), .08);
    else fxShape = fxStar5(fxP, .62);
    float fxIn = 1. - smoothstep(-.01, .01, fxShape);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxPaper = mix(vec3(.96, .95, .92), fxBase, .32);
    vec3 fxC = mix(fxPaper, fxBase, fxIn);
    float fxGhost = 1. - smoothstep(.02, .06, abs(fxRidgeX - .5) * 2. - .8);
    fxC = mix(fxC, mix(fxPaper, fxBase, .5), fxGhost * .15);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, sqrt(max(0., sin(3.1416 * fxRidgeX))) * .0015);',
  surface: 'roughnessFactor = .12;',
  emissive: `
    float fxLine = pow(max(0., sin(3.1416 * fxRidgeX)), 18.) * fxFresnel(normal, 2.);
    vec3 fxRainbow = .5 + .5 * cos(6.2832 * (fxRidgeX + fxVx * 2. + vec3(0., .33, .67)));
    totalEmissiveRadiance = diffuseColor.rgb * .05 + fxRainbow * fxLine * .5;`,
};

B.lenticular = {
  surface: 'roughnessFactor = .2;',
};

S.dragon = {
  // 용의 비늘. 다 맞추면 면 하나가 비늘 덮인 살갗 한 장이다. 아래로 겹친 비늘이 실제로 도톰하고 가운데 등줄이 섰으며,
  // 가장자리는 짙고 보는 각도에 따라 빛깔이 돈다. 비늘 틈 사이로 몸속 불씨가 숨 쉬듯 빛난다. 비늘 색이 곧 면 색
  head: `
    // 비늘 하나: x 비늘 안 거리(0 가운데, 1 가장자리), y 가로 위치, z 세로 위치, w 비늘마다 난수
    vec4 fxScale(vec2 F) {
      vec2 g = F * vec2(4.2, 5.6);
      vec4 o = vec4(1.2, 0., 0., 0.);
      bool found = false;
      for (int j = 1; j >= 0; j--) {
        float row = floor(g.y) + float(j);
        float off = mod(row, 2.) * .5;
        float cx = floor(g.x - off) + .5 + off;
        for (int i = -1; i <= 1; i++) {
          vec2 c = vec2(cx + float(i), row);
          vec2 d = (g - c) / vec2(.62, 1.05);
          float r = length(d);
          if (!found && r < 1.) { o = vec4(r, d.x, d.y, fxH2(c)); found = true; }
        }
      }
      return o;
    }
    float fxDragonH(vec2 p, float seed) {
      vec4 s = fxScale(aHome.xy + p * aHome.z);
      float dome = (1. - s.x * s.x) * .6;
      float ridge = (1. - smoothstep(0., .12, abs(s.y))) * (1. - s.x) * .35;
      return smoothstep(0., .06, fxEdgeAt(p)) * (.006 + .022 * (dome + ridge) * step(s.x, 1.));
    }`,
  height: 'fxDragonH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec4 fxS = fxScale(fxF);
    float fxGap = smoothstep(.86, .98, fxS.x);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxC = fxBase * (.6 + .5 * (1. - fxS.x)) * (.85 + .3 * fxS.w);
    float fxRidge = (1. - smoothstep(0., .12, abs(fxS.y))) * (1. - fxS.x);
    fxC = mix(fxC, fxBase * 1.3 + .05, fxRidge * .35);
    fxC *= 1. - fxGap * .75;
    float fxEmber = fxGap * (.5 + .5 * sin(uTime * 1.5 + fxS.w * 20.)) * smoothstep(.4, .7, fxN2(fxF * 3. + uTime * .2));
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxRidge * .0012 + fxN2(fxF * 90.) * .0004);',
  surface: 'roughnessFactor = mix(.25, .6, fxGap); metalnessFactor = .35 * (1. - fxGap);',
  emissive: `
    float fxFr = fxFresnel(normal, 2.);
    vec3 fxIr = .5 + .5 * cos(6.2832 * (fxFr * 1.2 + fxS.w * .3 + vec3(0., .33, .67)));
    totalEmissiveRadiance = mix(diffuseColor.rgb, fxIr, .35) * fxFr * .5 + vec3(1., .45, .1) * fxEmber * 1.6;`,
};
B.dragon = {
  color: `diffuseColor.rgb *= .75 + .35 * fxN3(vLocal * 30. + vSeed);`,
  surface: 'roughnessFactor = .6;',
};

const FUR = /* glsl */ `
  // 털 결: 면 좌표에서 대체로 아래로 흐르다 군데군데 휘어 돈다
  vec2 fxFurDir(vec2 F) {
    float a = -1.5708 + (fxN2(F * 1.1 + uFace * 4.) - .5) * .7;
    return vec2(cos(a), sin(a));
  }
  // 털 한 자리. x 가닥 밝기, y 뭉치(0 골 ~ 1 뭉치 가운데), z 가닥 끝 쪽(1이면 끝)
  vec3 fxFur(vec2 F, float density, float len) {
    vec2 dir = fxFurDir(F);
    vec2 uv = vec2(dot(F, vec2(-dir.y, dir.x)), dot(F, dir)) * density;
    float clump = fxN2(vec2(uv.x * 2.4, uv.y / len * 1.1));
    float strand = fxN2(vec2(uv.x * 18., uv.y / len * .9 + clump * 2.));
    float fine = fxN2(vec2(uv.x * 46., uv.y / len * 2.2));
    float tip = smoothstep(.55, .95, fxN2(vec2(uv.x * 30., uv.y / len * 4.)));
    return vec3(strand * .55 + fine * .45, clump, tip);
  }
`;

S.wool = {
  // 막 깎은 양털. 다 맞추면 면마다 한 장의 털 뭉치가 된다. 꼬불꼬불 주름진 털 다발이 실제로 볼록볼록 솟아 있고,
  // 다발 끝은 햇빛에 바래 밝으며 다발 사이 골은 깊고 어둡다. 라놀린 기름으로 은은히 번들거린다.
  // 면마다 털 색이 다르다(하얀 양, 검은 양, 그리고 붉게, 파랗게, 노랗게, 초록으로 물들인 털)
  head: `
    // 털 다발: x 다발 안 거리(0 가운데), y 다발마다 난수, z 주름 결
    vec3 fxLock(vec2 F) {
      vec3 v = fxVoronoi(F * 7. + uFace * 3.);
      vec2 dir = vec2(cos(v.z * 6.28), sin(v.z * 6.28));
      float crimp = .5 + .5 * sin(dot(F, dir) * 90. + v.z * 20.);
      return vec3(v.x, v.z, crimp);
    }
    float fxWoolH(vec2 p, float seed) {
      vec3 l = fxLock(aHome.xy + p * aHome.z);
      float dome = 1. - smoothstep(.0, .62, l.x);
      return smoothstep(0., .06, fxEdgeAt(p)) * (.006 + .03 * dome + .004 * l.z * dome);
    }`,
  height: 'fxWoolH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec3 fxL = fxLock(fxF);
    float fxDome = 1. - smoothstep(0., .62, fxL.x);
    float fxGap = smoothstep(.45, .7, fxL.x);
    float fxFib = fxN2(vec2(fxF.x * 200., fxF.y * 200.) + fxL.y * 10.);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxC = fxBase * (.55 + .5 * fxDome) * (.85 + .2 * fxL.z) * (.9 + .15 * fxFib);
    fxC = mix(fxC, mix(fxBase, vec3(1., .97, .9), .35), (1. - smoothstep(0., .25, fxL.x)) * .25);
    fxC *= 1. - fxGap * .45;
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxL.z * .0015 * fxDome + fxFib * .0008);',
  surface: 'roughnessFactor = .78;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * fxFresnel(normal, 1.6) * .5 + vec3(.25, .22, .12) * fxDome * fxL.z * .05;',
};
B.wool = {
  // 나무 울타리
  color: `diffuseColor.rgb *= .8 + .3 * fxN2(vec2(fxBodyUV().x * 4. + vSeed * 9., fxBodyUV().y * 60.));`,
  surface: 'roughnessFactor = .8;',
};

S.hamster = {
  // 햄스터 털. 조각마다 햄스터처럼 동그랗게 부푼 몸에 아주 가늘고 보송한 털이 덮였고, 털끝이 빛을 받아 솜털처럼 번진다.
  // 다 맞추면 면마다 한 마리의 등이다. 면마다 품종이 다르다: 골든(주황 등에 하얀 배), 정글리안(갈회색에 검은 등줄),
  // 펄(하얀 털에 옅은 잿빛 끝), 블랙(검은 털에 하얀 가슴), 푸딩(노란 크림색), 사파이어(청회색에 짙은 등줄). 숨을 쉬듯 들썩인다
  head: FUR + `
    float fxHamH(vec2 p, float seed) {
      vec2 q = p / uSticker.x;
      vec2 w = 1. - pow(abs(q), vec2(4.));
      vec3 f = fxFur(aHome.xy + p * aHome.z, 26., .7);
      float breath = 1. + .05 * sin(uTime * 2.6 + seed * 6.);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + (.03 * clamp(w.x * w.y, 0., 1.) + .006 * f.y + .003 * f.x) * breath);
    }`,
  height: 'fxHamH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec3 fxFr = fxFur(fxF, 26., .7);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxCoat = fxBase;
    float fxStripe = 1. - smoothstep(.04, .1, abs(fxF.x + sin(fxF.y * 3.) * .04));
    float fxBelly = (1. - smoothstep(-.6, -.35, fxF.y + (fxN2(fxF * 4.) - .5) * .25));
    if (uFace < .5) {
      fxCoat = mix(fxBase, vec3(.97, .95, .9), fxBelly);
    } else if (uFace < 1.5) {
      fxCoat = mix(fxBase, vec3(.12, .1, .09), fxStripe * .85);
      fxCoat = mix(fxCoat, vec3(.95, .94, .92), fxBelly);
    } else if (uFace < 2.5) {
      fxCoat = mix(fxBase, vec3(.6, .6, .62), smoothstep(.8, 1., fxFr.z) * .35);
    } else if (uFace < 3.5) {
      float chest = 1. - smoothstep(.0, .08, length((fxF - vec2(0., -.62)) / vec2(.3, .2)) - 1.);
      fxCoat = mix(fxBase, vec3(.95), chest);
    } else if (uFace < 4.5) {
      fxCoat = fxBase * (.92 + .1 * fxFr.y);
    } else {
      fxCoat = mix(fxBase, fxBase * .45, fxStripe * .8);
    }
    vec3 fxC = fxCoat * (.62 + .45 * fxFr.x) * (.85 + .2 * fxFr.y);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxFr.x * .0009 + fxFr.y * .0015);',
  surface: 'roughnessFactor = .85;',
  emissive: 'totalEmissiveRadiance = fxCoat * fxFresnel(normal, 1.1) * .7 + diffuseColor.rgb * .05;',
};
B.hamster = {
  // 톱밥
  color: `diffuseColor.rgb *= .78 + .35 * fxN3(vLocal * 50. + vSeed);`,
  surface: 'roughnessFactor = .95;',
};

S.toon = {
  // 셀 애니메이션. 빛을 두 단으로 끊어 칠하고 그늘엔 보랏빛이 돌며, 밝은 쪽 가장자리엔 림 라이트,
  // 매끈한 하이라이트 한 점. 윤곽선은 먹이 아니라 면 색보다 짙은 같은 색이다. 몸통도 같은 식으로 칠한다
  color: `
    float fxOutline = 1. - smoothstep(.022, .032, fxEdge());
    vec3 fxBase = diffuseColor.rgb;
    diffuseColor.rgb = vec3(0.);`,
  surface: 'roughnessFactor = 1.; metalnessFactor = 0.;',
  emissive: `
    vec3 fxLd = normalize(vec3(-.5, .7, .55));
    vec3 fxV = normalize(vViewPosition);
    float fxNdl = dot(normal, fxLd);
    float fxLit = smoothstep(.16, .2, fxNdl);
    vec3 fxShade = fxBase * vec3(.66, .62, .9);
    vec3 fxCol = mix(fxShade, fxBase * mix(1., 1.08, smoothstep(.4, 1., fxNdl)), fxLit);
    float fxRimL = smoothstep(.6, .64, 1. - abs(dot(normal, fxV))) * fxLit;
    fxCol = mix(fxCol, mix(fxBase, vec3(1.), .55), fxRimL * .75);
    float fxSpec = smoothstep(.972, .976, dot(normal, normalize(fxLd + fxV)));
    fxCol = mix(fxCol, vec3(1.), fxSpec);
    // 면 하나를 비스듬히 가르는 그늘 띠. 애니메이션 배경처럼 평평한 면도 두 톤으로 나뉜다
    vec2 fxF = fxFace();
    float fxBand = smoothstep(.34, .36, dot(fxF, normalize(vec2(.8, -1.))) + (fxN2(fxF * 2.) - .5) * .06);
    fxCol = mix(fxCol, fxCol * vec3(.78, .76, .92), fxBand * fxLit);
    // 칸마다 반들거리는 하이라이트: 왼쪽 위에 둥근 줄 하나와 점 하나
    vec2 fxQt = fxQ();
    float fxGl = (1. - smoothstep(.0, .025, abs(length(fxQt - vec2(.35, -.35)) - .95))) * step(fxQt.y, -fxQt.x * .2 + .35) * step(.15, -fxQt.x + fxQt.y + .6) * step(-.95, fxQt.x) * step(fxQt.y, .95);
    float fxGlDot = 1. - smoothstep(.07, .09, length(fxQt - vec2(-.62, .62)));
    fxCol = mix(fxCol, vec3(1.), max(fxGl * .85, fxGlDot) * (.4 + .6 * fxLit));
    totalEmissiveRadiance = mix(fxCol, fxBase * .32, fxOutline);`,
};
B.toon = {
  emissive: `
    vec3 fxLd = normalize(vec3(-.5, .7, .55));
    vec3 fxV = normalize(vViewPosition);
    float fxNdl = dot(normal, fxLd);
    vec3 fxB = diffuse;
    vec3 fxCol = mix(fxB * vec3(.62, .58, .85), fxB, smoothstep(.16, .2, fxNdl));
    float fxSil = smoothstep(.72, .76, 1. - abs(dot(normal, fxV)));
    totalEmissiveRadiance = mix(fxCol, vec3(.08, .06, .12), fxSil);
    diffuseColor.rgb = vec3(0.);`,
  surface: 'roughnessFactor = 1.; metalnessFactor = 0.;',
};

S.nebula = {
  // 성운. 다 맞추면 면 하나가 성운 한 덩이다. 휘감기며 번지는 빛나는 가스, 그 앞을 가로막는 검은 먼지 띠,
  // 갓 태어난 밝은 별과 그 둘레의 빛무리, 촘촘한 잔별. 가스 빛이 곧 면 색이고 아주 천천히 흐른다
  color: `
    vec2 fxF = fxFace();
    vec2 fxP = fxF * 1.4 + uFace * 3.;
    vec2 fxW = vec2(fxF2(fxP + uTime * .01), fxF2(fxP + 5.2 - uTime * .008));
    float fxGas = fxF2(fxP + fxW * 2.2);
    float fxGas2 = fxF2(fxP * 2. + fxW * 1.5 + 9.);
    float fxDust = smoothstep(.55, .7, fxF2(fxP * 1.6 + fxW + 21.));
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxCol = fxBase * pow(fxGas, 2.) * 2.1 + mix(fxBase.gbr, vec3(1.), .35) * pow(fxGas2, 4.) * 1.1;
    fxCol *= 1. - fxDust * .85;
    vec2 fxSg = floor(fxF * 90.);
    float fxSt = step(.985, fxH2(fxSg)) * (.6 + .4 * sin(uTime * 2. + fxH2(fxSg + 3.) * 30.));
    vec3 fxBig = fxVoronoi(fxF * 6. + 3.);
    float fxYoung = step(.86, fxBig.z);
    fxCol += vec3(fxSt) * .8 + vec3(1.) * (1. - smoothstep(0., .04, fxBig.x)) * fxYoung + mix(fxBase, vec3(1.), .5) * exp(-fxBig.x * 16.) * fxYoung * .6;
    diffuseColor.rgb = vec3(.004);`,
  surface: 'roughnessFactor = .25;',
  emissive: 'totalEmissiveRadiance = fxCol;',
};
B.nebula = {
  color: `float fxRim = smoothstep(.9, 1., fxBodyRim());`,
  surface: 'roughnessFactor = .3; metalnessFactor = .6;',
  emissive: 'totalEmissiveRadiance = vec3(.6, .7, 1.) * fxRim * .15;',
};

S.star = {
  // 항성 표면. 다 맞추면 면 하나가 별 하나의 얼굴이다. 면마다 별의 온도가 달라 빛이 다르다(붉은 왜성, 주황 별, 노란 해,
  // 하얀 별, 푸른 거성, 갈색 왜성). 끓어오르는 쌀알 무늬가 꿈틀대고, 검은 흑점과 가는 실 같은 반그림자,
  // 밝은 백반, 가장자리로 갈수록 어두워지는 주연 감광. 면 테두리에선 홍염 고리가 솟는다
  color: `
    vec2 fxF = fxFace();
    vec2 fxW = fxF + (vec2(fxN2(fxF * 5. + uTime * .03), fxN2(fxF * 5. + 7. - uTime * .03)) - .5) * .06;
    vec3 fxV = fxVoronoi(fxW * 40. + uFace * 5.);
    float fxLane = smoothstep(.0, .28, fxV.y);
    float fxGran = (.5 + .5 * fxLane) * (.9 + .12 * fxV.z) * (1. - .18 * smoothstep(.15, .7, fxV.x)) * (.94 + .12 * fxN2(fxF * 110.));
    float fxBoil = (.9 + .1 * sin(uTime * .8 + fxV.z * 30.)) * (.86 + .28 * fxF2(fxF * 2.6 + uFace * 3.));
    vec2 fxSp = fxF - vec2(.28 * sin(uFace * 2.1 + 1.), .22 * cos(uFace * 1.3));
    float fxSr = length(fxSp * vec2(1., 1.3)) + (fxN2(fxF * 5.) - .5) * .06;
    float fxUmbra = 1. - smoothstep(.07, .1, fxSr);
    float fxPen = 1. - smoothstep(.1, .2, fxSr);
    float fxFil = .5 + .5 * sin(atan(fxSp.y, fxSp.x) * 46. + fxSr * 30.);
    float fxFac = smoothstep(.62, .78, fxF2(fxF * 3. + 2.)) * .35 * (.6 + .4 * fxLane);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxHot = mix(fxBase, vec3(1.), .12);
    vec3 fxCol = fxHot * fxGran * fxBoil * (1. + fxFac);
    fxCol = mix(fxCol, fxBase * .4 * (.65 + .35 * fxFil), fxPen);
    fxCol = mix(fxCol, fxBase * .06, fxUmbra);
    float fxBorder = 1. - max(abs(fxF.x), abs(fxF.y));
    float fxMu = sqrt(max(0., 1. - pow(length(fxF) / 1.5, 2.)));
    fxCol *= mix(vec3(1., .55, .3), vec3(1.), fxMu) * (.45 + .6 * fxMu);
    float fxLoop = exp(-pow((length(fract(fxF * 2.) - .5) - .32) / .025, 2.)) * (1. - smoothstep(0., .07, fxBorder)) * (.6 + .4 * sin(uTime * .7 + fxF.x * 3.));
    fxCol += mix(fxBase, vec3(1., .5, .4), .4) * fxLoop * 1.2;
    diffuseColor.rgb = vec3(.004);`,
  surface: 'roughnessFactor = .4;',
  emissive: 'totalEmissiveRadiance = fxCol * 1.15;',
};
B.star = {
  color: `float fxRim = smoothstep(.85, 1., fxBodyRim());`,
  surface: 'roughnessFactor = .4; metalnessFactor = .4;',
  emissive: 'totalEmissiveRadiance = uBodyGlow * fxRim * .35;',
};

S.galaxy = {
  // 나선 은하. 다 맞추면 면 하나에 은하 하나가 천천히 돈다. 노란 중심 팽대부, 두 갈래로 감기는 나선팔과 그 안쪽을 따라
  // 흐르는 검은 먼지 띠, 팔을 따라 점점이 붉은 별 탄생 구역. 둘레엔 잔별과 먼 은하. 팔 빛이 곧 면 색
  color: `
    vec2 fxF = fxFace();
    float fxR = length(fxF);
    float fxA = atan(fxF.y, fxF.x) - uTime * .02;
    float fxArmP = fxA * 2. - log(max(fxR, .02)) * 3.2;
    float fxArm = pow(.5 + .5 * cos(fxArmP), 3.);
    float fxNz = fxF2(fxF * 4. + uFace * 3.);
    float fxDisk = exp(-fxR * 2.4);
    float fxBulge = exp(-fxR * fxR * 38.);
    float fxLane = pow(.5 + .5 * cos(fxArmP - .7), 7.) * smoothstep(.08, .3, fxR) * (1. - smoothstep(.85, 1.1, fxR));
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxCol = fxBase * fxDisk * (.3 + 1.5 * fxArm * (.55 + .7 * fxNz));
    fxCol += vec3(1., .9, .72) * fxBulge * 1.5;
    fxCol *= 1. - fxLane * .65;
    vec3 fxK = fxVoronoi(fxF * 16. + 4.);
    fxCol += mix(fxBase, vec3(1., .45, .6), .55) * (1. - smoothstep(0., .07, fxK.x)) * step(.78, fxK.z) * fxArm * fxDisk * 2.4;
    vec2 fxSg = floor(fxF * 80.);
    fxCol += vec3(.8) * step(.988, fxH2(fxSg)) * (.5 + .5 * sin(uTime * 2. + fxH2(fxSg) * 20.));
    vec3 fxFar = fxVoronoi(fxF * 3. + 11.);
    fxCol += mix(fxBase.gbr, vec3(1.), .3) * .5 * (1. - smoothstep(0., .03, fxFar.x)) * step(.9, fxFar.z);
    diffuseColor.rgb = vec3(.004);`,
  surface: 'roughnessFactor = .25;',
  emissive: 'totalEmissiveRadiance = fxCol;',
};
B.galaxy = {
  color: `float fxRim = smoothstep(.9, 1., fxBodyRim());`,
  surface: 'roughnessFactor = .3; metalnessFactor = .6;',
  emissive: 'totalEmissiveRadiance = vec3(.8, .75, 1.) * fxRim * .15;',
};

S.bismuth = {
  // 비스무트 결정. 칸마다 네모난 계단이 안으로 파고드는 깔때기 결정이 실제로 층층이 솟아 있고,
  // 얇은 산화막이 빛을 받아 금속 무지갯빛으로 번쩍인다. 층마다 막 두께가 달라 빛깔이 조금씩 바뀌며, 면마다 도는 빛깔이 다르다
  head: `
    // 깔때기 결정: x 층 높이(0 바깥 ~ 1 가운데 테), y 층 번호, z 층 가장자리
    vec3 fxHopper(vec2 q, float seed) {
      vec2 p = fxRot((fxH1(seed * 5.) - .5) * .5) * (q - (vec2(fxH1(seed * 3.), fxH1(seed * 9.)) - .5) * .25);
      float d = max(abs(p.x), abs(p.y));
      vec2 p2 = fxRot(.6) * (q - vec2(.62, -.6) * sign(fxH1(seed * 11.) - .5));
      float d2 = max(abs(p2.x), abs(p2.y)) * 1.9;
      float steps = d * 5.;
      float idx = floor(steps);
      float f = fract(steps);
      float h = idx < .5 ? .15 : 1. - idx / 5.;
      float rim = 1. - smoothstep(0., .1, f);
      float idx2 = floor(d2 * 5.);
      float h2 = idx2 < .5 ? .1 : (1. - idx2 / 5.) * .7;
      if (h2 > h && d2 < 1.) { h = h2; idx = idx2 + 7.; rim = 1. - smoothstep(0., .1, fract(d2 * 5.)); }
      return vec3(max(h, 0.), idx, rim * step(.5, mod(idx, 7.)));
    }
    float fxBismuthH(vec2 p, float seed) {
      vec3 hp = fxHopper(p / uSticker.x, seed);
      return smoothstep(0., .06, fxEdgeAt(p)) * (.006 + .03 * hp.x + .004 * hp.z);
    }`,
  height: 'fxBismuthH',
  color: `
    if (fxEdge() < 0.) discard;
    vec3 fxHp = fxHopper(fxQ(), vSeed);
    diffuseColor.rgb = diffuseColor.rgb * (.18 + .28 * fxHp.x);`,
  surface: 'roughnessFactor = .12; metalnessFactor = .9;',
  emissive: `
    float fxFr = fxFresnel(normal, 1.5);
    float fxFilm = fxHp.y * .13 + fxFr * .6 + fxN2(fxQ() * 3. + vSeed) * .22;
    vec3 fxIr = .5 + .5 * cos(6.2832 * (fxFilm + vec3(0., .33, .67)));
    fxIr *= fxIr * 1.5;
    totalEmissiveRadiance = mix(diffuse * diffuse * 1.2, fxIr, .42) * (.2 + .6 * fxHp.z + .35 * fxFr) * (.55 + .45 * fxHp.x);`,
};
B.bismuth = {
  surface: 'roughnessFactor = .25; metalnessFactor = 1.;',
};

S.banded = {
  // 줄무늬 광석 표본. 다 맞추면 면마다 갈아 낸 광석 한 판이다. 면마다 돌이 다르다:
  // 공작석(초록 동심원 눈알 무늬), 능망간석(분홍과 흰 물결 띠), 남동석(짙은 파랑 덩이 띠), 호안석(결 따라 빛줄이 미끄러지는 금빛 섬유),
  // 적철석(은빛 금속 띠와 붉은 벽옥이 번갈아 쌓인 줄무늬 철광), 라리마(하늘빛 바탕에 흰 거북등 그물). 반질하게 갈았다
  color: `
    vec2 fxF = fxFace();
    vec3 fxBase = diffuseColor.rgb;
    vec2 fxWp = fxF + (vec2(fxN2(fxF * 2. + 1.), fxN2(fxF * 2. + 7.)) - .5) * .3;
    vec3 fxC = fxBase;
    float fxMet = 0.;
    float fxChat = 0.;
    if (uFace < .5) {
      vec3 v = fxVoronoi(fxWp * 2.2 + 3.);
      float b = fract(v.x * 9. + fxN2(fxF * 6.) * .4);
      fxC = mix(fxBase * .45, mix(fxBase, vec3(.6, .9, .7), .35), smoothstep(.3, .7, b));
      fxC *= 1. - (1. - smoothstep(0., .05, v.y)) * .4;
    } else if (uFace < 1.5) {
      float b = fract(fxWp.y * 7. + sin(fxWp.x * 3.) * .4);
      fxC = mix(fxBase, vec3(.97, .93, .92), smoothstep(.6, .75, b) * (1. - smoothstep(.85, .95, b)));
      fxC = mix(fxC, fxBase * .7, smoothstep(.2, .3, b) * (1. - smoothstep(.35, .45, b)));
    } else if (uFace < 2.5) {
      vec3 v = fxVoronoi(fxWp * 3. + 5.);
      float b = fract(v.x * 6. + v.z * 3.);
      fxC = mix(fxBase * .5, fxBase * 1.25, smoothstep(.2, .8, b));
      fxC = mix(fxC, vec3(.2, .55, .4), smoothstep(.62, .7, fxN2(fxF * 4.)) * .5);
    } else if (uFace < 3.5) {
      float fib = fxN2(vec2(fxWp.x * 3., fxWp.y * 140.));
      float band = fract(fxWp.y * 3. + fxN2(fxF * 2.) * .5);
      fxC = mix(fxBase, vec3(.35, .2, .1), smoothstep(.55, .62, band) * (1. - smoothstep(.8, .87, band)));
      fxC *= .85 + .2 * fib;
      fxChat = 1.;
    } else if (uFace < 4.5) {
      float b = fract(fxWp.y * 8. + fxN2(fxF * 3.) * .5);
      float red = smoothstep(.45, .5, b) * (1. - smoothstep(.75, .8, b));
      fxC = mix(fxBase * 1.1, vec3(.62, .15, .12), red);
      fxMet = 1. - red;
    } else {
      vec3 v = fxVoronoi(fxWp * 3.5 + 1.);
      float web = 1. - smoothstep(.02, .07, v.y);
      fxC = mix(fxBase * (.85 + .25 * fxN2(fxF * 5.)), vec3(.95, .97, 1.), web * .85);
    }
    diffuseColor.rgb = fxC;`,
  surface: 'roughnessFactor = mix(.08, .2, fxMet); metalnessFactor = fxMet * .8;',
  emissive: `
    float fxVd = abs(dot(normal, normalize(vViewPosition)));
    float fxGlide = exp(-pow((fract(fxF.x * .8 + fxVd * 2. + .3) - .5) / .08, 2.)) * fxChat;
    totalEmissiveRadiance = diffuseColor.rgb * (.08 + fxGlide * 1.1);`,
};
B.banded = {
  color: `diffuseColor.rgb *= .78 + .3 * fxN3(vLocal * 25. + vSeed);`,
  surface: 'roughnessFactor = .5;',
};

S.wild = {
  // 야생 동물 무늬 털가죽. 다 맞추면 면마다 동물 한 마리의 옆구리다. 짧고 촘촘한 털 위로 면마다 무늬가 다르다:
  // 호랑이(주황에 끝이 갈라지며 가늘어지는 검은 줄), 얼룩말(흰 바탕에 굵게 굽이치는 검은 줄), 표범(금빛에 가운데가 빈 매화 무늬),
  // 기린(갈색 조각을 크림색 그물이 가른다), 흑소(검은 바탕에 큼직한 흰 얼룩), 비단뱀(초록 비늘에 짙은 마름모)
  head: FUR + `
    float fxWildH(vec2 p, float seed) {
      vec3 f = fxFur(aHome.xy + p * aHome.z, 24., .8);
      return smoothstep(0., .06, fxEdgeAt(p)) * (.008 + .007 * f.y + .003 * f.x);
    }`,
  height: 'fxWildH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec3 fxFr = fxFur(fxF, 24., .8);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxCoat = fxBase;
    float fxScaleMode = 0.;
    if (uFace < .5) {
      float s = sin(fxF.x * 10. + fxN2(fxF * 2.) * 4. + fxF.y * 1.5);
      float taper = smoothstep(-.6, .6, sin(fxF.y * 4. + fxF.x * 2.));
      fxCoat = mix(fxBase, vec3(.06, .05, .04), smoothstep(.55, .7, s) * taper);
      fxCoat = mix(fxCoat, vec3(.97, .94, .88), (1. - smoothstep(-.9, -.6, fxF.y)) * .8);
    } else if (uFace < 1.5) {
      float s = sin(fxF.x * 9. + fxN2(fxF * 1.6) * 5. + sin(fxF.y * 3.) * 1.2);
      fxCoat = mix(fxBase, vec3(.05), smoothstep(.0, .12, s));
    } else if (uFace < 2.5) {
      vec3 v = fxVoronoi(fxF * 6. + 2.);
      float ring = (1. - smoothstep(.05, .12, abs(v.x - .2 - .05 * fxN2(fxF * 9.)))) * step(.15, v.z);
      float spot = (1. - smoothstep(.05, .09, v.x)) * step(v.z, .15);
      fxCoat = mix(fxBase, vec3(.7, .48, .2), (1. - smoothstep(.1, .2, v.x)) * .5);
      fxCoat = mix(fxCoat, vec3(.08, .06, .04), max(ring, spot) * .9);
    } else if (uFace < 3.5) {
      vec3 v = fxVoronoi(fxF * 4. + (vec2(fxN2(fxF * 3.), fxN2(fxF * 3. + 4.)) - .5) * .5);
      fxCoat = mix(fxBase * (.85 + .2 * v.z), vec3(.95, .9, .78), 1. - smoothstep(.06, .1, v.y));
    } else if (uFace < 4.5) {
      float blot = smoothstep(.56, .6, fxF2(fxF * 1.7 + 3.));
      fxCoat = mix(fxBase, vec3(.95, .94, .92), blot);
    } else {
      fxScaleMode = 1.;
      vec2 g = fxF * vec2(9., 12.);
      g.x += mod(floor(g.y), 2.) * .5;
      vec2 f = fract(g) - vec2(.5, .3);
      float edge = smoothstep(.38, .6, length(f * vec2(1., 1.4)));
      vec2 dm = abs(fract(fxF * vec2(2.5, 2.) + vec2(fxF.y * .5, 0.)) - .5);
      float dia = 1. - smoothstep(.3, .34, dm.x + dm.y);
      fxCoat = mix(fxBase, fxBase * .3, dia) * (1. - edge * .45);
    }
    vec3 fxC = fxScaleMode > .5 ? fxCoat : fxCoat * (.55 + .55 * fxFr.x) * (.8 + .3 * fxFr.y);
    fxC = mix(fxC, fxC * 1.2 + .03, fxFr.z * .3 * (1. - fxScaleMode));
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxFr.x * .0012 + fxFr.y * .002);',
  surface: 'roughnessFactor = mix(.72, .35, fxScaleMode);',
  emissive: 'totalEmissiveRadiance = fxCoat * fxFresnel(normal, 1.4) * .5 * (1. - fxScaleMode) + diffuseColor.rgb * .04;',
};
B.wild = {
  color: `diffuseColor.rgb *= .78 + .3 * fxN3(vLocal * 40. + vSeed);`,
  surface: 'roughnessFactor = .7;',
};

S.carbon = {
  // 탄소섬유. 다 맞추면 면 하나가 한 장의 2/2 능직 판이다. 섬유 다발이 둘씩 엇갈려 짜였고 그 위를 두꺼운 투명 코팅이 덮었다.
  // 다발마다 섬유 결이 있어 빛과 결이 맞는 다발만 번쩍이므로, 큐브를 돌리면 체크 무늬 광택이 서로 자리를 바꾼다.
  // 면마다 섬유 색이 다르다(검정, 빨강, 파랑, 노란 아라미드, 초록, 은색)
  color: `
    vec2 fxF = fxFace();
    vec2 fxT = fxF * 10.;
    vec2 fxCell = floor(fxT);
    vec2 fxFr = fract(fxT);
    float fxWarpTop = step(mod(fxCell.x + fxCell.y, 4.), 1.5);
    float fxAcross = fxWarpTop > .5 ? fxFr.x : fxFr.y;
    float fxAlong = fxWarpTop > .5 ? fxT.y : fxT.x;
    float fxTow = sqrt(max(0., 1. - pow(fxAcross * 2. - 1., 2.)));
    float fxGap = 1. - smoothstep(0., .06, min(fxAcross, 1. - fxAcross));
    float fxFib = fxN2(vec2(fxAcross * 38. + fxCell.x * 7. + fxCell.y * 3., fxAlong * 1.2));
    vec2 fxFiberDir = fxWarpTop > .5 ? vec2(0., 1.) : vec2(1., 0.);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxC = fxBase * (.32 + .22 * fxTow) * (.75 + .5 * fxFib) * (1. - fxGap * .35) * (fxWarpTop > .5 ? 1. : .72);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxTow * .0008 + fxFib * .0003);',
  surface: 'roughnessFactor = .06;',
  emissive: `
    vec2 fxUp = -fxDown();
    float fxSheen = pow(1. - abs(dot(fxFiberDir, fxUp)), 3.) * fxTow;
    totalEmissiveRadiance = mix(fxBase, vec3(1.), .2) * fxSheen * (.35 + .25 * fxFib) + fxBase * .04;`,
};
B.carbon = {
  surface: 'roughnessFactor = .2; metalnessFactor = .4;',
};

S.bone = {
  // 해골 큐브. 게임 속 해골 블록·납골당 벽처럼, 칸마다 뼈를 깎아 낸 해골 하나가 실제로 솟아 있다. 둥근 머리뼈와 눈썹뼈,
  // 깊이 팬 눈구멍과 뒤집힌 하트 모양 코구멍, 광대와 관자놀이의 굴곡, 위아래 두 줄 이와 그 틈. 몇 칸은 해골 대신
  // 뼈를 다발로 쌓은 단면(마인크래프트 뼈 블록처럼)이라 둥근 뼈 끝과 그 속 해면뼈가 보인다. 살점은 없고 갈아 낸 뼈뿐이다:
  // 우윳빛~꿀빛 묵은 겉, 뼈 속 잔 관이 비치는 가는 점과 줄, 작은 패임과 마른 잔금. 면마다 묵힌 빛깔이 다르다
  // (상아, 붉은 흙, 구리 물, 그을린 검정, 하얗게 구운 뼈, 꿀빛)
  head: `
    float fxSdE(vec2 p, vec2 c, vec2 r) { return (length((p - c) / r) - 1.) * min(r.x, r.y); }
    // 해골 앞모습: x 높이, y 구멍(눈·코·이 틈, 1이 가장 깊다), z 해골 안인지
    vec3 fxSkull(vec2 q) {
      q.x = abs(q.x);
      float cran = fxSdE(q, vec2(0., .2), vec2(.66, .64));
      float jaw = fxBox(q - vec2(0., -.44), vec2(.36, .24), .14);
      float cheek = fxSdE(q, vec2(.38, -.12), vec2(.2, .14));
      float skull = min(min(cran, jaw), cheek);
      float inside = 1. - smoothstep(-.02, .01, skull);
      vec2 dq = (q - vec2(0., .1)) / vec2(.75, .85);
      float dome = sqrt(max(0., 1. - dot(dq, dq)));
      float h = inside * (.45 + .55 * dome);
      h += exp(-pow((q.y - .2 - .05 * cos(q.x * 6.)) / .05, 2.)) * step(q.x, .45) * inside * .12;
      float eye = fxSdE(q, vec2(.24, .04), vec2(.17, .15));
      float eyeIn = 1. - smoothstep(-.03, .01, eye);
      float eyeDeep = 1. - smoothstep(-.12, 0., eye);
      h -= eyeIn * (.55 + .3 * eyeDeep);
      float tn = (q.y + .3) / .22;
      float nose = max(q.x - (.1 * (1. - tn) + .015), max(-tn, tn - 1.) * .22);
      float noseIn = 1. - smoothstep(-.02, .01, nose);
      h -= noseIn * .55;
      float teethZ = step(abs(q.y + .44), .1) * step(q.x, .26);
      float gapV = 1. - smoothstep(.006, .016, abs(fract(q.x / .075 + .5) - .5) * .075);
      float gapH = 1. - smoothstep(.006, .016, abs(q.y + .44));
      float teethGap = teethZ * max(gapV, gapH);
      h -= teethGap * .25;
      h -= exp(-pow((q.x - .58) / .08, 2.)) * exp(-pow((q.y - .02) / .15, 2.)) * .12 * inside;
      float hole = clamp(max(max(eyeIn * (.6 + .4 * eyeDeep), noseIn), teethGap * .8), 0., 1.);
      return vec3(h, hole, inside);
    }
    // 뼈 다발 단면: x 높이, y 구멍(뼈 사이 틈과 골수), z 뼈 끝 안인지
    vec3 fxEnds(vec2 q, float seed) {
      vec3 v = fxVoronoi(q * 2.3 + seed * 7.);
      float rad = .36 + .08 * v.z;
      float disc = 1. - smoothstep(rad - .04, rad, v.x);
      float marrow = 1. - smoothstep(rad * .45, rad * .55, v.x);
      float h = disc * (.75 + .25 * sqrt(max(0., 1. - v.x * v.x / (rad * rad)))) - marrow * .35;
      return vec3(h, marrow * disc * .7 + (1. - disc) * .8, disc);
    }
    // 뼈 결: x 잔 관(어두운 점·줄), y 해면뼈 구멍, z 층 무늬
    vec3 fxGrain(vec2 q, float seed) {
      float ang = fxH1(seed * 5.) * 3.1416;
      vec2 d = vec2(cos(ang), sin(ang));
      vec2 g = vec2(dot(q, d), dot(q, vec2(-d.y, d.x)));
      float canal = smoothstep(.74, .86, fxN2(vec2(g.x * 9., g.y * 70.) + seed * 7.)) * smoothstep(.35, .65, fxN2(vec2(g.x * 6., g.y * 10.) + seed));
      vec3 v = fxVoronoi(q * 14. + seed * 13.);
      canal = max(canal, (1. - smoothstep(.04, .09, v.x)) * step(.75, v.z) * .7);
      float layer = .5 + .5 * sin(g.y * 26. + fxN2(g * vec2(1.5, 4.)) * 4.);
      vec3 sv = fxVoronoi(q * 16. + seed * 3.);
      return vec3(canal, smoothstep(.05, .2, sv.y), layer);
    }
    float fxBoneH(vec2 p, float seed) {
      vec2 q = p / uSticker.x;
      vec3 s = fxH1(seed * 31.) < .3 ? fxEnds(q, seed) : fxSkull(q * 1.08);
      return smoothstep(0., .06, fxEdgeAt(p)) * (.006 + .026 * s.x);
    }`,
  height: 'fxBoneH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxQb = fxQ();
    bool fxIsEnds = fxH1(vSeed * 31.) < .3;
    vec3 fxS = fxIsEnds ? fxEnds(fxQb, vSeed) : fxSkull(fxQb * 1.08);
    vec3 fxGr = fxGrain(fxQb, vSeed);
    vec3 fxBase = diffuseColor.rgb;
    float fxE = fxEdge() / uSticker.x;
    float fxPatina = (1. - smoothstep(0., .25, fxE)) * .2 + fxF2(fxQb * 2.5 + vSeed * 9.) * .22;
    vec3 fxC = fxBase * (1.05 - fxPatina) * (.975 + .04 * fxGr.z);
    fxC = mix(fxC, fxC * vec3(1., .88, .68), smoothstep(.45, .8, fxF2(fxQb * 1.8 + vSeed * 3.)) * .35);
    vec3 fxDarkB = mix(fxBase * vec3(.35, .27, .2), vec3(.25, .18, .12), .5);
    fxC = mix(fxC, fxDarkB, fxGr.x * .45);
    float fxPit = smoothstep(.72, .85, fxN2(fxQb * 30. + vSeed * 7.)) * smoothstep(.4, .7, fxN2(fxQb * 4. + vSeed));
    vec3 fxCk = fxVoronoi(fxQb * vec2(1.4, 4.) + vSeed * 5.);
    float fxCrack = (1. - smoothstep(0., .02, fxCk.y)) * step(.6, fxH1(vSeed * 19.)) * smoothstep(.5, .7, fxN2(fxQb * 2. + vSeed));
    fxC = mix(fxC, fxDarkB * .8, max(fxPit * .6, fxCrack * .7));
    // 뼈 끝 가운데(골수 자리)는 해면뼈
    float fxSpongy = fxIsEnds ? step(.3, fxS.y) * fxS.z : 0.;
    fxC = mix(fxC, mix(vec3(.1, .07, .04), fxC * .9, fxGr.y), fxSpongy);
    // 구멍 속과 해골 바깥 틈은 짙은 그늘
    float fxDeep = fxIsEnds ? (1. - fxS.z) : fxS.y;
    fxC = mix(fxC, fxC * .1 + vec3(.015, .01, .008), fxDeep * .92);
    if (!fxIsEnds) fxC = mix(fxC * (.28 + .2 * fxN2(fxQb * 14. + vSeed)), fxC, fxS.z);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxGr.z * .0003 - fxGr.x * .0006 - fxPit * .0012 - fxCrack * .001 - (1. - fxGr.y) * fxSpongy * .002);',
  surface: 'roughnessFactor = mix(.32, .75, max(fxPatina, fxDeep));',
  // 뼈는 빛이 살짝 스며 가장자리가 은은하다
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * (.04 + .08 * fxFresnel(normal, 2.)) * (1. - fxDeep);',
};
B.bone = {
  // 몸통은 해면뼈. 가는 뼈기둥이 그물처럼 얽혔고 그 사이 구멍은 짙게 비었다
  color: `
    vec2 fxP = fxBodyUV();
    vec3 fxV = fxVoronoi(fxP * 26. + vSeed * 7.);
    vec3 fxV2 = fxVoronoi(fxP * 61. + vSeed * 3.);
    float fxStrut = 1. - smoothstep(.04, .16, min(fxV.y, fxV2.y * 1.6));
    diffuseColor.rgb = mix(diffuseColor.rgb * .3, vec3(.8, .72, .56), fxStrut);`,
  normal: 'normal = fxBump(normal, fxStrut * .002);',
  surface: 'roughnessFactor = .75;',
};

S.eyeball = {
  // 안구. 칸마다 사람 눈알 하나가 짓무른 눈꺼풀 사이로 불룩 솟아 있다. 홍채(면 색)는 크게 열려 바퀴살 같은 결과
  // 오목한 굴(크립트), 동공 둘레의 금빛 주름 테(칼라렛), 동공 가장자리의 검은 테, 가장자리 짙은 고리까지 보이고,
  // 동공은 손끝을(기본은 보는 사람을) 쳐다보며 이따금 휙 시선을 옮긴다. 흰자엔 핏발이 가장자리부터 뻗어 충혈됐고
  // 눈물막이 번들거린다. 눈꺼풀엔 잔주름과 속눈썹. 가끔 깜빡이고, 큐브를 잡으면 일제히 질끈 감았다 뜨며 동공이 커진다
  head: `
    float fxBlinkOpen(float seed) {
      float ph = fract(uTime * (.07 + fxH1(seed * 3.) * .06) + fxH1(seed * 5.));
      return min(smoothstep(0., .03, abs(ph - .03)), 1. - uBlink * .97);
    }
    // 눈꺼풀 사이 아몬드(안쪽이 음수)
    float fxLidD(vec2 q, float a, float b) {
      float t = clamp(q.x / a, -1., 1.);
      return max(abs(q.y) - b * (1. - t * t), abs(q.x) - a);
    }
    float fxEyeballH(vec2 p, float seed) {
      float r = .8 * uSticker.x;
      float rr = length(p);
      float sd = fxLidD(p, r * 1.2, r * .82 * fxBlinkOpen(seed) + .002);
      float inside = 1. - smoothstep(-.006, .006, sd);
      float ball = sqrt(max(r * r - rr * rr, 0.)) * .55;
      float lid = ball * .95 + .016 + .01 * exp(-pow((sd - .03) / .03, 2.)) - .006 * exp(-pow((sd - .1) / .025, 2.));
      float skin = .012 + .004 * fxN2(p * 30. + seed);
      return smoothstep(0., .05, fxEdgeAt(p)) * mix(max(lid, skin), ball + .006, inside);
    }`,
  height: 'fxEyeballH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxP = vLocal.xy;
    float fxR = .8 * uSticker.x;
    float fxRr = length(fxP);
    float fxSd = fxLidD(fxP, fxR * 1.2, fxR * .82 * fxBlinkOpen(vSeed) + .002);
    vec3 fxTint = diffuseColor.rgb;
    float fxSkinN = fxN2(fxP * 40. + vSeed * 3.);
    float fxFold = (.5 + .5 * sin(fxSd * 170. + fxN2(fxP * 18.) * 2.)) * exp(-max(fxSd, 0.) * 14.) * step(0., fxSd);
    vec3 fxSkin = vec3(.7, .4, .36) * (.82 + .25 * fxSkinN) * (.85 + .2 * fxFold);
    fxSkin = mix(fxSkin, vec3(.55, .1, .1), exp(-max(fxSd, 0.) * 45.) * .7);
    vec3 fxVs = fxVoronoi(fxP / uSticker.x * 6. + vSeed * 4.);
    fxSkin = mix(fxSkin, vec3(.42, .18, .3), (1. - smoothstep(0., .04, fxVs.y)) * .3);
    float fxLash = step(0., fxSd) * (1. - smoothstep(0., .05 * uSticker.x, fxSd)) * step(0., fxP.y) * step(.55, fract(fxP.x / uSticker.x * 26. + fxN2(fxP * 60.) * 1.5));
    vec3 fxCol = mix(fxSkin, vec3(.04, .025, .02), fxLash);
    float fxAO = mix(1., .25, exp(-pow(fxSd / .012, 2.)));
    vec3 fxNl = vec3(0., 0., 1.);
    float fxIn = 0.;
    float fxIrisM = 0.;
    if (fxSd < 0.) {
      fxIn = 1.;
      vec3 n = normalize(vec3(fxP, sqrt(max(fxR * fxR - fxRr * fxRr, 1e-5))));
      // 시선: 가리키는 곳을 이 스티커의 좌표로 옮긴다. 가끔 휙 옮겨 간다
      vec3 to = uPointer + vViewPosition;
      vec3 gz = normalize(vec3(dot(to, vTx), dot(to, vTy), dot(to, vTz)));
      gz.xy *= .45;
      float sac = floor(uTime * .9 + vSeed * 7.);
      gz.xy += (vec2(fxH1(sac + vSeed), fxH1(sac * 1.7 + vSeed)) - .5) * .14;
      gz.z = max(gz.z, .8);
      gz = normalize(gz);
      float ca = dot(n, gz);
      vec3 u = n - gz * ca;
      vec3 ey = normalize(vec3(0., 1., 0.) - gz * gz.y);
      vec3 ex = cross(ey, gz);
      vec2 iu = vec2(dot(u, ex), dot(u, ey)) / .72;
      float ir = length(iu);
      float iris = (1. - smoothstep(.95, 1., ir)) * step(0., ca);
      float dil = .28 + .14 * uCharge + .03 * sin(uTime * .5 + vSeed * 9.);
      float pupil = (1. - smoothstep(dil - .015, dil + .01, ir)) * iris;
      float phi = atan(iu.y, iu.x);
      float fib = .5 + .5 * sin(phi * 64. + fxF2(iu * 6. + vSeed * 3.) * 10.);
      float crypt = smoothstep(.58, .72, fxF2(vec2(phi * 2.5, ir * 6.) + vSeed * 7.)) * smoothstep(dil + .05, dil + .15, ir) * (1. - smoothstep(.62, .78, ir));
      float collar = exp(-pow((ir - dil - .16) / .045, 2.));
      float ruff = exp(-pow((ir - dil - .015) / .015, 2.));
      float furrow = .5 + .5 * sin(ir * 70.);
      float limb = smoothstep(.8, 1., ir);
      vec3 irisCol = fxTint * (.75 + .75 * fib) * (1. - .85 * limb) * (.9 + .1 * furrow * smoothstep(.6, .9, ir));
      irisCol = mix(irisCol, irisCol * .3, crypt);
      irisCol += mix(fxTint, vec3(1., .85, .5), .6) * collar * .35;
      irisCol = mix(irisCol, vec3(.08, .05, .03), ruff * .7);
      // 핏발 선 흰자: 가장자리에서 홍채 쪽으로 뻗는 핏줄, 가장자리일수록 충혈
      vec2 sp = fxP / fxR;
      float far = smoothstep(.15, .95, fxRr / fxR);
      float vein = 1. - smoothstep(0., .035, abs(fxF2(sp * 3.5 + vSeed * 9.) - .5));
      float vein2 = (1. - smoothstep(0., .02, abs(fxF2(sp * 9. + vSeed * 4.) - .5))) * smoothstep(.4, .9, fxRr / fxR);
      vec3 sclera = mix(vec3(.9, .86, .78), vec3(.96, .7, .64), far * .55);
      sclera = mix(sclera, vec3(.58, .03, .04), max(vein, vein2 * .8) * far);
      sclera *= .5 + .5 * smoothstep(0., .1, -fxSd / uSticker.x);
      vec3 eye = mix(sclera, irisCol, iris);
      eye = mix(eye, vec3(.004), pupil);
      fxCol = eye;
      fxIrisM = iris * (1. - pupil);
      fxNl = n;
      fxAO = 1.;
    }
    diffuseColor.rgb = fxCol * fxAO;`,
  normal: `
    if (fxIn > .5) normal = normalize(vTx * fxNl.x + vTy * fxNl.y + vTz * fxNl.z);
    else normal = fxBump(normal, fxFold * .0012 + fxSkinN * .0004);`,
  surface: 'roughnessFactor = fxIn > .5 ? .03 : mix(.45, .2, exp(-max(fxSd, 0.) * 30.));',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * fxIrisM * .5 + diffuseColor.rgb * .03;',
};

B.eyeball = {
  // 눈구멍 속 살. 검붉고 번들거린다
  color: `
    float fxN = fxF3(vLocal * 9. + vSeed * 5.);
    diffuseColor.rgb *= .7 + .6 * fxN;`,
  normal: 'normal = fxBump(normal, fxN * .006);',
  surface: 'roughnessFactor = .15;',
};

S.viscera = {
  // 내장. 다 맞추면 면 하나에 창자가 빽빽하게 똬리를 틀었다. 굵은 관이 실제로 불룩 솟아 구불구불 감겼고,
  // 천천히 꿈틀대며 연동한다. 겉은 장액으로 번들거리고, 관을 가로질러 붉은 동맥과 검붉은 정맥이 가지를 치며,
  // 관 사이 골엔 노란 장간막 지방이 몽글몽글 끼었고 피가 고였다. 면마다 장기 빛깔이 다르다
  head: `
    // 창자: x 관 단면(0 골 ~ 1 관 꼭대기), y 관 번호, z 골까지 거리(0~.5)
    vec3 fxGut(vec2 F) {
      vec2 w = F * 1.7 + uFace * 3.1;
      vec2 wp = vec2(fxF2(w * .8 + 1.7 + uTime * .015), fxF2(w * .8 + 9.2 - uTime * .015)) - .5;
      float s = fxF2(w * .6 + wp * 2.4) * 9. + .06 * sin(uTime * .7 + F.y * 3.);
      float v = fract(s);
      return vec3(sin(3.1416 * v), floor(s), min(v, 1. - v));
    }
    float fxGutH(vec2 p, float seed) {
      vec3 g = fxGut(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + .03 * pow(g.x, .6));
    }`,
  height: 'fxGutH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec3 fxG = fxGut(fxF);
    vec3 fxBase = diffuseColor.rgb;
    float fxHaus = fxN2(fxF * 14. + fxG.y * 3.1);
    vec3 fxC = fxBase * (.45 + .6 * fxG.x) * (.9 + .12 * fxHaus);
    // 관을 가로지르는 핏줄
    float fxArt = 1. - smoothstep(0., .022, abs(fxF2(fxF * 6. + uFace * 2.) - .5));
    float fxVein = 1. - smoothstep(0., .016, abs(fxF2(fxF * 9. + uFace * 5. + 3.) - .5));
    fxC = mix(fxC, vec3(.62, .04, .05), fxArt * .8 * smoothstep(.2, .6, fxG.x));
    fxC = mix(fxC, vec3(.22, .05, .12), fxVein * .7 * smoothstep(.2, .6, fxG.x));
    // 골에 낀 지방과 고인 피
    float fxGap = 1. - smoothstep(.04, .16, fxG.z);
    vec3 fxFatV = fxVoronoi(fxF * 28. + uFace);
    float fxFat = smoothstep(.25, .45, fxGap * fxN2(fxF * 7. + uFace * 4.) * 1.6) * (1. - smoothstep(.35, .7, fxFatV.x));
    fxC = mix(fxC, vec3(.9, .74, .32) * (.8 + .3 * fxFatV.z), fxFat);
    fxC = mix(fxC, vec3(.25, .02, .03), (1. - smoothstep(0., .05, fxG.z)) * (1. - fxFat) * .8);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxFat * .002 + fxHaus * .0006 + fxArt * .0006);',
  surface: 'roughnessFactor = mix(.12, .4, fxFat);',
  emissive: 'totalEmissiveRadiance = mix(fxBase, vec3(1., .8, .8), .3) * fxFresnel(normal, 3.) * .25 * fxG.x + fxBase * .03;',
};

B.viscera = {
  color: `
    float fxN = fxF3(vLocal * 8. + vec3(0., uTime * .05, 0.) + vSeed * 5.);
    diffuseColor.rgb *= .7 + .6 * fxN;`,
  normal: 'normal = fxBump(normal, fxN * .006);',
  surface: 'roughnessFactor = .14;',
};

S.brain = {
  // 뇌. 다 맞추면 면 하나가 위에서 본 대뇌다. 가운데로 깊은 세로 틈이 좌우 반구를 가르고, 구불구불한 이랑이
  // 실제로 솟고 고랑은 깊이 패였다. 고랑을 따라 검붉은 정맥이 기어가고 이랑 위로 가는 동맥이 가지를 치며,
  // 겉은 거미막이 얇게 덮어 희뿌옇게 번들거린다. 심장 박동에 맞춰 살짝 부풀었다 가라앉는다.
  // 면마다 뇌의 상태가 다르다(갓 꺼낸 분홍, 포르말린 회색, 멍든 보라, 출혈, 괴사, 파랗게 물들인 표본)
  head: `
    // 이랑: x 높이(0 고랑 ~ 1 이랑 꼭대기), y 고랑까지 거리(0~.5), z 세로 틈(1이 한가운데)
    vec3 fxGyri(vec2 F) {
      // 결 방향이 천천히 휘는 줄무늬라 이랑 굵기가 고르고 지문처럼 구불거린다
      vec2 w = F * 1.3 + uFace * 5.3;
      float th = fxF2(w * .9) * 9. + fxN2(w * 3.) * .8;
      float ph = dot(F, vec2(cos(th), sin(th))) * 7.5 + fxF2(w * 1.7 + 4.) * 2.5;
      float v = fract(ph);
      float fiss = 1. - smoothstep(0., .07, abs(F.x + .04 * sin(F.y * 4. + uFace)));
      return vec3(sin(3.1416 * v), min(v, 1. - v), fiss);
    }
    float fxBrainH(vec2 p, float seed) {
      vec3 g = fxGyri(aHome.xy + p * aHome.z);
      float beat = 1. + .08 * fxBeat();
      return smoothstep(0., .05, fxEdgeAt(p)) * (.006 + .026 * pow(g.x, .5) * beat) * (1. - g.z * .85);
    }`,
  height: 'fxBrainH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec3 fxGy = fxGyri(fxF);
    vec3 fxBase = diffuseColor.rgb;
    float fxSul = 1. - smoothstep(0., .12, fxGy.y);
    vec3 fxC = fxBase * (.45 + .6 * pow(fxGy.x, .7));
    fxC *= .9 + .15 * fxN2(fxF * 60. + uFace);
    // 고랑을 따라 기는 정맥, 이랑을 건너는 동맥
    float fxVes = (1. - smoothstep(0., .045, fxGy.y)) * smoothstep(.35, .55, fxN2(fxF * 5. + uFace * 3.));
    float fxArt = 1. - smoothstep(0., .015, abs(fxF2(fxF * 4. + uFace * 7.) - .5));
    fxC = mix(fxC, vec3(.35, .05, .12), fxVes * .85);
    fxC = mix(fxC, vec3(.7, .06, .06), fxArt * .75);
    fxC *= 1. - fxSul * .6;
    fxC = mix(fxC, vec3(.08, .02, .03), fxGy.z * .85);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxArt * .0012 + fxVes * .0008 + fxN2(fxF * 60.) * .0003);',
  surface: 'roughnessFactor = mix(.2, .45, fxSul);',
  emissive: 'totalEmissiveRadiance = vec3(.9, .85, .9) * fxFresnel(normal, 2.5) * .18 * fxGy.x + diffuseColor.rgb * .03;',
};

B.brain = {
  color: `
    float fxN = fxF3(vLocal * 8. + vSeed * 5.);
    diffuseColor.rgb *= .7 + .6 * fxN;`,
  normal: 'normal = fxBump(normal, fxN * .005);',
  surface: 'roughnessFactor = .2;',
};

S.slime = {
  // 독성 슬라임 통. 칸마다 형광으로 빛나는 끈적한 슬라임이 실제로 울퉁불퉁 출렁이고, 속에서 거품이 부풀었다가 톡 터진다.
  // 번들거리는 겉면에 빛이 맺히고, 깊은 곳은 짙게 가라앉았으며, 아래쪽으로 방울이 늘어져 맺힌다. 슬라임 빛이 곧 면 색
  head: `
    float fxSlimeH(vec2 p, float seed) {
      vec2 q = p / uSticker.x;
      float wob = fxN2(q * 2. + vec2(uTime * .25, -uTime * .2) + seed * 5.);
      float lumps = fxN2(q * 4.5 + seed * 3. + uTime * .1);
      return smoothstep(0., .06, fxEdgeAt(p)) * (.008 + .016 * wob + .008 * lumps);
    }`,
  height: 'fxSlimeH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxQl = fxQ();
    float fxDeep = fxN2(fxQl * 2. + vec2(uTime * .25, -uTime * .2) + vSeed * 5.);
    vec3 fxBv = fxVoronoi(fxQl * 3.5 + vSeed * 7.);
    float fxCyc = fract(uTime * .18 + fxBv.z * 3.);
    float fxBr = .05 + fxCyc * .28;
    float fxBub = step(.55, fxBv.z) * (1. - smoothstep(fxBr - .02, fxBr, fxBv.x)) * (1. - smoothstep(.92, 1., fxCyc));
    float fxBubRim = fxBub * smoothstep(fxBr - .05, fxBr - .01, fxBv.x);
    vec2 fxDn = fxDown();
    float fxLow = dot(fxQl, fxDn);
    float fxDrip = (1. - smoothstep(.0, .05, abs(fract(dot(fxQl, vec2(-fxDn.y, fxDn.x)) * 2.5 + vSeed) - .5) * .4 - .02 * (fxLow - .6) * 10.)) * smoothstep(.6, .9, fxLow);
    float fxSpeck = step(.97, fxH2(floor(fxQl * 40. + vec2(0., uTime * 2.))));
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxC = mix(fxBase * .35, fxBase * 1.1, fxDeep);
    fxC = mix(fxC, mix(fxBase, vec3(1.), .5), fxBubRim);
    diffuseColor.rgb = fxC * .5;`,
  normal: 'normal = fxBump(normal, fxBub * .003 + fxSpeck * .0005);',
  surface: 'roughnessFactor = .04;',
  emissive: `
    float fxFr = fxFresnel(normal, 2.);
    totalEmissiveRadiance = fxC * (.6 + .5 * fxDeep) + mix(fxBase, vec3(1.), .5) * (fxFr * .5 + fxBubRim * .8 + fxDrip * .4) + vec3(1.) * fxSpeck * .3;`,
};
B.slime = {
  // 녹슨 드럼통
  color: `diffuseColor.rgb *= .7 + .4 * fxN3(vLocal * 30. + vSeed);`,
  surface: 'roughnessFactor = .6; metalnessFactor = .5;',
};

S.magic = {
  // 지하 제단의 마법진. 칸마다 검은 돌판에 겹 원과 문자 띠, 엇갈린 두 삼각형, 가운데 눈을 끌로 깊이 새겼다.
  // 새긴 홈은 실제로 패였고, 그 바닥에서 빛이 스며 나와 원을 따라 물결치듯 일렁인다. 돌판엔 금이 가고 결이 거칠다.
  // 홈의 빛이 곧 면 색
  head: `
    float fxSegM(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0., 1.)); }
    // 새긴 선까지 거리
    float fxMagicD(vec2 q, float seed) {
      float r = length(q);
      float a = atan(q.y, q.x);
      float d = min(min(abs(r - .86), abs(r - .68)), abs(r - .3));
      float ca = (a + seed * 6.2832) * 22. / 6.2832;
      float ci = floor(ca);
      vec2 g = vec2(fract(ca), (r - .71) / .12);
      float bits = fxH1(ci * 3.7 + seed);
      float rune = 9.;
      if (g.y > 0. && g.y < 1.) {
        if (fract(bits * 2.) > .5) rune = min(rune, abs(g.x - .5) * .1);
        if (fract(bits * 4.) > .5) rune = min(rune, abs(g.y - .35) * .1);
        if (fract(bits * 8.) > .5) rune = min(rune, abs(g.x - g.y) * .07);
        if (fract(bits * 16.) > .5) rune = min(rune, abs(g.x + g.y - 1.) * .07);
        if (fract(bits * 32.) > .5) rune = min(rune, abs(length(g - vec2(.5, .65)) - .2) * .1);
        rune = max(rune, -min(min(g.x - .18, .82 - g.x), min(g.y - .15, .85 - g.y)) * .2);
      }
      d = min(d, rune);
      vec2 sq = fxRot(seed * 3.) * q;
      for (int i = 0; i < 6; i++) {
        float a0 = float(i) * 1.0472;
        d = min(d, fxSegM(sq, .6 * vec2(cos(a0), sin(a0)), .6 * vec2(cos(a0 + 2.0944), sin(a0 + 2.0944))));
      }
      d = min(d, abs(length(q / vec2(.2, .1)) - 1.) * .1);
      d = min(d, length(q) - .035);
      return d;
    }
    float fxMagicH(vec2 p, float seed) {
      float d = fxMagicD(p / uSticker.x, seed);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.014 + .004 * fxF2(p * 20. + seed * 9.) - .013 * (1. - smoothstep(0., .06, d)));
    }`,
  height: 'fxMagicH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxQm = fxQ();
    float fxD = fxMagicD(fxQm, vSeed);
    float fxCh = 1. - smoothstep(.014, .032, fxD);
    float fxCore = 1. - smoothstep(0., .014, fxD);
    float fxGlow = exp(-max(fxD, 0.) * 30.);
    float fxPulse = .7 + .3 * sin(uTime * 1.6 - length(fxQm) * 9. + atan(fxQm.y, fxQm.x) * 2. + vSeed * 6.);
    vec3 fxBase = diffuseColor.rgb;
    float fxSn = fxF2(vLocal.xy * 14. + vSeed * 9.);
    vec3 fxStone = vec3(.08, .075, .08) * (.65 + .7 * fxSn);
    vec3 fxCrack = fxVoronoi(vLocal.xy * 5. + vSeed * 2.);
    float fxCk = 1. - smoothstep(0., .03, fxCrack.y);
    fxStone *= 1. - fxCk * .55;
    diffuseColor.rgb = mix(fxStone, fxStone * .35, fxCh) + fxBase * fxGlow * .05;`,
  normal: 'normal = fxBump(normal, fxSn * .002 - fxCk * .001);',
  surface: 'roughnessFactor = mix(.78, .5, fxCh);',
  emissive: 'totalEmissiveRadiance = mix(fxBase, vec3(1.), .2) * (fxCore * 1.8 + fxCh * .45 + fxGlow * .22) * fxPulse;',
};
B.magic = {
  color: `diffuseColor.rgb *= .7 + .4 * fxF3(vLocal * 10. + vSeed);`,
  surface: 'roughnessFactor = .85;',
};
S.arabesque = {
  // 모로코 젤리주 타일. 칸마다 손으로 깎아 구운 유약 타일 조각을 회반죽에 박았다. 가운데 여덟 꼭지 별(면 색),
  // 그 둘레를 흰 조각 열여섯 개가 감싸고, 바깥은 짙게 물든 조각, 네 칸이 만나는 귀퉁이엔 면 색 마름모.
  // 조각은 실제로 솟았고 줄눈은 패였다. 조각마다 조금씩 기울게 박혀 빛이 조각마다 다르게 번쩍이고,
  // 가장자리엔 유약이 고여 짙으며 흘러내린 자국, 잔금, 바늘구멍, 이가 빠져 붉은 흙이 드러난 모서리가 있다
  head: `
    // 젤리주 조각: x 조각 가장자리까지 거리, y 조각 종류(0 별, 1 둘레, 2 바깥, 3 귀퉁이 마름모), z 조각마다 다른 난수
    vec3 fxZel(vec2 q, float seed) {
      vec2 r = fxRot(.785398) * q;
      float star = min(max(abs(q.x), abs(q.y)), max(abs(r.x), abs(r.y))) - .42;
      float oct = max(max(abs(q.x), abs(q.y)), (abs(q.x) + abs(q.y)) * .7071) - .8;
      vec2 cq = q - vec2(q.x < 0. ? -1. : 1., q.y < 0. ? -1. : 1.);
      float dia = abs(cq.x) + abs(cq.y) - .36;
      float t = (atan(q.y, q.x) + 6.2832) / .785398;
      float len = length(q);
      float kind = star < 0. ? 0. : (oct < 0. ? 1. : (dia < 0. ? 3. : 2.));
      float cutO = abs(len * sin((t - floor(t) - .5) * .785398));
      float cutR = abs(len * sin((t - floor(t * 2. + .5) * .5) * .785398));
      float d = kind < .5 ? -star : (kind < 1.5 ? min(min(star, -oct), cutR) : (kind < 2.5 ? min(min(oct, cutO), dia) : -dia));
      float id = kind < .5 ? 0. : (kind < 1.5 ? 10. + mod(floor(t * 2.), 16.) : (kind < 2.5 ? 30. + mod(floor(t + .5), 8.) : 50. + step(0., q.x) + 2. * step(0., q.y)));
      return vec3(d, kind, fxH1(id * 7.31 + seed * 13.));
    }
    float fxZelH(vec2 p, float seed) {
      vec2 q = p / uSticker.x;
      vec3 z = fxZel(q, seed);
      vec2 tilt = vec2(fxH1(z.z * 17.), fxH1(z.z * 29.)) - .5;
      float top = .016 + dot(q, tilt) * .012 + (z.z - .5) * .004;
      return smoothstep(0., .06, fxEdgeAt(p)) * mix(.003, top, smoothstep(.02, .075, z.x));
    }`,
  height: 'fxZelH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxQz = fxQ();
    vec3 fxZ = fxZel(fxQz, vSeed);
    vec3 fxBase = diffuseColor.rgb;
    float fxGrout = 1. - smoothstep(.018, .03, fxZ.x);
    float fxPool = 1. - smoothstep(.03, .14, fxZ.x);
    vec3 fxGlaze = fxZ.y < .5 ? fxBase : (fxZ.y < 1.5 ? vec3(.93, .9, .82) : (fxZ.y < 2.5 ? mix(fxBase, vec3(.03, .04, .05), .6) : fxBase * 1.05));
    fxGlaze *= (.88 + .2 * fxZ.z) * (.94 + .1 * fxN2(fxQz * 5. + fxZ.z * 30.));
    fxGlaze *= 1. - fxPool * .28;
    float fxDrip = smoothstep(.62, .9, fxN2(vec2(fxQz.x * 24. + fxZ.z * 40., fxQz.y * 2.2 + fxZ.z * 9.)));
    fxGlaze *= 1. - fxDrip * .16;
    float fxCraze = 1. - smoothstep(0., .025, fxVoronoi(fxQz * 7. + fxZ.z * 50.).y);
    fxGlaze *= 1. - fxCraze * .18;
    float fxPin = step(.93, fxH2(floor(vLocal.xy * 400.)));
    fxGlaze *= 1. - fxPin * .35;
    float fxChip = (1. - smoothstep(.03, .06, fxZ.x)) * smoothstep(.74, .8, fxN2(fxQz * 16. + fxZ.z * 23.)) * (1. - fxGrout);
    vec3 fxClay = vec3(.62, .32, .2) * (.8 + .3 * fxN2(vLocal.xy * 300.));
    vec3 fxMortar = vec3(.66, .62, .55) * (.75 + .35 * fxN2(vLocal.xy * 260.));
    diffuseColor.rgb = mix(mix(fxGlaze, fxClay, fxChip), fxMortar, fxGrout);`,
  normal: 'normal = fxBump(normal, fxN2(fxQz * 6. + fxZ.z * 40.) * .0016 - fxCraze * .0003 - fxGrout * .001 - fxChip * .0015 + fxDrip * .0004);',
  surface: 'roughnessFactor = mix(mix(.05 + fxPin * .3, .85, fxChip), .9, fxGrout);',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .04;',
};
B.arabesque = {
  color: `diffuseColor.rgb *= .8 + .3 * fxN3(vLocal * 30. + vSeed);`,
  surface: 'roughnessFactor = .8;',
};

S.artdeco = {
  // 아르데코 황동 판. 다 맞추면 면 하나가 부채꼴 비늘이 줄지은 한 장이다. 부어 만든 황동 판에서 부채 테두리와
  // 겹 반원이 실제로 솟았고(바깥 테엔 구슬을 줄지어 새겼다), 그 사이 움푹한 칸엔 유리질 에나멜을 녹여 채웠다
  // (바깥 띠는 면 색, 안쪽 띠는 검정에 금빛 살). 에나멜엔 잔기포, 테 옆 오목한 데엔 거뭇한 녹. 부채 밑동의 해는
  // 통째로 황동이고 햇살 결을 새겼으며, 황동은 결 따라 솔질 자국이 났다
  head: `
    // 부채 자리: x 부채 밑동에서 거리(0~1), y 각도, z 부채마다 난수
    vec3 fxDecoO(vec2 F) {
      vec2 G = F * vec2(2.4, 2.8) + vec2(0., 3.);
      vec3 o = vec3(1.5, 0., 0.);
      bool found = false;
      for (int j = 0; j <= 1; j++) {
        float row = floor(G.y) - float(j);
        float off = mod(row, 2.) * .5;
        float cx = floor(G.x - off) + .5 + off;
        for (int i = -1; i <= 1; i++) {
          vec2 c = vec2(cx + float(i), row);
          vec2 d = (G - c) / vec2(.5, 1.);
          float r = length(d);
          if (!found && d.y >= 0. && r < 1.) { o = vec3(r, atan(d.y, d.x), fxH2(c)); found = true; }
        }
      }
      return o;
    }
    // 솟은 황동 테(바깥 테와 두 겹 반원). w가 테의 너비
    float fxDecoRim(float r, float w) {
      return max(max(1. - smoothstep(w, w * 2.5, abs(r - .975)), 1. - smoothstep(w * .7, w * 2., abs(r - .7))), 1. - smoothstep(w * .7, w * 2., abs(r - .42)));
    }
    float fxDecoH(vec2 p, float seed) {
      vec3 o = fxDecoO(aHome.xy + p * aHome.z);
      float sun = 1. - smoothstep(.38, .42, o.x);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.007 + .016 * fxDecoRim(o.x, .022) + .01 * sun * (1. - .6 * o.x));
    }`,
  height: 'fxDecoH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec3 fxO = fxDecoO(fxF);
    float fxRimC = fxDecoRim(fxO.x, .01);
    float fxRl = abs(fract(fxO.y * 18. / 3.1416) - .5) * 2.;
    float fxMid = step(.42, fxO.x) * step(fxO.x, .7);
    float fxSun = 1. - step(.42, fxO.x);
    float fxRay = smoothstep(.8, .9, fxRl) * fxMid;
    float fxGold = clamp(fxRimC + fxRay + fxSun, 0., 1.);
    float fxDr = min(min(abs(fxO.x - .975), abs(fxO.x - .7)), abs(fxO.x - .42));
    float fxTarn = 1. - smoothstep(.012, .06, fxDr);
    float fxBead = (1. - smoothstep(.01, .025, abs(fxO.x - .975))) * (.5 + .5 * cos(fxO.y * 64.));
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxEnamel = fxMid > .5 ? vec3(.025, .025, .03) : fxBase * (.92 + .1 * fxN2(fxF * 40.));
    fxEnamel *= 1. - fxTarn * .45;
    float fxBub = step(.986, fxH2(floor(fxF * 320.))) * (1. - fxGold);
    fxEnamel = mix(fxEnamel, fxEnamel * 1.6 + .05, fxBub);
    float fxGuil = .5 + .5 * sin(fxO.y * 90. + fxO.x * 20.);
    float fxBrush = fxN2(vec2(fxO.y * 70. + fxO.z * 30., fxO.x * 3.));
    vec3 fxBrass = vec3(.86, .67, .32) * (.85 + .15 * fxGuil * fxSun) * (.86 + .2 * fxBrush);
    diffuseColor.rgb = mix(fxEnamel, fxBrass, fxGold);`,
  normal: 'normal = fxBump(normal, fxRay * .0012 + fxGuil * fxSun * .0006 + fxBead * .0012 + fxBrush * fxGold * .0003 + fxN2(fxF * 25.) * .0003 * (1. - fxGold));',
  surface: 'roughnessFactor = mix(.06, mix(.3, .12, fxRimC), fxGold); metalnessFactor = fxGold;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .04 * (1. - fxGold);',
};
B.artdeco = {
  color: `float fxRim = smoothstep(.9, .95, fxBodyRim());`,
  surface: 'roughnessFactor = .15; metalnessFactor = .3;',
};

S.celtic = {
  // 켈트 매듭 돌 부조. 다 맞추면 면 하나가 끊이지 않고 엮인 매듭 한 판이다. 돌을 깊이 파내 띠만 남겼고,
  // 띠가 만나는 곳마다 위 띠는 솟아 넘어가고 아래 띠는 실제로 내려앉아 밑으로 들어간다. 띠마다 가장자리를 따라
  // 가는 홈 두 줄과 가운데 홈을 그었고, 면 색 안료를 칠했는데 가장 솟은 데는 닳아 돌이 드러났다.
  // 파낸 바닥은 띠 그늘에 어둡고 정 자국이 남았으며, 군데군데 지의류가 노랗고 희게 피었다
  head: `
    // 엮은 띠: x 높이(0 바닥), y 띠 위인지, z 바닥에서 띠까지 거리, w 보이는 띠의 가운데에서 거리(0~1)
    vec4 fxKnot(vec2 F) {
      vec2 uv = fxRot(.785398) * F * 3.2;
      vec2 cell = floor(uv);
      vec2 fr = fract(uv) - .5;
      float w = .21;
      float over = mod(cell.x + cell.y, 2.);
      float dA = abs(fr.y), dB = abs(fr.x);
      float nearA = 1. - smoothstep(.05, .45, abs(fr.x));
      float nearB = 1. - smoothstep(.05, .45, abs(fr.y));
      float liftA = over > .5 ? nearA : -nearA;
      float liftB = over > .5 ? -nearB : nearB;
      float inA = 1. - smoothstep(w - .03, w, dA);
      float inB = 1. - smoothstep(w - .03, w, dB);
      float hA = inA * (.55 + .25 * sqrt(max(0., 1. - dA * dA / (w * w))) + .4 * liftA);
      float hB = inB * (.55 + .25 * sqrt(max(0., 1. - dB * dB / (w * w))) + .4 * liftB);
      bool topA = hA >= hB;
      return vec4(max(hA, hB), max(inA, inB), min(dA, dB) - w, (topA ? dA : dB) / w);
    }
    float fxKnotH(vec2 p, float seed) {
      vec4 k = fxKnot(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.003 + .022 * k.x);
    }`,
  height: 'fxKnotH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec4 fxK = fxKnot(fxF);
    vec3 fxBase = diffuseColor.rgb;
    float fxStoneN = fxF2(fxF * 9. + uFace * 3.);
    vec3 fxStone = vec3(.4, .38, .34) * (.75 + .45 * fxStoneN);
    float fxWear = smoothstep(.5, .7, fxN2(fxF * 26. + uFace)) * smoothstep(.72, 1., fxK.x);
    vec3 fxPaint = fxBase * (.82 + .2 * fxN2(fxF * 50.));
    vec3 fxTop = mix(fxPaint, fxStone * 1.25, fxWear * .85);
    float fxMid = (1. - smoothstep(.04, .1, fxK.w)) * fxK.y;
    float fxLines = (1. - smoothstep(.03, .07, abs(fxK.w - .74))) * fxK.y;
    fxTop *= 1. - max(fxMid, fxLines) * .5;
    float fxAo = smoothstep(0., .14, fxK.z);
    vec3 fxC = mix(fxStone * (.3 + .5 * fxAo), fxTop, fxK.y);
    float fxChisel = (1. - fxK.y) * (.5 + .5 * sin(dot(fxF, vec2(.8, .6)) * 300. + fxN2(fxF * 40.) * 4.));
    fxC *= 1. - fxChisel * .12;
    vec3 fxLv = fxVoronoi(fxF * 34. + uFace * 9.);
    float fxLichen = smoothstep(.62, .7, fxF2(fxF * 4. + uFace * 13.)) * (1. - smoothstep(.15, .4, fxLv.x));
    vec3 fxLichenC = fxLv.z > .5 ? vec3(.78, .66, .25) : vec3(.72, .74, .64);
    fxC = mix(fxC, fxLichenC * (.8 + .3 * fxLv.z), fxLichen * .85);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxStoneN * .0015 + fxN2(fxF * 120.) * .0004 - max(fxMid, fxLines) * .0012 + fxChisel * .0004 + fxLichen * .0006);',
  surface: 'roughnessFactor = mix(.9, mix(.5, .85, fxWear), fxK.y) + fxLichen * .1;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .04;',
};
B.celtic = {
  color: `diffuseColor.rgb *= .75 + .35 * fxF3(vLocal * 10. + vSeed);`,
  surface: 'roughnessFactor = .85;',
};

S.aztec = {
  // 아즈텍 돌 부조. 칸마다 돌을 깎아 낸 계단 피라미드가 실제로 층층이 솟아 있다(위에서 본 모습). 계단 윤곽은 돌을 쌓은 듯 각지고,
  // 꼭대기엔 동그란 해 문양을 새겼다. 층마다 면 색 안료와 맨 돌이 번갈아 드러나는데 오래돼 군데군데 벗겨졌다.
  // 칸 둘레엔 계단진 번개무늬(시칼콜리우키)가 돋을새김된 돌 테. 층 아래 구석은 그늘지고, 모서리는 깨져 새 돌빛이 난다
  head: `
    // 계단 층: x 층 번호(0이 꼭대기), y 테인지, z 테의 계단 번개무늬
    vec3 fxStep(vec2 q) {
      vec2 g = floor(q * 7. + .5) / 7.;
      float lv = min(floor((abs(g.x) + abs(g.y)) * 3.5), 4.);
      float m = max(abs(q.x), abs(q.y));
      float t = abs(q.x) > abs(q.y) ? q.y : q.x;
      float z = abs(fract(t * 2.5) - .5) * 2.;
      float fret = step((m - .84) / .16, floor(z * 4.) / 4. * .8 + .1);
      return vec3(lv, step(.84, m), fret);
    }
    float fxStepLv(vec2 q) { vec3 s = fxStep(q); return s.y > .5 ? .38 + .2 * s.z : 1. - s.x * .2; }
    float fxStepH(vec2 p, float seed) {
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + .042 * fxStepLv(p / uSticker.x));
    }`,
  height: 'fxStepH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxQa = fxQ();
    vec3 fxS = fxStep(fxQa);
    // 둘레가 더 높으면 층 아래 구석이 그늘지고, 더 낮으면 모서리가 밝게 닳았다
    float fxH0 = fxStepLv(fxQa);
    float fxAo = 0.;
    float fxLip = 0.;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * .785398;
      float hn = fxStepLv(fxQa + vec2(cos(a), sin(a)) * (i < 4 ? .07 : .13));
      fxAo += max(0., hn - fxH0) * (i < 4 ? 1. : .6);
      fxLip += max(0., fxH0 - hn) * (i < 4 ? 1. : 0.);
    }
    vec3 fxBase = diffuseColor.rgb;
    float fxStoneN = fxF2(vLocal.xy * 18. + vSeed * 7.);
    vec3 fxStone = vec3(.62, .57, .49) * (.7 + .45 * fxStoneN);
    vec3 fxPv = fxVoronoi(vLocal.xy * 40. + vSeed);
    float fxPit = (1. - smoothstep(0., .07, fxPv.x)) * step(.7, fxPv.z);
    float fxPainted = fxS.y > .5 ? fxS.z : (mod(fxS.x, 2.) < .5 ? 1. : 0.);
    vec3 fxPig = fxS.y > .5 ? fxBase * .8 : fxBase;
    float fxKeep = fxPainted * smoothstep(.28, .42, fxN2(vLocal.xy * 10. + vSeed * 3.) * .65 + fxN2(vLocal.xy * 34.) * .35);
    vec3 fxC = mix(fxStone, fxPig * (.85 + .2 * fxStoneN), fxKeep);
    fxC *= 1. - fxPit * .45;
    fxC *= 1. - clamp(fxAo * 2.2, 0., .65);
    float fxChip = clamp(fxLip * 2.5, 0., 1.) * smoothstep(.55, .7, fxN2(fxQa * 22. + vSeed * 5.));
    fxC = mix(fxC, fxStone * 1.25, clamp(fxLip * 2.5, 0., 1.) * .45);
    fxC = mix(fxC, vec3(.78, .74, .66), fxChip * .8);
    float fxR = length(fxQa);
    float fxA = atan(fxQa.y, fxQa.x);
    float fxGlyph = step(fxS.x, .5) * (1. - fxS.y) * max(1. - smoothstep(.006, .014, abs(fxR - .1)),
      (1. - smoothstep(.01, .018, abs(sin(fxA * 4.)) * fxR)) * step(.14, fxR) * step(fxR, .2));
    fxC = mix(fxC, fxC * .3, fxGlyph);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxStoneN * .0018 - fxPit * .0012 + fxKeep * .0004 - fxGlyph * .0015 - fxChip * .001);',
  surface: 'roughnessFactor = mix(.92, .72, fxKeep);',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .04;',
};
B.aztec = {
  color: `diffuseColor.rgb *= .75 + .35 * fxF3(vLocal * 14. + vSeed);`,
  surface: 'roughnessFactor = .9;',
};

S.paisley = {
  // 가죽 공예. 칸마다 면 색으로 물들인 두꺼운 가죽에 끝이 말린 페이즐리와 잎 두 장을 새겼다. 칼로 그은 윤곽선이 패였고,
  // 윤곽 바깥은 도구로 눌러 내려앉혀 무늬가 도톰하게 솟았다. 무늬 안쪽엔 작은 페이즐리와 잎맥 홈, 점 찍개 자국,
  // 바탕엔 바구니 결 도장을 촘촘히 찍었다. 가장자리를 따라 접어 누른 선과 밀랍 먹인 실로 꿰맨 땀. 패인 데마다 짙은
  // 안티크 물감이 배어 들었고 솟은 데는 손때로 반들거린다
  head: `
    // 페이즐리 모양의 거리(안쪽이 음수)
    float fxPais(vec2 p) {
      float head = length(p - vec2(0., -.18)) - .34;
      float y = p.y + .18;
      float cx = .55 * y * y;
      float w = .34 * (1. - clamp(y / .72, 0., 1.));
      float tail = (abs(p.x - cx) - w) * step(0., y) + 9. * step(y, 0.) + step(.72, y) * 9.;
      return min(head, tail);
    }
    // 잎 두 장의 거리(안쪽이 음수)와 잎맥까지 거리
    vec2 fxLeaf(vec2 p) {
      vec2 a = fxRot(.7) * (p - vec2(.5, -.5));
      vec2 b = fxRot(-.5) * (p - vec2(-.52, .46));
      float da = (length(a / vec2(.2, .085)) - 1.) * .085;
      float db = (length(b / vec2(.17, .075)) - 1.) * .075;
      return da < db ? vec2(da, abs(a.y)) : vec2(db, abs(b.y));
    }
    float fxPaisH(vec2 p, float seed) {
      vec2 qp = fxRot((fxH1(seed * 4.) - .5) * 1.2) * (p / uSticker.x) * .95;
      float d = min(fxPais(qp), fxLeaf(qp).x);
      float d2 = fxPais(qp * 1.6 + vec2(.04, .12));
      float motif = 1. - smoothstep(-.06, 0., d);
      float dome = smoothstep(0., .25, -d);
      float cut = 1. - smoothstep(0., .035, abs(d));
      float bevel = (1. - smoothstep(0., .16, d)) * step(0., d);
      float cut2 = (1. - smoothstep(0., .03, abs(d2))) * motif;
      float e = fxEdgeAt(p) / uSticker.x;
      float crease = 1. - smoothstep(0., .03, abs(e - .16));
      float h = .012 + motif * (.008 + .009 * dome) - bevel * .007 - cut * .008 - cut2 * .005 - crease * .004;
      return smoothstep(0., .05, fxEdgeAt(p)) * h;
    }`,
  height: 'fxPaisH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxQp = fxRot((fxH1(vSeed * 4.) - .5) * 1.2) * fxQ() * .95;
    vec2 fxLf = fxLeaf(fxQp);
    float fxD = min(fxPais(fxQp), fxLf.x);
    float fxD2 = fxPais(fxQp * 1.6 + vec2(.04, .12));
    float fxIn = 1. - smoothstep(-.004, .004, fxD);
    float fxInner = 1. - smoothstep(-.004, .004, fxD2);
    float fxCut = 1. - smoothstep(.004, .014, abs(fxD));
    float fxCut2 = (1. - smoothstep(.003, .011, abs(fxD2))) * fxIn;
    float fxBev = (1. - smoothstep(0., .16, fxD)) * step(0., fxD);
    float fxVeinL = (1. - smoothstep(.004, .01, fxLf.y)) * (1. - smoothstep(-.004, .004, fxLf.x));
    vec3 fxGr = fxVoronoi(vLocal.xy * 90. + vSeed * 5.);
    float fxGrain = smoothstep(0., .25, fxGr.y);
    float fxE = fxEdge() / uSticker.x;
    vec2 fxBw = vLocal.xy / uSticker.x * 7.;
    vec2 fxBc = floor(fxBw);
    vec2 fxBf = fract(fxBw);
    float fxWeave = .5 + .5 * sin((mod(fxBc.x + fxBc.y, 2.) < .5 ? fxBf.x : fxBf.y) * 18.85);
    float fxStamp = fxWeave * (1. - fxIn) * (1. - fxBev * .8) * step(.2, fxE);
    float fxCrease = 1. - smoothstep(.004, .011, abs(fxE - .16));
    float fxTt = abs(fxQ().x) > abs(fxQ().y) ? fxQ().y : fxQ().x;
    float fxThread = (1. - smoothstep(.01, .018, abs(fxE - .085))) * step(.38, fract(fxTt * 13.));
    float fxHole = (1. - smoothstep(.01, .02, length(vec2((fract(fxTt * 13.) - .19) / 13., fxE - .085)))) * (1. - fxThread);
    vec2 fxDg = fract(fxQp * 9.) - .5;
    float fxSeeder = (1. - smoothstep(.1, .17, length(fxDg))) * fxIn * (1. - fxInner) * step(-.004, -fxPais(fxQp));
    float fxVein = fxInner * smoothstep(.55, .9, .5 + .5 * sin(fxD2 * 140.));
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxLeather = fxBase * (.9 + .08 * fxGrain) * (.88 + .16 * fxN2(vLocal.xy * 12. + vSeed * 4.));
    vec3 fxDark = fxBase * vec3(.3, .24, .2);
    float fxAntique = max(max(fxCut, fxCut2), max(fxBev * .65, fxStamp * .45));
    fxAntique = max(fxAntique, max(max(fxSeeder, fxVein), max(fxVeinL, fxCrease)) * .8);
    fxAntique = max(fxAntique, fxHole);
    vec3 fxC = mix(fxLeather * (1. + .3 * fxIn * smoothstep(0., .2, -fxD)), fxDark, fxAntique);
    fxC = mix(fxC, vec3(.86, .8, .64), fxThread);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxGrain * .00025 - fxStamp * .0009 - fxSeeder * .0012 - fxVein * .001 - fxCut2 * .001 - fxVeinL * .001 + fxThread * .001 - fxHole * .001);',
  surface: 'roughnessFactor = mix(.5, .82, fxAntique) - fxIn * .1 - fxThread * .1;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .04;',
};
B.paisley = {
  // 가죽 가장자리를 꿰맨 실과 가죽 단면
  color: `diffuseColor.rgb *= .75 + .3 * fxN3(vLocal * 40. + vSeed);`,
  surface: 'roughnessFactor = .7;',
};

S.kkotsal = {
  // 꽃살문. 절집 법당 문짝의 나무 살. 비스듬한 빗살 두 방향과 곧게 선 솟을살이 엇갈려 짜였고, 살이 만나는 자리마다
  // 꽃을 깎아 붙였다(여섯 갈래로 만나는 데는 여덟 잎 꽃, 네 갈래엔 네 잎 꽃, 가운데엔 금빛 꽃술). 살과 꽃은 실제로 솟았고
  // 그 뒤로 창호지가 깊이 물러앉아 안쪽 등불빛이 은은히 비친다. 살엔 면 색 단청을 칠했는데 모서리는 닳아 나뭇결이 드러났다
  head: `
    // 꽃살: x 높이, y 종류(0 창호지, 1 살, 2 꽃잎, 3 꽃술), z 꽃 중심에서(꽃 반지름이 1), w 살·꽃 가장자리까지 거리(창호지 쪽 양수)
    vec4 fxKkot(vec2 q) {
      vec2 u = q * 1.25;
      float a = u.x + u.y, b = u.x - u.y;
      float da = abs(a - floor(a + .5)) * .7071;
      float db = abs(b - floor(b + .5)) * .7071;
      float dv = abs(u.x - floor(u.x + .5));
      float w = .115;
      float wv = .09;
      float edge = min(min(da - w, db - w), dv - wv);
      float bar = 1. - smoothstep(-.015, 0., edge);
      float prof = max(max(sqrt(max(0., 1. - da * da / (w * w))), sqrt(max(0., 1. - db * db / (w * w)))), sqrt(max(0., 1. - dv * dv / (wv * wv))));
      vec2 ab = vec2(floor(a + .5), floor(b + .5));
      vec2 c = vec2(ab.x + ab.y, ab.x - ab.y) * .5;
      vec2 d = u - c;
      float big = step(abs(c.x - floor(c.x + .5)), .01);
      float r = length(d);
      float ang = atan(d.y, d.x) + (big > .5 ? 0. : .785398);
      float pn = big > .5 ? 8. : 4.;
      float R0 = big > .5 ? .36 : .22;
      float R = R0 * (.8 + .2 * cos(ang * pn));
      float rr = r / R;
      float flower = 1. - smoothstep(.93, 1., rr);
      float heart = 1. - smoothstep(.3, .36, r / R0);
      float petal = (1. - rr * .5) - .25 * (1. - cos(ang * pn)) * rr;
      float h = max(bar * (.55 + .3 * prof), flower * (1. + .35 * petal + .2 * heart));
      float kind = flower > .5 ? (heart > .5 ? 3. : 2.) : (bar > .5 ? 1. : 0.);
      return vec4(h, kind, rr, min(edge, r - R));
    }
    float fxKkotH(vec2 p, float seed) {
      return smoothstep(0., .05, fxEdgeAt(p)) * (.002 + .022 * fxKkot(p / uSticker.x).x);
    }`,
  height: 'fxKkotH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxQk = fxQ();
    vec4 fxK = fxKkot(fxQk);
    vec3 fxBase = diffuseColor.rgb;
    float fxPaperK = fxK.y < .5 ? 1. : 0.;
    float fxFib = fxN2(vLocal.xy * vec2(60., 200.)) * .5 + fxN2(vLocal.xy * 300.) * .5;
    vec3 fxPaper = vec3(.78, .72, .6) * (.9 + .12 * fxFib);
    float fxShade = smoothstep(0., .12, fxK.w);
    fxPaper *= .45 + .55 * fxShade;
    float fxGrain = fxN2(vec2(dot(fxQk, vec2(.7071, .7071)) * 4., dot(fxQk, vec2(-.7071, .7071)) * 90.));
    vec3 fxWood = vec3(.42, .28, .17) * (.75 + .4 * fxGrain);
    float fxWear = smoothstep(.62, .8, fxN2(fxQk * 9. + vSeed * 7.) * .7 + fxK.x * .35);
    vec3 fxPaint = fxBase * (.85 + .15 * fxGrain);
    vec3 fxPetal = mix(fxBase, vec3(1.), .35) * (.9 + .15 * (1. - fxK.z));
    vec3 fxC = fxPaper;
    if (fxK.y > .5) fxC = mix(fxPaint, fxWood, fxWear * .8);
    if (fxK.y > 1.5) fxC = mix(fxPetal, fxWood, fxWear * .6);
    if (fxK.y > 2.5) fxC = vec3(.85, .62, .2) * (.85 + .2 * fxN2(fxQk * 60.));
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxGrain * .0006 * (1. - fxPaperK) + fxFib * .0003 * fxPaperK);',
  surface: 'roughnessFactor = mix(.7, .95, fxPaperK) - fxWear * .1;',
  emissive: 'totalEmissiveRadiance = vec3(1., .75, .42) * fxPaperK * (.12 + .12 * fxShade) + diffuseColor.rgb * .03;',
};

B.kkotsal = {
  color: `diffuseColor.rgb *= .75 + .35 * fxN2(vec2(fxBodyUV().x * 3. + vSeed * 9., fxBodyUV().y * 50.));`,
  surface: 'roughnessFactor = .7;',
};

S.guilloche = {
  // 기요셰 에나멜. 칸마다 은판을 선반으로 깎아 낸 촘촘한 결 위에 투명한 유리질 에나멜을 녹여 덮었다(파베르제 공방 식).
  // 에나멜이 고인 골은 짙고 솟은 결은 은빛이 비쳐, 보는 각도에 따라 무늬가 물결처럼 아른거린다. 결은 면마다 다르다
  // (햇살, 물결, 보리알, 바구니, 동심원, 불꽃). 둘레엔 줄을 새긴 은테가 솟고 그 안쪽으로 진주 알이 한 줄 박혔다
  head: `
    // 테두리 쪽: x 은테, y 진주 알(0~1 볼록함), z 에나멜 자리
    vec3 fxGuiRim(vec2 q) {
      float m = max(abs(q.x), abs(q.y));
      float bez = smoothstep(.89, .92, m);
      float t = abs(q.x) > abs(q.y) ? q.y : q.x;
      float along = (fract(t * 8. + .5) - .5) / 8.;
      float pd = length(vec2(along, m - .835));
      float pearl = sqrt(max(0., 1. - pd * pd / (.045 * .045)));
      float enamel = 1. - smoothstep(.77, .79, m);
      return vec3(bez, pearl, enamel);
    }
    float fxGuiH(vec2 p, float seed) {
      vec2 q = p / uSticker.x;
      vec3 g = fxGuiRim(q);
      float m = max(abs(q.x), abs(q.y));
      return smoothstep(0., .05, fxEdgeAt(p)) * (.008 + g.z * .006 * (1. - m * m) + g.x * .012 + g.y * .016);
    }
    // 선반으로 깎은 결(0 골 ~ 1 마루)
    float fxTurn(vec2 q, float face) {
      float r = length(q), a = atan(q.y, q.x);
      if (face < .5) return .5 + .5 * sin(a * 48. + sin(r * 18.) * .6);
      if (face < 1.5) return .5 + .5 * sin(q.y * 46. + sin(q.x * 7.) * 2.2);
      if (face < 2.5) return (.5 + .5 * sin((q.x + q.y) * 38.)) * (.5 + .5 * sin((q.x - q.y) * 38.));
      if (face < 3.5) { vec2 c = floor(q * 3.); return .5 + .5 * sin((mod(c.x + c.y, 2.) > .5 ? q.x : q.y) * 60.); }
      if (face < 4.5) return .5 + .5 * sin(r * 60. + sin(a * 6.) * .8);
      return .5 + .5 * sin(a * 24. + r * 30.);
    }`,
  height: 'fxGuiH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxQg = fxQ();
    vec3 fxG = fxGuiRim(fxQg);
    float fxT = fxTurn(fxQg * 1.3, uFace);
    vec3 fxBase = diffuseColor.rgb;
    float fxEn = fxG.z * (1. - fxG.x);
    float fxPearl = step(.02, fxG.y) * (1. - fxG.x);
    float fxSilver = (1. - fxEn) * (1. - fxPearl);
    float fxKnurl = .5 + .5 * sin((abs(fxQg.x) > abs(fxQg.y) ? fxQg.y : fxQg.x) * 140.);
    vec3 fxC = fxBase * (.42 + .5 * fxT);
    fxC = mix(fxC, vec3(.86, .87, .9) * (.85 + .15 * fxKnurl * fxG.x), fxSilver);
    fxC = mix(fxC, vec3(.95, .92, .86) * (.9 + .1 * fxG.y), fxPearl);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxKnurl * fxG.x * .0006);',
  surface: 'roughnessFactor = mix(mix(.03, .18, fxSilver), .3, fxPearl); metalnessFactor = fxSilver;',
  emissive: `
    float fxFrG = fxFresnel(normal, 2.);
    vec3 fxPearlIr = .5 + .5 * cos(6.2832 * (fxFrG * .7 + vec3(0., .33, .67)));
    totalEmissiveRadiance = fxBase * fxT * fxEn * (.12 + .35 * fxFrG) + mix(vec3(1.), fxPearlIr, .3) * fxPearl * fxFrG * .2;`,
};

B.guilloche = {
  surface: 'roughnessFactor = .25; metalnessFactor = .9;',
};

S.quilt = {
  // 퀼팅 새틴. 다 맞추면 면 하나가 마름모로 누빈 새틴 한 장이다. 박음질 사이의 마름모가 실제로 도톰하게 부풀고,
  // 박음질 골엔 땀이 점점이 박혀 천이 당겨지며 잔주름이 진다. 새틴은 결 따라 빛이 길게 미끄러진다
  head: `
    // 누빔: x 부풂(0 박음질 골 ~ 1 가운데), y 골까지 거리, z 칸 번호
    vec3 fxQuilt(vec2 F) {
      vec2 r = fxRot(.785398) * F * 3.4;
      vec2 f = fract(r) - .5;
      float e = .5 - max(abs(f.x), abs(f.y));
      return vec3(sqrt(clamp(e / .5, 0., 1.)), e, fxH2(floor(r)));
    }
    float fxQuiltH(vec2 p, float seed) {
      return smoothstep(0., .05, fxEdgeAt(p)) * (.003 + .03 * fxQuilt(aHome.xy + p * aHome.z).x);
    }`,
  height: 'fxQuiltH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec3 fxQq = fxQuilt(fxF);
    vec3 fxBase = diffuseColor.rgb;
    vec2 fxR = fxRot(.785398) * fxF * 3.4;
    vec2 fxFr = fract(fxR) - .5;
    bool fxVert = abs(fxFr.x) > abs(fxFr.y);
    float fxAlong = fxVert ? fxR.y : fxR.x;
    float fxStitch = (1. - smoothstep(.012, .02, fxQq.y)) * step(.45, fract(fxAlong * 9.));
    float fxPull = 1. - smoothstep(0., .18, fxQq.y);
    float fxWrinkle = fxPull * (.5 + .5 * sin((fxVert ? fxFr.y : fxFr.x) * 70. + fxN2(fxR * 4.) * 3.));
    vec3 fxC = fxBase * (.55 + .45 * fxQq.x) * (1. - fxWrinkle * .12);
    fxC = mix(fxC, mix(fxBase, vec3(1.), .55), fxStitch);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, -fxWrinkle * .0012 + fxStitch * .0005 + fxN2(vLocal.xy * 500.) * .0002);',
  surface: 'roughnessFactor = mix(.22, .5, fxPull);',
  emissive: `
    vec2 fxUp = -fxDown();
    float fxSheen = pow(abs(dot(vec2(.7071, .7071), fxUp)), 4.);
    totalEmissiveRadiance = mix(fxBase, vec3(1.), .3) * fxQq.x * fxFresnel(normal, 1.5) * (.25 + .35 * fxSheen);`,
};

B.quilt = {
  color: `diffuseColor.rgb *= .85 + .2 * fxN3(vLocal * 60. + vSeed);`,
  surface: 'roughnessFactor = .6;',
};

S.lantern = {
  // 모로코 놋쇠 등. 칸마다 망치로 두드린 놋쇠판에 별과 물방울 모양 구멍을 뚫었고, 구멍 뒤 색유리로 안쪽 불빛이 새어 나와 일렁인다.
  // 가운데 여덟 꼭지 별, 그 둘레 물방울 여덟, 바깥 고리의 작은 구멍 열여섯, 네 귀퉁이엔 이웃 칸과 이어지는 별 조각.
  // 구멍 둘레는 두드려 솟게 했고 판엔 망치 자국이 촘촘하며, 오목한 데는 거뭇하다. 새어 나오는 유리 빛이 곧 면 색
  head: `
    // 뚫린 구멍까지 거리(구멍 안이 음수)
    float fxLantD(vec2 q) {
      vec2 r = fxRot(.785398) * q;
      float d = min(max(abs(q.x), abs(q.y)), max(abs(r.x), abs(r.y))) - .19;
      float a = atan(q.y, q.x);
      float k = (floor(a / .785398) + .5) * .785398;
      vec2 p = vec2(dot(q, vec2(cos(k), sin(k))), dot(q, vec2(-sin(k), cos(k))));
      float tail = max(abs(p.y) - .07 * clamp((p.x - .28) / .18, 0., 1.), .28 - p.x);
      d = min(d, min(length(p - vec2(.46, 0.)) - .07, max(tail, p.x - .46)));
      float ka = floor(a / .392699 + .5) * .392699;
      d = min(d, length(q - .66 * vec2(cos(ka), sin(ka))) - .028);
      vec2 c = q - vec2(q.x < 0. ? -1. : 1., q.y < 0. ? -1. : 1.);
      vec2 cr = fxRot(.785398) * c;
      d = min(d, min(max(abs(c.x), abs(c.y)), max(abs(cr.x), abs(cr.y))) - .2);
      return d;
    }
    float fxLantH(vec2 p, float seed) {
      float d = fxLantD(p / uSticker.x);
      float hole = 1. - smoothstep(-.01, .01, d);
      float lip = exp(-max(d, 0.) * 28.);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.012 + .008 * lip - .014 * hole);
    }`,
  height: 'fxLantH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxQl = fxQ();
    float fxD = fxLantD(fxQl);
    float fxHole = 1. - smoothstep(-.006, .004, fxD);
    float fxLip = exp(-max(fxD, 0.) * 28.);
    vec3 fxDent = fxVoronoi(vLocal.xy / uSticker.x * 4.5 + vSeed * 9.);
    float fxHam = smoothstep(.05, .7, fxDent.x);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxBrass = vec3(.78, .58, .26) * (.85 + .2 * fxHam) * (.92 + .1 * fxN2(vLocal.xy * 90.)) * (1. - (1. - fxHam) * .25 * (1. - fxLip));
    diffuseColor.rgb = mix(fxBrass, fxBase * .3, fxHole);`,
  normal: 'normal = fxBump(normal, fxHam * .0035 * (1. - fxHole));',
  surface: 'roughnessFactor = mix(.25, .45, 1. - fxHam) - fxLip * .1; metalnessFactor = 1. - fxHole;',
  emissive: `
    float fxFlick = .85 + .15 * sin(uTime * 7. + vSeed * 20.) * sin(uTime * 3.1 + vSeed * 5.);
    float fxGlassN = fxN2(vLocal.xy * 40. + vSeed * 3.);
    totalEmissiveRadiance = fxBase * fxBase * fxHole * (1.1 + .6 * fxGlassN) * fxFlick
      + vec3(1., .7, .35) * fxLip * (1. - fxHole) * .1 * fxFlick;`,
};

B.lantern = {
  color: `diffuseColor.rgb *= .8 + .3 * fxN3(vLocal * 40. + vSeed);`,
  surface: 'roughnessFactor = .4; metalnessFactor = .6;',
};

S.carpet = {
  // 페르시아 양탄자. 다 맞추면 면 하나가 손으로 맨 양탄자 한 장이다. 가운데 꽃잎 테를 두른 메달리온과 그 속 작은 메달리온,
  // 네 귀퉁이의 조각, 바탕에 흩은 잔꽃, 겹 테두리와 그 안을 따라 도는 꽃. 털 한 올이 매듭 하나라 무늬가 잘게 계단지고,
  // 무늬 윤곽은 털을 깎아 실제로 패였다. 천연 염료라 줄마다 색이 조금씩 다르다(아브라시). 바탕이 곧 면 색
  head: `
    // 양탄자 무늬: x 색 번호(0 바탕, 1 메달리온, 2 상아, 3 테두리 바탕, 4 금빛 꽃, 5 짙은 테, 6 잔꽃), y 무늬 윤곽까지 거리
    vec2 fxRug(vec2 F) {
      vec2 A = abs(F);
      float m = max(A.x, A.y);
      float ang = atan(F.y, F.x);
      float id = 0.;
      float d = min(min(abs(m - .94), abs(m - .9)), min(abs(m - .72), abs(m - .68)));
      if (m > .94) id = 5.;
      else if (m > .9) id = 2.;
      else if (m > .72) {
        id = 3.;
        float t = A.x > A.y ? F.y : F.x;
        vec2 g = vec2((fract(t * 3. + .5) - .5) / 3., m - .81);
        float rr = length(g * vec2(1., 1.2));
        float ros = rr - (.05 + .012 * cos(atan(g.y, g.x) * 6.));
        d = min(d, abs(ros));
        if (ros < 0.) id = rr < .018 ? 1. : 4.;
      } else if (m > .68) id = 5.;
      else {
        float s = A.x + A.y * 1.2;
        float med = s - (.46 + .05 * cos(ang * 12.));
        float core = s - (.2 + .03 * cos(ang * 8.));
        float sp = (.68 - A.x) + (.68 - A.y) - (.3 + .03 * cos(atan(.68 - A.y, .68 - A.x) * 10.));
        d = min(d, min(abs(med), min(abs(core), abs(sp))));
        vec2 g = fract(F * 4.5 + .5) - .5;
        float fl = length(g) - (.08 + .03 * cos(atan(g.y, g.x) * 5.));
        if (med < 0.) id = core < 0. ? 2. : 1.;
        else if (sp < 0.) id = 1.;
        else if (fl < 0.) id = 6.;
        if (med < 0. && core > 0.) { vec2 g2 = fract(F * 9. + .5) - .5; if (length(g2) < .12) id = 4.; }
      }
      return vec2(id, d);
    }
    float fxRugH(vec2 p, float seed) {
      vec2 r = fxRug(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.014 - .009 * (1. - smoothstep(0., .025, r.y)));
    }`,
  height: 'fxRugH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec2 fxKc = floor(fxF * 64.);
    vec2 fxR = fxRug((fxKc + .5) / 64.);
    vec3 fxBase = diffuseColor.rgb;
    float fxLum = dot(fxBase, vec3(.3, .59, .11));
    bool fxWarm = fxBase.r > fxBase.g * 1.4 || fxLum > .3;
    vec3 fxNavy = vec3(.05, .07, .2), fxIvory = vec3(.84, .78, .62), fxGold = vec3(.8, .56, .2), fxDark = vec3(.09, .05, .04);
    vec3 fxMed = fxWarm ? fxNavy : vec3(.55, .1, .08);
    vec3 fxC = fxBase;
    if (fxR.x > .5 && fxR.x < 1.5) fxC = fxMed;
    else if (fxR.x > 1.5 && fxR.x < 2.5) fxC = fxIvory;
    else if (fxR.x > 2.5 && fxR.x < 3.5) fxC = fxMed * 1.25;
    else if (fxR.x > 3.5 && fxR.x < 4.5) fxC = fxGold;
    else if (fxR.x > 4.5 && fxR.x < 5.5) fxC = fxDark;
    else if (fxR.x > 5.5) fxC = fxLum > .3 ? vec3(.5, .16, .1) : fxIvory;
    float fxAbrash = .9 + .14 * fxN2(vec2(uFace * 7., fxF.y * 16.));
    float fxKnot = fxH2(fxKc + uFace * 31.);
    float fxPile = fxN2(vLocal.xy * 420.) * .6 + fxN2(vLocal.xy * 900.) * .4;
    float fxCarve = 1. - smoothstep(0., .02, fxRug(fxF).y);
    fxC *= fxAbrash * (.92 + .1 * fxKnot) * (.8 + .3 * fxPile) * (1. - fxCarve * .35);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxPile * .0012 + fxKnot * .0004);',
  surface: 'roughnessFactor = .95;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * fxFresnel(normal, 2.) * .35;',
};

B.carpet = {
  color: `diffuseColor.rgb *= .8 + .3 * fxN3(vLocal * 80. + vSeed);`,
  surface: 'roughnessFactor = .95;',
};

export const SURFACES = Object.keys(S);

/** 이 질감은 시간에 따라 움직이는가. 움직이면 계속 그려야 한다. */
export const MOVING = new Set([
  'neon', 'lava', 'water', 'forest', 'space', 'candy', 'ice',
  'electric', 'flesh', 'eldritch', 'gem', 'glitch', 'pixel', 'circuit', 'aurora',
  'stained', 'najeon', 'rain', 'mercury', 'gauge', 'honey', 'clay',
  'holo', 'jelly', 'planet', 'disco',
  'fossil', 'doodle', 'ink', 'lavalamp', 'glass', 'fruit',
  'bubblewrap', 'thermal', 'kaleido', 'flip',
  'blackhole', 'opal', 'dragon',
  'nebula', 'star', 'galaxy', 'slime', 'magic', 'lantern', 'eyeball', 'viscera', 'brain', 'tesla', 'postit', 'keycap', 'potion', 'treasure', 'runestone', 'grimoire',
  'pinart', 'sequin', 'thermo', 'sand', 'soap',
  'hamster',
]);

/**
 * 재질에 질감을 끼워 넣는다. 종류는 material.userData.surface에서 그때그때 읽으므로
 * 테마를 바꿀 때는 userData.surface를 바꾸고 needsUpdate만 켜면 된다.
 */
export function wear(material, part, uniforms, face = -1) {
  material.userData.part = part;
  material.userData.surface = 'plain';
  material.customProgramCacheKey = () => `${part}:${material.userData.surface}`;
  material.onBeforeCompile = (shader) => {
    const table = part === 'body' ? B : S;
    const fx = table[material.userData.surface] ?? table.plain;
    const head = fx.head ?? '';
    // 높이 함수가 있는 질감은 스티커 겉을 실제로 솟게 하고, 그 기울기로 법선을 다시 잡는다
    const lift = fx.height
      ? `
        float fxHd = ${fx.height}(position.xy, aSeed);
        float fxHx = ${fx.height}(position.xy + vec2(.004, 0.), aSeed);
        float fxHy = ${fx.height}(position.xy + vec2(0., .004), aSeed);
        objectNormal = normalize(vec3(-(fxHx - fxHd) / .004, -(fxHy - fxHd) / .004, 1.));`
      : '';
    Object.assign(shader.uniforms, uniforms, { uFace: { value: face } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        #define FX_VERTEX
        ${UNIFORMS}
        attribute float aSeed;
        ${part === 'sticker' ? 'attribute vec3 aHome;' : '#define aHome vec3(0., 0., 1.)'}
        ${VARYINGS}
        ${NOISE}
        ${head}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        vSeed = aSeed;
        vHome = ${part === 'sticker' ? 'aHome' : 'vec3(0., 0., 1.)'};
        ${lift}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vLocal = position;
        #ifdef USE_INSTANCING
          mat3 fxIm = mat3(instanceMatrix);
        #else
          mat3 fxIm = mat3(1.);
        #endif
        vTx = normalize(normalMatrix * (fxIm * vec3(1., 0., 0.)));
        vTy = normalize(normalMatrix * (fxIm * vec3(0., 1., 0.)));
        vTz = normalize(normalMatrix * (fxIm * vec3(0., 0., 1.)));
        ${fx.height ? 'transformed.z += fxHd;' : ''}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        ${UNIFORMS}
        ${VARYINGS}
        #define aHome vHome
        ${NOISE}
        ${FRAG}
        ${head}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${fx.color ?? ''}`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\n${fx.surface ?? ''}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${fx.normal ?? ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${fx.emissive ?? ''}
        totalEmissiveRadiance += diffuseColor.rgb * uFlash;`);
  };
}

/** 겉을 실제로 솟게 하는 질감. 이 테마들은 스티커를 잘게 쪼갠 면으로 만든다. */
export const RAISED = new Set(Object.keys(S).filter((k) => S[k].height));
