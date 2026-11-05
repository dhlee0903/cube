// 입자 큐브. 조각마다 작은 입자 수백 개가 여섯 면에 빽빽이 붙어 조각 모양을 이룬다(스티커 자리는 그 색, 나머지는 바탕
// 색). 입자마다 제자리(조각 안 자리)를 향해 용수철처럼 끌리는데, 층이 빨리 돌면 제자리가 휙 지나가 버려 입자들이 뒤처지며
// 줄기를 이루고, 지나가는 빠르기만큼 바람에 흩날린다. 층이 멈추면 하나씩 제자리로 날아들어 다시 반듯한 조각으로 뭉친다.
// 입자 종류(KINDS)마다 모양, 재질, 탄력, 바람의 결, 처짐, 가만히 있을 때의 움직임, 나는 동안의 자세, 처음 나타나는 법이 다르다.
// 자리는 모두 큐브 뿌리(root) 좌표로 센다. 조각이 움직이지 않고 입자도 다 내려앉은 조각은 셈하지 않는다.
import {
  AdditiveBlending, BoxGeometry, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, IcosahedronGeometry,
  InstancedMesh, Matrix4, MeshBasicMaterial, MeshStandardMaterial, OctahedronGeometry, Quaternion, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FACES } from './cube.js';

const HALF = 0.465;
const ONE = new Vector3(1, 1, 1);
const X = new Vector3(1, 0, 0);

// 물고기: 마름모꼴 몸통(코가 +x)에 납작한 꼬리지느러미
function fishGeometry() {
  let body = new OctahedronGeometry(1, 0);
  body.scale(0.62, 0.26, 0.13);
  if (body.index) body = body.toNonIndexed();
  const tail = new BufferGeometry();
  const p = [-0.5, 0, 0, -1, 0.34, 0, -1, -0.34, 0, -0.5, 0, 0, -1, -0.34, 0, -1, 0.34, 0];
  tail.setAttribute('position', new Float32BufferAttribute(p, 3));
  tail.setAttribute('normal', new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1], 3));
  tail.setAttribute('uv', new Float32BufferAttribute(new Array(12).fill(0), 2));
  return mergeGeometries([body, tail]);
}

/**
 * 입자 종류.
 *   grid    3×3에서 한 면에 놓는 줄 수(칸이 많으면 성기게)   size  입자 크기(줄 간격에 대한 비)
 *   stiff   제자리로 끄는 세기 [최소, 최대]                    damp  감쇠(1이면 튀지 않고 바로 선다, 작을수록 통통 튄다)
 *   wind    지나가는 빠르기에 곱하는 바람                       flow  바람 결: random 알마다 제각각, swirl 한 줄기로 휘돈다
 *   sag     멀리 떠 있을 때 아래로 처지는 세기                   idle  가만히 있을 때 제자리 둘레를 떠다니는 크기
 *   pose    자세: none 아무렇게나 돌린 채, flat 면에 납작이(날면 뒤집힌다), swim 면을 따라 헤엄(날면 가는 쪽을 본다)
 *   intro   처음: fall 위에서 쏟아짐, burst 가운데서 퍼짐, swim 옆에서 헤엄쳐 옴
 */
