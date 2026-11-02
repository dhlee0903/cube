// 테마마다 큐브 겉면에 입히는 질감. MeshStandardMaterial 셰이더 사이사이에 끼워 넣는다.
//
// vLocal   조각 안쪽 좌표. 스티커는 xy 평면(반폭 uSticker.x), 몸통은 ±0.48인 상자
// vSeed    조각(스티커)마다 다른 난수. 같은 무늬가 반복되지 않게 한다
// vTx, vTy 그 면의 가로·세로 방향(시점 공간). 법선을 기울일 때 쓴다
// uFace    스티커가 원래 어느 면 것인지(0~5). 몸통은 -1
// uTime    초      uIntro  테마를 고른 뒤 지난 초
// uCharge  방금 돌린 만큼 차올랐다 빠지는 값(0~1)
// uBlink   조각을 잡는 순간 1, 곧 0으로
// uPointer 손가락·마우스가 가리키는 곳(시점 공간). fxPtr는 같은 자리를 조각 안쪽 좌표로, fxGrav는 스티커 평면의 중력 방향
//          (둘 다 높이 함수에서도 쓸 수 있다). 손가락에 반응하는 질감은 MOVING에 넣어야 가만히 있을 때도 다시 그린다
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
// 높이 함수로 솟은 만큼(벽면이면 바닥과 꼭대기 사이 값)
varying float vLift;
// 손가락·마우스 자리(조각 안쪽 좌표)와 이 면에서 중력이 당기는 쪽
varying vec3 vPtr;
varying vec2 vGrav;
// 정점·조각 셰이더 양쪽에서 쓴다. fxPtr: 손가락 자리(조각 안쪽 좌표, 스티커 평면이 xy, z는 겉에서 떨어진 정도),
// fxGrav: 스티커 평면에서 화면 아래쪽(중력) 방향
vec3 fxPtr;
vec2 fxGrav;
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
  // 쿠션처럼 도톰한 데다 천이 부드럽게 주름진다
  float fxDrapeH(vec2 p, float seed) {
    vec2 q = p / uSticker.x;
    float e = smoothstep(0., .45, fxEdgeAt(p) / uSticker.x);
    float a = fxH1(seed * 7.) * 6.2832;
    float fold = sin(dot(q, vec2(cos(a), sin(a))) * 3.6 + fxN2(q * 1.4 + seed * 3.) * 3.);
    return smoothstep(0., .06, fxEdgeAt(p)) * (.004 + .013 * e + .004 * fold * e);
  }
  // 실 한 올의 빛: 둥근 단면 그늘, 꼬인 올, 군데군데 다른 굵기·빛깔(슬럽), 섞인 털빛(헤더). 멀리서는 고르게
  vec3 fxThread(vec3 col, vec4 w, vec2 F, float n, float aa) {
    vec2 T = (F + 1.) * n * .5;
    float id = w.x > .5 ? w.y : w.z + 500.;
    float along = w.x > .5 ? T.y : T.x;
    float across = w.x > .5 ? fract(T.x) : fract(T.y);
    float slub = .88 + .24 * fxN2(vec2(along * .35, id * 1.7));
    float ply = .5 + .5 * sin(along * 9. + across * 5. + id);
    float heather = fxN2(vec2(along * 3., id * 3.1 + across * 4.));
    float shade = mix(.32 + .68 * pow(w.w, .6), .68, aa);
    vec3 c = col * shade * mix(.84 + .22 * ply, 1., aa) * mix(slub, 1., aa);
    return c * mix(vec3(1.), mix(vec3(.93, .96, 1.), vec3(1.07, 1.02, .95), heather), 1. - aa);
  }
  float fxThreadBump(vec4 w, vec2 F, float n, float aa) {
    vec2 T = (F + 1.) * n * .5;
    float ply = .5 + .5 * sin((w.x > .5 ? T.y : T.x) * 9. + (w.x > .5 ? fract(T.x) : fract(T.y)) * 5.);
    return (pow(w.w, .6) * .0011 + ply * .0003) * (1. - aa);
  }
  // 실 위로 삐져나온 가는 잔털(1이 털)
  float fxStray(vec2 lp, float seed) {
    return (1. - smoothstep(0., .035, abs(fxN2(lp * 22. + seed * 5.) - .5))) * step(.55, fxN2(lp * 7. + 3. + seed));
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
  // 실 위로 삐져나온 가는 잔털(1이 털)
  float fxStray(vec2 lp, float seed) {
    return (1. - smoothstep(0., .035, abs(fxN2(lp * 22. + seed * 5.) - .5))) * step(.55, fxN2(lp * 7. + 3. + seed));
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

S.box = {
  // 골판지 상자. 칸마다 상자 겉면 한 장이다. 겉종이 아래로 골(물결 심지)이 줄지어 지나가 겉이 은은하게 오르내리고,
  // 종이 섬유와 재생지 티끌이 박혔다. 칸마다 찍힌 취급 표시가 다르다(위쪽 화살표 둘, 우산, 깨지는 잔, 재활용 고리).
  // 몇 칸엔 갈색 포장 테이프가 지나가 반들거리고 기포가 갇혔으며, 군데군데 눌려 찌그러지고 접힌 금이 갔다.
  // 면마다 상자 빛깔이 다르다(크라프트, 흰 상자, 색 골판지)
  head: `
    float fxBoxTape(vec2 q, float seed) {
      if (fxH1(seed * 23.) > .45) return 0.;
      bool vert = fxH1(seed * 29.) > .5;
      float c = (fxH1(seed * 31.) - .5) * .6;
      return 1. - smoothstep(.3, .32, abs((vert ? q.x : q.y) - c));
    }
    float fxBoxH(vec2 p, float seed) {
      vec2 q = p / uSticker.x;
      bool vert = fxH1(seed * 7.) > .5;
      float flute = .5 + .5 * sin((vert ? q.x : q.y) * 39.);
      float dent = smoothstep(.62, .85, fxN2(q * 2.2 + seed * 9.));
      float crease = 1. - smoothstep(0., .03, abs(dot(q, normalize(vec2(fxH1(seed * 3.) - .5, .6))) - (fxH1(seed * 5.) - .5) * 1.2));
      crease *= step(.65, fxH1(seed * 13.));
      return smoothstep(0., .05, fxEdgeAt(p)) * (.01 + .0025 * flute - .006 * dent - .004 * crease + .002 * fxBoxTape(q, seed));
    }
    float fxSegB(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0., 1.)); }
    // 취급 표시 잉크(1이 찍힌 데). k로 표시를 고른다
    float fxMark(vec2 p, float k) {
      float d = 9.;
      if (k < 1.) {
        // 위쪽 화살표 둘과 밑줄
        for (int i = 0; i < 2; i++) {
          vec2 a = p - vec2(i == 0 ? -.13 : .13, 0.);
          d = min(d, fxBox(a - vec2(0., -.05), vec2(.035, .14), 0.));
          d = min(d, max(abs(a.x) * 1.4 + (a.y - .24), -(a.y - .06)));
        }
        d = min(d, fxBox(p - vec2(0., -.25), vec2(.26, .025), 0.));
      } else if (k < 2.) {
        // 우산과 빗방울
        vec2 u = p - vec2(0., .02);
        d = min(d, max(length(u) - .23, -u.y));
        d = min(d, fxSegB(p, vec2(0., .02), vec2(0., -.2)) - .02);
        d = min(d, abs(length(p - vec2(.05, -.2)) - .05) - .018 + step(-.2, p.y) * 9.);
        for (int i = 0; i < 3; i++) d = min(d, length((p - vec2(-.2 + float(i) * .2, .32)) * vec2(1.6, 1.)) - .03);
      } else if (k < 3.) {
        // 깨지는 잔: 잔 몸통, 다리, 받침, 금
        vec2 g = p - vec2(0., .1);
        float bowl = max(length(g * vec2(1., 1.3)) - .16, g.y - .08);
        d = min(d, abs(bowl) - .022);
        d = min(d, fxSegB(p, vec2(0., -.07), vec2(0., -.25)) - .02);
        d = min(d, fxBox(p - vec2(0., -.26), vec2(.1, .02), 0.));
        d = min(d, max(fxSegB(p, vec2(-.03, .2), vec2(.02, .12)), 0.) - .012);
        d = min(d, fxSegB(p, vec2(.02, .12), vec2(-.02, .05)) - .012);
      } else {
        // 재활용 고리: 끊긴 고리 셋과 화살촉
        float a = atan(p.y, p.x);
        float r = length(p);
        float seg = fract(a / 2.0944 + .1);
        d = min(d, max(abs(r - .2) - .035, (seg > .8 ? 1. : -1.) * .1));
        for (int i = 0; i < 3; i++) {
          float aa = float(i) * 2.0944 + 1.25;
          vec2 tip = .2 * vec2(cos(aa), sin(aa));
          vec2 t = fxRot(-aa) * (p - tip);
          d = min(d, max(abs(t.y) * 1.3 + t.x - .02, -t.x - .07));
        }
      }
      // 표시는 네모 칸 안에 찍힌다
      d = min(d, abs(fxBox(p, vec2(.4), .04)) - .015);
      return 1. - smoothstep(0., .012, d);
    }`,
  height: 'fxBoxH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxQb = fxQ();
    vec3 fxBase = diffuseColor.rgb;
    bool fxVert = fxH1(vSeed * 7.) > .5;
    float fxFlute = .5 + .5 * sin((fxVert ? fxQb.x : fxQb.y) * 39.);
    float fxFib = fxN2(vLocal.xy * vec2(180., 60.) + vSeed) * .5 + fxN2(vLocal.xy * 420.) * .5;
    float fxMott = fxF2(fxQb * 3. + vSeed * 5.);
    vec3 fxC = fxBase * (.86 + .14 * fxFib) * (.9 + .16 * fxMott) * (.96 + .05 * fxFlute);
    float fxSpeck = step(.93, fxH2(floor(vLocal.xy * 260.))) * step(.5, fxN2(vLocal.xy * 40.));
    fxC = mix(fxC, fxBase * .35, fxSpeck * .6);
    float fxDent = smoothstep(.62, .85, fxN2(fxQb * 2.2 + vSeed * 9.));
    fxC *= 1. - fxDent * .1;
    vec2 fxMp = fxRot((fxH1(vSeed * 17.) - .5) * .12) * (fxQb - (vec2(fxH1(vSeed * 19.), fxH1(vSeed * 21.)) - .5) * .25);
    float fxInk = fxMark(fxMp, floor(fxH1(vSeed * 11.) * 3.999)) * (.55 + .45 * smoothstep(.3, .6, fxN2(vLocal.xy * 70. + vSeed * 3.)));
    float fxLum = dot(fxBase, vec3(.3, .59, .11));
    vec3 fxInkC = fxLum < .12 ? vec3(.92, .9, .85) : vec3(.1, .07, .05);
    fxC = mix(fxC, fxInkC, fxInk * .85);
    float fxTape = fxBoxTape(fxQb, vSeed);
    float fxBub = step(.965, fxH2(floor(vLocal.xy * 120.) + vSeed)) * fxTape;
    vec3 fxTapeC = mix(fxC, vec3(.66, .44, .2), .6) * (.95 + .08 * fxN2(vLocal.xy * vec2(8., 200.)));
    fxC = mix(fxC, fxTapeC, fxTape);
    fxC = mix(fxC, vec3(.9, .82, .7), fxBub * .5);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxFib * .0005 * (1. - fxTape) - fxSpeck * .0002 + fxBub * .0008);',
  surface: 'roughnessFactor = mix(.92, .22, fxTape);',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .05 + vec3(1., .9, .7) * fxTape * fxFresnel(normal, 3.) * .2;',
};
B.box = {
  // 상자 모서리 단면: 겉종이 사이로 물결 골이 비친다
  color: `
    vec2 fxP = fxBodyUV();
    float fxWave = .5 + .5 * sin(fxP.x * 160.);
    diffuseColor.rgb *= .75 + .3 * fxWave;`,
  normal: 'normal = fxBump(normal, fxWave * .002);',
  surface: 'roughnessFactor = .9;',
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

S.blocks = {
  // 몇 가지 색만 쓰는 게임 화면용 블록. 화면 필터가 색을 두세 단으로 줄여도 면이 갈리도록, 면마다 블록 속 그림이 다르다
  // (민무늬, 안쪽 테, 가운데 네모, 빗금, 네 칸, 가로줄). 테두리는 한쪽이 밝고 반대쪽이 어둡게 깎인 옛 게임 블록
  color: `
    vec2 fxQb = fxQ();
    vec2 fxAb = abs(fxQb);
    float fxMb = max(fxAb.x, fxAb.y);
    float fxD = 0.;
    if (uFace < .5) fxD = 0.;
    else if (uFace < 1.5) fxD = step(.34, fxMb) * step(fxMb, .56);
    else if (uFace < 2.5) fxD = step(fxMb, .3);
    else if (uFace < 3.5) fxD = step(.5, fract((fxQb.x + fxQb.y) * 1.2));
    else if (uFace < 4.5) fxD = step(0., fxQb.x * fxQb.y);
    else fxD = step(.5, fract(fxQb.y * 1.6 + .25));
    vec3 fxBc = diffuseColor.rgb;
    vec3 fxC = mix(fxBc, fxBc * .3, fxD * step(fxMb, .74));
    float fxLitE = step(0., fxQb.y - fxQb.x);
    fxC = mix(fxC, mix(fxBc * .35, min(fxBc * 1.8 + .1, vec3(1.)), fxLitE), step(.8, fxMb));
    diffuseColor.rgb = fxC;`,
  surface: 'roughnessFactor = .6;',
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

S.grass = {
  // 풀밭. 다 맞추면 면 하나가 바람에 한쪽으로 눕은 풀밭 한 뙈기다. 끝이 뾰족한 풀잎이 네 겹으로 겹쳐 누웠고, 아래 겹일수록
  // 그늘져 짙고 맨 위 잎끝은 볕을 받아 밝다. 잎은 조금씩 휘었고 가운데 잎맥이 접혀 서며, 잎마다 빛깔이 조금씩 다르다.
  // 몇 잎 끝은 말라 누렇고, 몇 잎엔 이슬이 맺혀 반짝인다. 잎 사이 깊은 곳엔 마른 풀과 흙이 비친다. 풀 덤불이 실제로 봉긋하다.
  // 면마다 풀이 다르다(잔디, 가을 억새빛, 푸른 김의털, 붉은 띠, 보랏빛 수크령, 서리 내린 풀)
  head: `
    // 맨 위에 보이는 풀잎: x 잎 끝 쪽(0 뿌리 ~ 1 끝), y 잎마다 난수, z 잎맥에서 가장자리까지(-1~1), w 잎 층(-1 잎 없음, 0 아래 ~ 3 위)
    vec4 fxBlades(vec2 F) {
      vec4 best = vec4(0., 0., 0., -1.);
      float top = -1.;
      for (int L = 0; L < 4; L++) {
        float fl = float(L);
        vec2 g = F * (7. + fl * 1.5) + fl * 17.3 + uFace * 5.;
        vec2 cell = floor(g);
        for (int dy = -3; dy <= 0; dy++) {
          for (int dx = -2; dx <= 2; dx++) {
            vec2 c = cell + vec2(float(dx), float(dy));
            float h = fxH2(c + fl * 3.1);
            vec2 root = c + vec2(fxH2(c + 1.7), fxH2(c + 9.2));
            float ang = 1.5708 + (h - .5) * .9 + .3 * sin(c.x * .45 + fl * 1.7);
            vec2 dir = vec2(cos(ang), sin(ang));
            vec2 rel = g - root;
            float len = 1.5 + 1.2 * fxH2(c + 4.4);
            float t = dot(rel, dir) / len;
            if (t < 0. || t > 1.) continue;
            float bend = (fxH2(c + 6.6) - .5) * .9;
            float perp = dot(rel, vec2(-dir.y, dir.x)) - bend * t * t * len * .5;
            float w = .3 * pow(1. - t, .6) + .01;
            float z = fl + t * .9;
            if (abs(perp) < w && z > top) { top = z; best = vec4(t, h, perp / w, fl); }
          }
        }
      }
      return best;
    }
    float fxGrassH(vec2 p, float seed) {
      vec2 F = aHome.xy + p * aHome.z;
      return smoothstep(0., .06, fxEdgeAt(p)) * (.008 + .014 * fxF2(F * 4. + uFace) + .006 * smoothstep(0., .4, fxEdgeAt(p) / uSticker.x));
    }`,
  height: 'fxGrassH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec4 fxB = fxBlades(fxF);
    vec3 fxBase = diffuseColor.rgb;
    float fxOn = step(0., fxB.w);
    vec3 fxThatch = mix(vec3(.14, .1, .05), vec3(.4, .32, .18), fxN2(fxF * 90.)) * (.5 + .5 * fxN2(fxF * 25.));
    vec3 fxLeaf = mix(fxBase, fxBase * vec3(1.12, 1.08, .7), fxB.y * .6);
    fxLeaf = mix(fxLeaf, vec3(.78, .68, .38), smoothstep(.75, 1., fxB.x) * step(.72, fract(fxB.y * 7.)) * .7);
    float fxShade = (.3 + .7 * (fxB.w + fxB.x * .9) / 3.9) * (.6 + .4 * fxB.x);
    fxShade *= 1. + .1 * sign(fxB.z) * (1. - abs(fxB.z));
    vec3 fxC = mix(fxThatch, fxLeaf * fxShade * 1.35, fxOn);
    float fxDew = fxOn * step(2.5, fxB.w) * step(.78, fract(fxB.y * 13.)) * (1. - smoothstep(.08, .14, length(vec2((fxB.x - .62) * .5, fxB.z * .1))));
    fxC = mix(fxC, fxC * .6 + .25, fxDew * .5);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxOn * (fxB.w * .0012 + (1. - abs(fxB.z)) * .0005) + fxDew * .0008);',
  surface: 'roughnessFactor = mix(.95, .5, fxOn) - fxDew * .4;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * fxOn * fxB.x * .05 + vec3(1.) * fxDew * fxFresnel(normal, 1.5) * .5;',
};

B.grass = {
  color: `diffuseColor.rgb *= .75 + .35 * fxN3(vLocal * 40. + vSeed);`,
  surface: 'roughnessFactor = .95;',
};

S.soil = {
  // 흙. 다 맞추면 면 하나가 갓 갈아엎은 밭 한 뙈기다. 크고 작은 흙덩이가 둥글둥글 실제로 솟았고, 덩이 사이 틈은 깊고 어둡다.
  // 덩이마다 고운 흙 알갱이가 뭉쳐 오돌토돌하고, 반짝이는 모래알과 잔돌이 섞였다. 가는 실뿌리가 기어가고, 물기 먹은 자리는
  // 짙게 젖어 번들거린다. 면마다 흙이 다르다(검은 부엽토, 갈색 밭흙, 붉은 황토, 누런 모래흙, 잿빛 점토, 흰 마사토)
  head: `
    // 흙덩이: x 높이, y 틈 바닥 정도, z 덩이마다 난수
    vec3 fxClod(vec2 F) {
      vec2 w = F + (vec2(fxN2(F * 3. + uFace), fxN2(F * 3. + 7. + uFace)) - .5) * .3;
      vec3 a = fxVoronoi(w * 4.2 + uFace * 3.);
      vec3 b = fxVoronoi(w * 10. + uFace * 7.);
      float big = (1. - smoothstep(.15, .8, a.x)) * smoothstep(0., .18, a.y) * (.65 + .35 * a.z);
      float small = (1. - smoothstep(.1, .7, b.x)) * smoothstep(0., .14, b.y) * (.35 + .25 * b.z);
      float h = max(big, small) + .18 * fxF2(F * 14. + uFace);
      return vec3(h, 1. - smoothstep(.05, .3, h), big > small ? a.z : b.z);
    }
    float fxSoilH(vec2 p, float seed) {
      vec3 c = fxClod(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + .024 * c.x);
    }`,
  height: 'fxSoilH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec3 fxCl = fxClod(fxF);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxGr = fxVoronoi(fxF * 110. + uFace);
    float fxGrain = sqrt(max(0., smoothstep(0., .25, fxGr.y)));
    float fxCrumb = fxGrain * .6 + fxN2(fxF * 300.) * .4;
    vec3 fxC = fxBase * (.5 + .6 * fxCl.x) * (.75 + .35 * fxCrumb) * (.88 + .24 * fxGr.z) * (.92 + .16 * fxCl.z);
    fxC *= 1. - fxCl.y * .6;
    fxC = mix(fxC, vec3(.86, .83, .76), step(.97, fxGr.z) * fxGrain * .5);
    vec3 fxPb = fxVoronoi(fxF * 9. + uFace * 11.);
    float fxPr = .18 + .1 * fract(fxPb.z * 7.);
    float fxPebble = step(.88, fxPb.z) * (1. - smoothstep(fxPr - .03, fxPr, fxPb.x));
    float fxPd = fxPebble * sqrt(max(0., 1. - pow(fxPb.x / fxPr, 2.)));
    vec3 fxPc = mix(vec3(.55, .52, .48), vec3(.72, .62, .5), fract(fxPb.z * 13.)) * (.55 + .55 * fxPd) * (.85 + .3 * fxN2(fxF * 140.));
    fxC = mix(fxC, fxPc, fxPebble);
    float fxRoot = (1. - smoothstep(0., .006, abs(fxF2(fxF * 3. + uFace * 5.) - .5))) * smoothstep(.55, .7, fxN2(fxF * 3. + 9.));
    fxC = mix(fxC, vec3(.55, .45, .32) * (.7 + .3 * fxCl.x), fxRoot * .7);
    float fxWet = smoothstep(.6, .8, fxF2(fxF * 1.4 + uFace * 2.));
    fxC *= 1. - fxWet * .35;
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxCrumb * .0015 + fxPd * .002 + fxRoot * .0004);',
  surface: 'roughnessFactor = mix(.98, .5, fxWet) - fxPebble * .2;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03;',
};

B.soil = {
  color: `diffuseColor.rgb *= .8 + .3 * fxN3(vLocal * 60. + vSeed);`,
  surface: 'roughnessFactor = .8;',
};

S.timber = {
  // 통나무 단면. 칸마다 통나무를 톱으로 잘라 낸 마구리 한 토막이다. 칸 밖에 있는 나무 한가운데(수)를 두르는 나이테가
  // 밝고 넓은 봄 나무와 짙고 좁은 여름 나무로 번갈아 들어찼고, 속은 짙은 심재, 바깥은 옅은 변재다. 가운데에서 바깥으로
  // 가는 방사 조직이 비치고, 마르면서 갈라진 금이 실제로 깊게 패였다. 둥근 톱 자국이 희미하게 남았다.
  // 면마다 나무가 다르다(단풍, 참나무, 벚나무, 호두나무, 흑단, 바랜 유목)
  head: `
    // 마구리: x 나이테 위상, y 수까지 거리, z 갈라진 금
    vec3 fxEnd(vec2 q, float seed) {
      vec2 pith = (vec2(fxH1(seed * 3.), fxH1(seed * 5.)) - .5) * 3.4;
      vec2 d = q - pith;
      float r = length(d);
      float a = atan(d.y, d.x);
      float ring = r * 9. + .25 * fxN2(vec2(a * 3., r * 2.) + seed) + .1 * sin(a * 5. + seed * 7.);
      float crack = 0.;
      for (int i = 0; i < 3; i++) {
        float ca = fxH1(seed * 7. + float(i)) * 6.2832;
        float da = abs(mod(a - ca + 3.1416, 6.2832) - 3.1416) * r;
        float w = (.008 + .02 * fxH1(seed * 11. + float(i))) * (.4 + .6 * smoothstep(.3, 2.5, r));
        crack = max(crack, (1. - smoothstep(w * .3, w, da + (fxN2(vec2(r * 9., float(i))) - .5) * .02)) * step(.3, fxH1(seed * 13. + float(i))));
      }
      return vec3(ring, r, crack);
    }
    float fxTimberH(vec2 p, float seed) {
      vec3 e = fxEnd(p / uSticker.x, seed);
      float late = smoothstep(.75, .95, fract(e.x));
      return smoothstep(0., .05, fxEdgeAt(p)) * (.012 - .002 * late - .012 * e.z);
    }`,
  height: 'fxTimberH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxQt = fxQ();
    vec3 fxE = fxEnd(fxQt, vSeed);
    vec3 fxBase = diffuseColor.rgb;
    float fxLate = smoothstep(.72, .95, fract(fxE.x)) * (1. - smoothstep(.97, 1., fract(fxE.x)));
    float fxHeart = 1. - smoothstep(1.4, 2.2, fxE.y);
    vec3 fxC = fxBase * mix(1.1, .78, fxHeart) * (1. - fxLate * .38);
    float fxRay = (1. - smoothstep(0., .02, abs(fract(atan(fxQt.y - (fxH1(vSeed * 5.) - .5) * 3.4, fxQt.x - (fxH1(vSeed * 3.) - .5) * 3.4) * 40.) - .5))) * .5;
    fxC *= 1. - fxRay * .08;
    float fxPore = step(.86, fxH2(floor(vLocal.xy * 380.))) * (1. - fxLate) * .25;
    fxC *= 1. - fxPore;
    float fxSaw = .5 + .5 * sin(length(fxQt - vec2(3.5, -1.)) * 70.);
    fxC *= .96 + .05 * fxSaw;
    fxC = mix(fxC, vec3(.05, .03, .02), fxE.z);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, -fxLate * .0008 + fxSaw * .0003 - fxE.z * .002 - fxPore * .002);',
  surface: 'roughnessFactor = mix(.75, .9, fxLate);',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .04;',
};

