'use strict';
// =====================================================================
// どんぶりの3D表示（Three.js）
// 厨房正面のどんぶり置き場に1枚のキャンバスを重ね、
// どんぶりごとにビューポートを切って描画する。
// Three.js が読み込めないときは何もしない（2D表示のまま遊べる）。
// =====================================================================
const Bowl3D = (() => {
  if (typeof THREE === 'undefined') return { ok: false };

  const MAX_CHASHU = 4;   // チャーシュー1人前 = 厚切りの豚バラ4枚
  const MAX_NEGI = 6;   // ネギ1人前 = 6つかみ（たっぷり）
  const SOUP_Y = 0.46;


  // ---------- テクスチャ ----------
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  }

  // どんぶりの外側：朱色、ふちと高台は白（写真のデザイン）
  // LatheGeometry の v は頂点ごとに等分なので、外側の7点に合わせて
  // 外側は9点（8区間）：上1/8 = ふちの細い白、1/8〜5/8 = ふくらんだ胴（朱）、下3/8 = 高台（白）
  const bowlOuterTex = canvasTex(1024, 512, (g, w, h) => {
    g.fillStyle = '#fbfaf6'; g.fillRect(0, 0, w, h);
    const top = h / 8, mid = h * 5 / 8;
    const red = g.createLinearGradient(0, top, 0, mid);
    red.addColorStop(0, '#b3281d'); red.addColorStop(1, '#8e1a14');
    g.fillStyle = red; g.fillRect(0, top, w, mid - top);
    // ろくろ目のような細い線
    g.strokeStyle = 'rgba(255,150,110,.25)'; g.lineWidth = 2;
    for (const y of [top + 34, top + 41, mid - 30]) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(0, mid, w, 4);
  });

  // どんぶりの内側：白地に、ふちの下に朱の雷文の帯
  // 内側の6点に合わせて、上1/5 = ふち、その下1/5 = 雷文の帯
  const bowlInnerTex = canvasTex(2048, 320, (g, w, h) => {
    g.fillStyle = '#fbfaf6'; g.fillRect(0, 0, w, h);
    const seg = h / 5;
    g.fillStyle = '#a8241b';
    g.fillRect(0, 0, w, 5);                 // ふちの朱線
    const top = seg + 6, bh = seg - 14;     // 雷文の帯
    g.strokeStyle = '#a8241b'; g.lineWidth = 4;
    const s = bh, gap = 10;
    for (let x = 4; x < w; x += s + gap) {
      const y = top;
      g.strokeRect(x, y, s, s);
      g.beginPath();
      g.moveTo(x + s - 9, y + s); g.lineTo(x + s - 9, y + 9); g.lineTo(x + 9, y + 9);
      g.lineTo(x + 9, y + s - 18); g.lineTo(x + s - 18, y + s - 18); g.lineTo(x + s - 18, y + 18);
      g.stroke();
    }
  });
  bowlInnerTex.wrapS = THREE.RepeatWrapping;

  // チャーシューの切り口（厚切りの豚バラ）：まわりはこんがり焼けた照りのある茶色、
  // 中はピンクの肉と白い脂が横じまの層。テクスチャは横長（u=長い辺、v=厚みの方向）
  const chashuTex = canvasTex(1024, 512, (g, w, h) => {
    let seed = 21;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const wave = (x, k, a) => Math.sin(x * 0.012 + k) * a + Math.sin(x * 0.031 + k * 2) * a * 0.5;
    // 層（上から）：脂身・肉・細い脂・肉・脂・肉（豚バラ）
    const bands = [
      ['meat', 0.30], ['fat', 0.035], ['meat', 0.30], ['fat', 0.06], ['meat', 0.305],
    ];
    let y0 = 0;
    for (let b = 0; b < bands.length; b++) {
      const [kind, hh] = bands[b];
      const y1 = y0 + hh;
      g.beginPath();
      for (let x = 0; x <= w; x += 8) g.lineTo(x, (y0 * h) + (b ? wave(x * 0.5, b * 1.7, 9) : -40));
      for (let x = w; x >= 0; x -= 8) g.lineTo(x, (y1 * h) + (b < bands.length - 1 ? wave(x * 0.5, (b + 1) * 1.7, 9) : 40));
      g.closePath();
      if (kind === 'meat') {
        const m = g.createLinearGradient(0, y0 * h, 0, y1 * h);
        m.addColorStop(0, '#c99682'); m.addColorStop(0.5, '#d8ab96'); m.addColorStop(1, '#c48f78');
        g.fillStyle = m;
      } else {
        const f = g.createLinearGradient(0, y0 * h, 0, y1 * h);
        f.addColorStop(0, 'rgba(240,222,205,.9)'); f.addColorStop(0.5, '#f8eee2'); f.addColorStop(1, 'rgba(236,214,195,.9)');
        g.fillStyle = f;
      }
      g.fill();
      y0 = y1;
    }
    // 肉の繊維（横に走る細い筋）
    for (let k = 0; k < 500; k++) {
      const x = rnd() * w, y = rnd() * h, len = 20 + rnd() * 60;
      g.strokeStyle = rnd() < 0.5 ? 'rgba(170,80,65,.18)' : 'rgba(255,215,205,.2)';
      g.lineWidth = 1 + rnd();
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y + (rnd() - 0.5) * 4); g.stroke();
    }
    // 脂と肉の境目をなじませる
    g.globalCompositeOperation = 'soft-light';
    g.fillStyle = 'rgba(210,150,120,.2)'; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
    // まわりの焼き色（こんがり・キャラメル色）。外ほど濃く、内側へぼかす
    const edge = (x0, y0e, x1, y1e, len) => {
      const gr = g.createLinearGradient(x0, y0e, x1, y1e);
      gr.addColorStop(0, 'rgba(110,40,14,.95)'); gr.addColorStop(0.35, 'rgba(176,82,36,.85)');
      gr.addColorStop(0.7, 'rgba(205,120,70,.35)'); gr.addColorStop(1, 'rgba(205,120,70,0)');
      g.fillStyle = gr;
    };
    // 上の長い辺（皮のついた側）はしっかり焦げ、ほかの辺はうっすら焼き色
    const E = 95, e2 = 34;
    edge(0, 0, 0, E); g.fillRect(0, 0, w, E);
    edge(0, 0, 0, E * 0.5); g.fillRect(0, 0, w, E * 0.5);
    edge(0, h, 0, h - e2); g.fillRect(0, h - e2, w, e2);
    edge(0, 0, e2, 0); g.fillRect(0, 0, e2, h);
    edge(w, 0, w - e2, 0); g.fillRect(w - e2, 0, e2, h);
    // 焦げの斑点
    for (let k = 0; k < 300; k++) {
      const side = rnd();
      const x = side < 0.5 ? rnd() * w : (side < 0.75 ? rnd() * 30 : w - rnd() * 30);
      const y = side < 0.4 ? rnd() * 50 : side < 0.5 ? h - rnd() * 14 : rnd() * h;
      g.fillStyle = `rgba(${40 + rnd() * 40 | 0},${14 + rnd() * 12 | 0},6,${0.3 + rnd() * 0.5})`;
      g.beginPath(); g.ellipse(x, y, 2 + rnd() * 8, 1.5 + rnd() * 4, rnd() * 3, 0, Math.PI * 2); g.fill();
    }
    // タレの照り（光の筋）
    const shine = (x, y, rx, ry, op) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, rx);
      gr.addColorStop(0, `rgba(255,248,235,${op})`); gr.addColorStop(1, 'rgba(255,248,235,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, rx, ry, -0.15, 0, Math.PI * 2); g.fill();
    };
    shine(w * 0.35, h * 0.3, w * 0.2, h * 0.08, 0.18);
    for (let k = 0; k < 24; k++) shine(rnd() * w, 8 + rnd() * 30, 10 + rnd() * 14, 3 + rnd() * 2, 0.3);
  });

  // チャーシューの側面：照りのある焼き色に、脂の層
  const chashuSideTex = canvasTex(512, 64, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#7a2e10'); grd.addColorStop(0.3, '#b0582a'); grd.addColorStop(0.55, '#c8703c');
    grd.addColorStop(0.8, '#9a4418'); grd.addColorStop(1, '#5c200a');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 160; k++) {
      g.fillStyle = `rgba(40,14,5,${0.25 + Math.random() * 0.5})`;
      g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 2 + Math.random() * 6, 1 + Math.random() * 3, 0, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = 'rgba(255,240,220,.3)'; g.fillRect(0, h * 0.25, w, 2);
  });
  chashuSideTex.wrapS = THREE.RepeatWrapping;

  // スープ：深みのある琥珀色の醤油スープ（ふちほど濃く、まん中は明るく透ける）
  const soupTex = canvasTex(1024, 1024, (g, w) => {
    const c = w / 2;
    const grd = g.createRadialGradient(c * 0.92, c * 0.9, 10, c, c, c);
    grd.addColorStop(0, '#d98a2c'); grd.addColorStop(0.35, '#c06a1c'); grd.addColorStop(0.7, '#9a4812'); grd.addColorStop(1, '#5e2606');
    g.fillStyle = grd; g.fillRect(0, 0, w, w);
    let seed = 3;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    // ゆらぐ濃淡（だしの濁り）
    for (let i = 0; i < 40; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * c * 0.85;
      const x = c + Math.cos(a) * r, y = c + Math.sin(a) * r, s2 = 40 + rnd() * 90;
      const o = g.createRadialGradient(x, y, 0, x, y, s2);
      const light = rnd() < 0.5;
      o.addColorStop(0, light ? 'rgba(230,150,70,.22)' : 'rgba(90,35,8,.2)'); o.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = o; g.beginPath(); g.arc(x, y, s2, 0, Math.PI * 2); g.fill();
    }
    // ごく小さな背脂の粒
    for (let i = 0; i < 160; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * c * 0.93;
      g.fillStyle = `rgba(255,240,215,${0.25 + rnd() * 0.35})`;
      g.beginPath(); g.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, 1 + rnd() * 2.2, 0, Math.PI * 2); g.fill();
    }
  });

  // 浮いている油の玉（こがね色で、ふちが光り、てっぺんにハイライト）。別の層にしてゆっくり漂わせる
  const oilTex = canvasTex(1024, 1024, (g, w) => {
    const c = w / 2;
    let seed = 41;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const drop = (x, y, s2) => {
      const body = g.createRadialGradient(x - s2 * 0.25, y - s2 * 0.25, s2 * 0.1, x, y, s2);
      body.addColorStop(0, 'rgba(255,220,120,.8)'); body.addColorStop(0.7, 'rgba(250,180,60,.7)'); body.addColorStop(1, 'rgba(255,238,180,.95)');
      g.fillStyle = body; g.beginPath(); g.arc(x, y, s2, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,245,210,.8)'; g.lineWidth = Math.max(1, s2 * 0.12);
      g.beginPath(); g.arc(x, y, s2 * 0.94, 0, Math.PI * 2); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.9)';
      g.beginPath(); g.ellipse(x - s2 * 0.35, y - s2 * 0.4, s2 * 0.28, s2 * 0.18, -0.6, 0, Math.PI * 2); g.fill();
    };
    // 大きめの油の玉をいくつか、そのまわりに中くらい・小さいものを群れで
    for (let k = 0; k < 9; k++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * c * 0.8;
      const cx = c + Math.cos(a) * r, cy = c + Math.sin(a) * r;
      drop(cx, cy, 22 + rnd() * 22);
      for (let m = 0; m < 14; m++) {
        const aa = rnd() * Math.PI * 2, rr = 25 + rnd() * 70;
        const x = cx + Math.cos(aa) * rr, y = cy + Math.sin(aa) * rr;
        if (Math.hypot(x - c, y - c) > c * 0.94) continue;
        drop(x, y, 5 + rnd() * 12);
      }
    }
    for (let m = 0; m < 120; m++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * c * 0.92;
      drop(c + Math.cos(a) * r, c + Math.sin(a) * r, 3 + rnd() * 6);
    }
  });
  const oilMat = new THREE.MeshPhysicalMaterial
    ? new THREE.MeshPhysicalMaterial({ map: oilTex, transparent: true, depthWrite: false, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02 })
    : new THREE.MeshStandardMaterial({ map: oilTex, transparent: true, depthWrite: false, roughness: 0.05 });

  // 映り込み用のかんたんな環境（上に蛍光灯、まわりは店の暖色）
  const envTex = (() => {
    const face = (top) => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d');
      g.fillStyle = top ? '#fff6e0' : '#8a6a48'; g.fillRect(0, 0, 64, 64);
      if (top) { g.fillStyle = '#ffffff'; g.fillRect(8, 26, 48, 6); g.fillRect(8, 40, 48, 6); }
      else { const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, '#f2e2c0'); gr.addColorStop(1, '#5a3a20'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
      return c;
    };
    const side = face(false);
    const t = new THREE.CubeTexture([side, side, face(true), face(false), side, side]);
    t.needsUpdate = true;
    return t;
  })();

  // スープの表面に映る光（ゆらゆら動かして液体らしく）
  const sheenTex = canvasTex(256, 256, (g, w) => {
    const c = w / 2;
    const o = g.createRadialGradient(c * 0.75, c * 0.7, 0, c * 0.75, c * 0.7, c * 0.55);
    o.addColorStop(0, 'rgba(255,250,235,.9)'); o.addColorStop(0.4, 'rgba(255,240,210,.35)'); o.addColorStop(1, 'rgba(255,240,210,0)');
    g.fillStyle = o; g.fillRect(0, 0, w, w);
  });
  const sheenMat = new THREE.MeshBasicMaterial({ map: sheenTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.45 });

  // 湯気
  const steamTex = canvasTex(128, 128, (g, w) => {
    const c = w / 2;
    const grd = g.createRadialGradient(c, c, 0, c, c, c);
    grd.addColorStop(0, 'rgba(255,255,255,.85)'); grd.addColorStop(0.45, 'rgba(250,250,250,.4)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, w);
  });

  // ---------- 形と素材（全どんぶりで共有） ----------
  const V = (x, y) => new THREE.Vector2(x, y);
  // 写真のような、まっすぐ開いたすり鉢形のどんぶり
  // 外側：底 → 高台の外 → 高台の上 → 胴（下）→ 胴（上）→ ふち
  // 胴をふくらませて、上から見てもふちの外に朱色が見える形に
  // 外側：底 → 高台の外 → 高台の上 → 胴の下 → 胴のふくらみ → 胴の上 → ふち
  const outerGeo = new THREE.LatheGeometry(
    [V(0.30, 0), V(0.40, 0), V(0.41, 0.08), V(0.46, 0.09), V(0.85, 0.22), V(1.06, 0.42), V(1.06, 0.59), V(1.04, 0.648), V(1.028, 0.665)], 72);
  const INNER = [V(0.0, 0.1), V(0.36, 0.1), V(0.76, 0.27), V(0.98, 0.48), V(1.0, 0.62), V(0.995, 0.665)];
  const innerGeo = new THREE.LatheGeometry(INNER, 72);
  const rimGeo = new THREE.TorusGeometry(1.013, 0.02, 8, 72);
  const outerMat = new THREE.MeshStandardMaterial({ map: bowlOuterTex, roughness: 0.22, metalness: 0.02, side: THREE.FrontSide });
  const innerMat = new THREE.MeshStandardMaterial({ map: bowlInnerTex, roughness: 0.18, side: THREE.BackSide });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xfbfaf6, roughness: 0.2 });

  // 高さ y でのどんぶり内側の半径
  function innerR(y) {
    for (let k = 1; k < INNER.length; k++) {
      const a = INNER[k - 1], b = INNER[k];
      if (y <= b.y) return a.x + (b.x - a.x) * Math.max(0, (y - a.y) / Math.max(1e-6, b.y - a.y));
    }
    return INNER[INNER.length - 1].x;
  }
  const SOUP_R = innerR(SOUP_Y) - 0.005;
  const SOUP_BOTTOM = 0.12;

  // スープの面：同心円状に分割して、波打たせる
  function makeSoupGeo() {
    const g = new THREE.RingGeometry(0, SOUP_R, 64, 12);
    g.userData.base = g.attributes.position.array.slice();
    return g;
  }
  const soupMat = new THREE.MeshPhysicalMaterial
    ? new THREE.MeshPhysicalMaterial({ map: soupTex, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.02, envMap: envTex, envMapIntensity: 0.2, emissive: 0x2a0e02 })
    : new THREE.MeshStandardMaterial({ map: soupTex, roughness: 0.15, envMap: envTex });

  // 麺：細めの縮れ麺を、麺線をそろえて山にたたむ。端はスープに沈む。照りと色むらで生っぽさを出す
  const noodleMat = new THREE.MeshPhysicalMaterial
    ? new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.25, sheen: 0 })
    : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32 });

  // いくつかの TubeGeometry を1つにまとめる（頂点色つき）
  function mergeTubes(list) {
    let nv = 0, ni = 0;
    for (const t of list) { nv += t.geo.attributes.position.count; ni += t.geo.index.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
    const idx = new Uint32Array(ni);
    let vo = 0, io = 0;
    for (const t of list) {
      const p = t.geo.attributes.position, n = t.geo.attributes.normal, ix = t.geo.index;
      pos.set(p.array, vo * 3); nor.set(n.array, vo * 3);
      for (let k = 0; k < p.count; k++) col.set(t.color, (vo + k) * 3);
      for (let k = 0; k < ix.count; k++) idx[io + k] = ix.array[k] + vo;
      vo += p.count; io += ix.count;
      t.geo.dispose();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    return g;
  }

  const noodleGeos = (() => {
    let seed = 11;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const STRANDS = 72, CHUNKS = 12;
    const MOUND_R = 0.66;
    const height = (x, z) => {
      const r = Math.hypot(x, z) / MOUND_R;
      return r >= 1 ? -0.03 : 0.13 * (1 - r * r);
    };
    const chunks = Array.from({ length: CHUNKS }, () => []);
    for (let n = 0; n < STRANDS; n++) {
      // 麺線はだいたい左右方向にそろえて、少しずつ角度と位置をずらす
      const ang = (rnd() - 0.5) * 0.7 + (n % 2 ? 0.15 : -0.15);
      const dx = Math.cos(ang), dz = Math.sin(ang);
      const off = (rnd() - 0.5) * 1.05;             // 麺線に直交する方向の位置
      const len = 1.1 + rnd() * 0.35;
      const phase = rnd() * Math.PI * 2;
      const freq = 26 + rnd() * 10;                  // 縮れの細かさ
      const amp = 0.012 + rnd() * 0.008;
      const layer = rnd() * 0.035;
      const pts = [];
      const STEPS = 60;
      for (let i = 0; i <= STEPS; i++) {
        const t = i / STEPS - 0.5;
        const along = t * len;
        const wig = Math.sin(along * freq + phase) * amp;
        const x = dx * along - dz * (off + wig);
        const z = dz * along + dx * (off + wig);
        const r = Math.hypot(x, z);
        if (r > 0.9) continue;
        const bob = Math.cos(along * freq * 0.5 + phase) * 0.008;
        const y = SOUP_Y + height(x, z) + layer + bob - (r > MOUND_R ? (r - MOUND_R) * 0.6 : 0);
        pts.push(new THREE.Vector3(x, y, z));
      }
      if (pts.length < 6) continue;
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, 0.017 + rnd() * 0.004, 6, false);
      // 色むら（小麦色〜こがね色）
      const c = new THREE.Color().setHSL(0.11 + rnd() * 0.025, 0.72 + rnd() * 0.15, 0.55 + rnd() * 0.1);
      if (c.convertSRGBToLinear) c.convertSRGBToLinear();   // 頂点色はリニア空間なので変換
      chunks[n % CHUNKS].push({ geo, color: [c.r, c.g, c.b] });
    }
    return chunks.filter((c) => c.length).map(mergeTubes);
  })();

  // チャーシュー：側面は茶色、上面に断面テクスチャ
  // 厚切りのチャーシュー：ふちがでこぼこの楕円、角は丸く（3種類の形）
  const CH_D = 0.075;  // 厚み
  // 厚切りの豚バラ：角の丸い長方形（ふちは少しでこぼこ）を厚く押し出す
  const CH_W = 0.8, CH_H = 0.36;   // 切り口の横幅・縦（脂の層が重なる方向）
  function makeChashuGeo(k) {
    const shape = new THREE.Shape();
    const N = 80;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      // 角の丸い長方形（超楕円）＋でこぼこ
      const c = Math.cos(a), sn = Math.sin(a);
      const p = 0.28;
      let x = Math.sign(c) * Math.pow(Math.abs(c), p) * CH_W / 2;
      let y = Math.sign(sn) * Math.pow(Math.abs(sn), p) * CH_H / 2;
      const bump = 1 + Math.sin(a * 5 + k) * 0.025 + Math.sin(a * 11 + k * 2) * 0.012;
      x *= bump; y *= bump * (1 + Math.cos(a + k) * 0.06);
      i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y);
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: CH_D, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3, curveSegments: 80 });
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (const grp of geo.groups) {
      for (let v = grp.start; v < grp.start + grp.count; v++) {
        const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
        if (grp.materialIndex === 0) uv.setXY(v, x / (CH_W + 0.06) + 0.5, 1 - (y / (CH_H + 0.06) + 0.5));
        else uv.setXY(v, (Math.atan2(y, x) / (Math.PI * 2) + 0.5) * 4, (z + 0.02) / (CH_D + 0.04));
      }
    }
    uv.needsUpdate = true;
    geo.translate(0, 0, -CH_D / 2);
    geo.rotateX(-Math.PI / 2);   // 寝かせる（切り口が上）
    geo.rotateY(Math.PI / 2);    // 長い辺を手前〜奥の向きに（焦げた辺が右側）
    return geo;
  }
  const chashuGeos = [makeChashuGeo(0), makeChashuGeo(2.1), makeChashuGeo(4.3)];
  const chashuGeo = chashuGeos[0];
  // [0] 切り口、[1] 側面（ExtrudeGeometry のグループ順）
  const chashuMats = [
    new THREE.MeshPhysicalMaterial
      ? new THREE.MeshPhysicalMaterial({ map: chashuTex, roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.4 })
      : new THREE.MeshStandardMaterial({ map: chashuTex, roughness: 0.32 }),
    new THREE.MeshPhysicalMaterial
      ? new THREE.MeshPhysicalMaterial({ map: chashuSideTex, roughness: 0.28, clearcoat: 0.9, clearcoatRoughness: 0.15, envMap: envTex, envMapIntensity: 0.3 })
      : new THREE.MeshStandardMaterial({ map: chashuSideTex, roughness: 0.28 }),
  ];
  // 置き場所（奥側に立てかける）
  const CHASHU_POS = [
    { x: -0.36, z: -0.28, ry: 0.4 },
    { x: 0.08, z: -0.42, ry: 0.0 },
    { x: 0.44, z: -0.22, ry: -0.45 },
    { x: -0.1, z: -0.08, ry: 0.15 },
  ];

  // ネギ：小口切りの輪
  // 小口切りのネギ：厚みのある輪（外側は濃い緑、切り口と内側は明るい）。XY平面に置く（トーラスと同じ向き）
  // 小口切りのネギ：薄い円盤の切り口に、何重もの層の輪・内側の薄い膜・まん中の空洞を描く
  function negiFaceTex(kind) {
    return canvasTex(128, 128, (g, w) => {
      const c = w / 2;
      g.clearRect(0, 0, w, w);
      // 皮（外側の濃い緑）→ 層の輪 → 内側の白っぽい膜 → 空洞
      const skin = kind === 0 ? '#1f7a18' : kind === 1 ? '#3f9f2a' : '#8fc66a';
      const flesh = kind === 0 ? '#7fc35a' : kind === 1 ? '#a9da7c' : '#e2f2c4';
      g.fillStyle = skin; g.beginPath(); g.arc(c, c, c * 0.98, 0, Math.PI * 2); g.fill();
      g.fillStyle = flesh; g.beginPath(); g.arc(c, c, c * 0.86, 0, Math.PI * 2); g.fill();
      // 層の境目の細い輪（2〜3重）
      for (const [r, a] of [[0.74, 0.55], [0.63, 0.45], [0.55, 0.35]]) {
        g.strokeStyle = `rgba(60,130,40,${a})`; g.lineWidth = 2;
        g.beginPath(); g.arc(c + 1, c, c * r, 0, Math.PI * 2); g.stroke();
      }
      // 内側の半透明の膜
      g.fillStyle = 'rgba(245,252,230,.85)'; g.beginPath(); g.arc(c + 1, c, c * 0.5, 0, Math.PI * 2); g.fill();
      // まん中の空洞（透明）。ところどころ薄い膜が残る
      g.globalCompositeOperation = 'destination-out';
      g.beginPath(); g.ellipse(c + 1, c, c * 0.4, c * 0.37, 0.3, 0, Math.PI * 2); g.fill();
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = 'rgba(240,250,225,.35)'; g.beginPath(); g.ellipse(c - 6, c + 4, c * 0.18, c * 0.1, 0.8, 0, Math.PI * 2); g.fill();
      // みずみずしいハイライト
      g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 2.5;
      g.beginPath(); g.arc(c, c, c * 0.9, -2.5, -1.4); g.stroke();
    });
  }
  const negiGeo = (() => {
    const geo = new THREE.CylinderGeometry(0.037, 0.037, 0.012, 20, 1);
    geo.rotateX(Math.PI / 2);   // トーラスと同じ向き（XY平面）
    return geo;
  })();
  const negiSideMat = new THREE.MeshStandardMaterial({ color: 0x2e8a22, roughness: 0.35 });
  // 青い部分・黄緑・白っぽい根元の3種類。[0]側面 [1]上の切り口 [2]下の切り口
  const negiMats = [0, 1, 2].map((k) => {
    const t = negiFaceTex(k);
    if ('encoding' in t) t.encoding = THREE.sRGBEncoding;
    const face = THREE.MeshPhysicalMaterial
      ? new THREE.MeshPhysicalMaterial({ map: t, transparent: true, alphaTest: 0.2, roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.12, side: THREE.DoubleSide })
      : new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.2, roughness: 0.25, side: THREE.DoubleSide });
    return [negiSideMat, face, face];
  });
  // ネギは手前〜まん中に山盛り
  const NEGI_POS = [
    { x: 0.0, z: 0.2 },
    { x: 0.3, z: 0.3 },
    { x: -0.3, z: 0.32 },
    { x: 0.12, z: 0.45 },
    { x: -0.14, z: 0.06 },
    { x: 0.18, z: 0.05 },
  ];

  // ひとつかみ分のネギ（輪切りを積み上げる。色ごとにまとめて描いて軽くする）
  function negiClump(seedBase, count = 42, radius = 0.2) {
    let seed = seedBase;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const g = new THREE.Group();
    const inst = negiMats.map((m) => new THREE.InstancedMesh(negiGeo, m, Math.ceil(count / 3)));
    const used = [0, 0, 0];
    const o = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const k = i % 3;
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * radius;
      o.position.set(Math.cos(a) * r, (1 - r / radius) * 0.11 + rnd() * 0.04, Math.sin(a) * r);
      o.rotation.set(-Math.PI / 2 + (rnd() - 0.5) * 1.3, (rnd() - 0.5) * 1.3, rnd() * Math.PI);
      // 大きさはふぞろい、ななめ切りは楕円に
      const sz = 0.85 + rnd() * 0.6;
      o.scale.set(sz * (rnd() < 0.35 ? 1.35 : 1), sz, sz);
      o.updateMatrix();
      inst[k].setMatrixAt(used[k]++, o.matrix);
    }
    inst.forEach((m, k) => { m.count = used[k]; m.instanceMatrix.needsUpdate = true; g.add(m); });
    return g;
  }

  // ---------- 1つのどんぶりのシーン ----------
  function addLights(scene) {
    scene.add(new THREE.HemisphereLight(0xfff4e0, 0x5a4030, 0.5));
    const key = new THREE.DirectionalLight(0xfff0d8, 0.85);
    key.position.set(-1.5, 3, 2.2);
    scene.add(key);
    const rim = new THREE.PointLight(0xffd29a, 0.6, 6);
    rim.position.set(1.4, 1.6, -1.2);
    scene.add(rim);
  }

  function makeScene(slot) {
    const scene = new THREE.Scene();
    addLights(scene);

    const bowl = new THREE.Group();
    bowl.add(new THREE.Mesh(outerGeo, outerMat));
    bowl.add(new THREE.Mesh(innerGeo, innerMat));
    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
    rimMesh.rotation.x = Math.PI / 2; rimMesh.position.y = 0.665;
    bowl.add(rimMesh);
    scene.add(bowl);

    const soup = new THREE.Mesh(makeSoupGeo(), soupMat);
    soup.rotation.x = -Math.PI / 2; soup.position.y = SOUP_Y;
    soup.userData.amp = -1;
    scene.add(soup);
    const sheen = new THREE.Mesh(new THREE.CircleGeometry(SOUP_R * 0.95, 40), sheenMat);
    sheen.position.z = 0.006;
    soup.add(sheen);
    soup.userData.sheen = sheen;
    const oil = new THREE.Mesh(new THREE.CircleGeometry(SOUP_R * 0.97, 48), oilMat);
    oil.position.z = 0.003;
    soup.add(oil);
    soup.userData.oil = oil;

    // お玉から注がれるスープの筋
    const pour = new THREE.Group();
    const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.8, 14),
      new THREE.MeshStandardMaterial({ color: 0x8f4a1a, roughness: 0.05, emissive: 0x2a1000, transparent: true, opacity: 0.92 }));
    stream.position.set(0.0, -0.4, 0);
    pour.add(stream);
    // お玉（ステンレスの丸いすくい）
    const ladle = new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xd5dbe0, metalness: 0.5, roughness: 0.25, side: THREE.DoubleSide }));
    ladle.position.set(0.16, 0.08, 0);
    ladle.rotation.z = 1.0;
    pour.add(ladle);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 8),
      new THREE.MeshStandardMaterial({ color: 0xc9d0d6, metalness: 0.5, roughness: 0.3 }));
    handle.position.set(0.62, 0.42, 0);
    handle.rotation.z = -0.95;
    pour.add(handle);
    pour.position.set(0.15, 1.1, 0.1);
    pour.visible = false;
    pour.userData.stream = stream;
    scene.add(pour);

    const noodles = new THREE.Group();
    for (const g of noodleGeos) noodles.add(new THREE.Mesh(g, noodleMat));
    scene.add(noodles);

    // 厚切りのチャーシューを、写真のように少しずつずらして重ね、奥を持ち上げて立てかける
    // 写真のように、長い切り身を奥のふちに立てかけて、扇のように少しずつ重ねる
    const CH_LAYOUT = [
      { x: -0.42, y: 0.12, z: 0.0, rx: 0.22, ry: 0.38, rz: -0.38 },
      { x: -0.15, y: 0.15, z: -0.02, rx: 0.24, ry: 0.14, rz: -0.38 },
      { x: 0.12, y: 0.18, z: -0.02, rx: 0.24, ry: -0.08, rz: -0.38 },
      { x: 0.39, y: 0.21, z: 0.0, rx: 0.22, ry: -0.32, rz: -0.38 },
    ];
    const chashu = [];
    for (let i = 0; i < MAX_CHASHU; i++) {
      const L = CH_LAYOUT[i];
      const m = new THREE.Mesh(chashuGeos[i % chashuGeos.length], chashuMats);
      m.position.set(L.x, SOUP_Y + L.y, L.z);
      m.rotation.set(L.rx, L.ry, L.rz, 'YXZ');
      scene.add(m);
      chashu.push(m);
    }

    const negi = NEGI_POS.map((p, i) => {
      const g = negiClump(31 + i * 17 + slot);
      g.position.set(p.x, SOUP_Y + 0.12 + (i % 3) * 0.02, p.z);
      g.userData.baseY = g.position.y;
      scene.add(g);
      return g;
    });

    const steam = [];
    const STEAM_N = 10;
    for (let i = 0; i < STEAM_N; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: steamTex, transparent: true, depthWrite: false, opacity: 0 }));
      sp.userData.phase = i / STEAM_N + slot * 0.13;
      sp.userData.x = ((i * 37) % 10) / 10 * 0.9 - 0.45;
      sp.userData.z = ((i * 53) % 10) / 10 * 0.5 - 0.3;
      scene.add(sp);
      steam.push(sp);
    }
    return { scene, soup, pour, noodles, chashu, negi, steam };
  }

  // スープを動かす：注いだ直後は水位が上がって大きく揺れ、その後もゆらゆら
  function animateSoup(s, age, time) {
    const soup = s.soup;
    const fill = Math.min(1, age / 0.6);
    const level = SOUP_BOTTOM + (SOUP_Y - SOUP_BOTTOM) * (1 - Math.pow(1 - fill, 2));
    soup.position.y = level;
    const sc = Math.max(0.05, innerR(level) / SOUP_R);
    soup.scale.set(sc, sc, 1);
    // 揺れ（注いだ直後ほど大きい）と、ゆっくり回る表面の脂
    const slosh = Math.exp(-age * 1.3);
    soup.rotation.set(-Math.PI / 2 + Math.sin(age * 7.5) * 0.07 * slosh, Math.cos(age * 6.3) * 0.05 * slosh, time * 0.00008);
    // 映り込みの光がゆらぐ
    // 油の玉がゆっくり漂う（揺れたときは大きく回る）
    soup.userData.oil.rotation.z = Math.sin(time / 6000) * 0.25 + Math.sin(age * 6) * 0.3 * slosh;
    soup.userData.oil.position.x = Math.sin(time / 4100) * 0.015;
    soup.userData.oil.position.y = Math.cos(time / 4700) * 0.015;
    const sh = soup.userData.sheen;
    sh.rotation.z = -time * 0.00008 + Math.sin(time / 900) * 0.15 + Math.sin(age * 9) * 0.4 * slosh;
    sh.scale.set(1 + Math.sin(time / 700) * 0.04, 1 + Math.cos(time / 800) * 0.04, 1);
    sh.material.opacity = 0.4;
    const amp = 0.04 * Math.exp(-age * 1.8) + 0.0035;
    if (Math.abs(amp - soup.userData.amp) > 0.0004 || amp > 0.004) {
      const g = soup.geometry, pos = g.attributes.position, base = g.userData.base;
      const t = time / 1000;
      for (let k = 0; k < pos.count; k++) {
        const x = base[k * 3], y = base[k * 3 + 1];
        const r = Math.hypot(x, y) / SOUP_R;
        const ring = Math.sin(r * 16 - age * 10) * Math.exp(-age * 1.8) * 0.04;
        const idle = Math.sin(x * 9 + t * 1.7) * Math.cos(y * 8 - t * 1.3) * 0.0035;
        pos.setZ(k, (ring + idle) * (1 - r * r * 0.6));
      }
      pos.needsUpdate = true;
      g.computeVertexNormals();
      soup.userData.amp = amp;
    }
    // 注いでいる間だけ、お玉からの筋を見せる
    s.pour.visible = age < 0.55;
    if (s.pour.visible) {
      const k = Math.max(0, 1 - age / 0.55);
      const st = s.pour.userData.stream;
      const len = 1.1 - level;   // お玉から水面まで
      st.scale.set(0.3 + k * 0.7, len / 0.8, 0.3 + k * 0.7);
      st.position.y = -len / 2;
      s.pour.position.y = 1.1;
    }
  }

  // ---------- 描画ビュー（キャンバス1枚に、どんぶり何杯でも） ----------
  // 斜め上から見下ろす（どんぶりの側面の模様も見える角度）
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 20);
  camera.position.set(0, 2.45, 2.7);   // 高めのアングルで中身がよく見えるように
  camera.lookAt(0, 0.38, 0);
  let encoded = false;

  function makeView(hostEl, count, cls) {
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (e) {
      return null;
    }
    // スマホは描く細かさを少し下げて、タップへの反応を軽くする
    renderer.setPixelRatio(Math.min(window.innerWidth <= 640 ? 1.5 : 2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = false;
    if ('outputEncoding' in renderer) renderer.outputEncoding = THREE.sRGBEncoding;
    if (!encoded) {
      for (const t of [bowlOuterTex, bowlInnerTex, chashuTex, chashuSideTex, soupTex, oilTex]) if ('encoding' in t) t.encoding = THREE.sRGBEncoding;
      encoded = true;
    }
    const canvas = renderer.domElement;
    canvas.className = 'bowl3d ' + (cls || '');
    hostEl.appendChild(canvas);
    const scenes = [];
    for (let i = 0; i < count; i++) scenes.push(makeScene(i));
    let lastW = 0, lastH = 0;

    // どんぶり1つ分のビューポート（ホスト内の座標・CSS px）
    function viewportOf(el) {
      const hr = hostEl.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      // 厨房のどんぶりは枠いっぱい（となりのどんぶりとスレスレ）に描く
      const wide = el.classList.contains('bowl-wrap');
      const size = r.width * (wide ? 0.97 : 0.95);
      return {
        x: r.left - hr.left + r.width / 2 - size / 2,
        y: r.top - hr.top + r.height / 2 - size * (wide ? 0.5 : 0.56),
        size,
      };
    }

    // items[i] = null | { el, soup, men, noodleFrac, chashu, negi }
    function draw(items, time) {
      const hr = hostEl.getBoundingClientRect();
      const W = Math.round(hr.width), H = Math.round(hr.height);
      if (W !== lastW || H !== lastH) {
        renderer.setSize(W, H, false);
        canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
        lastW = W; lastH = H;
      }
      renderer.setScissorTest(false);
      renderer.clear();
      renderer.setScissorTest(true);
      for (let i = 0; i < scenes.length; i++) {
        const it = items[i];
        if (!it) continue;
        const s = scenes[i];
        const vp = viewportOf(it.el);
        const glY = H - vp.y - vp.size;
        renderer.setViewport(vp.x, glY, vp.size, vp.size);
        renderer.setScissor(vp.x, glY, vp.size, vp.size);
        renderer.clearDepth();

        s.soup.visible = it.soup;
        const age = it.soupAge == null ? 99 : it.soupAge;
        if (it.soup) animateSoup(s, age, time); else s.pour.visible = false;
        s.noodles.visible = it.men;
        const nNoodle = Math.ceil(s.noodles.children.length * (it.noodleFrac == null ? 1 : it.noodleFrac));
        s.noodles.children.forEach((m, k) => { m.visible = k < nNoodle; });
        s.chashu.forEach((m, k) => { m.visible = k < it.chashu; });
        // チャーシューがのっているときは、ネギをその上にこんもり盛る
        s.negi.forEach((g, k) => { g.visible = k < it.negi; g.position.y = g.userData.baseY + (it.chashu > 0 ? 0.12 : 0); });
        // 湯気（スープが入っているときだけ。注いだ直後はもくもく）
        // 湯気：いつもしっかり立ちのぼり、注いだ直後はさらにもくもく
        const boost = 1 + 1.2 * Math.exp(-age * 0.8);
        s.steam.forEach((sp) => {
          const p = (time / 2600 + sp.userData.phase) % 1;
          sp.visible = it.soup && age > 0.15;
          sp.position.set(sp.userData.x + Math.sin(p * 5 + sp.userData.phase * 9) * 0.1, 0.55 + p * 1.15, sp.userData.z);
          const sc = (0.45 + p * 0.85) * (0.85 + boost * 0.2);
          sp.scale.set(sc, sc * 1.2, sc);
          sp.material.opacity = Math.min(0.95, Math.sin(p * Math.PI) * 0.75 * boost);
        });
        renderer.render(s.scene, camera);
      }
    }

    // 具が着地する画面上の位置（飛んでいく演出の終点）
    function pieceScreenPos(slot, key, index, el) {
      const s = scenes[slot];
      const obj = key === 'chashu' ? s.chashu[Math.min(index, MAX_CHASHU - 1)] : s.negi[Math.min(index, MAX_NEGI - 1)];
      const v = obj.position.clone().project(camera);
      const vp = viewportOf(el);
      const hr = hostEl.getBoundingClientRect();
      return {
        x: hr.left + vp.x + (v.x + 1) / 2 * vp.size,
        y: hr.top + vp.y + (1 - v.y) / 2 * vp.size,
        scale: vp.size / 150,
      };
    }
    return { draw, pieceScreenPos };
  }

  // ---------- 具材の什器と、飛んでいく具の絵（3Dで描いて画像にする） ----------
  const steelMat = new THREE.MeshStandardMaterial({ color: 0xc9d0d6, metalness: 0.35, roughness: 0.3 });
  const steelDark = new THREE.MeshStandardMaterial({ color: 0x8c959d, metalness: 0.3, roughness: 0.45 });

  // ステンレスのバット（W×D、深さH）
  function makeTray(W, D, H) {
    const g = new THREE.Group();
    const t = 0.06;
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(W, t, D), steelDark);
    bottom.position.y = t / 2;
    g.add(bottom);
    const wall = (w, d, x, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), steelMat);
      m.position.set(x, H / 2, z);
      g.add(m);
    };
    wall(W, t, 0, -D / 2); wall(W, t, 0, D / 2);
    wall(t, D, -W / 2, 0); wall(t, D, W / 2, 0);
    // ふちの返し
    const lip = (w, d, x, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), steelMat);
      m.position.set(x, H, z);
      g.add(m);
    };
    lip(W + 0.16, 0.14, 0, -D / 2); lip(W + 0.16, 0.14, 0, D / 2);
    lip(0.14, D, -W / 2, 0); lip(0.14, D, W / 2, 0);
    return g;
  }

  // 画像化用のレンダラー（1つを使い回す）
  let snapR = null;
  function snapshot(w, h, build, camPos, look, fov) {
    if (!snapR) {
      snapR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      snapR.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      snapR.setClearColor(0x000000, 0);
      if ('outputEncoding' in snapR) snapR.outputEncoding = THREE.sRGBEncoding;
    }
    const r = snapR;
    r.setSize(w, h, false);
    r.clear();
    const scene = new THREE.Scene();
    addLights(scene);
    build(scene);
    const cam = new THREE.PerspectiveCamera(fov, w / h, 0.1, 30);
    cam.position.set(...camPos);
    cam.lookAt(...look);
    r.render(scene, cam);
    return r.domElement.toDataURL('image/png');
  }

  // ---------- お客さん（オリジナルのちびキャラ） ----------
  const PEOPLE = [
    { skin: 0xf6d2b3, hair: 0x2b1d14, style: 'short', shirt: 0x2f6db5 },
    { skin: 0xf3cfb0, hair: 0x3a2416, style: 'long', shirt: 0xd9566b },
    { skin: 0xe8b98f, hair: 0xbdbdbd, style: 'bald', shirt: 0x7a6a4f, glasses: true, mustache: true },
    { skin: 0xf6d2b3, hair: 0x9a9a9a, style: 'bun', shirt: 0x8a5ba8, glasses: true },
    { skin: 0xc98e64, hair: 0x1d1410, style: 'short', shirt: 0xf0b429, cap: 0xd33b2c },
    { skin: 0xf6d2b3, hair: 0xc9a15a, style: 'long', shirt: 0x3fa37a },
    { skin: 0xe8b98f, hair: 0x2b1d14, style: 'short', shirt: 0x334155, tie: true, glasses: true },
    { skin: 0xf3cfb0, hair: 0x5a3a22, style: 'bun', shirt: 0xf28c38 },
    { skin: 0xc98e64, hair: 0x2b1d14, style: 'helmet', shirt: 0x4b7bd1 },
    { skin: 0xf6d2b3, hair: 0x6b3b1f, style: 'short', shirt: 0xe4e4e4, tie: true },
    { skin: 0xe8b98f, hair: 0x1d1410, style: 'long', shirt: 0x5b5bd6, glasses: true },
    { skin: 0xf3cfb0, hair: 0xd8d8d8, style: 'bald', shirt: 0x2e7d4f },
  ];
  const matCache = {};
  function mat(color, opts) {
    const k = color + JSON.stringify(opts || {});
    if (!matCache[k]) {
      const m = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.55 }, opts || {}));
      // 色は sRGB で指定しているので、描画用（リニア）に変換して、くすまないようにする
      if (m.color.convertSRGBToLinear) m.color.convertSRGBToLinear();
      matCache[k] = m;
    }
    return matCache[k];
  }
  const PG = {
    head: new THREE.SphereGeometry(0.55, 32, 24),
    ear: new THREE.SphereGeometry(0.11, 12, 10),
    eye: new THREE.SphereGeometry(0.075, 12, 10),
    eyeHi: new THREE.SphereGeometry(0.02, 8, 6),
    nose: new THREE.SphereGeometry(0.045, 10, 8),
    arc: new THREE.TorusGeometry(0.075, 0.019, 6, 16, Math.PI),
    smile: new THREE.TorusGeometry(0.1, 0.02, 6, 16, Math.PI),
    brow: new THREE.BoxGeometry(0.17, 0.035, 0.03),
    flat: new THREE.BoxGeometry(0.15, 0.028, 0.03),
    cheek: new THREE.CircleGeometry(0.085, 16),
    hairCap: new THREE.SphereGeometry(0.585, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.52),
    hairBack: new THREE.CylinderGeometry(0.585, 0.62, 0.95, 24, 1, true, Math.PI / 2, Math.PI),
    bun: new THREE.SphereGeometry(0.2, 16, 12),
    tuft: new THREE.SphereGeometry(0.2, 12, 10),
    capTop: new THREE.SphereGeometry(0.6, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.45),
    brim: new THREE.CylinderGeometry(0.42, 0.42, 0.04, 24, 1, false, -Math.PI / 2, Math.PI),
    helmetRim: new THREE.TorusGeometry(0.6, 0.05, 8, 32),
    lens: new THREE.TorusGeometry(0.105, 0.016, 8, 20),
    bridge: new THREE.BoxGeometry(0.1, 0.02, 0.02),
    neck: new THREE.CylinderGeometry(0.17, 0.19, 0.3, 16),
    shoulders: new THREE.SphereGeometry(0.72, 32, 16),
    torso: new THREE.CylinderGeometry(0.7, 0.76, 1.1, 32),
    tie: new THREE.BoxGeometry(0.12, 0.5, 0.03),
    collar: new THREE.TorusGeometry(0.2, 0.05, 8, 20),
    drop: new THREE.SphereGeometry(0.06, 12, 10),
    mouthO: new THREE.SphereGeometry(0.075, 14, 10),
    stick: new THREE.CylinderGeometry(0.012, 0.016, 1.1, 6),
    noodle: new THREE.CylinderGeometry(0.016, 0.016, 0.42, 6),
    vein: new THREE.BoxGeometry(0.12, 0.03, 0.03),
  };

  // expr: normal | wait（イライラ）| angry | hot（熱い！）| eat | happy
  function buildPerson(p, expr) {
    const g = new THREE.Group();
    const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
      const o = new THREE.Mesh(geo, m);
      o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.scale.set(sx, sy, sz);
      g.add(o); return o;
    };
    const skinColor = expr === 'angry' ? new THREE.Color(p.skin).lerp(new THREE.Color(0xff5a4a), 0.28).getHex() : p.skin;
    const skin = mat(skinColor, { roughness: 0.65, emissive: new THREE.Color(skinColor).multiplyScalar(0.18) });
    const shirt = mat(p.shirt, { roughness: 0.75 });
    const hair = mat(p.hair, { roughness: 0.5 });
    const dark = mat(0x1a1210, { roughness: 0.3 });
    const white = mat(0xffffff, { roughness: 0.2 });

    // 体
    add(PG.torso, shirt, 0, 0.55, 0);
    add(PG.shoulders, shirt, 0, 1.1, 0, 0, 0, 0, 1, 0.5, 0.78);
    add(PG.neck, skin, 0, 1.33, 0);
    if (p.tie) {
      add(PG.collar, white, 0, 1.24, 0.12, Math.PI / 2 - 0.3, 0, 0, 1.2, 1, 1);
      add(PG.tie, mat(0xb3262e), 0, 0.95, 0.55, -0.12, 0, 0);
    }
    // 頭
    const HY = 1.85;
    add(PG.head, skin, 0, HY, 0);
    add(PG.ear, skin, -0.55, HY - 0.02, 0, 0, 0, 0, 0.6, 1, 0.8);
    add(PG.ear, skin, 0.55, HY - 0.02, 0, 0, 0, 0, 0.6, 1, 0.8);
    add(PG.nose, mat(new THREE.Color(skinColor).multiplyScalar(0.92).getHex()), 0, HY - 0.07, 0.54);

    // 髪・帽子
    if (p.style === 'short' || p.style === 'long' || p.style === 'bun') {
      add(PG.hairCap, hair, 0, HY + 0.02, -0.02, -0.12, 0, 0, 1.04, 1.04, 1.04);
      add(PG.bun, hair, 0, HY + 0.44, 0.26, 0.5, 0, 0, 2.2, 0.6, 1.1);            // 前髪
      add(PG.bun, hair, -0.38, HY + 0.38, 0.22, 0.5, 0, 0.5, 1.1, 0.6, 1);
      add(PG.bun, hair, 0.38, HY + 0.38, 0.22, 0.5, 0, -0.5, 1.1, 0.6, 1);
      if (p.style === 'long') {
        add(PG.hairBack, hair, 0, HY - 0.35, -0.02);
        for (const x of [-0.55, 0.55]) add(PG.tuft, hair, x, HY - 0.3, 0.05, 0, 0, 0, 0.55, 1.9, 0.7);  // 横の髪
      }
      if (p.style === 'bun') add(PG.bun, hair, 0, HY + 0.55, -0.22);
    } else if (p.style === 'bald') {
      add(PG.tuft, hair, -0.47, HY - 0.05, -0.1, 0, 0, 0, 0.5, 0.8, 1);
      add(PG.tuft, hair, 0.47, HY - 0.05, -0.1, 0, 0, 0, 0.5, 0.8, 1);
    } else if (p.style === 'helmet') {
      const y = mat(0xf2c418, { roughness: 0.3 });
      add(PG.capTop, y, 0, HY + 0.05, 0, -0.12, 0, 0, 1.05, 1.05, 1.05);
      add(PG.helmetRim, y, 0, HY + 0.12, 0.04, Math.PI / 2 - 0.12, 0, 0, 1.05, 1.05, 1);
    }
    if (p.cap) {
      const c = mat(p.cap, { roughness: 0.5 });
      add(PG.capTop, c, 0, HY + 0.06, 0, -0.18, 0, 0);
      add(PG.brim, c, 0, HY + 0.2, 0.42, -0.25, 0, 0);
    }

    // 顔
    const FZ = 0.5, EY = HY + 0.05;
    const eyesOpen = () => {
      for (const x of [-0.19, 0.19]) {
        add(PG.eye, dark, x, EY, FZ, 0, 0, 0, 1, 1.2, 0.6);
        add(PG.eyeHi, white, x + 0.02, EY + 0.03, FZ + 0.04);
      }
    };
    const eyesHappy = () => { for (const x of [-0.19, 0.19]) add(PG.arc, dark, x, EY - 0.02, FZ + 0.01); };
    const eyesSquint = () => {
      for (const s of [-1, 1]) {
        add(PG.flat, dark, s * 0.19, EY + 0.02, FZ + 0.01, 0, 0, s * 0.35, 0.7, 1, 1);
        add(PG.flat, dark, s * 0.19, EY - 0.03, FZ + 0.01, 0, 0, -s * 0.35, 0.7, 1, 1);
      }
    };
    const brows = (tilt, y = 0.19) => {
      for (const s of [-1, 1]) add(PG.brow, hair === dark ? dark : mat(p.style === 'bald' ? p.hair : p.hair), s * 0.19, EY + y, FZ - 0.01, 0, 0, s * tilt);
    };
    const cheeks = (color = 0xff8a8a, op = 0.55) => {
      for (const s of [-1, 1]) add(PG.cheek, mat(color, { transparent: true, opacity: op, roughness: 0.9 }), s * 0.31, HY - 0.1, 0.47, 0, s * 0.55, 0);
    };
    const mouthY = HY - 0.2;
    if (expr === 'normal') {
      eyesOpen(); brows(0.05);
      add(PG.smile, dark, 0, mouthY + 0.04, FZ - 0.01, 0, 0, Math.PI, 0.8, 0.7, 1);
    } else if (expr === 'wait') {
      eyesOpen(); brows(-0.25, 0.2);
      add(PG.flat, dark, 0, mouthY, FZ + 0.01, 0, 0, 0.08);
      add(PG.drop, mat(0x8fd3ff, { transparent: true, opacity: 0.85, roughness: 0.1 }), 0.5, HY + 0.25, 0.25, 0, 0, 0, 0.8, 1.3, 0.8);
    } else if (expr === 'angry') {
      eyesOpen(); brows(-0.45, 0.17);
      add(PG.smile, dark, 0, mouthY - 0.05, FZ - 0.01, 0, 0, 0, 0.8, 0.7, 1);
      const red = mat(0xe02020);
      for (const r of [0.6, -0.6]) add(PG.vein, red, 0.36, HY + 0.42, 0.33, 0, 0.5, r);
    } else if (expr === 'hot') {
      eyesSquint(); brows(0.2);
      add(PG.mouthO, mat(0x5a1414), 0, mouthY, FZ, 0, 0, 0, 1, 1.2, 0.5);
      cheeks(0xff6a5a, 0.6);
      const blue = mat(0x8fd3ff, { transparent: true, opacity: 0.85, roughness: 0.1 });
      add(PG.drop, blue, -0.52, HY + 0.2, 0.25, 0, 0, 0, 0.8, 1.3, 0.8);
      add(PG.drop, blue, 0.52, HY + 0.1, 0.25, 0, 0, 0, 0.7, 1.1, 0.7);
    } else if (expr === 'eat') {
      eyesHappy(); brows(0.1, 0.21); cheeks();
      add(PG.mouthO, mat(0x5a1414), 0, mouthY, FZ, 0, 0, 0, 1.1, 0.9, 0.5);
      const nd = mat(0xe0ad3c, { roughness: 0.4 });
      for (const x of [-0.04, 0, 0.04]) add(PG.noodle, nd, x, mouthY - 0.2, FZ + 0.05, 0.1, 0, x * 2);
      const wood = mat(0xd9b27a, { roughness: 0.6 });
      add(PG.stick, wood, 0.22, mouthY - 0.28, FZ + 0.15, 0.2, 0, -0.5);
      add(PG.stick, wood, 0.28, mouthY - 0.3, FZ + 0.13, 0.2, 0, -0.42);
    } else { // happy
      eyesHappy(); brows(0.1, 0.21); cheeks();
      add(PG.smile, dark, 0, mouthY + 0.05, FZ - 0.01, 0, 0, Math.PI, 1.1, 1, 1);
    }
    if (p.glasses && expr !== 'eat' && expr !== 'happy') {
      const fr = mat(0x2a2a2a, { roughness: 0.3 });
      add(PG.lens, fr, -0.19, EY, FZ + 0.06);
      add(PG.lens, fr, 0.19, EY, FZ + 0.06);
      add(PG.bridge, fr, 0, EY + 0.02, FZ + 0.07);
    } else if (p.glasses) {
      const fr = mat(0x2a2a2a, { roughness: 0.3 });
      add(PG.lens, fr, -0.19, EY - 0.01, FZ + 0.06);
      add(PG.lens, fr, 0.19, EY - 0.01, FZ + 0.06);
      add(PG.bridge, fr, 0, EY + 0.01, FZ + 0.07);
    }
    if (p.mustache) add(PG.brow, hair, 0, HY - 0.13, FZ + 0.03, 0, 0, 0, 1.3, 1.6, 1);
    return g;
  }

  // トップページ用：具をのせたラーメン1杯の絵
  let ramenUrl = null;
  function ramenImage() {
    if (!ramenUrl) {
      ramenUrl = snapshot(360, 270, (scene) => {
        const s = makeScene(0);
        s.scene.children.filter((o) => o.isLight).forEach((l) => s.scene.remove(l));
        s.steam.forEach((sp) => { sp.visible = false; });
        scene.add(s.scene);
      }, [0, 1.6, 2.7], [0, 0.4, 0], 40);
    }
    return ramenUrl;
  }

  // お客さんへ飛んでいくラーメン1杯の絵（具の有無ごと）
  const bowlImgCache = {};
  function bowlImage(chashu, negi) {
    const k = (chashu ? 'c' : '') + (negi ? 'n' : '');
    if (!bowlImgCache[k]) {
      bowlImgCache[k] = snapshot(200, 150, (scene) => {
        const s = makeScene(0);
        s.scene.children.filter((o) => o.isLight).forEach((l) => s.scene.remove(l));
        s.steam.forEach((sp) => { sp.visible = false; });
        s.pour.visible = false;
        s.chashu.forEach((m) => { m.visible = !!chashu; });
        s.negi.forEach((m) => { m.visible = !!negi; m.position.y = m.userData.baseY + (chashu ? 0.12 : 0); });
        scene.add(s.scene);
      }, [0, 2.45, 2.7], [0, 0.38, 0], 40);
    }
    return bowlImgCache[k];
  }

  const personCache = {};
  // yaw：体の向き（0 = 正面、プラスで画面の右を向く）
  function person(idx, expr, yaw = 0) {
    const k = idx + ':' + expr + ':' + yaw;
    if (!personCache[k]) {
      personCache[k] = snapshot(128, 160, (scene) => {
        const body = buildPerson(PEOPLE[idx % PEOPLE.length], expr);
        body.rotation.y = yaw;
        scene.add(body);
        const front = new THREE.DirectionalLight(0xfff4ea, 0.55);   // 顔を正面から明るく照らす
        front.position.set(0.5, 2.2, 6); scene.add(front);
      },
        [0, 1.9, 6], [0, 1.74, 0], 16);
    }
    return personCache[k];
  }

  function makeImages() {
    let seed = 5;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const W = 2.8, D = 2.0;
    const binCam = [[0, 2.7, 2.15], [0, 0.1, 0.1], 42];   // 近づけて大きく

    const binChashu = snapshot(280, 200, (scene) => {
      scene.add(makeTray(W, D, 0.34));
      // 斜めに立てかけて並べたチャーシュー
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 5; col++) {
          const m = new THREE.Mesh(chashuGeo, chashuMats);
          if (row > 1) continue;
          if (col > 3) continue;
          m.scale.set(1.25, 1.25, 1.25);
          m.position.set(-0.93 + col * 0.62, 0.27 + col * 0.03, -0.42 + row * 0.85);
          m.rotation.set(0.15, 0, -0.45 + (rnd() - 0.5) * 0.1, 'YXZ');
          scene.add(m);
        }
      }
    }, ...binCam);

    const binNegi = snapshot(280, 200, (scene) => {
      scene.add(makeTray(W, D, 0.34));
      for (let i = 0; i < 300; i++) {
        const m = new THREE.Mesh(negiGeo, negiMats[i % 3]);
        m.scale.setScalar(3.2);
        const x = (rnd() - 0.5) * (W - 0.25), z = (rnd() - 0.5) * (D - 0.25);
        const dome = 0.28 * (1 - Math.pow(x / (W / 2), 2)) * (1 - Math.pow(z / (D / 2), 2));
        m.position.set(x, 0.1 + dome + rnd() * 0.06, z);
        m.rotation.set(-Math.PI / 2 + (rnd() - 0.5) * 1.2, (rnd() - 0.5) * 1.2, 0);
        scene.add(m);
      }
    }, ...binCam);

    const flyChashu = snapshot(96, 96, (scene) => {
      const m = new THREE.Mesh(chashuGeo, chashuMats);
      m.rotation.set(0.9, 0.5, 0, 'YXZ');
      scene.add(m);
    }, [0, 0.75, 0.7], [0, 0, 0], 50);

    const flyNegi = snapshot(96, 96, (scene) => {
      const g = negiClump(77);
      scene.add(g);
    }, [0, 0.45, 0.4], [0, 0.02, 0], 40);

    // お冷のコップ（ガラス・水・氷）。水面が揺れ、氷が浮き沈みするコマを何枚か作ってパラパラ漫画で動かす
    const glassFrame = (ph) => snapshot(80, 112, (scene) => {
      const gl = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.25, 0.9, 32, 1, true),
        new THREE.MeshPhysicalMaterial
          ? new THREE.MeshPhysicalMaterial({ color: 0xc8e8f6, roughness: 0.05, transparent: true, opacity: 0.35, clearcoat: 1, side: THREE.DoubleSide })
          : new THREE.MeshStandardMaterial({ color: 0xc8e8f6, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
      scene.add(gl);
      const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.08, 32),
        new THREE.MeshStandardMaterial({ color: 0xdff4fc, transparent: true, opacity: 0.7, roughness: 0.1 }));
      bottom.position.y = -0.41; scene.add(bottom);
      // 水（明るい水色）
      const lvl = 0.17 + Math.sin(ph) * 0.012;
      const water = new THREE.Mesh(new THREE.CylinderGeometry(0.285, 0.25, lvl + 0.37, 32),
        new THREE.MeshStandardMaterial({ color: 0x4cc4f4, transparent: true, opacity: 0.9, roughness: 0.05, emissive: 0x0a3a55 }));
      water.position.y = (lvl - 0.37) / 2; scene.add(water);
      // 揺れる水面（傾き＋波打つ）
      const sg = new THREE.CircleGeometry(0.284, 32, 0, Math.PI * 2);
      const sp = sg.attributes.position;
      for (let k = 0; k < sp.count; k++) sp.setZ(k, Math.sin(sp.getX(k) * 14 + ph * 2) * 0.012);
      sg.computeVertexNormals();
      const surf = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: 0x9fe4ff, roughness: 0.02, emissive: 0x1a5a7a }));
      surf.rotation.set(-Math.PI / 2 + Math.sin(ph) * 0.12, 0, Math.cos(ph) * 0.1);
      surf.position.y = lvl; scene.add(surf);
      const hl = new THREE.Mesh(new THREE.CircleGeometry(0.07, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
      hl.rotation.x = -Math.PI / 2; hl.position.set(-0.12 + Math.sin(ph) * 0.04, lvl + 0.015, -0.05); scene.add(hl);
      // 縁
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.022, 8, 40), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05 }));
      rim.rotation.x = Math.PI / 2; rim.position.y = 0.45; scene.add(rim);
      // 氷（水面から頭を出して浮き沈み）
      const iceM = new THREE.MeshPhysicalMaterial
        ? new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.2, clearcoat: 1, emissive: 0x9fc8dc })
        : new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x9fc8dc });
      const edgeM = new THREE.LineBasicMaterial({ color: 0x3f8fbf });
      [[-0.09, 0.05, 0.5, 0], [0.1, -0.06, 1.1, 1.7], [0.0, 0.12, 2.0, 3.1]].forEach(([x, z, r, o]) => {
        const geo = new THREE.BoxGeometry(0.2, 0.17, 0.2);
        const ice = new THREE.Mesh(geo, iceM);
        ice.position.set(x + Math.sin(ph + o) * 0.015, lvl + 0.06 + Math.sin(ph + o) * 0.025, z);
        ice.rotation.set(r + Math.sin(ph + o) * 0.15, r * 0.7, 0.3 + Math.cos(ph + o) * 0.1);
        ice.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeM));
        scene.add(ice);
      });
    }, [0, 0.8, 2.1], [0, 0.02, 0], 32);
    const glassFrames = [];
    for (let k = 0; k < 8; k++) glassFrames.push(glassFrame((k / 8) * Math.PI * 2));
    const glass = glassFrames[0];

    return { binChashu, binNegi, flyChashu, flyNegi, glass, glassFrames };
  }

  // ---------- 公開API ----------
  let kitchen = null;   // 厨房正面のどんぶり
  let counter = null;   // カウンターに出したラーメン

  function init(kitchenHost, counterHost, seatCount) {
    kitchen = makeView(kitchenHost, seatCount, 'kitchen3d');
    if (!kitchen) return false;
    counter = makeView(counterHost, seatCount, 'counter3d');
    try { api.images = makeImages(); } catch (e) { api.images = null; }
    api.ok = true;
    return true;
  }

  // 厨房のどんぶり（作っている途中）
  function draw(bowls, wraps, time) {
    kitchen.draw(bowls.map((b, i) => b && {
      el: wraps[i],
      soup: b.soup,
      soupAge: b.soupT ? (time - b.soupT) / 1000 : 99,
      men: b.men && !b.menFly,
      chashu: (b.tops.chashu - b.fly.chashu) * MAX_CHASHU,   // 1タップ = 1人前
      negi: (b.tops.negi - b.fly.negi) * MAX_NEGI,
    }), time);
  }

  // カウンターのラーメン（items[i] = null | { el, chashu, negi, eaten: 0〜1 }）
  function drawCounter(items, time) {
    if (!counter) return;
    counter.draw(items.map((it) => it && {
      el: it.el,
      soup: true,
      men: it.eaten < 0.95,
      noodleFrac: 1 - it.eaten,
      chashu: Math.ceil(it.chashu * (1 - it.eaten * 1.3)),
      negi: Math.ceil(it.negi * (1 - it.eaten * 1.6)),
    }), time);
  }

  function pieceScreenPos(slot, key, index, el) {
    return kitchen.pieceScreenPos(slot, key, index, el);
  }

  const api = { ok: false, images: null, init, draw, drawCounter, pieceScreenPos, person, personCount: PEOPLE.length, personShirt: (i) => '#' + PEOPLE[i % PEOPLE.length].shirt.toString(16).padStart(6, '0'), ramenImage, bowlImage };
  return api;
})();
