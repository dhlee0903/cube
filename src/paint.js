// 명화 화면 필터. 장면(큐브)과 그 뒤 배경을 한 장의 그림으로 다시 그린다.
// filters.js가 공통 머리(COMMON)를 넘겨주면 필터마다 조각 셰이더를 돌려준다.
//   collage     호크니식 사진 콜라주. 조금씩 다른 자리와 각도에서 찍은 사진을 겹쳐 붙인다. 흰 테두리, 사진마다 다른 노출, 그림자
//   munch       뭉크풍 표현주의. 물결치는 흐름을 따라 길게 끌린 붓질, 출렁이는 윤곽, 타는 듯한 하늘 띠와 검푸른 물
//   warhol      워홀풍 실크스크린. 같은 장면을 2×2로 찍고 칸마다 다른 색 판, 맨 위에 어긋나게 찍힌 검은 판
//   dabs        붓 자국 하나하나를 찍는다. 설정에 따라 유화(형태 경계를 따라 눕는 긴 붓질, 두꺼운 요철, 니스),
//               고흐풍(굵게 소용돌이치는 뭉툭한 붓질), 모네풍(가볍게 끊어 찍은 색), 쇠라풍(순색 점만 찍는 점묘)이 된다
//   klimt       클림트풍. 금박 바탕에 소용돌이 무늬, 색 면은 작은 네모·동그라미 모자이크, 검은 면은 흑백 네모
//   cubism      입체파. 장면을 각진 조각으로 쪼개 조각마다 조금씩 다른 시점, 흙빛 색조, 조각마다 다른 빛 방향과 빗금, 끊긴 윤곽
//   ukiyoe      우키요에 목판화. 몇 가지 안료로 평평하게 찍고 먹선, 판 어긋남, 나뭇결, 위쪽 쪽빛 그러데이션(보카시), 화지 결
//   watercolor  수채화. 번지는 가장자리, 가장자리에 고이는 물감, 안료 알갱이, 종이 요철, 남겨 둔 흰 종이, 연필 밑그림

const HEAD = /* glsl */ `
uniform vec3 uBgA;
uniform vec3 uBgB;
uniform vec3 uBgC;
uniform vec3 uPal[12];
uniform int uPalN;
float fxN(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3. - 2. * f);
  return mix(mix(fxHash(i), fxHash(i + vec2(1., 0.)), u.x), mix(fxHash(i + vec2(0., 1.)), fxHash(i + vec2(1., 1.)), u.x), u.y);
}
float fxFbm(vec2 p) {
  float s = 0., a = .5;
  for (int i = 0; i < 4; i++) { s += a * fxN(p); p = p * 2.03 + 17.1; a *= .5; }
  return s;
}
float fxL(vec3 c) { return dot(c, vec3(.3, .59, .11)); }
vec3 fxSat(vec3 c, float s) { return mix(vec3(fxL(c)), c, s); }
vec2 fxAsp() { return uRes / min(uRes.x, uRes.y); }
// 화면 가운데가 0, 짧은 쪽 길이가 1인 좌표
vec2 fxP(vec2 uv) { return (uv - .5) * fxAsp(); }
mat2 fxRot(float a) { return mat2(cos(a), sin(a), -sin(a), cos(a)); }
vec4 fxTex(vec2 uv) {
  vec4 c = texture2D(tColor, clamp(uv, 0., 1.));
  return c.a > .002 ? vec4(fxSrgb(c.rgb / c.a), clamp(c.a, 0., 1.)) : vec4(0.);
}
// 배경 bg 위에 장면을 얹은 색
vec3 fxOver(vec2 uv, vec3 bg) { vec4 c = fxTex(uv); return mix(bg, c.rgb, c.a); }
vec3 fxHsv(vec3 c) {
  vec4 K = vec4(0., -1. / 3., 2. / 3., -1.);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6. * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
vec3 fxRgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1., 2. / 3., 1. / 3.)) * 6. - 3.);
  return c.z * mix(vec3(1.), clamp(p - 1., 0., 1.), c.y);
}
// 팔레트에서 가장 가까운 물감
vec3 fxPick(vec3 c) {
  vec3 best = uPal[0];
  float bd = 1e9;
  for (int i = 0; i < 12; i++) {
    if (i >= uPalN) break;
    vec3 e = (c - uPal[i]) * vec3(1., 1.2, .8);
    float d = dot(e, e);
    if (d < bd) { bd = d; best = uPal[i]; }
  }
  return best;
}
// 바탕과의 경계(입자 포함): 둘레 네 곳의 불투명도 차
float fxRim(vec2 uv, float r) {
  vec2 o = vec2(r) / uRes;
  float a = fxTex(uv).a;
  float e = abs(fxTex(uv + vec2(o.x, 0.)).a - a) + abs(fxTex(uv - vec2(o.x, 0.)).a - a)
          + abs(fxTex(uv + vec2(0., o.y)).a - a) + abs(fxTex(uv - vec2(0., o.y)).a - a);
  return clamp(e, 0., 1.);
}`;

