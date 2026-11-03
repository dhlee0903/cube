// 투명 큐브 속 막대 사람. 조각 하나에 한 사람씩 살고, 화면 아래쪽이 곧 중력이다.
//
// 사람은 마디 열한 개(머리, 목, 골반, 팔꿈치·손 둘, 무릎·발 둘)를 뼈로 이은 헝겊 인형(래그돌)이다. 마디마다 중력을 받아
// 베를레 적분으로 움직이고, 뼈 길이는 늘 지키며, 유리 벽에 부딪히면 멈추고 마찰로 미끄러진다.
// 살아 있을 때는 마디마다 용수철이 걷기·뛰기·손 흔들기·춤·뛰어오르기 자세 쪽으로 끌어 그 동작을 한다. 이때 몸은 중력을
// 거슬러 곧게 서려고 바닥이 기운 만큼 기울어진다. 바닥이 너무 기울거나(층을 돌리거나 큐브를 굴려서) 바닥이 아예 바뀌면
// 용수철을 놓아 그냥 헝겊 인형이 되어 떨어지고 뒹굴고 벽을 타고 미끄러진다.
// 몸이 바닥에 멈추면 무릎을 굽혀 일어나 다시 돌아다닌다. 자리는 조각 좌표(가운데가 0, 벽이 ±0.46)로 센다.
import { Vector3 } from 'three';

export const JOINTS = 11; // 머리, 목, 골반, 왼팔꿈치, 왼손, 오른팔꿈치, 오른손, 왼무릎, 왼발, 오른무릎, 오른발
const WALL = 0.46;
const RADIUS = [0.045, 0.014, 0.016, 0.012, 0.012, 0.012, 0.012, 0.012, 0.013, 0.012, 0.013];
// 뼈: 두 마디와 길이
const BONES = [
  [0, 1, 0.062], [1, 2, 0.15],
  [1, 3, 0.086], [3, 4, 0.08], [1, 5, 0.086], [5, 6, 0.08],
  [2, 7, 0.1], [7, 8, 0.1], [2, 9, 0.1], [9, 10, 0.1],
];
// 버팀: 이보다 가까워지지 않는다(무릎·팔꿈치가 거꾸로 접히거나 몸이 납작해지지 않게)
const STRUTS = [
  [0, 2, 0.2], [2, 8, 0.07], [2, 10, 0.07], [1, 4, 0.05], [1, 6, 0.05],
  [7, 9, 0.025], [8, 10, 0.02], [0, 4, 0.04], [0, 6, 0.04], [0, 7, 0.17], [0, 9, 0.17],
];
const GRAVITY = 2.4;
const STEP = 1 / 120;
const HIP = 0.2;
const STAND = 0.84; // 바닥이 이만큼(약 33도) 넘게 기울면 서 있지 못한다
const AXES = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];

// 바닥에서 하는 일, 고르는 무게, 몇 초쯤
const CHORES = [
  ['walk', 4, 2.5, 5],
  ['run', 2, 1.2, 2.5],
  ['idle', 1, 0.8, 2],
  ['wave', 1, 1.2, 2],
  ['jump', 1.5, 0.8, 0.8],
  ['dance', 1.5, 1.6, 3],
];
const RATE = { walk: 7, run: 12, idle: 2, wave: 9, jump: 4, dance: 7, limp: 13, getup: 3 };
const SPEED = { walk: 0.2, run: 0.42 };

const v1 = new Vector3();
const v2 = new Vector3();
const v3 = new Vector3();

function pick() {
  const total = CHORES.reduce((s, c) => s + c[1], 0);
  let r = Math.random() * total;
  for (const c of CHORES) {
    r -= c[1];
    if (r <= 0) return c;
  }
  return CHORES[0];
}

