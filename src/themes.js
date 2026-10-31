// faces 순서는 cube.js의 면 번호와 같다: R L U D F B
// 처음 보이는 면은 U(위), F(왼쪽 앞), R(오른쪽 앞)이다.
//
// bg        단색 바탕. 주소창 색과 글자 대비를 정할 때 쓴다
// backdrop  실제로 깔리는 배경(CSS background). 없으면 bg
// drift     배경이 천천히 흐른다
// body      조각 몸통 { color, roughness, metalness }
// sticker   스티커 재질 { roughness, metalness }
// glow      스티커가 스스로 내는 빛. 숫자 하나 또는 면마다
// light     조명 세기 배율
// env       주변 반사 세기(금속, 얼음 같은 것)

// 우주 배경의 별. 매번 같은 자리에 찍히도록 고정된 수열을 쓴다.
function stars(count) {
  let seed = 7;
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

export const THEMES = [
  {
    id: 'classic',
    name: '기본',
    bg: '#E8E5E0',
    ink: '#24221F',
    body: { color: '#151515' },
    faces: ['#C8102E', '#FF6A13', '#F7F7F2', '#FFD100', '#009A54', '#0046AD'],
  },
  {
    id: 'neon',
    name: '네온',
    bg: '#0A0612',
    ink: '#F2E8FF',
    backdrop: [
      'radial-gradient(55% 40% at 50% 45%, rgba(255,45,149,.20), transparent 70%)',
      'radial-gradient(45% 35% at 85% 85%, rgba(0,229,255,.16), transparent 70%)',
      'radial-gradient(45% 35% at 12% 12%, rgba(166,61,255,.22), transparent 70%)',
      '#0A0612',
    ].join(', '),
    drift: true,
    body: { color: '#07050C', roughness: 0.35 },
    faces: ['#FF2D95', '#FF7A18', '#00E5FF', '#E8FF2A', '#3BFF6B', '#A63DFF'],
    glow: 0.65,
    light: 0.6,
  },
  {
    id: 'lava',
    name: '용암',
    bg: '#110605',
    ink: '#FFE3CC',
    backdrop: [
      'radial-gradient(70% 45% at 50% 108%, rgba(255,96,0,.55), transparent 70%)',
      'radial-gradient(45% 35% at 50% 45%, rgba(255,60,0,.14), transparent 70%)',
      'radial-gradient(30% 25% at 15% 95%, rgba(255,170,0,.25), transparent 70%)',
      'linear-gradient(#170807, #0B0403)',
    ].join(', '),
    drift: true,
    body: { color: '#1B1311', roughness: 0.95 },
    faces: ['#E3250E', '#8F1212', '#FFF0A0', '#62524B', '#FF7A00', '#FFC21A'],
    glow: [0.55, 0.45, 0.7, 0, 0.6, 0.6],
    light: 0.6,
  },
  {
    id: 'water',
    name: '물',
    bg: '#06293B',
    ink: '#DDF6FF',
    backdrop: [
      'radial-gradient(80% 45% at 50% -8%, rgba(130,225,255,.38), transparent 70%)',
      'radial-gradient(55% 40% at 18% 100%, rgba(0,160,175,.30), transparent 70%)',
      'radial-gradient(40% 30% at 88% 60%, rgba(60,140,255,.18), transparent 70%)',
      'linear-gradient(#0A4A66, #052234 70%, #03141F)',
    ].join(', '),
    drift: true,
    body: { color: '#E6F6F9', roughness: 0.15 },
    sticker: { roughness: 0.2 },
    faces: ['#FF7A6B', '#F7E3A1', '#2FE0D8', '#0E7C86', '#2A86FF', '#1C3A9E'],
    env: 0.35,
  },
  {
    id: 'forest',
    name: '숲',
    bg: '#17231A',
    ink: '#E6EEDD',
    backdrop: [
      'radial-gradient(70% 45% at 50% -5%, rgba(200,230,130,.20), transparent 70%)',
      'radial-gradient(50% 40% at 90% 100%, rgba(40,90,50,.45), transparent 70%)',
      'linear-gradient(#1F3123, #0F1811)',
    ].join(', '),
    body: { color: '#2A2016', roughness: 0.8 },
    sticker: { roughness: 0.55 },
    faces: ['#C2452D', '#7A5230', '#EDE6D2', '#E3A23B', '#84B04F', '#2E6A47'],
  },
  {
    id: 'sunset',
    name: '노을',
    bg: '#2B1534',
    ink: '#FFF1E6',
    backdrop: 'linear-gradient(180deg, #FF9F5A 0%, #EE5D7A 32%, #7A2E80 66%, #24123A 100%)',
    drift: true,
    body: { color: '#22132E', roughness: 0.5 },
    faces: ['#FF5E7E', '#B5179E', '#FFD166', '#6A2EA8', '#FF8E3C', '#4CC9F0'],
    glow: 0.1,
  },
  {
    id: 'space',
    name: '우주',
    bg: '#05050F',
    ink: '#E9E8FF',
    backdrop: [
      stars(70),
      'radial-gradient(45% 35% at 78% 22%, rgba(140,70,255,.30), transparent 70%)',
      'radial-gradient(40% 30% at 18% 78%, rgba(0,180,255,.20), transparent 70%)',
      'radial-gradient(30% 25% at 30% 25%, rgba(255,64,160,.12), transparent 70%)',
      '#05050F',
    ].join(', '),
    body: { color: '#0C0C1C', roughness: 0.4 },
    faces: ['#FF4D6D', '#FFB347', '#F4F1FF', '#00D1B2', '#7B5CFF', '#E040FB'],
    glow: 0.3,
    light: 0.8,
  },
  {
    id: 'candy',
    name: '사탕',
    bg: '#FBE3EE',
    ink: '#4B2340',
    backdrop: 'linear-gradient(135deg, #FFE0EC 0%, #F1E3FF 50%, #DDF4FF 100%)',
    drift: true,
    body: { color: '#FFFFFF', roughness: 0.25 },
    sticker: { roughness: 0.15 },
    faces: ['#FF5FA2', '#FF9F45', '#8E6CFF', '#FFE45C', '#47D9B0', '#54B2FF'],
  },
  {
    id: 'desert',
    name: '사막',
    bg: '#EFD8B3',
    ink: '#3D2B1F',
    backdrop: 'linear-gradient(180deg, #F8E9D0 0%, #EFD4A8 60%, #E0B783 100%)',
    body: { color: '#3B2A1E', roughness: 0.85 },
    sticker: { roughness: 0.6 },
    faces: ['#C4552F', '#7C5BA6', '#F6EEDC', '#E3B862', '#5E8B4A', '#4F9FD1'],
  },
  {
    id: 'ice',
    name: '얼음',
    bg: '#D9E9F2',
    ink: '#1F3A52',
    backdrop: [
      'radial-gradient(70% 50% at 50% 35%, #F6FCFF, transparent 70%)',
      'linear-gradient(#E3F1F8, #C6DCE9)',
    ].join(', '),
    body: { color: '#F2F9FD', roughness: 0.1 },
    sticker: { roughness: 0.18 },
    faces: ['#F28DB5', '#A996F2', '#63C6F2', '#2E5C9E', '#72E0C4', '#3F8A86'],
    env: 0.4,
    light: 0.85,
  },
  {
    id: 'metal',
    name: '금속',
    bg: '#1B1C1F',
    ink: '#E8E8EA',
    backdrop: [
      'radial-gradient(60% 50% at 50% 42%, #34363B, transparent 70%)',
      'linear-gradient(#202125, #111215)',
    ].join(', '),
    body: { color: '#141518', roughness: 0.35, metalness: 0.6 },
    sticker: { roughness: 0.25, metalness: 1 },
    faces: ['#D0283E', '#D07A48', '#DADDE2', '#E6B43C', '#2FAE6E', '#3C6FD8'],
    env: 1.3,
    light: 0.55,
  },
  {
    id: 'paper',
    name: '종이',
    bg: '#EEE7D8',
    ink: '#2A2622',
    backdrop: 'radial-gradient(120% 90% at 50% 40%, #F5EFE3 0%, #E4DAC6 100%)',
    body: { color: '#F3EDE0', roughness: 1 },
    sticker: { roughness: 0.95 },
    faces: ['#D7402B', '#7B3F61', '#2A2A2A', '#D6982C', '#6F9A7A', '#2C4E8C'],
    light: 1.05,
  },
];

export const themeById = (id) => THEMES.find((t) => t.id === id);
