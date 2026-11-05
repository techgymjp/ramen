'use strict';

// ===================== 設定 =====================
const DAY_LEN = 180;          // 営業時間（実時間・秒）
const SEAT_COUNT = 5;
const BOILER_COUNT = 3;
const BOIL_TIME = 6;          // 茹で上がりまでの秒数（ピピッと鳴る）
const OVER_TIME = 6;          // ピピッから何秒で茹ですぎ（ゴミ）になるか
const COST_NOODLE = 100;      // 茹ですぎの麺を捨てたときの損失
const COST_BOWL = 300;        // ラーメンを捨てたときの損失
const WATER_BONUS = 6;        // 水を出すと待てる時間が少し延びる（秒）

const TOPPINGS = [
  { key: 'chashu', name: 'チャーシュー', hotkey: 'A' },
  { key: 'negi',   name: 'ネギ',         hotkey: 'S' },
];

const MENU = {
  ramen:      { name: 'ラーメン',             price: 800,  weight: 4, rec: { chashu: 1, negi: 1 } },
  chashumen:  { name: 'チャーシューメン',     price: 1100, weight: 3, rec: { chashu: 4, negi: 1 } },
  negiramen:  { name: 'ネギラーメン',         price: 950,  weight: 3, rec: { chashu: 1, negi: 3 } },
  negichashu: { name: 'ネギチャーシューメン', price: 1250, weight: 2, rec: { chashu: 4, negi: 3 } },
};
// どのメニューより多くのせたら「まちがい」→ ゴミ
const TOP_MAX = {};
for (const t of TOPPINGS) TOP_MAX[t.key] = Math.max(...Object.values(MENU).map((m) => m.rec[t.key]));

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

