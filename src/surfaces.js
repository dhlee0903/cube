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
`;

// 조각 셰이더에서만 쓰는 것
const FRAG = /* glsl */ `

// 스티커 안 좌표. fxQ는 -1~1, fxUV는 0~1
vec2 fxQ() { return vLocal.xy / uSticker.x; }
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

mat2 fxRot(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }

// 이 스티커 평면에서 중력이 당기는 쪽(화면 아래)
vec2 fxDown() {
  vec2 d = -vec2(vTx.y, vTy.y);
  return length(d) > .05 ? normalize(d) : vec2(0., -1.);
}

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

float fxFresnel(vec3 n, float k) { return pow(1. - abs(dot(n, normalize(vViewPosition))), k); }

float fxLine(float d, float w) { return 1. - smoothstep(w - .025, w, d); }

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
float fxTile(vec2 px) {
  float edge = step(px.x, 0.) + step(px.y, 0.) + step(9., px.x) + step(9., px.y);
  if (edge > 0.) return .35;
  float k = 1.;
  if (uFace < .5) {
    // 벽돌
    float row = floor(px.y / 3.);
    float off = mod(row, 2.) * 3.;
    if (mod(px.y, 3.) == 0. || mod(px.x + off, 6.) == 0.) k = .55;
    else if (mod(px.y, 3.) == 2.) k = 1.18;
  } else if (uFace < 1.5) {
    // 돌덩이
    float h = fxH2(floor(px / 2.) + vSeed * 10.);
    k = .8 + .3 * h;
    if (fxH2(px + vSeed * 3.) > .9) k = .55;
  } else if (uFace < 2.5) {
    // 구름 블록
    k = 1.;
    if (px.y == 8. || px.x == 1.) k = 1.12;
    if (px.y == 1. || px.x == 8.) k = .8;
  } else if (uFace < 3.5) {
    // 물음표 블록
    if ((px.x == 1. || px.x == 8.) && (px.y == 1. || px.y == 8.)) return .45;
    vec2 g = px - vec2(3., 2.);
    float on = 0.;
    if (g.y == 6. && g.x >= 1. && g.x <= 3.) on = 1.;
    if (g.y == 5. && (g.x == 0. || g.x == 4.)) on = 1.;
    if (g.y == 4. && g.x == 4.) on = 1.;
    if (g.y == 3. && g.x == 3.) on = 1.;
    if (g.y == 2. && g.x == 2.) on = 1.;
    if (g.y == 0. && g.x == 2.) on = 1.;
    if (on > .5) return 2.2;
    if (px.y == 8. || px.x == 1.) k = 1.15;
    if (px.y == 1. || px.x == 8.) k = .78;
  } else if (uFace < 4.5) {
    // 풀 블록: 위는 풀, 아래는 짙게
    float top = 6. + step(.5, fxH2(vec2(px.x, vSeed * 7.)));
    k = px.y >= top ? 1.15 : (fxH2(px + vSeed * 5.) > .7 ? .55 : .7);
  } else {
    // 물결
    float w = mod(px.x + floor(px.y / 3.) * 2. + floor(uTime * 3.), 6.);
    k = mod(px.y, 3.) == 0. && w < 2. ? 1.4 : .92;
  }
  return k;
}
`;

const S = {}; // 스티커
const B = {}; // 몸통

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
  // 흐르는 용암 위로 굳은 껍질이 떠다닌다. 돌리면 달아올라 껍질이 녹는다
  color: `
    vec2 fxP = vLocal.xy * 3. + vSeed * 31.;
    float fxM = fxF2(fxP * 1.6 - vec2(uTime * .1, 0.));
    float fxN = fxF2(fxP + vec2(fxM * 1.2, -uTime * .22));
    float fxHeat = uCharge * .14;
    float fxCrust = smoothstep(.53 + fxHeat, .68 + fxHeat, fxN);
    float fxVein = 1. - smoothstep(0., .05, abs(fxN - .5 - fxHeat));
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * .12 + .02, fxCrust);`,
  surface: 'roughnessFactor = mix(.35, .95, fxCrust);',
  emissive: `
    float fxPulse = .85 + .15 * sin(uTime * 1.7 + vSeed * 12.) + uCharge * .9;
    totalEmissiveRadiance = emissive * ((1. - fxCrust) * 1.5 + fxVein * 1.4) * fxPulse;`,
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
  // 말랑한 젤리. 가장자리가 짙고, 위로 물빛 무늬가 일렁인다
  color: `
    float fxE = fxEdge();
    float fxC = fxCaustic(vLocal.xy * 7. + vSeed * 23., uTime * .5 + vSeed * 3.);
    diffuseColor.rgb *= .7 + .3 * smoothstep(0., .14, fxE);
    diffuseColor.rgb += fxC * .22;`,
  surface: 'roughnessFactor = .08;',
  emissive: 'totalEmissiveRadiance = diffuse * fxC * .3 + vec3(.5, .9, 1.) * fxFresnel(normal, 3.) * .25;',
};
B.water = {
  // 물에 잠긴 유리 몸통에 빛무늬가 어른거린다
  color: `
    vec2 fxP = fxBodyUV();
    float fxC = fxCaustic(fxP * 6. + vSeed * 9., uTime * .45);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.), fxC * .55);`,
  surface: 'roughnessFactor = .08;',
  emissive: 'totalEmissiveRadiance = vec3(.4, .85, 1.) * (fxFresnel(normal, 2.) * .35 + fxC * .2);',
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
  // 어두운 판 위로 번개가 기어다닌다. 돌리거나 번개가 치면 더 세진다
  color: `
    vec2 fxP = vLocal.xy * 3.5 + vSeed * 19.;
    float fxT = floor(uTime * 12.);
    float fxN = fxF2(fxP + vec2(fxH1(fxT + vSeed * 31.) * 7.3, fxH1(fxT * 1.7 + vSeed) * 5.1));
    float fxArc = 1. - smoothstep(0., .035 + uCharge * .03, abs(fxN - .5));
    float fxN2b = fxF2(fxP * 1.9 + vec2(uTime * 2.3, -uTime * 1.7));
    float fxArc2 = 1. - smoothstep(0., .02, abs(fxN2b - .5));
    float fxOn = step(.2 - uCharge * .3, fxH1(floor(uTime * 5.) * .37 + vSeed * 7.));
    float fxBolt = (fxArc + fxArc2 * .6) * fxOn;
    diffuseColor.rgb *= .4;`,
  surface: 'roughnessFactor = .28; metalnessFactor = .3;',
  emissive: `
    totalEmissiveRadiance = diffuse * (.3 + fxBolt * (2.2 + uCharge * 2.)) + vec3(.75, .88, 1.) * fxBolt * fxArc * (1.2 + uCharge);`,
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

S.glitch = {
  // 주사선, 가장자리 색 어긋남, 줄째 밀리고 색이 깨지는 칸
  color: `
    float fxT = floor(uTime * 15.);
    float fxG = max(step(.92, fxH1(fxT + vSeed * 17.)), step(.5, uCharge) * step(.6, fxH1(fxT * 2.3 + vSeed)));
    vec2 fxUv = fxUV();
    float fxShift = (fxH1(floor(fxUv.y * 10.) + fxT * 3.1) - .5) * .35 * fxG;
    vec2 fxQs = vLocal.xy + vec2(fxShift, 0.);
    float fxSplit = .025 * (1. + 4. * fxG);
    vec2 fxB2 = vec2(uSticker.x);
    float fxR = step(fxBox(fxQs + vec2(fxSplit, 0.), fxB2, uSticker.y), 0.);
    float fxGc = step(fxBox(fxQs, fxB2, uSticker.y), 0.);
    float fxBc = step(fxBox(fxQs - vec2(fxSplit, 0.), fxB2, uSticker.y), 0.);
    float fxScan = .78 + .22 * step(.5, fract(vLocal.y * 55. + uTime * 3.));
    vec3 fxC = diffuseColor.rgb * fxScan;
    float fxBad = step(.75, fxH2(floor(fxUv * vec2(5., 11.)) + fxT)) * fxG;
    fxC = mix(fxC, fxC.brg, fxBad);
    diffuseColor.rgb = vec3(fxC.r * fxR, fxC.g * fxGc, fxC.b * fxBc) + .04;`,
  surface: 'roughnessFactor = .35;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * (.25 + fxG * .8);',
};
B.glitch = {
  color: `
    float fxScan = .75 + .25 * step(.5, fract(vLocal.y * 40. - uTime * 2.));
    diffuseColor.rgb *= fxScan;`,
};

S.pixel = {
  // 8비트 게임 타일. 면마다 다르다: 벽돌, 돌, 구름, 물음표 블록, 풀, 물
  color: `
    vec2 fxPx = floor(clamp(fxUV(), 0., .999) * 10.);
    float fxK = fxTile(fxPx);
    diffuseColor.rgb = fxK > 2. ? vec3(1., .97, .85) : diffuseColor.rgb * fxK;`,
  surface: 'roughnessFactor = 1.;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .12;',
};
B.pixel = {
  color: `
    diffuseColor.rgb *= .8 + .4 * fxH3(floor(vLocal * 16.) + vSeed * 20.);`,
  surface: 'roughnessFactor = 1.;',
};

S.circuit = {
  // 기판 배선, 납땜 패드, 가운데 깜빡이는 LED. 돌리면 배선을 따라 빛이 몰려간다
  color: `
    vec2 fxG = fxUV() * 6.;
    vec2 fxC = floor(fxG);
    vec2 fxF = fract(fxG);
    float fxH = fxH2(fxC + vSeed * 9.);
    bool fxHor = fxH > .5;
    float fxLn = 1. - smoothstep(.06, .1, abs((fxHor ? fxF.y : fxF.x) - .5));
    float fxHasVia = step(.75, fxH2(fxC + 11.));
    float fxVia = 1. - smoothstep(.12, .17, length(fxF - .5));
    float fxHole = 1. - smoothstep(.04, .07, length(fxF - .5));
    float fxTrace = max(fxLn * step(.3, fxH2(fxC * 1.7 + 3.)), fxVia * fxHasVia);
    float fxPulse = pow(1. - abs(fract((fxHor ? fxG.x : fxG.y) * .25 - uTime * (.6 + uCharge) + fxH * 3.) - .5) * 2., 8.);
    float fxLed = 1. - smoothstep(.12, .16, length(fxQ()));
    float fxLedOn = step(.5, fract(uTime * (.4 + fxH1(vSeed) * 1.2) + vSeed));
    diffuseColor.rgb = mix(diffuseColor.rgb * .5, diffuseColor.rgb * 1.15 + .06, fxTrace);
    diffuseColor.rgb *= 1. - fxHole * fxHasVia * .75;
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * .6 + .4, fxLed);`,
  surface: 'roughnessFactor = mix(.6, .2, max(fxTrace, fxLed)); metalnessFactor = fxTrace * .5;',
  emissive: 'totalEmissiveRadiance = diffuse * (fxTrace * fxPulse * (1.8 + uCharge * 2.) + fxLed * (fxLedOn * 2.2 + .15));',
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

S.pumpkin = {
  // 작은 호박등. 껍질 결 위로 눈과 입이 파여 있고 안에서 촛불이 일렁인다. 칸마다 표정이 다르다
  color: `
    vec2 fxQp = fxQ();
    float fxRib = .5 + .5 * cos(fxQp.x * 9.42);
    float fxKind = fxH1(vSeed * 3.);
    vec2 fxEl = vec2(abs(fxQp.x) - .38, fxQp.y - .14);
    float fxEyeTri = step(-.18, fxEl.y) * step(abs(fxEl.x), (.18 - fxEl.y) * .55) * step(fxEl.y, .18);
    float fxEyeRound = 1. - step(.16, length(fxEl * vec2(1., 1.2)));
    float fxEyeSly = step(abs(fxEl.x), .2) * step(abs(fxEl.y - fxEl.x * sign(fxQp.x) * .5), .07);
    float fxEye = fxKind < .45 ? fxEyeTri : (fxKind < .8 ? fxEyeRound : fxEyeSly);
    float fxTeeth = 2. + floor(fxH1(vSeed * 9.) * 3.);
    float fxTop = -.22 + .12 * abs(fract(fxQp.x * fxTeeth * .5 + .25) - .5) * 2.;
    float fxBot = -.58 + .28 * fxQp.x * fxQp.x;
    float fxMouth = step(fxBot, fxQp.y) * step(fxQp.y, fxTop) * step(abs(fxQp.x), .66);
    float fxCarve = max(fxEye, fxMouth);
    float fxFl = .7 + .3 * fxN2(vec2(uTime * 7., vSeed * 10.));
    vec3 fxCandle = mix(diffuseColor.rgb, vec3(1., .62, .18), .55);
    diffuseColor.rgb *= .55 + .28 * fxRib;
    diffuseColor.rgb = mix(diffuseColor.rgb, fxCandle, fxCarve);`,
  surface: 'roughnessFactor = mix(.5, .9, fxCarve);',
  emissive: 'totalEmissiveRadiance = fxCandle * fxCarve * 1.8 * fxFl + diffuse * .04;',
};
B.pumpkin = {
  // 그을린 나무 상자
  color: `
    diffuseColor.rgb *= .8 + .35 * fxF3(vLocal * 9. + vSeed * 3.);`,
  surface: 'roughnessFactor = .85;',
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
  // 벌집 칸. 칸마다 꽃꿀이 고여 안에서 빛나고, 몇 칸은 밀랍 뚜껑이 덮였다. 꿀 속에 작은 기포
  color: `
    vec2 fxP = vLocal.xy / uSticker.x * 2.2 + vSeed * 3.;
    vec4 fxHx = fxHex(fxP);
    float fxWall = 1. - smoothstep(.04, .09, fxHx.w);
    float fxCap = step(.86, fxHx.z);
    float fxDeep = smoothstep(0., .45, fxHx.w);
    vec2 fxBq = fxP * 6. + fxHx.z * 9.;
    float fxBub = (1. - smoothstep(.0, .02, length(fract(fxBq) - .5) - .07)) * step(.82, fxH2(floor(fxBq))) * (1. - fxCap);
    vec3 fxHoney = diffuseColor.rgb * mix(.5, 1.15, fxDeep) + fxBub * .25;
    vec3 fxLid = vec3(.96, .88, .62) * (.88 + .12 * fxN2(fxP * 20.));
    vec3 fxWax = vec3(.93, .79, .46) * (.85 + .15 * fxN2(fxP * 30.));
    vec3 fxC = mix(fxHoney, fxLid, fxCap);
    diffuseColor.rgb = mix(fxC, fxWax, fxWall);`,
  normal: 'normal = fxBump(normal, (1. - fxWall) * (fxCap * fxHx.w * .03 - (1. - fxCap) * (1. - fxDeep) * .012) + fxWall * .01);',
  surface: 'roughnessFactor = mix(mix(.03, .5, fxCap), .55, fxWall);',
  emissive: `
    totalEmissiveRadiance = diffuse * (1. - fxWall) * (1. - fxCap) * (.42 + .38 * fxDeep) * (.9 + .1 * sin(uTime * 1.5 + fxHx.z * 20.))
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

