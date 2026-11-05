'use strict';

// ===================== 設定 =====================
const DAY_LEN = 180;          // 営業時間（実時間・秒）
const SEAT_COUNT = 6;          // カウンター6席（どんぶりも3列×2行）
const CUP_COUNT = 3;            // トレーに並べるコップの数（見た目）
const POT_CAP = 6;            // 麺茹で機のてぼ（麺かご）の数
const BOIL_TIME = 6;          // 茹で上がりまでの秒数（ピピッと鳴る）
const OVER_TIME = 6;          // ピピッから何秒で茹ですぎ（ゴミ）になるか
const COST_NOODLE = 100;      // 茹ですぎの麺を捨てたときの損失
const COST_BOWL = 300;        // ラーメンを捨てたときの損失
const EAT_TIME = 4;          // 食べ終わるまでの秒数
const WATER_BONUS = 6;        // 水を出すと待てる時間が少し延びる（秒）

const TOPPINGS = [
  { key: 'chashu', name: 'チャーシュー', hotkey: 'A' },
  { key: 'negi',   name: 'ネギ',         hotkey: 'S' },
];

const MENU = {
  // rec: その具を1タップするかどうか（1 = のせる、0 = のせない）
  ramen:      { name: 'ラーメン',             price: 800,  weight: 4, rec: { chashu: 0, negi: 0 } },
  chashumen:  { name: 'チャーシューメン',     price: 1100, weight: 3, rec: { chashu: 1, negi: 0 } },
  negiramen:  { name: 'ネギラーメン',         price: 950,  weight: 3, rec: { chashu: 0, negi: 1 } },
  negichashu: { name: 'ネギチャーシューメン', price: 1250, weight: 2, rec: { chashu: 1, negi: 1 } },
};

const FACES = ['👨', '👩', '👴', '👵', '🧑', '👦', '👧', '🧔', '👱', '👨‍🦰', '👩‍🦱', '🧑‍💼', '👷', '🧑‍🎓'];

// どんぶりの中の具の配置（%）
const TOP_POS = {
  chashu: [[20, 24], [46, 16], [58, 42], [26, 50]],
  negi:   [[42, 36], [60, 22], [36, 60]],
};

// ===================== 状態 =====================
let S = null;
let lastTs = 0;
let running = false;
let nextId = 1;

// どんぶり：お客さん1人につき1つ、空の状態で厨房正面に出てくる
// fly = 飛んでいる途中の具（着地するまで描かない）
function newBowl() {
  return { soup: false, men: false, tops: { chashu: 0, negi: 0 }, fly: { chashu: 0, negi: 0 } };
}

function newGame() {
  S = {
    t: 0,
    money: 0,
    rep: 3.0,
    served: 0,
    perfect: 0,
    angry: 0,
    walked: 0,
    garbage: 0,
    waste: 0,
    queue: [],
    seats: Array(SEAT_COUNT).fill(null),
    pot: Array(POT_CAP).fill(null),   // 茹で鍋の中のてぼ: null | { t: 茹で経過秒, beeped }
    bowls: Array(SEAT_COUNT).fill(null),  // 席ごとのどんぶり（お客さんがいる席だけ）
    active: -1,                            // 選択中のどんぶり（席番号）
    spawnT: 1.5,
    sales: {},
  };
  for (const k in MENU) S.sales[k] = 0;
}

// ===================== ユーティリティ =====================
const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const yen = (n) => (n < 0 ? '-¥' : '¥') + Math.abs(n).toLocaleString();

function pickWeighted(obj) {
  const keys = Object.keys(obj);
  const total = keys.reduce((s, k) => s + obj[k].weight, 0);
  let r = Math.random() * total;
  for (const k of keys) { r -= obj[k].weight; if (r <= 0) return k; }
  return keys[0];
}

let toastTimer = 0;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1400);
}

// ---------- 効果音 ----------
let actx = null;
let sfxNoise = null;
// ノイズで水の音を作る（フィルターの周波数を f0 → f1 に動かす）
function noiseBurst(a, t, dur, vol, type, f0, f1) {
  if (!sfxNoise) {
    sfxNoise = a.createBuffer(1, a.sampleRate * 0.3, a.sampleRate);
    const d = sfxNoise.getChannelData(0);
    for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
  }
  const src = a.createBufferSource(); src.buffer = sfxNoise; src.loop = true;
  const f = a.createBiquadFilter(); f.type = type; f.Q.value = 1;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(a.destination);
  src.start(t); src.stop(t + dur + 0.02);
}
let offlineCtx = null;   // 効果音を前もって録音するときの入れもの
function getAudio() {
  if (offlineCtx) return offlineCtx;
  try {
    if (!actx) {
      // 反応を速くするため、いちばん低遅延の設定で作る
      const AC = window.AudioContext || window.webkitAudioContext;
      try { actx = new AC({ latencyHint: 'interactive' }); } catch (e) { actx = new AC(); }
    }
    if (actx.state === 'suspended') actx.resume();
  } catch (e) { actx = null; }
  return actx;
}