B.timber = {
  // 몸통은 나무껍질: 세로로 갈라진 골
  color: `
    vec2 fxP = fxBodyUV();
    float fxBark = fxN2(vec2(fxP.x * 30. + vSeed * 9., fxP.y * 4.));
    diffuseColor.rgb *= .6 + .6 * fxBark;`,
  normal: 'normal = fxBump(normal, fxBark * .004);',
  surface: 'roughnessFactor = .95;',
};

S.pebble = {
  // 조약돌. 다 맞추면 면 하나가 냇가 자갈밭 한 뙈기다. 물살에 닳아 동글납작해진 돌이 크기와 모양이 제각각으로 실제로 볼록
  // 솟았고, 큰 돌이 작은 돌을 덮으며 겹쳐 박혔다. 돌 사이 고운 모래는 돌 그늘에 들어 짙다. 돌마다 결이 다르다: 잔점이
  // 박힌 화강암, 흰 석영 줄이 지나간 돌, 층이 진 돌, 매끈한 돌. 몇 개는 물기가 남아 짙게 번들거린다.
  // 면마다 돌이 다르다(현무암, 장미석, 황토석, 청석, 사문석, 백석)
  head: `
    // 자갈: x 돌 볼록함(0이면 모래), y 돌마다 난수, z 돌 가운데 쪽(0 가장자리 ~ 1 가운데), w 가장 가까운 돌까지(1이 돌 가장자리)
    vec4 fxPebble(vec2 F) {
      vec2 g = F * 4.2 + uFace * 5.;
      vec2 i = floor(g), f = fract(g);
      vec4 best = vec4(0., 0., 0., 9.);
      for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
          for (int k = 0; k < 2; k++) {
            vec2 c = i + vec2(float(x), float(y));
            vec2 cc = c + float(k) * 31.7;
            vec2 o = vec2(fxH2(cc), fxH2(cc + 17.3));
            float sz = .32 + .24 * fxH2(cc + 2.9) - float(k) * .1;
            vec2 ax = vec2(sz, sz * (.55 + .35 * fxH2(cc + 8.3)));
            vec2 d = fxRot(fxH2(cc + 5.1) * 3.1416) * (vec2(float(x), float(y)) + o - f);
            float r = length(d / ax) * (1. + .07 * sin(atan(d.y, d.x) * 3. + fxH2(cc) * 6.));
            best.w = min(best.w, r);
            if (r < 1.) {
              float h = pow(1. - r * r, .45) * (.55 + .45 * sz / .56);
              if (h > best.x) best.xyz = vec3(h, fxH2(cc + 41.), 1. - r);
            }
          }
        }
      }
      return best;
    }
    float fxPebbleH(vec2 p, float seed) {
      vec4 s = fxPebble(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + .028 * s.x);
    }`,
  height: 'fxPebbleH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec4 fxS = fxPebble(fxF);
    vec3 fxBase = diffuseColor.rgb;
    float fxOn = step(.0001, fxS.x);
    float fxKind = floor(fract(fxS.y * 3.7) * 4.);
    vec2 fxSp = fxRot(fxS.y * 6.2832) * fxF;
    vec3 fxStone = mix(fxBase * .72, min(fxBase * 1.25 + .04, vec3(1.)), fract(fxS.y * 5.3));
    fxStone = mix(fxStone, vec3(dot(fxStone, vec3(.33))), .15 * fract(fxS.y * 9.1));
    fxStone *= .9 + .15 * fxN2(fxSp * 30.) + .06 * fxN2(fxSp * 90.);
    if (fxKind < .5) {
      float sp1 = step(.8, fxH2(floor(fxSp * 140.)));
      float sp2 = step(.9, fxH2(floor(fxSp * 70. + 3.)));
      fxStone = mix(fxStone, fxStone * .35, sp1 * .7);
      fxStone = mix(fxStone, vec3(.9, .88, .84), sp2 * .5);
    } else if (fxKind < 1.5) {
      float v = 1. - smoothstep(0., .02 + .015 * fract(fxS.y * 17.), abs(fract(fxSp.y * 2.2 + fxN2(fxSp * 5.) * .35) - .5));
      fxStone = mix(fxStone, vec3(.94, .92, .88), v * .85);
    } else if (fxKind < 2.5) {
      fxStone *= .82 + .25 * (.5 + .5 * sin(fxSp.y * 40. + fxN2(fxSp * 6.) * 3.));
    }
    fxStone *= .7 + .4 * smoothstep(0., .5, fxS.z);
    float fxWet = step(.72, fract(fxS.y * 7.3)) * fxOn;
    fxStone *= 1. - fxWet * .3;
    vec3 fxSand = vec3(.74, .66, .52) * (.7 + .4 * fxN2(fxF * 320.)) * (.9 + .15 * fxN2(fxF * 40.));
    fxSand *= .45 + .55 * smoothstep(1., 1.45, fxS.w);
    vec3 fxC = mix(fxSand, fxStone, fxOn);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxN2(fxF * 320.) * .0007 * (1. - fxOn) + fxN2(fxF * 120.) * .0002 * fxOn);',
  surface: 'roughnessFactor = mix(.95, mix(.55, .1, fxWet), fxOn);',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03;',
};

