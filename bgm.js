'use strict';
// =====================================================================
// 歌謡曲っぽいBGM（オリジナル曲を Web Audio でその場で鳴らす）
// イ短調・16小節ループ。ビブラートのかかったリード、ルートと5度のベース、
// ストリングス、裏拍のギターっぽいコード、ドラム、エコー。
// =====================================================================
const BGM = (() => {
  const BGM_VOL = 0.08;   // 効果音が聞こえるように控えめ
  const BPM = 108;
  const BEAT = 60 / BPM;
  const BAR = BEAT * 4;

  // コード進行（16小節）
  const CHORDS = ['Am', 'Am', 'Dm', 'Am', 'F', 'E7', 'Am', 'E7',
                  'Am', 'Dm', 'G', 'C', 'F', 'Dm', 'E7', 'Am'];
  const CHORD_NOTES = {
    Am: ['A2', 'A3', 'C4', 'E4'],
    Dm: ['D3', 'D4', 'F4', 'A4'],
    E7: ['E2', 'G#3', 'D4', 'E4'],
    F:  ['F2', 'A3', 'C4', 'F4'],
    G:  ['G2', 'B3', 'D4', 'G4'],
    C:  ['C3', 'G3', 'C4', 'E4'],
  };

  // メロディ（[音, 拍]、null は休符）
  const MELODY = [
    [['E5', 1.5], ['F5', 0.5], ['E5', 1], ['C5', 1]],
    [['B4', 0.5], ['C5', 0.5], ['B4', 0.5], ['A4', 0.5], ['A4', 2]],
    [['F4', 1], ['A4', 1], ['D5', 1.5], ['C5', 0.5]],
    [['B4', 1], ['C5', 0.5], ['B4', 0.5], ['A4', 2]],
    [['C5', 1.5], ['C5', 0.5], ['F5', 1], ['E5', 1]],
    [['E5', 0.5], ['F5', 0.5], ['E5', 0.5], ['D5', 0.5], ['B4', 2]],
    [['C5', 1], ['B4', 0.5], ['A4', 0.5], ['E5', 1.5], ['C5', 0.5]],
    [['B4', 1], ['G#4', 1], ['E4', 2]],
    [['A4', 0.5], ['C5', 0.5], ['E5', 1], ['A5', 1.5], ['G5', 0.5]],
    [['F5', 1], ['E5', 0.5], ['D5', 0.5], ['F5', 2]],
    [['D5', 1], ['B4', 0.5], ['D5', 0.5], ['G5', 1.5], ['F5', 0.5]],
    [['E5', 1], ['D5', 0.5], ['C5', 0.5], ['E5', 2]],
    [['F5', 1], ['F5', 0.5], ['E5', 0.5], ['D5', 1], ['C5', 1]],
    [['D5', 1], ['C5', 0.5], ['A4', 0.5], ['F5', 2]],
    [['E5', 1.5], ['D5', 0.5], ['B4', 1], ['G#4', 1]],
    [['A4', 3], [null, 1]],
  ];

  const NOTE_IDX = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  function freq(name) {
    const m = /^([A-G]#?)(\d)$/.exec(name);
    const midi = (Number(m[2]) + 1) * 12 + NOTE_IDX[m[1]];
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  let ctx = null, master = null, echoIn = null, noiseBuf = null;
  let playing = false, timer = 0, nextBarTime = 0, barIdx = 0;

  function setup(audioCtx) {
    if (ctx) return;
    ctx = audioCtx;
    master = ctx.createGain();
    master.gain.value = BGM_VOL;
    master.connect(window.sfxOut ? window.sfxOut(ctx) : ctx.destination);   // 効果音と同じリミッターを通す
    // エコー（歌謡曲らしい残響）
    echoIn = ctx.createGain();
    const delay = ctx.createDelay(1);
    delay.delayTime.value = BEAT * 0.75;
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const wet = ctx.createGain(); wet.gain.value = 0.35;
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 2400;
    echoIn.connect(delay); delay.connect(tone); tone.connect(fb); fb.connect(delay);
    tone.connect(wet); wet.connect(master);
    // ドラム用ノイズ
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  // ---------- 楽器 ----------
  function env(g, t, a, peak, dur, rel) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + Math.max(a, dur - rel));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + rel);
  }

  // リード：ビブラートのかかった、サックスっぽい音
  function lead(note, t, dur) {
    const f = freq(note);
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 2;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = f; o2.detune.value = 7;
    const vib = ctx.createOscillator(); vib.frequency.value = 5.6;
    const vibAmt = ctx.createGain();
    vibAmt.gain.setValueAtTime(0, t);
    vibAmt.gain.linearRampToValueAtTime(f * 0.012, t + Math.min(0.35, dur * 0.6)); // 後からかかるビブラート
    vib.connect(vibAmt); vibAmt.connect(o1.frequency); vibAmt.connect(o2.frequency);
    const m2 = ctx.createGain(); m2.gain.value = 0.5;
    o1.connect(lp); o2.connect(m2); m2.connect(lp); lp.connect(g);
    g.connect(master); g.connect(echoIn);
    env(g, t, 0.03, 0.16, dur * 0.95, 0.08);
    for (const o of [o1, o2, vib]) { o.start(t); o.stop(t + dur + 0.2); }
  }

  // ストリングス（やわらかいパッド）
  function strings(notes, t, dur) {
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500;
    lp.connect(g); g.connect(master); g.connect(echoIn);
    env(g, t, 0.35, 0.05, dur, 0.3);
    for (const n of notes.slice(1)) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.value = freq(n) * 2; o.detune.value = det;
        o.connect(lp); o.start(t); o.stop(t + dur + 0.4);
      }
    }
  }

  // 裏拍のギターっぽいカッティング
  function stab(notes, t) {
    const g = ctx.createGain();
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.8;
    bp.connect(g); g.connect(master);
    env(g, t, 0.005, 0.07, 0.08, 0.06);
    for (const n of notes.slice(1)) {
      const o = ctx.createOscillator(); o.type = 'square';
      o.frequency.value = freq(n);
      o.connect(bp); o.start(t); o.stop(t + 0.2);
    }
  }

  function bass(note, t, dur) {
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq(note);
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = freq(note);
    const m = ctx.createGain(); m.gain.value = 0.3;
    o.connect(lp); o2.connect(m); m.connect(lp); lp.connect(g); g.connect(master);
    env(g, t, 0.01, 0.32, dur * 0.85, 0.05);
    for (const x of [o, o2]) { x.start(t); x.stop(t + dur + 0.1); }
  }

  function kick(t) {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.45, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.2);
  }

  function noise(t, dur, vol, type, f) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const flt = ctx.createBiquadFilter(); flt.type = type; flt.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(flt); flt.connect(g); g.connect(master);
    s.start(t); s.stop(t + dur + 0.02);
  }
  const snare = (t) => { noise(t, 0.16, 0.22, 'bandpass', 1900); noise(t, 0.08, 0.1, 'highpass', 5000); };
  const hat = (t, open) => noise(t, open ? 0.12 : 0.04, 0.06, 'highpass', 7000);

  // ---------- 1小節ぶんを予約 ----------
  function scheduleBar(i, t0) {
    const chord = CHORD_NOTES[CHORDS[i]];
    // ベース：ルート→5度のズンチャ
    const root = chord[0];
    const fifth = { Am: 'E3', Dm: 'A2', E7: 'B2', F: 'C3', G: 'D3', C: 'G2' }[CHORDS[i]];
    [root, fifth, root, fifth].forEach((n, k) => bass(n, t0 + k * BEAT, BEAT));
    strings(chord, t0, BAR);
    for (let k = 0; k < 4; k++) stab(chord, t0 + k * BEAT + BEAT / 2);
    // ドラム
    for (let k = 0; k < 4; k++) {
      const t = t0 + k * BEAT;
      if (k % 2 === 0) kick(t); else snare(t);
      hat(t); hat(t + BEAT / 2, k === 3);
    }
    if (i % 4 === 3) { snare(t0 + BEAT * 3.5); snare(t0 + BEAT * 3.75); } // おかず
    // メロディ
    let t = t0;
    for (const [n, beats] of MELODY[i]) {
      if (n) lead(n, t, beats * BEAT);
      t += beats * BEAT;
    }
  }

  function tick() {
    while (nextBarTime < ctx.currentTime + 0.6) {
      scheduleBar(barIdx, nextBarTime);
      nextBarTime += BAR;
      barIdx = (barIdx + 1) % CHORDS.length;
    }
  }

  function start(audioCtx) {
    if (!audioCtx || playing) return;
    setup(audioCtx);
    if (ctx.state === 'suspended') ctx.resume();
    playing = true;
    barIdx = 0;
    nextBarTime = ctx.currentTime + 0.1;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(BGM_VOL, ctx.currentTime);
    tick();
    timer = setInterval(tick, 150);
  }

  function stop() {
    if (!playing) return;
    playing = false;
    clearInterval(timer);
    // すでに予約した音はフェードアウトで消す
    master.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
    setTimeout(() => {
      if (playing) return;
      master.disconnect();
      master = null; ctx = null; // 次回は作り直す
    }, 900);
  }

  return { start, stop, isPlaying: () => playing };
})();
