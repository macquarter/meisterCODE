/* ═══════════════════════════════════════════
   LEFT CITY — 남겨진 도시 : 절차적 사운드
   외부 오디오 파일 없이 WebAudio 로 전부 합성한다.
   ═══════════════════════════════════════════ */
const SFX = (() => {
  let ctx = null, master = null, rainGain = null, rainSrc = null, rainNodes = null, weather = 'rain', stormK = 0;
  /** 날씨마다 배경 소음 — [고역 통과, 저역 통과, 크기]. 바람은 낮고 둥글게, 몬순은 크고 거칠게 */
  const WX = { rain: [620, 5200, 0.13], monsoon: [520, 6400, 0.19], fog: [700, 3600, 0.07], snow: [120, 700, 0.07], blizzard: [140, 900, 0.1], sandstorm: [180, 1300, 0.09] };
  let drone = null;                   // { oscs, filt, gain, lfo } — 낮게 깔리는 위협음
  let noiseBuf = null, rainBuf = null, enabled = true, ambWanted = false;
  /* 한 번에 울리는 짧은 소리(노이즈 · 톤)의 수 — 휴대폰에서 연사 · 피격 · 무리 소리가 겹쳐 노드가 수백 개로 불면
     오디오 스레드가 버티지 못해 소리가 통째로 끊겼다. 넘치면 작은 소리부터 버린다 */
  const TOUCH = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const ONESHOT_CAP = TOUCH ? 16 : 40;
  let oneshots = 0;
  /* 내 총성 · 폭발처럼 놓치면 안 되는 소리(rc.44) — 상한을 넘어도 낸다. 휴대폰에서 무리가 달려들면 발소리 · 그르렁이
     상한을 채워 정작 총소리가 빠지던 것을 막는다 */
  let PRIO = false;
  const gateT = {};
  /** 같은 소리가 ms 안에 다시 오면 건너뛴다(연사 · 관통탄 피격음이 한 프레임에 몇 겹씩 쌓이지 않게) */
  function gate(key, ms) { const now = ctx ? ctx.currentTime * 1000 : 0; if (now - (gateT[key] || -1e9) < ms) return false; gateT[key] = now; return true; }

  /** 이 아래로는 들리지도 않고, exponentialRampToValueAtTime 이 0 을 거부한다 */
  const SILENT = 0.0005;

  /** 설정의 0‒100 볼륨을 게인으로. 0 이면 완전 무음 */
  function masterLevel() {
    const v = (typeof SETTINGS !== 'undefined' ? SETTINGS.volume : 55) / 100;
    return enabled ? v * 0.55 * (ducked ? 0.4 : 1) : 0;
  }
  let ducked = false, duckF = null;

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { enabled = false; return; }
    // 휴대폰은 버퍼를 조금 넉넉히('balanced') — 3D 렌더로 CPU 가 바쁠 때 오디오가 비지 않게(지연은 수십 ms 늘 뿐)
    // rc.44 — 휴대폰은 'playback'(버퍼를 가장 넉넉히). 3D 렌더가 GPU · CPU 를 다 쓰면 오디오 스레드가 제때 채우지 못해
    // 소리가 '나다가 안 나는'(통째로 비는) 일이 있었다. 지연은 100ms 안팎 늘지만 끊기지 않는 쪽이 낫다
    try { ctx = new AC({ latencyHint: TOUCH ? 'playback' : 'interactive' }); } catch (e) { ctx = new AC(); }
    // iOS 16.4+ — 게임 소리는 '주변음'으로: 무음 스위치를 따르고, 듣던 음악을 끊지 않고 섞인다(앱 심사 지침의 게임 오디오 관례)
    try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch (e) { /* 무시 */ }
    master = ctx.createGain();
    master.gain.value = masterLevel();
    // 리미터 — 총성 · 폭발 · 비명이 한꺼번에 겹쳐도 찢어지지(클리핑) 않게
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -9; lim.knee.value = 6; lim.ratio.value = 10; lim.attack.value = 0.003; lim.release.value = 0.22;
    // 일시정지에서는 소리를 낮추고 먹먹하게(문 너머로 듣는 것처럼) — 멈춘 화면 위로 빗소리 · 음악이 그대로 쏟아지지 않게
    duckF = ctx.createBiquadFilter(); duckF.type = 'lowpass'; duckF.frequency.value = 20000; duckF.Q.value = 0.5;
    master.connect(duckF); duckF.connect(lim); lim.connect(ctx.destination);
    // 귀 울림(rc.41) — 가까운 폭발 뒤 2초 남짓 모든 소리가 먹먹했다가 돌아온다(일시정지의 먹먹함과 따로)
    ringF = ctx.createBiquadFilter(); ringF.type = 'lowpass'; ringF.frequency.value = 20000; ringF.Q.value = 0.4;
    master.disconnect(); master.connect(ringF); ringF.connect(duckF);
    noiseBuf = makeNoise(2.0);
    buildSpace();
    rainBuf = makeRain(7.0);
    // 앱 전환 · 알림창 · 전화로 오디오가 멈췄다가 돌아오면 다시 깨운다(예전엔 다음 터치 전까지 빗소리 · 효과음이 멈춰 있었다)
    const wake = () => resume();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
    window.addEventListener('pageshow', wake);
    window.addEventListener('focus', wake);
    for (const ev of ['touchend', 'pointerdown', 'keydown']) window.addEventListener(ev, wake, { capture: true, passive: true });
    ctx.onstatechange = () => { if (ctx.state !== 'running' && !document.hidden) setTimeout(wake, 250); };
  }

  /* ── 공간(rc.41) — 도시의 메아리 ───────────────
     예전엔 모든 소리가 마른(dry) 소리였다 — 골목에서 쏘든 대로에서 쏘든 똑같이. 이제 큰 소리는 두 갈래 메아리로 보낸다:
       잔향(convolver) — 넓은 길일수록 길고 크게 굴러간다(건물 사이를 오가는 꼬리)
       되울림(slapback) — 좁은 골목일수록 벽에서 '탁' 하고 짧게 되돌아온다
     눈은 소리를 먹고(잔향 줄임), 화성은 공기가 엷다. 길이 얼마나 트였는지는 게임이 0.25초마다 알려 준다(space) */
  let revIn = null, revOut = null, slapOut = null, ringF = null;
  const SPACE = { open: 0.5, damp: 1, wet: 1 };
  function makeIR(sec) {
    const sr = ctx.sampleRate, len = Math.floor(sr * sec), buf = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c); let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr, k = Math.min(0.92, 0.25 + t * 0.55);          // 뒤로 갈수록 높은 소리가 먼저 사라진다
        lp = lp * k + (Math.random() * 2 - 1) * (1 - k);
        d[i] = lp * Math.exp(-t * 2.4) * (t < 0.012 ? t / 0.012 : 1) * 2.2;
      }
      // 이른 반사 — 건물 벽 몇 개
      for (const [ms, a] of [[23, 0.5], [41, 0.35], [67, 0.28], [97, 0.2]]) { const j = Math.floor(sr * (ms + c * 3) / 1000); if (j < len) d[j] += a * (c ? -1 : 1); }
    }
    return buf;
  }
  function buildSpace() {
    try {
      revIn = ctx.createGain(); revIn.gain.value = 1;
      const conv = ctx.createConvolver(); conv.buffer = makeIR(TOUCH ? 0.9 : 2.4);   // 휴대폰은 짧게(rc.44) — 긴 잔향 합성이 오디오 스레드를 가장 많이 먹는다
      revOut = ctx.createGain(); revOut.gain.value = 0.35;
      revIn.connect(conv); conv.connect(revOut); revOut.connect(master);
      const dl = ctx.createDelay(0.5); dl.delayTime.value = 0.11;
      const fb = ctx.createGain(); fb.gain.value = 0.3;
      const df = ctx.createBiquadFilter(); df.type = 'lowpass'; df.frequency.value = 2600;
      slapOut = ctx.createGain(); slapOut.gain.value = 0.2;
      revIn.connect(dl); dl.connect(df); df.connect(fb); fb.connect(dl); df.connect(slapOut); slapOut.connect(master);
    } catch (e) { revIn = null; }
  }
  function applySpace() {
    if (!revOut || !ctx) return;
    const t = ctx.currentTime, o = SPACE.open, d = SPACE.damp;
    revOut.gain.setTargetAtTime((0.18 + 0.42 * o) * d, t, 0.4);
    slapOut.gain.setTargetAtTime(0.34 * (1 - o) * d, t, 0.4);
  }

  /* ── 소리의 자리(rc.41) — 듣는 이(플레이어)와 소리 난 곳 ───────
     거리 — 멀수록 작아질 뿐 아니라 높은 소리가 먼저 빠져 둔해진다(공기가 먹는다)
     벽 — 사이에 건물이 있으면 한 번 더 먹먹하게(벽 너머의 그르렁)
     뒤 — 손전등이 보지 않는 등 뒤의 소리는 살짝 어둡게(헤드폰에서 '뒤'를 알아채게)
     먼 소리일수록 메아리가 더 많이 섞인다 */
  let LIS = null, SRC = null;
  function spatial() {
    if (!SRC || !LIS) return null;
    if (SRC.c) return SRC.c;
    const dx = SRC.x - LIS.x, dy = SRC.y - LIS.y, d = Math.hypot(dx, dy);
    let lp = 18000 * Math.exp(-d / 700);
    if (d > 60 && LIS.los && !LIS.los(SRC.x, SRC.y)) lp *= 0.32;
    if (d > 40 && Math.cos(Math.atan2(dy, dx) - LIS.a) < -0.35) lp *= 0.6;
    SRC.c = { pan: Math.max(-0.85, Math.min(0.85, dx / 420)), lp: Math.max(380, lp), wet: Math.min(0.5, d / 1600) };
    return SRC.c;
  }

  function resume() { if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') { try { const r = ctx.resume(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* 무시 */ } } }

  /** 빗소리 — 7초짜리 잡음에 빗방울 톡톡을 섞고, 끝과 시작을 겹쳐 이어 붙인다(이음매에서 '툭' 끊기지 않게) */
  function makeRain(seconds) {
    const sr = ctx.sampleRate, len = Math.floor(sr * seconds), X = Math.floor(sr * 0.5);
    const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0), tmp = new Float32Array(len + X);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len + X; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.96300 * b1 + w * 0.2965164; b2 = 0.57000 * b2 + w * 1.0526913;
      tmp[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
    // 빗방울 — 초당 수십 개의 아주 짧은 톡
    const drops = Math.floor(seconds * 38);
    for (let k = 0; k < drops; k++) {
      const at = Math.floor(Math.random() * (len + X - 400)), a = 0.15 + Math.random() * 0.35, f = 0.25 + Math.random() * 0.5;
      for (let j = 0; j < 260; j++) tmp[at + j] += Math.sin(j * f) * a * Math.exp(-j / 38);
    }
    for (let i = 0; i < len; i++) d[i] = tmp[i];
    for (let i = 0; i < X; i++) { const t = i / X; d[i] = tmp[i] * t + tmp[len + i] * (1 - t); }      // 겹쳐 잇기
    return buf;
  }

  function makeNoise(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    // 부드러운 핑크 노이즈에 가깝게 (Voss 근사)
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.0990460;
      b1 = 0.96300 * b1 + w * 0.2965164;
      b2 = 0.57000 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22;
    }
    return buf;
  }

  /* 헤드폰 입체 음향 (원작의 '3D audio') — 게임이 소리 나는 곳의 가로 위치를 pan() 으로 알려 주면
     그 사이에 나는 소리를 좌우로 벌린다. 화면 왼쪽의 감염체는 왼쪽 귀에서 들린다 */
  let srcPan = 0, SEND = 0;
  /** 소리를 내보낸다 — 자리(거리 · 벽 · 뒤)에 따라 먹먹하게 · 좌우로, 큰 소리는 메아리로도(SEND) */
  function outTo(node, send, gain) {
    const sp = spatial();
    let n = node;
    // 휴대폰 — 작은 소리는 거리 필터 · 좌우 · 메아리 없이 곧장(rc.44). 한 소리에 노드 서넛씩 붙던 것을 줄인다
    if (TOUCH && gain !== undefined && gain < 0.06 && !PRIO) { n.connect(master); return; }
    if (sp && sp.lp < 16000) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = sp.lp; f.Q.value = 0.5; n.connect(f); n = f; }
    const pan = sp ? sp.pan : srcPan;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; n.connect(p); n = p; }
    n.connect(master);
    const w = ((send === undefined ? SEND : send) + (sp && (send || SEND) ? sp.wet : 0)) * SPACE.wet;
    if (w > 0.02 && revIn) { const g = ctx.createGain(); g.gain.value = Math.min(1.2, w); n.connect(g); g.connect(revIn); }
  }
  /** fn 안에서 나는 소리를 메아리로 k 만큼 보낸다 */
  function wet(k, fn) { const was = SEND; SEND = k; try { fn(); } finally { SEND = was; } }

  /** 노이즈 한 번 재생 (타격감·폭발·발소리용) */
  function burst(dur, freq, q, gain, type = 'lowpass', decay, delay = 0) {
    if (!enabled || !ctx) return;
    if (!(gain > SILENT)) return;
    if (oneshots >= ONESHOT_CAP && gain < 0.3 && !PRIO) return;          // 넘치면 작은 소리부터 버린다(내 총성은 예외)
    oneshots++;
    const src = ctx.createBufferSource();
    src.onended = () => { oneshots = Math.max(0, oneshots - 1); };
    src.buffer = noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.5;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    const t = ctx.currentTime + delay;
    g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (decay || dur));
    src.connect(f); f.connect(g); outTo(g, undefined, gain);
    src.start(t); src.stop(t + dur + 0.05);
  }

  /** 사인/톱니 톤 (짐승 울음·UI음) */
  function tone(freq, dur, gain, type = 'sine', slideTo, delay = 0) {
    if (!enabled || !ctx) return;
    if (!(gain > SILENT)) return;        // 들리지도 않는 소리에 노드를 만들지 않는다
    if (oneshots >= ONESHOT_CAP && gain < 0.3 && !PRIO) return;
    oneshots++;
    const o = ctx.createOscillator();
    o.onended = () => { oneshots = Math.max(0, oneshots - 1); };
    const g = ctx.createGain();
    const t = ctx.currentTime + delay;
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); outTo(g, undefined, gain);
    o.start(t); o.stop(t + dur + 0.03);
  }

  /* ── 목소리 합성 — 감염체 · 사람의 소리 ─────────────
     예전엔 네모 · 톱니 파형을 그대로 내보내 오래된 게임기(패미콤) 같은 '삐' 소리가 났다.
     이제 목청을 흉내 낸다: 떨리는(지터) 성대 소리 + 쉰 숨소리(잡음)를 목 안에서 거칠게 찌그러뜨리고(포화),
     모음의 공명(포먼트 셋)을 지나 입 밖으로. 낮게 긁히는 떨림(보컬 프라이)은 진폭을 30Hz 언저리로 흔들어 낸다 */
  const VOWEL = { a: [730, 1090, 2440], o: [570, 840, 2410], u: [320, 870, 2240], uh: [520, 1190, 2390], e: [530, 1840, 2480], ae: [660, 1720, 2410] };
  let satCurve = null, voices = 0;
  function voice(o) {
    if (!enabled || !ctx) return;
    const gain = o.gain || 0.1;
    if (!(gain > SILENT) || voices >= (TOUCH ? 4 : 8)) return;   // 휴대폰은 넷까지(목소리 하나가 노드 열댓 개)          // 한꺼번에 여덟 목소리까지 — 무리 속에서 소리가 뭉개지지 않게
    voices++;
    const t = ctx.currentTime + (o.delay || 0), dur = o.dur || 0.6, f0 = o.f0 || 110, f1 = o.f1 || f0 * 0.7;
    const size = o.size || 1, v0 = VOWEL[o.vowel || 'uh'], v1 = VOWEL[o.to || o.vowel || 'uh'];
    // 성대 — 톱니에 두 겹의 느린 · 빠른 흔들림
    const src = ctx.createOscillator(); src.type = 'sawtooth';
    src.frequency.setValueAtTime(f0, t); src.frequency.exponentialRampToValueAtTime(Math.max(25, f1), t + dur);
    const jit = [[4 + Math.random() * 3, 0.035], [11 + Math.random() * 9, 0.02]].map(([hz, d]) => {
      const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = hz; lg.gain.value = f0 * d * (o.shake || 1);
      l.connect(lg); lg.connect(src.frequency); return l;
    });
    // 숨 · 쉰 소리
    const ns = ctx.createBufferSource(); ns.buffer = noiseBuf; ns.playbackRate.value = 0.9 + Math.random() * 0.3;
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1300 * size; nf.Q.value = 0.6;
    const ng = ctx.createGain(); ng.gain.value = o.rasp === undefined ? 0.5 : o.rasp;
    const vg = ctx.createGain(); vg.gain.value = 1 - Math.min(0.8, (o.rasp || 0) * 0.5);
    // 목 — 부드럽게 찌그러뜨린다(배음이 늘어 거칠어진다)
    if (!satCurve) { satCurve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; satCurve[i] = Math.tanh(x * 2.6); } }
    const sh = ctx.createWaveShaper(); sh.curve = satCurve;
    const pre = ctx.createGain(); pre.gain.value = 0.5;
    src.connect(vg); vg.connect(pre); ns.connect(nf); nf.connect(ng); ng.connect(pre); pre.connect(sh);
    // 모음 공명 셋 — 몸집이 크면(size<1) 낮게
    const sum = ctx.createGain(); sum.gain.value = 1;
    [1, 0.55, 0.25].forEach((k, i) => {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 5 + i * 2;
      bp.frequency.setValueAtTime(v0[i] * size, t); bp.frequency.linearRampToValueAtTime(v1[i] * size, t + dur * 0.8);
      const bg = ctx.createGain(); bg.gain.value = k * 2.2; sh.connect(bp); bp.connect(bg); bg.connect(sum);
    });
    // 보컬 프라이 — 진폭을 거칠게 흔든다
    const env = ctx.createGain(), fry = ctx.createGain(); fry.gain.value = 1;
    const fl = ctx.createOscillator(), flg = ctx.createGain(); fl.frequency.value = (o.fry || 28) + Math.random() * 8; flg.gain.value = o.fryAmt === undefined ? 0.35 : o.fryAmt;
    fl.connect(flg); flg.connect(fry.gain);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = (o.bright || 3200) * size;
    sum.connect(fry); fry.connect(lp); lp.connect(env);
    const att = o.attack || 0.05;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + att);
    env.gain.setValueAtTime(gain, t + Math.max(att, dur * (o.hold || 0.45)));
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    outTo(env, o.send);
    src.onended = () => { voices = Math.max(0, voices - 1); };
    try { for (const n of [src, ns, fl, ...jit]) { n.start(t); n.stop(t + dur + 0.06); } } catch (e) { voices = Math.max(0, voices - 1); }
  }
  /** 거리 감쇠된 목소리 — n 이 너무 작으면 내지 않는다 */
  function voiceAt(n, o) { if (n > 0.02) voice(Object.assign({}, o, { gain: (o.gain || 0.1) * n })); }

  /* ── 적응형 음악 ──────────────────────────
     Dead Space 의 "공포 발신기"·L4D 의 무리 음악처럼, 연출가의 긴장도에 따라 층을 쌓는다.
       숨 고르기 — 드문드문 떨어지는 피아노 음 (가라앉은 단조 분산화음)
       긴장     — 베이스 오스티나토, 긴장도만큼 빠르고 크게 (60→120 BPM)
       정점     — 떨리는 현(트레몰로)이 얹힌다
       무리     — 낮은 북이 박자를 친다
       그것     — 반음 내려간 무거운 걸음과 금관 같은 찌르는 화음
       우는 것  — 가까우면 다른 층을 줄여 흐느낌이 들리게 한다 (Alien: Isolation 식 정적)
     음표는 50ms 마다 0.25초 앞까지 미리 예약한다. */
  const music = { on: false, bus: null, timer: null, next: 0, step: 0,
    st: { intensity: 0, phase: 'build', boss: false, horde: false, weeper: 0, menu: false }, lv: {} };
  /* 메뉴 주제 — 느린 단조 화음(Am · F · C · G) 위로 비 오는 밤의 피아노 동기. 64 걸음(8분음표) 한 바퀴 */
  const MENU_CHORDS = [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]];
  const MENU_MOTIF = { 0: 24, 6: 27, 8: 31, 14: 29, 16: 27, 22: 24, 24: 22, 32: 24, 38: 27, 40: 34, 46: 31, 48: 29, 54: 27, 56: 26 };
  const SCALE = [0, 3, 5, 7, 10];                 // 단조 5음 (A 기준 반음)
  const hz = semi => 55 * Math.pow(2, semi / 12);
  function note(t, freq, dur, gain, type, filt, out) {
    if (!(gain > SILENT)) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.02, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (filt) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filt; o.connect(f); node = f; }
    node.connect(g); g.connect(out || music.bus);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function drum(t, gain, freq = 70) {
    if (!(gain > SILENT)) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(freq * 2.2, t); o.frequency.exponentialRampToValueAtTime(freq, t + 0.12);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g); g.connect(music.bus); o.start(t); o.stop(t + 0.4);
  }
  function tremolo(t, dur, freq, gain) {
    if (!(gain > SILENT)) return;
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter();
    const amp = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain(), env = ctx.createGain();
    o1.type = o2.type = 'sawtooth'; o1.frequency.value = freq; o2.frequency.value = freq * 1.006;
    f.type = 'bandpass'; f.frequency.value = freq * 2; f.Q.value = 0.9;
    lfo.frequency.value = 9; lg.gain.value = 0.5; amp.gain.value = 0.5;
    lfo.connect(lg); lg.connect(amp.gain);
    env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(gain, t + dur * 0.4); env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o1.connect(f); o2.connect(f); f.connect(amp); amp.connect(env); env.connect(music.bus);
    for (const o of [o1, o2, lfo]) { o.start(t); o.stop(t + dur + 0.05); }
  }
  function musicTick() {
    if (!music.on || !ctx) return;
    const S = music.st;
    const k = Math.max(0, Math.min(1, S.intensity / 100));
    const duck = 1 - Math.min(0.8, S.weeper);                    // 우는 것 곁에서는 음악이 숨을 죽인다
    const bpm = S.menu ? 76 : S.boss ? 96 : 60 + k * 60 + (S.horde ? 16 : 0);
    const beat = 60 / bpm / 2;                                    // 8분음표
    const now = ctx.currentTime;
    if (music.next < now) music.next = now + 0.05;
    while (music.next < now + 0.6) {        // 0.6초 앞까지 예약 — 화면이 잠깐 버벅여도 음악이 비지 않게
      const t = music.next, i = music.step++;
      if (S.menu) {
        const ch = MENU_CHORDS[((i / 16) | 0) % 4];
        if (i % 16 === 0) {
          for (const n of ch) { note(t, hz(n + 24), beat * 17, 0.022, 'triangle', 700); note(t, hz(n + 24) * 1.004, beat * 17, 0.016, 'sawtooth', 500); }
          note(t, hz(ch[0] + 12), beat * 15, 0.05, 'sine', 0);
        }
        const m = MENU_MOTIF[i % 64];
        if (m !== undefined && (i % 128 < 64 || Math.random() < 0.75)) {
          note(t, hz(m + 12), 2.2, 0.05, 'sine', 0);
          note(t, hz(m + 24), 1.2, 0.012, 'triangle', 0);
        }
        if (i % 4 === 2 && Math.random() < 0.25) note(t, hz(ch[(Math.random() * 3) | 0] + 36), 1.4, 0.012, 'sine', 0);
      } else if (S.phase === 'relax' && !S.boss) {
        // 숨 고르기 — 4박에 한 번 떨어지는 피아노 음
        if (i % 6 === 0 && Math.random() < 0.7) {
          const sc = SCALE[(Math.random() * SCALE.length) | 0];
          note(t, hz(sc + 36), 2.4, 0.045 * duck, 'sine', 0, null);
          note(t, hz(sc + 48), 1.6, 0.015 * duck, 'triangle', 0, null);
        }
      } else if (S.boss) {
        // 그것 — 반음 아래 무거운 걸음과 찌르는 화음
        if (i % 2 === 0) drum(t, 0.22 * duck, 48);
        const bass = [0, 0, -1, 0, 0, 0, -1, 1][i % 8];
        note(t, hz(bass + 12), beat * 0.9, 0.09 * duck, 'sawtooth', 300);
        if (i % 16 === 0) { for (const iv of [0, 1, 6]) note(t, hz(iv + 24), beat * 3, 0.05 * duck, 'square', 900); }
        if (i % 16 === 8) tremolo(t, beat * 8, hz(25), 0.05 * duck);
      } else {
        // 긴장 — 베이스 오스티나토 (긴장도가 오를수록 크고 빠르게)
        const pat = [0, 0, 3, 0, 7, 0, 5, 3];
        const g0 = (0.02 + 0.07 * k) * duck;
        if (k > 0.08 || S.horde) note(t, hz(pat[i % 8] + 12), beat * 0.8, g0, 'sawtooth', 220 + k * 500);
        if (k > 0.5 && i % 16 === 0) tremolo(t, beat * 16, hz(SCALE[(i / 16 | 0) % 5] + 36), 0.035 * (k - 0.4) * duck);
        if (S.horde && i % 2 === 0) drum(t, (i % 8 === 0 ? 0.2 : 0.1) * duck);
        if (S.horde && i % 4 === 2) note(t, hz(48 + 7), beat * 0.5, 0.02 * duck, 'square', 1800);
      }
      music.next += beat;
    }
  }

  /* 거리에 따른 감쇠 — 화면 밖 소리는 작게 */
  const near = d => Math.max(0, 1 - d / 900);

  return {
    init, resume,
    /** 이어서 나는 소리의 출처 — 플레이어 기준 가로 거리(px). 0 이면 가운데 */
    pan(dx) { SRC = null; srcPan = dx ? Math.max(-0.85, Math.min(0.85, dx / 420)) : 0; },
    /** 듣는 이 — 플레이어 자리 · 바라보는 쪽 · 벽 판정(x, y → 보이는가). 매 프레임 */
    listen(x, y, a, los) { LIS = { x, y, a, los }; },
    /** 이어서 나는 소리의 자리. null 이면 가운데(플레이어 자신의 소리) */
    src(x, y) { srcPan = 0; SRC = x === null || x === undefined ? null : { x, y, c: null }; },
    /** (x, y) 에서 나는 소리 — fn 안에서만, 끝나면 앞의 자리로 되돌린다(감염체 갱신 중에 다른 것의 소리가 끼어도 섞이지 않게) */
    at(x, y, fn) { const kS = SRC, kP = srcPan; SRC = { x, y, c: null }; srcPan = 0; try { fn(); } finally { SRC = kS; srcPan = kP; } },
    /** 길이 얼마나 트였나(0 골목 ‒ 1 대로) · 날씨 — 메아리의 길이와 되울림 */
    space(open, wx) {
      const damp = wx === 'snow' || wx === 'blizzard' ? 0.55 : wx === 'sandstorm' ? 0.7 : 1;
      if (Math.abs(open - SPACE.open) < 0.04 && damp === SPACE.damp) return;
      SPACE.open = open; SPACE.damp = damp; applySpace();
    },
    /** 검사용 — (x, y) 에서 난 소리가 어떻게 들리는가(좌우 · 먹먹함 · 메아리) */
    _spatial(x, y) { const k = SRC; SRC = { x, y, c: null }; const r = spatial(); SRC = k; return r; },
    get spaceState() { return { open: SPACE.open, damp: SPACE.damp, rev: revOut ? +revOut.gain.value.toFixed(3) : null, slap: slapOut ? +slapOut.gain.value.toFixed(3) : null, ok: !!revIn }; },
    /** 귀 울림 — 가까운 폭발. k 0‒1: 높은 삐 소리 + 모든 소리가 먹먹했다가 2초에 걸쳐 돌아온다 */
    ring(k) {
      if (!enabled || !ctx || !ringF || k <= 0.05) return;
      const t = ctx.currentTime, keep = SRC; SRC = null;
      tone(3900 + Math.random() * 400, 2.4 * k + 0.6, 0.035 * k, 'sine');
      SRC = keep;
      ringF.frequency.cancelScheduledValues(t); ringF.frequency.setValueAtTime(Math.max(500, 2400 - 1900 * k), t);
      ringF.frequency.setTargetAtTime(20000, t + 0.5 + 1.2 * k, 0.6);
      this.ringing = t + 2 + k;
    },
    get ready() { return !!ctx; },

    /** 빗소리 루프 시작 */
    rain(on) {
      if (!enabled || !ctx) return;
      if (on && weather === 'indoor') return;                  // 실내 — 빗소리 대신 고요(rc.45)
      if (on && !rainSrc) {
        rainSrc = ctx.createBufferSource();
        rainSrc.buffer = rainBuf || noiseBuf; rainSrc.loop = true;
        const W = WX[weather] || WX.rain;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass'; hp.frequency.value = W[0];
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = W[1];
        rainGain = ctx.createGain(); rainGain.gain.value = 0.0;
        rainSrc.connect(hp); hp.connect(lp); lp.connect(rainGain);
        rainGain.connect(master);
        // 바람 — 느린 LFO 가 저역 통과 주파수를 흔들어 돌풍이 지나간다
        let lfo = null;
        if (weather === 'snow' || weather === 'blizzard' || weather === 'sandstorm') {
          lfo = ctx.createOscillator(); const amt = ctx.createGain();
          lfo.frequency.value = 0.13; amt.gain.value = W[1] * 0.45;
          lfo.connect(amt); amt.connect(lp.frequency); lfo.start();
        }
        rainNodes = { lp, lfo, base: W };
        rainSrc.start();
        // 시작점을 박아 두어야 2.5초에 걸쳐 차오른다(없으면 문맥이 켜진 0초부터 잰 기울기라 거의 한꺼번에 튀어나온다)
        rainGain.gain.setValueAtTime(0.0001, ctx.currentTime); rainGain.gain.linearRampToValueAtTime(W[2], ctx.currentTime + 2.5);
      } else if (!on && rainSrc) {
        { const g = rainGain.gain, t = ctx.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0.0001, t + 0.6); }
        const s = rainSrc, l = rainNodes && rainNodes.lfo; setTimeout(() => { try { s.stop(); if (l) l.stop(); } catch (e) {} }, 800);
        rainSrc = null; rainNodes = null;
      }
    },

    /** 이번 판의 날씨 — 다음 rain(true) 부터 그 소리로 */
    weather(kind) { if (kind !== weather && rainSrc) { this.rain(false); weather = kind; this.rain(true); } else weather = kind; },
    /** 폭풍의 세기 0‒1 → 바람이 커지고 밝아진다 */
    storm(k) {
      if (!rainNodes || !ctx || Math.abs(k - stormK) < 0.05) return;
      stormK = k; const t = ctx.currentTime, W = rainNodes.base;
      rainGain.gain.setTargetAtTime(W[2] * (1 + k * 1.8), t, 0.5);
      rainNodes.lp.frequency.setTargetAtTime(W[1] * (1 + k * 1.2), t, 0.5);
    },
    /* 총성(rc.41) — 세 겹: 터지는 '딱'(고역 순간음) · 몸통(중저역) · 가슴을 치는 저음. 몸통은 도시의 메아리로 보낸다
       (넓은 길은 길게 굴러가고, 골목은 벽에서 '탁' 되돌아온다) */
    shot()      { if (!gate('shot', 45)) return;
                  burst(0.025, 5200, 0.7, 0.16, 'highpass', 0.018);
                  wet(0.55, () => burst(0.16, 1500, 1.1, 0.34, 'lowpass', 0.11)); tone(150, 0.1, 0.2, 'sine', 48); },
    shotgun()   { burst(0.03, 4200, 0.7, 0.24, 'highpass', 0.025);
                  wet(0.85, () => burst(0.42, 850, 0.8, 0.55, 'lowpass', 0.34)); tone(96, 0.26, 0.3, 'sine', 34);
                  burst(0.07, 1500, 3, 0.07, 'bandpass', 0.06, 0.26); burst(0.08, 900, 3, 0.07, 'bandpass', 0.07, 0.36); },   // 펌프 — 철컥 · 착
    rifle()     { burst(0.03, 6000, 0.7, 0.24, 'highpass', 0.022);
                  wet(0.9, () => burst(0.5, 2200, 0.9, 0.5, 'lowpass', 0.2)); tone(70, 0.3, 0.34, 'sine', 30);
                  burst(0.9, 600, 0.6, 0.1, 'lowpass', 0.7, 0.06);                   // 골목에 울리는 꼬리
                  burst(0.06, 2400, 3, 0.07, 'bandpass', 0.05, 0.52); },             // 노리쇠
    pistol()    { burst(0.02, 5600, 0.7, 0.12, 'highpass', 0.015);
                  wet(0.45, () => burst(0.13, 1100, 1.0, 0.22, 'lowpass', 0.09)); tone(120, 0.08, 0.13, 'sine', 44); },
    dry()       { burst(0.05, 3200, 3, 0.1, 'bandpass', 0.04); },
    hitFlesh(d) { if (!gate('flesh', 40)) return; burst(0.1, 420, 0.9, 0.2 * near(d), 'lowpass', 0.08); },
    hitWall(d)  { if (!gate('wall', 40)) return; burst(0.07, 2600, 2.4, 0.14 * near(d), 'bandpass', 0.06); },
    /** 폭발 — 거리 d(없으면 바로 곁). 가까우면 크고 날카롭게, 멀면 둔한 쿵과 긴 메아리 */
    explode(d = 0) {
      const n = Math.max(0.25, 1 - d / 1300);
      wet(1.0, () => { burst(0.9, 260, 0.7, 0.62 * n, 'lowpass', 0.75); tone(74, 0.55, 0.34 * n, 'sine', 26); });
      if (d < 500) { burst(0.05, 3800, 0.6, 0.2 * n, 'highpass', 0.04); burst(0.6, 2600, 0.7, 0.05 * n, 'highpass', 0.5, 0.15); }   // 파편 · 유리 비
    },
    nadeThrow() { burst(0.12, 900, 1.2, 0.1, 'bandpass', 0.1); },

    /* 장전 · 근접 — 금속성 짧은 클릭과 둔탁한 타격 */
    reload()    { burst(0.07, 1800, 2.6, 0.12, 'bandpass', 0.06);
                  setTimeout(() => burst(0.09, 1150, 2.0, 0.10, 'bandpass', 0.08), 130); },
    reloadDone(){ burst(0.06, 2700, 3.2, 0.13, 'bandpass', 0.05);
                  setTimeout(() => tone(640, 0.05, 0.05, 'triangle'), 55); },
    melee()     { burst(0.14, 520, 1.1, 0.18, 'lowpass', 0.11); tone(112, 0.09, 0.1, 'sine', 52); },
    dodge()     { burst(0.2, 1400, 0.8, 0.16, 'bandpass', 0.16); burst(0.08, 260, 1, 0.12, 'lowpass', 0.06); },   // 회피 — 옷깃이 휙 + 발 구름
    meleeHit(d) { burst(0.22, 300, 0.8, 0.26 * near(d), 'lowpass', 0.18);
                  tone(84, 0.14, 0.15 * near(d), 'sine', 38); },
    /**
     * 바닥에 깔리는 저음 드론. 살짝 어긋난 두 톱니파를 저역 통과시키고,
     * 느린 LFO 로 필터를 흔들어 숨 쉬듯 움직이게 한다. 긴장도에 따라 열린다.
     */
    drone(on) {
      if (!enabled || !ctx) return;
      const t = ctx.currentTime;
      if (on && !drone) {
        const filt = ctx.createBiquadFilter();
        filt.type = 'lowpass'; filt.frequency.value = 140; filt.Q.value = 3;
        const gain = ctx.createGain(); gain.gain.value = 0.0001;
        const oscs = [[41.2, 'sawtooth'], [41.6, 'sawtooth'], [61.8, 'sine']].map(([f, type]) => {
          const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
          o.connect(filt); o.start(); return o;
        });
        const lfo = ctx.createOscillator(), lfoAmt = ctx.createGain();
        lfo.frequency.value = 0.07; lfoAmt.gain.value = 45;
        lfo.connect(lfoAmt); lfoAmt.connect(filt.frequency); lfo.start();
        filt.connect(gain); gain.connect(master);
        gain.gain.exponentialRampToValueAtTime(0.05, t + 4);
        drone = { oscs, filt, gain, lfo };
      } else if (!on && drone) {
        const d = drone; drone = null;
        d.gain.gain.cancelScheduledValues(t);
        d.gain.gain.setValueAtTime(Math.max(0.0001, d.gain.gain.value), t);
        d.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
        setTimeout(() => { for (const o of [...d.oscs, d.lfo]) try { o.stop(); } catch (e) {} }, 950);
      }
    },
    /**
     * 긴장도 0‒1 → 드론의 밝기와 크기. 매 프레임 불려도 되지만, AudioParam 자동화는
     * 부를 때마다 이벤트가 쌓이므로 값이 눈에 띄게 바뀌었거나 0.25초가 지났을 때만 넘긴다.
     */
    droneLevel(k) {
      if (!drone || !ctx) return;
      const t = ctx.currentTime;
      if (Math.abs(k - (drone.k ?? -1)) < 0.04 && t - (drone.kt ?? 0) < 0.25) return;
      drone.k = k; drone.kt = t;
      drone.filt.frequency.setTargetAtTime(140 + k * 520, t, 0.6);
      drone.gain.gain.setTargetAtTime(0.05 + k * 0.07, t, 0.8);
    },
    /** 판 하나의 배경음 전체 — 비와 드론을 함께 켜고 끈다 */
    ambience(on) { ambWanted = !!on; this.duck(false); this.rain(on); this.drone(on); this.music(on); },
    /** 일시정지 — 0.25초에 걸쳐 낮추고 먹먹하게, 풀면 되돌린다 */
    duck(on) {
      on = !!on; if (on === ducked) return; ducked = on;
      if (!ctx || !master) return;
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.setTargetAtTime(masterLevel(), t, 0.08);
      duckF.frequency.cancelScheduledValues(t); duckF.frequency.setValueAtTime(duckF.frequency.value, t); duckF.frequency.setTargetAtTime(on ? 900 : 20000, t, 0.08);
    },
    get ducked() { return ducked; },
    /** 판이 도는 동안 1초마다 — 멈춘 오디오를 깨우고, 꺼져 버린 빗소리 · 드론을 되살린다 */
    keepAlive() {
      if (!ctx) return;
      if (ctx.state !== 'running') resume();
      if (ambWanted && ctx.state === 'running') { if (!rainSrc) this.rain(true); if (!drone) this.drone(true); }
    },
    get state() { return ctx ? ctx.state : 'none'; },
    get oneshots() { return oneshots; },
    /** fn 안의 소리는 상한을 넘어도 낸다(내 총성 · 가까운 폭발) */
    prio(fn) { const was = PRIO; PRIO = true; try { fn(); } finally { PRIO = was; } },
    get touchLite() { return TOUCH; },
    get rainOn() { return !!rainSrc; },
    get droneOn() { return !!drone; },

    /** 명중 · 처치 확인음 — 짧고 높게, 귀에 거슬리지 않게 */
    hitTick(kill) {
      if (kill) { tone(1320, 0.07, 0.05, 'triangle', 880); }
      else      { burst(0.03, 4200, 4, 0.035, 'bandpass', 0.025); }
    },

    /* 발소리(rc.41) — 땅마다 다른 결. 1 모래(사각) · 2 얼음(뽀득 · 미끄덩) · 3 물(첨벙 + 물방울) · 4 용암 겉껍질(바삭) · 5 진흙(철벅 · 빨아들임).
       눈 도시는 눈 다지는 '뽀드득'(잘게 부서지는 알갱이 여럿), 젖은 길은 찰박, 마른 보도는 뒤꿈치 · 앞꿈치 두 번 */
    step(sprint, wet, terr, wx) {
      const g = (sprint ? 0.055 : 0.032) * (wet ? 1.35 : 1), keep = SRC; SRC = null;
      const r = () => Math.random();
      if (terr === 3) {                                                         // 물 — 몸통 첨벙 + 퐁 + 흩어지는 물방울
        burst(0.26, 1100, 0.7, g * 2.2, 'bandpass', 0.22); tone(260 + r() * 60, 0.09, g * 0.7, 'sine', 120);
        for (let k = 0; k < (sprint ? 5 : 3); k++) tone(1500 + r() * 2200, 0.04, g * 0.28, 'sine', 900 + r() * 600, 0.05 + r() * 0.18);
      } else if (terr === 5) {                                                  // 진흙 — 철벅, 발을 빼며 쪽
        burst(0.18, 380, 1.2, g * 1.8, 'lowpass', 0.14); tone(140, 0.08, g * 0.5, 'sine', 70);
        burst(0.1, 700, 2, g * 0.8, 'bandpass', 0.08, 0.12);
      } else if (terr === 1) { burst(0.14, 1800, 0.6, g * 1.1, 'highpass', 0.12); burst(0.08, 2600, 0.8, g * 0.4, 'highpass', 0.07, 0.05); }
      else if (terr === 2) { burst(0.05, 4200, 3, g * 1.2, 'bandpass', 0.04); burst(0.05, 2800, 3, g * 0.8, 'bandpass', 0.04, 0.03); if (r() < 0.25) tone(1800, 0.06, g * 0.25, 'sine', 2600); }
      else if (terr === 4) { burst(0.09, 2200, 1.6, g * 1.2, 'bandpass', 0.07); burst(0.05, 3400, 2, g * 0.6, 'bandpass', 0.04, 0.04); }
      else if (wx === 'snow' || wx === 'blizzard') {                            // 눈 — 뽀드득: 알갱이 너덧이 잘게 부서진다 + 다져지는 둔한 소리
        burst(0.1, 320, 0.9, g * 0.9, 'lowpass', 0.08);
        for (let k = 0; k < 5; k++) burst(0.03, 2200 + r() * 3200, 2.2, g * (0.6 + r() * 0.5), 'bandpass', 0.02, k * 0.016 + r() * 0.01);
      }
      else if (wet) { burst(0.13, 2600, 1.4, g, 'bandpass', 0.1); burst(0.06, 4200, 2, g * 0.35, 'bandpass', 0.05, 0.03); tone(1900 + r() * 900, 0.03, g * 0.15, 'sine', 1200, 0.05); }
      else { burst(0.06, 900, 1.1, g, 'lowpass', 0.05); burst(0.05, 1500, 1.4, g * 0.55, 'bandpass', 0.04, 0.035); }
      SRC = keep;
    },
    /** 감염체 발소리 — kind: drag(질질 끌며 걷는 것) · run(뛰는 것 · 기는 것) · heavy(큰 것 · 그것). n = 가까움 0‒1.
        자리는 먼저 src() 로. 물이면 첨벙, 눈이면 뽀드득이 섞인다 */
    zstep(kind, terr, wx, n) {
      if (!enabled || !ctx || n <= 0.03 || !gate('zs' + kind, 55)) return;
      const r = Math.random();
      if (kind === 'heavy') { tone(52, 0.22, 0.16 * n, 'sine', 30); burst(0.22, 260, 0.8, 0.14 * n, 'lowpass', 0.2); }
      else if (kind === 'run') { burst(0.07, 520, 1, 0.1 * n, 'lowpass', 0.06); burst(0.04, 1600, 1.5, 0.04 * n, 'bandpass', 0.03, 0.02); }
      else { burst(0.3, 600 + r * 300, 0.7, 0.07 * n, 'lowpass', 0.28); burst(0.08, 380, 1, 0.05 * n, 'lowpass', 0.07, 0.04); }   // 끌리는 발 + 툭
      if (terr === 3) { burst(0.2, 1100, 0.7, 0.1 * n, 'bandpass', 0.18); tone(1700 + r * 1500, 0.04, 0.03 * n, 'sine', 900, 0.08); }
      else if (wx === 'snow' || wx === 'blizzard') for (let k = 0; k < 3; k++) burst(0.03, 2400 + Math.random() * 2400, 2, 0.04 * n, 'bandpass', 0.02, k * 0.02);
    },
    /** 탄피 — 0.3‒0.5초 뒤 바닥에 떨어져 튄다. 땅이 받는 소리: 보도(쨍 · 짱) · 물(퐁) · 눈 · 진흙(소리 없음에 가까운 퍽) */
    casing(shell, terr, wx) {
      if (!enabled || !ctx || !gate('cas', 70)) return;
      const keep = SRC; SRC = null; const d0 = 0.3 + Math.random() * 0.2;
      if (terr === 3) tone(1500 + Math.random() * 500, 0.05, 0.02, 'sine', 700, d0);
      else if (terr === 5 || terr === 1 || wx === 'snow' || wx === 'blizzard') burst(0.04, 500, 1, 0.012, 'lowpass', 0.03, d0);
      else if (shell) { burst(0.05, 1300, 3, 0.03, 'bandpass', 0.04, d0); burst(0.04, 1100, 3, 0.015, 'bandpass', 0.03, d0 + 0.11); }
      else { const f = 3300 + Math.random() * 1600; tone(f, 0.06, 0.022, 'sine', f * 0.98, d0); tone(f * 1.07, 0.04, 0.012, 'sine', f, d0 + 0.09); tone(f * 1.1, 0.03, 0.007, 'sine', f, d0 + 0.15); }
      SRC = keep;
    },
    /** 먼 도시의 소리 — 어둠 너머 어딘가(자리는 먼저 src). 비명 · 총성 · 쇠 부딪힘 · 유리 · 신음 · 개. 멀어서 둔하고 메아리가 많다 */
    distant(kind) {
      if (!enabled || !ctx) return;
      wet(1.1, () => {
        if (kind === 'scream') voice({ f0: 520 + Math.random() * 180, f1: 760, dur: 1.1, gain: 0.07, vowel: 'a', to: 'ae', size: 1.15, rasp: 0.7, shake: 1.5, fryAmt: 0.25, attack: 0.05, hold: 0.6, send: 1.1 });
        else if (kind === 'shots') { const m = 2 + (Math.random() * 3 | 0); for (let k = 0; k < m; k++) burst(0.12, 900, 1, 0.07, 'lowpass', 0.1, k * (0.16 + Math.random() * 0.2)); }
        else if (kind === 'clang') { const f = 300 + Math.random() * 400; tone(f, 1.2, 0.03, 'triangle', f * 0.97); tone(f * 2.76, 0.8, 0.012, 'sine', f * 2.7); burst(0.08, 1800, 2, 0.04, 'bandpass', 0.06); }
        else if (kind === 'glass') { burst(0.04, 4200, 1, 0.05, 'highpass', 0.03); for (let k = 0; k < 6; k++) tone(3000 + Math.random() * 3500, 0.07, 0.008, 'sine', 2500, 0.03 + Math.random() * 0.4); }
        else if (kind === 'moan') { for (let k = 0; k < 3; k++) voice({ delay: k * 0.4 + Math.random() * 0.3, f0: 90 + Math.random() * 40, f1: 60, dur: 1.2, gain: 0.08, vowel: 'o', to: 'u', size: 0.85, rasp: 0.8, fryAmt: 0.5, send: 1.1 }); }
        else if (kind === 'dog') { for (let k = 0; k < 2; k++) voice({ delay: k * 0.32, f0: 420, f1: 300, dur: 0.18, gain: 0.07, vowel: 'a', to: 'o', size: 1.3, rasp: 0.6, fryAmt: 0.2, attack: 0.01, hold: 0.3, send: 1.1 }); }
      });
    },

    /* 그것 — 포효 · 돌진 · 벽 충돌 */
    roar(d)     { const n = Math.max(0.35, near(d));
                  voice({ send: 0.7, f0: 70, f1: 42, dur: 1.6, gain: 0.5 * n, vowel: 'a', to: 'o', size: 0.62, rasp: 0.9, fry: 22, fryAmt: 0.55, attack: 0.12, hold: 0.55 });
                  tone(46, 1.4, 0.22 * n, 'sine', 30);                     // 가슴을 울리는 저음
                  burst(1.4, 240, 0.7, 0.26 * n, 'lowpass', 1.3); },
    charge(d)   { const n = Math.max(0.3, near(d));
                  burst(0.6, 420, 0.8, 0.3 * n, 'lowpass', 0.55);
                  voice({ f0: 95, f1: 60, dur: 0.6, gain: 0.3 * n, vowel: 'a', to: 'uh', size: 0.7, rasp: 0.8, fryAmt: 0.5 }); },
    slam(d)     { const n = Math.max(0.3, near(d));
                  burst(0.8, 180, 0.6, 0.46 * n, 'lowpass', 0.7);
                  tone(54, 0.6, 0.3 * n, 'sine', 24); },

    /* 뱉는 것 — 젖은 토악질과 산이 지글거리는 소리 */
    spit(d)     { const n = near(d); if (n <= 0.02) return;
                  burst(0.2, 900, 1.6, 0.16 * n, 'bandpass', 0.16);
                  voice({ f0: 170, f1: 95, dur: 0.28, gain: 0.16 * n, vowel: 'e', to: 'uh', rasp: 1.1, fryAmt: 0.6, attack: 0.02 }); },
    spitHit(d)  { const n = near(d); if (n <= 0.02) return;
                  burst(0.5, 2200, 0.9, 0.14 * n, 'highpass', 0.46); },

    /** 기력이 바닥났을 때의 거친 숨 */
    gasp()      { burst(0.46, 780, 0.7, 0.13, 'bandpass', 0.42);
                  setTimeout(() => burst(0.3, 620, 0.8, 0.08, 'bandpass', 0.28), 300); },

    /** 무리의 습격 — 멀리서 겹쳐 터지는 비명과 땅울림. rel 은 시선 기준 방향(좌우 패닝) */
    horde(d, rel) {
      if (!enabled || !ctx) return;
      const n = Math.max(0.45, near(d * 0.6));
      // 여러 목이 겹쳐 지르는 소리 — 저마다 높이 · 모음 · 시작이 다르다
      const keep = srcPan; srcPan = Math.max(-0.9, Math.min(0.9, Math.cos(rel) * 0.9));
      for (let i = 0; i < 5; i++) {
        const f0 = 220 + Math.random() * 200;
        voice({ send: 0.6, delay: i * 0.12 + Math.random() * 0.15, f0, f1: f0 * 0.5, dur: 0.8 + Math.random() * 0.4, gain: 0.12 * n, vowel: ['a', 'ae', 'o'][i % 3], to: 'uh', rasp: 0.8, size: 0.9 + Math.random() * 0.2, fryAmt: 0.45 });
      }
      srcPan = keep;
      burst(1.6, 140, 0.7, 0.3 * n, 'lowpass', 1.5);              // 수많은 발이 구르는 땅울림
      tone(55, 1.2, 0.14 * n, 'sine', 41);
    },

    /** 우는 것의 흐느낌 — 내려가는 두 음과 숨. 깨어날수록 높고 빠르다 */
    sob(d, k) {
      const n = near(d * 0.75); if (n <= 0.02) return;
      const f = 330 + k * 180;                                        // 여자 목소리 높이 — 들썩이는 흐느낌 두 번과 숨
      voice({ f0: f, f1: f * 0.72, dur: 0.42, gain: 0.14 * n, vowel: 'uh', to: 'u', size: 1.18, rasp: 0.55, shake: 2.2, fryAmt: 0.2, attack: 0.03 });
      voice({ delay: 0.36, f0: f * 0.92, f1: f * 0.6, dur: 0.55, gain: 0.12 * n, vowel: 'o', to: 'u', size: 1.18, rasp: 0.6, shake: 2.5, fryAmt: 0.2 });
      burst(0.3, 1400, 1.2, 0.03 * n, 'bandpass', 0.28);
    },
    /** 우는 것이 깨어날 때 — 찢어지는 비명 */
    wail(d) {
      const n = Math.max(0.5, near(d));
      voice({ send: 0.7, f0: 520, f1: 980, dur: 1.2, gain: 0.32 * n, vowel: 'a', to: 'ae', size: 1.2, rasp: 0.8, shake: 1.6, fryAmt: 0.3, attack: 0.04, hold: 0.6, bright: 4200 });
      burst(0.9, 2400, 0.8, 0.14 * n, 'bandpass', 0.85);
    },
    /** 비명 지르는 것 — 숨을 길게 들이켜는 소리 (예고) */
    inhale(d) {
      const n = Math.max(0.35, near(d));
      burst(1.5, 700, 1.2, 0.12 * n, 'bandpass', 1.5);
      burst(1.2, 1600, 2.2, 0.06 * n, 'bandpass', 1.1);                // 좁은 목으로 빨려 드는 바람 소리
    },
    /** 비명 — 높고 길게 찢어지는 소리 */
    scream(d) {
      const n = Math.max(0.55, near(d));
      voice({ send: 0.8, f0: 640, f1: 900, dur: 1.4, gain: 0.32 * n, vowel: 'ae', to: 'a', size: 1.12, rasp: 0.95, shake: 1.4, fryAmt: 0.35, attack: 0.03, hold: 0.7, bright: 4600 });
      burst(1.2, 3000, 0.7, 0.16 * n, 'bandpass', 1.1);
    },
    /** 덮치는 것 — 웅크릴 때 이 사이로 새는 쉿 소리(예고), 날아들 때 짧은 괴성 */
    hiss(d)   { const n = Math.max(0.3, near(d));
                burst(0.6, 3200, 1.6, 0.1 * n, 'bandpass', 0.55);
                voiceAt(n, { f0: 210, f1: 240, dur: 0.5, gain: 0.12, vowel: 'e', to: 'ae', rasp: 1.2, fryAmt: 0.3, attack: 0.05, bright: 5200 }); },
    pounce(d) { const n = Math.max(0.3, near(d));
                voiceAt(n, { f0: 380, f1: 260, dur: 0.42, gain: 0.3, vowel: 'ae', to: 'a', size: 1.0, rasp: 1.1, fryAmt: 0.35, attack: 0.015, bright: 4800 });
                burst(0.3, 1200, 0.8, 0.1 * n, 'bandpass', 0.25); },
    /** 휘감는 것 — 가래 끓는 기침(예고) · 혀가 채찍처럼 날아가는 소리 · 끊기는 소리 */
    cough(d)  { const n = Math.max(0.25, near(d));
                for (let i = 0; i < 3; i++) voiceAt(n, { delay: i * 0.17, f0: 130 + i * 8, f1: 95, dur: 0.14, gain: 0.26, vowel: 'uh', to: 'u', size: 0.9, rasp: 1.3, fryAmt: 0.7, attack: 0.01, hold: 0.2 });
                burst(0.5, 500, 0.9, 0.06 * n, 'bandpass', 0.45); },
    lash(d)   { const n = Math.max(0.3, near(d));
                burst(0.22, 1800, 1.4, 0.16 * n, 'bandpass', 0.2);
                tone(320, 0.2, 0.05 * n, 'sine', 120); },
    snap(d)   { const n = Math.max(0.3, near(d));
                burst(0.12, 2400, 1.2, 0.18 * n, 'bandpass', 0.1);
                voiceAt(n, { f0: 150, f1: 90, dur: 0.35, gain: 0.2, vowel: 'o', to: 'u', rasp: 1.0, fryAmt: 0.6 }); },
    /** 개미지옥의 입 — 모래 속에서 촉수가 치켜드는 젖은 소리 · 내려치는 둔탁한 소리 · 씹는 소리 · 깨어나는 울음 */
    mawWind(d)  { const n = Math.max(0.2, near(d));
                  burst(0.45, 380, 0.7, 0.12 * n, 'bandpass', 0.4); tone(70, 0.45, 0.1 * n, 'sine', 110); },
    mawSlam(d)  { const n = Math.max(0.15, near(d));
                  burst(0.35, 260, 0.6, 0.34 * n, 'lowpass', 0.3); tone(58, 0.3, 0.22 * n, 'sine', 34); burst(0.5, 900, 0.9, 0.06 * n, 'bandpass', 0.45); },
    mawBite(d)  { const n = Math.max(0.3, near(d));
                  burst(0.1, 1300, 1.0, 0.18 * n, 'bandpass', 0.08); tone(90, 0.16, 0.12 * n, 'sawtooth', 50); },
    mawRoar(d)  { const n = Math.max(0.2, near(d));
                  voiceAt(n, { f0: 62, f1: 44, dur: 1.2, gain: 0.34, vowel: 'o', to: 'u', size: 1.9, rasp: 1.5, fryAmt: 0.9, attack: 0.08 });
                  burst(1.0, 300, 0.7, 0.12 * n, 'lowpass', 0.9); },
    /** 늘어난 무기 — 매그넘 · 석궁 · 화염방사기 · 유탄 · 레일건 */
    magnum()  { burst(0.03, 5200, 0.7, 0.22, 'highpass', 0.02);
                wet(0.95, () => burst(0.32, 1400, 0.7, 0.42, 'lowpass', 0.3)); tone(80, 0.25, 0.22, 'sine', 40); burst(0.6, 600, 0.8, 0.1, 'lowpass', 0.55); },
    bow()     { burst(0.08, 2600, 1.8, 0.12, 'bandpass', 0.07); tone(190, 0.16, 0.05, 'triangle', 120); },
    flame()   { burst(0.12, 700, 0.6, 0.07, 'lowpass', 0.12); },
    launch()  { wet(0.5, () => burst(0.22, 400, 0.8, 0.3, 'lowpass', 0.2)); tone(120, 0.18, 0.12, 'sine', 70); },
    rail()    { tone(240, 0.5, 0.12, 'sine', 3200); tone(3600, 0.35, 0.05, 'sine', 200); wet(0.7, () => burst(0.4, 3000, 1.1, 0.2, 'bandpass', 0.35)); },
    /** 방패에 총알이 튕기는 소리 */
    ric(d)    { const n = near(d); if (n <= 0.02) return;
                tone(2400 + Math.random() * 900, 0.12, 0.05 * n, 'sine', 1300 + Math.random() * 400);
                burst(0.08, 3400, 1.5, 0.08 * n, 'highpass', 0.07); },
    /** 부푼 것 — 배 속에서 끓는 소리 */
    gurgle(d) {
      const n = near(d); if (n <= 0.02) return;
      for (let i = 0; i < 3; i++) setTimeout(() => tone(70 + Math.random() * 40, 0.16, 0.08 * n, 'sine', 40), i * 120);
      burst(0.4, 260, 1.4, 0.06 * n, 'lowpass', 0.35);
    },
    /** 부푼 것이 터질 때 */
    burst(d) { const n = Math.max(0.3, near(d)); burst(0.6, 380, 0.7, 0.4 * n, 'lowpass', 0.5); tone(90, 0.3, 0.16 * n, 'sine', 40); },
    /** 담즙을 뒤집어쓸 때 */
    splat() { burst(0.5, 900, 0.8, 0.22, 'bandpass', 0.45); tone(140, 0.4, 0.1, 'sine', 60); },

    /** 차량 경보 — 두 음을 번갈아 6초. 거리에 따라 작아진다 */
    alarm(d) {
      if (!enabled || !ctx) return;
      const n = Math.max(0.35, near(d));
      // 진짜 차 경보처럼 세 마디가 돈다 — 올라가는 사이렌 · 경적 · 빠른 떨림
      for (let i = 0; i < 4; i++) setTimeout(() => { tone(620, 0.46, 0.09 * n, 'triangle', 1500); tone(1240, 0.46, 0.025 * n, 'sine', 3000); }, i * 500);
      for (let i = 0; i < 8; i++) setTimeout(() => { tone(415, 0.2, 0.06 * n, 'sawtooth'); tone(523, 0.2, 0.05 * n, 'sawtooth'); burst(0.2, 900, 0.7, 0.03 * n, 'lowpass', 0.18); }, 2000 + i * 260);
      for (let i = 0; i < 28; i++) setTimeout(() => tone(i % 2 ? 880 : 1180, 0.1, 0.07 * n, 'triangle'), 4100 + i * 100);
    },
    /** 크게 다쳤을 때의 거친 숨 */
    breath() {
      burst(0.5, 620, 0.8, 0.07, 'bandpass', 0.45);
      setTimeout(() => burst(0.4, 480, 0.8, 0.05, 'bandpass', 0.36), 620);
    },

    /* 감염체 — 목이 막힌 듯 낮게 그르렁 · 뛰는 것은 쉰 비명 · 쓰러질 때 숨이 빠지는 소리. 매번 높이 · 모음 · 길이가 다르다 */
    growl(d)  { const n = near(d); if (n <= 0.02) return;
                const f0 = 85 + Math.random() * 45;
                voiceAt(n, { send: 0.3, f0, f1: f0 * (0.55 + Math.random() * 0.2), dur: 0.6 + Math.random() * 0.5, gain: 0.36, vowel: ['uh', 'o', 'a'][Math.random() * 3 | 0], to: 'u', size: 0.82 + Math.random() * 0.15, rasp: 0.75, fryAmt: 0.5, attack: 0.08 });
                burst(0.42, 300, 0.8, 0.04 * n, 'lowpass', 0.4); },
    screech(d){ const n = near(d); if (n <= 0.02) return;
                const f0 = 300 + Math.random() * 140;
                voiceAt(n, { send: 0.35, f0, f1: f0 * 0.55, dur: 0.4 + Math.random() * 0.2, gain: 0.3, vowel: 'a', to: 'uh', rasp: 1.0, fryAmt: 0.4, attack: 0.02, bright: 4200 }); },
    zombieDie(d){ const n = near(d); burst(0.34, 500, 0.7, 0.14 * n, 'lowpass', 0.3);
                  voiceAt(n, { f0: 120 + Math.random() * 30, f1: 55, dur: 0.5, gain: 0.28, vowel: 'o', to: 'u', size: 0.85, rasp: 0.85, fryAmt: 0.6, attack: 0.02, hold: 0.2 }); },

    hurt()      { burst(0.3, 700, 0.8, 0.22, 'lowpass', 0.26);
                  voice({ f0: 165 + Math.random() * 25, f1: 120, dur: 0.24, gain: 0.3, vowel: 'uh', to: 'u', rasp: 0.45, fryAmt: 0.25, attack: 0.015, hold: 0.25 }); },
    death()     { voice({ f0: 190, f1: 70, dur: 1.4, gain: 0.24, vowel: 'a', to: 'u', rasp: 0.6, fryAmt: 0.45, attack: 0.03, hold: 0.3 });
                  burst(1.3, 420, 0.6, 0.24, 'lowpass', 1.2); },
    pickup()    { tone(720, 0.11, 0.15, 'triangle'); setTimeout(() => tone(1080, 0.13, 0.13, 'triangle'), 70); },
    /** 무전 — 잡음이 치고 송신 끝 삑 소리 */
    radio(end) {
      burst(end ? 0.12 : 0.22, 1800, 1.4, 0.07, 'bandpass', end ? 0.1 : 0.2);
      tone(end ? 1200 : 900, 0.05, 0.05, 'square');
    },
    /** 중계기 — 가동하는 동안 짧은 삑, 다 켜지면 높은 두 음 */
    relay(done) {
      if (done) { tone(880, 0.12, 0.12, 'triangle'); setTimeout(() => tone(1320, 0.22, 0.12, 'triangle'), 120); }
      else tone(660, 0.05, 0.05, 'triangle');
    },
    /** 뱃고동 — 낮게 길게 */
    horn() { tone(98, 2.2, 0.22, 'sawtooth', 92); tone(147, 2.2, 0.1, 'sawtooth', 140); },
    objective() { tone(520, 0.16, 0.16, 'triangle'); setTimeout(() => tone(780, 0.2, 0.15, 'triangle'), 110);
                  setTimeout(() => tone(1040, 0.3, 0.13, 'triangle'), 230); },
    win()       { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.42, 0.15, 'triangle'), i * 150)); },
    thunder()   { const keep = SRC; SRC = null; wet(0.6, () => burst(2.0, 190, 0.6, 0.34, 'lowpass', 1.9)); tone(48, 1.4, 0.14, 'sine', 22); SRC = keep; },
    click()     { burst(0.04, 2400, 2, 0.08, 'bandpass', 0.035); },
    beep()      { tone(880, 0.08, 0.1, 'triangle'); },
    /** 적이 가까울수록 강해지는 심장박동 — 트레일러의 마지막 장면 */
    heartbeat(intensity) {
      const v = 0.05 + 0.13 * intensity;
      tone(56, 0.17, v, 'sine', 34);
      setTimeout(() => tone(48, 0.22, v * 0.72, 'sine', 28), 165);
    },

    /** 음악 켜고 끄기 — 설정의 '음악' 을 따른다 */
    music(on) {
      if (!enabled || !ctx) return;
      on = on && (typeof SETTINGS === 'undefined' || SETTINGS.music);
      if (on && !music.on) {
        music.bus = ctx.createGain(); music.bus.gain.value = 0.0001; music.bus.connect(master);
        music.bus.gain.exponentialRampToValueAtTime(0.9, ctx.currentTime + 2);
        music.on = true; music.next = 0; music.step = 0;
        music.timer = setInterval(musicTick, 50);
      } else if (!on && music.on) {
        music.on = false; clearInterval(music.timer);
        const bus = music.bus, t = ctx.currentTime;
        bus.gain.cancelScheduledValues(t); bus.gain.setValueAtTime(Math.max(0.0001, bus.gain.value), t);
        bus.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
        setTimeout(() => { try { bus.disconnect(); } catch (e) {} }, 1000);
      }
    },
    /** 타이틀 · 메뉴의 주제 음악. 게임에 들어가면 연출 음악으로 그대로 이어진다 */
    menuMusic(on) {
      music.st.menu = !!on;
      if (on) { music.st.intensity = 0; music.st.boss = false; music.st.horde = false; music.st.weeper = 0; }
      if (on && !music.on) this.music(true);
    },
    /** 매 프레임 연출 상태를 넘긴다 */
    musicState(st) { Object.assign(music.st, st); },
    get musicOn() { return music.on; },

    mute(v) { enabled = !v; if (master) master.gain.value = masterLevel(); },
    /** 설정 화면에서 볼륨 슬라이더를 움직일 때 */
    applyVolume() { if (master) master.gain.value = masterLevel(); }
  };
})();
