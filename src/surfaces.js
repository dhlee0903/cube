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
  // 굵은 실로 뜬 니트. 코마다 V자 두 가닥이 실제로 도톰하게 솟아 있고, 실 가닥이 꼬여 있다.
  // 면마다 다른 페어아일 도안(하트, 눈송이, 나무, 마름모, 북유럽 십자, 모래시계)을 한 코씩 바꿔 떠 넣었다
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
    // 코 하나 안에서: 실 두께(0~1), 꼬임 결
    vec2 fxStitch(vec2 c) {
      vec2 l = vec2(abs(c.x), c.y);
      vec2 q = fxRot(-.6) * (l - vec2(.21, .04));
      float d = length(q * vec2(2.1, 1.));
      float yarn = 1. - smoothstep(.3, .46, d);
      float ply = .5 + .5 * sin(q.y * 46. + q.x * 22.);
      return vec2(yarn * (1. - d / .46), ply);
    }
    float fxKnitH(vec2 p, float seed) {
      vec2 g = (p / uSticker.x * .5 + .5) * vec2(7., 9.);
      vec2 st = fxStitch(fract(g) - .5);
      return smoothstep(0., .1, fxEdgeAt(p)) * (.014 + .022 * pow(max(st.x, 0.), .6));
    }`,
  height: 'fxKnitH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxG = fxUV() * vec2(7., 9.);
    vec2 fxCell = floor(fxG);
    vec2 fxSt = fxStitch(fract(fxG) - .5);
    float fxMotif = fxKnitBit(fxCell);
    vec3 fxMain = diffuseColor.rgb;
    vec3 fxAlt = dot(fxMain, vec3(.3, .59, .11)) > .6 ? vec3(.62, .12, .14) : vec3(.96, .93, .86);
    vec3 fxY = mix(fxMain, fxAlt, fxMotif) * (.9 + .15 * fxH2(fxCell + vSeed * 9.));
    float fxFuzz = fxN2(vLocal.xy * 260. + vSeed);
    diffuseColor.rgb = fxY * (.35 + .65 * smoothstep(0., .5, fxSt.x)) * (.85 + .2 * fxSt.y) * (.92 + .1 * fxFuzz);`,
  normal: 'normal = fxBump(normal, fxSt.y * .0015 * step(.05, fxSt.x) + fxFuzz * .0008);',
  surface: 'roughnessFactor = .95;',
  emissive: 'totalEmissiveRadiance = fxY * fxFresnel(normal, 1.4) * .4;',
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

