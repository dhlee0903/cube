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
// body      몸통 { color, roughness, metalness, glow(몸통 무늬가 내는 빛 색) }
// sticker   스티커 재질 { roughness, metalness }
// glow      스티커가 스스로 내는 빛. 숫자 하나 또는 면마다
// halo      스티커 둘레로 번지는 빛의 세기. haloMode가 'shadow'면 스티커 밑 그림자
// lights    조명 { sky, ground, hemi, key, fill, rim }. key 등은 [색, 세기, [x, y, z]]
// light     조명 전체 배율
// flicker   조명이 일렁이는 방식: candle, lava, lightning, aurora
// env       주변 반사 세기
// surface   겉면 질감. surfaces.js
// motion    돌아가는 맛. motions.js
// pulse     큐브가 심장처럼 뛴다     jitter  가끔 화면이 튄다
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
    motion: 'smooth',
    ambient: { mode: 'float', shape: 'glow', colors: 'faces', count: 30, size: 0.07, speed: 0.5, opacity: 0.5, additive: true },
    burst: { shape: 'glow', colors: 'faces', size: 0.12, speed: 3.6, gravity: 0, drag: 3, life: 0.55, additive: true },
  },
  {
    // 굳어 가는 용암 덩어리. 아래에서 올라오는 붉은 빛, 묵직하게 구르고, 돌리면 달아오른다
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
    faces: ['#E3250E', '#8F1212', '#FFF0A0', '#62524B', '#FF7A00', '#FFC21A'],
    glow: [0.55, 0.45, 0.7, 0, 0.6, 0.6],
    halo: 0.4,
    lights: {
      sky: '#2a0c06', ground: '#ff5a10', hemi: 2,
      key: ['#ff7a2a', 1.8, [0, -6, 3]], fill: ['#ffb27a', 0.3, [4, 5, 4]], rim: ['#ff3a00', 1.5, [0, -2, -6]],
    },
    flicker: 'lava',
    surface: 'lava',
    motion: 'heavy',
    ambient: { mode: 'rise', shape: 'glow', colors: ['#FFC23A', '#FF7A1A', '#FF3B0A'], count: 120, size: 0.07, speed: 0.6, opacity: 0.95, additive: true },
    burst: { shape: 'glow', colors: ['#FFD24A', '#FF8A1A', '#FF4010'], size: 0.1, speed: 2.6, gravity: 1.6, drag: 1.5, life: 1.1, additive: true },
  },
  {
    // 물속에 잠긴 젤리 큐브. 위에서 빛줄기가 내리고, 느릿하게 미끄러지며, 돌리면 거품이 솟는다
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
    form: { bevel: 0.14, size: 0.8, radius: 0.22, depth: 0.03 },
    body: { color: '#D8F2F7', roughness: 0.1 },
    sticker: { roughness: 0.1 },
    faces: ['#FF7A6B', '#F7E3A1', '#2FE0D8', '#0E7C86', '#2A86FF', '#1C3A9E'],
    env: 0.35,
    lights: {
      sky: '#bff4ff', ground: '#052a44', hemi: 2.1,
      key: ['#d8fbff', 1.7, [0, 8, 3]], fill: ['#2a86ff', 0.5, [5, -2, 4]], rim: ['#7fe8ff', 1, [0, 3, -6]],
    },
    surface: 'water',
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
    motion: 'smooth',
    burst: { shape: 'streak', colors: 'faces', size: 0.15, speed: 1.6, gravity: -1.6, drag: 2.4, life: 1.8 },
  },
  {
    // 테슬라 코일 실험실. 판 위로 번개가 기어다니고, 가끔 방 전체가 번쩍인다
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
    motion: 'snap',
    ambient: { mode: 'float', shape: 'glow', colors: ['#BFE3FF', '#7FB8FF', '#FFFFFF'], count: 50, size: 0.06, speed: 1.4, opacity: 0.8, additive: true },
    burst: { shape: 'streak', colors: ['#FFFFFF', '#9FD4FF', '#5C9DFF'], size: 0.1, speed: 5, gravity: 0, drag: 4.5, life: 0.4, additive: true },
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
    motion: 'smooth',
    ambient: { mode: 'float', shape: 'star', colors: ['#FFF6D8', '#FFFFFF', '#FFD98A'], count: 36, size: 0.14, speed: 0.5, opacity: 0.9, additive: true },
    burst: { shape: 'star', colors: 'faces', size: 0.18, speed: 2.6, gravity: -3, drag: 1.4, life: 1, additive: true },
  },
  {
    // 고장 난 CRT 화면. 주사선, 어긋나는 색, 버벅이며 건너뛰는 회전, 가끔 화면째 튄다
    id: 'glitch',
    name: '글리치',
    bg: '#0A0A0C',
    ink: '#F0F0F0',
    backdrop: [
      'repeating-linear-gradient(0deg, rgba(255,255,255,.04) 0 1px, transparent 1px 3px)',
      'radial-gradient(75% 65% at 50% 45%, transparent 55%, rgba(0,0,0,.85) 100%)',
      'linear-gradient(90deg, rgba(255,0,85,.07), transparent 12%, transparent 88%, rgba(0,255,200,.07))',
      'radial-gradient(60% 50% at 50% 45%, #1C1C26, #0A0A0C 70%)',
    ].join(', '),
    form: { bevel: 0.02, size: 0.86, radius: 0.02, depth: 0 },
    body: { color: '#121214', roughness: 0.4 },
    faces: ['#FF0055', '#B000FF', '#F4F4F4', '#FFD400', '#00FFC8', '#2F5BFF'],
    lights: {
      sky: '#d0d0ff', ground: '#101018', hemi: 1.6,
      key: ['#ffffff', 1.4, [-4, 5, 5]], fill: ['#ff0055', 0.6, [6, 0, 3]], rim: ['#00ffc8', 1.2, [-2, 3, -6]],
    },
    light: 0.85,
    surface: 'glitch',
    motion: 'stutter',
    jitter: true,
    ambient: { mode: 'float', shape: 'square', colors: 'faces', count: 30, size: 0.06, speed: 0.8, opacity: 0.8 },
    burst: { shape: 'square', colors: 'faces', size: 0.08, speed: 3, gravity: 0, drag: 3.2, life: 0.5 },
  },
  {
    // 8비트 게임 속 블록. 면마다 다른 타일(벽돌, 돌, 구름, 물음표, 풀, 물), 칸칸이 끊기는 움직임
    id: 'pixel',
    name: '픽셀',
    bg: '#5C94FC',
    ink: '#0E0F1A',
    backdrop: [
      `${svg(64, 16, "<g fill='#ffffff'><rect x='6' y='4' width='10' height='4'/><rect x='4' y='6' width='16' height='4'/><rect x='10' y='2' width='6' height='3'/><rect x='38' y='8' width='8' height='3'/><rect x='36' y='10' width='13' height='3'/></g>", 'xMidYMid meet')} 0 6% / 320px 80px repeat-x`,
      `${svg(100, 30, "<g shape-rendering='crispEdges'><path d='M0 30 V18 H6 V14 H12 V10 H22 V14 H28 V18 H34 V30Z' fill='#00A800'/><path d='M50 30 V22 H56 V16 H66 V12 H74 V16 H82 V22 H90 V30Z' fill='#00A800'/><rect x='14' y='16' width='2' height='2' fill='#005800'/><rect x='66' y='18' width='2' height='2' fill='#005800'/><rect x='0' y='26' width='100' height='4' fill='#C84C0C'/><rect x='0' y='26' width='100' height='1' fill='#FCA044'/></g>")} bottom / 100% 30% no-repeat`,
      'linear-gradient(#6EA2FF, #5C94FC 70%)',
    ].join(', '),
    form: { bevel: 0.01, size: 0.96, radius: 0.001, depth: 0 },
    body: { color: '#101018', roughness: 1 },
    sticker: { roughness: 1 },
    faces: ['#C8442C', '#8C8C9C', '#FFF1E8', '#F8B830', '#3CB043', '#29ADFF'],
    lights: {
      sky: '#ffffff', ground: '#c8d8ff', hemi: 3,
      key: ['#ffffff', 0.8, [-3, 6, 5]], fill: ['#ffffff', 0.2, [5, 0, 4]], rim: ['#ffffff', 0, [0, 3, -6]],
    },
    surface: 'pixel',
    motion: 'stepped',
    ambient: { mode: 'rise', shape: 'square', colors: ['#F8D030', '#FFFFFF'], count: 18, size: 0.08, speed: 0.35, opacity: 0.85 },
    burst: { shape: 'square', colors: 'faces', size: 0.11, speed: 2.8, gravity: -8, drag: 0.5, life: 1 },
  },
  {
    // 마더보드 위 부품. 배선과 납땜 패드, 가운데서 깜빡이는 LED. 돌리면 배선을 따라 전류가 몰려간다
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
    faces: ['#FF5A3C', '#A855F7', '#E8F1EC', '#FFD23F', '#22E07A', '#3CB4FF'],
    env: 0.4,
    lights: {
      sky: '#bfffd8', ground: '#03140c', hemi: 1.3,
      key: ['#e8fff0', 1.7, [-4, 6, 5]], fill: ['#22e07a', 0.5, [6, -1, 3]], rim: ['#3cb4ff', 1.1, [0, 4, -6]],
    },
    light: 0.9,
    surface: 'circuit',
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
    motion: 'heavy',
    ambient: { mode: 'float', shape: 'dot', colors: ['#FFF6E0'], count: 36, size: 0.03, speed: 0.15, opacity: 0.55 },
    burst: { shape: 'dot', colors: ['#F1EFEA', '#CFCAC0', '#9E978A'], size: 0.05, speed: 1.4, gravity: -2.5, drag: 2.5, life: 1.1 },
  },
  {
    // 할로윈 밤. 언덕 위 앙상한 나무와 둥근 달, 박쥐가 날고, 칸마다 다른 표정의 호박등이 촛불에 일렁인다
    id: 'pumpkin',
    name: '호박',
    bg: '#140B16',
    ink: '#FFE8CC',
    backdrop: [
      `${svg(100, 50, "<g fill='#07030A'><path d='M0 44 Q30 37 60 43 T100 40 V50 H0Z'/><path d='M12 44 v-4 a2 2 0 0 1 4 0 v4z M22 45 v-3 a1.6 1.6 0 0 1 3.2 0 v3z'/></g><path d='M80 44 L80 29 L72 17 M80 29 L88 19 M80 35 L70 31 M76 23 L70 21 M84 24 L92 23 M88 19 L90 14 M72 17 L70 12' stroke='#07030A' stroke-width='1.6' fill='none' stroke-linecap='round'/>")} bottom / 100% 50% no-repeat`,
      'radial-gradient(circle at 50% 50%, #FFF6DA 0%, #F2E2B0 55%, rgba(242,226,176,0) 58%) 80% 14% / 16vmin 16vmin no-repeat',
      'radial-gradient(30% 22% at 80% 15%, rgba(255,240,200,.18), transparent 70%)',
      'linear-gradient(#2E1A44 0%, #1E1028 55%, #120A12 100%)',
    ].join(', '),
    drift: [
      'radial-gradient(60% 25% at 50% 100%, rgba(255,120,20,.25), transparent 70%)',
      'linear-gradient(transparent 70%, rgba(180,160,200,.08) 85%, transparent)',
    ].join(', '),
    form: { bevel: 0.12, size: 0.82, radius: 0.2, depth: 0.02 },
    body: { color: '#1C1410', roughness: 0.85 },
    faces: ['#B3122E', '#7B3FA8', '#F2EDE4', '#FFD447', '#7BC43A', '#F07F13'],
    lights: {
      sky: '#2a1a40', ground: '#ff7a1a', hemi: 1.1,
      key: ['#ff9a3c', 1.9, [0, -4, 5]], fill: ['#7a8cff', 0.5, [-6, 4, 2]], rim: ['#c7d4ff', 1.1, [4, 5, -6]],
    },
    light: 0.85,
    flicker: 'candle',
    surface: 'pumpkin',
    motion: 'smooth',
    ambient: [
      { mode: 'wind', shape: 'bat', colors: ['#07030A'], count: 8, size: 0.36, speed: 0.45, opacity: 1 },
      { mode: 'float', shape: 'glow', colors: ['#FF9A2E', '#FFD447'], count: 18, size: 0.1, speed: 0.3, opacity: 0.8, additive: true },
    ],
    burst: { shape: 'streak', colors: ['#F07F13', '#7B3FA8', '#7BC43A', '#FFD447'], size: 0.13, speed: 2.2, gravity: -4, drag: 1.4, life: 1.1 },
  },
];

export const themeById = (id) => THEMES.find((t) => t.id === id);
