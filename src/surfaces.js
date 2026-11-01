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
// 높이 함수로 솟은 만큼(벽면이면 바닥과 꼭대기 사이 값)
varying float vLift;
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

S.swissdot = {
  // 스위스 도트. 다 맞추면 면 하나가 한 폭의 얇은 면 보일이다. 면 색으로 물들인 성근 평직 위에 하얀 실 뭉치를 엇갈린 줄로
  // 짜 넣고 잘라 내 도톰한 물방울이 실제로 솟았다(인쇄가 아니라 실이다). 물방울은 올이 사방으로 뻗친 보송한 술이고,
  // 바탕은 얇아 실 사이가 살짝 비친다
  head: WEAVE + `
    // 가장 가까운 물방울: 중심까지 거리(물방울 반지름이 1)
    float fxDot(vec2 F) {
      vec2 g = (F + 1.) * 4.5;
      g.x += .5 * mod(floor(g.y), 2.);
      return length(fract(g) - .5) / .17;
    }
    float fxDotH(vec2 p, float seed) {
      float d = fxDot(aHome.xy + p * aHome.z);
      float tuft = 1. - smoothstep(.7, 1.1, d);
      return fxDrapeH(p, seed) + smoothstep(0., .08, fxEdgeAt(p)) * .012 * tuft * sqrt(max(0., 1. - d * d * .8));
    }`,
  height: 'fxDotH',
  color: `
    vec2 fxF = fxFace();
    float fxN = 130.;
    vec4 fxW = fxWeave(fxF, fxN, 0.);
    float fxAA = fxClothAA(fxF, fxN);
    vec3 fxBase = diffuseColor.rgb;
    float fxD = fxDot(fxF);
    float fxTuft = 1. - smoothstep(.85, 1.05, fxD + (fxN2(fxF * 90.) - .5) * .25);
    vec2 fxDg = (fxF + 1.) * 4.5;
    fxDg.x += .5 * mod(floor(fxDg.y), 2.);
    vec2 fxDl = fract(fxDg) - .5;
    float fxFib = .5 + .5 * sin(atan(fxDl.y, fxDl.x) * 40. + fxD * 6.);
    vec3 fxGround = fxThread(fxBase, fxW, fxF, fxN, fxAA) * (1. - .3 * (1. - fxW.w) * (1. - fxAA));
    vec3 fxDotC = vec3(.97, .96, .94) * (.8 + .2 * fxFib) * (.85 + .15 * (1. - fxD));
    diffuseColor.rgb = mix(fxGround, fxDotC, fxTuft);`,
  normal: 'normal = fxBump(normal, fxThreadBump(fxW, fxF, fxN, fxAA) * .7 * (1. - fxTuft) + fxFib * fxTuft * .0014);',
  surface: 'roughnessFactor = mix(.8, .98, fxTuft);',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * (fxFresnel(normal, 1.5) * .25 + fxTuft * .05);',
};

B.swissdot = {
  color: `diffuseColor.rgb *= .92 + .1 * fxN3(vLocal * 80. + vSeed);`,
  surface: 'roughnessFactor = .85;',
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

S.phoenix = {
  // 불사조 깃털. 다 맞추면 면 하나가 깃털로 덮인 날개 한 장이다. 끝이 뾰족한 깃털이 아래로 겹겹이 포개져 실제로 도톰하고,
  // 깃대가 가운데로 솟았으며 깃가지가 비스듬히 갈라졌다. 깃털 끝은 불씨처럼 타올라 노랗게 달아오르고 숨 쉬듯 일렁이며,
  // 깃털 사이 그늘엔 잉걸불이 비친다. 깃털 색이 곧 면 색(진홍, 금빛, 푸른 불, 초록 불, 보랏빛, 흰 불)
  head: `
    // 깃털 하나: x 깃털 안 거리(0 가운데, 1 가장자리), y 가로, z 세로(-1 끝 ~ 1 뿌리), w 깃털마다 난수
    vec4 fxFeather(vec2 F) {
      vec2 g = F * vec2(3.4, 3.2);
      vec4 o = vec4(1.2, 0., 0., 0.);
      bool found = false;
      for (int j = 1; j >= -1; j--) {
        float row = floor(g.y) + float(j);
        float off = mod(row, 2.) * .5;
        float cx = floor(g.x - off) + .5 + off;
        for (int i = -1; i <= 1; i++) {
          vec2 c = vec2(cx + float(i), row + .35);
          vec2 d = (g - c) / vec2(.6, 1.3);
          float w = .6 + .4 * smoothstep(-1.1, -.1, d.y);
          float r = length(vec2(d.x / w, d.y));
          if (!found && r < 1.) { o = vec4(r, d.x / w, d.y, fxH2(c)); found = true; }
        }
      }
      return o;
    }
    float fxPhoenixH(vec2 p, float seed) {
      vec4 f = fxFeather(aHome.xy + p * aHome.z);
      float dome = (1. - f.x * f.x) * .55;
      float shaft = (1. - smoothstep(0., .1, abs(f.y))) * (1. - f.x) * .3;
      return smoothstep(0., .06, fxEdgeAt(p)) * (.006 + .022 * (dome + shaft) * step(f.x, 1.));
    }`,
  height: 'fxPhoenixH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec4 fxP = fxFeather(fxF);
    vec3 fxBase = diffuseColor.rgb;
    float fxGap = smoothstep(.85, .98, fxP.x);
    float fxShaft = (1. - smoothstep(.03, .07, abs(fxP.y))) * (1. - fxGap);
    float fxBarb = .5 + .5 * sin((fxP.z * 1.15 - abs(fxP.y) * .55) * 70. + fxN2(fxF * 20.) * 2.);
    float fxSplit = smoothstep(.75, .92, fxN2(vec2((fxP.z - abs(fxP.y)) * 10., fxP.w * 9. + sign(fxP.y))));
    float fxTip = (1. - smoothstep(-1., .25, fxP.z)) * (1. - fxGap);
    float fxDown = smoothstep(.45, .9, fxP.z) * (1. - fxGap);
    float fxFlick = .7 + .3 * sin(uTime * 3.1 + fxP.w * 30.) * sin(uTime * 1.7 + fxP.w * 11.);
    vec3 fxC = fxBase * (.45 + .45 * fxBarb) * (.85 + .25 * fxP.w) * (1. - fxP.x * .3);
    fxC = mix(fxC, mix(fxBase, vec3(1., .82, .45), .5) * (.9 + .3 * fxBarb), fxTip * .75);
    fxC = mix(fxC, fxBase * .22, fxSplit * .55);
    fxC = mix(fxC, mix(fxBase, vec3(1., .9, .7), .5) * (.8 + .4 * fxN2(fxF * 120.)), fxDown * .5);
    fxC = mix(fxC, mix(fxBase, vec3(1., .9, .6), .6), fxShaft * .7);
    fxC *= 1. - fxGap * .8;
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxBarb * .0012 * (1. - fxGap) + fxShaft * .0008 - fxSplit * .001);',
  surface: 'roughnessFactor = mix(.35, .7, fxGap); metalnessFactor = .15;',
  emissive: `
    float fxFr = fxFresnel(normal, 2.);
    vec3 fxFire = mix(fxBase, vec3(1., .82, .4), .5);
    float fxEmber = fxGap * smoothstep(.4, .7, fxN2(fxF * 3. + vec2(0., uTime * .3)));
    totalEmissiveRadiance = fxFire * pow(fxTip, 1.6) * fxFlick * 1.1 + fxBase * fxFr * .3 + vec3(1., .45, .1) * fxEmber * 1.2;`,
};

B.phoenix = {
  color: `diffuseColor.rgb *= .75 + .35 * fxN3(vLocal * 30. + vSeed);`,
  surface: 'roughnessFactor = .6;',
  emissive: 'totalEmissiveRadiance = vec3(1., .4, .1) * pow(fxN3(vLocal * 12. + vec3(0., uTime * .4, 0.)), 6.) * .6;',
};

S.mithril = {
  // 미스릴 사슬. 다 맞추면 면 하나가 사슬 갑옷 한 장이다. 고리 하나가 네 고리를 꿰는 유럽식 4-1 엮음으로, 줄마다 고리가
  // 번갈아 기울어 한쪽은 이웃 고리 위로, 다른 쪽은 아래로 지나간다. 고리 틈으로 안에 받친 짙은 누비옷이 비친다. 미스릴은
  // 은빛에 희미한 푸른 윤이 돌고 고리마다 빛이 따로 맺히며, 면마다 고리를 다른 빛깔로 물들였다(양극 산화한 금속처럼)
  head: `
    // 가장 위 고리: x 철사 볼록함, y 고리 높이, z 고리마다 난수, w 고리 안 각도
    vec4 fxMaille(vec2 F) {
      vec2 g = F * vec2(7.5, 15.);
      vec4 best = vec4(0., -9., 0., 0.);
      float row0 = floor(g.y);
      for (int j = -1; j <= 2; j++) {
        float row = row0 + float(j);
        float off = mod(row, 2.) * .5;
        float col0 = floor(g.x - off);
        float tilt = mod(row, 2.) < .5 ? .45 : -.45;
        for (int i = -1; i <= 1; i++) {
          vec2 c = vec2(col0 + float(i) + off + .5, row);
          vec2 d = vec2(g.x - c.x, (g.y - c.y) * .5);
          vec2 e = fxRot(tilt) * d;
          e.x /= .78;
          float r = length(e);
          float w = .1;
          float band = abs(r - .42);
          if (band > w) continue;
          float wire = sqrt(max(0., 1. - band * band / (w * w)));
          float h = wire * .4 + d.x * tilt * 1.6 + d.y * 1.2;
          if (h > best.y) best = vec4(wire, h, fxH2(c), atan(e.y, e.x));
        }
      }
      return best;
    }
    float fxMailleH(vec2 p, float seed) {
      return smoothstep(0., .06, fxEdgeAt(p)) * (.006 + .012 * smoothstep(0., .45, fxEdgeAt(p) / uSticker.x));
    }`,
  height: 'fxMailleH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec4 fxM = fxMaille(fxF);
    vec3 fxBase = diffuseColor.rgb;
    float fxOn = step(.001, fxM.x);
    vec3 fxMetal = mix(vec3(.82, .86, .92), fxBase, .8) * (.6 + .6 * fxM.x) * (.88 + .2 * fxM.z);
    vec3 fxPad = vec3(.06, .05, .06) * (.7 + .4 * fxN2(fxF * 140.));
    diffuseColor.rgb = mix(fxPad, fxMetal, fxOn);`,
  normal: 'normal = fxBump(normal, fxM.x * .0035 + fxM.y * .0004 * fxOn);',
  surface: 'roughnessFactor = mix(.9, .14 + .1 * fxM.z, fxOn); metalnessFactor = fxOn;',
  emissive: 'totalEmissiveRadiance = vec3(.6, .75, 1.) * fxOn * pow(fxM.x, 6.) * fxFresnel(normal, 1.5) * .35;',
};

B.mithril = {
  color: `diffuseColor.rgb *= .8 + .3 * fxN3(vLocal * 80. + vSeed);`,
  surface: 'roughnessFactor = .35; metalnessFactor = .8;',
};

S.damascus = {
  // 다마스쿠스 강철. 다 맞추면 면 하나가 칼날 한 판이다. 성질이 다른 강철 수백 겹을 접어 두드려 늘였더니 겹이 물결치고,
  // 군데군데 송곳으로 눌러 빗방울 무늬(동그란 겹 고리)가 피었다. 산에 담가 부식시켜 짙은 겹은 살짝 패이고 밝은 겹은
  // 반들거리게 남았다. 칼을 달군 온도에 따라 면마다 산화막 빛깔이 다르다(짚빛, 청동빛, 보랏빛, 푸른빛, 하늘빛, 은빛)
  head: `
    // 겹 위상: 소수부가 겹 하나
    float fxLayers(vec2 F) {
      vec2 w = F * 1.4 + uFace * 3.3;
      float ph = F.y * 1.2 + .22 * fxF2(w) + .05 * fxN2(w * 4.);
      vec3 v = fxVoronoi(F * 2.6 + uFace * 7.);
      ph += .35 * exp(-v.x * 2.2) * (.5 + .5 * v.z);
      return ph * 30.;
    }
    float fxDamaH(vec2 p, float seed) {
      float l = .5 + .5 * sin(fxLayers(aHome.xy + p * aHome.z) * 6.2832);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.01 + .0025 * smoothstep(.35, .65, l));
    }`,
  height: 'fxDamaH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    float fxPh = fxLayers(fxF);
    float fxL = .5 + .5 * sin(fxPh * 6.2832);
    float fxBright = smoothstep(.3, .7, fxL);
    float fxFine = .5 + .5 * sin(fxPh * 6.2832 * 3. + fxN2(fxF * 30.) * 2.);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxDarkS = vec3(.12, .12, .13);
    vec3 fxLightS = vec3(.78, .79, .8);
    vec3 fxSteel = mix(fxDarkS, fxLightS, fxBright) * (.92 + .1 * fxFine);
    vec3 fxC = fxSteel * mix(vec3(1.), fxBase * 1.35, .55 + .25 * fxBright);
    float fxScratch = (1. - smoothstep(0., .02, abs(fract(fxF.x * 40. + fxN2(fxF * vec2(3., 60.)) * .5) - .5))) * .08;
    fxC *= 1. - fxScratch;
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxBright * .0012 + fxFine * .0002);',
  surface: 'roughnessFactor = mix(.45, .14, fxBright); metalnessFactor = .95;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03;',
};

B.damascus = {
  color: `diffuseColor.rgb *= .85 + .2 * fxN2(vec2(fxBodyUV().x * 150., fxBodyUV().y * 3.) + vSeed);`,
  surface: 'roughnessFactor = .3; metalnessFactor = .9;',
};

S.fairywing = {
  // 요정 날개. 다 맞추면 면 하나가 날개 한 장이다. 한쪽 귀퉁이에서 굵은 날개맥이 부채처럼 뻗고, 그 사이를 가는 가로맥이 이어
  // 작은 방(셀)으로 나눈다. 맥은 실제로 솟아 짙고, 방마다 얇은 막이 면 색으로 물들어 비치며 보는 각도에 따라 무지갯빛이
  // 아른거린다. 날개 끝엔 짙은 무늬점(연문), 막엔 반짝이는 가루가 앉았고 살랑이며 빛이 흐른다
  head: `
    // 날개: x 맥(1이 맥 위), y 굵은 맥인지, z 방마다 난수, w 뿌리에서 거리
    vec4 fxWing(vec2 F) {
      vec2 root = vec2(-1.25, -1.25);
      vec2 d = F - root;
      float r = length(d);
      float a = atan(d.y, d.x);
      float t = a * 13. + fxN2(vec2(r * 1.5, uFace)) * 1.2;
      float trunk = 1. - smoothstep(0., .03 + .015 * (1. - r / 3.), abs(fract(t) - .5) * r * .5);
      vec3 v = fxVoronoi(vec2(t * 1.3, r * 13.) + uFace * 5.);
      float rung = 1. - smoothstep(0., .06, v.y);
      return vec4(max(trunk, rung * .7), trunk, v.z, r);
    }
    float fxWingH(vec2 p, float seed) {
      vec4 w = fxWing(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.008 + .006 * w.x + .004 * w.y);
    }`,
  height: 'fxWingH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec4 fxWg = fxWing(fxF);
    vec3 fxBase = diffuseColor.rgb;
    float fxStig = 1. - smoothstep(.12, .16, length((fxF - vec2(.62, .55)) / vec2(1.6, .7)));
    vec3 fxMem = fxBase * (.3 + .15 * fxWg.z) * (.9 + .15 * fxN2(fxF * 9. + uTime * .1));
    vec3 fxVein = mix(fxBase * .25, vec3(.12, .08, .06), .5);
    vec3 fxC = mix(fxMem, fxVein, fxWg.x);
    fxC = mix(fxC, mix(fxBase, vec3(.1), .55), fxStig * .8);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxWg.x * .0012 + fxWg.y * .0008 + fxN2(fxF * 40.) * .0002);',
  surface: 'roughnessFactor = mix(.08, .4, fxWg.x);',
  emissive: `
    float fxFr = fxFresnel(normal, 1.3);
    vec3 fxIri = .5 + .5 * cos(6.2832 * (fxFr * 1.4 + fxWg.w * .35 + fxWg.z * .2 + uTime * .05 + vec3(0., .33, .67)));
    float fxDust = fxGlint(fxF * 60., .25, 1.8);
    totalEmissiveRadiance = (mix(fxBase, fxIri, .5) * (.35 + .7 * fxFr) + vec3(1.) * fxDust * .8) * (1. - fxWg.x * .85);`,
};

B.fairywing = {
  color: `diffuseColor.rgb *= .8 + .3 * fxN3(vLocal * 40. + vSeed);`,
  surface: 'roughnessFactor = .3;',
  emissive: 'totalEmissiveRadiance = uBodyGlow * .2;',
};

S.dragonegg = {
  // 용의 알. 다 맞추면 면 하나가 거대한 알 껍데기 한 판이다. 껍데기는 잔 육각 비늘이 오돌토돌 솟아 오팔처럼 무지갯빛이 돌고,
  // 검은 점이 흩뿌려졌다. 곧 깨어나려는지 껍데기에 금이 그물처럼 갔고, 금 사이로 속불이 새어 나와 심장처럼 뛴다.
  // 껍데기 색이 곧 면 색
  head: `
    // 껍데기: x 비늘 볼록함, y 금(1이 금 한가운데), z 비늘마다 난수
    vec3 fxEgg(vec2 F) {
      vec4 hx = fxHex(F * 9. + uFace * 3.);
      float bump = smoothstep(0., .22, hx.w);
      vec3 v = fxVoronoi(F * 1.8 + uFace * 5.);
      float crackW = .025 + .02 * fxN2(F * 6. + uFace);
      float crack = (1. - smoothstep(crackW * .4, crackW, v.y + (fxN2(F * 30.) - .5) * .02)) * step(.25, v.z);
      return vec3(bump, crack, hx.z);
    }
    float fxEggH(vec2 p, float seed) {
      vec3 e = fxEgg(aHome.xy + p * aHome.z);
      return smoothstep(0., .06, fxEdgeAt(p)) * (.01 + .006 * e.x - .01 * e.y);
    }`,
  height: 'fxEggH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec3 fxE = fxEgg(fxF);
    vec3 fxBase = diffuseColor.rgb;
    float fxSpot = smoothstep(.65, .8, fxN2(fxF * 7. + uFace * 11.)) * (.6 + .4 * fxE.z);
    vec3 fxC = fxBase * (.6 + .4 * fxE.x) * (.85 + .25 * fxE.z);
    fxC = mix(fxC, fxBase * .2, fxSpot * .7);
    fxC = mix(fxC, vec3(.06, .02, .01), fxE.y);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxE.x * .0016 - fxE.y * .0015);',
  surface: 'roughnessFactor = mix(.3, .8, fxE.y); metalnessFactor = .2;',
  emissive: `
    float fxBeatE = .55 + .45 * fxBeat();
    float fxFr = fxFresnel(normal, 2.);
    vec3 fxOpal = .5 + .5 * cos(6.2832 * (fxFr * 1.2 + fxE.z * .4 + vec3(0., .33, .67)));
    totalEmissiveRadiance = vec3(1., .55, .15) * fxE.y * fxBeatE * 2. + mix(fxBase, fxOpal, .45) * fxFr * .35 * fxE.x;`,
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

S.stingray = {
  // 가오리가죽(샤그린). 다 맞추면 면 하나가 가오리 등가죽 한 장이다. 칼슘 알갱이가 빈틈없이 박혀 하나하나 볼록하고, 가운데엔
  // 커다란 알갱이가 모인 흰 별(크라운)이 실제로 봉긋 솟았다. 염색한 뒤 갈아 윤낸 가공이라 알갱이 꼭대기는 흰 속이 드러나
  // 진주처럼 반짝이고, 염료는 알갱이 사이 골에만 짙게 남았다. 면마다 염색이 다르다(블랙, 와인, 네이비, 틸, 골드, 퍼플)
  head: `
    // 알갱이: x 볼록함, y 크라운인지, z 알마다 난수
    vec3 fxBead(vec2 F) {
      vec2 d0 = F - vec2(0., .1);
      float crown = step(length(d0 * vec2(1.5, 1.)) + .05 * sin(atan(d0.y, d0.x) * 4.) + .03 * fxN2(F * 20.), .26);
      vec3 v = fxVoronoi(F * mix(17., 9., crown) + uFace * 11.);
      float rad = .5 + .14 * v.z;
      float circ = sqrt(max(0., 1. - pow(v.x / rad, 2.)));
      return vec3(min(circ, smoothstep(.05, .2, v.y)), crown, v.z);
    }
    float fxRayH(vec2 p, float seed) {
      vec2 F = aHome.xy + p * aHome.z;
      vec2 d0 = F - vec2(0., .1);
      float mound = 1. - smoothstep(.1, .4, length(d0 * vec2(1.5, 1.)));
      return smoothstep(0., .05, fxEdgeAt(p)) * (.01 + .012 * mound);
    }`,
  height: 'fxRayH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec3 fxBd = fxBead(fxF);
    vec3 fxBase = diffuseColor.rgb;
    float fxSand = smoothstep(.15, .45, fxBd.x);
    vec3 fxC = fxBase * (.55 + .3 * fxN2(fxF * 90.));
    vec3 fxPearl = mix(vec3(.94, .92, .86), fxBase, mix(.3, .1, fxBd.y) + .12 * fxBd.z);
    fxC = mix(fxC, fxPearl * (.5 + .55 * fxBd.x), fxSand);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxBd.x * mix(.0012, .0022, fxBd.y) + fxN2(fxF * 260.) * .0002);',
  surface: 'roughnessFactor = mix(.6, .12, fxSand);',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03 + vec3(1.) * fxSand * fxFresnel(normal, 3.) * .06;',
};

B.stingray = {
  color: `diffuseColor.rgb *= .85 + .2 * fxN3(vLocal * 60. + vSeed);`,
  surface: 'roughnessFactor = .4;',
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


/** 이 질감은 시간에 따라 움직이는가. 움직이면 계속 그려야 한다. */
S.coral = {
  // 컵산호 군락. 다 맞추면 면 하나가 바위를 뒤덮은 산호 군락이다. 굵은 관 모양 폴립이 다닥다닥 실제로 솟았고,
  // 관마다 꼭대기가 컵처럼 움푹 패여 그 안에 촉수가 오글거리며 형광으로 빛난다. 폴립은 천천히 숨 쉬듯 부풀었다 오므라든다.
  // 관 사이로 검은 바위가 비친다. 면마다 산호 빛깔이 다르다(주황, 보라, 분홍, 연두, 노랑, 하늘)
  head: `
    // 폴립: x 높이(0~1), y 컵 안(1이 바닥), z 폴립마다 난수, w 컵 테두리
    vec4 fxPolyp(vec2 F) {
      vec3 v = fxVoronoi(F * 4.5 + uFace * 7.);
      float R = .4 + .1 * fxH1(v.z * 31.);
      float tube = 1. - smoothstep(R - .05, R, v.x);
      float cup = 1. - smoothstep(R * .45, R * .62, v.x);
      float rim = smoothstep(R * .48, R * .62, v.x) * (1. - smoothstep(R * .78, R, v.x));
      float breathe = .82 + .18 * sin(uTime * .8 + v.z * 20.);
      return vec4(tube * (.55 + .45 * v.z) * breathe, cup, v.z, rim);
    }
    float fxCoralH(vec2 p, float seed) {
      vec4 c = fxPolyp(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.006 + .1 * c.x - .05 * c.y * c.x);
    }`,
  height: 'fxCoralH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec4 fxPo = fxPolyp(fxF);
    vec3 fxBase = diffuseColor.rgb;
    float fxOn = step(.02, fxPo.x);
    vec3 fxRock = vec3(.14, .12, .11) * (.6 + .6 * fxN2(fxF * 30.));
    float fxRidge = .5 + .5 * sin(fxN2(fxF * 60.) * 6.);
    vec3 fxTube = fxBase * (.45 + .55 * fxPo.x) * (.8 + .35 * fxPo.z) * (.9 + .15 * fxRidge);
    vec3 fxCupC = min(fxBase * 1.3 + .12, vec3(1.));
    float fxTent = smoothstep(.55, .8, fxN2(fxF * 110. + uTime * .5));
    vec3 fxC = mix(fxRock, fxTube, fxOn);
    fxC = mix(fxC, fxCupC * (.6 + .5 * fxTent), fxPo.y * fxOn);
    fxC = mix(fxC, min(fxBase * 1.5 + .15, vec3(1.)), fxPo.w * fxOn * .5);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxN2(fxF * 140.) * .0004 + fxTent * fxPo.y * .0008);',
  surface: 'roughnessFactor = mix(.8, .35, fxOn);',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .04 + fxBase * fxPo.y * fxOn * (.25 + .15 * fxTent);',
};

B.coral = {
  color: `diffuseColor.rgb *= .7 + .5 * fxN3(vLocal * 30. + vSeed);`,
  surface: 'roughnessFactor = .8;',
};

S.barnacle = {
  // 따개비 바위. 다 맞추면 면 하나가 물 빠진 갯바위다. 크고 작은 따개비가 화산처럼 실제로 솟아 다닥다닥 붙었고,
  // 껍데기는 여섯 장의 판이 맞물려 세로 능선이 지며, 꼭대기 구멍 안엔 부리 같은 뚜껑판이 닫혀 있다.
  // 사이사이 젖은 바위와 해초. 면마다 따개비 빛깔이 다르다(흰색, 분홍, 노랑, 청회색, 이끼 낀 초록, 검붉은색)
  head: `
    // 따개비: x 높이, y 구멍 안, z 따개비마다 난수, w 판 능선
    vec4 fxBarn(vec2 F) {
      vec2 g = F * 4.4 + uFace * 5.;
      vec2 i = floor(g), f = fract(g);
      vec4 best = vec4(0.);
      for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
          vec2 c = i + vec2(float(x), float(y));
          vec2 o = vec2(fxH2(c), fxH2(c + 17.3)) * .6 + .2;
          vec2 d = vec2(float(x), float(y)) + o - f;
          float R = .36 + .2 * fxH2(c + 4.4);
          float r = length(d) / R;
          if (r < 1.) {
            float a = atan(d.y, d.x);
            float plates = .5 + .5 * cos(a * 6. + fxH2(c) * 6.);
            float cone = clamp((1. - r) / .7, 0., 1.);
            float open = 1. - smoothstep(.24, .31, r);
            float slit = 1. - smoothstep(.0, .03, abs(dot(d / R, vec2(cos(fxH2(c + 2.) * 3.), sin(fxH2(c + 2.) * 3.)))));
            float h = mix(cone + plates * .08 * (1. - r), .55 - slit * open * .15, open) * (.6 + .8 * R);
            if (h > best.x) best = vec4(h, open, fxH2(c + 9.), plates * (1. - open));
          }
        }
      }
      return best;
    }
    float fxBarnH(vec2 p, float seed) {
      vec4 b = fxBarn(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.005 + .1 * b.x);
    }`,
  height: 'fxBarnH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec4 fxBa = fxBarn(fxF);
    vec3 fxBase = diffuseColor.rgb;
    float fxOn = step(.01, fxBa.x);
    vec3 fxRock = mix(vec3(.12, .11, .1), vec3(.2, .26, .14), smoothstep(.5, .8, fxN2(fxF * 9.))) * (.7 + .5 * fxN2(fxF * 50.));
    vec3 fxShell = fxBase * (.6 + .45 * fxBa.w) * (.85 + .3 * fxBa.z) * (.85 + .2 * fxN2(fxF * 90.));
    vec3 fxCap = mix(vec3(.45, .38, .3), fxBase * .6, .4) * (.8 + .3 * fxN2(fxF * 150.));
    vec3 fxC = mix(fxRock, fxShell, fxOn);
    fxC = mix(fxC, fxCap, fxBa.y * fxOn);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxN2(fxF * 160.) * .0006);',
  surface: 'roughnessFactor = mix(.35, .7, fxOn);',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03;',
};

B.barnacle = {
  color: `diffuseColor.rgb *= .7 + .5 * fxN3(vLocal * 30. + vSeed);`,
  surface: 'roughnessFactor = .5;',
};

S.urchin = {
  // 성게 껍데기. 칸마다 가시가 빠진 성게 껍데기 하나가 둥글게 실제로 솟아 있다. 다섯 갈래로 갈라진 띠를 따라 구멍이
  // 두 줄로 나란히 뚫렸고, 그 사이 넓은 판엔 가시가 붙었던 동그란 돌기가 줄지어 솟았다(가운데로 갈수록 작다).
  // 꼭대기엔 꽃 모양 판. 면마다 껍데기 빛깔이 다르다(보라, 초록, 분홍, 흰색, 붉은색, 주황)
  head: `
    // 성게: x 높이, y 돌기, z 구멍, w 다섯 갈래 띠
    vec4 fxUrchin(vec2 p) {
      vec2 q = p / uSticker.x;
      float r = length(q) / .9;
      float dome = sqrt(max(0., 1. - r * r));
      float a = atan(q.y, q.x);
      float s = fract(a / 6.2832 * 5. + .05);
      float amb = 1. - smoothstep(.07, .1, abs(s - .5));
      vec2 u = vec2(a * r * 9., r * 9.);
      vec2 cu = fract(u) - .5;
      float tub = (1. - smoothstep(.14, .3, length(cu))) * (1. - amb) * smoothstep(.12, .25, r) * step(r, .97);
      float pore = (1. - smoothstep(.02, .05, abs(abs(s - .5) - .04))) * step(.5, fract(r * 30.)) * amb * smoothstep(.15, .3, r);
      float apex = (1. - smoothstep(.1, .14, r)) * (.5 + .5 * cos(a * 5.));
      return vec4(dome * step(r, 1.), tub * dome, pore, amb);
    }
    float fxUrchinH(vec2 p, float seed) {
      vec4 u = fxUrchin(p);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.006 + .17 * u.x + .016 * u.y - .006 * u.z);
    }`,
  height: 'fxUrchinH',
  color: `
    if (fxEdge() < 0.) discard;
    vec4 fxU = fxUrchin(vLocal.xy);
    vec3 fxBase = diffuseColor.rgb;
    float fxOn = step(.001, fxU.x);
    vec3 fxSand = vec3(.78, .7, .56) * (.8 + .3 * fxN2(vLocal.xy * 120.));
    vec3 fxC = fxBase * (.55 + .5 * fxU.x);
    fxC = mix(fxC, mix(fxBase, vec3(1.), .4), fxU.w * .35);
    fxC = mix(fxC, min(fxBase * 1.4 + .25, vec3(1.)), fxU.y * .8);
    fxC = mix(fxC, fxBase * .25, fxU.z * .8);
    fxC = mix(fxSand, fxC, fxOn);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxN2(vLocal.xy * 200.) * .0003);',
  surface: 'roughnessFactor = mix(.9, .5, fxOn);',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03;',
};

