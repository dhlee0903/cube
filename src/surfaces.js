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

const COMMON = /* glsl */ `
uniform float uTime;
uniform float uIntro;
uniform float uFlash;
uniform float uCharge;
uniform float uBlink;
uniform vec3 uPointer;
uniform vec3 uBodyGlow;
uniform vec2 uSticker;
uniform float uFace;
varying float vSeed;
varying vec3 vLocal;
varying vec3 vTx;
varying vec3 vTy;

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

// 스티커 안 좌표. fxQ는 -1~1, fxUV는 0~1
vec2 fxQ() { return vLocal.xy / uSticker.x; }
vec2 fxUV() { return vLocal.xy / (2. * uSticker.x) + .5; }
// 스티커 가장자리에서 안쪽으로 얼마나 들어왔는지(0이 가장자리)
float fxEdge() { return -fxBox(vLocal.xy, vec2(uSticker.x), uSticker.y); }

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

float fxBeat() {
  float t = fract(uTime * 1.15);
  return exp(-pow((t - .08) / .035, 2.)) + .6 * exp(-pow((t - .26) / .045, 2.));
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
  // 근섬유 결, 마블링 같은 기름 줄, 도드라진 핏줄, 울퉁불퉁 젖은 겉. 박동에 맞춰 붉어진다
  color: `
    vec2 fxP = vLocal.xy * 5. + vSeed * 23.;
    float fxN = fxF2(fxP);
    vec2 fxWp = fxP + vec2(fxF2(fxP * .7 + 3.), fxF2(fxP * .7 + 9.)) * 1.5;
    float fxFat = smoothstep(.6, .68, fxF2(fxWp * 1.2));
    float fxFib = .5 + .5 * sin((vLocal.x * .4 + vLocal.y) * 70. + fxN * 8.);
    float fxVein = 1. - smoothstep(0., .045, abs(fxF2(fxP * .8 + 5.) - .5));
    float fxB = fxBeat();
    diffuseColor.rgb *= .7 + .18 * fxFib + .25 * fxN;
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(diffuseColor.rgb, vec3(1., .93, .86), .65), fxFat);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.3, .02, .1), fxVein * .8);`,
  normal: `
    float fxNa = fxF2(fxP + vec2(.06, 0.));
    float fxNb = fxF2(fxP + vec2(0., .06));
    normal = normalize(normal - (vTx * (fxNa - fxN) + vTy * (fxNb - fxN)) * 5.);`,
  surface: 'roughnessFactor = mix(.08, .4, fxN);',
  emissive: 'totalEmissiveRadiance = diffuse * fxB * .3 + vec3(.8, .03, .1) * fxVein * fxB * .9;',
};
B.flesh = {
  // 젖은 막. 핏줄이 박동에 맞춰 붉게 뛴다
  color: `
    float fxV = fxF3(vLocal * 5. + vSeed * 7.);
    float fxVein = 1. - smoothstep(0., .035, abs(fxV - .5));
    float fxB = fxBeat();
    diffuseColor.rgb *= .8 + .4 * fxF3(vLocal * 18. + vSeed);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.35, .02, .1), fxVein * .8);`,
  surface: 'roughnessFactor = .14;',
  emissive: 'totalEmissiveRadiance = vec3(.6, .02, .07) * (fxVein * 1.1 + .12) * fxB;',
};

S.eldritch = {
  // 꿈틀거리는 점액 무늬. 절반쯤의 칸에 눈이 있어 손가락을 따라 쳐다보고,
  // 이따금 깜빡이며, 큐브를 잡으면 일제히 질끈 감는다
  color: `
    vec2 fxP = vLocal.xy * 4. + vSeed * 13.;
    vec2 fxW = vec2(fxF2(fxP + uTime * .08), fxF2(fxP - uTime * .07 + 5.2));
    float fxRidge = 1. - abs(fxF2(fxP + fxW * 2.) * 2. - 1.);
    vec3 fxBase = diffuseColor.rgb * (.28 + .55 * pow(fxRidge, 3.));
    float fxHas = step(.5, fxH1(vSeed * 91.7));
    float fxPh = fract(uTime * (.13 + fxH1(vSeed * 3.) * .1) + fxH1(vSeed * 5.));
    float fxOpen = min(smoothstep(0., .03, abs(fxPh - .03)), 1. - uBlink * .97);
    vec2 fxQe = fxQ() / vec2(.86, 1.);
    float fxLid = .6 * fxOpen * (1. - fxQe.x * fxQe.x);
    float fxIn = (1. - smoothstep(-.04, .02, abs(fxQe.y) - fxLid)) * step(abs(fxQe.x), 1.) * fxHas;
    vec3 fxTo = uPointer + vViewPosition;
    vec2 fxLook = vec2(dot(fxTo, vTx), dot(fxTo, vTy));
    fxLook = fxLook / (length(fxLook) + 2.) * .5;
    fxLook += vec2(sin(uTime * .7 + vSeed * 20.), cos(uTime * .53 + vSeed * 11.)) * .04;
    vec2 fxI = fxQe - fxLook * vec2(1., .45);
    float fxIris = 1. - smoothstep(.34, .38, length(fxI));
    float fxRing = smoothstep(.2, .34, length(fxI)) * fxIris;
    float fxPupil = 1. - smoothstep(.05, .09, length(fxI * vec2(1., .3)));
    vec3 fxEye = mix(vec3(.82, .8, .6), diffuseColor.rgb * 1.25 + .06, fxIris);
    fxEye *= 1. - fxRing * .35;
    fxEye *= .55 + .45 * smoothstep(0., .22, fxLid - abs(fxQe.y));
    fxEye = mix(fxEye, vec3(.01), fxPupil * fxIris);
    diffuseColor.rgb = mix(fxBase, fxEye, fxIn);`,
  surface: 'roughnessFactor = .12;',
  emissive: 'totalEmissiveRadiance = diffuse * (fxIris * (1. - fxPupil) * fxIn * .8 + pow(fxRidge, 6.) * .25 * (1. - fxIn));',
};
B.eldritch = {
  // 끈적한 몸통. 능선을 따라 희미하게 빛나는 핏줄이 천천히 기어다닌다
  color: `
    vec3 fxP = vLocal * 5. + vSeed * 9.;
    float fxR = 1. - abs(fxF3(fxP + vec3(0., uTime * .1, 0.)) * 2. - 1.);
    diffuseColor.rgb *= .7 + .5 * fxR;`,
  surface: 'roughnessFactor = .1;',
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

export const SURFACES = Object.keys(S);

/** 이 질감은 시간에 따라 움직이는가. 움직이면 계속 그려야 한다. */
export const MOVING = new Set([
  'neon', 'lava', 'water', 'forest', 'space', 'candy', 'ice',
  'electric', 'flesh', 'eldritch', 'gem', 'glitch', 'pixel', 'circuit', 'aurora', 'pumpkin',
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
    Object.assign(shader.uniforms, uniforms, { uFace: { value: face } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aSeed;
        varying float vSeed;
        varying vec3 vLocal;
        varying vec3 vTx;
        varying vec3 vTy;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vSeed = aSeed;
        vLocal = position;
        #ifdef USE_INSTANCING
          mat3 fxIm = mat3(instanceMatrix);
        #else
          mat3 fxIm = mat3(1.);
        #endif
        vTx = normalize(normalMatrix * (fxIm * vec3(1., 0., 0.)));
        vTy = normalize(normalMatrix * (fxIm * vec3(0., 1., 0.)));`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${fx.color ?? ''}`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\n${fx.surface ?? ''}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${fx.normal ?? ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${fx.emissive ?? ''}
        totalEmissiveRadiance += diffuseColor.rgb * uFlash;`);
  };
}