B.pebble = {
  color: `diffuseColor.rgb *= .8 + .3 * fxN3(vLocal * 60. + vSeed);`,
  surface: 'roughnessFactor = .9;',
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
    // 지형 높이(행성마다 다르다): 지구 대륙과 산맥, 유로파 이중 능선, 화성 구덩이·협곡·방패 화산, 이오 화산 웅덩이와 산,
    // 목성·해왕성 구름 띠와 폭풍의 부푼 자리
    float fxTerrain(vec2 F) {
      vec2 S = F + vec2(uTime * .02, 0.);
      float wx = mod(S.x + 1., 2.) - 1.;
      float h = 0.;
      if (uFace < .5) {
        float yb = F.y + (fxF2(vec2(S.x * 1.3, F.y * 2.6)) - .5) * .14;
        h = .004 * sin(yb * 9.5) + .003 * fxN2(vec2(S.x * 7., F.y * 11.));
        vec2 sp = vec2(wx - .15, F.y + .3) / vec2(.3, .17);
        h += .012 * (1. - smoothstep(.6, 1.1, length(sp)));
      } else if (uFace < 1.5) {
        float e = fxF2(S * 1.1 + 7.);
        float land = smoothstep(.52, .56, e);
        float ridge = 1. - abs(2. * fxN2(S * 5. + 3.) - 1.);
        float ridge2 = 1. - abs(2. * fxN2(S * 13. + 9.) - 1.);
        h = land * (.006 + .03 * smoothstep(.56, .8, e) * (ridge * ridge * .75 + ridge2 * .25));
      } else if (uFace < 2.5) {
        float lin = 0.;
        for (int i = 0; i < 7; i++) {
          float fi = float(i);
          float ang = fxH1(fi + 3.) * 3.1416;
          vec2 n = vec2(cos(ang), sin(ang));
          float dd = dot(S, n) - (fxH1(fi * 7. + 1.) - .5) * 1.8 + sin(dot(S, vec2(-n.y, n.x)) * 1.4 + fi) * .1;
          float wid = .012 + .016 * fxH1(fi * 3.);
          lin = max(lin, (1. - smoothstep(.0, wid * 1.6, abs(abs(dd) - wid))) * (.6 + .4 * fxH1(fi + 9.)));
        }
        vec3 v = fxVoronoi(S * 6. + 5.);
        float chaos = smoothstep(.66, .72, fxN2(S * 1.1 + 2.));
        h = .012 * lin + chaos * .008 * smoothstep(.02, .08, v.y) * (.5 + v.z);
      } else if (uFace < 3.5) {
        vec3 v = fxVoronoi(S * 4. + 5.);
        float big = step(.55, v.z);
        float bowl = (1. - smoothstep(.0, .2, v.x));
        float rim = exp(-pow((v.x - .2) / .035, 2.));
        h = big * (-.016 * bowl * bowl + .009 * rim);
        vec3 v2 = fxVoronoi(S * 11. + 3.);
        h += step(.6, v2.z) * (-.005 * (1. - smoothstep(0., .18, v2.x)) + .003 * exp(-pow((v2.x - .18) / .03, 2.)));
        float cy = abs(S.y + .05 + fxN2(vec2(S.x * 2.4, 3.)) * .2 - .1);
        h -= .03 * (1. - smoothstep(.0, .06, cy));
        vec2 om = vec2(wx + .45, F.y - .35);
        float r = length(om);
        h += .045 * max(0., 1. - r / .17) - .02 * (1. - smoothstep(.02, .04, r));
        h += .004 * fxF2(S * 9.);
      } else if (uFace < 4.5) {
        vec3 v = fxVoronoi(S * 2.4 + 5.);
        float pr = .05 + .12 * fract(v.z * 7.3);
        h = -.016 * step(.35, v.z) * (1. - smoothstep(pr - .01, pr + .02, v.x)) + .006 * step(.35, v.z) * exp(-pow((v.x - pr - .03) / .03, 2.));
        vec3 m = fxVoronoi(S * 2.3 + 17.);
        h += .035 * step(.75, m.z) * smoothstep(.0, .25, m.y) * (1. - smoothstep(.1, .4, m.x));
        h += .004 * fxF2(S * 6.);
      } else {
        h = .003 * sin(F.y * 8. + fxF2(S * vec2(.8, 3.)) * 2.);
        vec2 ds = vec2(wx + .1, F.y + .2) / vec2(.28, .15);
        h -= .008 * (1. - smoothstep(.6, 1.1, length(ds)));
      }
      return h;
    }
    float fxPlanetH(vec2 p, float seed) {
      vec2 q = p / uSticker.x;
      vec2 w = 1. - pow(abs(q), vec2(8.));
      return smoothstep(0., .05, fxEdgeAt(p)) * (.016 * w.x * w.y + .03 + fxTerrain(aHome.xy + p * aHome.z));
    }`,
  height: 'fxPlanetH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    float fxHt = fxPlanetH(vLocal.xy, vSeed);
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
      fxC *= .86 + .28 * streakJ;
      float chev = smoothstep(.55, .85, fxN2(vec2(fxS.x * 14. + abs(yb) * 20., yb * 30.)));
      fxC = mix(fxC, fxC * .78, chev * .5);
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
      fxC = mix(fxC, mix(vec3(.66, .24, .12), vec3(.92, .55, .36), swirl), 1. - smoothstep(.8, 1., spr));
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
      vec3 v = fxVoronoi(fxS * 2.4 + 5.);
      float wob = (fxN2(fxS * 10.) - .5) * .05 + (fxN2(fxS * 3.) - .5) * .05;
      float pr = .05 + .12 * fract(v.z * 7.3);
      float vol = step(.35, v.z);
      // 화산 둘레로 흘러내린 용암 흐름과 분출물 부채꼴
      float flow = smoothstep(.6, .8, fxN2(vec2(atan(v.y, v.x) * 3., v.x * 6.) + v.z * 9.)) * (1. - smoothstep(pr, pr + .35, v.x)) * vol;
      fxC = mix(fxC, vec3(.35, .18, .1), flow * .6);
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
    fxC *= .9 + .2 * fxF2(fxS * 18. + uFace * 5.) * (1. - fxSea) + .08 * (fxN2(fxS * 70.) - .5);
    fxC = mix(fxC, vec3(1.), fxCloud * .9);
    fxC *= mix(.38, 1., fxDay);
    float fxCity = (1. - fxDay) * fxLand * (1. - fxCloud) * step(.82, fxH2(floor(fxS * 60.))) * step(.5, uFace) * step(uFace, 1.5);
    vec2 fxGl = fxF - vec2(-.4, .35);
    float fxSunGlint = fxSea * fxDay * exp(-dot(fxGl, fxGl) * 5.) * (1. - fxCloud);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, clamp(fxHt - vLift, -.012, .012) + fxF2(fxFace() * 40. + uFace * 3.) * .0012 * (1. - fxSea));',
  surface: 'roughnessFactor = mix(.75, .15, fxSea);',
  emissive: `
    float fxRim = 1. - smoothstep(0., .1, fxBorder);
    totalEmissiveRadiance = fxAtm * fxAtmK * (fxRim * fxRim * 1.2 + fxFresnel(normal, 3.) * .08)
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
  // 70년대 거실의 라바램프. 다 맞추면 면 하나가 램프 한 개의 둥근 유리관이 된다(면이 실제로 원통처럼 볼록하고, 가장자리로 갈수록
  // 속이 굴절돼 눌려 보인다). 바닥 전구에 데워진 밀랍이 길쭉하게 늘어나며 떠오르다 목이 가늘어지며 갈라지고, 식어 둥글게
  // 가라앉는다. 바닥엔 물결치는 밀랍 웅덩이, 꼭대기엔 붙어 늘어진 밀랍. 빛은 아래서 오므로 덩어리 아랫면이 가장 밝게
  // 달아오르고 속이 두꺼울수록 짙게 비친다. 액체는 밀랍과 대비되는 빛깔로 물들었고, 잔 기포가 오르며, 유리관엔 세로 빛줄이 맺힌다.
  // 밀랍 색이 곧 면 색
  head: `
    float fxTubeH(vec2 p, float seed) {
      vec2 F = aHome.xy + p * aHome.z;
      return smoothstep(0., .05, fxEdgeAt(p)) * (.012 + .05 * sqrt(max(0., 1. - F.x * F.x * .8)));
    }
    // 밀랍 장: x 세기, yz 기울기
    vec3 fxWaxField(vec2 F, float t) {
      float fld = 0.;
      vec2 g = vec2(0.);
      for (int i = 0; i < 9; i++) {
        float fi = float(i);
        float h = fxH1(fi * 7.3 + uFace * 3.1);
        float ph = t * (.3 + h * .35) + fi * 1.7;
        float y = sin(ph) * .85;
        float vy = cos(ph);
        vec2 c = vec2((h - .5) * 1.25 + .12 * sin(t * .6 + fi * 2.), y);
        float r = .11 + .12 * fxH1(fi * 3.1 + uFace);
        // 오를 때는 세로로 길쭉, 가라앉을 때는 둥글게
        vec2 sc = vec2(1. + .25 * max(vy, 0.), 1. / (1. + .55 * max(vy, 0.)));
        vec2 d = (F - c) * sc;
        float dd = max(dot(d, d), 1e-4);
        fld += r * r / dd;
        g += -2. * r * r * d * sc / (dd * dd);
      }
      float yb = F.y + 1.12 + .035 * sin(F.x * 7. + t * 1.3) + .02 * sin(F.x * 13. - t * 2.);
      fld += .045 / max(yb * yb, 1e-3);
      g.y += -.09 / max(yb * yb * yb, 1e-3);
      float yt = 1.16 - F.y + .03 * sin(F.x * 5. + 2.);
      fld += .02 / max(yt * yt, 1e-3);
      g.y += .04 / max(yt * yt * yt, 1e-3);
      return vec3(fld, g);
    }`,
  height: 'fxTubeH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    float fxHt = fxTubeH(vLocal.xy, vSeed);
    float fxT = uTime * .2;
    // 둥근 유리관 굴절: 가장자리로 갈수록 속이 눌려 보인다
    vec2 fxR = vec2(fxF.x * (1. + .22 * fxF.x * fxF.x), fxF.y);
    vec3 fxW = fxWaxField(fxR, fxT);
    float fxBlob = smoothstep(.95, 1.05, fxW.x);
    vec3 fxN = normalize(vec3(-fxW.yz * .05, 1.));
    float fxBottom = max(-fxN.y, 0.);
    float fxRim = 1. - fxN.z;
    float fxCore = smoothstep(1.2, 3.2, fxW.x);
    float fxHeat = 1. - smoothstep(-1.1, .4, fxF.y);
    vec3 fxWax = diffuseColor.rgb;
    vec3 fxWaxC = fxWax * (.42 + .35 * fxCore + .55 * fxBottom * (.5 + fxHeat))
      + mix(fxWax, vec3(1., .95, .85), .45) * fxRim * fxBottom * .6
      + mix(fxWax, vec3(1.), .3) * pow(fxRim, 3.) * .25;
    vec3 fxTint = mix(vec3(1.) - fxWax, vec3(.35, .1, .4), .35);
    vec3 fxLiquid = fxTint * (.16 + .45 * fxHeat) * (.85 + .3 * fxN2(vec2(fxR.x * 3., fxR.y * .8 - uTime * .05)));
    fxLiquid += fxWax * .1 * exp(-fxW.x * .6) * fxW.x;
    vec2 fxBq = vec2(fxR.x * 11., fxR.y * 7. - uTime * .3);
    float fxBubble = (1. - smoothstep(.04, .08, length(fract(fxBq) - .5))) * step(.9, fxH2(floor(fxBq)));
    fxLiquid += vec3(.6) * fxBubble * (1. - fxBlob) * (.3 + .5 * fxHeat);
    float fxGlass = (1. - smoothstep(0., .06, abs(fxF.x + .58))) * .4 + (1. - smoothstep(0., .03, abs(fxF.x - .68))) * .22
      + (1. - smoothstep(.0, .1, abs(fxF.x + .3))) * .06;
    vec3 fxCol = mix(fxLiquid, fxWaxC, fxBlob) + vec3(fxGlass) * vec3(1., .97, .92);
    diffuseColor.rgb = fxCol * .12;`,
  normal: 'normal = fxBump(normal, clamp(fxHt - vLift, -.01, .01));',
  surface: 'roughnessFactor = .14;',
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
  // 블랙홀(영화 「인터스텔라」의 가르강튀아처럼). 다 맞추면 면 하나에 블랙홀 하나가 들어앉는다. 거의 옆에서 본 얇은 강착 원반이
  // 그림자 한가운데를 가로지르고, 그림자 뒤편 원반은 중력에 휘어 그림자 위로 굵은 빛 고리, 아래로 가는 고리가 되어 넘어온다.
  // 그림자 가장자리엔 가는 광자 고리. 원반은 안쪽이 하얗게 달고 바깥으로 갈수록 면 색으로 식으며, 가스 실이 결을 이루며 흐른다.
  // 둘레 별빛과 성운은 렌즈처럼 밀려나 휜다. 스티커는 둥근 유리 렌즈 같아 그 속에 상이 맺힌다
  head: `
    float fxLensH(vec2 p, float seed) {
      vec2 q = p / uSticker.x;
      return smoothstep(0., .05, fxEdgeAt(p)) * (.008 + .016 * (1. - dot(q, q) * .5));
    }`,
  height: 'fxLensH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace() * 1.06;
    float fxT = uTime;
    vec3 fxHot = diffuseColor.rgb;
    float fxRs = .27;
    float fxR = length(fxF);
    float fxA = atan(fxF.y, fxF.x);
    // 배경: 렌즈로 밀려난 별과 면 색 성운
    vec2 fxLens = fxF * (1. + fxRs * fxRs * 1.4 / max(fxR * fxR, .03));
    vec2 fxSg = fxLens * 85.;
    float fxStar = step(.986, fxH2(floor(fxSg))) * (.35 + .65 * fxH2(floor(fxSg) + 3.)) * (1. - smoothstep(0., .32, length(fract(fxSg) - .5)));
    vec3 fxBg = vec3(.78, .84, 1.) * fxStar + fxHot * (.06 + .16 * fxF2(fxLens * 2.2 + uFace * 3.)) * (.55 + .45 * smoothstep(1.5, .4, fxR));
    // 앞쪽 원반: 거의 옆에서 본 얇은 띠. 가로로 흐르는 가스 실
    float fxIn = fxRs * 1.45, fxOut = fxRs * 3.9;
    float fxX = abs(fxF.x);
    float fxThk = .026 + .04 * smoothstep(fxIn, fxOut, fxX);
    // 원반이 아주 조금 기울어 앞쪽이 가운데보다 살짝 아래로 지난다
    float fxBy = fxF.y + .035 * sqrt(max(0., 1. - fxX * fxX / (fxOut * fxOut)));
    float fxBand = exp(-pow(fxBy / fxThk, 2.)) + .35 * exp(-pow(fxBy / (fxThk * 2.6), 2.));
    // 원반 앞쪽은 그림자 앞을 지나가므로 가운데서도 끊기지 않는다
    float fxRad = 1. - smoothstep(fxOut * .6, fxOut, fxX);
    float fxFil = .45 + .55 * (fxN2(vec2(fxF.x * 9. - fxT * .7, fxBy * 110.)) * .6 + fxN2(vec2(fxF.x * 26. - fxT * 1.3, fxBy * 240.)) * .4);
    float fxTd = smoothstep(fxIn, fxOut, fxX);
    float fxDop = 1. - .22 * fxF.x / fxOut;
    float fxDisk = fxBand * fxRad * pow(fxIn / max(fxX, fxIn), 1.5) * fxFil * fxDop;
    // 뒤쪽 원반이 휘어 넘어온 고리: 위는 굵고 밝게, 아래는 가늘게
    float fxUp = smoothstep(-.02, .02, fxF.y);
    float fxS = pow(abs(sin(fxA)), .8) * mix(.7, 1., fxUp);
    float fxRi = fxRs * 1.07;
    float fxRo = fxRs * (1.14 + 1.45 * fxS);
    float fxRd = (fxR - fxRi) / max(fxRo - fxRi, .01);
    float fxArc = smoothstep(-.03, .06, fxRd) * (1. - smoothstep(.75, 1., fxRd)) * pow(1. - clamp(fxRd, 0., 1.) * .6, 1.5);
    float fxArcF = .45 + .55 * (fxN2(vec2(fxA * 2.5 - fxT * .25, fxRd * 38.)) * .6 + fxN2(vec2(fxA * 7. - fxT * .5, fxRd * 90.)) * .4);
    fxArc *= mix(.5, 1., fxUp) * fxArcF * (1. + .18 * cos(fxA - 3.1416));
    float fxPhoton = exp(-pow((fxR - fxRs * 1.025) / .005, 2.)) + .35 * exp(-pow((fxR - fxRs * 1.025) / .016, 2.));
    float fxShadow = 1. - smoothstep(fxRs * .985, fxRs * 1.01, fxR);
    vec3 fxWhite = vec3(1., .95, .86);
    vec3 fxCol = fxBg * (1. - fxShadow);
    fxCol += mix(fxWhite, fxHot, smoothstep(.0, .85, fxRd)) * fxArc * mix(2.6, 4.2, fxUp) * (1. - fxShadow);
    fxCol += mix(fxWhite, fxHot, .35) * fxPhoton * 1.6 * (1. - fxShadow * .8);
    fxCol += mix(fxWhite, fxHot, smoothstep(.05, .8, fxTd)) * fxDisk * 4.;
    diffuseColor.rgb = vec3(.006);`,
  normal: 'normal = fxBump(normal, fxN2(fxFace() * 400.) * .00005);',
  surface: 'roughnessFactor = .06;',
  emissive: 'totalEmissiveRadiance = fxCol + vec3(1.) * fxFresnel(normal, 4.) * .05;',
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
  // 마노 단면. 다 맞추면 면 하나가 반으로 가른 요새 마노 한 덩이다. 띠는 동굴 모양을 따라 끊김 없이 겹겹이 이어지며
  // 각진 요새처럼 꺾이고, 두께가 천천히 달라진다. 흰 띠, 맑은 띠, 짙은 띠가 번갈아 들고 반투명해 띠가 살짝 깊이 비친다.
  // 가운데 동굴은 실제로 패인 정동이라 뾰족한 수정이 돋았고, 가장 바깥은 거친 껍질. 매끈하게 갈아 빛이 맺힌다
  head: `
    // 동굴 모양을 따르는 거리: 휜 좌표에서 둥근 네모와 원을 섞고 각을 살짝 세운다
    float fxAgD(vec2 F) {
      vec2 w = F + (vec2(fxF2(F * 1.3 + 1.), fxF2(F * 1.3 + 7.)) - .5) * .45;
      w += (vec2(fxN2(w * 3.1 + 4.), fxN2(w * 3.1 + 9.)) - .5) * .08;
      float a = atan(w.y, w.x);
      float lobe = 1. + .12 * sin(a * 3. + 1.3) + .07 * sin(a * 5. + 4.1);
      return (max(abs(w.x), abs(w.y)) * .45 + length(w) * .55) * lobe;
    }
    float fxAgateH(vec2 p, float seed) {
      vec2 F = aHome.xy + p * aHome.z;
      float d = fxAgD(F);
      float cav = .2 + .04 * fxN2(F * 4.);
      float inC = 1. - smoothstep(cav - .015, cav + .015, d);
      vec3 cr = fxVoronoi(F * 26.);
      float spike = (1. - smoothstep(0., .45, cr.x)) * (.5 + .5 * cr.z);
      float border = 1. - max(abs(F.x), abs(F.y));
      float rind = 1. - smoothstep(.03, .07, border);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.016 - inC * (.022 - .018 * spike) + rind * .006 * fxN2(F * 30.));
    }`,
  height: 'fxAgateH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    float fxHt = fxAgateH(vLocal.xy, vSeed);
    // 반투명: 보는 각도만큼 속 띠를 살짝 밀어 깊이 비치게
    vec3 fxV = normalize(vViewPosition);
    vec2 fxPar = vec2(dot(fxV, vTx), dot(fxV, vTy)) * .02;
    float fxD = fxAgD(fxF);
    float fxD2 = fxAgD(fxF + fxPar);
    float fxCav = .2 + .04 * fxN2(fxF * 4.);
    float fxIn = 1. - smoothstep(fxCav - .012, fxCav + .012, fxD);
    // 띠 위상: 두께가 천천히 달라지도록 거리를 비틀어 늘인다
    float fxPh = (fxD - fxCav) * 44. + 3. * sin((fxD - fxCav) * 9.) + 1.4 * sin((fxD - fxCav) * 23. + 1.);
    float fxPh2 = (fxD2 - fxCav) * 44. + 3. * sin((fxD2 - fxCav) * 9.) + 1.4 * sin((fxD2 - fxCav) * 23. + 1.);
    float fxAA = max(fwidth(fxPh), .02);
    float fxLines = 1. - smoothstep(.08, .08 + fxAA * 1.5, abs(fract(fxPh * 2.) - .5) * 2. - .82);
    float fxWhiteB = smoothstep(.72 - fxAA, .72 + fxAA, .5 + .5 * sin(fxPh * .9 + 1.2) * sin(fxPh * .37 + 2.));
    float fxDark = .5 + .5 * sin(fxPh * .6 + .4);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxCol = fxBase * (.3 + .7 * fxDark) * (.85 + .3 * (.5 + .5 * sin(fxPh * 2.3)));
    fxCol = mix(fxCol, vec3(.93, .92, .88), fxWhiteB * .8);
    fxCol = mix(fxCol, fxCol * .55, fxLines * .5 * (1. - fxWhiteB));
    vec3 fxDeep = fxBase * (.3 + .5 * (.5 + .5 * sin(fxPh2 * .6 + .4)));
    fxCol = mix(fxCol, fxDeep, .25 * (1. - fxWhiteB));
    float fxBorder = 1. - max(abs(fxF.x), abs(fxF.y));
    float fxRind = 1. - smoothstep(.03, .07, fxBorder + (fxN2(fxF * 12.) - .5) * .025);
    fxCol = mix(fxCol, vec3(.42, .36, .3) * (.7 + .4 * fxN2(fxF * 40.)), fxRind);
    vec3 fxCr = fxVoronoi(fxF * 26.);
    float fxFacet = 1. - smoothstep(0., .12, fxCr.y);
    vec3 fxDruzy = mix(fxBase * .45 + .45, vec3(1.), .35) * (.65 + .5 * fxCr.z) * (1. - fxFacet * .35);
    fxCol = mix(fxCol, fxDruzy, fxIn);
    diffuseColor.rgb = fxCol;`,
  normal: 'normal = fxBump(normal, clamp(fxHt - vLift, -.01, .01) + fxIn * (fxCr.z * .002 - fxFacet * .0015) + fxRind * fxN2(fxF * 50.) * .003);',
  surface: 'roughnessFactor = mix(mix(.05, .2, fxIn), .8, fxRind);',
  emissive: 'totalEmissiveRadiance = fxCol * .18 * (1. - fxWhiteB * .5) * (1. - fxRind) + vec3(1.) * fxGlint(fxF * 26., .3, 2.) * fxIn * 1.2;',
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
  // 타탄. 다 맞추면 면 하나가 한 폭의 킬트 천이다. 정해진 실 순서(셋트)대로 면 색 넓은 띠, 짙은 띠, 다른 색 띠와 가는
  // 밝은 줄을 날실과 씨실에 똑같이 걸고 2/2 능직으로 짜서, 띠가 겹친 칸은 진하게 섞이고 비스듬한 능직 결이 보인다.
  // 굵은 모사의 꼬인 올과 섞인 털빛, 잔털
  head: WEAVE + `
    // 셋트: 실 번호마다 색 번호(0 면 색, 1 짙은 색, 2 다른 색, 3 밝은 줄)
    float fxSett(float i) {
      float s = mod(i, 96.);
      s = s < 48. ? s : 95. - s;   // 대칭 셋트
      if (s < 14.) return 0.;
      if (s < 18.) return 1.;
      if (s < 20.) return 0.;
      if (s < 26.) return 1.;
      if (s < 28.) return 3.;
      if (s < 44.) return 2.;
      if (s < 46.) return 1.;
      return 3.;
    }
    vec3 fxSettC(float k, vec3 base) {
      vec3 dark = mix(base, vec3(.02), .78);
      vec3 other = dot(base, vec3(.3, .59, .11)) > .25 || base.g > base.r ? vec3(.06, .1, .26) : vec3(.07, .22, .12);
      vec3 line = base.r > .5 && base.g > .4 ? vec3(.9, .9, .88) : vec3(.95, .78, .2);
      return k < .5 ? base : (k < 1.5 ? dark : (k < 2.5 ? other : line));
    }`,
  height: 'fxDrapeH',
  color: `
    vec2 fxF = fxFace();
    float fxN = 120.;
    vec4 fxW = fxWeave(fxF, fxN, 1.);
    float fxAA = fxClothAA(fxF, fxN);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxWarp = fxSettC(fxSett(fxW.y), fxBase);
    vec3 fxWeft = fxSettC(fxSett(fxW.z), fxBase);
    vec3 fxY = mix(fxW.x > .5 ? fxWarp : fxWeft, (fxWarp + fxWeft) * .5, fxAA);
    float fxHair = fxStray(vLocal.xy, vSeed);
    diffuseColor.rgb = mix(fxThread(fxY, fxW, fxF, fxN, fxAA), fxY * 1.2 + .04, fxHair * .3);`,
  normal: 'normal = fxBump(normal, fxThreadBump(fxW, fxF, fxN, fxAA) + fxHair * .0005);',
  surface: 'roughnessFactor = .9;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * (fxFresnel(normal, 1.4) * .4 + pow(fxW.w, 8.) * .08 * (1. - fxAA));',
};
B.tartan = {
  // 가죽 덧댐
  color: `diffuseColor.rgb *= .8 + .25 * fxN3(vLocal * 40. + vSeed);`,
  surface: 'roughnessFactor = .55;',
};

S.houndstooth = {
  // 하운드투스(사냥개 이빨). 다 맞추면 면 하나가 한 폭의 모직이다. 짙은 실 넷·면 색 실 넷을 번갈아 날실과 씨실로 걸고
  // 2/2 능직으로 짜면 저절로 뾰족한 이빨 무늬가 나온다(무늬를 그린 게 아니라 짜임을 그대로 계산했다).
  // 실마다 굵기와 빛깔이 조금씩 다르고, 꼬인 올과 섞인 털빛, 실 사이 그늘, 삐져나온 잔털, 칸마다 부드럽게 진 천 주름
  head: WEAVE,
  height: 'fxDrapeH',
  color: `
    vec2 fxF = fxFace();
    float fxN = 60.;
    vec4 fxW = fxWeave(fxF, fxN, 1.);
    float fxAA = fxClothAA(fxF, fxN);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxDark = vec3(.03, .028, .03);
    vec3 fxWarp = mod(fxW.y, 8.) < 4. ? fxDark : fxBase;
    vec3 fxWeft = mod(fxW.z, 8.) < 4. ? fxDark : fxBase;
    vec3 fxY = mix(fxW.x > .5 ? fxWarp : fxWeft, mix(fxDark, fxBase, .5), fxAA);
    float fxHair = fxStray(vLocal.xy, vSeed);
    diffuseColor.rgb = mix(fxThread(fxY, fxW, fxF, fxN, fxAA), fxY * 1.2 + .04, fxHair * .3);`,
  normal: 'normal = fxBump(normal, fxThreadBump(fxW, fxF, fxN, fxAA) + fxHair * .0005);',
  surface: 'roughnessFactor = .9;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * (fxFresnel(normal, 1.4) * .4 + pow(fxW.w, 8.) * .08 * (1. - fxAA));',
};

B.houndstooth = {
  color: `diffuseColor.rgb *= .85 + .2 * fxN3(vLocal * 80. + vSeed);`,
  surface: 'roughnessFactor = .9;',
};

S.glencheck = {
  // 글렌체크(프린스 오브 웨일스). 다 맞추면 면 하나가 한 폭의 양복감이다. 짙은 실과 옅은 실을 넷씩 번갈아 건 굵은 칸과
  // 둘씩 번갈아 건 잔 칸이 2/2 능직으로 짜여 큰 체크 안에 잔 하운드투스와 줄이 생기고, 그 위로 가는 색실(오버체크)이
  // 지나간다. 실 빛깔은 면 색을 짙게·옅게 물들인 것. 고운 소모사라 결이 촘촘하고 은은히 윤이 난다
  head: WEAVE + `
    // 이 실이 짙은 실인지(1)
    float fxGlen(float i) {
      float s = mod(i, 32.);
      return s < 16. ? step(mod(s, 8.), 3.5) : step(mod(s, 4.), 1.5);
    }`,
  height: 'fxDrapeH',
  color: `
    vec2 fxF = fxFace();
    float fxN = 88.;
    vec4 fxW = fxWeave(fxF, fxN, 1.);
    float fxAA = fxClothAA(fxF, fxN);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxD = mix(fxBase, vec3(.015), .7);
    vec3 fxL = mix(fxBase, vec3(.95, .93, .88), .4);
    vec3 fxOver = fxBase.b > fxBase.r * 1.3 ? vec3(.75, .14, .1) : vec3(.15, .35, .8);
    vec3 fxWarp = mix(fxL, fxD, fxGlen(fxW.y));
    vec3 fxWeft = mix(fxL, fxD, fxGlen(fxW.z));
    if (mod(fxW.y, 64.) == 40.) fxWarp = fxOver;
    if (mod(fxW.z, 64.) == 40.) fxWeft = fxOver;
    vec3 fxY = mix(fxW.x > .5 ? fxWarp : fxWeft, mix(fxD, fxL, .5), fxAA);
    float fxHair = fxStray(vLocal.xy, vSeed) * .5;
    diffuseColor.rgb = mix(fxThread(fxY, fxW, fxF, fxN, fxAA), fxY * 1.2 + .04, fxHair * .3);`,
  normal: 'normal = fxBump(normal, fxThreadBump(fxW, fxF, fxN, fxAA) * .8 + fxHair * .0004);',
  surface: 'roughnessFactor = .78;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * (fxFresnel(normal, 1.6) * .3 + pow(fxW.w, 8.) * .12 * (1. - fxAA));',
};

B.glencheck = {
  color: `diffuseColor.rgb *= .85 + .2 * fxN3(vLocal * 80. + vSeed);`,
  surface: 'roughnessFactor = .9;',
};

S.herringbone = {
  // 헤링본 트위드. 다 맞추면 면 하나가 한 폭의 트위드다. 면 색 날실과 크림색 씨실을 능직으로 짜되 여덟 올마다 사선 방향을
  // 뒤집어 청어 뼈 같은 V자 줄이 생긴다. 굵고 거친 모사라 실마다 굵기가 고르지 않고, 군데군데 다른 색 털 뭉치(넵)가 박혔으며
  // 털이 잔뜩 일어 보송하다
  head: WEAVE,
  height: 'fxDrapeH',
  color: `
    vec2 fxF = fxFace();
    float fxN = 64.;
    vec4 fxW = fxWeave(fxF, fxN, 2.);
    float fxAA = fxClothAA(fxF, fxN);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxWarp = fxBase * (.75 + .3 * fxH1(fxW.y * 1.3 + uFace));
    vec3 fxWeft = vec3(.86, .8, .7) * (.85 + .2 * fxH1(fxW.z * 2.1 + uFace));
    vec3 fxY = mix(fxW.x > .5 ? fxWarp : fxWeft, mix(fxBase * .9, vec3(.86, .8, .7), .5), fxAA);
    vec2 fxNg = floor((fxF + 1.) * 130.);
    float fxNep = step(.99, fxH2(fxNg + uFace * 17.));
    vec3 fxNepC = .5 + .5 * cos(6.2832 * (fxH2(fxNg + 3.) + vec3(0., .33, .67)));
    fxY = mix(fxY, fxNepC, fxNep * .85);
    float fxHair = fxStray(vLocal.xy, vSeed) * 1.4;
    diffuseColor.rgb = mix(fxThread(fxY, fxW, fxF, fxN, fxAA), vec3(.9, .85, .76), clamp(fxHair, 0., 1.) * .35);`,
  normal: 'normal = fxBump(normal, fxThreadBump(fxW, fxF, fxN, fxAA) * 1.3 + fxHair * .0006);',
  surface: 'roughnessFactor = .95;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * fxFresnel(normal, 1.3) * .45;',
};

B.herringbone = {
  color: `diffuseColor.rgb *= .85 + .2 * fxN3(vLocal * 80. + vSeed);`,
  surface: 'roughnessFactor = .9;',
};

S.gingham = {
  // 깅엄. 다 맞추면 면 하나가 한 폭의 면직이다. 면 색 실과 흰 실을 여섯 올씩 번갈아 날실과 씨실로 걸어 평직으로 짜면,
  // 둘 다 색실인 칸은 진하게, 하나만 색실인 칸은 반쯤 옅게, 둘 다 흰 칸은 하얗게 나와 바둑판이 된다. 가까이 보면 올이
  // 하나 걸러 하나씩 엇갈려 있고, 면사라 매끈하며 살짝 구김이 갔다
  head: WEAVE,
  height: 'fxDrapeH',
  color: `
    vec2 fxF = fxFace();
    float fxN = 104.;
    vec4 fxW = fxWeave(fxF, fxN, 0.);
    float fxAA = fxClothAA(fxF, fxN);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxWhite = vec3(.95, .94, .92);
    vec3 fxWarp = mod(fxW.y, 12.) < 6. ? fxBase : fxWhite;
    vec3 fxWeft = mod(fxW.z, 12.) < 6. ? fxBase : fxWhite;
    vec3 fxY = mix(fxW.x > .5 ? fxWarp : fxWeft, (fxWarp + fxWeft) * .5, fxAA);
    diffuseColor.rgb = fxThread(fxY, fxW, fxF, fxN, fxAA);`,
  normal: 'normal = fxBump(normal, fxThreadBump(fxW, fxF, fxN, fxAA) * .8);',
  surface: 'roughnessFactor = .8;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * (fxFresnel(normal, 1.6) * .2 + pow(fxW.w, 8.) * .1 * (1. - fxAA));',
};

B.gingham = {
  color: `diffuseColor.rgb *= .9 + .12 * fxN3(vLocal * 80. + vSeed);`,
  surface: 'roughnessFactor = .85;',
};

S.argyle = {
  // 아가일 니트. 다 맞추면 면 하나가 스웨터 앞판이다. 길쭉한 마름모가 면 색과 짙은 색으로 번갈아 떠졌고, 마름모 한가운데를
  // 비스듬히 가로지르는 가는 겹줄(오버체크)이 크림색으로 지나간다. 무늬가 코 단위로 떠져 가장자리가 잘게 계단지고,
  // 코마다 V자 두 가닥이 도톰하게 솟았다. 섞어 자은 털빛과 삐져나온 잔털
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
    float fxHeath = fxN2(vec2(fxSt.z * 160., fxCell.x * 7. + fxCell.y * 13.) + vSeed);
    fxY *= (.92 + .14 * fxH2(fxCell + vSeed * 9.)) * mix(vec3(.93, .96, 1.), vec3(1.07, 1.03, .96), fxHeath);
    float fxFuzz = fxN2(vLocal.xy * 260. + vSeed);
    float fxHair = fxStray(vLocal.xy, vSeed);
    vec3 fxCol = fxY * (.3 + .7 * smoothstep(0., .5, fxSt.x)) * (.78 + .3 * fxSt.y) * (.92 + .1 * fxFuzz);
    diffuseColor.rgb = mix(fxCol, fxY * 1.15 + .05, fxHair * .35);`,
  normal: 'normal = fxBump(normal, fxSt.y * .0014 * step(.05, fxSt.x) + fxFuzz * .0007 + fxHair * .0006);',
  surface: 'roughnessFactor = .95;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * fxFresnel(normal, 1.4) * .45;',
};

