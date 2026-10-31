// 테마마다 큐브 겉면에 입히는 질감. MeshStandardMaterial 셰이더 사이사이에 끼워 넣는다.
//
// vLocal  조각 안쪽 좌표. 스티커는 xy가 ±0.4인 평면, 몸통은 ±0.48인 상자
// vSeed   조각(스티커)마다 다른 난수. 같은 무늬가 반복되지 않게 한다
// uTime   초
//
// 각 질감은 세 군데에 들어간다.
//   color     diffuseColor(바탕색)를 바꾼다
//   surface   roughnessFactor, metalnessFactor를 바꾼다
//   normal    normal(시점 공간)을 기울인다. vTx, vTy가 그 면의 가로·세로 방향
//   emissive  totalEmissiveRadiance(스스로 내는 빛)를 바꾼다
// 앞 단계에서 선언한 변수는 뒤 단계에서 그대로 쓸 수 있다(같은 main 안).

const COMMON = /* glsl */ `
uniform float uTime;
uniform float uFlash;
uniform vec3 uBodyGlow;
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

// 둥근 사각형까지의 거리. 안쪽이 음수
float fxBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r;
}

// 스티커 가장자리에서 안쪽으로 얼마나 들어왔는지(0이 가장자리)
float fxEdge() { return -fxBox(vLocal.xy, vec2(.4), .09); }

// 물밑 빛무늬
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

// 심장 박동. 쿵-쿵 하고 쉰다
float fxBeat() {
  float t = fract(uTime * 1.15);
  return exp(-pow((t - .08) / .035, 2.)) + .6 * exp(-pow((t - .26) / .045, 2.));
}

// 반짝이는 점. 칸마다 하나씩, 드문드문
float fxGlint(vec2 p, float density, float speed) {
  vec2 cell = floor(p);
  float h = fxH2(cell);
  vec2 o = vec2(fxH2(cell + 7.1), fxH2(cell + 3.7)) - .5;
  float d = length(fract(p) - .5 - o * .5);
  return step(1. - density, h) * (1. - smoothstep(0., .22, d)) * pow(max(0., sin(uTime * speed * (1. + h * 2.) + h * 60.)), 10.);
}
`;

const S = {}; // 스티커
const B = {}; // 몸통

S.plain = {};
B.plain = {};

S.neon = {
  // 가장자리를 따라 빛나는 관, 안쪽은 어둡게
  color: `
    float fxE = fxEdge();
    float fxTube = exp(-pow((fxE - .05) / .022, 2.));
    float fxIn = exp(-fxE * 9.);
    float fxFl = .9 + .1 * sin(uTime * (2. + vSeed * 3.) + vSeed * 40.);
    fxFl *= 1. - .7 * step(.994, fxH1(floor(uTime * 14.) + vSeed * 97.));
    diffuseColor.rgb *= .06 + .4 * fxTube;`,
  surface: 'roughnessFactor = .25;',
  emissive: 'totalEmissiveRadiance = diffuse * (fxTube * 2.6 + fxIn * .55 + .1) * fxFl;',
};
B.neon = {
  // 몸통 모서리에 아주 옅은 빛줄
  color: `
    vec3 fxA = abs(vLocal) / .48;
    float fxRim = smoothstep(.9, 1., max(min(fxA.x, fxA.y), max(min(fxA.y, fxA.z), min(fxA.x, fxA.z))));`,
  emissive: 'totalEmissiveRadiance = vec3(.55, .25, 1.) * fxRim * .35;',
};

