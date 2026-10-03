/* ═══════════════════════════════════════════
   LEFT CITY — 남겨진 도시 : 나라별 도시 테마 · 랜드마크
   world.js 다음, entities.js 앞에 로드된다.
   랜드마크는 실제 장소를 본뜬 양식화된 모형이다 — 사진·도면·로고는 쓰지 않는다.
   ═══════════════════════════════════════════ */

const THEMES = {
  seoul: {
    key: 'seoul', name: '서울', river: '한강',
    signs: ['편의점', '약국', 'PC방', '치킨', '노래방', '병원', '분식', '24시', '부동산', '김밥', '세탁', '은행'],
    signCols: ['#4fc3f7', '#ff6f61', '#ffd54f', '#81c784', '#ba68c8', '#ff8a65'],
    carCols: ['#d9822b', '#c7c9cc', '#2f4a63', '#3a3d42', '#5c2c28', '#e0e0e0'],   // 주황 택시가 섞인다
    busCol: '#2f7d4f', small: null,
    roofs: ['#1b2129', '#181d24', '#1f252d', '#22262b'],
    streetDecor: ['parasol', 'bin']
  },
  tokyo: {
    key: 'tokyo', name: '도쿄', river: '스미다강',
    signs: ['ラーメン', '薬局', '居酒屋', 'カラオケ', 'コンビニ', '寿司', '喫茶', '本屋', '焼肉', '駐車場', '交番', 'ホテル'],
    signCols: ['#ff5252', '#ffeb3b', '#40c4ff', '#69f0ae', '#ff80ab', '#ffffff'],
    carCols: ['#1d1f24', '#c9ccd1', '#3b4a5c', '#7a1f1f', '#d8d2c4', '#2d3a2e'],    // 검은 택시
    busCol: '#c8d3db', small: null,
    roofs: ['#1c1f26', '#1a1d23', '#20232b', '#191b20'],
    streetDecor: ['vending', 'vending', 'bike', 'bin']
  },
  bangkok: {
    key: 'bangkok', name: '방콕', river: '짜오프라야강',
    signs: ['ตลาด', 'ร้านอาหาร', 'โรงแรม', 'ร้านยา', 'นวด', 'กาแฟ', 'ข้าวมันไก่', 'ก๋วยเตี๋ยว', 'ทอง', 'ธนาคาร'],
    signCols: ['#ffca28', '#ff7043', '#26c6da', '#ec407a', '#9ccc65', '#ffffff'],
    carCols: ['#e85d75', '#3e8e41', '#d9c13b', '#2f4a63', '#c9ccd1', '#5a3e2b'],    // 분홍·초록 택시
    busCol: '#b5452d', small: 'tuktuk',
    roofs: ['#211d1b', '#1d1b1a', '#24201c', '#1b1a19'],
    streetDecor: ['cart', 'shrine', 'bin']
  },
  singapore: {
    key: 'singapore', name: '싱가포르', river: '싱가포르강',
    signs: ['KOPITIAM', '药房', 'MAKAN', 'LAKSA', '24 HRS', 'CLINIC', 'MRT', '茶室', 'KEDAI', 'HOTEL', '海南鸡饭', 'TOTO'],
    signCols: ['#4dd0e1', '#ff8a65', '#ffee58', '#a5d6a7', '#f48fb1', '#ffffff'],
    carCols: ['#2f6fb5', '#c9ccd1', '#1d1f24', '#e2c13a', '#8b2b2b', '#3e8e41'],   // 파란 택시
    busCol: '#6b2f7a', small: null,
    roofs: ['#1c2125', '#1a1f22', '#20262a', '#1b2023'],
    streetDecor: ['parasol', 'bike', 'vending', 'bin']
  }
};

/* 랜드마크 — stamp(world, ...) 가 칸을 찍고, 그릴 때 쓸 정보를 돌려준다.
   solid(x, y, w, h) 는 지나갈 수 없는 칸, 나머지는 바닥(ground)으로 걸어 다닌다. */
const lmSolid = (wd, x, y, w, h) => wd.fill(x, y, w, h, T_WALL, D_LANDMARK);
const lmFloor = (wd, x, y, w, h, deco) => wd.fill(x, y, w, h, T_ROAD, deco);
/** 랜드마크 안에 놓는 탈것 · 화차 — 일반 구조물(props)로 넣어 충돌 · 그리기 · 경보를 그대로 쓴다.
    tiles 는 차지하는 칸, 가로로 길면 a = 0, 세로면 a = π/2 */