S.blossom = {
  // 벚꽃 가지를 그려 구운 도자기 타일. 칸마다 가지의 방향과 꽃 자리가 다르다
  color: `
    vec2 fxQb = fxQ();
    float fxK = fxH1(vSeed * 5.) * 6.2832;
    vec2 fxBq = fxRot(fxK) * fxQb;
    float fxCurve = .25 * sin(fxBq.x * 2.2 + vSeed * 4.);
    float fxBranch = 1. - smoothstep(0., .02, abs(fxBq.y - fxCurve) - (.035 - fxBq.x * .012));
    float fxTwigX = .1 + .3 * fxH1(vSeed * 8.);
    float fxTwig = (1. - smoothstep(0., .015, abs(fxBq.y - fxCurve - (fxBq.x - fxTwigX) * .9) - .012)) * step(fxTwigX, fxBq.x) * step(fxBq.x, fxTwigX + .3);
    float fxFlower = 0.;
    float fxHeart = 0.;
    float fxBud = 0.;
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      float fxTx = -.62 + fi * .42 + (fxH1(vSeed * 9. + fi) - .5) * .18;
      vec2 fxFp = vec2(fxTx, .25 * sin(fxTx * 2.2 + vSeed * 4.) + (fxH1(vSeed * 3. + fi) - .5) * .3);
      vec2 fxD = fxBq - fxFp;
      float fxRr = length(fxD);
      float fxTh = atan(fxD.y, fxD.x) + fi * 1.3;
      float fxSz = fi == 3. ? .07 : .15 + .04 * fxH1(vSeed + fi);
      float fxPet = fxSz * (.72 + .28 * pow(abs(cos(fxTh * 2.5)), .6)) - fxSz * .12 * pow(abs(cos(fxTh * 2.5)), 40.);
      float fxIn = 1. - smoothstep(fxPet - .012, fxPet, fxRr);
      if (fi == 3.) fxBud = max(fxBud, fxIn);
      else {
        fxFlower = max(fxFlower, fxIn * (.75 + .25 * smoothstep(0., fxPet, fxRr)));
        fxHeart = max(fxHeart, 1. - smoothstep(fxSz * .2, fxSz * .3, fxRr));
      }
    }
    vec3 fxC = diffuseColor.rgb * (.95 + .06 * fxN2(fxQb * 30.));
    fxC = mix(fxC, vec3(.3, .19, .15), max(fxBranch, fxTwig));
    fxC = mix(fxC, vec3(.99, .8, .86) * (.92 + .08 * fxFlower), step(.01, fxFlower));
    fxC = mix(fxC, vec3(.95, .55, .65), fxBud);
    fxC = mix(fxC, vec3(.86, .32, .46), fxHeart);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, max(fxBranch, fxTwig) * .002 + step(.01, fxFlower) * .0015);',
  surface: 'roughnessFactor = .08;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .06;',
};
B.blossom = {
  color: `
    float fxN = fxF3(vLocal * vec3(3., 30., 3.) + vSeed * 7.);
    diffuseColor.rgb *= .82 + .3 * fxN;`,
  surface: 'roughnessFactor = .6;',
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

export const SURFACES = Object.keys(S);

/** 이 질감은 시간에 따라 움직이는가. 움직이면 계속 그려야 한다. */
export const MOVING = new Set([
  'neon', 'lava', 'water', 'forest', 'space', 'candy', 'ice',
  'electric', 'flesh', 'eldritch', 'gem', 'glitch', 'pixel', 'circuit', 'aurora', 'pumpkin',
  'stained', 'najeon', 'rain', 'mercury', 'gauge', 'honey', 'clay',
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
        ${VARYINGS}
        ${NOISE}
        ${head}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        vSeed = aSeed;
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
