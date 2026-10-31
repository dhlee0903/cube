import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, NormalBlending, Points,
  ShaderMaterial,
} from 'three';

// 입자 하나의 모양. 두 입자계가 같이 쓴다.
//   glow    가운데가 밝고 번지는 빛(불씨, 반딧불, 별, 불꽃)
//   bubble  속이 빈 거품
//   dot     또렷한 점(눈, 모래, 물방울, 잉크)
//   streak  길쭉한 조각이 돌면서(색종이, 스프링클, 나뭇잎)
//   square  네모난 픽셀
//   star    네 갈래 반짝임
//   flake   눈송이
//   leaf    나뭇잎(돌면서)
//   bat     박쥐(날갯짓)
//   bird    새(날갯짓)
//   drip    맺혀 떨어지는 방울
//   fly     파리(날개가 떨린다)
export const SHAPES = { glow: 0, bubble: 1, dot: 2, streak: 3, square: 4, star: 5, flake: 6, leaf: 7, bat: 8, bird: 9, drip: 10, fly: 11 };

const SHAPE_FRAGMENT = /* glsl */ `
uniform float uOpacity;
varying vec3 vColor;
varying float vAlpha;
varying float vSpin;

mat2 rot(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }

void main() {
  vec2 c = vec2(gl_PointCoord.x - .5, .5 - gl_PointCoord.y);
  float r = length(c);
  float flap = sin(vSpin * 5.);
#if SHAPE == 0
  float a = pow(1. - smoothstep(0., .5, r), 1.6);
#elif SHAPE == 1
  float a = (1. - smoothstep(.44, .5, r)) * mix(.15, 1., smoothstep(.3, .46, r));
  a += (1. - smoothstep(0., .1, length(c - vec2(-.16, .16)))) * .8;
#elif SHAPE == 2
  float a = 1. - smoothstep(.3, .5, r);
#elif SHAPE == 3
  vec2 q = rot(vSpin) * c;
  float a = 1. - smoothstep(.3, .45, length(q * vec2(1., 3.2)));
#elif SHAPE == 4
  float a = 1. - step(.36, max(abs(c.x), abs(c.y)));
#elif SHAPE == 5
  vec2 q = rot(.3 * sin(vSpin)) * c;
  float arm = max(exp(-abs(q.x) * 38.) * (1. - smoothstep(0., .5, abs(q.y))), exp(-abs(q.y) * 38.) * (1. - smoothstep(0., .5, abs(q.x))));
  float a = arm + pow(1. - smoothstep(0., .16, r), 2.);
#elif SHAPE == 6
  vec2 q = rot(vSpin * .3) * c;
  float d = 1.;
  for (int k = 0; k < 3; k++) {
    float an = float(k) * 1.0472;
    d = min(d, abs(dot(q, vec2(-sin(an), cos(an)))));
  }
  float a = (1. - smoothstep(.025, .05, d)) * (1. - smoothstep(.36, .44, r));
  a = max(a, 1. - smoothstep(.06, .09, r));
#elif SHAPE == 7
  vec2 q = rot(vSpin) * c;
  float lens = max(length(q - vec2(0., -.22)), length(q - vec2(0., .22))) - .42;
  float a = 1. - smoothstep(-.02, .01, lens);
  a *= 1. - .35 * (1. - smoothstep(.0, .02, abs(q.x)));
#elif SHAPE == 8
  float ax = abs(c.x);
  float top = .06 + flap * ax * .7 - ax * .12;
  float bottom = top - .17 + .06 * abs(sin(ax * 24.));
  float wing = step(.03, ax) * step(ax, .46) * step(bottom, c.y) * step(c.y, top);
  float body = 1. - smoothstep(.07, .09, length(c * vec2(1.4, 1.)));
  float ears = step(abs(abs(c.x) - .04), .02) * step(.05, c.y) * step(c.y, .12);
  float a = max(max(wing, body), ears);
#elif SHAPE == 9
  float ax = abs(c.x);
  float curve = flap * ax * .55 - ax * ax * .5 + .05;
  float a = (1. - smoothstep(.025, .045, abs(c.y - curve))) * step(ax, .44);
#elif SHAPE == 10
  vec2 q = c + vec2(0., .14);
  float ball = length(q) - .2;
  float tip = abs(c.x) - .2 * (1. - (c.y + .14) / .5);
  float d = min(ball, max(tip, -q.y));
  float a = 1. - smoothstep(-.01, .02, d);
  a *= 1. - .5 * (1. - smoothstep(0., .06, length(q - vec2(-.07, .06))));
#else
  float body = 1. - smoothstep(.09, .12, length(c * vec2(1.7, 1.)));
  float head = 1. - smoothstep(.055, .075, length(c - vec2(0., .14)));
  float wa = .55 + .45 * sin(vSpin * 50.);
  float wings = (1. - smoothstep(.1, .14, length((c - vec2(-.15, .06)) * vec2(1., 1.8 / wa))))
    + (1. - smoothstep(.1, .14, length((c - vec2(.15, .06)) * vec2(1., 1.8 / wa))));
  float a = max(max(body, head), min(1., wings) * .38);
#endif
  a *= vAlpha * uOpacity;
  if (a < .01) discard;
  gl_FragColor = vec4(vColor, a);
  #include <colorspace_fragment>
}
`;