B.urchin = {
  color: `diffuseColor.rgb *= .75 + .4 * fxN3(vLocal * 40. + vSeed);`,
  surface: 'roughnessFactor = .85;',
};

S.suckers = {
  // 문어 다리 안쪽. 다 맞추면 면 하나가 굵은 문어 다리 밑면이다. 빨판이 두 줄 넘게 다닥다닥 실제로 솟았고, 한쪽으로 갈수록
  // 작아진다. 빨판마다 도톰한 테두리 안이 오목하게 꺼져 가운데 구멍이 있고, 안쪽엔 방사 주름이 졌다. 살갗엔 색소 점이
  // 퍼졌고 점액으로 번들거린다. 면마다 살갗 빛깔이 다르다(붉은색, 보라, 주황, 분홍, 회갈, 푸른빛)
  head: `
    // 빨판: x 높이, y 안쪽 오목, z 테두리, w 빨판 안 반지름 비(0 가운데 ~ 1 가장자리)
    vec4 fxSuck(vec2 F) {
      float sc = mix(3.2, 6., smoothstep(-1.1, 1.1, F.x + F.y * .3));
      vec2 g = F * sc + uFace * 3.;
      vec2 i = floor(g), f = fract(g);
      vec4 best = vec4(0., 0., 0., 2.);
      for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
          vec2 c = i + vec2(float(x), float(y));
          vec2 o = vec2(fxH2(c), fxH2(c + 17.3)) * .3 + .35;
          vec2 d = vec2(float(x), float(y)) + o - f;
          float r = length(d) / .44;
          if (r < best.w) best = vec4(0., 0., 0., r);
        }
      }
      float r = best.w;
      float rim = exp(-pow((r - .72) / .16, 2.));
      float cup = (1. - smoothstep(.55, .7, r)) * (.6 - .5 * r);
      float hole = 1. - smoothstep(.08, .14, r);
      float h = step(r, 1.) * (rim * .9 + (1. - smoothstep(.85, 1., r)) * .3 - cup - hole * .3);
      return vec4(h, 1. - smoothstep(.55, .68, r), rim, r);
    }
    float fxSuckH(vec2 p, float seed) {
      vec4 s = fxSuck(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.02 + .07 * s.x);
    }`,
  height: 'fxSuckH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec4 fxSk = fxSuck(fxF);
    vec3 fxBase = diffuseColor.rgb;
    float fxIn = step(fxSk.w, 1.);
    vec3 fxSkin = fxBase * (.7 + .3 * fxN2(fxF * 20.));
    float fxChrom = smoothstep(.62, .75, fxN2(fxF * 70.));
    fxSkin = mix(fxSkin, fxBase * .35, fxChrom * .6);
    vec3 fxRimC = mix(fxBase, vec3(1., .9, .85), .45) * (.75 + .35 * fxSk.z);
    float fxPleat = .5 + .5 * sin(atan(fxF.y, fxF.x) * 0. + fxSk.w * 40.);
    vec3 fxCupC = mix(fxBase, vec3(1., .82, .8), .6) * (.7 + .2 * fxPleat);
    vec3 fxC = mix(fxSkin, fxRimC, fxIn * smoothstep(.4, .6, fxSk.w) * (1. - smoothstep(.9, 1., fxSk.w)));
    fxC = mix(fxC, fxCupC, fxSk.y * fxIn);
    fxC = mix(fxC, fxBase * .2, (1. - smoothstep(.08, .14, fxSk.w)) * fxIn);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxN2(fxF * 160.) * .0004 + fxPleat * fxSk.y * .0005);',
  surface: 'roughnessFactor = .22;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .04 + vec3(1.) * fxFresnel(normal, 3.) * .06;',
};

B.suckers = {
  color: `diffuseColor.rgb *= .7 + .5 * fxN3(vLocal * 20. + vSeed);`,
  surface: 'roughnessFactor = .25;',
};

S.anemone = {
  // 말미잘. 칸마다 말미잘 한 송이가 피어 있다. 가운데 오목한 입 원반에서 굵은 촉수가 두 겹으로 빙 둘러 뻗어 실제로 솟았고,
  // 촉수는 끝이 둥글고 밝게 빛나며 물살에 천천히 한쪽으로 흔들린다. 원반엔 방사 줄무늬와 갈라진 입.
  // 면마다 빛깔이 다르다(초록, 분홍, 보라, 주황, 청록, 흰색)
  head: `
    // 말미잘: x 높이, y 촉수 위, z 촉수 끝 쪽(0~1), w 원반 위
    vec4 fxAnem(vec2 p, float seed) {
      vec2 q = p / uSticker.x;
      float r = length(q);
      float a = atan(q.y, q.x) + .25 * sin(uTime * .9 + seed * 20.) * smoothstep(.2, 1., r);
      vec4 best = vec4(0.);
      for (int L = 0; L < 2; L++) {
        float N = 16.;
        float k = fract(a / 6.2832 * N + float(L) * .5);
        float id = floor(a / 6.2832 * N + float(L) * .5);
        float len = (L == 0 ? .95 : .72) - .08 * fxH1(id * 3.7 + seed * 9. + float(L));
        float t = clamp((r - .25) / (len - .25), 0., 1.);
        float w = .42 * (1. - .45 * t) * (L == 0 ? 1. : .85);
        float across = abs(k - .5) * 2. / w;
        float tip = length(vec2((r - len) / (.09 * w * 2.2), across));
        float body = step(.25, r) * step(r, len) * sqrt(max(0., 1. - across * across));
        float cap = sqrt(max(0., 1. - tip * tip)) * step(len, r);
        float tube = max(body, cap);
        float h = tube * (.55 + .35 * sin(3.1416 * t) + (L == 0 ? 0. : .2));
        if (h > best.x) best = vec4(h, step(.01, tube), t, 0.);
      }
      float disc = 1. - smoothstep(.24, .3, r);
      if (disc > .5 && best.x < .3) best = vec4(.35 - .25 * (1. - smoothstep(0., .25, r)), 0., 0., 1.);
      return best;
    }
    float fxAnemH(vec2 p, float seed) {
      vec4 a = fxAnem(p, seed);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.006 + .1 * a.x);
    }`,
  height: 'fxAnemH',
  color: `
    if (fxEdge() < 0.) discard;
    vec4 fxAn = fxAnem(vLocal.xy, vSeed);
    vec3 fxBase = diffuseColor.rgb;
    vec2 fxQa = fxQ();
    vec3 fxRock = vec3(.1, .12, .14) * (.7 + .5 * fxN2(fxQa * 30.));
    vec3 fxTent = fxBase * (.55 + .5 * fxAn.z) * (.85 + .2 * fxN2(fxQa * 60.));
    fxTent = mix(fxTent, min(fxBase * 1.6 + .25, vec3(1.)), smoothstep(.75, 1., fxAn.z));
    float fxRay = .5 + .5 * cos(atan(fxQa.y, fxQa.x) * 24.);
    vec3 fxDisc = mix(fxBase * .5, fxBase * 1.1, fxRay) ;
    float fxMouth = 1. - smoothstep(.0, .025, abs(fxQa.y * .9 + fxQa.x * .3)) * (1. - smoothstep(.06, .1, length(fxQa)));
    fxDisc = mix(fxDisc, fxBase * .15, (1. - smoothstep(.0, .03, abs(fxQa.y))) * (1. - smoothstep(.05, .09, length(fxQa))));
    vec3 fxC = mix(fxRock, fxTent, fxAn.y);
    fxC = mix(fxC, fxDisc, fxAn.w);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxN2(fxQa * 120.) * .0004);',
  surface: 'roughnessFactor = mix(.8, .3, max(fxAn.y, fxAn.w));',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .04 + fxBase * fxAn.y * smoothstep(.8, 1., fxAn.z) * .45;',
};

B.anemone = {
  color: `diffuseColor.rgb *= .7 + .5 * fxN3(vLocal * 30. + vSeed);`,
  surface: 'roughnessFactor = .8;',
};

S.pearl = {
  // 진주. 다 맞추면 면 하나가 벨벳 위에 쏟아 놓은 진주 더미다. 크고 작은 둥근 진주가 빽빽이 실제로 솟았고, 진주층이
  // 보는 각도에 따라 무지갯빛으로 아른거리며 알마다 또렷한 빛이 맺힌다. 알 사이로 짙은 벨벳이 비친다.
  // 면마다 진주가 다르다(흰 진주, 분홍, 금빛, 흑진주, 은청색, 살구빛)
  head: `
    // 진주: x 높이(구), y 알마다 난수, z 알 안 반지름 비
    vec3 fxPearl(vec2 F) {
      vec2 g = F * 5.2 + uFace * 3.;
      vec2 i = floor(g), f = fract(g);
      vec3 best = vec3(0., 0., 2.);
      for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
          vec2 c = i + vec2(float(x), float(y));
          vec2 o = vec2(fxH2(c), fxH2(c + 17.3)) * .5 + .25;
          float R = .38 + .14 * fxH2(c + 4.4);
          float r = length(vec2(float(x), float(y)) + o - f) / R;
          float h = sqrt(max(0., 1. - r * r)) * R;
          if (h > best.x) best = vec3(h, fxH2(c + 9.), r);
        }
      }
      return best;
    }
    float fxPearlH(vec2 p, float seed) {
      vec3 b = fxPearl(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + .17 * b.x);
    }`,
  height: 'fxPearlH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec3 fxPe = fxPearl(fxF);
    vec3 fxBase = diffuseColor.rgb;
    float fxOn = step(.001, fxPe.x);
    vec3 fxVel = vec3(.05, .04, .1) * (.7 + .4 * fxN2(fxF * 200.));
    vec3 fxC = mix(fxVel, fxBase * (.88 + .2 * fxPe.y), fxOn);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxN2(fxF * 300.) * .00015 * fxOn);',
  surface: 'roughnessFactor = mix(.9, .12, fxOn);',
  emissive: `
    float fxOr = fxFresnel(normal, 2.);
    vec3 fxIri = .5 + .5 * cos(6.2832 * (fxOr * 1.4 + fxPe.y * .3 + vec3(0., .33, .67)));
    totalEmissiveRadiance = fxOn * (diffuseColor.rgb * .08 + fxIri * fxOr * .22 + fxBase * pow(max(0., dot(normal, normalize(vec3(-.35, .55, .75)))), 50.) * .7);`,
};

B.pearl = {
  color: `diffuseColor.rgb *= .8 + .3 * fxN3(vLocal * 60. + vSeed);`,
  surface: 'roughnessFactor = .9;',
};

S.cactus = {
  // 선인장. 다 맞추면 면 하나가 굵은 선인장 기둥의 한쪽이다. 세로로 솟은 이랑(골)이 실제로 볼록볼록 늘어섰고,
  // 이랑 꼭대기를 따라 하얀 솜털 자리(가시자리)가 일정하게 박혀 거기서 가시가 별처럼 뻗는다. 겉은 왁스처럼 은은히 윤이 난다.
  // 면마다 선인장이 다르다(초록, 청록, 금빛, 보라 부채, 붉은 접목, 흰 털 선인장)
  head: `
    // 선인장: x 높이(이랑), y 가시자리, z 가시, w 골
    vec4 fxCactus(vec2 F) {
      float u = F.x * 4.2 + .1 * sin(F.y * 1.7 + uFace) + uFace * .31;
      float k = fract(u);
      float rib = pow(sin(3.1416 * k), 1.1);
      float ay = F.y * 5.5 + floor(u) * .5;
      vec2 ar = vec2((k - .5) / 4.2, (fract(ay) - .5) / 5.5);
      float rr = length(ar);
      float areole = 1. - smoothstep(.014, .022, rr);
      float ang = atan(ar.y, ar.x) + fxH1(floor(ay) + floor(u) * 7.) * 3.;
      float da = abs(fract(ang / 6.2832 * 7.) - .5) * .8976;
      float spine = (1. - smoothstep(.002, .005, rr * da)) * step(.02, rr) * (1. - smoothstep(.07, .095, rr));
      return vec4(rib, areole, spine, 1. - smoothstep(0., .2, rib));
    }
    float fxCactusH(vec2 p, float seed) {
      vec4 c = fxCactus(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.006 + .07 * c.x + .008 * c.y);
    }`,
  height: 'fxCactusH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec4 fxCa = fxCactus(fxF);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxC = fxBase * (.5 + .55 * fxCa.x) * (.92 + .12 * fxN2(fxF * vec2(30., 6.)));
    fxC = mix(fxC, fxC * .55, fxCa.w * .6);
    vec3 fxWool = vec3(.95, .93, .88) * (.8 + .25 * fxN2(fxF * 300.));
    fxC = mix(fxC, fxWool, fxCa.y);
    vec3 fxSpineC = mix(vec3(.95, .85, .55), vec3(.55, .35, .2), step(.5, fract(uFace * .37)));
    fxC = mix(fxC, fxSpineC, fxCa.z * .95);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxCa.z * .0012 + fxCa.y * fxN2(fxF * 400.) * .0008 + fxN2(fxF * 150.) * .0002);',
  surface: 'roughnessFactor = .4 + fxCa.y * .5;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03;',
};

B.cactus = {
  color: `diffuseColor.rgb *= .75 + .4 * fxN3(vLocal * 30. + vSeed);`,
  surface: 'roughnessFactor = .9;',
};

S.succulent = {
  // 다육식물. 칸마다 에케베리아 한 포기가 장미꽃처럼 실제로 솟아 있다. 도톰하고 끝이 뾰족한 잎이 황금각으로 돌아가며
  // 겹겹이 포개져, 안쪽 잎일수록 높이 서고 촘촘하다. 잎엔 하얀 분(가루)이 앉아 뽀얗고, 잎끝은 물들었으며, 잎 사이 골은 그늘진다.
  // 아래로 마사토가 비친다. 면마다 다육이 다르다(청회색, 분홍, 연두, 보라, 노랑, 붉은 잎끝 초록)
  head: `
    // 로제트: x 높이, y 잎 위인지, z 잎 끝 쪽(0~1), w 잎 가로(0 가운데 ~ 1 가장자리)
    vec4 fxRose(vec2 p, float seed) {
      vec2 q = p / uSticker.x;
      vec4 best = vec4(0.);
      for (int i = 0; i < 30; i++) {
        float fi = float(i);
        float ang = fi * 2.39996 + seed * 6.2832;
        float rad = .92 * sqrt((fi + .6) / 30.);
        vec2 dir = vec2(cos(ang), sin(ang));
        float along = dot(q, dir);
        float acr = dot(q, vec2(-dir.y, dir.x));
        float b0 = max(rad - .5, -.05);
        float L = rad + .1;
        float t = (along - b0) / (L - b0);
        if (t < 0. || t > 1.) continue;
        float w = (.14 + .22 * rad) * pow(sin(3.1416 * min(t * .85 + .08, 1.)), .6);
        float x = acr / max(w, 1e-3);
        if (abs(x) < 1.) {
          float hg = (1.12 - rad) * .85 + sqrt(1. - x * x) * .28 * (1. - t * .4) + t * t * .12;
          if (hg > best.x) best = vec4(hg, 1., t, abs(x));
        }
      }
      return best;
    }
    float fxRoseH(vec2 p, float seed) {
      vec4 r = fxRose(p, seed);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + .14 * r.x);
    }`,
  height: 'fxRoseH',
  color: `
    if (fxEdge() < 0.) discard;
    vec4 fxRo = fxRose(vLocal.xy, vSeed);
    vec3 fxBase = diffuseColor.rgb;
    vec2 fxQs = fxQ();
    vec3 fxGrit = vec3(.55, .48, .4) * (.6 + .6 * fxN2(fxQs * 90.));
    vec3 fxLeaf = fxBase * (.55 + .5 * fxRo.x) * (1. - fxRo.w * fxRo.w * .3);
    fxLeaf = mix(fxLeaf, vec3(.85, .88, .9), .18 * (1. - fxRo.w));
    vec3 fxTipC = uFace > 4.5 ? vec3(.75, .12, .12) : mix(fxBase, vec3(.75, .25, .35), .55);
    fxLeaf = mix(fxLeaf, fxTipC, smoothstep(.82, 1., fxRo.z) * .8);
    vec3 fxC = mix(fxGrit, fxLeaf, fxRo.y);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxN2(fxQs * 200.) * .0002);',
  surface: 'roughnessFactor = mix(.9, .55, fxRo.y);',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03;',
};