/** 바닥 쪽(바닥에서 위로 향하는 축). 중력이 가장 센 축의 반대. 지금 바닥이 거의 비슷하면 그대로 둔다 */
function floorOf(g, prev) {
  let best = 0;
  for (let a = 1; a < 3; a++) if (Math.abs(g.getComponent(a)) > Math.abs(g.getComponent(best))) best = a;
  if (prev) {
    const pa = Math.abs(prev.x) > 0.5 ? 0 : Math.abs(prev.y) > 0.5 ? 1 : 2;
    const along = -g.getComponent(pa) * prev.getComponent(pa);
    if (along > 0 && along > Math.abs(g.getComponent(best)) - 0.12) return prev;
  }
  return AXES[best].clone().multiplyScalar(-Math.sign(g.getComponent(best)) || 1);
}

/** 바닥에 나란한 아무 방향 */
function tangent(floor, out = new Vector3()) {
  const a = Math.abs(floor.x) > 0.5 ? AXES[1] : AXES[0];
  v1.crossVectors(floor, a).normalize();
  v2.crossVectors(floor, v1);
  const th = Math.random() * Math.PI * 2;
  return out.copy(v1).multiplyScalar(Math.cos(th)).addScaledVector(v2, Math.sin(th)).normalize();
}

function limb(side, ab, sw) {
  return [side * Math.sin(ab), -Math.cos(ab) * Math.cos(sw), Math.cos(ab) * Math.sin(sw)];
}

/**
 * 동작 자세를 몸 좌표(오른쪽, 위, 앞; 바닥이 0)로 셈해 out(마디 11개 × 3)에 넣는다.
 * mode 동작, ph 걸음 위상, k 동작이 얼마나 지났는지(0~1)
 */
function pose(out, mode, ph, k) {
  let legL = 0, legR = 0, knL = 0.05, knR = 0.05;
  let armL = 0.05, armR = -0.05, abL = 0.18, abR = 0.18, elL = 0.25, elR = 0.25;
  let lean = 0, bob = 0;
  if (mode === 'walk') {
    legL = Math.sin(ph) * 0.55; legR = -legL;
    knL = Math.max(0, Math.sin(ph + 1.7)) * 0.8; knR = Math.max(0, Math.sin(ph + 4.84)) * 0.8;
    armL = -legL * 0.8; armR = -legR * 0.8; elL = elR = 0.4;
    bob = Math.abs(Math.cos(ph)) * 0.008; lean = 0.06;
  } else if (mode === 'run') {
    legL = Math.sin(ph) * 0.95; legR = -legL;
    knL = Math.max(0, Math.sin(ph + 1.7)) * 1.5 + 0.2; knR = Math.max(0, Math.sin(ph + 4.84)) * 1.5 + 0.2;
    armL = -legL * 0.9; armR = -legR * 0.9; elL = elR = 1.5;
    bob = Math.abs(Math.cos(ph)) * 0.02; lean = 0.3;
  } else if (mode === 'idle') {
    armL = Math.sin(ph) * 0.05; armR = -armL; bob = Math.sin(ph) * 0.003;
  } else if (mode === 'wave') {
    abR = 2.5; armR = 0; elR = 0.5 + 0.5 * Math.sin(ph);
  } else if (mode === 'jump') {
    // 웅크렸다가 팔을 번쩍 들고 솟는다, 내려서 다시 웅크린다
    const c = 1 - smooth((k - 0.1) / 0.2) + smooth((k - 0.85) / 0.15);
    knL = knR = c * 1.6; legL = legR = c * 0.8; lean = c * 0.35;
    armL = armR = 2.8 + (-0.6 - 2.8) * c; abL = abR = 0.4 - 0.2 * c;
    bob = -c * 0.06 + Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, (k - 0.3) / 0.55)))) * 0.16;
  } else if (mode === 'dance') {
    legL = Math.sin(ph) * 0.35; legR = -legL * 0.6;
    knL = Math.max(0, Math.sin(ph)) * 0.6; knR = Math.max(0, -Math.sin(ph)) * 0.6;
    abL = 2.3 + Math.sin(ph * 2) * 0.5; abR = 2.3 - Math.sin(ph * 2) * 0.5; elL = elR = 0.6 + 0.4 * Math.sin(ph);
    bob = Math.abs(Math.sin(ph)) * 0.015;
  } else if (mode === 'limp') {
    // 떨어지며 허우적댄다
    legL = Math.sin(ph * 1.3) * 0.8; legR = Math.sin(ph * 1.1 + 2) * 0.8; knL = 0.6; knR = 0.4;
    abL = 1.6 + Math.sin(ph) * 0.7; abR = 1.6 + Math.cos(ph * 1.2) * 0.7; elL = elR = 0.9;
  } else if (mode === 'getup') {
    const c = 1 - smooth(k);
    knL = knR = c * 1.9; legL = legR = c * 1.2; lean = c * 0.8; armL = armR = c * 0.7; elL = elR = 0.5;
    bob = -c * 0.09;
  }
  const sp = [0, Math.cos(lean), Math.sin(lean)];
  const pel = [0, HIP + bob, 0];
  const neck = [pel[0], pel[1] + sp[1] * 0.15, pel[2] + sp[2] * 0.15];
  const set = (j, p) => { out[j * 3] = p[0]; out[j * 3 + 1] = p[1]; out[j * 3 + 2] = p[2]; };
  const add = (p, d, s) => [p[0] + d[0] * s, p[1] + d[1] * s, p[2] + d[2] * s];
  set(0, add(neck, sp, 0.062));
  set(1, neck);
  set(2, pel);
  const eL = add(neck, limb(-1, abL, armL), 0.086);
  const eR = add(neck, limb(1, abR, armR), 0.086);
  set(3, eL); set(4, add(eL, limb(-1, abL, armL + elL), 0.08));
  set(5, eR); set(6, add(eR, limb(1, abR, armR + elR), 0.08));
  const kL = add([pel[0] - 0.019, pel[1], pel[2]], limb(-1, 0.06, legL), 0.1);
  const kR = add([pel[0] + 0.019, pel[1], pel[2]], limb(1, 0.06, legR), 0.1);
  set(7, kL); set(8, add(kL, limb(-1, 0.06, legL - knL), 0.1));
  set(9, kR); set(10, add(kR, limb(1, 0.06, legR - knR), 0.1));
}

