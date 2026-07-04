import * as THREE from 'three';

/* ============================================================
   POWDER DRIFT — endless sunset freeride
   Left stick: carve (momentum physics on a procedural heightfield)
   Right stick: flick = flips/spins, hold = grabs
   ============================================================ */

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;

/* ============================================================ save */
const SAVE_KEY = 'powderDriftSave';
let save = { best: 0, coins: 0, outfit: 'coral', spray: 'white',
             ownedOutfits: ['coral'], ownedSprays: ['white'], muted: false };
try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) {}
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }

const OUTFITS = [
  { id: 'coral',    name: 'Coral',    price: 0,    jacket: 0xff7f6e, beanie: 0xfff1e8, pants: 0x7a4a63, accent: 0xffd9a1, hair: 0x4a3226 },
  { id: 'mint',     name: 'Mint',     price: 250,  jacket: 0x7fe0c3, beanie: 0x2f6e5e, pants: 0x39505c, accent: 0xfff1e8, hair: 0x2c2018 },
  { id: 'sky',      name: 'Sky',      price: 400,  jacket: 0x6fb7ff, beanie: 0xfff1e8, pants: 0x2f4a6e, accent: 0xffe9a3, hair: 0x6e4a2a },
  { id: 'lavender', name: 'Lavender', price: 700,  jacket: 0xb48ee0, beanie: 0x5e3f80, pants: 0x3c3252, accent: 0xffc9de, hair: 0x1f1a2e },
  { id: 'gold',     name: 'Gold',     price: 1500, jacket: 0xffd23f, beanie: 0x8a6a10, pants: 0x5c4a1a, accent: 0xfff6dd, hair: 0x3a2a14 },
  { id: 'midnight', name: 'Midnight', price: 2500, jacket: 0x39415c, beanie: 0x11141f, pants: 0x232a3f, accent: 0x8fdcff, hair: 0x11141f },
];
const SPRAYS = [
  { id: 'white',   name: 'Powder',  price: 0,    color: '#ffffff' },
  { id: 'pink',    name: 'Blush',   price: 200,  color: '#ffb3c9' },
  { id: 'ice',     name: 'Ice',     price: 450,  color: '#8fdcff' },
  { id: 'gold',    name: 'Gold',    price: 900,  color: '#ffd76e' },
  { id: 'rainbow', name: 'Rainbow', price: 2200, color: 'rainbow' },
];
function sprayColor(t) {
  const def = SPRAYS.find(s => s.id === save.spray) || SPRAYS[0];
  if (def.color !== 'rainbow') return new THREE.Color(def.color);
  return new THREE.Color().setHSL((t * 0.25) % 1, 0.85, 0.72);
}

/* ============================================================ audio */
let AC = null;
function audio() {
  if (save.muted) return null;
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  if (AC && AC.state === 'suspended') AC.resume();
  return AC;
}
let windGain = null, windFilter = null, carveGain = null, grindGain = null;
function startAmbience() {
  const ac = audio(); if (!ac || windGain) return;
  const n = ac.sampleRate * 2, buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const mk = (type, freq, q) => {
    const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q || 1;
    const g = ac.createGain(); g.gain.value = 0;
    src.connect(f).connect(g).connect(ac.destination); src.start();
    return { f, g };
  };
  ({ f: windFilter, g: windGain } = mk('lowpass', 400));
  ({ g: carveGain } = mk('highpass', 2600));
  ({ g: grindGain } = mk('bandpass', 1400, 6));
}
function beep(freq, dur, type, vol, slide) {
  const ac = audio(); if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type || 'sine'; o.frequency.value = freq;
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, ac.currentTime + dur);
  g.gain.value = vol || .1;
  g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + dur);
  o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + dur);
}
const PENTA = [523, 587, 659, 784, 880, 1046];
const sfx = {
  coin:  () => beep(1046, .1, 'sine', .1, 1568),
  flick: () => beep(392, .12, 'triangle', .07, 523),
  bank:  n => { for (let i = 0; i <= Math.min(n, 5); i++) setTimeout(() => beep(PENTA[i], .18, 'sine', .11), i * 70); },
  thud:  () => beep(90, .2, 'sine', .22, 45),
  pop:   () => beep(240, .12, 'triangle', .08, 420),
  click: () => beep(620, .06, 'sine', .07),
  buy:   () => { beep(700, .1, 'sine', .1, 1000); setTimeout(() => beep(1050, .14, 'sine', .1, 1400), 90); },
};

/* ============================================================ input: dual virtual joysticks + keys */
const stickL = { x: 0, y: 0 }, stickR = { x: 0, y: 0 };
const flickQueue = [];
let grabHeld = false;

const RADIUS = 52;
function makeStick(el, zoneTest, state, onFlick) {
  let pid = null, baseX = 0, baseY = 0, startT = 0, flicked = false;
  const knob = el.querySelector('.knob');
  function down(e) {
    if (pid !== null || !zoneTest(e.clientX, e.clientY)) return;
    pid = e.pointerId; startT = performance.now(); flicked = false;
    el.style.left = (e.clientX - 52) + 'px'; el.style.top = (e.clientY - 52 - 11) + 'px';
    el.style.bottom = 'auto'; el.style.opacity = .9;
    baseX = e.clientX; baseY = e.clientY;
    move(e);
  }
  function move(e) {
    if (e.pointerId !== pid) return;
    let dx = e.clientX - baseX, dy = e.clientY - baseY;
    const m = Math.hypot(dx, dy);
    if (m > RADIUS) { dx *= RADIUS / m; dy *= RADIUS / m; }
    state.x = dx / RADIUS; state.y = -dy / RADIUS;
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    const mag = Math.hypot(state.x, state.y);
    if (onFlick && !flicked && mag > 0.8 && performance.now() - startT < 220) {
      flicked = true; onFlick(state.x, state.y);
    }
  }
  function up(e) {
    if (e.pointerId !== pid) return;
    pid = null; state.x = 0; state.y = 0;
    knob.style.transform = 'translate(-50%,-50%)';
    el.style.opacity = .55;
  }
  window.addEventListener('pointerdown', down);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}
function quantize(x, y) {
  const a = Math.atan2(y, x), oct = Math.round(a / (Math.PI / 4));
  const dirs = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1],[1,0]];
  return dirs[(oct + 8) % 8];
}
const stickLEl = $('stickL'), stickREl = $('stickR');
function placeSticks() {
  const b = window.innerHeight - 150;
  stickLEl.style.left = '26px'; stickLEl.style.top = b + 'px';
  stickREl.style.left = (window.innerWidth - 130) + 'px'; stickREl.style.top = b + 'px';
}
placeSticks();
makeStick(stickLEl, x => x < window.innerWidth / 2, stickL, null);
makeStick(stickREl, x => x >= window.innerWidth / 2, stickR, (x, y) => {
  const [qx, qy] = quantize(x, y);
  flickQueue.push({ x: qx, y: qy });
});