S.lava = {
  // 흐르는 용암 위에 굳은 껍질이 떠다닌다
  color: `
    vec2 fxP = vLocal.xy * 3. + vSeed * 31.;
    float fxM = fxF2(fxP * 1.6 - vec2(uTime * .1, 0.));
    float fxN = fxF2(fxP + vec2(fxM * 1.2, -uTime * .22));
    float fxCrust = smoothstep(.53, .68, fxN);
    float fxVein = 1. - smoothstep(0., .05, abs(fxN - .5));
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * .14 + .02, fxCrust);`,
  surface: 'roughnessFactor = mix(.35, .95, fxCrust);',
  emissive: `
    float fxPulse = .85 + .15 * sin(uTime * 1.7 + vSeed * 12.);
    totalEmissiveRadiance = emissive * ((1. - fxCrust) * 1.5 + fxVein * 1.4) * fxPulse;`,
};
B.lava = {
  // 현무암에 갈라진 틈으로 빛이 샌다
  color: `
    float fxN = fxF3(vLocal * 5. + vSeed * 17.);
    float fxCrack = 1. - smoothstep(0., .035, abs(fxN - .5));
    diffuseColor.rgb *= .65 + .7 * fxN3(vLocal * 34. + vSeed * 3.);`,
  surface: 'roughnessFactor = .95;',
  emissive: `
    float fxPulse = .65 + .35 * sin(uTime * 1.3 + vSeed * 9. + fxN * 8.);
    totalEmissiveRadiance = uBodyGlow * fxCrack * 1.8 * fxPulse;`,
};

S.water = {
  // 젤리처럼 가장자리가 짙고, 위로 물빛 무늬가 일렁인다
  color: `
    float fxE = fxEdge();
    float fxC = fxCaustic(vLocal.xy * 7. + vSeed * 23., uTime * .5 + vSeed * 3.);
    diffuseColor.rgb *= .72 + .28 * smoothstep(0., .14, fxE);
    diffuseColor.rgb += fxC * .22;`,
  surface: 'roughnessFactor = .12;',
  emissive: 'totalEmissiveRadiance = diffuse * fxC * .3;',
};
B.water = {
  color: `
    float fxC = fxCaustic(vec2(vLocal.x + vLocal.z, vLocal.y) * 6. + vSeed * 9., uTime * .45);
    diffuseColor.rgb = mix(diffuseColor.rgb * vec3(.8, .95, 1.), vec3(1.), fxC * .5);`,
};

S.forest = {
  // 이끼처럼 얼룩지고 잎맥이 지나간다
  color: `
    float fxN = fxF2(vLocal.xy * 14. + vSeed * 19.);
    float fxV = abs(sin((vLocal.x + vLocal.y * .35) * 26. + fxN * 5.));
    diffuseColor.rgb *= .74 + .45 * fxN;
    diffuseColor.rgb *= .86 + .14 * smoothstep(0., .3, fxV);`,
  surface: 'roughnessFactor = .5 + .35 * fxN;',
};
B.forest = {
  // 나뭇결. 윗면은 나이테, 옆면은 줄결
  color: `
    float fxN = fxF3(vLocal * 6. + vSeed * 11.);
    float fxR = fract(length(vLocal.xz + vec2(vSeed - .5, fxH1(vSeed * 7.) - .5)) * 20. + fxN * 2.5);
    diffuseColor.rgb *= .7 + .6 * smoothstep(0., .55, fxR) * (.65 + .35 * fxN);`,
  surface: 'roughnessFactor = .8;',
};

S.sunset = {
  // 아래로 갈수록 짙어지고, 비스듬한 면 가장자리에 노을빛이 걸린다
  color: `
    diffuseColor.rgb *= .78 + .32 * (vLocal.y / .8 + .5);`,
  emissive: `
    float fxF = pow(1. - abs(dot(normal, normalize(vViewPosition))), 3.);
    totalEmissiveRadiance += vec3(1., .45, .3) * fxF * .9;`,
};
B.sunset = {
  emissive: `
    float fxF = pow(1. - abs(dot(normal, normalize(vViewPosition))), 3.);
    totalEmissiveRadiance += vec3(1., .4, .45) * fxF * .45;`,
};