export class Men {
  constructor(count) {
    this.local = new Float32Array(JOINTS * 3);
    this.list = Array.from({ length: count }, () => {
      const m = {
        x: new Float32Array(JOINTS * 3),
        o: new Float32Array(JOINTS * 3),
        target: new Float32Array(JOINTS * 3),
        mode: 'limp',
        t: 0,
        dur: 1,
        phase: Math.random() * 10,
        drive: 0,
        still: 0,
        floor: null,
        ground: new Vector3(),
        heading: new Vector3(0, 0, 1),
        spare: 0,
      };
      // 처음엔 아무 데나 서 있다가 떨어진다
      const c = new Vector3((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3);
      pose(this.local, 'idle', 0, 0);
      for (let j = 0; j < JOINTS; j++) {
        m.x[j * 3] = c.x + this.local[j * 3];
        m.x[j * 3 + 1] = c.y + this.local[j * 3 + 1] - HIP;
        m.x[j * 3 + 2] = c.z + this.local[j * 3 + 2];
      }
      m.o.set(m.x);
      return m;
    });
  }

  /** g: 조각마다 조각 좌표로 본 중력 방향(단위 벡터) */
  update(dt, gs) {
    this.list.forEach((m, i) => this.think(m, gs[i], dt));
    // 물리는 1/120초씩 고르게 나눠 돈다
    this.acc = Math.min((this.acc ?? 0) + dt, STEP * 6);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.list.forEach((m, i) => this.physics(m, gs[i]));
    }
  }

  joint(m, j, out) {
    return out.set(m.x[j * 3], m.x[j * 3 + 1], m.x[j * 3 + 2]);
  }

