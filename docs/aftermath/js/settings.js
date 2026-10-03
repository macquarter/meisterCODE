/* ═══════════════════════════════════════════
   AFTERMATH — 잔존 : 설정 · 난이도
   localStorage 에 저장되며 audio/entities/game 보다 먼저 로드된다.
   ═══════════════════════════════════════════ */

/** 난이도 배수. 1 = 기준값(잔존) */
const DIFFICULTY = {
  easy:   { key: 'easy',   name: '생존자', note: '여유 있게 도시를 둘러본다',
            hp: 0.78, dmg: 0.68, spawn: 0.78, max: 0.8, battery: 0.8, loot: 1.35, score: 0.8 },
  normal: { key: 'normal', name: '잔존',   note: '설계된 그대로의 난이도',
            hp: 1,    dmg: 1,    spawn: 1,    max: 1,   battery: 1,   loot: 1,    score: 1 },
  hard:   { key: 'hard',   name: '절멸',   note: '탄도 배터리도 모자란다',
            hp: 1.32, dmg: 1.45, spawn: 1.34, max: 1.3, battery: 1.25, loot: 0.68, score: 1.35 }
};

const AIM_MODES = ['turn', 'drag', 'stick'];
const QUALITY_MODES = ['auto', 'high', 'low'];

const SETTINGS = (() => {
  const KEY = 'aftermath.settings';
  const DEF = {
    volume: 55,            // 0‒100
    brightness: 50,        // 0‒100, 밤의 어둠 농도 (원작 1.1 업데이트의 밝기 조절)
    difficulty: 'normal',
    flash: true,           // 피격 섬광 · 번개 · 총구 화염
    shake: true,           // 화면 흔들림
    autofire: true,        // 불빛 안의 적 자동 사격
    aim: 'turn',           // 터치 조준: turn = 회전 스틱(원작) · drag = 화면 드래그(원작 1.1) · stick = 방향 스틱
    hints: true,           // 처음 마주치는 조작·적에 대한 한 줄 도움말
    music: true,           // 긴장도에 따라 변하는 음악
    quality: 'auto',       // 그리기 해상도: auto = 프레임에 맞춰 스스로 낮추고 올린다 · high · low
    fps: false             // 화면 구석에 FPS · 해상도 표시
  };

  const state = Object.assign({}, DEF);
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    for (const k in DEF) if (k in raw && typeof raw[k] === typeof DEF[k]) state[k] = raw[k];
  } catch (e) { /* 손상된 저장값은 기본값으로 */ }
  if (!DIFFICULTY[state.difficulty]) state.difficulty = DEF.difficulty;
  if (!AIM_MODES.includes(state.aim)) state.aim = DEF.aim;
  if (!QUALITY_MODES.includes(state.quality)) state.quality = DEF.quality;
  state.volume = Math.max(0, Math.min(100, state.volume | 0));
  state.brightness = Math.max(0, Math.min(100, state.brightness | 0));

  const listeners = [];
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
    get music()      { return state.music; },
    get quality()    { return state.quality; },
    get fps()        { return state.fps; },
    /** 현재 난이도의 배수 묶음 */
    get mod()        { return DIFFICULTY[state.difficulty]; },

    get(k) { return state[k]; },
    set(k, v) {
      if (!(k in DEF)) return;
      if (k === 'volume' || k === 'brightness') v = Math.max(0, Math.min(100, v | 0));
      if (k === 'difficulty' && !DIFFICULTY[v]) return;
      if (k === 'aim' && !AIM_MODES.includes(v)) return;
      if (k === 'quality' && !QUALITY_MODES.includes(v)) return;
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