// ---------- BGM（歌謡曲ふう） ----------
let bgmOn = true;
try { bgmOn = localStorage.getItem('ramen-bgm') !== 'off'; } catch (e) { /* 保存できなくても続行 */ }
function updateBgmBtn() {
  const b = $('bgmBtn');
  b.innerHTML = bgmOn ? '🎵<span class="lbl"> BGM ON</span>' : '🔇<span class="lbl"> BGM OFF</span>';
  b.classList.toggle('off', !bgmOn);
}
function toggleBgm() {
  bgmOn = !bgmOn;
  try { localStorage.setItem('ramen-bgm', bgmOn ? 'on' : 'off'); } catch (e) { /* 保存できなくても続行 */ }
  if (bgmOn && running) BGM.start(getAudio()); else BGM.stop();
  updateBgmBtn();
}
function beep(freq, dur = 0.08, type = 'square', vol = 0.05) {
  try {
    getAudio();
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    o.connect(g); g.connect(actx.destination);
    o.start(); o.stop(actx.currentTime + dur);
  } catch (e) { /* 音が出せなくても続行 */ }
}
const sfx = {
  tap:   () => beep(660, 0.05),
  // 茹で上がりの「ピピッ」：大きく、はっきり2回
  pipi: () => {
    const a = getAudio(); if (!a) return;
    try {
      const t0 = a.currentTime;
      [0, 0.13].forEach((d) => {
        const t = t0 + d;
        for (const [f, type, v] of [[2093, 'square', 0.13], [4186, 'sine', 0.05]]) {
          const o = a.createOscillator(), g = a.createGain();
          o.type = type; o.frequency.value = f;
          g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.004);
          g.gain.setValueAtTime(v, t + 0.07); g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
          o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.11);
        }
      });
    } catch (e) { /* 音が出せなくても続行 */ }
  },
  drain: () => { beep(240, 0.06, 'triangle', 0.08); setTimeout(() => beep(260, 0.06, 'triangle', 0.08), 110); },
  // 湯切りの「パッパ」：お湯をはじく短い水しぶきの音を2回
  pappa: () => {
    const a = getAudio(); if (!a) return;
    try {
      if (!sfxNoise) {
        sfxNoise = a.createBuffer(1, a.sampleRate * 0.3, a.sampleRate);
        const d = sfxNoise.getChannelData(0);
        for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
      }
      const splash = (t, vol) => {
        const src = a.createBufferSource(); src.buffer = sfxNoise;
        const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
        bp.frequency.setValueAtTime(2600, t); bp.frequency.exponentialRampToValueAtTime(700, t + 0.09);
        const gn = a.createGain();
        gn.gain.setValueAtTime(0.0001, t); gn.gain.linearRampToValueAtTime(vol, t + 0.006);
        gn.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
        src.connect(bp); bp.connect(gn); gn.connect(a.destination);
        src.start(t); src.stop(t + 0.13);
        // 「パッ」の破裂感
        const o = a.createOscillator(), og = a.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(320, t); o.frequency.exponentialRampToValueAtTime(110, t + 0.05);
        og.gain.setValueAtTime(vol * 0.9, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        o.connect(og); og.connect(a.destination); o.start(t); o.stop(t + 0.07);
      };
      const t0 = a.currentTime;
      splash(t0, 0.35);
      splash(t0 + 0.17, 0.3);
    } catch (e) { /* 音が出せなくても続行 */ }
  },
  water: () => beep(1500, 0.06, 'sine', 0.05),
  // スープを注ぐ「ジュワ」：熱いスープがどんぶりに広がる、泡立つような音
  juwa: () => {
    const a = getAudio(); if (!a) return;
    try {
      if (!sfxNoise) {
        sfxNoise = a.createBuffer(1, a.sampleRate * 0.3, a.sampleRate);
        const d = sfxNoise.getChannelData(0);
        for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
      }
      const t0 = a.currentTime, dur = 0.55;
      // 注いだ瞬間の「ジャッ」：最初の一瞬だけ広い帯域で強く鳴らす
      noiseBurst(a, t0, 0.09, 0.3, 'highpass', 1500, 3500);
      const src = a.createBufferSource(); src.buffer = sfxNoise; src.loop = true;
      const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9;
      bp.frequency.setValueAtTime(5500, t0); bp.frequency.exponentialRampToValueAtTime(1800, t0 + dur);
      const gn = a.createGain();
      // タップした瞬間に「ジュッ」と立ち上がる
      gn.gain.setValueAtTime(0.32, t0);
      gn.gain.setValueAtTime(0.24, t0 + 0.12); gn.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      // 「ジュ」のざらつき：音量を細かくふるわせる
      const lfo = a.createOscillator(), lg = a.createGain();
      lfo.frequency.value = 38; lg.gain.value = 0.08;
      lfo.connect(lg); lg.connect(gn.gain);
      src.connect(bp); bp.connect(gn); gn.connect(a.destination);
      src.start(t0); src.stop(t0 + dur + 0.05); lfo.start(t0); lfo.stop(t0 + dur + 0.05);
      // 泡がはじける小さな音
      for (let k = 0; k < 7; k++) {
        const t = t0 + 0.02 + Math.random() * 0.35;
        const o = a.createOscillator(), og = a.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(900 + Math.random() * 900, t); o.frequency.exponentialRampToValueAtTime(400, t + 0.03);
        og.gain.setValueAtTime(0.05, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        o.connect(og); og.connect(a.destination); o.start(t); o.stop(t + 0.05);
      }
    } catch (e) { /* 音が出せなくても続行 */ }
  },
  // 麺を入れる「チャポン」：てぼが湯に沈む音と、ぐつぐつ泡立つ音
  chapon: () => {
    const a = getAudio(); if (!a) return;
    try {
      if (!sfxNoise) {
        sfxNoise = a.createBuffer(1, a.sampleRate * 0.3, a.sampleRate);
        const d = sfxNoise.getChannelData(0);
        for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
      }
      const t0 = a.currentTime;
      // ポチャン：音程がすっと上がる水滴の音
      const o = a.createOscillator(), og = a.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(260, t0); o.frequency.exponentialRampToValueAtTime(720, t0 + 0.09);
      og.gain.setValueAtTime(0.0001, t0); og.gain.linearRampToValueAtTime(0.32, t0 + 0.01);
      og.gain.exponentialRampToValueAtTime(0.001, t0 + 0.16);
      o.connect(og); og.connect(a.destination); o.start(t0); o.stop(t0 + 0.18);
      // ザブッ：水しぶき
      const src = a.createBufferSource(); src.buffer = sfxNoise;
      const lp = a.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(3000, t0); lp.frequency.exponentialRampToValueAtTime(500, t0 + 0.25);
      const ng = a.createGain();
      ng.gain.setValueAtTime(0.0001, t0); ng.gain.linearRampToValueAtTime(0.25, t0 + 0.01);
      ng.gain.exponentialRampToValueAtTime(0.001, t0 + 0.28);
      src.connect(lp); lp.connect(ng); ng.connect(a.destination); src.start(t0); src.stop(t0 + 0.3);
      // ぐつぐつ：小さな泡の音
      for (let k = 0; k < 6; k++) {
        const t = t0 + 0.15 + k * 0.07 + Math.random() * 0.04;
        const b = a.createOscillator(), bg = a.createGain();
        b.type = 'sine'; b.frequency.setValueAtTime(380 + Math.random() * 260, t); b.frequency.exponentialRampToValueAtTime(900, t + 0.04);
        bg.gain.setValueAtTime(0.07, t); bg.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        b.connect(bg); bg.connect(a.destination); b.start(t); b.stop(t + 0.06);
      }
    } catch (e) { /* 音が出せなくても続行 */ }
  },
  // てぼをお湯から引き上げる「ザバッ」（お湯がこぼれ落ちる）
  lift: () => {
    const a = getAudio(); if (!a) return;
    try {
      const t0 = a.currentTime;
      noiseBurst(a, t0, 0.4, 0.3, 'lowpass', 2600, 700);
    } catch (e) { /* 音が出せなくても続行 */ }
  },
  // 湯切り「チャッ、チャッ、チャッ」：てぼを振るたびにお湯が飛ぶ音（アニメの振りに合わせる）＋しずく
  yukiri: () => {
    const a = getAudio(); if (!a) return;
    try {
      const t0 = a.currentTime;
      [0.15, 0.25, 0.34].forEach((d, k) => {   // アニメの「チャッ」と同じタイミング（テンポよく）
        const t = t0 + d, v = 0.5 - k * 0.08;
        noiseBurst(a, t, 0.13, v, 'bandpass', 3200, 900);
        const o = a.createOscillator(), og = a.createGain();   // 「チャッ」のアタック
        o.type = 'triangle'; o.frequency.setValueAtTime(420, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.05);
        og.gain.setValueAtTime(v * 0.7, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
        o.connect(og); og.connect(a.destination); o.start(t); o.stop(t + 0.08);
      });
      for (let k = 0; k < 4; k++) {   // ぽたぽた
        const t = t0 + 0.45 + k * 0.08;
        const o = a.createOscillator(), og = a.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(1200 + k * 150, t); o.frequency.exponentialRampToValueAtTime(2200, t + 0.03);
        og.gain.setValueAtTime(0.05, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        o.connect(og); og.connect(a.destination); o.start(t); o.stop(t + 0.05);
      }
    } catch (e) { /* 音が出せなくても続行 */ }
  },
  // チャーシューがどんぶりに着く「ポトッ」：やわらかく重い音＋スープがはねる
  chashuLand: (k = 0) => {
    const a = getAudio(); if (!a) return;
    try {
      const t = a.currentTime;
      const o = a.createOscillator(), og = a.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(190 - k * 10, t); o.frequency.exponentialRampToValueAtTime(75, t + 0.12);
      og.gain.setValueAtTime(0.0001, t); og.gain.linearRampToValueAtTime(0.38, t + 0.006);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      o.connect(og); og.connect(a.destination); o.start(t); o.stop(t + 0.18);
      noiseBurst(a, t, 0.12, 0.12, 'bandpass', 1600, 500);   // ぴちゃ
    } catch (e) { /* 音が出せなくても続行 */ }
  },
  // ネギがのる「パラッ」：軽くて細かい音
  negiLand: (k = 0) => {
    const a = getAudio(); if (!a) return;
    try {
      const t = a.currentTime;
      noiseBurst(a, t, 0.08, 0.16, 'highpass', 4500, 2500);
      for (let m = 0; m < 3; m++) {
        const tt = t + m * 0.022 + Math.random() * 0.01;
        const o = a.createOscillator(), og = a.createGain();
        o.type = 'triangle'; o.frequency.value = 1800 + Math.random() * 1400;
        og.gain.setValueAtTime(0.05, tt); og.gain.exponentialRampToValueAtTime(0.001, tt + 0.03);
        o.connect(og); og.connect(a.destination); o.start(tt); o.stop(tt + 0.04);
      }
    } catch (e) { /* 音が出せなくても続行 */ }
  },
  // ラーメンが飛んでいく「シュッ」
  whoosh: () => {
    const a = getAudio(); if (!a) return;
    try { noiseBurst(a, a.currentTime, 0.32, 0.22, 'bandpass', 700, 3800); } catch (e) { /* 音が出せなくても続行 */ }
  },
  // どんぶりをカウンターに置く「ゴトッ」：陶器の重い音と、短い響き
  bowlDown: () => {
    const a = getAudio(); if (!a) return;
    try {
      const t = a.currentTime;
      const o = a.createOscillator(), og = a.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.1);
      og.gain.setValueAtTime(0.0001, t); og.gain.linearRampToValueAtTime(0.45, t + 0.004);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(og); og.connect(a.destination); o.start(t); o.stop(t + 0.2);
      for (const [f, v, d] of [[1180, 0.07, 0.25], [2650, 0.04, 0.18]]) {   // 陶器の「コン」
        const r = a.createOscillator(), rg = a.createGain();
        r.type = 'sine'; r.frequency.value = f;
        rg.gain.setValueAtTime(v, t); rg.gain.exponentialRampToValueAtTime(0.001, t + d);
        r.connect(rg); rg.connect(a.destination); r.start(t); r.stop(t + d + 0.02);
      }
      noiseBurst(a, t, 0.06, 0.12, 'lowpass', 2000, 600);
    } catch (e) { /* 音が出せなくても続行 */ }
  },
  // 食べ終わって帰る「ごちそうさま」：明るい2音のチャイム＋引き戸がガラガラ
  thanks: () => {
    const a = getAudio(); if (!a) return;
    try {
      const t = a.currentTime;
      [[880, 0], [1175, 0.13]].forEach(([f, d]) => {
        const o = a.createOscillator(), og = a.createGain();
        o.type = 'triangle'; o.frequency.value = f;
        og.gain.setValueAtTime(0.0001, t + d); og.gain.linearRampToValueAtTime(0.13, t + d + 0.01);
        og.gain.exponentialRampToValueAtTime(0.001, t + d + 0.35);
        o.connect(og); og.connect(a.destination); o.start(t + d); o.stop(t + d + 0.4);
      });
      for (let k = 0; k < 7; k++) noiseBurst(a, t + 0.3 + k * 0.045, 0.05, 0.07, 'bandpass', 900, 600);   // ガラガラ
    } catch (e) { /* 音が出せなくても続行 */ }
  },
  // 怒って帰る：引き戸をピシャッと閉める音
  slam: () => {
    const a = getAudio(); if (!a) return;
    try {
      const t = a.currentTime;
      for (let k = 0; k < 4; k++) noiseBurst(a, t + k * 0.03, 0.04, 0.09, 'bandpass', 1000, 700);
      noiseBurst(a, t + 0.14, 0.12, 0.35, 'lowpass', 1800, 300);
      const o = a.createOscillator(), og = a.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(120, t + 0.14); o.frequency.exponentialRampToValueAtTime(60, t + 0.3);
      og.gain.setValueAtTime(0.4, t + 0.14); og.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      o.connect(og); og.connect(a.destination); o.start(t + 0.14); o.stop(t + 0.34);
    } catch (e) { /* 音が出せなくても続行 */ }
  },
  // 氷がカランコロンと鳴る音（コップを出すとき）
  ice: () => {
    const a = getAudio(); if (!a) return;
    try {
      const clink = (t, f, vol) => {
        for (const [m, v] of [[1, 1], [2.76, 0.5], [5.4, 0.25]]) {   // 金属っぽくない、澄んだ倍音
          const o = a.createOscillator(), gn = a.createGain();
          o.type = 'sine'; o.frequency.value = f * m;
          gn.gain.setValueAtTime(0.0001, t); gn.gain.linearRampToValueAtTime(vol * v, t + 0.003);
          gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.25 / m + 0.08);
          o.connect(gn); gn.connect(a.destination); o.start(t); o.stop(t + 0.4);
        }
      };
      const t0 = a.currentTime;
      clink(t0, 2300, 0.16);
      clink(t0 + 0.09, 2900, 0.12);
      clink(t0 + 0.2, 2550, 0.1);
      clink(t0 + 0.27, 3300, 0.07);
    } catch (e) { /* 音が出せなくても続行 */ }
  },
  chime: () => { beep(1046, 0.1, 'triangle', 0.08); setTimeout(() => beep(1318, 0.18, 'triangle', 0.08), 90); },
  trash: () => beep(200, 0.15, 'sawtooth', 0.05),
  bad:   () => beep(140, 0.25, 'sawtooth', 0.06),
  door:  () => beep(880, 0.06, 'sine', 0.04),

  // ---- お客さんの反応 ----
  // 早くてうまい！：明るいファンファーレ＋キラキラ＋小銭の音
  great: () => {
    const notes = [[784, 0], [988, 90], [1175, 180], [1568, 270]];
    for (const [f, t] of notes) setTimeout(() => { beep(f, 0.14, 'triangle', 0.09); beep(f * 2, 0.1, 'sine', 0.025); }, t);
    setTimeout(() => { beep(1568, 0.5, 'triangle', 0.08); beep(1976, 0.5, 'sine', 0.05); beep(2349, 0.5, 'sine', 0.035); }, 380);
    for (let k = 0; k < 6; k++) setTimeout(() => beep(2600 + Math.random() * 1600, 0.05, 'sine', 0.03), 420 + k * 55);
    sfx.coins(560);
  },
  // うまい：やさしいチャイム＋小銭
  good: () => {
    beep(1046, 0.1, 'triangle', 0.08); setTimeout(() => beep(1318, 0.2, 'triangle', 0.08), 100);
    sfx.coins(260);
  },
  // 待たされた：低く沈む「ん〜…」＋小銭（少しだけ）
  meh: () => {
    beep(392, 0.18, 'triangle', 0.07); setTimeout(() => beep(330, 0.3, 'triangle', 0.06), 170);
    setTimeout(() => beep(1300, 0.06, 'sine', 0.03), 520);
  },
  // 注文とちがう：ブブーッ
  wrong: () => { beep(150, 0.18, 'square', 0.06); setTimeout(() => beep(150, 0.3, 'square', 0.06), 230); },
  // 熱っ！：ぴょこっと上がる声
  hot: () => {
    try {
      const a = getAudio(); if (!a) return;
      const o = a.createOscillator(), gn = a.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(600, a.currentTime); o.frequency.exponentialRampToValueAtTime(1500, a.currentTime + 0.15);
      gn.gain.setValueAtTime(0.07, a.currentTime); gn.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.2);
      o.connect(gn); gn.connect(a.destination); o.start(); o.stop(a.currentTime + 0.22);
    } catch (e) { /* 音が出せなくても続行 */ }
  },
  // お水おかわり：ぽこぽこ
  refill: () => { beep(700, 0.05, 'sine', 0.05); setTimeout(() => beep(950, 0.05, 'sine', 0.05), 80); setTimeout(() => beep(1200, 0.06, 'sine', 0.05), 160); },
  // 怒って帰る：がっかりの下がる音
  angry: () => {
    const notes = [[392, 0], [370, 220], [349, 440], [330, 660]];
    for (const [f, t] of notes) setTimeout(() => beep(f, t === 660 ? 0.5 : 0.2, 'sawtooth', 0.045), t);
  },
  // 小銭：チャリン
  coins: (delay = 0) => {
    setTimeout(() => { beep(2093, 0.08, 'square', 0.025); setTimeout(() => beep(2637, 0.18, 'square', 0.025), 70); }, delay);
  },
};

