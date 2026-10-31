import {
  AdditiveBlending, Box3, CanvasTexture, Color, DirectionalLight, DynamicDrawUsage, Euler, ExtrudeGeometry,
  HemisphereLight, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicMaterial, MeshStandardMaterial,
  NormalBlending, PMREMGenerator, PerspectiveCamera, PlaneGeometry, Quaternion, Raycaster, Scene, Shape,
  ShapeGeometry, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FACES, layerOf } from './cube.js';
import { MOVING, wear } from './surfaces.js';
import { Ambient, Burst } from './particles.js';
import { MOTIONS } from './motions.js';

const BODY = 0.96;
const SIZE = 3; // 몇 칸이든 화면에서는 같은 크기로 보이게
const FOV = 30;
const QUARTER = Math.PI / 2;
const AXES = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];
const ONE = new Vector3(1, 1, 1);

// 조각 모양. 테마가 form으로 덮어쓴다.
//   bevel   몸통 모서리 둥글기
//   size    스티커 한 변
//   radius  스티커 모서리 둥글기(size/2면 동그라미)
//   depth   스티커 두께. 0이면 납작한 스티커, 크면 솟아오른 타일
const FORM = { bevel: 0.08, size: 0.8, radius: 0.09, depth: 0 };

// 조명. 테마가 lights로 덮어쓴다. [색, 세기, 위치]
const LIGHTS = {
  sky: '#ffffff',
  ground: '#888888',
  hemi: 2.3,
  key: ['#ffffff', 1.9, [-3, 6, 5]],
  fill: ['#ffffff', 0.45, [5, -2, 4]],
  rim: ['#ffffff', 0, [2, 3, -6]],
};

const easeOut = (k) => 1 - (1 - k) ** 3;

function roundedSquare(size, r) {
  const h = size / 2;
  r = Math.min(r, h - 1e-4);
  const s = new Shape();
  s.moveTo(-h + r, -h);
  s.lineTo(h - r, -h);
  s.absarc(h - r, -h + r, r, -QUARTER, 0);
  s.lineTo(h, h - r);
  s.absarc(h - r, h - r, r, 0, QUARTER);
  s.lineTo(-h + r, h);
  s.absarc(-h + r, h - r, r, QUARTER, Math.PI);
  s.lineTo(-h, -h + r);
  s.absarc(-h + r, -h + r, r, Math.PI, Math.PI * 1.5);
  return s;
}

