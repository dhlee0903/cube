// 투명 큐브 속 막대 사람. 조각 하나에 한 사람씩 살고, 화면 아래쪽이 곧 중력이다.
// 사람은 조각 상자의 여섯 벽 가운데 중력이 가장 세게 당기는 쪽 벽을 바닥 삼아 걷고, 뛰고, 손을 흔들고, 춤추고, 뛰어오른다.
// 층을 돌리거나 큐브를 굴려 바닥이 바뀌면 붙잡을 데를 잃고 새 바닥으로 떨어져(벽에 부딪혀 튀고 몸이 뒹군다)
// 잠깐 누워 있다가 일어나서 다시 돌아다닌다. 위치와 자세는 조각 좌표(가운데가 0, 벽이 ±0.46)로 센다.
import { Quaternion, Vector3 } from 'three';

const WALL = 0.46;
const HIP = 0.2; // 서 있을 때 골반 높이(다리 길이)
const LIE = 0.04; // 누웠을 때 몸 가운데 높이
const REACH = 0.27; // 몸 가운데에서 머리끝까지
const GRAVITY = 2.6;
const AXES = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];

/** 셰이더에 넘기는 동작 번호 */
export const MODE = { walk: 0, run: 1, idle: 2, wave: 3, jump: 4, dance: 5, fall: 6, lie: 7, getup: 8 };
// 바닥에서 하는 일과 얼마나 자주 고르는지, 몇 초쯤 하는지
const CHORES = [
  ['walk', 4, 2.5, 5],
  ['run', 2, 1.2, 2.5],
  ['idle', 1, 0.8, 2],
  ['wave', 1, 1.2, 2],
  ['jump', 1.5, 0.7, 0.7],
  ['dance', 1.5, 1.6, 3],
];
const RATE = { walk: 7, run: 12, idle: 2, wave: 9, jump: 4, dance: 7, fall: 13, lie: 1, getup: 3 };

const tmp = new Vector3();
const tmp2 = new Vector3();
const turn = new Quaternion();

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

/** 바닥 위 아무 방향(바닥에 나란한 단위 벡터) */
function tangent(floor) {
  const a = Math.abs(floor.x) > 0.5 ? AXES[1] : AXES[0];
  const t = tmp.crossVectors(floor, a).normalize();
  const b = tmp2.crossVectors(floor, t);
  const th = Math.random() * Math.PI * 2;
  return new Vector3().addScaledVector(t, Math.cos(th)).addScaledVector(b, Math.sin(th)).normalize();
}