// ===================== 客 =====================
function makeCustomer() {
  return {
    id: nextId++,
    face: pick(FACES),
    order: pickWeighted(MENU),
    qWait: 0,
    qMax: rand(40, 70) * (0.7 + S.rep / 10),   // 評判が高いほど長く並んでくれる
    pat: 0,
    patMax: rand(30, 42),
    look: Math.floor(Math.random() * (Bowl3D.personCount || 12)),  // 3Dの見た目
    water: false,      // コップに水が入っているか
    glass: false,      // カウンターにコップが置いてあるか
    waterLvl: 0,       // コップの水の量（0〜1）
    drinker: Math.random() < 0.35,          // 水をよく飲む人（空になる）
    drinkRate: rand(1 / 14, 1 / 8),
    state: 'waiting',  // waiting | hot（ラーメンは来たが水がない）| eating | leaving
    timer: 0,
    react: '',
    reactCls: '',
    flash: '',
    flashT: 0,
  };
}

function spawnInterval() {
  // 評判と時間帯（ランチピーク）で来店ペースが変わる
  const progress = S.t / DAY_LEN;
  const peak = 1 + 0.8 * Math.exp(-Math.pow((progress - 0.45) / 0.2, 2));
  const repF = 0.5 + S.rep / 4;
  return Math.max(2.5, 10 / (peak * repF)) * rand(0.7, 1.3);
}

// ===================== 操作 =====================
function throwAway(msg, cost) {
  S.garbage++;
  S.waste += cost;
  S.money -= cost;
  toast(msg + (cost ? `（-${yen(cost)}）` : ''));
  sfx.trash();
}

// カウンター左のコップをタップ：水が必要なお客さんの左側に、水の入ったコップを出す
// （熱いラーメンを前に待っている人 → 水がまだの人 → コップが空になった人の順。同じなら長く待っている人）
function pickWater() {
  let best = -1, bestScore = -1;
  S.seats.forEach((c, i) => {
    if (!c || c.water || c.state === 'leaving') return;
    const score = (c.state === 'hot' ? 3000 : !c.glass ? 2000 : 1000) + c.pat;
    if (score > bestScore) { bestScore = score; best = i; }
  });
  if (best < 0) { toast('お水が必要なお客さんはいません'); return; }
  giveWater(S.seats[best]);
}

// カウンターのコップをタップ：空なら水を補充する
function tapGlass(i) {
  const c = S.seats[i];
  if (!c) return;
  if (c.water) { toast('まだお水が入っています'); return; }
  giveWater(c);
}

// どんぶりをタップ：選択する。空ならスープを入れる
function tapBowl(i) {
  const b = S.bowls[i];
  if (!b) return;
  S.active = i;
  if (!b.soup) {
    b.soup = true;
    b.soupT = performance.now();   // 注いだ時刻（スープの揺れと湯気の演出用）
    sfx.juwa();
  } else {
    sfx.tap();
  }
}

function activeBowl() {
  return S.active >= 0 ? S.bowls[S.active] : null;
}

// 選択中のどんぶりがなくなったら、別のどんぶりを選ぶ
function fixActive() {
  if (activeBowl()) return;
  S.active = S.bowls.findIndex((b) => b);
}