S.space = {
  // 스티커마다 작은 성운이 하나씩 들어 있다
  color: `
    vec2 fxP = vLocal.xy * 3. + vSeed * 41.;
    float fxNeb = fxF2(fxP + vec2(uTime * .03, 0.));
    float fxNeb2 = fxF2(fxP * 2.3 - vec2(0., uTime * .02));
    float fxCloud = smoothstep(.3, .8, fxNeb * .7 + fxNeb2 * .5);
    float fxStar = fxGlint(vLocal.xy * 22. + vSeed * 13., .2, 1.2) * 2. + fxGlint(vLocal.xy * 40. + vSeed * 5., .3, .6);
    diffuseColor.rgb *= .3 + .7 * fxCloud;`,
  emissive: 'totalEmissiveRadiance = emissive * (.3 + fxCloud * 1.3) + vec3(fxStar);',
};
B.space = {
  color: `
    float fxStar = fxGlint(vec2(vLocal.x + vLocal.z * 1.3, vLocal.y) * 30. + vSeed * 9., .12, .8);`,
  emissive: 'totalEmissiveRadiance = vec3(fxStar * 1.5);',
};

S.candy = {
  // 막대사탕처럼 빙글 도는 소용돌이
  color: `
    vec2 fxP = vLocal.xy / .4;
    float fxA = atan(fxP.y, fxP.x) / 6.2832;
    float fxR = length(fxP);
    float fxSw = smoothstep(.35, .65, abs(fract(fxA * 2. + fxR * 1.6 - uTime * .12 + vSeed) - .5) * 2.);
    float fxE = fxEdge();
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(diffuseColor.rgb, vec3(1.), .5), fxSw * .75);`,
  surface: 'roughnessFactor = .08;',
  emissive: 'totalEmissiveRadiance = diffuse * (.08 + .14 * smoothstep(0., .2, fxE));',
};
B.candy = {
  surface: 'roughnessFactor = .15;',
};

S.desert = {
  // 모래알과 바람이 낸 물결
  color: `
    float fxG = fxH2(floor(vLocal.xy * 260. + vSeed * 50.));
    float fxN = fxF2(vLocal.xy * 5. + vSeed * 9.);
    float fxR = sin((vLocal.x * .6 + vLocal.y) * 55. + fxN * 6.);
    diffuseColor.rgb *= .84 + .14 * fxG + .07 * fxR;`,
  surface: 'roughnessFactor = .92;',
};
B.desert = {
  // 사암의 지층
  color: `
    float fxN = fxF3(vLocal * 4. + vSeed * 5.);
    float fxB = sin(vLocal.y * 40. + fxN * 5. + vSeed * 3.);
    diffuseColor.rgb *= .78 + .16 * fxB + .3 * fxN;
    diffuseColor.rgb *= .9 + .2 * fxH3(floor(vLocal * 200.));`,
};

S.ice = {
  // 가장자리부터 성에가 들쭉날쭉 파고들고, 가운데는 매끈한 얼음. 가끔 반짝
  color: `
    float fxE = fxEdge();
    float fxN = fxF2(vLocal.xy * 7. + vSeed * 17.);
    float fxFine = fxN2(vLocal.xy * 90. + vSeed * 5.);
    float fxFrost = 1. - smoothstep(.03, .14, fxE - (fxN - .5) * .22);
    fxFrost *= .75 + .25 * fxFine;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.96, .985, 1.), fxFrost * .7);
    diffuseColor.rgb *= .94 + .1 * smoothstep(.15, .4, fxE);`,
  surface: 'roughnessFactor = mix(.05, .7, fxFrost);',
  emissive: 'totalEmissiveRadiance = vec3(fxGlint(vLocal.xy * 34. + vSeed * 11., .1, 1.) * 2.2);',
};
B.ice = {
  color: `
    float fxN = fxF3(vLocal * 7. + vSeed * 3.);
    float fxCr = 1. - smoothstep(0., .03, abs(fxN - .5));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.55, .78, .95), fxCr * .55);`,
  emissive: 'totalEmissiveRadiance = vec3(fxGlint(vec2(vLocal.x + vLocal.z, vLocal.y) * 30. + vSeed * 5., .08, .9) * 1.6);',
};