export class Men {
  constructor(count) {
    this.list = Array.from({ length: count }, () => ({
      p: new Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4),
      v: new Vector3(),
      up: new Vector3(0, 1, 0),
      fwd: new Vector3(0, 0, 1),
      floor: null,
      spin: new Vector3(1, 0, 0),
      mode: 'fall',
      t: 0,
      dur: 1,
      phase: Math.random() * 10,
      hop: 0,
      from: new Vector3(),
    }));
  }

  /** g: 조각마다 조각 좌표로 본 중력 방향(단위 벡터) */
  update(dt, gs) {
    this.list.forEach((m, i) => this.step(m, gs[i], dt));
  }

  fall(m) {
    m.mode = 'fall';
    m.t = 0;
    m.v.set(0, 0, 0);
    m.spin.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    m.hop = 0;
  }

  next(m) {
    const c = pick();
    m.mode = c[0];
    m.t = 0;
    m.dur = c[2] + Math.random() * (c[3] - c[2]);
  }

  step(m, g, dt) {
    m.phase += dt * RATE[m.mode];
    m.t += dt;
    const floor = floorOf(g, m.floor);
    if (m.mode !== 'fall' && (!m.floor || !floor.equals(m.floor))) this.fall(m);
    m.floor = floor;

    if (m.mode === 'fall') {
      m.v.addScaledVector(g, GRAVITY * dt);
      m.p.addScaledVector(m.v, dt);
      // 몸이 뒹군다
      turn.setFromAxisAngle(m.spin, dt * (4 + m.v.length() * 6));
      m.up.applyQuaternion(turn);
      m.fwd.applyQuaternion(turn);
      // 벽에 부딪히면 튄다(몸 크기만큼 벽에서 떨어져서)
      let landed = false;
      for (let a = 0; a < 3; a++) {
        const lim = WALL - REACH * 0.9;
        const c = m.p.getComponent(a);
        if (Math.abs(c) > lim) {
          m.p.setComponent(a, Math.sign(c) * lim);
          const va = m.v.getComponent(a);
          if (va * c > 0) m.v.setComponent(a, -va * 0.3);
          m.v.multiplyScalar(0.85);
          if (-Math.sign(c) === floor.getComponent(a)) landed = true;
        }
      }
      if (landed && m.v.length() < 0.35 && m.t > 0.2) {
        // 누운 채로 바닥에 닿는다: 몸은 바닥에 나란히, 얼굴은 위로
        m.mode = 'lie';
        m.t = 0;
        m.dur = 0.35 + Math.random() * 0.4;
        m.up.copy(tangent(floor));
        m.fwd.copy(floor);
        m.v.set(0, 0, 0);
      }
      return;
    }

    // 바닥 위에서는 몸 가운데를 바닥에서 일정한 높이에 둔다
    const height = m.mode === 'lie' ? LIE : m.mode === 'getup' ? LIE + (HIP - LIE) * smooth(m.t / m.dur) : HIP;
    const along = m.p.dot(floor);
    m.p.addScaledVector(floor, -WALL + height - along);
    // 바닥에 나란한 방향은 벽에 닿지 않게 가둔다
    const room = m.mode === 'lie' || m.mode === 'getup' ? WALL - REACH : WALL - 0.08;
    for (let a = 0; a < 3; a++) {
      if (Math.abs(floor.getComponent(a)) > 0.5) continue;
      const c = m.p.getComponent(a);
      if (Math.abs(c) > room) m.p.setComponent(a, Math.sign(c) * room);
    }

    if (m.mode === 'lie') {
      if (m.t > m.dur) {
        m.mode = 'getup';
        m.t = 0;
        m.dur = 0.7;
        m.from.copy(m.up);
      }
      return;
    }
    if (m.mode === 'getup') {
      // 누운 몸을 일으켜 세운다. 얼굴은 누웠던 쪽(머리가 있던 쪽)을 본다
      const k = smooth(Math.min(1, m.t / m.dur));
      m.up.copy(m.from).multiplyScalar(1 - k).addScaledVector(floor, k).normalize();
      m.fwd.copy(floor).multiplyScalar(1 - k).addScaledVector(m.from, k);
      m.fwd.addScaledVector(m.up, -m.fwd.dot(m.up)).normalize();
      if (m.t > m.dur) {
        m.up.copy(floor);
        m.fwd.copy(m.from).addScaledVector(floor, -m.from.dot(floor)).normalize();
        if (m.fwd.lengthSq() < 0.5) m.fwd.copy(tangent(floor));
        this.next(m);
      }
      return;
    }

    // 서서 하는 일
    m.up.copy(floor);
    m.fwd.addScaledVector(floor, -m.fwd.dot(floor));
    if (m.fwd.lengthSq() < 1e-4) m.fwd.copy(tangent(floor));
    m.fwd.normalize();
    const speed = m.mode === 'walk' ? 0.2 : m.mode === 'run' ? 0.46 : 0;
    if (speed) {
      // 이리저리 헤매며 걷고, 벽에 다다르면 돌아선다
      turn.setFromAxisAngle(floor, (Math.sin(m.phase * 0.21 + m.t) * 0.9 + (Math.random() - 0.5) * 2) * dt);
      m.fwd.applyQuaternion(turn);
      m.p.addScaledVector(m.fwd, speed * dt);
      for (let a = 0; a < 3; a++) {
        if (Math.abs(floor.getComponent(a)) > 0.5) continue;
        const c = m.p.getComponent(a);
        if (Math.abs(c) > room - 0.02 && m.fwd.getComponent(a) * c > 0) m.fwd.setComponent(a, -m.fwd.getComponent(a));
      }
    }
    if (m.mode === 'dance') {
      turn.setFromAxisAngle(floor, dt * 2.5 * Math.sin(m.phase * 0.25));
      m.fwd.applyQuaternion(turn);
    }
    m.hop = m.mode === 'jump' ? Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, (m.t / m.dur - 0.25) / 0.75)))) * 0.14 : 0;
    if (m.t > m.dur) this.next(m);
  }
}

function smooth(k) {
  const x = Math.min(1, Math.max(0, k));
  return x * x * (3 - 2 * x);
}
