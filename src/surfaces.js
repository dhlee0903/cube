// 테마마다 큐브 겉면에 입히는 질감. MeshStandardMaterial 셰이더 사이사이에 끼워 넣는다.
//
// vLocal  조각 안쪽 좌표. 스티커는 xy가 ±0.4인 평면, 몸통은 ±0.48인 상자
// vSeed   조각(스티커)마다 다른 난수. 같은 무늬가 반복되지 않게 한다
// uTime   초
//
// 각 질감은 세 군데에 들어간다.
//   color     diffuseColor(바탕색)를 바꾼다
//   surface   roughnessFactor, metalnessFactor를 바꾼다
//   emissive  totalEmissiveRadiance(스스로 내는 빛)를 바꾼다
// 앞 단계에서 선언한 변수는 뒤 단계에서 그대로 쓸 수 있다(같은 main 안).

const COMMON = /* glsl */ `
uniform float uTime;
uniform float uFlash;
uniform vec3 uBodyGlow;
varying float vSeed;
varying vec3 vLocal;

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

export const SURFACES = Object.keys(S);

/** 이 질감은 시간에 따라 움직이는가. 움직이면 계속 그려야 한다. */
export const MOVING = new Set(['neon', 'lava', 'water', 'space', 'candy', 'ice']);

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
      .replace('#include <common>', '#include <common>\nattribute float aSeed;\nvarying float vSeed;\nvarying vec3 vLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSeed = aSeed;\nvLocal = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${fx.color ?? ''}`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\n${fx.surface ?? ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${fx.emissive ?? ''}
        totalEmissiveRadiance += diffuseColor.rgb * uFlash;`);
  };
}