/** 스티커 둘레로 번지는 빛(또는 그림자). 흰색 알파만 그려 두고 색은 재질이 입힌다. */
function haloTexture(size, radius, shadow) {
  const px = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(px, px);
  const half = (size * 1.5) / 2;
  const b = size / 2;
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const qx = Math.abs(((x + 0.5) / px) * 2 - 1) * half - b + radius;
      const qy = Math.abs(((y + 0.5) / px) * 2 - 1) * half - b + radius;
      const sd = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
      const a = shadow
        ? (sd > 0 ? Math.exp(-sd / 0.03) * 0.9 : 0.9)
        : (sd > 0 ? Math.exp(-sd / 0.07) * 0.8 : 0.22 + 0.58 * Math.exp(sd / 0.045));
      const i = (y * px + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return new CanvasTexture(canvas);
}

export class CubeView {
  constructor(host, { onMove, onGrab }) {
    this.host = host;
    this.onMove = onMove;
    this.onGrab = onGrab;
    this.still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    host.appendChild(this.renderer.domElement);

    this.scene = new Scene();
    this.camera = new PerspectiveCamera(FOV, 1, 0.1, 100);
    this.raycaster = new Raycaster();

    // 카메라는 가만히 두고 큐브를 돌린다. 빛이 늘 같은 쪽에서 들어온다.
    // 좌우로는 세로축, 위아래로는 가로축으로만 돌려서 큐브가 비스듬히 눕지 않게 한다.
    this.root = new Group();
    this.yaw = -0.7;
    this.pitch = 0.45;
    this.root.quaternion.setFromEuler(new Euler(this.pitch, this.yaw, 0));
    this.scene.add(this.root);

    this.hemi = new HemisphereLight();
    this.key = new DirectionalLight();
    this.fill = new DirectionalLight();
    this.rim = new DirectionalLight();
    this.scene.add(this.hemi, this.key, this.fill, this.rim);
    this.lightBase = { hemi: 0, key: 0, fill: 0, rim: 0 };
    this.flicker = null;
    this.strike = 0;

    // 질감 셰이더가 같이 쓰는 값
    this.uniforms = {
      uTime: { value: 0 },
      uIntro: { value: 10 },
      uFlash: { value: 0 },
      uCharge: { value: 0 },
      uBlink: { value: 0 },
      uPointer: { value: new Vector3(0, 0, -20) },
      uBodyGlow: { value: new Color(0, 0, 0) },
      uSticker: { value: new Vector2(0.4, 0.09) },
    };
    this.themeAt = 0;

    this.bodyMat = new MeshStandardMaterial({ roughness: 0.55 });
    wear(this.bodyMat, 'body', this.uniforms);
    this.faceMats = FACES.map((_, s) => {
      const m = new MeshStandardMaterial({
        roughness: 0.32,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      wear(m, 'sticker', this.uniforms, s);
      return m;
    });
    this.haloMats = FACES.map(() => new MeshBasicMaterial({ transparent: true, depthWrite: false }));
    this.shape(FORM, 'glow');

    this.ambients = [new Ambient(this.uniforms.uTime), new Ambient(this.uniforms.uTime)];
    this.burst = new Burst();
    this.scene.add(...this.ambients.map((a) => a.points), this.burst.points);

    this.meshes = [];
    this.tweens = [];
    this.frame = 0;
    this.last = 0;
    this.moving = false;
    this.motion = MOTIONS.smooth;
    this.swell = 0; // 다 맞췄을 때 한 번 부푸는 정도
    this.pulse = false; // 심장처럼 뛰는 테마
    this.jitter = false; // 가끔 화면이 튀는 테마
    this.glitchAt = -1;
    this.drag = null;
    this.turning = false; // 손으로 돌리는 중이거나 놓고 나서 제자리로 가는 중
    this.locked = false; // 섞기·맞추기가 도는 중
    this.m = new Matrix4();

    this.tick = this.tick.bind(this);
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    this.listen();
  }

  /** 조각 모양을 만든다. 테마마다 몸통 모서리, 스티커 크기·둥글기·두께가 다르다. */
  shape(form, haloMode) {
    const f = { ...FORM, ...form };
    const key = JSON.stringify([f, haloMode]);
    if (key === this.formKey) return false;
    this.formKey = key;
    for (const g of [this.bodyGeo, this.stickerGeo, this.haloGeo]) g?.dispose();
    this.haloTex?.dispose();

    this.bodyGeo = new RoundedBoxGeometry(BODY, BODY, BODY, 3, f.bevel);
    let lift = 0.002;
    if (f.depth > 0) {
      // 솟아오른 타일: 모서리를 깎은 만큼 바닥 모양을 줄여서 겉에서 본 크기가 size가 되게
      const bevel = Math.min(f.depth * 0.8, f.size * 0.08);
      this.stickerGeo = new ExtrudeGeometry(roundedSquare(f.size - bevel * 2, Math.max(0.005, f.radius - bevel)), {
        depth: f.depth,
        bevelEnabled: true,
        bevelThickness: bevel,
        bevelSize: bevel,
        bevelSegments: 4,
        curveSegments: 10,
      });
      this.stickerGeo.translate(0, 0, bevel);
      lift += f.depth + bevel * 2;
    } else {
      this.stickerGeo = new ShapeGeometry(roundedSquare(f.size, f.radius), 8);
      lift += 0;
    }
    this.uniforms.uSticker.value.set(f.size / 2, Math.min(f.radius, f.size / 2));
    this.haloGeo = new PlaneGeometry(f.size * 1.5, f.size * 1.5);
    const shadow = haloMode === 'shadow';
    this.haloTex = haloTexture(f.size, f.radius, shadow);
    for (const m of this.haloMats) {
      m.map = this.haloTex;
      m.blending = shadow ? NormalBlending : AdditiveBlending;
      m.needsUpdate = true;
    }

    // 조각 기준으로 스티커와 빛번짐이 놓이는 자리. 그림자는 스티커 밑, 빛은 스티커 위
    const at = (s, offset, slide = 0) => {
      const normal = new Vector3(...FACES[s]);
      const q = new Quaternion().setFromUnitVectors(AXES[2], normal);
      const p = normal.clone().multiplyScalar(BODY / 2 + offset);
      if (slide) p.add(new Vector3(0.025, -0.035, 0).applyQuaternion(q));
      return new Matrix4().compose(p, q, ONE);
    };
    this.stickerAt = FACES.map((_, s) => at(s, f.depth > 0 ? 0.001 : 0.002));
    this.haloAt = FACES.map((_, s) => (shadow ? at(s, 0.0012, 1) : at(s, lift + 0.004)));
    return true;
  }

  // ---- 조각 ----

  setCube(cube) {
    for (const mesh of this.meshes) {
      this.root.remove(mesh);
      if (mesh.geometry !== this.haloGeo) mesh.geometry.dispose();
      mesh.dispose();
    }
    this.cube = cube;
    this.breathe(performance.now() / 1000);

    // 조각마다 난수를 하나씩 줘서 무늬가 똑같이 반복되지 않게
    const seeded = (geometry, count) => {
      const g = geometry.clone();
      g.setAttribute('aSeed', new InstancedBufferAttribute(Float32Array.from({ length: count }, Math.random), 1));
      return g;
    };
    const instanced = (geometry, material, count) => {
      const mesh = new InstancedMesh(geometry, material, count);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      this.root.add(mesh);
      this.meshes.push(mesh);
      return mesh;
    };

    const count = cube.cubies.length;
    this.meshes = [];
    this.bodyMesh = instanced(seeded(this.bodyGeo, count), this.bodyMat, count);
    this.slots = FACES.map(() => []);
    cube.cubies.forEach((piece, i) => {
      for (const s of piece.stickers) this.slots[s].push(i);
    });
    this.stickerMeshes = this.slots.map((list, s) => instanced(seeded(this.stickerGeo, list.length), this.faceMats[s], list.length));
    this.haloMeshes = this.slots.map((list, s) => {
      const mesh = instanced(this.haloGeo, this.haloMats[s], list.length);
      mesh.renderOrder = 1;
      mesh.visible = this.haloOn ?? false;
      return mesh;
    });

    this.base = cube.cubies.map(() => ({ pos: new Vector3(), quat: new Quaternion() }));
    this.now = cube.cubies.map(() => ({ pos: new Vector3(), quat: new Quaternion() }));
    this.pieceMats = cube.cubies.map(() => new Matrix4());
    this.sync();
  }

  /** 지금 자세(this.now)를 인스턴스 행렬로 옮긴다. */
  place() {
    const { m, pieceMats } = this;
    this.now.forEach((p, i) => {
      pieceMats[i].compose(p.pos, p.quat, ONE);
      this.bodyMesh.setMatrixAt(i, pieceMats[i]);
    });
    this.bodyMesh.instanceMatrix.needsUpdate = true;
    this.slots.forEach((list, s) => {
      const sticker = this.stickerMeshes[s];
      const halo = this.haloMeshes[s];
      list.forEach((piece, k) => {
        sticker.setMatrixAt(k, m.multiplyMatrices(pieceMats[piece], this.stickerAt[s]));
        if (halo.visible) halo.setMatrixAt(k, m.multiplyMatrices(pieceMats[piece], this.haloAt[s]));
      });
      sticker.instanceMatrix.needsUpdate = true;
      if (halo.visible) halo.instanceMatrix.needsUpdate = true;
    });
    this.invalidate();
  }

  /** 상태에 맞춰 조각을 제자리에 놓는다. 회전이 끝날 때마다 부른다. */
  sync() {
    const m = new Matrix4();
    this.cube.cubies.forEach((piece, i) => {
      const r = piece.rot;
      const b = this.base[i];
      b.pos.set(piece.pos[0] / 2, piece.pos[1] / 2, piece.pos[2] / 2);
      m.set(r[0], r[1], r[2], 0, r[3], r[4], r[5], 0, r[6], r[7], r[8], 0, 0, 0, 0, 1);
      b.quat.setFromRotationMatrix(m);
      this.now[i].pos.copy(b.pos);
      this.now[i].quat.copy(b.quat);
    });
    this.place();
  }

  /** axis 축의 층마다 angles[층]만큼 돌린 모습으로 놓는다. */
  pose(axis, angles) {
    const q = new Quaternion();
    const { n } = this.cube;
    this.cube.cubies.forEach((piece, i) => {
      const b = this.base[i];
      q.setFromAxisAngle(AXES[axis], angles[layerOf(n, piece.pos[axis])] || 0);
      this.now[i].pos.copy(b.pos).applyQuaternion(q);
      this.now[i].quat.copy(q).multiply(b.quat);
    });
    this.place();
  }

  /** 같은 축의 여러 층을 한꺼번에 돌린다. 상태 반영은 부른 쪽이 한다. */
  turn(step, ms) {
    const target = new Array(this.cube.n).fill(0);
    let longest = 1;
    for (const { layer, turns } of step) {
      const q = turns === 3 ? -1 : turns;
      target[layer] = q * QUARTER;
      longest = Math.max(longest, Math.abs(q));
    }
    const angles = target.slice();
    const { axis } = step[0];
    const { ease, time } = this.motion;
    return this.tween((longest === 2 ? ms * 1.5 : ms) * time, (k) => {
      const e = ease(k);
      for (let i = 0; i < target.length; i++) angles[i] = target[i] * e;
      this.pose(axis, angles);
    }).then(() => {
      for (const { layer } of step) this.spray(axis, layer, 4, 0.6);
    });
  }

  /** 다음에 돌릴 층을 그 방향으로 두 번 살짝 밀었다 놓는다. */
  nudge({ axis, layer, turns }) {
    const dir = turns === 3 ? -1 : 1;
    const angles = [];
    this.turning = true;
    return this.tween(1000, (k) => {
      angles[layer] = dir * 0.3 * Math.sin(Math.PI * ((k * 2) % 1));
      this.pose(axis, angles);
    }).then(() => {
      this.turning = false;
      this.sync();
    });
  }

  // ---- 테마 ----

  setTheme(theme) {
    const { body, sticker = {}, glow = 0, light = 1, halo = 0 } = theme;
    const surface = theme.surface ?? 'plain';
    if (this.shape(theme.form, theme.haloMode) && this.cube) this.setCube(this.cube);

    this.bodyMat.color.set(body.color);
    this.bodyMat.roughness = body.roughness ?? 0.55;
    this.bodyMat.metalness = body.metalness ?? 0;
    this.uniforms.uBodyGlow.value.set(body.glow ?? '#000000');
    const glows = theme.faces.map((_, i) => (Array.isArray(glow) ? glow[i] : glow));
    const brightest = Math.max(...glows) || 1;
    const shadow = theme.haloMode === 'shadow';
    theme.faces.forEach((c, i) => {
      const m = this.faceMats[i];
      m.color.set(c);
      m.emissive.set(c);
      m.emissiveIntensity = glows[i];
      m.roughness = sticker.roughness ?? 0.32;
      m.metalness = sticker.metalness ?? 0;
      this.haloMats[i].color.set(shadow ? '#000000' : c);
      this.haloMats[i].opacity = Array.isArray(glow) ? (halo * glows[i]) / brightest : halo;
    });
    for (const m of [this.bodyMat, ...this.faceMats]) {
      if (m.userData.surface === surface) continue;
      m.userData.surface = surface;
      m.needsUpdate = true;
    }
    this.haloOn = halo > 0;
    for (const mesh of this.haloMeshes ?? []) mesh.visible = this.haloOn;

    // 조명
    const L = { ...LIGHTS, ...theme.lights };
    this.hemi.color.set(L.sky);
    this.hemi.groundColor.set(L.ground);
    this.lightBase.hemi = L.hemi * light;
    for (const name of ['key', 'fill', 'rim']) {
      const [color, intensity, pos] = L[name];
      this[name].color.set(color);
      this[name].position.set(...pos);
      this.lightBase[name] = intensity * light;
    }
    this.flicker = this.still ? null : theme.flicker ?? null;
    this.lit(0);
    this.scene.environment = theme.env ? this.room() : null;
    this.scene.environmentIntensity = theme.env ?? 0;

    this.motion = MOTIONS[theme.motion] ?? MOTIONS.smooth;
    this.pulse = !this.still && Boolean(theme.pulse);
    this.jitter = !this.still && Boolean(theme.jitter);
    this.root.position.set(0, 0, 0);
    const ambient = [].concat(theme.ambient ?? []);
    this.ambients.forEach((a, i) => a.set(this.still ? null : ambient[i], theme.faces));
    this.burst.set(this.still ? null : theme.burst, theme.faces);
    this.moving = !this.still && (MOVING.has(surface) || ambient.length > 0 || Boolean(this.flicker));
    this.themeAt = performance.now();
    if (this.cube) this.place();
    this.invalidate();
  }

  /** 조명 세기. 촛불, 번개, 용암처럼 일렁이는 테마는 매 프레임 바뀐다. */
  lit(seconds, dt = 0) {
    const b = this.lightBase;
    let key = 1;
    let rim = 1;
    let hemi = 1;
    switch (this.flicker) {
      case 'candle':
        key = 0.72 + 0.2 * Math.sin(seconds * 9.3) * Math.sin(seconds * 5.1 + 1) + 0.1 * Math.sin(seconds * 23.7);
        break;
      case 'lava':
        key = 0.82 + 0.18 * Math.sin(seconds * 1.4) + 0.06 * Math.sin(seconds * 4.3);
        hemi = 0.9 + 0.1 * Math.sin(seconds * 1.1);
        break;
      case 'lightning':
        // 가끔 번쩍. 두세 번 연달아 치고 빠르게 꺼진다
        if (Math.random() < dt * 0.35) this.strike = 1;
        this.strike = Math.max(0, this.strike - dt * 3.2);
        rim = 1 + this.strike * (6 + 4 * Math.sin(seconds * 70));
        key = 1 + this.strike * 2;
        this.uniforms.uCharge.value = Math.max(this.uniforms.uCharge.value, this.strike);
        break;
      case 'aurora':
        this.rim.color.setHSL(0.42 + 0.18 * (0.5 + 0.5 * Math.sin(seconds * 0.25)), 0.9, 0.6);
        rim = 0.8 + 0.4 * Math.sin(seconds * 0.6);
        break;
      default:
        break;
    }
    this.hemi.intensity = b.hemi * hemi;
    this.key.intensity = b.key * key;
    this.fill.intensity = b.fill;
    this.rim.intensity = b.rim * rim;
  }

  /** 금속이나 얼음처럼 비치는 재질이 반사할 방. 처음 쓸 때 한 번만 만든다. */
  room() {
    if (!this.envMap) {
      const pmrem = new PMREMGenerator(this.renderer);
      this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      pmrem.dispose();
    }
    return this.envMap;
  }

  // ---- 이펙트 ----

  /** 큐브 안쪽 좌표의 점에서, 안쪽 좌표의 방향으로 한 알 내보낸다. */
  emit(p, dir, power) {
    const w = p.clone().applyMatrix4(this.root.matrixWorld);
    const d = dir.clone().applyQuaternion(this.root.quaternion).normalize();
    this.burst.emit([w.x, w.y, w.z], [d.x, d.y, d.z], power);
  }

  /** 방금 돈 층의 바깥 네 면에서 튀긴다. */
  spray(axis, layer, count, power = 1) {
    this.uniforms.uCharge.value = Math.min(1, this.uniforms.uCharge.value + 0.45 * power);
    this.invalidate();
    if (!this.burst.config || this.burst.config.turns === false) return;
    this.root.updateMatrixWorld();
    const { n } = this.cube;
    const h = n / 2 + 0.03;
    const center = layer - (n - 1) / 2;
    const others = [0, 1, 2].filter((a) => a !== axis);
    const p = new Vector3();
    const d = new Vector3();
    for (let i = 0; i < count; i++) {
      const pick = Math.random() < 0.5 ? 0 : 1;
      const out = others[pick];
      const along = others[1 - pick];
      const sign = Math.random() < 0.5 ? -1 : 1;
      p.setComponent(axis, center + (Math.random() - 0.5) * 0.9);
      p.setComponent(out, sign * h);
      p.setComponent(along, (Math.random() * 2 - 1) * (n / 2));
      d.set(0, 0, 0).setComponent(out, sign);
      this.emit(p, d, power);
    }
    this.invalidate();
  }

  /** 다 맞췄을 때. 겉면 전체에서 터지고, 스티커가 한 번 번쩍, 큐브가 한 번 부푼다. */
  celebrate(strength = 1) {
    this.uniforms.uFlash.value = 0.8 * strength;
    if (this.burst.config) {
      this.root.updateMatrixWorld();
      const { n } = this.cube;
      const h = n / 2 + 0.03;
      const p = new Vector3();
      const d = new Vector3();
      for (let i = 0; i < Math.round(240 * strength); i++) {
        const face = Math.floor(Math.random() * 6);
        const axis = face >> 1;
        const sign = face % 2 ? -1 : 1;
        for (let a = 0; a < 3; a++) p.setComponent(a, a === axis ? sign * h : (Math.random() * 2 - 1) * (n / 2));
        d.set(0, 0, 0).setComponent(axis, sign);
        this.emit(p, d, 1.6);
      }
    }
    if (!this.still) {
      this.tween(650, (k) => {
        this.swell = 0.07 * Math.sin(Math.PI * k) * (1 - k * 0.3);
      }).then(() => {
        this.swell = 0;
      });
    }
    this.invalidate();
  }

  /** 크기는 매 프레임 여기서 정한다. 부풂과 박동을 더한다. */
  breathe(seconds) {
    let s = 1 + this.swell;
    if (this.pulse) {
      const t = (seconds * 1.15) % 1;
      s += 0.018 * (Math.exp(-(((t - 0.08) / 0.035) ** 2)) + 0.6 * Math.exp(-(((t - 0.26) / 0.045) ** 2)));
    }
    this.root.scale.setScalar((SIZE / (this.cube?.n ?? 3)) * s);
    if (this.jitter) {
      // 70ms마다 주사위를 굴려 가끔 한두 프레임 옆으로 튄다
      const slot = Math.floor(seconds * 14);
      if (slot !== this.glitchAt) {
        this.glitchAt = slot;
        const hit = Math.random() < 0.06;
        this.root.position.set(hit ? (Math.random() - 0.5) * 0.18 : 0, hit ? (Math.random() - 0.5) * 0.06 : 0, 0);
      }
    }
  }

  // ---- 그리기 ----

  tween(duration, update) {
    return new Promise((resolve) => {
      this.tweens.push({ start: performance.now(), duration, update, resolve });
      this.invalidate();
    });
  }

  invalidate() {
    if (!this.frame) this.frame = requestAnimationFrame(this.tick);
  }

  tick(now) {
    this.frame = 0;
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0;
    this.last = now;
    if (!this.still) this.uniforms.uTime.value = now / 1000;

    const finished = [];
    this.tweens = this.tweens.filter((t) => {
      const k = Math.min(1, Math.max(0, (now - t.start) / t.duration));
      t.update(k);
      if (k < 1) return true;
      finished.push(t);
      return false;
    });
    const u = this.uniforms;
    u.uIntro.value = (now - this.themeAt) / 1000;
    if (u.uFlash.value > 0) u.uFlash.value = Math.max(0, u.uFlash.value - dt * 1.4);
    if (u.uCharge.value > 0) u.uCharge.value = Math.max(0, u.uCharge.value - dt * 0.9);
    if (u.uBlink.value > 0) u.uBlink.value = Math.max(0, u.uBlink.value - dt * 2.2);
    const settling = u.uFlash.value > 0 || u.uCharge.value > 0 || u.uBlink.value > 0;
    const bursting = this.burst.update(dt);
    this.lit(now / 1000, dt);
    this.breathe(now / 1000);

    this.renderer.render(this.scene, this.camera);
    if (this.tweens.length || this.moving || bursting || settling) this.invalidate();
    else this.last = 0;
    for (const t of finished) t.resolve();
  }

  resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    const v = (FOV * Math.PI) / 180;
    const across = 2 * Math.atan(Math.tan(v / 2) * this.camera.aspect);
    // 어느 쪽으로 돌려도 모서리가 잘리지 않을 만큼 물러선다
    const distance = (SIZE * 0.95) / Math.sin(Math.min(v, across) / 2);
    this.camera.position.set(0, 0, distance);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();

    // 입자 크기(월드 단위)를 화면 픽셀로 바꾸는 비율, 입자가 떠다닐 범위
    const scale = (h * this.renderer.getPixelRatio()) / (2 * Math.tan(v / 2));
    this.burst.setScale(scale);
    const halfH = distance * Math.tan(v / 2);
    for (const a of this.ambients) {
      a.material.uniforms.uScale.value = scale;
      a.setSpan(halfH * this.camera.aspect * 1.05, halfH * 1.05);
    }
    this.invalidate();
  }

  // ---- 입력 ----

  listen() {
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.up(e));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    // 눈 달린 테마가 손가락·마우스를 쳐다볼 수 있게, 가리키는 곳을 시점 공간으로 넘긴다
    window.addEventListener('pointermove', (e) => this.look(e), { passive: true });
    window.addEventListener('pointerdown', (e) => this.look(e), { passive: true });
  }

  look(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    if (!r.width) return;
    const ndc = new Vector3(((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2, 0.5);
    ndc.unproject(this.camera);
    const dir = ndc.sub(this.camera.position).normalize();
    // 큐브 앞쪽(z = 2) 평면과 만나는 점
    const t = (2 - this.camera.position.z) / dir.z;
    const p = this.camera.position.clone().addScaledVector(dir, t);
    this.uniforms.uPointer.value.copy(p.applyMatrix4(this.camera.matrixWorldInverse));
  }

  point(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  down(e) {
    if (this.drag || e.button === 1) return;
    const [x, y] = this.point(e);
    // 오른쪽 버튼은 큐브 위에서도 전체 돌리기
    const hit = this.locked || this.turning || e.button === 2 ? null : this.pick(x, y);
    this.drag = { id: e.pointerId, x0: x, y0: y, x, y, hit, mode: hit ? 'pending' : 'orbit' };
    this.renderer.domElement.setPointerCapture(e.pointerId);
  }

  move(e) {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    const [x, y] = this.point(e);
    if (d.mode === 'orbit') this.orbit(x - d.x, y - d.y);
    if (d.mode === 'pending' && Math.hypot(x - d.x0, y - d.y0) > 6) this.grab(d, x - d.x0, y - d.y0);
    if (d.mode === 'turn') this.follow(d, x - d.x0, y - d.y0, e.timeStamp);
    d.x = x;
    d.y = y;
  }

  up(e) {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    this.drag = null;
    if (d.mode === 'turn') this.release(d, e.timeStamp);
  }

  orbit(dx, dy) {
    const speed = 2.6 / Math.min(this.width, this.height);
    this.yaw += dx * speed;
    this.pitch = Math.min(QUARTER, Math.max(-QUARTER, this.pitch + dy * speed));
    this.root.quaternion.setFromEuler(new Euler(this.pitch, this.yaw, 0));
    this.invalidate();
  }

  /** 화면 좌표에서 큐브 겉면의 어디를 짚었는지. 큐브 안쪽 좌표로 돌려준다. */
  pick(x, y) {
    this.root.updateMatrixWorld();
    this.raycaster.setFromCamera(new Vector2((x / this.width) * 2 - 1, 1 - (y / this.height) * 2), this.camera);
    const ray = this.raycaster.ray.clone().applyMatrix4(this.root.matrixWorld.clone().invert());
    const h = this.cube.n / 2;
    const point = ray.intersectBox(new Box3(new Vector3(-h, -h, -h), new Vector3(h, h, h)), new Vector3());
    if (!point) return null;
    let normal = 0;
    for (let a = 1; a < 3; a++) {
      if (Math.abs(point.getComponent(a)) > Math.abs(point.getComponent(normal))) normal = a;
    }
    return { point, normal, sign: Math.sign(point.getComponent(normal)) };
  }

  toScreen(p) {
    const v = p.clone().applyMatrix4(this.root.matrixWorld).project(this.camera);
    return [((v.x + 1) / 2) * this.width, ((1 - v.y) / 2) * this.height];
  }

  /** 처음 민 방향을 보고 어느 층을 어느 축으로 돌릴지 정한다. */
  grab(d, dx, dy) {
    if (this.locked) {
      d.mode = 'orbit';
      return;
    }
    const { point, normal, sign } = d.hit;
    const [sx, sy] = this.toScreen(point);
    const length = Math.hypot(dx, dy);
    let best = null;
    for (let a = 0; a < 3; a++) {
      if (a === normal) continue;
      const tip = point.clone().setComponent(a, point.getComponent(a) + 0.5);
      const [tx, ty] = this.toScreen(tip);
      const l = Math.hypot(tx - sx, ty - sy) || 1;
      const ux = (tx - sx) / l;
      const uy = (ty - sy) / l;
      const dot = (dx * ux + dy * uy) / length;
      if (!best || Math.abs(dot) > Math.abs(best.dot)) best = { a, ux, uy, dot };
    }
    // 면의 법선 N 위에서 A 쪽으로 밀면 N×A 축으로 돈다.
    // 단위축끼리의 외적이라 남은 축 하나에 부호만 붙는다.
    const axis = 3 - normal - best.a;
    const cross = (best.a - normal + 3) % 3 === 1 ? 1 : -1;
    const { n } = this.cube;
    Object.assign(d, {
      mode: 'turn',
      axis,
      layer: Math.min(n - 1, Math.max(0, Math.floor(point.getComponent(axis) + n / 2))),
      sign: sign * cross,
      ux: best.ux,
      uy: best.uy,
      angle: 0,
      samples: [],
    });
    this.turning = true;
    this.uniforms.uBlink.value = 1;
    this.onGrab?.();
  }

  follow(d, dx, dy, time) {
    // 한 칸(90도)이 큐브 폭의 3분의 1쯤 밀었을 때. 손가락보다 살짝 앞서 간다.
    const v = (FOV * Math.PI) / 180;
    const perRadian = (this.height * SIZE * 0.3) / (2 * Math.tan(v / 2) * this.camera.position.z);
    d.angle = (d.sign * (dx * d.ux + dy * d.uy)) / perRadian;
    d.samples.push([time, d.angle]);
    if (d.samples.length > 5) d.samples.shift();
    const angles = [];
    // 8비트 테마는 끌 때도 칸칸이 끊어서 움직인다
    angles[d.layer] = this.motion === MOTIONS.stepped ? Math.round(d.angle / (QUARTER / 4)) * (QUARTER / 4) : d.angle;
    this.pose(d.axis, angles);
  }

  release(d, time) {
    let speed = 0;
    const s = d.samples;
    if (s.length > 1 && time - s[s.length - 1][0] < 120) {
      const dt = s[s.length - 1][0] - s[0][0];
      if (dt > 0) speed = (s[s.length - 1][1] - s[0][1]) / dt;
    }
    // 휙 튕기면 반 칸이 안 돼도 넘어간다
    let q = d.angle / QUARTER;
    if (Math.abs(speed) > 0.003) q += Math.sign(speed) * 0.4;
    const quarters = Math.round(q);
    const from = d.angle;
    const to = quarters * QUARTER;
    const angles = [];
    const { ease, time: scale } = this.motion;
    const ms = (70 + 170 * Math.min(1, Math.abs(to - from) / QUARTER)) * Math.max(0.8, scale);
    const curve = this.motion === MOTIONS.smooth ? easeOut : ease;
    this.tween(ms, (k) => {
      angles[d.layer] = from + (to - from) * curve(k);
      this.pose(d.axis, angles);
    }).then(() => {
      this.turning = false;
      const turns = ((quarters % 4) + 4) % 4;
      if (turns) {
        this.spray(d.axis, d.layer, 14 + this.cube.n * 2);
        this.onMove({ axis: d.axis, layer: d.layer, turns });
      }
      this.sync();
    });
  }
}
