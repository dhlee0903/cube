import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, NormalBlending, Points,
  ShaderMaterial,
} from 'three';

// 입자 하나의 모양. 두 입자계가 같이 쓴다.
//   glow    가운데가 밝고 번지는 빛(불씨, 반딧불, 별, 불꽃)
//   bubble  속이 빈 거품
//   dot     또렷한 점(눈, 모래, 물방울, 잉크)
//   streak  길쭉한 조각이 돌면서(색종이, 스프링클, 나뭇잎)
const SHAPES = { glow: 0, bubble: 1, dot: 2, streak: 3 };

const SHAPE_FRAGMENT = /* glsl */ `
uniform float uOpacity;
varying vec3 vColor;
varying float vAlpha;
varying float vSpin;

void main() {
  vec2 c = gl_PointCoord - .5;
  float r = length(c);
#if SHAPE == 0
  float a = pow(1. - smoothstep(0., .5, r), 1.6);
#elif SHAPE == 1
  float a = (1. - smoothstep(.44, .5, r)) * mix(.15, 1., smoothstep(.3, .46, r));
  a += (1. - smoothstep(0., .1, length(c - vec2(-.16, .16)))) * .8;
#elif SHAPE == 2
  float a = 1. - smoothstep(.3, .5, r);
#else
  vec2 q = mat2(cos(vSpin), -sin(vSpin), sin(vSpin), cos(vSpin)) * c;
  float a = 1. - smoothstep(.3, .45, length(q * vec2(1., 3.2)));
#endif
  a *= vAlpha * uOpacity;
  if (a < .01) discard;
  gl_FragColor = vec4(vColor, a);
  #include <colorspace_fragment>
}
`;

const MODES = { rise: 0, fall: 1, float: 2, wind: 3, orbit: 4 };

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
#else
  float a = t * .06;
  p.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * b.xz;
  fade = .55 + .45 * sin(uTime * (.6 + aRand.x * 2.4) + ph * 3.);
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
