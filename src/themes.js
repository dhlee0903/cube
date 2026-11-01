// 테마 하나는 하나의 장면이다. 큐브가 무엇으로 만들어졌고, 어디에 놓여 있고,
// 어떤 빛을 받고, 어떻게 움직이는지를 한 번에 정한다.
//
// faces 순서는 cube.js의 면 번호와 같다: R L U D F B
// 처음 보이는 면은 U(위), F(왼쪽 앞), R(오른쪽 앞)이다.
//
// bg        단색 바탕. 주소창 색과 글자 대비를 정할 때 쓴다
// backdrop  배경 장면(CSS background, 움직이지 않음)
// drift     그 위에 천천히 흐르는 빛(CSS background)
// form      조각 모양 { bevel 몸통 모서리, size 스티커 한 변, radius 스티커 모서리, depth 스티커 두께,
//           grid 겉이 실제로 솟는 질감용으로 스티커를 몇 칸으로 쪼갤지 }
// body      몸통 { color, roughness, metalness, glow(몸통 무늬가 내는 빛 색), opacity(1보다 작으면 비친다) }
// sticker   스티커 재질 { roughness, metalness, opacity }
// glow      스티커가 스스로 내는 빛. 숫자 하나 또는 면마다
// halo      스티커 둘레로 번지는 빛의 세기. haloMode가 'shadow'면 스티커 밑 그림자
// lights    조명 { sky, ground, hemi, key, fill, rim }. key 등은 [색, 세기, [x, y, z]]
// light     조명 전체 배율
// flicker   조명이 일렁이는 방식: candle, lava, lightning, aurora, disco
// env       주변 반사 세기
// surface   겉면 질감. surfaces.js
// motion    돌아가는 맛. motions.js
// pulse     큐브가 심장처럼 뛴다     jitter  가끔 화면이 튄다
// timerTop  배경 장면에 가리지 않게 타이머를 내릴 높이(px)
// ambient   늘 떠 있는 입자(하나 또는 둘). particles.js
//           mode: rise 위로, fall 아래로, float 떠다님, wind 옆으로, orbit 큐브 둘레를 돎
// burst     돌릴 때와 다 맞췄을 때 튀는 입자. turns: false면 다 맞췄을 때만

const svg = (w, h, body, aspect = 'none') => `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}' preserveAspectRatio='${aspect}'>${body}</svg>`,
)}")`;

// 매번 같은 자리에 찍히는 별
function stars(count, seed = 7) {
  const next = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const out = [];
  for (let i = 0; i < count; i++) {
    const x = (next() * 100).toFixed(1);
    const y = (next() * 100).toFixed(1);
    const r = next() < 0.2 ? 1.6 : 1;
    const a = (0.35 + next() * 0.55).toFixed(2);
    out.push(`radial-gradient(${r}px ${r}px at ${x}% ${y}%, rgba(255,255,255,${a}) 99%, transparent)`);
  }
  return out.join(', ');
}

// 초점이 나간 도시 불빛
function bokeh(count, seed = 23) {
  const next = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const colors = ['255,170,90', '255,90,120', '120,170,255', '255,220,140', '150,120,255'];
  const out = [];
  for (let i = 0; i < count; i++) {
    const x = (next() * 100).toFixed(1);
    const y = (30 + next() * 70).toFixed(1);
    const r = (2 + next() * 6).toFixed(1);
    const c = colors[Math.floor(next() * colors.length)];
    const a = (0.12 + next() * 0.25).toFixed(2);
    out.push(`radial-gradient(${r}vmin ${r}vmin at ${x}% ${y}%, rgba(${c},${a}) 0%, rgba(${c},${a}) 55%, transparent 72%)`);
  }
  return out.join(', ');
}

const PAPER_GRAIN = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .3 0 0 0 0 .25 0 0 0 0 .2 0 0 0 .11 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>",
)}")`;