B.succulent = {
  color: `diffuseColor.rgb *= .7 + .4 * fxN3(vLocal * 30. + vSeed);`,
  surface: 'roughnessFactor = .9;',
};

S.mushroom = {
  // 버섯 무리. 칸마다 숲 바닥에서 버섯 갓 몇 개가 둥글게 실제로 솟아 있다. 큰 갓 하나에 작은 갓이 곁들고, 갓 위엔
  // 하얀 사마귀 점이 도톰히 붙었으며, 가장자리 아래로 주름살의 그늘이 진다. 바닥엔 낙엽 부스러기와 이끼.
  // 면마다 버섯이 다르다(붉은 광대버섯, 갈색 그물버섯, 흰 양송이, 노란 꾀꼬리버섯, 보라 끈적버섯, 주황 버섯)
  head: `
    // 버섯: x 높이, y 사마귀, z 갓 안 반지름 비(2면 바닥), w 갓마다 난수
    vec4 fxMush(vec2 p, float seed) {
      vec2 q = p / uSticker.x;
      vec4 best = vec4(0., 0., 2., 0.);
      for (int i = 0; i < 4; i++) {
        float fi = float(i);
        vec2 c = i == 0 ? vec2(-.12, .08) : (vec2(fxH1(seed * 7. + fi), fxH1(seed * 13. + fi * 3.)) - .5) * 1.4;
        float R = i == 0 ? .66 : .2 + .18 * fxH1(seed * 5. + fi * 7.);
        vec2 d = q - c;
        float r = length(d) / R;
        if (r < 1.) {
          float h = pow(1. - r * r, .55) * R * 1.2 + (i == 0 ? .08 : .03);
          vec3 wv = fxVoronoi(d / R * 4.5 + fi * 3. + seed * 7.);
          float wart = (1. - smoothstep(.12, .2, wv.x)) * step(.35, wv.z) * smoothstep(.95, .6, r);
          h += wart * .03;
          if (h > best.x) best = vec4(h, wart, r, fxH1(seed + fi));
        }
      }
      return best;
    }
    float fxMushH(vec2 p, float seed) {
      vec4 m = fxMush(p, seed);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.006 + .17 * m.x);
    }`,
  height: 'fxMushH',
  color: `
    if (fxEdge() < 0.) discard;
    vec4 fxMu = fxMush(vLocal.xy, vSeed);
    vec3 fxBase = diffuseColor.rgb;
    vec2 fxQm = fxQ();
    float fxOn = step(fxMu.z, 1.);
    vec3 fxFloor = mix(vec3(.22, .15, .08), vec3(.2, .28, .12), smoothstep(.45, .7, fxN2(fxQm * 6.))) * (.6 + .6 * fxN2(fxQm * 40.));
    vec3 fxCap = fxBase * (.65 + .45 * (1. - fxMu.z)) * (.9 + .15 * fxN2(fxQm * 30. + fxMu.w));
    fxCap = mix(fxCap, fxCap * .55, smoothstep(.82, 1., fxMu.z));
    vec3 fxWartC = uFace < .5 ? vec3(.95, .93, .86) : mix(fxBase, vec3(1., .97, .9), .55);
    fxCap = mix(fxCap, fxWartC, fxMu.y);
    vec3 fxC = mix(fxFloor, fxCap, fxOn);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxN2(fxQm * 150.) * .0003);',
  surface: 'roughnessFactor = mix(.9, .4, fxOn);',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03;',
};

B.mushroom = {
  color: `diffuseColor.rgb *= .7 + .4 * fxN3(vLocal * 30. + vSeed);`,
  surface: 'roughnessFactor = .9;',
};

S.pinecone = {
  // 솔방울. 다 맞추면 면 하나가 커다란 솔방울의 옆면이다. 나무질 비늘이 나선으로 겹겹이 포개져 비늘 끝마다 실제로 들려
  // 솟았고, 끝엔 마름모꼴 배꼽(제)이 도드라진다. 비늘 밑은 깊은 그늘. 면마다 솔방울이 다르다
  // (갈색, 짙은 밤색, 붉은 갈색, 잿빛 묵은 것, 푸른 풋것, 금빛)
  head: `
    // 비늘: x 높이, y 배꼽, z 비늘마다 난수, w 비늘 끝 쪽(0 밑 ~ 1 끝)
    vec4 fxCone(vec2 F) {
      vec2 g = fxRot(.785398) * (F * vec2(2.6, 2.2)) + uFace * 2.;
      vec2 i = floor(g), f = fract(g);
      float t = (f.x + f.y) * .5;
      float side = abs(f.x - f.y);
      float umbo = exp(-pow((t - .8) / .09, 2.) - pow(side / .18, 2.));
      float h = pow(t, 2.2) * (1. - side * .7) + umbo * .3;
      return vec4(h, umbo, fxH2(i), t);
    }
    float fxConeH(vec2 p, float seed) {
      vec4 c = fxCone(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.006 + .11 * c.x);
    }`,
  height: 'fxConeH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec4 fxCo = fxCone(fxF);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxC = fxBase * (.3 + .8 * fxCo.w) * (.85 + .3 * fxCo.z);
    float fxGrain = .5 + .5 * sin(fxF.x * 160. + fxF.y * 160. + fxN2(fxF * 20.) * 4.);
    fxC *= .92 + .1 * fxGrain;
    fxC = mix(fxC, mix(fxBase, vec3(.75, .7, .62), .5), fxCo.y * .7);
    fxC *= 1. - (1. - smoothstep(.02, .12, fxCo.w)) * .6;
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxGrain * .0004 + fxN2(fxF * 200.) * .0003);',
  surface: 'roughnessFactor = .75;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03;',
};

B.pinecone = {
  color: `diffuseColor.rgb *= .75 + .4 * fxN3(vLocal * 30. + vSeed);`,
  surface: 'roughnessFactor = .8;',
};

S.moss = {
  // 이끼 방석. 다 맞추면 면 하나가 바위를 덮은 이끼다. 둥근 이끼 방석이 몽글몽글 실제로 솟았고, 겉은 잔잎이 별처럼
  // 빽빽해 보송하며, 군데군데 가는 대 위에 홀씨주머니가 맺혀 있다. 방석 사이 골은 축축하고 어둡다.
  // 면마다 이끼가 다르다(짙은 초록, 연두, 금빛, 붉은 물이끼, 은빛 초록, 청록)
  head: `
    // 이끼: x 높이, y 홀씨주머니, z 방석마다 난수
    vec3 fxMoss(vec2 F) {
      vec3 v = fxVoronoi(F * 3.4 + uFace * 4.);
      float dome = sqrt(max(0., 1. - pow(v.x / .8, 2.)));
      float fluff = fxF2(F * 36. + uFace);
      vec3 s = fxVoronoi(F * 20. + uFace * 9.);
      float cap = (1. - smoothstep(.06, .12, s.x)) * step(.84, s.z) * step(.35, dome);
      return vec3(dome * (.72 + .28 * fluff), cap, v.z);
    }
    float fxMossH(vec2 p, float seed) {
      vec3 m = fxMoss(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.006 + .075 * m.x + .012 * m.y);
    }`,
  height: 'fxMossH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec3 fxMo = fxMoss(fxF);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxSt = fxVoronoi(fxF * 140. + uFace);
    float fxLeafy = smoothstep(.0, .3, fxSt.y);
    vec3 fxC = fxBase * (.35 + .75 * fxMo.x) * (.75 + .4 * fxLeafy) * (.9 + .2 * fxMo.z);
    fxC = mix(fxC, min(fxBase * 1.4 + .08, vec3(1.)), smoothstep(.75, 1., fxMo.x) * fxLeafy * .35);
    fxC = mix(fxC, vec3(.12, .08, .05), (1. - smoothstep(.05, .25, fxMo.x)) * .7);
    fxC = mix(fxC, vec3(.6, .25, .08), fxMo.y);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxLeafy * .0008 + fxMo.y * .0006);',
  surface: 'roughnessFactor = .92;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .04;',
};

B.moss = {
  color: `diffuseColor.rgb *= .7 + .4 * fxN3(vLocal * 30. + vSeed);`,
  surface: 'roughnessFactor = .9;',
};

S.bark = {
  // 나무껍질. 다 맞추면 면 하나가 아름드리 고목의 껍질이다. 세로로 긴 껍질 판이 두껍게 실제로 솟았고, 판 사이로 깊은 골이
  // 갈라졌으며, 판 위엔 세로 섬유 결과 군데군데 지의류가 앉았다. 면마다 나무가 다르다
  // (잿빛 참나무, 붉은 소나무, 검은 밤나무, 흰 자작, 이끼 낀 초록, 주황 삼나무)
  head: `
    // 껍질: x 높이, y 골, z 판마다 난수
    vec3 fxBark(vec2 F) {
      vec2 w = F * vec2(3.6, .7) + vec2(fxN2(F * vec2(3., 1.) + uFace) * .6, 0.);
      vec3 v = fxVoronoi(w + uFace * 5.);
      float crack = 1. - smoothstep(.0, .05, abs(fract(F.y * 2.6 + v.z * 7.) - .5) - .45);
      float plate = smoothstep(.03, .25, v.y) * (1. - crack * .8);
      float h = plate * (.72 + .28 * fxN2(F * vec2(7., 2.) + v.z * 9.));
      h += .07 * sin(F.x * 70. + fxN2(F * vec2(9., 1.4)) * 6.) * plate;
      return vec3(h, 1. - plate, v.z);
    }
    float fxBarkH(vec2 p, float seed) {
      vec3 b = fxBark(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + .12 * b.x);
    }`,
  height: 'fxBarkH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec3 fxBk = fxBark(fxF);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxC = fxBase * (.35 + .75 * fxBk.x) * (.85 + .3 * fxBk.z);
    fxC *= .9 + .15 * fxN2(fxF * vec2(120., 20.));
    fxC = mix(fxC, vec3(.06, .04, .03), fxBk.y * .8);
    float fxLich = smoothstep(.62, .72, fxN2(fxF * 5. + uFace * 3.)) * smoothstep(.5, .8, fxBk.x);
    fxC = mix(fxC, vec3(.62, .7, .55) * (.8 + .3 * fxN2(fxF * 90.)), fxLich * .8);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxN2(fxF * vec2(200., 40.)) * .0006 + fxLich * fxN2(fxF * 160.) * .0006);',
  surface: 'roughnessFactor = .9;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03;',
};

B.bark = {
  color: `diffuseColor.rgb *= .7 + .4 * fxN3(vLocal * vec3(10., 40., 10.) + vSeed);`,
  surface: 'roughnessFactor = .9;',
};

S.chesterfield = {
  // 체스터필드 소파. 다 맞추면 면 하나가 단추를 깊이 박아 누빈 가죽 등받이다. 마름모꼴 쿠션이 빵빵하게 실제로 부풀었고,
  // 마름모 꼭짓점마다 가죽 싼 단추가 깊이 박혀 그쪽으로 가죽이 빨려 들며 주름이 잡힌다. 쿠션 꼭대기는 닳아 윤이 나고
  // 골은 짙다. 면마다 가죽 빛깔이 다르다(옥스블러드, 탄, 블랙, 그린, 네이비, 크림)
  head: `
    // 쿠션: x 높이, y 단추, z 접힌 골, w 쿠션 가운데까지(0 가운데 ~ .5 가장자리)
    vec4 fxTuft(vec2 F) {
      vec2 g = fxRot(.785398) * F * 3. + .5;
      vec2 f = fract(g) - .5;
      vec2 a = abs(f);
      float m = max(a.x, a.y);
      float pillow = pow(max(cos(min(m, .5) * 3.1416), 0.), .55);
      float dc = length(a - .5);
      float button = 1. - smoothstep(.06, .08, dc);
      float fold = 1. - smoothstep(0., .04, min(.5 - a.x, .5 - a.y));
      float h = (pillow * .9 + .1 - fold * .08) * smoothstep(.04, .22, dc);
      h += button * sqrt(max(0., 1. - pow(dc / .07, 2.))) * .22;
      return vec4(h, button, fold, m);
    }
    float fxTuftH(vec2 p, float seed) {
      vec4 t = fxTuft(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.006 + .08 * t.x);
    }`,
  height: 'fxTuftH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec4 fxT = fxTuft(fxF);
    vec3 fxBase = diffuseColor.rgb;
    float fxGrain = smoothstep(0., .3, fxVoronoi(fxF * 90.).y);
    vec3 fxC = fxBase * (.35 + .75 * fxT.x) * (.9 + .12 * fxGrain);
    fxC = mix(fxC, min(fxBase * 1.35 + .05, vec3(1.)), smoothstep(.85, 1., fxT.x) * .35);
    fxC = mix(fxC, fxBase * .25, fxT.z * .6);
    fxC = mix(fxC, fxBase * .7, fxT.y);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxGrain * .0005 + fxN2(fxF * 40.) * .0004);',
  surface: 'roughnessFactor = .45 - smoothstep(.8, 1., fxT.x) * .15;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03;',
};

B.chesterfield = {
  color: `diffuseColor.rgb *= .85 + .2 * fxN3(vLocal * 60. + vSeed);`,
  surface: 'roughnessFactor = .45;',
};

S.buttons = {
  // 단추. 칸마다 커다란 네 구멍 단추 하나가 펠트 천 위에 실로 꿰매져 실제로 솟아 있다. 단추는 테두리가 도톰하고 가운데가
  // 오목하며, 구멍 넷을 실이 X자로 지나 도드라졌다. 플라스틱엔 은은한 마블 결과 윤. 칸마다 단추가 조금씩 돌아가 있다.
  // 면마다 단추 빛깔이 다르다(빨강, 파랑, 노랑, 초록, 흰색, 보라)
  head: `
    // 단추: x 높이, y 단추 위, z 구멍, w 실
    vec4 fxButton(vec2 p, float seed) {
      vec2 q = fxRot(seed * 6.2832) * (p / uSticker.x);
      float r = length(q);
      float on = 1. - smoothstep(.76, .78, r);
      float h = on * (.55 + .28 * smoothstep(.5, .66, r) * (1. - smoothstep(.68, .78, r)) - .14 * (1. - smoothstep(.15, .55, r)));
      vec2 hq = abs(q) - vec2(.17);
      float hole = 1. - smoothstep(.06, .075, length(hq));
      float tx = (1. - smoothstep(.02, .035, abs(q.x - q.y) * .7071)) + (1. - smoothstep(.02, .035, abs(q.x + q.y) * .7071));
      float thread = clamp(tx, 0., 1.) * step(max(abs(q.x), abs(q.y)), .2);
      h = h - hole * .4 * on + thread * .12;
      return vec4(h, on, hole * on, thread);
    }
    float fxButtonH(vec2 p, float seed) {
      vec4 b = fxButton(p, seed);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.01 + .13 * b.x);
    }`,
  height: 'fxButtonH',
  color: `
    if (fxEdge() < 0.) discard;
    vec4 fxBt = fxButton(vLocal.xy, vSeed);
    vec3 fxBase = diffuseColor.rgb;
    vec2 fxQb = fxQ();
    vec3 fxFelt = vec3(.78, .74, .66) * (.75 + .3 * fxN2(fxQb * 120.)) * (.9 + .15 * fxN2(fxQb * 14.));
    float fxMarb = fxN2(fxQb * 4. + vSeed * 9.);
    vec3 fxPlastic = fxBase * (.75 + .3 * fxBt.x) * (.9 + .2 * fxMarb);
    vec3 fxC = mix(fxFelt, fxPlastic, fxBt.y);
    fxC = mix(fxC, fxFelt * .4, fxBt.z);
    fxC = mix(fxC, vec3(.95, .93, .88) * (.8 + .3 * fxN2(fxQb * 300.)), fxBt.w);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, (1. - fxBt.y) * fxN2(fxQb * 250.) * .0008 + fxBt.w * fxN2(fxQb * vec2(400., 60.)) * .0006);',
  surface: 'roughnessFactor = mix(.95, .18, fxBt.y * (1. - fxBt.w));',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03;',
};

B.buttons = {
  color: `diffuseColor.rgb *= .8 + .3 * fxN3(vLocal * 80. + vSeed);`,
  surface: 'roughnessFactor = .95;',
};