const keys = {};
window.addEventListener('keydown', e => {
  if (e.repeat) { keys[e.code] = true; return; }
  keys[e.code] = true;
  const trickKeys = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
  if (game.state === 'play' && trickKeys[e.code]) flickQueue.push({ x: trickKeys[e.code][0], y: trickKeys[e.code][1] });
  if (game.state === 'play' && e.code === 'Space') player.wantPop = true;
  if (e.code === 'Escape' && game.state === 'play') pauseGame();
  if (game.state === 'menu' && (e.code === 'Space' || e.code === 'Enter')) startRun();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

function readCarve() {
  let x = stickL.x, y = stickL.y;
  if (keys.KeyA) x -= 1;
  if (keys.KeyD) x += 1;
  if (keys.KeyW) y += 1;
  if (keys.KeyS) y -= 1;
  return { x: clamp(x, -1, 1), y: clamp(y, -1, 1) };
}
function readGrab() {
  if (Math.hypot(stickR.x, stickR.y) > 0.5) return quantize(stickR.x, stickR.y);
  if (keys.ShiftLeft || keys.ShiftRight) return [0, 1];
  const held = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
  for (const k in held) if (keys[k]) return held[k];
  return null;
}

/* ============================================================ terrain: deterministic heightfield */
function hash2(ix, iz) {
  let h = (ix * 374761393 + iz * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return lerp(lerp(hash2(ix, iz), hash2(ix + 1, iz), u),
              lerp(hash2(ix, iz + 1), hash2(ix + 1, iz + 1), u), v);
}
function fbm(x, z) {
  return vnoise(x, z) * .6 + vnoise(x * 2.7 + 13.1, z * 2.7 + 7.7) * .28 + vnoise(x * 6.3 + 31.7, z * 6.3 + 17.3) * .12;
}

const GRADE = 0.44, BOWL_W = 95;
const centerX = z => Math.sin(z * 0.0035) * 55 + Math.sin(z * 0.0011) * 85;

const SECTOR = 100;
const sectorCache = new Map();
function mulberry(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function sector(i) {
  if (sectorCache.has(i)) return sectorCache.get(i);
  const rng = mulberry(i * 7349 + 1013);
  const z0 = i * SECTOR, cx = centerX(z0 + 50);
  const s = { kickers: [], lips: [], rails: [], trees: [], rocks: [], coins: [] };
  if (i > 1) {
    const nk = rng() < .75 ? (rng() < .35 ? 2 : 1) : 0;
    for (let k = 0; k < nk; k++) {
      const kx = cx + (rng() * 2 - 1) * 45, kz = z0 + 15 + rng() * 70;
      s.kickers.push({ x: kx, z: kz, a: 3.5 + rng() * 3.5, r: 9 + rng() * 5 });
    }
    if (rng() < .3) {
      const lz = z0 + 20 + rng() * 60;
      s.lips.push({ z: lz, x: centerX(lz) + (rng() * 2 - 1) * 20, a: 2.5 + rng() * 2.5, rz: 6 + rng() * 3, rx: 30 + rng() * 25 });
    }
    if (rng() < .4) {
      const rx = cx + (rng() * 2 - 1) * 35, rz = z0 + 10 + rng() * 40;
      const len = 26 + rng() * 18, drift = (rng() * 2 - 1) * 8;
      s.rails.push({ x0: rx, z0: rz, x1: rx + drift, z1: rz + len });
    }
    if (rng() < .55) {
      const n = 6 + Math.floor(rng() * 5), ox = (rng() * 2 - 1) * 30;
      for (let c = 0; c < n; c++) {
        const cz = z0 + 8 + c * 7;
        s.coins.push({ x: centerX(cz) + ox, z: cz, y: 1.1, taken: false });
      }
    }
  }
  for (const k of s.kickers) if (rng() < .7)
    for (let c = 0; c < 5; c++)
      s.coins.push({ x: k.x, z: k.z + 4 + c * 3.4, y: k.a + 1.5 + Math.sin((c / 4) * Math.PI) * 2.6, taken: false });
  const nt = 8 + Math.floor(rng() * 8);
  for (let t = 0; t < nt; t++) {
    const tz = z0 + rng() * SECTOR;
    const side = rng() < .5 ? -1 : 1;
    const tx = centerX(tz) + side * (55 + rng() * 55);
    s.trees.push({ x: tx, z: tz, s: .8 + rng() * .8 });
  }
  if (rng() < .5) {
    const tz = z0 + rng() * SECTOR;
    s.trees.push({ x: centerX(tz) + (rng() * 2 - 1) * 35, z: tz, s: 1 + rng() * .4 });
  }
  const nr = Math.floor(rng() * 3);
  for (let r = 0; r < nr; r++) {
    const rz = z0 + rng() * SECTOR;
    s.rocks.push({ x: centerX(rz) + (rng() < .5 ? -1 : 1) * (40 + rng() * 50), z: rz, s: .7 + rng() * 1.1 });
  }
  sectorCache.set(i, s);
  if (sectorCache.size > 60) { const first = sectorCache.keys().next().value; sectorCache.delete(first); }
  return s;
}
function featureHeight(x, z) {
  let y = 0;
  const si = Math.floor(z / SECTOR);
  for (let i = si - 1; i <= si + 1; i++) {
    const s = sector(i);
    for (const k of s.kickers) {
      const dx = x - k.x, dz = z - k.z, d2 = dx * dx + dz * dz;
      if (d2 < k.r * k.r * 9) y += k.a * Math.exp(-d2 / (k.r * k.r));
    }
    for (const l of s.lips) {
      const dz = z - l.z;
      if (Math.abs(dz) < l.rz * 3) {
        const wx = Math.exp(-((x - l.x) ** 2) / (l.rx * l.rx));
        y += l.a * Math.exp(-(dz * dz) / (l.rz * l.rz)) * wx;
      }
    }
  }
  return y;
}
function terrainHeight(x, z) {
  let y = -z * GRADE;
  const dx = (x - centerX(z)) / BOWL_W;
  y += dx * dx * dx * dx * 26 + dx * dx * 10;
  y += (fbm(x * 0.016, z * 0.016) - .5) * 16;
  y += (fbm(x * 0.05 + 5.2, z * 0.05 + 9.1) - .5) * 3;
  return y + featureHeight(x, z);
}
const EPS = 0.6;
function terrainNormal(x, z, out) {
  const hl = terrainHeight(x - EPS, z), hr = terrainHeight(x + EPS, z);
  const hd = terrainHeight(x, z - EPS), hu = terrainHeight(x, z + EPS);
  out.set(hl - hr, 2 * EPS, hd - hu).normalize();
  return out;
}
function railY(r, t) {
  const y0 = terrainHeight(r.x0, r.z0) + .55, y1 = terrainHeight(r.x1, r.z1) + .55;
  return lerp(y0, y1, t);
}

/* ============================================================ three.js scene */
const canvas = $('game');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch (e) {
  $('nogl').style.display = 'flex';
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
const PASTEL_FOG = new THREE.Color(0xf6b8b8);
scene.fog = new THREE.Fog(PASTEL_FOG, 90, 380);
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  placeSticks();
}
window.addEventListener('resize', resize);
resize();

(() => {
  const c = document.createElement('canvas'); c.width = 2; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#8f6bb5'); grad.addColorStop(.42, '#e88ca0');
  grad.addColorStop(.62, '#ffb08a'); grad.addColorStop(.8, '#ffd9b0'); grad.addColorStop(1, '#ffe9cf');
  g.fillStyle = grad; g.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  scene.background = tex;
})();

const hemi = new THREE.HemisphereLight(0xfff2e6, 0xd493b0, 1.15);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd9b8, 1.5);
sun.position.set(-60, 38, 120);
scene.add(sun);

const sunDisc = new THREE.Group();
sunDisc.add(new THREE.Mesh(new THREE.CircleGeometry(26, 32),
  new THREE.MeshBasicMaterial({ color: 0xfff0d0, fog: false, transparent: true, opacity: .95 })));
const glow = new THREE.Mesh(new THREE.CircleGeometry(60, 32),
  new THREE.MeshBasicMaterial({ color: 0xffc9a1, fog: false, transparent: true, opacity: .3 }));
glow.position.z = -1;
sunDisc.add(glow);
scene.add(sunDisc);

const peaks = [];
{
  const mat = new THREE.MeshLambertMaterial({ color: 0xd9a3c0 });
  for (let i = 0; i < 6; i++) {
    const geo = new THREE.ConeGeometry(rand(90, 160), rand(120, 220), 5);
    const m = new THREE.Mesh(geo, mat);
    m.userData = { ox: (i % 2 ? 1 : -1) * rand(260, 420), oz: 300 + i * 130 };
    peaks.push(m); scene.add(m);
  }
}

/* --- terrain chunks --- */
const CHUNK = 100, XMIN = -260, XMAX = 260, SEGX = 60, SEGZ = 30;
const chunks = new Map();
const snowMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const treeTrunkMat = new THREE.MeshLambertMaterial({ color: 0x8a5a3a });
const treeTopMat = new THREE.MeshLambertMaterial({ color: 0xe8a7b8 });
const treeTopMat2 = new THREE.MeshLambertMaterial({ color: 0xc98bb0 });
const rockMat = new THREE.MeshLambertMaterial({ color: 0xb08aa8 });
const railMat = new THREE.MeshLambertMaterial({ color: 0x6e5a78 });
const coinMat = new THREE.MeshLambertMaterial({ color: 0xffd76e, emissive: 0xa87e1c });
const coinGeo = new THREE.OctahedronGeometry(.5);
const treeGeo = (() => {
  const g1 = new THREE.ConeGeometry(1.3, 2.4, 6); g1.translate(0, 2.6, 0);
  const g2 = new THREE.ConeGeometry(1.0, 2.0, 6); g2.translate(0, 4.0, 0);
  return [g1, g2];
})();
const trunkGeo = (() => { const g = new THREE.CylinderGeometry(.22, .3, 1.6, 5); g.translate(0, .8, 0); return g; })();
const rockGeo = new THREE.IcosahedronGeometry(1.4, 0);

const SNOW_A = new THREE.Color(0xfffdfb), SNOW_B = new THREE.Color(0xf7ccd6), SNOW_C = new THREE.Color(0xdfb3d0);
function buildChunk(ci) {
  const z0 = ci * CHUNK;
  const group = new THREE.Group();
  const geo = new THREE.PlaneGeometry(XMAX - XMIN, CHUNK, SEGX, SEGZ);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const col = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + (XMIN + XMAX) / 2, z = pos.getZ(i) + z0 + CHUNK / 2;
    const y = terrainHeight(x, z);
    pos.setXYZ(i, x, y, z);
    const steep = clamp((terrainHeight(x + 1, z) - y) ** 2 + (terrainHeight(x, z + 1) - y - (-GRADE)) ** 2, 0, 1);
    col.copy(SNOW_A).lerp(SNOW_B, clamp(steep * .9, 0, .8)).lerp(SNOW_C, clamp(fbm(x * .1, z * .1) - .58, 0, .3));
    colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  group.add(new THREE.Mesh(geo, snowMat));

  const s = sector(ci);
  const mkInst = (geoList, mats, items, yOf) => {
    geoList.forEach((g, gi) => {
      if (!items.length) return;
      const inst = new THREE.InstancedMesh(g, Array.isArray(mats) ? mats[gi] : mats, items.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
      items.forEach((it, ii) => {
        sc.setScalar(it.s);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash2(ii, ci) * TAU);
        m4.compose(new THREE.Vector3(it.x, yOf(it), it.z), q, sc);
        inst.setMatrixAt(ii, m4);
      });
      group.add(inst);
    });
  };
  mkInst([trunkGeo, treeGeo[0], treeGeo[1]], [treeTrunkMat, treeTopMat, treeTopMat2], s.trees, t => terrainHeight(t.x, t.z) - .1);
  mkInst([rockGeo], rockMat, s.rocks, r => terrainHeight(r.x, r.z) + .3);

  for (const r of s.rails) {
    const y0 = terrainHeight(r.x0, r.z0) + .55, y1 = terrainHeight(r.x1, r.z1) + .55;
    const len = Math.hypot(r.x1 - r.x0, r.z1 - r.z0, y1 - y0);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(.22, .12, len), railMat);
    rail.position.set((r.x0 + r.x1) / 2, (y0 + y1) / 2, (r.z0 + r.z1) / 2);
    rail.lookAt(r.x1, y1, r.z1);
    group.add(rail);
    for (let t = 0; t <= 1.001; t += .25) {
      const px = lerp(r.x0, r.x1, t), pz = lerp(r.z0, r.z1, t);
      const gy = terrainHeight(px, pz), ry = lerp(y0, y1, t);
      const post = new THREE.Mesh(new THREE.BoxGeometry(.14, Math.max(ry - gy, .2), .14), railMat);
      post.position.set(px, (ry + gy) / 2 - .06, pz);
      group.add(post);
    }
  }
  const coinMeshes = [];
  for (const c of s.coins) {
    const m = new THREE.Mesh(coinGeo, coinMat);
    m.position.set(c.x, terrainHeight(c.x, c.z) + c.y, c.z);
    m.userData.coin = c;
    c.mesh = m; coinMeshes.push(m); group.add(m);
  }
  scene.add(group);
  return { group, coinMeshes, sector: s };
}
function updateChunks(pz) {
  const ci = Math.floor(pz / CHUNK);
  for (let i = ci - 1; i <= ci + 4; i++)
    if (!chunks.has(i)) chunks.set(i, buildChunk(i));
  for (const [i, ch] of chunks) {
    if (i < ci - 2 || i > ci + 5) {
      ch.group.traverse(o => { if (o.geometry && o.geometry !== coinGeo && !treeGeo.includes(o.geometry) && o.geometry !== trunkGeo && o.geometry !== rockGeo) o.geometry.dispose(); });
      scene.remove(ch.group);
      chunks.delete(i);
    }
  }
}

/* ============================================================ cloth & hair: verlet ribbon sim */
const _cv = new THREE.Vector3(), _cv2 = new THREE.Vector3(), _cv3 = new THREE.Vector3();
class Chain {
  constructor(n, segLen) {
    this.n = n; this.segLen = segLen; this.init = false;
    this.p = []; this.q = [];
    for (let i = 0; i < n; i++) { this.p.push(new THREE.Vector3()); this.q.push(new THREE.Vector3()); }
  }
  step(dt, anchor, wind, t, phase) {
    if (!this.init) { for (let i = 0; i < this.n; i++) { this.p[i].copy(anchor); this.q[i].copy(anchor); } this.init = true; }
    this.p[0].copy(anchor);
    const dt2 = dt * dt;
    for (let i = 1; i < this.n; i++) {
      const pt = this.p[i], old = this.q[i];
      _cv.copy(pt).sub(old).multiplyScalar(.94); // damping (heavier = calmer cloth)
      old.copy(pt);
      pt.add(_cv);
      pt.y -= 30 * dt2;
      pt.addScaledVector(wind, dt2 * (1.2 + i * .8));
      // gentle turbulence flutter, stronger at the free end
      const fl = i / this.n;
      pt.x += Math.sin(t * 12 + phase + i * 1.9) * dt * .13 * fl;
      pt.y += Math.cos(t * 9.3 + phase + i * 1.4) * dt * .1 * fl;
      pt.z += Math.sin(t * 10.7 + phase * 2 + i) * dt * .1 * fl;
    }
    for (let iter = 0; iter < 3; iter++) {
      for (let i = 1; i < this.n; i++) {
        const a = this.p[i - 1], b = this.p[i];
        _cv.copy(b).sub(a);
        const d = _cv.length() || 1e-5;
        _cv.multiplyScalar((d - this.segLen) / d);
        if (i === 1) b.sub(_cv);
        else { a.addScaledVector(_cv, .5); b.addScaledVector(_cv, -.5); }
      }
    }
  }
}
class ClothRibbon {
  constructor(chain, w0, w1, color, opacity) {
    this.chain = chain; this.w0 = w0; this.w1 = w1;
    const n = chain.n;
    this.geo = new THREE.BufferGeometry();
    this.arr = new Float32Array(n * 2 * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.arr, 3));
    const idx = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({
      color, side: THREE.DoubleSide, transparent: (opacity || 1) < 1, opacity: opacity || 1 }));
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  update(camPos) {
    const c = this.chain, n = c.n;
    for (let i = 0; i < n; i++) {
      const p = c.p[i];
      _cv.copy(c.p[Math.min(i + 1, n - 1)]).sub(c.p[Math.max(i - 1, 0)]);
      _cv2.copy(camPos).sub(p);
      _cv3.crossVectors(_cv, _cv2);
      if (_cv3.lengthSq() < 1e-8) _cv3.set(1, 0, 0); else _cv3.normalize();
      const w = lerp(this.w0, this.w1, i / (n - 1)) * .5;
      this.arr[i * 6]     = p.x + _cv3.x * w; this.arr[i * 6 + 1] = p.y + _cv3.y * w; this.arr[i * 6 + 2] = p.z + _cv3.z * w;
      this.arr[i * 6 + 3] = p.x - _cv3.x * w; this.arr[i * 6 + 4] = p.y - _cv3.y * w; this.arr[i * 6 + 5] = p.z - _cv3.z * w;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
  dispose() { scene.remove(this.mesh); this.geo.dispose(); this.mesh.material.dispose(); }
}

/* ============================================================ skier model (detailed) */
function buildSkiGeo(accent) {
  const LEN = 1.55, W = .12, TH = .04, SEG = 16;
  const geo = new THREE.BoxGeometry(W, TH, LEN, 1, 1, SEG);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cTop = new THREE.Color(accent), cTip = new THREE.Color(0xfff6ee);
  const cSide = new THREE.Color(accent).multiplyScalar(.62); // bright base — visible mid-flip
  const col = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i), t = z / LEN + .5;       // 0 = tail, 1 = tip
    const topFace = pos.getY(i) > 0;
    // upturned tip & slight tail kick
    let y = pos.getY(i);
    const tipT = clamp((t - .78) / .22, 0, 1);
    y += tipT * tipT * .17;
    const tailT = clamp((.09 - t) / .09, 0, 1);
    y += tailT * tailT * .05;
    // sidecut: narrower waist under the boot
    const sc = 1 - .24 * Math.exp(-((t - .42) ** 2) / .05);
    pos.setXYZ(i, pos.getX(i) * sc, y, z);
    col.copy(topFace ? cTop : cSide);
    if (topFace && tipT > .35) col.lerp(cTip, (tipT - .35) / .65);
    colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

const cloth = { chains: [], ribbons: [], anchors: [] };
function clearCloth() {
  for (const r of cloth.ribbons) r.dispose();
  cloth.chains = []; cloth.ribbons = []; cloth.anchors = [];
}
function addStrand(parent, local, n, segLen, w0, w1, color, opacity) {
  const a = new THREE.Object3D();
  a.position.copy(local); parent.add(a);
  const ch = new Chain(n, segLen);
  cloth.anchors.push(a); cloth.chains.push(ch);
  cloth.ribbons.push(new ClothRibbon(ch, w0, w1, color, opacity));
}

function buildSkier() {
  const o = OUTFITS.find(x => x.id === save.outfit) || OUTFITS[0];
  const mJacket = new THREE.MeshLambertMaterial({ color: o.jacket });
  const mJacketD = new THREE.MeshLambertMaterial({ color: new THREE.Color(o.jacket).multiplyScalar(.8) });
  const mBeanie = new THREE.MeshLambertMaterial({ color: o.beanie });
  const mPants = new THREE.MeshLambertMaterial({ color: o.pants });
  const mSkin = new THREE.MeshLambertMaterial({ color: 0xffd9b3 });
  const mBoot = new THREE.MeshLambertMaterial({ color: 0x2c2330 });
  const mSkiVert = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mPole = new THREE.MeshLambertMaterial({ color: 0x8a8f9e });
  const mAccent = new THREE.MeshLambertMaterial({ color: o.accent });

  const root = new THREE.Group();
  const lean = new THREE.Group(); root.add(lean);   // banking roll
  const body = new THREE.Group(); lean.add(body);   // pose root at ski level

  const mkBox = (w, h, d, mat, x, y, z, parent) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); (parent || body).add(m); return m;
  };

  // --- skis (tips face +Z / travel direction) ---
  const skiGeo = buildSkiGeo(o.accent);
  const skiL = new THREE.Group(), skiR = new THREE.Group();
  skiL.position.set(-.2, .05, .12); skiR.position.set(.2, .05, .12);
  for (const s of [skiL, skiR]) {
    s.add(new THREE.Mesh(skiGeo, mSkiVert));
    // binding: toe + heel piece + riser plate
    mkBox(.11, .035, .34, mBoot, 0, .04, -.02, s);
    mkBox(.1, .07, .09, mAccent, 0, .09, .09, s);
    mkBox(.1, .08, .08, mAccent, 0, .09, -.13, s);
    body.add(s);
  }
  // boots
  const bootL = mkBox(.15, .19, .26, mBoot, -.2, .21, .1);
  const bootR = mkBox(.15, .19, .26, mBoot, .2, .21, .1);

  // --- legs with real knee bend: thigh → knee → shin ---
  const hips = new THREE.Group(); hips.position.set(0, .95, .02); body.add(hips);
  const mkLeg = sideX => {
    const thigh = new THREE.Group(); thigh.position.set(sideX, 0, 0); hips.add(thigh);
    mkBox(.19, .36, .22, mPants, 0, -.18, 0, thigh);          // baggy thigh
    const knee = new THREE.Group(); knee.position.set(0, -.36, 0); thigh.add(knee);
    mkBox(.17, .34, .19, mPants, 0, -.16, 0, knee);           // shin
    return { thigh, knee };
  };
  const legL = mkLeg(-.19), legR = mkLeg(.19);

  // --- torso (oversized = baggy jacket) ---
  const torso = new THREE.Group(); torso.position.set(0, .06, 0); hips.add(torso);
  mkBox(.52, .5, .34, mJacket, 0, .3, 0, torso);
  mkBox(.56, .14, .38, mJacketD, 0, .04, 0, torso);           // loose hem band
  mkBox(.2, .1, .1, mAccent, 0, .48, .15, torso);             // collar
  // hood resting on the back
  const hood = new THREE.Mesh(new THREE.SphereGeometry(.16, 8, 6, 0, TAU, 0, 1.9), mJacketD);
  hood.position.set(0, .42, -.2); hood.rotation.x = 1; torso.add(hood);

  // --- head: smooth face, beanie + pompom, hair flows out the back ---
  const head = new THREE.Group(); head.position.set(0, .68, .02); torso.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(.17, 12, 10), mSkin);
  head.add(skull);
  const beanie = new THREE.Mesh(new THREE.SphereGeometry(.185, 12, 8, 0, TAU, 0, 1.65), mBeanie);
  beanie.position.y = .035; head.add(beanie);
  mkBox(.38, .07, .38, mBeanie, 0, -.02, 0, head).scale.set(1, 1, 1); // brim
  const pom = new THREE.Mesh(new THREE.SphereGeometry(.07, 8, 6), mAccent);
  pom.position.set(0, .2, -.02); head.add(pom);

  // --- arms: baggy sleeves, two segments, holding poles ---
  const mkArm = sideX => {
    const shoulder = new THREE.Group(); shoulder.position.set(sideX, .42, 0); torso.add(shoulder);
    mkBox(.17, .3, .19, mJacket, 0, -.13, 0, shoulder);       // upper sleeve
    const elbow = new THREE.Group(); elbow.position.set(0, -.28, 0); shoulder.add(elbow);
    mkBox(.15, .26, .17, mJacket, 0, -.12, 0, elbow);         // forearm sleeve
    const hand = new THREE.Mesh(new THREE.SphereGeometry(.06, 6, 5), mSkin);
    hand.position.set(0, -.27, 0); elbow.add(hand);
    // pole
    const pole = new THREE.Group(); pole.position.set(0, -.27, 0); elbow.add(pole);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.014, .014, .95, 5), mPole);
    shaft.position.y = -.38; pole.add(shaft);
    const basket = new THREE.Mesh(new THREE.ConeGeometry(.05, .05, 6), mAccent);
    basket.position.y = -.78; pole.add(basket);
    pole.rotation.x = -.55; // trail backwards
    return { shoulder, elbow, pole };
  };
  const armL = mkArm(-.31), armR = mkArm(.31);

  // --- cloth: hair strands, scarf, baggy jacket hem panels ---
  clearCloth();
  for (let i = 0; i < 5; i++)
    addStrand(head, new THREE.Vector3((i - 2) * .05, .02, -.15), 6, .07, .065, .015, o.hair);
  addStrand(torso, new THREE.Vector3(.06, .44, -.14), 8, .085, .07, .03, o.accent);  // scarf
  const hemY = .02, hemC = new THREE.Color(o.jacket).multiplyScalar(.85).getHex();
  addStrand(torso, new THREE.Vector3(-.2, hemY, -.16), 4, .09, .2, .13, hemC);       // back-left flap
  addStrand(torso, new THREE.Vector3(.2, hemY, -.16), 4, .09, .2, .13, hemC);        // back-right flap
  addStrand(torso, new THREE.Vector3(-.26, hemY, .05), 4, .08, .16, .1, hemC);       // side flaps
  addStrand(torso, new THREE.Vector3(.26, hemY, .05), 4, .08, .16, .1, hemC);

  return { root, lean, body, hips, torso, head, legL, legR, armL, armR, skiL, skiR };
}
let skier = buildSkier();
scene.add(skier.root);
function reskin() {
  scene.remove(skier.root);
  skier.root.traverse(obj => { if (obj.geometry) obj.geometry.dispose(); if (obj.material) obj.material.dispose(); });
  skier = buildSkier(); scene.add(skier.root);
}

