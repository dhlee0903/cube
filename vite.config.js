import { defineConfig } from 'vite';

// GitHub Pages는 /cube/ 아래에서 열리므로 경로를 상대로 둔다
export default defineConfig({
  base: './',
  build: {
    // three가 대부분이다. 나눠 봐야 어차피 처음에 다 받는다.
    chunkSizeWarningLimit: 700,
  },
});
