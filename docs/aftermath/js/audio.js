/* ═══════════════════════════════════════════
   AFTERMATH — 잔존 : 절차적 사운드
   외부 오디오 파일 없이 WebAudio 로 전부 합성한다.
   ═══════════════════════════════════════════ */
const SFX = (() => {
  let ctx = null, master = null, rainGain = null, rainSrc = null;
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
    src.connect(f); f.connect(g); g.connect(master);
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
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.03);
  }

  /* 거리에 따른 감쇠 — 화면 밖 소리는 작게 */
  const near = d => Math.max(0, 1 - d / 900);

  return {
    init, resume,
    get ready() { return !!ctx; },

    /** 빗소리 루프 시작 */
    rain(on) {
      if (!enabled || !ctx) return;
      if (on && !rainSrc) {
        rainSrc = ctx.createBufferSource();
        rainSrc.buffer = noiseBuf; rainSrc.loop = true;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass'; hp.frequency.value = 620;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 5200;
        rainGain = ctx.createGain(); rainGain.gain.value = 0.0;
        rainSrc.connect(hp); hp.connect(lp); lp.connect(rainGain);
        rainGain.connect(master);
        rainSrc.start();
        rainGain.gain.linearRampToValueAtTime(0.13, ctx.currentTime + 2.5);
      } else if (!on && rainSrc) {
        rainGain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
        const s = rainSrc; setTimeout(() => { try { s.stop(); } catch (e) {} }, 800);
        rainSrc = null;
      }
    },

    shot()      { burst(0.16, 1500, 1.1, 0.34, 'lowpass', 0.11); tone(150, 0.1, 0.16, 'square', 48); },
    shotgun()   { burst(0.42, 850, 0.8, 0.55, 'lowpass', 0.34); tone(96, 0.26, 0.26, 'square', 34);
                  setTimeout(() => burst(0.1, 3000, 2.5, 0.06, 'bandpass', 0.09), 260); },
    rifle()     { burst(0.5, 2200, 0.9, 0.5, 'lowpass', 0.2); tone(70, 0.3, 0.3, 'square', 30);
                  setTimeout(() => burst(0.9, 600, 0.6, 0.1, 'lowpass', 0.7), 60);      // 골목에 울리는 꼬리
                  setTimeout(() => burst(0.06, 2400, 3, 0.07, 'bandpass', 0.05), 520); },  // 노리쇠
    pistol()    { burst(0.13, 1100, 1.0, 0.22, 'lowpass', 0.09); tone(120, 0.08, 0.1, 'square', 44); },
    dry()       { burst(0.05, 3200, 3, 0.1, 'bandpass', 0.04); },
    hitFlesh(d) { burst(0.1, 420, 0.9, 0.2 * near(d), 'lowpass', 0.08); },
    hitWall(d)  { burst(0.07, 2600, 2.4, 0.14 * near(d), 'bandpass', 0.06); },
    explode()   { burst(0.9, 260, 0.7, 0.62, 'lowpass', 0.75); tone(74, 0.55, 0.34, 'sine', 26); },
    nadeThrow() { burst(0.12, 900, 1.2, 0.1, 'bandpass', 0.1); },

    /* 장전 · 근접 — 금속성 짧은 클릭과 둔탁한 타격 */
    reload()    { burst(0.07, 1800, 2.6, 0.12, 'bandpass', 0.06);
                  setTimeout(() => burst(0.09, 1150, 2.0, 0.10, 'bandpass', 0.08), 130); },
    reloadDone(){ burst(0.06, 2700, 3.2, 0.13, 'bandpass', 0.05);
                  setTimeout(() => tone(640, 0.05, 0.05, 'square'), 55); },
    melee()     { burst(0.14, 520, 1.1, 0.18, 'lowpass', 0.11); tone(112, 0.09, 0.08, 'square', 52); },
    meleeHit(d) { burst(0.22, 300, 0.8, 0.26 * near(d), 'lowpass', 0.18);
                  tone(84, 0.14, 0.12 * near(d), 'square', 38); },
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
    ambience(on) { this.rain(on); this.drone(on); },
    get droneOn() { return !!drone; },

    /** 명중 · 처치 확인음 — 짧고 높게, 귀에 거슬리지 않게 */
    hitTick(kill) {
      if (kill) { tone(1320, 0.07, 0.05, 'triangle', 880); }
      else      { burst(0.03, 4200, 4, 0.035, 'bandpass', 0.025); }
    },

    /* 발소리 — 젖은 아스팔트와 마른 보도를 구분한다 */
    step(sprint, wet) {
      const g = (sprint ? 0.055 : 0.032) * (wet ? 1.35 : 1);
      if (wet) burst(0.13, 2600, 1.4, g, 'bandpass', 0.1);
      else     burst(0.08, 900, 1.1, g, 'lowpass', 0.06);
    },

    /* 그것 — 포효 · 돌진 · 벽 충돌 */
    roar(d)     { const n = Math.max(0.35, near(d));
                  tone(42, 1.5, 0.3 * n, 'sawtooth', 24);
                  tone(63, 1.2, 0.17 * n, 'square', 31);
                  burst(1.4, 240, 0.7, 0.26 * n, 'lowpass', 1.3); },
    charge(d)   { const n = Math.max(0.3, near(d));
                  burst(0.6, 420, 0.8, 0.3 * n, 'lowpass', 0.55);
                  tone(96, 0.5, 0.14 * n, 'sawtooth', 58); },
    slam(d)     { const n = Math.max(0.3, near(d));
                  burst(0.8, 180, 0.6, 0.46 * n, 'lowpass', 0.7);
                  tone(54, 0.6, 0.26 * n, 'square', 22); },

    /* 뱉는 것 — 젖은 토악질과 산이 지글거리는 소리 */
    spit(d)     { const n = near(d); if (n <= 0.02) return;
                  burst(0.2, 900, 1.6, 0.16 * n, 'bandpass', 0.16);
                  tone(210, 0.16, 0.08 * n, 'sawtooth', 90); },
    spitHit(d)  { const n = near(d); if (n <= 0.02) return;
                  burst(0.5, 2200, 0.9, 0.14 * n, 'highpass', 0.46); },

    /** 기력이 바닥났을 때의 거친 숨 */
    gasp()      { burst(0.46, 780, 0.7, 0.13, 'bandpass', 0.42);
                  setTimeout(() => burst(0.3, 620, 0.8, 0.08, 'bandpass', 0.28), 300); },

    /** 무리의 습격 — 멀리서 겹쳐 터지는 비명과 땅울림. rel 은 시선 기준 방향(좌우 패닝) */
    horde(d, rel) {
      if (!enabled || !ctx) return;
      const n = Math.max(0.45, near(d * 0.6));
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      const out = pan || master;
      if (pan) { pan.pan.value = Math.max(-0.9, Math.min(0.9, Math.sin(rel))); pan.connect(master); }
      const t0 = ctx.currentTime;
      for (let i = 0; i < 6; i++) {
        const at = t0 + i * 0.11 + Math.random() * 0.15;
        const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
        o.type = 'sawtooth';
        const f0 = 330 + Math.random() * 260;
        o.frequency.setValueAtTime(f0, at);
        o.frequency.exponentialRampToValueAtTime(f0 * 0.42, at + 0.7);
        f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.8;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.09 * n, at + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.75);
        o.connect(f); f.connect(g); g.connect(out);
        o.start(at); o.stop(at + 0.8);
      }
      burst(1.6, 140, 0.7, 0.3 * n, 'lowpass', 1.5);              // 수많은 발이 구르는 땅울림
      tone(55, 1.2, 0.12 * n, 'sawtooth', 41);                    // 불협 저음
      tone(58.3, 1.2, 0.1 * n, 'sawtooth', 43);
    },

    /** 우는 것의 흐느낌 — 내려가는 두 음과 숨. 깨어날수록 높고 빠르다 */
    sob(d, k) {
      const n = near(d * 0.75); if (n <= 0.02) return;
      const f = 520 + k * 260;
      tone(f, 0.38, 0.05 * n, 'triangle', f * 0.72);
      setTimeout(() => tone(f * 0.9, 0.5, 0.045 * n, 'triangle', f * 0.6), 330);
      burst(0.3, 1400, 1.2, 0.03 * n, 'bandpass', 0.28);
    },
    /** 우는 것이 깨어날 때 — 찢어지는 비명 */
    wail(d) {
      const n = Math.max(0.5, near(d));
      tone(600, 1.1, 0.2 * n, 'sawtooth', 1500);
      tone(612, 1.1, 0.14 * n, 'square', 1480);
      burst(0.9, 2400, 0.8, 0.18 * n, 'bandpass', 0.85);
    },
    /** 부푼 것 — 배 속에서 끓는 소리 */
    gurgle(d) {
      const n = near(d); if (n <= 0.02) return;
      for (let i = 0; i < 3; i++) setTimeout(() => tone(70 + Math.random() * 40, 0.16, 0.08 * n, 'sine', 40), i * 120);
      burst(0.4, 260, 1.4, 0.06 * n, 'lowpass', 0.35);
    },
    /** 부푼 것이 터질 때 */
    burst(d) { const n = Math.max(0.3, near(d)); burst(0.6, 380, 0.7, 0.4 * n, 'lowpass', 0.5); tone(90, 0.3, 0.16 * n, 'sine', 40); },
    /** 담즙을 뒤집어쓸 때 */
    splat() { burst(0.5, 900, 0.8, 0.22, 'bandpass', 0.45); tone(140, 0.4, 0.1, 'sawtooth', 60); },

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

    growl(d)  { const n = near(d); if (n <= 0.02) return;
                tone(64 + Math.random() * 34, 0.5 + Math.random() * 0.35,
                     0.1 * n, 'sawtooth', 34 + Math.random() * 20);
                burst(0.42, 300, 0.8, 0.06 * n, 'lowpass', 0.4); },
    screech(d){ const n = near(d); if (n <= 0.02) return;
                tone(420 + Math.random() * 180, 0.35, 0.12 * n, 'sawtooth', 130); },
    zombieDie(d){ burst(0.34, 500, 0.7, 0.16 * near(d), 'lowpass', 0.3);
                  tone(96, 0.3, 0.07 * near(d), 'sawtooth', 40); },

    hurt()      { burst(0.3, 700, 0.8, 0.3, 'lowpass', 0.26); tone(180, 0.24, 0.14, 'sawtooth', 70); },
    death()     { tone(220, 1.5, 0.26, 'sawtooth', 32); burst(1.3, 420, 0.6, 0.24, 'lowpass', 1.2); },
    pickup()    { tone(720, 0.11, 0.15, 'triangle'); setTimeout(() => tone(1080, 0.13, 0.13, 'triangle'), 70); },
    objective() { tone(520, 0.16, 0.16, 'triangle'); setTimeout(() => tone(780, 0.2, 0.15, 'triangle'), 110);
                  setTimeout(() => tone(1040, 0.3, 0.13, 'triangle'), 230); },
    win()       { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.42, 0.15, 'triangle'), i * 150)); },
    thunder()   { burst(2.0, 190, 0.6, 0.34, 'lowpass', 1.9); tone(48, 1.4, 0.14, 'sine', 22); },
    click()     { burst(0.04, 2400, 2, 0.08, 'bandpass', 0.035); },
    beep()      { tone(880, 0.08, 0.1, 'square'); },
    /** 적이 가까울수록 강해지는 심장박동 — 트레일러의 마지막 장면 */
    heartbeat(intensity) {
      const v = 0.05 + 0.13 * intensity;
      tone(56, 0.17, v, 'sine', 34);
      setTimeout(() => tone(48, 0.22, v * 0.72, 'sine', 28), 165);
    },

    mute(v) { enabled = !v; if (master) master.gain.value = masterLevel(); },
    /** 설정 화면에서 볼륨 슬라이더를 움직일 때 */
    applyVolume() { if (master) master.gain.value = masterLevel(); }
  };
})();