const COLLAGE = /* glsl */ `
vec3 fxBack(vec2 uv) {
  vec2 p = fxP(uv);
  vec3 c = mix(uBgB, uBgA, smoothstep(-.35, .1, p.y));
  return c * (.92 + .12 * fxFbm(p * 6.));
}
float fxBoxD(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.)) + min(max(d.x, d.y), 0.); }
void main() {
  const float S = .36;
  vec2 P = fxP(vUv);
  vec2 g = floor(P / S);
  float topZ = -1.;
  vec2 tl = vec2(0.), tc = vec2(0.), tb = vec2(1.), tid = vec2(0.);
  float tr = 0.;
  for (int y = -2; y <= 2; y++) {
    for (int x = -2; x <= 2; x++) {
      vec2 id = g + vec2(float(x), float(y));
      float h1 = fxHash(id), h2 = fxHash(id + 5.1), h3 = fxHash(id + 9.7), h4 = fxHash(id + 13.3);
      vec2 c = (id + .5 + (vec2(h1, h2) - .5) * .35) * S;
      vec2 b = S * vec2(.62 + .1 * h3, .5 + .1 * h4);
      float rot = (h3 - .5) * .2;
      vec2 l = fxRot(-rot) * (P - c);
      float z = fxHash(id + 21.7);
      if (abs(l.x) < b.x && abs(l.y) < b.y && z > topZ) { topZ = z; tl = l; tc = c; tb = b; tr = rot; tid = id; }
    }
  }
  vec3 col;
  if (topZ < 0.) {
    col = uBgC * (.85 + .2 * fxN(P * 40.));
  } else {
    float h1 = fxHash(tid), h2 = fxHash(tid + 5.1), h3 = fxHash(tid + 9.7), hz = fxHash(tid + 31.3);
    // 사진마다 조금 다른 자리, 각도, 거리에서 찍었다
    vec2 src = tc + fxRot(tr * .25) * tl * (1. + (h3 - .5) * .04) + (vec2(h1, h2) - .5) * .012;
    vec2 uv = src / fxAsp() + .5;
    vec3 photo = fxOver(uv, fxBack(uv));
    photo *= .86 + .26 * hz;
    photo = mix(photo, photo * (hz > .5 ? vec3(1.08, 1., .86) : vec3(.92, 1., 1.08)), .5);
    photo = mix(photo, vec3(.95, .92, .85), .07);
    photo *= 1. - .15 * pow(length(tl / tb), 3.);
    photo += .05 * smoothstep(.2, 1., dot(tl / tb, vec2(-.6, .8)));
    float border = .014;
    bool edge = max(abs(tl.x) - (tb.x - border), abs(tl.y) - (tb.y - border)) > 0.;
    col = edge ? vec3(.96, .95, .91) * (.95 + .05 * fxN(P * 200.)) : photo;
    // 위에 덮인 사진들이 드리우는 그림자
    float shadow = 0.;
    for (int y = -2; y <= 2; y++) {
      for (int x = -2; x <= 2; x++) {
        vec2 id = g + vec2(float(x), float(y));
        float z = fxHash(id + 21.7);
        if (z <= topZ) continue;
        float h1b = fxHash(id), h2b = fxHash(id + 5.1), h3b = fxHash(id + 9.7), h4b = fxHash(id + 13.3);
        vec2 c = (id + .5 + (vec2(h1b, h2b) - .5) * .35) * S;
        vec2 b = S * vec2(.62 + .1 * h3b, .5 + .1 * h4b);
        vec2 l = fxRot(-(h3b - .5) * .2) * (P - c - vec2(.007, -.011));
        shadow = max(shadow, 1. - smoothstep(-.004, .02, fxBoxD(l, b)));
      }
    }
    col *= 1. - shadow * .35;
  }
  gl_FragColor = vec4(clamp(col, 0., 1.), 1.);
}`;