S.metal = {
  // 한 방향으로 갈아 낸 결
  color: `
    float fxB = fxN2(vec2(vLocal.x * 6., vLocal.y * 420.) + vSeed * 30.);
    float fxB2 = fxN2(vec2(vLocal.x * 2., vLocal.y * 90.) + vSeed * 7.);
    diffuseColor.rgb *= .8 + .26 * fxB + .1 * fxB2;`,
  surface: 'roughnessFactor = .16 + .26 * fxB;',
};
B.metal = {
  color: `
    float fxB = fxN2(vec2((vLocal.x + vLocal.z) * 6., vLocal.y * 360.) + vSeed * 30.);
    diffuseColor.rgb *= .75 + .4 * fxB;`,
  surface: 'roughnessFactor = .25 + .3 * fxB;',
};

S.paper = {
  // 손으로 오린 듯 들쭉날쭉한 가장자리, 가장자리에 고인 물감, 종이 섬유
  color: `
    float fxE = fxEdge();
    float fxRag = fxF2(vLocal.xy * 25. + vSeed * 3.) * .035;
    if (fxE < fxRag) discard;
    float fxN = fxF2(vLocal.xy * 60. + vSeed * 13.);
    diffuseColor.rgb *= .88 + .16 * fxN;
    diffuseColor.rgb *= mix(.72, 1., smoothstep(0., .07, fxE - fxRag));`,
  surface: 'roughnessFactor = 1.;',
};
B.paper = {
  color: `
    diffuseColor.rgb *= .9 + .12 * fxF3(vLocal * 45. + vSeed * 4.);`,
  surface: 'roughnessFactor = 1.;',
};

S.electric = {
  // 어두운 판 위로 번개가 기어다닌다. 모양이 뚝뚝 끊겨 바뀌고, 가끔 칸 하나가 꺼진다
  color: `
    vec2 fxP = vLocal.xy * 3.5 + vSeed * 19.;
    float fxT = floor(uTime * 12.);
    float fxN = fxF2(fxP + vec2(fxH1(fxT + vSeed * 31.) * 7.3, fxH1(fxT * 1.7 + vSeed) * 5.1));
    float fxArc = 1. - smoothstep(0., .035, abs(fxN - .5));
    float fxN2b = fxF2(fxP * 1.9 + vec2(uTime * 2.3, -uTime * 1.7));
    float fxArc2 = 1. - smoothstep(0., .02, abs(fxN2b - .5));
    float fxOn = step(.2, fxH1(floor(uTime * 5.) * .37 + vSeed * 7.));
    float fxBolt = (fxArc + fxArc2 * .6) * fxOn;
    diffuseColor.rgb *= .42;`,
  surface: 'roughnessFactor = .3;',
  emissive: 'totalEmissiveRadiance = diffuse * (.3 + fxBolt * 2.4) + vec3(.75, .88, 1.) * fxBolt * fxArc * 1.3;',
};
B.electric = {
  // 모서리를 따라 가끔 전기가 튄다
  color: `
    vec3 fxA = abs(vLocal) / .48;
    float fxRim = smoothstep(.8, 1., max(min(fxA.x, fxA.y), max(min(fxA.y, fxA.z), min(fxA.x, fxA.z))));
    float fxT = floor(uTime * 10.);
    float fxN = fxF3(vLocal * 6. + fxH1(fxT + vSeed * 13.) * 9.);
    float fxArc = (1. - smoothstep(0., .04, abs(fxN - .5))) * step(.55, fxH1(fxT * .7 + vSeed * 3.)) * fxRim;`,
  emissive: 'totalEmissiveRadiance = uBodyGlow * fxArc * 2.5;',
};

S.flesh = {
  // 근섬유 결, 마블링 같은 기름 줄, 도드라진 핏줄, 울퉁불퉁 젖은 겉. 심장 박동에 맞춰 붉어진다
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
  emissive: 'totalEmissiveRadiance = diffuse * fxB * .3 + vec3(.7, .02, .08) * fxVein * fxB * .8;',
};
B.flesh = {
  color: `
    float fxV = fxF3(vLocal * 5. + vSeed * 7.);
    float fxVein = 1. - smoothstep(0., .03, abs(fxV - .5));
    float fxB = fxBeat();
    diffuseColor.rgb *= .8 + .4 * fxF3(vLocal * 18. + vSeed);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.35, .02, .1), fxVein * .8);`,
  surface: 'roughnessFactor = .2;',
  emissive: 'totalEmissiveRadiance = vec3(.5, .02, .06) * (fxVein * .9 + .15) * fxB;',
};