// 麺を入れる（場所の指定がなければ空いているてぼへ）
function addNoodle(at) {
  const i = at !== undefined ? at : S.pot.indexOf(null);
  if (i < 0) { toast('てぼが全部ふさがっています'); return; }
  S.pot[i] = { t: 0, beeped: false };
  sfx.chapon();
}

// てぼをタップ：茹で上がっていたら湯切りしてどんぶりへ
function takeNoodle(i) {
  const n = S.pot[i];
  if (!n) { addNoodle(i); return; }
  if (n.t < BOIL_TIME) { toast('まだ茹でています… ピピッと鳴るまで待とう'); return; }
  // 入れ先：選択中のどんぶり → だめなら、スープが入っていて麺がまだのどんぶり
  const ok = (b) => b && b.soup && !b.men;
  const target = ok(activeBowl()) ? S.active : S.bowls.findIndex(ok);
  if (target < 0) {
    const a = activeBowl();
    if (a && !a.soup) toast('スープが入っていないと麺を入れられません。どんぶりをタップしてスープを入れよう');
    else toast('スープの入った空のどんぶりがありません');
    return;
  }
  S.pot[i] = null;
  const b = S.bowls[target];
  b.men = true;
  b.menFly = true;   // てぼが運ばれてくるまで麺は描かない
  S.active = target;
  sfx.lift();   // てぼをお湯から引き上げる「ザバッ」
  const el = teboEls[i].el;
  el.classList.remove('drain');
  void el.offsetWidth; // アニメーションを再生し直す
  el.classList.add('drain');
  flyTebo(el, target, b);
}

// てぼを持ち上げて、チャッチャッと湯切りして、どんぶりにあける
function flyTebo(slotEl, target, b) {
  const from = slotEl.querySelector('.hole').getBoundingClientRect();
  const to = bowlEls[target].bowl.getBoundingClientRect();
  const size = from.width;
  const sx = from.left, sy = from.top;
  const ex = to.left + to.width / 2 - size / 2, ey = to.top + to.height / 2 - size / 2;
  const up = sy - 40;
  const el = document.createElement('div');
  el.className = 'fly fly-tebo';
  el.style.setProperty('--hs', size + 'px');
  el.innerHTML = '<div class="tebo"><div class="noodle"></div><div class="handle"></div></div>';
  document.body.appendChild(el);
  const done = () => { el.remove(); b.menFly = false; };
  if (!el.animate) { done(); return; }
  const at = (x, y, sc = 1.1, r = 0) => ({ transform: `translate(${x}px, ${y}px) scale(${sc}) rotate(${r}deg)` });
  const anim = el.animate([
    at(sx, sy, 1),
    { ...at(sx, up), offset: 0.1 },
    { ...at(sx, up + 26), offset: 0.16 },  // チャッ（上下にすばやく揺らして湯切り）
    { ...at(sx, up - 4), offset: 0.21 },
    { ...at(sx, up + 26), offset: 0.26 },  // チャッ
    { ...at(sx, up - 4), offset: 0.31 },
    { ...at(sx, up + 26), offset: 0.36 },  // チャッ
    { ...at((sx + ex) / 2, Math.min(up, ey) - 30), offset: 0.62 },
    { ...at(ex, ey, 1, -35), opacity: 1, offset: 0.88 },
    { ...at(ex, ey, 0.9, -60), opacity: 0 },
  ], { duration: 950, easing: 'ease-in-out' });
  sfx.yukiri();   // 上下に振るのに合わせて「チャッ、チャッ、チャッ」
  anim.onfinish = done;
  anim.oncancel = done;
}

// キー操作用：いちばん茹で時間の長い茹で上がりの麺を出す
function takeReadyNoodle() {
  let best = -1;
  S.pot.forEach((n, i) => { if (n && n.t >= BOIL_TIME && (best < 0 || n.t > S.pot[best].t)) best = i; });
  if (best < 0) { toast('茹で上がった麺がありません'); return; }
  takeNoodle(best);
}

// トッピング：什器から具が飛び出して、選択中のどんぶりへ飛んでいく
// ワンタップで、そのどんぶりのお客さんの注文どおりの量がのる。
// 1タップで1人前（チャーシューなら数枚、ネギならひとつかみ）がのる。
// 同じ具を2回のせると「のせすぎ」でゴミになる
const PIECES = { chashu: 4, negi: 6 };   // 1人前で飛んでいく個数（見た目）

function addTopping(key) {
  const b = activeBowl();
  if (!b) { toast('どんぶりがありません'); return; }
  if (!b.men) { toast('先に麺をどんぶりに入れよう'); return; }
  const name = TOPPINGS.find((t) => t.key === key).name;
  sfx.tap();
  if (b.tops[key] > 0) {
    flyTopping(key, b, S.active, 0, false);
    S.bowls[S.active] = newBowl();
    throwAway(`${name}をのせすぎ！ラーメンはゴミに`, COST_BOWL);
    return;
  }
  b.tops[key] = 1;
  b.fly[key] = 1;   // 全部着地するまでは描かない
  const n = PIECES[key];
  for (let k = 0; k < n; k++) {
    setTimeout(() => flyTopping(key, b, S.bowls.indexOf(b), k, k === n - 1), k * 70);
  }
}

function flyTopping(key, b, slot, index, land) {
  if (slot < 0) { if (land) b.fly[key] = 0; return; }  // どんぶりがもうない
  const bin = binEls[key];
  bin.classList.remove('pop');
  void bin.offsetWidth;
  bin.classList.add('pop');

  const from = bin.querySelector('.bin-img').getBoundingClientRect();
  const bowl = bowlEls[slot].bowl.getBoundingClientRect();
  const [px, py] = TOP_POS[key][index % TOP_POS[key].length];
  const sx = from.left + from.width / 2, sy = from.top + from.height * 0.45;
  let ex = bowl.left + bowl.width * px / 100, ey = bowl.top + bowl.height * py / 100;
  let sc = bowl.width / 96;             // どんぶりの表示サイズに合わせる
  if (Bowl3D.ok) {
    // 3Dのどんぶりで具が置かれる位置へ
    const p = Bowl3D.pieceScreenPos(slot, key, index, bowlEls[slot].wrap);
    sc = p.scale;
    ex = p.x - 12 * sc; ey = p.y - 10 * sc;
  }
  const lift = Math.min(sy, ey) - 70;   // 放物線の頂点

  const el = document.createElement('div');
  el.className = 'fly';
  const img = Bowl3D.images && Bowl3D.images[key === 'chashu' ? 'flyChashu' : 'flyNegi'];
  el.innerHTML = img ? `<img class="fly-img" src="${img}" alt="">` : `<div class="top ${key}"></div>`;
  document.body.appendChild(el);

  const finish = () => {
    el.remove();
    if (land) b.fly[key] = 0;
    if (key === 'chashu') sfx.chashuLand(index); else sfx.negiLand(index);   // どんぶりに着いた音
  };
  if (!el.animate) { finish(); return; }
  const spin = key === 'chashu' ? 540 : 360;
  const anim = el.animate([
    { transform: `translate(${sx}px, ${sy}px) scale(1.5) rotate(0deg)` },
    { transform: `translate(${(sx + ex) / 2}px, ${lift}px) scale(1.7) rotate(${spin / 2}deg)`, offset: 0.45 },
    { transform: `translate(${ex}px, ${ey}px) scale(${sc}) rotate(${spin}deg)` },
  ], { duration: 480, easing: 'ease-in' });
  anim.onfinish = finish;
  anim.oncancel = finish;
}

// 客に出す（お冷を持っていれば水を出す）。出すのはそのお客さんの前のどんぶり
// ラーメンができたか（注文どおり、または具の入れまちがい）を見て、自動で出す
function autoServe(dt) {
  for (let i = 0; i < SEAT_COUNT; i++) {
    const b = S.bowls[i], c = S.seats[i];
    if (!b || !c || c.state !== 'waiting' || b.serving) continue;
    if (!b.men || b.menFly || b.fly.chashu || b.fly.negi) { b.readyT = 0; continue; }
    const rec = MENU[c.order].rec;
    const keys = Object.keys(rec);
    const done = keys.every((k) => b.tops[k] === rec[k]);
    const wrong = keys.some((k) => b.tops[k] > rec[k]);
    if (!done && !wrong) { b.readyT = 0; continue; }
    b.readyT = (b.readyT || 0) + dt;
    serveFly(i, b);   // できた瞬間に飛んでいく
  }
}

