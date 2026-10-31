import { defineConfig } from 'vite';

// 경로를 상대로 둬서 어느 주소 아래에서 열려도(Vercel 루트, 미리보기 페이지) 그대로 동작한다
export default defineConfig({
  base: './',
  build: {
    // three가 대부분이다. 나눠 봐야 어차피 처음에 다 받는다.
    chunkSizeWarningLimit: 700,
  },
});