// どんぶりにはあらかじめスープが入っている
function newBowl() {
  return { men: false, tops: { chashu: 0, negi: 0 } };
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
    boilers: Array.from({ length: BOILER_COUNT }, () => ({ on: false, t: 0, beeped: false })),
    bowl: newBowl(),
    water: false,      // お冷を持っているか
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
function beep(freq, dur = 0.08, type = 'square', vol = 0.05) {
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
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
  pipi:  () => { beep(2000, 0.07); setTimeout(() => beep(2000, 0.07), 120); },
  drain: () => { beep(240, 0.06, 'triangle', 0.08); setTimeout(() => beep(260, 0.06, 'triangle', 0.08), 110); },
  water: () => beep(1500, 0.06, 'sine', 0.05),
  chime: () => { beep(1046, 0.1, 'triangle', 0.08); setTimeout(() => beep(1318, 0.18, 'triangle', 0.08), 90); },
  trash: () => beep(200, 0.15, 'sawtooth', 0.05),
  bad:   () => beep(140, 0.25, 'sawtooth', 0.06),
  door:  () => beep(880, 0.06, 'sine', 0.04),
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
    water: false,
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

// 水を出す：お冷を持つ（もう一度タップで置く）
function pickWater() {
  S.water = !S.water;
  sfx.water();
}

// 麺を入れる／麺を出す
function clickBoiler(i) {
  S.water = false;
  const bo = S.boilers[i];
  if (!bo.on) {
    bo.on = true; bo.t = 0; bo.beeped = false;
    beep(440, 0.06);
    return;
  }
  if (bo.t < BOIL_TIME) { toast('まだ茹でています… ピピッと鳴るまで待とう'); return; }
  if (S.bowl.men) { toast('どんぶりにはもう麺が入っています。先にお客さんに出そう'); return; }
  // 湯切りしてどんぶりへ
  bo.on = false; bo.t = 0; bo.beeped = false;
  S.bowl.men = true;
  sfx.drain();
  const el = boilerEls[i].el;
  el.classList.remove('drain');
  void el.offsetWidth; // アニメーションを再生し直す
  el.classList.add('drain');
}

// トッピング
function addTopping(key) {
  S.water = false;
  const b = S.bowl;
  if (!b.men) { toast('先に麺をどんぶりに入れよう'); return; }
  b.tops[key]++;
  sfx.tap();
  if (b.tops[key] > TOP_MAX[key]) {
    S.bowl = newBowl();
    const name = TOPPINGS.find((t) => t.key === key).name;
    throwAway(`${name}をのせすぎ！ラーメンはゴミに`, COST_BOWL);
  }
}

// 客に出す（お冷を持っていれば水を出す）
function tapCustomer(seatIdx) {
  const c = S.seats[seatIdx];
  if (!c) return;
  if (S.water) { giveWater(c); return; }
  if (c.state !== 'waiting') return;
  const b = S.bowl;
  if (!b.men) { toast('まだラーメンができていません'); return; }

  const menu = MENU[c.order];
  const match = Object.keys(menu.rec).every((k) => b.tops[k] === menu.rec[k]);
  S.bowl = newBowl();

  if (!match) {
    // 注文とちがう → 突き返されてゴミ。お客さんはイライラしながら待ち続ける
    throwAway('注文とちがう！ラーメンはゴミに', COST_BOWL);
    c.pat = Math.min(c.patMax * 0.95, c.pat + c.patMax * 0.2);
    S.rep -= 0.2;
    c.flash = 'ちがうよ！😠'; c.flashT = 1.5;
    sfx.bad();
    return;
  }

  if (c.water) startEating(seatIdx, c);
  else {
    c.state = 'hot';
    c.react = '熱っ！お水ください💧'; c.reactCls = 'bad';
    sfx.tap();
  }
}

function giveWater(c) {
  if (c.water || c.state === 'eating' || c.state === 'leaving') { toast('お水はもう出しています'); return; }
  c.water = true;
  c.patMax += WATER_BONUS;
  sfx.water();
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
  } else if (patRatio >= 0.2) {
    react = 'うまい🙂'; rep = 0.07;
  } else {
    react = '待たされた…😐'; rep = -0.03;
  }
  S.rep += rep;
  S.money += pay + tip;
  S.served++;
  S.sales[c.order]++;
  c.state = 'eating'; c.timer = 4;
  c.react = react; c.reactCls = rep > 0 ? 'good' : 'bad';
  showCoin(seatIdx, '+' + yen(pay + tip) + (tip ? '（チップ込）' : ''));
  sfx.chime();
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
    if (!S.seats[i] && S.queue.length) S.seats[i] = S.queue.shift();
  }

  // 席の客
  for (let i = 0; i < SEAT_COUNT; i++) {
    const c = S.seats[i];
    if (!c) continue;
    if (c.flashT > 0) c.flashT -= dt;
    if (c.state === 'waiting' || c.state === 'hot') {
      c.pat += dt;
      if (c.pat >= c.patMax) {
        if (c.state === 'hot') throwAway('食べずに帰ってしまった…ラーメンはゴミに', 0);
        c.state = 'leaving'; c.timer = 2;
        c.react = 'もう帰る！💢'; c.reactCls = 'bad';
        S.rep -= 0.3; S.angry++;
        sfx.bad();
      }
    } else {
      c.timer -= dt;
      if (c.timer <= 0) S.seats[i] = null;
    }
  }

  // 茹で釜（茹で上がったらピピッ、放っておくと茹ですぎでゴミ）
  for (const bo of S.boilers) {
    if (!bo.on) continue;
    bo.t += dt;
    if (!bo.beeped && bo.t >= BOIL_TIME) { bo.beeped = true; sfx.pipi(); }
    if (bo.t >= BOIL_TIME + OVER_TIME) {
      bo.on = false; bo.t = 0; bo.beeped = false;
      throwAway('茹ですぎ！麺はゴミに', COST_NOODLE);
    }
  }

  S.rep = Math.max(1, Math.min(5, S.rep));

  if (S.t >= DAY_LEN) endGame();
}

// ===================== 描画 =====================
const seatEls = [];
const boilerEls = [];
let bowlEls = null;
let waterEl = null;

function recipeText(rec) {
  return TOPPINGS.map((t) => `${t.name}×${rec[t.key]}`).join('・');
}