export const THEMES = [
  {
    // 매장 진열대 위 새 큐브. 검은 플라스틱, 도톰한 비닐 스티커, 딸깍 맞물리는 손맛
    id: 'classic',
    name: '기본',
    bg: '#E6E2DB',
    ink: '#24221F',
    backdrop: [
      'radial-gradient(60% 45% at 50% 40%, #F7F5F1 0%, transparent 70%)',
      'linear-gradient(#ECE9E3 0%, #E2DDD5 62%, #D3CDC3 100%)',
    ].join(', '),
    form: { bevel: 0.08, size: 0.82, radius: 0.1, depth: 0.012 },
    body: { color: '#141414' },
    sticker: { roughness: 0.16 },
    faces: ['#C8102E', '#FF6A13', '#F7F7F2', '#FFD100', '#009A54', '#0046AD'],
    lights: {
      sky: '#ffffff', ground: '#8a8680', hemi: 2,
      key: ['#fff6ea', 2.2, [-4, 6, 5]], fill: ['#dfe8ff', 0.5, [6, -1, 4]], rim: ['#ffffff', 1.3, [3, 4, -6]],
    },
    surface: 'classic',
    sound: 'cube',
    motion: 'snap',
    burst: { shape: 'streak', colors: 'faces', size: 0.12, speed: 2.6, gravity: -5, drag: 1.3, life: 1.2, turns: false },
  },
  {
    // 비 오는 골목 벽돌담에 걸린 네온사인. 고르면 칸마다 지직거리다 켜진다
    id: 'neon',
    name: '네온',
    bg: '#0A0610',
    ink: '#F4E9FF',
    backdrop: [
      'radial-gradient(70% 60% at 50% 45%, transparent 30%, rgba(5,2,8,.85) 100%)',
      `${svg(80, 40, "<rect width='80' height='40' fill='#120a0f'/><g fill='#1f1116'><rect x='1' y='1' width='37' height='18' rx='1'/><rect x='41' y='1' width='37' height='18' rx='1'/><rect x='-19' y='21' width='37' height='18' rx='1'/><rect x='21' y='21' width='37' height='18' rx='1'/><rect x='61' y='21' width='37' height='18' rx='1'/></g>")} 0 0 / 120px 60px`,
      '#0A0610',
    ].join(', '),
    drift: [
      'radial-gradient(40% 32% at 50% 46%, rgba(255,45,149,.22), transparent 70%)',
      'radial-gradient(30% 26% at 22% 30%, rgba(0,229,255,.14), transparent 70%)',
      'radial-gradient(30% 26% at 80% 70%, rgba(166,61,255,.18), transparent 70%)',
    ].join(', '),
    form: { bevel: 0.06, size: 0.82, radius: 0.1, depth: 0 },
    body: { color: '#06040A', roughness: 0.2 },
    faces: ['#FF2D95', '#FF7A18', '#00E5FF', '#E8FF2A', '#3BFF6B', '#A63DFF'],
    halo: 0.55,
    lights: {
      sky: '#3a1550', ground: '#05030a', hemi: 0.9,
      key: ['#ff4fb0', 1, [-6, 2, 3]], fill: ['#22e5ff', 1, [6, 1, 3]], rim: ['#b05cff', 1.6, [0, 5, -6]],
    },
    surface: 'neon',
    sound: 'electric',
    motion: 'smooth',
    ambient: { mode: 'float', shape: 'glow', colors: 'faces', count: 30, size: 0.07, speed: 0.5, opacity: 0.5, additive: true },
    burst: { shape: 'glow', colors: 'faces', size: 0.12, speed: 3.6, gravity: 0, drag: 3, life: 0.55, additive: true },
  },
  {
    // 화산 속 용암 호수. 검게 굳은 현무암 판이 녹은 용암 위를 떠다니고 판 사이 틈이 빛난다.
    // 녹은 광물이 달라 면마다 불빛이 다르다(주황, 붉은 용암, 노란 유황, 파란 유황불, 초록 구리불, 하얀 쇳물)
    id: 'lava',
    name: '용암',
    bg: '#100504',
    ink: '#FFE3CC',
    backdrop: [
      'radial-gradient(90% 40% at 50% 115%, #A72A06 0%, #4A1205 45%, transparent 75%)',
      'linear-gradient(#170807, #0B0403)',
    ].join(', '),
    drift: [
      'radial-gradient(50% 30% at 50% 100%, rgba(255,120,20,.4), transparent 70%)',
      'radial-gradient(25% 18% at 20% 92%, rgba(255,180,0,.25), transparent 70%)',
      'radial-gradient(25% 18% at 82% 95%, rgba(255,70,0,.3), transparent 70%)',
    ].join(', '),
    form: { bevel: 0.14, size: 0.78, radius: 0.14, depth: 0 },
    body: { color: '#1B1311', roughness: 0.95, glow: '#FF4A06' },
    faces: ['#FF6A10', '#D0142A', '#FFD21E', '#2A7AFF', '#22E07A', '#FFF2DC'],
    glow: 0.6,
    halo: 0.25,
    lights: {
      sky: '#2a0c06', ground: '#ff5a10', hemi: 2,
      key: ['#ff7a2a', 1.8, [0, -6, 3]], fill: ['#ffb27a', 0.3, [4, 5, 4]], rim: ['#ff3a00', 1.5, [0, -2, -6]],
    },
    flicker: 'lava',
    surface: 'lava',
    sound: 'molten',
    motion: 'heavy',
    ambient: { mode: 'rise', shape: 'glow', colors: ['#FFC23A', '#FF7A1A', '#FF3B0A'], count: 120, size: 0.07, speed: 0.6, opacity: 0.95, additive: true },
    burst: { shape: 'glow', colors: ['#FFD24A', '#FF8A1A', '#FF4010'], size: 0.1, speed: 2.6, gravity: 1.6, drag: 1.5, life: 1.1, additive: true },
  },
  {
    // 물에 잠긴 타일 큐브. 칸마다 맑은 물 아래 수영장 타일이 깔려 일렁이고, 그 위로 빛그물이 춤춘다.
    // 위에서 빛줄기가 내리고, 느릿하게 미끄러지며, 돌리면 거품이 솟는다
    id: 'water',
    name: '물',
    bg: '#06293B',
    ink: '#DDF6FF',
    backdrop: [
      'repeating-conic-gradient(from 160deg at 50% -25%, rgba(190,245,255,.07) 0deg 3deg, transparent 3deg 9deg, rgba(190,245,255,.04) 9deg 11deg, transparent 11deg 20deg)',
      'radial-gradient(80% 40% at 50% -5%, rgba(130,225,255,.4), transparent 70%)',
      'linear-gradient(#0B5070, #06304A 55%, #031623)',
    ].join(', '),
    drift: [
      'radial-gradient(35% 22% at 30% 20%, rgba(170,240,255,.18), transparent 70%)',
      'radial-gradient(30% 20% at 70% 30%, rgba(120,220,255,.14), transparent 70%)',
    ].join(', '),
    form: { bevel: 0.08, size: 0.9, radius: 0.1, depth: 0.02 },
    body: { color: '#0A3A5A', roughness: 0.1 },
    sticker: { roughness: 0.1 },
    faces: ['#FF6A5A', '#F4DC8A', '#2FE0D8', '#0E7C6A', '#2A6AE8', '#F2F8FA'],
    env: 0.35,
    lights: {
      sky: '#bff4ff', ground: '#052a44', hemi: 1.1,
      key: ['#d8fbff', 1.6, [0, 8, 3]], fill: ['#2a86ff', 0.5, [5, -2, 4]], rim: ['#7fe8ff', 1, [0, 3, -6]],
    },
    surface: 'water',
    sound: 'water',
    motion: 'fluid',
    ambient: { mode: 'rise', shape: 'bubble', colors: ['#CFF7FF'], count: 60, size: 0.17, speed: 0.35, opacity: 0.75 },
    burst: { shape: 'bubble', colors: ['#DFFAFF', '#BFF4FF'], size: 0.15, speed: 1.6, gravity: 2.6, drag: 1.8, life: 1.5, opacity: 0.9 },
  },
  {
    // 숲속 그루터기 위 나무 블록. 이끼 방석, 나뭇잎 사이로 흘러가는 햇빛 조각, 반딧불과 낙엽
    id: 'forest',
    name: '숲',
    bg: '#16221A',
    ink: '#E6EEDD',
    backdrop: [
      `${svg(100, 60, "<g fill='#0a120c'><rect x='4' y='0' width='6' height='60'/><rect x='19' y='0' width='3' height='60'/><rect x='73' y='0' width='8' height='60'/><rect x='91' y='0' width='4' height='60'/><path d='M0 60 C10 52 18 55 26 58 C36 50 46 56 54 59 C66 52 78 56 100 54 V60Z'/></g>")} center / 100% 100% no-repeat`,
      'radial-gradient(70% 50% at 50% -10%, rgba(210,240,140,.25), transparent 70%)',
      'linear-gradient(#22351F, #101A12)',
    ].join(', '),
    drift: 'repeating-linear-gradient(105deg, transparent 0 7%, rgba(230,255,170,.06) 8% 10%, transparent 11% 19%)',
    form: { bevel: 0.05, size: 0.8, radius: 0.16, depth: 0.025 },
    body: { color: '#3A2A1A', roughness: 0.8 },
    sticker: { roughness: 0.85 },
    faces: ['#C2452D', '#7A5230', '#EDE6D2', '#E3A23B', '#84B04F', '#2E6A47'],
    lights: {
      sky: '#f6ffd8', ground: '#1d2a14', hemi: 1.9,
      key: ['#fff1c4', 2.3, [-5, 7, 3]], fill: ['#7fa86a', 0.35, [5, 0, 4]], rim: ['#e8ff9a', 0.9, [3, 5, -5]],
    },
    surface: 'forest',
    sound: 'nature',
    motion: 'smooth',
    ambient: [
      { mode: 'float', shape: 'glow', colors: ['#E4FF7A', '#B6FF5C'], count: 28, size: 0.11, speed: 0.4, opacity: 0.95, additive: true },
      { mode: 'fall', shape: 'leaf', colors: ['#8DB255', '#E3A23B', '#C2452D', '#6B8F3A'], count: 16, size: 0.22, speed: 0.22, opacity: 0.95 },
    ],
    burst: { shape: 'leaf', colors: ['#8DB255', '#E3A23B', '#2E6A47', '#C2452D'], size: 0.18, speed: 1.6, gravity: -1.2, drag: 2.4, life: 1.8 },
  },
  {
    // 바닷가에 해가 진다. 낮게 깔린 주황 햇빛이 옆에서 들고, 법랑 면에 수평선이 비치고, 새가 지나간다
    id: 'sunset',
    name: '노을',
    bg: '#2B1534',
    ink: '#FFF1E6',
    backdrop: [
      'repeating-linear-gradient(0deg, rgba(255,190,120,.16) 0 2px, transparent 2px 10px) bottom / 100% 34% no-repeat',
      'linear-gradient(transparent 66%, #3A1B4A 66%, #1E0F2A 100%)',
      'radial-gradient(12vmax 12vmax at 50% 66%, #FFE2A0 0%, #FFB45A 40%, rgba(255,120,80,0) 72%)',
      'linear-gradient(180deg, #2E1A4F 0%, #8A3A7A 30%, #F0646A 52%, #FFA25A 66%)',
    ].join(', '),
    drift: 'radial-gradient(40% 25% at 50% 64%, rgba(255,200,120,.25), transparent 70%)',
    form: { bevel: 0.1, size: 0.84, radius: 0.14, depth: 0.015 },
    body: { color: '#22132E', roughness: 0.3 },
    sticker: { roughness: 0.12 },
    faces: ['#FF5E7E', '#B5179E', '#FFD166', '#6A2EA8', '#FF8E3C', '#4CC9F0'],
    glow: 0.08,
    lights: {
      sky: '#ffc49a', ground: '#5a2a6a', hemi: 2.4,
      key: ['#ff9a4c', 3, [7, 1.5, 3]], fill: ['#c27be8', 1.1, [-6, 1, 4]], rim: ['#ffd29a', 1.4, [2, 2, -6]],
    },
    surface: 'sunset',
    sound: 'nature',
    motion: 'smooth',
    ambient: [
      { mode: 'wind', shape: 'bird', colors: ['#2A1430'], count: 7, size: 0.34, speed: 0.3, opacity: 0.9 },
      { mode: 'float', shape: 'glow', colors: ['#FFE0A8', '#FFB0C0'], count: 26, size: 0.07, speed: 0.3, opacity: 0.6, additive: true },
    ],
    burst: { shape: 'glow', colors: ['#FFD9A0', '#FF8E9E', '#FFFFFF'], size: 0.1, speed: 1.6, gravity: 0.5, drag: 2, life: 1.2, additive: true },
  },
  {
    // 궤도를 도는 우주 정거장. 선체 판과 깜빡이는 표시등, 칸마다 성운이 비치는 창. 해 하나만 세게 비춘다
    id: 'space',
    name: '우주',
    bg: '#05050F',
    ink: '#E9E8FF',
    backdrop: [
      'radial-gradient(circle at 36% 34%, #F1DCFF 0%, #A066E0 22%, #3B1670 52%, #12062A 64%, transparent 66%) 86% 16% / 22vmin 22vmin no-repeat',
      'radial-gradient(closest-side, transparent 72%, rgba(230,200,255,.45) 76%, transparent 82%) 86% 17.5% / 38vmin 8vmin no-repeat',
      stars(90),
      'radial-gradient(45% 35% at 22% 70%, rgba(0,140,255,.16), transparent 70%)',
      '#05050F',
    ].join(', '),
    drift: 'radial-gradient(35% 28% at 70% 60%, rgba(160,80,255,.14), transparent 70%)',
    form: { bevel: 0.04, size: 0.76, radius: 0.06, depth: 0 },
    body: { color: '#2A2C36', roughness: 0.5, metalness: 0.5, glow: '#FF4040' },
    faces: ['#FF4D6D', '#FFB347', '#F4F1FF', '#00D1B2', '#7B5CFF', '#E040FB'],
    glow: 0.3,
    lights: {
      sky: '#3a3a6a', ground: '#000000', hemi: 0.45,
      key: ['#ffffff', 3.3, [-7, 3, 4]], fill: ['#6b5cff', 0.25, [6, -2, 3]], rim: ['#9fd8ff', 1.3, [4, 2, -6]],
    },
    env: 0.3,
    surface: 'space',
    sound: 'space',
    motion: 'fluid',
    ambient: { mode: 'orbit', shape: 'glow', colors: ['#FFFFFF', '#CFC8FF', '#A8E8FF'], count: 200, size: 0.05, speed: 1, additive: true },
    burst: { shape: 'star', colors: ['#FFFFFF', '#B9A8FF', '#7FE8FF'], size: 0.14, speed: 1.3, gravity: 0, drag: 0.7, life: 1.6, additive: true },
  },
  {
    // 사탕 가게 진열장. 동그랗게 볼록한 알사탕, 줄무늬 사탕 몸통, 돌리면 통통 튄다
    id: 'candy',
    name: '사탕',
    bg: '#FCE4EE',
    ink: '#4B2340',
    backdrop: [
      'radial-gradient(70% 60% at 50% 45%, rgba(255,255,255,.55), transparent 75%)',
      'repeating-linear-gradient(45deg, #FFE1EC 0 26px, #FFF0F5 26px 52px)',
    ].join(', '),
    drift: 'radial-gradient(30% 25% at 25% 25%, rgba(255,255,255,.4), transparent 70%)',
    form: { bevel: 0.2, size: 0.74, radius: 0.37, depth: 0.06 },
    body: { color: '#FFD4E5', roughness: 0.12 },
    sticker: { roughness: 0.06 },
    faces: ['#FF3D8B', '#FF9F45', '#8E6CFF', '#FFE45C', '#47D9B0', '#3FA2FF'],
    lights: {
      sky: '#ffffff', ground: '#ffd6e8', hemi: 2.3,
      key: ['#ffffff', 1.7, [-3, 6, 5]], fill: ['#ffd0f0', 0.6, [6, 0, 4]], rim: ['#ffffff', 0.9, [0, 4, -6]],
    },
    surface: 'candy',
    sound: 'candy',
    motion: 'bouncy',
    ambient: { mode: 'fall', shape: 'streak', colors: 'faces', count: 55, size: 0.1, speed: 0.3, opacity: 0.85 },
    burst: { shape: 'streak', colors: 'faces', size: 0.13, speed: 2.6, gravity: -5, drag: 1.2, life: 1.2 },
  },
  {
    // 모래언덕 너머 신전의 돌 블록. 바랜 채색 타일에 면마다 다른 그림이 새겨져 있다. 한낮의 해
    id: 'desert',
    name: '사막',
    bg: '#EED6AE',
    ink: '#3D2B1F',
    backdrop: [
      `${svg(100, 40, "<path d='M0 20 C16 11 30 13 46 19 S78 29 100 15 V40 H0Z' fill='#E2B87E'/><path d='M0 29 C20 21 40 25 58 30 S86 35 100 27 V40 H0Z' fill='#D19F62'/><path d='M0 35 C25 30 55 34 100 32 V40 H0Z' fill='#BF8A4E'/>")} bottom / 100% 36% no-repeat`,
      'radial-gradient(30% 30% at 78% 18%, rgba(255,255,240,.9) 0%, rgba(255,240,200,.35) 30%, transparent 70%)',
      'linear-gradient(#BFDDF2 0%, #E8E4D2 55%, #F2DDB6 70%)',
    ].join(', '),
    drift: 'linear-gradient(transparent 55%, rgba(240,210,160,.35) 70%, transparent 85%)',
    form: { bevel: 0.03, size: 0.86, radius: 0.03, depth: 0.012 },
    body: { color: '#8A6440', roughness: 0.95 },
    sticker: { roughness: 0.9 },
    faces: ['#B8442C', '#2FA7A0', '#F2E6CC', '#E0A93A', '#3E7D4A', '#2F5FA8'],
    lights: {
      sky: '#bfe3ff', ground: '#c9955a', hemi: 1.9,
      key: ['#fff2d6', 3.1, [4, 8, 3]], fill: ['#ffcf8a', 0.4, [-6, -1, 4]], rim: ['#ffffff', 0.5, [0, 3, -6]],
    },
    surface: 'desert',
    sound: 'stone',
    motion: 'heavy',
    ambient: { mode: 'wind', shape: 'dot', colors: ['#C9A06A', '#B98C55'], count: 160, size: 0.035, speed: 0.7, opacity: 0.55 },
    burst: { shape: 'dot', colors: ['#D9B57E', '#B98C55'], size: 0.06, speed: 1.6, gravity: -0.6, drag: 3.2, life: 1.3 },
  },
  {
    // 눈밭 위 얼음 조각. 색은 얼음 속에 갇혀 있고, 가장자리부터 성에가 낀다. 눈송이가 내린다
    id: 'ice',
    name: '얼음',
    bg: '#D9E9F2',
    ink: '#1F3A52',
    backdrop: [
      `${svg(100, 40, "<path d='M0 26 C20 16 35 22 50 20 S80 14 100 22 V40 H0Z' fill='#EEF6FB'/><path d='M0 32 C25 25 60 31 100 28 V40 H0Z' fill='#FFFFFF'/>")} bottom / 100% 34% no-repeat`,
      'radial-gradient(70% 50% at 50% 35%, #F6FCFF, transparent 70%)',
      'linear-gradient(#CFE3EF, #E4F0F7 70%)',
    ].join(', '),
    form: { bevel: 0.1, size: 0.8, radius: 0.12, depth: 0.02 },
    body: { color: '#EAF4FA', roughness: 0.06 },
    sticker: { roughness: 0.18 },
    faces: ['#F28DB5', '#A996F2', '#63C6F2', '#2E5C9E', '#72E0C4', '#3F8A86'],
    env: 0.45,
    lights: {
      sky: '#eaf6ff', ground: '#9fc4dd', hemi: 2,
      key: ['#f2fbff', 2, [-3, 7, 4]], fill: ['#bfe0ff', 0.6, [6, 0, 4]], rim: ['#cfeeff', 1.5, [2, 4, -6]],
    },
    light: 0.9,
    surface: 'ice',
    sound: 'glass',
    motion: 'snap',
    ambient: { mode: 'fall', shape: 'flake', colors: ['#FFFFFF', '#F2FAFF'], count: 70, size: 0.15, speed: 0.22, opacity: 0.95 },
    burst: { shape: 'flake', colors: ['#FFFFFF', '#CDEBFF', '#9FD6F5'], size: 0.12, speed: 2, gravity: -2, drag: 2, life: 1.3 },
  },
  {
    // 정밀 가공한 알루미늄 부품. 동심원 결이 난 캡, 모서리 모따기, 나사 박힌 몸통. 기계처럼 탁탁
    id: 'metal',
    name: '금속',
    bg: '#1B1C1F',
    ink: '#E8E8EA',
    backdrop: [
      'radial-gradient(60% 50% at 50% 42%, rgba(70,74,82,.6), transparent 70%)',
      'radial-gradient(circle, rgba(255,255,255,.06) 1px, transparent 1.6px) 0 0 / 12px 12px',
      'linear-gradient(#222327, #111215)',
    ].join(', '),
    form: { bevel: 0.05, size: 0.86, radius: 0.08, depth: 0.05 },
    body: { color: '#2A2C30', roughness: 0.35, metalness: 0.8 },
    sticker: { roughness: 0.22, metalness: 1 },
    faces: ['#D0283E', '#D07A48', '#DADDE2', '#E6B43C', '#2FAE6E', '#3C6FD8'],
    env: 1.3,
    lights: {
      sky: '#dfe6f0', ground: '#202226', hemi: 0.9,
      key: ['#ffffff', 2, [-4, 6, 5]], fill: ['#9fb4d0', 0.4, [6, -1, 3]], rim: ['#ffffff', 2.4, [3, 3, -6]],
    },
    light: 0.6,
    surface: 'metal',
    sound: 'metal',
    motion: 'mechanical',
    burst: { shape: 'glow', colors: ['#FFF2B0', '#FFC14A', '#FF8A2A'], size: 0.06, speed: 4, gravity: -9, drag: 0.6, life: 0.65, additive: true },
  },
  {
    // 모눈종이 위에 놓인 종이 공작. 골판지 상자에 색종이를 찢어 붙였고, 종이마다 살짝 그림자가 진다
    id: 'paper',
    name: '종이',
    bg: '#F3EFE5',
    ink: '#2A2622',
    backdrop: [
      PAPER_GRAIN,
      'linear-gradient(rgba(70,110,190,.13) 1px, transparent 1px) 0 0 / 24px 24px',
      'linear-gradient(90deg, rgba(70,110,190,.13) 1px, transparent 1px) 0 0 / 24px 24px',
      '#F6F2E8',
    ].join(', '),
    form: { bevel: 0.02, size: 0.82, radius: 0.02, depth: 0 },
    body: { color: '#B8956A', roughness: 1 },
    sticker: { roughness: 1 },
    faces: ['#D7402B', '#7B3F61', '#F4F1EA', '#E8B22E', '#5E9C6B', '#2C4E8C'],
    halo: 0.4,
    haloMode: 'shadow',
    lights: {
      sky: '#fffaf0', ground: '#b8a888', hemi: 2.3,
      key: ['#fff8ec', 1.7, [-4, 7, 6]], fill: ['#ffffff', 0.3, [5, -1, 4]], rim: ['#ffffff', 0, [0, 3, -6]],
    },
    surface: 'paper',
    sound: 'paper',
    motion: 'smooth',
    burst: { shape: 'streak', colors: 'faces', size: 0.15, speed: 1.6, gravity: -1.6, drag: 2.4, life: 1.8 },
  },
  {
    // 이삿짐 창고. 칸마다 골판지 상자 겉면: 겉종이 아래 골이 줄지어 은은하게 오르내리고, 종이 섬유와 재생지 티끌,
    // 칸마다 다른 취급 표시(위쪽 화살표, 우산, 깨지는 잔, 재활용), 몇 칸엔 기포 갇힌 갈색 포장 테이프, 눌려 찌그러진 자국과
    // 접힌 금. 면마다 상자 빛깔이 다르다(크라프트, 흰 상자, 색 골판지)
    id: 'box',
    name: '골판지',
    bg: '#D8C8B0',
    ink: '#2A2018',
    backdrop: [
      'radial-gradient(60% 45% at 50% 25%, rgba(255,250,235,.5), transparent 70%)',
      'repeating-linear-gradient(90deg, rgba(90,60,30,.08) 0 3px, transparent 3px 90px)',
      'radial-gradient(80% 65% at 50% 45%, #E2D2BA, #A8906E)',
    ].join(', '),
    form: { bevel: 0.05, size: 0.95, radius: 0.04, grid: 48 },
    body: { color: '#6A4A2E', roughness: 0.9 },
    faces: ['#B8875A', '#E6E0D4', '#B8403A', '#3A64A8', '#4A8A5A', '#E0B848'],
    lights: {
      sky: '#fff8ec', ground: '#8a7058', hemi: 1.4,
      key: ['#fff2e0', 2.1, [-4, 6, 5]], fill: ['#e8ecff', 0.45, [6, 0, 3]], rim: ['#ffffff', 0.9, [0, 4, -6]],
    },
    burst: { shape: 'square', colors: ['#B8875A', '#8A6038'], size: 0.06, speed: 1.6, gravity: 2.5, drag: 1.2, life: 1.1 },
    surface: 'box',
    sound: 'paper',
    motion: 'heavy',
  },
  {
    // 테슬라 코일 실험실. 칸마다 플라스마 구가 들어 있어 번개 가닥이 꿈틀거리고, 손가락을 대면 그쪽으로 몰려든다.
    // 가끔 방 전체가 번쩍인다
    id: 'electric',
    name: '전기',
    bg: '#05070F',
    ink: '#E6F0FF',
    backdrop: [
      'linear-gradient(rgba(80,140,255,.05) 1px, transparent 1px) 0 0 / 40px 40px',
      'linear-gradient(90deg, rgba(80,140,255,.05) 1px, transparent 1px) 0 0 / 40px 40px',
      'radial-gradient(50% 40% at 50% 45%, rgba(40,80,170,.3), transparent 70%)',
      'linear-gradient(#070A16, #03040A)',
    ].join(', '),
    drift: [
      'radial-gradient(40% 30% at 50% 45%, rgba(80,150,255,.18), transparent 70%)',
      'radial-gradient(30% 25% at 85% 15%, rgba(140,90,255,.16), transparent 70%)',
    ].join(', '),
    form: { bevel: 0.06, size: 0.8, radius: 0.08, depth: 0.02 },
    body: { color: '#11141C', roughness: 0.3, metalness: 0.5, glow: '#8FCBFF' },
    faces: ['#FF3048', '#A05CFF', '#F0F6FF', '#FFE53B', '#3DFF9E', '#2DA8FF'],
    glow: 0.5,
    halo: 0.3,
    env: 0.4,
    lights: {
      sky: '#1a2a55', ground: '#020308', hemi: 0.8,
      key: ['#9fd0ff', 1.1, [-5, 5, 4]], fill: ['#5c4dff', 0.5, [6, -2, 3]], rim: ['#cfe8ff', 1, [2, 4, -6]],
    },
    flicker: 'lightning',
    surface: 'electric',
    sound: 'electric',
    motion: 'snap',
    ambient: { mode: 'float', shape: 'glow', colors: ['#BFE3FF', '#7FB8FF', '#FFFFFF'], count: 50, size: 0.06, speed: 1.4, opacity: 0.8, additive: true },
    burst: { shape: 'streak', colors: ['#FFFFFF', '#9FD4FF', '#5C9DFF'], size: 0.1, speed: 5, gravity: 0, drag: 4.5, life: 0.4, additive: true },
  },
  {
    // 고전압 실험실. 다 맞추면 면 하나가 테슬라 코일 2차 권선의 한 토막이다. 에나멜 입힌 구리선이 촘촘히 감겨 한 가닥씩 솟았고,
    // 이따금 보랏빛 번개가 면 위로 탁 튀어 갈라지며 지나간 자리의 선이 달아오른다. 가장자리엔 코로나. 에나멜 빛깔이 곧 면 색
    id: 'tesla',
    name: '테슬라 코일',
    bg: '#07060C',
    ink: '#E8E4FF',
    backdrop: [
      'radial-gradient(40% 30% at 50% 50%, rgba(140,110,255,.18), transparent 70%)',
      'repeating-linear-gradient(0deg, rgba(255,255,255,.025) 0 1px, transparent 1px 6px)',
      'radial-gradient(80% 65% at 50% 45%, #15122A, #030206)',
    ].join(', '),
    form: { bevel: 0.06, size: 0.95, radius: 0.06, grid: 56 },
    body: { color: '#1A1820', roughness: 0.35, metalness: 0.5 },
    faces: ['#C87533', '#B83226', '#2E8A4A', '#2E58B0', '#D8B13A', '#B8BCC4'],
    lights: {
      sky: '#e8e4ff', ground: '#100818', hemi: 0.8,
      key: ['#ffffff', 2.0, [-4, 6, 5]], fill: ['#9a80ff', 0.5, [6, 0, 3]], rim: ['#c0a8ff', 1.2, [2, 4, -6]],
    },
    env: 0.9,
    flicker: 'lightning',
    ambient: { mode: 'float', shape: 'glow', colors: ['#B8A0FF', '#FFFFFF'], count: 20, size: 0.03, speed: 0.3, opacity: 0.6, additive: true },
    burst: { shape: 'streak', colors: ['#E0D0FF', '#FFFFFF', '#9A7CFF'], size: 0.14, speed: 3, gravity: 0, drag: 2.6, life: 0.5, additive: true },
    surface: 'tesla',
    sound: 'electric',
    motion: 'snap',
  },

  {
    // 정육점 갈고리에 걸린 덩어리처럼, 그런데 아직 살아 있다. 울퉁불퉁 솟은 생살, 고름 주머니,
    // 멍과 마블링, 번들거리는 겉. 심장처럼 뛰고 가끔 움찔한다. 파리가 꼬이고 피가 맺혀 떨어진다
    id: 'flesh',
    name: '살점',
    bg: '#1E0809',
    ink: '#FFE4DE',
    backdrop: [
      `${svg(100, 100, "<g fill='none' stroke='#4A0B12' stroke-linecap='round'><path d='M-5 20 C20 25 30 5 55 12 S90 30 105 18' stroke-width='1.8'/><path d='M30 12 C35 25 25 35 32 48' stroke-width='1'/><path d='M-5 70 C15 60 35 80 60 72 S95 60 105 75' stroke-width='2'/><path d='M60 72 C62 85 75 90 78 105' stroke-width='1.2'/><path d='M80 -5 C75 15 90 25 84 45 S92 60 88 72' stroke-width='1.3'/><path d='M8 40 C14 48 10 58 18 64' stroke-width='.8'/></g>", 'xMidYMid slice')} center / cover no-repeat`,
      'radial-gradient(48% 42% at 50% 45%, #7A222A 0%, #4A1218 45%, #260A0D 75%, #120405 100%)',
    ].join(', '),
    drift: 'radial-gradient(40% 36% at 50% 45%, rgba(255,70,80,.16), transparent 70%)',
    form: { bevel: 0.2, size: 0.92, radius: 0.3, grid: 40 },
    body: { color: '#4A0E14', roughness: 0.08 },
    faces: ['#B8202C', '#5B6EA6', '#EBD2B4', '#C9A93A', '#E07A84', '#74284F'],
    env: 0.55,
    lights: {
      sky: '#ffc4b4', ground: '#3a0a0e', hemi: 1.9,
      key: ['#fff2ea', 2.7, [-3, 6, 5]], fill: ['#ff6070', 0.9, [6, -1, 4]], rim: ['#ffa090', 1.8, [0, 3, -6]],
    },
    surface: 'flesh',
    sound: 'flesh',
    motion: 'squish',
    pulse: true,
    ambient: [
      { mode: 'fall', shape: 'drip', colors: ['#7A0712', '#A0101E'], count: 22, size: 0.09, speed: 0.6, opacity: 0.95 },
      { mode: 'buzz', shape: 'fly', colors: ['#0B0907'], count: 6, size: 0.14, speed: 1.6, opacity: 1 },
    ],
    burst: { shape: 'drip', colors: ['#7A0712', '#B0182A', '#5A0A12'], size: 0.09, speed: 2.8, gravity: -8, drag: 0.8, life: 1.2 },
  },
  {
    // 심해에서 끌어올린 것. 칸마다 진짜로 솟은 눈알이 하나, 셋, 또는 촉수 빨판.
    // 두툼한 눈꺼풀이 덮였다 열리고, 동공이 구면 위를 굴러 보는 사람을 쳐다본다. 잡으면 일제히 질끈
    id: 'eldritch',
    name: '크툴루',
    bg: '#06100D',
    ink: '#D8F4E2',
    backdrop: [
      `${svg(100, 70, "<g fill='#0A231B'><path d='M6 70 C10 52 0 40 9 26 C13 19 20 21 17 28 C13 37 19 52 15 70Z'/><path d='M84 70 C80 55 92 44 86 30 C83 23 90 18 93 25 C97 36 89 52 93 70Z'/><path d='M30 70 C33 62 26 56 31 50 C34 47 37 49 35 53 C33 58 37 64 36 70Z'/><path d='M64 70 C62 61 70 57 66 49 C64 45 68 43 70 47 C73 54 67 61 70 70Z'/></g><g fill='#0F2E24'><circle cx='12.5' cy='40' r='1'/><circle cx='13.5' cy='47' r='.9'/><circle cx='88' cy='38' r='1'/><circle cx='87.5' cy='45' r='.9'/></g>")} bottom / 100% 70% no-repeat`,
      'radial-gradient(50% 42% at 50% 44%, #1B3A33 0%, #0C1F1A 50%, transparent 80%)',
      'radial-gradient(70% 50% at 50% 110%, rgba(40,160,110,.35), transparent 70%)',
      'linear-gradient(#081612, #020504)',
    ].join(', '),
    drift: [
      'radial-gradient(45% 35% at 50% 40%, rgba(90,40,140,.28), transparent 70%)',
      'radial-gradient(30% 20% at 50% 100%, rgba(60,255,160,.14), transparent 70%)',
    ].join(', '),
    form: { bevel: 0.16, size: 0.92, radius: 0.26, grid: 44 },
    body: { color: '#13241E', roughness: 0.1, glow: '#39FF9C' },
    faces: ['#7CD04E', '#22A39A', '#E0789C', '#8B52C0', '#D2652E', '#4A8AE0'],
    env: 0.6,
    lights: {
      sky: '#7fc0a4', ground: '#05140e', hemi: 1.6,
      key: ['#d4ffe6', 2, [-2, -3, 6]], fill: ['#a888ff', 0.9, [6, 3, 3]], rim: ['#3dff9a', 1.9, [0, 4, -6]],
    },
    surface: 'eldritch',
    sound: 'eldritch',
    motion: 'fluid',
    ambient: { mode: 'rise', shape: 'glow', colors: ['#6CFFB0', '#3DD68C', '#9C7BFF'], count: 60, size: 0.07, speed: 0.28, opacity: 0.7, additive: true },
    burst: { shape: 'drip', colors: ['#3DFF9A', '#22A39A', '#9C7BFF'], size: 0.09, speed: 2.2, gravity: -4, drag: 1.2, life: 1.2 },
  },
  {
    // 벨벳 위 보석함. 금판에 박힌 원석이 솟아 있고, 깎인 면마다 빛이 갈라지며 무지갯빛이 튄다
    id: 'gem',
    name: '보석',
    bg: '#14070E',
    ink: '#F8E9D2',
    backdrop: [
      'repeating-linear-gradient(100deg, rgba(255,255,255,.03) 0 5%, rgba(0,0,0,.18) 8% 14%, rgba(255,255,255,.035) 17% 21%)',
      'radial-gradient(80% 60% at 50% 40%, #4A1430 0%, #1F0814 60%, #0C0307 100%)',
    ].join(', '),
    drift: 'radial-gradient(35% 28% at 50% 42%, rgba(255,220,170,.12), transparent 70%)',
    form: { bevel: 0.06, size: 0.76, radius: 0.06, depth: 0.09 },
    body: { color: '#B8902E', roughness: 0.3, metalness: 1 },
    sticker: { roughness: 0.04 },
    faces: ['#E0115F', '#9B4DCA', '#EAF6FF', '#FFB627', '#0FA968', '#1F4FD1'],
    env: 1,
    lights: {
      sky: '#fff2e0', ground: '#2a0c18', hemi: 1.1,
      key: ['#fff8ee', 2.7, [-3, 7, 5]], fill: ['#ffd6a8', 0.6, [6, 1, 4]], rim: ['#ffffff', 2.1, [3, 4, -6]],
    },
    light: 0.8,
    surface: 'gem',
    sound: 'crystal',
    motion: 'smooth',
    ambient: { mode: 'float', shape: 'star', colors: ['#FFF6D8', '#FFFFFF', '#FFD98A'], count: 36, size: 0.14, speed: 0.5, opacity: 0.9, additive: true },
    burst: { shape: 'star', colors: 'faces', size: 0.18, speed: 2.6, gravity: -3, drag: 1.4, life: 1, additive: true },
  },
  {
    // 고장 난 CRT 화면으로 보는 큐브. 큐브 자체는 매끈한 네온 플라스틱이고, 화면 전체에 필터가 걸린다: 늘 조금 어긋난 색,
    // 주사선과 잡음, 위에서 아래로 굴러가는 테이프 띠, 이따금 가로 띠째 찢어져 밀리고 네모 덩어리가 깨진다.
    // 돌리면 더 심해지고, 아주 가끔 신호가 끊겨 화면 전체가 지지직거린다. 버벅이며 건너뛰는 회전
    id: 'glitch',
    name: '글리치',
    bg: '#0A0A0C',
    ink: '#F0F0F0',
    backdrop: [
      'radial-gradient(75% 65% at 50% 45%, transparent 55%, rgba(0,0,0,.85) 100%)',
      'radial-gradient(60% 50% at 50% 45%, #1C1C26, #0A0A0C 70%)',
    ].join(', '),
    form: { bevel: 0.05, size: 0.88, radius: 0.06, depth: 0.03 },
    body: { color: '#121214', roughness: 0.35 },
    sticker: { roughness: 0.22 },
    faces: ['#FF0055', '#B000FF', '#F4F4F4', '#FFD400', '#00FFC8', '#2F5BFF'],
    glow: 0.35,
    lights: {
      sky: '#d0d0ff', ground: '#101018', hemi: 1.6,
      key: ['#ffffff', 1.6, [-4, 5, 5]], fill: ['#ff0055', 0.6, [6, 0, 3]], rim: ['#00ffc8', 1.2, [-2, 3, -6]],
    },
    filter: 'glitch',
    surface: 'plain',
    sound: 'glitch',
    motion: 'stutter',
    jitter: true,
    ambient: { mode: 'float', shape: 'square', colors: 'faces', count: 30, size: 0.06, speed: 0.8, opacity: 0.8 },
    burst: { shape: 'square', colors: 'faces', size: 0.08, speed: 3, gravity: 0, drag: 3.2, life: 0.5 },
  },
  {
    // 8비트 게임 화면. 큐브를 낮은 해상도로 그려 칸칸이 키우고, 16색 팔레트로 줄이면서 그늘과 빛을 바둑판 점(디더링)으로
    // 섞고, 스프라이트처럼 검은 테두리를 두른다. 스티커는 도톰한 블록이라 모서리 빛과 그늘이 점으로 찍힌다. 칸칸이 끊기는 움직임
    id: 'pixel',
    name: '픽셀',
    bg: '#5C94FC',
    ink: '#0E0F1A',
    backdrop: [
      `${svg(64, 16, "<g fill='#ffffff'><rect x='6' y='4' width='10' height='4'/><rect x='4' y='6' width='16' height='4'/><rect x='10' y='2' width='6' height='3'/><rect x='38' y='8' width='8' height='3'/><rect x='36' y='10' width='13' height='3'/></g>", 'xMidYMid meet')} 0 6% / 320px 80px repeat-x`,
      `${svg(100, 30, "<g shape-rendering='crispEdges'><path d='M0 30 V18 H6 V14 H12 V10 H22 V14 H28 V18 H34 V30Z' fill='#00A800'/><path d='M50 30 V22 H56 V16 H66 V12 H74 V16 H82 V22 H90 V30Z' fill='#00A800'/><rect x='14' y='16' width='2' height='2' fill='#005800'/><rect x='66' y='18' width='2' height='2' fill='#005800'/><rect x='0' y='26' width='100' height='4' fill='#C84C0C'/><rect x='0' y='26' width='100' height='1' fill='#FCA044'/></g>")} bottom / 100% 30% no-repeat`,
      'linear-gradient(#6EA2FF, #5C94FC 70%)',
    ].join(', '),
    form: { bevel: 0.05, size: 0.84, radius: 0.04, depth: 0.06 },
    body: { color: '#1D2B53', roughness: 0.6 },
    sticker: { roughness: 0.45 },
    faces: ['#FF004D', '#29ADFF', '#FFF1E8', '#FFEC27', '#00E436', '#FFA300'],
    lights: {
      sky: '#ffffff', ground: '#8890b0', hemi: 1.8,
      key: ['#ffffff', 2.2, [-3, 6, 5]], fill: ['#c8d8ff', 0.4, [5, 0, 4]], rim: ['#ffffff', 0.6, [0, 3, -6]],
    },
    filter: 'pixel',
    surface: 'plain',
    sound: 'pixel',
    motion: 'stepped',
    ambient: { mode: 'rise', shape: 'square', colors: ['#F8D030', '#FFFFFF'], count: 18, size: 0.08, speed: 0.35, opacity: 0.85 },
    burst: { shape: 'square', colors: 'faces', size: 0.11, speed: 2.8, gravity: -8, drag: 0.5, life: 1 },
  },
  {
    // 휴대용 게임기의 초록 액정. 네 단 초록으로만 그리고 화소 사이로 옅은 격자가 비치며, 짙은 화소는 뒤판에 살짝 그림자를 드리운다.
    // 색이 넷뿐이라 면은 블록 속 그림으로 갈린다(민무늬, 안쪽 테, 가운데 네모, 빗금, 네 칸, 가로줄). 칸칸이 끊기는 움직임
    id: 'handheld',
    name: '휴대 게임기',
    bg: '#9BBC0F',
    ink: '#0F380F',
    backdrop: '#9BBC0F',
    form: { bevel: 0.04, size: 0.92, radius: 0.02 },
    body: { color: '#202020', roughness: 0.7 },
    faces: ['#D84040', '#4080D8', '#E8C040', '#40B060', '#A060D0', '#E08040'],
    lights: {
      sky: '#ffffff', ground: '#8890a0', hemi: 1.8,
      key: ['#ffffff', 2.2, [-3, 6, 5]], fill: ['#c8d8ff', 0.4, [5, 0, 4]], rim: ['#ffffff', 0.5, [0, 3, -6]],
    },
    filter: { type: 'pixel', palette: ['#0F380F', '#306230', '#8BAC0F', '#9BBC0F'], mode: 'ramp', cell: 'lcd', res: 95, dither: 0.5, gamma: 0.62, bg: '#9BBC0F', line: '#0F380F' },
    surface: 'blocks',
    sound: 'pixel',
    motion: 'stepped',
    burst: { shape: 'square', colors: 'faces', size: 0.1, speed: 2.6, gravity: -8, drag: 0.6, life: 0.9 },
  },
  {
    // 옛 PC의 네 색 화면. 검정, 자홍, 청록, 흰색만으로 그늘과 빛을 바둑판 점으로 섞는다.
    // 면은 블록 속 그림으로 갈린다(민무늬, 안쪽 테, 가운데 네모, 빗금, 네 칸, 가로줄)
    id: 'cga',
    name: 'CGA',
    bg: '#000000',
    ink: '#55FFFF',
    backdrop: '#000000',
    form: { bevel: 0.04, size: 0.92, radius: 0.02 },
    body: { color: '#202020', roughness: 0.7 },
    faces: ['#D84040', '#4080D8', '#E8C040', '#40B060', '#A060D0', '#E08040'],
    lights: {
      sky: '#ffffff', ground: '#8890a0', hemi: 1.8,
      key: ['#ffffff', 2.2, [-3, 6, 5]], fill: ['#c8d8ff', 0.4, [5, 0, 4]], rim: ['#ffffff', 0.5, [0, 3, -6]],
    },
    filter: { type: 'pixel', palette: ['#000000', '#FF55FF', '#55FFFF', '#FFFFFF'], mode: 'ramp', res: 110, dither: 0.35, gamma: 0.7, bg: '#000000', line: null },
    surface: 'blocks',
    sound: 'pixel',
    motion: 'stepped',
    burst: { shape: 'square', colors: 'faces', size: 0.1, speed: 2.6, gravity: -8, drag: 0.6, life: 0.9 },
  },
  {
    // 흑백 두 색뿐인 옛 컴퓨터 화면. 흰 종이 같은 바탕에 검은 점만으로 그늘과 빛을 바둑판 점으로 나타낸다.
    // 면은 블록 속 그림으로 갈린다(민무늬, 안쪽 테, 가운데 네모, 빗금, 네 칸, 가로줄)
    id: 'onebit',
    name: '1비트',
    bg: '#FFFFFF',
    ink: '#000000',
    backdrop: '#FFFFFF',
    form: { bevel: 0.04, size: 0.92, radius: 0.02 },
    body: { color: '#202020', roughness: 0.7 },
    faces: ['#D84040', '#4080D8', '#E8C040', '#40B060', '#A060D0', '#E08040'],
    lights: {
      sky: '#ffffff', ground: '#8890a0', hemi: 1.8,
      key: ['#ffffff', 2.2, [-3, 6, 5]], fill: ['#c8d8ff', 0.4, [5, 0, 4]], rim: ['#ffffff', 0.5, [0, 3, -6]],
    },
    filter: { type: 'pixel', palette: ['#000000', '#FFFFFF'], mode: 'ramp', res: 150, dither: 0.85, gamma: 0.5, gain: 1.7, bg: '#FFFFFF', line: '#000000' },
    surface: 'blocks',
    sound: 'paper',
    motion: 'stepped',
    burst: { shape: 'square', colors: 'faces', size: 0.1, speed: 2.6, gravity: -8, drag: 0.6, life: 0.9 },
  },
  {
    // 8×8 칸마다 두 색만 쓸 수 있던 8비트 컴퓨터 화면. 열다섯 색 팔레트, 색이 다른 스티커가 한 칸 묶음에 걸치면
    // 한쪽 색이 옆으로 번져 덮인다(컬러 클래시). 도톰한 블록 스티커
    id: 'clash',
    name: '8비트 컴퓨터',
    bg: '#D7D7D7',
    ink: '#000000',
    backdrop: '#D7D7D7',
    form: { bevel: 0.05, size: 0.86, radius: 0.04, depth: 0.06 },
    body: { color: '#000000', roughness: 0.6 },
    faces: ['#FF0000', '#0000FF', '#FFFF00', '#00FF00', '#00FFFF', '#FF00FF'],
    lights: {
      sky: '#ffffff', ground: '#8890a0', hemi: 1.8,
      key: ['#ffffff', 2.2, [-3, 6, 5]], fill: ['#c8d8ff', 0.4, [5, 0, 4]], rim: ['#ffffff', 0.5, [0, 3, -6]],
    },
    filter: { type: 'pixel', palette: ['#000000', '#0000D7', '#D70000', '#D700D7', '#00D700', '#00D7D7', '#D7D700', '#D7D7D7', '#0000FF', '#FF0000', '#FF00FF', '#00FF00', '#00FFFF', '#FFFF00', '#FFFFFF'], mode: 'clash', res: 120, dither: 0.25, line: '#000000' },
    sticker: { roughness: 0.45 },
    surface: 'plain',
    sound: 'pixel',
    motion: 'stepped',
    burst: { shape: 'square', colors: 'faces', size: 0.1, speed: 2.6, gravity: -8, drag: 0.6, life: 0.9 },
  },
  {
    // 오락실 브라운관. 색을 채널마다 여섯 단으로 끊고, 화소마다 빨강·초록·파랑 형광 줄과 주사선이 보이며 옆 화소로 빛이 번진다.
    // 스프라이트 검은 테두리, 도톰한 블록 스티커
    id: 'arcade',
    name: '오락실',
    bg: '#000000',
    ink: '#F0F0F0',
    backdrop: '#000000',
    form: { bevel: 0.05, size: 0.86, radius: 0.04, depth: 0.06 },
    body: { color: '#141414', roughness: 0.6 },
    faces: ['#FF3030', '#3060FF', '#FFE030', '#30E050', '#FFFFFF', '#FF9020'],
    lights: {
      sky: '#ffffff', ground: '#8890a0', hemi: 1.8,
      key: ['#ffffff', 2.2, [-3, 6, 5]], fill: ['#c8d8ff', 0.4, [5, 0, 4]], rim: ['#ffffff', 0.5, [0, 3, -6]],
    },
    filter: { type: 'pixel', mode: 'levels', levels: 6, cell: 'arcade', res: 105, dither: 0.35, bg: '#000000', line: '#000000' },
    sticker: { roughness: 0.4 },
    surface: 'plain',
    sound: 'pixel',
    motion: 'stepped',
    burst: { shape: 'square', colors: 'faces', size: 0.1, speed: 2.6, gravity: -8, drag: 0.6, life: 0.9 },
  },
  {
    // 호박색 단색 모니터. 검정에서 호박빛까지 다섯 단으로만 그리고, 줄마다 빛나는 주사선과 옆으로 번지는 형광.
    // 면은 블록 속 그림으로 갈린다(민무늬, 안쪽 테, 가운데 네모, 빗금, 네 칸, 가로줄)
    id: 'amber',
    name: '앰버 모니터',
    bg: '#0A0500',
    ink: '#FFB000',
    backdrop: '#0A0500',
    form: { bevel: 0.04, size: 0.92, radius: 0.02 },
    body: { color: '#202020', roughness: 0.7 },
    faces: ['#D84040', '#4080D8', '#E8C040', '#40B060', '#A060D0', '#E08040'],
    lights: {
      sky: '#ffffff', ground: '#8890a0', hemi: 1.8,
      key: ['#ffffff', 2.2, [-3, 6, 5]], fill: ['#c8d8ff', 0.4, [5, 0, 4]], rim: ['#ffffff', 0.5, [0, 3, -6]],
    },
    filter: { type: 'pixel', palette: ['#0A0500', '#4A2400', '#9A5200', '#E88E00', '#FFC040'], mode: 'ramp', cell: 'crt', res: 100, dither: 0.5, bg: '#0A0500', line: null },
    surface: 'blocks',
    sound: 'mech',
    motion: 'stepped',
    burst: { shape: 'square', colors: 'faces', size: 0.1, speed: 2.6, gravity: -8, drag: 0.6, life: 0.9 },
  },
  {
    // 경기장 LED 전광판. 화소 하나가 둥근 LED 알 하나다. 일곱 가지 꽉 찬 색을 네 단 밝기로 켜고, 꺼진 알은 어둡게 보이며,
    // 켜진 알은 둘레로 빛이 번진다
    id: 'led',
    name: 'LED 전광판',
    bg: '#050505',
    ink: '#FFD02A',
    backdrop: '#050505',
    form: { bevel: 0.05, size: 0.86, radius: 0.04, depth: 0.06 },
    body: { color: '#202020', roughness: 0.6 },
    faces: ['#FF2A2A', '#2AFF4A', '#3A6AFF', '#FFD02A', '#2AE0FF', '#FF3AD8'],
    lights: {
      sky: '#ffffff', ground: '#8890a0', hemi: 1.8,
      key: ['#ffffff', 2.2, [-3, 6, 5]], fill: ['#c8d8ff', 0.4, [5, 0, 4]], rim: ['#ffffff', 0.5, [0, 3, -6]],
    },
    filter: { type: 'pixel', palette: ['#FF2A2A', '#2AFF4A', '#3A6AFF', '#FFD02A', '#2AE0FF', '#FF3AD8', '#FFFFFF'], mode: 'led', cell: 'led', res: 80, dither: 0.5, bg: '#1C1C20', line: null },
    sticker: { roughness: 0.4 },
    surface: 'plain',
    sound: 'electric',
    motion: 'stepped',
    burst: { shape: 'square', colors: 'faces', size: 0.1, speed: 2.6, gravity: -8, drag: 0.6, life: 0.9 },
  },
  {
    // 글자만 찍히는 단말기 화면. 칸마다 밝기에 맞는 글자 하나(빈칸 - . : + = % * # @)를 열여섯 색 글자색으로 찍는다
    id: 'ascii',
    name: '아스키',
    bg: '#000000',
    ink: '#AAAAAA',
    backdrop: '#000000',
    form: { bevel: 0.05, size: 0.86, radius: 0.04, depth: 0.06 },
    body: { color: '#555555', roughness: 0.6 },
    faces: ['#FF5555', '#5555FF', '#FFFF55', '#55FF55', '#55FFFF', '#FF55FF'],
    lights: {
      sky: '#ffffff', ground: '#8890a0', hemi: 1.8,
      key: ['#ffffff', 2.2, [-3, 6, 5]], fill: ['#c8d8ff', 0.4, [5, 0, 4]], rim: ['#ffffff', 0.5, [0, 3, -6]],
    },
    filter: { type: 'pixel', palette: ['#000000', '#AA0000', '#00AA00', '#AA5500', '#0000AA', '#AA00AA', '#00AAAA', '#AAAAAA', '#555555', '#FF5555', '#55FF55', '#FFFF55', '#5555FF', '#FF55FF', '#55FFFF', '#FFFFFF'], mode: 'palette', cell: 'ascii', res: 110, aspect: 1.6, dither: 0, gamma: 0.6, gain: 1.35, bg: '#000000', line: null },
    sticker: { roughness: 0.4 },
    surface: 'plain',
    sound: 'mech',
    motion: 'stepped',
    burst: { shape: 'square', colors: 'faces', size: 0.1, speed: 2.6, gravity: -8, drag: 0.6, life: 0.9 },
  },
  {
    // 장난감 블록으로 찍은 모자이크. 화소 하나가 둥근 돌기가 달린 판 하나이고 바탕은 회색 기초판이다.
    // 열여섯 가지 블록 색, 판 사이 이음매, 왼쪽 위에서 든 빛에 돌기 그늘
    id: 'bricks',
    name: '블록 모자이크',
    bg: '#A0A5A9',
    ink: '#0E1418',
    backdrop: '#A0A5A9',
    form: { bevel: 0.05, size: 0.86, radius: 0.04, depth: 0.06 },
    body: { color: '#1B2A34', roughness: 0.6 },
    faces: ['#C91A09', '#0055BF', '#F2CD37', '#237841', '#F4F4F4', '#FE8A18'],
    lights: {
      sky: '#ffffff', ground: '#8890a0', hemi: 1.8,
      key: ['#ffffff', 2.2, [-3, 6, 5]], fill: ['#c8d8ff', 0.4, [5, 0, 4]], rim: ['#ffffff', 0.5, [0, 3, -6]],
    },
    filter: { type: 'pixel', palette: ['#F4F4F4', '#1B2A34', '#C91A09', '#F2CD37', '#0055BF', '#237841', '#FE8A18', '#A0A5A9', '#6C6E68', '#582A12', '#E4CD9E', '#0A3463', '#BBE90B', '#720E0F', '#36AEBF', '#E4ADC8'], mode: 'palette', cell: 'brick', res: 64, dither: 0.08, bg: '#A0A5A9', line: '#1B2A34' },
    sticker: { roughness: 0.4 },
    surface: 'plain',
    sound: 'dice',
    motion: 'snap',
    burst: { shape: 'square', colors: 'faces', size: 0.1, speed: 2.6, gravity: -8, drag: 0.6, life: 0.9 },
  },
  {
    // 다리미로 녹여 붙인 플라스틱 비즈 작품. 화소 하나가 가운데 구멍 난 구슬 하나이고, 구멍과 틈으로 못 박힌 판이 비친다.
    // 열여섯 가지 구슬 색
    id: 'beads',
    name: '비즈',
    bg: '#E6E8EC',
    ink: '#2A2A2A',
    backdrop: '#E6E8EC',
    form: { bevel: 0.05, size: 0.86, radius: 0.04, depth: 0.06 },
    body: { color: '#2A2A2A', roughness: 0.6 },
    faces: ['#D8282E', '#2A5CC8', '#F5D62A', '#2EA44A', '#F59AB8', '#F28A1E'],
    lights: {
      sky: '#ffffff', ground: '#8890a0', hemi: 1.8,
      key: ['#ffffff', 2.2, [-3, 6, 5]], fill: ['#c8d8ff', 0.4, [5, 0, 4]], rim: ['#ffffff', 0.5, [0, 3, -6]],
    },
    filter: { type: 'pixel', palette: ['#F2F2F2', '#2A2A2A', '#D8282E', '#8A1A1E', '#F5D62A', '#C8A020', '#2A5CC8', '#1A3A8A', '#2EA44A', '#1E6A3A', '#F59AB8', '#C86A8A', '#F28A1E', '#B85A12', '#9A9A9A', '#7AC8F0'], mode: 'palette', cell: 'bead', res: 70, dither: 0.05, gain: 1.1, bg: '#E6E8EC', line: '#2A2A2A' },
    sticker: { roughness: 0.4 },
    surface: 'plain',
    sound: 'candy',
    motion: 'bouncy',
    burst: { shape: 'square', colors: 'faces', size: 0.1, speed: 2.6, gravity: -8, drag: 0.6, life: 0.9 },
  },
  {
    // 화실의 유화. 장면 전체를 넓적한 붓질로 다시 칠한다. 붓질은 색이 바뀌는 경계를 따라 길게 눕고 끝이 뭉툭하며,
    // 두껍게 오른 물감에 붓털 자국이 나 왼쪽 위 빛을 받는다. 캔버스 올, 누렇게 바랜 니스, 어둑한 배경과 가장자리 그늘
    id: 'oil',
    name: '유화',
    bg: '#2A1C12',
    ink: '#F2E6D0',
    backdrop: '#2A1C12',
    form: { bevel: 0.07, size: 0.88, radius: 0.08, depth: 0.04 },
    body: { color: '#1A1614', roughness: 0.55 },
    sticker: { roughness: 0.35 },
    faces: ['#C8302A', '#2A5AA8', '#E8C440', '#3A8A4A', '#F0EEE6', '#E07A2A'],
    lights: {
      sky: '#ffffff', ground: '#8a8070', hemi: 1.7,
      key: ['#fff6e8', 2.4, [-3, 6, 5]], fill: ['#d8e0ff', 0.45, [5, 0, 4]], rim: ['#ffffff', 0.6, [0, 3, -6]],
    },
    filter: { type: 'dabs', dab: 16, len: 2.2, width: 0.62, swirl: 0.5, align: 1, blunt: 0.7, relief: 1.1, jitter: 0.05, varnish: 1, bg: ['#1E140C', '#5A3C22', '#3A2A1C'] },
    surface: 'plain',
    sound: 'cloth',
    motion: 'smooth',
    burst: { shape: 'dot', colors: 'faces', size: 0.06, speed: 1.8, gravity: -3, drag: 1.6, life: 0.9 },
  },
  {
    // 종이 위 수채화. 물감이 번져 가장자리가 흔들리고, 가장자리로 밀린 물감이 짙게 고인다. 안료 알갱이,
    // 종이 요철, 밝은 곳은 칠하지 않고 남긴 흰 종이, 옅은 연필 밑그림
    id: 'watercolor',
    name: '수채화',
    bg: '#F6F2E8',
    ink: '#3A3A44',
    backdrop: '#F6F2E8',
    form: { bevel: 0.07, size: 0.88, radius: 0.08, depth: 0.04 },
    body: { color: '#1A1614', roughness: 0.55 },
    sticker: { roughness: 0.35 },
    faces: ['#C8302A', '#2A5AA8', '#E8C440', '#3A8A4A', '#F0EEE6', '#E07A2A'],
    lights: {
      sky: '#ffffff', ground: '#8a8070', hemi: 1.7,
      key: ['#fff6e8', 2.4, [-3, 6, 5]], fill: ['#d8e0ff', 0.45, [5, 0, 4]], rim: ['#ffffff', 0.6, [0, 3, -6]],
    },
    filter: { type: 'watercolor', bg: ['#F6F2E8', '#A8C0D8', '#F6F2E8'] },
    surface: 'plain',
    sound: 'water',
    motion: 'fluid',
    burst: { shape: 'dot', colors: 'faces', size: 0.06, speed: 1.8, gravity: -3, drag: 1.6, life: 0.9 },
  },
  {
    // 목판화. 몇 가지 안료(주홍, 감빛, 황토, 녹청, 쪽빛, 감청, 먹)로 평평하게 찍고, 먹선은 조금 어긋난 판에 찍힌다.
    // 나뭇결, 위쪽은 쪽빛에서 종이색으로 번지는 그러데이션(보카시), 화지 섬유
    id: 'ukiyoe',
    name: '우키요에',
    bg: '#EFE3C8',
    ink: '#24211F',
    backdrop: '#EFE3C8',
    form: { bevel: 0.07, size: 0.88, radius: 0.08, depth: 0.04 },
    body: { color: '#1A1614', roughness: 0.55 },
    sticker: { roughness: 0.35 },
    faces: ['#C8302A', '#2A5AA8', '#E8C440', '#3A8A4A', '#F0EEE6', '#E07A2A'],
    lights: {
      sky: '#ffffff', ground: '#8a8070', hemi: 1.7,
      key: ['#fff6e8', 2.4, [-3, 6, 5]], fill: ['#d8e0ff', 0.45, [5, 0, 4]], rim: ['#ffffff', 0.6, [0, 3, -6]],
    },
    filter: { type: 'ukiyoe', bg: ['#EFE3C8', '#3A66A0', '#C8BCA4'], palette: ['#EFE3C8', '#24211F', '#22325A', '#3A66A0', '#8FB3C8', '#C4402A', '#D9773A', '#D6A84A', '#5E8A5A', '#D99A9A', '#7A4E32', '#9A9A90'] },
    surface: 'plain',
    sound: 'paper',
    motion: 'smooth',
    burst: { shape: 'dot', colors: 'faces', size: 0.06, speed: 1.8, gravity: -3, drag: 1.6, life: 0.9 },
  },
  {
    // 인상주의. 섞지 않은 색을 짧게 끊어 찍은 붓 자국이 겹치고, 붓 자국마다 색이 조금씩 흔들린다.
    // 햇빛에 바랜 듯 옅은 색, 하늘빛·연둣빛·라일락빛 배경
    id: 'monet',
    name: '모네풍',
    bg: '#B8D0DC',
    ink: '#2A3440',
    backdrop: '#B8D0DC',
    form: { bevel: 0.07, size: 0.88, radius: 0.08, depth: 0.04 },
    body: { color: '#1A1614', roughness: 0.55 },
    sticker: { roughness: 0.35 },
    faces: ['#C8302A', '#2A5AA8', '#E8C440', '#3A8A4A', '#F0EEE6', '#E07A2A'],
    lights: {
      sky: '#ffffff', ground: '#8a8070', hemi: 1.7,
      key: ['#fff6e8', 2.4, [-3, 6, 5]], fill: ['#d8e0ff', 0.45, [5, 0, 4]], rim: ['#ffffff', 0.6, [0, 3, -6]],
    },
    filter: { type: 'dabs', dab: 11, len: 1.5, swirl: 0.25, relief: 0.35, jitter: 0.07, pastel: 0.08, line: 0, bg: ['#A8C8D8', '#C8D8B0', '#D8B8D0'] },
    surface: 'plain',
    sound: 'nature',
    motion: 'smooth',
    burst: { shape: 'dot', colors: 'faces', size: 0.06, speed: 1.8, gravity: -3, drag: 1.6, life: 0.9 },
  },
  {
    // 점묘. 순색 물감 열두 가지만으로 작은 점을 찍고, 점 사이로 캔버스가 비친다. 멀리서 보면 점이 섞여 색이 된다
    id: 'seurat',
    name: '쇠라풍',
    bg: '#E8E0C8',
    ink: '#2A2A30',
    backdrop: '#E8E0C8',
    form: { bevel: 0.07, size: 0.88, radius: 0.08, depth: 0.04 },
    body: { color: '#1A1614', roughness: 0.55 },
    sticker: { roughness: 0.35 },
    faces: ['#C8302A', '#2A5AA8', '#E8C440', '#3A8A4A', '#F0EEE6', '#E07A2A'],
    lights: {
      sky: '#ffffff', ground: '#8a8070', hemi: 1.7,
      key: ['#fff6e8', 2.4, [-3, 6, 5]], fill: ['#d8e0ff', 0.45, [5, 0, 4]], rim: ['#ffffff', 0.6, [0, 3, -6]],
    },
    filter: { type: 'dabs', dot: 1, dab: 8, relief: 0, jitter: 0.06, line: 0, bg: ['#C8D8A0', '#8AB0C8', '#E8D8A0'], palette: ['#E8302A', '#F08A20', '#F2D23A', '#A8C83A', '#3A9A4A', '#2A5AB8', '#6A3A9A', '#F2F0E6', '#8AC0E8', '#F0A0B0', '#1E2A4A', '#C8A060'] },
    surface: 'plain',
    sound: 'paper',
    motion: 'smooth',
    burst: { shape: 'dot', colors: 'faces', size: 0.06, speed: 1.8, gravity: -3, drag: 1.6, life: 0.9 },
  },
  {
    // 후기 인상주의. 굵고 짧은 붓질이 소용돌이를 따라 늘어서고, 물감이 두껍게 올라 요철이 진다.
    // 짙은 쪽빛 윤곽, 소용돌이치는 푸른 배경과 노란 빛
    id: 'gogh',
    name: '고흐풍',
    bg: '#1C3A7A',
    ink: '#F6E8A8',
    backdrop: '#1C3A7A',
    form: { bevel: 0.07, size: 0.88, radius: 0.08, depth: 0.04 },
    body: { color: '#1A1614', roughness: 0.55 },
    sticker: { roughness: 0.35 },
    faces: ['#C8302A', '#2A5AA8', '#E8C440', '#3A8A4A', '#F0EEE6', '#E07A2A'],
    lights: {
      sky: '#ffffff', ground: '#8a8070', hemi: 1.7,
      key: ['#fff6e8', 2.4, [-3, 6, 5]], fill: ['#d8e0ff', 0.45, [5, 0, 4]], rim: ['#ffffff', 0.6, [0, 3, -6]],
    },
    filter: { type: 'dabs', dab: 13, len: 1.8, width: 0.42, swirl: 1.8, blunt: 0.8, relief: 1, jitter: 0.08, line: 0.75, bg: ['#1C3A7A', '#3A6AB0', '#E8C840'] },
    surface: 'plain',
    sound: 'cloth',
    motion: 'smooth',
    burst: { shape: 'dot', colors: 'faces', size: 0.06, speed: 1.8, gravity: -3, drag: 1.6, life: 0.9 },
  },
  {
    // 표현주의. 물결치는 흐름을 따라 붓질이 길게 끌리고 큐브 윤곽도 출렁인다. 타는 듯한 주홍·노랑 하늘 띠와
    // 검푸른 물, 진하게 끌어올린 색, 짙은 윤곽. 흐름이 아주 천천히 움직인다
    id: 'munch',
    name: '뭉크풍',
    bg: '#1A2440',
    ink: '#F2E0C0',
    backdrop: '#1A2440',
    form: { bevel: 0.07, size: 0.88, radius: 0.08, depth: 0.04 },
    body: { color: '#1A1614', roughness: 0.55 },
    sticker: { roughness: 0.35 },
    faces: ['#C8302A', '#2A5AA8', '#E8C440', '#3A8A4A', '#F0EEE6', '#E07A2A'],
    lights: {
      sky: '#ffffff', ground: '#8a8070', hemi: 1.7,
      key: ['#fff6e8', 2.4, [-3, 6, 5]], fill: ['#d8e0ff', 0.45, [5, 0, 4]], rim: ['#ffffff', 0.6, [0, 3, -6]],
    },
    filter: { type: 'munch', bg: ['#D8501E', '#F0A030', '#B8202A'], animated: true },
    surface: 'plain',
    sound: 'cloth',
    motion: 'fluid',
    burst: { shape: 'dot', colors: 'faces', size: 0.06, speed: 1.8, gravity: -3, drag: 1.6, life: 0.9 },
  },
  {
    // 금박 시기. 바탕은 이어 붙인 금박에 소용돌이와 동그라미 무늬, 색 면은 작은 네모·동그라미·고리 모자이크,
    // 검은 면은 흑백 네모. 금박이 은은히 반짝인다
    id: 'klimt',
    name: '클림트풍',
    bg: '#2A1C08',
    ink: '#F2D890',
    backdrop: '#2A1C08',
    form: { bevel: 0.07, size: 0.88, radius: 0.08, depth: 0.04 },
    body: { color: '#1A1614', roughness: 0.55 },
    sticker: { roughness: 0.35 },
    faces: ['#C8302A', '#2A5AA8', '#E8C440', '#3A8A4A', '#F0EEE6', '#E07A2A'],
    lights: {
      sky: '#ffffff', ground: '#8a8070', hemi: 1.7,
      key: ['#fff6e8', 2.4, [-3, 6, 5]], fill: ['#d8e0ff', 0.45, [5, 0, 4]], rim: ['#ffffff', 0.6, [0, 3, -6]],
    },
    filter: { type: 'klimt', animated: true },
    surface: 'plain',
    sound: 'metal',
    motion: 'smooth',
    burst: { shape: 'dot', colors: 'faces', size: 0.06, speed: 1.8, gravity: -3, drag: 1.6, life: 0.9 },
  },
  {
    // 입체파. 장면을 각진 조각으로 쪼개 조각마다 조금씩 다른 시점에서 본다. 흙빛으로 가라앉은 색,
    // 조각마다 다른 쪽에서 드는 빛과 그늘 쪽 빗금, 군데군데 끊긴 윤곽
    id: 'cubism',
    name: '입체파',
    bg: '#3A3028',
    ink: '#EDE0C8',
    backdrop: '#3A3028',
    form: { bevel: 0.07, size: 0.88, radius: 0.08, depth: 0.04 },
    body: { color: '#1A1614', roughness: 0.55 },
    sticker: { roughness: 0.35 },
    faces: ['#C8302A', '#2A5AA8', '#E8C440', '#3A8A4A', '#F0EEE6', '#E07A2A'],
    lights: {
      sky: '#ffffff', ground: '#8a8070', hemi: 1.7,
      key: ['#fff6e8', 2.4, [-3, 6, 5]], fill: ['#d8e0ff', 0.45, [5, 0, 4]], rim: ['#ffffff', 0.6, [0, 3, -6]],
    },
    filter: { type: 'cubism', bg: ['#5A4A38', '#A89070', '#6A6A64'] },
    surface: 'plain',
    sound: 'wood',
    motion: 'heavy',
    burst: { shape: 'dot', colors: 'faces', size: 0.06, speed: 1.8, gravity: -3, drag: 1.6, life: 0.9 },
  },
  {
    // 팝아트 실크스크린. 같은 장면을 2×2로 되풀이해 찍고 칸마다 색 판을 바꾼다. 색은 평평하게 두 단, 맨 위에 검은 판이
    // 칸마다 조금씩 어긋나게 찍히고 잉크가 고르지 않게 먹었다. 어느 칸을 짚어도 큐브가 돌아간다
    id: 'warhol',
    name: '워홀풍',
    bg: '#F04A9A',
    ink: '#111111',
    backdrop: '#F04A9A',
    form: { bevel: 0.07, size: 0.88, radius: 0.08, depth: 0.04 },
    body: { color: '#1A1614', roughness: 0.55 },
    sticker: { roughness: 0.35 },
    faces: ['#C8302A', '#2A5AA8', '#E8C440', '#3A8A4A', '#F0EEE6', '#E07A2A'],
    lights: {
      sky: '#ffffff', ground: '#8a8070', hemi: 1.7,
      key: ['#fff6e8', 2.4, [-3, 6, 5]], fill: ['#d8e0ff', 0.45, [5, 0, 4]], rim: ['#ffffff', 0.6, [0, 3, -6]],
    },
    filter: { type: 'warhol', tiles: 2, palette: ['#F04A9A', '#FFD23A', '#35C8D0', '#FF7A2A', '#FFE14A', '#F04A9A', '#FFB0D0', '#7ADCF0'] },
    surface: 'plain',
    sound: 'pop',
    motion: 'snap',
    burst: { shape: 'dot', colors: 'faces', size: 0.06, speed: 1.8, gravity: -3, drag: 1.6, life: 0.9 },
  },
  {
    // 사진 콜라주. 조금씩 다른 자리와 각도에서 찍은 사진을 겹쳐 붙여 한 장면을 만든다(호크니의 조이너처럼).
    // 사진마다 흰 테두리, 다른 노출과 빛깔, 위에 덮인 사진이 드리우는 그림자
    id: 'collage',
    name: '콜라주',
    bg: '#3A3634',
    ink: '#F2EEE6',
    backdrop: '#3A3634',
    form: { bevel: 0.07, size: 0.88, radius: 0.08, depth: 0.04 },
    body: { color: '#1A1614', roughness: 0.55 },
    sticker: { roughness: 0.35 },
    faces: ['#C8302A', '#2A5AA8', '#E8C440', '#3A8A4A', '#F0EEE6', '#E07A2A'],
    lights: {
      sky: '#ffffff', ground: '#8a8070', hemi: 1.7,
      key: ['#fff6e8', 2.4, [-3, 6, 5]], fill: ['#d8e0ff', 0.45, [5, 0, 4]], rim: ['#ffffff', 0.6, [0, 3, -6]],
    },
    filter: { type: 'collage', bg: ['#D8CDB8', '#9A8468', '#3A3634'] },
    surface: 'plain',
    sound: 'paper',
    motion: 'smooth',
    burst: { shape: 'dot', colors: 'faces', size: 0.06, speed: 1.8, gravity: -3, drag: 1.6, life: 0.9 },
  },
  {
    // 인쇄 회로 기판. 면마다 솔더 마스크 색이 다르고, 45도로 꺾인 배선과 금도금 비아, 다리 달린 칩과 실크 인쇄,
    // 모서리의 저항, 콘덴서, LED. 배선을 따라 신호가 흐르고, 돌리면 몰려간다
    id: 'circuit',
    name: '회로',
    bg: '#04140E',
    ink: '#CFF5E1',
    backdrop: [
      'linear-gradient(rgba(60,200,140,.08) 1px, transparent 1px) 0 0 / 24px 24px',
      'linear-gradient(90deg, rgba(60,200,140,.08) 1px, transparent 1px) 0 0 / 24px 24px',
      'radial-gradient(60% 50% at 50% 45%, #0D3324, #04140E 75%)',
    ].join(', '),
    drift: 'radial-gradient(35% 28% at 50% 45%, rgba(34,224,122,.12), transparent 70%)',
    form: { bevel: 0.04, size: 0.84, radius: 0.05, depth: 0.015 },
    body: { color: '#0B3B2A', roughness: 0.5 },
    faces: ['#C8302A', '#7A2A9A', '#ECEEEA', '#E8C02A', '#1E8A3A', '#1E4AB0'],
    env: 0.4,
    lights: {
      sky: '#bfffd8', ground: '#03140c', hemi: 1.3,
      key: ['#e8fff0', 1.7, [-4, 6, 5]], fill: ['#22e07a', 0.5, [6, -1, 3]], rim: ['#3cb4ff', 1.1, [0, 4, -6]],
    },
    light: 0.9,
    surface: 'circuit',
    sound: 'electric',
    motion: 'mechanical',
    ambient: { mode: 'rise', shape: 'square', colors: ['#22E07A', '#3CB4FF'], count: 26, size: 0.04, speed: 0.5, opacity: 0.7, additive: true },
    burst: { shape: 'glow', colors: ['#22E07A', '#3CB4FF', '#FFFFFF'], size: 0.08, speed: 3, gravity: 0, drag: 3.5, life: 0.5, additive: true },
  },
  {
    // 북극 설원의 밤. 산 너머로 오로라가 너울거리고, 그 빛이 큐브에 비친다. 눈이 조용히 내린다
    id: 'aurora',
    name: '오로라',
    bg: '#050B1A',
    ink: '#E2F4FF',
    backdrop: [
      `${svg(100, 50, "<path d='M0 38 L12 26 L20 31 L33 17 L45 29 L57 21 L71 33 L84 23 L100 33 V50 H0Z' fill='#030812'/><path d='M33 17 L29.5 21 L32 20.4 L34.5 22 L36.5 20.6Z M84 23 L81 26.4 L83.6 25.8 L86.6 27Z M57 21 L54.5 23.6 L57 23 L59.6 24.4Z' fill='#B8CCE6'/><path d='M0 45 C30 41 70 43 100 41 V50 H0Z' fill='#1B2A47'/><path d='M0 45 C30 41 70 43 100 41' stroke='#5F7FAE' stroke-width='.4' fill='none'/>")} bottom / 100% 42% no-repeat`,
      stars(60, 11),
      'linear-gradient(#081430, #050B1A 60%, #03060F)',
    ].join(', '),
    drift: [
      'radial-gradient(70% 22% at 38% 22%, rgba(61,255,176,.26), transparent 70%)',
      'radial-gradient(45% 18% at 70% 30%, rgba(140,91,255,.24), transparent 70%)',
      'radial-gradient(30% 14% at 20% 34%, rgba(61,255,200,.16), transparent 70%)',
    ].join(', '),
    form: { bevel: 0.1, size: 0.8, radius: 0.12, depth: 0 },
    body: { color: '#0E1830', roughness: 0.2 },
    faces: ['#FF5FB8', '#FFC95A', '#E6F2FF', '#1FB6C9', '#3DFFB0', '#8C5BFF'],
    lights: {
      sky: '#2a4a7a', ground: '#02040a', hemi: 1,
      key: ['#cfe0ff', 1, [-4, 5, 5]], fill: ['#3dffb0', 0.3, [5, -1, 3]], rim: ['#3dffb0', 1.7, [0, 6, -5]],
    },
    light: 0.85,
    flicker: 'aurora',
    surface: 'aurora',
    sound: 'space',
    motion: 'fluid',
    ambient: [
      { mode: 'fall', shape: 'dot', colors: ['#FFFFFF', '#DDEBFF'], count: 60, size: 0.045, speed: 0.15, opacity: 0.8 },
      { mode: 'float', shape: 'glow', colors: ['#3DFFB0', '#8C5BFF', '#FF5FB8'], count: 16, size: 0.12, speed: 0.2, opacity: 0.4, additive: true },
    ],
    burst: { shape: 'glow', colors: ['#3DFFB0', '#8C5BFF', '#FF5FB8', '#FFFFFF'], size: 0.1, speed: 1.8, gravity: 0.3, drag: 1.6, life: 1.4, additive: true },
  },
  {
    // 미술관 받침대 위의 조각. 흰 카라라 대리석에 색 돌을 박고 금테를 둘렀다. 위에서 핀 조명, 묵직하게
    id: 'marble',
    name: '대리석',
    bg: '#D8D2C8',
    ink: '#1E1C1A',
    backdrop: [
      'linear-gradient(transparent 80%, rgba(0,0,0,.08) 80%, rgba(0,0,0,.02) 82%, transparent 84%)',
      'radial-gradient(34% 70% at 50% -6%, rgba(255,246,228,.85), rgba(255,240,215,.25) 55%, transparent 75%)',
      'linear-gradient(#CFC8BC 0%, #DDD7CD 45%, #D2CBBF 80%, #BFB6A8 80%, #ADA394 100%)',
    ].join(', '),
    form: { bevel: 0.03, size: 0.84, radius: 0.04, depth: 0 },
    body: { color: '#EDEBE6', roughness: 0.1 },
    sticker: { roughness: 0.08 },
    faces: ['#9C2A2A', '#D98C9A', '#232323', '#D9A441', '#2F6B4F', '#1E3F8F'],
    env: 0.5,
    lights: {
      sky: '#fff6e8', ground: '#8a8278', hemi: 1.5,
      key: ['#fff1dc', 2.9, [0, 9, 3]], fill: ['#e8e4ff', 0.3, [6, -1, 4]], rim: ['#ffffff', 0.9, [3, 3, -6]],
    },
    surface: 'marble',
    sound: 'stone',
    motion: 'heavy',
    ambient: { mode: 'float', shape: 'dot', colors: ['#FFF6E0'], count: 36, size: 0.03, speed: 0.15, opacity: 0.55 },
    burst: { shape: 'dot', colors: ['#F1EFEA', '#CFCAC0', '#9E978A'], size: 0.05, speed: 1.4, gravity: -2.5, drag: 2.5, life: 1.1 },
  },

  {
    // 산사 처마 밑. 서까래 끝마다 단청이 둘러 있고, 큐브는 머리초를 그려 넣은 나무다.
    // 면 색은 단청 안료에서: 주홍, 군청, 호분(흰색), 석황, 하엽(녹색), 장단(주황)
    id: 'dancheong',
    name: '단청',
    timerTop: 50,
    bg: '#9FC6E4',
    ink: '#16202A',
    backdrop: [
      `${svg(64, 64, "<rect width='64' height='64' fill='#5E8F78'/><circle cx='32' cy='32' r='27' fill='#14110F'/><circle cx='32' cy='32' r='24' fill='#F1ECDD'/><circle cx='32' cy='32' r='20' fill='#C42F2B'/><circle cx='32' cy='32' r='15' fill='#2B3F9A'/><circle cx='32' cy='32' r='10' fill='#F1ECDD'/><circle cx='32' cy='32' r='6' fill='#E7B432'/>", 'xMidYMid meet')} 0 0 / 34px 34px repeat-x`,
      'linear-gradient(#5E8F78 0 34px, #14110F 34px 37px, #C42F2B 37px 40px, #2B3F9A 40px 43px, transparent 43px)',
      'radial-gradient(60% 40% at 50% 100%, rgba(255,255,255,.4), transparent 70%)',
      'linear-gradient(#7FB2DA 0%, #A9CDE8 55%, #DDEAF2 100%)',
    ].join(', '),
    drift: 'radial-gradient(30% 22% at 30% 40%, rgba(255,250,230,.25), transparent 70%)',
    form: { bevel: 0.04, size: 0.86, radius: 0.04, depth: 0.012 },
    body: { color: '#5E8F78', roughness: 0.8 },
    faces: ['#C42F2B', '#2B3F9A', '#F1ECDD', '#E7B432', '#2E7040', '#EE7A2C'],
    lights: {
      sky: '#e6f2ff', ground: '#8a7a5a', hemi: 2.1,
      key: ['#fff4e0', 2.4, [-4, 7, 4]], fill: ['#b0d0ff', 0.5, [6, 0, 4]], rim: ['#ffffff', 0.8, [2, 4, -6]],
    },
    surface: 'dancheong',
    sound: 'wood',
    motion: 'smooth',
    ambient: [
      { mode: 'fall', shape: 'leaf', colors: ['#E8B832', '#F2C94C', '#D9A21E'], count: 14, size: 0.2, speed: 0.22, opacity: 0.95 },
      { mode: 'float', shape: 'glow', colors: ['#FF9AA8', '#FFC27A', '#FFE08A'], count: 10, size: 0.22, speed: 0.18, opacity: 0.55, additive: true },
    ],
    burst: { shape: 'streak', colors: ['#C42F2B', '#2B3F9A', '#E7B432', '#2E7040', '#F1ECDD'], size: 0.13, speed: 2.2, gravity: -3, drag: 1.6, life: 1.3 },
  },
  {
    // 성당 창. 납선으로 이은 색유리 너머로 해가 들어 큐브가 안에서 빛나고, 빛줄기 속에 먼지가 떠다닌다
    id: 'stained',
    name: '스테인드글라스',
    bg: '#14110F',
    ink: '#F1E6D0',
    backdrop: [
      `${svg(120, 60, "<rect width='120' height='60' fill='#1c1814'/><g fill='#262019' stroke='#120f0c' stroke-width='1.5'><rect x='1' y='1' width='58' height='28'/><rect x='61' y='1' width='58' height='28'/><rect x='-29' y='31' width='58' height='28'/><rect x='31' y='31' width='58' height='28'/><rect x='91' y='31' width='58' height='28'/></g>")} 0 0 / 180px 90px`,
      'radial-gradient(45% 50% at 50% 42%, rgba(255,220,160,.18), transparent 70%)',
      '#14110F',
    ].join(', '),
    drift: [
      'repeating-linear-gradient(115deg, transparent 0 6%, rgba(255,230,180,.07) 7% 9%, transparent 10% 16%)',
      'radial-gradient(35% 25% at 30% 85%, rgba(200,40,60,.12), transparent 70%)',
      'radial-gradient(35% 25% at 70% 88%, rgba(40,80,200,.12), transparent 70%)',
    ].join(', '),
    form: { bevel: 0.03, size: 0.9, radius: 0.02, depth: 0 },
    body: { color: '#2A2A2E', roughness: 0.4, metalness: 0.6 },
    faces: ['#C8102E', '#1F4FB8', '#EDE6C8', '#F2A81D', '#138A4A', '#7B34B0'],
    halo: 0.3,
    lights: {
      sky: '#fff0d8', ground: '#2a2018', hemi: 1.1,
      key: ['#ffe8c0', 1.6, [-3, 6, 5]], fill: ['#a0b8ff', 0.4, [6, 0, 3]], rim: ['#ffd8a0', 1.2, [0, 4, -6]],
    },
    surface: 'stained',
    sound: 'glass',
    motion: 'heavy',
    ambient: { mode: 'float', shape: 'dot', colors: ['#FFF2D0'], count: 50, size: 0.03, speed: 0.12, opacity: 0.6, additive: true },
    burst: { shape: 'star', colors: 'faces', size: 0.14, speed: 2.2, gravity: -2, drag: 1.4, life: 1, additive: true },
  },
  {
    // 나전칠기 함. 검게 옻칠한 몸통에 전복 껍데기를 잘라 박았다. 보는 각도에 따라 자개가 무지갯빛으로 바뀐다
    id: 'najeon',
    name: '자개',
    bg: '#120606',
    ink: '#F4E6DA',
    backdrop: [
      'linear-gradient(transparent 76%, rgba(255,220,200,.06) 77%, transparent 79%)',
      'radial-gradient(70% 55% at 50% 42%, #3A120E 0%, #1E0807 55%, #0A0303 100%)',
    ].join(', '),
    drift: 'radial-gradient(28% 20% at 35% 30%, rgba(255,240,230,.08), transparent 70%)',
    form: { bevel: 0.06, size: 0.8, radius: 0.1, depth: 0 },
    body: { color: '#0C0808', roughness: 0.04 },
    faces: ['#E89AB8', '#4FB8C8', '#F2EEE6', '#E8C27A', '#7FD0A0', '#9A88E0'],
    env: 1.1,
    lights: {
      sky: '#fff0e8', ground: '#2a0e0a', hemi: 1.2,
      key: ['#ffffff', 2.2, [-3, 6, 5]], fill: ['#ffd0c0', 0.5, [6, 0, 4]], rim: ['#ffffff', 1.6, [3, 4, -6]],
    },
    surface: 'najeon',
    sound: 'ceramic',
    motion: 'smooth',
    ambient: { mode: 'float', shape: 'star', colors: ['#FFFFFF', '#BFEFFF', '#FFD6F0'], count: 28, size: 0.12, speed: 0.4, opacity: 0.85, additive: true },
    burst: { shape: 'star', colors: 'faces', size: 0.15, speed: 2.2, gravity: -2, drag: 1.5, life: 1, additive: true },
  },
  {
    // 비 오는 밤 유리창. 김 서린 유리에 물방울이 맺혔다 사라지고, 흘러내린 자리로 뒤편 도시 불빛이 번져 보인다
    id: 'rain',
    name: '빗방울',
    bg: '#0B1020',
    ink: '#E6ECF8',
    backdrop: [
      bokeh(26),
      'linear-gradient(#141A33, #0B1020 60%, #070A14)',
    ].join(', '),
    drift: 'radial-gradient(40% 30% at 50% 70%, rgba(255,160,90,.12), transparent 70%)',
    form: { bevel: 0.1, size: 0.86, radius: 0.1, depth: 0 },
    body: { color: '#12141C', roughness: 0.12, metalness: 0.5 },
    faces: ['#E8475F', '#8A6BFF', '#E9EEF5', '#F2B33D', '#3FC59A', '#3D8BFF'],
    env: 0.6,
    lights: {
      sky: '#8090c0', ground: '#0a0c14', hemi: 1.2,
      key: ['#ffd8b0', 1.4, [-4, 5, 5]], fill: ['#6a8cff', 0.7, [6, 0, 3]], rim: ['#ff6a8a', 1.2, [0, 3, -6]],
    },
    surface: 'rain',
    sound: 'water',
    motion: 'fluid',
    ambient: { mode: 'fall', shape: 'rain', colors: ['#BFD8FF'], count: 140, size: 0.25, speed: 2.4, opacity: 0.4 },
    burst: { shape: 'dot', colors: ['#DDEBFF', '#9FC0FF'], size: 0.06, speed: 2.4, gravity: -7, drag: 0.8, life: 0.9, opacity: 0.9 },
  },
  {
    // 액체 금속. 웅덩이마다 겉이 실제로 출렁이고, 돌리면 가운데서 물결이 퍼진다. 어두운 촬영장의 띠 조명
    id: 'mercury',
    name: '수은',
    bg: '#0E0F12',
    ink: '#EDEEF2',
    backdrop: [
      'linear-gradient(90deg, transparent 12%, rgba(255,255,255,.07) 14%, transparent 17%, transparent 83%, rgba(255,255,255,.07) 86%, transparent 88%)',
      'radial-gradient(60% 18% at 50% 92%, rgba(255,255,255,.08), transparent 70%)',
      'radial-gradient(60% 50% at 50% 42%, #24262C, #0E0F12 75%)',
    ].join(', '),
    drift: 'radial-gradient(25% 40% at 30% 40%, rgba(255,255,255,.05), transparent 70%)',
    form: { bevel: 0.14, size: 0.9, radius: 0.3, grid: 40 },
    body: { color: '#2A2C31', roughness: 0.08, metalness: 1 },
    sticker: { roughness: 0.04, metalness: 1 },
    faces: ['#D0283E', '#3C6FD8', '#DADDE2', '#E8C35A', '#3FB58A', '#E07A9A'],
    env: 1.7,
    lights: {
      sky: '#ffffff', ground: '#202226', hemi: 0.7,
      key: ['#ffffff', 1.8, [-4, 6, 5]], fill: ['#cfd8ff', 0.5, [6, -1, 3]], rim: ['#ffffff', 2.4, [3, 3, -6]],
    },
    light: 0.7,
    surface: 'mercury',
    sound: 'water',
    motion: 'fluid',
    burst: { shape: 'dot', colors: ['#E8EAF0', '#B8BCC8'], size: 0.07, speed: 2.4, gravity: -6, drag: 0.8, life: 1 },
  },
  {
    // 증기 기관실. 리벳 박은 놋쇠 몸통에 칸마다 압력계가 달려 바늘이 떨리고, 돌리면 압력이 치솟고 증기가 뿜어진다
    id: 'gauge',
    name: '스팀펑크',
    bg: '#1A110A',
    ink: '#F4E2C4',
    backdrop: [
      `${svg(100, 100, "<g stroke-linecap='round' fill='none'><path d='M-5 18 H40 Q48 18 48 26 V110' stroke='#5A3A1E' stroke-width='5'/><path d='M-5 18 H40 Q48 18 48 26 V110' stroke='#8A5A2A' stroke-width='2'/><path d='M105 72 H70 Q62 72 62 64 V-5' stroke='#5A3A1E' stroke-width='4'/><path d='M105 72 H70 Q62 72 62 64 V-5' stroke='#9A6A34' stroke-width='1.6'/></g><g fill='#B07A3A'><rect x='20' y='14' width='4' height='8' rx='1'/><rect x='46' y='60' width='8' height='4' rx='1'/><rect x='80' y='68' width='4' height='8' rx='1'/></g>", 'xMidYMid slice')} center / cover no-repeat`,
      'radial-gradient(45% 40% at 50% 40%, rgba(255,180,90,.2), transparent 70%)',
      'repeating-linear-gradient(90deg, #24170D 0 46px, #1E130A 46px 48px)',
    ].join(', '),
    drift: 'radial-gradient(35% 30% at 50% 30%, rgba(255,200,120,.12), transparent 70%)',
    form: { bevel: 0.05, size: 0.86, radius: 0.43, depth: 0.035 },
    body: { color: '#8A6A32', roughness: 0.35, metalness: 0.8 },
    faces: ['#C8432E', '#2E5E8C', '#F2E6CC', '#E2B04A', '#3E7A52', '#5A2E2A'],
    env: 0.9,
    lights: {
      sky: '#ffd8a0', ground: '#2a1a0a', hemi: 1.4,
      key: ['#ffcf8a', 2.4, [-4, 6, 5]], fill: ['#ff9a4a', 0.6, [6, -1, 3]], rim: ['#ffe0b0', 1.4, [2, 4, -6]],
    },
    light: 0.9,
    flicker: 'candle',
    surface: 'gauge',
    sound: 'mech',
    motion: 'mechanical',
    ambient: [
      { mode: 'rise', shape: 'glow', colors: ['#FFFFFF'], count: 16, size: 0.6, speed: 0.22, opacity: 0.12 },
      { mode: 'float', shape: 'glow', colors: ['#FFB45A', '#FFD08A'], count: 14, size: 0.05, speed: 0.5, opacity: 0.9, additive: true },
    ],
    burst: { shape: 'glow', colors: ['#FFFFFF', '#F2EEE6'], size: 0.42, speed: 1.4, gravity: 0.6, drag: 1.8, life: 1.3, opacity: 0.28 },
  },
  {
    // 벌통에서 막 꺼낸 벌집. 칸이 실제로 패여 꽃꿀(라벤더, 벚꽃, 아카시아, 오렌지꽃, 보리수, 블루베리)이
    // 고여 빛나고, 몇 칸은 밀랍 뚜껑, 넘친 꿀이 흘러내린다. 벌이 기어다니고 맴돈다. 꿀처럼 끈적하게 돈다
    id: 'honey',
    name: '벌집',
    bg: '#2A1704',
    ink: '#FFEFCF',
    backdrop: [
      `${svg(52, 90, "<g fill='none' stroke='rgba(255,200,90,.14)' stroke-width='2'><path d='M13 0 L26 7.5 L26 22.5 L13 30 L0 22.5 L0 7.5Z M39 22.5 L52 30 L52 45 L39 52.5 L26 45 L26 30Z M13 45 L26 52.5 L26 67.5 L13 75 L0 67.5 L0 52.5Z M39 67.5 L52 75 L52 90 M26 90 L26 75'/></g>", 'xMidYMid meet')} 0 0 / 52px 90px`,
      'radial-gradient(55% 45% at 50% 42%, #7A4A0C 0%, #3E2306 60%, #1E1003 100%)',
    ].join(', '),
    drift: 'radial-gradient(40% 32% at 50% 42%, rgba(255,190,60,.18), transparent 70%)',
    form: { bevel: 0.05, size: 0.92, radius: 0.05, grid: 48 },
    body: { color: '#6A4420', roughness: 0.7 },
    faces: ['#9B6BD6', '#D8405A', '#F3E6B0', '#F08A24', '#9CC23A', '#3E5FB8'],
    lights: {
      sky: '#ffe0a0', ground: '#3a2208', hemi: 1.8,
      key: ['#fff0c8', 2.4, [-3, 6, 5]], fill: ['#ffb040', 0.6, [6, -1, 3]], rim: ['#ffd070', 1.4, [0, 3, -6]],
    },
    surface: 'honey',
    sound: 'squish',
    motion: 'heavy',
    ambient: [
      { mode: 'buzz', shape: 'bee', colors: ['#F5C21B'], count: 7, size: 0.18, speed: 1.1, opacity: 1 },
      { mode: 'float', shape: 'glow', colors: ['#FFD36A'], count: 20, size: 0.06, speed: 0.3, opacity: 0.5, additive: true },
    ],
    burst: { shape: 'drip', colors: ['#F5B21B', '#E89A10', '#FFD36A'], size: 0.09, speed: 1.8, gravity: -6, drag: 1.4, life: 1.3 },
  },
  {
    // 들판 한가운데. 다 맞추면 면 하나가 위에서 내려다본 풀밭 한 뙈기다. 끝이 뾰족한 풀잎이 겹겹이 눕고, 잎맥이 서고, 이슬이 맺혔다.
    // 면마다 풀이 다르다(잔디, 가을 억새빛, 푸른 김의털, 붉은 띠, 보랏빛 수크령, 서리 내린 풀)
    id: 'grass',
    name: '풀밭',
    bg: '#E8EED8',
    ink: '#1E2A16',
    backdrop: [
      'radial-gradient(80% 50% at 50% -10%, rgba(255,250,210,.7), transparent 70%)',
      'linear-gradient(180deg, #CFE3F2 0 45%, #A8C878 45% 60%, #6A9A3A 100%)',
    ].join(', '),
    form: { bevel: 0.07, size: 0.94, radius: 0.08, grid: 40 },
    body: { color: '#5A3E28', roughness: 0.85 },
    faces: ['#4A9A3A', '#C8A040', '#7AA8B0', '#B83A2A', '#7A3A6A', '#D8E0E0'],
    lights: {
      sky: '#ffffff', ground: '#6a8a3a', hemi: 1.8,
      key: ['#fff4e2', 2.3, [-4, 7, 5]], fill: ['#e8ffd0', 0.5, [6, 0, 4]], rim: ['#ffffff', 1, [2, 4, -6]],
    },
    ambient: { mode: 'float', shape: 'dot', colors: ['#FFF6C8', '#FFFFFF'], count: 30, size: 0.04, speed: 0.25, opacity: 0.8 },
    burst: { shape: 'leaf', colors: 'faces', size: 0.12, speed: 1.6, gravity: -2, drag: 1.6, life: 1.4 },
    surface: 'grass',
    sound: 'nature',
    motion: 'smooth',
  },
  {
    // 밭고랑. 다 맞추면 면 하나가 갓 일군 흙 한 판이다. 부슬부슬한 흙덩이가 실제로 솟고, 잔돌과 실뿌리, 젖은 자국.
    // 면마다 흙이 다르다(검은 부엽토, 갈색 밭흙, 붉은 황토, 누런 모래흙, 잿빛 점토, 흰 마사토)
    id: 'soil',
    name: '흙',
    bg: '#E8DCC8',
    ink: '#2A1E14',
    backdrop: [
      'radial-gradient(70% 40% at 50% 0%, rgba(255,240,210,.6), transparent 70%)',
      'linear-gradient(180deg, #D8C8A8 0 40%, #8A6A48 40% 100%)',
    ].join(', '),
    form: { bevel: 0.07, size: 0.94, radius: 0.08, grid: 40 },
    body: { color: '#4A6A32', roughness: 0.5 },
    faces: ['#2A2624', '#6A4428', '#A8482A', '#C8A050', '#7A8480', '#E0D0A8'],
    lights: {
      sky: '#ffffff', ground: '#5a4030', hemi: 1.8,
      key: ['#fff4e2', 2.3, [-4, 7, 5]], fill: ['#ffe8c8', 0.5, [6, 0, 4]], rim: ['#ffffff', 1, [2, 4, -6]],
    },
    burst: { shape: 'dot', colors: 'faces', size: 0.05, speed: 1.6, gravity: -6, drag: 1.4, life: 1 },
    surface: 'soil',
    sound: 'molten',
    motion: 'heavy',
  },
  {
    // 장작 쌓인 제재소. 다 맞추면 면 하나가 통나무 한 토막의 마구리다. 나이테가 고리를 그리며 실제로 결이 지고, 심재와
    // 변재 빛깔이 갈리고, 마른 갈라짐과 톱자국이 남았다. 몸통은 나무껍질. 면마다 나무가 다르다(자작, 참나무, 삼나무, 호두, 흑단, 잿빛 고목)
    id: 'timber',
    name: '통나무',
    bg: '#2A2018',
    ink: '#F2E6D2',
    backdrop: [
      'radial-gradient(60% 40% at 50% 10%, rgba(255,210,150,.35), transparent 70%)',
      'linear-gradient(180deg, #3A2C20, #1A120C)',
    ].join(', '),
    form: { bevel: 0.07, size: 0.94, radius: 0.08, grid: 40 },
    body: { color: '#6A8A4A', roughness: 0.9 },
    faces: ['#E8D4A8', '#C08A4A', '#A04A30', '#6A4A34', '#141010', '#9A9A90'],
    lights: {
      sky: '#ffffff', ground: '#2a1a10', hemi: 1.8,
      key: ['#fff4e2', 2.3, [-4, 7, 5]], fill: ['#ffd8a8', 0.5, [6, 0, 4]], rim: ['#ffffff', 1, [2, 4, -6]],
    },
    ambient: { mode: 'float', shape: 'dot', colors: ['#FFE8C0'], count: 24, size: 0.03, speed: 0.2, opacity: 0.6 },
    burst: { shape: 'square', colors: ['#E8C890', '#C8A070'], size: 0.05, speed: 1.8, gravity: -5, drag: 1.4, life: 1 },
    surface: 'timber',
    sound: 'wood',
    motion: 'heavy',
  },
  {
    // 냇가 자갈밭. 다 맞추면 면 하나가 물살에 닳은 조약돌이 깔린 바닥이다. 동글납작한 돌이 실제로 솟고 사이엔 모래.
    // 돌마다 결이 다르고(점박이, 석영 줄, 줄무늬) 몇 개는 물에 젖어 번들거린다. 면마다 돌이 다르다(현무암, 장미석, 황토석, 청석, 사문석, 백석)
    id: 'pebble',
    name: '조약돌',
    bg: '#D8DCD8',
    ink: '#1E2224',
    backdrop: [
      'radial-gradient(70% 45% at 50% 0%, rgba(255,255,255,.7), transparent 70%)',
      'linear-gradient(180deg, #C8D8DC, #8A9890)',
    ].join(', '),
    form: { bevel: 0.07, size: 0.94, radius: 0.08, grid: 40 },
    body: { color: '#C8B890', roughness: 0.8 },
    faces: ['#2A2A2C', '#B88A7A', '#D0A050', '#5A6878', '#5A8A6A', '#E8E6E0'],
    lights: {
      sky: '#ffffff', ground: '#6a7068', hemi: 1.8,
      key: ['#fff4e2', 2.3, [-4, 7, 5]], fill: ['#e0f0ff', 0.5, [6, 0, 4]], rim: ['#ffffff', 1, [2, 4, -6]],
    },
    burst: { shape: 'dot', colors: 'faces', size: 0.06, speed: 1.8, gravity: -7, drag: 1.2, life: 1 },
    surface: 'pebble',
    sound: 'stone',
    motion: 'heavy',
  },
  {
    // 클레이 애니메이션 촬영장. 찰흙을 꾹 눌러 만든 큐브라 지문과 문지른 자국이 남아 있고,
    // 1초에 여덟 번 모양이 꿈틀거리며, 돌릴 때도 컷컷이 끊긴다
    id: 'clay',
    name: '점토',
    bg: '#BFE0F0',
    ink: '#20262C',
    backdrop: [
      `${svg(100, 40, "<g fill='#FFFFFF'><ellipse cx='18' cy='12' rx='10' ry='5'/><ellipse cx='26' cy='10' rx='8' ry='6'/><ellipse cx='12' cy='14' rx='6' ry='3.6'/><ellipse cx='76' cy='18' rx='9' ry='4.4'/><ellipse cx='83' cy='16' rx='6' ry='5'/></g>")} top / 100% 40% no-repeat`,
      'linear-gradient(transparent 78%, #6FAF5A 78%, #5E9C4C 100%)',
      'linear-gradient(#9CCFEA, #CDE7F2 78%)',
    ].join(', '),
    form: { bevel: 0.2, size: 0.86, radius: 0.32, grid: 28 },
    body: { color: '#5A5650', roughness: 0.65 },
    faces: ['#E0442E', '#2E6BD8', '#F4EFE4', '#F6C53A', '#3BA55C', '#8A4FC8'],
    lights: {
      sky: '#ffffff', ground: '#8aa070', hemi: 2,
      key: ['#fff6e8', 2.2, [-4, 7, 5]], fill: ['#dfe8ff', 0.5, [6, 0, 4]], rim: ['#ffffff', 0.8, [2, 4, -6]],
    },
    surface: 'clay',
    sound: 'molten',
    motion: 'stop',
    burst: { shape: 'dot', colors: 'faces', size: 0.08, speed: 2.2, gravity: -7, drag: 1, life: 1 },
  },
  {
    // 버려진 공장. 칠이 바랜 철판에 녹이 슬고, 녹물이 흘러내렸다. 먼지바람, 삐걱이며 묵직하게 돈다
    id: 'rust',
    name: '녹',
    bg: '#C9A27A',
    ink: '#231A12',
    backdrop: [
      `${svg(100, 40, "<g fill='#A8825F'><path d='M0 40 V26 H8 V18 H14 V24 H20 V12 H24 V9 H27 V12 H30 V30 H38 V22 H46 V40Z'/><path d='M60 40 V20 L66 16 V28 H74 V14 H76 V10 H80 V14 H84 V24 H92 V18 H100 V40Z'/></g><g fill='#8E6C4E'><rect x='21' y='15' width='2' height='2'/><rect x='70' y='20' width='2' height='3'/></g>")} bottom / 100% 34% no-repeat`,
      'radial-gradient(40% 30% at 70% 25%, rgba(255,230,190,.45), transparent 70%)',
      'linear-gradient(#B89070 0%, #D2AE86 60%, #C49A70 100%)',
    ].join(', '),
    drift: 'linear-gradient(100deg, transparent 20%, rgba(230,200,160,.18) 45%, transparent 70%)',
    form: { bevel: 0.04, size: 0.88, radius: 0.03, depth: 0.012 },
    body: { color: '#3A2618', roughness: 0.9 },
    faces: ['#B83A2A', '#3E6A8A', '#E4DCCB', '#D8A63A', '#5E7A4A', '#6E4C70'],
    lights: {
      sky: '#ffe6c8', ground: '#5a4030', hemi: 1.8,
      key: ['#ffe8c8', 2.3, [-4, 6, 5]], fill: ['#c8a080', 0.4, [6, 0, 3]], rim: ['#ffd8a8', 0.9, [2, 4, -6]],
    },
    surface: 'rust',
    sound: 'metal',
    motion: 'heavy',
    ambient: { mode: 'wind', shape: 'dot', colors: ['#9A6A44', '#7A5034'], count: 120, size: 0.035, speed: 0.6, opacity: 0.5 },
    burst: { shape: 'streak', colors: ['#8A4A20', '#6A3A1A', '#B86A30'], size: 0.1, speed: 1.8, gravity: -6, drag: 1.4, life: 1.1 },
  },
  {
    // 트레이딩카드 홀로 포일. 보는 각도에 따라 무지개 띠가 쓸려 가고, 별 무늬와 반짝이
    id: 'holo',
    name: '홀로그램',
    bg: '#0B0A14',
    ink: '#F2EEFF',
    backdrop: [
      'radial-gradient(40% 35% at 20% 25%, rgba(255,90,200,.22), transparent 70%)',
      'radial-gradient(40% 35% at 82% 30%, rgba(80,220,255,.2), transparent 70%)',
      'radial-gradient(45% 35% at 50% 95%, rgba(255,220,90,.16), transparent 70%)',
      'linear-gradient(#141226, #0B0A14)',
    ].join(', '),
    drift: 'conic-gradient(from 0deg at 50% 45%, rgba(255,80,160,.08), rgba(80,200,255,.08), rgba(255,230,90,.08), rgba(160,90,255,.08), rgba(255,80,160,.08))',
    form: { bevel: 0.06, size: 0.86, radius: 0.08, depth: 0.012 },
    body: { color: '#1C1C24', roughness: 0.15, metalness: 0.9 },
    faces: ['#FF6FB5', '#4FD8FF', '#E8ECF5', '#FFD25A', '#5FFFB8', '#A07CFF'],
    env: 1,
    lights: {
      sky: '#ffffff', ground: '#1a1428', hemi: 1.1,
      key: ['#ffffff', 1.8, [-4, 6, 5]], fill: ['#ff9ae0', 0.6, [6, 0, 3]], rim: ['#9ae8ff', 1.6, [2, 4, -6]],
    },
    light: 0.8,
    surface: 'holo',
    sound: 'electric',
    motion: 'snap',
    ambient: { mode: 'float', shape: 'star', colors: ['#FF8AD0', '#8AE8FF', '#FFE58A', '#B89AFF'], count: 34, size: 0.13, speed: 0.5, opacity: 0.9, additive: true },
    burst: { shape: 'star', colors: ['#FF8AD0', '#8AE8FF', '#FFE58A', '#FFFFFF'], size: 0.16, speed: 2.6, gravity: -2, drag: 1.5, life: 1, additive: true },
  },
  {
    // 거실 소파 위 털실 큐브. 굵은 V자 코가 실제로 도톰하게 솟아 있고, 두 올이 꼬인 실결과 섞인 색 털, 잔털.
    // 면마다 다른 페어아일 도안(하트, 눈송이, 나무, 마름모, 북유럽 십자, 모래시계)을 한 코씩 떠 넣었고
    // 위아래 단엔 세 번째 색 잔무늬. 테마를 고르면 무늬가 아래 단부터 떠진다
    id: 'knit',
    name: '니트',
    bg: '#E8D8C2',
    ink: '#2E241C',
    backdrop: [
      'radial-gradient(60% 50% at 50% 38%, rgba(255,240,210,.55), transparent 72%)',
      'repeating-linear-gradient(60deg, rgba(90,60,30,.05) 0 6px, transparent 6px 12px)',
      'repeating-linear-gradient(-60deg, rgba(90,60,30,.05) 0 6px, transparent 6px 12px)',
      'linear-gradient(#EADCC8, #D9C5AA)',
    ].join(', '),
    form: { bevel: 0.16, size: 0.92, radius: 0.12, grid: 44 },
    body: { color: '#4A423C', roughness: 0.95 },
    faces: ['#C8362E', '#24407A', '#F1E8D6', '#D9A42A', '#3D6B3F', '#9A7BB0'],
    lights: {
      sky: '#fff6e8', ground: '#a08868', hemi: 2,
      key: ['#ffe8c8', 2.3, [-4, 6, 5]], fill: ['#d8e0ff', 0.4, [6, 0, 3]], rim: ['#fff0d8', 1.4, [2, 4, -6]],
    },
    surface: 'knit',
    sound: 'cloth',
    motion: 'bouncy',
    ambient: { mode: 'float', shape: 'dot', colors: ['#FFFFFF', '#F4ECDC'], count: 26, size: 0.035, speed: 0.15, opacity: 0.6 },
    burst: { shape: 'dot', colors: 'faces', size: 0.05, speed: 1.4, gravity: -1, drag: 2.6, life: 1.4 },
  },
  {
    // 자연사 박물관 진열장. 화석이 실제로 도드라진 돌판. 면마다 돌과 화석이 다르다: 봉합선이 고사리잎처럼 주름진
    // 암모나이트와 조각조각 비치는 암몰라이트(셰일), 미간 돌기와 겹눈, 볼가시, 마디가 또렷한 삼엽충(석회암),
    // 깃이 엇갈린 탄화된 고사리(청회색 셰일), 뼈마디가 보이는 작은 청어(크림빛 석회암과 검은 수지상 무늬),
    // 다섯 꽃잎과 숨구멍 줄의 성게(사문석), 진흙이 밀려 올라온 공룡 발자국(갈라진 붉은 사암)
    id: 'fossil',
    name: '화석',
    bg: '#18221F',
    ink: '#E8E2D2',
    backdrop: [
      'linear-gradient(transparent 82%, #2A2620 82%, #1C1915 100%)',
      'radial-gradient(34% 62% at 50% -4%, rgba(255,236,200,.4), rgba(255,236,200,.08) 55%, transparent 75%)',
      'linear-gradient(#22302B, #18221F 80%)',
    ].join(', '),
    form: { bevel: 0.05, size: 0.9, radius: 0.05, grid: 44 },
    body: { color: '#1E1E20', roughness: 0.85 },
    faces: ['#5A524E', '#C8A878', '#8EA4BE', '#ECE2C8', '#7A9A7A', '#A8503A'],
    lights: {
      sky: '#fff2dc', ground: '#2a2a24', hemi: 1.6,
      key: ['#fff0d8', 3, [0, 9, 3]], fill: ['#c8d8ff', 0.3, [6, -1, 4]], rim: ['#ffffff', 0.9, [3, 3, -6]],
    },
    surface: 'fossil',
    sound: 'stone',
    motion: 'heavy',
    ambient: { mode: 'float', shape: 'dot', colors: ['#FFF2D8'], count: 30, size: 0.03, speed: 0.12, opacity: 0.5 },
    burst: { shape: 'dot', colors: ['#D8CCB4', '#A89878', '#7A6E5A'], size: 0.05, speed: 1.5, gravity: -3, drag: 2.2, life: 1.1 },
  },
  {
    // 말랑한 구미 젤리. 실제로 볼록하고 돌리면 출렁출렁, 안에서 비치는 빛과 설탕 알갱이
    id: 'jelly',
    name: '젤리',
    bg: '#FFE9F2',
    ink: '#3A1E2E',
    backdrop: [
      'radial-gradient(circle, rgba(255,160,200,.35) 22%, transparent 24%) 0 0 / 46px 46px',
      'radial-gradient(circle, rgba(140,230,210,.35) 22%, transparent 24%) 23px 23px / 46px 46px',
      'linear-gradient(#FFF1F7, #FFE2EE)',
    ].join(', '),
    form: { bevel: 0.24, size: 0.9, radius: 0.32, grid: 32 },
    body: { color: '#6A1E44', roughness: 0.08 },
    faces: ['#FF3B5C', '#3E7BFF', '#FFF2C8', '#FFC21E', '#38D46A', '#B04CFF'],
    lights: {
      sky: '#ffffff', ground: '#ffc8e0', hemi: 2.1,
      key: ['#ffffff', 2, [-3, 6, 5]], fill: ['#ffd8f0', 0.6, [6, 0, 4]], rim: ['#ffffff', 1.4, [0, 4, -6]],
    },
    surface: 'jelly',
    sound: 'squish',
    motion: 'squish',
    ambient: { mode: 'fall', shape: 'dot', colors: ['#FFFFFF'], count: 40, size: 0.03, speed: 0.2, opacity: 0.8 },
    burst: { shape: 'drip', colors: 'faces', size: 0.09, speed: 2.2, gravity: -6, drag: 1.2, life: 1.1 },
  },
  {
    // 네모난 행성들. 조각 하나하나가 작은 정육면체 행성이라 칸마다 행성 겉이 꽉 찬다. 면마다 실제 천체를 본떴다
    // (목성, 지구, 유로파, 화성, 이오, 해왕성). 지표가 자전하고, 낮밤 경계가 지나가면 밤쪽에 도시 불빛과 용암이 켜지며,
    // 테두리를 따라 대기가 빛난다
    id: 'planet',
    name: '행성',
    bg: '#04040C',
    ink: '#E6E8FF',
    backdrop: [
      stars(110, 31),
      'radial-gradient(40% 30% at 75% 25%, rgba(120,80,255,.18), transparent 70%)',
      'radial-gradient(35% 25% at 20% 75%, rgba(0,160,255,.14), transparent 70%)',
      '#04040C',
    ].join(', '),
    drift: 'radial-gradient(30% 22% at 65% 70%, rgba(255,120,200,.1), transparent 70%)',
    form: { bevel: 0.05, size: 0.94, radius: 0.06, grid: 32 },
    body: { color: '#2A2C36', roughness: 0.45, metalness: 0.6 },
    faces: ['#D89A5A', '#2A78B8', '#E8EEF4', '#C8502A', '#E0C84A', '#3A48C0'],
    lights: {
      sky: '#3a3a6a', ground: '#000000', hemi: 0.35,
      key: ['#ffffff', 3.4, [-7, 3, 4]], fill: ['#6b5cff', 0.25, [6, -2, 3]], rim: ['#9fd8ff', 1, [4, 2, -6]],
    },
    surface: 'planet',
    sound: 'space',
    motion: 'fluid',
    ambient: { mode: 'orbit', shape: 'glow', colors: ['#FFFFFF', '#CFC8FF'], count: 160, size: 0.045, speed: 1, additive: true },
    burst: { shape: 'star', colors: ['#FFFFFF', '#FFD9A0', '#A8E8FF'], size: 0.13, speed: 1.4, gravity: 0, drag: 0.8, life: 1.5, additive: true },
  },







  {
    // 미러볼. 거울 조각마다 돌아가는 색 조명이 걸려 번쩍이고, 박자에 맞춰 조명 색이 돈다
    id: 'disco',
    name: '디스코',
    bg: '#0A0612',
    ink: '#F6EEFF',
    backdrop: [
      'radial-gradient(70% 25% at 50% 105%, rgba(255,80,200,.35), transparent 70%)',
      'repeating-conic-gradient(from 0deg at 50% -10%, rgba(255,255,255,.05) 0deg 4deg, transparent 4deg 14deg)',
      'linear-gradient(#160C24, #0A0612)',
    ].join(', '),
    drift: [
      'radial-gradient(18% 14% at 25% 30%, rgba(255,60,180,.25), transparent 70%)',
      'radial-gradient(18% 14% at 75% 35%, rgba(60,160,255,.25), transparent 70%)',
      'radial-gradient(18% 14% at 50% 75%, rgba(255,220,60,.2), transparent 70%)',
    ].join(', '),
    form: { bevel: 0.05, size: 0.9, radius: 0.04, depth: 0 },
    body: { color: '#1A1A22', roughness: 0.2, metalness: 0.8 },
    faces: ['#FF4FA0', '#3F7BFF', '#E6E8F0', '#FFC83D', '#2FE08A', '#9B4DFF'],
    env: 0.8,
    lights: {
      sky: '#ffffff', ground: '#100818', hemi: 0.9,
      key: ['#ffffff', 1.6, [-4, 5, 5]], fill: ['#ffffff', 0.8, [6, 0, 3]], rim: ['#ffffff', 1.4, [0, 4, -6]],
    },
    flicker: 'disco',
    surface: 'disco',
    sound: 'disco',
    motion: 'snap',
    ambient: { mode: 'orbit', shape: 'dot', colors: ['#FF6AC8', '#6AC0FF', '#FFE06A', '#8AFFC0'], count: 90, size: 0.05, speed: 2.2, opacity: 0.9, additive: true },
    burst: { shape: 'star', colors: 'faces', size: 0.15, speed: 3, gravity: 0, drag: 2.5, life: 0.7, additive: true },
  },
  {
    // 팝아트 만화. 빛을 세 단으로 끊어 칠하고 그늘엔 망점, 굵은 먹 윤곽선, 뒤로 햇살 무늬
    id: 'comic',
    name: '만화',
    bg: '#FFD84A',
    ink: '#1A1208',
    backdrop: [
      'radial-gradient(circle, rgba(230,60,40,.35) 28%, transparent 30%) 0 0 / 14px 14px',
      'repeating-conic-gradient(from 0deg at 50% 45%, #FFD84A 0deg 9deg, #FFC21E 9deg 18deg)',
    ].join(', '),
    form: { bevel: 0.08, size: 0.84, radius: 0.1, depth: 0.015 },
    body: { color: '#2A2A38', roughness: 1 },
    faces: ['#E8202A', '#1E5BD8', '#FFFFFF', '#FFE04A', '#20B04A', '#E8389A'],
    surface: 'comic',
    sound: 'paper',
    motion: 'bouncy',
    burst: { shape: 'star', colors: ['#FFFFFF', '#FFE04A', '#E8202A'], size: 0.22, speed: 2.8, gravity: -1, drag: 2.4, life: 0.8 },
  },
  {
    // 유리 공방의 진열창. 몸통까지 맑은 유리라 안쪽 조각이 비쳐 보이고, 색유리 판은 모서리가 짙다.
    // 기포, 비스듬히 볼수록 짙어지는 가장자리, 모서리에 걸리는 분광 무지개
    id: 'glass',
    name: '유리',
    bg: '#0C1216',
    ink: '#EAF4F8',
    backdrop: [
      'radial-gradient(60% 45% at 50% 40%, rgba(180,220,240,.16), transparent 70%)',
      'linear-gradient(180deg, transparent 62%, rgba(200,230,255,.07) 62.4%, transparent 63%)',
      'linear-gradient(180deg, #121C22, #070A0C)',
    ].join(', '),
    drift: 'radial-gradient(25% 18% at 70% 30%, rgba(255,255,255,.07), transparent 70%)',
    form: { bevel: 0.1, size: 0.9, radius: 0.12, depth: 0.03 },
    body: { color: '#6E8A96', roughness: 0.02, metalness: 0, opacity: 0.3 },
    sticker: { roughness: 0.03, opacity: 0.9 },
    faces: ['#E0304A', '#2A5AE0', '#E8F4FF', '#F2A830', '#20B070', '#B040D0'],
    lights: {
      sky: '#dff2ff', ground: '#101418', hemi: 1.1,
      key: ['#ffffff', 2.6, [-5, 6, 5]], fill: ['#bfe4ff', 0.6, [6, -1, 3]], rim: ['#ffffff', 2.6, [2, 3, -7]],
    },
    env: 1.6,
    surface: 'glass',
    sound: 'glass',
    motion: 'smooth',
    ambient: { mode: 'float', shape: 'star', colors: ['#FFFFFF', '#CFEFFF'], count: 26, size: 0.06, speed: 0.4, opacity: 0.8, additive: true },
    burst: { shape: 'streak', colors: 'faces', size: 0.12, speed: 2.4, gravity: -5, drag: 1.2, life: 1.1, opacity: 0.75 },
  },
  {
    // 놀이방 바닥의 조립 블록. 2×2 돌기가 실제로 솟은 반질한 플라스틱, 돌기판 바닥, 딸깍 끼우는 손맛
    id: 'brick',
    name: '블록',
    bg: '#1C6A2A',
    ink: '#FFFFFF',
    backdrop: [
      'radial-gradient(circle at 50% 50%, rgba(255,255,255,.13) 0 26%, rgba(0,0,0,.2) 31%, transparent 36%) 0 0 / 30px 30px',
      'radial-gradient(80% 60% at 50% 40%, #23802F, #144E1E)',
    ].join(', '),
    form: { bevel: 0.04, size: 0.96, radius: 0.03, grid: 40 },
    body: { color: '#2B2D33', roughness: 0.3 },
    sticker: { roughness: 0.22 },
    faces: ['#D0202A', '#1E5AC8', '#F4F4F0', '#F8C81E', '#2AA040', '#F07A1E'],
    lights: {
      sky: '#ffffff', ground: '#2a5a30', hemi: 1.8,
      key: ['#ffffff', 2.2, [-4, 6, 5]], fill: ['#fff4e0', 0.6, [6, 0, 3]], rim: ['#ffffff', 1, [0, 4, -6]],
    },
    surface: 'brick',
    sound: 'cube',
    motion: 'snap',
    burst: { shape: 'square', colors: 'faces', size: 0.13, speed: 2.4, gravity: -6, drag: 1, life: 1.1 },
  },
  {
    // 공책 귀퉁이 낙서. 줄 공책 위에 마커로 그린 별, 하트, 웃는 얼굴, 나선, 번개, 꽃이
    // 손그림 애니메이션처럼 1초에 여섯 번 꿈틀거린다. 돌아갈 때도 컷컷이 끊긴다
    id: 'doodle',
    name: '낙서',
    bg: '#F6F2E6',
    ink: '#1E2A4A',
    backdrop: [
      PAPER_GRAIN,
      'linear-gradient(90deg, transparent 9vw, rgba(220,60,60,.45) 9vw, rgba(220,60,60,.45) calc(9vw + 2px), transparent calc(9vw + 2px))',
      'repeating-linear-gradient(180deg, transparent 0 31px, rgba(90,140,210,.35) 31px 32px)',
      '#F6F2E6',
    ].join(', '),
    form: { bevel: 0.06, size: 0.9, radius: 0.06 },
    body: { color: '#C8B48A', roughness: 0.9 },
    faces: ['#E8343A', '#E0408A', '#2A6AE0', '#20A060', '#F0A020', '#7A40C8'],
    lights: {
      sky: '#ffffff', ground: '#c8c0b0', hemi: 2.4,
      key: ['#ffffff', 1.2, [-3, 6, 5]], fill: ['#ffffff', 0.4, [6, 0, 3]], rim: ['#ffffff', 0.3, [0, 4, -6]],
    },
    haloMode: 'shadow',
    halo: 0.18,
    surface: 'doodle',
    sound: 'paper',
    motion: 'stop',
    burst: { shape: 'star', colors: 'faces', size: 0.17, speed: 2.2, gravity: -1, drag: 2.4, life: 0.8 },
  },
  {
    // 카지노 초록 펠트 위 주사위. 칸마다 진짜 주사위 눈이 움푹 파여 있고, 마주 보는 면을 더하면 7.
    // 놋쇠 몸통, 데굴 구르듯 튀며 돈다
    id: 'dice',
    name: '주사위',
    bg: '#0C3E24',
    ink: '#F4EAD0',
    backdrop: [
      'radial-gradient(55% 40% at 50% 38%, rgba(255,240,200,.16), transparent 70%)',
      PAPER_GRAIN,
      'radial-gradient(90% 70% at 50% 40%, #146036, #082A18)',
    ].join(', '),
    form: { bevel: 0.06, size: 0.94, radius: 0.16, grid: 36 },
    body: { color: '#B8913A', roughness: 0.3, metalness: 1 },
    sticker: { roughness: 0.25 },
    faces: ['#C81E2A', '#1A1A1E', '#F4F0E6', '#1E50B8', '#1E9A50', '#F2C42A'],
    lights: {
      sky: '#fff4e0', ground: '#0c3e24', hemi: 1.2,
      key: ['#fff1d8', 2.6, [-3, 7, 4]], fill: ['#ffffff', 0.4, [6, 0, 3]], rim: ['#ffe0a0', 1.2, [0, 4, -6]],
    },
    haloMode: 'shadow',
    surface: 'dice',
    sound: 'dice',
    motion: 'bouncy',
    burst: { shape: 'square', colors: ['#F4F0E6', '#C81E2A', '#F2C42A'], size: 0.12, speed: 2.6, gravity: -6, drag: 1, life: 1 },
  },
  {
    // 비잔틴 성당 천장. 줄마다 어긋나게 박은 돌 조각, 마름모 띠는 금 조각이라
    // 촛불이 일렁일 때마다 조각마다 따로 반짝인다
    id: 'mosaic',
    name: '모자이크',
    bg: '#1A1410',
    ink: '#F2DDA8',
    backdrop: [
      'radial-gradient(45% 35% at 50% 30%, rgba(255,200,110,.2), transparent 70%)',
      'repeating-linear-gradient(0deg, rgba(0,0,0,.25) 0 1px, transparent 1px 9px)',
      'repeating-linear-gradient(90deg, rgba(0,0,0,.25) 0 1px, transparent 1px 9px)',
      'linear-gradient(180deg, #3A2A18, #120D0A)',
    ].join(', '),
    form: { bevel: 0.05, size: 0.94, radius: 0.04 },
    body: { color: '#9A8C78', roughness: 0.9 },
    faces: ['#2A4AA8', '#A82A2A', '#2A8A5A', '#D89A2A', '#F0E8D8', '#D8788A'],
    lights: {
      sky: '#ffd8a0', ground: '#1a1008', hemi: 0.9,
      key: ['#ffd9a0', 2.8, [-4, 6, 5]], fill: ['#ff9a4a', 0.5, [6, -1, 3]], rim: ['#ffe0a0', 1.4, [2, 3, -6]],
    },
    light: 0.95,
    flicker: 'candle',
    env: 1.4,
    surface: 'mosaic',
    sound: 'ceramic',
    motion: 'heavy',
    ambient: { mode: 'float', shape: 'glow', colors: ['#FFD27A', '#FFB050'], count: 50, size: 0.04, speed: 0.3, opacity: 0.55, additive: true },
    burst: { shape: 'square', colors: ['#F2C45A', '#FFE6A0', '#2A4AA8', '#A82A2A'], size: 0.08, speed: 2.4, gravity: -4, drag: 1.2, life: 1.2 },
  },
  {
    // 사랑방 문갑 위 한지. 먹과 전통 안료(먹, 주홍, 쪽빛, 송화색, 녹색, 자주) 방울이 떨어져 번지고,
    // 번지는 끝에 먹이 고여 테가 진다. 붓처럼 천천히 돈다
    id: 'ink',
    name: '먹물',
    bg: '#EDE6D6',
    ink: '#1A1A1A',
    backdrop: [
      PAPER_GRAIN,
      'radial-gradient(35% 28% at 82% 78%, rgba(30,30,34,.08), transparent 70%)',
      'radial-gradient(18% 12% at 14% 22%, rgba(200,60,40,.06), transparent 70%)',
      'radial-gradient(80% 60% at 50% 42%, #F4EEE0, #DCD2BE)',
    ].join(', '),
    form: { bevel: 0.06, size: 0.92, radius: 0.04 },
    body: { color: '#C8AE82', roughness: 0.6 },
    faces: ['#1E1E22', '#D8402A', '#1E4A8A', '#E8C23A', '#2E7A4A', '#8A2A5A'],
    lights: {
      sky: '#fffaf0', ground: '#b8a888', hemi: 1.5,
      key: ['#fff6e8', 1.5, [-4, 6, 5]], fill: ['#ffffff', 0.4, [6, 0, 3]], rim: ['#ffffff', 0.5, [0, 4, -6]],
    },
    haloMode: 'shadow',
    halo: 0.15,
    surface: 'ink',
    sound: 'paper',
    motion: 'fluid',
    burst: { shape: 'dot', colors: 'faces', size: 0.08, speed: 1.8, gravity: -4, drag: 1.4, life: 1.2 },
  },
  {
    // 공방 작업대 위 상감 함. 면마다 나무가 다르고(호두, 단풍, 체리, 흑단, 올리브, 퍼플하트) 네 조각의
    // 결이 바람개비처럼 엇갈린다. 가운데엔 나침반 별을 박고 둘레와 테두리엔 밝은 나무 띠를 둘렀다
    id: 'marquetry',
    name: '목공예',
    bg: '#22180F',
    ink: '#F0DCC0',
    backdrop: [
      'radial-gradient(45% 35% at 50% 30%, rgba(255,210,150,.18), transparent 70%)',
      'repeating-linear-gradient(92deg, rgba(0,0,0,.18) 0 2px, transparent 2px 7px, rgba(255,220,170,.03) 7px 9px, transparent 9px 16px)',
      'linear-gradient(180deg, #3A2818, #160F09)',
    ].join(', '),
    form: { bevel: 0.05, size: 0.94, radius: 0.03 },
    body: { color: '#8A7A6A', roughness: 0.35 },
    sticker: { roughness: 0.3 },
    faces: ['#5A3A24', '#E8D2A8', '#B0502E', '#1E1814', '#9A8A4A', '#7A3A6A'],
    lights: {
      sky: '#ffe8c8', ground: '#2a1a0c', hemi: 1.1,
      key: ['#ffe2b8', 2.8, [-4, 6, 5]], fill: ['#ffb070', 0.5, [6, -1, 3]], rim: ['#ffe0b0', 1.4, [2, 3, -6]],
    },
    surface: 'marquetry',
    sound: 'wood',
    motion: 'mechanical',
    ambient: { mode: 'float', shape: 'dot', colors: ['#E8C890', '#C89A60'], count: 40, size: 0.025, speed: 0.25, opacity: 0.6 },
    burst: { shape: 'streak', colors: ['#E8C890', '#C89A60', '#8A5A30'], size: 0.13, speed: 2, gravity: -4, drag: 1.4, life: 1.2 },
  },
  {
    // 70년대 거실의 라바램프. 칸마다 아래서 데워진 밀랍 덩어리가 천천히 떠올랐다 가라앉으며
    // 합쳐졌다 갈라진다. 크롬 받침, 방 안을 물들이는 빛, 끈적하게 돈다
    id: 'lavalamp',
    name: '라바램프',
    bg: '#1A0E24',
    ink: '#FFE6C8',
    backdrop: [
      'radial-gradient(50% 40% at 50% 45%, rgba(255,90,140,.22), transparent 70%)',
      'radial-gradient(30% 25% at 18% 80%, rgba(255,170,40,.16), transparent 70%)',
      'radial-gradient(30% 25% at 85% 20%, rgba(150,90,255,.18), transparent 70%)',
      'repeating-radial-gradient(circle at 50% 120%, rgba(255,140,60,.05) 0 30px, transparent 30px 60px)',
      '#1A0E24',
    ].join(', '),
    drift: 'radial-gradient(35% 28% at 40% 60%, rgba(255,80,160,.12), transparent 70%)',
    form: { bevel: 0.07, size: 0.92, radius: 0.18 },
    body: { color: '#B8BCC4', roughness: 0.18, metalness: 1 },
    sticker: { roughness: 0.08 },
    faces: ['#FF7A1E', '#FF3A8A', '#FFD83A', '#6AE03A', '#2AC8F0', '#9A5AFF'],
    lights: {
      sky: '#ff9ac8', ground: '#1a0820', hemi: 0.7,
      key: ['#ffd0e0', 1.6, [-4, 5, 5]], fill: ['#ff8a3a', 0.8, [6, -2, 3]], rim: ['#b88aff', 1.6, [0, 4, -6]],
    },
    env: 1.3,
    surface: 'lavalamp',
    sound: 'molten',
    motion: 'heavy',
    ambient: { mode: 'rise', shape: 'bubble', colors: ['#FFB0D0', '#FFD8A0'], count: 30, size: 0.07, speed: 0.25, opacity: 0.5 },
    burst: { shape: 'glow', colors: 'faces', size: 0.16, speed: 1.4, gravity: 1.2, drag: 1.6, life: 1.6, additive: true },
  },
  {
    // 택배 상자 속. 큐브를 뽁뽁이로 쌌다. 칸마다 공기 방울이 볼록 솟아 반질거리고, 하나씩 톡 터지며 반짝하고
    // 납작하게 구겨졌다가 한참 지나면 다시 부푼다. 딸깍 끼우듯 돈다
    id: 'bubblewrap',
    name: '뽁뽁이',
    bg: '#C9A273',
    ink: '#2A1E12',
    backdrop: [
      'linear-gradient(90deg, transparent 38%, rgba(255,240,205,.32) 38%, rgba(255,240,205,.32) 60%, transparent 60%)',
      'repeating-linear-gradient(90deg, rgba(0,0,0,.035) 0 3px, transparent 3px 9px)',
      'radial-gradient(70% 55% at 50% 42%, #D8B585, #B08758)',
    ].join(', '),
    form: { bevel: 0.07, size: 0.94, radius: 0.08, grid: 48 },
    body: { color: '#2E3238', roughness: 0.35 },
    faces: ['#E8343A', '#2A62D8', '#F4F4F0', '#F6D02A', '#2AAA4A', '#F27A1E'],
    lights: {
      sky: '#ffffff', ground: '#8a6a48', hemi: 1.1,
      key: ['#ffffff', 1.8, [-4, 6, 5]], fill: ['#fff2e0', 0.4, [6, 0, 3]], rim: ['#ffffff', 1.4, [2, 4, -6]],
    },
    env: 0.5,
    surface: 'bubblewrap',
    sound: 'pop',
    motion: 'snap',
    burst: { shape: 'star', colors: ['#FFFFFF', '#E8F4FF'], size: 0.16, speed: 2.6, gravity: 0, drag: 3, life: 0.6, additive: true },
  },
  {
    // 열화상 카메라로 본 큐브. 면마다 온도가 달라 색이 다르고, 열이 아지랑이처럼 일렁인다.
    // 손가락을 대면 그 자리가 데워지고, 돌리면 가장자리부터 마찰열이 오른다. 뷰파인더 표시와 센서 잡음
    id: 'thermal',
    name: '열화상',
    bg: '#06040C',
    ink: '#F4E8FF',
    backdrop: [
      'repeating-linear-gradient(180deg, rgba(255,255,255,.03) 0 1px, transparent 1px 3px)',
      'radial-gradient(14% 26% at 14% 72%, rgba(255,150,40,.3), rgba(170,20,120,.18) 45%, transparent 70%)',
      'radial-gradient(12% 22% at 86% 30%, rgba(255,220,90,.22), rgba(170,20,120,.14) 45%, transparent 70%)',
      'radial-gradient(70% 55% at 50% 50%, #1A0A32, #06040C)',
    ].join(', '),
    form: { bevel: 0.05, size: 0.92, radius: 0.05 },
    body: { color: '#120A24', roughness: 0.4 },
    faces: ['#E86FA0', '#5D3093', '#FFFEF6', '#B843C2', '#FCA360', '#FFDE78'],
    lights: {
      sky: '#40305a', ground: '#000000', hemi: 0.4,
      key: ['#ffffff', 0.6, [-4, 5, 5]], fill: ['#ff60a0', 0.2, [6, 0, 3]], rim: ['#ffb060', 0.6, [0, 4, -6]],
    },
    surface: 'thermal',
    sound: 'glitch',
    motion: 'smooth',
    ambient: { mode: 'rise', shape: 'glow', colors: ['#FF9A3A', '#FFE07A', '#C83AA0'], count: 30, size: 0.08, speed: 0.4, opacity: 0.35, additive: true },
    burst: { shape: 'glow', colors: ['#FFFFFF', '#FFE07A', '#FF9A3A'], size: 0.12, speed: 2.4, gravity: 1, drag: 2, life: 0.8, additive: true },
  },

  {
    // 만화경 속. 칸마다 거울 세 장이 비춘 색유리 조각이 천천히 돌며 무늬가 피었다 진다.
    // 면 색 유리가 가장 많고 다른 색이 섞인다. 놋쇠 통 몸통, 흐릿한 빛망울 배경
    id: 'kaleido',
    name: '만화경',
    bg: '#0A0810',
    ink: '#F6EAFF',
    backdrop: [
      bokeh(26, 51),
      'radial-gradient(70% 55% at 50% 45%, #1C1428, #06040A)',
    ].join(', '),
    form: { bevel: 0.07, size: 0.92, radius: 0.08 },
    body: { color: '#B08A40', roughness: 0.3, metalness: 1 },
    faces: ['#E8287A', '#20C8E0', '#F4C020', '#20B060', '#8A40E0', '#F06A20'],
    lights: {
      sky: '#ffe8c8', ground: '#100810', hemi: 0.9,
      key: ['#fff0dc', 2, [-4, 6, 5]], fill: ['#c080ff', 0.4, [6, 0, 3]], rim: ['#ffd090', 1.2, [2, 3, -6]],
    },
    env: 1.2,
    surface: 'kaleido',
    sound: 'crystal',
    motion: 'fluid',
    ambient: { mode: 'float', shape: 'star', colors: 'faces', count: 30, size: 0.06, speed: 0.3, opacity: 0.7, additive: true },
    burst: { shape: 'star', colors: 'faces', size: 0.16, speed: 2.4, gravity: 0, drag: 2.4, life: 0.9, additive: true },
  },
  {
    // 기차역 대합실의 플립 보드. 칸마다 반으로 갈린 판에 숫자가 적혀 있다가, 때가 되면 위쪽 판이 툭 떨어지며
    // 다음 숫자로 넘어간다. 판 색이 곧 면 색, 가운데 틈과 경첩. 착착 끊기며 돈다
    id: 'flip',
    name: '플립보드',
    bg: '#16181C',
    ink: '#F2F0E8',
    backdrop: [
      'repeating-linear-gradient(180deg, transparent 0 22px, rgba(0,0,0,.6) 22px 24px)',
      'repeating-linear-gradient(90deg, rgba(255,210,80,.06) 0 14px, transparent 14px 16px)',
      'radial-gradient(70% 55% at 50% 40%, #262A30, #0C0D10)',
    ].join(', '),
    form: { bevel: 0.05, size: 0.94, radius: 0.06 },
    body: { color: '#1A1A1C', roughness: 0.5, metalness: 0.3 },
    faces: ['#D8302A', '#2A5AC8', '#F4F0E4', '#F2C21E', '#2A9A4A', '#F07A1E'],
    lights: {
      sky: '#ffffff', ground: '#202020', hemi: 1.6,
      key: ['#ffffff', 1.8, [-3, 6, 5]], fill: ['#fff4e0', 0.4, [6, 0, 3]], rim: ['#ffffff', 1, [0, 4, -6]],
    },
    surface: 'flip',
    sound: 'flip',
    motion: 'stop',
    burst: { shape: 'square', colors: 'faces', size: 0.1, speed: 2.4, gravity: -5, drag: 1, life: 1 },
  },
  {
    // 우주 저편의 블랙홀. 다 맞추면 면 하나에 블랙홀이 하나씩 들어앉는다. 그림자, 광자 고리, 휘어 넘어온 원반 빛,
    // 앞을 가로지르는 강착 원반. 다가오는 쪽이 더 밝고 가스 줄기가 돈다. 별빛이 휘고, 물 흐르듯 돈다
    id: 'blackhole',
    name: '블랙홀',
    bg: '#020206',
    ink: '#E8ECFF',
    backdrop: [
      stars(150, 61),
      'radial-gradient(45% 30% at 30% 70%, rgba(255,140,60,.08), transparent 70%)',
      'radial-gradient(40% 30% at 75% 25%, rgba(90,120,255,.1), transparent 70%)',
      '#020206',
    ].join(', '),
    form: { bevel: 0.05, size: 0.94, radius: 0.05 },
    body: { color: '#08080C', roughness: 0.3, metalness: 0.6, glow: '#FF9A4A' },
    faces: ['#FF8A2A', '#3A7AFF', '#F2EEE4', '#E83AA0', '#3AE08A', '#FFD23A'],
    lights: {
      sky: '#30304a', ground: '#000000', hemi: 0.4,
      key: ['#ffffff', 1, [-5, 4, 5]], fill: ['#ff9a4a', 0.3, [6, -1, 3]], rim: ['#8aa8ff', 1, [0, 4, -6]],
    },
    surface: 'blackhole',
    sound: 'space',
    motion: 'fluid',
    ambient: { mode: 'orbit', shape: 'glow', colors: ['#FFFFFF', '#FFD8A8'], count: 90, size: 0.035, speed: 1.3, opacity: 0.8, additive: true },
    burst: { shape: 'glow', colors: 'faces', size: 0.12, speed: 2.6, gravity: 0, drag: 2, life: 0.9, additive: true },
  },
  {
    // 보석상 진열대의 블랙 오팔. 짙은 바탕 속 색 조각이 보는 각도에 따라 조각마다 켜졌다 꺼지며 번쩍인다.
    // 큰 조각은 할리퀸처럼 모나고, 사이엔 핀파이어. 면마다 도는 빛깔이 다르다. 금 테두리 몸통
    id: 'opal',
    name: '오팔',
    bg: '#0A0A10',
    ink: '#EEF0FF',
    backdrop: [
      'radial-gradient(40% 32% at 50% 38%, rgba(255,255,255,.1), transparent 70%)',
      'repeating-linear-gradient(115deg, rgba(255,255,255,.012) 0 2px, transparent 2px 5px)',
      'radial-gradient(80% 60% at 50% 45%, #1C1A28, #06060A)',
    ].join(', '),
    form: { bevel: 0.08, size: 0.9, radius: 0.16, depth: 0.03 },
    body: { color: '#B8923A', roughness: 0.25, metalness: 1 },
    faces: ['#FF5A2A', '#2A7AFF', '#2AD07A', '#A050FF', '#FFD02A', '#2AE0E0'],
    lights: {
      sky: '#e8e8ff', ground: '#000000', hemi: 0.5,
      key: ['#ffffff', 2, [-4, 6, 5]], fill: ['#c8b0ff', 0.3, [6, 0, 3]], rim: ['#ffffff', 1.4, [0, 4, -6]],
    },
    env: 1.1,
    surface: 'opal',
    sound: 'crystal',
    motion: 'smooth',
    ambient: { mode: 'float', shape: 'star', colors: 'faces', count: 24, size: 0.06, speed: 0.3, opacity: 0.7, additive: true },
    burst: { shape: 'star', colors: 'faces', size: 0.15, speed: 2.4, gravity: 0, drag: 2.6, life: 0.8, additive: true },
  },
  {
    // 광물 진열장의 마노 단면. 다 맞추면 면 하나가 반으로 가른 마노 한 덩이. 가운데 수정 동굴, 겹겹이 물결치는 띠,
    // 거친 바깥 껍질. 매끈하게 갈아 빛이 비쳐 든다
    id: 'agate',
    name: '마노',
    bg: '#16141A',
    ink: '#F0E8F4',
    backdrop: [
      'radial-gradient(45% 35% at 50% 35%, rgba(255,240,220,.12), transparent 70%)',
      PAPER_GRAIN,
      'linear-gradient(180deg, #22202A, #0C0B10)',
    ].join(', '),
    form: { bevel: 0.06, size: 0.94, radius: 0.05, depth: 0.02 },
    body: { color: '#3A332E', roughness: 0.85 },
    faces: ['#6A9AD8', '#D8582A', '#4AA06A', '#9A5AC8', '#E890B0', '#E8B848'],
    lights: {
      sky: '#fff4e8', ground: '#141018', hemi: 0.9,
      key: ['#fff4e8', 2.2, [-4, 6, 5]], fill: ['#d8c8ff', 0.4, [6, 0, 3]], rim: ['#ffffff', 1.2, [0, 4, -6]],
    },
    surface: 'agate',
    sound: 'stone',
    motion: 'heavy',
    ambient: { mode: 'float', shape: 'star', colors: ['#FFFFFF'], count: 18, size: 0.05, speed: 0.25, opacity: 0.6, additive: true },
    burst: { shape: 'square', colors: 'faces', size: 0.08, speed: 2.2, gravity: -4, drag: 1.2, life: 1.1 },
  },
  {
    // 군용 천막 안. 위장 무늬 천을 씌운 큐브. 다 맞추면 면마다 한 장으로 이어진다(숲, 사막, 디지털 바다, 사냥용 주황,
    // 분홍, 설원). 능직 천의 비스듬한 결, 기계처럼 딱딱 돈다
    id: 'camo',
    name: '카모',
    bg: '#3A3A2C',
    ink: '#ECE8D8',
    backdrop: [
      'repeating-linear-gradient(45deg, rgba(0,0,0,.06) 0 2px, transparent 2px 5px)',
      'repeating-linear-gradient(-45deg, rgba(255,255,255,.03) 0 2px, transparent 2px 5px)',
      'radial-gradient(70% 55% at 50% 40%, #4E4E3A, #24241A)',
    ].join(', '),
    form: { bevel: 0.07, size: 0.94, radius: 0.06 },
    body: { color: '#2E3328', roughness: 0.9 },
    faces: ['#4A7A3A', '#C8A870', '#2A5AA8', '#F07A1E', '#E070A8', '#E8ECEE'],
    lights: {
      sky: '#f4f0dc', ground: '#2a2a1a', hemi: 1.6,
      key: ['#fff4dc', 1.8, [-4, 6, 5]], fill: ['#d8e0c0', 0.4, [6, 0, 3]], rim: ['#ffffff', 0.6, [0, 4, -6]],
    },
    surface: 'camo',
    sound: 'cloth',
    motion: 'mechanical',
    burst: { shape: 'leaf', colors: ['#4A7A3A', '#6A5A32', '#2A3A1E'], size: 0.15, speed: 1.6, gravity: -1.2, drag: 2.2, life: 1.4 },
  },
  {
    // 오두막 벽난로 앞 모직 담요. 다 맞추면 면 하나가 한 장의 타탄 천. 날실과 씨실 줄무늬가 엇갈려 체크를 이루고
    // 2/2 능직의 비스듬한 결, 보풀. 면마다 바탕과 짙은 띠, 가는 줄 색이 다르다. 가죽 덧댐 몸통
    id: 'tartan',
    name: '타탄',
    bg: '#2A1E16',
    ink: '#F2E6D8',
    backdrop: [
      'radial-gradient(35% 28% at 18% 85%, rgba(255,140,50,.22), transparent 70%)',
      'repeating-linear-gradient(90deg, rgba(0,0,0,.18) 0 3px, transparent 3px 60px)',
      'linear-gradient(180deg, #3A2A1E, #1A120C)',
    ].join(', '),
    form: { bevel: 0.12, size: 0.94, radius: 0.14, grid: 24 },
    body: { color: '#5A3A24', roughness: 0.55 },
    faces: ['#C82A2A', '#2A6A3A', '#2A4A9A', '#E8C040', '#F0EEE6', '#8A3A7A'],
    lights: {
      sky: '#ffe8cc', ground: '#2a1a10', hemi: 1.5,
      key: ['#ffe2c0', 2.2, [-4, 6, 5]], fill: ['#ff9a5a', 0.5, [6, -1, 3]], rim: ['#fff0d8', 1, [2, 4, -6]],
    },
    surface: 'tartan',
    sound: 'cloth',
    motion: 'bouncy',
    ambient: { mode: 'float', shape: 'dot', colors: ['#FFE8D0', '#FFFFFF'], count: 24, size: 0.03, speed: 0.15, opacity: 0.5 },
    burst: { shape: 'dot', colors: 'faces', size: 0.05, speed: 1.4, gravity: -1, drag: 2.6, life: 1.4 },
  },
  {
    // 양복점 재단대. 다 맞추면 면 하나가 한 폭의 모직이다. 짙은 실 넷·면 색 실 넷을 번갈아 걸고 2/2 능직으로 짜
    // 저절로 사냥개 이빨 무늬가 나온다. 꼬인 올과 잔털, 쿠션처럼 도톰한 칸
    id: 'houndstooth',
    name: '하운드투스',
    bg: '#E6DED0',
    ink: '#2A2218',
    backdrop: [
      'repeating-linear-gradient(90deg, rgba(120,90,60,.06) 0 1px, transparent 1px 12px)',
      'radial-gradient(70% 55% at 50% 40%, #EFE8DC, #CFC2AE)',
    ].join(', '),
    form: { bevel: 0.12, size: 0.94, radius: 0.14, grid: 24 },
    body: { color: '#2A2628', roughness: 0.9 },
    faces: ['#C83A3A', '#2E5AA8', '#E8E2D2', '#3A8A4A', '#E8B83A', '#8A4AA0'],
    lights: {
      sky: '#ffffff', ground: '#a09080', hemi: 1.5,
      key: ['#fff6ec', 2.1, [-4, 6, 5]], fill: ['#e8f0ff', 0.5, [6, 0, 3]], rim: ['#ffffff', 1.0, [0, 4, -6]],
    },
    burst: { shape: 'dot', colors: 'faces', size: 0.05, speed: 1.4, gravity: -1, drag: 2.6, life: 1.4 },
    surface: 'houndstooth',
    sound: 'cloth',
    motion: 'squish',
  },
  {
    // 양복점 재단대. 다 맞추면 면 하나가 한 폭의 양복감이다. 넷씩 번갈아 건 굵은 칸과 둘씩 번갈아 건 잔 칸이
    // 능직으로 짜여 큰 체크 안에 잔 무늬가 생기고, 그 위로 가는 색실이 지나간다. 실 빛깔은 면 색을 짙게·옅게 물들인 것
    id: 'glencheck',
    name: '글렌체크',
    bg: '#E6DED0',
    ink: '#2A2218',
    backdrop: [
      'repeating-linear-gradient(90deg, rgba(120,90,60,.06) 0 1px, transparent 1px 12px)',
      'radial-gradient(70% 55% at 50% 40%, #EFE8DC, #CFC2AE)',
    ].join(', '),
    form: { bevel: 0.12, size: 0.94, radius: 0.14, grid: 24 },
    body: { color: '#2A2628', roughness: 0.9 },
    faces: ['#8A8F98', '#7A5A3A', '#3A5A8A', '#5A7A3A', '#9A3A3A', '#C8B890'],
    lights: {
      sky: '#ffffff', ground: '#a09080', hemi: 1.5,
      key: ['#fff6ec', 2.1, [-4, 6, 5]], fill: ['#e8f0ff', 0.5, [6, 0, 3]], rim: ['#ffffff', 1.0, [0, 4, -6]],
    },
    burst: { shape: 'dot', colors: 'faces', size: 0.05, speed: 1.4, gravity: -1, drag: 2.6, life: 1.4 },
    surface: 'glencheck',
    sound: 'cloth',
    motion: 'squish',
  },
  {
    // 산장 벽난로 앞. 다 맞추면 면 하나가 한 폭의 트위드다. 면 색 날실과 크림색 씨실을 능직으로 짜되 여덟 올마다
    // 사선을 뒤집어 청어 뼈 V자가 생긴다. 굵고 거친 모사와 군데군데 박힌 색 털 뭉치
    id: 'herringbone',
    name: '헤링본',
    bg: '#2A2018',
    ink: '#F0E4D0',
    backdrop: [
      'radial-gradient(40% 30% at 50% 85%, rgba(255,150,60,.25), transparent 70%)',
      'radial-gradient(80% 65% at 50% 40%, #4A3424, #160E08)',
    ].join(', '),
    form: { bevel: 0.12, size: 0.94, radius: 0.14, grid: 24 },
    body: { color: '#1A1410', roughness: 0.9 },
    faces: ['#4A4E58', '#7A5232', '#24427A', '#4E6A3A', '#8A2E2E', '#B8A07A'],
    lights: {
      sky: '#ffffff', ground: '#a09080', hemi: 1.5,
      key: ['#fff6ec', 2.1, [-4, 6, 5]], fill: ['#e8f0ff', 0.5, [6, 0, 3]], rim: ['#ffffff', 1.0, [0, 4, -6]],
    },
    burst: { shape: 'dot', colors: 'faces', size: 0.05, speed: 1.4, gravity: -1, drag: 2.6, life: 1.4 },
    surface: 'herringbone',
    sound: 'cloth',
    motion: 'squish',
  },
  {
    // 소풍 돗자리. 다 맞추면 면 하나가 한 폭의 면직이다. 면 색 실과 흰 실을 여섯 올씩 번갈아 걸어 평직으로 짜면
    // 둘 다 색실인 칸은 진하게, 하나만 색실인 칸은 반쯤 옅게, 둘 다 흰 칸은 하얗게 나와 바둑판이 된다
    id: 'gingham',
    name: '깅엄',
    bg: '#CFE6B8',
    ink: '#203018',
    backdrop: [
      'radial-gradient(60% 45% at 50% 20%, rgba(255,255,240,.6), transparent 70%)',
      'radial-gradient(80% 65% at 50% 45%, #D8EEC0, #9CC488)',
    ].join(', '),
    form: { bevel: 0.12, size: 0.94, radius: 0.14, grid: 24 },
    body: { color: '#E8E2D8', roughness: 0.9 },
    faces: ['#D83A3A', '#2E6AD0', '#E8D040', '#2E9A5A', '#E07AB0', '#202020'],
    lights: {
      sky: '#ffffff', ground: '#a09080', hemi: 1.5,
      key: ['#fff6ec', 2.1, [-4, 6, 5]], fill: ['#e8f0ff', 0.5, [6, 0, 3]], rim: ['#ffffff', 1.0, [0, 4, -6]],
    },
    burst: { shape: 'dot', colors: 'faces', size: 0.05, speed: 1.4, gravity: -1, drag: 2.6, life: 1.4 },
    surface: 'gingham',
    sound: 'cloth',
    motion: 'squish',
  },
  {
    // 겨울 골프장. 다 맞추면 면 하나가 스웨터 앞판이다. 면 색과 짙은 색 마름모가 번갈아 떠졌고, 크림색 겹줄이
    // 마름모를 비스듬히 가로지른다. 코 단위로 계단진 가장자리, 도톰한 V자 코
    id: 'argyle',
    name: '아가일',
    bg: '#DDE6E8',
    ink: '#1A2428',
    backdrop: [
      'radial-gradient(60% 45% at 50% 25%, rgba(255,255,255,.6), transparent 70%)',
      'radial-gradient(80% 65% at 50% 45%, #E8F0F2, #AFC2C8)',
    ].join(', '),
    form: { bevel: 0.12, size: 0.94, radius: 0.14, grid: 56 },
    body: { color: '#2A2628', roughness: 0.9 },
    faces: ['#2E4A8A', '#B83A3A', '#3A7A4A', '#E8B83A', '#6A3A8A', '#E8E2D4'],
    lights: {
      sky: '#ffffff', ground: '#a09080', hemi: 1.5,
      key: ['#fff6ec', 2.1, [-4, 6, 5]], fill: ['#e8f0ff', 0.5, [6, 0, 3]], rim: ['#ffffff', 1.0, [0, 4, -6]],
    },
    burst: { shape: 'dot', colors: 'faces', size: 0.05, speed: 1.4, gravity: -1, drag: 2.6, life: 1.4 },
    surface: 'argyle',
    sound: 'cloth',
    motion: 'squish',
  },
  {
    // 여름 창가 커튼. 다 맞추면 면 하나가 한 폭의 얇은 면 보일이다. 면 색 성근 평직 위에 하얀 실 뭉치를 짜 넣고 잘라
    // 보송한 물방울이 실제로 솟았다. 바탕은 얇아 살짝 비친다
    id: 'swissdot',
    name: '스위스 도트',
    bg: '#F6F0E8',
    ink: '#3A2A28',
    backdrop: [
      'radial-gradient(60% 45% at 50% 25%, rgba(255,255,255,.7), transparent 70%)',
      'radial-gradient(80% 65% at 50% 45%, #FFF8F0, #E8D8C8)',
    ].join(', '),
    form: { bevel: 0.12, size: 0.94, radius: 0.14, grid: 48 },
    body: { color: '#F4F0EA', roughness: 0.9 },
    faces: ['#E88AA0', '#6AA8E0', '#F2D060', '#7AC08A', '#B080E0', '#F0A060'],
    lights: {
      sky: '#ffffff', ground: '#a09080', hemi: 1.5,
      key: ['#fff6ec', 2.1, [-4, 6, 5]], fill: ['#e8f0ff', 0.5, [6, 0, 3]], rim: ['#ffffff', 1.0, [0, 4, -6]],
    },
    burst: { shape: 'dot', colors: 'faces', size: 0.05, speed: 1.4, gravity: -1, drag: 2.6, life: 1.4 },
    surface: 'swissdot',
    sound: 'cloth',
    motion: 'squish',
  },
  {
    // 이탈리아 니트 공방. 다 맞추면 면 하나가 지그재그 줄무늬 스웨터다. 면 색, 크림, 짙은 색, 옅은 면 색 줄이
    // 산 모양으로 오르내리며 번갈아 떠졌고, 비탈이 코 단위로 잘게 계단진다
    id: 'chevron',
    name: '셰브론',
    bg: '#2A2420',
    ink: '#F2E8DC',
    backdrop: [
      'repeating-linear-gradient(135deg, rgba(255,255,255,.03) 0 6px, transparent 6px 14px)',
      'radial-gradient(80% 65% at 50% 45%, #4A3A34, #1A1210)',
    ].join(', '),
    form: { bevel: 0.12, size: 0.94, radius: 0.14, grid: 56 },
    body: { color: '#C8BEB0', roughness: 0.9 },
    faces: ['#E05A3A', '#2E7AB8', '#E8C040', '#3A9A6A', '#C04A8A', '#3A3A48'],
    lights: {
      sky: '#ffffff', ground: '#a09080', hemi: 1.5,
      key: ['#fff6ec', 2.1, [-4, 6, 5]], fill: ['#e8f0ff', 0.5, [6, 0, 3]], rim: ['#ffffff', 1.0, [0, 4, -6]],
    },
    burst: { shape: 'dot', colors: 'faces', size: 0.05, speed: 1.4, gravity: -1, drag: 2.6, life: 1.4 },
    surface: 'chevron',
    sound: 'cloth',
    motion: 'squish',
  },

  {
    // 불 꺼진 동굴 속 잠든 용. 다 맞추면 면 하나가 비늘 덮인 살갗 한 장. 아래로 겹친 비늘이 도톰하고 가운데 등줄이 서며,
    // 보는 각도에 따라 빛깔이 돈다. 비늘 틈으로 몸속 불씨가 숨 쉬듯 빛나고, 묵직하게 돈다
    id: 'dragon',
    name: '용 비늘',
    bg: '#120C0A',
    ink: '#F4E2D0',
    backdrop: [
      'radial-gradient(30% 22% at 20% 80%, rgba(255,110,30,.16), transparent 70%)',
      'radial-gradient(25% 18% at 82% 70%, rgba(255,80,20,.12), transparent 70%)',
      'radial-gradient(80% 60% at 50% 40%, #241812, #080504)',
    ].join(', '),
    drift: 'radial-gradient(30% 22% at 50% 85%, rgba(255,120,40,.1), transparent 70%)',
    form: { bevel: 0.07, size: 0.94, radius: 0.08, grid: 48 },
    body: { color: '#1A1410', roughness: 0.6 },
    faces: ['#C82A2A', '#2A8A4A', '#2A5AB8', '#D8A82A', '#5A2A7A', '#D8DCE0'],
    lights: {
      sky: '#ffc8a0', ground: '#200a04', hemi: 0.9,
      key: ['#ffe0c0', 2.4, [-4, 6, 5]], fill: ['#ff6a2a', 0.7, [6, -2, 3]], rim: ['#ffb070', 1.4, [0, 4, -6]],
    },
    flicker: 'candle',
    env: 0.8,
    surface: 'dragon',
    sound: 'scale',
    motion: 'heavy',
    ambient: { mode: 'rise', shape: 'glow', colors: ['#FFB04A', '#FF6A1A'], count: 50, size: 0.04, speed: 0.4, opacity: 0.8, additive: true },
    burst: { shape: 'glow', colors: ['#FFD08A', '#FF8A2A', '#FF4A1A'], size: 0.1, speed: 2.6, gravity: 1.4, drag: 1.6, life: 1, additive: true },
  },
  {
    // 재가 날리는 둥지. 다 맞추면 면 하나가 깃털 덮인 날개 한 장. 끝이 뾰족한 깃털이 아래로 겹겹이 포개져 도톰하고
    // 깃대와 깃가지가 섰으며, 깃털 끝은 불씨처럼 타올라 일렁인다. 깃털 사이 그늘엔 잉걸불. 깃털 색이 곧 면 색
    id: 'phoenix',
    name: '불사조 깃털',
    bg: '#120806',
    ink: '#F6E2CC',
    backdrop: [
      'radial-gradient(35% 25% at 50% 85%, rgba(255,120,30,.25), transparent 70%)',
      'radial-gradient(80% 60% at 50% 40%, #2A140C, #060302)',
    ].join(', '),
    form: { bevel: 0.07, size: 0.94, radius: 0.08, grid: 48 },
    body: { color: '#1A0E0A', roughness: 0.6 },
    faces: ['#E0301E', '#F2A41E', '#2E6AE8', '#20B070', '#9A3AD8', '#F2E8D8'],
    lights: {
      sky: '#ffc8a0', ground: '#200a04', hemi: 0.9,
      key: ['#ffe0c0', 2.4, [-4, 6, 5]], fill: ['#ff6a2a', 0.6, [6, -2, 3]], rim: ['#ffb070', 1.3, [0, 4, -6]],
    },
    flicker: 'candle',
    ambient: { mode: 'rise', shape: 'glow', colors: ['#FFB04A', '#FF6A1A', '#FFE08A'], count: 60, size: 0.035, speed: 0.6, opacity: 0.85, additive: true },
    burst: { shape: 'glow', colors: ['#FFD27A', '#FF7A2A', '#FFFFFF'], size: 0.06, speed: 2.4, gravity: -2, drag: 1.6, life: 1.2, additive: true },
    surface: 'phoenix',
    sound: 'space',
    motion: 'fluid',
  },
  {
    // 요정 대장간. 다 맞추면 면 하나가 사슬 갑옷 한 장. 고리 하나가 네 고리를 꿰는 4-1 엮음으로 줄마다 고리가 번갈아 기울어
    // 이웃 고리 위아래로 지나가고, 틈으로 짙은 누비옷이 비친다. 은빛에 푸른 윤, 면마다 다른 빛으로 물들인 고리
    id: 'mithril',
    name: '미스릴 사슬',
    bg: '#0C0E14',
    ink: '#E8EEF8',
    backdrop: [
      'radial-gradient(45% 35% at 50% 30%, rgba(160,190,255,.18), transparent 70%)',
      'radial-gradient(80% 65% at 50% 45%, #1C2030, #05060A)',
    ].join(', '),
    form: { bevel: 0.07, size: 0.94, radius: 0.08, grid: 24 },
    body: { color: '#2A2A30', roughness: 0.35, metalness: 0.8 },
    faces: ['#C8CCD4', '#D4A040', '#7A4AB0', '#2E6AC8', '#2EA89A', '#B05A3A'],
    lights: {
      sky: '#e8f0ff', ground: '#10101a', hemi: 1.0,
      key: ['#ffffff', 2.4, [-4, 6, 5]], fill: ['#a8b8ff', 0.5, [6, 0, 3]], rim: ['#d0e0ff', 1.3, [2, 4, -6]],
    },
    env: 1.1,
    burst: { shape: 'star', colors: ['#FFFFFF', '#BFD8FF'], size: 0.1, speed: 2.4, gravity: 0, drag: 2.4, life: 0.7, additive: true },
    surface: 'mithril',
    sound: 'scale',
    motion: 'smooth',
  },
  {
    // 대장장이의 작업대. 다 맞추면 면 하나가 칼날 한 판. 수백 겹 접어 두드린 강철 겹이 물결치고 군데군데 빗방울 고리가 피었다.
    // 산에 부식시켜 짙은 겹은 패이고 밝은 겹은 반들거린다. 달군 온도에 따라 면마다 산화막 빛깔이 다르다(짚빛, 청동, 보라, 파랑, 하늘, 은)
    id: 'damascus',
    name: '다마스쿠스',
    bg: '#141210',
    ink: '#EEE8E0',
    backdrop: [
      'radial-gradient(35% 25% at 30% 85%, rgba(255,140,60,.18), transparent 70%)',
      'radial-gradient(80% 65% at 50% 45%, #2A2622, #080706)',
    ].join(', '),
    form: { bevel: 0.07, size: 0.94, radius: 0.08, grid: 40 },
    body: { color: '#1A1A1E', roughness: 0.3, metalness: 0.9 },
    faces: ['#D8B860', '#B07040', '#9A3A8A', '#3A5AB0', '#7AA8D0', '#C8CCD0'],
    lights: {
      sky: '#ffc8a0', ground: '#200a04', hemi: 0.9,
      key: ['#ffe0c0', 2.4, [-4, 6, 5]], fill: ['#ff6a2a', 0.6, [6, -2, 3]], rim: ['#ffb070', 1.3, [0, 4, -6]],
    },
    env: 1.0,
    burst: { shape: 'streak', colors: ['#FFD27A', '#FFFFFF'], size: 0.1, speed: 3, gravity: 3, drag: 1.2, life: 0.6, additive: true },
    surface: 'damascus',
    sound: 'metal',
    motion: 'heavy',
  },
  {
    // 달빛 숲 속 빈터. 다 맞추면 면 하나가 날개 한 장. 한 귀퉁이에서 굵은 날개맥이 부채처럼 뻗고 가는 가로맥이 작은 방을 나눈다.
    // 맥은 솟아 짙고, 방마다 얇은 막이 면 색으로 비치며 보는 각도에 따라 무지갯빛이 아른거린다. 날개 끝 무늬점과 반짝이는 가루
    id: 'fairywing',
    name: '요정 날개',
    bg: '#0A0C16',
    ink: '#EEF0FF',
    backdrop: [
      'radial-gradient(30% 22% at 70% 18%, rgba(220,230,255,.35), transparent 70%)',
      'radial-gradient(80% 65% at 50% 45%, #182030, #04050A)',
    ].join(', '),
    form: { bevel: 0.07, size: 0.94, radius: 0.08, grid: 40 },
    body: { color: '#1A1A2A', roughness: 0.3 },
    faces: ['#FF7AC8', '#7AD8FF', '#B8F07A', '#FFD27A', '#B88AFF', '#F2F4FF'],
    lights: {
      sky: '#e8f0ff', ground: '#10101a', hemi: 1.0,
      key: ['#ffffff', 2.4, [-4, 6, 5]], fill: ['#a8b8ff', 0.5, [6, 0, 3]], rim: ['#d0e0ff', 1.3, [2, 4, -6]],
    },
    ambient: { mode: 'float', shape: 'glow', colors: ['#FFFFFF', '#FFD6F0', '#BFEFFF'], count: 40, size: 0.03, speed: 0.3, opacity: 0.7, additive: true },
    burst: { shape: 'star', colors: 'faces', size: 0.1, speed: 2, gravity: -0.5, drag: 2, life: 1.2, additive: true },
    surface: 'fairywing',
    sound: 'crystal',
    motion: 'fluid',
  },
  {
    // 용의 둥지. 다 맞추면 면 하나가 거대한 알 껍데기 한 판. 잔 육각 비늘이 오돌토돌 솟아 오팔처럼 무지갯빛이 돌고 검은 점이 흩뿌려졌다.
    // 곧 깨어나려는지 금이 그물처럼 갔고, 금 사이로 속불이 새어 나와 심장처럼 뛴다. 껍데기 색이 곧 면 색
    id: 'dragonegg',
    name: '용의 알',
    bg: '#100A08',
    ink: '#F4E6D6',
    backdrop: [
      'radial-gradient(35% 25% at 50% 80%, rgba(255,110,30,.2), transparent 70%)',
      'radial-gradient(80% 60% at 50% 40%, #241812, #060403)',
    ].join(', '),
    form: { bevel: 0.07, size: 0.94, radius: 0.08, grid: 48 },
    body: { color: '#1A1410', roughness: 0.6 },
    faces: ['#B8202A', '#20704A', '#2A4A9A', '#D89A2A', '#7A2A7A', '#E8E0D0'],
    lights: {
      sky: '#ffc8a0', ground: '#200a04', hemi: 0.9,
      key: ['#ffe0c0', 2.4, [-4, 6, 5]], fill: ['#ff6a2a', 0.6, [6, -2, 3]], rim: ['#ffb070', 1.3, [0, 4, -6]],
    },
    flicker: 'candle',
    env: 0.8,
    burst: { shape: 'glow', colors: ['#FFB04A', '#FF6A1A'], size: 0.06, speed: 2, gravity: -1, drag: 1.6, life: 1.1, additive: true },
    surface: 'dragonegg',
    sound: 'ceramic',
    motion: 'heavy',
  },
  {
    // 봄날 목장. 막 깎은 양털 뭉치를 씌운 큐브. 꼬불꼬불 주름진 털 다발이 볼록볼록 솟고 다발 사이 골은 깊다.
    // 하얀 양, 검은 양, 그리고 붉게, 파랗게, 노랗게, 초록으로 물들인 털. 나무 울타리 몸통, 말랑하게 돈다
    id: 'wool',
    name: '양털',
    bg: '#9CC27A',
    ink: '#1E2A14',
    backdrop: [
      'radial-gradient(18% 9% at 22% 20%, rgba(255,255,255,.9) 60%, transparent 70%)',
      'radial-gradient(14% 7% at 30% 17%, rgba(255,255,255,.9) 60%, transparent 70%)',
      'radial-gradient(16% 8% at 76% 28%, rgba(255,255,255,.85) 60%, transparent 70%)',
      'radial-gradient(120% 40% at 30% 100%, #7FAE5A 0 60%, transparent 61%)',
      'radial-gradient(120% 45% at 85% 105%, #6C9E4C 0 60%, transparent 61%)',
      'linear-gradient(180deg, #8EC8F0 0 55%, #A8D290 55%)',
    ].join(', '),
    form: { bevel: 0.12, size: 0.94, radius: 0.16, grid: 48 },
    body: { color: '#8A6A48', roughness: 0.8 },
    faces: ['#F2EEE2', '#2A2624', '#C83A3A', '#3A5AB8', '#E8C040', '#4A9A50'],
    lights: {
      sky: '#e8f4ff', ground: '#6a8a4a', hemi: 1.8,
      key: ['#fff6e0', 2.2, [-4, 7, 5]], fill: ['#d8ecff', 0.5, [6, 0, 3]], rim: ['#fff8e8', 1.4, [2, 4, -6]],
    },
    surface: 'wool',
    sound: 'cloth',
    motion: 'squish',
    ambient: { mode: 'float', shape: 'glow', colors: ['#FFFFFF', '#F4EEE0'], count: 22, size: 0.05, speed: 0.2, opacity: 0.6 },
    burst: { shape: 'glow', colors: 'faces', size: 0.09, speed: 1.6, gravity: -1, drag: 2.4, life: 1.2, opacity: 0.85 },
  },


  {
    // 톱밥 깔린 햄스터 집. 조각마다 햄스터처럼 동그랗게 부풀어 숨 쉬듯 들썩이고, 아주 가늘고 보송한 털이 덮였다.
    // 다 맞추면 면마다 한 마리의 등이다. 골든, 정글리안, 펄, 블랙, 푸딩, 사파이어. 돌리면 해바라기씨가 튄다
    id: 'hamster',
    name: '햄스터',
    bg: '#EADCC0',
    ink: '#2E2418',
    backdrop: [
      'repeating-linear-gradient(35deg, rgba(200,160,100,.18) 0 3px, transparent 3px 11px)',
      'repeating-linear-gradient(-50deg, rgba(240,220,180,.4) 0 2px, transparent 2px 9px)',
      'radial-gradient(70% 55% at 50% 45%, #F4EAD6, #D8C4A0)',
    ].join(', '),
    form: { bevel: 0.16, size: 0.94, radius: 0.3, grid: 40 },
    body: { color: '#5A8A6A', roughness: 0.4 },
    faces: ['#D88A40', '#8A7058', '#F4F0EC', '#262426', '#F2CC68', '#7A8698'],
    lights: {
      sky: '#fff8ee', ground: '#b8a080', hemi: 1.7,
      key: ['#fff2e0', 2.2, [-4, 6, 5]], fill: ['#ffe8d8', 0.5, [6, 0, 3]], rim: ['#ffffff', 1.6, [2, 4, -6]],
    },
    surface: 'hamster',
    sound: 'cloth',
    motion: 'squish',
    burst: { shape: 'streak', colors: ['#3A3430', '#F2EEE6', '#5A524A'], size: 0.09, speed: 1.8, gravity: -6, drag: 1, life: 1.1, turns: true },
  },
  {
    // 셀 애니메이션 속 하늘. 렌더링 자체가 카툰이다: 빛을 세 단으로 딱 끊어 칠하고 그늘엔 보랏빛, 밝은 쪽 가장자리엔 림 라이트,
    // 둥근 모서리엔 하이라이트 한 줄. 화면 필터가 큐브 실루엣과 조각 사이에 먹선을 긋고, 스티커 테두리에도 같은 굵기의 먹선.
    // 뭉게구름과 반짝이, 통통 튀며 돈다
    id: 'toon',
    name: '카툰',
    bg: '#8EC8FF',
    ink: '#1A2440',
    backdrop: [
      'radial-gradient(14% 8% at 20% 26%, #FFFFFF 70%, transparent 72%)',
      'radial-gradient(10% 7% at 27% 22%, #FFFFFF 70%, transparent 72%)',
      'radial-gradient(12% 7% at 14% 24%, #FFFFFF 70%, transparent 72%)',
      'radial-gradient(16% 9% at 80% 70%, #FFFFFF 70%, transparent 72%)',
      'radial-gradient(11% 7% at 88% 66%, #FFFFFF 70%, transparent 72%)',
      'linear-gradient(180deg, #5AA8FF, #A8D8FF 70%, #D8F0FF)',
    ].join(', '),
    form: { bevel: 0.12, size: 0.86, radius: 0.16 },
    body: { color: '#2A2A4A', roughness: 1 },
    faces: ['#FF5A6E', '#4A7AF0', '#FFF6E8', '#FFD23A', '#3AD07A', '#B06AF0'],
    filter: 'toon',
    surface: 'toon',
    sound: 'pop',
    motion: 'bouncy',
    ambient: { mode: 'float', shape: 'star', colors: ['#FFFFFF', '#FFF2A8'], count: 24, size: 0.08, speed: 0.4, opacity: 0.9 },
    burst: { shape: 'star', colors: 'faces', size: 0.2, speed: 2.6, gravity: -1, drag: 2.4, life: 0.8 },
  },
  {
    // 우주 저편의 성운. 다 맞추면 면 하나가 성운 한 덩이다. 휘감기며 번지는 빛나는 가스와 그 앞을 가로막는 먼지 띠,
    // 갓 태어난 밝은 별과 빛무리, 촘촘한 잔별. 아주 천천히 흐른다
    id: 'nebula',
    name: '성운',
    bg: '#03030A',
    ink: '#EAE6FF',
    backdrop: [
      stars(140, 71),
      'radial-gradient(50% 40% at 25% 70%, rgba(200,60,160,.12), transparent 70%)',
      'radial-gradient(45% 35% at 75% 30%, rgba(60,120,255,.12), transparent 70%)',
      '#03030A',
    ].join(', '),
    form: { bevel: 0.05, size: 0.94, radius: 0.05 },
    body: { color: '#0A0A14', roughness: 0.3, metalness: 0.6 },
    faces: ['#E0408A', '#2AB8B0', '#F08A3A', '#3A6AE0', '#9A5AE0', '#6AD05A'],
    lights: {
      sky: '#30304a', ground: '#000000', hemi: 0.4,
      key: ['#ffffff', 1, [-5, 4, 5]], fill: ['#8a7aff', 0.3, [6, -1, 3]], rim: ['#8aa8ff', 1, [0, 4, -6]],
    },
    ambient: { mode: 'orbit', shape: 'glow', colors: ['#FFFFFF', '#E0D0FF'], count: 80, size: 0.035, speed: 1, opacity: 0.8, additive: true },
    burst: { shape: 'star', colors: 'faces', size: 0.14, speed: 2.4, gravity: 0, drag: 2.4, life: 0.9, additive: true },
    surface: 'nebula',
    sound: 'space',
    motion: 'fluid',
  },
  {
    // 별의 표면. 다 맞추면 면 하나가 별 하나의 얼굴이다. 면마다 별의 온도가 달라 빛이 다르다(붉은 왜성, 주황 별, 노란 해,
    // 하얀 별, 푸른 거성, 갈색 왜성). 끓어오르는 쌀알 무늬, 흑점과 반그림자, 백반, 테두리에 솟는 홍염
    id: 'star',
    name: '항성',
    bg: '#050304',
    ink: '#FFF0E0',
    backdrop: [
      'radial-gradient(60% 50% at 50% 45%, rgba(255,160,60,.18), transparent 70%)',
      stars(80, 33),
      '#050304',
    ].join(', '),
    form: { bevel: 0.05, size: 0.94, radius: 0.05 },
    body: { color: '#140A08', roughness: 0.4, metalness: 0.4, glow: '#FF8A3A' },
    faces: ['#E8502A', '#F28A2A', '#F6D040', '#F4F4F0', '#6A9AFF', '#A83A5A'],
    lights: {
      sky: '#30304a', ground: '#000000', hemi: 0.4,
      key: ['#ffffff', 1, [-5, 4, 5]], fill: ['#8a7aff', 0.3, [6, -1, 3]], rim: ['#8aa8ff', 1, [0, 4, -6]],
    },
    ambient: { mode: 'rise', shape: 'glow', colors: ['#FFD08A', '#FF8A3A'], count: 60, size: 0.04, speed: 0.6, opacity: 0.8, additive: true },
    burst: { shape: 'glow', colors: 'faces', size: 0.14, speed: 3, gravity: 0, drag: 2, life: 0.9, additive: true },
    surface: 'star',
    sound: 'space',
    motion: 'heavy',
  },
  {
    // 깊은 우주. 다 맞추면 면마다 나선 은하 하나가 천천히 돈다. 노란 중심, 두 갈래로 감기는 팔과 먼지 띠,
    // 팔을 따라 붉은 별 탄생 구역, 둘레의 잔별과 먼 은하
    id: 'galaxy',
    name: '은하',
    bg: '#020208',
    ink: '#E8ECFF',
    backdrop: [
      stars(160, 91),
      'radial-gradient(40% 30% at 70% 70%, rgba(120,90,255,.1), transparent 70%)',
      '#020208',
    ].join(', '),
    form: { bevel: 0.05, size: 0.94, radius: 0.05 },
    body: { color: '#08081A', roughness: 0.3, metalness: 0.6 },
    faces: ['#4A7AF0', '#F0C050', '#F06AA0', '#F2F0FF', '#3AC8C0', '#E04A3A'],
    lights: {
      sky: '#30304a', ground: '#000000', hemi: 0.4,
      key: ['#ffffff', 1, [-5, 4, 5]], fill: ['#8a7aff', 0.3, [6, -1, 3]], rim: ['#8aa8ff', 1, [0, 4, -6]],
    },
    ambient: { mode: 'orbit', shape: 'glow', colors: ['#FFFFFF'], count: 90, size: 0.03, speed: 0.8, opacity: 0.7, additive: true },
    burst: { shape: 'star', colors: 'faces', size: 0.12, speed: 2.4, gravity: 0, drag: 2.4, life: 0.9, additive: true },
    surface: 'galaxy',
    sound: 'space',
    motion: 'fluid',
  },
  {
    // 광물 진열장의 비스무트 결정. 칸마다 네모난 계단이 안으로 파고드는 깔때기 결정이 층층이 솟았고,
    // 얇은 산화막이 금속 무지갯빛으로 번쩍인다. 면마다 도는 빛깔이 다르다
    id: 'bismuth',
    name: '비스무트',
    bg: '#121218',
    ink: '#EEF0F6',
    backdrop: [
      'radial-gradient(45% 35% at 50% 35%, rgba(255,255,255,.12), transparent 70%)',
      'linear-gradient(180deg, #1C1C24, #08080C)',
    ].join(', '),
    form: { bevel: 0.05, size: 0.94, radius: 0.04, grid: 44 },
    body: { color: '#3A3C44', roughness: 0.25, metalness: 1 },
    faces: ['#E8B83A', '#C83A9A', '#3A6AD8', '#3AB86A', '#2AC0D8', '#8A4AD0'],
    lights: {
      sky: '#e8f0ff', ground: '#101014', hemi: 0.9,
      key: ['#ffffff', 2.2, [-4, 6, 5]], fill: ['#c8d8ff', 0.4, [6, 0, 3]], rim: ['#ffffff', 1.4, [0, 4, -6]],
    },
    env: 1.3,
    burst: { shape: 'square', colors: 'faces', size: 0.08, speed: 2.4, gravity: -4, drag: 1.2, life: 1, additive: true },
    surface: 'bismuth',
    sound: 'crystal',
    motion: 'mechanical',
  },
  {
    // 광물 진열장의 갈아 낸 광석. 다 맞추면 면마다 한 판이다. 공작석(초록 눈알 무늬), 능망간석(분홍과 흰 물결 띠),
    // 남동석(짙은 파랑 덩이 띠), 호안석(빛줄이 미끄러지는 금빛 섬유), 적철석(은빛 띠와 붉은 벽옥), 라리마(하늘빛에 흰 그물)
    id: 'banded',
    name: '줄무늬 광석',
    bg: '#16141A',
    ink: '#F0E8F4',
    backdrop: [
      'radial-gradient(45% 35% at 50% 35%, rgba(255,240,220,.12), transparent 70%)',
      'linear-gradient(180deg, #22202A, #0C0B10)',
    ].join(', '),
    form: { bevel: 0.06, size: 0.94, radius: 0.05, depth: 0.02 },
    body: { color: '#6A5040', roughness: 0.5 },
    faces: ['#2A9A5A', '#E0708A', '#2A4AB0', '#C8902A', '#4A4A52', '#7AC8E0'],
    lights: {
      sky: '#fff4e4', ground: '#3a2a1a', hemi: 1.2,
      key: ['#fff0dc', 2.2, [-4, 6, 5]], fill: ['#ffc890', 0.4, [6, 0, 3]], rim: ['#ffffff', 1.2, [2, 4, -6]],
    },
    burst: { shape: 'square', colors: 'faces', size: 0.08, speed: 2.2, gravity: -4, drag: 1.2, life: 1.1 },
    surface: 'banded',
    sound: 'stone',
    motion: 'heavy',
  },
  {
    // 사바나의 털가죽. 다 맞추면 면마다 동물 한 마리의 옆구리다. 짧고 촘촘한 털 위로 호랑이 줄무늬, 얼룩말 줄무늬,
    // 표범 매화 무늬, 기린 그물 무늬, 흑소 얼룩, 그리고 비단뱀 비늘
    id: 'wild',
    name: '동물 무늬',
    bg: '#D8B880',
    ink: '#2A1A0E',
    backdrop: [
      'radial-gradient(70% 40% at 50% 100%, #B89050, transparent 70%)',
      'linear-gradient(180deg, #F2C878 0 55%, #C89A58 55%)',
    ].join(', '),
    form: { bevel: 0.12, size: 0.94, radius: 0.16, grid: 40 },
    body: { color: '#6A5A4A', roughness: 0.7 },
    faces: ['#E8802A', '#F2F0EA', '#D8B050', '#9A5A2A', '#1E1C1E', '#5A8A3A'],
    lights: {
      sky: '#ffffff', ground: '#a09080', hemi: 1.8,
      key: ['#fff6e8', 2, [-4, 6, 5]], fill: ['#e8f0ff', 0.5, [6, 0, 3]], rim: ['#ffffff', 1, [0, 4, -6]],
    },
    burst: { shape: 'dot', colors: 'faces', size: 0.05, speed: 1.6, gravity: -1, drag: 2.4, life: 1.3 },
    surface: 'wild',
    sound: 'cloth',
    motion: 'squish',
  },
  {
    // 부티크 진열장. 다 맞추면 면 하나가 악어 배 가죽으로 만든 가방 앞판이다. 가운데 열을 기준으로 비늘판이 좌우 대칭으로 서고,
    // 옆구리로 갈수록 잘고 둥글어진다. 판마다 털구멍 점, 글레이즈 광택, 같은 빛깔 실의 새들 스티치와 칠한 끝, 금빛 장식 몸통.
    // 면마다 가방 색이 다르다(블랙, 골드 브라운, 버건디, 네이비, 그린, 가운데가 희고 옆으로 잿빛이 번지는 히말라야)
    id: 'croc',
    name: '악어가죽',
    bg: '#16120F',
    ink: '#F2EAE0',
    backdrop: [
      'radial-gradient(45% 35% at 50% 30%, rgba(255,236,210,.28), transparent 70%)',
      'linear-gradient(180deg, transparent 0 74%, rgba(255,240,220,.08) 74% 74.6%, rgba(0,0,0,.3) 74.6% 100%)',
      'linear-gradient(180deg, #2E2620, #0E0B09)',
    ].join(', '),
    form: { bevel: 0.07, size: 0.94, radius: 0.08, grid: 40 },
    body: { color: '#C8A050', roughness: 0.3, metalness: 0.95 },
    faces: ['#121214', '#7A4018', '#4E0C1A', '#14204A', '#123A2A', '#EEEAE4'],
    lights: {
      sky: '#fff8f0', ground: '#2a1a10', hemi: 1.1,
      key: ['#fff2e0', 2.4, [-4, 7, 5]], fill: ['#ffe0c0', 0.5, [6, 0, 4]], rim: ['#ffffff', 1.4, [2, 4, -6]],
    },
    env: 0.45,
    burst: { shape: 'star', colors: ['#FFE8B0', '#FFFFFF'], size: 0.06, speed: 1.4, gravity: -1, drag: 2, life: 0.8, additive: true },
    surface: 'croc',
    sound: 'leather',
    motion: 'smooth',
  },
  {
    // 가죽 공방 작업대. 다 맞추면 면 하나가 비단뱀 가죽 한 장이다. 마름모 비늘이 기와처럼 겹쳐 뒤끝이 들렸고, 테 두른 얼룩이 번졌다.
    // 비늘 끝은 무지갯빛. 면마다 바탕이 다르다(내추럴, 차콜, 레드, 코발트, 에메랄드, 화이트)
    id: 'python',
    name: '비단뱀가죽',
    bg: '#1A1614',
    ink: '#EEE6DA',
    backdrop: [
      'radial-gradient(60% 40% at 50% 15%, rgba(255,230,200,.25), transparent 70%)',
      'repeating-linear-gradient(90deg, rgba(255,255,255,.02) 0 2px, transparent 2px 6px)',
      'linear-gradient(180deg, #2A221C, #120E0C)',
    ].join(', '),
    form: { bevel: 0.07, size: 0.94, radius: 0.08, grid: 40 },
    body: { color: '#8A7A6A', roughness: 0.45 },
    faces: ['#C8A878', '#2A2628', '#B83A3A', '#3A5AA8', '#3A7A5A', '#E8E4DC'],
    lights: {
      sky: '#ffffff', ground: '#2a1a10', hemi: 1.8,
      key: ['#fff4e2', 2.3, [-4, 7, 5]], fill: ['#ffe0c0', 0.5, [6, 0, 4]], rim: ['#ffffff', 1, [2, 4, -6]],
    },
    env: 0.8,
    burst: { shape: 'dot', colors: 'faces', size: 0.04, speed: 1.4, gravity: -4, drag: 2, life: 0.9 },
    surface: 'python',
    sound: 'scale',
    motion: 'smooth',
  },

  {
    // 가죽 공방 작업대. 다 맞추면 면 하나가 가방용 송아지가죽 한 장이다. 오그린 자갈무늬가 도톰히 솟고, 스티커마다 가장자리를 따라
    // 새들 스티치가 비스듬히 박혔다. 면마다 색이 다르다(에투프, 블랙, 오렌지, 블루, 그린, 크림)
    id: 'calf',
    name: '소가죽',
    bg: '#1A1614',
    ink: '#EEE6DA',
    backdrop: [
      'radial-gradient(60% 40% at 50% 15%, rgba(255,230,200,.25), transparent 70%)',
      'repeating-linear-gradient(90deg, rgba(255,255,255,.02) 0 2px, transparent 2px 6px)',
      'linear-gradient(180deg, #2A221C, #120E0C)',
    ].join(', '),
    form: { bevel: 0.07, size: 0.94, radius: 0.08, grid: 40 },
    body: { color: '#6A3A20', roughness: 0.45 },
    faces: ['#8A7A6A', '#1E1C1C', '#E0701E', '#2A4A8A', '#2A6A4A', '#EEE6D2'],
    lights: {
      sky: '#ffffff', ground: '#2a1a10', hemi: 1.8,
      key: ['#fff4e2', 2.3, [-4, 7, 5]], fill: ['#ffe0c0', 0.5, [6, 0, 4]], rim: ['#ffffff', 1, [2, 4, -6]],
    },
    burst: { shape: 'dot', colors: 'faces', size: 0.04, speed: 1.4, gravity: -4, drag: 2, life: 0.9 },
    surface: 'calf',
    sound: 'leather',
    motion: 'smooth',
  },


  {
    // 레이싱카 정비소. 다 맞추면 면 하나가 한 장의 2/2 능직 탄소섬유 판이다. 다발마다 섬유 결이 있어 빛과 결이 맞는 다발만 번쩍이고,
    // 돌리면 체크 광택이 서로 자리를 바꾼다. 두꺼운 투명 코팅, 면마다 섬유 색이 다르다
    id: 'carbon',
    name: '탄소섬유',
    bg: '#101214',
    ink: '#EEF2F6',
    backdrop: [
      'linear-gradient(180deg, transparent 0 70%, rgba(255,200,0,.25) 70% 71%, transparent 71%)',
      'radial-gradient(50% 40% at 50% 35%, rgba(200,220,255,.1), transparent 70%)',
      'linear-gradient(180deg, #1C1F24, #08090B)',
    ].join(', '),
    form: { bevel: 0.05, size: 0.94, radius: 0.06 },
    body: { color: '#4A4C52', roughness: 0.25, metalness: 0.5 },
    faces: ['#1E1E22', '#C82A2A', '#2A4AC0', '#E8C02A', '#2A9A4A', '#B8BCC4'],
    lights: {
      sky: '#e8f0ff', ground: '#101014', hemi: 0.9,
      key: ['#ffffff', 2.2, [-4, 6, 5]], fill: ['#c8d8ff', 0.4, [6, 0, 3]], rim: ['#ffffff', 1.4, [0, 4, -6]],
    },
    env: 1.2,
    burst: { shape: 'streak', colors: ['#FFFFFF', '#C8D8FF'], size: 0.1, speed: 3, gravity: 0, drag: 3, life: 0.6, additive: true },
    surface: 'carbon',
    sound: 'mech',
    motion: 'snap',
  },
  {
    // 지하 납골당. 칸마다 뼈를 깎아 낸 해골 하나가 실제로 솟아 있고(게임 속 해골 블록처럼), 몇 칸은 뼈를 다발로 쌓은 단면이다.
    // 깊은 눈구멍과 코구멍, 이 사이 틈엔 짙은 그늘. 살점 없이 갈아 낸 뼈뿐: 우윳빛~꿀빛 묵은 겉, 잔 관이 비치는 점과 줄, 패임과 잔금.
    // 면마다 묵힌 빛깔이 다르다(상아, 붉은 흙, 구리 물, 그을린 검정, 하얗게 구운 뼈, 꿀빛). 몸통은 해면뼈. 촛불 아래 돌벽
    id: 'bone',
    name: '해골',
    bg: '#100C09',
    ink: '#EEE2CC',
    backdrop: [
      'radial-gradient(40% 32% at 50% 30%, rgba(255,190,120,.18), transparent 70%)',
      'repeating-linear-gradient(0deg, rgba(0,0,0,.25) 0 2px, transparent 2px 38px)',
      'radial-gradient(80% 65% at 50% 45%, #2A2018, #060403)',
    ].join(', '),
    form: { bevel: 0.1, size: 0.94, radius: 0.12, grid: 52 },
    body: { color: '#5E3A2A', roughness: 0.75 },
    faces: ['#E4D6B8', '#A9472E', '#4E8C6E', '#2C2420', '#8D9BB0', '#93683A'],
    lights: {
      sky: '#fff0dc', ground: '#2a1a10', hemi: 0.85,
      key: ['#ffe2c0', 2.5, [-4, 6, 5]], fill: ['#c8d0e0', 0.3, [6, 0, 3]], rim: ['#ffd8a0', 1.0, [2, 4, -6]],
    },
    flicker: 'candle',
    ambient: { mode: 'float', shape: 'dot', colors: ['#E8DCC0'], count: 20, size: 0.02, speed: 0.12, opacity: 0.3 },
    burst: { shape: 'dot', colors: ['#E8DCC0', '#C8B898'], size: 0.05, speed: 1.6, gravity: 2, drag: 1.2, life: 1.1 },
    surface: 'bone',
    sound: 'dice',
    motion: 'heavy',
  },


  {
    // 눈알 무더기. 칸마다 사람 눈 하나가 짓무른 눈꺼풀 사이로 불룩 솟아 손끝을 따라 굴러간다. 핏발 선 흰자,
    // 크게 열린 홍채(면 색)의 결과 굴, 번들거리는 눈물막. 가끔 깜빡이고, 잡으면 일제히 질끈 감았다 동공을 키운다. 붉은 어둠
    id: 'eyeball',
    name: '안구',
    bg: '#120506',
    ink: '#F4DEDC',
    backdrop: [
      'radial-gradient(50% 40% at 50% 45%, rgba(120,10,20,.35), transparent 70%)',
      'radial-gradient(80% 65% at 50% 45%, #2A0A0E, #070203)',
    ].join(', '),
    form: { bevel: 0.12, size: 0.94, radius: 0.2, grid: 48 },
    body: { color: '#4A1418', roughness: 0.2 },
    faces: ['#3A7AD0', '#3A9A4A', '#8A4A1A', '#D89A20', '#9AA8B0', '#B03A8A'],
    lights: {
      sky: '#ffe8e8', ground: '#300808', hemi: 0.9,
      key: ['#fff4f0', 2.2, [-4, 6, 5]], fill: ['#ff8080', 0.35, [6, 0, 3]], rim: ['#ffd0d0', 1.0, [2, 4, -6]],
    },
    env: 0.7,
    burst: { shape: 'drip', colors: ['#8A0A10', '#C01818'], size: 0.1, speed: 1.6, gravity: 3, drag: 1.2, life: 1.2 },
    surface: 'eyeball',
    sound: 'eye',
    motion: 'squish',
  },





  {
    // 폐공장의 독성 슬라임 통. 칸마다 형광으로 빛나는 끈적한 슬라임이 울퉁불퉁 출렁이고 거품이 부풀었다 톡 터지며,
    // 아래로 방울이 늘어진다. 슬라임 빛이 곧 면 색. 말랑하게 출렁이며 돈다
    id: 'slime',
    name: '슬라임',
    bg: '#0E1008',
    ink: '#E8FFD8',
    backdrop: [
      'radial-gradient(50% 40% at 50% 60%, rgba(120,255,80,.12), transparent 70%)',
      'repeating-linear-gradient(45deg, rgba(255,210,0,.08) 0 14px, rgba(0,0,0,.08) 14px 28px)',
      'linear-gradient(180deg, #1A1C12, #060704)',
    ].join(', '),
    form: { bevel: 0.1, size: 0.94, radius: 0.18, grid: 40 },
    body: { color: '#3A3430', roughness: 0.6, metalness: 0.5 },
    faces: ['#5AF03A', '#A04AF0', '#FF4AB0', '#FF8A1A', '#2AE0F0', '#F0E82A'],
    lights: {
      sky: '#40304a', ground: '#000000', hemi: 0.4,
      key: ['#ffffff', 0.8, [-4, 5, 5]], fill: ['#8a6aff', 0.3, [6, 0, 3]], rim: ['#c0a8ff', 0.9, [0, 4, -6]],
    },
    ambient: { mode: 'rise', shape: 'bubble', colors: 'faces', count: 30, size: 0.08, speed: 0.3, opacity: 0.7 },
    burst: { shape: 'drip', colors: 'faces', size: 0.1, speed: 2, gravity: -6, drag: 1, life: 1.2 },
    surface: 'slime',
    sound: 'squish',
    motion: 'squish',
  },





  {
    // 모로코 리아드의 젤리주 타일 벽. 다 맞추면 면 하나가 한 벽이다. 여덟 꼭지 별 타일(면 색)과 십자 타일이 맞물리고,
    // 별 둘레를 흰 띠가 감싼다. 손으로 깎아 구운 조각마다 색과 면이 조금씩 다르고 유약에 잔금이 갔다
    id: 'arabesque',
    name: '아라베스크',
    bg: '#E8DCC4',
    ink: '#2A1E14',
    backdrop: [
      'radial-gradient(60% 45% at 50% 35%, rgba(255,250,235,.6), transparent 70%)',
      'linear-gradient(180deg, #F2E6D0, #D6C2A0)',
    ].join(', '),
    form: { bevel: 0.05, size: 0.95, radius: 0.04, grid: 48 },
    body: { color: '#3A3530', roughness: 0.8 },
    faces: ['#1E4AA8', '#1EA0A0', '#F2F0E6', '#E8A82A', '#2A8A4A', '#C8502A'],
    lights: {
      sky: '#ffffff', ground: '#a09080', hemi: 1.8,
      key: ['#fff6e8', 2, [-4, 6, 5]], fill: ['#e8f0ff', 0.5, [6, 0, 3]], rim: ['#ffffff', 1, [0, 4, -6]],
    },
    burst: { shape: 'square', colors: 'faces', size: 0.08, speed: 2.2, gravity: -4, drag: 1.2, life: 1.1 },
    surface: 'arabesque',
    sound: 'ceramic',
    motion: 'heavy',
  },
  {
    // 1920년대 호텔 로비. 다 맞추면 면 하나가 부채꼴 비늘이 줄지은 황동 판이다. 솟은 황동 테와 겹 반원,
    // 그 사이 움푹한 칸에 녹여 채운 에나멜(면 색과 검정에 금빛 살), 햇살 결을 새긴 황동 해. 금빛 햇살 무늬 벽
    id: 'artdeco',
    name: '아르데코',
    bg: '#0E0E10',
    ink: '#F2E2B8',
    backdrop: [
      'repeating-conic-gradient(from 180deg at 50% 100%, rgba(220,180,90,.14) 0deg 4deg, transparent 4deg 12deg)',
      'linear-gradient(180deg, #16161A, #060607)',
    ].join(', '),
    form: { bevel: 0.04, size: 0.95, radius: 0.03, grid: 48 },
    body: { color: '#0A0A0C', roughness: 0.15, metalness: 0.3 },
    faces: ['#1E8A5A', '#1E4AA8', '#F2EEE2', '#B82A3A', '#E8B83A', '#6A2A8A'],
    lights: {
      sky: '#fff4e4', ground: '#3a2a1a', hemi: 1.2,
      key: ['#fff0dc', 2.2, [-4, 6, 5]], fill: ['#ffc890', 0.4, [6, 0, 3]], rim: ['#ffffff', 1.2, [2, 4, -6]],
    },
    env: 1.1,
    burst: { shape: 'star', colors: ['#F2D27A', '#FFFFFF'], size: 0.12, speed: 2.4, gravity: 0, drag: 2.4, life: 0.8, additive: true },
    surface: 'artdeco',
    sound: 'metal',
    motion: 'mechanical',
  },
  {
    // 수도원 뜰의 돌 십자가. 다 맞추면 면 하나가 돌을 깊이 파서 새긴 매듭 한 판이다. 띠가 만나는 곳마다 위 띠는 솟아 넘어가고
    // 아래 띠는 내려앉아 밑으로 들어간다. 띠엔 면 색 안료를 칠했고 닳은 데는 돌이 드러났다. 촛불
    id: 'celtic',
    name: '켈트 매듭',
    bg: '#1E1812',
    ink: '#F0E2C0',
    backdrop: [
      PAPER_GRAIN,
      'radial-gradient(70% 55% at 50% 45%, #2E2418, #0E0A06)',
    ].join(', '),
    form: { bevel: 0.05, size: 0.95, radius: 0.04, grid: 48 },
    body: { color: '#2A2018', roughness: 0.85 },
    faces: ['#1E7A3A', '#C8302A', '#1E4AA8', '#E8C040', '#F0EADA', '#A03A8A'],
    lights: {
      sky: '#fff4e4', ground: '#3a2a1a', hemi: 1.2,
      key: ['#fff0dc', 2.2, [-4, 6, 5]], fill: ['#ffc890', 0.4, [6, 0, 3]], rim: ['#ffffff', 1.2, [2, 4, -6]],
    },
    flicker: 'candle',
    burst: { shape: 'star', colors: ['#F2D27A'], size: 0.1, speed: 2, gravity: 0, drag: 2.4, life: 0.8, additive: true },
    surface: 'celtic',
    sound: 'stone',
    motion: 'heavy',
  },
  {
    // 밀림 속 신전 벽. 칸마다 돌을 깎아 낸 계단 피라미드가 층층이 솟았고, 층마다 면 색과 검정 안료를 번갈아 칠했는데
    // 군데군데 벗겨져 돌이 드러났다. 칸 둘레엔 솟은 돌 테. 한낮 햇빛
    id: 'aztec',
    name: '아즈텍',
    bg: '#B8A27C',
    ink: '#1E140C',
    backdrop: [
      'radial-gradient(60% 40% at 30% 12%, rgba(255,245,210,.5), transparent 70%)',
      'repeating-linear-gradient(0deg, rgba(60,40,20,.12) 0 2px, transparent 2px 46px)',
      'radial-gradient(80% 65% at 50% 45%, #C9B48E, #7A6648)',
    ].join(', '),
    form: { bevel: 0.08, size: 0.94, radius: 0.08, grid: 44 },
    body: { color: '#5A3A24', roughness: 0.9 },
    faces: ['#C8402A', '#2A8A8A', '#E8B83A', '#1E1C1E', '#3A6AB8', '#5A8A3A'],
    lights: {
      sky: '#ffffff', ground: '#a09080', hemi: 1.8,
      key: ['#fff6e8', 2, [-4, 6, 5]], fill: ['#e8f0ff', 0.5, [6, 0, 3]], rim: ['#ffffff', 1, [0, 4, -6]],
    },
    burst: { shape: 'square', colors: 'faces', size: 0.08, speed: 2.2, gravity: -4, drag: 1.2, life: 1.1 },
    surface: 'aztec',
    sound: 'stone',
    motion: 'mechanical',
  },
  {
    // 가죽 공방 작업대. 칸마다 면 색으로 물들인 두꺼운 가죽에 페이즐리 하나를 칼로 긋고 도구로 눌러 새겼다.
    // 무늬는 도톰하게 솟고 바탕은 내려앉았다. 패인 데마다 짙은 안티크 물감, 솟은 데는 반들. 칸마다 무늬 방향이 조금씩 다르다
    id: 'paisley',
    name: '페이즐리',
    bg: '#3A2618',
    ink: '#F2E6D6',
    backdrop: [
      'repeating-linear-gradient(90deg, rgba(0,0,0,.14) 0 2px, transparent 2px 64px)',
      'repeating-linear-gradient(0deg, rgba(255,220,170,.04) 0 1px, transparent 1px 7px)',
      'radial-gradient(70% 55% at 50% 40%, #5A3C26, #24160C)',
    ].join(', '),
    form: { bevel: 0.08, size: 0.94, radius: 0.08, grid: 48 },
    body: { color: '#7A5234', roughness: 0.7 },
    faces: ['#8A2A22', '#1E3A6A', '#2A2624', '#C08A3A', '#2E6A3A', '#6A3A7A'],
    lights: {
      sky: '#ffffff', ground: '#a09080', hemi: 1.8,
      key: ['#fff6e8', 2, [-4, 6, 5]], fill: ['#e8f0ff', 0.5, [6, 0, 3]], rim: ['#ffffff', 1, [0, 4, -6]],
    },
    burst: { shape: 'dot', colors: ['#C8A070', '#8A6040'], size: 0.05, speed: 1.6, gravity: 2, drag: 1.4, life: 1 },
    surface: 'paisley',
    sound: 'leather',
    motion: 'bouncy',
  },
  {
    // 해 질 녘 산사 법당. 칸마다 빗살과 솟을살이 엇갈린 나무 문살이 솟았고, 살이 만나는 자리마다 깎아 붙인 꽃.
    // 살 뒤로 물러앉은 창호지에 법당 안 등불빛이 은은히 비친다. 살엔 면 색 단청, 닳은 데는 나뭇결
    id: 'kkotsal',
    name: '꽃살문',
    bg: '#1A120C',
    ink: '#F2E6D0',
    backdrop: [
      'radial-gradient(50% 35% at 50% 20%, rgba(255,190,110,.25), transparent 70%)',
      'repeating-linear-gradient(90deg, rgba(0,0,0,.18) 0 3px, transparent 3px 90px)',
      'radial-gradient(80% 65% at 50% 45%, #3A2616, #0E0906)',
    ].join(', '),
    form: { bevel: 0.06, size: 0.95, radius: 0.04, grid: 52 },
    body: { color: '#3A2618', roughness: 0.75 },
    faces: ['#2E8B62', '#C8462C', '#2F5DAF', '#E2B23A', '#EDE7DA', '#7A2E22'],
    lights: {
      sky: '#fff0dc', ground: '#2a1a10', hemi: 1.0,
      key: ['#ffe8c8', 2.2, [-4, 6, 5]], fill: ['#c8d8ff', 0.3, [6, 0, 3]], rim: ['#ffd8a0', 1.0, [2, 4, -6]],
    },
    ambient: { mode: 'float', shape: 'glow', colors: ['#FFD08A'], count: 18, size: 0.03, speed: 0.15, opacity: 0.5, additive: true },
    burst: { shape: 'petal', colors: 'faces', size: 0.1, speed: 1.6, gravity: -1, drag: 2, life: 1.4 },
    surface: 'kkotsal',
    sound: 'wood',
    motion: 'heavy',
  },
  {
    // 보석상 진열장. 칸마다 은판에 선반으로 깎은 결 위로 투명 에나멜을 녹여 덮었고(파베르제 식), 둘레엔 줄 새긴 은테와 진주 한 줄.
    // 면마다 결이 다르다(햇살, 물결, 보리알, 바구니, 동심원, 불꽃). 짙은 벨벳 위 조명
    id: 'guilloche',
    name: '기요셰',
    bg: '#22090F',
    ink: '#F6E8EC',
    backdrop: [
      'radial-gradient(45% 35% at 50% 25%, rgba(255,230,235,.18), transparent 70%)',
      'repeating-linear-gradient(0deg, rgba(0,0,0,.08) 0 1px, transparent 1px 3px)',
      'radial-gradient(80% 65% at 50% 45%, #4A1420, #12050A)',
    ].join(', '),
    form: { bevel: 0.05, size: 0.95, radius: 0.06, grid: 56 },
    body: { color: '#8A8C94', roughness: 0.25, metalness: 0.9 },
    faces: ['#5A9AD8', '#E2789E', '#E6C140', '#2C9A68', '#7B3FA0', '#EAE4D8'],
    lights: {
      sky: '#ffffff', ground: '#402028', hemi: 1.0,
      key: ['#ffffff', 2.4, [-4, 6, 5]], fill: ['#ffe0e8', 0.5, [6, 0, 3]], rim: ['#ffffff', 1.4, [2, 4, -6]],
    },
    env: 1.0,
    burst: { shape: 'star', colors: ['#FFFFFF', '#FFE8F0'], size: 0.12, speed: 2.2, gravity: 0, drag: 2.4, life: 0.8, additive: true },
    surface: 'guilloche',
    sound: 'metal',
    motion: 'smooth',
  },
  {
    // 호텔 침대 머리맡. 다 맞추면 면 하나가 마름모로 누빈 새틴 한 장이다. 박음질 사이 마름모가 도톰하게 부풀고,
    // 골엔 땀이 점점이 박혀 잔주름이 진다. 새틴 결 따라 빛이 미끄러진다
    id: 'quilt',
    name: '퀼팅',
    bg: '#E8E0D6',
    ink: '#2A2024',
    backdrop: [
      'radial-gradient(60% 45% at 50% 30%, rgba(255,255,255,.55), transparent 70%)',
      'radial-gradient(80% 65% at 50% 45%, #F2ECE4, #CFC4B8)',
    ].join(', '),
    form: { bevel: 0.1, size: 0.95, radius: 0.1, grid: 48 },
    body: { color: '#4A3A40', roughness: 0.6 },
    faces: ['#B8323A', '#24356E', '#F2EEE6', '#2E7A5A', '#D8A23A', '#8A4A9A'],
    lights: {
      sky: '#ffffff', ground: '#a09080', hemi: 1.6,
      key: ['#fff6ee', 2, [-4, 6, 5]], fill: ['#e8f0ff', 0.5, [6, 0, 3]], rim: ['#ffffff', 1, [0, 4, -6]],
    },
    burst: { shape: 'dot', colors: 'faces', size: 0.06, speed: 1.6, gravity: -1, drag: 2, life: 1.2 },
    surface: 'quilt',
    sound: 'cloth',
    motion: 'squish',
  },
  {
    // 마라케시 골목 찻집. 칸마다 두드린 놋쇠판에 별과 물방울 구멍을 뚫었고, 구멍 뒤 색유리로 불빛이 새어 나와 일렁인다.
    // 구멍 둘레는 솟고 오목한 데엔 거뭇한 녹. 새어 나오는 유리 빛이 곧 면 색. 어둑한 방
    id: 'lantern',
    name: '모로코 등',
    bg: '#0E0906',
    ink: '#F6E2C0',
    backdrop: [
      'radial-gradient(30% 22% at 50% 50%, rgba(255,170,80,.18), transparent 70%)',
      'radial-gradient(80% 65% at 50% 45%, #241610, #060403)',
    ].join(', '),
    form: { bevel: 0.05, size: 0.95, radius: 0.04, grid: 56 },
    body: { color: '#2A1E14', roughness: 0.4, metalness: 0.6 },
    faces: ['#E83A2A', '#2A7AE8', '#3AC86A', '#F2B83A', '#B04AE0', '#F2F0E6'],
    lights: {
      sky: '#ffe0b0', ground: '#1a0e06', hemi: 0.7,
      key: ['#ffd8a0', 1.8, [-4, 6, 5]], fill: ['#ff9a50', 0.4, [6, 0, 3]], rim: ['#ffcf90', 1.0, [2, 4, -6]],
    },
    env: 0.6,
    flicker: 'candle',
    ambient: { mode: 'float', shape: 'glow', colors: 'faces', count: 24, size: 0.035, speed: 0.15, opacity: 0.6, additive: true },
    burst: { shape: 'star', colors: 'faces', size: 0.12, speed: 2, gravity: 0, drag: 2.4, life: 0.9, additive: true },
    surface: 'lantern',
    sound: 'metal',
    motion: 'heavy',
  },
  {
    // 이스파한 양탄자 가게. 다 맞추면 면 하나가 손으로 맨 양탄자 한 장이다. 가운데 메달리온과 네 귀퉁이 조각, 바탕의 잔꽃,
    // 겹 테두리와 그 안의 꽃. 털 한 올이 매듭 하나라 무늬가 잘게 계단지고, 무늬 윤곽은 털을 깎아 패였다.
    // 천연 염료라 줄마다 색이 조금씩 다르다(아브라시). 바탕이 곧 면 색
    id: 'carpet',
    name: '페르시아 카펫',
    bg: '#2A1A12',
    ink: '#F2E4CC',
    backdrop: [
      'repeating-linear-gradient(90deg, rgba(0,0,0,.12) 0 2px, transparent 2px 72px)',
      'radial-gradient(70% 55% at 50% 40%, #4A3020, #160C08)',
    ].join(', '),
    form: { bevel: 0.1, size: 0.95, radius: 0.08, grid: 44 },
    body: { color: '#3A2A20', roughness: 0.95 },
    faces: ['#9E2A2B', '#1F2E5A', '#E6DCC4', '#3E6B48', '#C89A3C', '#6A2F5A'],
    lights: {
      sky: '#fff4e4', ground: '#3a2a1a', hemi: 1.2,
      key: ['#fff0dc', 2.2, [-4, 6, 5]], fill: ['#ffc890', 0.4, [6, 0, 3]], rim: ['#ffffff', 1.2, [2, 4, -6]],
    },
    burst: { shape: 'dot', colors: 'faces', size: 0.05, speed: 1.4, gravity: 2, drag: 1.4, life: 1 },
    surface: 'carpet',
    sound: 'cloth',
    motion: 'heavy',
  },




  {
    // 바닷속 산호초. 관 모양 폴립이 다닥다닥 솟고 컵 속 촉수가 형광으로 빛나며 천천히 숨 쉰다
    id: 'coral',
    name: '산호',
    bg: '#0A2A3A',
    ink: '#E0F4FF',
    backdrop: [
      'radial-gradient(60% 45% at 50% 20%, rgba(160,230,255,.25), transparent 70%)',
      'linear-gradient(180deg, #0E4A5E, #04141E)',
    ].join(', '),
    form: { bevel: 0.08, size: 0.94, radius: 0.12, grid: 48 },
    body: { color: '#2A2622', roughness: 0.8 },
    faces: ['#F07A30', '#9A4AC8', '#F06A9A', '#8AD040', '#F2D23A', '#4AB8E8'],
    lights: {
      sky: '#a8e0ff', ground: '#0a2030', hemi: 1.6,
      key: ['#e8f8ff', 2.3, [-3, 7, 4]], fill: ['#40a0c0', 0.6, [5, -1, 3]], rim: ['#80e0ff', 1, [0, 4, -6]],
    },
    ambient: { mode: 'rise', shape: 'bubble', colors: ['#CFF4FF'], count: 26, size: 0.1, speed: 0.3, opacity: 0.7 },
    surface: 'coral',
    sound: 'water',
    motion: 'fluid',
    burst: { shape: 'bubble', colors: ['#DFFAFF'], size: 0.12, speed: 1.6, gravity: 2.4, drag: 1.8, life: 1.4, opacity: 0.9 },
  },
  {
    // 물 빠진 갯바위. 크고 작은 따개비가 화산처럼 솟아 다닥다닥 붙었다
    id: 'barnacle',
    name: '따개비',
    bg: '#3A4A52',
    ink: '#F2EEE6',
    backdrop: [
      'radial-gradient(60% 45% at 50% 20%, rgba(255,255,255,.18), transparent 70%)',
      'linear-gradient(180deg, #6A7A80, #2A363C)',
    ].join(', '),
    form: { bevel: 0.08, size: 0.94, radius: 0.12, grid: 48 },
    body: { color: '#2A2624', roughness: 0.5 },
    faces: ['#E8E4DC', '#E8A0A8', '#E8D060', '#7A8AA0', '#5A8A4A', '#7A2A30'],
    lights: {
      sky: '#ffffff', ground: '#6a6058', hemi: 1.7,
      key: ['#fff4e2', 2.4, [-3, 7, 5]], fill: ['#d8e4ff', 0.45, [5, 0, 4]], rim: ['#ffffff', 0.8, [0, 3, -6]],
    },
    surface: 'barnacle',
    sound: 'stone',
    motion: 'heavy',
    burst: { shape: 'dot', colors: 'faces', size: 0.06, speed: 1.8, gravity: -4, drag: 1.6, life: 0.9 },
  },
  {
    // 모래 위 성게 껍데기. 칸마다 둥근 껍데기가 솟고 다섯 갈래 띠와 돌기가 줄지었다
    id: 'urchin',
    name: '성게',
    bg: '#1E3A4A',
    ink: '#F2EEE6',
    backdrop: [
      'radial-gradient(60% 45% at 50% 20%, rgba(200,240,255,.2), transparent 70%)',
      'linear-gradient(180deg, #2E5A6E, #0E1E28)',
    ].join(', '),
    form: { bevel: 0.08, size: 0.94, radius: 0.12, grid: 48 },
    body: { color: '#5A5048', roughness: 0.85 },
    faces: ['#8A4AA8', '#5AA05A', '#F0A0B8', '#F2EEE6', '#C83A3A', '#E8902A'],
    lights: {
      sky: '#a8e0ff', ground: '#0a2030', hemi: 1.6,
      key: ['#e8f8ff', 2.3, [-3, 7, 4]], fill: ['#40a0c0', 0.6, [5, -1, 3]], rim: ['#80e0ff', 1, [0, 4, -6]],
    },
    surface: 'urchin',
    sound: 'ceramic',
    motion: 'smooth',
    burst: { shape: 'dot', colors: 'faces', size: 0.06, speed: 1.8, gravity: -4, drag: 1.6, life: 0.9 },
  },
  {
    // 문어 다리 안쪽. 빨판이 다닥다닥 솟아 한쪽으로 작아지고, 살갗은 점액으로 번들거린다
    id: 'suckers',
    name: '빨판',
    bg: '#140A10',
    ink: '#F2DCDC',
    backdrop: [
      'radial-gradient(60% 45% at 50% 20%, rgba(255,160,160,.15), transparent 70%)',
      'linear-gradient(180deg, #3A1A24, #0A0408)',
    ].join(', '),
    form: { bevel: 0.08, size: 0.94, radius: 0.12, grid: 48 },
    body: { color: '#3A1A1A', roughness: 0.25 },
    faces: ['#C83A2A', '#7A3A8A', '#E8803A', '#F0A0A8', '#8A7A6A', '#3A6A9A'],
    lights: {
      sky: '#ffe8e0', ground: '#200808', hemi: 1.3,
      key: ['#fff0e8', 2.4, [-3, 7, 5]], fill: ['#ff8070', 0.5, [5, 0, 4]], rim: ['#ffd0c0', 1, [0, 3, -6]],
    },
    surface: 'suckers',
    sound: 'squish',
    motion: 'squish',
    burst: { shape: 'drip', colors: ['#F0C8C8', '#FFFFFF'], size: 0.06, speed: 1.6, gravity: -6, drag: 1.2, life: 1 },
  },
  {
    // 바닷속 말미잘. 칸마다 한 송이가 피어 굵은 촉수가 두 겹으로 뻗고 물살에 흔들린다
    id: 'anemone',
    name: '말미잘',
    bg: '#06141E',
    ink: '#D8F4FF',
    backdrop: [
      'radial-gradient(60% 45% at 50% 20%, rgba(120,220,255,.22), transparent 70%)',
      'linear-gradient(180deg, #0A3040, #02080C)',
    ].join(', '),
    form: { bevel: 0.08, size: 0.94, radius: 0.12, grid: 48 },
    body: { color: '#1A2028', roughness: 0.8 },
    faces: ['#4AC860', '#F06AA8', '#9A5AE0', '#F09030', '#30C8C0', '#F0F0F0'],
    lights: {
      sky: '#a8e0ff', ground: '#0a2030', hemi: 1.6,
      key: ['#e8f8ff', 2.3, [-3, 7, 4]], fill: ['#40a0c0', 0.6, [5, -1, 3]], rim: ['#80e0ff', 1, [0, 4, -6]],
    },
    ambient: { mode: 'rise', shape: 'bubble', colors: ['#CFF4FF'], count: 26, size: 0.1, speed: 0.3, opacity: 0.7 },
    surface: 'anemone',
    sound: 'water',
    motion: 'fluid',
    burst: { shape: 'bubble', colors: ['#DFFAFF'], size: 0.1, speed: 1.6, gravity: 2.4, drag: 1.8, life: 1.4, opacity: 0.9 },
  },
  {
    // 벨벳 위 진주 더미. 둥근 알이 빽빽이 솟고 진주층이 무지갯빛으로 아른거린다
    id: 'pearl',
    name: '진주',
    bg: '#120E1A',
    ink: '#F2ECE4',
    backdrop: [
      'radial-gradient(60% 45% at 50% 20%, rgba(255,240,230,.18), transparent 70%)',
      'linear-gradient(180deg, #2A2238, #08060C)',
    ].join(', '),
    form: { bevel: 0.08, size: 0.94, radius: 0.12, grid: 48 },
    body: { color: '#1A1424', roughness: 0.9 },
    faces: ['#F2F0EA', '#F0B0B8', '#D8B048', '#3A4A48', '#8AA0C8', '#F0A878'],
    lights: {
      sky: '#ffffff', ground: '#6a6058', hemi: 1.7,
      key: ['#fff4e2', 2.4, [-3, 7, 5]], fill: ['#d8e4ff', 0.45, [5, 0, 4]], rim: ['#ffffff', 0.8, [0, 3, -6]],
    },
    env: 1.0,
    surface: 'pearl',
    sound: 'ceramic',
    motion: 'smooth',
    burst: { shape: 'star', colors: ['#FFFFFF', '#FFE8F0'], size: 0.08, speed: 1.6, gravity: -2, drag: 2, life: 0.8, additive: true },
  },
  {
    // 사막 온실. 세로 이랑이 볼록볼록 솟고 이랑을 따라 솜털 자리와 별 모양 가시
    id: 'cactus',
    name: '선인장',
    bg: '#E8D8B8',
    ink: '#3A2A1A',
    backdrop: [
      'radial-gradient(60% 45% at 50% 20%, rgba(255,250,220,.6), transparent 70%)',
      'linear-gradient(180deg, #F2E4C4, #D8B888)',
    ].join(', '),
    form: { bevel: 0.08, size: 0.94, radius: 0.12, grid: 48 },
    body: { color: '#5A4A3A', roughness: 0.9 },
    faces: ['#4A8A3A', '#5AA8A0', '#C8A838', '#8A6AB0', '#D8503A', '#E8E4D4'],
    lights: {
      sky: '#ffffff', ground: '#6a6058', hemi: 1.7,
      key: ['#fff4e2', 2.4, [-3, 7, 5]], fill: ['#d8e4ff', 0.45, [5, 0, 4]], rim: ['#ffffff', 0.8, [0, 3, -6]],
    },
    surface: 'cactus',
    sound: 'nature',
    motion: 'heavy',
    burst: { shape: 'dot', colors: 'faces', size: 0.06, speed: 1.8, gravity: -4, drag: 1.6, life: 0.9 },
  },
  {
    // 창가 화분. 칸마다 에케베리아 한 포기가 장미처럼 솟아 도톰한 잎이 겹겹이 돈다
    id: 'succulent',
    name: '다육',
    bg: '#EDE8E0',
    ink: '#2A2A2A',
    backdrop: [
      'radial-gradient(60% 45% at 50% 20%, rgba(255,255,255,.7), transparent 70%)',
      'linear-gradient(180deg, #F6F2EC, #DCD4C8)',
    ].join(', '),
    form: { bevel: 0.08, size: 0.94, radius: 0.12, grid: 48 },
    body: { color: '#6A5A4A', roughness: 0.9 },
    faces: ['#7A9AA8', '#E8A0B0', '#9AC85A', '#7A5A9A', '#E8D060', '#4A8A50'],
    lights: {
      sky: '#ffffff', ground: '#6a6058', hemi: 1.7,
      key: ['#fff4e2', 2.4, [-3, 7, 5]], fill: ['#d8e4ff', 0.45, [5, 0, 4]], rim: ['#ffffff', 0.8, [0, 3, -6]],
    },
    surface: 'succulent',
    sound: 'nature',
    motion: 'smooth',
    burst: { shape: 'dot', colors: 'faces', size: 0.06, speed: 1.8, gravity: -4, drag: 1.6, life: 0.9 },
  },
  {
    // 숲 바닥. 칸마다 버섯 갓 몇 개가 둥글게 솟고 사마귀 점이 도톰하다
    id: 'mushroom',
    name: '버섯',
    bg: '#1E2418',
    ink: '#E8E4D0',
    backdrop: [
      'radial-gradient(60% 45% at 50% 20%, rgba(220,255,180,.15), transparent 70%)',
      'linear-gradient(180deg, #2E3A24, #0E120A)',
    ].join(', '),
    form: { bevel: 0.08, size: 0.94, radius: 0.12, grid: 48 },
    body: { color: '#3A2A1A', roughness: 0.9 },
    faces: ['#D8302A', '#8A5A32', '#EEE8DC', '#E8B830', '#7A4A9A', '#E8702A'],
    lights: {
      sky: '#ffffff', ground: '#6a6058', hemi: 1.7,
      key: ['#fff4e2', 2.4, [-3, 7, 5]], fill: ['#d8e4ff', 0.45, [5, 0, 4]], rim: ['#ffffff', 0.8, [0, 3, -6]],
    },
    ambient: { mode: 'float', shape: 'glow', colors: ['#E8FFC0', '#FFFFFF'], count: 24, size: 0.06, speed: 0.25, opacity: 0.7, additive: true },
    surface: 'mushroom',
    sound: 'squish',
    motion: 'squish',
    burst: { shape: 'dot', colors: 'faces', size: 0.06, speed: 1.8, gravity: -4, drag: 1.6, life: 0.9 },
  },
  {
    // 솔숲. 나무질 비늘이 나선으로 겹겹이 포개져 끝이 들렸다
    id: 'pinecone',
    name: '솔방울',
    bg: '#E8E0D0',
    ink: '#2A1E14',
    backdrop: [
      'radial-gradient(60% 45% at 50% 20%, rgba(255,255,240,.6), transparent 70%)',
      'linear-gradient(180deg, #F2ECE0, #D4C8B4)',
    ].join(', '),
    form: { bevel: 0.08, size: 0.94, radius: 0.12, grid: 48 },
    body: { color: '#E8DCC8', roughness: 0.8 },
    faces: ['#8A5A2E', '#4A2E1A', '#B84A3A', '#8A8478', '#5A7A3A', '#C89A40'],
    lights: {
      sky: '#ffffff', ground: '#6a6058', hemi: 1.7,
      key: ['#fff4e2', 2.4, [-3, 7, 5]], fill: ['#d8e4ff', 0.45, [5, 0, 4]], rim: ['#ffffff', 0.8, [0, 3, -6]],
    },
    surface: 'pinecone',
    sound: 'wood',
    motion: 'heavy',
    burst: { shape: 'dot', colors: 'faces', size: 0.06, speed: 1.8, gravity: -4, drag: 1.6, life: 0.9 },
  },
  {
    // 축축한 숲 바위. 이끼 방석이 몽글몽글 솟고 홀씨주머니가 맺혔다
    id: 'moss',
    name: '이끼',
    bg: '#1A2418',
    ink: '#DCEAD0',
    backdrop: [
      'radial-gradient(60% 45% at 50% 20%, rgba(200,255,180,.18), transparent 70%)',
      'linear-gradient(180deg, #2A3A24, #0A100A)',
    ].join(', '),
    form: { bevel: 0.08, size: 0.94, radius: 0.12, grid: 48 },
    body: { color: '#4A4A40', roughness: 0.9 },
    faces: ['#2E6A2A', '#8AC040', '#C8A030', '#B8402A', '#9AB0A0', '#2A8A80'],
    lights: {
      sky: '#ffffff', ground: '#6a6058', hemi: 1.7,
      key: ['#fff4e2', 2.4, [-3, 7, 5]], fill: ['#d8e4ff', 0.45, [5, 0, 4]], rim: ['#ffffff', 0.8, [0, 3, -6]],
    },
    ambient: { mode: 'float', shape: 'dot', colors: ['#F2FFE0'], count: 30, size: 0.03, speed: 0.2, opacity: 0.6 },
    surface: 'moss',
    sound: 'nature',
    motion: 'smooth',
    burst: { shape: 'dot', colors: 'faces', size: 0.06, speed: 1.8, gravity: -4, drag: 1.6, life: 0.9 },
  },
  {
    // 아름드리 고목. 세로로 긴 껍질 판이 두껍게 솟고 판 사이로 깊은 골이 갈라졌다
    id: 'bark',
    name: '나무껍질',
    bg: '#2A2218',
    ink: '#EDE4D4',
    backdrop: [
      'radial-gradient(60% 45% at 50% 20%, rgba(255,240,200,.2), transparent 70%)',
      'linear-gradient(180deg, #3A3024, #140E0A)',
    ].join(', '),
    form: { bevel: 0.08, size: 0.94, radius: 0.12, grid: 48 },
    body: { color: '#14100C', roughness: 0.9 },
    faces: ['#8A8680', '#9A4A2A', '#5A3A48', '#E8E4DA', '#5A7A40', '#D89A48'],
    lights: {
      sky: '#ffffff', ground: '#6a6058', hemi: 1.7,
      key: ['#fff4e2', 2.4, [-3, 7, 5]], fill: ['#d8e4ff', 0.45, [5, 0, 4]], rim: ['#ffffff', 0.8, [0, 3, -6]],
    },
    surface: 'bark',
    sound: 'wood',
    motion: 'heavy',
    burst: { shape: 'dot', colors: 'faces', size: 0.06, speed: 1.8, gravity: -4, drag: 1.6, life: 0.9 },
  },




  {
    // 축축한 잇몸. 칸마다 어금니 넷이 솟아 박혔고 씹는 면엔 교두와 홈, 썩은 구멍
    id: 'teeth',
    name: '이빨',
    bg: '#140608',
    ink: '#F2D8D8',
    backdrop: [
      'radial-gradient(60% 45% at 50% 20%, rgba(255,150,150,.15), transparent 70%)',
      'linear-gradient(180deg, #3A1014, #08020A)',
    ].join(', '),
    form: { bevel: 0.08, size: 0.94, radius: 0.12, grid: 48 },
    body: { color: '#3A0E14', roughness: 0.25 },
    faces: ['#E8909A', '#7A1A2A', '#E8D0C8', '#8A5A8A', '#C8B060', '#6A8090'],
    lights: {
      sky: '#ffe8e0', ground: '#200808', hemi: 1.3,
      key: ['#fff0e8', 2.4, [-3, 7, 5]], fill: ['#ff8070', 0.5, [5, 0, 4]], rim: ['#ffd0c0', 1, [0, 3, -6]],
    },
    surface: 'teeth',
    sound: 'flesh',
    motion: 'squish',
    burst: { shape: 'drip', colors: ['#F0D8D0', '#E0B0B0'], size: 0.06, speed: 1.6, gravity: -6, drag: 1.2, life: 1 },
  },











  {
    // 쪼갠 정동 속. 뾰족한 육각 결정이 빽빽이 솟아 각지게 번쩍인다
    id: 'druze',
    name: '정동',
    bg: '#141018',
    ink: '#F0E8F8',
    backdrop: [
      'radial-gradient(60% 45% at 50% 20%, rgba(220,200,255,.2), transparent 70%)',
      'linear-gradient(180deg, #2A2234, #08060A)',
    ].join(', '),
    form: { bevel: 0.08, size: 0.94, radius: 0.12, grid: 48 },
    body: { color: '#5A5A60', roughness: 0.7 },
    faces: ['#8A4AC8', '#E8A830', '#F0A8C0', '#E8F0F4', '#7A5A40', '#3AB870'],
    lights: {
      sky: '#ffffff', ground: '#6a6058', hemi: 1.7,
      key: ['#fff4e2', 2.4, [-3, 7, 5]], fill: ['#d8e4ff', 0.45, [5, 0, 4]], rim: ['#ffffff', 0.8, [0, 3, -6]],
    },
    env: 0.8,
    surface: 'druze',
    sound: 'crystal',
    motion: 'smooth',
    burst: { shape: 'star', colors: 'faces', size: 0.1, speed: 2, gravity: -1, drag: 2, life: 0.8, additive: true },
  },
  {
    // 보석상 진열장. 브릴리언트 컷 보석이 벌집처럼 박혀 솟고 별 모양 패싯이 번쩍인다
    id: 'pave',
    name: '파베 보석',
    bg: '#0E0C12',
    ink: '#F2ECE0',
    backdrop: [
      'radial-gradient(60% 45% at 50% 20%, rgba(255,240,220,.2), transparent 70%)',
      'linear-gradient(180deg, #22202A, #060508)',
    ].join(', '),
    form: { bevel: 0.08, size: 0.94, radius: 0.12, grid: 48 },
    body: { color: '#D8B060', roughness: 0.25, metalness: 0.9 },
    faces: ['#C8102E', '#1A3AA8', '#10804A', '#F2F4F8', '#F0B020', '#8A3AC8'],
    lights: {
      sky: '#ffffff', ground: '#6a6058', hemi: 1.7,
      key: ['#fff4e2', 2.4, [-3, 7, 5]], fill: ['#d8e4ff', 0.45, [5, 0, 4]], rim: ['#ffffff', 0.8, [0, 3, -6]],
    },
    env: 1.0,
    surface: 'pave',
    sound: 'glass',
    motion: 'smooth',
    burst: { shape: 'star', colors: ['#FFFFFF', '#FFF2C0'], size: 0.1, speed: 2, gravity: -1, drag: 2, life: 0.8, additive: true },
  },



































];