const MUNCH = /* glsl */ `
float fxFlowA(vec2 P) { return fxFbm(P * 1.4 + vec2(0., uTime * .015)) * 7. + P.y * 2.5; }
vec3 fxBack(vec2 uv) {
  vec2 P = fxP(uv);
  float w = P.y + .1 * sin(P.x * 4. + fxN(P * 1.6) * 5.);
  float band = fract(w * 4.5 + fxN(P * 3.) * .5);
  vec3 sky = mix(uBgA, uBgB, smoothstep(.2, .6, band));
  sky = mix(sky, uBgC, smoothstep(.75, .95, band) * .8);
  vec3 sea = mix(vec3(.07, .1, .22), vec3(.12, .3, .38), fxN(P * vec2(2.5, 6.) + 4.));
  return mix(sea, sky, smoothstep(-.12, .02, w));
}
vec3 fxWave(vec2 uv) {
  vec2 w = vec2(sin(uv.y * 22. + uTime * .4), cos(uv.x * 19. - uTime * .3)) * .0025;
  return fxOver(uv + w, fxBack(uv));
}
void main() {
  vec2 pos = vUv * uRes;
  float L = 2.3 * uDpr;
  vec3 acc = fxWave(vUv);
  float nz = fxHash(floor(pos / (1.6 * uDpr)));
  vec2 p = pos, q = pos;
  for (int i = 0; i < 7; i++) {
    float a = fxFlowA(fxP(p / uRes));
    p += vec2(cos(a), sin(a)) * L;
    acc += fxWave(p / uRes);
    nz += fxHash(floor(p / (1.6 * uDpr)));
    float b = fxFlowA(fxP(q / uRes));
    q -= vec2(cos(b), sin(b)) * L;
    acc += fxWave(q / uRes);
    nz += fxHash(floor(q / (1.6 * uDpr)));
  }
  // 큐브 위에서는 색을 문질러 섞지 않는다(스티커 색이 그대로 보이게). 흐름 붓질은 결로만 남는다
  vec3 col = mix(acc / 15., fxWave(vUv), fxTex(vUv).a * .85);
  float st = nz / 15.;
  col = fxSat(col, 1.5);
  col = mix(col, vec3(.1, .13, .28), smoothstep(.32, .08, fxL(col)) * .55);
  col = mix(col, col * vec3(1.12, 1., .78), smoothstep(.55, .9, fxL(col)) * .4);
  col *= .84 + .32 * st;
  // 출렁이는 굵은 윤곽
  vec2 w = vec2(sin(vUv.y * 22. + uTime * .4), cos(vUv.x * 19. - uTime * .3)) * .0025;
  float rim = fxRim(vUv + w, 2.5 * uDpr);
  col = mix(col, vec3(.08, .09, .16), rim * (.6 + .4 * st));
  gl_FragColor = vec4(clamp(col, 0., 1.), 1.);
}`;

