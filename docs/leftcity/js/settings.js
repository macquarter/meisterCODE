/* ═══════════════════════════════════════════
   LEFT CITY — 남겨진 도시 : 설정 · 난이도
   localStorage 에 저장되며 audio/entities/game 보다 먼저 로드된다.
   ═══════════════════════════════════════════ */

/* 저장소가 막힌 곳(쿠키 차단 · 샌드박스 iframe)에서는 localStorage 를 읽기만 해도 예외가 난다.
   그때는 메모리 저장소로 바꿔 끼워 게임이 멈추지 않게 한다 — 기록은 탭을 닫으면 사라진다 */
(() => {
  let ok = false;
  try { const s = window.localStorage; s.setItem('aftermath.probe', '1'); s.removeItem('aftermath.probe'); ok = true; } catch (e) { /* 막힘 */ }
  if (ok) return;
  const m = new Map();
  const mem = {
    getItem: k => (m.has(String(k)) ? m.get(String(k)) : null),
    setItem: (k, v) => { m.set(String(k), String(v)); },
    removeItem: k => { m.delete(String(k)); },
    clear: () => m.clear(),
    key: i => [...m.keys()][i] ?? null,
    get length() { return m.size; }
  };
  try { Object.defineProperty(window, 'localStorage', { value: mem, configurable: true }); } catch (e) { /* 바꿀 수 없음 */ }
})();

/** 제품 정보 — 이름 · 판. 출시 이름이 정해지면 여기와 index.html · manifest 를 함께 바꾼다 */
const APP = { name: 'LEFT CITY', subtitle: '남겨진 도시', version: '1.0.0-rc.46' };
const APP_VERSION = APP.version;

/** 난이도 배수. 1 = 기준값(잔존) */
const DIFFICULTY = {
  easy:   { key: 'easy',   name: '생존자', note: '여유 있게 도시를 둘러본다 — 쉬면 체력이 돌아온다',
            hp: 0.78, dmg: 0.68, spawn: 0.78, max: 0.8, battery: 0.8, loot: 1.35, score: 0.8 },
  normal: { key: 'normal', name: '잔존',   note: '설계된 그대로의 난이도',
            hp: 1,    dmg: 1,    spawn: 1,    max: 1,   battery: 1,   loot: 1,    score: 1 },
  hard:   { key: 'hard',   name: '절멸',   note: '물리면 독이 돌고, 쓰러진 것이 다시 일어나고, 체크포인트는 한 번뿐',
            hp: 1.32, dmg: 1.45, spawn: 1.34, max: 1.3, battery: 1.25, loot: 0.68, score: 1.35 },
  // 돌파 — 가장 높은 단계. 하나하나는 약하지만 끝없이 몰려온다. 숨 고를 틈 없이 총을 쥐고 뚫고 나간다(탄 · 보급은 넉넉하다)
  rush:   { key: 'rush',   name: '돌파',   note: '쉴 틈 없이 몰려오는 무리를 뚫고 간다 — 탄은 넉넉하다',
            hp: 0.6,  dmg: 1.2,  spawn: 3.2,  max: 2.5, battery: 1,    loot: 2.4,  score: 2.2, rush: true, cap: 90 }
};

/* 규칙 (rc.38) — 난이도는 배수(mod)만이 아니라 '게임의 규칙'이 달라진다. 단계마다 기본 규칙이 있고, 하나씩 바꾸면 '사용자 지정'.
   dens  거리 밀도 1 적당 · 2 많음 · 3 가득 — 길에 서 있는 것의 수(이야기 판)
   sense 감각 0 둔함 · 1 보통 · 2 예민 — 소리 · 불빛에 깨는 거리와 빠르기, 줄줄이 깨는 범위
   bite  감염 — 물리면 독이 돌아 체력이 서서히 빠진다. 구급킷으로만 낫는다
   rise  되살아남 — 쓰러진 것 일부가 몇 초 뒤 다시 일어난다. 밀쳐 짓밟거나 폭발 · 불로 끝낸다
   mag   탄창 버림 — 장전하면 탄창에 남은 탄을 버린다(세어 가며 쏴야 한다)
   regen 숨 고르기 — 5초 맞지 않으면 체력이 60% 까지 차오른다
   aids  보조 표시 — 피격 방향 · 무리 예고 · 비명 고리
   cp    체크포인트 0 없음 · 1 장마다 한 번(다시 하면 쓴 소모품은 돌아오지 않는다) · 2 켬 */