const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 20),
  new THREE.MeshBasicMaterial({ color: 0x8a4a6a, transparent: true, opacity: .28 }));
scene.add(shadow);

/* ============================================================ snow effects */
const puffTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(.6, 'rgba(255,255,255,.55)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();

function makeParticles(N, size, opacity, blending) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), life = new Float32Array(N), max = new Float32Array(N);
  pos.fill(-9999);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size, map: puffTex, transparent: true, opacity, depthWrite: false,
    blending: blending || THREE.NormalBlending });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  return { geo, pos, vel, life, max, mat, idx: 0, N,
    emit(x, y, z, vx, vy, vz, n, spread, lifeMin, lifeMax) {
      for (let i = 0; i < n; i++) {
        const j = this.idx = (this.idx + 1) % this.N;
        this.pos[j * 3] = x + rand(-spread, spread); this.pos[j * 3 + 1] = y + rand(0, spread * .6); this.pos[j * 3 + 2] = z + rand(-spread, spread);
        this.vel[j * 3] = vx + rand(-2, 2); this.vel[j * 3 + 1] = vy + rand(.4, 2.4); this.vel[j * 3 + 2] = vz + rand(-2, 2);
        this.max[j] = this.life[j] = rand(lifeMin, lifeMax);
      }
    },
    step(dt, grav) {
      for (let i = 0; i < this.N; i++) {
        if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -9999; continue; }
        this.life[i] -= dt;
        this.vel[i * 3 + 1] -= grav * dt;
        this.pos[i * 3] += this.vel[i * 3] * dt;
        this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
        this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      }
      this.geo.attributes.position.needsUpdate = true;
    } };
}
const powder = makeParticles(260, .45, .75);                       // carve spray chunks
const mist   = makeParticles(120, 2.1, .22);                       // billowing powder clouds
const sparkle = makeParticles(120, .16, .9, THREE.AdditiveBlending); // glinting crystals