S.eldritch = {
  // 꿈틀거리는 점액 무늬. 몇 칸에는 눈이 있어서 두리번거리다가 가끔 깜빡인다
  color: `
    vec2 fxP = vLocal.xy * 4. + vSeed * 13.;
    vec2 fxW = vec2(fxF2(fxP + uTime * .08), fxF2(fxP - uTime * .07 + 5.2));
    float fxRidge = 1. - abs(fxF2(fxP + fxW * 2.) * 2. - 1.);
    vec3 fxBase = diffuseColor.rgb * (.3 + .55 * pow(fxRidge, 3.));
    float fxHas = step(.5, fxH1(vSeed * 91.7));
    float fxPh = fract(uTime * (.13 + fxH1(vSeed * 3.) * .1) + fxH1(vSeed * 5.));
    float fxOpen = smoothstep(0., .03, abs(fxPh - .03));
    vec2 fxQ = (vLocal.xy / .4) / vec2(.86, 1.);
    float fxLid = .58 * fxOpen * (1. - fxQ.x * fxQ.x);
    float fxIn = (1. - smoothstep(-.04, .02, abs(fxQ.y) - fxLid)) * step(abs(fxQ.x), 1.) * fxHas;
    vec2 fxLook = vec2(sin(uTime * .7 + vSeed * 20.) * .3, cos(uTime * .53 + vSeed * 11.) * .12);
    vec2 fxI = fxQ - fxLook;
    float fxIris = 1. - smoothstep(.34, .38, length(fxI));
    float fxPupil = 1. - smoothstep(.05, .09, length(fxI * vec2(1., .3)));
    vec3 fxEye = mix(vec3(.82, .8, .6), diffuseColor.rgb * 1.2 + .06, fxIris);
    fxEye *= .55 + .45 * smoothstep(0., .22, fxLid - abs(fxQ.y));
    fxEye = mix(fxEye, vec3(.01), fxPupil * fxIris);
    diffuseColor.rgb = mix(fxBase, fxEye, fxIn);`,
  surface: 'roughnessFactor = .14;',
  emissive: 'totalEmissiveRadiance = diffuse * (fxIris * (1. - fxPupil) * fxIn * .7 + pow(fxRidge, 6.) * .25 * (1. - fxIn));',
};
B.eldritch = {
  // 끈적한 몸통, 능선을 따라 희미하게 빛나는 핏줄
  color: `
    vec3 fxP = vLocal * 5. + vSeed * 9.;
    float fxR = 1. - abs(fxF3(fxP + vec3(0., uTime * .1, 0.)) * 2. - 1.);
    diffuseColor.rgb *= .7 + .5 * fxR;`,
  surface: 'roughnessFactor = .12;',
  emissive: 'totalEmissiveRadiance = uBodyGlow * pow(fxR, 10.) * (.6 + .4 * sin(uTime * 1.5 + vSeed * 6.));',
};

