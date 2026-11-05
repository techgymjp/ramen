'use strict';
// =====================================================================
// どんぶりの3D表示（Three.js）
// 厨房正面のどんぶり置き場に1枚のキャンバスを重ね、
// どんぶりごとにビューポートを切って描画する。
// Three.js が読み込めないときは何もしない（2D表示のまま遊べる）。
// =====================================================================
const Bowl3D = (() => {
  if (typeof THREE === 'undefined') return { ok: false };

  const MAX_CHASHU = 8;   // チャーシュー1人前 = 8枚（どんぶりのふちにぐるりと）
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

  // チャーシューの断面：照りのある焼き色のふち、ばら色の肉、渦巻く脂
  const chashuTex = canvasTex(512, 512, (g, w) => {
    const c = w / 2;
    let seed = 21;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    // 焼き色のふち（でこぼこ）
    g.fillStyle = '#4a1d0a';
    g.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.08) {
      const r = c * (0.97 + Math.sin(a * 5) * 0.015 + rnd() * 0.02);
      const x = c + Math.cos(a) * r, y = c + Math.sin(a) * r;
      a === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.fill();
    const bark = g.createRadialGradient(c, c, c * 0.7, c, c, c);
    bark.addColorStop(0, '#9a4a22'); bark.addColorStop(0.6, '#6e2c10'); bark.addColorStop(1, '#3d1606');
    g.fillStyle = bark; g.beginPath(); g.arc(c, c, c * 0.93, 0, Math.PI * 2); g.fill();
    // 肉（外は濃い、中はばら色）
    const meat = g.createRadialGradient(c * 0.95, c * 0.95, 10, c, c, c * 0.84);
    meat.addColorStop(0, '#f2b8a0'); meat.addColorStop(0.55, '#d98a70'); meat.addColorStop(0.85, '#b9614a'); meat.addColorStop(1, '#8e3e26');
    g.fillStyle = meat; g.beginPath(); g.arc(c, c, c * 0.84, 0, Math.PI * 2); g.fill();
    // 肉の繊維
    g.strokeStyle = 'rgba(150,60,40,.18)'; g.lineWidth = 2;
    for (let k = 0; k < 60; k++) {
      const a = rnd() * Math.PI * 2, r = rnd() * c * 0.75;
      g.beginPath(); g.arc(c, c, r, a, a + 0.4 + rnd() * 0.6); g.stroke();
    }
    // 渦巻く脂（やわらかい縁）
    g.lineCap = 'round';
    const spiral = (lw, col) => {
      g.strokeStyle = col; g.lineWidth = lw;
      g.beginPath();
      for (let a = 0; a < Math.PI * 6.2; a += 0.04) {
        const r = 10 + a * 10.5 + Math.sin(a * 3) * 3;
        const x = c + Math.cos(a) * r, y = c + Math.sin(a) * r;
        a === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
    };
    spiral(26, 'rgba(250,215,190,.35)');
    spiral(15, 'rgba(255,236,218,.9)');
    spiral(6, 'rgba(255,250,240,.9)');
    // タレの照り
    const hi = g.createRadialGradient(c * 0.68, c * 0.6, 4, c * 0.68, c * 0.6, c * 0.6);
    hi.addColorStop(0, 'rgba(255,255,255,.5)'); hi.addColorStop(0.5, 'rgba(255,240,220,.12)'); hi.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hi; g.beginPath(); g.arc(c, c, c * 0.9, 0, Math.PI * 2); g.fill();
  });

  // チャーシューの側面：照りのある焼き色に、脂の層
  const chashuSideTex = canvasTex(512, 64, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#5a210c'); grd.addColorStop(0.25, '#8a3c1a'); grd.addColorStop(0.5, '#c06a48');
    grd.addColorStop(0.75, '#8a3c1a'); grd.addColorStop(1, '#4a1a08');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,230,210,.55)';
    for (let x = 0; x < w; x += 23) g.fillRect(x, h * 0.42, 9 + (x % 7), h * 0.14);
    g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(0, h * 0.2, w, 2);
  });
  chashuSideTex.wrapS = THREE.RepeatWrapping;

  // スープの表面：澄んだ醤油色に、ゆらぐ油の膜と小さな油の粒
  const soupTex = canvasTex(512, 512, (g, w) => {
    const c = w / 2;
    const grd = g.createRadialGradient(c, c, 10, c, c, c);
    grd.addColorStop(0, '#b8692c'); grd.addColorStop(0.6, '#9c4f1c'); grd.addColorStop(1, '#6e3010');
    g.fillStyle = grd; g.fillRect(0, 0, w, w);
    let seed = 3;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    // 大きくぼんやりした油の膜
    for (let i = 0; i < 18; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * c * 0.8;
      const x = c + Math.cos(a) * r, y = c + Math.sin(a) * r, s = 20 + rnd() * 45;
      const o = g.createRadialGradient(x, y, 0, x, y, s);
      o.addColorStop(0, 'rgba(240,170,70,.35)'); o.addColorStop(1, 'rgba(240,170,70,0)');
      g.fillStyle = o; g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill();
    }
    // 小さな油の粒（少なめ・透明感）
    for (let i = 0; i < 70; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * c * 0.92;
      const x = c + Math.cos(a) * r, y = c + Math.sin(a) * r;
      const s = 1.5 + rnd() * 5;
      g.strokeStyle = `rgba(255, ${200 + rnd() * 40 | 0}, 120, ${0.35 + rnd() * 0.3})`;
      g.lineWidth = 1.2;
      g.beginPath(); g.ellipse(x, y, s, s * 0.85, 0, 0, Math.PI * 2); g.stroke();
      g.fillStyle = 'rgba(255,240,200,.35)';
      g.beginPath(); g.arc(x - s * 0.3, y - s * 0.3, s * 0.35, 0, Math.PI * 2); g.fill();
    }
  });

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
    ? new THREE.MeshPhysicalMaterial({ map: soupTex, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03, reflectivity: 0.6 })
    : new THREE.MeshStandardMaterial({ map: soupTex, roughness: 0.15 });

  // 麺：ゆるく波打った太めの麺を山盛りに
  const noodleMat = new THREE.MeshStandardMaterial({ color: 0xe0ad3c, roughness: 0.35 });
  const noodleGeos = (() => {
    let seed = 11;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const geos = [];
    for (let n = 0; n < 30; n++) {
      const pts = [];
      const a0 = rnd() * Math.PI * 2;
      let x = Math.cos(a0) * rnd() * 0.5, z = Math.sin(a0) * rnd() * 0.5;
      let dir = rnd() * Math.PI * 2;
      const lift = 0.015 + rnd() * 0.06;
      for (let i = 0; i < 14; i++) {
        dir += (rnd() - 0.5) * 1.3;
        x += Math.cos(dir) * 0.09; z += Math.sin(dir) * 0.09;
        const r = Math.hypot(x, z);
        if (r > 0.66) { x *= 0.66 / r; z *= 0.66 / r; dir += Math.PI * 0.6; }
        const dome = 0.08 * (1 - Math.min(1, Math.hypot(x, z) / 0.7));
        pts.push(new THREE.Vector3(x, SOUP_Y + lift + dome + Math.sin(i * 1.7) * 0.012, z));
      }
      geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.026, 7, false));
    }
    return geos;
  })();

  // チャーシュー：側面は茶色、上面に断面テクスチャ
  // 厚切りのチャーシュー（少しだけ楕円）
  const chashuGeo = new THREE.CylinderGeometry(0.27, 0.27, 0.11, 48, 2);
  chashuGeo.scale(1.08, 1, 0.95);
  const chashuMats = [
    new THREE.MeshPhysicalMaterial
      ? new THREE.MeshPhysicalMaterial({ map: chashuSideTex, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2 })
      : new THREE.MeshStandardMaterial({ map: chashuSideTex, roughness: 0.3 }),
    new THREE.MeshPhysicalMaterial
      ? new THREE.MeshPhysicalMaterial({ map: chashuTex, roughness: 0.28, clearcoat: 0.9, clearcoatRoughness: 0.15 })
      : new THREE.MeshStandardMaterial({ map: chashuTex, roughness: 0.28 }),
    new THREE.MeshStandardMaterial({ map: chashuTex, roughness: 0.35 }),
  ];
  // 置き場所（奥側に立てかける）
  const CHASHU_POS = [
    { x: -0.36, z: -0.28, ry: 0.4 },
    { x: 0.08, z: -0.42, ry: 0.0 },
    { x: 0.44, z: -0.22, ry: -0.45 },
    { x: -0.1, z: -0.08, ry: 0.15 },
  ];

  // ネギ：小口切りの輪
  const negiGeo = new THREE.TorusGeometry(0.034, 0.014, 6, 14);
  const negiMats = [
    new THREE.MeshStandardMaterial({ color: 0x2f8a26, roughness: 0.35 }),
    new THREE.MeshStandardMaterial({ color: 0x5fb336, roughness: 0.35 }),
    new THREE.MeshStandardMaterial({ color: 0xcfe9a0, roughness: 0.35 }),
  ];
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
      o.rotation.set(-Math.PI / 2 + (rnd() - 0.5) * 1.1, (rnd() - 0.5) * 1.1, 0);
      o.scale.setScalar(1.25);
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

    // チャーシューはどんぶりのふちに沿って花びらのように並べ、外側を少し立てかける
    const chashu = [];
    for (let i = 0; i < MAX_CHASHU; i++) {
      const th = -Math.PI / 2 + (i / MAX_CHASHU) * Math.PI * 2 + 0.2;  // 奥から順に
      const r = 0.5;
      const m = new THREE.Mesh(chashuGeo, chashuMats);
      m.position.set(Math.cos(th) * r, SOUP_Y + 0.13 + (i % 2) * 0.012 + i * 0.004, Math.sin(th) * r);
      // 奥の数枚は外側を持ち上げて立てかけ、手前は寝かせる。どれも切り口がこちら（カメラ）を向く
      const back = Math.max(0, -Math.sin(th));
      m.rotation.set(0.25 + back * 0.45, 0, -Math.cos(th) * 0.25 * back, 'XYZ');
      m.rotateY(i * 1.3);                             // 渦巻きの向きをばらばらに
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
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = false;
    if ('outputEncoding' in renderer) renderer.outputEncoding = THREE.sRGBEncoding;
    if (!encoded) {
      for (const t of [bowlOuterTex, bowlInnerTex, chashuTex, chashuSideTex, soupTex]) if ('encoding' in t) t.encoding = THREE.sRGBEncoding;
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
    if (!matCache[k]) matCache[k] = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.55 }, opts || {}));
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
    const skin = mat(skinColor, { roughness: 0.6 });
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

  const personCache = {};
  function person(idx, expr) {
    const k = idx + ':' + expr;
    if (!personCache[k]) {
      personCache[k] = snapshot(128, 160, (scene) => scene.add(buildPerson(PEOPLE[idx % PEOPLE.length], expr)),
        [0, 1.9, 6], [0, 1.74, 0], 16);
    }
    return personCache[k];
  }

  function makeImages() {
    let seed = 5;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const W = 2.8, D = 2.0;
    const binCam = [[0, 3.5, 3.0], [0, 0.12, 0.05], 38];

    const binChashu = snapshot(280, 200, (scene) => {
      scene.add(makeTray(W, D, 0.34));
      // 斜めに立てかけて並べたチャーシュー
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 5; col++) {
          const m = new THREE.Mesh(chashuGeo, chashuMats);
          m.scale.set(1.55, 1.5, 1.55);
          m.position.set(-1.0 + col * 0.5 + (row % 2) * 0.1, 0.26 + row * 0.02, -0.55 + row * 0.55);
          m.rotation.set(0.75 + (rnd() - 0.5) * 0.15, (rnd() - 0.5) * 0.5, 0, 'YXZ');
          scene.add(m);
        }
      }
    }, ...binCam);

    const binNegi = snapshot(280, 200, (scene) => {
      scene.add(makeTray(W, D, 0.34));
      for (let i = 0; i < 520; i++) {
        const m = new THREE.Mesh(negiGeo, negiMats[i % 3]);
        m.scale.setScalar(2.1);
        const x = (rnd() - 0.5) * (W - 0.25), z = (rnd() - 0.5) * (D - 0.25);
        const dome = 0.28 * (1 - Math.pow(x / (W / 2), 2)) * (1 - Math.pow(z / (D / 2), 2));
        m.position.set(x, 0.1 + dome + rnd() * 0.06, z);
        m.rotation.set(-Math.PI / 2 + (rnd() - 0.5) * 1.2, (rnd() - 0.5) * 1.2, 0);
        scene.add(m);
      }
    }, ...binCam);

    const flyChashu = snapshot(96, 96, (scene) => {
      const m = new THREE.Mesh(chashuGeo, chashuMats);
      m.rotation.set(1.0, 0.2, 0, 'YXZ');
      scene.add(m);
    }, [0, 0.55, 0.55], [0, 0, 0], 40);

    const flyNegi = snapshot(96, 96, (scene) => {
      const g = negiClump(77);
      scene.add(g);
    }, [0, 0.45, 0.4], [0, 0.02, 0], 40);

    return { binChashu, binNegi, flyChashu, flyNegi };
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

  const api = { ok: false, images: null, init, draw, drawCounter, pieceScreenPos, person, personCount: PEOPLE.length, ramenImage };
  return api;
})();