/* --- carved ski tracks left in the snow --- */
class SkiTrack {
  constructor() {
    this.MAX = 90;
    this.pts = []; // {p:Vector3, n:Vector3}
    this.geo = new THREE.BufferGeometry();
    this.arr = new Float32Array(this.MAX * 2 * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.arr, 3));
    const idx = [];
    for (let i = 0; i < this.MAX - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({
      color: 0xdfb0c4, transparent: true, opacity: .5, depthWrite: false }));
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.last = new THREE.Vector3(1e9, 0, 0);
  }
  push(x, y, z, n) {
    if (this.last.distanceToSquared(_cv.set(x, y, z)) < .2) return;
    this.last.set(x, y, z);
    this.pts.push({ p: new THREE.Vector3(x, y, z).addScaledVector(n, .05), n: n.clone() });
    if (this.pts.length > this.MAX) this.pts.shift();
    this.rebuild();
  }
  rebuild() {
    const n = this.pts.length, W = .1;
    for (let i = 0; i < this.MAX; i++) {
      if (i >= n) { for (let k = 0; k < 6; k++) this.arr[i * 6 + k] = this.arr[(n ? n - 1 : 0) * 6 + (k % 3)]; continue; }
      const cur = this.pts[i];
      const nxt = this.pts[Math.min(i + 1, n - 1)], prv = this.pts[Math.max(i - 1, 0)];
      _cv.copy(nxt.p).sub(prv.p);
      const gap = i < n - 1 && this.pts[i + 1].p.distanceToSquared(cur.p) > 9; // airborne gap → collapse
      _cv3.crossVectors(cur.n, _cv);
      if (_cv3.lengthSq() < 1e-8 || gap) _cv3.set(0, 0, 0); else _cv3.setLength(W * (i / n) + .02);
      this.arr[i * 6]     = cur.p.x + _cv3.x; this.arr[i * 6 + 1] = cur.p.y + _cv3.y; this.arr[i * 6 + 2] = cur.p.z + _cv3.z;
      this.arr[i * 6 + 3] = cur.p.x - _cv3.x; this.arr[i * 6 + 4] = cur.p.y - _cv3.y; this.arr[i * 6 + 5] = cur.p.z - _cv3.z;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}
const trackL = new SkiTrack(), trackR = new SkiTrack();

const SNOW_N = 350;
const snowGeo = new THREE.BufferGeometry();
const snowPos = new Float32Array(SNOW_N * 3);
for (let i = 0; i < SNOW_N; i++) {
  snowPos[i * 3] = rand(-70, 70); snowPos[i * 3 + 1] = rand(-20, 40); snowPos[i * 3 + 2] = rand(-70, 70);
}
snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
const snowPts = new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: 0xfff6ee, size: .3, map: puffTex, transparent: true, opacity: .8, depthWrite: false }));
snowPts.frustumCulled = false;
scene.add(snowPts);