S.gem = {
  // 보석처럼 깎인 면. 실제로 면마다 기울기가 달라서 빛과 반사가 면마다 다르게 맺힌다
  color: `
    vec2 fxQ = vLocal.xy / .4;
    float fxM = max(abs(fxQ.x), abs(fxQ.y));
    float fxSeam = (1. - smoothstep(0., .03, abs(abs(fxQ.x) - abs(fxQ.y)))) * step(.42, fxM)
      + (1. - smoothstep(0., .02, abs(fxM - .42))) + (1. - smoothstep(0., .02, abs(fxM - .74)));
    diffuseColor.rgb *= .85;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.), clamp(fxSeam, 0., 1.) * .25);`,
  normal: `
    vec2 fxTilt = vec2(0.);
    if (fxM > .42) {
      float fxK = fxM > .74 ? .8 : .4;
      if (abs(fxQ.x) > abs(fxQ.y)) fxTilt.x = sign(fxQ.x) * fxK;
      else fxTilt.y = sign(fxQ.y) * fxK;
    }
    normal = normalize(normal + vTx * fxTilt.x + vTy * fxTilt.y);`,
  surface: 'roughnessFactor = .04;',
  emissive: 'totalEmissiveRadiance = diffuse * .2 + vec3(fxGlint(vLocal.xy * 18. + vSeed * 7., .25, 1.4) * 2.5);',
};
B.gem = {
  // 두드려 편 금
  color: `
    float fxH = fxF3(vLocal * 22. + vSeed * 5.);
    diffuseColor.rgb *= .85 + .3 * fxH;`,
  surface: 'roughnessFactor = .22 + .2 * fxH;',
};

S.glitch = {
  // 주사선, 색이 어긋나는 가장자리, 가끔 줄째 밀리고 깨지는 칸
  color: `
    float fxT = floor(uTime * 15.);
    float fxG = step(.92, fxH1(fxT + vSeed * 17.));
    vec2 fxUv = vLocal.xy / .8 + .5;
    float fxShift = (fxH1(floor(fxUv.y * 10.) + fxT * 3.1) - .5) * .35 * fxG;
    vec2 fxQ = vLocal.xy + vec2(fxShift, 0.);
    float fxSplit = .025 * (1. + 4. * fxG);
    float fxR = step(fxBox(fxQ + vec2(fxSplit, 0.), vec2(.4), .09), 0.);
    float fxGc = step(fxBox(fxQ, vec2(.4), .09), 0.);
    float fxBc = step(fxBox(fxQ - vec2(fxSplit, 0.), vec2(.4), .09), 0.);
    float fxScan = .8 + .2 * step(.5, fract(vLocal.y * 55. + uTime * 3.));
    vec3 fxC = diffuseColor.rgb * fxScan;
    float fxBad = step(.75, fxH2(floor(fxUv * vec2(5., 11.)) + fxT)) * fxG;
    fxC = mix(fxC, fxC.brg, fxBad);
    diffuseColor.rgb = vec3(fxC.r * fxR, fxC.g * fxGc, fxC.b * fxBc) + .04;`,
  surface: 'roughnessFactor = .35;',
  emissive: 'totalEmissiveRadiance = diffuseColor.rgb * (.2 + fxG * .7);',
};
B.glitch = {
  color: `
    float fxScan = .75 + .25 * step(.5, fract(vLocal.y * 40. - uTime * 2.));
    diffuseColor.rgb *= fxScan;`,
};

S.pixel = {
  // 8비트 게임의 블록. 테두리, 왼쪽 위 밝은 줄, 오른쪽 아래 그림자, 반짝 점
  color: `
    vec2 fxPx = floor((vLocal.xy / .8 + .5) * 8.);
    float fxK = 1.;
    if (fxPx.x == 1. || fxPx.y == 6.) fxK = 1.35;
    if (fxPx.x == 6. || fxPx.y == 1.) fxK = .72;
    if (fxPx.x <= 0. || fxPx.y <= 0. || fxPx.x >= 7. || fxPx.y >= 7.) fxK = .42;
    float fxShine = step(abs(fxPx.x - 2.5), .6) * step(abs(fxPx.y - 4.5), .6);
    diffuseColor.rgb *= fxK * (.94 + .1 * fxH2(fxPx + vSeed * 40.));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.), fxShine * .85);`,
  surface: 'roughnessFactor = .9;',
};
B.pixel = {
  color: `
    diffuseColor.rgb *= .8 + .4 * fxH3(floor(vLocal * 16.) + vSeed * 20.);`,
  surface: 'roughnessFactor = .9;',
};

