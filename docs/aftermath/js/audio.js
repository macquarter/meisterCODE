/* ═══════════════════════════════════════════
   AFTERMATH — 잔존 : 절차적 사운드
   외부 오디오 파일 없이 WebAudio 로 전부 합성한다.
   ═══════════════════════════════════════════ */
const SFX = (() => {
  let ctx = null, master = null, rainGain = null, rainSrc = null;
  let noiseBuf = null, enabled = true;

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { enabled = false; return; }
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
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
    pistol()    { burst(0.13, 1100, 1.0, 0.22, 'lowpass', 0.09); tone(120, 0.08, 0.1, 'square', 44); },
    dry()       { burst(0.05, 3200, 3, 0.1, 'bandpass', 0.04); },
    hitFlesh(d) { burst(0.1, 420, 0.9, 0.2 * near(d), 'lowpass', 0.08); },
    hitWall(d)  { burst(0.07, 2600, 2.4, 0.14 * near(d), 'bandpass', 0.06); },
    explode()   { burst(0.9, 260, 0.7, 0.62, 'lowpass', 0.75); tone(74, 0.55, 0.34, 'sine', 26); },
    nadeThrow() { burst(0.12, 900, 1.2, 0.1, 'bandpass', 0.1); },

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

    mute(v) { enabled = !v; if (master) master.gain.value = v ? 0 : 0.55; }
  };
})();