/* ============================================================ player physics + tricks */
const G = 24;
const player = {
  pos: new THREE.Vector3(centerX(30), 0, 30),
  vel: new THREE.Vector3(0, 0, 6),
  heading: 0,
  mode: 'ground',
  pitch: 0, yaw: 0,
  pitchVel: 0, yawVel: 0,
  pitchDirLanded: -1,
  grabTime: 0, grabDir: null,
  airTricks: null,
  tumbleT: 0, tumbleAxis: new THREE.Vector3(),
  wantPop: false,
  grind: null, grindT: 0, grindScore: 0,
  leanVis: 0, crouchVis: 0, tuckVis: 0, compress: 0,
};
const _n = new THREE.Vector3(), _d = new THREE.Vector3(), _tmp = new THREE.Vector3(), _wind = new THREE.Vector3();

const game = { state: 'menu', score: 0, combo: 0, distance: 0, time: 0, lastZ: 0 };
const mult = () => Math.min(1 + game.combo * .25, 4);

function resetPlayer() {
  const z = 30;
  player.pos.set(centerX(z), terrainHeight(centerX(z), z), z);
  player.vel.set(0, 0, 8);
  player.heading = 0; player.mode = 'ground';
  player.pitch = player.yaw = player.pitchVel = player.yawVel = 0;
  player.grabTime = 0; player.airTricks = null; player.grind = null;
  player.compress = 0;
  game.lastZ = z;
}
function dirOf(heading, out) { return out.set(Math.sin(heading), 0, Math.cos(heading)); }

function beginAir() {
  player.mode = 'air';
  player.pitch = player.yaw = 0;
  player.pitchVel = player.yawVel = 0;
  player.grabTime = 0; player.grabDir = null;
  player.airTricks = { flips: 0, spins: 0 };
}
function applyFlick(f) {
  sfx.flick();
  if (player.mode === 'ground') {
    player.vel.y = Math.max(player.vel.y, 0) + 5.2;
    player.pos.y += .15;
    beginAir();
    sfx.pop();
  }
  if (player.mode === 'grind') { exitGrind(1.5); beginAirKeepRot(); }
  if (player.mode !== 'air') return;
  const SPIN = TAU / .62, FLIP = TAU / .72;
  if (f.y > 0) player.pitchVel = clamp(player.pitchVel - FLIP, -FLIP * 2, FLIP * 2);
  else if (f.y < 0) player.pitchVel = clamp(player.pitchVel + FLIP, -FLIP * 2, FLIP * 2);
  if (f.x) player.yawVel = clamp(player.yawVel + f.x * SPIN, -SPIN * 2, SPIN * 2);
}
function beginAirKeepRot() {
  if (player.mode !== 'air') { const p = player.pitch, y = player.yaw, pv = player.pitchVel, yv = player.yawVel, at = player.airTricks; beginAir(); player.pitch = p; player.yaw = y; player.pitchVel = pv; player.yawVel = yv; if (at) player.airTricks = at; }
}
function estTimeToGround() {
  const h = player.pos.y - terrainHeight(player.pos.x, player.pos.z);
  const vy = player.vel.y;
  const disc = vy * vy + 2 * G * Math.max(h, 0);
  return (vy + Math.sqrt(disc)) / G;
}

const GRAB_NAMES = { '0,1': 'Mute', '0,-1': 'Indy', '-1,0': 'Method', '1,0': 'Tail Grab' };
function trickName(flips, dirP, spins, grabT, grabDir) {
  const parts = [];
  if (flips === 1) parts.push(dirP < 0 ? 'Backflip' : 'Frontflip');
  else if (flips >= 2) parts.push((dirP < 0 ? 'Double Backflip' : 'Double Frontflip') + (flips > 2 ? ' +' : ''));
  if (spins) parts.push((spins * 360) + '°');
  if (grabT > .25 && grabDir) parts.push(GRAB_NAMES[grabDir.join(',')] || 'Grab');
  return parts.join(' + ');
}