B.argyle = {
  color: `diffuseColor.rgb *= .85 + .2 * fxN3(vLocal * 60. + vSeed);`,
  surface: 'roughnessFactor = .95;',
};

S.chevron = {
  // 셰브론 니트. 다 맞추면 면 하나가 지그재그 줄무늬 스웨터다(이탈리아 니트 공방 식). 면 색, 크림, 짙은 색, 반쯤 옅은 면 색 줄이
  // 산 모양으로 오르내리며 번갈아 떠졌고, 무늬가 코 단위라 비탈이 잘게 계단진다. 코마다 V자 두 가닥이 도톰하고 섞인 털빛과 잔털
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
    float fxHeath = fxN2(vec2(fxSt.z * 160., fxCell.x * 7. + fxCell.y * 13.) + vSeed);
    fxY *= (.92 + .14 * fxH2(fxCell + vSeed * 9.)) * mix(vec3(.93, .96, 1.), vec3(1.07, 1.03, .96), fxHeath);
    float fxFuzz = fxN2(vLocal.xy * 260. + vSeed);
    float fxHair = fxStray(vLocal.xy, vSeed);
    vec3 fxCol = fxY * (.3 + .7 * smoothstep(0., .5, fxSt.x)) * (.78 + .3 * fxSt.y) * (.92 + .1 * fxFuzz);
    diffuseColor.rgb = mix(fxCol, fxY * 1.15 + .05, fxHair * .35);`,
  normal: 'normal = fxBump(normal, fxSt.y * .0014 * step(.05, fxSt.x) + fxFuzz * .0007 + fxHair * .0006);',
  surface: 'roughnessFactor = .95;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * fxFresnel(normal, 1.4) * .45;',
};

B.chevron = {
  color: `diffuseColor.rgb *= .85 + .2 * fxN3(vLocal * 60. + vSeed);`,
  surface: 'roughnessFactor = .95;',
};

S.dragon = {
  // 용의 비늘. 다 맞추면 면 하나가 비늘 덮인 살갗 한 장이다. 끝이 뾰족한 방패꼴 비늘이 기와처럼 아래로 겹쳐, 윗비늘 끝이
  // 아랫비늘 뿌리를 덮는다. 비늘은 뿌리에서 끝으로 갈수록 두꺼워져 끝이 들린 턱을 이루고, 가운데엔 용골(능선)이 섰다.
  // 겉엔 뿌리에서 끝으로 가는 잔 줄과 오목한 잔구멍, 가장자리는 닳아 밝고 보는 각도에 따라 빛깔이 돈다.
  // 윗비늘 그늘 속 틈으로 몸속 불씨가 숨 쉬듯 빛난다. 비늘 색이 곧 면 색
  head: `
    // 비늘: x 윤곽 거리(0 가운데 ~ 1 가장자리), y 가로(-1 ~ 1), z 세로(1 뿌리 ~ -1 끝), w 비늘마다 난수
    float fxScSh;
    vec4 fxScale(vec2 F) {
      vec2 g = F * vec2(2.8, 3.2);
      fxScSh = 9.;
      for (int j = 2; j >= -1; j--) {
        float row = floor(g.y) + float(j);
        float off = mod(row, 2.) * .5;
        float cx = floor(g.x - off) + .5 + off;
        for (int i = -1; i <= 1; i++) {
          vec2 c = vec2(cx + float(i), row + .5);
          float hs = fxH2(c);
          vec2 d = (g - c) / vec2(.68, 1.06);
          d.x += (hs - .5) * .1 * (1. - d.y);
          float w = .84 + .16 * smoothstep(-1.1, .1, d.y);
          float r = max(length(vec2(d.x / w, d.y)), abs(d.x) * .45 - d.y);
          if (r < 1.) return vec4(r, d.x / w, d.y, hs);
          fxScSh = min(fxScSh, r - 1.);
        }
      }
      return vec4(1., 0., 0., 0.);
    }
    float fxScaleH(vec4 s) {
      float t = clamp((1. - s.z) * .5, 0., 1.);
      float dome = sqrt(max(0., 1. - s.y * s.y));
      float keel = exp(-s.y * s.y / .03) * smoothstep(.9, -.5, s.z);
      float lip = smoothstep(1., .72, s.x);
      return ((.3 + .7 * t) * (.6 + .4 * dome) + .28 * keel) * (.18 + .82 * lip);
    }
    float fxDragonH(vec2 p, float seed) {
      vec4 s = fxScale(aHome.xy + p * aHome.z);
      return smoothstep(0., .06, fxEdgeAt(p)) * (.006 + .085 * fxScaleH(s));
    }`,
  height: 'fxDragonH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec4 fxS = fxScale(fxF);
    float fxHt = fxDragonH(vLocal.xy, vSeed);
    vec3 fxBase = diffuseColor.rgb;
    float fxT = clamp((1. - fxS.z) * .5, 0., 1.);
    float fxKeel = exp(-fxS.y * fxS.y / .03) * smoothstep(.9, -.5, fxS.z);
    float fxRim = smoothstep(.8, .97, fxS.x);
    float fxSh = 1. - smoothstep(0., .22, fxScSh);
    float fxAO = smoothstep(0., .6, fxT) * (1. - fxSh * .85);
    float fxStri = .5 + .5 * sin(fxS.y * 28. + fxS.w * 6.);
    float fxPit = smoothstep(.6, .85, fxN2(fxF * 80.));
    vec3 fxC = fxBase * (.28 + .8 * fxAO) * (.85 + .3 * fxS.w);
    fxC = mix(fxC, fxBase * 1.4 + .04, fxKeel * .4);
    fxC = mix(fxC, mix(fxBase, vec3(1., .92, .75), .3) * 1.1, fxRim * fxAO * .4);
    fxC *= (.9 + .14 * fxStri) * (1. - fxPit * .2);
    float fxEmber = fxSh * fxSh * (.55 + .45 * sin(uTime * 1.5 + fxS.w * 20.)) * smoothstep(.55, .8, fxN2(fxF * 2. + uTime * .15));
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, clamp(fxHt - vLift, -.02, .02) + fxStri * .00035 * fxAO - fxPit * .0003);',
  surface: 'roughnessFactor = mix(.6, .2, fxAO) + fxPit * .15; metalnessFactor = .5 * fxAO;',
  emissive: `
    float fxFr = fxFresnel(normal, 2.);
    vec3 fxIr = .5 + .5 * cos(6.2832 * (fxFr * 1.2 + fxS.w * .3 + fxT * .2 + vec3(0., .33, .67)));
    totalEmissiveRadiance = mix(diffuseColor.rgb, fxIr, .4) * fxFr * .45 * fxAO + vec3(1., .42, .08) * fxEmber * 1.8;`,
};
B.dragon = {
  color: `diffuseColor.rgb *= .75 + .35 * fxN3(vLocal * 30. + vSeed);`,
  surface: 'roughnessFactor = .6;',
};

S.phoenix = {
  // 불사조 깃털. 다 맞추면 면 하나가 깃털로 덮인 날개 한 장이다. 길쭉하고 끝이 둥근 깃털이 아래로 겹겹이 포개져, 끝으로
  // 갈수록 들려 실제로 층이 진다. 깃털은 가운데 깃대를 따라 오목하게 휘었고, 깃대는 뿌리에서 끝으로 가늘어지며 솟았다.
  // 깃가지가 깃대에서 비스듬히 갈라져 결을 이루고 군데군데 벌어졌다. 뿌리는 그을린 듯 짙고, 끝은 불씨처럼 노랗게 달아
  // 일렁인다. 깃털 사이 그늘엔 잉걸불. 깃털 색이 곧 면 색(진홍, 금빛, 푸른 불, 초록 불, 보랏빛, 흰 불)
  head: `
    // 깃털: x 윤곽 거리, y 가로(-1 ~ 1, 깃대가 0), z 세로(1 뿌리 ~ -1 끝), w 깃털마다 난수
    float fxPlSh;
    vec4 fxPlume(vec2 F) {
      vec2 g = F * vec2(2.9, 2.1);
      fxPlSh = 9.;
      for (int j = 2; j >= -1; j--) {
        float row = floor(g.y) + float(j);
        float off = mod(row, 2.) * .5;
        float cx = floor(g.x - off) + .5 + off;
        for (int i = -1; i <= 1; i++) {
          vec2 c = vec2(cx + float(i), row + .55);
          float hs = fxH2(c + 17.);
          vec2 d = (g - c) / vec2(.62, 1.2);
          d.x += (hs - .5) * .3 * (1. - d.y) * (1. - d.y) * .5;
          float w = .62 + .38 * smoothstep(-1.2, -.1, d.y);
          float r = max(length(vec2(d.x / w, d.y)), abs(d.x) * .3 - d.y);
          // 깃가지 결을 따라 가장자리가 해지고 군데군데 깊이 갈라졌다
          float bu = d.y * 1.1 - abs(d.x / w) * .95;
          r += (fxN2(vec2(bu * 8., hs * 40. + sign(d.x))) - .4) * .07 * smoothstep(.7, 1., r);
          r += smoothstep(.86, .92, fxN2(vec2(bu * 5., hs * 23. + sign(d.x)))) * smoothstep(.35, .6, abs(d.x / w)) * .35;
          if (r < 1.) return vec4(r, d.x / w, d.y, hs);
          fxPlSh = min(fxPlSh, r - 1.);
        }
      }
      return vec4(1., 0., 0., 0.);
    }
    float fxPlumeH(vec4 f) {
      float t = clamp((1. - f.z) * .5, 0., 1.);
      float cup = sqrt(max(0., 1. - f.y * f.y));
      float shaft = exp(-f.y * f.y / .008) * smoothstep(-.95, .3, f.z);
      float lip = smoothstep(1., .75, f.x);
      return ((.25 + .75 * t) * (.55 + .45 * cup) + .25 * shaft) * (.2 + .8 * lip);
    }
    float fxPhoenixH(vec2 p, float seed) {
      vec4 f = fxPlume(aHome.xy + p * aHome.z);
      return smoothstep(0., .06, fxEdgeAt(p)) * (.006 + .075 * fxPlumeH(f));
    }`,
  height: 'fxPhoenixH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec4 fxP = fxPlume(fxF);
    float fxHt = fxPhoenixH(vLocal.xy, vSeed);
    vec3 fxBase = diffuseColor.rgb;
    float fxT = clamp((1. - fxP.z) * .5, 0., 1.);
    float fxSh = 1. - smoothstep(0., .2, fxPlSh);
    float fxAO = smoothstep(0., .55, fxT) * (1. - fxSh * .7);
    float fxShaft = exp(-fxP.y * fxP.y / .0025) * smoothstep(-.95, .4, fxP.z);
    float fxBarbU = fxP.z * 1.1 - abs(fxP.y) * .95 + fxN2(fxF * 12.) * .08;
    float fxBarb = .5 + .5 * sin(fxBarbU * 64.);
    float fxSplit = smoothstep(.72, .9, fxN2(vec2(fxBarbU * 9., fxP.w * 9. + sign(fxP.y)))) * smoothstep(.15, .5, abs(fxP.y));
    float fxTip = smoothstep(.55, 1., fxT);
    float fxFlick = .7 + .3 * sin(uTime * 3.1 + fxP.w * 30.) * sin(uTime * 1.7 + fxP.w * 11. + fxF.y * 3.);
    vec3 fxC = fxBase * (.5 + .45 * fxBarb) * (.85 + .25 * fxP.w);
    fxC = mix(fxBase * .12, fxC, .25 + .75 * fxAO);
    fxC = mix(fxC, mix(fxBase, vec3(1., .86, .5), .55) * (.95 + .25 * fxBarb), fxTip * .7);
    fxC = mix(fxC, mix(fxBase, vec3(1., .94, .75), .6), fxShaft * .75);
    fxC *= 1. - fxSplit * .6;
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, clamp(fxHt - vLift, -.02, .02) + fxBarb * .0005 * (1. - fxShaft) + fxShaft * .0006 - fxSplit * .0008);',
  surface: 'roughnessFactor = mix(.75, .4, fxAO) - fxShaft * .15; metalnessFactor = .12;',
  emissive: `
    float fxFr = fxFresnel(normal, 2.);
    vec3 fxFire = mix(fxBase, vec3(1., .8, .35), .55);
    float fxEmber = fxSh * fxSh * smoothstep(.5, .8, fxN2(fxF * 3. + vec2(0., uTime * .3)));
    totalEmissiveRadiance = fxFire * pow(fxTip, 1.8) * fxFlick * (1. - fxSplit * .5) * 1.1 + fxBase * fxFr * .25 * fxAO
      + vec3(1., .45, .1) * fxEmber * 1.3;`,
};

B.phoenix = {
  color: `diffuseColor.rgb *= .75 + .35 * fxN3(vLocal * 30. + vSeed);`,
  surface: 'roughnessFactor = .6;',
  emissive: 'totalEmissiveRadiance = vec3(1., .4, .1) * pow(fxN3(vLocal * 12. + vec3(0., uTime * .4, 0.)), 6.) * .6;',
};

S.mithril = {
  // 미스릴 사슬. 다 맞추면 면 하나가 사슬 갑옷 한 장이다. 고리 하나가 네 고리를 꿰는 유럽식 4-1 엮음을 큼직한 고리로
  // 엮었다. 실제 중세 갑옷처럼 줄마다 번갈아, 한 줄은 판에서 찍어 낸 납작한 통고리, 한 줄은 둥근 철사 끝을 겹쳐 쐐기
  // 리벳으로 박은 고리다. 고리는 줄마다 번갈아 기울어 이웃 고리 위아래로 지나가며 실제로 겹겹이 솟고, 고리 틈 깊숙이
  // 마름모로 누빈 짙은 누비옷이 비친다. 높은 데는 닳아 반짝이고 겹친 그늘은 거뭇하다. 미스릴은 은빛에 희미한 푸른 윤이
  // 돌고, 면마다 고리를 다른 빛깔로 물들였다(양극 산화한 금속처럼). 철사는 단면이 둥글어 빛이 철사를 따라 가늘게 맺히고,
  // 철사 결을 따라 닦인 자국이 나 있으며, 위로 지나는 고리 아래엔 그늘이 진다. 리벳 고리엔 동그란 리벳 머리가 도드라진다
  head: `
    // 맨 위 고리 철사의 단면 방향(면 좌표)과 철사를 가로지른 자리(-1 안쪽 ~ 1 바깥쪽), 이웃 고리가 드리운 그늘, 철사를 따라간 각도
    vec2 fxRgDir;
    float fxRgU;
    float fxRgSh;
    float fxRgAng;
    // 가장 위 고리: x 철사 단면 볼록함, y 높이(겹 순서 포함, 0 ~ 1), z 고리마다 난수, w 리벳
    vec4 fxRing(vec2 F) {
      fxRgDir = vec2(0.);
      fxRgU = 0.;
      fxRgAng = 0.;
      float nearH = -9.;
      vec2 g = F * vec2(3.4, 6.8);
      vec4 best = vec4(0., -9., 0., 0.);
      float row0 = floor(g.y);
      for (int j = -1; j <= 2; j++) {
        float row = row0 + float(j);
        float odd = mod(row, 2.);
        float off = odd * .5;
        float col0 = floor(g.x - off);
        float tilt = odd < .5 ? .5 : -.5;
        for (int i = -1; i <= 1; i++) {
          vec2 c = vec2(col0 + float(i) + off + .5, row);
          vec2 d = vec2(g.x - c.x, (g.y - c.y) * .5);
          vec2 e = fxRot(tilt) * d;
          e.x /= .8;
          float r = length(e);
          float hw = odd < .5 ? .13 : .105;
          float band = abs(r - .44);
          float hp = clamp((d.x * sign(tilt) * 1.3 + d.y * .45 + .9) / 1.8, 0., 1.);
          if (band > hw) {
            // 철사 바로 바깥: 이 고리가 더 높으면 그 아래로 그늘이 진다
            if (band < hw * 2.) nearH = max(nearH, hp + .2 - (band - hw) / hw * .3);
            continue;
          }
          float u = band / hw;
          float wire = odd < .5 ? 1. - pow(u, 6.) : sqrt(max(0., 1. - u * u));
          float ang = atan(e.y, e.x);
          float rivet = odd < .5 ? 0. : exp(-pow((ang - .8) / .2, 2.));
          // 쐐기 리벳 머리: 겹친 철사 끝 한가운데 동그랗게 솟는다
          vec2 rv = e - vec2(cos(.8), sin(.8)) * .44;
          float head = odd < .5 ? 0. : 1. - smoothstep(.03, .05, length(rv));
          wire = max(wire, head * 1.15);
          float h = hp + wire * (.2 + .12 * rivet);
          if (h > best.y) {
            best = vec4(wire, h, fxH2(c), max(rivet, head));
            fxRgDir = normalize(d + 1e-4);
            fxRgU = (r - .44) / hw * (odd < .5 ? pow(u, 4.) : 1.) * (1. - head);
            fxRgAng = ang;
          }
        }
      }
      fxRgSh = smoothstep(0., .12, nearH - best.y);
      return best;
    }
    float fxMailleH(vec2 p, float seed) {
      vec4 m = fxRing(aHome.xy + p * aHome.z);
      float on = smoothstep(0., .45, m.x);
      return smoothstep(0., .06, fxEdgeAt(p)) * mix(.004, .012 + .036 * m.y, on);
    }`,
  height: 'fxMailleH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec4 fxM = fxRing(fxF);
    float fxHt = fxMailleH(vLocal.xy, vSeed);
    vec3 fxBase = diffuseColor.rgb;
    float fxOn = step(.001, fxM.x);
    float fxAO = smoothstep(.0, .7, fxM.y) * (1. - fxRgSh * .6);
    float fxBrush = .88 + .24 * fxN2(vec2(fxRgAng * 34. + fxM.z * 50., fxRgU * 3.));
    vec3 fxMetal = mix(vec3(.84, .88, .94), fxBase, .78) * (.45 + .55 * fxM.x) * (.55 + .5 * fxAO) * (.88 + .2 * fxM.z) * fxBrush;
    fxMetal *= 1. - fxRgSh * .45;
    fxMetal = mix(fxMetal, vec3(.92, .95, 1.), pow(fxM.x, 10.) * fxAO * .35);
    vec2 fxQd = fxRot(.785) * fxF * 9.;
    float fxQuilt = 1. - smoothstep(0., .08, min(abs(fract(fxQd.x) - .5), abs(fract(fxQd.y) - .5)));
    vec3 fxPad = vec3(.07, .06, .055) * (.7 + .4 * fxN2(fxF * 140.)) * (1. - fxQuilt * .5);
    diffuseColor.rgb = mix(fxPad, fxMetal, fxOn);`,
  normal: `
    normal = fxBump(normal, clamp(fxHt - vLift, -.02, .02) + (1. - fxOn) * fxQuilt * .0006);
    // 둥근 철사 단면: 철사를 가로지르는 쪽으로 법선을 눕힌다
    normal = normalize(normal + (vTx * fxRgDir.x + vTy * fxRgDir.y) * fxRgU * .9 * fxOn);`,
  surface: 'roughnessFactor = mix(.9, .1 + .14 * fxM.z + .2 * (1. - fxAO) + (fxBrush - .88) * .3, fxOn); metalnessFactor = fxOn;',
  emissive: 'totalEmissiveRadiance = vec3(.6, .75, 1.) * fxOn * pow(fxM.x, 6.) * fxFresnel(normal, 1.5) * .35 * fxAO;',
};

B.mithril = {
  color: `diffuseColor.rgb *= .8 + .3 * fxN3(vLocal * 80. + vSeed);`,
  surface: 'roughnessFactor = .35; metalnessFactor = .8;',
};