  /** 동작을 고르고 그 자세의 목표 자리를 정한다 */
  think(m, g, dt) {
    m.phase += dt * RATE[m.mode];
    m.t += dt;
    const floor = floorOf(g, m.floor);
    const changed = !m.floor || !floor.equals(m.floor);
    m.floor = floor;
    const level = -g.dot(floor);
    const alive = m.mode !== 'limp' && m.mode !== 'getup';

    if ((alive || m.mode === 'getup') && (changed || level < STAND)) {
      m.mode = 'limp';
      m.t = 0;
      m.still = 0;
    }

    const pelvis = this.joint(m, 2, v3);
    if (m.mode === 'limp') {
      // 다 멈췄고, 바닥 가까이 있고, 설 만한 바닥이면 일어난다
      let fast = 0;
      for (let j = 0; j < JOINTS * 3; j++) fast = Math.max(fast, Math.abs(m.x[j] - m.o[j]));
      const moving = fast / STEP;
      m.still = moving < 0.12 ? m.still + dt : 0;
      const nearFloor = pelvis.dot(floor) + WALL < 0.13;
      // 힘을 놓고 그냥 헝겊 인형이 된다
      m.drive = 0;
      if (m.still > 0.35 && nearFloor && level > STAND + 0.03) {
        m.mode = 'getup';
        m.t = 0;
        m.dur = 1;
        m.ground.copy(pelvis).addScaledVector(floor, -pelvis.dot(floor) - WALL);
        // 머리가 누워 있던 쪽을 보고 일어난다
        this.joint(m, 0, v1).sub(pelvis);
        v1.addScaledVector(floor, -v1.dot(floor));
        if (v1.lengthSq() < 1e-4) tangent(floor, v1);
        m.heading.copy(v1).normalize();
      }
      return;
    }

    if (m.mode === 'getup') {
      const k = Math.min(1, m.t / m.dur);
      m.drive = 0.15 + 0.85 * smooth(k * 1.4);
      this.aim(m, floor, g, 'getup', m.drive, false, k);
      if (m.t > m.dur) this.next(m);
      return;
    }

    // 서서 하는 일
    m.drive = Math.min(1, m.drive + dt * 3);
    const speed = SPEED[m.mode] ?? 0;
    m.heading.addScaledVector(floor, -m.heading.dot(floor));
    if (m.heading.lengthSq() < 1e-4) tangent(floor, m.heading);
    m.heading.normalize();
    if (speed) {
      // 이리저리 헤매며 걷고, 벽에 다다르면 돌아선다
      m.heading.applyAxisAngle(floor, (Math.sin(m.phase * 0.21 + m.t) * 0.9 + (Math.random() - 0.5) * 2) * dt);
      m.ground.addScaledVector(m.heading, speed * dt);
    }
    if (m.mode === 'dance') m.heading.applyAxisAngle(floor, dt * 2.5 * Math.sin(m.phase * 0.25));
    // 발 디딘 자리는 바닥 위, 벽에서 조금 떨어진 곳. 몸이 밀려나면 따라간다
    m.ground.lerp(v1.copy(pelvis), Math.min(1, dt * 1.5));
    m.ground.addScaledVector(floor, -m.ground.dot(floor) - WALL);
    const room = WALL - 0.1;
    for (let a = 0; a < 3; a++) {
      if (Math.abs(floor.getComponent(a)) > 0.5) continue;
      const c = m.ground.getComponent(a);
      if (Math.abs(c) > room) {
        m.ground.setComponent(a, Math.sign(c) * room);
        if (m.heading.getComponent(a) * c > 0) m.heading.setComponent(a, -m.heading.getComponent(a));
      }
    }
    this.aim(m, floor, g, m.mode, m.drive, false, Math.min(1, m.t / m.dur));
    if (m.t > m.dur) this.next(m);
  }

  next(m) {
    const c = pick();
    m.mode = c[0];
    m.t = 0;
    m.dur = c[2] + Math.random() * (c[3] - c[2]);
  }