const WARHOL = /* glsl */ `
vec3 fxBack(vec2 uv) { return vec3(0.); }
void main() {
  vec2 cell = floor(vUv * 2.);
  vec2 uv = fract(vUv * 2.);
  float k = cell.x + (1. - cell.y) * 2.;
  vec3 panel = k < .5 ? uPal[0] : (k < 1.5 ? uPal[1] : (k < 2.5 ? uPal[2] : uPal[3]));
  vec3 accent = k < .5 ? uPal[4] : (k < 1.5 ? uPal[5] : (k < 2.5 ? uPal[6] : uPal[7]));
  vec4 c = fxTex(uv);
  // 색 판: 색은 칸마다 돌려 바꾸고, 밝기는 두 단으로 평평하게
  vec3 h = fxHsv(c.rgb);
  vec3 ink;
  if (h.y < .22) ink = h.z > .45 ? accent : accent * .55;
  else {
    h.x = fract(h.x + k * .23 + .04);
    h.y = min(1., h.y * 1.3 + .25);
    h.z = h.z > .5 ? 1. : .78;
    ink = fxRgb(h);
  }
  vec3 col = mix(panel, ink, step(.5, c.a));
  // 검은 판: 어둡고 그늘진 곳만 찍히고, 칸마다 조금씩 어긋난다
  vec2 off = vec2(.006 + .004 * k, -.004 - .003 * mod(k, 2.));
  vec4 ck = fxTex(uv + off);
  float key = step(.5, ck.a) * (1. - smoothstep(.22, .34, fxL(ck.rgb)));
  key = max(key, fxRim(uv + off, 1.8 * uDpr) * .9);
  col = mix(col, vec3(.04), key);
  // 고르지 않게 먹은 잉크와 칸 사이 틈
  vec2 pos = vUv * uRes / uDpr;
  col *= .93 + .1 * fxN(pos * .35) + .04 * fxN(pos * .04);
  col = mix(col, vec3(.97), step(min(abs(vUv.x - .5) * uRes.x, abs(vUv.y - .5) * uRes.y) / uDpr, 2.));
  gl_FragColor = vec4(clamp(col, 0., 1.), 1.);
}`;

const DABS = /* glsl */ `
uniform float uDab;
uniform float uLen;
uniform float uSwirl;
uniform float uDot;
uniform float uRelief;
uniform float uJit;
uniform float uPastel;
uniform float uLine;
uniform float uAlign;
uniform float uBlunt;
uniform float uVarnish;
uniform float uWide;
float fxAngD(vec2 P) { return fxFbm(P * 2.2 + 3.) * 6.2832 * uSwirl + .25; }
vec3 fxBack(vec2 uv) {
  vec2 P = fxP(uv);
  vec3 c = mix(uBgA, uBgB, fxFbm(P * 2.5 + 1.));
  return mix(c, uBgC, smoothstep(.55, .8, fxFbm(P * 3.5 + 7.)) * .7);
}
void main() {
  vec2 pos = vUv * uRes;
  float D = uDab * uDpr;
  vec3 bg = fxBack(vUv);
  vec3 under = fxOver(vUv, bg);
  // 붓 자국 사이로는 그 자리 색이 비친다(점묘는 캔버스와 섞인 색)
  vec3 col = uPalN > 0 ? mix(under, vec3(.93, .9, .82), .4) : under * (.9 + uPastel);
  float ridge = 0.;
  float bz = -1.;
  for (int L = 0; L < 2; L++) {
    vec2 sh = float(L) * vec2(.5, .37);
    vec2 cell = floor(pos / D + sh);
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 c = cell + vec2(float(x), float(y));
        float h = fxHash(c + float(L) * 7.1);
        vec2 cp = (c + .5 + (vec2(h, fxHash(c + 3.3)) - .5) * .7 - sh) * D;
        float a = fxAngD(fxP(cp / uRes));
        if (uAlign > .5) {
          // 형태를 따라 칠한다: 색이 바뀌는 경계와 나란히 눕는다
          vec2 e = vec2(3. * uDpr) / uRes;
          vec2 cuv = cp / uRes;
          vec2 gg = vec2(fxL(fxOver(cuv + vec2(e.x, 0.), bg)) - fxL(fxOver(cuv - vec2(e.x, 0.), bg)),
                         fxL(fxOver(cuv + vec2(0., e.y), bg)) - fxL(fxOver(cuv - vec2(0., e.y), bg)));
          if (length(gg) > .04) a = atan(gg.y, gg.x) + 1.5708;
        }
        vec2 d = (pos - cp) / D;
        vec2 lo = vec2(dot(d, vec2(cos(a), sin(a))), dot(d, vec2(-sin(a), cos(a))));
        vec2 qd = abs(lo) / vec2(uLen * .5, uWide);
        float r = uDot > .5 ? length(lo) / .5 : mix(length(qd), pow(pow(qd.x, 4.) + pow(qd.y, 4.), .25), uBlunt);
        float z = h + float(L);
        vec3 sc = fxOver(cp / uRes, bg);
        // 붓 자국은 칸 경계를 넘지 않는다: 붓 가운데 색이 이 자리 색과 다르면(다른 스티커나 몸통) 칠하지 않는다
        if (r < 1. && z > bz && length(sc - under) < .2) {
          bz = z;
          sc += (vec3(fxHash(c + 1.1), fxHash(c + 2.2), fxHash(c + 4.4)) - .5) * uJit;
          sc = mix(fxSat(sc, 1.25), vec3(1.), uPastel);
          if (uPalN > 0) sc = fxPick(sc + (vec3(fxHash(c + 5.5), fxHash(c + 6.6), fxHash(c + 8.8)) - .5) * .16);
          col = sc;
          ridge = (1. - r * r) * (.85 + .15 * sin(lo.y / uWide * 4. + h * 6.));
        }
      }
    }
  }
  // 두꺼운 물감 요철
  float hgt = ridge * uRelief;
  vec3 nrm = normalize(vec3(-dFdx(hgt) * 4., -dFdy(hgt) * 4., 1.));
  vec3 Ld = normalize(vec3(-.5, .6, .62));
  col *= .82 + .3 * max(dot(nrm, Ld), 0.) * step(.01, uRelief) + .18 * step(uRelief, .01);
  col += pow(max(dot(reflect(-Ld, nrm), vec3(0., 0., 1.)), 0.), 18.) * .12 * uRelief;
  // 짙은 쪽빛 윤곽(고흐풍)
  float rim = fxRim(vUv, 2. * uDpr);
  col = mix(col, vec3(.08, .12, .3), rim * uLine);
  col *= 1. + .03 * sin(pos.x * 1.1 / uDpr) * sin(pos.y * 1.1 / uDpr);
  // 누렇게 바랜 니스와 가장자리 그늘
  col = mix(col, col * vec3(1.06, 1., .84), uVarnish * .3);
  col *= 1. - uVarnish * .25 * smoothstep(.55, 1.2, length(fxP(vUv)));
  gl_FragColor = vec4(clamp(col, 0., 1.), 1.);
}`;