S.arcbtn = {
  // 오락기 조작판. 칸마다 둥근 오락기 버튼 하나가 검은 판에 박혀 실제로 솟아 있다. 볼록한 버튼 머리를 도톰한 테가 둘렀고,
  // 버튼은 매끈하게 번들거린다. 층을 돌리면 버튼이 꾹 눌리며 불이 들어온다. 판엔 잔 엠보 결과 귀퉁이 나사.
  // 면마다 버튼 색이 다르다(빨강, 파랑, 노랑, 초록, 흰색, 주황)
  head: `
    // 버튼: x 높이, y 버튼 머리, z 테, w 판
    vec4 fxArc(vec2 p, float seed) {
      vec2 q = p / uSticker.x;
      float r = length(q);
      float press = uCharge;
      float bez = smoothstep(.6, .64, r) * (1. - smoothstep(.82, .88, r));
      float bh = bez * (.3 + .12 * sqrt(max(0., 1. - pow((r - .73) / .12, 2.))));
      float head = 1. - smoothstep(.57, .6, r);
      float dome = (.48 - press * .2) + sqrt(max(0., 1. - pow(r / .6, 2.))) * .32;
      float screw = 1. - smoothstep(.05, .07, length(abs(q) - vec2(.84)));
      float h = max(bh, head * dome) + screw * .04;
      return vec4(h, head, bez, 1. - max(head, bez));
    }
    float fxArcH(vec2 p, float seed) {
      vec4 a = fxArc(p, seed);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.008 + .14 * a.x);
    }`,
  height: 'fxArcH',
  color: `
    if (fxEdge() < 0.) discard;
    vec4 fxAr = fxArc(vLocal.xy, vSeed);
    vec3 fxBase = diffuseColor.rgb;
    vec2 fxQa = fxQ();
    vec3 fxPanel = vec3(.05) * (.8 + .4 * fxN2(fxQa * 200.));
    float fxScrew = 1. - smoothstep(.05, .07, length(abs(fxQa) - vec2(.84)));
    fxPanel = mix(fxPanel, vec3(.55), fxScrew);
    vec3 fxBezel = mix(fxBase * .6, vec3(.08), .55);
    vec3 fxC = mix(fxPanel, fxBezel, fxAr.z);
    fxC = mix(fxC, fxBase, fxAr.y);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxAr.w * fxN2(fxQa * 220.) * .0005);',
  surface: 'roughnessFactor = mix(.6, .12, fxAr.y);',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .04 + fxBase * fxAr.y * uCharge * .8;',
};

B.arcbtn = {
  color: `diffuseColor.rgb *= .85 + .2 * fxN3(vLocal * 80. + vSeed);`,
  surface: 'roughnessFactor = .6;',
};

S.tire = {
  // 타이어 트레드. 다 맞추면 면 하나가 굵은 타이어 바닥이다. 가운데를 기준으로 V자로 꺾인 굵은 고무 블록이 실제로 솟아
  // 줄지었고, 블록 사이 골은 깊으며, 블록마다 가는 칼집(사이프)이 났다. 세로로 굵은 홈 두 줄, 양쪽 어깨엔 가로 블록.
  // 고무엔 잔 몰드 결. 면마다 색 고무가 다르다(빨강, 파랑, 노랑, 초록, 흰색, 검정)
  head: `
    // 트레드: x 높이, y 골, z 칼집
    vec3 fxTread(vec2 F) {
      float ax = abs(F.x);
      float u = F.y * 2.6 + ax * 1.5 + uFace * .3;
      float lug = smoothstep(.0, .05, fract(u) - .16) * (1. - smoothstep(.95, 1., fract(u)));
      float groove = 1. - smoothstep(.035, .06, abs(ax - .4));
      float shoulder = step(.82, ax);
      float su = F.y * 4. + uFace * .3;
      float sh = smoothstep(.0, .05, fract(su) - .2) * (1. - smoothstep(.95, 1., fract(su)));
      float block = mix(lug, sh, shoulder) * (1. - groove);
      float sipe = (1. - smoothstep(.0, .025, abs(fract(u * 3.) - .5) - .45)) * block * (1. - shoulder);
      return vec3(block * (1. - sipe * .6), 1. - block, sipe);
    }
    float fxTreadH(vec2 p, float seed) {
      vec3 t = fxTread(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.006 + .085 * t.x);
    }`,
  height: 'fxTreadH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec3 fxTr = fxTread(fxF);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxC = fxBase * (.4 + .6 * fxTr.x) * (.9 + .12 * fxN2(fxF * 160.));
    fxC = mix(fxC, fxBase * .22, fxTr.y * .7);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxN2(fxF * 300.) * .0004);',
  surface: 'roughnessFactor = .7 - fxTr.x * .15;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03;',
};

B.tire = {
  color: `diffuseColor.rgb *= .8 + .3 * fxN3(vLocal * 80. + vSeed);`,
  surface: 'roughnessFactor = .75;',
};

S.rivets = {
  // 리벳 철판. 다 맞추면 면 하나가 철판을 겹쳐 리벳으로 박은 외벽이다. 판이 비늘처럼 한 단씩 겹쳐 턱이 실제로 지고,
  // 판 가장자리를 따라 둥근 리벳 머리가 줄지어 솟았다. 판엔 망치 자국이 오목오목 패였고, 리벳 둘레와 이음매엔
  // 녹이나 녹청이 번졌다. 면마다 금속이 다르다(구리, 황동, 강철, 푸른 무쇠, 청동, 금)
  head: `
    // 철판: x 높이, y 리벳, z 이음매, w 판마다 난수
    vec4 fxPlate(vec2 F) {
      vec2 g = F * vec2(1.6, 2.2) + uFace * 1.3;
      float row = floor(g.y);
      vec2 gg = vec2(g.x + mod(row, 2.) * .5, g.y);
      vec2 c = floor(gg);
      vec2 f = fract(gg);
      float step_ = f.y * .45 + .35 + .12 * fxH2(c);
      float seam = 1. - smoothstep(0., .03, min(f.x, f.y));
      float lip = smoothstep(.0, .02, f.y);
      vec2 rv = vec2(fract(f.x * 4.) - .5, (f.y - .13) * 4.);
      vec2 rv2 = vec2((f.x - .1) * 5., fract(f.y * 3.) - .5);
      float riv = max(1. - smoothstep(.24, .3, length(rv)), 1. - smoothstep(.24, .3, length(rv2)));
      float rivH = max(sqrt(max(0., 1. - pow(length(rv) / .3, 2.))), sqrt(max(0., 1. - pow(length(rv2) / .3, 2.))));
      return vec4(step_ * lip + rivH * .5, riv, seam, fxH2(c + 3.));
    }
    float fxPlateH(vec2 p, float seed) {
      vec4 pl = fxPlate(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.006 + .06 * pl.x);
    }`,
  height: 'fxPlateH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec4 fxPl = fxPlate(fxF);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxDent = fxVoronoi(fxF * 14. + fxPl.w * 9.);
    float fxHam = smoothstep(.0, .5, fxDent.x);
    vec3 fxC = fxBase * (.75 + .3 * fxPl.w) * (.85 + .2 * fxHam);
    float fxCorr = smoothstep(.7, .85, fxN2(fxF * 9. + uFace)) * .4 + fxPl.z * .4 + fxPl.y * .15;
    vec3 fxPat = uFace > 3.5 && uFace < 4.5 ? vec3(.25, .55, .45) : vec3(.42, .2, .08);
    fxC = mix(fxC, fxPat * (.7 + .4 * fxN2(fxF * 80.)), clamp(fxCorr, 0., 1.) * .6);
    fxC *= 1. - fxPl.z * .5;
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxHam * .0008 + fxN2(fxF * 260.) * .0002);',
  surface: 'roughnessFactor = .32 + clamp(fxCorr, 0., 1.) * .5; metalnessFactor = 1. - clamp(fxCorr, 0., 1.) * .8;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03;',
};

B.rivets = {
  color: `diffuseColor.rgb *= .8 + .3 * fxN3(vLocal * 40. + vSeed);`,
  surface: 'roughnessFactor = .45; metalnessFactor = .9;',
};

S.balls = {
  // 공. 면마다 다른 공 하나가 큐브 면만큼 둥글게 부풀어 실제로 솟았다. 농구공(오돌토돌한 가죽 알갱이와 검은 고무 홈),
  // 골프공(빽빽한 오목 딤플), 미식축구공(갈색 가죽 알갱이와 흰 끈 매듭), 테니스공(보송한 펠트와 흰 고무 이음매),
  // 축구공(검은 오각형과 흰 육각형 가죽, 꿰맨 이음매), 배구공(파랑·노랑·흰 띠 가죽과 이음매)
  head: `
    // 공: x 높이(겉 무늬), y 홈·이음매, z 다른 색(검은 판, 흰 끈, 노란 띠), w 부풂
    vec4 fxBall(vec2 F) {
      float bulge = 1. - .5 * dot(F, F) / 2.;
      float h = 0., seam = 0., alt = 0.;
      if (uFace < .5) {
        vec3 v = fxVoronoi(F * 55.);
        h = smoothstep(0., .3, v.y) * .25;
        float s1 = abs(F.x), s2 = abs(F.y), s3 = abs(abs(F.x) - .62 - .22 * F.y * F.y);
        seam = 1. - smoothstep(.015, .03, min(min(s1, s2), s3));
      } else if (uFace < 1.5) {
        vec4 hx = fxHex(F * 8.5);
        h = -smoothstep(.12, .48, hx.w) * .6;
      } else if (uFace < 2.5) {
        vec3 v = fxVoronoi(F * 50.);
        h = smoothstep(0., .3, v.y) * .25;
        seam = 1. - smoothstep(.012, .025, min(abs(F.y - .55), abs(F.y + .55)));
        float lace = step(abs(F.x), .32) * step(abs(F.y), .1) * step(.4, fract(F.x * 9.));
        alt = lace;
        h += lace * .9;
      } else if (uFace < 3.5) {
        h = fxN2(F * 140.) * .2 + fxN2(F * 40.) * .15;
        float cv = abs(F.y - .55 * sin(F.x * 2.2)) ;
        seam = 1. - smoothstep(.03, .05, cv);
        alt = seam;
      } else if (uFace < 4.5) {
        vec4 hx = fxHex(F * 2.4);
        seam = 1. - smoothstep(.0, .03, hx.w);
        alt = step(.72, hx.z);
        h = smoothstep(0., .12, hx.w) * .4;
      } else {
        float u = F.y * 2.2;
        float k = fract(u);
        seam = 1. - smoothstep(.0, .05, min(k, 1. - k));
        alt = step(.5, fract(floor(u) * .5)) ;
        h = sin(3.1416 * k) * .4;
      }
      return vec4(h, seam, alt, bulge);
    }
    float fxBallH(vec2 p, float seed) {
      vec4 b = fxBall(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.006 + .13 * b.w + .02 * b.x - .015 * b.y);
    }`,
  height: 'fxBallH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec4 fxBl = fxBall(fxF);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxC = fxBase * (.8 + .4 * clamp(fxBl.x, -.5, .5));
    vec3 fxSeamC = uFace < .5 ? vec3(.04) : (uFace > 2.5 && uFace < 3.5 ? vec3(.96) : fxBase * .4);
    vec3 fxAltC = uFace < 2.5 ? vec3(.97, .96, .92) : (uFace < 3.5 ? vec3(.96) : (uFace < 4.5 ? vec3(.06) : vec3(1., .82, .15)));
    fxC = mix(fxC, fxAltC * (.85 + .2 * clamp(fxBl.x, 0., 1.)), fxBl.z);
    fxC = mix(fxC, fxSeamC, fxBl.y);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxBl.x * .0012);',
  surface: 'roughnessFactor = uFace > 2.5 && uFace < 3.5 ? .95 : (uFace > .5 && uFace < 1.5 ? .25 : .55);',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03;',
};

B.balls = {
  color: `diffuseColor.rgb *= .8 + .3 * fxN3(vLocal * 40. + vSeed);`,
  surface: 'roughnessFactor = .7;',
};

S.tortoise = {
  // 거북 등딱지. 다 맞추면 면 하나가 커다란 육지거북의 등이다. 육각 등판(인갑)마다 피라미드처럼 실제로 솟았고,
  // 가운데 첫 자란 자리(갓판)를 나이테 같은 성장선 고리가 겹겹이 두르며, 판 사이 이음매는 깊이 파였다.
  // 가운데는 밝고 가장자리로 짙어진다. 면마다 거북이 다르다(황토 설가타, 검은 별거북, 붉은다리, 올리브, 상아, 갈색)
  head: `
    // 등판: x 높이, y 이음매, z 판마다 난수, w 판 가운데까지(0 가장자리 ~ .5 가운데)
    vec4 fxScute(vec2 F) {
      vec4 hx = fxHex(F * 1.9 + uFace * 2.3);
      float w = hx.w;
      float pyr = smoothstep(0., .5, w);
      float rings = .5 + .5 * sin(w * 70.);
      float h = pow(pyr, .8) * .85 + rings * .06 * smoothstep(.02, .1, w) * (1. - smoothstep(.36, .44, w));
      return vec4(h, 1. - smoothstep(0., .035, w), hx.z, w);
    }
    float fxScuteH(vec2 p, float seed) {
      vec4 s = fxScute(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + .12 * s.x);
    }`,
  height: 'fxScuteH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec4 fxSc = fxScute(fxF);
    vec3 fxBase = diffuseColor.rgb;
    float fxRing = .5 + .5 * sin(fxSc.w * 70.);
    vec3 fxC = mix(fxBase * .45, min(fxBase * 1.35 + .05, vec3(1.)), smoothstep(.05, .45, fxSc.w));
    fxC *= .88 + .14 * fxRing;
    fxC *= .9 + .15 * fxSc.z;
    fxC = mix(fxC, vec3(.06, .04, .03), fxSc.y * .85);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxN2(fxF * 120.) * .0004 + fxRing * .0003);',
  surface: 'roughnessFactor = .55;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03;',
};

B.tortoise = {
  color: `diffuseColor.rgb *= .75 + .4 * fxN3(vLocal * 30. + vSeed);`,
  surface: 'roughnessFactor = .7;',
};

S.pangolin = {
  // 천산갑. 다 맞추면 면 하나가 천산갑 등이다. 손톱처럼 단단한 둥근 비늘이 기왓장처럼 아래로 겹겹이 드리워 끝이 실제로
  // 들렸고, 비늘마다 세로로 가는 결이 났으며 끝은 닳아 밝다. 비늘 밑은 깊은 그늘. 면마다 빛깔이 다르다
  // (황갈색, 밤색, 올리브, 잿빛, 금빛, 붉은 갈색)
  head: `
    // 비늘: x 높이, y 비늘 위, z 비늘 끝 쪽(0 위 ~ 1 끝), w 비늘 가로(-1~1)
    vec4 fxPango(vec2 F) {
      vec2 g = F * vec2(2.6, 3.2) + uFace * 2.;
      vec4 best = vec4(0.);
      float bestRow = -1e9;
      for (int j = 0; j <= 1; j++) {
        float row = floor(g.y) + float(j);
        float off = mod(row, 2.) * .5;
        for (int i = -1; i <= 1; i++) {
          vec2 c = vec2(floor(g.x - off) + .5 + off + float(i), row);
          vec2 d = g - c;
          float t = -d.y / 1.8;
          if (t < 0. || t > 1.) continue;
          float w = .66 * pow(max(0., 1. - pow(t, 1.2)), .6);
          float x = d.x / max(w, 1e-3);
          if (abs(x) < 1. && row > bestRow) {
            bestRow = row;
            best = vec4((.2 + .8 * t) * (.7 + .3 * sqrt(1. - x * x)), 1., t, x);
          }
        }
      }
      return best;
    }
    float fxPangoH(vec2 p, float seed) {
      vec4 s = fxPango(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.006 + .085 * s.x);
    }`,
  height: 'fxPangoH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec4 fxPa = fxPango(fxF);
    vec3 fxBase = diffuseColor.rgb;
    float fxStri = .5 + .5 * sin(fxPa.w * 22. + fxN2(fxF * 30.) * 2.);
    vec3 fxC = fxBase * (.35 + .75 * fxPa.z) * (.9 + .12 * fxStri);
    fxC = mix(fxC, min(fxBase * 1.3 + .1, vec3(1.)), smoothstep(.85, 1., fxPa.z) * .5);
    fxC *= 1. - (1. - smoothstep(.0, .2, fxPa.z)) * .55;
    fxC *= 1. - smoothstep(.8, 1., abs(fxPa.w)) * .45;
    fxC = mix(vec3(.05, .04, .03), fxC, fxPa.y);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxStri * .0005 + fxN2(fxF * 200.) * .0002);',
  surface: 'roughnessFactor = .5 - fxPa.z * .15;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03;',
};

B.pangolin = {
  color: `diffuseColor.rgb *= .75 + .4 * fxN3(vLocal * 30. + vSeed);`,
  surface: 'roughnessFactor = .7;',
};

S.hedgehog = {
  // 고슴도치. 다 맞추면 면 하나가 고슴도치 등이다. 뾰족한 가시가 한쪽으로 빽빽이 누워 겹겹이 솟았고, 가시마다 뿌리는 밝고
  // 가운데에 짙은 띠, 끝은 하얗다. 가시 덤불이 몸 따라 봉긋하게 부풀었다. 면마다 고슴도치가 다르다
  // (갈색, 흰색, 짙은 초콜릿, 계피색, 샴페인, 잿빛)
  head: `
    // 가시: x 끝 쪽(0 뿌리 ~ 1 끝), y 가시마다 난수, z 가시 가로(-1~1), w 층(-1이면 없음)
    vec4 fxQuills(vec2 F) {
      vec4 best = vec4(0., 0., 0., -1.);
      float top = -1.;
      for (int L = 0; L < 3; L++) {
        float fl = float(L);
        vec2 g = F * (9. + fl * 2.) + fl * 13.7 + uFace * 3.;
        vec2 cell = floor(g);
        for (int dy = 0; dy <= 3; dy++) {
          for (int dx = -1; dx <= 1; dx++) {
            vec2 c = cell + vec2(float(dx), float(dy));
            float h = fxH2(c + fl * 2.7);
            vec2 root = c + vec2(fxH2(c + 1.3), fxH2(c + 8.1));
            float ang = -1.5708 + (h - .5) * .5;
            vec2 dir = vec2(cos(ang), sin(ang));
            vec2 rel = g - root;
            float len = 2.4 + .8 * fxH2(c + 4.2);
            float t = dot(rel, dir) / len;
            if (t < 0. || t > 1.) continue;
            float w = .17 * (1. - t * .85) + .01;
            float perp = dot(rel, vec2(-dir.y, dir.x));
            float z = fl + t * .9;
            if (abs(perp) < w && z > top) { top = z; best = vec4(t, h, perp / w, fl); }
          }
        }
      }
      return best;
    }
    float fxQuillH(vec2 p, float seed) {
      vec2 F = aHome.xy + p * aHome.z;
      return smoothstep(0., .05, fxEdgeAt(p)) * (.01 + .05 * fxF2(F * 3. + uFace) + .02);
    }`,
  height: 'fxQuillH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec4 fxQu = fxQuills(fxF);
    vec3 fxBase = diffuseColor.rgb;
    float fxOn = step(0., fxQu.w);
    float fxBand = smoothstep(.35, .45, fxQu.x) * (1. - smoothstep(.65, .75, fxQu.x));
    vec3 fxQc = mix(min(fxBase * 1.3 + .1, vec3(1.)), fxBase * .25, fxBand);
    fxQc = mix(fxQc, vec3(.96, .94, .9), smoothstep(.82, .95, fxQu.x));
    fxQc *= (.45 + .55 * (fxQu.w + fxQu.x) / 3.) * 1.5;
    fxQc *= 1. + .12 * (1. - abs(fxQu.z));
    vec3 fxC = mix(fxBase * .2, fxQc, fxOn);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxOn * (fxQu.w * .0016 + (1. - abs(fxQu.z)) * .0006));',
  surface: 'roughnessFactor = .45;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03;',
};

B.hedgehog = {
  color: `diffuseColor.rgb *= .75 + .4 * fxN3(vLocal * 40. + vSeed);`,
  surface: 'roughnessFactor = .9;',
};

S.koi = {
  // 비단잉어. 다 맞추면 면 하나가 잉어 옆구리다. 둥근 비늘이 반쯤씩 겹쳐 비늘마다 뒤끝이 실제로 들렸고, 비늘 테가 밝게
  // 반짝이며 금속처럼 무지갯빛이 돈다. 면마다 잉어가 다르다(붉은 무늬 홍백, 금빛 황금, 백금, 검은 까마귀, 주황, 푸른 아사기)
  head: `
    // 비늘: x 높이, y 비늘 테, z 비늘마다 난수
    vec3 fxKoi(vec2 F) {
      vec2 g = F * vec2(4.2, 5.) + uFace * 2.;
      vec3 best = vec3(0.);
      float bestRow = -1e9;
      for (int j = -1; j <= 0; j++) {
        float row = floor(g.y) + float(j);
        float off = mod(row, 2.) * .5;
        for (int i = -1; i <= 1; i++) {
          vec2 c = vec2(floor(g.x - off) + .5 + off + float(i), row);
          vec2 d = g - c;
          float r = length(d * vec2(1., 1.1)) / .78;
          if (r < 1. && d.y > -.2 && row > bestRow) {
            bestRow = row;
            best = vec3(.4 + .6 * smoothstep(0., .9, r), smoothstep(.82, .96, r), fxH2(c));
          }
        }
      }
      return best;
    }
    float fxKoiH(vec2 p, float seed) {
      vec3 k = fxKoi(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.01 + .045 * k.x + .03 * (1. - .5 * dot(aHome.xy + p * aHome.z, aHome.xy + p * aHome.z)));
    }`,
  height: 'fxKoiH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec3 fxKo = fxKoi(fxF);
    vec3 fxBase = diffuseColor.rgb;
    float fxPatch = smoothstep(.45, .55, fxF2(fxF * 1.8 + uFace * 5.));
    vec3 fxSkin = fxBase;
    if (uFace < .5) fxSkin = mix(vec3(.96, .95, .92), fxBase, fxPatch);
    if (uFace > 4.5) fxSkin = mix(fxBase, vec3(.85, .3, .15), smoothstep(.6, .8, -fxF.y) * .8);
    vec3 fxC = fxSkin * (.6 + .45 * fxKo.x) * (.9 + .15 * fxKo.z);
    fxC = mix(fxC, min(fxSkin * 1.5 + .15, vec3(1.)), fxKo.y * .6);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxN2(fxF * 200.) * .0002);',
  surface: 'roughnessFactor = .25; metalnessFactor = uFace > .5 && uFace < 2.5 || uFace > 3.5 && uFace < 4.5 ? .6 : .1;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03 + (.5 + .5 * cos(6.2832 * (fxFresnel(normal, 1.5) * 1.5 + vec3(0., .33, .67)))) * fxKo.y * .12;',
};

B.koi = {
  color: `diffuseColor.rgb *= .8 + .3 * fxN3(vLocal * 40. + vSeed);`,
  surface: 'roughnessFactor = .3;',
};

S.teeth = {
  // 이빨. 칸마다 축축한 잇몸에 어금니 넷이 실제로 솟아 박혀 있다. 이마다 씹는 면에 둥근 교두 넷이 도드라지고 가운데로
  // 열십자 홈이 파여 누렇게 착색됐으며, 어떤 이는 썩어 검은 구멍이 났다. 잇몸은 번들거리고 이 사이로 부풀었다.
  // 면마다 잇몸과 이 빛깔이 다르다(분홍, 검붉은, 창백한, 보랏빛, 누런, 푸르죽죽한)
  head: `
    // 이: x 높이, y 이 위인지, z 홈, w 썩은 자리
    vec4 fxTooth(vec2 p, float seed) {
      vec2 q = p / uSticker.x;
      vec2 cell = floor((q + 1.) * .999);
      vec2 f = (q + 1.) - cell - .5;
      float hs = fxH2(cell + seed * 7.);
      f = fxRot((hs - .5) * .4) * f;
      f *= 1. + (fxH2(cell + seed * 3.) - .5) * .25;
      vec2 a = abs(f) / .34;
      float sq = pow(pow(a.x, 4.) + pow(a.y, 4.), .25);
      float crown = sqrt(max(0., 1. - pow(sq, 6.)));
      float cusp = 0.;
      for (int i = 0; i < 4; i++) {
        vec2 cp = vec2(i == 0 || i == 2 ? .13 : -.13, i < 2 ? .13 : -.13);
        cusp = max(cusp, exp(-dot(f - cp, f - cp) / .012));
      }
      float fiss = (1. - smoothstep(0., .035, min(abs(f.x), abs(f.y)))) * step(sq, .7);
      float rot = step(.88, hs) * (1. - smoothstep(.06, .1, length(f - vec2(.08, -.05))));
      float h = crown * (.85 + .25 * cusp) + step(.01, crown) * .1 - fiss * .1 - rot * .25;
      float gum = .4 + .08 * fxN2(q * 6. + seed) + .1 * (1. - smoothstep(.0, .3, min(abs(fract(q.x + 1.) - .5), abs(fract(q.y + 1.) - .5)) - .2));
      return vec4(max(h, gum * (1. - step(.01, crown) * .0)), step(gum, h), fiss * crown, rot);
    }
    float fxToothH(vec2 p, float seed) {
      vec4 t = fxTooth(p, seed);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.006 + .14 * t.x);
    }`,
  height: 'fxToothH',
  color: `
    if (fxEdge() < 0.) discard;
    vec4 fxTo = fxTooth(vLocal.xy, vSeed);
    vec3 fxBase = diffuseColor.rgb;
    vec2 fxQt = fxQ();
    vec3 fxGum = fxBase * (.65 + .4 * fxN2(fxQt * 25.)) * (.9 + .15 * smoothstep(.6, .8, fxN2(fxQt * 90.)));
    vec3 fxEnamel = mix(vec3(.94, .91, .82), fxBase, .12) * (.85 + .2 * fxTo.x);
    fxEnamel = mix(fxEnamel, vec3(.62, .5, .28), fxTo.z * .7);
    fxEnamel = mix(fxEnamel, vec3(.08, .05, .03), fxTo.w);
    vec3 fxC = mix(fxGum, fxEnamel, fxTo.y);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, (1. - fxTo.y) * fxN2(fxQt * 140.) * .0005);',
  surface: 'roughnessFactor = mix(.2, .3, fxTo.y);',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03 + vec3(1.) * fxFresnel(normal, 3.) * .05;',
};

B.teeth = {
  color: `diffuseColor.rgb *= .75 + .4 * fxN3(vLocal * 30. + vSeed);`,
  surface: 'roughnessFactor = .25;',
};

S.tongue = {
  // 혀. 다 맞추면 면 하나가 커다란 혀의 윗면이다. 가운데로 깊은 고랑(정중구)이 지나고 양옆이 두툼하게 실제로 부풀었으며,
  // 갈라진 금이 군데군데 패였다. 겉은 실 같은 잔돌기가 빽빽해 하얗게 일어나고, 사이사이 붉은 버섯 돌기가 도드라지며
  // 침으로 번들거린다. 면마다 혀 빛깔이 다르다(분홍, 새빨간, 보랏빛, 하얗게 낀, 누런, 검푸른)
  head: `
    // 혀: x 높이, y 버섯 돌기, z 갈라진 금
    vec3 fxTongue(vec2 F) {
      float sulcus = 1. - smoothstep(.0, .12, abs(F.x + .08 * sin(F.y * 2.)));
      float lobes = .55 + .45 * cos(F.x * 1.6) - .25 * dot(F, F) * .5;
      vec3 v = fxVoronoi(F * 9. + uFace * 4.);
      float fung = sqrt(max(0., 1. - pow(v.x / .24, 2.))) * step(.6, v.z);
      float crack = (1. - smoothstep(.0, .025, abs(fxF2(F * 2.5 + uFace * 3.) - .5))) * smoothstep(.35, .6, fxN2(F * 2. + 7.));
      return vec3(lobes - sulcus * .6 - crack * .3 + fung * .25, fung, crack);
    }
    float fxTongueH(vec2 p, float seed) {
      vec3 t = fxTongue(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.006 + .16 * t.x);
    }`,
  height: 'fxTongueH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec3 fxTg = fxTongue(fxF);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxPap = fxVoronoi(fxF * 70. + uFace);
    float fxFil = smoothstep(.0, .3, fxPap.y);
    vec3 fxC = fxBase * (.6 + .35 * fxTg.x) * (.85 + .2 * fxFil);
    fxC = mix(fxC, vec3(.95, .9, .88), fxFil * smoothstep(.55, .9, fxPap.z) * .35);
    fxC = mix(fxC, mix(fxBase, vec3(.85, .1, .15), .5), fxTg.y * .8);
    fxC = mix(fxC, fxBase * .35, fxTg.z * .7);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxFil * .0018 + fxN2(fxF * 300.) * .0003);',
  surface: 'roughnessFactor = .2 + fxFil * .25;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03 + vec3(1.) * fxFresnel(normal, 3.) * .05;',
};