  /** 자세 목표를 조각 좌표로 놓는다. body가 참이면 지금 몸(목-골반)을 기준으로, 아니면 발 디딘 자리를 기준으로 */
  aim(m, floor, g, mode, drive, body, k = 0) {
    m.drive = drive;
    pose(this.local, mode, m.phase, k);
    const up = new Vector3();
    const fwd = new Vector3();
    const origin = new Vector3();
    if (body) {
      const neck = this.joint(m, 1, new Vector3());
      const pelvis = this.joint(m, 2, new Vector3());
      up.copy(neck).sub(pelvis).normalize();
      fwd.copy(this.joint(m, 0, new Vector3())).sub(neck).cross(up);
      if (fwd.lengthSq() < 1e-6) fwd.set(up.y, up.z, up.x).cross(up);
      fwd.normalize();
      origin.copy(pelvis).addScaledVector(up, -HIP);
    } else {
      // 중력을 거슬러 곧게 서려고 바닥이 기운 만큼 몸을 기울인다
      up.copy(floor).multiplyScalar(0.35).addScaledVector(g, -0.65).normalize();
      fwd.copy(m.heading).addScaledVector(up, -m.heading.dot(up)).normalize();
      origin.copy(m.ground);
    }
    const right = new Vector3().crossVectors(up, fwd);
    for (let j = 0; j < JOINTS; j++) {
      const x = this.local[j * 3];
      const y = this.local[j * 3 + 1];
      const z = this.local[j * 3 + 2];
      m.target[j * 3] = origin.x + right.x * x + up.x * y + fwd.x * z;
      m.target[j * 3 + 1] = origin.y + right.y * x + up.y * y + fwd.y * z;
      m.target[j * 3 + 2] = origin.z + right.z * x + up.z * y + fwd.z * z;
    }
  }

  physics(m, g) {
    const { x, o, target } = m;
    const gx = g.x * GRAVITY * STEP * STEP;
    const gy = g.y * GRAVITY * STEP * STEP;
    const gz = g.z * GRAVITY * STEP * STEP;
    // 베를레: 지난 걸음만큼 그대로 가고 중력을 더한다. 용수철은 자세 쪽으로 끈다
    const pull = m.drive * 0.2;
    for (let j = 0; j < JOINTS; j++) {
      const i = j * 3;
      for (let a = 0; a < 3; a++) {
        const v = (x[i + a] - o[i + a]) * 0.995;
        o[i + a] = x[i + a];
        x[i + a] += v + (a === 0 ? gx : a === 1 ? gy : gz);
        if (pull) x[i + a] += (target[i + a] - x[i + a]) * pull;
      }
    }
    for (let it = 0; it < 6; it++) {
      for (const [a, b, len] of BONES) relax(x, a, b, len, false);
      for (const [a, b, len] of STRUTS) relax(x, a, b, len, true);
    }
    // 유리 벽: 마디 크기만큼 안쪽에 가두고, 닿은 마디는 벽을 따라 미끄러지며 마찰로 느려진다
    for (let j = 0; j < JOINTS; j++) {
      const i = j * 3;
      const lim = WALL - RADIUS[j];
      for (let a = 0; a < 3; a++) {
        const c = x[i + a];
        if (Math.abs(c) <= lim) continue;
        const vn = c - o[i + a];
        x[i + a] = Math.sign(c) * lim;
        // 벽으로 들이받던 속도는 조금만 되튀고, 벽을 따라가는 두 방향은 마찰로 줄인다
        o[i + a] = vn * Math.sign(c) > 0 ? x[i + a] + vn * 0.2 : x[i + a] - vn;
        for (let b = 0; b < 3; b++) {
          if (b === a) continue;
          o[i + b] = x[i + b] - (x[i + b] - o[i + b]) * 0.93;
        }
      }
    }
  }
}

/** 두 마디 사이를 len으로 맞춘다. least면 그보다 가까울 때만 벌린다 */
function relax(x, a, b, len, least) {
  const ia = a * 3;
  const ib = b * 3;
  const dx = x[ib] - x[ia];
  const dy = x[ib + 1] - x[ia + 1];
  const dz = x[ib + 2] - x[ia + 2];
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
  if (least && d >= len) return;
  const k = ((d - len) / d) * 0.5;
  x[ia] += dx * k; x[ia + 1] += dy * k; x[ia + 2] += dz * k;
  x[ib] -= dx * k; x[ib + 1] -= dy * k; x[ib + 2] -= dz * k;
}

function smooth(k) {
  const x = Math.min(1, Math.max(0, k));
  return x * x * (3 - 2 * x);
}