S.damascus = {
  // 다마스쿠스 강철. 다 맞추면 면 하나가 칼날 한 판이다. 성질이 다른 강철 수백 겹을 접어 두드려 늘였고, 면마다 대장장이가
  // 겹을 다르게 다뤄 무늬가 다르다: 물결(제멋대로 흐르는 겹), 빗방울(송곳 자리마다 동그란 겹 고리), 사다리(가로로 판 홈이
  // 겹을 접어 올린 줄), 꼬임(비튼 막대가 남긴 별과 갈매기 무늬), 깃털(가운데를 갈라 V자로 밀어낸 겹), 바구니(겹 방향이 칸마다
  // 엇갈린 모자이크). 산에 부식시켜 짙은 겹은 패이고 밝은 겹은 거울처럼 남았다. 칸마다 일본 칼처럼 망치 자국(쓰치메)이 오목오목
  // 패였고, 가장자리는 숫돌로 비스듬히 갈아 냈다. 달군 온도에 따라 면마다 산화막 빛깔이 다르다
  head: `
    // 겹 위상: 소수부가 겹 하나
    float fxLayers(vec2 F) {
      vec2 w = F * 1.4 + uFace * 3.3;
      float warp = .2 * fxF2(w) + .05 * fxN2(w * 4.);
      float ph;
      if (uFace < .5) {
        ph = F.y * 1.1 + warp * 1.4;
      } else if (uFace < 1.5) {
        vec2 cc = F * 2.4;
        vec2 cl = fract(cc + vec2(.5 * mod(floor(cc.y), 2.), 0.)) - .5;
        ph = F.y * .9 + warp * .5 + 1.5 * max(0., .44 - length(cl + (fxN2(cc * 3.) - .5) * .06));
      } else if (uFace < 2.5) {
        float k = 1. - abs(fract(F.x * 2.6) - .5) * 2.;
        ph = F.y * 1.1 + warp * .4 + .32 * k * k * k;
      } else if (uFace < 3.5) {
        float band = F.y * 1.7 + warp * .3;
        float ly = fract(band) - .5;
        float a = F.x * 4.4 + floor(band) * 1.3;
        ph = ly * cos(a) * 1.3 + sin(a) * .22 + floor(band) * .31 + warp * .2;
      } else if (uFace < 4.5) {
        float cx = abs(fract(F.x * .9 + .5) - .5);
        ph = F.y * 1.1 + cx * 1.5 + warp * .3;
      } else {
        vec2 cc = fxRot(.785) * F * 1.7 + vec2(fxF2(w * .8), fxF2(w * .8 + 5.)) * .5;
        vec2 cl = fract(cc) - .5;
        ph = (mod(floor(cc.x) + floor(cc.y), 2.) < .5 ? cl.x : cl.y) * .9 + warp * .4 + fxH2(floor(cc)) * .5;
      }
      return ph * 30.;
    }
    float fxDamaH(vec2 p, float seed) {
      vec2 q = p / uSticker.x;
      vec3 v = fxVoronoi(q * 4.2 + seed * 13.);
      float dimple = min(v.x * v.x * 2.6, 1.);
      float bevel = smoothstep(0., .2, fxEdgeAt(p) / uSticker.x);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.006 + .022 * bevel + .016 * dimple * bevel);
    }`,
  height: 'fxDamaH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    float fxHt = fxDamaH(vLocal.xy, vSeed);
    float fxBev = smoothstep(0., .2, fxEdge() / uSticker.x);
    // 숫돌로 간 가장자리에서는 더 깊은 겹이 드러나 무늬가 밀려난다
    float fxPh = fxLayers(fxF) + (1. - fxBev) * 5.;
    float fxAA = fwidth(fxPh);
    float fxL = .5 + .5 * sin(fxPh * 6.2832);
    float fxBright = mix(smoothstep(.32, .68, fxL), .5, smoothstep(.25, .6, fxAA));
    float fxFine = mix(.5 + .5 * sin(fxPh * 6.2832 * 3. + fxN2(fxF * 30.) * 2.), .5, smoothstep(.08, .25, fxAA));
    float fxPit = smoothstep(.55, .85, fxN2(fxF * 260. + uFace)) * (1. - fxBright);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxSteel = mix(vec3(.07, .07, .08), vec3(.8, .81, .82), fxBright) * (.92 + .1 * fxFine);
    vec3 fxC = fxSteel * mix(vec3(1.), fxBase * 1.35, .5 + .3 * fxBright);
    fxC = mix(fxC, mix(vec3(.85), fxBase, .35), (1. - fxBev) * .5);
    float fxScratch = (1. - smoothstep(0., .02, abs(fract(fxF.x * 40. + fxN2(fxF * vec2(3., 60.)) * .5) - .5))) * .08;
    fxC *= (1. - fxScratch) * (1. - fxPit * .35);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, clamp(fxHt - vLift, -.012, .012) + fxBright * .0014 * fxBev + fxFine * .0002 - fxPit * .0004);',
  surface: 'roughnessFactor = mix(.55, .08, fxBright * fxBev) + fxPit * .15 + (1. - fxBev) * .05; metalnessFactor = .95;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .05;',
};

B.damascus = {
  color: `diffuseColor.rgb *= .85 + .2 * fxN2(vec2(fxBodyUV().x * 150., fxBodyUV().y * 3.) + vSeed);`,
  surface: 'roughnessFactor = .3; metalnessFactor = .9;',
};

S.fairywing = {
  // 요정 날개. 다 맞추면 면 하나가 잠자리 날개 같은 날개 한 장이다. 한 귀퉁이 뿌리에서 굵은 세로맥이 부채처럼 뻗는데,
  // 실제 잠자리 날개처럼 맥마다 번갈아 산과 골로 접혀 날개 전체가 병풍처럼 주름졌고(뿌리 쪽은 깊고 끝으로 갈수록 얕다),
  // 가는 가로맥이 맥 사이를 이어 작은 네모 방으로 나눈다. 맥은 대롱처럼 솟아 짙고, 방마다 얇은 막이 면 색으로 비치며
  // 막 두께에 따라 비눗방울처럼 무지갯빛이 돈다. 앞쪽 끝엔 짙은 연문, 막엔 반짝이는 가루가 앉았고 빛이 살랑 흐른다
  head: `
    float fxWCorr;
    // 날개: x 맥(1 맥 위), y 굵은 맥, z 방마다 난수, w 뿌리에서 거리
    vec4 fxWing(vec2 F) {
      vec2 d = F - vec2(-1.3, -1.3);
      float r = length(d);
      float a = atan(d.y, d.x);
      float t = a * 8. + fxN2(vec2(r * 1.2, uFace)) * .7 + r * .3;
      float k = floor(t + .5);
      float ft = t - k;
      float main = 1. - smoothstep(0., .04 + .035 / (1. + r), abs(ft) * r * .55);
      fxWCorr = abs(fract(t * .5) * 2. - 1.) * 2. - 1.;
      fxWCorr *= .3 + .7 * (1. - smoothstep(.6, 3.8, r));
      // 맥 사이를 가로맥이 네모 방으로 나누고, 날개 끝 쪽은 방이 잘게 갈라진다
      float sk = k * 2. + step(0., ft);
      float rr = r * 17. + fxH1(sk) * 1.7;
      float rung = 1. - smoothstep(0., .1, abs(fract(rr + .5) - .5));
      vec3 v = fxVoronoi(vec2(t * 3.2, r * 15.) + uFace * 5.);
      float net = 1. - smoothstep(0., .07, v.y);
      float outer = smoothstep(1.7, 2.6, r);
      float xv = mix(rung, net, outer);
      return vec4(max(main, xv * .6 * (1. - main)), main, mix(fxH1(floor(rr) + sk * 7.), v.z, outer), r);
    }
    float fxWingH(vec2 p, float seed) {
      vec4 w = fxWing(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.01 + .07 * (.5 + .5 * fxWCorr) + .005 * w.y);
    }`,
  height: 'fxWingH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec4 fxWg = fxWing(fxF);
    float fxHt = fxWingH(vLocal.xy, vSeed);
    vec3 fxBase = diffuseColor.rgb;
    float fxStig = (1. - smoothstep(.1, .14, length((fxF - vec2(.55, 1.05)) / vec2(1.7, .7)))) * (1. - fxWg.x);
    float fxThick = fxN2(fxF * 2.5 + uFace * 7. + uTime * .03) + fxWg.z * .4;
    vec3 fxMem = fxBase * (.4 + .16 * fxWg.z) * (.85 + .2 * fxN2(fxF * 9.));
    vec3 fxVein = mix(fxBase * .2, vec3(.1, .07, .05), .55);
    vec3 fxC = mix(fxMem, mix(fxBase * .35, fxVein, fxWg.y), fxWg.x);
    fxC = mix(fxC, mix(fxBase, vec3(.08), .6), fxStig * .85);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, clamp(fxHt - vLift, -.01, .01) + fxWg.x * .0008 + fxWg.y * .0006 + fxN2(fxF * 40.) * .00015);',
  surface: 'roughnessFactor = mix(.06, .38, fxWg.x);',
  emissive: `
    float fxFr = fxFresnel(normal, 1.3);
    vec3 fxIri = .5 + .5 * cos(6.2832 * (fxFr * 1.1 + fxThick * .9 + uTime * .04 + vec3(0., .33, .67)));
    float fxDust = fxGlint(fxF * 60., .25, 1.8);
    totalEmissiveRadiance = (fxBase * .14 + fxIri * fxFr * .55 + vec3(1.) * fxDust * .7) * (1. - fxWg.x * .85) * (1. - fxStig * .8);`,
};

B.fairywing = {
  color: `diffuseColor.rgb *= .8 + .3 * fxN3(vLocal * 40. + vSeed);`,
  surface: 'roughnessFactor = .3;',
  emissive: 'totalEmissiveRadiance = uBodyGlow * .2;',
};

S.dragonegg = {
  // 용의 알. 다 맞추면 면 하나가 거대한 알 껍데기 한 판이다. 껍데기는 돌처럼 굳은 크고 작은 다각형 판으로 이루어져, 판마다
  // 볼록하게 솟고 판 사이 이음매는 골이 졌다. 판 겉엔 오돌토돌한 잔 비늘이 돋았고 검은 점이 흩뿌려졌으며, 보는 각도에 따라
  // 오팔처럼 무지갯빛이 돈다. 곧 깨어나려는지 껍데기를 가로질러 깊은 금이 갔고, 금 가장자리 판은 들떠 솟았으며, 금 속에서
  // 속불이 새어 나와 심장처럼 뛴다. 칸마다 알 껍데기처럼 둥글게 부풀었다. 껍데기 색이 곧 면 색
  head: `
    // 껍데기: x 판 볼록함(0 이음매 ~ 1 판 가운데), y 금(1 금 한가운데), z 판마다 난수, w 금 가장자리 들림
    vec4 fxEgg(vec2 F) {
      vec3 v = fxVoronoi(F * 2.4 + uFace * 3.);
      float plate = smoothstep(0., .25, v.y);
      vec3 cr = fxVoronoi(F * 1.1 + uFace * 5. + 9.);
      float cw = .035 + .02 * fxN2(F * 5. + uFace);
      float cd = cr.y + (fxN2(F * 16. + uFace) - .5) * .05;
      float on = step(.35, cr.z);
      float crack = (1. - smoothstep(cw * .35, cw, cd)) * on;
      float lift = (1. - smoothstep(cw, cw * 4., cd)) * on;
      return vec4(plate, crack, v.z, lift);
    }
    float fxEggH(vec2 p, float seed) {
      vec4 e = fxEgg(aHome.xy + p * aHome.z);
      vec2 q = p / uSticker.x;
      float curve = 1. - dot(q, q) * .3;
      return smoothstep(0., .06, fxEdgeAt(p)) * (.014 + .014 * curve + .024 * e.x * (.8 + .4 * e.z) + .012 * e.w - .036 * e.y);
    }`,
  height: 'fxEggH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec4 fxE = fxEgg(fxF);
    float fxHt = fxEggH(vLocal.xy, vSeed);
    vec3 fxBase = diffuseColor.rgb;
    vec4 fxHx = fxHex(fxF * 16. + uFace * 3.);
    float fxPeb = smoothstep(0., .25, fxHx.w);
    float fxSpot = smoothstep(.66, .8, fxN2(fxF * 7. + uFace * 11.)) * (.6 + .4 * fxE.z);
    vec3 fxC = fxBase * (.3 + .7 * smoothstep(0., .7, fxE.x)) * (.75 + .35 * fxE.z) * (.88 + .18 * fxPeb);
    fxC *= .72 + .45 * fxN2(fxF * 4. + fxE.z * 10.);
    fxC = mix(fxC, fxC * vec3(.8, .75, .7), smoothstep(.5, .8, fxN2(fxF * 13. + uFace)) * .6);
    fxC = mix(fxC, fxBase * .18, fxSpot * .7);
    fxC = mix(fxC, fxBase * 1.3 + .05, fxE.w * (1. - fxE.y) * .3);
    fxC = mix(fxC, vec3(.05, .02, .01), fxE.y);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, clamp(fxHt - vLift, -.02, .02) + fxPeb * .0006 * fxE.x - fxSpot * .0002);',
  surface: 'roughnessFactor = mix(.48, .85, fxE.y) + (1. - fxE.x) * .2 - fxPeb * .1; metalnessFactor = .15 * fxE.x;',
  emissive: `
    float fxBeatE = .55 + .45 * fxBeat();
    float fxFr = fxFresnel(normal, 2.);
    vec3 fxOpal = .5 + .5 * cos(6.2832 * (fxFr * 1.2 + fxE.z * .4 + vec3(0., .33, .67)));
    totalEmissiveRadiance = vec3(1., .36, .06) * fxE.y * fxBeatE * 2.4 + vec3(1., .35, .05) * fxE.w * (1. - fxE.y) * fxBeatE * .25
      + mix(fxBase, fxOpal, .55) * fxFr * .3 * fxE.x;`,
};

