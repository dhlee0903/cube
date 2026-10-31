// 섞고 나서 첫 조각을 잡는 순간부터 다 맞출 때까지.
//
// off      섞기 전, 또는 맞추기 단추로 끝냈을 때. 안 보인다
// ready    섞였고 아직 안 건드렸다. 큐브를 둘러보는 건 괜찮다
// running  재는 중
// done     손으로 다 맞췄다

export class Timer {
  constructor(now = () => performance.now()) {
    this.now = now;
    this.reset();
  }

  reset() {
    this.state = 'off';
    this.begin = 0;
    this.end = 0;
    this.hinted = false;
  }

  arm() {
    this.reset();
    this.state = 'ready';
  }

  start() {
    if (this.state !== 'ready') return;
    this.state = 'running';
    this.begin = this.now();
  }

  stop() {
    if (this.state !== 'running') return;
    this.state = 'done';
    this.end = this.now();
  }

  elapsed() {
    if (this.state === 'running') return this.now() - this.begin;
    if (this.state === 'done') return this.end - this.begin;
    return 0;
  }
}

/** 1:05.32 처럼. 한 시간이 넘으면 분이 그냥 커진다. */
export function formatTime(ms) {
  const cs = Math.floor(ms / 10);
  const m = Math.floor(cs / 6000);
  const s = Math.floor(cs / 100) % 60;
  return `${m}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}