S.circuit = {
  // 기판 배선. 빛 알갱이가 선을 따라 흘러간다
  color: `
    vec2 fxG = (vLocal.xy / .8 + .5) * 6.;
    vec2 fxC = floor(fxG);
    vec2 fxF = fract(fxG);
    float fxH = fxH2(fxC + vSeed * 9.);
    bool fxHor = fxH > .5;
    float fxLine = 1. - smoothstep(.06, .1, abs((fxHor ? fxF.y : fxF.x) - .5));
    float fxHasVia = step(.75, fxH2(fxC + 11.));
    float fxVia = 1. - smoothstep(.12, .17, length(fxF - .5));
    float fxHole = 1. - smoothstep(.04, .07, length(fxF - .5));
    float fxTrace = max(fxLine * step(.3, fxH2(fxC * 1.7 + 3.)), fxVia * fxHasVia);
    float fxPulse = pow(1. - abs(fract((fxHor ? fxG.x : fxG.y) * .25 - uTime * .6 + fxH * 3.) - .5) * 2., 8.);
    diffuseColor.rgb = mix(diffuseColor.rgb * .5, diffuseColor.rgb * 1.15 + .06, fxTrace);
    diffuseColor.rgb *= 1. - fxHole * fxHasVia * .75;`,
  surface: 'roughnessFactor = mix(.6, .25, fxTrace);',
  emissive: 'totalEmissiveRadiance = diffuse * fxTrace * fxPulse * 1.8;',
};
B.circuit = {
  // 몸통에는 구리색 배선이 깔려 있다
  color: `
    vec2 fxP = vec2(vLocal.x + vLocal.z, vLocal.y) * 9. + vSeed * 13.;
    vec2 fxC = floor(fxP);
    vec2 fxF = fract(fxP);
    float fxH = fxH2(fxC);
    float fxLine = (1. - smoothstep(.05, .09, abs((fxH > .5 ? fxF.y : fxF.x) - .5))) * step(.4, fxH2(fxC + 5.));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.75, .5, .22), fxLine * .7);`,
  surface: 'roughnessFactor = mix(.6, .3, fxLine);',
};

S.aurora = {
  // 밤하늘 같은 어두운 판 위로 오로라 커튼이 너울거리고, 세로로 빛살이 내린다.
  // 아래는 초록, 위로 갈수록 보랏빛
  color: `
    vec2 fxP = vLocal.xy * 2.2 + vSeed * 7.;
    float fxW = fxF2(vec2(fxP.y * .6 + uTime * .12, vSeed * 3.));
    float fxCurtain = fxF2(vec2(fxP.x * 1.4 + fxW * 2.2 + uTime * .08, fxP.y * .25));
    float fxRay = .55 + .45 * fxN2(vec2(fxP.x * 14. + fxW * 6., fxP.y * .4 - uTime * .3));
    float fxA = smoothstep(.42, .72, fxCurtain) * fxRay;
    float fxFade = smoothstep(-.4, .4, vLocal.y);
    float fxStar = fxGlint(vLocal.xy * 30. + vSeed * 9., .15, .8);
    diffuseColor.rgb *= .14 + .16 * fxA;`,
  surface: 'roughnessFactor = .25;',
  emissive: `
    totalEmissiveRadiance = diffuse * (.2 + fxA * 1.7 * (1. - .4 * fxFade))
      + mix(vec3(.2, 1., .6), vec3(.7, .3, 1.), fxFade) * fxA * .3 + vec3(fxStar);`,
};
B.aurora = {
  color: `
    float fxStar = fxGlint(vec2(vLocal.x + vLocal.z * 1.3, vLocal.y) * 30. + vSeed * 9., .1, .7);`,
  emissive: 'totalEmissiveRadiance = vec3(fxStar * 1.3);',
};