B.dragonegg = {
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
  // 셀 애니메이션. 빛을 세 단(그늘, 바탕, 밝은 면)으로 딱 끊어 칠하고 그늘엔 보랏빛이 돈다. 밝은 쪽 가장자리엔 림 라이트,
  // 둥근 모서리엔 매끈한 하이라이트가 한 줄 맺힌다. 스티커 테두리엔 화면에서 늘 같은 굵기의 먹선을 긋는다.
  // 큐브 실루엣과 조각 사이 먹선은 화면 필터(카툰)가 깊이로 긋는다
  color: `
    vec3 fxBase = diffuseColor.rgb;
    float fxEw = max(fwidth(fxEdge()), 1e-4);
    float fxInk = 1. - smoothstep(fxEw * 2.2, fxEw * 3.2, fxEdge());
    diffuseColor.rgb = vec3(0.);`,
  surface: 'roughnessFactor = 1.; metalnessFactor = 0.;',
  emissive: `
    vec3 fxLd = normalize(vec3(-.5, .7, .55));
    vec3 fxV = normalize(vViewPosition);
    float fxNdl = dot(normal, fxLd);
    float fxLit = smoothstep(.08, .11, fxNdl);
    float fxHi = smoothstep(.6, .63, fxNdl);
    vec3 fxCol = mix(fxBase * vec3(.6, .56, .86), fxBase, fxLit);
    fxCol = mix(fxCol, min(fxBase * 1.18, vec3(1.)), fxHi);
    float fxRimL = smoothstep(.6, .64, 1. - abs(dot(normal, fxV))) * fxLit;
    fxCol = mix(fxCol, mix(fxBase, vec3(1.), .3), fxRimL * .7);
    float fxSpec = smoothstep(.95, .96, dot(normal, normalize(fxLd + fxV))) * step(dot(normal, vTz), .99);
    fxCol = mix(fxCol, vec3(1.), fxSpec);
    totalEmissiveRadiance = mix(fxCol, vec3(.07, .06, .11), fxInk);`,
};
B.toon = {
  emissive: `
    vec3 fxLd = normalize(vec3(-.5, .7, .55));
    vec3 fxV = normalize(vViewPosition);
    float fxNdl = dot(normal, fxLd);
    vec3 fxB = diffuse;
    vec3 fxCol = mix(fxB * vec3(.6, .56, .86), fxB, smoothstep(.08, .11, fxNdl));
    fxCol = mix(fxCol, fxB * 1.4, smoothstep(.6, .63, fxNdl));
    fxCol = mix(fxCol, vec3(.8), smoothstep(.99, .993, dot(normal, normalize(fxLd + fxV))) * .6);
    totalEmissiveRadiance = fxCol;
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
  // 비스무트 결정. 칸마다 깔때기(호퍼) 결정이 둘셋 겹쳐 실제로 높이 솟아 있다. 결정마다 바깥 테는 계단처럼 층층이 내려가는
  // 지구라트이고, 안쪽은 계단을 타고 가운데로 깊게 꺼진 네모 우물이다. 크고 작은 결정이 서로 다른 각도와 높이로 엇갈려
  // 자라 올랐다. 얇은 산화막 두께가 단마다 달라 금빛, 자홍, 파랑, 초록으로 단마다 빛깔이 넘어가고, 계단 턱은 은빛 금속이
  // 드러나 날카롭게 번쩍인다. 면마다 도는 빛깔의 중심이 다르다
  head: `
    // 깔때기 결정 하나: x 높이(0~1, 결정 밖이면 -1), y 단 번호, z 계단 턱
    vec3 fxHop(vec2 q, vec2 c, float rot, float L) {
      vec2 p = fxRot(rot) * (q - c) / L;
      float d = max(abs(p.x), abs(p.y));
      if (d > 1.) return vec3(-1., 0., 0.);
      float ring = .58;
      float u = d > ring ? (d - ring) / .084 : (ring - d) / .082;
      float idx = floor(u);
      float h = d > ring ? 1. - idx * .2 : 1. - (idx + 1.) * .15;
      float f = fract(u);
      float riser = 1. - smoothstep(0., .14, min(f, 1. - f) * 2.);
      return vec3(h, idx + (d > ring ? 0. : 6.), riser);
    }
    vec3 fxHopper(vec2 q, float seed) {
      vec3 best = vec3(0., 20., 0.);
      float hb = -1.;
      for (int i = 0; i < 3; i++) {
        float fi = float(i);
        vec2 c = i == 0 ? (vec2(fxH1(seed * 3.), fxH1(seed * 9.)) - .5) * .25
          : (vec2(fxH1(seed * 5. + fi), fxH1(seed * 7. + fi)) - .5) * 1.3;
        float L = i == 0 ? .92 : (.38 + .22 * fxH1(seed * 13. + fi));
        float rot = (fxH1(seed * 17. + fi) - .5) * (i == 0 ? .5 : 1.6);
        float base = i == 0 ? 0. : .25 + .35 * fxH1(seed * 19. + fi);
        vec3 h = fxHop(q, c, rot, L);
        if (h.x < 0.) continue;
        float hh = base + h.x * (i == 0 ? 1. : .75);
        if (hh > hb) { hb = hh; best = vec3(hh, h.y + fi * 13., h.z); }
      }
      return best;
    }
    float fxBismuthH(vec2 p, float seed) {
      vec3 hp = fxHopper(p / uSticker.x, seed);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.006 + .07 * hp.x);
    }`,
  height: 'fxBismuthH',
  color: `
    if (fxEdge() < 0.) discard;
    vec3 fxHp = fxHopper(fxQ(), vSeed);
    float fxHt = fxBismuthH(vLocal.xy, vSeed);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.7), .25) * (.14 + .2 * fxHp.x);`,
  normal: 'normal = fxBump(normal, clamp(fxHt - vLift, -.02, .02) + fxN2(fxQ() * 60. + vSeed) * .0003);',
  surface: 'roughnessFactor = mix(.1, .05, fxHp.z); metalnessFactor = .92;',
  emissive: `
    float fxFr = fxFresnel(normal, 1.5);
    float fxFilm = fxH1(fxHp.y * 3.7 + vSeed) * .55 + fxHp.x * .25 + fxFr * .35 + fxN2(fxQ() * 2.5 + vSeed) * .15 + uFace * .17;
    vec3 fxIr = .5 + .5 * cos(6.2832 * (fxFilm + vec3(0., .33, .67)));
    fxIr = mix(fxIr * fxIr * 1.6, diffuse * 1.3, .32);
    totalEmissiveRadiance = mix(fxIr, vec3(.85), fxHp.z * .6) * (.25 + .35 * fxFr + .25 * fxHp.z) * (.6 + .4 * fxHp.x);`,
};
B.bismuth = {
  surface: 'roughnessFactor = .25; metalnessFactor = 1.;',
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

S.croc = {
  // 악어가죽 가방. 다 맞추면 면 하나가 악어 배 가죽으로 만든 가방 앞판이다. 배 한가운데 열을 기준으로 비늘판이 좌우 거의
  // 대칭으로 줄지어 섰고, 가운데 판은 크고 네모나며 옆으로 갈수록 잘아지다가 옆구리에선 작고 둥근 비늘이 두 줄씩 촘촘해진다.
  // 판마다 쿠션처럼 살짝 부풀어 실제로 솟았고 판 사이 골은 좁고 깊게 접혔다. 배 판마다 아래쪽에 털구멍 자리 점이 하나씩 있다.
  // 마노로 문질러 낸 글레이즈 광택이라 판 꼭대기마다 빛이 맺히고, 염료가 얇아진 꼭대기는 조금 밝고 골은 짙다.
  // 스티커마다 가장자리를 따라 가죽과 같은 빛깔 실로 새들 스티치가 박혔고, 끝은 칠을 먹여 마감했다.
  // 면마다 가방 색이 다르다(블랙, 골드 브라운, 버건디, 네이비, 그린, 가운데가 희고 옆으로 잿빛이 번지는 히말라야)
  head: `
    // 비늘판: x 볼록함(0 골 ~ 1 꼭대기), y 판마다 난수, z 판 가운데 쪽(0 가장자리 ~ 1 가운데), w 털구멍 점
    vec4 fxCroc(vec2 F) {
      vec2 w = F + (vec2(fxN2(F * 2.2 + uFace), fxN2(F * 2.2 + 9. + uFace)) - .5) * .05 + (vec2(fxN2(F * 7. + 3. + uFace), fxN2(F * 7. + 13. + uFace)) - .5) * .025;
      float ax = abs(w.x);
      float x = sign(w.x) * (ax + .9 * ax * ax * ax);
      float flank = step(.64, ax);
      float ry = w.y * 4.6 * (1. + flank) + .1 * sin(ax * 2.5 + uFace) + uFace * .3;
      float row = floor(ry);
      float rx = x * 4.2 + .5 + (fxH1(row + uFace * 7.) - .5) * mix(.14, .4, flank);
      vec2 q = vec2(fract(rx), fract(ry));
      vec2 cell = vec2(floor(rx), row);
      float id = fxH2(cell + uFace * 13.);
      vec2 qq = abs(q - .5) * 2.;
      float pw = mix(9., 3., flank);
      float r = pow(pow(qq.x, pw) + pow(qq.y, pw), 1. / pw);
      float dome = sqrt(max(0., 1. - pow(r, mix(12., 5., flank)))) * (1. - .3 * flank);
      vec2 cs = vec2(1. / (4.2 * (1. + 2.7 * ax * ax)), 1. / (4.6 * (1. + flank)));
      vec2 pd = (q - vec2(.5 + (fxH2(cell + 3.1) - .5) * .3, .27 + .1 * fxH2(cell + 7.7))) * cs;
      float pore = (1. - smoothstep(.005, .01, length(pd))) * (1. - flank) * step(.15, fxH2(cell + 5.5));
      return vec4(dome * (.9 + .1 * id), id, 1. - r, pore);
    }
    // 새들 스티치: x 실, y 바늘구멍. q는 스티커 안 좌표(-1~1)
    vec2 fxCrocStitch(vec2 q) {
      float inset = .84;
      vec2 a = abs(q);
      float along = a.x > a.y ? q.y : q.x;
      float acr = max(a.x, a.y) - inset;
      float u = fract(along * 10. + .5) - .5;
      float st = (1. - smoothstep(.018, .034, abs(acr + u * .04))) * (1. - smoothstep(.3, .38, abs(u)));
      float hole = 1. - smoothstep(.012, .03, length(vec2(abs(u) - .45, acr) * vec2(.08, 1.)));
      float on = step(max(a.x, a.y), inset + .07) * step(min(a.x, a.y), inset);
      return vec2(st, hole) * on;
    }
    float fxCrocH(vec2 p, float seed) {
      vec4 c = fxCroc(aHome.xy + p * aHome.z);
      vec2 s = fxCrocStitch(p / uSticker.x);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.006 + .016 * c.x - .002 * c.w + .003 * s.x - .003 * s.y);
    }`,
  height: 'fxCrocH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec4 fxCr = fxCroc(fxF);
    vec2 fxSt = fxCrocStitch(fxQ());
    vec3 fxBase = diffuseColor.rgb;
    if (uFace > 4.5) fxBase = mix(fxBase, vec3(.4, .38, .36), smoothstep(.2, 1., abs(fxF.x) + .15 * fxN2(fxF * 3.)));
    float fxTop = smoothstep(.6, 1., fxCr.x);
    vec3 fxC = fxBase * (.3 + .75 * smoothstep(0., .45, fxCr.x)) * (.9 + .16 * fxCr.y);
    fxC = mix(fxC, fxBase * 1.18 + .02, fxTop * smoothstep(.1, .45, fxCr.z) * .25);
    fxC *= (1. - fxCr.w * .6) * (.95 + .08 * fxN2(fxF * 70.));
    vec3 fxThread = mix(fxBase, vec3(.9, .88, .82), .14) * 1.12 + .02;
    fxC = mix(fxC, fxThread * (.8 + .2 * fxN2(fxQ() * 90.)), fxSt.x);
    fxC *= 1. - fxSt.y * .4;
    float fxRim = smoothstep(.93, .99, max(abs(fxQ().x), abs(fxQ().y)));
    fxC = mix(fxC, fxBase * .35, fxRim * .8);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxN2(fxF * 260.) * .00012 + smoothstep(0., .3, fxVoronoi(fxF * 150.).y) * .00012 + fxCr.x * .0006 - fxCr.w * .0006);',
  surface: 'roughnessFactor = mix(.62, .16, max(fxTop * (1. - fxSt.x), fxRim * .6));',
  emissive: `
    float fxSpec = pow(max(0., dot(normal, normalize(vec3(-.35, .55, .75)))), 70.) * fxTop * (1. - fxSt.x);
    totalEmissiveRadiance = diffuseColor.rgb * .03 + vec3(1., .98, .95) * fxSpec * .45 + fxBase * fxFresnel(normal, 3.) * fxTop * .08;`,
};

B.croc = {
  // 가방 장식처럼 광을 낸 금속
  color: `diffuseColor.rgb *= .95 + .08 * fxN3(vLocal * 30. + vSeed);`,
  surface: 'roughnessFactor = .3;',
};

S.python = {
  // 비단뱀가죽. 다 맞추면 면 하나가 비단뱀 등가죽 한 장이다. 마름모 비늘이 기와처럼 겹쳐 비늘마다 뒤끝이 들려 실제로 층이
  // 졌고, 들린 끝은 반투명하게 밝으며 그 아래엔 그늘이 진다. 무늬는 비늘 한 장 한 장이 제 색을 가져 모자이크처럼 찍힌다:
  // 밝은 바탕에 짙은 반점, 반점을 두른 검은 테, 반점 가운데 밝은 눈. 비늘 끝은 보는 각도에 따라 살짝 무지갯빛이 돈다.
  // 면마다 바탕이 다르다(내추럴, 차콜, 레드, 코발트, 에메랄드, 화이트)
  head: `
    // 비늘: x 비늘 안 높이(앞 0 → 뒤끝 1), y 들린 끝 테, z 앞쪽 그늘, w 비늘마다 난수
    vec4 fxPyScale(vec2 F, out vec2 center) {
      mat2 R = fxRot(.785398);
      vec2 g = R * (F * vec2(19., 14.)) + uFace * 3.;
      vec2 i = floor(g), f = fract(g);
      center = (transpose(R) * (i + .5 - uFace * 3.)) / vec2(19., 14.);
      float t = (f.x + f.y) * .5;
      float ridge = 1. - abs(f.x - f.y);
      float rim = smoothstep(.86, .99, max(f.x, f.y));
      float shade = 1. - smoothstep(0., .14, min(f.x, f.y));
      return vec4(pow(t, .8) * (.75 + .25 * ridge), rim, shade, fxH2(i));
    }
    // 무늬 단계: 0 바탕, 1 검은 테, 2 반점, 3 반점 속 밝은 눈
    float fxPyBlot(vec2 F) {
      vec2 w = F + (vec2(fxN2(F * 1.7 + uFace), fxN2(F * 1.7 + 5. + uFace)) - .5) * .7 + uFace * 2.;
      float n = fxF2(w * vec2(1.3, 2.1));
      float eye = fxN2(w * 5.);
      if (n > .6 && eye > .62) return 3.;
      if (n > .56) return 2.;
      if (n > .5) return 1.;
      return 0.;
    }
    float fxPythonH(vec2 p, float seed) {
      vec2 ctr;
      vec4 s = fxPyScale(aHome.xy + p * aHome.z, ctr);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.01 + .006 * fxF2(aHome.xy * 2. + p * aHome.z * 2. + uFace));
    }`,
  height: 'fxPythonH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec2 fxCtr;
    vec4 fxS = fxPyScale(fxF, fxCtr);
    float fxK = fxPyBlot(fxCtr + (vec2(fxS.w, fract(fxS.w * 7.3)) - .5) * .03);
    vec3 fxBase = diffuseColor.rgb;
    float fxLum = dot(fxBase, vec3(.3, .59, .11));
    vec3 fxLight = fxLum < .25 ? fxBase * 2.2 + .06 : mix(fxBase, vec3(.95, .9, .8), .12);
    vec3 fxMid = fxLum > .6 ? fxBase * vec3(.6, .55, .5) : fxBase * .6;
    vec3 fxInk = fxLum < .25 ? vec3(.02) : fxBase * .2;
    vec3 fxC = fxK < .5 ? fxLight : (fxK < 1.5 ? fxInk : (fxK < 2.5 ? fxMid : fxLight * .9));
    fxC *= .8 + .3 * fxS.w + .15 * (fxN2(fxCtr * 9.) - .5);
    fxC *= .78 + .3 * fxS.x;
    fxC = mix(fxC, mix(fxC, vec3(.95, .9, .8), .3), fxS.y * .4);
    fxC *= 1. - fxS.z * .3;
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxN2(fxF * 240.) * .0002 + fxS.x * .0012);',
  surface: 'roughnessFactor = .4 - fxS.x * .15;',
  emissive: `totalEmissiveRadiance = diffuseColor.rgb * .03 + (.5 + .5 * cos(6.2832 * (fxFresnel(normal, 1.5) * 1.6 + vec3(0., .33, .67)))) * fxS.y * fxFresnel(normal, 2.) * .15;`,
};

B.python = {
  color: `diffuseColor.rgb *= .85 + .2 * fxN3(vLocal * 60. + vSeed);`,
  surface: 'roughnessFactor = .45;',
};

S.calf = {
  // 소가죽(쉬링크 가공 송아지가죽). 다 맞추면 면 하나가 가방용 가죽 한 장이다. 가죽을 오그려 생긴 굵은 자갈무늬(페블)가
  // 실제로 도톰도톰 솟았고 그 사이로 잔주름이 갈라졌다. 스티커마다 가장자리를 따라 왁스 먹인 실로 새들 스티치가 한 땀씩
  // 비스듬히 박혔고, 바느질 구멍이 실제로 패였다. 면마다 색이 다르다(에투프, 블랙, 오렌지, 블루, 그린, 크림)
  head: `
    // 페블: x 볼록함, y 주름 골
    vec2 fxPebbleG(vec2 F) {
      vec2 w = F + vec2(fxN2(F * 9. + uFace), fxN2(F * 9. + 7. + uFace)) * .04;
      vec3 v = fxVoronoi(w * 26. + uFace * 4.);
      vec3 v2 = fxVoronoi(w * 70. + uFace * 4.);
      float dome = sqrt(max(0., smoothstep(0., .4, v.y)));
      return vec2(dome * .8 + .2 * smoothstep(0., .3, v2.y), 1. - smoothstep(0., .06, v.y));
    }
    // 새들 스티치: x 실, y 바늘구멍. q는 스티커 안 좌표(-1~1)
    vec2 fxSaddle(vec2 q) {
      float inset = .8;
      vec2 a = abs(q);
      float along = a.x > a.y ? q.y : q.x;
      float acr = max(a.x, a.y) - inset;
      float k = fract(along * 9. + .5);
      float u = k - .5;
      float st = (1. - smoothstep(.035, .06, abs(acr + u * .06))) * (1. - smoothstep(.32, .4, abs(u)));
      float hole = 1. - smoothstep(.02, .05, length(vec2(abs(u) - .45, acr) * vec2(.11, 1.)));
      float on = step(max(a.x, a.y), inset + .08) * step(min(a.x, a.y), inset);
      return vec2(st, hole) * on;
    }
    float fxCalfH(vec2 p, float seed) {
      vec2 F = aHome.xy + p * aHome.z;
      vec2 g = fxPebbleG(F);
      vec2 s = fxSaddle(p / uSticker.x);
      float edge = smoothstep(0., .05, fxEdgeAt(p));
      return edge * (.012 + .005 * g.x + .004 * s.x - .004 * s.y - .002 * smoothstep(.9, 1., max(abs(p.x), abs(p.y)) / uSticker.x));
    }`,
  height: 'fxCalfH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec2 fxG = fxPebbleG(fxF);
    vec2 fxSt = fxSaddle(fxQ());
    vec3 fxBase = diffuseColor.rgb;
    float fxLum = dot(fxBase, vec3(.3, .59, .11));
    vec3 fxC = fxBase * (.82 + .2 * fxG.x) * (1. - fxG.y * .2);
    fxC *= .94 + .08 * fxN2(fxF * 6. + uFace);
    vec3 fxThreadC = fxLum < .2 ? vec3(.85, .8, .7) : mix(fxBase, vec3(.96, .94, .88), .75);
    fxC = mix(fxC, fxThreadC * (.8 + .2 * fxN2(fxQ() * vec2(80., 80.))), fxSt.x);
    fxC *= 1. - fxSt.y * .6;
    float fxRim = smoothstep(.93, 1., max(abs(fxQ().x), abs(fxQ().y)));
    fxC = mix(fxC, fxBase * .5, fxRim * .7);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxN2(fxF * 260.) * .0002);',
  surface: 'roughnessFactor = .55 - fxG.x * .1 - fxSt.x * .15;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03;',
};

B.calf = {
  color: `diffuseColor.rgb *= .85 + .2 * fxN3(vLocal * 60. + vSeed);`,
  surface: 'roughnessFactor = .5;',
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


/** 이 질감은 시간에 따라 움직이는가. 움직이면 계속 그려야 한다. */
S.teeth = {
  // 이빨. 조각 하나가 어금니 하나다. 칸마다 커다란 어금니 머리(치관)가 잇몸에서 불룩하게 솟았고, 씹는 면엔 교두 다섯이
  // 봉긋하게 섰다(협측 셋, 설측 둘). 교두마다 끝에서 가운데로 삼각 융선이 내려가고, 교두끼리 맞닿는 골이 그대로 열구가
  // 되어 가운데 우묵(중심와)에서 열십자로 만난다. 열구 바닥엔 누런 착색, 닳은 교두 끝엔 상아질이 노랗게 드러났고 옆벽엔
  // 가는 성장선(주파조)이 돈다. 이 둘레는 번들거리는 잇몸이 감쌌고 이 사이마다 잇몸 꼭지(치간 유두)가 부풀었다.
  // 면마다 이가 다르다(제 법랑질, 금니, 아말감 은니, 커피에 전 이, 썩어 문드러진 이, 피 묻은 이)
  head: `
    float fxMSide;
    float fxMSq;
    float fxMCav;
    float fxMWear;
    float fxMOn;
    vec4 fxMT;
    vec2 fxMolarQ(vec2 p, float seed) {
      vec2 q = p / uSticker.x;
      float k = floor(fxH1(seed * 13.7) * 4.);
      q = fxRot(k * 1.5708 + (fxH1(seed * 5.3) - .5) * .2) * q;
      return q * (1. + (fxH1(seed * 2.9) - .5) * .06);
    }
    // 교두: 자리(xy), 반지름(z), 높이(w). 근심협측, 원심협측, 원심, 근심설측, 원심설측
    vec4 fxCusp(int i) {
      if (i == 0) return vec4(-.42, -.36, .66, 1.);
      if (i == 1) return vec4(.14, -.44, .6, .92);
      if (i == 2) return vec4(.6, -.18, .46, .78);
      if (i == 3) return vec4(-.38, .38, .66, 1.05);
      return vec4(.34, .4, .62, .96);
    }
    // 어금니: x 높이(0 목 ~ 1 교두 끝), y 이 윤곽 안인지, z 열구, w 교두 끝 쪽
    vec4 fxMolar(vec2 p, float seed) {
      vec2 q = fxMolarQ(p, seed);
      float metal = step(abs(uFace - 1.5), .6);
      float rotten = step(abs(uFace - 4.), .5);
      vec2 a = abs(q) / vec2(.9, .86);
      float sq = pow(pow(a.x, 3.2) + pow(a.y, 3.2), 1. / 3.2);
      float side = clamp((1. - sq) / .2, 0., 1.);
      float bulge = sqrt(1. - (1. - side) * (1. - side));
      float broke = floor(fxH1(seed * 9.1) * 5.);
      float m1 = -9.;
      float m2 = -9.;
      for (int i = 0; i < 5; i++) {
        vec4 c = fxCusp(i);
        float fi = float(i);
        c.xy += (vec2(fxH1(seed * 3.1 + fi), fxH1(seed * 4.7 + fi)) - .5) * .08;
        c.w *= (.9 + .2 * fxH1(seed * 6.3 + fi)) * (1. - rotten * .6 * step(abs(fi - broke), .1));
        vec2 d = q - c.xy;
        float r = length(d) / c.z;
        vec2 u = normalize(-c.xy);
        float along = dot(d, u);
        float perp = dot(d, vec2(-u.y, u.x));
        float ridge = exp(-perp * perp / .008) * smoothstep(-.05, .15, along) * max(0., 1. - r);
        float v = c.w * (1.02 - sqrt(r * r + .003)) + .1 * ridge;
        if (v > m1) { m2 = m1; m1 = v; } else if (v > m2) { m2 = v; }
      }
      // 근심·원심 둑(변연 융선)
      float marg = .5 * exp(-pow((sq - .7) / .07, 2.));
      float occ = max(max(m1, marg), .1);
      float crease = (1. - smoothstep(0., mix(.045, .03, metal), m1 - m2)) * step(0., m2) * step(marg, m1);
      float fiss = crease * smoothstep(.45, .8, side);
      // 교두 끝이 닳아 평평하다
      float cap = 1.12 - fxH1(seed * 8.3) * .12 - rotten * .12;
      fxMWear = (1. - metal) * (1. - rotten) * smoothstep(cap - .01, cap, occ + (fxN2(q * 9. + seed) - .5) * .08);
      occ = min(occ, cap) - fiss * .16;
      // 충치 구멍: 썩은 이는 크게 둘, 다른 이는 가끔 작게
      float cav = 0.;
      for (int i = 0; i < 2; i++) {
        float fi = float(i);
        vec2 cc = (vec2(fxH1(seed * 11.3 + fi * 3.), fxH1(seed * 12.9 + fi * 5.)) - .5) * .7;
        float rad = mix(.08, .2, fxH1(seed * 14.1 + fi)) * mix(.6, 1.3, rotten);
        float on = max(rotten, step(.82, fxH1(seed * 15.7 + fi)));
        float dd = length(q - cc) + (fxN2(q * 14. + seed) - .5) * .07;
        cav = max(cav, (1. - smoothstep(rad * .6, rad, dd)) * on);
      }
      cav *= 1. - metal;
      occ -= cav * .55;
      fxMSide = side;
      fxMSq = sq;
      fxMCav = cav;
      float h = bulge * (.36 + .64 * clamp(occ, -.3, 1.3) * smoothstep(0., .35, side));
      return vec4(h, step(sq, 1.), fiss, clamp(m1, 0., 1.2));
    }
    float fxToothH(vec2 p, float seed) {
      vec4 t = fxMolar(p, seed);
      vec2 q0 = p / uSticker.x;
      vec2 pc = abs(q0) - 1.;
      float gum = .012 + .035 * exp(-dot(pc, pc) / .05) + .022 * exp(-pow((fxMSq - 1.03) / .045, 2.)) * (.7 + .5 * fxN2(q0 * 5. + seed));
      float tooth = t.y * (.02 + .19 * t.x);
      fxMT = t;
      fxMOn = step(gum, tooth);
      return smoothstep(0., .05, fxEdgeAt(p)) * max(tooth, gum);
    }`,
  height: 'fxToothH',
  color: `
    if (fxEdge() < 0.) discard;
    float fxHt = fxToothH(vLocal.xy, vSeed);
    vec4 fxTo = fxMT;
    vec2 fxQ0 = vLocal.xy / uSticker.x;
    vec3 fxBase = diffuseColor.rgb;
    float fxMetal = step(abs(uFace - 1.5), .6);
    float fxRotten = step(abs(uFace - 4.), .5);
    // 잇몸: 짙은 분홍 살에 귤껍질 같은 오톨도톨함, 이 목을 감싼 가장자리는 붓고 붉다
    float fxStip = smoothstep(.35, .65, fxN2(fxQ0 * 60. + vSeed));
    vec3 fxGum = vec3(.24, .02, .05) * (.8 + .3 * fxN2(fxQ0 * 7. + vSeed * 3.)) * (.9 + .12 * fxStip);
    fxGum = mix(fxGum, vec3(.55, .1, .13), .5 * exp(-pow((fxMSq - 1.03) / .04, 2.)));
    fxGum = mix(fxGum, vec3(.3, .03, .06), smoothstep(.98, 1., fxMSq) * (1. - smoothstep(1., 1.03, fxMSq)) * .6);
    // 법랑질: 목 쪽은 상아질이 비쳐 누렇고, 교두 끝은 반투명하게 푸르스름하다
    float fxTip = smoothstep(.7, 1.05, fxTo.w) * fxMSide;
    vec3 fxEn = fxBase * (.78 + .3 * fxTo.x);
    fxEn = mix(fxEn, fxBase * vec3(1.02, .86, .6) * .78, (1. - fxMSide) * .55 * (1. - fxMetal));
    fxEn = mix(fxEn, mix(fxBase, vec3(.72, .8, .9), .3) * 1.05, fxTip * .45 * (1. - fxMetal));
    // 열구 바닥 착색, 금속은 거뭇하게 산화
    vec3 fxStain = mix(vec3(.3, .18, .07), fxBase * .2, .25 + .5 * fxMetal);
    fxEn = mix(fxEn, fxStain, fxTo.z * .85);
    // 닳은 교두 끝: 상아질이 드러나 노랗다
    fxEn = mix(fxEn, mix(fxBase, vec3(.86, .7, .42), .55), fxMWear * .6);
    // 충치: 둘레는 분필처럼 하얗게 탈회되고, 속은 검게 썩었다
    float fxHalo = smoothstep(.05, .3, fxMCav) * (1. - smoothstep(.35, .7, fxMCav));
    fxEn = mix(fxEn, vec3(.86, .84, .76), fxHalo * .45 * (1. - fxRotten));
    fxEn = mix(fxEn, vec3(.07, .04, .02), smoothstep(.45, .9, fxMCav));
    float fxAng = atan(fxQ0.y, fxQ0.x);
    // 썩은 이는 거뭇한 얼룩이 번졌다
    fxEn = mix(fxEn, fxEn * vec3(.55, .5, .42), fxRotten * smoothstep(.3, .8, fxN2(fxQ0 * 5. + vSeed * 7.)));
    fxEn = mix(fxEn, vec3(.42, .38, .3), fxRotten * fxHalo * .5);
    // 금속 이는 닦인 결이 돈다
    fxEn *= 1. - fxMetal * .08 * smoothstep(.6, .9, fxN2(vec2(fxMSq * 200., fxAng * 3.)));
    diffuseColor.rgb = mix(fxGum, fxEn, fxMOn);`,
  normal: `
    float fxPeri = sin(fxMSq * 200.) * (1. - fxMSide) * (1. - fxMetal) * (1. - smoothstep(.5, 1.5, fwidth(fxMSq * 200.)));
    normal = fxBump(normal, clamp(fxHt - vLift, -.015, .015) * .7 + (fxMOn * fxPeri * .00015 + (1. - fxMOn) * fxStip * .00015));`,
  surface: `
    roughnessFactor = mix(.4, mix(mix(mix(.12, .45, fxRotten), .2, fxMetal), .55, max(fxTo.z, smoothstep(.5, .9, fxMCav))), fxMOn);
    metalnessFactor = fxMetal * fxMOn * .9;`,
  emissive: `
    totalEmissiveRadiance = fxEn * mix(.05, .14, fxMetal) * fxMOn + vec3(1., .92, .9) * fxFresnel(normal, 4.) * .06;`,
};

B.teeth = {
  // 몸통은 잇몸: 축축하고 짙은 분홍 살
  color: `diffuseColor.rgb *= .78 + .35 * fxN3(vLocal * 24. + vSeed);`,
  surface: 'roughnessFactor = .34;',
};

S.druze = {
  // 정동. 다 맞추면 면 하나가 쪼갠 정동 속이다. 끝이 뾰족한 육각 결정이 크고 작게 빽빽이 실제로 솟아 면마다 빛을 받아
  // 각지게 번쩍이고, 결정 속은 깊은 빛깔로 비치며 끝은 투명하게 맑다. 결정 사이 바탕은 하얀 석영 껍질.
  // 면마다 결정이 다르다(자수정, 황수정, 장미 석영, 수정, 연수정, 녹색 형석)
  head: `
    // 결정: x 높이, y 결정마다 난수, z 끝 쪽(0 바탕 ~ 1 끝)
    vec4 fxCrystal(vec2 F) {
      vec4 best = vec4(0.);
      for (int L = 0; L < 2; L++) {
        float s = L == 0 ? 2.4 : 5.;
        vec4 hx = fxHex(fxRot(float(L) * .5) * F * s + uFace * 3. + float(L) * 7.);
        float tall = (L == 0 ? 1. : .5) * (.45 + .55 * hx.z);
        float tip = clamp(hx.w * 2.2, 0., 1.);
        float h = tip * tall;
        float facet = fract(floor((atan(hx.y, hx.x) + 3.1416) / 1.0472) * .37 + hx.z * 3.);
        if (h > best.x) best = vec4(h, hx.z + float(L), tip, facet);
      }
      return best;
    }
    float fxCrystalH(vec2 p, float seed) {
      vec4 c = fxCrystal(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + .22 * c.x);
    }`,
  height: 'fxCrystalH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec4 fxCr = fxCrystal(fxF);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxDeep = fxBase * fxBase * .9;
    vec3 fxC = mix(fxDeep, mix(fxBase, vec3(.95), .35), smoothstep(.3, 1., fxCr.z)) * (.65 + .6 * fxCr.w);
    fxC = mix(vec3(.85, .84, .82) * (.8 + .3 * fxN2(fxF * 150.)), fxC, smoothstep(.02, .12, fxCr.x));
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxN2(fxF * 250.) * .0001);',
  surface: 'roughnessFactor = .08;',
  emissive: 'totalEmissiveRadiance = fxBase * fxCr.x * .25 + vec3(1.) * fxGlint(fxF * 30., .25, 2.) * .8 + vec3(1.) * fxFresnel(normal, 4.) * .1;',
};

B.druze = {
  color: `diffuseColor.rgb *= .75 + .4 * fxN3(vLocal * 40. + vSeed);`,
  surface: 'roughnessFactor = .7;',
};

S.pave = {
  // 파베 세팅 보석. 다 맞추면 면 하나가 보석을 빈틈없이 박은 장신구 면이다. 브릴리언트 컷 보석이 벌집처럼 박혀 저마다
  // 실제로 솟았고, 평평한 윗면(테이블)을 별 모양 패싯이 둘러 각도마다 빛을 갈라 번쩍인다. 보석 사이엔 금 구슬 발이 물렸다.
  // 면마다 보석이 다르다(루비, 사파이어, 에메랄드, 다이아몬드, 황수정, 자수정)
  head: `
    // 보석: x 높이, y 보석 위, z 패싯 번호, w 금 구슬
    vec4 fxGem(vec2 F) {
      vec4 hx = fxHex(F * 4.2 + uFace * 2.);
      float r = length(hx.xy) / .5;
      float on = 1. - smoothstep(.86, .9, r);
      float a = atan(hx.y, hx.x);
      float facet = floor((a / 6.2832 + .5) * 16.);
      float table = 1. - smoothstep(.42, .45, r);
      float h = on * mix(.95 - (r - .45) * .6 + (fract(facet * .5) - .25) * .04, 1., table);
      vec2 bp = hx.xy;
      float bead = 0.;
      for (int i = 0; i < 6; i++) {
        float ba = float(i) * 1.0472 + .5236;
        bead = max(bead, 1. - smoothstep(.06, .08, length(bp - vec2(cos(ba), sin(ba)) * .5)));
      }
      h = max(h, bead * .75 + (1. - on) * .45);
      return vec4(h, on * (1. - bead), facet + hx.z * 16., bead);
    }
    float fxGemH(vec2 p, float seed) {
      vec4 g = fxGem(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + .07 * g.x);
    }`,
  height: 'fxGemH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec4 fxGe = fxGem(fxF);
    vec3 fxBase = diffuseColor.rgb;
    float fxFb = fxH1(fxGe.z * 3.7 + floor(uTime * 1.5) * .0);
    vec3 fxGemC = fxBase * (.35 + .9 * fxFb);
    vec3 fxGold = vec3(.95, .75, .35) * (.8 + .3 * fxN2(fxF * 120.));
    vec3 fxC = mix(fxGold, fxGemC, fxGe.y);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxN2(fxF * 300.) * .00015);',
  surface: 'roughnessFactor = mix(.25, .05, fxGe.y); metalnessFactor = 1. - fxGe.y;',
  emissive: 'totalEmissiveRadiance = fxBase * fxGe.y * (.25 + .4 * fxFb) + vec3(1.) * fxGe.y * fxGlint(fxF * 40., .3, 2.5) * 1.2;',
};

B.pave = {
  color: `diffuseColor.rgb *= .85 + .2 * fxN3(vLocal * 60. + vSeed);`,
  surface: 'roughnessFactor = .25; metalnessFactor = 1.;',
};

S.pinstripe = {
  // 핀스트라이프 수트 천. 다 맞추면 면 하나가 한 폭의 소모사 양복감이다. 면 색 날실·씨실을 2/2 능직으로 촘촘히 짜고
  // 열여섯 올마다 밝은 날실 한 올(핀)을 끼웠다. 핀 실만 3/1로 걸어 씨실 세 올 위로 떴다가 한 올 밑으로 들어가므로, 가까이서는
  // 능직 사선 따라 잘게 끊긴 가는 줄, 멀리서는 곧은 실금으로 보인다. 뜬 실은 가운데가 솟고 엇갈리는 자리에서 파고들어
  // 비스듬한 능선이 도드라지고, 실마다 빛깔이 조금씩 다르며, 고운 소모사라 은은히 윤이 난다
  head: WEAVE + `
    // 열여섯 올마다 한 올이 핀 실
    float fxIsPin(float i) { return 1. - step(.5, abs(mod(i, 16.) - 8.)); }
    // 2/2 능직: 날실이 씨실 두 올 위로 떴다가 두 올 밑으로, 한 올마다 한 칸씩 밀린다. 핀 실만 3/1(세 올 위, 한 올 밑)
    float fxUp(vec2 c) { return step(mod(c.x + c.y, 4.), 1.5 + fxIsPin(c.x)); }
    // 짜임 속 실 한 올. x 위에 뜬 실이 날실(1)인지 씨실(0)인지, y 날실 번호, z 씨실 번호,
    // w 높이(0 실 사이 틈 ~ 1 뜬 실 한가운데 꼭대기). 뜬 실은 가운데가 솟고, 양 끝에서 엇갈린 실 밑으로 파고든다(크림프).
    // k는 실 단면: .5 둥근 실, 작을수록 납작하게 눌린 실
    vec4 fxLoom(vec2 F, float n, float k) {
      vec2 T = (F + 1.) * n * .5;
      vec2 c = floor(T), f = fract(T);
      float up = fxUp(c);
      vec2 d = up > .5 ? vec2(0., 1.) : vec2(1., 0.);
      float a = up > .5 ? f.y : f.x;
      float b = up > .5 ? f.x : f.y;
      float s0 = 0., s1 = 0.;
      for (int i = 1; i < 4; i++) { if (abs(fxUp(c - d * float(i)) - up) > .5) break; s0 += 1.; }
      for (int i = 1; i < 4; i++) { if (abs(fxUp(c + d * float(i)) - up) > .5) break; s1 += 1.; }
      float u = (s0 + a) / (s0 + s1 + 1.);
      float x = 2. * b - 1.;
      return vec4(up, c.x, c.y, pow(max(1. - x * x, 0.), k) * pow(sin(3.1416 * u), .45));
    }
    // 주기 p마다 [s, s+w) 올에 걸친 줄이 한 픽셀 폭(fw) 안에서 차지하는 비율. 멀리서 가는 줄이 끊기거나 깜빡이지 않게
    float fxPulseI(float t, float p, float s, float w) { float u = t - s; float q = floor(u / p); return q * w + clamp(u - q * p, 0., w); }
    float fxCover(float x, float fw, float p, float s, float w) {
      fw = max(fw, 1e-3);
      return (fxPulseI(x + fw * .5, p, s, w) - fxPulseI(x - fw * .5, p, s, w)) / fw;
    }
    // 면마다 핀 실 빛깔: 남색엔 흰 실, 차콜엔 은회색, 갈색엔 크림, 초록엔 금빛, 와인엔 분홍빛, 밝은 회색엔 남색
    vec3 fxPinC() {
      return uFace < .5 ? vec3(.93, .93, .9) : uFace < 1.5 ? vec3(.8, .84, .9) : uFace < 2.5 ? vec3(.94, .86, .68)
        : uFace < 3.5 ? vec3(.9, .74, .38) : uFace < 4.5 ? vec3(.96, .8, .8) : vec3(.1, .16, .36);
    }`,
  height: 'fxDrapeH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    float fxN = 156.;
    vec4 fxW = fxLoom(fxF, fxN, .3);
    vec2 fxT = (fxF + 1.) * fxN * .5;
    float fxAA = smoothstep(.45, 1.2, max(fwidth(fxT.x), fwidth(fxT.y)));
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxPin = fxPinC();
    float fxPinEnd = fxIsPin(fxW.y);
    vec3 fxWarp = mix(fxBase * (.9 + .16 * fxH1(fxW.y * 1.7 + 3.1)), fxPin, fxPinEnd);
    vec3 fxWeft = fxBase * (.8 + .1 * fxH1(fxW.z * 2.3 + 1.7));
    // 핀 실은 굵고 윤이 나서, 묶어 누르는 씨실 한 올 양옆으로도 살짝 비친다
    fxWeft = mix(fxWeft, fxPin * .8, fxPinEnd * .3);
    // 멀리서: 핀 실이 픽셀 안에서 차지하는 만큼만 섞는다
    float fxCov = fxCover(fxT.x, fwidth(fxT.x), 16., 8., 1.);
    vec3 fxFar = mix(fxBase * .92, fxPin * .75 + fxBase * .2, fxCov);
    vec3 fxY = mix(fxW.x > .5 ? fxWarp : fxWeft, fxFar, fxAA);
    diffuseColor.rgb = fxThread(fxY, fxW, fxF, fxN, fxAA);
    float fxRelief = (pow(fxW.w, .8) * (.0034 + .0008 * fxPinEnd * fxW.x) + fxPly(fxF, fxN, fxW) * .0003) * (1. - fxAA);`,
  normal: 'normal = fxBump(normal, fxRelief);',
  surface: 'roughnessFactor = .64;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * (fxFresnel(normal, 2.) * .14 + pow(fxW.w, 6.) * .14 * (1. - fxAA));',
};