B.tongue = {
  color: `diffuseColor.rgb *= .75 + .4 * fxN3(vLocal * 20. + vSeed);`,
  surface: 'roughnessFactor = .25;',
};

S.city = {
  // 미니어처 도시. 다 맞추면 면 하나가 해 질 녘 도시 한 구역을 내려다본 모형이다. 바둑판 길 사이 구획마다 크고 작은 건물이
  // 실제로 솟았고 몇몇은 높은 탑이다. 옥상엔 난간과 실외기, 건물 벽엔 층마다 창이 나 군데군데 불이 켜졌다.
  // 길엔 차선, 어떤 구획은 나무가 우거진 공원. 면마다 구역이 다르다(붉은 벽돌, 푸른 유리, 노란 사암, 초록 정원, 흰 콘크리트, 주황 테라코타)
  head: `
    // 도시: x 높이(0 길), y 길, z 건물마다 난수, w 공원
    vec4 fxCity(vec2 F) {
      vec2 g = F * 1.4 + uFace * 1.7;
      vec2 blk = floor(g), f = fract(g);
      float road = 1. - step(.12, min(min(f.x, f.y), min(1. - f.x, 1. - f.y)) + .06);
      float park = step(.85, fxH2(blk + 11.));
      vec2 lots = vec2(2. + floor(fxH2(blk) * 2.), 2. + floor(fxH2(blk + 3.) * 2.));
      vec2 lf = (f - .1) / .8 * lots;
      vec2 lot = floor(lf);
      vec2 lu = fract(lf);
      float id = fxH2(blk * 7. + lot);
      float tall = pow(id, 3.) * .9 + .15;
      float inLot = step(.08, min(min(lu.x, lu.y), min(1. - lu.x, 1. - lu.y)));
      float para = 1. - step(.16, min(min(lu.x, lu.y), min(1. - lu.x, 1. - lu.y)));
      float ac = step(.9, fxH2(floor(lu * 5.) + id * 30.)) * step(.2, min(min(lu.x, lu.y), min(1. - lu.x, 1. - lu.y)));
      float h = (1. - road) * (1. - park) * inLot * (tall + para * .02 + ac * .03);
      float tree = park * (1. - road) * sqrt(max(0., 1. - pow(length(fract(f * 7.) - .5) / .45, 2.))) * .06;
      return vec4(h + tree, road, id, park * (1. - road));
    }
    float fxCityH(vec2 p, float seed) {
      vec4 c = fxCity(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + .16 * c.x);
    }`,
  height: 'fxCityH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec4 fxCi = fxCity(fxF);
    vec3 fxBase = diffuseColor.rgb;
    float fxTop = .004 + .16 * fxCi.x;
    float fxWall = smoothstep(.01, .02, abs(vLift - fxTop * smoothstep(0., .05, fxEdge())));
    vec3 fxRoof = fxBase * (.75 + .35 * fxCi.z) * (.9 + .15 * fxN2(fxF * 120.));
    vec3 fxRoad = vec3(.12, .12, .13) * (.85 + .2 * fxN2(fxF * 200.));
    vec2 fxG = fract(fxF * 1.4 + uFace * 1.7);
    float fxLane = (1. - smoothstep(.0, .006, abs(min(fxG.x, 1. - fxG.x) - .02))) + (1. - smoothstep(.0, .006, abs(min(fxG.y, 1. - fxG.y) - .02)));
    fxRoad = mix(fxRoad, vec3(.85, .8, .4), clamp(fxLane, 0., 1.) * step(.5, fract((fxF.x + fxF.y) * 40.)) * .7);
    vec3 fxPark = vec3(.18, .38, .14) * (.7 + .5 * fxN2(fxF * 60.));
    vec3 fxC = fxCi.y > .5 ? fxRoad : (fxCi.w > .5 ? fxPark : fxRoof);
    float fxWin = step(.45, fract(vLift * 110.)) * step(.35, fract((fxF.x + fxF.y) * 60.));
    float fxLit = step(.55, fxH2(floor(vec2(vLift * 110., (fxF.x + fxF.y) * 60.)) + fxCi.z * 50.));
    vec3 fxFacade = fxBase * .45 * (1. - fxWin * .5);
    fxC = mix(fxC, fxFacade, fxWall);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxN2(fxF * 300.) * .0002);',
  surface: 'roughnessFactor = .7 - fxWall * fxWin * .4;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03 + vec3(1., .82, .45) * fxWall * fxWin * fxLit * .4;',
};

B.city = {
  color: `diffuseColor.rgb *= .8 + .3 * fxN3(vLocal * 40. + vSeed);`,
  surface: 'roughnessFactor = .8;',
};

S.basalt = {
  // 주상절리. 다 맞추면 면 하나가 바닷가 주상절리를 위에서 본 모습이다. 육각 돌기둥이 높이가 제각각인 채 빽빽이 실제로
  // 솟았고, 기둥 옆면엔 가로로 갈라진 금이 층층이 났다. 기둥 머리는 파도에 닳아 살짝 둥글고, 이음매는 깊다.
  // 면마다 돌이 다르다(검은 현무암, 잿빛, 붉은 녹, 황토, 이끼 덮인 초록, 눈 덮인 흰색)
  head: `
    // 기둥: x 높이, y 이음매, z 기둥마다 난수, w 머리 둥근 정도
    vec4 fxColumn(vec2 F) {
      vec4 hx = fxHex(F * 3.4 + uFace * 2.1);
      float top = .35 + .65 * fxH1(hx.z * 37.);
      float crown = smoothstep(0., .18, hx.w);
      return vec4(top * (.92 + .08 * crown) * step(.03, hx.w), 1. - smoothstep(.02, .04, hx.w), hx.z, crown);
    }
    float fxColumnH(vec2 p, float seed) {
      vec4 c = fxColumn(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + .15 * c.x);
    }`,
  height: 'fxColumnH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec4 fxCo = fxColumn(fxF);
    vec3 fxBase = diffuseColor.rgb;
    float fxTop = .004 + .15 * fxCo.x;
    float fxWall = smoothstep(.004, .012, abs(vLift - fxTop * smoothstep(0., .05, fxEdge())));
    vec3 fxC = fxBase * (.75 + .35 * fxCo.z) * (.85 + .25 * fxN2(fxF * 80.));
    fxC = mix(fxC, fxC * 1.15, fxCo.w * .3);
    float fxCrack = 1. - smoothstep(.0, .12, abs(fract(vLift * 40. + fxCo.z * 3.) - .5) * 2.);
    vec3 fxSide = fxBase * .5 * (1. - fxCrack * .5);
    fxC = mix(fxC, fxSide, fxWall);
    fxC = mix(fxC, vec3(.03), fxCo.y * (1. - fxWall));
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxN2(fxF * 200.) * .0005);',
  surface: 'roughnessFactor = .8;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03;',
};

B.basalt = {
  color: `diffuseColor.rgb *= .75 + .4 * fxN3(vLocal * 30. + vSeed);`,
  surface: 'roughnessFactor = .85;',
};

S.terrain = {
  // 입체 지형 모형. 다 맞추면 면 하나가 섬 하나를 깎은 디오라마다. 능선이 날카로운 산맥이 실제로 솟았고, 낮은 곳엔 물이
  // 차 평평한 바다와 호수, 물가는 밝은 여울, 높은 봉우리엔 눈이 덮였으며 비탈엔 바위가 드러났다. 기슭엔 나무가 오돌토돌.
  // 면마다 땅이 다르다(주황 사막, 잿빛 고산, 초록 열대, 검은 화산, 붉은 단풍, 연한 툰드라)
  head: `
    // 지형: x 높이(물 위는 물높이), y 물, z 땅 높이(0~1)
    vec3 fxLand(vec2 F) {
      vec2 P = F * 1.6 + uFace * 3.7;
      float n = 0., a = .5;
      vec2 q = P;
      for (int i = 0; i < 5; i++) {
        float r = 1. - abs(fxN2(q) * 2. - 1.);
        n += a * r * r;
        q = q * 2.07 + 13.1;
        a *= .5;
      }
      float island = 1. - .3 * dot(F, F) / 2.;
      float h = n * island;
      float water = .33;
      return vec3(max(h, water), step(h, water), h);
    }
    float fxLandH(vec2 p, float seed) {
      vec3 l = fxLand(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + .2 * (l.x - .3));
    }`,
  height: 'fxLandH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec3 fxLa = fxLand(fxF);
    vec3 fxBase = diffuseColor.rgb;
    float fxSlope = clamp(length(vec2(dFdx(fxLa.z), dFdy(fxLa.z))) / max(length(vec2(dFdx(fxF.x), dFdy(fxF.x))), 1e-4) * .25, 0., 1.);
    vec3 fxGround = fxBase * (.7 + .5 * fxN2(fxF * 40.));
    float fxTrees = smoothstep(.4, .6, fxN2(fxF * 60.)) * (1. - smoothstep(.55, .7, fxLa.z));
    fxGround = mix(fxGround, fxGround * .6, fxTrees * .6);
    vec3 fxRock = vec3(.42, .4, .38) * (.8 + .3 * fxN2(fxF * 90.));
    vec3 fxC = mix(fxGround, fxRock, smoothstep(.35, .7, fxSlope));
    fxC = mix(fxC, vec3(.95, .96, .98), smoothstep(.72, .78, fxLa.z));
    fxC = mix(fxC, vec3(.85, .8, .62), (1. - smoothstep(.38, .42, fxLa.z)) * (1. - fxLa.y));
    vec3 fxSea = mix(vec3(.05, .2, .38), vec3(.2, .55, .62), smoothstep(.25, .38, fxLa.z));
    fxC = mix(fxC, fxSea, fxLa.y);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, (1. - fxLa.y) * fxTrees * fxN2(fxF * 180.) * .0008 + fxLa.y * fxN2(fxF * 40. + uTime * .3) * .0003);',
  surface: 'roughnessFactor = mix(.85, .15, fxLa.y);',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .04;',
};

B.terrain = {
  color: `diffuseColor.rgb *= .75 + .4 * fxN3(vLocal * 20. + vSeed);`,
  surface: 'roughnessFactor = .8;',
};

S.giwa = {
  // 기와지붕. 다 맞추면 면 하나가 한옥 지붕의 한 자락이다. 둥근 수키와가 줄지어 볼록하게 실제로 솟았고, 그 사이로 오목한
  // 암키와 골이 흐르며, 기와는 한 장씩 비늘처럼 겹쳐 아래로 턱이 진다. 기와엔 잔 얼룩과 이끼, 유약 기와는 은은히 번들거린다.
  // 면마다 기와가 다르다(먹빛 전통 기와, 청기와, 녹유 기와, 붉은 테라코타, 검은 유약, 황금 유약)
  head: `
    // 기와: x 높이, y 수키와 위인지, z 겹친 턱, w 줄마다 난수
    vec4 fxGiwa(vec2 F) {
      float u = F.x * 3.2 + uFace * .3;
      float k = fract(u);
      float convex = sqrt(max(0., 1. - pow((k - .22) / .22, 2.))) * step(k, .44);
      float concave = .25 - .2 * sin(3.1416 * clamp((k - .44) / .56, 0., 1.));
      float course = fract(F.y * 3.4 + floor(u) * .5 * step(.44, k));
      float lap = course * .45;
      float lip = 1. - smoothstep(.0, .05, course);
      float h = max(convex * .9 + .35, concave) + lap;
      return vec4(h, step(.01, convex), lip, fxH2(vec2(floor(u), floor(F.y * 3.4))));
    }
    float fxGiwaH(vec2 p, float seed) {
      vec4 g = fxGiwa(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + .09 * g.x);
    }`,
  height: 'fxGiwaH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec4 fxGw = fxGiwa(fxF);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxC = fxBase * (.45 + .55 * clamp(fxGw.x, 0., 1.3)) * (.88 + .2 * fxGw.w);
    fxC *= .9 + .15 * fxN2(fxF * 60.);
    float fxMossG = smoothstep(.62, .78, fxN2(fxF * 7. + uFace)) * (1. - fxGw.y);
    fxC = mix(fxC, vec3(.25, .32, .15), fxMossG * .5);
    fxC *= 1. - fxGw.z * .6;
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxN2(fxF * 220.) * .0003);',
  surface: 'roughnessFactor = uFace < .5 ? .85 : .3;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03;',
};

B.giwa = {
  color: `diffuseColor.rgb *= .8 + .3 * fxN3(vLocal * 30. + vSeed);`,
  surface: 'roughnessFactor = .8;',
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

S.coffer = {
  // 격자 천장(카세톤). 칸마다 우물반자 하나가 세 단으로 꺼져 들어가고, 단마다 둥근 몰딩 띠와 이빨 장식(덴틸)이 돌며,
  // 바닥 가운데엔 꽃잎 여덟 장짜리 금박 로제트가 실제로 솟았다. 틀은 흰 석고, 우물 안은 칠한 색.
  // 면마다 칠이 다르다(감청, 폼페이 빨강, 초록, 테라코타, 검정, 상아)
  head: `
    // 우물: x 높이, y 로제트, z 단(0 바닥 ~ 3 틀), w 금박(몰딩·로제트)
    vec4 fxCoffer(vec2 p) {
      vec2 q = p / uSticker.x;
      float m = max(abs(q.x), abs(q.y));
      float s1 = smoothstep(.86, .89, m), s2 = smoothstep(.66, .69, m), s3 = smoothstep(.48, .51, m);
      float tier = s1 + s2 + s3;
      float bead = exp(-pow((m - .77) / .022, 2.));
      float along = abs(q.x) > abs(q.y) ? q.y : q.x;
      float dent = step(.5, fract(along * 9.)) * step(.52, m) * step(m, .61);
      float r = length(q);
      float a = atan(q.y, q.x);
      float petal = .5 + .5 * cos(a * 8.);
      float rr = .26 + .07 * petal;
      float rose = 1. - smoothstep(rr - .02, rr, r);
      float roseH = rose * (.3 + .25 * (1. - r / rr) * (.6 + .4 * petal) + .15 * (1. - smoothstep(0., .07, r)));
      float h = tier * .3 + bead * .12 + dent * .1 + roseH;
      return vec4(h, rose, tier, max(bead, rose));
    }
    float fxCofferH(vec2 p, float seed) {
      vec4 c = fxCoffer(p);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + .1 * c.x);
    }`,
  height: 'fxCofferH',
  color: `
    if (fxEdge() < 0.) discard;
    vec4 fxCo = fxCoffer(vLocal.xy);
    vec3 fxBase = diffuseColor.rgb;
    vec2 fxQc = fxQ();
    vec3 fxPlaster = vec3(.93, .91, .86) * (.9 + .1 * fxN2(fxQc * 60.));
    vec3 fxGold = vec3(.92, .72, .32) * (.75 + .35 * fxN2(fxQc * 90.));
    vec3 fxPaint = fxBase * (.85 + .15 * fxN2(fxQc * 40.));
    vec3 fxC = mix(fxPaint, fxPlaster, step(2.5, fxCo.z));
    fxC = mix(fxC, min(fxPaint * 1.25 + .04, vec3(1.)), step(.5, fxCo.z) * step(fxCo.z, 2.5) * .5);
    fxC = mix(fxC, fxGold, fxCo.w);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxN2(fxQc * 150.) * .0002);',
  surface: 'roughnessFactor = mix(.75, .25, fxCo.w); metalnessFactor = fxCo.w * .9;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03;',
};

B.coffer = {
  color: `diffuseColor.rgb *= .85 + .2 * fxN3(vLocal * 40. + vSeed);`,
  surface: 'roughnessFactor = .8;',
};

S.tracery = {
  // 고딕 장미창. 칸마다 돌로 깎은 둥근 창 하나가 실제로 솟아 있다. 바퀴살처럼 뻗은 돌 창살 열두 줄과 가운데 꽃자리,
  // 꽃잎 끝마다 세 잎 무늬 고리, 바깥 돌 테두리. 창살 사이 오목한 자리엔 납선으로 나뉜 색유리가 뒤에서 빛을 받아 환하다.
  // 바깥은 다듬은 돌벽. 면마다 유리 빛깔이 다르다(코발트, 루비, 에메랄드, 호박, 자수정, 흰 유리)
  head: `
    // 창: x 높이(돌), y 유리, z 유리 조각 난수
    vec3 fxTrac(vec2 p) {
      vec2 q = p / uSticker.x;
      float r = length(q);
      float a = atan(q.y, q.x);
      float sec = fract(a / 6.2832 * 12.) - .5;
      float spoke = 1. - smoothstep(.025, .045, abs(sec) * r * .5236 * 2.);
      float ring = exp(-pow((r - .9) / .05, 2.));
      float hub = 1. - smoothstep(.13, .16, r);
      float hubRing = exp(-pow((r - .17) / .025, 2.));
      vec2 fc = vec2(cos((floor(a / 6.2832 * 12.) + .5) * .5236), sin((floor(a / 6.2832 * 12.) + .5) * .5236)) * .62;
      float foil = exp(-pow((length(q - fc) - .1) / .02, 2.));
      float midRing = exp(-pow((r - .42) / .02, 2.));
      float stone = max(max(max(spoke * step(.15, r) * step(r, .9), ring), max(hub, hubRing)), max(foil, midRing));
      float wall = smoothstep(.92, .96, r);
      float glass = (1. - wall) * (1. - stone);
      vec3 v = fxVoronoi(q * 7.);
      return vec3(max(stone * (.75 + .25 * (1. - abs(sec) * 2.)), wall * .9), glass, v.z);
    }
    float fxTracH(vec2 p, float seed) {
      vec3 t = fxTrac(p);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.006 + .1 * t.x);
    }`,
  height: 'fxTracH',
  color: `
    if (fxEdge() < 0.) discard;
    vec3 fxTr = fxTrac(vLocal.xy);
    vec3 fxBase = diffuseColor.rgb;
    vec2 fxQt = fxQ();
    vec3 fxStone = vec3(.78, .74, .66) * (.75 + .3 * fxN2(fxQt * 50.)) * (.9 + .1 * fxN2(fxQt * 200.));
    vec2 fxAsh = fract(vec2(fxQt.x * 3. + step(.5, fract(fxQt.y * 2.5)) * .5, fxQt.y * 2.5));
    fxStone *= 1. - (1. - smoothstep(0., .04, min(min(fxAsh.x, 1. - fxAsh.x), min(fxAsh.y, 1. - fxAsh.y)))) * .35 * step(.94, length(fxQt));
    vec3 fxV = fxVoronoi(fxQt * 7.);
    vec3 fxGlass = fxBase * (.7 + .5 * fxV.z);
    float fxLead = 1. - smoothstep(.0, .05, fxV.y);
    fxGlass = mix(fxGlass, vec3(.05), fxLead);
    vec3 fxC = mix(fxStone, fxGlass, fxTr.y);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, (1. - fxTr.y) * fxN2(fxQt * 180.) * .0006);',
  surface: 'roughnessFactor = mix(.85, .2, fxTr.y);',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03 + fxBase * (.7 + .5 * fxV.z) * fxTr.y * (1. - fxLead) * .9;',
};

B.tracery = {
  color: `diffuseColor.rgb *= .8 + .3 * fxN3(vLocal * 40. + vSeed);`,
  surface: 'roughnessFactor = .85;',
};

S.columns = {
  // 열주. 다 맞추면 면 하나에 대리석 기둥 셋이 나란히 반쯤 솟아 있다. 기둥마다 세로 홈(플루팅)이 스무 줄 넘게 오목하게 파였고,
  // 몇 토막의 원통을 쌓은 이음매가 가로로 지나며, 기둥 사이 벽은 그늘이 진다. 대리석엔 결이 흐른다.
  // 면마다 대리석이 다르다(흰 카라라, 분홍, 초록, 검정, 노란 시에나, 청회색)
  head: `
    // 기둥: x 높이, y 홈, z 기둥 위인지, w 토막 이음매
    vec4 fxCol(vec2 F) {
      float u = F.x * 1.5 + .5;
      float k = fract(u) - .5;
      float R = .4;
      float on = step(abs(k), R);
      float th = asin(clamp(k / R, -1., 1.));
      float cyl = sqrt(max(0., 1. - pow(k / R, 2.)));
      float flute = .5 + .5 * cos(th * 22.);
      float joint = 1. - smoothstep(.0, .015, abs(fract(F.y * 1.6 + floor(u) * .37) - .5) - .48);
      return vec4(on * (cyl - (1. - flute) * .05 * cyl - joint * .03), 1. - flute, on, joint * on);
    }
    float fxColH(vec2 p, float seed) {
      vec4 c = fxCol(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + .14 * c.x);
    }`,
  height: 'fxColH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec4 fxCl = fxCol(fxF);
    vec3 fxBase = diffuseColor.rgb;
    float fxVein = 1. - smoothstep(0., .02, abs(fxF2(fxF * vec2(2., 5.) + uFace * 3.) - .5));
    vec3 fxMarble = fxBase * (.85 + .15 * fxF2(fxF * 6. + uFace));
    fxMarble = mix(fxMarble, fxBase * .45, fxVein * .6);
    vec3 fxC = fxMarble * mix(.4, .65 + .45 * fxCl.x, fxCl.z) * (1. - fxCl.y * .25);
    fxC *= 1. - fxCl.w * .4;
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxN2(fxF * 200.) * .0002);',
  surface: 'roughnessFactor = .3;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03;',
};

B.columns = {
  color: `diffuseColor.rgb *= .85 + .2 * fxN3(vLocal * 30. + vSeed);`,
  surface: 'roughnessFactor = .4;',
};

S.waffle = {
  // 브루탈리즘 와플 슬래브. 다 맞추면 면 하나가 노출 콘크리트 천장이다. 네모난 우물이 깊게 꺼져 들어가 비스듬한 벽으로
  // 좁아지고, 우물 사이엔 굵은 보가 격자로 지난다. 콘크리트엔 거푸집 널판 결이 찍혔고 기포 구멍과 물때 얼룩.
  // 면마다 콘크리트가 다르다(회색, 모래색, 붉은 안료, 짙은 숯빛, 흰 시멘트, 녹청 얼룩)
  head: `
    // 와플: x 높이, y 우물 바닥, z 보 위
    vec3 fxWaffle(vec2 F) {
      vec2 f = fract(F * 1.5 + .5) - .5;
      float m = max(abs(f.x), abs(f.y));
      float wall = clamp((m - .2) / .2, 0., 1.);
      float beam = smoothstep(.4, .42, m);
      return vec3(wall * .8 + beam * .2, 1. - smoothstep(.18, .22, m), beam);
    }
    float fxWaffleH(vec2 p, float seed) {
      vec3 w = fxWaffle(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + .16 * w.x);
    }`,
  height: 'fxWaffleH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec3 fxWa = fxWaffle(fxF);
    vec3 fxBase = diffuseColor.rgb;
    float fxBoard = .5 + .5 * sin(fxF.y * 120. + fxN2(fxF * vec2(4., 40.)) * 3.);
    float fxPore = step(.92, fxH2(floor(fxF * 160.))) * step(.5, fxN2(fxF * 20.));
    vec3 fxC = fxBase * (.55 + .5 * fxWa.x) * (.9 + .1 * fxBoard) * (.85 + .2 * fxN2(fxF * 30.));
    fxC *= 1. - fxPore * .5;
    float fxStain = smoothstep(.55, .75, fxN2(fxF * vec2(6., 2.) + uFace)) * fxWa.y;
    fxC *= 1. - fxStain * .25;
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxBoard * .0004 - fxPore * .0006 + fxN2(fxF * 300.) * .0002);',
  surface: 'roughnessFactor = .92;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03;',
};