function serveFly(i, b) {
  b.serving = true;
  const from = bowlEls[i].wrap.getBoundingClientRect();
  const to = seatEls[i].spot.getBoundingClientRect();
  const img = Bowl3D.ok && Bowl3D.bowlImage ? Bowl3D.bowlImage(b.tops.chashu > 0, b.tops.negi > 0) : null;
  const finish = () => {
    if (el) el.remove();
    if (S.bowls[i] === b) { b.serving = false; sfx.bowlDown(); serveTo(i); }   // 「ゴトッ」とカウンターに置く
  };
  let el = null;
  if (!img || !document.body.animate) { finish(); return; }
  el = document.createElement('img');
  el.src = img; el.className = 'fly fly-bowl';
  const w = from.width;
  el.style.width = w + 'px';
  document.body.appendChild(el);
  sfx.whoosh();   // 「シュッ」と飛んでいく
  // 中心の位置で動かす（拡大縮小も中心を基準にする）
  const h = w * 0.75;
  const scx = from.left + from.width / 2, scy = from.top + from.height / 2;
  const ecx = to.left + to.width / 2, ecy = to.top + to.height / 2;
  const sc = Math.max(0.3, to.width / w);
  const peak = Math.min(scy, ecy) - 60;
  const at = (cx, cy, s) => ({ transform: `translate(${cx - w / 2}px, ${cy - h / 2}px) scale(${s})` });
  const anim = el.animate([
    at(scx, scy, 1),
    { ...at((scx + ecx) / 2, peak, (1 + sc) / 2), offset: 0.5 },
    at(ecx, ecy, sc),
  ], { duration: 550, easing: 'ease-in-out' });
  anim.onfinish = finish; anim.oncancel = finish;
}

// お客さんをタップ：コップの水が空になったときだけ、水を補充する
// （最初の1杯はカウンター左のコップから。ラーメンは自動で出る）
function tapCustomer(seatIdx) {
  const c = S.seats[seatIdx];
  if (!c || c.state === 'leaving') return;
  if (c.glass && !c.water) giveWater(c);
}

// できたラーメンを出す（自動で呼ばれる）
function serveTo(seatIdx) {
  const c = S.seats[seatIdx];
  if (!c) return;
  if (c.state !== 'waiting') return;
  const b = S.bowls[seatIdx];
  if (!b || !b.men) { toast('このお客さんのラーメンはまだできていません'); return; }

  const menu = MENU[c.order];
  const match = Object.keys(menu.rec).every((k) => b.tops[k] === menu.rec[k]);

  if (!match) {
    // 注文とちがう → 突き返されてゴミ。新しい空のどんぶりが出てくる
    S.bowls[seatIdx] = newBowl();
    throwAway('注文とちがう！ラーメンはゴミに', COST_BOWL);
    c.pat = Math.min(c.patMax * 0.95, c.pat + c.patMax * 0.2);
    S.rep -= 0.2;
    c.flash = 'ちがうよ！😠'; c.flashT = 1.5;
    sfx.wrong();
    return;
  }

  S.bowls[seatIdx] = null;   // どんぶりはお客さんのところへ
  fixActive();
  if (c.water) startEating(seatIdx, c);
  else {
    c.state = 'hot';
    c.react = '熱っ！お水💧'; c.reactCls = 'bad';
    sfx.hot();
  }
}

// 水の入ったコップを、トレーからお客さんの前（左側）へ飛ばす
function flyGlass(i) {
  const e = seatEls[i];
  const src = document.querySelector('#cups .c3d') || document.querySelector('#cups');
  if (!e || !src || !document.body.animate) return;
  const imgUrl = Bowl3D.images && Bowl3D.images.glass;
  if (!imgUrl) return;
  e.root.classList.add('glass-flying', 'has-water');   // 着くまで、席のコップは隠す（位置は測れるように表示扱い）
  const from = src.getBoundingClientRect();
  const to = e.root.querySelector('.glass').getBoundingClientRect();
  const w = Math.max(from.width, 24), h = w * 1.4;
  const el = document.createElement('img');
  el.src = imgUrl; el.className = 'fly fly-glass';
  el.style.width = w + 'px';
  document.body.appendChild(el);
  const scx = from.left + from.width / 2, scy = from.top + from.height / 2;
  const ecx = to.left + to.width / 2, ecy = to.top + to.height / 2 - 4;
  const sc = Math.max(0.5, to.height / h);
  const peak = Math.min(scy, ecy) - 50;
  const at = (cx, cy, s, r) => ({ transform: `translate(${cx - w / 2}px, ${cy - h / 2}px) scale(${s}) rotate(${r}deg)` });
  const done = () => { el.remove(); e.root.classList.remove('glass-flying'); };
  const anim = el.animate([
    at(scx, scy, 1, 0),
    { ...at((scx + ecx) / 2, peak, (1 + sc) / 2, -8), offset: 0.5 },
    at(ecx, ecy, sc, 0),
  ], { duration: 420, easing: 'ease-in-out' });
  anim.onfinish = done; anim.oncancel = done;
}

function giveWater(c) {
  if (c.water || c.state === 'leaving') { toast('お水はもう出しています'); return; }
  if (!c.glass) c.patMax += WATER_BONUS;   // 最初の1杯で少し長く待ってくれる
  c.water = true;
  c.glass = true;
  c.waterLvl = 1;
  sfx.ice();
  flyGlass(S.seats.indexOf(c));
  if (c.state === 'hot') startEating(S.seats.indexOf(c), c);
}

function startEating(seatIdx, c) {
  const menu = MENU[c.order];
  const patRatio = 1 - c.pat / c.patMax;
  const pay = menu.price;
  let tip = 0;
  let react, rep;
  if (patRatio >= 0.5) {
    tip = Math.round((100 + 200 * patRatio) / 10) * 10;
    react = 'うまい！早い！😋'; rep = 0.15; S.perfect++;
    sfx.great();
  } else if (patRatio >= 0.2) {
    react = 'うまい🙂'; rep = 0.07;
    sfx.good();
  } else {
    react = '待たされた…😐'; rep = -0.03;
    sfx.meh();
  }
  S.rep += rep;
  S.money += pay + tip;
  S.served++;
  S.sales[c.order]++;
  c.state = 'eating'; c.timer = EAT_TIME;
  c.react = react; c.reactCls = rep > 0 ? 'good' : 'bad';
  showCoin(seatIdx, '+' + yen(pay + tip) + (tip ? '（チップ込）' : ''));
}