B.pinstripe = {
  // 양복 안감처럼 매끈한 공단
  color: `diffuseColor.rgb *= .9 + .12 * fxN3(vLocal * vec3(6., 6., 90.) + vSeed);`,
  surface: 'roughnessFactor = .38;',
};

S.windowpane = {
  // 윈도페인. 다 맞추면 면 하나가 한 폭의 모직 재킷감이다. 면 색 날실과 조금 짙은 씨실을 2/2 능직으로 짠 무지 바탕에,
  // 스물네 올마다 대비색 날실 세 올과 씨실 세 올을 걸어 커다란 창살 칸을 냈다. 줄도 능직이라 바탕 위를 지날 때는 가장자리가
  // 사선 계단처럼 어긋나고, 날실 줄과 씨실 줄이 만나는 자리만 꽉 찬 색이 된다. 칸이 조각보다 커서 다 맞추면 창살이 면 전체로
  // 이어진다. 섞어 자은 모사의 털빛과 잔털, 비스듬한 능선
  head: WEAVE + `
    float fxUp(vec2 c) { return step(mod(c.x + c.y, 4.), 1.5); }
    // 짜임 속 실 한 올. x 위에 뜬 실이 날실(1)인지 씨실(0)인지, y 날실 번호, z 씨실 번호,
    // w 높이(0 실 사이 틈 ~ 1 뜬 실 한가운데 꼭대기). 뜬 실은 가운데가 솟고, 양 끝에서 엇갈린 실 밑으로 파고든다(크림프).
    // k는 실 단면: .5 둥근 실, 작을수록 납작하게 눌린 실
    vec4 fxLoom(vec2 F, float n, float k) {
      vec2 T = (F + 1.) * n * .5;
      vec2 c = floor(T), f = fract(T);
      float up = fxUp(c);
      vec2 d = up > .5 ? vec2(0., 1.) : vec2(1., 0.);
      float a = up > .5 ? f.y : f.x;
      float b = up > .5 ? f.x : f.y;
      float s0 = 0., s1 = 0.;
      for (int i = 1; i < 4; i++) { if (abs(fxUp(c - d * float(i)) - up) > .5) break; s0 += 1.; }
      for (int i = 1; i < 4; i++) { if (abs(fxUp(c + d * float(i)) - up) > .5) break; s1 += 1.; }
      float u = (s0 + a) / (s0 + s1 + 1.);
      float x = 2. * b - 1.;
      return vec4(up, c.x, c.y, pow(max(1. - x * x, 0.), k) * pow(sin(3.1416 * u), .45));
    }
    // 주기 p마다 [s, s+w) 올에 걸친 줄이 한 픽셀 폭(fw) 안에서 차지하는 비율. 멀리서 가는 줄이 끊기거나 깜빡이지 않게
    float fxPulseI(float t, float p, float s, float w) { float u = t - s; float q = floor(u / p); return q * w + clamp(u - q * p, 0., w); }
    float fxCover(float x, float fw, float p, float s, float w) {
      fw = max(fw, 1e-3);
      return (fxPulseI(x + fw * .5, p, s, w) - fxPulseI(x - fw * .5, p, s, w)) / fw;
    }
    // 면마다 창살 실 빛깔: 회색엔 녹슨 주황, 낙타색엔 짙은 밤색, 남색엔 하늘색, 올리브엔 겨자색, 와인엔 크림, 생지엔 남색
    vec3 fxPaneC() {
      return uFace < .5 ? vec3(.78, .3, .12) : uFace < 1.5 ? vec3(.2, .11, .06) : uFace < 2.5 ? vec3(.6, .76, .95)
        : uFace < 3.5 ? vec3(.9, .7, .22) : uFace < 4.5 ? vec3(.92, .84, .66) : vec3(.12, .2, .44);
    }`,
  height: 'fxDrapeH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    float fxN = 105.;
    vec4 fxW = fxLoom(fxF, fxN, .4);
    vec2 fxT = (fxF + 1.) * fxN * .5;
    float fxAA = smoothstep(.45, 1.2, max(fwidth(fxT.x), fwidth(fxT.y)));
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxLine = fxPaneC();
    // 무지 바탕도 실마다 빛깔이 조금씩 달라 섞인 털빛이 난다
    vec3 fxWarpG = fxBase * (.9 + .16 * fxH1(fxW.y * 1.3 + 7.));
    vec3 fxWeftG = fxBase * (.78 + .12 * fxH1(fxW.z * 2.7 + 3.));
    // 24올마다 15~17번 올이 창살 실(면 가운데를 두고 좌우 대칭)
    float fxLx = 1. - step(1.5, abs(mod(fxW.y, 24.) - 16.));
    float fxLy = 1. - step(1.5, abs(mod(fxW.z, 24.) - 16.));
    vec3 fxWarp = mix(fxWarpG, fxLine, fxLx);
    vec3 fxWeft = mix(fxWeftG, fxLine * .92, fxLy);
    vec2 fxFw = fwidth(fxT);
    float fxCx = fxCover(fxT.x, fxFw.x, 24., 15., 3.);
    float fxCy = fxCover(fxT.y, fxFw.y, 24., 15., 3.);
    vec3 fxFar = mix(mix(fxBase * .9, (fxLine + fxBase * .84) * .5, fxCx), mix((fxBase * .98 + fxLine) * .5, fxLine, fxCx), fxCy);
    vec3 fxY = mix(fxW.x > .5 ? fxWarp : fxWeft, fxFar, fxAA);
    float fxHair = fxStray(vLocal.xy, vSeed) * .7;
    diffuseColor.rgb = mix(fxThread(fxY, fxW, fxF, fxN, fxAA), fxY * 1.2 + .04, fxHair * .3);
    float fxRelief = (pow(fxW.w, .7) * .0042 + fxPly(fxF, fxN, fxW) * .0004) * (1. - fxAA) + fxHair * .0005;`,
  normal: 'normal = fxBump(normal, fxRelief);',
  surface: 'roughnessFactor = .86;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * (fxFresnel(normal, 1.4) * .35 + pow(fxW.w, 8.) * .08 * (1. - fxAA));',
};

B.windowpane = {
  color: `diffuseColor.rgb *= .85 + .2 * fxN3(vLocal * 80. + vSeed);`,
  surface: 'roughnessFactor = .9;',
};

S.buffalo = {
  // 버팔로 체크. 다 맞추면 면 하나가 한 폭의 나무꾼 플란넬이다. 면 색 실 스무 올과 검은 실 열네 올을 날실과 씨실에 똑같이
  // 번갈아 걸고 2/2 능직으로 짜서, 둘 다 면 색인 칸은 꽉 찬 색, 둘 다 검은 칸은 검정, 섞인 칸은 사선 능직 결이 보이는
  // 반반 칸이 된다. 칸이 조각보다 커서 다 맞추면 면 가운데에 큰 색 칸이 오고 검은 칸 넷이 둘러싼다. 짠 뒤 철솔로 긁어
  // 털을 일으켜서(기모) 겉털이 실 한두 올 너비만큼 넘나들어 칸 경계가 보송하게 번지고, 실 사이 틈이 털로 메워져 능직 결이
  // 부드럽게 흐려졌다. 한쪽으로 쓸린 겉털 결, 털끝이 빛을 받아 살짝 희끗한 검은 칸, 비스듬히 보면 보드랍게 도는 윤
  head: WEAVE + `
    float fxUp(vec2 c) { return step(mod(c.x + c.y, 4.), 1.5); }
    // 짜임 속 실 한 올. x 위에 뜬 실이 날실(1)인지 씨실(0)인지, y 날실 번호, z 씨실 번호,
    // w 높이(0 실 사이 틈 ~ 1 뜬 실 한가운데 꼭대기). 뜬 실은 가운데가 솟고, 양 끝에서 엇갈린 실 밑으로 파고든다(크림프).
    // k는 실 단면: .5 둥근 실, 작을수록 납작하게 눌린 실
    vec4 fxLoom(vec2 F, float n, float k) {
      vec2 T = (F + 1.) * n * .5;
      vec2 c = floor(T), f = fract(T);
      float up = fxUp(c);
      vec2 d = up > .5 ? vec2(0., 1.) : vec2(1., 0.);
      float a = up > .5 ? f.y : f.x;
      float b = up > .5 ? f.x : f.y;
      float s0 = 0., s1 = 0.;
      for (int i = 1; i < 4; i++) { if (abs(fxUp(c - d * float(i)) - up) > .5) break; s0 += 1.; }
      for (int i = 1; i < 4; i++) { if (abs(fxUp(c + d * float(i)) - up) > .5) break; s1 += 1.; }
      float u = (s0 + a) / (s0 + s1 + 1.);
      float x = 2. * b - 1.;
      return vec4(up, c.x, c.y, pow(max(1. - x * x, 0.), k) * pow(sin(3.1416 * u), .45));
    }
    // 서른네 올 한 벌: 면 색(1) 스무 올, 검정(0) 열네 올. 면 가운데(42번 올)가 면 색 칸 한가운데
    float fxBlock(float i) { return step(mod(i - 32., 34.), 19.5); }`,
  height: 'fxDrapeH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    float fxN = 84.;
    vec4 fxW = fxLoom(fxF, fxN, .5);
    vec2 fxT = (fxF + 1.) * fxN * .5;
    float fxAA = smoothstep(.45, 1.2, max(fwidth(fxT.x), fwidth(fxT.y)));
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxBlack = vec3(.03, .028, .028);
    // 기모: 칸 경계에서 겉털이 이웃 칸 빛깔을 실 한두 올 너비만큼 끌고 들어온다
    vec2 fxNap = (vec2(fxN2(fxT * .9 + 3.1), fxN2(fxT * .9 + 17.7)) - .5) * 1.7 + (vec2(fxN2(fxT * 3.3), fxN2(fxT * 3.3 + 9.)) - .5) * 1.1;
    vec3 fxWarp = mix(fxBlack, fxBase, fxBlock(fxW.y + fxNap.x));
    vec3 fxWeft = mix(fxBlack, fxBase * .9, fxBlock(fxW.z + fxNap.y));
    // 털이 덮여 가까이서도 날실·씨실 빛깔이 조금 섞인다
    vec3 fxY = mix(fxW.x > .5 ? fxWarp : fxWeft, (fxWarp + fxWeft) * .5, max(fxAA, .2));
    // 겉털 한 올 한 올: 한쪽으로 비스듬히 쓸린 가는 결
    vec2 fxFp = fxRot(.5) * vLocal.xy;
    float fxFib = fxN2(fxFp * vec2(260., 24.) + vSeed * 9.) * .6 + fxN2(fxFp * vec2(520., 40.) + 4.) * .4;
    float fxFuzz = fxN2(vLocal.xy * 220. + vSeed * 3.);
    vec4 fxWs = vec4(fxW.xyz, mix(fxW.w, .75, .45));
    vec3 fxC = fxThread(fxY, fxWs, fxF, fxN, fxAA) * (.88 + .24 * fxFib);
    // 겉털 안개: 실 두세 올 떨어진 자리의 섞인 빛깔이 털에 실려 와 결 위를 뿌옇게 덮는다
    vec2 fxTh = fxT + fxNap * 1.3;
    vec3 fxHaze = (mix(fxBlack, fxBase, fxBlock(fxTh.x)) + mix(fxBlack, fxBase * .9, fxBlock(fxTh.y))) * .5;
    fxC = mix(fxC, fxHaze * (.9 + .2 * fxFib), (.2 + .3 * smoothstep(.35, .8, fxFib)) * (1. - fxAA));
    // 털끝이 빛을 받아 짙은 칸도 살짝 희끗하다
    diffuseColor.rgb = fxC + vec3(.03, .028, .026) * smoothstep(.5, .85, fxFib) + fxY * .05 * fxFuzz;
    float fxRelief = pow(fxW.w, .7) * .0028 * (1. - fxAA) + fxFib * .0008 + fxFuzz * .0005;`,
  normal: 'normal = fxBump(normal, fxRelief);',
  surface: 'roughnessFactor = 1.;',
  emissive: 'totalEmissiveRadiance = (diffuseColor.rgb * .8 + .03) * fxFresnel(normal, 1.2) * .55;',
};