function landOrTumble() {
  const pitchErr = Math.abs(Math.atan2(Math.sin(player.pitch), Math.cos(player.pitch)));
  const yawErr = Math.abs(Math.atan2(Math.sin(player.yaw), Math.cos(player.yaw)));
  const flips = Math.round(Math.abs(player.pitch) / TAU);
  const spins = Math.round(Math.abs(player.yaw) / TAU);
  const clean = pitchErr < 1.0 && yawErr < 1.05;
  terrainNormal(player.pos.x, player.pos.z, _n);
  const impact = Math.abs(player.vel.dot(_n));
  player.vel.addScaledVector(_n, -player.vel.dot(_n));
  player.mode = 'ground';
  player.compress = clamp(impact * .09, 0, 1);
  // landing snow: powder burst + billowing mist ring + sparkles
  const bn = Math.floor(clamp(impact, 2, 16));
  powder.emit(player.pos.x, player.pos.y, player.pos.z, player.vel.x * .2, 1.5, player.vel.z * .2, bn, .5, .4, .9);
  if (impact > 4) {
    mist.emit(player.pos.x, player.pos.y + .2, player.pos.z, player.vel.x * .1, .6, player.vel.z * .1, Math.floor(bn / 2), 1.2, .8, 1.6);
    sparkle.emit(player.pos.x, player.pos.y + .3, player.pos.z, 0, 2, 0, 8, .8, .2, .45);
  }

  const t = player.airTricks;
  const grabT = player.grabTime, grabDir = player.grabDir;
  player.pitch = player.yaw = player.pitchVel = player.yawVel = 0;
  player.airTricks = null; player.grabTime = 0;

  if (!clean) { startTumble(); return; }
  if (impact > 6) sfx.thud();

  if (t && (flips || spins || grabT > .25)) {
    let pts = flips * (player.pitchDirLanded < 0 ? 150 : 130) + spins * 110;
    if (flips && spins) pts += 100;
    pts += Math.floor(grabT * 10) * 12;
    game.combo++;
    const total = Math.floor(pts * mult());
    game.score += total;
    let name = trickName(flips, player.pitchDirLanded, spins, grabT, grabDir);
    if (flips && spins) name = 'CORK ' + name;
    showTrick(name, total);
    sfx.bank(game.combo);
  }
}
function startTumble() {
  player.mode = 'tumble'; player.tumbleT = 1.3;
  player.tumbleAxis.set(rand(-1, 1), rand(-.4, .4), rand(-1, 1)).normalize();
  game.combo = 0;
  player.compress = 1;
  showTrick('WIPEOUT', 0, true);
  sfx.thud();
  powder.emit(player.pos.x, player.pos.y, player.pos.z, 0, 2.5, 0, 20, .8, .5, 1);
  mist.emit(player.pos.x, player.pos.y + .3, player.pos.z, 0, .8, 0, 8, 1.5, 1, 2);
}
function exitGrind(popV) {
  if (player.grind) {
    const pts = Math.floor(player.grindScore * mult());
    if (pts > 4) { game.score += pts; game.combo++; showTrick('RAIL GRIND', pts); sfx.bank(game.combo); }
  }
  player.grind = null;
  player.vel.y = popV || 1.2;
  player.mode = 'air';
  if (grindGain) grindGain.gain.value = 0;
}
function tryStartGrind() {
  if (player.vel.y > 1) return false;
  const si = Math.floor(player.pos.z / SECTOR);
  for (let i = si - 1; i <= si + 1; i++) {
    for (const r of sector(i).rails) {
      const dx = r.x1 - r.x0, dz = r.z1 - r.z0, len2 = dx * dx + dz * dz;
      const t = clamp(((player.pos.x - r.x0) * dx + (player.pos.z - r.z0) * dz) / len2, 0, 1);
      const rx = r.x0 + dx * t, rz = r.z0 + dz * t, ry = railY(r, t);
      const horiz = Math.hypot(player.pos.x - rx, player.pos.z - rz);
      if (horiz < .95 && player.pos.y > ry - .3 && player.pos.y < ry + 1.5) {
        player.grind = r; player.grindT = t; player.grindScore = 0;
        player.mode = 'grind';
        player.pitch = player.yaw = player.pitchVel = player.yawVel = 0;
        const speed = Math.max(player.vel.length(), 9);
        const dl = Math.hypot(dx, dz);
        player.vel.set(dx / dl * speed, 0, dz / dl * speed);
        player.pos.set(rx, ry + .12, rz);
        if (grindGain) grindGain.gain.value = .12;
        return true;
      }
    }
  }
  return false;
}

/* ============================================================ update */
function updatePlayer(dt) {
  const carve = readCarve();

  while (flickQueue.length) applyFlick(flickQueue.shift());
  if (player.wantPop) {
    player.wantPop = false;
    if (player.mode === 'ground') { player.vel.y += 5.2; player.pos.y += .15; beginAir(); sfx.pop(); }
  }

  if (player.mode === 'ground') {
    terrainNormal(player.pos.x, player.pos.z, _n);

    const speed = player.vel.length();
    const steerRate = lerp(2.6, 1.5, clamp(speed / 30, 0, 1));
    player.heading += carve.x * dt * steerRate;
    player.heading = clamp(player.heading, -1.35, 1.35);
    dirOf(player.heading, _d);

    _tmp.set(0, -G, 0).addScaledVector(_n, G * _n.y);
    player.vel.addScaledVector(_tmp, dt);

    const along = player.vel.dot(_d);
    _tmp.copy(player.vel).addScaledVector(_d, -along);
    const grip = carve.y < -0.2 ? 10 : 6.5;
    const latMag = _tmp.length();
    player.vel.addScaledVector(_tmp, -(1 - Math.exp(-grip * dt)));
    let drag = .05 + (carve.y < -0.2 ? .5 : 0) - (carve.y > 0.3 ? .028 : 0);
    player.vel.multiplyScalar(Math.exp(-drag * dt));
    if (player.vel.length() > 42) player.vel.setLength(42);
    if (player.vel.length() < 4) player.vel.addScaledVector(dirOf(0, _tmp), 2.5 * dt);

    // carve spray from the ski edges + glints
    const carving = clamp(latMag * .25 + Math.abs(carve.x) * speed * .04, 0, 1);
    if (carving > .22) {
      dirOf(player.heading + (carve.x > 0 ? -.9 : .9), _tmp);
      powder.emit(player.pos.x, player.pos.y + .1, player.pos.z, _tmp.x * 3.2, 1.6, _tmp.z * 3.2, carving > .5 ? 2 : 1, .35, .4, .85);
      if (carving > .55 && Math.random() < .5)
        sparkle.emit(player.pos.x, player.pos.y + .2, player.pos.z, _tmp.x * 2, 1.5, _tmp.z * 2, 2, .4, .15, .35);
    }
    // high-speed powder wake
    if (speed > 24 && Math.random() < .45)
      mist.emit(player.pos.x, player.pos.y + .1, player.pos.z, -_d.x * 2, .3, -_d.z * 2, 1, .7, .6, 1.2);
    if (carveGain) carveGain.gain.value = carving * .05 * clamp(speed / 18, 0, 1);

    player.pos.addScaledVector(player.vel, dt);
    const newGy = terrainHeight(player.pos.x, player.pos.z);
    if (player.pos.y - newGy > .35 || player.vel.y > 3) {
      beginAir();
    } else {
      player.pos.y = newGy;
      terrainNormal(player.pos.x, player.pos.z, _n);
      player.vel.addScaledVector(_n, -player.vel.dot(_n));
    }

    // physical banking: lean angle from centripetal accel (a = v·ω)
    const bank = Math.atan2(speed * Math.abs(carve.x) * steerRate, 9.8) * Math.sign(carve.x);
    player.leanVis = lerp(player.leanVis, -clamp(bank, -1.05, 1.05), 8 * dt);
    player.crouchVis = lerp(player.crouchVis, carving * .35, 8 * dt);
    player.tuckVis = lerp(player.tuckVis, carve.y > .3 ? 1 : 0, 6 * dt);

  } else if (player.mode === 'air') {
    player.vel.y -= G * dt;
    player.pos.addScaledVector(player.vel, dt);

    // tucking into a grab tightens rotation (angular momentum)
    const spinBoost = (readGrab() && player.grabTime > .05) ? 1.22 : 1;
    player.pitch += player.pitchVel * spinBoost * dt;
    player.yaw += player.yawVel * spinBoost * dt;
    if (Math.abs(player.pitchVel) > .1) player.pitchDirLanded = Math.sign(player.pitchVel);
    if (player.airTricks) {
      player.airTricks.flips = Math.abs(player.pitch) / TAU;
      player.airTricks.spins = Math.abs(player.yaw) / TAU;
    }
    const g = readGrab();
    if (g && player.pos.y - terrainHeight(player.pos.x, player.pos.z) > .6) {
      player.grabTime += dt; player.grabDir = g;
    }
    const tta = estTimeToGround();
    if (tta < .34) {
      player.pitchVel *= Math.exp(-9 * dt);
      player.yawVel *= Math.exp(-9 * dt);
      const snapP = Math.round(player.pitch / TAU) * TAU;
      const snapY = Math.round(player.yaw / TAU) * TAU;
      if (Math.abs(player.pitch - snapP) < 1.1) player.pitch = lerp(player.pitch, snapP, 1 - Math.exp(-10 * dt));
      if (Math.abs(player.yaw - snapY) < 1.15) player.yaw = lerp(player.yaw, snapY, 1 - Math.exp(-10 * dt));
    }
    if (player.vel.y < 1 && tryStartGrind()) { /* grinding */ }
    else {
      const gy = terrainHeight(player.pos.x, player.pos.z);
      if (player.pos.y <= gy) { player.pos.y = gy; landOrTumble(); }
    }
    player.crouchVis = lerp(player.crouchVis, player.grabTime > 0 && readGrab() ? .6 : .18, 8 * dt);
    player.leanVis = lerp(player.leanVis, 0, 6 * dt);
    player.tuckVis = lerp(player.tuckVis, 0, 6 * dt);

  } else if (player.mode === 'grind') {
    const r = player.grind;
    const dx = r.x1 - r.x0, dz = r.z1 - r.z0, dl = Math.hypot(dx, dz);
    const speed = player.vel.length();
    player.grindT += (speed * dt) / dl;
    player.grindScore += 22 * dt;
    if (player.grindT >= 1) { player.pos.set(r.x1, railY(r, 1) + .12, r.z1); exitGrind(2.2); }
    else {
      player.pos.set(r.x0 + dx * player.grindT, railY(r, player.grindT) + .12, r.z0 + dz * player.grindT);
      sparkle.emit(player.pos.x, player.pos.y - .05, player.pos.z, 0, .8, 0, 1, .15, .1, .3);
      if (Math.abs(carve.x) > .75) { exitGrind(2.5); player.vel.x += carve.x * 6; }
    }
    player.heading = Math.atan2(dx, dz);
    player.leanVis = lerp(player.leanVis, 0, 10 * dt);
    player.crouchVis = lerp(player.crouchVis, .45, 10 * dt);

  } else if (player.mode === 'tumble') {
    player.tumbleT -= dt;
    const gy = terrainHeight(player.pos.x, player.pos.z);
    terrainNormal(player.pos.x, player.pos.z, _n);
    _tmp.set(0, -G, 0).addScaledVector(_n, G * _n.y);
    player.vel.addScaledVector(_tmp, dt);
    player.vel.multiplyScalar(Math.exp(-2.2 * dt));
    player.pos.addScaledVector(player.vel, dt);
    player.pos.y = Math.max(player.pos.y - 20 * dt, gy);
    if (Math.random() < .6) powder.emit(player.pos.x, player.pos.y, player.pos.z, 0, 1.5, 0, 1, .5, .4, .8);
    if (player.tumbleT <= 0) {
      player.mode = 'ground';
      player.vel.setLength(Math.max(player.vel.length(), 5));
    }
  }

  player.compress = Math.max(0, player.compress - player.compress * 6.5 * dt - dt * .3);

  if (player.mode === 'ground') {
    const si = Math.floor(player.pos.z / SECTOR);
    const speed = player.vel.length();
    for (let i = si; i <= si + 1; i++) {
      const s = sector(i);
      for (const t of s.trees) {
        const d = Math.hypot(player.pos.x - t.x, player.pos.z - t.z);
        if (d < 1.05 * t.s) {
          if (speed > 9) { startTumble(); player.vel.multiplyScalar(.3); }
          else { player.vel.multiplyScalar(.5); player.pos.x += (player.pos.x - t.x) * .2; }
        }
      }
      for (const rk of s.rocks) {
        const d = Math.hypot(player.pos.x - rk.x, player.pos.z - rk.z);
        if (d < 1.4 * rk.s && speed > 9) { startTumble(); player.vel.multiplyScalar(.3); }
      }
    }
    // lay down ski tracks
    dirOf(player.heading, _d);
    terrainNormal(player.pos.x, player.pos.z, _n);
    _cv2.crossVectors(_n, _d).setLength(.2);
    trackL.push(player.pos.x - _cv2.x, terrainHeight(player.pos.x - _cv2.x, player.pos.z - _cv2.z), player.pos.z - _cv2.z, _n);
    trackR.push(player.pos.x + _cv2.x, terrainHeight(player.pos.x + _cv2.x, player.pos.z + _cv2.z), player.pos.z + _cv2.z, _n);
  }

  {
    const si = Math.floor(player.pos.z / SECTOR);
    for (let i = si; i <= si + 1; i++) {
      for (const c of sector(i).coins) {
        if (c.taken) continue;
        const cy = terrainHeight(c.x, c.z) + c.y;
        const d2 = (player.pos.x - c.x) ** 2 + (player.pos.y + .6 - cy) ** 2 + (player.pos.z - c.z) ** 2;
        if (d2 < 2.4 * 2.4) {
          c.taken = true;
          if (c.mesh) c.mesh.visible = false;
          game.coins = (game.coins || 0) + 1;
          game.score += Math.floor(25 * mult());
          sparkle.emit(c.x, cy, c.z, 0, 2, 0, 6, .3, .2, .4);
          sfx.coin();
        }
      }
    }
  }

  if (player.pos.z > game.lastZ) {
    game.distance += player.pos.z - game.lastZ;
    game.score += (player.pos.z - game.lastZ) * .35;
    game.lastZ = player.pos.z;
  }
  if (Math.floor(game.score) > save.best) { save.best = Math.floor(game.score); game.newBest = true; }
}