const KLIMT = /* glsl */ `
vec3 fxBack(vec2 uv) { return vec3(0.); }
vec3 fxGoldLeaf(vec2 P) {
  vec2 g = P * 9.;
  vec2 f = fract(g);
  float sheet = fxHash(floor(g));
  vec3 gold = mix(vec3(.66, .46, .14), vec3(.98, .8, .4), .35 + .5 * sheet);
  gold *= .86 + .14 * smoothstep(0., .04, min(min(f.x, f.y), min(1. - f.x, 1. - f.y)));
  gold *= .88 + .2 * fxN(P * 60.) + .1 * fxN(P * 7.);
  return gold;
}
float fxSpiralOrn(vec2 P) {
  vec2 g = P * 4.2;
  vec2 f = fract(g) - .5;
  if (fxHash(floor(g)) < .4) return 0.;
  float r = length(f);
  float a = atan(f.y, f.x);
  float s = abs(fract(a / 6.2832 + r * 6.) - .5);
  return (1. - smoothstep(.07, .13, s)) * step(r, .42) * step(.03, r);
}
void main() {
  vec2 P = fxP(vUv);
  vec2 pos = vUv * uRes;
  vec4 c = fxTex(vUv);
  vec3 gold = fxGoldLeaf(P);
  vec3 col;
  if (c.a < .5) {
    col = gold;
    col = mix(col, vec3(.36, .2, .05), fxSpiralOrn(P) * .75);
    vec2 g2 = P * 15.;
    float ring = abs(length(fract(g2) - .5) - .27);
    col = mix(col, vec3(.42, .26, .08), (1. - smoothstep(.02, .05, ring)) * step(.72, fxHash(floor(g2))) * .6);
  } else {
    float T = 10. * uDpr;
    vec2 cell = floor(pos / T);
    vec2 f = fract(pos / T) - .5;
    vec4 cc = fxTex((cell + .5) * T / uRes);
    float h = fxHash(cell);
    float tile;
    if (h < .4) tile = 1. - smoothstep(.42, .47, max(abs(f.x), abs(f.y)));
    else if (h < .75) tile = 1. - smoothstep(.44, .5, length(f));
    else tile = (1. - smoothstep(.44, .5, length(f))) * smoothstep(.1, .15, length(f));
    vec3 hsv = fxHsv(cc.rgb);
    vec3 fill = fxSat(cc.rgb, 1.2) * (.82 + .32 * fxHash(cell + 2.));
    if (hsv.y < .25 && hsv.z < .4) fill = fxHash(cell + 4.) > .55 ? vec3(.95, .93, .88) : vec3(.04);
    col = mix(gold * .92, fill, tile * step(.5, cc.a));
    // 스티커 테두리를 짙게 둘러 칸이 갈리게
    float e = 0.;
    for (int i = 0; i < 4; i++) {
      float an = float(i) * .785398;
      vec2 o = vec2(cos(an), sin(an)) * 1.8 * uDpr / uRes;
      vec4 a = fxTex(vUv + o), b = fxTex(vUv - o);
      e = max(e, length(a.rgb * a.a - b.rgb * b.a) + abs(a.a - b.a));
    }
    col = mix(col, vec3(.16, .09, .02), smoothstep(.2, .4, e) * .85);
  }
  col += pow(fxN(P * 30. + uTime * .2), 8.) * .55 * (c.a < .5 ? 1. : .3);
  gl_FragColor = vec4(clamp(col, 0., 1.), 1.);
}`;