B.buffalo = {
  // 오두막 통나무
  color: `diffuseColor.rgb *= .8 + .3 * fxN3(vLocal * vec3(4., 60., 4.) + vSeed);`,
  surface: 'roughnessFactor = .75;',
};

S.madras = {
  // 마드라스. 다 맞추면 면 하나가 한 폭의 인도 손베틀 면직이다. 면 색 바탕에 짙은 색, 흰색, 이웃한 두 빛깔, 밝은 가는 줄을
  // 고르지 않은 폭으로 늘어놓은 실 순서를 날실과 씨실에 서로 다르게 걸어 칸이 들쭉날쭉한 체크가 되고, 평직이라 올이
  // 하나 걸러 하나씩 엇갈린다. 손으로 자은 굵고 가는 마디(슬럽)가 실마다 불규칙하게 맺혀 그 자리는 실이 굵고 도톰하며,
  // 가는 자리엔 실 사이 틈이 벌어진다. 물이 빠지는 식물 염료라 실 빛깔이 이웃 줄로 번지고 군데군데 바랬다
  head: WEAVE + `
    // 날실 순서(48올): 0 바탕 1 짙은 색 2 흰색 3 이웃 빛깔 4 다른 이웃 빛깔 5 밝은 가는 줄. 바탕이 열에 여섯
    float fxSettX(float i) {
      float s = mod(i, 48.);
      if (s < 12.) return 0.;
      if (s < 14.) return 2.;
      if (s < 17.) return 0.;
      if (s < 22.) return 1.;
      if (s < 25.) return 3.;
      if (s < 26.) return 5.;
      if (s < 29.) return 3.;
      if (s < 31.) return 1.;
      if (s < 41.) return 0.;
      if (s < 44.) return 4.;
      return 0.;
    }
    // 씨실 순서(44올). 날실과 달라서 칸이 길쭉하고 대칭이 아니다
    float fxSettY(float i) {
      float s = mod(i, 44.);
      if (s < 10.) return 0.;
      if (s < 13.) return 1.;
      if (s < 14.) return 2.;
      if (s < 17.) return 1.;
      if (s < 25.) return 0.;
      if (s < 30.) return 4.;
      if (s < 31.) return 5.;
      if (s < 32.) return 4.;
      if (s < 36.) return 3.;
      return 0.;
    }
    // 빛깔 고리를 a만큼 돌린다(YIQ)
    vec3 fxHueTurn(vec3 c, float a) {
      float y = dot(c, vec3(.299, .587, .114));
      vec2 iq = vec2(dot(c, vec3(.596, -.274, -.322)), dot(c, vec3(.211, -.523, .312)));
      iq = vec2(iq.x * cos(a) - iq.y * sin(a), iq.x * sin(a) + iq.y * cos(a));
      return clamp(vec3(y + .956 * iq.x + .621 * iq.y, y - .272 * iq.x - .647 * iq.y, y - 1.106 * iq.x + 1.703 * iq.y), 0., 1.);
    }
    // 실 빛깔. 짙은 색은 바탕을 짙게 물들인 것, 이웃 빛깔은 바탕에서 빛깔 고리를 조금만 돌린 것이라 면마다 바탕색이 주인이다
    vec3 fxMadC(float k, vec3 base) {
      if (k < .5) return base;
      if (k < 1.5) return fxHueTurn(base, -.15) * .28;
      if (k < 2.5) return vec3(.93, .9, .8);
      if (k < 3.5) return mix(fxHueTurn(base, .45), vec3(1.), .15);
      if (k < 4.5) return fxHueTurn(base, -.5) * .62;
      return mix(fxHueTurn(base, 3.1), vec3(1.), .35);
    }
    // 번진 실 빛깔: 염료가 빠진 자리에서 양옆 두 올까지 빛깔이 섞인다. s는 실 길이 방향 좌표
    vec3 fxBleed(float i, float s, vec3 base, float warp) {
      vec3 c0 = fxMadC(warp > .5 ? fxSettX(i) : fxSettY(i), base);
      vec3 c1 = fxMadC(warp > .5 ? fxSettX(i - 1.) : fxSettY(i - 1.), base) + fxMadC(warp > .5 ? fxSettX(i + 1.) : fxSettY(i + 1.), base);
      vec3 c2 = fxMadC(warp > .5 ? fxSettX(i - 2.) : fxSettY(i - 2.), base) + fxMadC(warp > .5 ? fxSettX(i + 2.) : fxSettY(i + 2.), base);
      float b = smoothstep(.3, .8, fxN2(vec2(s * .07, i * .21 + warp * 13.))) * .7 + .12;
      return mix(c0, (c0 * 2. + c1 + c2 * .5) / 5., b);
    }
    // 평직 한 올: x 날실이 위인지, y 날실 번호, z 씨실 번호, w 높이. 마디(슬럽) 자리는 굵고 높으며 가는 자리엔 틈이 난다
    vec4 fxLoomS(vec2 F, float n) {
      vec2 T = (F + 1.) * n * .5;
      vec2 c = floor(T), f = fract(T);
      float up = mod(c.x + c.y, 2.);
      float id = up > .5 ? c.x : c.y + 517.;
      float along = up > .5 ? T.y : T.x;
      float a = up > .5 ? f.y : f.x;
      float b = up > .5 ? f.x : f.y;
      float th = .74 + .24 * fxN2(vec2(along * .3, id * 1.9)) + .32 * smoothstep(.7, .92, fxN2(vec2(along * .7 + 3., id * 2.7)));
      float x = (2. * b - 1.) / min(th, 1.06);
      return vec4(up, c.x, c.y, pow(max(1. - x * x, 0.), .5) * pow(sin(3.1416 * a), .5) * min(th, 1.12));
    }`,
  height: 'fxDrapeH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    float fxN = 96.;
    vec4 fxW = fxLoomS(fxF, fxN);
    vec2 fxT = (fxF + 1.) * fxN * .5;
    float fxAA = smoothstep(.45, 1.2, max(fwidth(fxT.x), fwidth(fxT.y)));
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxWarp = fxBleed(fxW.y, fxT.y, fxBase, 1.);
    vec3 fxWeft = fxBleed(fxW.z, fxT.x, fxBase, 0.) * .94;
    vec3 fxY = mix(fxW.x > .5 ? fxWarp : fxWeft, (fxWarp + fxWeft) * .5, fxAA);
    // 빨래하며 바랜 얼룩: 군데군데 빛이 빠지고 옅어졌다
    float fxFade = fxF2(fxF * 3.2 + uFace * 7.);
    fxY = mix(fxY, vec3(dot(fxY, vec3(.3, .59, .11))) * 1.08 + .03, smoothstep(.45, .8, fxFade) * .35);
    diffuseColor.rgb = fxThread(fxY, fxW, fxF, fxN, fxAA);
    float fxRelief = (pow(fxW.w, .7) * .0042 + fxPly(fxF, fxN, fxW) * .0003) * (1. - fxAA);`,
  normal: 'normal = fxBump(normal, fxRelief);',
  surface: 'roughnessFactor = .82;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * (fxFresnel(normal, 1.6) * .22 + pow(clamp(fxW.w, 0., 1.), 8.) * .1 * (1. - fxAA));',
};

B.madras = {
  // 햇볕에 바랜 등나무
  color: `diffuseColor.rgb *= .85 + .2 * fxN3(vLocal * vec3(70., 4., 70.) + vSeed);`,
  surface: 'roughnessFactor = .7;',
};

S.seersucker = {
  // 시어서커. 다 맞추면 면 하나가 한 폭의 여름 면직이다. 날실을 두 빔에 나눠 감아, 면 색 날실 아홉 올은 느슨하게,
  // 흰 날실 일곱 올은 팽팽하게 걸고 평직으로 짰다. 바디로 씨실을 칠 때마다 느슨한 날실이 남는 길이만큼 위아래로 오글오글
  // 접혀 올라와, 색 줄은 가로로 잔주름이 잡힌 물집처럼 실제로 부풀고(주름 골엔 그늘이 진다) 흰 줄은 납작하게 남는다.
  // 씨실이 옅게 물든 실이라 흰 줄에도 면 색이 살짝 돈다. 주름은 면 좌표로 계산해 다 맞추면 줄과 주름이 면 전체로 이어진다
  head: WEAVE + `
    float fxUp(vec2 c) { return mod(c.x + c.y, 2.); }
    // 짜임 속 실 한 올. x 위에 뜬 실이 날실(1)인지 씨실(0)인지, y 날실 번호, z 씨실 번호,
    // w 높이(0 실 사이 틈 ~ 1 뜬 실 한가운데 꼭대기). 뜬 실은 가운데가 솟고, 양 끝에서 엇갈린 실 밑으로 파고든다(크림프).
    // k는 실 단면: .5 둥근 실, 작을수록 납작하게 눌린 실
    vec4 fxLoom(vec2 F, float n, float k) {
      vec2 T = (F + 1.) * n * .5;
      vec2 c = floor(T), f = fract(T);
      float up = fxUp(c);
      vec2 d = up > .5 ? vec2(0., 1.) : vec2(1., 0.);
      float a = up > .5 ? f.y : f.x;
      float b = up > .5 ? f.x : f.y;
      float s0 = 0., s1 = 0.;
      for (int i = 1; i < 4; i++) { if (abs(fxUp(c - d * float(i)) - up) > .5) break; s0 += 1.; }
      for (int i = 1; i < 4; i++) { if (abs(fxUp(c + d * float(i)) - up) > .5) break; s1 += 1.; }
      float u = (s0 + a) / (s0 + s1 + 1.);
      float x = 2. * b - 1.;
      return vec4(up, c.x, c.y, pow(max(1. - x * x, 0.), k) * pow(sin(3.1416 * u), .45));
    }
    // 날실 열여섯 올 한 벌 안에서 이 올이 느슨한(오글오글한) 색 줄인지
    float fxSlack(float i) { return step(mod(i, 16.), 8.5); }
    // 오글오글한 줄. T는 실 단위 면 좌표. x 솟은 정도, y 줄 가로 단면(줄 가장자리 0 ~ 가운데 1).
    // 남는 날실이 씨실 서너 올마다 접혀 줄을 가로지르는 주름 골이 지고, 골 사이가 물집처럼 부푼다. 골은 줄 폭 안에서
    // 구불구불하고 물집마다 크기가 다르다. fine이 1이면 정점 격자보다 잔 주름까지 더한다
    vec2 fxPucker(vec2 T, float fine) {
      float s = mod(T.x, 16.);
      float id = floor(T.x / 16.);
      float xs = clamp(s / 9., 0., 1.);
      float across = pow(sin(3.1416 * xs), .5) * step(s, 9.);
      float v = T.y / 4.2 + .9 * fxN2(vec2(xs * 1.6 + id * 3.1, T.y / 8.)) + id * .37;
      float cell = floor(v);
      float blister = pow(sin(3.1416 * fract(v)), .7);
      float size = .55 + .45 * fxH2(vec2(cell, id * 7.1));
      // 물집이 줄 폭 가운데서 둘로 갈라진 자리
      float split = step(.62, fxH2(vec2(cell + 3.3, id))) * (1. - .55 * pow(abs(sin(3.1416 * xs * 2.)), 4.));
      float h = .18 + .82 * blister * size * mix(1., pow(abs(sin(3.1416 * xs * 2.)), .5), split * .7);
      h += fine * (fxN2(vec2(xs * 5. + id, T.y / 1.4 + 5.)) - .5) * .14;
      return vec2(across * h, across);
    }
    float fxSuckerH(vec2 p, float seed) {
      vec2 T = (aHome.xy + p * aHome.z + 1.) * 72.;
      return smoothstep(0., .05, fxEdgeAt(p)) * (.003 + .045 * fxPucker(T, 0.).x);
    }`,
  height: 'fxSuckerH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    float fxN = 144.;
    vec4 fxW = fxLoom(fxF, fxN, .4);
    vec2 fxT = (fxF + 1.) * fxN * .5;
    float fxAA = smoothstep(.45, 1.2, max(fwidth(fxT.x), fwidth(fxT.y)));
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxWhite = vec3(.95, .94, .91);
    float fxSl = fxSlack(fxW.y);
    vec3 fxWarp = mix(fxWhite, fxBase, fxSl) * (.94 + .1 * fxH1(fxW.y * 1.9));
    vec3 fxWeft = mix(fxWhite, fxBase, .38);
    // 느슨한 날실이 부풀어 씨실을 덮어서 색 줄은 날실 빛깔이 더 많이 보인다
    vec3 fxY = mix(fxW.x > .5 ? fxWarp : mix(fxWeft, fxWarp, fxSl * .4), mix(fxWarp, fxWeft, .5 - fxSl * .2), fxAA);
    vec2 fxP = fxPucker(fxT, 1.);
    // 주름 골에 진 그늘
    float fxFold = mix(1., .58 + .42 * smoothstep(.15, .8, fxP.x / max(fxP.y, .05)), fxP.y);
    // 고운 면사라 실 사이 틈이 얕다
    diffuseColor.rgb = fxThread(fxY, vec4(fxW.xyz, .3 + .7 * fxW.w), fxF, fxN, fxAA) * fxFold;
    float fxHt = smoothstep(0., .05, fxEdge()) * (.003 + .045 * fxP.x);
    float fxRelief = clamp(fxHt - vLift, -.02, .02) + (pow(fxW.w, .7) * .0022 + fxPly(fxF, fxN, fxW) * .0003) * (1. - fxAA);`,
  normal: 'normal = fxBump(normal, fxRelief);',
  surface: 'roughnessFactor = .78;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * (fxFresnel(normal, 1.6) * .2 + pow(fxW.w, 8.) * .06 * (1. - fxAA));',
};

B.seersucker = {
  color: `diffuseColor.rgb *= .88 + .16 * fxN3(vLocal * 80. + vSeed);`,
  surface: 'roughnessFactor = .85;',
};

S.birdseye = {
  // 버즈아이. 다 맞추면 면 하나가 한 폭의 소모사 양복감이다. 짙은 실 두 올·옅은 실 두 올을 날실과 씨실에 똑같이 번갈아 걸고,
  // 짙은 씨실 두 올에서는 날실이 대각선 한 칸에만 뜨고 옅은 씨실 두 올에서는 대각선 한 칸만 빼고 다 뜨는 4×4 짜임으로 짰다.
  // 그러면 옅은 날실과 옅은 씨실이 만나는 2×2 칸만 옅은 빛이 겉으로 나와 둥근 점이 되고, 네 올이 엇갈리는 한가운데에는
  // 실 사이 틈이 작은 눈동자처럼 진다. 점 둘레는 짙은 실이 세 올씩 길게 떠서 테를 두른다. 멀리서는 무지처럼 보이고
  // 가까이서 새 눈 같은 점이 촘촘히 박혀 있다(무늬를 그린 게 아니라 짜임과 실 순서를 그대로 계산했다)
  head: WEAVE + `
    float fxUp(vec2 c) {
      vec2 m = mod(c, 4.);
      float diag = 1. - step(.5, abs(m.x - m.y));
      return m.y < 1.5 ? diag : 1. - diag;
    }
    // 짜임 속 실 한 올. x 위에 뜬 실이 날실(1)인지 씨실(0)인지, y 날실 번호, z 씨실 번호,
    // w 높이(0 실 사이 틈 ~ 1 뜬 실 한가운데 꼭대기). 뜬 실은 가운데가 솟고, 양 끝에서 엇갈린 실 밑으로 파고든다(크림프).
    // k는 실 단면: .5 둥근 실, 작을수록 납작하게 눌린 실
    vec4 fxLoom(vec2 F, float n, float k) {
      vec2 T = (F + 1.) * n * .5;
      vec2 c = floor(T), f = fract(T);
      float up = fxUp(c);
      vec2 d = up > .5 ? vec2(0., 1.) : vec2(1., 0.);
      float a = up > .5 ? f.y : f.x;
      float b = up > .5 ? f.x : f.y;
      float s0 = 0., s1 = 0.;
      for (int i = 1; i < 4; i++) { if (abs(fxUp(c - d * float(i)) - up) > .5) break; s0 += 1.; }
      for (int i = 1; i < 4; i++) { if (abs(fxUp(c + d * float(i)) - up) > .5) break; s1 += 1.; }
      float u = (s0 + a) / (s0 + s1 + 1.);
      float x = 2. * b - 1.;
      return vec4(up, c.x, c.y, pow(max(1. - x * x, 0.), k) * pow(sin(3.1416 * u), .45));
    }`,
  height: 'fxDrapeH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    float fxN = 156.;
    vec4 fxW = fxLoom(fxF, fxN, .4);
    vec2 fxT = (fxF + 1.) * fxN * .5;
    float fxAA = smoothstep(.45, 1.2, max(fwidth(fxT.x), fwidth(fxT.y)));
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxLt = mix(fxBase, vec3(.95, .93, .88), .58);
    vec3 fxWarp = mod(fxW.y, 4.) < 1.5 ? fxBase * (.9 + .14 * fxH1(fxW.y * 1.3)) : fxLt;
    vec3 fxWeft = mod(fxW.z, 4.) < 1.5 ? fxBase * (.84 + .1 * fxH1(fxW.z * 2.1)) : fxLt * .97;
    // 멀리서는 겉에 나온 옅은 실이 넷에 하나
    vec3 fxY = mix(fxW.x > .5 ? fxWarp : fxWeft, mix(fxBase * .88, fxLt, .25), fxAA);
    // 점 자리(옅은 실끼리 엇갈린 2×2 칸)는 한 올씩만 떠서 실이 부풀어 틈을 메우고, 잔털이 둥글게 번진다
    float fxDot = step(1.5, mod(fxW.y, 4.)) * step(1.5, mod(fxW.z, 4.));
    vec2 fxDc = mod(fxT - 1., 4.) - 2.;
    float fxHalo = smoothstep(1.7, .9, length(fxDc)) * (1. - fxDot) * (.5 + .5 * fxN2(vLocal.xy * 700. + vSeed));
    vec4 fxWd = vec4(fxW.xyz, mix(fxW.w, .45 + .55 * fxW.w, fxDot));
    diffuseColor.rgb = mix(fxThread(fxY, fxWd, fxF, fxN, fxAA), fxLt * .8, fxHalo * .3 * (1. - fxAA));
    float fxRelief = (pow(fxW.w, .7) * .0036 + fxPly(fxF, fxN, fxW) * .0003) * (1. - fxAA);`,
  normal: 'normal = fxBump(normal, fxRelief);',
  surface: 'roughnessFactor = .7;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * (fxFresnel(normal, 2.) * .12 + pow(fxW.w, 6.) * .1 * (1. - fxAA));',
};

B.birdseye = {
  color: `diffuseColor.rgb *= .9 + .12 * fxN3(vLocal * vec3(6., 6., 90.) + vSeed);`,
  surface: 'roughnessFactor = .4;',
};

export const SURFACES = Object.keys(S);

export const MOVING = new Set([
  'neon', 'lava', 'water', 'forest', 'space', 'candy', 'ice', 'electric', 'flesh', 'eldritch', 'gem',
  'circuit', 'aurora', 'stained', 'najeon', 'rain', 'mercury', 'gauge', 'clay', 'holo', 'jelly', 'planet',
  'disco', 'ink', 'lavalamp', 'glass', 'bubblewrap', 'thermal', 'kaleido', 'flip', 'blackhole', 'opal',
  'dragon', 'nebula', 'galaxy', 'slime', 'lantern', 'eyeball', 'hamster', 'phoenix', 'fairywing',
  'dragonegg', 'druze', 'pave',
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
        ${UNIFORMS}
        attribute float aSeed;
        ${part === 'sticker' ? 'attribute vec3 aHome;' : '#define aHome vec3(0., 0., 1.)'}
        ${VARYINGS}
        ${NOISE}
        ${head}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        #ifdef USE_INSTANCING
          mat4 fxIM4 = instanceMatrix;
        #else
          mat4 fxIM4 = mat4(1.);
        #endif
        fxPtr = (inverse(modelViewMatrix * fxIM4) * vec4(uPointer, 1.)).xyz;
        vec2 fxGd = -vec2((normalMatrix * (mat3(fxIM4) * vec3(1., 0., 0.))).y, (normalMatrix * (mat3(fxIM4) * vec3(0., 1., 0.))).y);
        fxGrav = length(fxGd) > .05 ? normalize(fxGd) : vec2(0., -1.);
        vPtr = fxPtr;
        vGrav = fxGrav;
        vSeed = aSeed;
        vHome = ${part === 'sticker' ? 'aHome' : 'vec3(0., 0., 1.)'};
        ${lift}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vLocal = position;
        vLift = ${fx.height ? 'fxHd' : '0.'};
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
      .replace('#include <color_fragment>', `#include <color_fragment>\nfxPtr = vPtr;\nfxGrav = vGrav;\n${fx.color ?? ''}`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\n${fx.surface ?? ''}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${fx.normal ?? ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${fx.emissive ?? ''}
        totalEmissiveRadiance += diffuseColor.rgb * uFlash;`);
  };
}

/** 겉을 실제로 솟게 하는 질감. 이 테마들은 스티커를 잘게 쪼갠 면으로 만든다. */
export const RAISED = new Set(Object.keys(S).filter((k) => S[k].height));