/* ============================================================ visuals update */
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);
function updateSkierVisual(dt) {
  const r = skier.root;
  r.position.copy(player.pos);

  if (player.mode === 'tumble') {
    _q1.setFromAxisAngle(player.tumbleAxis, dt * 11);
    r.quaternion.premultiply(_q1);
    r.position.y += .4;
  } else {
    _e.set(0, player.heading, 0);
    _q1.setFromEuler(_e);
    if (player.mode === 'air') {
      _e.set(player.pitch, 0, 0); _q2.setFromEuler(_e);
      _q1.multiply(_q2);
      _e.set(0, player.yaw, 0); _q2.setFromEuler(_e);
      _q2.multiply(_q1); _q1.copy(_q2);
      r.position.y += .1;
    } else if (player.mode === 'ground') {
      terrainNormal(player.pos.x, player.pos.z, _n);
      _q2.setFromUnitVectors(UP, _n);
      _q2.multiply(_q1); _q1.copy(_q2);
    }
    r.quaternion.slerp(_q1, 1 - Math.exp(-18 * dt));
  }

  // pose: banking lean, knee-bend crouch, landing compression, terrain chatter
  const speed = player.vel.length();
  let chatter = 0;
  if (player.mode === 'ground' && speed > 6)
    chatter = (vnoise(player.pos.x * 2.1, player.pos.z * 2.1) - .5) * clamp(speed / 26, 0, 1) * .35;
  const crouch = clamp(player.crouchVis + player.compress * .8 + player.tuckVis * .45 + chatter, 0, 1.4);

  skier.lean.rotation.z = player.leanVis;
  skier.hips.position.y = .95 - crouch * .3;
  const thighRot = .18 + crouch * .75, kneeRot = -.28 - crouch * 1.1;
  skier.legL.thigh.rotation.x = thighRot; skier.legR.thigh.rotation.x = thighRot;
  skier.legL.knee.rotation.x = kneeRot; skier.legR.knee.rotation.x = kneeRot;
  skier.torso.rotation.x = .14 + crouch * .35 + player.tuckVis * .4;
  // slight independent ski float in the air
  const skiFloat = player.mode === 'air' ? -.18 : 0;
  skier.skiL.rotation.x = lerp(skier.skiL.rotation.x, skiFloat, 8 * dt);
  skier.skiR.rotation.x = skier.skiL.rotation.x;

  // arms: baggy swing with speed, reach for grabs, poles trail
  const grabbing = player.mode === 'air' && readGrab() && player.grabTime > .05;
  const swing = Math.sin(game.time * 2.2) * .08 * clamp(speed / 20, 0, 1);
  skier.armL.shoulder.rotation.z = lerp(skier.armL.shoulder.rotation.z, grabbing ? 1.7 : .45 + swing, 10 * dt);
  skier.armR.shoulder.rotation.z = lerp(skier.armR.shoulder.rotation.z, grabbing ? -.15 : -.45 + swing, 10 * dt);
  skier.armL.shoulder.rotation.x = lerp(skier.armL.shoulder.rotation.x, player.tuckVis * .5, 8 * dt);
  skier.armR.shoulder.rotation.x = skier.armL.shoulder.rotation.x;
  skier.armL.elbow.rotation.x = lerp(skier.armL.elbow.rotation.x, grabbing ? -.9 : -.35 - player.tuckVis * .4, 10 * dt);
  skier.armR.elbow.rotation.x = skier.armL.elbow.rotation.x;
  skier.armL.pole.rotation.x = lerp(skier.armL.pole.rotation.x, -.55 - clamp(speed / 42, 0, 1) * .5, 6 * dt);
  skier.armR.pole.rotation.x = skier.armL.pole.rotation.x;

  // cloth & hair: wind = apparent airflow from motion
  r.updateMatrixWorld(true);
  _wind.copy(player.vel).multiplyScalar(-1.1);
  _wind.y += .5; // slight updraft keeps cloth lively
  for (let i = 0; i < cloth.chains.length; i++) {
    cloth.anchors[i].getWorldPosition(_tmp);
    cloth.chains[i].step(dt, _tmp, _wind, game.time, i * 1.37);
    cloth.ribbons[i].update(camera.position);
  }

  // blob shadow
  const gy = terrainHeight(player.pos.x, player.pos.z);
  const h = clamp(player.pos.y - gy, 0, 12);
  shadow.position.set(player.pos.x, gy + .06, player.pos.z);
  terrainNormal(player.pos.x, player.pos.z, _n);
  shadow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _n);
  const ss = clamp(1.1 - h * .06, .3, 1.1);
  shadow.scale.setScalar(ss);
  shadow.material.opacity = .28 * ss;
}

