// 모래 큐브. 조각마다 고운 모래알 수백 알이 여섯 면에 빽빽이 붙어 조각 모양을 이룬다(스티커 자리는 그 색 모래, 나머지는
// 맨모래). 모래알마다 제자리(조각 안 자리)를 향해 용수철처럼 끌리는데, 층이 빨리 돌면 제자리가 휙 지나가 버려 알갱이들이
// 뒤처지며 줄기를 이루고, 돌아가는 빠르기만큼 바람에 흩날리고, 붙들 데 없이 떠 있는 동안엔 아래로 처진다. 층이 멈추면
// 하나씩 제자리로 날아들어 다시 반듯한 조각으로 뭉친다. 테마를 고르면 위에서 쏟아져 큐브 모양으로 쌓인다.
// 자리는 모두 큐브 뿌리(root) 좌표로 센다. 조각이 움직이지 않고 모래알도 다 내려앉은 조각은 셈하지 않는다.
import { Color, IcosahedronGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { FACES } from './cube.js';

const HALF = 0.465;

/** 칸 수에 따라 한 면에 몇 줄씩 모래알을 놓을지(칸이 많을수록 조각이 작게 보이니 성기게) */
function gridFor(n) {
  return n <= 3 ? 11 : n === 4 ? 9 : n === 5 ? 8 : 6;
}

export class Sand {
  /** cube: 큐브 상태, faces: 면 색 여섯, plain: 스티커가 없는 면의 모래 색 */
  constructor(cube, faces, plain) {
    const g = gridFor(cube.n);
    const pieces = cube.cubies;
    const perFace = g * g;
    const count = pieces.length * 6 * perFace;
    this.count = count;
    this.cubieOf = new Int32Array(count);
    this.home = new Float32Array(count * 3);
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.last = new Float32Array(count * 3);
    this.stiff = new Float32Array(count);
    this.phase = new Float32Array(count * 3);
    this.start = new Int32Array(pieces.length + 1);
    this.resting = new Uint8Array(pieces.length);
    this.mats = pieces.map(() => new Float32Array(16).fill(NaN));

    const geo = new IcosahedronGeometry(1, 0);
    const mat = new MeshStandardMaterial({ roughness: 0.92, metalness: 0, flatShading: true });
    this.mesh = new InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false;

    const spacing = (HALF * 2) / g;
    const m = new Matrix4();
    const q = new Quaternion();
    const s = new Vector3();
    const zero = new Vector3();
    const color = new Color();
    const tint = new Color();
    const axes = FACES.map((f) => {
      const n = new Vector3(...f);
      const qq = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), n);
      return [n, new Vector3(1, 0, 0).applyQuaternion(qq), new Vector3(0, 1, 0).applyQuaternion(qq)];
    });
    let k = 0;
    pieces.forEach((piece, i) => {
      this.start[i] = k;
      for (let f = 0; f < 6; f++) {
        const [n, ax, ay] = axes[f];
        const sticker = piece.stickers.includes(f);
        for (let a = 0; a < g; a++) {
          for (let b = 0; b < g; b++) {
            const u = -HALF + spacing * (a + 0.5) + (Math.random() - 0.5) * spacing * 0.5;
            const v = -HALF + spacing * (b + 0.5) + (Math.random() - 0.5) * spacing * 0.5;
            const d = HALF + (Math.random() - 0.7) * 0.02;
            this.home[k * 3] = n.x * d + ax.x * u + ay.x * v;
            this.home[k * 3 + 1] = n.y * d + ax.y * u + ay.y * v;
            this.home[k * 3 + 2] = n.z * d + ax.z * u + ay.z * v;
            this.cubieOf[k] = i;
            this.stiff[k] = 18 + Math.random() * 55;
            this.phase[k * 3] = Math.random() * 6.28;
            this.phase[k * 3 + 1] = Math.random() * 6.28;
            this.phase[k * 3 + 2] = Math.random() * 6.28;
            // 알갱이마다 모양(기울기와 크기)이 다르다
            q.setFromAxisAngle(s.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), Math.random() * 6.28);
            s.setScalar(spacing * 0.66 * (0.8 + Math.random() * 0.45));
            m.compose(zero, q, s);
            this.mesh.setMatrixAt(k, m);
            // 색 모래: 알갱이마다 조금씩 밝기와 빛깔이 다르고, 가끔 짙거나 흰 알이 섞인다
            color.set(sticker ? faces[f] : plain);
            const r = Math.random();
            const shade = 0.82 + Math.random() * 0.3;
            color.multiplyScalar(shade);
            if (r < 0.05) color.lerp(tint.set('#2a2420'), 0.5);
            else if (r < 0.1) color.lerp(tint.set('#ffffff'), 0.45);
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
   * 아직 움직이는 모래가 있으면 참을 돌려준다.
   */
  step(dt, now, down, t) {
    const { pos, vel, last, home, stiff, phase } = this;
    const arr = this.mesh.instanceMatrix.array;
    const m = new Matrix4();
    const e = m.elements;
    let busy = false;
    const h = Math.min(dt, 1 / 30) / 2;

    now.forEach((p, i) => {
      m.compose(p.pos, p.quat, ONE);
      const prev = this.mats[i];
      let moved = false;
      // 처음엔 prev가 NaN이라 비교가 늘 거짓이 되므로 '같지 않음'으로 센다
      for (let j = 0; j < 16; j++) if (!(Math.abs(prev[j] - e[j]) <= 1e-7)) { moved = true; break; }
      if (moved) prev.set(e);
      const from = this.start[i];
      const to = this.start[i + 1];

      // 처음: 위에서 흩뿌려 놓고 떨어지게 한다
      if (this.fresh) {
        for (let k = from; k < to; k++) {
          const tx = e[0] * home[k * 3] + e[4] * home[k * 3 + 1] + e[8] * home[k * 3 + 2] + e[12];
          const ty = e[1] * home[k * 3] + e[5] * home[k * 3 + 1] + e[9] * home[k * 3 + 2] + e[13];
          const tz = e[2] * home[k * 3] + e[6] * home[k * 3 + 1] + e[10] * home[k * 3 + 2] + e[14];
          const lift = 3 + Math.random() * 6;
          pos[k * 3] = tx - down.x * lift + (Math.random() - 0.5) * 3;
          pos[k * 3 + 1] = ty - down.y * lift + (Math.random() - 0.5) * 3;
          pos[k * 3 + 2] = tz - down.z * lift + (Math.random() - 0.5) * 3;
          last[k * 3] = tx; last[k * 3 + 1] = ty; last[k * 3 + 2] = tz;
        }
        this.resting[i] = 0;
      }
      if (!moved && this.resting[i]) return;

      let worst = 0;
      for (let k = from; k < to; k++) {
        const i3 = k * 3;
        const hx = home[i3], hy = home[i3 + 1], hz = home[i3 + 2];
        const tx = e[0] * hx + e[4] * hy + e[8] * hz + e[12];
        const ty = e[1] * hx + e[5] * hy + e[9] * hz + e[13];
        const tz = e[2] * hx + e[6] * hy + e[10] * hz + e[14];
        // 제자리가 얼마나 빨리 지나가는지가 바람의 세기
        const sp = dt > 0 ? Math.hypot(tx - last[i3], ty - last[i3 + 1], tz - last[i3 + 2]) / dt : 0;
        last[i3] = tx; last[i3 + 1] = ty; last[i3 + 2] = tz;
        const K = stiff[k];
        const C = 2 * Math.sqrt(K) * 0.82;
        const wind = Math.min(sp, 6) * 5;
        for (let sub = 0; sub < 2; sub++) {
          const dx = tx - pos[i3], dy = ty - pos[i3 + 1], dz = tz - pos[i3 + 2];
          const off = Math.hypot(dx, dy, dz);
          // 제자리에서 멀리 떠 있을 때만 아래로 처진다(가까이 오면 중력은 사라지고 꼭 붙는다)
          const fly = Math.min(1, Math.max(0, (off - 0.04) / 0.3));
          const air = fly * fly * 5;
          const ax = K * dx - C * vel[i3] + Math.sin(t * 3.1 + phase[i3]) * wind + down.x * air;
          const ay = K * dy - C * vel[i3 + 1] + Math.sin(t * 2.6 + phase[i3 + 1]) * wind + down.y * air;
          const az = K * dz - C * vel[i3 + 2] + Math.sin(t * 2.9 + phase[i3 + 2]) * wind + down.z * air;
          vel[i3] += ax * h; vel[i3 + 1] += ay * h; vel[i3 + 2] += az * h;
          pos[i3] += vel[i3] * h; pos[i3 + 1] += vel[i3 + 1] * h; pos[i3 + 2] += vel[i3 + 2] * h;
        }
        const err = Math.hypot(tx - pos[i3], ty - pos[i3 + 1], tz - pos[i3 + 2]) + Math.hypot(vel[i3], vel[i3 + 1], vel[i3 + 2]) * 0.05;
        if (err > worst) worst = err;
        arr[k * 16 + 12] = pos[i3];
        arr[k * 16 + 13] = pos[i3 + 1];
        arr[k * 16 + 14] = pos[i3 + 2];
      }
      // 다 내려앉았으면 제자리에 딱 붙이고 쉰다
      if (!moved && worst < 0.002) {
        for (let k = from; k < to; k++) {
          const i3 = k * 3;
          pos[i3] = last[i3]; pos[i3 + 1] = last[i3 + 1]; pos[i3 + 2] = last[i3 + 2];
          vel[i3] = vel[i3 + 1] = vel[i3 + 2] = 0;
          arr[k * 16 + 12] = pos[i3]; arr[k * 16 + 13] = pos[i3 + 1]; arr[k * 16 + 14] = pos[i3 + 2];
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

const ONE = new Vector3(1, 1, 1);