const CUBISM = /* glsl */ `
vec3 fxBack(vec2 uv) {
  vec2 P = fxP(uv);
  return mix(uBgA, uBgB, fxFbm(P * 3.)) * (.9 + .15 * fxN(P * 9.));
}
void main() {
  vec2 P = fxP(vUv);
  const float K = 7.5;
  vec2 gp = P * K;
  vec2 gi = floor(gp), gf = fract(gp);
  float d1 = 8., d2 = 8.;
  vec2 cid = vec2(0.), cpos = vec2(0.);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 pt = o + vec2(fxHash(gi + o), fxHash(gi + o + 17.3));
      float d = length(pt - gf);
      if (d < d1) { d2 = d1; d1 = d; cid = gi + o; cpos = (gi + pt) / K; }
      else if (d < d2) d2 = d;
    }
  }
  float edge = (d2 - d1) / K;
  float h1 = fxHash(cid), h2 = fxHash(cid + 3.1), h3 = fxHash(cid + 7.7);
  // 조각마다 조금씩 다른 시점. 큐브 위에서는 적게 어긋나 스티커를 알아볼 수 있다
  float cube = fxTex(vUv).a;
  float k = mix(1., .2, cube);
  vec2 src = cpos + fxRot((h1 - .5) * .4 * k) * (P - cpos) * (1. + (h3 - .5) * .2 * k) + (vec2(h2, h3) - .5) * .07 * k;
  vec2 uv = src / fxAsp() + .5;
  vec2 cuv = cpos / fxAsp() + .5;
  vec3 col = mix(fxOver(uv, fxBack(uv)), fxOver(cuv, fxBack(cuv)), mix(.5, .12, cube));
  float l = fxL(col);
  col = mix(col, mix(vec3(.17, .13, .1), vec3(.86, .74, .52), l), mix(.55, .15, cube));
  // 조각마다 빛이 다른 쪽에서 든다
  float gdir = h1 * 6.2832;
  float grad = dot(P - cpos, vec2(cos(gdir), sin(gdir))) * K * .9;
  col *= .78 + .38 * clamp(grad + .5, 0., 1.);
  float hatch = smoothstep(.3, .7, fxN(vec2(dot(P, vec2(cos(gdir + .8), sin(gdir + .8))) * 70., dot(P, vec2(-sin(gdir + .8), cos(gdir + .8))) * 6.)));
  col *= 1. - hatch * .16 * (.4 + .6 * smoothstep(.1, .45, -grad));
  float ln = (1. - smoothstep(0., .008, edge)) * step(.5, fxN(P * 6. + 3.));
  col = mix(col, vec3(.12, .09, .07), ln * mix(.75, .3, cube));
  col *= .92 + .12 * fxN(vUv * uRes / (2. * uDpr));
  gl_FragColor = vec4(clamp(col, 0., 1.), 1.);
}`;