S.blueprint = {
  // 진짜 도면처럼: 굵은 외곽선, 일점쇄선 중심선, 점선 숨은선, 화살표 달린 치수선, 오른쪽 아래 표제란.
  // 면마다 인화지와 부품이 다르다: 청사진(톱니바퀴), 세피아(플랜지), 흰 도면(L자 브래킷),
  // 노란 트레이싱지(단 붙은 축), 녹색 공학지(코일 스프링), 연어색 교정지(육각 너트). 고르면 선이 그려져 나간다
  head: `
    float fxSeg(vec2 p, vec2 a, vec2 b) {
      vec2 pa = p - a, ba = b - a;
      return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0., 1.));
    }
    // 선: 굵기에 맞춰 가장자리를 부드럽게
    float fxBL(float d, float w) { return 1. - smoothstep(w * .45, w, d); }
    // 화살촉: tip에서 dir 쪽으로 열린 삼각형
    float fxArrow(vec2 p, vec2 tip, vec2 dir) {
      vec2 q = p - tip;
      float along = dot(q, dir);
      float across = abs(dot(q, vec2(-dir.y, dir.x)));
      return step(0., along) * step(along, .09) * step(across, along * .32);
    }`,
  color: `
    vec2 fxUv = fxUV();
    vec2 fxQb = fxQ();
    vec3 fxPaper = diffuseColor.rgb * (.93 + .07 * fxN2(vLocal.xy * 90. + vSeed)) * (.9 + .1 * smoothstep(.0, .3, fxEdge() / uSticker.x));
    bool fxDark = dot(fxPaper, vec3(.3, .59, .11)) < .5;
    vec3 fxInk = fxDark ? vec3(.93, .96, 1.) : (uFace > 4.5 ? vec3(.5, .08, .08) : (uFace > 3.5 ? vec3(.06, .25, .12) : vec3(.1, .2, .45)));
    float fxThick = .03;
    float fxThin = .015;
    vec2 fxGl = (.5 - abs(fract(fxUv * 10.) - .5)) / 10.;
    float fxGrid = (1. - smoothstep(0., .003, min(fxGl.x, fxGl.y))) * .16;
    float fxE = fxEdge() / uSticker.x;
    float fxBorder = fxBL(abs(fxE - .06), fxThick) + fxBL(abs(fxE - .09), fxThin);
    // 표제란
    vec2 fxTb = fxQb - vec2(.5, -.72);
    float fxTitle = step(abs(fxTb.x), .32) * step(abs(fxTb.y), .12);
    float fxTitleL = fxTitle * max(fxBL(abs(max(abs(fxTb.x) - .32, abs(fxTb.y) - .12)), fxThin), fxBL(abs(fxTb.y), fxThin * .7) + fxBL(abs(fxTb.x + .08), fxThin * .7) * step(fxTb.y, 0.));
    float fxScrib = fxTitle * step(abs(fxTb.y - .06), .02) * step(.5, fxN2(vec2(fxTb.x * 40., 1.))) * step(fxTb.x, .2);
    vec2 fxC = vec2(-.08, .1);
    vec2 fxP = fxQb - fxC;
    float fxR = length(fxP);
    float fxTh = atan(fxP.y, fxP.x);
    float fxCenter = fxBL(min(abs(fxP.x), abs(fxP.y)), fxThin * .8) * step(max(abs(fxP.x), abs(fxP.y)), .62);
    fxCenter *= step(.35, fract(max(abs(fxP.x), abs(fxP.y)) * 9.)) + step(abs(fract(max(abs(fxP.x), abs(fxP.y)) * 9.) - .17), .04);
    float fxPart = 0.;
    float fxHidden = 0.;
    float fxHatch = 0.;
    float fxDimY = -.6;
    float fxHalfW = .45;
    if (uFace < .5) {
      float teeth = smoothstep(.4, .6, abs(fract(fxTh / 6.2832 * 14.) - .5) * 2.);
      fxPart = fxBL(abs(fxR - (.42 + .07 * teeth)), fxThick) + fxBL(abs(fxR - .12), fxThick) + fxBL(fxSeg(fxP, vec2(-.03, .12), vec2(.03, .12)), fxThin);
      fxHidden = fxBL(abs(fxR - .3), fxThin);
      fxHalfW = .49;
    } else if (uFace < 1.5) {
      fxPart = fxBL(abs(fxR - .48), fxThick) + fxBL(abs(fxR - .16), fxThick);
      for (int i = 0; i < 6; i++) {
        float a = float(i) * 1.0472;
        fxPart += fxBL(abs(length(fxP - vec2(cos(a), sin(a)) * .33) - .05), fxThin * 1.4);
      }
      fxHidden = fxBL(abs(fxR - .33), fxThin);
      fxHalfW = .48;
    } else if (uFace < 2.5) {
      vec2 b = fxP + vec2(0., .1);
      float outer = max(max(abs(b.x) - .45, abs(b.y) - .4), -max(b.x + .1, -b.y + .05));
      fxPart = fxBL(abs(outer), fxThick) + fxBL(abs(length(b - vec2(-.3, .25)) - .06), fxThin * 1.4) + fxBL(abs(length(b - vec2(.25, -.25)) - .06), fxThin * 1.4);
      fxHatch = step(outer, 0.) * step(.5, fract((b.x - b.y) * 14.)) * step(b.x, -.12) * .55;
    } else if (uFace < 3.5) {
      vec2 a = abs(fxP);
      float d1 = max(a.x - .55, a.y - .12);
      float d2 = max(a.x - .3, a.y - .22);
      float body = min(d1, d2);
      fxPart = fxBL(abs(body), fxThick) + fxBL(abs(a.x - .3), fxThin) * step(a.y, .12);
      fxHidden = fxBL(abs(a.y - .05), fxThin) * step(a.x, .5) * step(.5, fract(fxP.x * 16.));
      fxHalfW = .55;
    } else if (uFace < 4.5) {
      float coil = abs(fract(fxP.x * 4.5) - .5);
      float wave = abs(fxP.y - (coil - .25) * 1.4);
      fxPart = fxBL(wave, fxThick) * step(abs(fxP.x), .5) + fxBL(abs(abs(fxP.x) - .5), fxThick) * step(abs(fxP.y), .36);
      fxHidden = fxBL(abs(fxP.y + (coil - .25) * 1.4), fxThin) * step(abs(fxP.x), .5) * step(.5, fract(fxP.x * 20.));
      fxHalfW = .5;
    } else {
      vec2 a = abs(fxP);
      float hex = max(a.x * .866 + a.y * .5, a.y) - .44;
      fxPart = fxBL(abs(hex), fxThick) + fxBL(abs(fxR - .2), fxThick) + fxBL(abs(fxR - .38), fxThin);
      fxHidden = fxBL(abs(fxR - .25), fxThin) * step(.5, fract(fxTh * 4.));
      fxHalfW = .5;
    }
    fxHidden *= step(.45, fract((fxP.x + fxP.y) * 12.));
    // 치수선: 보조선, 화살표 둘
    vec2 fxDa = vec2(fxC.x - fxHalfW, fxDimY);
    vec2 fxDb = vec2(fxC.x + fxHalfW, fxDimY);
    float fxDim = fxBL(fxSeg(fxQb, fxDa, fxDb), fxThin)
      + fxBL(fxSeg(fxQb, fxDa + vec2(0., .02), fxDa + vec2(0., .14)), fxThin * .8)
      + fxBL(fxSeg(fxQb, fxDb + vec2(0., .02), fxDb + vec2(0., .14)), fxThin * .8)
      + fxArrow(fxQb, fxDa, vec2(1., 0.)) + fxArrow(fxQb, fxDb, vec2(-1., 0.));
    float fxTick = step(abs(fxQb.y - fxDimY - .05), .02) * step(abs(fxQb.x - fxC.x), .08) * step(.5, fxN2(vec2(fxQb.x * 60., 3.)));
    float fxInkM = clamp(fxGrid + fxBorder + fxTitleL + fxScrib * .8 + fxCenter * .9 + fxPart + fxHidden * .9 + fxHatch + fxDim + fxTick * .8, 0., 1.);
    float fxH = fxH2(floor(vLocal.xy * 40.));
    fxInkM *= smoothstep(fxH * .8, fxH * .8 + .3, uIntro * .8);
    fxInkM *= .85 + .15 * fxN2(vLocal.xy * 300.);
    diffuseColor.rgb = mix(fxPaper, fxInk, fxInkM);`,
  surface: 'roughnessFactor = .85;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .1;',
};
B.blueprint = {
  // 짙은 남색 판지, 모서리에 흰 연필 선과 맞춤 표시
  color: `
    float fxRim = smoothstep(.93, .97, fxBodyRim());
    vec2 fxP = fxBodyUV();
    float fxMark = step(abs(abs(fxP.x) - .38), .006) * step(abs(abs(fxP.y) - .38), .05) + step(abs(abs(fxP.y) - .38), .006) * step(abs(abs(fxP.x) - .38), .05);
    diffuseColor.rgb = mix(diffuseColor.rgb * (.9 + .15 * fxN3(vLocal * 60.)), vec3(.85, .9, 1.), clamp(fxRim * .8 + fxMark * .7, 0., 1.));`,
  surface: 'roughnessFactor = .9;',
};