function showCoin(seatIdx, text) {
  const el = document.createElement('div');
  el.className = 'coin';
  el.textContent = text;
  seatEls[seatIdx].root.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

// ===================== 更新 =====================
function update(dt) {
  S.t += dt;

  // 来店
  if (S.t < DAY_LEN) {
    S.spawnT -= dt;
    if (S.spawnT <= 0) {
      S.queue.push(makeCustomer());
      S.spawnT = spawnInterval();
      sfx.door();
    }
  }

  // 行列で待つ
  for (const c of S.queue) c.qWait += dt;
  const before = S.queue.length;
  S.queue = S.queue.filter((c) => c.qWait < c.qMax);
  const gaveUp = before - S.queue.length;
  if (gaveUp > 0) {
    S.walked += gaveUp;
    S.rep -= 0.05 * gaveUp;
    toast('行列からお客さんが帰ってしまった…');
  }

  // 席に案内
  for (let i = 0; i < SEAT_COUNT; i++) {
    if (!S.seats[i] && S.queue.length) {
      S.seats[i] = S.queue.shift();
      S.bowls[i] = newBowl();   // お客さんの数だけ空のどんぶりが出てくる
      fixActive();
    }
  }

  // できあがったラーメンは、自動でお客さんのところへ飛んでいく
  autoServe(dt);

  // 席の客
  for (let i = 0; i < SEAT_COUNT; i++) {
    const c = S.seats[i];
    if (!c) continue;
    if (c.flashT > 0) c.flashT -= dt;
    // 水をよく飲む人は、コップが空になる
    if (c.drinker && c.water && c.state !== 'leaving') {
      c.waterLvl -= c.drinkRate * dt;
      if (c.waterLvl <= 0) {
        c.waterLvl = 0; c.water = false;
        c.flash = 'お水おかわり！💧'; c.flashT = 1.8;
        sfx.refill();
      }
    }
    if (c.state === 'waiting' || c.state === 'hot') {
      // コップが空のままだとイライラが早く進む
      c.pat += dt * (c.glass && !c.water ? 1.5 : 1);
      if (c.pat >= c.patMax) {
        if (c.state === 'hot') throwAway('食べずに帰ってしまった…ラーメンはゴミに', 0);
        const b = S.bowls[i];
        if (b && b.men) throwAway('お客さんが帰ってしまった…ラーメンはゴミに', COST_BOWL);
        S.bowls[i] = null;
        fixActive();
        c.state = 'leaving'; c.timer = 2;
        c.react = 'もう帰る！💢'; c.reactCls = 'bad';
        S.rep -= 0.3; S.angry++;
        sfx.angry();
      }
    } else {
      c.timer -= dt;
      if (c.timer <= 0) {
        // 帰るときの音：食べ終わったら「ごちそうさま」の音、怒っていたら戸をピシャッと閉める音
        if (c.state === 'eating') sfx.thanks(); else sfx.slam();
        S.seats[i] = null;
      }
    }
  }

  // 茹で鍋（茹で上がったらピピッ、放っておくと茹ですぎでゴミ）
  for (let i = 0; i < POT_CAP; i++) {
    const n = S.pot[i];
    if (!n) continue;
    n.t += dt;
    if (!n.beeped && n.t >= BOIL_TIME) { n.beeped = true; sfx.pipi(); }
    if (n.t >= BOIL_TIME + OVER_TIME) {
      S.pot[i] = null;
      throwAway('茹ですぎ！麺はゴミに', COST_NOODLE);
    }
  }

  S.rep = Math.max(1, Math.min(5, S.rep));

  if (S.t >= DAY_LEN) endGame();
}

// ===================== 描画 =====================
const seatEls = [];
const teboEls = [];
const bowlEls = [];
let waterEl = null;
const binEls = {};

// 具材の什器（ステンレスのバット）のイラスト
function binSVG(key) {
  let seed = key === 'chashu' ? 7 : 13;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  let fill = '';
  if (key === 'chashu') {
    // 巻きチャーシューのスライスを並べる
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 5; col++) {
        const x = 28 + col * 21 + (row % 2) * 9 + rnd() * 3;
        const y = 30 + row * 20 + rnd() * 3;
        const r = Math.round(rnd() * 60 - 30);
        fill += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${r})">
          <ellipse rx="14" ry="12" fill="#7a3a1e"/>
          <ellipse rx="11.5" ry="9.8" fill="#d68e6e"/>
          <ellipse rx="7" ry="6" fill="#f3c7b0"/>
          <path d="M-4 0 a4 3.5 0 1 1 4 3.5 a2 2 0 1 1 1 -3" fill="none" stroke="#c07455" stroke-width="1.3"/>
          <ellipse cx="-3" cy="-5" rx="4" ry="1.6" fill="#fff" opacity=".35"/>
        </g>`;
      }
    }
  } else {
    // 小口切りのネギを山盛りに
    fill += '<rect x="12" y="12" width="116" height="76" rx="6" fill="#cfe8b8"/>';
    for (let i = 0; i < 95; i++) {
      const x = 18 + rnd() * 104, y = 17 + rnd() * 66;
      const c = rnd() < 0.5 ? '#2f8f2f' : rnd() < 0.5 ? '#5fb043' : '#9ccc65';
      fill += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(2.6 + rnd() * 1.4).toFixed(1)}" fill="#f6fbe9" stroke="${c}" stroke-width="1.9"/>`;
    }
  }
  return `<svg viewBox="0 0 140 100" aria-hidden="true">
    <defs>
      <linearGradient id="steel-${key}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#f4f6f8"/><stop offset=".5" stop-color="#b8c0c7"/><stop offset="1" stop-color="#7f8a94"/>
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="136" height="96" rx="10" fill="url(#steel-${key})" stroke="#5d666e" stroke-width="2"/>
    <rect x="10" y="10" width="120" height="80" rx="6" fill="#6f7a83"/>
    ${fill}
    <path d="M14 12 h112" stroke="#fff" stroke-width="2" opacity=".5"/>
  </svg>`;
}

// オーダーシート（伝票）に書く短い名前
const SLIP_NAME = { ramen: 'ラーメン', chashumen: 'チャ', negiramen: 'ネギ', negichashu: 'ネギチャ' };

// 注文を絵で表す：チャーシュー・ネギの絵。トッピングなしは「ラーメン」の文字
function orderHtml(order) {
  const rec = MENU[order].rec;
  const icon = (key) => {
    const img = Bowl3D.images && Bowl3D.images[key === 'chashu' ? 'flyChashu' : 'flyNegi'];
    return img ? `<img class="ord-ic" src="${img}" alt="">` : `<span class="ord-ic top ${key}"></span>`;
  };
  const icons = TOPPINGS.filter((t) => rec[t.key]).map((t) => icon(t.key)).join('');
  return icons || '<span class="ord-txt">ラーメン</span>';
}

// 長いメニュー名は「ネギ／チャーシュー／メン」の切れ目で折り返す
function wbrName(name) {
  return name.replace('ネギ', 'ネギ<wbr>').replace('チャーシュー', 'チャーシュー<wbr>').replace(/<wbr>$/, '');
}

// 1250 → 千二百五拾円
function kanjiYen(n) {
  const d = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const th = Math.floor(n / 1000), hu = Math.floor(n / 100) % 10, te = Math.floor(n / 10) % 10;
  return (th ? (th > 1 ? d[th] : '') + '千' : '') + (hu ? (hu > 1 ? d[hu] : '') + '百' : '') + (te ? d[te] + '拾' : '') + '円';
}

function recipeText(rec) {
  const names = TOPPINGS.filter((t) => rec[t.key]).map((t) => t.name);
  return names.length ? names.join('・') + 'を1タップ' : 'そのまま';
}

function buildUI() {
  // お品書き
  // 壁に貼った短冊メニュー（縦書き、値段は漢数字）
  $('menulist').innerHTML = Object.values(MENU).map((m) =>
    `<div class="tanzaku"><span class="t-name">${m.name}</span><span class="t-price">${kanjiYen(m.price)}</span></div>`).join('');

  // 席
  const seats = $('seats');
  for (let i = 0; i < SEAT_COUNT; i++) {
    const root = document.createElement('div');
    root.className = 'seat';
    root.innerHTML = '<div class="slot-top"></div><div class="cust"></div><div class="stool"></div><div class="seat-no">' + (i + 1) + '</div><div class="served-spot"></div><div class="glass"><div class="wlvl"></div><div class="ice"></div></div>';
    root.addEventListener('pointerdown', () => tapCustomer(i));
    root.querySelector('.glass').addEventListener('pointerdown', (ev) => { ev.stopPropagation(); tapGlass(i); });
    seats.appendChild(root);
    seatEls.push({ root, top: root.children[0], cust: root.children[1], spot: root.querySelector('.served-spot'),
      wlvl: root.querySelector('.wlvl'), key: '' });
  }

  // 麺茹で機（ステンレスの箱に、てぼ6つ）
  const pot = document.createElement('div');
  pot.className = 'pot';
  pot.innerHTML = `<div class="pot-ctrl"><div class="ctrl-panel"><div class="dial"></div><div class="lamp"></div></div></div>
    <div class="tebos"></div>
    `;
  pot.addEventListener('pointerdown', () => addNoodle());
  $('boilers').appendChild(pot);
  const tebos = pot.querySelector('.tebos');
  for (let i = 0; i < POT_CAP; i++) {
    const el = document.createElement('div');
    el.className = 'tebo-slot';
    el.innerHTML = `<div class="hole"></div>
      <div class="tebo"><div class="noodle"></div><div class="handle"></div></div>
      <div class="gauge"><div class="fill"></div></div>
      <div class="pipi">ピピッ！</div>
      <div class="chacha">チャッチャッ！</div>`;
    el.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation();
      takeNoodle(i);
    });
    tebos.appendChild(el);
    teboEls.push({ el, fill: el.querySelector('.fill') });
  }

  // どんぶり（席ごと、厨房正面に並ぶ）
  const area = $('bowlArea');
  for (let i = 0; i < SEAT_COUNT; i++) {
    const slot = document.createElement('div');
    slot.className = 'bowl-slot';
    slot.innerHTML = `<div class="slip"></div>
      <div class="bowl-wrap"><div class="bowl"><div class="soup"></div><div class="men"></div><div class="tops"></div></div></div>
      `;
    slot.addEventListener('pointerdown', () => tapBowl(i));
    area.appendChild(slot);
    bowlEls.push({ slot, slip: slot.querySelector('.slip'), bowl: slot.querySelector('.bowl'), wrap: slot.querySelector('.bowl-wrap'),
      tops: slot.querySelector('.tops'), key: '' });
  }


  // どんぶりを3Dで描く（使えない環境では2Dのまま）
  if (Bowl3D.init && Bowl3D.init(area.parentElement, $('shop'), SEAT_COUNT)) $('game').classList.add('three');

  // 具材の什器（厨房の右側）
  const ing = $('ingredients');
  for (const t of TOPPINGS) {
    const el = document.createElement('div');
    el.className = 'bin';
    el.dataset.key = t.key;
    el.title = t.name;
    el.innerHTML = binSVG(t.key);
    el.addEventListener('pointerdown', () => addTopping(t.key));
    ing.appendChild(el);
    binEls[t.key] = el;
    const img3d = Bowl3D.images && Bowl3D.images[t.key === 'chashu' ? 'binChashu' : 'binNegi'];
    if (img3d) el.querySelector('svg').outerHTML = `<img class="bin-img" src="${img3d}" alt="${t.name}">`;
    else el.querySelector('svg').classList.add('bin-img');
  }
  // コップはカウンターの左側
  waterEl = $('cups');
  waterEl.title = 'お冷';
  const glassImg = Bowl3D.images && Bowl3D.images.glass;
  waterEl.innerHTML = `<div class="tray">${(glassImg ? `<img class="c3d" src="${glassImg}" alt="">` : '<div class="c"></div>').repeat(CUP_COUNT)}</div>`;
  // コップの水を動かす（コマを順に切りかえる。コップごとに少しずらす）
  const frames = Bowl3D.images && Bowl3D.images.glassFrames;
  if (frames) {
    const imgs = [...waterEl.querySelectorAll('.c3d')];
    let f = 0;
    setInterval(() => {
      f++;
      imgs.forEach((im, k) => { im.src = frames[(f + k * 3) % frames.length]; });
    }, 140);
  }
  waterEl.addEventListener('pointerdown', pickWater);
}