const RULE_DEF = { dens: [1, 2, 3], sense: [0, 1, 2], bite: [false, true], rise: [false, true], mag: [false, true], regen: [false, true], aids: [false, true], cp: [0, 1, 2] };
const RULE_PRESET = {
  easy:   { dens: 1, sense: 0, bite: false, rise: false, mag: false, regen: true,  aids: true,  cp: 2, assist: 1 },
  normal: { dens: 2, sense: 1, bite: false, rise: false, mag: false, regen: false, aids: true,  cp: 2, assist: 0.8 },
  hard:   { dens: 3, sense: 2, bite: true,  rise: true,  mag: true,  regen: false, aids: false, cp: 1, assist: 0.45 },
  rush:   { dens: 2, sense: 1, bite: false, rise: false, mag: false, regen: false, aids: true,  cp: 0, assist: 0.6 }
};

const AIM_MODES = ['auto', 'stick', 'turn', 'drag'];
const DESK_AIMS = ['mouse', 'auto'];
const QUALITY_MODES = ['auto', 'high', 'low'];
const TOUCH_SIZES = ['small', 'normal', 'large'];
const CAM_MODES = ['near', 'mid', 'far'];

const SETTINGS = (() => {
  const KEY = 'aftermath.settings';
  const DEF = {
    volume: 55,            // 0‒100
    brightness: 35,        // 0‒100 (rc.45 추천 35), 밤의 어둠 농도 (원작 1.1 업데이트의 밝기 조절)
    difficulty: 'normal',
    flash: true,           // 피격 섬광 · 번개 · 총구 화염
    shake: true,           // 화면 흔들림
    autofire: true,        // 불빛 안의 적 자동 사격
    aim: 'auto',           // 터치 조준: auto = 자동 조준(가까운 적 · 이동 방향, 오른쪽을 끌면 직접) · stick = 조준 스틱
                           //            turn = 회전 스틱(원작) · drag = 화면 드래그(원작 1.1)
    deskAim: 'mouse',      // 데스크톱 손전등: mouse = 마우스 · auto = 자동 조준
    ctlv: 2,               // 조작 설정 판 — 1 은 회전 스틱이 기본이던 시절
    hints: true,           // 처음 마주치는 조작·적에 대한 한 줄 도움말
    music: true,           // 긴장도에 따라 변하는 음악
    quality: 'auto',       // 그리기 해상도: auto = 프레임에 맞춰 스스로 낮추고 올린다 · high · low
    fps: false,            // 화면 구석에 FPS · 해상도 표시
    touchSize: 'normal',   // 터치 버튼 · 스틱 크기
    haptics: true,         // 맞거나 폭발이 가까우면 짧게 진동 (지원 기기)
    edgeSprint: true,      // 터치: 이동 스틱을 끝까지 밀면 저절로 질주(질주 버튼 없이)
    autoShove: true,       // 터치: 감염체에게 붙잡히면 저절로 밀쳐 낸다(쿨다운마다 한 번)
    tapShove: true,        // 터치: 오른쪽 화면(조준 쪽)을 두 번 빠르게 톡톡 치면 밀치기
    aspect: 'fill',        // 화면 비율: fill = 창을 꽉 채운다(어떤 비율이든) · wide = 16:9 띠(레터박스)
    speed: 3,              // 게임 속도 1 · 2 · 3배 — 3 이 rc.21 까지의 빠르기(처음 정한 균형). 낮추면 모든 것이 그만큼 느리게
    contrast: 80,          // 화면 대비 30‒100: 80 = 기본(필터 없음). 100 = 1.25배 · 30 = 0.38배
    view3d: 60,            // (rc.45 추천 60) 3D 시점 거리 0‒100: 100 = 가장 멀리(rc.16 의 크기) · 0 = 아주 가까이(인물이 약 2.7배). 추천 80 — 가로 화면에서 손전등 끝이 화면 끝에 닿는다
    tlayout: '',           // 터치 버튼 배치(JSON) — { L: 가로 화면, P: 세로 화면 } 각각 { 버튼: [x, y] } 화면 비율 좌표. 빈 값 = 기본
    cam: 'near',           // 카메라 거리: near = 가까이(원작 예고편 거리) · mid · far = 멀리(예전 거리)
    lang: 'auto'           // auto = 브라우저 언어(한국어면 한국어, 아니면 영어) · ko · en
  };

  const state = Object.assign({}, DEF);
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    for (const k in DEF) if (k in raw && typeof raw[k] === typeof DEF[k]) state[k] = raw[k];
    // 판 표시가 없는 저장값은 예전 판(1)이다. 저장값이 아예 없으면 새 판
    if (!('ctlv' in raw) && Object.keys(raw).length) state.ctlv = 1;
  } catch (e) { /* 손상된 저장값은 기본값으로 */ }
  if (!DIFFICULTY[state.difficulty]) state.difficulty = DEF.difficulty;
  if (!AIM_MODES.includes(state.aim)) state.aim = DEF.aim;
  if (!DESK_AIMS.includes(state.deskAim)) state.deskAim = DEF.deskAim;
  // 예전 기본값(회전 스틱)을 그대로 쓰던 사람은 새 기본값(자동 조준)으로 — 어렵다는 피드백
  let migrated = false;
  if ((state.ctlv | 0) < 2) { if (state.aim === 'turn') state.aim = 'auto'; state.ctlv = 2; migrated = true; }
  if (!QUALITY_MODES.includes(state.quality)) state.quality = DEF.quality;
  if (!TOUCH_SIZES.includes(state.touchSize)) state.touchSize = DEF.touchSize;
  if (!['auto', 'ko', 'en'].includes(state.lang)) state.lang = DEF.lang;
  if (!CAM_MODES.includes(state.cam)) state.cam = DEF.cam;
  if (!['fill', 'wide'].includes(state.aspect)) state.aspect = DEF.aspect;
  // rc.17‒18 의 두 단계 시점(near · far) → 연속 값. 가깝게는 예전과 같은 거리(44)로
  try { const raw = JSON.parse(localStorage.getItem(KEY) || '{}'); if (raw.cam3d === 'near' && !('view3d' in raw)) state.view3d = 44; } catch (e) { /* 무시 */ }
  state.view3d = Math.max(0, Math.min(100, Math.round(+state.view3d) || 0));
  state.speed = Math.max(1, Math.min(3, Math.round(+state.speed) || 3));
  state.volume = Math.max(0, Math.min(100, state.volume | 0));
  state.brightness = Math.max(0, Math.min(100, state.brightness | 0));

  const listeners = [];
  if (migrated) try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 사생활 보호 모드 */ }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 사생활 보호 모드 */ }
  }

  return {
    get volume()     { return state.volume; },
    get brightness() { return state.brightness; },
    get difficulty() { return state.difficulty; },
    get flash()      { return state.flash; },
    get shake()      { return state.shake; },
    get autofire()   { return state.autofire; },
    get hints()      { return state.hints; },
    get aim()        { return state.aim; },
    get deskAim()    { return state.deskAim; },
    get music()      { return state.music; },
    get quality()    { return state.quality; },
    get fps()        { return state.fps; },
    get touchSize()  { return state.touchSize; },
    get haptics()    { return state.haptics; },
    get lang()       { return state.lang; },
    get cam()        { return state.cam; },
    /** 현재 난이도의 배수 묶음 */
    get mod()        { return DIFFICULTY[state.difficulty]; },
    /** 지금 규칙 — 난이도가 정한다(rc.40: 규칙을 하나씩 고르는 판은 뺐다 — 고를 것이 너무 많으면 헷갈린다) */
    get rules() { return Object.assign({}, RULE_PRESET[state.difficulty] || RULE_PRESET.normal); },

    get(k) { return state[k]; },
    set(k, v) {
      if (!(k in DEF)) return;
      if (k === 'volume' || k === 'brightness') v = Math.max(0, Math.min(100, v | 0));
      if (k === 'difficulty' && !DIFFICULTY[v]) return;
      if (k === 'aim' && !AIM_MODES.includes(v)) return;
      if (k === 'deskAim' && !DESK_AIMS.includes(v)) return;
      if (k === 'quality' && !QUALITY_MODES.includes(v)) return;
      if (k === 'touchSize' && !TOUCH_SIZES.includes(v)) return;
      if (k === 'lang' && !['auto', 'ko', 'en'].includes(v)) return;
      if (k === 'cam' && !CAM_MODES.includes(v)) return;
      if (k === 'view3d') v = Math.max(0, Math.min(100, Math.round(+v) || 0));
      if (k === 'contrast') v = Math.max(30, Math.min(100, Math.round(+v) || 80));
      if (k === 'speed') v = Math.max(1, Math.min(3, Math.round(+v) || 3));
      if (k === 'aspect' && !['fill', 'wide'].includes(v)) return;
      if (typeof DEF[k] === 'boolean') v = !!v;
      if (state[k] === v) return;
      state[k] = v; save();
      for (const fn of listeners) fn(k, v);
    },
    toggle(k) { if (typeof DEF[k] === 'boolean') this.set(k, !state[k]); },
    onChange(fn) { listeners.push(fn); },
    all() { return Object.assign({}, state); },
    reset() { Object.assign(state, DEF); save(); for (const fn of listeners) fn(null, null); }
  };
})();

