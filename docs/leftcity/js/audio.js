/* ═══════════════════════════════════════════
   LEFT CITY — 남겨진 도시 : 절차적 사운드
   외부 오디오 파일 없이 WebAudio 로 전부 합성한다.
   ═══════════════════════════════════════════ */
const SFX = (() => {
  let ctx = null, master = null, rainGain = null, rainSrc = null, rainNodes = null, weather = 'rain', stormK = 0;
  /** 날씨마다 배경 소음 — [고역 통과, 저역 통과, 크기]. 바람은 낮고 둥글게, 몬순은 크고 거칠게 */
  const WX = { rain: [620, 5200, 0.13], monsoon: [520, 6400, 0.19], fog: [700, 3600, 0.07], snow: [120, 700, 0.07], blizzard: [140, 900, 0.1], sandstorm: [180, 1300, 0.09] };
  let drone = null;                   // { oscs, filt, gain, lfo } — 낮게 깔리는 위협음
  let noiseBuf = null, enabled = true;

  /** 이 아래로는 들리지도 않고, exponentialRampToValueAtTime 이 0 을 거부한다 */
  const SILENT = 0.0005;

  /** 설정의 0‒100 볼륨을 게인으로. 0 이면 완전 무음 */
  function masterLevel() {
    const v = (typeof SETTINGS !== 'undefined' ? SETTINGS.volume : 55) / 100;
    return enabled ? v * 0.55 : 0;
  }

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { enabled = false; return; }
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = masterLevel();
    master.connect(ctx.destination);
    noiseBuf = makeNoise(2.0);
  }

  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

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
  let srcPan = 0;
  function outTo(node) {
    if (srcPan && ctx.createStereoPanner) {
      const sp = ctx.createStereoPanner(); sp.pan.value = srcPan;
      node.connect(sp); sp.connect(master);
    } else node.connect(master);
  }

  /** 노이즈 한 번 재생 (타격감·폭발·발소리용) */
  function burst(dur, freq, q, gain, type = 'lowpass', decay) {
    if (!enabled || !ctx) return;
    if (!(gain > SILENT)) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.5;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (decay || dur));
    src.connect(f); f.connect(g); outTo(g);
    src.start(t); src.stop(t + dur + 0.05);
  }

  /** 사인/톱니 톤 (짐승 울음·UI음) */
  function tone(freq, dur, gain, type = 'sine', slideTo) {
    if (!enabled || !ctx) return;
    if (!(gain > SILENT)) return;        // 들리지도 않는 소리에 노드를 만들지 않는다
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const t = ctx.currentTime;
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); outTo(g);
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
    if (!(gain > SILENT) || voices >= 8) return;          // 한꺼번에 여덟 목소리까지 — 무리 속에서 소리가 뭉개지지 않게
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
    outTo(env);
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
    while (music.next < now + 0.25) {
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
    pan(dx) { srcPan = dx ? Math.max(-0.85, Math.min(0.85, dx / 420)) : 0; },
    get ready() { return !!ctx; },

    /** 빗소리 루프 시작 */
    rain(on) {
      if (!enabled || !ctx) return;
      if (on && !rainSrc) {
        rainSrc = ctx.createBufferSource();
        rainSrc.buffer = noiseBuf; rainSrc.loop = true;
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
        rainGain.gain.linearRampToValueAtTime(W[2], ctx.currentTime + 2.5);
      } else if (!on && rainSrc) {
        rainGain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
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
    shot()      { burst(0.16, 1500, 1.1, 0.34, 'lowpass', 0.11); tone(150, 0.1, 0.2, 'sine', 48); },
    shotgun()   { burst(0.42, 850, 0.8, 0.55, 'lowpass', 0.34); tone(96, 0.26, 0.3, 'sine', 34);
                  setTimeout(() => burst(0.1, 3000, 2.5, 0.06, 'bandpass', 0.09), 260); },
    rifle()     { burst(0.5, 2200, 0.9, 0.5, 'lowpass', 0.2); tone(70, 0.3, 0.34, 'sine', 30);
                  setTimeout(() => burst(0.9, 600, 0.6, 0.1, 'lowpass', 0.7), 60);      // 골목에 울리는 꼬리
                  setTimeout(() => burst(0.06, 2400, 3, 0.07, 'bandpass', 0.05), 520); },  // 노리쇠
    pistol()    { burst(0.13, 1100, 1.0, 0.22, 'lowpass', 0.09); tone(120, 0.08, 0.13, 'sine', 44); },
    dry()       { burst(0.05, 3200, 3, 0.1, 'bandpass', 0.04); },
    hitFlesh(d) { burst(0.1, 420, 0.9, 0.2 * near(d), 'lowpass', 0.08); },
    hitWall(d)  { burst(0.07, 2600, 2.4, 0.14 * near(d), 'bandpass', 0.06); },
    explode()   { burst(0.9, 260, 0.7, 0.62, 'lowpass', 0.75); tone(74, 0.55, 0.34, 'sine', 26); },
    nadeThrow() { burst(0.12, 900, 1.2, 0.1, 'bandpass', 0.1); },

    /* 장전 · 근접 — 금속성 짧은 클릭과 둔탁한 타격 */
    reload()    { burst(0.07, 1800, 2.6, 0.12, 'bandpass', 0.06);
                  setTimeout(() => burst(0.09, 1150, 2.0, 0.10, 'bandpass', 0.08), 130); },
    reloadDone(){ burst(0.06, 2700, 3.2, 0.13, 'bandpass', 0.05);
                  setTimeout(() => tone(640, 0.05, 0.05, 'triangle'), 55); },
    melee()     { burst(0.14, 520, 1.1, 0.18, 'lowpass', 0.11); tone(112, 0.09, 0.1, 'sine', 52); },
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
    ambience(on) { this.rain(on); this.drone(on); this.music(on); },
    get droneOn() { return !!drone; },

    /** 명중 · 처치 확인음 — 짧고 높게, 귀에 거슬리지 않게 */
    hitTick(kill) {
      if (kill) { tone(1320, 0.07, 0.05, 'triangle', 880); }
      else      { burst(0.03, 4200, 4, 0.035, 'bandpass', 0.025); }
    },

    /* 발소리 — 젖은 아스팔트와 마른 보도를 구분한다 */
    /* 땅마다: 1 모래(사각) · 2 얼음(뽀득) · 3 물(첨벙) · 4 용암 겉껍질(바삭) · 5 진흙(철벅). 눈 도시의 보도는 눈 밟는 소리 */
    step(sprint, wet, terr, wx) {
      const g = (sprint ? 0.055 : 0.032) * (wet ? 1.35 : 1);
      if (terr === 3) { burst(0.22, 1300, 0.9, g * 1.9, 'bandpass', 0.18); burst(0.08, 3400, 2, g * 0.7, 'bandpass', 0.06); }
      else if (terr === 5) { burst(0.18, 380, 1.2, g * 1.8, 'lowpass', 0.14); tone(90, 0.06, g * 0.4, 'sine', 60); }
      else if (terr === 1) burst(0.14, 1800, 0.6, g * 1.1, 'highpass', 0.12);
      else if (terr === 2) { burst(0.05, 4200, 3, g * 1.2, 'bandpass', 0.04); burst(0.05, 2800, 3, g * 0.8, 'bandpass', 0.04); }
      else if (terr === 4) burst(0.09, 2200, 1.6, g * 1.2, 'bandpass', 0.07);
      else if (wx === 'snow' || wx === 'blizzard') burst(0.11, 2400, 1.3, g * 1.1, 'bandpass', 0.09);
      else if (wet) burst(0.13, 2600, 1.4, g, 'bandpass', 0.1);
      else     burst(0.08, 900, 1.1, g, 'lowpass', 0.06);
    },

    /* 그것 — 포효 · 돌진 · 벽 충돌 */
    roar(d)     { const n = Math.max(0.35, near(d));
                  voice({ f0: 70, f1: 42, dur: 1.6, gain: 0.5 * n, vowel: 'a', to: 'o', size: 0.62, rasp: 0.9, fry: 22, fryAmt: 0.55, attack: 0.12, hold: 0.55 });
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
        voice({ delay: i * 0.12 + Math.random() * 0.15, f0, f1: f0 * 0.5, dur: 0.8 + Math.random() * 0.4, gain: 0.12 * n, vowel: ['a', 'ae', 'o'][i % 3], to: 'uh', rasp: 0.8, size: 0.9 + Math.random() * 0.2, fryAmt: 0.45 });
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
      voice({ f0: 520, f1: 980, dur: 1.2, gain: 0.32 * n, vowel: 'a', to: 'ae', size: 1.2, rasp: 0.8, shake: 1.6, fryAmt: 0.3, attack: 0.04, hold: 0.6, bright: 4200 });
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
      voice({ f0: 640, f1: 900, dur: 1.4, gain: 0.32 * n, vowel: 'ae', to: 'a', size: 1.12, rasp: 0.95, shake: 1.4, fryAmt: 0.35, attack: 0.03, hold: 0.7, bright: 4600 });
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
      for (let i = 0; i < 24; i++) setTimeout(() => tone(i % 2 ? 740 : 980, 0.24, 0.07 * n, 'square'), i * 250);
    },
    /** 크게 다쳤을 때의 거친 숨 */
    breath() {
      burst(0.5, 620, 0.8, 0.07, 'bandpass', 0.45);
      setTimeout(() => burst(0.4, 480, 0.8, 0.05, 'bandpass', 0.36), 620);
    },

    /* 감염체 — 목이 막힌 듯 낮게 그르렁 · 뛰는 것은 쉰 비명 · 쓰러질 때 숨이 빠지는 소리. 매번 높이 · 모음 · 길이가 다르다 */
    growl(d)  { const n = near(d); if (n <= 0.02) return;
                const f0 = 85 + Math.random() * 45;
                voiceAt(n, { f0, f1: f0 * (0.55 + Math.random() * 0.2), dur: 0.6 + Math.random() * 0.5, gain: 0.36, vowel: ['uh', 'o', 'a'][Math.random() * 3 | 0], to: 'u', size: 0.82 + Math.random() * 0.15, rasp: 0.75, fryAmt: 0.5, attack: 0.08 });
                burst(0.42, 300, 0.8, 0.04 * n, 'lowpass', 0.4); },
    screech(d){ const n = near(d); if (n <= 0.02) return;
                const f0 = 300 + Math.random() * 140;
                voiceAt(n, { f0, f1: f0 * 0.55, dur: 0.4 + Math.random() * 0.2, gain: 0.3, vowel: 'a', to: 'uh', rasp: 1.0, fryAmt: 0.4, attack: 0.02, bright: 4200 }); },
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
    thunder()   { burst(2.0, 190, 0.6, 0.34, 'lowpass', 1.9); tone(48, 1.4, 0.14, 'sine', 22); },
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
