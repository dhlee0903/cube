# cube

브라우저에서 돌리는 큐브. 2×2부터 7×7까지 된다.

- 큐브 면을 끌면 그 줄이 돌고, 큐브 바깥을 끌면 큐브 전체가 돈다
- 섞기, 맞추기
- 색 네 가지 (기본, 밤, 파스텔, 흙)

크기와 색은 브라우저에 기억해 둔다.

## 실행

```sh
npm install
npm run dev
```

```sh
npm test        # 큐브 상태 계산 테스트
npm run build   # dist/
```

`main`에 올라가면 GitHub Actions가 Pages로 배포한다. 처음 한 번은 저장소
Settings → Pages → Source를 **GitHub Actions**로 바꿔 줘야 한다.

## 구조

- `src/cube.js` 조각 위치와 방향만 다루는 상태. 화면과 무관해서 테스트는 이것만 본다
- `src/view.js` three.js로 그리기, 끌어서 돌리기
- `src/main.js` 버튼과 기록
- `src/themes.js` 색

## 맞추기

맞춘 상태부터 돌린 것을 전부 기록해 두었다가 거꾸로 되돌린다. 같은 축으로 이어진
회전은 한 번에 합치고, 서로 지워지는 것은 뺀다. 최단 수를 찾는 솔버는 아니다.
중간에 손으로 다 맞추면 기록은 비워진다.