B.waffle = {
  color: `diffuseColor.rgb *= .8 + .3 * fxN3(vLocal * 40. + vSeed);`,
  surface: 'roughnessFactor = .9;',
};

S.truss = {
  // 철골 트러스. 다 맞추면 면 하나가 철탑을 짠 강철 격자다. 위아래 굵은 현재와 세로재 사이로 사선재가 X자로 엮여 실제로
  // 솟았고, 부재마다 날개(플랜지) 테가 서고 가운데를 따라 리벳 머리가 줄지었다. 사이로는 저 아래 깊은 허공.
  // 칠은 닳아 녹물이 흘렀다. 면마다 칠이 다르다(철탑 갈색, 금문교 주홍, 파랑, 초록, 회색, 노랑)
  head: `
    // 트러스: x 높이, y 부재 위, z 리벳, w 가장자리 테
    vec4 fxTruss(vec2 F) {
      vec2 g = F * 1.6 + uFace * .7;
      float w = .055;
      vec2 f = fract(g) - .5;
      float chord = abs(f.y);
      float post = abs(f.x);
      float d1 = abs(fract((g.x - g.y) * .5 + .25) - .5) * 1.4142;
      float d2 = abs(fract((g.x + g.y) * .5 + .25) - .5) * 1.4142;
      float dd = min(min(.5 - chord, .5 - post), min(d1, d2));
      float on = 1. - smoothstep(w, w + .015, dd);
      float edge = smoothstep(w * .55, w, dd) * on;
      float alongId = (.5 - chord) < w ? g.x : ((.5 - post) < w ? g.y : g.x + g.y);
      float riv = (1. - smoothstep(.016, .024, length(vec2(fract(alongId * 9.) - .5, dd * 9.) / 9.))) * on;
      return vec4(on * (.8 + .2 * edge) + riv * .15, on, riv, edge);
    }
    float fxTrussH(vec2 p, float seed) {
      vec4 t = fxTruss(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + .12 * t.x);
    }`,
  height: 'fxTrussH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec4 fxTs = fxTruss(fxF);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxVoid = mix(vec3(.04, .05, .08), vec3(.12, .14, .2), fxF.y * .5 + .5);
    vec3 fxSteel = fxBase * (.75 + .3 * fxTs.w) * (.85 + .2 * fxN2(fxF * 90.));
    float fxRust = smoothstep(.6, .8, fxN2(fxF * vec2(20., 4.) + uFace)) * .7;
    fxSteel = mix(fxSteel, vec3(.4, .18, .08), fxRust * .6);
    fxSteel = mix(fxSteel, fxSteel * 1.2 + .05, fxTs.z);
    vec3 fxC = mix(fxVoid, fxSteel, fxTs.y);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxTs.y * fxN2(fxF * 220.) * .0004);',
  surface: 'roughnessFactor = .55; metalnessFactor = fxTs.y * .5;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03;',
};

B.truss = {
  color: `diffuseColor.rgb *= .8 + .3 * fxN3(vLocal * 40. + vSeed);`,
  surface: 'roughnessFactor = .6; metalnessFactor = .5;',
};

S.cornice = {
  // 코니스 몰딩. 다 맞추면 면 하나가 신전 처마 밑 장식띠를 겹겹이 쌓은 벽이다. 가로띠마다 촘촘한 이빨 장식(덴틸),
  // 달걀과 화살촉이 번갈아 솟은 띠, 구슬과 실패 띠, 크게 휘어 오르는 S자 곡면(사이마)이 실제로 솟고 패였다.
  // 달걀과 구슬엔 금박. 면마다 칠이 다르다(크림, 세이지 초록, 연청, 장밋빛, 석회 회색, 테라코타)
  head: `
    // 몰딩: x 높이, y 금박, z 띠 번호
    vec3 fxCornice(vec2 F) {
      float v = fract(F.y * 1.1 + uFace * .13);
      float x = F.x;
      float h = .3, gold = 0., band = 0.;
      if (v < .12) { h = .3; band = 0.; }
      else if (v < .3) { h = .3 + .35 * step(.42, fract(x * 11.)); band = 1.; }
      else if (v < .35) { h = .45; band = 2.; }
      else if (v < .6) {
        float ex = fract(x * 6.) - .5;
        float ey = (v - .475) / .1;
        float egg = sqrt(max(0., 1. - pow(ex / .3, 2.) - ey * ey));
        float dart = (1. - smoothstep(.0, .04, abs(abs(ex) - .45) + ey * .05)) * step(-.8, ey) * step(ey, .6);
        h = .45 + .3 * egg + .15 * dart;
        gold = step(.05, egg);
        band = 3.;
      }
      else if (v < .67) {
        float bx = fract(x * 18.) - .5;
        float bead = sqrt(max(0., 1. - pow(bx / .32, 2.) - pow((v - .635) / .03, 2.)));
        h = .5 + .12 * bead;
        gold = step(.05, bead);
        band = 4.;
      }
      else { float t = (v - .67) / .33; h = .5 + .45 * (t * t * (3. - 2. * t)); band = 5.; }
      return vec3(h, gold, band);
    }
    float fxCorniceH(vec2 p, float seed) {
      vec3 c = fxCornice(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + .13 * c.x);
    }`,
  height: 'fxCorniceH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec3 fxCn = fxCornice(fxF);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxC = fxBase * (.6 + .5 * fxCn.x) * (.92 + .1 * fxN2(fxF * 80.));
    vec3 fxGold = vec3(.92, .72, .3) * (.7 + .4 * fxN2(fxF * 120.));
    fxC = mix(fxC, fxGold, fxCn.y);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxN2(fxF * 200.) * .0002);',
  surface: 'roughnessFactor = mix(.75, .25, fxCn.y); metalnessFactor = fxCn.y * .9;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03;',
};

B.cornice = {
  color: `diffuseColor.rgb *= .85 + .2 * fxN3(vLocal * 40. + vSeed);`,
  surface: 'roughnessFactor = .8;',
};

S.greeble = {
  // 우주선 선체(그리블). 다 맞추면 면 하나가 거대한 우주선 겉판이다. 큰 판 위에 크고 작은 상자 모양 부품이 겹겹이
  // 실제로 솟았고(모형 제작자들이 다른 키트 부품을 잘라 붙이던 방식), 판 이음매는 파였으며, 군데군데 통풍구 슬릿과
  // 작은 표시등. 칠은 판마다 톤이 조금씩 다르고 이음매에 때가 끼었다.
  // 면마다 선체 칠이 다르다(회색, 남색, 황토, 올리브, 흰색, 붉은색)
  head: `
    // 그리블: x 높이, y 판 이음매, z 통풍구, w 표시등
    vec4 fxGreeble(vec2 F) {
      float h = 0., seam = 0.;
      for (int L = 0; L < 3; L++) {
        float s = L == 0 ? 2.5 : (L == 1 ? 6. : 14.);
        vec2 g = F * s + float(L) * 7.3 + uFace * 3.;
        vec2 c = floor(g), f = fract(g);
        float hs = fxH2(c + float(L) * 11.);
        if (L == 0) {
          h += .25 + .2 * hs;
          seam = max(seam, 1. - smoothstep(0., .03, min(min(f.x, f.y), min(1. - f.x, 1. - f.y))));
        } else if (hs > (L == 1 ? .45 : .6)) {
          vec2 lo = vec2(fxH2(c + 1.), fxH2(c + 2.)) * .3 + .05;
          vec2 hi = 1. - vec2(fxH2(c + 3.), fxH2(c + 4.)) * .3 - .05;
          float inside = step(lo.x, f.x) * step(f.x, hi.x) * step(lo.y, f.y) * step(f.y, hi.y);
          h += inside * (L == 1 ? .28 : .14) * (.5 + hs);
        }
      }
      vec2 g1 = F * 6. + 7.3 + uFace * 3.;
      vec2 c1 = floor(g1), f1 = fract(g1);
      float vh = fxH2(c1 + 9.);
      float vent = step(.3, vh) * step(vh, .42) * step(.15, f1.x) * step(f1.x, .85) * step(.15, f1.y) * step(f1.y, .85);
      h -= vent * step(.5, fract(f1.y * 8.)) * .12;
      float light = step(.985, fxH2(floor(F * 30.) + uFace));
      return vec4(h, seam, vent, light);
    }
    float fxGreebleH(vec2 p, float seed) {
      vec4 g = fxGreeble(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + .09 * g.x);
    }`,
  height: 'fxGreebleH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec4 fxGr = fxGreeble(fxF);
    vec3 fxBase = diffuseColor.rgb;
    float fxTone = fxH2(floor(fxF * 2.5 + uFace * 3.));
    vec3 fxC = fxBase * (.75 + .25 * fxTone) * (.75 + .35 * fxGr.x) * (.9 + .12 * fxN2(fxF * 70.));
    fxC = mix(fxC, fxC * .3, fxGr.y * .8);
    fxC = mix(fxC, vec3(.05), fxGr.z * step(.5, fract(fract(fxF.y * 6. + 7.3 + uFace * 3.) * 8.)) * .8);
    float fxGrime = smoothstep(.6, .8, fxN2(fxF * vec2(30., 8.) + uFace));
    fxC *= 1. - fxGrime * .2;
    float fxBlink = step(.5, fract(uTime * .5 + fxH2(floor(fxF * 30.)) * 3.));
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxN2(fxF * 250.) * .0002);',
  surface: 'roughnessFactor = .5; metalnessFactor = .4;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03 + mix(vec3(1., .2, .1), vec3(.2, 1., .4), step(.5, fract(fxH2(floor(fxF * 30.)) * 7.))) * fxGr.w * fxBlink * 1.5;',
};

B.greeble = {
  color: `diffuseColor.rgb *= .8 + .3 * fxN3(vLocal * 40. + vSeed);`,
  surface: 'roughnessFactor = .5; metalnessFactor = .5;',
};

S.mecha = {
  // 메카 장갑. 다 맞추면 면 하나가 거대 로봇의 장갑판이다. 각진 판이 모서리를 비스듬히 깎은 채(챔퍼) 실제로 솟았고,
  // 판 사이 이음매는 깊이 파였으며, 몇몇 판은 안쪽 판이 한 단 더 솟거나 통풍구 슬릿이 났다. 모서리는 칠이 벗겨져 쇠가
  // 드러났고 어떤 판엔 노랑·검정 경고 띠. 면마다 칠이 다르다(흰색, 파랑, 빨강, 노랑, 짙은 회색, 초록)
  head: `
    // 장갑: x 높이, y 이음매, z 통풍구, w 모서리 마모
    vec4 fxArmor(vec2 F) {
      vec3 v = fxVoronoi(F * 2.2 + uFace * 3.);
      float bevel = smoothstep(0., .12, v.y);
      float line = 1. - smoothstep(0., .02, v.y);
      float inner = smoothstep(.17, .2, v.y) * step(.5, v.z) * step(v.z, .75);
      float vent = step(.8, v.z) * smoothstep(.2, .23, v.y) * step(.5, fract((F.x + F.y) * 22.));
      float h = .45 + .35 * bevel + .1 * v.z + inner * .12 - vent * .15 - line * .1;
      return vec4(h, line, vent, (1. - smoothstep(.02, .1, v.y)) * (1. - line));
    }
    float fxArmorH(vec2 p, float seed) {
      vec4 a = fxArmor(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + .1 * a.x);
    }`,
  height: 'fxArmorH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec4 fxAr = fxArmor(fxF);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxVa = fxVoronoi(fxF * 2.2 + uFace * 3.);
    vec3 fxC = fxBase * (.75 + .3 * fxAr.x) * (.92 + .1 * fxN2(fxF * 60.));
    float fxHaz = step(.6, fxVa.z) * step(fxVa.z, .66) * smoothstep(.2, .23, fxVa.y);
    fxC = mix(fxC, mix(vec3(.95, .78, .1), vec3(.06), step(.5, fract((fxF.x - fxF.y) * 7.))), fxHaz);
    float fxChip = fxAr.w * step(.45, fxN2(fxF * 70.));
    fxC = mix(fxC, vec3(.62, .64, .66), fxChip);
    fxC = mix(fxC, vec3(.03), fxAr.y * .85);
    fxC = mix(fxC, vec3(.04), fxAr.z * .85);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxN2(fxF * 250.) * .0002);',
  surface: 'roughnessFactor = .45 - fxChip * .2; metalnessFactor = fxChip;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03;',
};

B.mecha = {
  color: `diffuseColor.rgb *= .85 + .2 * fxN3(vLocal * 40. + vSeed);`,
  surface: 'roughnessFactor = .4; metalnessFactor = .8;',
};

S.heatsink = {
  // 방열판. 다 맞추면 면 하나가 커다란 방열판이다. 얇은 알루미늄 날개가 촘촘히 늘어서 높이 실제로 솟았고, 날개를
  // 가로질러 굵은 구리 히트파이프 두 줄이 지난다. 날개엔 결 무늬 아노다이징이 은은히 빛나고 골은 그늘이 짙다.
  // 면마다 아노다이징 색이 다르다(은색, 파랑, 빨강, 검정, 초록, 보라)
  head: `
    // 방열판: x 높이, y 날개, z 파이프, w 날개 안 가로(-.5~.5)
    vec4 fxSink(vec2 F) {
      float u = F.x * 9. + uFace * .2;
      float k = fract(u) - .5;
      float fin = 1. - smoothstep(.15, .21, abs(k));
      float py = min(abs(F.y - .5), abs(F.y + .5));
      float pipe = sqrt(max(0., 1. - pow(py / .11, 2.)));
      float fh = fin * .85 + .1;
      float ph = pipe * 1.05;
      return vec4(max(fh, ph), fin, step(fh, ph) * step(.001, pipe), k);
    }
    float fxSinkH(vec2 p, float seed) {
      vec4 s = fxSink(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + .14 * s.x);
    }`,
  height: 'fxSinkH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec4 fxSk = fxSink(fxF);
    vec3 fxBase = diffuseColor.rgb;
    float fxBrush = .5 + .5 * sin(fxF.y * 400. + fxN2(fxF * vec2(4., 80.)) * 4.);
    vec3 fxC = fxBase * (.3 + .8 * fxSk.x) * (.92 + .1 * fxBrush);
    vec3 fxCopper = vec3(.85, .48, .28) * (.8 + .3 * fxN2(fxF * 60.));
    fxC = mix(fxC, fxCopper * (.6 + .5 * fxSk.x), fxSk.z);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxBrush * .0003);',
  surface: 'roughnessFactor = mix(.35, .22, fxSk.z); metalnessFactor = .85;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03;',
};

B.heatsink = {
  color: `diffuseColor.rgb *= .85 + .2 * fxN3(vLocal * 40. + vSeed);`,
  surface: 'roughnessFactor = .3; metalnessFactor = .9;',
};

