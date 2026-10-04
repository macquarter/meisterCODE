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
    walls: [['#5a2f26', 1], ['#4c3024', 1], ['#46423c', 0], ['#3a3d40', 0], ['#5b5446', 0], ['#61372b', 1]],
    roofs: ['#1b2129', '#181d24', '#1f252d', '#22262b'],
    streetDecor: ['parasol', 'bin']
  },
  tokyo: {
    key: 'tokyo', name: '도쿄', river: '스미다강',
    signs: ['ラーメン', '薬局', '居酒屋', 'カラオケ', 'コンビニ', '寿司', '喫茶', '本屋', '焼肉', '駐車場', '交番', 'ホテル'],
    signCols: ['#ff5252', '#ffeb3b', '#40c4ff', '#69f0ae', '#ff80ab', '#ffffff'],
    carCols: ['#1d1f24', '#c9ccd1', '#3b4a5c', '#7a1f1f', '#d8d2c4', '#2d3a2e'],    // 검은 택시
    busCol: '#c8d3db', small: null,
    walls: [['#57534a', 0], ['#4a4c4e', 0], ['#3d4044', 0], ['#5e3a2e', 1], ['#625c50', 0], ['#454038', 0]],
    roofs: ['#1c1f26', '#1a1d23', '#20232b', '#191b20'],
    streetDecor: ['vending', 'vending', 'bike', 'bin']
  },
  bangkok: {
    key: 'bangkok', name: '방콕', river: '짜오프라야강',
    signs: ['ตลาด', 'ร้านอาหาร', 'โรงแรม', 'ร้านยา', 'นวด', 'กาแฟ', 'ข้าวมันไก่', 'ก๋วยเตี๋ยว', 'ทอง', 'ธนาคาร'],
    signCols: ['#ffca28', '#ff7043', '#26c6da', '#ec407a', '#9ccc65', '#ffffff'],
    carCols: ['#e85d75', '#3e8e41', '#d9c13b', '#2f4a63', '#c9ccd1', '#5a3e2b'],    // 분홍·초록 택시
    busCol: '#b5452d', small: 'tuktuk',
    walls: [['#5c5440', 0], ['#4e5a52', 0], ['#5a3c33', 1], ['#5e4a3c', 0], ['#4a4438', 0], ['#5b5e55', 0]],
    roofs: ['#211d1b', '#1d1b1a', '#24201c', '#1b1a19'],
    streetDecor: ['cart', 'shrine', 'bin']
  },
  singapore: {
    key: 'singapore', name: '싱가포르', river: '싱가포르강',
    signs: ['KOPITIAM', '药房', 'MAKAN', 'LAKSA', '24 HRS', 'CLINIC', 'MRT', '茶室', 'KEDAI', 'HOTEL', '海南鸡饭', 'TOTO'],
    signCols: ['#4dd0e1', '#ff8a65', '#ffee58', '#a5d6a7', '#f48fb1', '#ffffff'],
    carCols: ['#2f6fb5', '#c9ccd1', '#1d1f24', '#e2c13a', '#8b2b2b', '#3e8e41'],   // 파란 택시
    busCol: '#6b2f7a', small: null,
    walls: [['#5e5640', 0], ['#4b5a5e', 0], ['#5c3e3a', 0], ['#5a3328', 1], ['#545a4a', 0], ['#4e4652', 0]],
    roofs: ['#1c2125', '#1a1f22', '#20262a', '#1b2023'],
    streetDecor: ['parasol', 'bike', 'vending', 'bin']
  }
  ,
  /* 한강 하구의 군 대피 기지 — 대피를 지휘하던 곳. 붉은 벽돌 막사와 창고, 군용차가 도로를 메운다.
     군용차 · 컨테이너 · 철망은 이 챕터에만 둔다 (도시 챕터는 도시답게) */
  base: {
    key: 'base', name: '대피 기지', river: '한강 하구', military: true,
    signs: ['막사', '보급', '정비', '식당', 'PX', '의무대', '통신', '탄약고', '본부', '창고', '세탁', '대기소'],
    signCols: ['#c9b26a', '#9fb88a', '#d0d0c8', '#c98a5a', '#8ab0c0', '#e0d8b0'],
    carCols: ['#4a5236', '#5b5a3c', '#8a7a5a', '#3e4430', '#6a6a5a', '#c7c9cc'],
    busCol: '#4a5236', small: null,
    walls: [['#5a2f26', 1], ['#61372b', 1], ['#553026', 1], ['#4f4a3c', 0], ['#46423c', 0], ['#5b5446', 0]],
    roofs: ['#232620', '#1f221d', '#262920', '#1c1e1a'],
    streetDecor: ['bin']
  },
  /* ── 2부: 새벽호의 항해 — 지역마다 땅이 다르다(terrain) · 날씨가 다르다(weather) ── */
  /* 인도 바라나시 — 강가강의 가트(계단 강변), 좁은 골목의 파스텔 집들, 우기. 진흙탕이 발을 붙잡는다 */
  varanasi: {
    key: 'varanasi', street: 'dirt', name: '바라나시', river: '갠지스강', terrain: 'mud', weather: 'monsoon',
    signs: ['चाय', 'दवाखाना', 'होटल', 'मिठाई', 'किराना', 'दवा', 'भोजनालय', 'साड़ी', 'मोबाइल', 'बैंक', 'पान', 'ढाबा'],
    signCols: ['#ffca28', '#ff7043', '#26c6da', '#ec407a', '#66bb6a', '#ffffff'],
    carCols: ['#2e7d32', '#f2c21a', '#c9ccd1', '#3a3d42', '#8a2b2b', '#2f4a63'],     // 초록·노랑 오토릭샤 빛깔
    busCol: '#c0612b', small: 'tuktuk',
    walls: [['#6a4a6a', 0], ['#4a6a7a', 0], ['#7a5a3a', 0], ['#5a6a4a', 0], ['#7a4a3a', 1], ['#6a6250', 0]],
    roofs: ['#2a2420', '#26221e', '#2e2822', '#221e1a'],
    streetDecor: ['cart', 'shrine', 'bin', 'cart']
  },
  /* 이집트 카이로 — 나일강, 기자의 피라미드, 사암 건물. 모래가 길에 쌓이고 모래 폭풍이 불빛을 삼킨다 */
  cairo: {
    key: 'cairo', street: 'sand', name: '카이로', river: '나일강', terrain: 'sand', weather: 'sandstorm',
    signs: ['صيدلية', 'مطعم', 'قهوة', 'فندق', 'بنك', 'سوق', 'مخبز', 'كشري', 'عطارة', 'مكتبة'],
    signCols: ['#ffd54f', '#4fc3f7', '#ff8a65', '#81c784', '#ffffff', '#ce93d8'],
    carCols: ['#e0e0e0', '#2f2f2f', '#c9b48a', '#8a2b2b', '#3a5a7a', '#f2f2f2'],     // 흑백 택시
    busCol: '#c9a24a', small: 'tuktuk',
    walls: [['#7a6448', 0], ['#86704e', 0], ['#6e5a40', 0], ['#8a7452', 0], ['#7a5a3a', 1], ['#66563e', 0]],
    roofs: ['#3a3226', '#352e24', '#40372a', '#2f2a20'],
    streetDecor: ['cart', 'parasol', 'bin']
  },
  /* 튀르키예 이스탄불 — 보스포루스 해협, 돔과 첨탑, 언덕의 돌길. 비 온 뒤 진흙이 고인 골목과 바다 안개 */
  istanbul: {
    key: 'istanbul', street: 'stone', name: '이스탄불', river: '보스포루스', terrain: 'mud', weather: 'fog',
    signs: ['ECZANE', 'LOKANTA', 'KAHVE', 'OTEL', 'BANKA', 'BAKKAL', 'FIRIN', 'KEBAP', 'ÇAY', 'BALIK', 'BERBER', 'SİMİT'],
    signCols: ['#ffffff', '#e53935', '#ffd54f', '#4fc3f7', '#81c784', '#ffab91'],
    carCols: ['#f2c21a', '#c9ccd1', '#3a3d42', '#8a2b2b', '#2f4a63', '#e0e0e0'],     // 노란 택시
    busCol: '#c8201a', small: null,
    walls: [['#8a6a5a', 0], ['#a07a5a', 0], ['#6a5a6a', 0], ['#7a8a8a', 0], ['#8a4a3a', 1], ['#9a8a6a', 0]],
    roofs: ['#5a2e24', '#4e2a22', '#62342a', '#3e2620'],
    streetDecor: ['cart', 'bin', 'parasol']
  },
  /* 브라질 리우데자네이루 — 언덕 위의 구세주상, 파도 무늬 해변 산책로, 파스텔 집과 언덕의 동네. 모래가 길까지 밀려오고 열대 폭우가 쏟아진다 */
  rio: {
    key: 'rio', name: '리우데자네이루', river: null, terrain: 'sand', weather: 'monsoon',
    signs: ['FARMÁCIA', 'PADARIA', 'BAR', 'HOTEL', 'BANCO', 'AÇAÍ', 'LANCHONETE', 'CHURRASCO', 'MERCADO', 'SUCOS', 'PRAIA', 'BOTECO'],
    signCols: ['#ffeb3b', '#4caf50', '#29b6f6', '#ff7043', '#ffffff', '#f06292'],
    carCols: ['#f2c21a', '#e0e0e0', '#2f2f2f', '#2e7d32', '#1a5a9a', '#c9ccd1'],
    busCol: '#2a7ac0', small: null,
    walls: [['#c8806a', 0], ['#e0b860', 0], ['#5aa0a8', 0], ['#a8c070', 0], ['#d07050', 1], ['#e8d0a8', 0]],
    roofs: ['#8a4a30', '#7a4028', '#9a5a3a', '#6a3a26'],
    streetDecor: ['parasol', 'cart', 'bin']
  },
  /* 러시아 모스크바 — 눈 덮인 넓은 대로와 붉은 벽돌, 양파 돔. 얼어붙은 길이 미끄럽다.
     보드카에 절었던 목이 부어오른 자들 — 뱉는 것이 유난히 많다 */
  moscow: {
    key: 'moscow', street: 'snow', name: '모스크바', river: '모스크바강', terrain: 'ice', weather: 'snow',
    signs: ['АПТЕКА', 'ПРОДУКТЫ', 'КАФЕ', 'ГОСТИНИЦА', 'БАНК', 'МЕТРО', 'ВОДКА', 'ХЛЕБ', 'ПИВО', 'ТАБАК', 'РЕМОНТ', 'ПОЧТА'],
    signCols: ['#ffffff', '#e53935', '#ffd54f', '#4fc3f7', '#81c784', '#ff8a65'],
    carCols: ['#e0e0e0', '#3a3d42', '#8a2b2b', '#2f4a63', '#c9ccd1', '#4a5a3a'],
    busCol: '#e0b020', small: null,
    walls: [['#b0a090', 0], ['#c8b89a', 0], ['#8a5a4a', 1], ['#d8d0c0', 0], ['#9a4a3a', 1], ['#a8b0b8', 0]],
    roofs: ['#3a4a3a', '#2a3a4a', '#4a3a30', '#5a5a5a'],
    streetDecor: ['bin', 'cart', 'bin']
  },
  /* 케냐 나이로비 — 붉은 흙길, 미니버스(마타투)와 함석지붕 가게. 먼지 안개.
     생전에 달리던 자들 — 덮치는 것 · 들이받는 것 · 달리는 것이 많다 */
  nairobi: {
    key: 'nairobi', street: 'dirt', name: '나이로비', river: null, terrain: 'sand', weather: 'fog',
    signs: ['DUKA', 'HOTELI', 'M-PESA', 'CHEMIST', 'BUTCHERY', 'SALON', 'MATATU', 'CAFE', 'BANK', 'SODA', 'KIBANDA', 'MAMA MBOGA'],
    signCols: ['#ffeb3b', '#4caf50', '#e53935', '#29b6f6', '#ffffff', '#ff9800'],
    carCols: ['#e0e0e0', '#f2c21a', '#2e7d32', '#c62828', '#3a3d42', '#1a5a9a'],
    busCol: '#e8641a', small: null,
    walls: [['#c87a50', 0], ['#e0c080', 0], ['#7aa070', 0], ['#5a8ab0', 0], ['#b85a3a', 1], ['#d8d0c0', 0]],
    roofs: ['#8a8e92', '#7a6a5a', '#9a9ea2', '#6a5040'],
    streetDecor: ['cart', 'parasol', 'bin']
  },
  /* 특전 — 테라포밍한 화성. 건물은 드문드문한 거주 모듈뿐, 붉은 흙 벌판에 크고 작은 크레이터가 패였다.
     움푹한 바닥과 솟은 테두리 모두 발이 무겁다 — 저것들도 마찬가지 */
  mars: {
    key: 'mars', street: 'mars', name: '화성', river: null, terrain: 'crater', weather: 'fog', open: 0.85, noCars: false,
    signs: ['HAB-1', 'HAB-2', 'O₂', 'GREENHOUSE', 'MED', 'LAB', 'AIRLOCK', 'H₂O', 'REACTOR', 'DEPOT', 'COMMS', 'ROVER BAY'],
    signCols: ['#ffffff', '#ff8a50', '#80d8ff', '#b9f6ca', '#fff59d', '#ff8a80'],
    carCols: ['#e0e0e0', '#e8641a', '#c9ccd1', '#3a3d42', '#e8641a', '#d8d4cc'],     // 탐사 차량
    busCol: '#e8641a', small: null,
    walls: [['#d8d4cc', 0], ['#c9ccd1', 0], ['#e8641a', 0], ['#a8aeb4', 0], ['#e0e0e0', 0], ['#8a9098', 0]],
    roofs: ['#c8ccd0', '#b8bcc0', '#d0d4d8', '#aeb2b6'],
    streetDecor: ['bin']
  },
  /* 베네치아 — 대운하와 다리, 물에 잠긴 골목. 얕은 물이 모두의 발을 늦춘다 */
  venice: {
    key: 'venice', street: 'stone', canals: true, noCars: true, name: '베네치아', river: '대운하', terrain: 'flood', weather: 'fog',
    signs: ['FARMACIA', 'TRATTORIA', 'HOTEL', 'GELATERIA', 'BAR', 'PANIFICIO', 'VAPORETTO', 'OSTERIA', 'MASCHERE', 'BANCA'],
    signCols: ['#ffffff', '#ffcc80', '#80deea', '#f48fb1', '#c5e1a5', '#ffe082'],
    carCols: ['#7a2a24', '#c9ccd1', '#2f4a63', '#3a3d42', '#d8d2c4', '#5a6a4a'],
    busCol: '#2f6a8a', small: null,
    walls: [['#8a5a44', 0], ['#a0704e', 0], ['#7a4a3a', 0], ['#9a7a5a', 0], ['#6a3a30', 1], ['#8a6a5a', 0]],
    roofs: ['#3a2622', '#35231f', '#402a24', '#2f201c'],
    streetDecor: ['parasol', 'bin']
  },
  /* 아이슬란드 레이캬비크 — 함석 지붕의 알록달록한 집, 계단식 교회, 땅을 가르는 용암 균열과 김 */
  reykjavik: {
    key: 'reykjavik', street: 'snow', name: '레이캬비크', river: null, terrain: 'lava', weather: 'snow',
    signs: ['APÓTEK', 'KAFFI', 'HÓTEL', 'BAKARÍ', 'BANKI', 'BÚÐ', 'PÖBB', 'FISKUR', 'LAUG', 'BÓKABÚÐ'],
    signCols: ['#ffffff', '#80d8ff', '#ffab91', '#fff59d', '#b9f6ca', '#ff8a80'],
    carCols: ['#c9ccd1', '#3a3d42', '#2f4a63', '#7a2a24', '#e0e0e0', '#2d3a2e'],
    busCol: '#e0b83a', small: null,
    walls: [['#7a2a24', 0], ['#2a4a6a', 0], ['#c8b04a', 0], ['#4a6a4a', 0], ['#d8d4cc', 0], ['#3a3d42', 0]],
    roofs: ['#2a2e33', '#7a2a24', '#2a3a4a', '#33373c'],
    streetDecor: ['bin', 'bike']
  },
  /* 남극 연구 기지 — 기둥 위의 조립식 동, 레이더 돔, 연료 탱크. 얼음판은 미끄럽고 눈보라가 시야를 지운다 */
  antarctic: {
    key: 'antarctic', street: 'snow', name: '남극 기지', river: null, terrain: 'ice', weather: 'blizzard',
    signs: ['LAB', 'MESS', 'GARAGE', 'MED', 'COMMS', 'FUEL', 'DORM 1', 'DORM 2', 'STORES', 'WORKSHOP'],
    signCols: ['#ffffff', '#ff8a65', '#80d8ff', '#fff176', '#a5d6a7', '#ef9a9a'],
    carCols: ['#e8641a', '#c8201a', '#e0b83a', '#c9ccd1', '#2f4a63', '#e8641a'],     // 주황 · 빨강 설상차
    busCol: '#c8201a', small: null,
    walls: [['#c8201a', 0], ['#e8641a', 0], ['#3a5a7a', 0], ['#c9ccd1', 0], ['#e0b83a', 0], ['#5a6a7a', 0]],
    roofs: ['#c8ccd0', '#b8bcc0', '#d0d4d8', '#aeb2b6'],
    streetDecor: ['bin']
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
  /* 대피 기지 본영 — 철망 울타리 안에 겹겹이 쌓인 컨테이너, 조립식 막사, 헬기장, 군용차와 트럭.
     북쪽과 양옆은 철망(빛과 총알은 지나가고 사람은 못 지나간다), 남쪽 가운데가 정문. 집결지는 헬기장 */
  evacbase: {
    name: '대피 기지 본영', w: 13, h: 11, ground: D_ASPHALT,
    stamp(wd, x0, y0, rng) {
      const fence = (x, y, w, h) => wd.fill(x, y, w, h, T_WATER, D_LANDMARK);
      fence(x0, y0, 13, 1); fence(x0, y0 + 1, 1, 9); fence(x0 + 12, y0 + 1, 1, 9);
      // 컨테이너 — [x, y, 길이, 단 수]
      const boxes = [[1, 1, 2, 2], [1, 3, 2, 1], [10, 1, 2, 2], [10, 3, 2, 2], [4, 1, 2, 1]];
      for (const [dx, dy, n] of boxes) lmSolid(wd, x0 + dx, y0 + dy, n, 1);
      const cabins = [[x0 + 7, y0 + 1], [x0 + 1, y0 + 6]];
      for (const [x, y] of cabins) lmSolid(wd, x, y, 2, 1);
      lmSolid(wd, x0 + 11, y0 + 6, 1, 1);                                          // 투광등 기둥
      lmSolid(wd, x0 + 9, y0 + 8, 2, 1);                                           // 천막
      lmProp(wd, 'humvee', [[x0 + 3, y0 + 4]], { col: '#5b5a3c', w: 42, h: 24, a: (rng() - 0.5) * 0.3 });
      lmProp(wd, 'mtruck', [[x0 + 7, y0 + 3], [x0 + 8, y0 + 3]], { col: '#4a5236', w: 2 * TILE - 12, h: 30, a: (rng() - 0.5) * 0.12 });
      lmProp(wd, 'humvee', [[x0 + 10, y0 + 5]], { col: '#8a7a5a', w: 42, h: 24, a: Math.PI / 2 + (rng() - 0.5) * 0.3 });
      // 정문 양옆 모래주머니
      const runs = [[x0, y0 + 10, 4, 1], [x0 + 9, y0 + 10, 4, 1]];
      for (const [x, y, w] of runs) lmSolid(wd, x, y, w, 1);
      return { kind: 'base', x: x0, y: y0, w: 13, h: 11, rally: { tx: x0 + 6, ty: y0 + 7 },
        fence: [[x0, y0, 13, 1], [x0, y0 + 1, 1, 9], [x0 + 12, y0 + 1, 1, 9]],
        boxes: boxes.map(([dx, dy, n, k]) => [x0 + dx, y0 + dy, n, k]), cabins, runs, blocks: [],
        tent: { x: x0 + 9, y: y0 + 8 }, pole: [x0 + 11.5, y0 + 6.5], pad: [x0 + 6.5, y0 + 7.5] };
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
  /* ── 2부의 랜드마크 ── */
  /* 이집트 — 큰 피라미드 · 작은 피라미드 둘 · 스핑크스. 돌 사이 모래 마당이 집결지 */
  pyramids: {
    name: '기자의 피라미드', w: 13, h: 11, ground: D_PLAZA,
    stamp(wd, x0, y0) {
      lmSolid(wd, x0 + 1, y0 + 1, 5, 5); lmSolid(wd, x0 + 8, y0 + 1, 3, 3); lmSolid(wd, x0 + 11, y0 + 5, 1, 1);
      lmSolid(wd, x0 + 2, y0 + 8, 3, 1);                                            // 스핑크스
      return { kind: 'pyramids', x: x0, y: y0, w: 13, h: 11, rally: { tx: x0 + 7, ty: y0 + 7 },
        pyr: [[x0 + 1, y0 + 1, 5], [x0 + 8, y0 + 1, 3], [x0 + 11, y0 + 5, 1]], sphinx: { x: x0 + 2, y: y0 + 8 } };
    }
  },
  /* 카이로 — 돔과 두 첨탑(미나렛)의 사원, 분수가 있는 안마당 */
  mosque: {
    name: '사원', w: 11, h: 11, ground: D_PLAZA,
    stamp(wd, x0, y0) {
      lmSolid(wd, x0 + 2, y0 + 1, 7, 4);
      lmSolid(wd, x0 + 1, y0 + 1, 1, 1); lmSolid(wd, x0 + 9, y0 + 1, 1, 1);
      lmSolid(wd, x0 + 5, y0 + 8, 1, 1);                                            // 분수
      return { kind: 'mosque', x: x0, y: y0, w: 11, h: 11, rally: { tx: x0 + 3, ty: y0 + 8 },
        hall: { x: x0 + 2, y: y0 + 1, w: 7, h: 4 }, minarets: [[x0 + 1.5, y0 + 1.5], [x0 + 9.5, y0 + 1.5]], fountain: [x0 + 5.5, y0 + 8.5] };
    }
  },
  /* 인도 — 계단으로 둘러싼 사원 연못(쿤드)과 네 귀퉁이의 작은 사당 */
  kund: {
    name: '계단 연못', w: 11, h: 11, ground: D_PLAZA,
    stamp(wd, x0, y0) {
      wd.fill(x0 + 3, y0 + 3, 5, 5, T_WATER);
      for (const [dx, dy] of [[1, 1], [9, 1], [1, 9], [9, 9]]) lmSolid(wd, x0 + dx, y0 + dy, 1, 1);
      return { kind: 'kund', x: x0, y: y0, w: 11, h: 11, rally: { tx: x0 + 5, ty: y0 + 9 }, tank: { x: x0 + 3, y: y0 + 3, w: 5, h: 5 },
        shrines: [[1, 1], [9, 1], [1, 9], [9, 9]].map(([dx, dy]) => [x0 + dx + 0.5, y0 + dy + 0.5]) };
    }
  },
  /* 인도 — 옥수수 모양 첨탑(시카라)의 사원과 앞 회랑, 문 기둥 */
  mandir: {
    name: '시카라 사원', w: 9, h: 11, ground: D_PLAZA,
    stamp(wd, x0, y0) {
      lmSolid(wd, x0 + 3, y0 + 1, 3, 3); lmSolid(wd, x0 + 3, y0 + 4, 3, 2);
      lmSolid(wd, x0 + 2, y0 + 10, 1, 1); lmSolid(wd, x0 + 6, y0 + 10, 1, 1);
      return { kind: 'mandir', x: x0, y: y0, w: 9, h: 11, rally: { tx: x0 + 4, ty: y0 + 8 },
        sanctum: { x: x0 + 3, y: y0 + 1 }, hall: { x: x0 + 3, y: y0 + 4, w: 3, h: 2 }, gate: [[x0 + 2.5, y0 + 10.5], [x0 + 6.5, y0 + 10.5]] };
    }
  },
  /* 베네치아 — 돔 다섯의 대성당, 붉은 벽돌 종탑, 광장의 두 기둥 */
  piazza: {
    name: '산마르코 광장', w: 13, h: 11, ground: D_PLAZA,
    stamp(wd, x0, y0) {
      lmSolid(wd, x0 + 1, y0 + 1, 6, 4); lmSolid(wd, x0 + 9, y0 + 2, 2, 2);
      lmSolid(wd, x0 + 4, y0 + 9, 1, 1); lmSolid(wd, x0 + 8, y0 + 9, 1, 1);
      return { kind: 'piazza', x: x0, y: y0, w: 13, h: 11, rally: { tx: x0 + 6, ty: y0 + 7 },
        church: { x: x0 + 1, y: y0 + 1, w: 6, h: 4 }, tower: { x: x0 + 9, y: y0 + 2 }, cols: [[x0 + 4.5, y0 + 9.5], [x0 + 8.5, y0 + 9.5]] };
    }
  },
  /* 이스탄불 — 큰 돔과 반 돔, 네 귀퉁이의 가는 첨탑(아야 소피아). 앞마당이 집결지 */
  hagia: {
    name: '아야 소피아', w: 13, h: 11, ground: D_PLAZA,
    stamp(wd, x0, y0) {
      lmSolid(wd, x0 + 3, y0 + 1, 7, 5);
      for (const [dx, dy] of [[1, 1], [11, 1], [1, 6], [11, 6]]) lmSolid(wd, x0 + dx, y0 + dy, 1, 1);
      lmSolid(wd, x0 + 6, y0 + 9, 1, 1);                                            // 손 씻는 샘
      return { kind: 'hagia', x: x0, y: y0, w: 13, h: 11, rally: { tx: x0 + 4, ty: y0 + 8 },
        hall: { x: x0 + 3, y: y0 + 1, w: 7, h: 5 }, minarets: [[1, 1], [11, 1], [1, 6], [11, 6]].map(([dx, dy]) => [x0 + dx + 0.5, y0 + dy + 0.5]), fountain: [x0 + 6.5, y0 + 9.5] };
    }
  },
  /* 이스탄불 — 원뿔 지붕의 둥근 돌탑(갈라타 탑) */
  galata: {
    name: '갈라타 탑', w: 7, h: 7, ground: D_PLAZA,
    stamp(wd, x0, y0) {
      lmSolid(wd, x0 + 2, y0 + 1, 3, 3);
      return { kind: 'galata', x: x0, y: y0, w: 7, h: 7, rally: { tx: x0 + 3, ty: y0 + 5 }, tower: [x0 + 3.5, y0 + 2.5] };
    }
  },
  /* 리우 — 바위 언덕 위에 두 팔을 벌린 구세주상, 오르는 계단 */
  redeemer: {
    name: '구세주 그리스도상', w: 11, h: 11, ground: D_PLAZA,
    stamp(wd, x0, y0) {
      lmSolid(wd, x0 + 3, y0 + 1, 5, 5);
      return { kind: 'redeemer', x: x0, y: y0, w: 11, h: 11, rally: { tx: x0 + 5, ty: y0 + 8 }, hill: { x: x0 + 3, y: y0 + 1, w: 5, h: 5 }, statue: [x0 + 5.5, y0 + 3.5] };
    }
  },
  /* 리우 — 검고 흰 파도 무늬 돌길의 해변 산책로와 야자수 · 매점 */
  copacabana: {
    name: '코파카바나 산책로', w: 13, h: 7, ground: D_PLAZA,
    stamp(wd, x0, y0) {
      lmSolid(wd, x0 + 2, y0 + 1, 1, 1); lmSolid(wd, x0 + 10, y0 + 1, 1, 1);        // 매점
      return { kind: 'copacabana', x: x0, y: y0, w: 13, h: 7, rally: { tx: x0 + 6, ty: y0 + 4 }, kiosks: [[x0 + 2.5, y0 + 1.5], [x0 + 10.5, y0 + 1.5]],
        palms: [[x0 + 1, y0 + 5], [x0 + 4.5, y0 + 5.5], [x0 + 8.5, y0 + 5.5], [x0 + 12, y0 + 5]], walk: { x: x0, y: y0 + 2, w: 13, h: 3 } };
    }
  },
  /* 모스크바 — 성 바실리 대성당. 붉은 벽돌 몸채 위에 색색의 양파 돔 다섯 */
  basil: {
    name: '성 바실리 대성당', w: 9, h: 9, ground: D_PLAZA,
    stamp(wd, x0, y0) {
      lmSolid(wd, x0 + 2, y0 + 1, 5, 4);
      return { kind: 'basil', x: x0, y: y0, w: 9, h: 9, rally: { tx: x0 + 4, ty: y0 + 7 }, body: { x: x0 + 2, y: y0 + 1, w: 5, h: 4 },
        domes: [[x0 + 4.5, y0 + 3, 1.1, 0.62, '#c8302a'], [x0 + 2.8, y0 + 1.8, 0.7, 0.42, '#2a8a4a'], [x0 + 6.2, y0 + 1.8, 0.7, 0.44, '#e0b020'],
                [x0 + 2.8, y0 + 4.2, 0.7, 0.4, '#2a5aa0'], [x0 + 6.2, y0 + 4.2, 0.7, 0.42, '#d86a20']] };
    }
  },
  /* 나이로비 — 케냐타 국제회의장. 둥근 탑 꼭대기의 원반 전망대와 원뿔 지붕의 회의장 */
  kicc: {
    name: '케냐타 국제회의장', w: 9, h: 9, ground: D_PLAZA,
    stamp(wd, x0, y0) {
      lmSolid(wd, x0 + 4, y0 + 2, 2, 2); lmSolid(wd, x0 + 1, y0 + 5, 2, 2);
      return { kind: 'kicc', x: x0, y: y0, w: 9, h: 9, rally: { tx: x0 + 6, ty: y0 + 7 }, tower: [x0 + 5, y0 + 3], hall: [x0 + 2, y0 + 6] };
    }
  },
  /* 화성 — 유리 돔 온실(바이오돔). 안에는 테라포밍한 초록이 자란다 */
  biodome: {
    name: '바이오돔', w: 11, h: 11, ground: D_PLAZA,
    stamp(wd, x0, y0) {
      lmSolid(wd, x0 + 2, y0 + 1, 7, 6);
      return { kind: 'biodome', x: x0, y: y0, w: 11, h: 11, rally: { tx: x0 + 5, ty: y0 + 9 }, dome: { x: x0 + 2, y: y0 + 1, w: 7, h: 6 } };
    }
  },
  /* 화성 — 발사대에 선 귀환 로켓과 연료 탱크 */
  rocket: {
    name: '귀환 로켓', w: 9, h: 9, ground: D_ASPHALT,
    stamp(wd, x0, y0) {
      lmSolid(wd, x0 + 3, y0 + 2, 3, 3); lmSolid(wd, x0 + 7, y0 + 1, 1, 1);
      return { kind: 'rocket', x: x0, y: y0, w: 9, h: 9, rally: { tx: x0 + 4, ty: y0 + 7 }, pad: [x0 + 4.5, y0 + 3.5], tank: [x0 + 7.5, y0 + 1.5] };
    }
  },
  /* 레이캬비크 — 현무암 기둥을 닮은 계단식 콘크리트 교회와 그 앞 동상 */
  hallgrim: {
    name: '계단 교회', w: 11, h: 11, ground: D_PLAZA,
    stamp(wd, x0, y0) {
      lmSolid(wd, x0 + 3, y0 + 1, 5, 5);
      lmSolid(wd, x0 + 5, y0 + 9, 1, 1);
      return { kind: 'hallgrim', x: x0, y: y0, w: 11, h: 11, rally: { tx: x0 + 3, ty: y0 + 8 }, body: { x: x0 + 3, y: y0 + 1, w: 5, h: 5 }, statue: [x0 + 5.5, y0 + 9.5] };
    }
  },
  /* 아이슬란드 — 김이 오르는 온천 웅덩이와 주기적으로 솟는 간헐천 */
  geyser: {
    name: '간헐천 들판', w: 9, h: 9, ground: D_GRASS,
    stamp(wd, x0, y0) {
      wd.fill(x0 + 2, y0 + 2, 2, 2, T_WATER); wd.fill(x0 + 6, y0 + 5, 1, 1, T_WATER);
      lmSolid(wd, x0 + 6, y0 + 2, 1, 1);
      return { kind: 'geyser', x: x0, y: y0, w: 9, h: 9, rally: { tx: x0 + 4, ty: y0 + 7 }, vent: [x0 + 6.5, y0 + 2.5], pools: [[x0 + 3, y0 + 3], [x0 + 6.5, y0 + 5.5]] };
    }
  },
  /* 남극 — 기둥 위 조립식 연구동들, 레이더 돔, 연료 탱크. 가운데 헬기장이 집결지 */
  station: {
    name: '연구 기지', w: 13, h: 11, ground: D_ASPHALT,
    stamp(wd, x0, y0) {
      const mods = [[x0 + 1, y0 + 1, 4, 2], [x0 + 8, y0 + 1, 4, 2], [x0 + 1, y0 + 6, 3, 2]];
      for (const [x, y, w, h] of mods) lmSolid(wd, x, y, w, h);
      lmSolid(wd, x0 + 10, y0 + 6, 2, 2);
      for (const dx of [5, 7]) lmSolid(wd, x0 + dx, y0 + 9, 1, 1);
      return { kind: 'station', x: x0, y: y0, w: 13, h: 11, rally: { tx: x0 + 6, ty: y0 + 5 }, mods, dome: [x0 + 11, y0 + 7],
        tanks: [[x0 + 5.5, y0 + 9.5], [x0 + 7.5, y0 + 9.5]], pad: [x0 + 6.5, y0 + 5.5] };
    }
  },
  /* 남극 — 부두에 댄 붉은 쇄빙선. 항만과 같은 자리 잡기, 현문이 집결지 */
  icebreaker: {
    name: '쇄빙선 부두', w: 13, h: 11, ground: D_ASPHALT,
    stamp(wd, x0, y0) {
      const lm = LANDMARKS.port.stamp(wd, x0, y0);
      return Object.assign(lm, { ice: true });
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