function buildUI() {
  // お品書き
  $('menulist').innerHTML = Object.values(MENU).map((m) =>
    `<div class="mb-row"><span>${m.name}</span><span>${yen(m.price)}</span></div>
     <div class="mb-row"><small>${recipeText(m.rec)}</small></div>`).join('');

  // 席
  const seats = $('seats');
  for (let i = 0; i < SEAT_COUNT; i++) {
    const root = document.createElement('div');
    root.className = 'seat';
    root.innerHTML = '<div class="slot-top"></div><div class="cust"></div><div class="stool"></div>';
    root.addEventListener('pointerdown', () => tapCustomer(i));
    seats.appendChild(root);
    seatEls.push({ root, top: root.children[0], cust: root.children[1], key: '' });
  }

  // 茹で釜
  const bw = $('boilers');
  const keys = 'QWE';
  for (let i = 0; i < BOILER_COUNT; i++) {
    const el = document.createElement('div');
    el.className = 'boiler';
    el.innerHTML = `<div class="gauge"><div class="fill"></div></div>
      <div class="steam">♨</div>
      <div class="pipi">ピピッ！</div>
      <div class="tebo"><div class="noodle"></div></div>
      <div class="chacha">チャッチャッ！</div>
      <div class="hint"></div>
      <div class="bkey">[${keys[i]}]</div>`;
    el.addEventListener('pointerdown', () => clickBoiler(i));
    bw.appendChild(el);
    boilerEls.push({ el, fill: el.querySelector('.fill'), hint: el.querySelector('.hint') });
  }

  // どんぶり
  const area = $('bowlArea');
  area.innerHTML = `<div class="bowl has-soup"><div class="soup"></div><div class="men"></div><div class="tops"></div></div>
    <div class="bowl-info"></div>`;
  bowlEls = { bowl: area.querySelector('.bowl'), tops: area.querySelector('.tops'), info: area.querySelector('.bowl-info'), key: '' };

  // お冷・トッピング
  const ing = $('ingredients');
  const mk = (html, fn) => {
    const el = document.createElement('div');
    el.className = 'ing';
    el.innerHTML = html;
    el.addEventListener('pointerdown', fn);
    ing.appendChild(el);
    return el;
  };
  waterEl = mk('<div class="icon">🥛</div>水を出す<span class="key">[G]</span>', pickWater);
  waterEl.classList.add('water');
  for (const t of TOPPINGS) {
    mk(`<div class="icon"><div class="top ${t.key}"></div></div>${t.name}<span class="key">[${t.hotkey}]</span>`,
      () => addTopping(t.key));
  }
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
  waterEl.classList.toggle('active', S.water);
  $('game').classList.toggle('hand-water', S.water);

  // 行列
  const qKey = S.queue.map((c) => c.id + (c.qWait > c.qMax * 0.7 ? '!' : '')).join(',');
  const qEl = $('queue');
  if (qEl.dataset.key !== qKey) {
    qEl.dataset.key = qKey;
    const shown = S.queue.slice(0, 14);
    qEl.innerHTML = shown.map((c) =>
      `<span class="q-person${c.qWait > c.qMax * 0.7 ? ' impatient' : ''}">${c.face}</span>`).join('') +
      (S.queue.length > shown.length ? `<span class="q-more">+${S.queue.length - shown.length}</span>` : '');
  }

  // 席
  const bowlReady = S.bowl.men;
  for (let i = 0; i < SEAT_COUNT; i++) {
    const c = S.seats[i];
    const e = seatEls[i];
    e.root.classList.toggle('has-cust', !!c);
    if (!c) {
      if (e.key !== '') { e.key = ''; e.top.innerHTML = ''; e.cust.textContent = ''; }
      e.root.classList.remove('target');
      continue;
    }
    const flash = c.flashT > 0 ? c.flash : '';
    const key = c.id + c.state + c.water + flash;
    if (e.key !== key) {
      e.key = key;
      const cup = c.water ? '<span class="cup">🥛</span>' : '';
      e.cust.innerHTML = (c.state === 'eating' ? c.face + '🍜' : c.state === 'hot' ? c.face + '♨️' : c.face) + cup;
      if (c.state === 'waiting' || c.state === 'hot') {
        const m = MENU[c.order];
        const head = flash ? `<div class="react bad">${flash}</div>`
          : c.state === 'hot' ? `<div class="react bad">${c.react}</div>` : '';
        const body = c.state === 'hot'
          ? '<div class="bubble">💧 お水まだ？<div class="pbar"><div></div></div></div>'
          : `<div class="bubble">${m.name}<div class="rec">${recipeText(m.rec)}</div>
            ${c.water ? '' : '<div class="nowater">💧お水まだ</div>'}<div class="pbar"><div></div></div></div>`;
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
    const target = S.water ? !c.water && c.state !== 'eating' && c.state !== 'leaving'
      : bowlReady && c.state === 'waiting';
    e.root.classList.toggle('target', target);
  }

  // 茹で釜
  for (let i = 0; i < BOILER_COUNT; i++) {
    const bo = S.boilers[i];
    const e = boilerEls[i];
    const ready = bo.on && bo.t >= BOIL_TIME;
    e.el.classList.toggle('on', bo.on);
    e.el.classList.toggle('ready', ready);
    if (bo.on) {
      if (!ready) {
        e.fill.style.width = (bo.t / BOIL_TIME * 100) + '%';
        e.fill.style.background = '#6c6';
        e.hint.textContent = `茹で中… ${Math.ceil(BOIL_TIME - bo.t)}秒`;
      } else {
        // 茹で上がり後は「茹ですぎまでの残り」を減らしていく
        const rest = Math.max(0, 1 - (bo.t - BOIL_TIME) / OVER_TIME);
        e.fill.style.width = (rest * 100) + '%';
        e.fill.style.background = rest > 0.4 ? '#fb3' : '#e33';
        e.hint.textContent = rest > 0.4 ? 'タップで麺を出す！' : '茹ですぎ注意！';
      }
    } else {
      e.hint.textContent = 'タップで麺を入れる';
    }
  }

  // どんぶり
  const b = S.bowl;
  const key = JSON.stringify(b);
  if (bowlEls.key !== key) {
    bowlEls.key = key;
    bowlEls.bowl.classList.toggle('has-men', b.men);
    let html = '';
    for (const t of TOPPINGS) {
      for (let n = 0; n < b.tops[t.key]; n++) {
        const [x, y] = TOP_POS[t.key][n % TOP_POS[t.key].length];
        html += `<div class="top ${t.key}" style="left:${x}%;top:${y}%"></div>`;
      }
    }
    bowlEls.tops.innerHTML = html;
    bowlEls.info.innerHTML = b.men ? `麺入り<br>${recipeText(b.tops)}` : 'スープのみ<br>（麺を待っています）';
  }
}

// ===================== ループ =====================
function loop(ts) {
  if (!running) return;
  const dt = Math.min(0.1, (ts - lastTs) / 1000 || 0);
  lastTs = ts;
  update(dt);
  if (running) render();
  requestAnimationFrame(loop);
}

function startGame() {
  newGame();
  for (const e of seatEls) e.key = 'x';
  bowlEls.key = 'x';
  $('queue').dataset.key = 'x';
  $('overlay').classList.add('hidden');
  running = true;
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
    <button class="btn" id="startBtn">もう一度営業する</button>`;
  $('startBtn').addEventListener('click', startGame);
  $('overlay').classList.remove('hidden');
}

function showTitle() {
  const menuRows = Object.values(MENU).map((m) =>
    `<tr><td>${m.name}</td><td>${recipeText(m.rec)}</td><td>${yen(m.price)}</td></tr>`).join('');
  $('panel').innerHTML = `
    <h1>🍜 行列のできるラーメン店</h1>
    <p>カウンター越しにやってくるお客さんの注文どおりにラーメンを作って出そう！
    お客さんを満足させると評判が上がり、行列がどんどん長くなります。</p>
    <h2>タップするもの</h2>
    <ul>
      <li>🥛 <b>水を出す</b> → お客さんをタップ（ラーメンは熱いので、<b>水がないと食べてくれません</b>）</li>
      <li>🍜 <b>茹で釜</b>をタップで<b>麺を入れる</b></li>
      <li>🔔 <b>ピピッ</b>と鳴ったら茹で釜をタップで<b>麺を出す</b>（湯切りしてどんぶりへ）</li>
      <li>🥩 <b>トッピング</b>（チャーシュー・ネギ）を注文の数だけのせる</li>
      <li>🙋 注文した<b>お客さんをタップ</b>して出す！</li>
    </ul>
    <h2>メニュー</h2>
    <table>${menuRows}</table>
    <h2>ゴミになるもの</h2>
    <ul>
      <li>ピピッの後に放っておいた<b>茹ですぎの麺</b></li>
      <li>トッピングをのせすぎたラーメン、<b>注文とちがうラーメン</b></li>
    </ul>
    <p style="font-size:12px;color:#666">キー操作：G 水 / Q W E 茹で釜 / A チャーシュー / S ネギ / 6〜0 席1〜5</p>
    <button class="btn" id="startBtn">開店！</button>`;
  $('startBtn').addEventListener('click', startGame);
}

// ===================== キーボード =====================
document.addEventListener('keydown', (ev) => {
  if (!running || ev.repeat) return;
  const k = ev.key.toLowerCase();
  if (k.length !== 1) return;
  if ('6789'.includes(k)) tapCustomer(Number(k) - 6);
  else if (k === '0') tapCustomer(4);
  else if ('qwe'.includes(k)) clickBoiler('qwe'.indexOf(k));
  else if (k === 'g') pickWater();
  else {
    const t = TOPPINGS.find((tp) => tp.hotkey.toLowerCase() === k);
    if (t) addTopping(t.key);
  }
});

buildUI();
showTitle();
