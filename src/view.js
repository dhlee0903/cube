import {
  Box3, DirectionalLight, Euler, Group, HemisphereLight, Matrix4, Mesh, MeshStandardMaterial,
  PMREMGenerator, PerspectiveCamera, Quaternion, Raycaster, Scene, Shape, ShapeGeometry, Vector2, Vector3,
  WebGLRenderer,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FACES, layerOf } from './cube.js';

const BODY = 0.96;
const STICKER = 0.8;
const SIZE = 3; // 몇 칸이든 화면에서는 같은 크기로 보이게
const FOV = 30;
const QUARTER = Math.PI / 2;
const AXES = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];

const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
const easeOut = (k) => 1 - (1 - k) ** 3;

function roundedSquare(size, r) {
  const h = size / 2;
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
  return new ShapeGeometry(s, 6);
}

export class CubeView {
  constructor(host, { onMove, onGrab }) {
    this.host = host;
    this.onMove = onMove;
    this.onGrab = onGrab;

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

    this.hemi = new HemisphereLight(0xffffff, 0x888888, 2.3);
    this.key = new DirectionalLight(0xffffff, 1.9);
    this.key.position.set(-3, 6, 5);
    this.fill = new DirectionalLight(0xffffff, 0.45);
    this.fill.position.set(5, -2, 4);
    this.scene.add(this.hemi, this.key, this.fill);

    this.bodyGeo = new RoundedBoxGeometry(BODY, BODY, BODY, 3, 0.08);
    this.stickerGeo = roundedSquare(STICKER, 0.09);
    this.bodyMat = new MeshStandardMaterial({ roughness: 0.55 });
    this.faceMats = FACES.map(() => new MeshStandardMaterial({
      roughness: 0.32,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }));

    this.pieces = [];
    this.base = [];
    this.tweens = [];
    this.frame = 0;
    this.drag = null;
    this.turning = false; // 손으로 돌리는 중이거나 놓고 나서 제자리로 가는 중
    this.locked = false; // 섞기·맞추기가 도는 중

    this.tick = this.tick.bind(this);
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    this.listen();
  }

  setCube(cube) {
    for (const p of this.pieces) this.root.remove(p);
    this.cube = cube;
    this.root.scale.setScalar(SIZE / cube.n);
    this.pieces = cube.cubies.map((piece) => {
      const group = new Group();
      group.add(new Mesh(this.bodyGeo, this.bodyMat));
      for (const s of piece.stickers) {
        const normal = new Vector3(...FACES[s]);
        const sticker = new Mesh(this.stickerGeo, this.faceMats[s]);
        sticker.quaternion.setFromUnitVectors(AXES[2], normal);
        sticker.position.copy(normal).multiplyScalar(BODY / 2 + 0.002);
        group.add(sticker);
      }
      this.root.add(group);
      return group;
    });
    this.base = this.pieces.map(() => ({ pos: new Vector3(), quat: new Quaternion() }));
    this.sync();
  }

  setTheme(theme) {
    const { body, sticker = {}, glow = 0, light = 1 } = theme;
    this.bodyMat.color.set(body.color);
    this.bodyMat.roughness = body.roughness ?? 0.55;
    this.bodyMat.metalness = body.metalness ?? 0;
    theme.faces.forEach((c, i) => {
      const m = this.faceMats[i];
      m.color.set(c);
      m.emissive.set(c);
      m.emissiveIntensity = Array.isArray(glow) ? glow[i] : glow;
      m.roughness = sticker.roughness ?? 0.32;
      m.metalness = sticker.metalness ?? 0;
    });
    this.hemi.intensity = 2.3 * light;
    this.key.intensity = 1.9 * light;
    this.fill.intensity = 0.45 * light;
    this.scene.environment = theme.env ? this.room() : null;
    this.scene.environmentIntensity = theme.env ?? 0;
    this.invalidate();
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

  /** 상태에 맞춰 조각을 제자리에 놓는다. 회전이 끝날 때마다 부른다. */
  sync() {
    const m = new Matrix4();
    this.cube.cubies.forEach((piece, i) => {
      const r = piece.rot;
      const b = this.base[i];
      b.pos.set(piece.pos[0] / 2, piece.pos[1] / 2, piece.pos[2] / 2);
      m.set(r[0], r[1], r[2], 0, r[3], r[4], r[5], 0, r[6], r[7], r[8], 0, 0, 0, 0, 1);
      b.quat.setFromRotationMatrix(m);
      this.pieces[i].position.copy(b.pos);
      this.pieces[i].quaternion.copy(b.quat);
    });
    this.invalidate();
  }

  /** axis 축의 층마다 angles[층]만큼 돌린 모습으로 놓는다. */
  pose(axis, angles) {
    const q = new Quaternion();
    const { n } = this.cube;
    this.cube.cubies.forEach((piece, i) => {
      const b = this.base[i];
      q.setFromAxisAngle(AXES[axis], angles[layerOf(n, piece.pos[axis])] || 0);
      this.pieces[i].position.copy(b.pos).applyQuaternion(q);
      this.pieces[i].quaternion.copy(q).multiply(b.quat);
    });
    this.invalidate();
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
    return this.tween(longest === 2 ? ms * 1.5 : ms, (k) => {
      const e = easeInOut(k);
      for (let i = 0; i < target.length; i++) angles[i] = target[i] * e;
      this.pose(step[0].axis, angles);
    });
  }

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
    const finished = [];
    this.tweens = this.tweens.filter((t) => {
      const k = Math.min(1, Math.max(0, (now - t.start) / t.duration));
      t.update(k);
      if (k < 1) return true;
      finished.push(t);
      return false;
    });
    this.renderer.render(this.scene, this.camera);
    if (this.tweens.length) this.invalidate();
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
    this.camera.position.set(0, 0, (SIZE * 0.95) / Math.sin(Math.min(v, across) / 2));
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
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
    angles[d.layer] = d.angle;
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
    const ms = 70 + 170 * Math.min(1, Math.abs(to - from) / QUARTER);
    this.tween(ms, (k) => {
      angles[d.layer] = from + (to - from) * easeOut(k);
      this.pose(d.axis, angles);
    }).then(() => {
      this.turning = false;
      const turns = ((quarters % 4) + 4) % 4;
      if (turns) this.onMove({ axis: d.axis, layer: d.layer, turns });
      this.sync();
    });
  }
}