export const themeById = (id) => THEMES.find((t) => t.id === id);

// 테마 고르는 목록에서 묶어 보여 주는 무리. 테마는 모두 한 무리에만 들어간다(테스트가 본다)
export const GROUPS = [
  { name: '기본', themes: ['classic', 'candy', 'brick', 'dice', 'jelly', 'clay', 'bubblewrap', 'paper', 'box', 'doodle', 'slime'] },
  { name: '자연', themes: ['forest', 'grass', 'soil', 'timber', 'pebble', 'sunset', 'water', 'rain', 'ice', 'aurora', 'desert', 'honey'] },
  { name: '바다', themes: ['coral', 'barnacle', 'urchin', 'suckers', 'anemone', 'pearl'] },
  { name: '식물', themes: ['cactus', 'succulent', 'mushroom', 'pinecone', 'moss', 'bark'] },
  { name: '빛·불', themes: ['neon', 'lava', 'electric', 'tesla', 'disco', 'lavalamp', 'kaleido'] },
  { name: '우주', themes: ['space', 'planet', 'blackhole', 'nebula', 'star', 'galaxy'] },
  { name: '보석·광물', themes: ['gem', 'opal', 'agate', 'marble', 'fossil', 'bismuth', 'banded', 'druze', 'pave'] },
  { name: '공예·천', themes: ['dancheong', 'najeon', 'stained', 'mosaic', 'glass', 'marquetry', 'ink', 'knit', 'camo'] },
  { name: '문양', themes: ['arabesque', 'artdeco', 'celtic', 'aztec', 'paisley', 'kkotsal', 'guilloche', 'quilt', 'lantern', 'carpet'] },
  { name: '패턴', themes: ['houndstooth', 'glencheck', 'herringbone', 'gingham', 'argyle', 'swissdot', 'chevron', 'tartan'] },
  { name: '판타지', themes: ['dragon', 'phoenix', 'mithril', 'damascus', 'fairywing', 'dragonegg'] },
  { name: '동물', themes: ['wool', 'hamster', 'wild', 'croc', 'python', 'calf'] },
  { name: '금속·기계', themes: ['metal', 'gauge', 'rust', 'mercury', 'circuit', 'carbon'] },
  { name: '픽셀', themes: ['pixel', 'handheld', 'cga', 'onebit', 'clash', 'arcade', 'amber', 'led', 'ascii', 'bricks', 'beads'] },
  { name: '명화', themes: ['oil', 'watercolor', 'ukiyoe', 'monet', 'seurat', 'gogh', 'munch', 'klimt', 'cubism', 'warhol', 'collage'] },
  { name: '디지털·레트로', themes: ['glitch', 'holo', 'thermal', 'flip', 'comic', 'toon'] },
  { name: '그로테스크', themes: ['flesh', 'eldritch', 'bone', 'eyeball', 'teeth'] },
];