S.reactor = {
  // 반응로 코어. 칸마다 둥근 반응로 구멍 하나가 실제로 솟아 있다. 두툼한 바깥 고리엔 볼트가 빙 둘러 박혔고, 그 안쪽엔
  // 방사형 통풍 슬롯이 뚫려 빛이 새며, 가운데엔 빛나는 노심이 볼록 솟아 숨 쉬듯 맥동한다. 하우징은 짙은 금속.
  // 면마다 노심 빛깔이 다르다(하늘, 주황, 초록, 분홍, 노랑, 흰빛)
  head: `
    // 반응로: x 높이, y 노심, z 통풍 슬롯, w 고리
    vec4 fxReactor(vec2 p) {
      vec2 q = p / uSticker.x;
      float r = length(q);
      float a = atan(q.y, q.x);
      float ring = exp(-pow((r - .78) / .09, 2.));
      float ba = (floor(a / .5236 + .5)) * .5236;
      float bolt = 1. - smoothstep(.035, .05, length(q - vec2(cos(ba), sin(ba)) * .78));
      float vent = step(.38, r) * step(r, .64) * step(.5, fract(a / 6.2832 * 24.));
      float core = sqrt(max(0., 1. - pow(r / .32, 2.)));
      float lip = exp(-pow((r - .34) / .03, 2.));
      float h = .35 + ring * .45 + bolt * .14 - vent * .22 + core * .45 + lip * .2;
      return vec4(h, step(r, .32), vent, ring);
    }
    float fxReactorH(vec2 p, float seed) {
      vec4 c = fxReactor(p);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + .12 * c.x);
    }`,
  height: 'fxReactorH',
  color: `
    if (fxEdge() < 0.) discard;
    vec4 fxRe = fxReactor(vLocal.xy);
    vec3 fxBase = diffuseColor.rgb;
    vec2 fxQr = fxQ();
    vec3 fxMetal = vec3(.2, .21, .24) * (.8 + .3 * fxN2(fxQr * 80.)) * (.8 + .4 * fxRe.w);
    float fxPulse = .75 + .25 * sin(uTime * 2.2 + vSeed * 20.);
    vec3 fxC = mix(fxMetal, fxBase, fxRe.y);
    fxC = mix(fxC, fxBase * .15, fxRe.z);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, (1. - fxRe.y) * fxN2(fxQr * 200.) * .0003);',
  surface: 'roughnessFactor = mix(.35, .1, fxRe.y); metalnessFactor = (1. - fxRe.y) * .8;',
  emissive: 'totalEmissiveRadiance = fxBase * (fxRe.y * (1.1 + .6 * fxPulse) + fxRe.z * .55 * fxPulse);',
};

B.reactor = {
  color: `diffuseColor.rgb *= .85 + .2 * fxN3(vLocal * 40. + vSeed);`,
  surface: 'roughnessFactor = .35; metalnessFactor = .8;',
};

S.biomech = {
  // 바이오메카. 다 맞추면 면 하나가 살과 기계가 뒤엉킨 외계 구조물이다. 기관지처럼 마디진 굵은 관이 두 갈래로 엇갈려
  // 실제로 솟았고, 관을 따라 고리 마디가 일정하게 불룩 부풀어 마디마다 등줄기 돌기가 섰으며 마디 사이는 잘록하게 조였다.
  // 겉은 검게 번들거리는 키틴 같고 관 사이 골은 깊다. 면마다 빛깔이 다르다(뼈빛, 칠흑, 청동, 병든 초록, 보라, 핏빛)
  head: `
    // 관: x 높이, y 고리 마디, z 관 가로(-1~1, 2면 바깥), w 등줄기 돌기
    vec4 fxBio(vec2 F) {
      vec4 best = vec4(0., 0., 2., 0.);
      for (int L = 0; L < 2; L++) {
        float fl = float(L);
        vec2 R = fxRot(fl * 1.1 + uFace * .4) * F;
        float y = R.y * 2.6 + fl * .5 + .25 * sin(R.x * 1.7 + fl * 2. + uFace);
        float k = fract(y) - .5;
        float id = floor(y);
        float seg = R.x * 5.5 + fxH1(id * 3. + fl) * 6.;
        float ring = pow(.5 + .5 * cos(seg * 6.2832), 5.);
        float rad = .34 * (.66 + .44 * ring);
        float across = k / rad;
        if (abs(across) > 1.) continue;
        float tube = sqrt(1. - across * across);
        float crest = ring * (1. - smoothstep(0., .22, abs(across)));
        float h = tube * (.62 + .38 * ring) * (.8 + fl * .3) + crest * .18;
        if (h > best.x) best = vec4(h, ring * tube, across, crest);
      }
      return best;
    }
    float fxBioH(vec2 p, float seed) {
      vec4 b = fxBio(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + .12 * b.x);
    }`,
  height: 'fxBioH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec4 fxBi = fxBio(fxF);
    vec3 fxBase = diffuseColor.rgb;
    float fxOn = step(abs(fxBi.z), 1.);
    vec3 fxC = fxBase * (.25 + .6 * fxBi.x) * (.8 + .5 * fxBi.y);
    fxC = mix(fxC, min(fxBase * 1.4 + .1, vec3(1.)), fxBi.w * .5);
    fxC *= 1. - (1. - smoothstep(.6, 1., 1. - abs(fxBi.z))) * .0;
    vec3 fxGap = vec3(.02) + fxBase * .05 * fxN2(fxF * 40.);
    fxC = mix(fxGap, fxC, fxOn);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxN2(fxF * 160.) * .0003);',
  surface: 'roughnessFactor = .16; metalnessFactor = .35;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03 + fxBase * fxFresnel(normal, 3.) * .12 * fxOn;',
};

B.biomech = {
  color: `diffuseColor.rgb *= .75 + .4 * fxN3(vLocal * 30. + vSeed);`,
  surface: 'roughnessFactor = .25; metalnessFactor = .4;',
};

S.cables = {
  // 케이블 다발. 다 맞추면 면 하나가 서버실 바닥 밑 굵은 전선 다발이다. 피복 입힌 케이블이 세 갈래로 엇갈려 겹겹이
  // 실제로 솟았고, 군데군데 케이블 타이로 묶였다. 피복은 매끈하게 번들거리고 아래로는 어두운 판이 비친다.
  // 면마다 케이블 색이 다르다(빨강, 파랑, 노랑, 초록, 흰색, 검정)
  head: `
    // 케이블: x 높이, y 케이블마다 난수, z 단면(-1~1), w 타이
    vec4 fxCables(vec2 F) {
      vec4 best = vec4(0.);
      for (int L = 0; L < 3; L++) {
        float fl = float(L);
        vec2 R = fxRot((fl - 1.) * .35) * F;
        float y = R.y * 4.5 + fl * .37 + .15 * sin(R.x * 2. + fl * 3.);
        float k = fract(y) - .5;
        float id = floor(y);
        float rad = .3 + .1 * fxH1(id * 7. + fl);
        float c = sqrt(max(0., 1. - pow(k / rad, 2.)));
        float h = c * (.6 + fl * .25) * step(abs(k), rad) * step(.3, fxH1(id * 3. + fl * 5. + uFace));
        float tie = step(.93, fract(R.x * 1.6 + fxH1(id + fl))) * step(.001, h);
        if (h > best.x) best = vec4(h + tie * .08, fxH1(id * 11. + fl * 3.), k / rad, tie);
      }
      return best;
    }
    float fxCablesH(vec2 p, float seed) {
      vec4 c = fxCables(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + .12 * c.x);
    }`,
  height: 'fxCablesH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec4 fxCa = fxCables(fxF);
    vec3 fxBase = diffuseColor.rgb;
    float fxOn = step(.001, fxCa.x);
    vec3 fxBoard = vec3(.06, .065, .07) * (.8 + .4 * fxN2(fxF * 60.));
    vec3 fxCab = fxBase * (.75 + .35 * fxCa.y) * (.55 + .5 * sqrt(max(0., 1. - fxCa.z * fxCa.z)));
    fxCab = mix(fxCab, uFace > 4.5 ? vec3(.9) : vec3(.05), fxCa.w);
    vec3 fxC = mix(fxBoard, fxCab, fxOn);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxCa.w * step(.5, fract(fxF.x * 120.)) * .0005);',
  surface: 'roughnessFactor = mix(.8, .25, fxOn);',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03;',
};

B.cables = {
  color: `diffuseColor.rgb *= .85 + .2 * fxN3(vLocal * 40. + vSeed);`,
  surface: 'roughnessFactor = .6;',
};

S.cave = {
  // 석회동굴 천장. 다 맞추면 면 하나가 종유석이 매달린 동굴 천장을 올려다본 모습이다. 크고 작은 종유석이 뾰족하게
  // 실제로 솟아 빽빽이 매달렸고, 끝마다 물방울이 맺혀 반짝이며, 뿌리 쪽엔 흘러내린 석회가 주름(유석)을 이룬다.
  // 면마다 석회가 다르다(크림, 황토, 붉은 녹, 잿빛, 흰색, 푸른 조명)
  head: `
    // 종유석: x 높이, y 끝(물방울), z 돌기마다 난수
    vec3 fxStal(vec2 F) {
      vec3 best = vec3(0.);
      for (int L = 0; L < 2; L++) {
        float s = L == 0 ? 3. : 6.5;
        vec2 g = F * s + float(L) * 9. + uFace * 4.;
        vec2 i = floor(g), f = fract(g);
        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            vec2 c = i + vec2(float(x), float(y));
            vec2 o = vec2(fxH2(c), fxH2(c + 17.3)) * .6 + .2;
            float hs = fxH2(c + 5.5 + float(L));
            float R = (L == 0 ? .5 : .38) * (.6 + .4 * hs);
            float r = length(vec2(float(x), float(y)) + o - f) / R;
            float h = pow(max(0., 1. - r), 1.5) * (L == 0 ? 1. : .55) * (.5 + .5 * hs);
            if (h > best.x) best = vec3(h, 1. - smoothstep(0., .14, r), hs);
          }
        }
      }
      best.x += .06 * fxF2(F * 6. + uFace);
      return best;
    }
    float fxStalH(vec2 p, float seed) {
      vec3 s = fxStal(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + .2 * s.x);
    }`,
  height: 'fxStalH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec3 fxSt = fxStal(fxF);
    vec3 fxBase = diffuseColor.rgb;
    float fxFlow = .5 + .5 * sin(fxSt.x * 60. + fxN2(fxF * 8.) * 4.);
    vec3 fxC = fxBase * (.35 + .75 * fxSt.x) * (.88 + .12 * fxFlow) * (.9 + .15 * fxSt.z);
    fxC = mix(fxC, min(fxBase * 1.3 + .15, vec3(1.)), fxSt.y * .6);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxFlow * .0005 + fxN2(fxF * 200.) * .0002);',
  surface: 'roughnessFactor = mix(.6, .08, fxSt.y);',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .04 + vec3(1.) * fxSt.y * fxGlint(fxF * 9., .5, 1.2) * .8;',
};

B.cave = {
  color: `diffuseColor.rgb *= .75 + .4 * fxN3(vLocal * 30. + vSeed);`,
  surface: 'roughnessFactor = .7;',
};

S.travertine = {
  // 계단식 온천(석회화 단구). 다 맞추면 면 하나가 비탈을 따라 층층이 내려앉은 온천 웅덩이다. 넘친 물이 남긴 석회가
  // 웅덩이 가장자리에 둥근 둑으로 쌓여 실제로 솟았고, 둑 안엔 맑은 물이 평평하게 고여 하늘빛으로 비치며, 둑 앞면엔
  // 흘러내린 석회 주름이 섰다. 면마다 물빛이 다르다(청록, 파랑, 초록, 주황 쇳물, 분홍, 우윳빛)
  head: `
    // 단구: x 높이, y 물, z 둑, w 단 번호
    vec4 fxTerr(vec2 F) {
      float n = F.y * 2.3 + fxF2(F * 1.6 + uFace) * 1.3 + .12 * sin(F.x * 5. + uFace);
      float lvl = floor(n);
      float f = fract(n);
      float rim = exp(-pow((f - .06) / .06, 2.)) * (.9 + .1 * fxN2(F * 30.));
      float rock = lvl * .2 + .02 + rim * .17;
      float water = lvl * .2 + .13;
      float wet = step(.12, f) * step(rock, water);
      return vec4(max(rock, water * wet), wet, rim, lvl);
    }
    float fxTerrH(vec2 p, float seed) {
      vec4 t = fxTerr(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + .2 * (t.x - .1 * t.w + .2));
    }`,
  height: 'fxTerrH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec4 fxTe = fxTerr(fxF);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxRock = mix(vec3(.94, .93, .9), fxBase, .18) * (.85 + .15 * fxN2(fxF * 80.));
    float fxDrip = .5 + .5 * sin(fxF.x * 90. + fxN2(fxF * 10.) * 3.);
    fxRock *= 1. - (1. - fxTe.z) * step(fxTe.y, .5) * fxDrip * .08;
    vec3 fxWater = mix(fxBase * .7, min(fxBase * 1.3 + .1, vec3(1.)), smoothstep(.1, .6, fract(fxF.y * 2.3 + fxF2(fxF * 1.6 + uFace) * 1.3)));
    vec3 fxC = mix(fxRock, fxWater, fxTe.y);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxTe.y * fxN2(fxF * 30. + uTime * .2) * .0004 + (1. - fxTe.y) * fxN2(fxF * 160.) * .0004);',
  surface: 'roughnessFactor = mix(.75, .05, fxTe.y);',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .04 + vec3(1.) * fxTe.y * fxFresnel(normal, 4.) * .15;',
};

B.travertine = {
  color: `diffuseColor.rgb *= .85 + .2 * fxN3(vLocal * 30. + vSeed);`,
  surface: 'roughnessFactor = .7;',
};

S.canyon = {
  // 협곡 지층. 다 맞추면 면 하나가 협곡을 위에서 본 지형 모형이다. 땅이 층층이 깎여 계단처럼 실제로 솟았고, 깎아지른
  // 절벽 벽엔 지층이 가로 띠로 켜켜이 드러나며, 단 위 평평한 곳엔 마른 흙과 덤불. 면마다 바위가 다르다
  // (붉은 사암, 주황, 황토, 잿빛, 분홍, 보랏빛)
  head: `
    // 협곡: x 높이(0~1), y 단 번호, z 단 안 위치
    vec3 fxCanyon(vec2 F) {
      float n = fxF2(F * 1.2 + uFace * 3.) * 1.3 + .12 * F.y;
      float t = n * 7.;
      float lvl = floor(t), f = fract(t);
      return vec3((lvl + smoothstep(.72, 1., f)) / 7., lvl, f);
    }
    float fxCanyonH(vec2 p, float seed) {
      vec3 c = fxCanyon(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + .26 * (c.x - .2));
    }`,
  height: 'fxCanyonH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec3 fxCa = fxCanyon(fxF);
    vec3 fxBase = diffuseColor.rgb;
    float fxTop = (.004 + .26 * (fxCa.x - .2)) * smoothstep(0., .05, fxEdge());
    float fxWall = smoothstep(.006, .016, abs(vLift - fxTop));
    float fxBand = fract(vLift * 55. + fxN2(fxF * 6.) * .4);
    vec3 fxStrata = fxBase * (.6 + .5 * step(.5, fxBand)) * (.85 + .3 * fxH1(floor(vLift * 55.)));
    vec3 fxFlat = mix(fxBase * 1.1 + .05, vec3(.85, .78, .62), .3) * (.85 + .2 * fxN2(fxF * 90.));
    float fxBush = step(.8, fxN2(fxF * 70.)) * step(.2, fxCa.z);
    fxFlat = mix(fxFlat, vec3(.3, .38, .2), fxBush * .7);
    vec3 fxC = mix(fxFlat, fxStrata, fxWall);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxN2(fxF * 220.) * .0004);',
  surface: 'roughnessFactor = .9;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .04;',
};

B.canyon = {
  color: `diffuseColor.rgb *= .75 + .4 * fxN3(vLocal * 30. + vSeed);`,
  surface: 'roughnessFactor = .9;',
};

S.meteorite = {
  // 운석. 면마다 다른 운석이다. 검은 용융각(대기를 뚫고 오며 녹아 생긴 껍질)엔 엄지로 누른 듯한 오목 자국이 패였고,
  // 철운석 단면은 산으로 부식시켜 세 방향으로 엇갈린 결정 띠(비드만슈테텐 무늬)가 솟았으며, 팔라사이트는 금속 그물 사이로
  // 노란 감람석 결정이 박혔다. 콘드라이트는 둥근 알갱이가 돋은 잿빛 돌, 몰다바이트는 주름지게 깎인 초록 유리,
  // 녹슨 철운석은 갈색 녹과 구멍
  head: `
    // 운석: x 높이, y 결정·알갱이, z 금속, w 녹
    vec4 fxMeteor(vec2 F) {
      vec2 P = F * 1.3 + uFace * 3.;
      if (uFace < .5) {
        vec3 v = fxVoronoi(P * 3.);
        return vec4(.4 + .6 * smoothstep(0., .5, v.x) * 0. + smoothstep(.0, .45, v.x) * .5, 0., 0., 0.);
      } else if (uFace < 1.5) {
        float a = abs(fract(dot(P, vec2(1., 0.)) * 6.) - .5);
        float b = abs(fract(dot(P, vec2(.5, .866)) * 6.) - .5);
        float c = abs(fract(dot(P, vec2(-.5, .866)) * 6.) - .5);
        float lam = smoothstep(.12, .2, min(min(a, b), c));
        return vec4(.5 + .4 * lam, lam, 1., 0.);
      } else if (uFace < 2.5) {
        vec3 v = fxVoronoi(P * 5.);
        float xtal = smoothstep(.04, .12, v.y);
        return vec4(.55 + .25 * (1. - xtal) + .15 * xtal * smoothstep(.0, .4, v.x), xtal, 1. - xtal, 0.);
      } else if (uFace < 3.5) {
        vec3 v = fxVoronoi(P * 7.);
        float ch = (1. - smoothstep(.2, .3, v.x)) * step(.5, v.z);
        return vec4(.5 + .2 * fxF2(P * 6.) + .25 * ch * sqrt(max(0., 1. - pow(v.x / .3, 2.))), ch, step(.97, fxH2(floor(P * 60.))), 0.);
      } else if (uFace < 4.5) {
        float r = 1. - abs(fxN2(P * 3.) * 2. - 1.);
        float r2 = 1. - abs(fxN2(P * 7. + 3.) * 2. - 1.);
        return vec4(.35 + .4 * r * r + .2 * r2 * r2, r, 0., 0.);
      }
      vec3 v = fxVoronoi(P * 6.);
      float pit = 1. - smoothstep(.1, .25, v.x);
      return vec4(.6 + .2 * fxF2(P * 4.) - pit * .3 * step(.6, v.z), 0., .3, smoothstep(.4, .7, fxN2(P * 5.)));
    }
    float fxMeteorH(vec2 p, float seed) {
      vec4 m = fxMeteor(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + .12 * m.x);
    }`,
  height: 'fxMeteorH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec4 fxMe = fxMeteor(fxF);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxC = fxBase * (.55 + .6 * fxMe.x) * (.88 + .2 * fxN2(fxF * 120.));
    if (uFace > 1.5 && uFace < 2.5) fxC = mix(vec3(.62, .62, .6) * (.8 + .4 * fxMe.x), fxBase * (.7 + .5 * fxN2(fxF * 40.)), fxMe.y);
    if (uFace > 2.5 && uFace < 3.5) fxC = mix(fxC, fxC * 1.25, fxMe.y) + vec3(.6) * fxMe.z;
    fxC = mix(fxC, vec3(.45, .2, .08) * (.7 + .5 * fxN2(fxF * 60.)), fxMe.w * .7);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxN2(fxF * 260.) * .0003);',
  surface: 'roughnessFactor = uFace > .5 && uFace < 2.5 ? .25 : (uFace > 3.5 && uFace < 4.5 ? .08 : .7); metalnessFactor = fxMe.z * .8;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03 + (uFace > 3.5 && uFace < 4.5 ? fxBase * fxFresnel(normal, 2.) * .3 : vec3(0.));',
};

B.meteorite = {
  color: `diffuseColor.rgb *= .8 + .3 * fxN3(vLocal * 30. + vSeed);`,
  surface: 'roughnessFactor = .6;',
};

S.salt = {
  // 소금 결정. 칸마다 커다란 정육면체 소금 결정 하나가 솟아 있는데, 가장자리가 먼저 자라고 가운데가 덜 자라 계단처럼
  // 층층이 꺼져 들어간(호퍼 결정) 모양이다. 계단 모서리는 빛을 받아 반짝이고 결정은 속이 비친다. 둘레엔 잔 소금 알갱이.
  // 칸마다 결정이 조금씩 돌아가 있다. 면마다 소금이 다르다(흰 소금, 분홍 암염, 푸른 암염, 주황, 잿빛, 검은 소금)
  head: `
    // 호퍼: x 높이, y 계단 모서리, z 결정 위인지
    vec3 fxHopper(vec2 p, float seed) {
      vec2 q = fxRot((fxH1(seed * 7.) - .5) * .6) * (p / uSticker.x);
      float m = max(abs(q.x), abs(q.y));
      float on = 1. - smoothstep(.82, .85, m);
      float sm = m * 5.;
      float st = (floor(sm) + smoothstep(.75, 1., fract(sm))) / 5.;
      float h = on * (.3 + st * .8) + (1. - on) * (.14 + .04 * fxN2(q * 9. + seed));
      float lip = on * smoothstep(.7, .78, fract(sm)) * (1. - smoothstep(.92, 1., fract(sm))) * step(.15, m);
      return vec3(h, lip, on);
    }
    float fxHopperH(vec2 p, float seed) {
      vec3 h = fxHopper(p, seed);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + .14 * h.x);
    }`,
  height: 'fxHopperH',
  color: `
    if (fxEdge() < 0.) discard;
    vec3 fxHo = fxHopper(vLocal.xy, vSeed);
    vec3 fxBase = diffuseColor.rgb;
    vec2 fxQs = fxQ();
    vec3 fxC = fxBase * (.55 + .5 * fxHo.x) * (.9 + .12 * fxN2(fxQs * 60.));
    fxC = mix(fxC, min(fxBase * 1.4 + .2, vec3(1.)), fxHo.y * .7);
    fxC = mix(fxBase * .5 * (.7 + .5 * fxN2(fxQs * 80.)), fxC, fxHo.z);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxN2(fxQs * 200.) * .0002);',
  surface: 'roughnessFactor = mix(.7, .15, fxHo.z);',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .05 + vec3(1.) * fxHo.y * fxGlint(fxQs * 20., .4, 1.5) * .6 + fxBase * fxHo.z * fxFresnel(normal, 2.) * .15;',
};

B.salt = {
  color: `diffuseColor.rgb *= .85 + .2 * fxN3(vLocal * 40. + vSeed);`,
  surface: 'roughnessFactor = .5;',
};

S.mudpot = {
  // 진흙 웅덩이. 다 맞추면 면 하나가 화산 지대의 끓는 진흙 웅덩이다. 진흙이 군데군데 거품으로 실제로 부풀어 오르다
  // 퐁 터지고, 터진 자리에서 동그란 물결이 번져 나간다. 겉은 젖어 번들거리고 가장자리는 말라 갈라졌다.
  // 면마다 진흙이 다르다(잿빛, 황토, 붉은 철, 노란 유황, 흰 고령토, 검은 진흙)
  head: `
    // 진흙: x 높이, y 거품, z 물결
    vec3 fxMud(vec2 F) {
      vec2 g = F * 2.6 + uFace * 2.;
      vec2 i = floor(g), f = fract(g);
      float h = .3 + .1 * fxF2(F * 4. + uFace);
      float bub = 0., wave = 0.;
      for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
          vec2 c = i + vec2(float(x), float(y));
          vec2 o = vec2(fxH2(c), fxH2(c + 17.3)) * .6 + .2;
          float d = length(vec2(float(x), float(y)) + o - f);
          float ph = fract(uTime * (.12 + .1 * fxH2(c + 3.)) + fxH2(c + 7.));
          if (ph < .7) {
            float r0 = ph / .7 * .42;
            float dome = sqrt(max(0., 1. - pow(d / max(r0, .01), 2.))) * r0 * 1.6;
            h = max(h, .3 + dome);
            bub = max(bub, step(.001, dome));
          } else {
            float w = (ph - .7) / .3;
            float ring = exp(-pow((d - w * .7) / .06, 2.)) * (1. - w) * .18;
            h += ring;
            wave = max(wave, ring * 5.);
          }
        }
      }
      return vec3(h, bub, wave);
    }
    float fxMudH(vec2 p, float seed) {
      vec3 m = fxMud(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + .14 * m.x);
    }`,
  height: 'fxMudH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec3 fxMu = fxMud(fxF);
    vec3 fxBase = diffuseColor.rgb;
    float fxDry = smoothstep(.55, .75, fxN2(fxF * 3. + uFace * 2.));
    float fxCrack = (1. - smoothstep(0., .06, fxVoronoi(fxF * 12.).y)) * fxDry;
    vec3 fxC = fxBase * (.6 + .5 * fxMu.x) * (.9 + .15 * fxN2(fxF * 60.));
    fxC = mix(fxC, mix(fxBase, vec3(.9, .88, .82), .25), fxDry * .5);
    fxC *= 1. - fxCrack * .6;
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxN2(fxF * 200.) * .0003 - fxCrack * .0006);',
  surface: 'roughnessFactor = mix(.12, .85, fxDry) - fxMu.y * .08;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .04 + vec3(1.) * fxMu.y * fxFresnel(normal, 3.) * .2;',
};

B.mudpot = {
  color: `diffuseColor.rgb *= .75 + .4 * fxN3(vLocal * 30. + vSeed);`,
  surface: 'roughnessFactor = .6;',
};

S.bronze = {
  // 고대 청동기. 다 맞추면 면 하나가 제기 몸통의 한 자락이다. 사선으로 엇갈린 마름모 돋을띠가 실제로 솟고, 마름모마다
  // 가운데 둥근 젖꼭지 돌기(유정)와 그 둘레 고리, 바탕엔 네모 소용돌이 뇌문이 빽빽이 돋았다. 높은 곳은 닳아 청동빛이
  // 드러나고 낮은 곳엔 녹이 고였다. 면마다 녹이 다르다(녹청, 남동광 파랑, 갈색, 칠흑, 금빛 청동, 붉은 적동광)
  head: `
    // 청동: x 높이, y 높은 곳(닳은 정도), z 낮은 곳(녹 고임)
    vec3 fxBronze(vec2 F) {
      vec2 dg = fxRot(.785398) * F * 2.4 + uFace;
      vec2 df = fract(dg) - .5;
      float dm = max(abs(df.x), abs(df.y));
      float r = length(df);
      float ridge = smoothstep(.42, .45, dm);
      float boss = sqrt(max(0., 1. - pow(r / .15, 2.)));
      float bring = exp(-pow((r - .21) / .025, 2.));
      float t = atan(df.y, df.x) / 6.2832 + .5;
      float lei = step(.5, fract(dm * 9. - t)) * step(.26, r) * step(dm, .41);
      float h = .3 + lei * .12 + ridge * .35 + boss * .5 + bring * .15;
      return vec3(h, smoothstep(.55, .8, h), 1. - smoothstep(.3, .4, h));
    }
    float fxBronzeH(vec2 p, float seed) {
      vec3 b = fxBronze(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + .1 * b.x);
    }`,
  height: 'fxBronzeH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec3 fxBr = fxBronze(fxF);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxPatina = fxBase * (.75 + .4 * fxN2(fxF * 40.)) * (.85 + .2 * fxF2(fxF * 6. + uFace));
    vec3 fxMetal = vec3(.72, .54, .3) * (.8 + .3 * fxN2(fxF * 90.));
    vec3 fxC = mix(fxPatina, fxMetal, fxBr.y * .55);
    fxC *= 1. - fxBr.z * .25;
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxN2(fxF * 220.) * .0004);',
  surface: 'roughnessFactor = mix(.75, .35, fxBr.y); metalnessFactor = fxBr.y * .6;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03;',
};

B.bronze = {
  color: `diffuseColor.rgb *= .85 + .2 * fxN3(vLocal * 30. + vSeed);`,
  surface: 'roughnessFactor = .85;',
};

S.tablet = {
  // 쐐기문자 점토판. 다 맞추면 면 하나가 손바닥만 한 점토판을 크게 키운 것이다. 판은 가운데가 도톰하게 부풀었고,
  // 가로로 그은 줄 사이마다 갈대 붓으로 눌러 찍은 쐐기 자국(세모 머리와 가는 꼬리)이 가로, 세로, 꺾쇠꼴로 줄지어 실제로
  // 패였다. 구운 흙엔 얼룩과 잔금. 면마다 흙이 다르다(황토, 붉은 흙, 잿빛, 짙은 갈색, 흰 흙, 검게 그을린 흙)
  head: `
    // 점토판: x 높이, y 쐐기 자국, z 줄 긋기
    vec3 fxTablet(vec2 F) {
      float bulge = 1. - .25 * dot(F, F);
      float row = F.y * 4.5 + uFace * .3;
      float rf = fract(row);
      float rule = exp(-pow((rf - .03) / .02, 2.));
      float cx = F.x * 8. + floor(row) * 1.7;
      float cell = floor(cx);
      vec2 lp = vec2(fract(cx) - .5, (rf - .55) * 2.);
      float kind = fxH2(vec2(cell, floor(row)) + uFace * 7.);
      if (kind > .7) lp = vec2(lp.y, -lp.x);
      float imp = 0.;
      if (kind < .85) {
        float head = step(-.38, lp.x) * step(lp.x, -.08) * step(abs(lp.y), (-.08 - lp.x) * 1.3);
        float tail = step(-.1, lp.x) * step(lp.x, .36) * step(abs(lp.y), .045);
        imp = max(head * (1. - abs(lp.y) * 1.5), tail * .55);
      } else if (kind < .95) {
        vec2 w = fxRot(.785398) * lp;
        float a = step(-.3, w.x) * step(w.x, .05) * step(abs(w.y), .05);
        vec2 w2 = fxRot(-.785398) * lp;
        float b = step(-.3, w2.x) * step(w2.x, .05) * step(abs(w2.y), .05);
        imp = max(a, b) * .8;
      }
      return vec3(.3 + bulge * .55 - imp * .28 - rule * .06, imp, rule);
    }
    float fxTabletH(vec2 p, float seed) {
      vec3 t = fxTablet(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + .12 * t.x);
    }`,
  height: 'fxTabletH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec3 fxTa = fxTablet(fxF);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxC = fxBase * (.75 + .3 * fxN2(fxF * 9.)) * (.9 + .12 * fxN2(fxF * 120.));
    fxC *= 1. - fxTa.y * .45 - fxTa.z * .2;
    float fxCrk = 1. - smoothstep(0., .015, abs(fxF2(fxF * 3. + uFace * 4.) - .5));
    fxC *= 1. - fxCrk * smoothstep(.55, .7, fxN2(fxF * 2.)) * .5;
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxN2(fxF * 250.) * .0005 - fxCrk * .0004);',
  surface: 'roughnessFactor = .95;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03;',
};