export const MODES = { rise: 0, fall: 1, float: 2, wind: 3, orbit: 4, buzz: 5 };

const AMBIENT_VERTEX = /* glsl */ `
uniform float uTime;
uniform vec3 uSpan;
uniform float uScale;
uniform float uSize;
uniform float uSpeed;
uniform vec3 uColors[6];
uniform float uColorCount;
attribute vec4 aRand;
varying vec3 vColor;
varying float vAlpha;
varying float vSpin;

void main() {
  vec3 b = position * uSpan;
  float t = uTime * uSpeed * (.6 + aRand.x * .8);
  float ph = aRand.y * 6.2832;
  vec3 p = b;
  float fade = 1.;
#if MODE == 0
  p.y = mod(b.y + uSpan.y + t, uSpan.y * 2.) - uSpan.y;
  p.x += sin(t * 1.7 + ph) * .15;
  fade = 1. - smoothstep(uSpan.y * .55, uSpan.y, abs(p.y));
#elif MODE == 1
  p.y = uSpan.y - mod(uSpan.y - b.y + t, uSpan.y * 2.);
  p.x += sin(t * 1.3 + ph) * .3;
  p.z += cos(t * 1.1 + ph) * .2;
  fade = 1. - smoothstep(uSpan.y * .7, uSpan.y, abs(p.y));
#elif MODE == 2
  p += vec3(sin(t * .9 + ph), sin(t * .7 + ph * 1.3), cos(t * .8 + ph * .7)) * .4;
  fade = .5 + .5 * sin(uTime * (.8 + aRand.x * 1.6) + ph);
#elif MODE == 3
  p.x = mod(b.x + uSpan.x + t * 2., uSpan.x * 2.) - uSpan.x;
  p.y += sin(t * 2. + ph) * .1;
  fade = 1. - smoothstep(uSpan.x * .7, uSpan.x, abs(p.x));
#elif MODE == 4
  float a = t * .06;
  p.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * b.xz;
  fade = .55 + .45 * sin(uTime * (.6 + aRand.x * 2.4) + ph * 3.);
#else
  // 파리처럼 큐브 둘레를 정신없이 맴돈다
  vec3 home = b * vec3(.45, .45, .6);
  p = home + vec3(
    sin(t * 1.3 + ph) * 1.1 + sin(t * 4.7 + ph * 2.) * .25,
    sin(t * 1.1 + ph * 1.7) * .8 + sin(t * 5.3) * .2,
    cos(t * .9 + ph) * 1.2);
#endif
  vec4 mv = modelViewMatrix * vec4(p, 1.);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (.5 + aRand.z) * uScale / -mv.z;
  vColor = uColors[int(floor(aRand.w * uColorCount))];
  vAlpha = fade;
  vSpin = ph + t * 1.5;
}
`;

const BURST_VERTEX = /* glsl */ `
uniform float uScale;
attribute vec3 aColor;
attribute float aAlpha;
attribute float aSize;
attribute float aSpin;
varying vec3 vColor;
varying float vAlpha;
varying float vSpin;

void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / -mv.z;
  vColor = aColor;
  vAlpha = aAlpha;
  vSpin = aSpin;
}
`;

const palette = (colors, faces) => (colors === 'faces' ? faces : colors).map((c) => new Color(c));

/** 큐브 둘레에 늘 떠 있는 것들. 움직임은 전부 셰이더가 시간으로 계산한다. */
export class Ambient {
  constructor(time) {
    this.material = new ShaderMaterial({
      uniforms: {
        uTime: time,
        uSpan: { value: [4, 4, 3] },
        uScale: { value: 400 },
        uSize: { value: 0.1 },
        uSpeed: { value: 0.5 },
        uOpacity: { value: 1 },
        uColors: { value: Array.from({ length: 6 }, () => new Color()) },
        uColorCount: { value: 1 },
      },
      vertexShader: AMBIENT_VERTEX,
      fragmentShader: SHAPE_FRAGMENT,
      defines: { MODE: 0, SHAPE: 0 },
      transparent: true,
      depthWrite: false,
    });
    this.points = new Points(new BufferGeometry(), this.material);
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  set(config, faces) {
    this.points.visible = Boolean(config);
    if (!config) return;
    const { count, size, speed, opacity = 1, mode, shape, additive } = config;
    const base = new Float32Array(count * 3);
    const rand = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      for (let k = 0; k < 3; k++) base[i * 3 + k] = Math.random() * 2 - 1;
      for (let k = 0; k < 4; k++) rand[i * 4 + k] = Math.random();
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(base, 3));
    geometry.setAttribute('aRand', new BufferAttribute(rand, 4));
    this.points.geometry.dispose();
    this.points.geometry = geometry;

    const u = this.material.uniforms;
    const colors = palette(config.colors, faces);
    colors.forEach((c, i) => u.uColors.value[i].copy(c));
    u.uColorCount.value = colors.length;
    u.uSize.value = size;
    u.uSpeed.value = speed;
    u.uOpacity.value = opacity;
    this.material.defines.MODE = MODES[mode];
    this.material.defines.SHAPE = SHAPES[shape];
    this.material.blending = additive ? AdditiveBlending : NormalBlending;
    this.material.needsUpdate = true;
  }