S.marble = {
  // 대리석 결. 밝은 돌엔 어두운 결, 어두운 돌엔 흰 결
  color: `
    vec2 fxP = vLocal.xy * 3. + vSeed * 29.;
    float fxN = fxF2(fxP * 1.3);
    float fxVein = pow(1. - abs(sin((fxP.x * .8 + fxP.y * .6) * 3. + fxN * 7.)), 10.);
    float fxVein2 = pow(1. - abs(sin((fxP.y * .9 - fxP.x * .3) * 5. + fxN * 9.)), 24.);
    vec3 fxVc = dot(diffuseColor.rgb, vec3(.3, .59, .11)) > .55 ? diffuseColor.rgb * .45 : mix(diffuseColor.rgb, vec3(1.), .65);
    diffuseColor.rgb *= .86 + .22 * fxF2(fxP * 2.5);
    diffuseColor.rgb = mix(diffuseColor.rgb, fxVc, clamp(fxVein * .8 + fxVein2 * .5, 0., 1.));`,
  surface: 'roughnessFactor = .1;',
};
B.marble = {
  // 검은 대리석에 금빛 결
  color: `
    vec3 fxP = vLocal * 4. + vSeed * 17.;
    float fxN = fxF3(fxP);
    float fxVein = pow(1. - abs(sin((fxP.x * .7 + fxP.y * .5 + fxP.z * .4) * 3. + fxN * 8.)), 14.);
    diffuseColor.rgb = mix(diffuseColor.rgb * (.85 + .3 * fxN), vec3(.82, .62, .26), fxVein);`,
  surface: 'roughnessFactor = mix(.12, .3, fxVein);',
};

S.pumpkin = {
  // 작은 호박등. 껍질 결 위로 눈 두 개와 들쭉날쭉한 입이 파여 있고 안에서 촛불이 일렁인다
  color: `
    vec2 fxQ = vLocal.xy / .4;
    float fxRib = .5 + .5 * cos(fxQ.x * 9.42);
    float fxEw = .2 + .06 * fxH1(vSeed * 3.);
    vec2 fxEl = vec2(abs(fxQ.x) - .38, fxQ.y - .12);
    float fxEye = step(-.18, fxEl.y) * step(abs(fxEl.x), (.18 - fxEl.y) * fxEw / .36 * 1.6) * step(fxEl.y, .18);
    float fxTop = -.22 + .1 * abs(fract(fxQ.x * 2.5 + vSeed) - .5) * 2.;
    float fxBot = -.55 + .25 * fxQ.x * fxQ.x;
    float fxMouth = step(fxBot, fxQ.y) * step(fxQ.y, fxTop) * step(abs(fxQ.x), .66);
    float fxCarve = max(fxEye, fxMouth);
    float fxFl = .75 + .25 * fxN2(vec2(uTime * 7., vSeed * 10.));
    vec3 fxCandle = mix(diffuseColor.rgb, vec3(1., .62, .18), .55);
    diffuseColor.rgb *= .58 + .25 * fxRib;
    diffuseColor.rgb = mix(diffuseColor.rgb, fxCandle, fxCarve);`,
  surface: 'roughnessFactor = mix(.55, .9, fxCarve);',
  emissive: 'totalEmissiveRadiance = fxCandle * fxCarve * 1.7 * fxFl + diffuse * .05;',
};
B.pumpkin = {
  color: `
    diffuseColor.rgb *= .85 + .3 * fxF3(vLocal * 9. + vSeed * 3.);`,
};

export const SURFACES = Object.keys(S);

/** 이 질감은 시간에 따라 움직이는가. 움직이면 계속 그려야 한다. */
export const MOVING = new Set([
  'neon', 'lava', 'water', 'space', 'candy', 'ice',
  'electric', 'flesh', 'eldritch', 'gem', 'glitch', 'circuit', 'aurora', 'pumpkin',
]);

/**
 * 재질에 질감을 끼워 넣는다. kind는 material.userData.surface에서 그때그때 읽으므로
 * 테마를 바꿀 때는 userData.surface를 바꾸고 needsUpdate만 켜면 된다.
 */
export function wear(material, part, uniforms) {
  material.userData.part = part;
  material.userData.surface = 'plain';
  material.customProgramCacheKey = () => `${part}:${material.userData.surface}`;
  material.onBeforeCompile = (shader) => {
    const table = part === 'body' ? B : S;
    const fx = table[material.userData.surface] ?? table.plain;
    Object.assign(shader.uniforms, uniforms);
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