B.tablet = {
  color: `diffuseColor.rgb *= .8 + .3 * fxN3(vLocal * 40. + vSeed);`,
  surface: 'roughnessFactor = .95;',
};

S.coins = {
  // 옛 동전 더미. 다 맞추면 면 하나가 벨벳 위에 쏟은 옛 동전 무더기다. 크고 작은 동전이 비스듬히 겹쳐 쌓여 실제로
  // 솟았고, 동전마다 도톰한 테, 구슬 띠, 잎 테두리, 가운데 둥근 돋음이 찍혔다. 높은 곳은 닳아 반짝이고 낮은 곳은 거뭇하다.
  // 면마다 금속이 다르다(금, 은, 청동, 녹청, 구리, 호박금)
  head: `
    // 동전: x 높이, y 동전 위, z 돋음 무늬, w 동전마다 난수
    vec4 fxCoins(vec2 F) {
      vec2 g = F * 3.2 + uFace * 2.;
      vec2 i = floor(g), f = fract(g);
      vec4 best = vec4(0.);
      float bz = -1.;
      for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
          for (int k = 0; k < 2; k++) {
            vec2 c = i + vec2(float(x), float(y));
            vec2 cid = c + float(k) * 31.7;
            vec2 o = vec2(fxH2(cid), fxH2(cid + 17.3));
            float R = .45 + .15 * fxH2(cid + 4.);
            vec2 d = vec2(float(x), float(y)) + o - f;
            float r = length(d) / R;
            float z = fxH2(cid + 21.) + float(k);
            if (r < 1. && z > bz) {
              bz = z;
              float an = atan(d.y, d.x);
              float rim = smoothstep(.82, .9, r) * (1. - smoothstep(.96, 1., r));
              float ringIn = exp(-pow((r - .62) / .03, 2.));
              float dots = step(.68, r) * step(r, .78) * step(.55, fract(an / 6.2832 * 40.));
              float boss = sqrt(max(0., 1. - pow(r / .28, 2.)));
              float wreath = step(.34, r) * step(r, .55) * (.5 + .5 * sin(an * 24.));
              float tilt = dot(d / R, vec2(fxH2(cid + 5.) - .5, fxH2(cid + 6.) - .5)) * .3;
              float relief = rim * .14 + ringIn * .06 + dots * .05 + boss * .1 + wreath * .05;
              best = vec4(z * .35 + .25 + tilt + relief, 1., clamp(relief * 8., 0., 1.), fxH2(cid + 9.));
            }
          }
        }
      }
      return best;
    }
    float fxCoinsH(vec2 p, float seed) {
      vec4 c = fxCoins(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + .08 * c.x);
    }`,
  height: 'fxCoinsH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec4 fxCo = fxCoins(fxF);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxVel = vec3(.12, .04, .06) * (.7 + .4 * fxN2(fxF * 200.));
    vec3 fxMetal = fxBase * (.7 + .25 * fxCo.w) * (.75 + .45 * fxCo.z);
    fxMetal *= .85 + .2 * fxN2(fxF * 90.);
    vec3 fxC = mix(fxVel, fxMetal, fxCo.y);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxN2(fxF * 260.) * .0002);',
  surface: 'roughnessFactor = mix(.9, .3 - fxCo.z * .12, fxCo.y); metalnessFactor = fxCo.y * .9;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03;',
};

B.coins = {
  color: `diffuseColor.rgb *= .8 + .3 * fxN3(vLocal * 60. + vSeed);`,
  surface: 'roughnessFactor = .9;',
};

S.cloisonne = {
  // 칠보(클루아조네). 다 맞추면 면 하나가 칠보 꽃병의 한 자락이다. 금선을 세워 붙여 만든 칸과 흐르는 덩굴 선마다 색 유약을
  // 채워 구운 뒤 금선 높이까지 갈아 내, 금선은 가늘게 솟고 유약은 칸마다 살짝 오목하게 반들거린다. 유약엔 잔 기포.
  // 면마다 바탕 유약이 다르다(코발트, 산호 빨강, 비취, 황금 노랑, 흰색, 남색)
  head: `
    // 칠보: x 높이, y 금선, z 칸마다 난수
    vec3 fxCloi(vec2 F) {
      vec2 w = F + vec2(fxN2(F * 2.5 + uFace), fxN2(F * 2.5 + 5. + uFace)) * .25;
      vec3 v = fxVoronoi(w * 4. + uFace);
      float wire = 1. - smoothstep(.02, .045, v.y);
      float scroll = smoothstep(.455, .475, abs(fract(fxF2(F * 1.5 + uFace * 3.) * 5.) - .5));
      float wr = max(wire, scroll);
      float enamel = .9 - .12 * smoothstep(.05, .3, v.y);
      return vec3(max(enamel, wr), wr, v.z);
    }
    float fxCloiH(vec2 p, float seed) {
      vec3 c = fxCloi(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + .05 * c.x);
    }`,
  height: 'fxCloiH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec3 fxCl = fxCloi(fxF);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxEn = mix(fxBase * .8, min(fxBase * 1.3 + .1, vec3(1.)), fxCl.z);
    float fxAcc = step(.92, fract(fxCl.z * 7.3));
    vec3 fxAccC = fract(fxCl.z * 13.) < .5 ? vec3(.2, .7, .7) : vec3(.95, .9, .8);
    fxEn = mix(fxEn, fxAccC, fxAcc * .8);
    float fxBub = step(.985, fxH2(floor(fxF * 220.)));
    fxEn = mix(fxEn, fxEn * .7, fxBub);
    vec3 fxGold = vec3(.95, .76, .36) * (.85 + .2 * fxN2(fxF * 140.));
    vec3 fxC = mix(fxEn, fxGold, fxCl.y);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxN2(fxF * 300.) * .00015);',
  surface: 'roughnessFactor = mix(.06, .22, fxCl.y); metalnessFactor = fxCl.y;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .04;',
};

B.cloisonne = {
  color: `diffuseColor.rgb *= .85 + .2 * fxN3(vLocal * 40. + vSeed);`,
  surface: 'roughnessFactor = .3;',
};

S.jeondol = {
  // 무늬 벽돌(전돌). 칸마다 구운 흙벽돌 한 장에 산수 무늬가 돋을새김으로 찍혀 있다. 도톰한 테두리 안에 둥근 봉우리가
  // 세 겹으로 겹쳐 솟고 봉우리마다 안쪽으로 결 선이 패였으며, 위로는 소용돌이 구름이 감긴다. 칸마다 무늬가 조금씩 다르다.
  // 면마다 흙이 다르다(붉은 벽돌, 잿빛 회도, 연한 황토, 짙은 갈색, 주황, 흰 회칠)
  head: `
    // 전돌: x 높이, y 테두리, z 봉우리 결, w 구름
    vec4 fxTile(vec2 p, float seed) {
      vec2 q = p / uSticker.x;
      float m = max(abs(q.x), abs(q.y));
      float frame = smoothstep(.74, .77, m) * (1. - smoothstep(.9, .93, m));
      float inner = step(m, .75);
      float mount = 0., grain = 0.;
      for (int j = 0; j < 3; j++) {
        float fj = float(j);
        float by = -.7 + fj * .26;
        float px = q.x * (1.6 + fj * .35) + fj * .4 + fxH1(seed * 5. + fj);
        float top = by + .28 * pow(abs(sin(px * 3.1416)), .7);
        float d = top - q.y;
        float ins = step(0., d) * step(by - .25, q.y);
        float hj = ins * (.28 + .12 * smoothstep(0., .07, d) + .06 * fj);
        if (hj > mount) { mount = hj; grain = (1. - smoothstep(.0, .2, abs(fract(d * 14.) - .5) * 2. - .6)) * ins; }
      }
      vec2 cq = q - vec2(.35 * sin(seed * 7.), .48);
      float cr = length(cq);
      float ca = atan(cq.y, cq.x);
      float curl = (1. - smoothstep(.0, .03, abs(fract(ca / 6.2832 + cr * 3.5) - .5) * cr * 2.)) * step(cr, .24);
      float h = .3 + frame * .38 + inner * (mount + curl * .14 - grain * .05);
      return vec4(h, frame, grain * inner, curl * inner);
    }
    float fxTileH(vec2 p, float seed) {
      vec4 t = fxTile(p, seed);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + .12 * t.x);
    }`,
  height: 'fxTileH',
  color: `
    if (fxEdge() < 0.) discard;
    vec4 fxTi = fxTile(vLocal.xy, vSeed);
    vec3 fxBase = diffuseColor.rgb;
    vec2 fxQj = fxQ();
    vec3 fxC = fxBase * (.6 + .5 * fxTi.x) * (.85 + .2 * fxN2(fxQj * 30.)) * (.9 + .12 * fxN2(fxQj * 160.));
    fxC *= 1. - fxTi.z * .3;
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxN2(fxQj * 220.) * .0005);',
  surface: 'roughnessFactor = .92;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03;',
};

B.jeondol = {
  color: `diffuseColor.rgb *= .8 + .3 * fxN3(vLocal * 40. + vSeed);`,
  surface: 'roughnessFactor = .9;',
};

S.repousse = {
  // 은 타출. 다 맞추면 면 하나가 뒤에서 두들겨 낸 은쟁반의 한 자락이다. 꽃잎 여섯 장짜리 꽃이 둥글게 실제로 부풀어
  // 솟고 꽃 사이엔 작은 꽃봉오리 돋음, 바탕엔 고리 정으로 촘촘히 쪼아 낸 무광 점 무늬. 높은 곳은 닦여 번쩍이고
  // 오목한 곳은 거뭇하게 산화했다. 면마다 금속이 다르다(은, 금, 구리, 청동, 검은 산화은, 푸른 강철)
  head: `
    // 타출: x 높이, y 돋음(꽃·봉오리), z 바탕
    vec3 fxRep(vec2 F) {
      vec2 g = F * 2.2 + uFace;
      vec2 f = fract(g) - .5;
      float r = length(f);
      float a = atan(f.y, f.x);
      float petals = .5 + .5 * cos(a * 6. + fxH2(floor(g)) * 3.);
      float R = .24 + .1 * petals;
      float rose = sqrt(max(0., 1. - pow(r / R, 2.))) * (.75 + .25 * petals) + (1. - smoothstep(.0, .06, r)) * .15;
      vec2 f2 = fract(g + .5) - .5;
      float bud = sqrt(max(0., 1. - pow(length(f2) / .12, 2.))) * .6;
      float up = max(rose, bud);
      return vec3(.3 + up * .7, step(.01, up), 1. - step(.01, up));
    }
    float fxRepH(vec2 p, float seed) {
      vec3 r = fxRep(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + .12 * r.x);
    }`,
  height: 'fxRepH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec3 fxRp = fxRep(fxF);
    vec3 fxBase = diffuseColor.rgb;
    float fxMatt = 1. - smoothstep(.15, .3, abs(length(fract(fxF * 70.) - .5) - .25));
    vec3 fxC = fxBase * (.45 + .7 * fxRp.x);
    fxC *= 1. - fxRp.z * (.35 + fxMatt * .15);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxRp.z * fxMatt * .0005);',
  surface: 'roughnessFactor = mix(.18, .55, fxRp.z); metalnessFactor = .95;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03;',
};

B.repousse = {
  color: `diffuseColor.rgb *= .85 + .2 * fxN3(vLocal * 40. + vSeed);`,
  surface: 'roughnessFactor = .4; metalnessFactor = .9;',
};

S.crater = {
  // 크레이터 들판. 다 맞추면 면 하나가 공기 없는 천체의 표면이다. 크고 작은 운석 구덩이가 겹겹이 패였고, 구덩이마다 둥근
  // 테가 실제로 솟았으며 큰 구덩이 가운데엔 봉우리가 섰다. 큰 구덩이에선 밝은 분출물 줄기가 사방으로 뻗고, 바닥엔 잔돌.
  // 면마다 천체가 다르다(흰 고지대, 붉은 화성, 검은 칼리스토, 노란 황, 푸른 얼음, 분홍빛 질소 얼음)
  head: `
    // 크레이터: x 높이, y 분출물 줄기, z 구덩이 안
    vec3 fxCrater(vec2 F) {
      float h = .4 + .08 * fxF2(F * 3. + uFace);
      float rays = 0., bowlIn = 0.;
      for (int L = 0; L < 3; L++) {
        float s = L == 0 ? 1.6 : (L == 1 ? 4. : 10.);
        vec2 g = F * s + float(L) * 5.3 + uFace * 3.;
        vec2 i = floor(g), f = fract(g);
        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            vec2 c = i + vec2(float(x), float(y));
            if (fxH2(c + 3.) < (L == 0 ? .45 : .3)) continue;
            vec2 o = vec2(fxH2(c), fxH2(c + 17.3)) * .6 + .2;
            vec2 d = vec2(float(x), float(y)) + o - f;
            float R = .3 + .15 * fxH2(c + 9.);
            float r = length(d) / R;
            if (r < 1.7) {
              float amp = L == 0 ? .5 : (L == 1 ? .3 : .14);
              float bowl = -(1. - r * r) * .9 * step(r, 1.);
              float rim = exp(-pow((r - 1.) / .16, 2.)) * .5;
              float peak = L == 0 ? exp(-pow(r / .16, 2.)) * .55 : 0.;
              h += (bowl + rim + peak) * amp;
              bowlIn = max(bowlIn, step(r, .95) * amp * 2.);
              if (L == 0) rays = max(rays, step(1.1, r) * (1. - smoothstep(1.1, 1.7, r)) * smoothstep(.55, .75, fract(atan(d.y, d.x) * 2.2 + fxH2(c) * 5.)));
            }
          }
        }
      }
      return vec3(h, rays, bowlIn);
    }
    float fxCraterH(vec2 p, float seed) {
      vec3 c = fxCrater(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + .12 * c.x);
    }`,
  height: 'fxCraterH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec3 fxCr = fxCrater(fxF);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxC = fxBase * (.55 + .5 * clamp(fxCr.x, 0., 1.2)) * (.85 + .25 * fxN2(fxF * 50.));
    fxC *= 1. - fxCr.z * .12;
    fxC = mix(fxC, min(fxBase * 1.4 + .15, vec3(1.)), fxCr.y * .5);
    float fxRock = step(.96, fxH2(floor(fxF * 120.)));
    fxC *= 1. - fxRock * .4;
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxN2(fxF * 260.) * .0005 + fxRock * .0005);',
  surface: 'roughnessFactor = .95;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03;',
};

B.crater = {
  color: `diffuseColor.rgb *= .8 + .3 * fxN3(vLocal * 30. + vSeed);`,
  surface: 'roughnessFactor = .9;',
};

S.dunes = {
  // 모래 언덕. 다 맞추면 면 하나가 바람이 쌓은 사구 들판이다. 바람 부는 쪽은 완만하게 오르고 등 너머는 가파르게 떨어지는
  // 언덕 마루가 물결치며 실제로 솟았고, 그 위로 잔 물결 자국이 가지런히 났다. 가파른 면은 그늘이 진다.
  // 면마다 모래가 다르다(붉은 화성, 노란 사하라, 흰 석고, 검은 화산 모래, 분홍 모래, 갈색 타이탄)
  head: `
    // 사구: x 높이, y 가파른 면, z 잔물결
    vec3 fxDune(vec2 F) {
      float u = F.y * 3.4 + .3 * sin(F.x * 3. + uFace) + .25 * fxN2(F * 2. + uFace);
      float k = fract(u);
      float d = k < .82 ? k / .82 : (1. - k) / .18;
      d = d * d * (3. - 2. * d);
      float rip = .5 + .5 * sin(F.y * 60. + F.x * 8. + fxN2(F * 6.) * 3.);
      return vec3(d * .8 + rip * .07 * step(k, .82), step(.82, k), rip);
    }
    float fxDuneH(vec2 p, float seed) {
      vec3 d = fxDune(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + .13 * d.x);
    }`,
  height: 'fxDuneH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec3 fxDu = fxDune(fxF);
    vec3 fxBase = diffuseColor.rgb;
    float fxGrain = fxN2(fxF * 400.) * .6 + fxN2(fxF * 900.) * .4;
    vec3 fxC = fxBase * (.72 + .32 * fxDu.x) * (.88 + .14 * fxDu.z) * (.85 + .25 * fxGrain);
    fxC *= 1. - fxDu.y * .18;
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxDu.z * .0006 + fxGrain * .0006);',
  surface: 'roughnessFactor = .95;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .04;',
};

B.dunes = {
  color: `diffuseColor.rgb *= .8 + .3 * fxN3(vLocal * 30. + vSeed);`,
  surface: 'roughnessFactor = .9;',
};

S.icymoon = {
  // 얼음 위성. 다 맞추면 면 하나가 얼음 지각이 갈라진 위성 표면이다. 갈색 두 겹 능선이 가운데 골을 끼고 길게 휘어 실제로
  // 솟았고, 군데군데 얼음판이 깨져 기울어진 채 다시 얼어붙은 혼돈 지대가 있다. 맑은 얼음은 푸르스름하고 능선과 혼돈 지대엔
  // 소금기 섞인 갈색 물질. 면마다 위성이 다르다(흰 유로파, 푸른 엔켈라두스, 잿빛 가니메데, 분홍 트리톤, 주황 명왕성, 남빛)
  head: `
    // 얼음: x 높이, y 능선, z 혼돈 지대
    vec3 fxIce(vec2 F) {
      float n1 = fxF2(F * 1.4 + uFace * 3.);
      float d1 = abs(fract(n1 * 6.) - .5);
      float ridge = exp(-pow((d1 - .05) / .02, 2.));
      float groove = exp(-pow(d1 / .015, 2.));
      vec3 v = fxVoronoi(F * 4.5 + uFace);
      float chaos = step(.62, fxN2(F * 1.2 + uFace * 5.));
      float block = chaos * smoothstep(0., .08, v.y) * (.35 + .35 * v.z);
      float h = .4 + ridge * .35 - groove * .15 + block * .3 - chaos * .12;
      return vec3(h, max(ridge, groove), chaos * (1. - smoothstep(0., .08, v.y) * .6));
    }
    float fxIceH(vec2 p, float seed) {
      vec3 c = fxIce(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + .11 * c.x);
    }`,
  height: 'fxIceH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec3 fxIc = fxIce(fxF);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxC = fxBase * (.75 + .3 * fxIc.x) * (.9 + .12 * fxN2(fxF * 60.));
    fxC = mix(fxC, vec3(.5, .3, .18), fxIc.y * .65);
    fxC = mix(fxC, mix(fxBase, vec3(.55, .38, .26), .5), fxIc.z * .45);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxN2(fxF * 220.) * .0003);',
  surface: 'roughnessFactor = .35 + fxIc.y * .3;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .05;',
};

B.icymoon = {
  color: `diffuseColor.rgb *= .8 + .3 * fxN3(vLocal * 30. + vSeed);`,
  surface: 'roughnessFactor = .5;',
};

S.asteroid = {
  // 소행성. 다 맞추면 면 하나가 돌무더기 소행성의 겉이다. 집채만 한 바위부터 자갈까지 모난 돌덩이가 빽빽이 실제로 솟아
  // 쌓였고, 사이로 고운 먼지가 찼다. 돌마다 빛깔과 결이 조금씩 다르다. 면마다 소행성이 다르다
  // (황갈 S형, 검은 C형, 금속 M형, 회록 V형, 녹슨 붉은빛, 보랏빛)
  head: `
    // 돌무더기: x 높이, y 돌마다 난수, z 돌 위인지
    vec3 fxRubble(vec2 F) {
      vec3 best = vec3(.15 + .08 * fxF2(F * 9. + uFace), 0., 0.);
      for (int L = 0; L < 3; L++) {
        float s = L == 0 ? 3. : (L == 1 ? 7. : 16.);
        vec2 g = F * s + float(L) * 7.7 + uFace * 3.;
        vec2 i = floor(g), f = fract(g);
        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            vec2 c = i + vec2(float(x), float(y));
            vec2 o = vec2(fxH2(c), fxH2(c + 17.3)) * .6 + .2;
            vec2 d = vec2(float(x), float(y)) + o - f;
            float R = .42 * (.6 + .4 * fxH2(c + 3.));
            float a = atan(d.y, d.x);
            float r = length(d) / R * (1. + .18 * sin(a * 3. + fxH2(c) * 6.) + .1 * sin(a * 5. + fxH2(c + 1.) * 6.));
            float amp = L == 0 ? 1. : (L == 1 ? .55 : .28);
            float h = sqrt(max(0., 1. - r * r)) * amp;
            if (h > best.x) best = vec3(h, fxH2(c + 9.), 1.);
          }
        }
      }
      return best;
    }
    float fxRubbleH(vec2 p, float seed) {
      vec3 r = fxRubble(aHome.xy + p * aHome.z);
      return smoothstep(0., .05, fxEdgeAt(p)) * (.004 + .14 * r.x);
    }`,
  height: 'fxRubbleH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxF = fxFace();
    vec3 fxRu = fxRubble(fxF);
    vec3 fxBase = diffuseColor.rgb;
    vec3 fxC = fxBase * (.65 + .35 * fxRu.y) * (.6 + .5 * fxRu.x) * (.85 + .25 * fxN2(fxF * 90.));
    fxC = mix(fxBase * .45 * (.8 + .4 * fxN2(fxF * 300.)), fxC, fxRu.z);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxN2(fxF * 180.) * .0006);',
  surface: 'roughnessFactor = uFace > 1.5 && uFace < 2.5 ? .35 : .9; metalnessFactor = uFace > 1.5 && uFace < 2.5 ? .8 : 0.;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .03;',
};

B.asteroid = {
  color: `diffuseColor.rgb *= .8 + .3 * fxN3(vLocal * 30. + vSeed);`,
  surface: 'roughnessFactor = .85;',
};

export const SURFACES = Object.keys(S);

export const MOVING = new Set([
  'neon', 'lava', 'water', 'forest', 'space', 'candy', 'ice',
  'electric', 'flesh', 'eldritch', 'gem', 'circuit', 'aurora',
  'stained', 'najeon', 'rain', 'mercury', 'gauge', 'honey', 'clay',
  'holo', 'jelly', 'planet', 'disco',
  'fossil', 'doodle', 'ink', 'lavalamp', 'glass',
  'bubblewrap', 'thermal', 'kaleido', 'flip',
  'blackhole', 'opal', 'dragon',
  'nebula', 'star', 'galaxy', 'slime', 'lantern', 'eyeball', 'viscera', 'brain', 'tesla',
  'hamster',
  'phoenix', 'fairywing', 'dragonegg',
  'coral', 'anemone', 'terrain', 'druze', 'pave', 'greeble', 'reactor', 'cave', 'travertine', 'salt', 'mudpot',
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
      .replace('#include <color_fragment>', `#include <color_fragment>\n${fx.color ?? ''}`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\n${fx.surface ?? ''}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${fx.normal ?? ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${fx.emissive ?? ''}
        totalEmissiveRadiance += diffuseColor.rgb * uFlash;`);
  };
}

/** 겉을 실제로 솟게 하는 질감. 이 테마들은 스티커를 잘게 쪼갠 면으로 만든다. */
export const RAISED = new Set(Object.keys(S).filter((k) => S[k].height));
