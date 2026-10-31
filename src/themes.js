// faces 순서는 cube.js의 면 번호와 같다: R L U D F B
export const THEMES = [
  {
    id: 'classic',
    name: '기본',
    bg: '#E8E5E0',
    ink: '#24221F',
    body: '#151515',
    faces: ['#C8102E', '#FF6A13', '#F7F7F2', '#FFD100', '#009A54', '#0046AD'],
  },
  {
    id: 'night',
    name: '밤',
    bg: '#1A1B1F',
    ink: '#E6E3DE',
    body: '#0A0A0B',
    faces: ['#FF4F5E', '#FF9A3C', '#EDEDEA', '#FFE047', '#2FD27E', '#3F8CFF'],
  },
  {
    id: 'pastel',
    name: '파스텔',
    bg: '#F2EDE6',
    ink: '#3B3631',
    body: '#FBF8F3',
    faces: ['#EE9C9C', '#F3BF8E', '#C9BDE8', '#F4DD8A', '#A6D8B8', '#9DBFE6'],
  },
  {
    id: 'earth',
    name: '흙',
    bg: '#DCD3C3',
    ink: '#2A2621',
    body: '#2A2621',
    faces: ['#A9432C', '#D48A3A', '#EFE6D3', '#DDAE3A', '#5E7748', '#2E4868'],
  },
];

export const themeById = (id) => THEMES.find((t) => t.id === id);