function render() {
  // HUD
  const mins = Math.floor((Math.min(S.t, DAY_LEN) / DAY_LEN) * 180);
  $('clock').textContent = `${11 + Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
  $('money').textContent = yen(S.money);
  const stars = Math.round(S.rep);
  $('rep').textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars) + ' ' + S.rep.toFixed(1);
  $('qcount').textContent = S.queue.length;
  $('garbage').textContent = S.garbage;

  // 行列
  const qKey = S.queue.map((c) => c.id + (c.qWait > c.qMax * 0.7 ? '!' : '')).join(',');
  const qEl = $('queue');
  if (qEl.dataset.key !== qKey) {
    qEl.dataset.key = qKey;
    const shown = S.queue.slice(0, 14);
    qEl.innerHTML = shown.map((c) => {
      const imp = c.qWait > c.qMax * 0.7;
      const face = Bowl3D.ok ? `<img class="q3d" src="${Bowl3D.person(c.look, imp ? 'wait' : 'normal')}" alt="">` : c.face;
      return `<span class="q-person${imp ? ' impatient' : ''}">${face}</span>`;
    }).join('') +
      (S.queue.length > shown.length ? `<span class="q-more">+${S.queue.length - shown.length}</span>` : '');
  }

  // 席
  for (let i = 0; i < SEAT_COUNT; i++) {
    const c = S.seats[i];
    const e = seatEls[i];
    e.root.classList.toggle('has-cust', !!c);
    e.root.classList.toggle('has-dish', !!c && (c.state === 'hot' || c.state === 'eating'));
    e.root.classList.toggle('eating', !!c && c.state === 'eating');
    e.root.classList.toggle('has-water', !!c && c.glass);
    e.root.classList.toggle('glass-empty', !!c && c.glass && !c.water);
    if (c && c.glass) e.wlvl.style.height = (c.waterLvl * 72) + '%';
    if (!c) {
      if (e.key !== '') { e.key = ''; e.top.innerHTML = ''; e.cust.textContent = ''; }
      e.root.classList.remove('target');
      continue;
    }
    const flash = c.flashT > 0 ? c.flash : '';
    const expr = exprOf(c);
    const key = c.id + c.state + c.water + c.glass + flash + expr;
    if (e.key !== key) {
      e.key = key;
      if (Bowl3D.ok) {
        // 3Dのお客さん（出したラーメンはカウンターの上に3Dで表示する）
        e.cust.innerHTML = `<img class="cust3d" src="${Bowl3D.person(c.look, expr)}" alt="">`;
      } else {
        e.cust.innerHTML = c.face + (c.state === 'eating' ? '🍜' : c.state === 'hot' ? '♨️' : '');
      }
      if (c.state === 'waiting' || c.state === 'hot') {
        const m = MENU[c.order];
        const head = flash ? `<div class="react bad">${flash}</div>`
          : c.state === 'hot' ? `<div class="react bad">${c.react}</div>` : '';
        const body = c.state === 'hot'
          ? '<div class="bubble">💧<div class="pbar"><div></div></div></div>'
          : `<div class="bubble"><div class="ord">${orderHtml(c.order)}${c.water ? '' : '<span class="nowater">💧</span>'}</div><div class="pbar"><div></div></div></div>`;
        e.top.innerHTML = head + body;
      } else {
        e.top.innerHTML = `<div class="react ${c.reactCls}">${c.react}</div>`;
      }
    }
    if (c.state === 'waiting' || c.state === 'hot') {
      const r = 1 - c.pat / c.patMax;
      const bar = e.top.querySelector('.pbar > div');
      bar.style.width = (r * 100) + '%';
      bar.style.background = r > 0.5 ? '#4c4' : r > 0.25 ? '#eb3' : '#e33';
    }
    const target = c.glass && !c.water && c.state !== 'leaving';   // コップが空のお客さんを光らせる
    e.root.classList.toggle('target', target);
  }

  // 茹で鍋
  for (let i = 0; i < POT_CAP; i++) {
    const n = S.pot[i];
    const e = teboEls[i];
    const ready = !!n && n.t >= BOIL_TIME;
    e.el.classList.toggle('on', !!n);
    e.el.classList.toggle('ready', ready);
    if (!n) continue;
    if (!ready) {
      e.fill.style.width = (n.t / BOIL_TIME * 100) + '%';
      e.fill.style.background = '#6c6';
    } else {
      // 茹で上がり後は「茹ですぎまでの残り」を減らしていく
      const rest = Math.max(0, 1 - (n.t - BOIL_TIME) / OVER_TIME);
      e.fill.style.width = (rest * 100) + '%';
      e.fill.style.background = rest > 0.4 ? '#fb3' : '#e33';
    }
  }

  // どんぶり
  for (let i = 0; i < SEAT_COUNT; i++) {
    const b = S.bowls[i];
    const e = bowlEls[i];
    const c = S.seats[i];
    const key = JSON.stringify(b) + (i === S.active) + (c ? c.id : '');
    if (e.key === key) continue;
    e.key = key;
    e.slot.classList.toggle('empty', !b);
    e.slot.classList.toggle('active', !!b && i === S.active);
    if (!b) { e.slip.innerHTML = ''; e.tops.innerHTML = ''; continue; }
    // 伝票（席番号と注文）
    e.slip.innerHTML = c ? `<span class="no">${i + 1}番</span><span class="nm${SLIP_NAME[c.order].length > 6 ? ' long' : ''}">${SLIP_NAME[c.order]}</span>` : '';
    e.bowl.classList.toggle('has-soup', b.soup);
    e.bowl.classList.toggle('has-men', b.men && !b.menFly);
    let html = '';
    for (const t of TOPPINGS) {
      for (let n = 0; n < (b.tops[t.key] - b.fly[t.key]) * PIECES[t.key]; n++) {
        const [x, y] = TOP_POS[t.key][n % TOP_POS[t.key].length];
        html += `<div class="top ${t.key}" style="left:${x}%;top:${y}%"></div>`;
      }
    }
    e.tops.innerHTML = html;
  }
}

// お客さんの表情
function exprOf(c) {
  if (c.state === 'leaving') return c.reactCls === 'good' ? 'happy' : 'angry';
  if (c.flashT > 0) return c.flash.startsWith('お水') ? 'wait' : 'angry';
  if (c.state === 'eating') return c.timer < 1 ? 'happy' : 'eat';
  if (c.state === 'hot') return 'hot';
  const r = 1 - c.pat / c.patMax;
  return r > 0.5 ? 'normal' : r > 0.25 ? 'wait' : 'angry';
}

function render3D() {
  if (!Bowl3D.ok) return;
  const now = performance.now();
  Bowl3D.draw(S.bowls.map((b) => (b && b.serving ? null : b)), bowlEls.map((e) => e.wrap), now);
  // お客さんに出したラーメン（熱くて待っている／食べている）
  Bowl3D.drawCounter(S.seats.map((c, i) => {
    if (!c || (c.state !== 'hot' && c.state !== 'eating')) return null;
    const rec = MENU[c.order].rec;
    const eaten = c.state === 'eating' ? Math.min(1, 1 - c.timer / EAT_TIME) : 0;
    return { el: seatEls[i].spot, chashu: rec.chashu * PIECES.chashu, negi: rec.negi * PIECES.negi, eaten };
  }), now);
}

// ===================== ループ =====================
function loop(ts) {
  if (!running) return;
  const dt = Math.min(0.1, (ts - lastTs) / 1000 || 0);
  lastTs = ts;
  update(dt);
  if (running) { render(); render3D(); }
  requestAnimationFrame(loop);
}

// 開店時に音の準備をしておく（最初の音が遅れないように）
function warmUpAudio() {
  const a = getAudio(); if (!a) return;
  try {
    if (!sfxNoise) {
      sfxNoise = a.createBuffer(1, a.sampleRate * 0.3, a.sampleRate);
      const d = sfxNoise.getChannelData(0);
      for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
    }
    const o = a.createOscillator(), g = a.createGain();   // 無音を一瞬鳴らして出力を起こしておく
    g.gain.value = 0; o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + 0.05);
  } catch (e) { /* 音が出せなくても続行 */ }
}

function startGame() {
  warmUpAudio();
  newGame();
  for (const e of [...seatEls, ...bowlEls]) e.key = 'x';
  $('queue').dataset.key = 'x';
  $('overlay').classList.add('hidden');
  running = true;
  if (bgmOn) BGM.start(getAudio());
  lastTs = performance.now();
  requestAnimationFrame(loop);
}

function rank(rep, money) {
  if (rep >= 4.5 && money >= 50000) return '🏆 伝説の行列店';
  if (rep >= 4 && money >= 35000) return '🥇 雑誌に載る人気店';
  if (rep >= 3 && money >= 20000) return '🥈 地元で評判の店';
  if (money >= 10000) return '🥉 ふつうのラーメン屋';
  return '🍥 修行中の見習い';
}

function endGame() {
  running = false;
  $('panel').className = 'panel';
  BGM.stop();
  render();
  let best = 0;
  try {
    best = Number(localStorage.getItem('ramen-best') || 0);
    if (S.money > best) localStorage.setItem('ramen-best', String(S.money));
  } catch (e) { /* 保存できなくても続行 */ }
  const isBest = S.money > best;
  const rows = Object.keys(MENU).map((k) => `<tr><td>${MENU[k].name}</td><td>${S.sales[k]}杯</td></tr>`).join('');
  $('panel').innerHTML = `
    <h1>本日の営業終了</h1>
    <div class="result-big">${rank(S.rep, S.money)}</div>
    <div class="result-big">利益 ${yen(S.money)} ${isBest ? '🎉 新記録！' : ''}</div>
    <table>
      <tr><th>提供数</th><td>${S.served}杯（早くておいしい！ ${S.perfect}杯）</td></tr>
      <tr><th>怒って帰った客</th><td>${S.angry}人</td></tr>
      <tr><th>行列をあきらめた客</th><td>${S.walked}人</td></tr>
      <tr><th>ゴミ</th><td>${S.garbage}個（廃棄ロス ${yen(S.waste)}）</td></tr>
      <tr><th>評判</th><td>${S.rep.toFixed(1)} / 5.0</td></tr>
      <tr><th>最高利益</th><td>${yen(Math.max(best, S.money))}</td></tr>
    </table>
    <h2>メニュー別</h2>
    <table>${rows}</table>
    <div class="btn-row">
      <button class="btn sub" id="topBtn">トップへ</button>
      <button class="btn" id="startBtn">もう一度営業する</button>
    </div>`;
  $('topBtn').addEventListener('click', showTitle);
  $('startBtn').addEventListener('click', startGame);
  $('overlay').classList.remove('hidden');
}

// ---------- トップページ ----------
function showTitle() {
  let best = 0;
  try { best = Number(localStorage.getItem('ramen-best') || 0); } catch (e) { /* 保存できなくても続行 */ }
  const ramen = Bowl3D.ok && Bowl3D.ramenImage ? Bowl3D.ramenImage() : '';
  const people = Bowl3D.ok
    ? [0, 4, 1, 8, 2].map((k, n) => `<img src="${Bowl3D.person(k, n === 2 ? 'happy' : n % 2 ? 'wait' : 'normal')}" alt="">`).join('')
    : '👨👩👴🧑👧';
  $('panel').className = 'panel top';
  $('panel').innerHTML = `
    <div class="top-noren"><span>ら</span><span>ー</span><span>め</span><span>ん</span></div>
    <h1 class="top-title">行列のできる<br><span>ラーメン店</span></h1>
    <div class="top-hero">
      ${ramen ? `<img class="top-ramen" src="${ramen}" alt="ラーメン">` : '<div class="top-ramen-emoji">🍜</div>'}
    </div>
    <div class="top-line">${people}</div>
    <p class="top-lead">注文どおりにラーメンを作って、行列をさばこう！</p>
    ${best ? `<p class="top-best">最高利益 ${yen(best)}</p>` : ''}
    <button class="btn" id="startBtn">開店！</button>
    <button class="btn sub" id="helpBtn">遊び方</button>`;
  $('startBtn').addEventListener('click', startGame);
  $('helpBtn').addEventListener('click', showHelp);
}

// ---------- 遊び方ページ ----------
function showHelp() {
  const menuRows = Object.values(MENU).map((m) =>
    `<tr><td>${m.name}</td><td>${recipeText(m.rec)}</td><td>${yen(m.price)}</td></tr>`).join('');
  $('panel').className = 'panel';
  $('panel').innerHTML = `
    <h1>遊び方</h1>
    <p>カウンター越しにやってくるお客さんの注文どおりにラーメンを作って出そう！
    お客さんを満足させると評判が上がり、行列がどんどん長くなります。</p>
    <h2>タップするもの</h2>
    <ul>
      <li>🥛 カウンター左の<b>コップ</b>をタップ → お水が必要なお客さんの左に水を出す（ラーメンは熱いので、<b>水がないと食べてくれません</b>）。水を飲みほして空になったら、<b>コップかお客さんをタップで補充</b></li>
      <li>🍜 <b>麺茹で機</b>の空いている穴をタップで<b>麺を入れる</b>（6玉まで同時に茹でられます）</li>
      <li>🥣 お客さんの数だけ厨房正面に空の<b>どんぶり</b>が出てきます。タップで<b>スープを入れる</b>（スープがないと麺は入れられません）</li>
      <li>🔔 <b>ピピッ</b>と鳴ったてぼをタップで<b>麺を出す</b>（湯切りしてスープ入りのどんぶりへ）</li>
      <li>🥩 右の什器の<b>チャーシュー・ネギ</b>をタップ → 1タップで1人前が、選んでいるどんぶりへ飛んでいく</li>
      <li>🙋 ラーメンができあがると、<b>自動でお客さんのところへ飛んでいきます</b></li>
    </ul>
    <h2>メニュー</h2>
    <table>${menuRows}</table>
    <h2>ゴミになるもの</h2>
    <ul>
      <li>ピピッの後に放っておいた<b>茹ですぎの麺</b></li>
      <li>同じトッピングを2回のせたラーメン、<b>注文とちがうラーメン</b></li>
      <li>麺を入れたまま、お客さんが帰ってしまったラーメン</li>
    </ul>
    <p style="font-size:12px;color:#666">キー操作：M BGM / G 水 / Q 麺を入れる / W 麺を出す / A チャーシュー / S ネギ / 1〜6 席1〜6の空のコップに水</p>
    <div class="btn-row">
      <button class="btn sub" id="backBtn">もどる</button>
      <button class="btn" id="startBtn">開店！</button>
    </div>`;
  $('backBtn').addEventListener('click', showTitle);
  $('startBtn').addEventListener('click', startGame);
}

// ===================== キーボード =====================
document.addEventListener('keydown', (ev) => {
  if (!running || ev.repeat) return;
  const k = ev.key.toLowerCase();
  if (k.length !== 1) return;
  if (k >= '1' && k <= String(SEAT_COUNT)) tapCustomer(Number(k) - 1);
  else if (k === 'q') addNoodle();
  else if (k === 'w') takeReadyNoodle();
  else if (k === 'g') pickWater();
  else if (k === 'm') toggleBgm();
  else {
    const t = TOPPINGS.find((tp) => tp.hotkey.toLowerCase() === k);
    if (t) addTopping(t.key);
  }
});

// ---------- 効果音を前もって作っておく ----------
// 音をその場で組み立てると、スマホでは鳴るまでに少し時間がかかるので、
// ページを開いたときに効果音を録音しておき、タップした瞬間はそれを再生するだけにする
const SFX_PRELOAD = ['pipi', 'chapon', 'juwa', 'lift', 'yukiri', 'chashuLand', 'negiLand', 'ice', 'whoosh', 'bowlDown', 'thanks', 'slam', 'hot'];
async function preloadSfx() {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OAC) return;
  const rate = 44100;
  for (const name of SFX_PRELOAD) {
    const live = sfx[name];
    try {
      const oc = new OAC(1, Math.round(rate * 1.6), rate);
      offlineCtx = oc;
      live();
      offlineCtx = null;
      const buf = await oc.startRendering();
      // 末尾の無音を切って、再生用に差しかえる
      const d = buf.getChannelData(0);
      let end = d.length - 1;
      while (end > 0 && Math.abs(d[end]) < 0.0005) end--;
      const out = new AudioBuffer({ length: Math.max(1, end + 1), sampleRate: rate, numberOfChannels: 1 });
      out.copyToChannel(d.subarray(0, end + 1), 0);
      sfx[name] = () => {
        const a = getAudio(); if (!a) return;
        try {
          const s = a.createBufferSource(); s.buffer = out;
          s.connect(a.destination); s.start();
        } catch (e) { live(); }
      };
    } catch (e) {
      offlineCtx = null;   // 録音できない環境では、その場で作る音のまま
    }
  }
}

buildUI();
preloadSfx();
showTitle();
updateBgmBtn();
$('bgmBtn').addEventListener('click', toggleBgm);