  /** 화면에 보이는 범위(z=0 평면 기준 반폭, 반높이). */
  setSpan(x, y) {
    this.material.uniforms.uSpan.value = [x, y, 3];
  }
}

/** 돌리거나 다 맞췄을 때 튀는 것들. 몇 백 개라 CPU로 움직인다. */
export class Burst {
  constructor(capacity = 900) {
    this.capacity = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.color = new Float32Array(capacity * 3);
    this.alpha = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.spin = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.max = new Float32Array(capacity);
    this.next = 0;
    this.alive = 0;

    const geometry = new BufferGeometry();
    const attr = (array, n) => new BufferAttribute(array, n).setUsage(DynamicDrawUsage);
    geometry.setAttribute('position', attr(this.pos, 3));
    geometry.setAttribute('aColor', attr(this.color, 3));
    geometry.setAttribute('aAlpha', attr(this.alpha, 1));
    geometry.setAttribute('aSize', attr(this.size, 1));
    geometry.setAttribute('aSpin', attr(this.spin, 1));
    this.material = new ShaderMaterial({
      uniforms: { uScale: { value: 400 }, uOpacity: { value: 1 } },
      vertexShader: BURST_VERTEX,
      fragmentShader: SHAPE_FRAGMENT,
      defines: { SHAPE: 0 },
      transparent: true,
      depthWrite: false,
    });
    this.points = new Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.config = null;
  }

  set(config, faces) {
    this.config = config;
    this.colors = config ? palette(config.colors, faces) : [];
    if (!config) return;
    this.material.defines.SHAPE = SHAPES[config.shape];
    this.material.blending = config.additive ? AdditiveBlending : NormalBlending;
    this.material.uniforms.uOpacity.value = config.opacity ?? 1;
    this.material.needsUpdate = true;
  }

  /** 한 알 내보낸다. p, dir은 월드 좌표, dir은 단위 벡터. */
  emit(p, dir, power = 1) {
    const c = this.config;
    if (!c) return;
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    const speed = c.speed * (0.4 + Math.random() * 0.8) * power;
    for (let k = 0; k < 3; k++) {
      this.pos[i * 3 + k] = p[k];
      this.vel[i * 3 + k] = dir[k] * speed + (Math.random() - 0.5) * c.speed * 0.5;
    }
    const color = this.colors[Math.floor(Math.random() * this.colors.length)];
    this.color[i * 3] = color.r;
    this.color[i * 3 + 1] = color.g;
    this.color[i * 3 + 2] = color.b;
    this.size[i] = c.size * (0.6 + Math.random() * 0.8);
    this.spin[i] = Math.random() * 6.28;
    this.max[i] = c.life * (0.6 + Math.random() * 0.8);
    this.life[i] = this.max[i];
    this.alive = Math.min(this.capacity, this.alive + 1);
  }

  /** dt초만큼 움직인다. 살아 있는 게 하나라도 있으면 true. */
  update(dt) {
    if (!this.alive) return false;
    const { gravity = 0, drag = 1 } = this.config ?? {};
    const damp = Math.exp(-drag * dt);
    let alive = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      alive++;
      this.vel[i * 3 + 1] += gravity * dt;
      for (let k = 0; k < 3; k++) {
        this.vel[i * 3 + k] *= damp;
        this.pos[i * 3 + k] += this.vel[i * 3 + k] * dt;
      }
      const k = this.life[i] / this.max[i];
      this.alpha[i] = Math.min(1, k * 2.5);
      this.spin[i] += dt * 6;
    }
    this.alive = alive;
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = true;
    a.aAlpha.needsUpdate = true;
    a.aColor.needsUpdate = true;
    a.aSize.needsUpdate = true;
    a.aSpin.needsUpdate = true;
    return alive > 0;
  }

  setScale(scale) {
    this.material.uniforms.uScale.value = scale;
  }
}