const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
function updateCamera(dt, instant) {
  const speed = player.vel.length();
  dirOf(player.heading * .7, _d);
  const back = 8 + speed * .09;
  camPos.copy(player.pos).addScaledVector(_d, -back).add(_tmp.set(0, 3.4 + (player.mode === 'air' ? .8 : 0), 0));
  camPos.y -= player.compress * .55; // landing dip
  if (speed > 26) { // subtle speed shake
    const a = (speed - 26) * .004;
    camPos.x += rand(-a, a); camPos.y += rand(-a, a);
  }
  const cg = terrainHeight(camPos.x, camPos.z) + 1.2;
  if (camPos.y < cg) camPos.y = cg;
  camLook.copy(player.pos).addScaledVector(_d, 5).add(_tmp.set(0, 1.1, 0));
  if (instant) camera.position.copy(camPos);
  else camera.position.lerp(camPos, 1 - Math.exp(-4.2 * dt));
  camera.lookAt(camLook);
  const fovT = 62 + clamp(speed - 12, 0, 26) * .5 + (player.mode === 'air' ? 3 : 0);
  camera.fov = lerp(camera.fov, fovT, 1 - Math.exp(-3 * dt));
  camera.updateProjectionMatrix();

  sunDisc.position.set(camera.position.x - 40, camera.position.y + 26, camera.position.z + 330);
  sunDisc.lookAt(camera.position);
  for (const p of peaks) {
    const u = p.userData;
    const zz = camera.position.z + ((u.oz + camera.position.z * .05) % 500) + 250;
    p.position.set(camera.position.x + u.ox, -zz * GRADE + 30, zz);
  }
}

function updateParticles(dt) {
  powder.step(dt, 13);
  mist.step(dt, 1.2);
  sparkle.step(dt, 5);
  powder.mat.color.copy(sprayColor(game.time));
  mist.mat.color.copy(sprayColor(game.time)).lerp(new THREE.Color(0xffffff), .5);

  for (let i = 0; i < SNOW_N; i++) {
    snowPos[i * 3 + 1] -= dt * 2.2;
    snowPos[i * 3] += Math.sin(game.time * .7 + i) * dt * .6;
    if (snowPos[i * 3 + 1] < -25) snowPos[i * 3 + 1] = 35;
  }
  snowGeo.attributes.position.needsUpdate = true;
  snowPts.position.copy(camera.position);

  const ci = Math.floor(player.pos.z / CHUNK);
  for (let i = ci; i <= ci + 2; i++) {
    const ch = chunks.get(i);
    if (ch) for (const m of ch.coinMeshes) { m.rotation.y += dt * 2.5; }
  }
}

/* ============================================================ HUD + UI */
let hudScore = -1, hudCoins = -1, hudBest = -1, hudMult = -1;
function updateHUD() {
  const s = Math.floor(game.score);
  if (s !== hudScore) { $('scoreVal').textContent = s.toLocaleString(); hudScore = s; }
  const c = save.coins + (game.coins || 0);
  if (c !== hudCoins) { $('coinVal').textContent = c; hudCoins = c; }
  if (save.best !== hudBest) { $('bestVal').textContent = save.best.toLocaleString(); hudBest = save.best; }
  if (game.combo !== hudMult) {
    hudMult = game.combo;
    const b = $('multBadge');
    if (game.combo > 0) { b.textContent = '×' + mult().toFixed(2).replace(/\.?0+$/, '') + ' COMBO'; b.style.opacity = 1; }
    else b.style.opacity = 0;
  }
  if (windGain) {
    const sp = player.vel.length();
    windGain.gain.value = clamp(sp / 42, 0, 1) * .09;
    windFilter.frequency.value = 300 + sp * 22;
  }
}
let trickTimeout = null;
function showTrick(name, pts, bad) {
  const t = $('trickToast');
  t.querySelector('.name').textContent = name;
  t.querySelector('.name').style.color = bad ? '#ffb3b3' : '#fff';
  t.querySelector('.pts').textContent = pts > 0 ? '+' + pts.toLocaleString() : '';
  t.style.opacity = 1; t.style.transform = 'translateX(-50%) scale(1.06)';
  clearTimeout(trickTimeout);
  trickTimeout = setTimeout(() => { t.style.opacity = 0; t.style.transform = 'translateX(-50%) scale(1)'; }, 1400);
}
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.style.opacity = 1;
  clearTimeout(t._h); t._h = setTimeout(() => { t.style.opacity = 0; }, 1600);
}
function showOverlay(id) {
  for (const o of ['menu', 'pause', 'shop']) $(o).classList.toggle('hidden', o !== id);
  $('pauseBtn').classList.toggle('hidden', id !== null);
}

/* ============================================================ game flow */
function bankRun() {
  save.coins += (game.coins || 0);
  game.coins = 0;
  persist();
}
function startRun() {
  game.state = 'play'; game.score = 0; game.combo = 0; game.coins = 0; game.distance = 0; game.newBest = false;
  hudScore = hudCoins = hudMult = -1;
  resetPlayer();
  updateChunks(player.pos.z);
  updateCamera(0, true);
  showOverlay(null);
  startAmbience();
  sfx.click();
}
function pauseGame() {
  game.state = 'pause';
  showOverlay('pause');
  bankRun();
  if (windGain) windGain.gain.value = 0;
  if (carveGain) carveGain.gain.value = 0;
  if (grindGain) grindGain.gain.value = 0;
}
function toMenu() {
  game.state = 'menu';
  bankRun();
  $('menuBest').textContent = save.best > 0 ? `🏆 Best ${save.best.toLocaleString()}  ·  🪙 ${save.coins}` : '';
  showOverlay('menu');
}

$('playBtn').addEventListener('click', startRun);
$('pauseBtn').addEventListener('click', pauseGame);
$('resumeBtn').addEventListener('click', () => { game.state = 'play'; showOverlay(null); sfx.click(); });
$('exitBtn').addEventListener('click', () => { toMenu(); sfx.click(); });
$('shopBtn').addEventListener('click', () => { renderShop(); showOverlay('shop'); sfx.click(); });
$('shopBack').addEventListener('click', () => { toMenu(); sfx.click(); });
$('soundBtn').addEventListener('click', () => {
  save.muted = !save.muted; persist();
  $('soundBtn').textContent = save.muted ? '🔇 Muted' : '🔊 Sound';
  if (save.muted && AC) { AC.suspend(); } else if (AC) { AC.resume(); }
});
$('soundBtn').textContent = save.muted ? '🔇 Muted' : '🔊 Sound';
window.addEventListener('visibilitychange', () => { if (document.hidden && game.state === 'play') pauseGame(); persist(); });

function renderShop() {
  $('shopCoins').textContent = save.coins;
  const build = (rowEl, items, ownedKey, selKey, dotColor) => {
    rowEl.innerHTML = '';
    for (const it of items) {
      const owned = save[ownedKey].includes(it.id);
      const el = document.createElement('button');
      el.className = 'swatch' + (save[selKey] === it.id ? ' selected' : '') + (owned ? '' : ' locked');
      const col = dotColor(it);
      const style = col === 'rainbow'
        ? 'background:conic-gradient(red,orange,yellow,lime,cyan,blue,magenta,red);color:#fff'
        : `background:${col};color:${col}`;
      el.innerHTML = `<span class="dot" style="${style}"></span><span>${it.name}</span>` +
        (owned ? '' : `<span class="price">🪙 ${it.price}</span>`);
      el.addEventListener('click', () => {
        if (owned) { save[selKey] = it.id; persist(); reskin(); sfx.click(); }
        else if (save.coins >= it.price) {
          save.coins -= it.price; save[ownedKey].push(it.id); save[selKey] = it.id;
          persist(); reskin(); sfx.buy(); toast(`${it.name} unlocked! 🎉`);
        } else { toast(`Need ${it.price - save.coins} more coins!`); sfx.click(); }
        renderShop();
      });
      rowEl.appendChild(el);
    }
  };
  build($('outfitRow'), OUTFITS, 'ownedOutfits', 'outfit', it => '#' + it.jacket.toString(16).padStart(6, '0'));
  build($('sprayRow'), SPRAYS, 'ownedSprays', 'spray', it => it.color);
}

/* ============================================================ main loop */
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, .05);
  last = now;
  game.time += dt;

  if (game.state === 'play') {
    updatePlayer(dt);
    updateChunks(player.pos.z);
    updateSkierVisual(dt);
    updateCamera(dt);
    updateHUD();
  } else if (game.state === 'menu') {
    const a = game.time * .22;
    camera.position.set(player.pos.x + Math.sin(a) * 11, player.pos.y + 4, player.pos.z + Math.cos(a) * 11);
    camera.lookAt(player.pos.x, player.pos.y + 1, player.pos.z);
    updateSkierVisual(dt);
  }
  updateParticles(dt);
  renderer.render(scene, camera);
}
document.addEventListener('visibilitychange', () => { last = performance.now(); });

/* boot */
resetPlayer();
updateChunks(player.pos.z);
updateSkierVisual(0);
toMenu();
requestAnimationFrame(frame);

/* debug handle for automated verification */
window.G = { game, player, save, terrainHeight, sector, startRun, flickQueue, applyFlick, persist, THREE, cloth };