function lmProp(wd, kind, tiles, o) {
  const xs = tiles.map(t => t[0]), ys = tiles.map(t => t[1]);
  const cx = (Math.min(...xs) + Math.max(...xs) + 1) / 2 * TILE, cy = (Math.min(...ys) + Math.max(...ys) + 1) / 2 * TILE;
  for (const [tx, ty] of tiles) { wd.grid[ty * wd.w + tx] = T_WALL; wd.deco[ty * wd.w + tx] = D_PROP; }
  wd.props.push(Object.assign({ x: cx, y: cy, kind, a: 0, tiles }, o));
}

const LANDMARKS = {
  /* 서울 — 궁궐 정문과 담장, 안뜰 너머 정전. 집결지는 안뜰 */
  gwanghwamun: {
    name: '광화문', w: 13, h: 11, ground: D_PLAZA,
    stamp(wd, x0, y0) {
      lmSolid(wd, x0, y0, 13, 1);                 // 북쪽 담
      lmSolid(wd, x0, y0, 1, 11);                 // 서쪽 담
      lmSolid(wd, x0 + 12, y0, 1, 11);            // 동쪽 담
      lmSolid(wd, x0, y0 + 10, 4, 1);             // 남쪽 담 (문 양옆)
      lmSolid(wd, x0 + 9, y0 + 10, 4, 1);
      lmSolid(wd, x0 + 4, y0 + 9, 1, 2);          // 문 기둥(석축) — 가운데 세 칸이 홍예문
      lmSolid(wd, x0 + 8, y0 + 9, 1, 2);
      lmSolid(wd, x0 + 3, y0 + 2, 7, 3);          // 정전
      return { kind: 'palace', x: x0, y: y0, w: 13, h: 11, rally: { tx: x0 + 6, ty: y0 + 7 },
        gate: { x: x0 + 4, y: y0 + 9, w: 5, h: 2 }, hall: { x: x0 + 3, y: y0 + 2, w: 7, h: 3 } };
    }
  },
  /* 서울 — 언덕 공원 꼭대기의 전파탑 */
  namsan: {
    name: '남산타워', w: 11, h: 11, ground: D_GRASS,
    stamp(wd, x0, y0, rng) {
      lmSolid(wd, x0 + 5, y0 + 5, 1, 1);
      for (let i = 0; i < 14; i++) {              // 비탈의 나무
        const a = rng() * 6.283, r = 3 + rng() * 1.6;
        const x = x0 + 5 + Math.round(Math.cos(a) * r), y = y0 + 5 + Math.round(Math.sin(a) * r);
        if (wd.at(x, y) === T_ROAD && wd.roadNeighbours(x, y) === 8 && Math.abs(x - x0 - 5) + Math.abs(y - y0 - 5) > 2) wd.tree(x, y, rng);
      }
      return { kind: 'tower', x: x0, y: y0, w: 11, h: 11, rally: { tx: x0 + 5, ty: y0 + 7 }, cx: x0 + 5.5, cy: y0 + 5.5 };
    }
  },
  /* 도쿄 — 대로 교차로를 넓혀 사방·대각으로 건너는 스크램블 교차로 */
  scramble: {
    name: '시부야 스크램블', junction: true, w: 6, h: 6,
    stamp(wd, v, h) {
      const x0 = v.p - 1, y0 = h.p - 1, n = v.w + 2, m = h.w + 2;
      for (let y = y0; y < y0 + m; y++) for (let x = x0; x < x0 + n; x++) {
        if (!wd.inside(x, y)) continue;
        wd.set(x, y, T_ROAD);
        const i = y * wd.w + x;
        wd.deco[i] = D_ASPHALT; wd.dirm[i] = 3; wd.cross[i] = 0; wd.mark[i] = 0;
      }
      return { kind: 'scramble', x: x0, y: y0, w: n, h: m, rally: { tx: x0 + (n >> 1), ty: y0 + (m >> 1) } };
    }
  },
  /* 도쿄 — 공원 가운데 붉은·흰 격자 철탑. 네 다리 사이로 지나갈 수 있다 */
  tokyotower: {
    name: '도쿄 타워', w: 9, h: 9, ground: D_GRASS,
    stamp(wd, x0, y0, rng) {
      for (const [dx, dy] of [[3, 3], [5, 3], [3, 5], [5, 5]]) lmSolid(wd, x0 + dx, y0 + dy, 1, 1);
      for (let i = 0; i < 10; i++) {
        const x = x0 + 1 + Math.floor(rng() * 7), y = y0 + 1 + Math.floor(rng() * 7);
        if ((x - x0 >= 2 && x - x0 <= 6 && y - y0 >= 2 && y - y0 <= 6)) continue;
        if (wd.at(x, y) === T_ROAD && wd.roadNeighbours(x, y) === 8) wd.tree(x, y, rng);
      }
      return { kind: 'lattice', x: x0, y: y0, w: 9, h: 9, rally: { tx: x0 + 4, ty: y0 + 4 }, cx: x0 + 4.5, cy: y0 + 4.5 };
    }
  },
  /* 도쿄 — 붉은 대문과 큰 등롱, 노점 거리, 본당과 오층탑 */
  sensoji: {
    name: '센소지', w: 11, h: 13, ground: D_PLAZA,
    stamp(wd, x0, y0) {
      lmSolid(wd, x0 + 4, y0 + 12, 1, 1);          // 대문 기둥 — 가운데 한 칸이 문
      lmSolid(wd, x0 + 6, y0 + 12, 1, 1);
      lmSolid(wd, x0 + 2, y0 + 1, 7, 3);           // 본당
      for (let y = y0 + 6; y <= y0 + 10; y += 2) { lmSolid(wd, x0 + 3, y, 1, 1); lmSolid(wd, x0 + 7, y, 1, 1); }  // 노점
      lmSolid(wd, x0 + 9, y0 + 5, 2, 2);           // 오층탑
      return { kind: 'temple', x: x0, y: y0, w: 11, h: 13, rally: { tx: x0 + 5, ty: y0 + 5 },
        gate: { x: x0 + 3, y: y0 + 12, w: 5, h: 1 }, hall: { x: x0 + 2, y: y0 + 1, w: 7, h: 3 },
        pagoda: { x: x0 + 9, y: y0 + 5 }, stalls: [6, 8, 10].flatMap(dy => [[x0 + 3, y0 + dy], [x0 + 7, y0 + dy]]) };
    }
  },
  /* 방콕 — 하얀 탑신에 자기 조각이 박힌 중앙 탑(쁘랑)과 네 귀퉁이 작은 탑 */
  watarun: {
    name: '왓 아룬', w: 11, h: 11, ground: D_PLAZA,
    stamp(wd, x0, y0) {
      lmSolid(wd, x0 + 4, y0 + 4, 3, 3);
      for (const [dx, dy] of [[1, 1], [9, 1], [1, 9], [9, 9]]) lmSolid(wd, x0 + dx, y0 + dy, 1, 1);
      return { kind: 'prang', x: x0, y: y0, w: 11, h: 11, rally: { tx: x0 + 5, ty: y0 + 8 }, cx: x0 + 5.5, cy: y0 + 5.5,
        minis: [[1, 1], [9, 1], [1, 9], [9, 9]].map(([dx, dy]) => [x0 + dx + 0.5, y0 + dy + 0.5]) };
    }
  },
  /* 방콕 — 대로 교차로의 로터리와 가운데 기념탑(네 날개) */
  democracy: {
    name: '민주기념탑', junction: true, w: 8, h: 8,
    stamp(wd, v, h) {
      const x0 = v.p - 2, y0 = h.p - 2, n = v.w + 4, m = h.w + 4;
      for (let y = y0; y < y0 + m; y++) for (let x = x0; x < x0 + n; x++) {
        if (!wd.inside(x, y)) continue;
        wd.set(x, y, T_ROAD);
        const i = y * wd.w + x;
        wd.deco[i] = D_ASPHALT; wd.dirm[i] = 3; wd.cross[i] = 0; wd.mark[i] = 0;
      }
      const cx = x0 + (n >> 1) - 1, cy = y0 + (m >> 1) - 1;
      lmSolid(wd, cx, cy, 2, 2);
      return { kind: 'monument', x: x0, y: y0, w: n, h: m, cx: cx + 1, cy: cy + 1, rally: { tx: cx - 1, ty: cy + 1 } };   // 탑 바로 옆 둘레길
    }
  },
  /* 방콕 — 줄지어 선 노점과 머리 위 전구 줄. 통로가 격자로 난다 */
  nightmarket: {
    name: '야시장', w: 9, h: 9, ground: D_PLAZA,
    stamp(wd, x0, y0) {
      const stalls = [];
      for (let y = y0 + 1; y <= y0 + 7; y += 2) for (let x = x0 + 1; x <= x0 + 7; x += 2) {
        if (x === x0 + 3 && y === y0 + 3) continue;                     // 가운데 공터
        lmSolid(wd, x, y, 1, 1); stalls.push([x, y]);
      }
      return { kind: 'market', x: x0, y: y0, w: 9, h: 9, rally: { tx: x0 + 4, ty: y0 + 4 }, stalls };
    }
  },
  /* ── 원작 트레일러에 나오는 장소들 — 어느 도시에나 놓인다 ── */
  /* 대피 검문소 — 모래주머니 담 · 조립식 막사 · 버려진 군용차 · 꺼지지 않은 투광등. 남쪽 가운데가 출입구 */
  checkpoint: {
    name: '대피 검문소', w: 11, h: 9, ground: D_ASPHALT,
    stamp(wd, x0, y0, rng) {
      const bags = [];
      const bag = (x, y) => { lmSolid(wd, x, y, 1, 1); bags.push([x, y]); };
      for (let x = 0; x <= 10; x++) bag(x0 + x, y0);
      for (let y = 1; y <= 8; y++) { bag(x0, y0 + y); bag(x0 + 10, y0 + y); }
      for (const x of [1, 2, 3, 7, 8, 9]) bag(x0 + x, y0 + 8);                       // 가운데 세 칸이 출입구
      const cabins = [[x0 + 2, y0 + 1], [x0 + 7, y0 + 1]];
      for (const [x, y] of cabins) lmSolid(wd, x, y, 2, 1);
      lmSolid(wd, x0 + 5, y0 + 1, 1, 1);                                            // 투광등 기둥
      lmSolid(wd, x0 + 7, y0 + 3, 2, 1);                                            // 천막
      lmProp(wd, 'humvee', [[x0 + 2, y0 + 4]], { col: '#5b5a3c', w: 42, h: 24, a: Math.PI / 2 + (rng() - 0.5) * 0.3 });
      lmProp(wd, 'humvee', [[x0 + 8, y0 + 6]], { col: '#8a7a5a', w: 42, h: 24, a: (rng() - 0.5) * 0.3 });
      for (const x of [3, 7]) lmSolid(wd, x0 + x, y0 + 7, 1, 1);                     // 출입구 앞 콘크리트 방벽
      // 그릴 때는 이어진 담을 한 덩어리로 (칸마다 그리면 34번 — 보스전 화면에서 프레임을 깎았다)
      const runs = [[x0, y0, 11, 1], [x0, y0 + 1, 1, 8], [x0 + 10, y0 + 1, 1, 8], [x0 + 1, y0 + 8, 3, 1], [x0 + 7, y0 + 8, 3, 1]];
      return { kind: 'checkpoint', x: x0, y: y0, w: 11, h: 9, rally: { tx: x0 + 5, ty: y0 + 5 }, bags, runs, cabins,
        tent: { x: x0 + 7, y: y0 + 3 }, pole: [x0 + 5.5, y0 + 1.5], blocks: [[x0 + 3, y0 + 7], [x0 + 7, y0 + 7]] };
    }
  },
  /* 화물 철로 — 블록을 가로지르는 두 가닥 선로와 멈춰 선 화차, 붉은 신호등 */
  railyard: {
    name: '화물 철로', w: 13, h: 9, ground: D_ASPHALT,
    stamp(wd, x0, y0, rng) {
      const cols = ['#6a3a2a', '#3a4a5a', '#5a4a2a', '#4a3a3a'];
      const wag = (x, y, n) => lmProp(wd, 'wagon', Array.from({ length: n }, (_, i) => [x + i, y]), { col: cols[(rng() * cols.length) | 0], w: n * TILE - 10, h: 34 });
      wag(x0 + 1, y0 + 2, 3); wag(x0 + 8, y0 + 2, 3); wag(x0 + 4, y0 + 6, 3);
      lmSolid(wd, x0 + 12, y0 + 0, 1, 1);                                          // 신호기
      return { kind: 'railyard', x: x0, y: y0, w: 13, h: 9, rally: { tx: x0 + 6, ty: y0 + 4 }, tracks: [y0 + 2, y0 + 6], signal: [x0 + 12.5, y0 + 0.5] };
    }
  },
  /* 주유소 — 지붕 아래 주유기 넷, 매점, 가격 간판 */
  gasstation: {
    name: '주유소', w: 9, h: 9, ground: D_ASPHALT,
    stamp(wd, x0, y0) {
      lmSolid(wd, x0 + 5, y0 + 1, 3, 2);                                          // 매점
      const pumps = [[x0 + 2, y0 + 4], [x0 + 2, y0 + 6], [x0 + 5, y0 + 4], [x0 + 5, y0 + 6]];
      for (const [x, y] of pumps) lmSolid(wd, x, y, 1, 1);
      lmSolid(wd, x0 + 8, y0 + 8, 1, 1);                                          // 간판 기둥
      return { kind: 'gas', x: x0, y: y0, w: 9, h: 9, rally: { tx: x0 + 4, ty: y0 + 5 }, shop: { x: x0 + 5, y: y0 + 1, w: 3, h: 2 }, pumps,
        canopy: { x: x0 + 1, y: y0 + 3, w: 6, h: 5 }, sign: [x0 + 8.5, y0 + 8.5] };
    }
  },
  /* 싱가포르 — 지붕 덮인 노천 식당가. 가장자리에 노점이 늘어서고 가운데에 둥근 탁자.
     이름은 일반 명사로 둔다 — 특정 시설을 본뜨지 않았다 */
  hawker: {
    name: '호커 센터', w: 11, h: 9, ground: D_PLAZA,
    stamp(wd, x0, y0) {
      const stalls = [], tables = [];
      for (let x = x0 + 1; x <= x0 + 9; x++) if (x !== x0 + 5) { lmSolid(wd, x, y0, 1, 1); stalls.push([x, y0]); }  // 북쪽 노점 줄 (가운데는 뒷문)
      for (let y = y0 + 3; y <= y0 + 7; y += 2) for (let x = x0 + 2; x <= x0 + 8; x += 3) { lmSolid(wd, x, y, 1, 1); tables.push([x, y]); }
      return { kind: 'hawker', x: x0, y: y0, w: 11, h: 9, rally: { tx: x0 + 5, ty: y0 + 4 }, stalls, tables };   // 탁자 줄 사이
    }
  },
  /* 싱가포르 — 넝쿨을 두른 강철 나무 기둥들. 꼭대기에 넓은 우산 같은 갓이 있다 */
  supertree: {
    name: '수직 정원', w: 11, h: 11, ground: D_GRASS,
    stamp(wd, x0, y0, rng) {
      const trees = [[2, 2, 0.95], [8, 3, 0.8], [5, 6, 1.1], [2, 8, 0.7], [8, 8, 0.85]];
      for (const [dx, dy] of trees) lmSolid(wd, x0 + dx, y0 + dy, 1, 1);
      for (let i = 0; i < 8; i++) {
        const x = x0 + 1 + Math.floor(rng() * 9), y = y0 + 1 + Math.floor(rng() * 9);
        if (trees.some(([dx, dy]) => Math.abs(x - x0 - dx) + Math.abs(y - y0 - dy) < 3)) continue;
        if (Math.abs(x - x0 - 5) + Math.abs(y - y0 - 9) < 2) continue;      // 집결 지점은 비워 둔다
        if (wd.at(x, y) === T_ROAD && wd.roadNeighbours(x, y) === 8) wd.tree(x, y, rng);
      }
      return { kind: 'grove', x: x0, y: y0, w: 11, h: 11, rally: { tx: x0 + 5, ty: y0 + 9 },
        trees: trees.map(([dx, dy, k]) => [x0 + dx + 0.5, y0 + dy + 0.5, k]) };
    }
  },
  /* 싱가포르 — 컨테이너 부두. 위쪽은 바다와 배, 아래는 컨테이너 더미와 크레인.
     배에 오르는 현문(가운데 다리 칸)이 집결지다 */
  port: {
    name: '항만', w: 13, h: 11, ground: D_ASPHALT,
    stamp(wd, x0, y0) {
      wd.fill(x0, y0, 13, 4, T_WATER);                         // 바다
      lmSolid(wd, x0 + 1, y0, 11, 3);                          // 배 (선체)
      wd.fill(x0 + 6, y0 + 3, 1, 1, T_ROAD, D_BRIDGE);         // 현문
      const boxes = [[1, 6, 2], [1, 8, 2], [4, 9, 2], [9, 6, 2], [10, 8, 2], [7, 9, 1]];
      for (const [dx, dy, n] of boxes) lmSolid(wd, x0 + dx, y0 + dy, n, 1);
      for (const dx of [3, 9]) { lmSolid(wd, x0 + dx, y0 + 4, 1, 1); lmSolid(wd, x0 + dx + 1, y0 + 4, 1, 1); }   // 크레인 다리
      return { kind: 'port', x: x0, y: y0, w: 13, h: 11, rally: { tx: x0 + 6, ty: y0 + 3 },
        hull: { x: x0 + 1, y: y0, w: 11, h: 3 }, boxes: boxes.map(([dx, dy, n]) => [x0 + dx, y0 + dy, n]), cranes: [x0 + 3, x0 + 9] };
    }
  }
};