const UKIYOE = /* glsl */ `
vec3 fxBack(vec2 uv) {
  vec2 P = fxP(uv);
  vec3 c = mix(uBgA, uBgB, smoothstep(.12, .5, P.y));
  return mix(c, uBgC, smoothstep(-.15, -.5, P.y) * .55);
}
void main() {
  vec2 pos = vUv * uRes / uDpr;
  vec3 bg = fxBack(vUv);
  // 색 판은 먹 판과 조금 어긋나게 찍힌다
  vec2 reg = vec2(1.4, -1.) * uDpr / uRes;
  vec4 t = fxTex(vUv + reg);
  vec3 col = mix(bg, fxPick(t.rgb), step(.5, t.a));
  float grain = fxN(vec2(pos.x * .006, pos.y * .3) + fxN(pos * .01) * 3.);
  col *= .95 + .08 * grain;
  // 먹선: 색이나 바탕이 바뀌는 곳
  vec4 c0 = fxTex(vUv);
  float e = 0.;
  for (int i = 0; i < 4; i++) {
    float an = float(i) * .785398;
    vec2 o = vec2(cos(an), sin(an)) * 1.7 * uDpr / uRes;
    vec4 a = fxTex(vUv + o), b = fxTex(vUv - o);
    e = max(e, length(a.rgb * a.a - b.rgb * b.a) + abs(a.a - b.a));
  }
  float line = smoothstep(.22, .4, e) * (.7 + .3 * fxN(pos * .08));
  col = mix(col, uPal[1], line);
  // 화지 섬유
  col *= .96 + .06 * fxN(pos * .35);
  float fiber = 1. - smoothstep(0., .04, abs(fxN(pos * vec2(.02, .09) + 9.) - .5));
  col = mix(col, col * .9, fiber * .25);
  gl_FragColor = vec4(clamp(col, 0., 1.), 1.);
}`;

const WATERCOLOR = /* glsl */ `
vec3 fxBack(vec2 uv) {
  vec2 P = fxP(uv);
  float wash = smoothstep(.8, .15, length(P * vec2(.8, 1.)) + (fxFbm(P * 3.) - .5) * .5);
  return mix(uBgA, uBgB, wash * .4);
}
void main() {
  vec2 pos = vUv * uRes / uDpr;
  vec2 wob = (vec2(fxN(pos * .025), fxN(pos * .025 + 7.)) - .5) * 4. * uDpr / uRes;
  vec3 bg = fxBack(vUv);
  vec4 t = fxTex(vUv + wob);
  vec3 c = mix(bg, t.rgb, t.a);
  vec3 blur = vec3(0.);
  for (int i = 0; i < 8; i++) {
    float an = float(i) * .785398;
    vec2 o = vec2(cos(an), sin(an)) * 5. * uDpr / uRes;
    blur += fxOver(vUv + wob + o, bg);
  }
  blur /= 8.;
  // 물감이 가장자리로 밀려 고인다
  float pool = smoothstep(.03, .2, length(c - blur));
  c = mix(c, floor(c * 7. + .5) / 7., .5);
  c = max(c, vec3(.16));
  vec3 pig = mix(uBgA, c, .8);
  pig *= 1. - pool * .38;
  float gran = fxFbm(pos * .09);
  pig *= 1. - (1. - fxL(pig)) * (gran - .5) * .4;
  // 밝은 곳은 칠하지 않고 종이를 남긴다
  pig = mix(pig, uBgA, smoothstep(.82, .96, fxL(c)) * .75);
  pig *= .95 + .08 * fxN(pos * .3);
  // 연필 밑그림
  float sketch = fxRim(vUv + wob * .3, 1.4 * uDpr) * (.5 + .5 * fxN(pos * .2));
  pig = mix(pig, vec3(.35, .34, .36), sketch * .45);
  gl_FragColor = vec4(clamp(pig, 0., 1.), 1.);
}`;

const SHADERS = { collage: COLLAGE, munch: MUNCH, warhol: WARHOL, dabs: DABS, klimt: KLIMT, cubism: CUBISM, ukiyoe: UKIYOE, watercolor: WATERCOLOR };

export const PAINT_TYPES = Object.keys(SHADERS);

/** 명화 필터 조각 셰이더. common은 filters.js의 공통 머리 */
export function paintShader(type, common) {
  return `${common}\n${HEAD}\n${SHADERS[type]}`;
}