/* ═══════════ 키 설정 ═══════════
   행동마다 키 하나. 같은 키를 다른 행동에 주면 두 행동의 키를 맞바꾼다(어느 것도 빈손이 되지 않게).
   방향키(이동) · 오른쪽 Shift(질주) · 우클릭(밀치기)은 고정 보조 키로 늘 함께 동작하고,
   Esc 는 일시정지 · 취소에 묶여 바꿀 수 없다. 마우스 가운데·옆 버튼(Mouse1, Mouse3, Mouse4)도 줄 수 있다. */
const KEYBIND = (() => {
  const KEY = 'aftermath.keys';
  const ACTIONS = [
    { id: 'up',     name: '앞으로',          def: 'KeyW',   hold: true },
    { id: 'down',   name: '뒤로',            def: 'KeyS',   hold: true },
    { id: 'left',   name: '왼쪽',            def: 'KeyA',   hold: true },
    { id: 'right',  name: '오른쪽',          def: 'KeyD',   hold: true },
    { id: 'sprint', name: '질주',            def: 'ShiftLeft', hold: true },
    { id: 'fire',   name: '사격',            def: 'Space',  hold: true },
    { id: 'reload', name: '재장전',          def: 'KeyR' },
    { id: 'melee',  name: '밀치기',          def: 'KeyE' },
    { id: 'dodge',  name: '회피',            def: 'KeyC' },
    { id: 'nade',   name: '수류탄',          def: 'KeyG' },
    { id: 'light',  name: '손전등 켜고 끄기', def: 'KeyF' },
    { id: 'arms',   name: '무기 고르기',      def: 'Tab' },
    { id: 'cycle',  name: '다음 무기',        def: 'KeyQ' },
    { id: 'w1',     name: '권총',            def: 'Digit1' },
    { id: 'w2',     name: 'SMG',             def: 'Digit2' },
    { id: 'w3',     name: '샷건',            def: 'Digit3' },
    { id: 'w4',     name: '소총',            def: 'Digit4' },
    { id: 'w5',     name: '매그넘',          def: 'Digit5' },
    { id: 'w6',     name: '자동 샷건',        def: 'Digit6' },
    { id: 'w7',     name: '경기관총',         def: 'Digit7' },
    { id: 'w8',     name: '석궁',            def: 'Digit8' },
    { id: 'w9',     name: '화염방사기',       def: 'Digit9' },
    { id: 'w10',    name: '유탄 발사기',      def: 'Digit0' },
    { id: 'w11',    name: '레일건',          def: 'Minus' },
    { id: 'w12',    name: '미니건',          def: 'Equal' },
    { id: 'map',    name: '전체 지도',        def: 'KeyM' }
  ];
  const FIXED = { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
                  sprint: ['ShiftRight'], melee: ['Mouse2'] };
  const RESERVED = new Set(['Escape', 'Mouse0']);
  const byId = Object.fromEntries(ACTIONS.map(a => [a.id, a]));
  const map = {};
  for (const a of ACTIONS) map[a.id] = a.def;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
    for (const id in raw) if (byId[id] && typeof raw[id] === 'string' && !RESERVED.has(raw[id])) map[id] = raw[id];
  } catch (e) { /* 손상된 저장값은 기본값으로 */ }
  // 저장값끼리 겹치면(예전 버전) 뒤엣것을 기본값으로 되돌린다
  const used = new Set();
  for (const a of ACTIONS) { if (used.has(map[a.id])) map[a.id] = a.def; used.add(map[a.id]); }

  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(map)); } catch (e) { /* 저장 불가여도 진행 */ } };
  const listeners = [];
  const emit = () => { for (const fn of listeners) fn(); };

  const NAMES = { Space: 'Space', Tab: 'Tab', Enter: 'Enter', Backspace: '⌫', CapsLock: 'Caps',
    ShiftLeft: 'Shift', ShiftRight: '오른쪽 Shift', ControlLeft: 'Ctrl', ControlRight: '오른쪽 Ctrl',
    AltLeft: 'Alt', AltRight: '오른쪽 Alt', MetaLeft: '⌘', MetaRight: '⌘',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
    Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
    Mouse1: '휠 클릭', Mouse2: '우클릭', Mouse3: '마우스 뒤로', Mouse4: '마우스 앞으로' };
  /** 사람이 읽는 키 이름 */
  function label(code) {
    if (!code) return '—';
    if (NAMES[code]) return typeof T === 'function' ? T(NAMES[code]) : NAMES[code];
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Numpad')) return (typeof T === 'function' ? T('숫자패드 ') : '숫자패드 ') + code.slice(6);
    return code;
  }

  return {
    ACTIONS,
    /** 행동에 묶인 주 키 */
    code(id) { return map[id]; },
    /** 이 키(또는 마우스 버튼)가 맡은 행동 — 주 키가 먼저, 없으면 고정 보조 키 */
    action(code) {
      for (const a of ACTIONS) if (map[a.id] === code) return a.id;
      for (const id in FIXED) if (FIXED[id].includes(code)) return id;
      return null;
    },
    /** 누르고 있는가 (held: 눌린 키 집합) */
    held(id, held) {
      if (held[map[id]]) return true;
      const f = FIXED[id];
      return !!f && f.some(c => held[c]);
    },
    isHold(id) { return !!(byId[id] && byId[id].hold); },
    reserved(code) { return RESERVED.has(code); },
    /** 다시 묶기. 이미 다른 행동이 쓰던 키면 그 행동과 맞바꾸고, 바뀐 행동 id 를 돌려준다 */
    set(id, code) {
      if (!byId[id] || !code || RESERVED.has(code)) return null;
      const old = map[id];
      let swapped = null;
      for (const a of ACTIONS) if (a.id !== id && map[a.id] === code) { map[a.id] = old; swapped = a.id; }
      map[id] = code;
      save(); emit();
      return swapped;
    },
    reset() { for (const a of ACTIONS) map[a.id] = a.def; save(); emit(); },
    isDefault() { return ACTIONS.every(a => map[a.id] === a.def); },
    label,
    /** 행동의 키 이름 (보조 키 포함 표기용) */
    labelOf(id) { return label(map[id]); },
    nameOf(id) { return byId[id] ? (typeof T === 'function' ? T(byId[id].name) : byId[id].name) : id; },
    onChange(fn) { listeners.push(fn); }
  };
})();