S.fossil = {
  // 박물관 진열장의 돌판. 화석이 실제로 도드라져 있고 둘레는 정으로 쪼아 낸 자국.
  // 면마다 돌과 화석이 다르다: 무지갯빛 암몰라이트, 삼엽충, 고사리, 물고기, 성게, 공룡 발자국(움푹 패임)
  head: `
    // 화석 모양. 높이(-1~1)를 돌려주고 inside에 화석 안쪽 정도를 담는다
    float fxFossil(vec2 q, out float inside) {
      float r = length(q);
      float th = atan(q.y, q.x);
      float h = 0.;
      inside = 0.;
      if (uFace < .5) {
        float s = log(max(r, .02)) / .22 - th / 6.2832;
        float whorl = abs(fract(s) - .5);
        inside = 1. - smoothstep(.66, .7, r);
        float rib = .5 + .5 * sin(th * 30. + s * 2.);
        h = inside * (smoothstep(.04, .22, whorl) * .7 + rib * .3 * smoothstep(.15, .5, whorl));
      } else if (uFace < 1.5) {
        vec2 p = q * vec2(1.2, 1.);
        inside = 1. - smoothstep(.62, .66, length(p * vec2(1., .74)));
        float seg = .5 + .5 * sin(p.y * 30.);
        float axial = 1. - smoothstep(.1, .15, abs(p.x));
        float pleura = smoothstep(.15, .2, abs(p.x));
        float head = 1. - smoothstep(.0, .06, abs(length(p - vec2(0., .38)) - .26));
        float eyes = 1. - smoothstep(.04, .07, length(vec2(abs(p.x) - .18, p.y - .42)));
        h = inside * (.35 + .4 * axial + .25 * seg * pleura * step(p.y, .3) + .3 * eyes) + head * inside * .2;
      } else if (uFace < 2.5) {
        vec2 p = fxRot(.3) * q;
        float rachis = 1. - smoothstep(.015, .035, abs(p.x));
        float w = .48 * (1. - abs(p.y) * 1.05);
        float leaf = step(abs(p.x), w) * smoothstep(.25, .45, abs(fract(p.y * 8. - abs(p.x) * 1.3) - .5) * 2.) ;
        inside = max(rachis, leaf) * step(abs(p.y), .78);
        h = inside * (.45 + .55 * rachis);
      } else if (uFace < 3.5) {
        vec2 p = q;
        float spine = (1. - smoothstep(.015, .035, abs(p.y))) * step(abs(p.x), .58);
        float ribs = (1. - smoothstep(.0, .02, abs(fract(p.x * 8.) - .5) - .44)) * step(abs(p.y), .3 * (1. - abs(p.x + .1) * 1.1)) * step(-.45, p.x) * step(p.x, .42);
        float head = 1. - smoothstep(.14, .17, length((p - vec2(.56, 0.)) * vec2(1., 1.25)));
        float eye = 1. - smoothstep(.03, .045, length(p - vec2(.6, .04)));
        float tail = step(p.x, -.48) * step(abs(p.y), (-.48 - p.x) * 1.3) * step(-.8, p.x);
        float fin = step(abs(p.y), .45) * step(.3, abs(p.y)) * step(abs(p.x - .05), .1 - (abs(p.y) - .3));
        inside = max(max(spine, ribs), max(max(head, tail), fin));
        h = inside * (.7 - eye * .5);
      } else if (uFace < 4.5) {
        float pet = abs(cos(th * 2.5));
        float star = (1. - smoothstep(.0, .03, abs(r - .32 - .22 * pet) - .05)) * step(.12, r);
        float pores = step(.6, fract(r * 22.)) * star;
        inside = 1. - smoothstep(.66, .7, r);
        h = inside * (.45 + .45 * (1. - r)) + star * .25 - pores * .15;
      } else {
        // 세 발가락 공룡 발자국. 움푹 들어간다
        vec2 p = q + vec2(0., .1);
        float heel = length(p * vec2(1., 1.2)) - .22;
        float toes = 1e3;
        for (int i = 0; i < 3; i++) {
          float a = 1.5708 + (float(i) - 1.) * .55;
          vec2 dir = vec2(cos(a), sin(a));
          vec2 t = p - dir * clamp(dot(p, dir), 0., .58);
          toes = min(toes, length(t) - .085 * (1. - clamp(dot(p, dir), 0., .58)));
        }
        float d = min(heel, toes);
        inside = 1. - smoothstep(-.02, .02, d);
        h = -inside * (.6 + .4 * (1. - smoothstep(-.15, 0., d)));
      }
      return h;
    }
    float fxFossilH(vec2 p, float seed) {
      float inside;
      float f = fxFossil(p / uSticker.x, inside);
      float rough = fxN2(p * 40. + seed * 7.);
      return smoothstep(0., .1, fxEdgeAt(p)) * (.012 + .004 * rough + f * .026);
    }`,
  height: 'fxFossilH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxQf = fxQ();
    float fxIn;
    float fxH = fxFossil(fxQf, fxIn);
    float fxStone = fxF2(vLocal.xy * 9. + vSeed * 7.);
    float fxLayer = fxN2(vec2(vLocal.y * 34. + fxStone * 3., vSeed));
    vec3 fxRock = diffuseColor.rgb * (.78 + .32 * fxStone) * (.92 + .08 * fxLayer);
    vec3 fxFos;
    if (uFace < .5) fxFos = vec3(.2, .17, .15) * (.6 + .6 * smoothstep(.1, .5, fxH));
    else if (uFace < 1.5) fxFos = vec3(.16, .13, .12) * (.8 + .5 * fxH);
    else if (uFace < 2.5) fxFos = vec3(.1, .09, .08);
    else if (uFace < 3.5) fxFos = vec3(.42, .27, .13) * (.8 + .4 * fxH);
    else if (uFace < 4.5) fxFos = vec3(.9, .86, .74) * (.85 + .2 * fxH);
    else fxFos = diffuseColor.rgb * .55;
    diffuseColor.rgb = mix(fxRock, fxFos, clamp(fxIn, 0., 1.));`,
  normal: 'normal = fxBump(normal, fxStone * .003 + fxLayer * .001);',
  surface: 'roughnessFactor = mix(.88, uFace < .5 ? .15 : .45, fxIn); metalnessFactor = uFace < .5 ? fxIn * .4 : 0.;',
  emissive: `
    // 암몰라이트: 보는 각도에 따라 무지갯빛
    float fxVd = abs(dot(normal, normalize(vViewPosition)));
    // 암몰라이트는 붉은빛과 초록빛이 조각조각 비치는 정도다. 높이로 색을 돌리면 등고선 무지개가 돼 버린다
    vec3 fxIrid = .5 + .5 * cos(6.2832 * (fxVd * .5 + fxN2(fxQf * 1.2 + vSeed) * .45 + vec3(0., .33, .67) * .6));
    totalEmissiveRadiance = step(uFace, .5) * mix(diffuseColor.rgb, fxIrid, .5) * fxIn * smoothstep(.15, .6, fxH) * .35;`,
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
  // 칸마다 별이 보이는 둥근 창. 그 안에 작은 행성이 실제로 솟아 자전하고, 면마다 다른 행성이다
  // (고리 두른 가스 행성, 밤쪽에 도시 불빛이 켜지는 바다 행성, 속이 비치는 얼음 위성, 극관이 있는 붉은 행성,
  //  구름 낀 밀림 행성, 고리 두른 폭풍 행성). 고리가 없는 행성 둘레로는 작은 위성이 돈다
  head: `
    float fxPlanetR() { return uSticker.x * (uFace < .5 || uFace > 4.5 ? .48 : .58); }
    float fxPlanetH(vec2 p, float seed) {
      float rad = fxPlanetR();
      return sqrt(max(rad * rad - dot(p, p), 0.)) * .75 + .004;
    }`,
  height: 'fxPlanetH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxP = vLocal.xy;
    float fxS = uSticker.x;
    float fxRp = fxPlanetR();
    float fxRr = length(fxP);
    vec3 fxBase = diffuseColor.rgb;
    // 창 너머 우주: 별과 그 면 색으로 옅게 물든 성운, 쇠 창틀
    float fxNeb = fxF2(fxP / fxS * 2. + vSeed * 7.);
    vec3 fxSky = vec3(.01, .012, .03) + fxBase * smoothstep(.45, .9, fxNeb) * .18;
    float fxStar = fxGlint(fxP / fxS * 16. + vSeed * 9., .25, 1.) * 1.5 + fxGlint(fxP / fxS * 34. + vSeed * 3., .3, .6) * .7;
    float fxFrame = 1. - smoothstep(.03, .05, fxEdge());
    vec3 fxC = fxSky;
    vec3 fxNl = vec3(0., 0., 1.);
    float fxGlow = fxStar;
    float fxNight = 0.;
    float fxOnPlanet = step(fxRr, fxRp);
    // 고리: 기울어진 납작한 원반. 행성 뒤로 지나가는 쪽은 가려진다
    float fxRingA = 0.;
    vec3 fxRingC = vec3(0.);
    if (uFace < .5 || uFace > 4.5) {
      vec2 rq = fxRot(-.35 + vSeed * .3) * fxP;
      float re = length(rq * vec2(1., 2.7)) / fxRp;
      float band = smoothstep(1.25, 1.3, re) * (1. - smoothstep(1.85, 1.9, re));
      float gap = 1. - (1. - smoothstep(1.52, 1.55, re)) * smoothstep(1.48, 1.5, re);
      float rings = .55 + .45 * sin(re * 60.);
      fxRingA = band * gap * (.5 + .5 * rings) * (1. - fxOnPlanet * step(0., rq.y));
      fxRingC = mix(fxBase, vec3(1., .95, .85), .45) * (.7 + .3 * rings);
    }
    // 위성: 비스듬한 타원 궤도. 행성 뒤로 가면 가려진다
    float fxMoonA = 0.;
    vec3 fxMoonN = vec3(0., 0., 1.);
    if (uFace > .5 && uFace < 4.5) {
      float a = uTime * (.25 + .2 * fxH1(vSeed * 5.)) + vSeed * 6.;
      vec2 mc = fxRot(.4 - vSeed * .8) * vec2(cos(a) * .8, sin(a) * .22) * fxS;
      float front = step(sin(a), 0.);
      float mr = fxS * .1;
      vec2 md = fxP - mc;
      float inMoon = step(length(md), mr);
      fxMoonA = inMoon * max(front, 1. - fxOnPlanet);
      fxMoonN = normalize(vec3(md, sqrt(max(mr * mr - dot(md, md), 1e-6))));
    }
    if (fxOnPlanet > .5) {
      vec3 sn = normalize(vec3(fxP, sqrt(max(fxRp * fxRp - fxRr * fxRr, 1e-6))));
      fxNl = sn;
      float spin = uTime * (.08 + .06 * fxH1(vSeed)) + vSeed * 6.;
      float lon = atan(sn.x, sn.z) + spin;
      float lat = asin(clamp(sn.y, -1., 1.));
      vec2 sp = vec2(lon, lat);
      vec3 pc;
      float clouds = 0.;
      if (uFace < .5) {
        float turb = fxF2(sp * vec2(2., 7.));
        float band = sin(lat * 16. + turb * 2.4);
        pc = fxBase * (.7 + .32 * band) + vec3(.06, .03, 0.) * fxF2(sp * vec2(5., 20.));
        float spot = 1. - smoothstep(.12, .22, length(vec2(fract(lon / 6.2832 + .25) - .5, (lat + .35) * .9)));
        pc = mix(pc, vec3(.75, .28, .18), spot);
      } else if (uFace < 1.5) {
        float land = smoothstep(.52, .56, fxF2(sp * vec2(1.2, 1.6) + 3.));
        float ice = smoothstep(1.1, 1.3, abs(lat));
        pc = mix(fxBase * (.8 + .2 * fxN2(sp * 6.)), mix(vec3(.3, .5, .22), vec3(.6, .5, .3), fxN2(sp * 4.)), land);
        pc = mix(pc, vec3(.95), ice);
        clouds = smoothstep(.55, .75, fxF2(sp * vec2(1.8, 2.4) + vec2(uTime * .05, 0.)));
        fxNight = land * step(.7, fxH2(floor(sp * 34.))) * (1. - clouds);
      } else if (uFace < 2.5) {
        float crack = 1. - smoothstep(0., .03, abs(fxF2(sp * 2.5) - .5));
        pc = mix(fxBase, vec3(.45, .66, .86), crack * .8);
        fxGlow += crack * .25;
      } else if (uFace < 3.5) {
        vec3 v = fxVoronoi(sp * 2.6);
        float crater = (1. - smoothstep(.15, .2, v.x)) * step(.6, v.z);
        pc = fxBase * (.75 + .35 * fxF2(sp * 3.)) * (1. - crater * .35) + crater * smoothstep(.12, .19, v.x) * .15;
        pc = mix(pc, vec3(.95, .92, .9), smoothstep(1.2, 1.35, lat));
      } else if (uFace < 4.5) {
        pc = fxBase * (.6 + .6 * fxF2(sp * 2.2));
        clouds = smoothstep(.58, .78, fxF2(sp * vec2(2., 3.) + vec2(uTime * .06, 4.)));
      } else {
        float sw = fxF2(sp * 1.5 + vec2(sin(lat * 4. + uTime * .2), 0.) * .8);
        pc = mix(fxBase * .55, fxBase * 1.35 + .1, smoothstep(.35, .7, sw));
      }
      fxC = mix(pc, vec3(.97), clouds * .85);
      fxGlow = 0.;
    }
    fxC = mix(fxC, fxRingC, fxRingA);
    if (fxMoonA > .5) {
      fxC = vec3(.62, .6, .58) * (.85 + .2 * fxN2(fxP / fxS * 40.));
      fxNl = fxMoonN;
      fxGlow = 0.;
    }
    fxC = mix(fxC, vec3(.32, .33, .36), fxFrame);
    float fxLitPart = max(fxOnPlanet, fxMoonA);
    diffuseColor.rgb = fxC;`,
  normal: 'normal = normalize(vTx * fxNl.x + vTy * fxNl.y + vTz * fxNl.z);',
  surface: 'roughnessFactor = mix(.7, .3, fxFrame); metalnessFactor = fxFrame * .8;',
  emissive: `
    float fxLit = dot(normal, normalize(vec3(-.78, .33, .45)));
    totalEmissiveRadiance = vec3(fxGlow) * (1. - fxLitPart)
      + fxRingC * fxRingA * .25
      + vec3(1., .8, .45) * fxNight * (1. - smoothstep(-.1, .15, fxLit)) * 1.5
      + mix(diffuse, vec3(.5, .7, 1.), .4) * fxFresnel(normal, 3.) * .8 * fxOnPlanet * (1. - fxMoonA);`,
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
  // 도마 위 과일 단면. 면마다 수박, 블루베리(통째로 몇 알), 레몬, 오렌지, 키위, 용과.
  // 두께가 있어서 옆면엔 껍질이 보이고, 과즙이 번들거린다
  color: `
    vec2 fxQf = fxQ();
    float fxR = length(fxQf);
    float fxTh = atan(fxQf.y, fxQf.x);
    vec3 fxFlesh = diffuseColor.rgb;
    vec3 fxC = fxFlesh;
    vec3 fxNl = vec3(0., 0., 1.);
    float fxBh = 0.;
    float fxJuice = 0.;
    float fxRough = .18;
    if (uFace < .5) {
      // 수박: 짙은 줄무늬 겉껍질, 흰 속껍질, 붉은 살과 까만 씨
      float stripe = step(.5, fract(fxTh / 6.2832 * 18. + fxN2(vec2(fxTh * 3., 1.)) * .6));
      vec3 rind = mix(vec3(.12, .32, .12), vec3(.32, .55, .22), stripe);
      fxC = fxR > .9 ? rind : (fxR > .8 ? vec3(.86, .92, .74) : mix(fxFlesh * 1.15, fxFlesh * .82, fxN2(vec2(fxTh * 12., fxR * 30.))));
      if (fxR < .8 && fxR > .74) fxC = mix(fxC, vec3(.95, .55, .5), .5);
      float sa = floor(fxTh / 6.2832 * 11. + .5);
      float ang = sa / 11. * 6.2832;
      vec2 sc = vec2(cos(ang), sin(ang)) * (.48 + .08 * fxH1(sa + vSeed));
      vec2 sd = fxRot(-ang) * (fxQf - sc);
      float seed = 1. - smoothstep(.0, .015, length(sd * vec2(1., 1.9)) - .045);
      fxC = mix(fxC, vec3(.06, .04, .03), seed);
      fxBh = seed * .004;
      fxJuice = step(fxR, .8) * (1. - seed);
    } else if (uFace < 1.5) {
      // 블루베리: 하얀 분이 낀 동그란 알 넷, 꼭대기에 별 모양 꽃받침
      fxC = vec3(.84, .86, .9);
      fxRough = .7;
      for (int i = 0; i < 4; i++) {
        float fi = float(i);
        vec2 c = vec2(i == 0 || i == 2 ? -.38 : .38, i < 2 ? .36 : -.38) + (vec2(fxH1(vSeed * 3. + fi), fxH1(vSeed * 7. + fi)) - .5) * .1;
        float rr = .36 + .05 * fxH1(vSeed + fi * 5.);
        vec2 d = fxQf - c;
        if (length(d) < rr) {
          vec3 n = normalize(vec3(d, sqrt(max(rr * rr - dot(d, d), 1e-5))));
          fxNl = n;
          float crown = (1. - smoothstep(.06, .09, length(d - vec2(.05, .07)))) * (.5 + .5 * cos(atan(d.y - .07, d.x - .05) * 5.));
          float bloom = smoothstep(.3, .8, fxF2(d * 9. + fi * 3.));
          fxC = mix(fxFlesh * (.75 + .25 * n.z), vec3(.62, .66, .78), bloom * .55);
          fxC = mix(fxC, vec3(.15, .12, .2), crown);
          fxRough = .55 - crown * .2;
        }
      }
    } else if (uFace < 3.5) {
      // 레몬, 오렌지: 모공 난 껍질, 흰 속껍질, 방사형 조각과 그 사이 흰 막, 과즙 알갱이
      float seg = uFace < 2.5 ? 9. : 11.;
      float pores = fxN2(vec2(fxTh * 60., fxR * 40.));
      vec3 peel = (uFace < 2.5 ? vec3(.95, .82, .2) : vec3(.95, .5, .08)) * (.85 + .15 * pores);
      float ga = fract(fxTh / 6.2832 * seg + .5);
      float membrane = 1. - smoothstep(.0, .035, abs(ga - .5) * fxR * 1.6);
      float sacs = fxN2(vec2(fxTh * seg * 7., fxR * 14.) + vSeed * 5.);
      vec3 pulp = fxFlesh * (.8 + .35 * sacs);
      fxC = fxR > .92 ? peel : (fxR > .82 ? vec3(.98, .95, .86) : mix(pulp, vec3(.98, .95, .86), max(membrane, 1. - smoothstep(.1, .16, fxR))));
      fxBh = sacs * .003 * step(fxR, .82) - membrane * .002;
      fxJuice = step(fxR, .82) * (1. - membrane);
    } else if (uFace < 4.5) {
      // 키위: 털 난 갈색 껍질, 초록 살의 방사형 결, 까만 씨 고리, 하얀 심
      float rays = fxN2(vec2(fxTh * 30., fxR * 3.));
      fxC = mix(fxFlesh * (.8 + .3 * rays), vec3(.92, .95, .8), 1. - smoothstep(.2, .38, fxR));
      float sa = floor(fxTh / 6.2832 * 30. + .5);
      float ang = sa / 30. * 6.2832;
      vec2 sc = vec2(cos(ang), sin(ang)) * (.36 + .05 * fxH1(sa + vSeed));
      float seed = 1. - smoothstep(0., .015, length(fxRot(-ang) * (fxQf - sc) * vec2(1., 2.2)) - .03);
      fxC = mix(fxC, vec3(.05, .04, .03), seed);
      if (fxR > .93) fxC = vec3(.45, .32, .18) * (.8 + .3 * fxN2(fxQf * 60.));
      fxBh = seed * .003;
      fxJuice = step(fxR, .93) * (1. - seed);
    } else {
      // 용과: 두툼한 자홍 껍질, 잔 씨가 박힌 자홍 살
      float seeds = step(.82, fxH2(floor(fxQf * 40. + vSeed * 3.))) * (1. - smoothstep(.0, .3, length(fract(fxQf * 40. + vSeed * 3.) - .5)));
      fxC = fxR > .88 ? vec3(.86, .2, .5) * (.9 + .15 * fxN2(fxQf * 20.)) : fxFlesh * (.88 + .2 * fxN2(fxQf * 12.));
      fxC = mix(fxC, vec3(.04, .03, .03), seeds * step(fxR, .88));
      fxJuice = step(fxR, .88);
    }
    diffuseColor.rgb = fxC;`,
  normal: `
    if (fxNl.z < .999) normal = normalize(vTx * fxNl.x + vTy * fxNl.y + vTz * fxNl.z);
    normal = fxBump(normal, fxBh);`,
  surface: 'roughnessFactor = mix(fxRough, .06, fxJuice * .8);',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * (.08 + fxJuice * .18);',
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

S.hud = {
  // SF 영화 속 화면. 어두운 유리판 위에 면마다 다른 계기가 돌아간다
  // (레이더, 겹친 회전 고리, 막대그래프, 파형, 육각 스캔, 조준경). 면 색이 곧 화면 색이다
  color: `
    vec2 fxQh = fxQ();
    float fxR = length(fxQh);
    float fxTh = atan(fxQh.y, fxQh.x);
    float fxT = uTime + vSeed * 10.;
    float fxUi = 0.;
    if (uFace < .5) {
      float sweep = fract((fxTh - fxT * 1.6) / 6.2832);
      fxUi = (1. - smoothstep(0., .25, sweep)) * step(fxR, .7) * .7;
      fxUi += fxLine(abs(fxR - .7), .012) + fxLine(abs(fxR - .45), .008) + fxLine(abs(fxR - .2), .008);
      fxUi += fxLine(min(abs(fxQh.x), abs(fxQh.y)), .006) * step(fxR, .7) * .5;
      vec2 blip = vec2(cos(vSeed * 20.), sin(vSeed * 20.)) * .4;
      fxUi += (1. - smoothstep(.03, .05, length(fxQh - blip))) * (1. - smoothstep(0., .5, fract((atan(blip.y, blip.x) - fxT * 1.6) / 6.2832)));
    } else if (uFace < 1.5) {
      float a1 = step(.5, fract(fxTh / 6.2832 * 12. + fxT * .3)) * fxLine(abs(fxR - .62), .03);
      float a2 = step(.3, fract(fxTh / 6.2832 * 3. - fxT * .5)) * fxLine(abs(fxR - .48), .02);
      float a3 = step(.7, fract(fxTh / 6.2832 * 24. + fxT * .8)) * fxLine(abs(fxR - .34), .04);
      fxUi = a1 + a2 + a3 + (1. - smoothstep(.08, .1, fxR)) * (.6 + .4 * sin(fxT * 4.));
    } else if (uFace < 2.5) {
      vec2 g = fxUV();
      float col = floor(g.x * 9.);
      float h = .25 + .6 * (.5 + .5 * sin(fxT * (1. + fxH1(col) * 2.) + col));
      float bar = step(.15, fract(g.x * 9.)) * step(fract(g.x * 9.), .85) * step(g.y, h) * step(.12, g.y);
      fxUi = bar * (.45 + .55 * step(.5, fract(g.y * 22.))) + fxLine(abs(g.y - .12), .008);
    } else if (uFace < 3.5) {
      float x = fxQh.x * 6.;
      float y = .35 * sin(x * 1.7 - fxT * 3.) * cos(x * .6 + fxT) ;
      fxUi = fxLine(abs(fxQh.y - y), .02) + fxLine(abs(fxQh.y - y * .5 + .02), .008) * .5;
      vec2 gl = abs(fract(fxUV() * 6.) - .5);
      fxUi += (1. - smoothstep(.0, .02, .5 - max(gl.x, gl.y))) * .25;
    } else if (uFace < 4.5) {
      vec4 hx = fxHex(fxQh * 4.);
      float scan = 1. - smoothstep(0., .15, abs(fract(fxQh.y * .5 - fxT * .3) * 2. - 1. - fxQh.y * .0));
      fxUi = fxLine(hx.w, .04) * (.3 + .7 * scan) + step(.85, hx.z) * step(.15, hx.w) * .5 * (.5 + .5 * sin(fxT * 3. + hx.z * 20.));
    } else {
      float rot = fxT * .5;
      vec2 q = fxRot(rot) * fxQh;
      fxUi = fxLine(abs(fxR - .55), .01) * step(.6, fract(atan(q.y, q.x) / 6.2832 * 4.)) + fxLine(abs(fxR - .3), .012);
      fxUi += fxLine(min(abs(fxQh.x), abs(fxQh.y)), .008) * step(.12, fxR) * step(fxR, .45);
      fxUi += fxLine(abs(max(abs(fxQh.x), abs(fxQh.y)) - .7), .01) * step(.55, max(abs(fxQh.x), abs(fxQh.y)) - min(abs(fxQh.x), abs(fxQh.y)) + .0);
    }
    float fxFrame = fxLine(abs(fxEdge() / uSticker.x - .05), .01);
    float fxScanline = .85 + .15 * step(.5, fract(vLocal.y * 120.));
    fxUi = clamp(fxUi + fxFrame * .8, 0., 1.) * fxScanline;
    vec3 fxGlowC = diffuseColor.rgb;
    diffuseColor.rgb = vec3(.02, .03, .05) + fxGlowC * fxUi * .25;`,
  surface: 'roughnessFactor = .12;',
  emissive: 'totalEmissiveRadiance = fxGlowC * (fxUi * 1.8 + .06);',
};
B.hud = {
  // 건메탈 몸통, 모서리를 따라 빛줄
  color: `float fxRim = smoothstep(.92, .97, fxBodyRim());`,
  surface: 'roughnessFactor = .35; metalnessFactor = .7;',
  emissive: 'totalEmissiveRadiance = vec3(.3, .8, 1.) * fxRim * .6;',
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

S.embroidery = {
  // 리넨 위 공단수. 꽃잎은 가운데서 밖으로, 잎은 비스듬히 실을 촘촘히 놓아 실결 따라 광택이 흐르고,
  // 꽃술은 매듭수로 도톰하다. 꽃잎 실 색이 곧 면 색이다
  color: `
    vec2 fxQe = fxQ();
    vec2 fxW = vLocal.xy * 170.;
    float fxWeave = step(.5, fract(fxW.x)) == step(.5, fract(fxW.y)) ? 1. : 0.;
    float fxThread = mix(.5 + .5 * sin(fxW.y * 6.2832), .5 + .5 * sin(fxW.x * 6.2832), fxWeave);
    vec3 fxLinen = vec3(.93, .89, .81) * (.86 + .14 * fxThread) * (.96 + .06 * fxN2(vLocal.xy * 30.));
    fxLinen = mix(fxLinen, fxLinen * (.55 + .6 * diffuseColor.rgb), .3);
    vec2 fxFc = fxQe - vec2(0., .1);
    float fxR = length(fxFc);
    float fxTh = atan(fxFc.y, fxFc.x);
    float fxPetalR = .27 + .33 * abs(cos(fxTh * 2.5));
    float fxPetal = step(fxR, fxPetalR);
    float fxSplit = (1. - smoothstep(.0, .035, abs(fxR - fxPetalR))) * step(fxR, fxPetalR + .02);
    float fxHeart = 1. - smoothstep(.11, .13, fxR);
    vec2 fxL1 = fxRot(.9) * (fxQe - vec2(-.5, -.55));
    vec2 fxL2 = fxRot(-.9) * (fxQe - vec2(.5, -.55));
    float fxLeaf = step(min(length(fxL1 * vec2(2.6, 1.)), length(fxL2 * vec2(2.6, 1.))), .26);
    float fxStem = (1. - smoothstep(.012, .025, abs(fxQe.x + sin(fxQe.y * 4.) * .03))) * step(fxQe.y, -.3) * step(-.8, fxQe.y);
    float fxSatinP = .5 + .5 * sin(fxTh * 70.);
    float fxSatinL = .5 + .5 * sin(dot(fxQe, vec2(.7, .7)) * 160.);
    vec2 fxKn = fract(fxFc * 30.) - .5;
    float fxKnot = (1. - smoothstep(.2, .45, length(fxKn))) * fxHeart;
    vec3 fxLeafC = dot(diffuseColor.rgb, vec3(.2, .7, .1)) > .45 && diffuseColor.g > diffuseColor.r ? vec3(.75, .58, .2) : vec3(.22, .45, .22);
    vec3 fxC = fxLinen;
    fxC = mix(fxC, fxLeafC * (.7 + .4 * fxSatinL), max(fxLeaf, fxStem));
    fxC = mix(fxC, diffuseColor.rgb * (.65 + .45 * fxSatinP), fxPetal);
    fxC = mix(fxC, diffuseColor.rgb * .45, fxSplit);
    fxC = mix(fxC, vec3(.95, .78, .25) * (.7 + .4 * fxKnot), fxHeart);
    float fxSilk = max(max(fxPetal, fxLeaf), max(fxStem, fxHeart));
    diffuseColor.rgb = fxC;`,
  normal: 'normal = fxBump(normal, fxSilk * (.004 + fxPetal * fxSatinP * .002 + fxLeaf * fxSatinL * .002 + fxKnot * .004) + fxThread * .0008);',
  surface: 'roughnessFactor = mix(.9, .28, fxSilk);',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * fxSilk * fxFresnel(normal, 2.) * .4;',
};
B.embroidery = {
  // 나무 수틀
  color: `
    float fxN = fxN2(vec2(fxBodyUV().x * 5. + vSeed * 9., fxBodyUV().y * 70.));
    diffuseColor.rgb *= .8 + .3 * fxN;`,
  surface: 'roughnessFactor = .5;',
};

S.donut = {
  // 칸마다 도넛 하나가 실제로 솟아 있다. 노릇한 반죽 위에 면 색 아이싱이 흘러내리고 스프링클
  head: `
    float fxDonutH(vec2 p, float seed) {
      float s = uSticker.x;
      float d = length(p) - .48 * s;
      float rt = .3 * s;
      return sqrt(max(rt * rt - d * d, 0.)) * .9 + .004;
    }`,
  height: 'fxDonutH',
  color: `
    if (fxEdge() < 0.) discard;
    vec2 fxP = vLocal.xy;
    float fxS = uSticker.x;
    float fxD = length(fxP) - .48 * fxS;
    float fxRt = .3 * fxS;
    float fxOn = step(abs(fxD), fxRt);
    float fxTube = sqrt(max(fxRt * fxRt - fxD * fxD, 0.));
    vec3 fxNl = fxOn > .5 ? normalize(vec3(normalize(fxP) * fxD, fxTube)) : vec3(0., 0., 1.);
    float fxTh = atan(fxP.y, fxP.x);
    float fxIce = fxOn * step(.42 + .14 * sin(fxTh * 7. + vSeed * 9.) + .06 * sin(fxTh * 17.), fxTube / fxRt);
    vec2 fxSg = vec2(fxTh * 6., fxD / fxRt * 3.) + vSeed * 4.;
    vec2 fxSc = floor(fxSg * vec2(1.6, 2.));
    vec2 fxSf = fract(fxSg * vec2(1.6, 2.)) - .5;
    float fxSa = fxH2(fxSc) * 6.2832;
    float fxSpr = step(.55, fxH2(fxSc + 3.)) * (1. - smoothstep(.06, .1, length(fxRot(fxSa) * fxSf * vec2(1., 3.2)))) * fxIce;
    vec3 fxSprC = .55 + .45 * cos(6.2832 * (fxH2(fxSc + 7.) + vec3(0., .33, .67)));
    vec3 fxDough = mix(vec3(.85, .58, .3), vec3(.62, .36, .16), smoothstep(.2, .9, 1. - fxTube / fxRt)) * (.9 + .15 * fxN2(fxP * 80.));
    vec3 fxPlate = vec3(.96, .94, .9) * (.94 + .06 * smoothstep(.3, .9, length(fxP) / fxS));
    vec3 fxC = fxOn > .5 ? mix(fxDough, diffuseColor.rgb * (.95 + .08 * fxN2(fxP * 40.)), fxIce) : fxPlate;
    fxC = mix(fxC, fxSprC, fxSpr);
    diffuseColor.rgb = fxC;`,
  normal: `
    if (fxOn > .5) normal = normalize(vTx * fxNl.x + vTy * fxNl.y + vTz * fxNl.z);
    normal = fxBump(normal, fxSpr * .004 + fxIce * .002);`,
  surface: 'roughnessFactor = fxOn > .5 ? mix(.75, .12, fxIce) : .3;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * .06;',
};
B.donut = {
  // 초콜릿 판
  surface: 'roughnessFactor = .35;',
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
  // 칸마다 라바램프. 아래서 데워진 밀랍 덩어리가 천천히 떠올랐다 가라앉으며 합쳐졌다 갈라진다.
  // 밀랍 색이 곧 면 색, 아래쪽이 달아올라 밝고, 유리관에 세로 빛줄
  color: `
    vec2 fxQl = fxQ();
    float fxT = uTime * .3 + vSeed * 10.;
    float fxField = 0.;
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float h = fxH1(vSeed * 7. + fi);
      vec2 c = vec2((h - .5) * 1.1, sin(fxT * (.4 + h * .5) + fi * 1.7) * .75);
      float r = .17 + .12 * fxH1(vSeed * 3. + fi);
      fxField += r * r / max(dot(fxQl - c, fxQl - c), 1e-4);
    }
    fxField += .25 / max(pow(fxQl.y + 1.25, 2.), 1e-3) * .2;
    float fxBlob = smoothstep(.9, 1.05, fxField);
    float fxCore = smoothstep(1.2, 2.5, fxField);
    float fxHeat = 1. - smoothstep(-1., .2, fxQl.y);
    vec3 fxWax = diffuseColor.rgb;
    vec3 fxLiquid = mix(vec3(.05, .03, .08), fxWax * .25, .5) + fxWax * fxHeat * .15;
    float fxTubeHi = (1. - smoothstep(.0, .05, abs(fxQl.x + .7))) * .5 + (1. - smoothstep(0., .03, abs(fxQl.x - .78))) * .25;
    diffuseColor.rgb = mix(fxLiquid, fxWax * (.7 + .3 * fxCore), fxBlob);`,
  surface: 'roughnessFactor = .08;',
  emissive: `
    totalEmissiveRadiance = fxWax * fxBlob * (.35 + .5 * fxCore + .5 * fxHeat) + fxWax * fxHeat * .12 + vec3(fxTubeHi * .6);`,
};
B.lavalamp = {
  // 크롬 받침
  surface: 'roughnessFactor = .18; metalnessFactor = 1.;',
};

export const SURFACES = Object.keys(S);

/** 이 질감은 시간에 따라 움직이는가. 움직이면 계속 그려야 한다. */
export const MOVING = new Set([
  'neon', 'lava', 'water', 'forest', 'space', 'candy', 'ice',
  'electric', 'flesh', 'eldritch', 'gem', 'glitch', 'pixel', 'circuit', 'aurora', 'pumpkin',
  'stained', 'najeon', 'rain', 'mercury', 'gauge', 'honey', 'clay',
  'holo', 'blueprint', 'jelly', 'planet', 'disco',
  'honey', 'fossil', 'doodle', 'hud', 'ink', 'lavalamp', 'glass',
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
