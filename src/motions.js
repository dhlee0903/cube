// 돌아가는 맛. 0→1로 가는 곡선과 걸리는 시간 배율
const backOut = (s) => (k) => 1 + (s + 1) * (k - 1) ** 3 + s * (k - 1) ** 2;
export const MOTIONS = {
  smooth: { ease: (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2), time: 1 },
  // 딸깍 맞물리며 살짝 넘어갔다 돌아온다
  snap: { ease: backOut(1.3), time: 0.85 },
  // 통통 튄다
  bouncy: { ease: (k) => (k >= 1 ? 1 : 1 - 2 ** (-9 * k) * Math.cos(k * 15)), time: 1.5 },
  // 묵직하게 천천히 출발해서 천천히 선다
  heavy: { ease: (k) => (k < 0.5 ? 16 * k ** 5 : 1 - (-2 * k + 2) ** 5 / 2), time: 1.45 },
  // 물속처럼 미끄러지듯
  fluid: { ease: (k) => -(Math.cos(Math.PI * k) - 1) / 2, time: 1.6 },
  // 기계처럼 확 돌고 탁 선다
  mechanical: { ease: (k) => (k >= 1 ? 1 : 1 - 2 ** (-10 * k)), time: 0.8 },
  // 출렁이며 자리 잡는다
  squish: { ease: (k) => 1 - (1 - k) ** 2 * Math.cos(k * 9), time: 1.35 },
  // 8비트 게임처럼 네 번에 끊어서
  stepped: { ease: (k) => Math.min(1, Math.floor(k * 4 + 0.001) / 4 + (k >= 1 ? 1 : 0)), time: 1 },
  // 스톱모션: 한 칸을 여섯 컷에 나눠서
  stop: { ease: (k) => (k >= 1 ? 1 : Math.floor(k * 6 + 0.001) / 6), time: 1.25 },
  // 버벅이다 건너뛴다
  stutter: {
    ease: (k) => {
      if (k >= 1) return 1;
      const step = Math.floor(k * 7);
      return Math.min(1, step / 6 + (Math.sin(step * 91.7) > 0.6 ? 0.12 : 0));
    },
    time: 1,
  },
};