const KINDS = {
  sand: {
    geometry: () => new IcosahedronGeometry(1, 0),
    material: () => new MeshStandardMaterial({ roughness: 0.92, metalness: 0, flatShading: true }),
    grid: 11, size: 0.66, stiff: [18, 73], damp: 0.82, wind: 5, flow: 'random', sag: 5, idle: 0, pose: 'none', intro: 'fall',
    speck: true,
  },
  bearing: {
    geometry: () => new IcosahedronGeometry(1, 2),
    material: () => new MeshStandardMaterial({ roughness: 0.16, metalness: 0.9 }),
    grid: 8, size: 0.5, stiff: [55, 120], damp: 0.28, wind: 2.5, flow: 'random', sag: 9, idle: 0, pose: 'none', intro: 'fall',
  },
  firefly: {
    geometry: () => new IcosahedronGeometry(1, 1),
    material: () => new MeshBasicMaterial({ transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
    grid: 9, size: 0.22, stiff: [8, 26], damp: 0.7, wind: 8, flow: 'swirl', sag: 0, idle: 0.022, pose: 'none', intro: 'burst',
  },
  confetti: {
    geometry: () => new BoxGeometry(1, 1, 0.07),
    material: () => new MeshStandardMaterial({ roughness: 0.62, metalness: 0, side: DoubleSide }),
    grid: 8, size: 0.62, stiff: [7, 22], damp: 0.78, wind: 7, flow: 'random', sag: 6, idle: 0, pose: 'flat', intro: 'fall',
  },
  fish: {
    geometry: fishGeometry,
    material: () => new MeshStandardMaterial({ roughness: 0.35, metalness: 0.15, flatShading: true, side: DoubleSide }),
    grid: 6, size: 0.78, stiff: [5, 14], damp: 0.9, wind: 6, flow: 'swirl', sag: 0, idle: 0.012, pose: 'swim', intro: 'swim',
  },
};

/** 칸 수에 따라 한 면에 몇 줄씩 놓을지(칸이 많을수록 조각이 작게 보이니 성기게) */
function gridFor(base, n) {
  return Math.max(3, Math.round(base * Math.min(1, 4 / (n + 1))));
}

export class Grains {
  /** cube: 큐브 상태, faces: 면 색 여섯, opts: { kind, plain(스티커 없는 면 색) } */
  constructor(cube, faces, opts) {
    const kind = KINDS[opts.kind] ?? KINDS.sand;
    this.kind = kind;
    const g = gridFor(kind.grid, cube.n);
    const pieces = cube.cubies;
    const count = pieces.length * 6 * g * g;
    this.count = count;
    this.home = new Float32Array(count * 3);
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.last = new Float32Array(count * 3);
    this.stiff = new Float32Array(count);
    this.phase = new Float32Array(count * 3);
    this.rest = new Float32Array(count * 4); // 조각 안에서의 쉬는 자세(flat, swim)
    this.spin = new Float32Array(count * 3); // 날 때 뒤집히는 축
    this.scale = new Float32Array(count);
    this.start = new Int32Array(pieces.length + 1);
    this.resting = new Uint8Array(pieces.length);
    this.mats = pieces.map(() => new Float32Array(16).fill(NaN));

    this.mesh = new InstancedMesh(kind.geometry(), kind.material(), count);
    this.mesh.frustumCulled = false;

    const spacing = (HALF * 2) / g;
    const m = new Matrix4();
    const q = new Quaternion();
    const s = new Vector3();
    const zero = new Vector3();
    const color = new Color();
    const tint = new Color();
    const faceQ = FACES.map((f) => new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(...f)));
    const axes = FACES.map((f, i) => [new Vector3(...f), new Vector3(1, 0, 0).applyQuaternion(faceQ[i]), new Vector3(0, 1, 0).applyQuaternion(faceQ[i])]);
    const rz = new Quaternion();
    const zAxis = new Vector3(0, 0, 1);
    let k = 0;
    pieces.forEach((piece, i) => {
      this.start[i] = k;
      for (let f = 0; f < 6; f++) {
        const [n, ax, ay] = axes[f];
        const sticker = piece.stickers.includes(f);
        // 면마다 물고기가 헤엄치는 쪽
        const heading = (f * 1.7) % 6.283;
        for (let a = 0; a < g; a++) {
          for (let b = 0; b < g; b++) {
            const u = -HALF + spacing * (a + 0.5) + (Math.random() - 0.5) * spacing * 0.5;
            const v = -HALF + spacing * (b + 0.5) + (Math.random() - 0.5) * spacing * 0.5;
            const d = HALF + (Math.random() - 0.7) * 0.02;
            this.home[k * 3] = n.x * d + ax.x * u + ay.x * v;
            this.home[k * 3 + 1] = n.y * d + ax.y * u + ay.y * v;
            this.home[k * 3 + 2] = n.z * d + ax.z * u + ay.z * v;
            this.stiff[k] = kind.stiff[0] + Math.random() * (kind.stiff[1] - kind.stiff[0]);
            for (let c = 0; c < 3; c++) this.phase[k * 3 + c] = Math.random() * 6.283;
            s.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
            this.spin[k * 3] = s.x; this.spin[k * 3 + 1] = s.y; this.spin[k * 3 + 2] = s.z;
            this.scale[k] = spacing * kind.size * (0.8 + Math.random() * 0.45);
            if (kind.pose === 'flat') rz.setFromAxisAngle(zAxis, Math.random() * 6.283);
            else if (kind.pose === 'swim') rz.setFromAxisAngle(zAxis, heading + (Math.random() - 0.5) * 0.35);
            else rz.setFromAxisAngle(s, Math.random() * 6.283);
            q.copy(faceQ[f]).multiply(rz);
            this.rest[k * 4] = q.x; this.rest[k * 4 + 1] = q.y; this.rest[k * 4 + 2] = q.z; this.rest[k * 4 + 3] = q.w;
            m.compose(zero, kind.pose === 'none' ? rz : q, s.setScalar(this.scale[k]));
            this.mesh.setMatrixAt(k, m);
            // 입자마다 조금씩 밝기와 빛깔이 다르다(모래엔 가끔 짙거나 흰 알이 섞인다)
            color.set(sticker ? faces[f] : opts.plain);
            color.multiplyScalar(0.84 + Math.random() * 0.28);
            if (kind.speck) {
              const r = Math.random();
              if (r < 0.05) color.lerp(tint.set('#2a2420'), 0.5);
              else if (r < 0.1) color.lerp(tint.set('#ffffff'), 0.45);
            }
            this.mesh.setColorAt(k, color);
            k++;
          }
        }
      }
    });
    this.start[pieces.length] = k;
    this.fresh = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.dispose();
  }

  /**
   * 한 프레임. now: 조각마다 { pos, quat }(뿌리 좌표), down: 뿌리 좌표로 본 아래쪽, t: 초.
   * 아직 움직이는 입자가 있으면 참을 돌려준다.
   */
  step(dt, now, down, t) {
    const { pos, vel, last, home, stiff, phase, kind } = this;
    const arr = this.mesh.instanceMatrix.array;
    const m = new Matrix4();
    const e = m.elements;
    const w = new Matrix4();
    const q = new Quaternion();
    const qr = new Quaternion();
    const qs = new Quaternion();
    const dir = new Vector3();
    const sv = new Vector3();
    const pv = new Vector3();
    let busy = false;
    const h = Math.min(dt, 1 / 30) / 2;
    const posed = kind.pose !== 'none';
    const idle = kind.idle;

    now.forEach((p, i) => {
      m.compose(p.pos, p.quat, ONE);
      const prev = this.mats[i];
      let moved = false;
      // 처음엔 prev가 NaN이라 비교가 늘 거짓이 되므로 '같지 않음'으로 센다
      for (let j = 0; j < 16; j++) if (!(Math.abs(prev[j] - e[j]) <= 1e-7)) { moved = true; break; }
      if (moved) prev.set(e);
      const from = this.start[i];
      const to = this.start[i + 1];

      if (this.fresh) {
        for (let k = from; k < to; k++) {
          const tx = e[0] * home[k * 3] + e[4] * home[k * 3 + 1] + e[8] * home[k * 3 + 2] + e[12];
          const ty = e[1] * home[k * 3] + e[5] * home[k * 3 + 1] + e[9] * home[k * 3 + 2] + e[13];
          const tz = e[2] * home[k * 3] + e[6] * home[k * 3 + 1] + e[10] * home[k * 3 + 2] + e[14];
          if (kind.intro === 'burst') {
            // 가운데 한 점에서 터져 나와 퍼진다
            const r = Math.random() * 0.3;
            pos[k * 3] = (Math.random() - 0.5) * r; pos[k * 3 + 1] = (Math.random() - 0.5) * r; pos[k * 3 + 2] = (Math.random() - 0.5) * r;
          } else if (kind.intro === 'swim') {
            // 화면 옆에서 떼 지어 헤엄쳐 온다
            const side = Math.random() < 0.5 ? -1 : 1;
            pos[k * 3] = tx + side * (4 + Math.random() * 3); pos[k * 3 + 1] = ty + (Math.random() - 0.5) * 1.5; pos[k * 3 + 2] = tz + (Math.random() - 0.5) * 1.5;
          } else {
            const lift = 3 + Math.random() * 6;
            pos[k * 3] = tx - down.x * lift + (Math.random() - 0.5) * 3;
            pos[k * 3 + 1] = ty - down.y * lift + (Math.random() - 0.5) * 3;
            pos[k * 3 + 2] = tz - down.z * lift + (Math.random() - 0.5) * 3;
          }
          last[k * 3] = tx; last[k * 3 + 1] = ty; last[k * 3 + 2] = tz;
        }
        this.resting[i] = 0;
      }
      if (!moved && this.resting[i] && !idle) return;

      let worst = 0;
      for (let k = from; k < to; k++) {
        const i3 = k * 3;
        const hx = home[i3], hy = home[i3 + 1], hz = home[i3 + 2];
        let tx = e[0] * hx + e[4] * hy + e[8] * hz + e[12];
        let ty = e[1] * hx + e[5] * hy + e[9] * hz + e[13];
        let tz = e[2] * hx + e[6] * hy + e[10] * hz + e[14];
        // 제자리가 얼마나 빨리 지나가는지가 바람의 세기
        const sp = dt > 0 ? Math.hypot(tx - last[i3], ty - last[i3 + 1], tz - last[i3 + 2]) / dt : 0;
        last[i3] = tx; last[i3 + 1] = ty; last[i3 + 2] = tz;
        // 가만히 있어도 제자리 둘레를 살짝 떠다닌다
        if (idle) {
          tx += Math.sin(t * 1.3 + phase[i3]) * idle;
          ty += Math.sin(t * 1.1 + phase[i3 + 1]) * idle;
          tz += Math.sin(t * 1.7 + phase[i3 + 2]) * idle;
        }
        const K = stiff[k];
        const C = 2 * Math.sqrt(K) * kind.damp;
        const wind = Math.min(sp, 6) * kind.wind;
        for (let sub = 0; sub < 2; sub++) {
          const px = pos[i3], py = pos[i3 + 1], pz = pos[i3 + 2];
          const dx = tx - px, dy = ty - py, dz = tz - pz;
          const off = Math.hypot(dx, dy, dz);
          // 제자리에서 멀리 떠 있을 때만 아래로 처진다(가까이 오면 꼭 붙는다)
          const fly = Math.min(1, Math.max(0, (off - 0.04) / 0.3));
          const air = fly * fly * kind.sag;
          let wx, wy, wz;
          if (kind.flow === 'swirl') {
            // 한 줄기로 휘도는 바람 결(자리마다 이어지는 흐름)
            wx = Math.sin(py * 2.1 + t * 1.3) + Math.cos(pz * 1.7 - t * 0.9);
            wy = Math.sin(pz * 1.9 + t * 1.1) + Math.cos(px * 2.3 + t * 0.7);
            wz = Math.sin(px * 1.6 - t * 1.2) + Math.cos(py * 2.0 + t * 0.8);
          } else {
            wx = Math.sin(t * 3.1 + phase[i3]); wy = Math.sin(t * 2.6 + phase[i3 + 1]); wz = Math.sin(t * 2.9 + phase[i3 + 2]);
          }
          const ax = K * dx - C * vel[i3] + wx * wind + down.x * air;
          const ay = K * dy - C * vel[i3 + 1] + wy * wind + down.y * air;
          const az = K * dz - C * vel[i3 + 2] + wz * wind + down.z * air;
          vel[i3] += ax * h; vel[i3 + 1] += ay * h; vel[i3 + 2] += az * h;
          pos[i3] += vel[i3] * h; pos[i3 + 1] += vel[i3 + 1] * h; pos[i3 + 2] += vel[i3 + 2] * h;
        }
        const off = Math.hypot(tx - pos[i3], ty - pos[i3 + 1], tz - pos[i3 + 2]);
        const speed = Math.hypot(vel[i3], vel[i3 + 1], vel[i3 + 2]);
        const err = off + speed * 0.05;
        if (err > worst) worst = err;
        if (posed) {
          // 쉬는 자세는 조각을 따라 돈다. 날 땐 flat은 뒤집히고, swim은 가는 쪽을 본다
          q.set(this.rest[k * 4], this.rest[k * 4 + 1], this.rest[k * 4 + 2], this.rest[k * 4 + 3]);
          qr.copy(p.quat).multiply(q);
          if (kind.pose === 'flat') {
            if (off > 0.01) qr.multiply(qs.setFromAxisAngle(sv.set(this.spin[i3], this.spin[i3 + 1], this.spin[i3 + 2]), off * 9));
          } else if (speed > 0.05) {
            dir.set(vel[i3], vel[i3 + 1], vel[i3 + 2]).normalize();
            qs.setFromUnitVectors(X, dir);
            qr.slerp(qs, Math.min(1, speed * 1.2));
          }
          w.compose(pv.set(pos[i3], pos[i3 + 1], pos[i3 + 2]), qr, sv.setScalar(this.scale[k]));
          arr.set(w.elements, k * 16);
        } else {
          arr[k * 16 + 12] = pos[i3];
          arr[k * 16 + 13] = pos[i3 + 1];
          arr[k * 16 + 14] = pos[i3 + 2];
        }
      }
      if (idle) {
        busy = true;
      } else if (!moved && worst < 0.002) {
        // 다 내려앉았으면 제자리에 딱 붙이고 쉰다
        for (let k = from; k < to; k++) {
          const i3 = k * 3;
          pos[i3] = last[i3]; pos[i3 + 1] = last[i3 + 1]; pos[i3 + 2] = last[i3 + 2];
          vel[i3] = vel[i3 + 1] = vel[i3 + 2] = 0;
          if (posed) {
            q.set(this.rest[k * 4], this.rest[k * 4 + 1], this.rest[k * 4 + 2], this.rest[k * 4 + 3]);
            w.compose(pv.set(pos[i3], pos[i3 + 1], pos[i3 + 2]), qr.copy(p.quat).multiply(q), sv.setScalar(this.scale[k]));
            arr.set(w.elements, k * 16);
          } else {
            arr[k * 16 + 12] = pos[i3]; arr[k * 16 + 13] = pos[i3 + 1]; arr[k * 16 + 14] = pos[i3 + 2];
          }
        }
        this.resting[i] = 1;
      } else {
        this.resting[i] = 0;
        busy = true;
      }
      this.mesh.instanceMatrix.needsUpdate = true;
    });
    this.fresh = false;
    return busy;
  }
}
