/* ==========================================================================
   悬浮之境 · Aether Terrarium
   A procedural, self-contained miniature world inside a glass cube.
   Three.js r160 (classic build) — no external assets.
   ========================================================================== */
(() => {
  'use strict';

  const THREE = window.THREE;
  const loadingEl = document.getElementById('loading');
  const fatalEl = document.getElementById('fatal');
  const fatalMessageEl = document.getElementById('fatalMessage');

  function showFatal(message) {
    if (loadingEl) loadingEl.classList.add('is-hidden');
    if (fatalEl) fatalEl.hidden = false;
    if (fatalMessageEl) fatalMessageEl.textContent = message;
  }

  if (!THREE) {
    showFatal('Three.js 未能载入，请确认 vendor/three.min.js 与 index.html 位于同一文件夹中。');
    return;
  }

  /* ------------------------------------------------------------------ *
   *  01 · Small utilities
   * ------------------------------------------------------------------ */
  const TAU = Math.PI * 2;
  const V3 = THREE.Vector3;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
  const smoothstep = (a, b, v) => {
    const t = clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function random() {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const random = mulberry32(0x0A37E7C1);
  const randomRange = (a, b) => a + random() * (b - a);
  const randomSign = () => (random() < 0.5 ? -1 : 1);

  function hash2(x, y) {
    const v = Math.sin(x * 127.1 + y * 311.7 + 19.19) * 43758.5453123;
    return v - Math.floor(v);
  }

  function valueNoise(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi);
    const b = hash2(xi + 1, yi);
    const c = hash2(xi, yi + 1);
    const d = hash2(xi + 1, yi + 1);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  }

  function fbm(x, y, octaves = 4) {
    let value = 0;
    let amplitude = 0.5;
    let frequency = 1;
    let total = 0;
    for (let i = 0; i < octaves; i += 1) {
      value += valueNoise(x * frequency, y * frequency) * amplitude;
      total += amplitude;
      amplitude *= 0.5;
      frequency *= 2.03;
    }
    return value / total;
  }

  const color = (hex) => new THREE.Color(hex);
  function colorRgb(c, mult = 1) {
    return new THREE.Color(c.r * mult, c.g * mult, c.b * mult);
  }

  function createLinearGradientTexture(stops, width = 4, height = 256) {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    stops.forEach(([at, value]) => gradient.addColorStop(at, value));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  function createGlowTexture(size = 256, softness = 0.32, core = 0.55) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(core * 0.4, 'rgba(255,255,255,0.92)');
    g.addColorStop(core, 'rgba(255,255,255,0.24)');
    g.addColorStop(softness + 0.4, 'rgba(255,255,255,0.055)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }

  function createMistTexture(size = 512) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    const image = ctx.createImageData(size, size);
    const data = image.data;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const nx = x / (size - 1) - 0.5;
        const ny = y / (size - 1) - 0.5;
        const d = Math.sqrt(nx * nx + ny * ny) * 2;
        const n = fbm(x / 48 + 4.2, y / 48 - 2.7, 3);
        const feather = smoothstep(1.0, 0.1, d);
        const alpha = feather * (0.34 + 0.66 * n) * 0.72;
        const i = (y * size + x) * 4;
        data[i] = 245;
        data[i + 1] = 250;
        data[i + 2] = 255;
        data[i + 3] = Math.floor(clamp(alpha, 0, 1) * 255);
      }
    }
    ctx.putImageData(image, 0, 0);
    // Soften the procedural grain into a wisplike veil.
    ctx.globalCompositeOperation = 'destination-in';
    const mask = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    mask.addColorStop(0, 'rgba(255,255,255,1)');
    mask.addColorStop(0.5, 'rgba(255,255,255,0.7)');
    mask.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = mask;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }

  function createCloudTexture(seed = 3) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const rand = mulberry32(seed);
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    function addLobe(cx, cy, rx, ry, alpha) {
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
      gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
      gradient.addColorStop(0.5, `rgba(255,255,255,${alpha * 0.82})`);
      gradient.addColorStop(0.78, `rgba(255,255,255,${alpha * 0.34})`);
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry));
      ctx.translate(-cx, -cy);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(rx, ry), 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // A wide, softly heaped cumulus mass with a flatter base.
    ctx.globalCompositeOperation = 'source-over';
    addLobe(w * 0.5, h * 0.6, w * 0.39, h * 0.25, 0.82);
    addLobe(w * 0.31, h * 0.58, w * 0.2, h * 0.22, 0.74);
    addLobe(w * 0.69, h * 0.58, w * 0.19, h * 0.21, 0.72);
    addLobe(w * 0.42, h * 0.44, w * 0.16, h * 0.24, 0.82);
    addLobe(w * 0.58, h * 0.42, w * 0.17, h * 0.25, 0.8);
    addLobe(w * 0.5, h * 0.36, w * 0.12, h * 0.18, 0.75);
    addLobe(w * 0.23, h * 0.48, w * 0.12, h * 0.16, 0.6);
    addLobe(w * 0.77, h * 0.47, w * 0.11, h * 0.15, 0.58);

    // A handful of uneven cauliflower crowns.
    for (let i = 0; i < 7; i += 1) {
      const t = i / 6;
      addLobe(
        w * (0.3 + t * 0.4) + (rand() - 0.5) * w * 0.05,
        h * (0.33 + rand() * 0.12),
        w * (0.055 + rand() * 0.05),
        h * (0.08 + rand() * 0.07),
        0.55 + rand() * 0.18
      );
    }

    // Wispy skirt, just enough to melt the base into the air.
    for (let i = 0; i < 4; i += 1) {
      addLobe(
        w * (0.24 + i * 0.16),
        h * (0.7 + rand() * 0.08),
        w * (0.12 + rand() * 0.1),
        h * 0.055,
        0.17 + rand() * 0.1
      );
    }

    // Internal modelling: bright top, cool shaded underside.
    ctx.globalCompositeOperation = 'source-atop';
    const shade = ctx.createLinearGradient(0, h * 0.18, 0, h * 0.9);
    shade.addColorStop(0, 'rgba(255,255,255,1)');
    shade.addColorStop(0.3, 'rgba(254,252,247,0.99)');
    shade.addColorStop(0.62, 'rgba(224,233,241,0.96)');
    shade.addColorStop(0.84, 'rgba(166,187,205,0.92)');
    shade.addColorStop(1, 'rgba(121,146,169,0.88)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, h);

    // Occluded pockets between the billows create a sense of thickness.
    for (let i = 0; i < 6; i += 1) {
      const cx = w * (0.27 + rand() * 0.46);
      const cy = h * (0.57 + rand() * 0.2);
      const r = w * (0.055 + rand() * 0.08);
      const pocket = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      pocket.addColorStop(0, 'rgba(123,148,170,0.22)');
      pocket.addColorStop(0.55, 'rgba(139,162,182,0.1)');
      pocket.addColorStop(1, 'rgba(139,162,182,0)');
      ctx.fillStyle = pocket;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }

    // Soft light pooling on the top-left crowns.
    const glow = ctx.createRadialGradient(w * 0.34, h * 0.32, 0, w * 0.34, h * 0.32, w * 0.37);
    glow.addColorStop(0, 'rgba(255,249,237,0.62)');
    glow.addColorStop(0.45, 'rgba(255,250,240,0.2)');
    glow.addColorStop(1, 'rgba(255,250,240,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    // A brighter rim on the highest puffs.
    for (let i = 0; i < 4; i += 1) {
      const cx = w * (0.34 + i * 0.09);
      const cy = h * (0.3 + rand() * 0.04);
      const r = w * (0.07 + rand() * 0.04);
      const highlight = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      highlight.addColorStop(0, 'rgba(255,252,242,0.36)');
      highlight.addColorStop(1, 'rgba(255,252,242,0)');
      ctx.fillStyle = highlight;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
  }

  function makeFullscreenPass(fragmentShader, uniforms = {}) {
    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    return { mesh, material };
  }

  /* ------------------------------------------------------------------ *
   *  02 · Scale and geography
   * ------------------------------------------------------------------ */
  const CUBE = {
    size: 10.0,
    half: 5.0,
    centerY: 0.83,
  };
  const SCENE_TARGET = new V3(0, 0.48, 0);
  const LAKE = {
    x: 1.66,
    z: 1.62,
    radius: 1.16,
    level: -1.02,
  };
  const WATER = {
    poolY: -0.91,
    lakeY: LAKE.level,
  };

  const RIVER_CONTROL = [
    [-1.34, -0.06],
    [-1.12, 0.08],
    [-0.82, 0.16],
    [-0.48, 0.27],
    [-0.16, 0.43],
    [0.10, 0.62],
    [0.40, 0.79],
    [0.76, 0.98],
    [1.10, 1.17],
    [1.38, 1.31],
  ];

  const riverCurve = new THREE.CatmullRomCurve3(
    RIVER_CONTROL.map(([x, z]) => new V3(x, 0, z)),
    false,
    'catmullrom',
    0.48
  );

  const RIVER_SAMPLE_COUNT = 260;
  const riverSamples = [];
  for (let i = 0; i < RIVER_SAMPLE_COUNT; i += 1) {
    const t = i / (RIVER_SAMPLE_COUNT - 1);
    const p = riverCurve.getPoint(t);
    riverSamples.push({ x: p.x, z: p.z, t });
  }

  function riverSurfaceY(t) {
    const e = Math.pow(smoothstep(0, 1, t), 0.82);
    return lerp(WATER.poolY, WATER.lakeY, e);
  }

  function riverWidthAt(t) {
    return (0.31 + 0.20 * smoothstep(0, 1, t)) * (1 + 0.07 * Math.sin(t * 18.0 + 0.9));
  }

  function nearestRiver(x, z) {
    let best = Infinity;
    let bestI = 0;
    for (let i = 0; i < RIVER_SAMPLE_COUNT; i += 1) {
      const p = riverSamples[i];
      const dx = x - p.x;
      const dz = z - p.z;
      const d = dx * dx + dz * dz;
      if (d < best) {
        best = d;
        bestI = i;
      }
    }
    const p = riverSamples[bestI];
    return {
      d: Math.sqrt(best),
      t: p.t,
      x: p.x,
      z: p.z,
      waterY: riverSurfaceY(p.t),
      width: riverWidthAt(p.t),
    };
  }

  function lakeShape(theta) {
    return 1 + 0.085 * Math.sin(theta * 3 + 1.4) + 0.045 * Math.sin(theta * 5 - 0.8) + 0.028 * Math.sin(theta * 8 + 2.1);
  }

  function lakeNormalized(x, z) {
    const dx = x - LAKE.x;
    const dz = z - LAKE.z;
    const theta = Math.atan2(dz, dx);
    const shape = lakeShape(theta);
    const ex = LAKE.radius * 1.08 * shape;
    const ez = LAKE.radius * 0.9 * shape;
    return {
      nd: Math.sqrt((dx / ex) * (dx / ex) + (dz / ez) * (dz / ez)),
      theta,
      ex,
      ez,
    };
  }

  function rawTerrainHeight(x, z) {
    let h = -1.18;
    h += (fbm(x * 0.55 + 4.2, z * 0.55 - 2.6, 4) - 0.47) * 0.28;
    h += 0.34 * Math.exp(-(((x - 1.1) ** 2) / 3.1 + ((z + 1.7) ** 2) / 2.0));
    h += 0.22 * Math.exp(-(((x + 2.62) ** 2) / 1.65 + ((z - 0.1) ** 2) / 2.7));
    h += 0.24 * Math.exp(-(((x - 2.45) ** 2) / 1.7 + ((z - 0.25) ** 2) / 3.1));
    h += 0.075 * Math.exp(-(((x + 0.2) ** 2) / 4.3 + ((z - 1.4) ** 2) / 2.4));

    const mdx = (x + 1.35) / 2.55;
    const mdz = (z + 1.58) / 2.15;
    const md = Math.sqrt(mdx * mdx + mdz * mdz);
    h += 0.48 * Math.pow(clamp(1 - md, 0, 1), 1.35);

    const rr = Math.hypot(x, z);
    h += 0.05 * smoothstep(3.25, 4.02, rr);
    return h;
  }

  function terrainHeight(x, z) {
    let h = rawTerrainHeight(x, z);
    const nr = nearestRiver(x, z);
    const halfWidth = nr.width * 0.5;

    if (nr.d < halfWidth + 0.42) {
      const bank = smoothstep(halfWidth * 0.48, halfWidth + 0.42, nr.d);
      const channel = nr.waterY - 0.155 + bank * 0.28;
      h = Math.min(h, channel);
    }

    const lake = lakeNormalized(x, z);
    if (lake.nd < 1.27) {
      const bowl = LAKE.level - 0.30 + 0.315 * Math.pow(clamp(lake.nd / 1.24, 0, 1), 1.15);
      h = Math.min(h, bowl);
    }

    return h;
  }

  function isWaterAt(x, z, margin = 0) {
    const nr = nearestRiver(x, z);
    if (nr.d < nr.width * 0.5 + margin) return true;
    const lake = lakeNormalized(x, z);
    return lake.nd < 1 + margin;
  }

  function terrainEdgeRadius(theta) {
    return 4.12 * (
      1 +
      0.047 * Math.sin(theta * 3 + 1.7) +
      0.026 * Math.sin(theta * 7 + 0.4) +
      0.016 * Math.sin(theta * 13 - 2.2)
    );
  }

  const COLORS = {
    grassDark: color(0x34513d),
    grassMid: color(0x4e7450),
    grassLight: color(0x7e9b60),
    grassSun: color(0x93aa68),
    heather: color(0x586b4d),
    moss: color(0x6d8553),
    sand: color(0xa39674),
    wetStone: color(0x7e7d70),
    soil: color(0x4a3528),
    soilLight: color(0x6a4d35),
    stone: color(0x59605a),
    stoneDark: color(0x313b3e),
    rock: color(0x6d746f),
    snow: color(0xe7f1fa),
    snowShade: color(0xb9d2e7),
    waterDeep: color(0x0c3041),
    waterShallow: color(0x2f7e7e),
    waterSky: color(0x9bc8dd),
    waterFoam: color(0xd8edf1),
  };

  const tempTerrainColor = new THREE.Color();
  const tempTerrainColorB = new THREE.Color();

  function terrainColorAt(x, z, h, target) {
    const grain = fbm(x * 2.5 + 4.0, z * 2.5 - 1.3, 3);
    const broad = fbm(x * 0.8 - 2.2, z * 0.8 + 8.4, 3);

    target.copy(COLORS.grassDark).lerp(COLORS.grassMid, smoothstep(0.18, 0.8, grain));
    target.lerp(COLORS.grassLight, smoothstep(0.54, 0.91, broad) * 0.55);
    target.lerp(COLORS.grassSun, smoothstep(0.66, 0.95, fbm(x * 4.1 + 2.4, z * 4.1 + 7.7, 2)) * 0.28);
    target.lerp(COLORS.heather, smoothstep(0.38, 0.92, h + 0.2) * 0.18);

    const nr = nearestRiver(x, z);
    const bankBand = 1 - smoothstep(0.10, 0.48, nr.d - nr.width * 0.5);
    if (bankBand > 0.001) {
      tempTerrainColorB.copy(COLORS.sand).lerp(COLORS.wetStone, smoothstep(0.1, 0.4, grain));
      target.lerp(tempTerrainColorB, bankBand * 0.7);
    }

    const lake = lakeNormalized(x, z);
    if (lake.nd < 1.35) {
      const shore = 1 - smoothstep(0.92, 1.3, lake.nd);
      tempTerrainColorB.copy(COLORS.wetStone).lerp(COLORS.moss, 0.26);
      target.lerp(tempTerrainColorB, shore * 0.68);
      if (lake.nd < 1.02) {
        target.lerp(COLORS.waterDeep, 0.42);
      }
    }

    target.multiplyScalar(0.9 + grain * 0.19);
    return target;
  }

  /* ------------------------------------------------------------------ *
   *  03 · World assembly root
   * ------------------------------------------------------------------ */
  const QUALITY = (() => {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const narrow = window.innerWidth <= 820;
    const cores = navigator.hardwareConcurrency || 8;
    const mobile = coarse || narrow;
    return {
      mobile,
      maxDpr: mobile ? 1.28 : cores <= 4 ? 1.4 : 1.7,
      shadowSize: mobile ? 1024 : 2048,
      msaaSamples: mobile ? 2 : 4,
    };
  })();

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: document.getElementById('world'),
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
  } catch (error) {
    console.error(error);
    showFatal('当前浏览器无法创建 WebGL 场景。请更新浏览器，或开启硬件加速后再试。');
    return;
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02050a);
  scene.fog = null;

  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 180);
  camera.position.set(14.5, 12.0, 17.0);
  camera.lookAt(SCENE_TARGET);

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY.maxDpr));
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const worldRoot = new THREE.Group();
  worldRoot.name = 'world-root';
  scene.add(worldRoot);

  const worldContent = new THREE.Group();
  worldContent.name = 'terrain-and-life';
  worldRoot.add(worldContent);

  const shared = {
    glowTexture: createGlowTexture(),
    mistTexture: createMistTexture(),
    time: 0,
  };

  /* ------------------------------------------------------------------ *
   *  04 · Procedural terrain and its floating rock underside
   * ------------------------------------------------------------------ */
  function buildTerrain() {
    const segments = 196;
    const rings = 80;
    const positions = [];
    const colors = [];
    const uvs = [];
    const indices = [];
    const boundary = [];

    for (let i = 0; i <= rings; i += 1) {
      const rt = i / rings;
      for (let j = 0; j < segments; j += 1) {
        const theta = (j / segments) * TAU;
        const edgeR = terrainEdgeRadius(theta);
        const radius = edgeR * rt;
        const x = Math.cos(theta) * radius;
        const z = Math.sin(theta) * radius;
        const y = terrainHeight(x, z);
        positions.push(x, y, z);
        uvs.push(j / segments, rt);
        terrainColorAt(x, z, y, tempTerrainColor);
        colors.push(tempTerrainColor.r, tempTerrainColor.g, tempTerrainColor.b);
        if (i === rings) {
          boundary.push({ x, y, z, theta, edgeR });
        }
      }
    }

    for (let i = 0; i < rings; i += 1) {
      for (let j = 0; j < segments; j += 1) {
        const next = (j + 1) % segments;
        const a = i * segments + j;
        const b = i * segments + next;
        const c = (i + 1) * segments + j;
        const d = (i + 1) * segments + next;
        indices.push(a, b, d);
        indices.push(a, d, c);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.93,
      metalness: 0.0,
      envMapIntensity: 0.32,
      side: THREE.FrontSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'living-island-top';
    worldContent.add(mesh);

    buildCliffUnderside(boundary, segments);
    return mesh;
  }

  const UNDERSIDE_LAYERS = 24;
  const undersideColors = {
    lip: color(0x3e4b36),
    soilA: color(0x5a4030),
    soilB: color(0x826041),
    strata: color(0x98744f),
    rockA: color(0x616965),
    rockB: color(0x424b4f),
    deep: color(0x2b353b),
    coolShadow: color(0x1a2c36),
  };

  function buildCliffUnderside(boundary, segments) {
    const positions = [];
    const colors = [];
    const indices = [];
    const temp = new THREE.Color();
    const depthCache = [];

    for (let i = 0; i < segments; i += 1) {
      const b = boundary[i];
      depthCache.push(2.0 + 0.33 * fbm(Math.cos(b.theta) * 2.8 + 2.0, Math.sin(b.theta) * 2.8 - 4.0, 3) + 0.11 * Math.sin(b.theta * 4 + 1.3));
    }

    for (let layer = 0; layer <= UNDERSIDE_LAYERS; layer += 1) {
      const t = layer / UNDERSIDE_LAYERS;
      for (let i = 0; i < segments; i += 1) {
        const b = boundary[i];
        const theta = b.theta;
        const depth = depthCache[i];

        let radiusScale;
        if (layer === 0) {
          radiusScale = 1;
        } else if (t < 0.3) {
          const lip = 1 + 0.032 * Math.exp(-Math.pow((t - 0.045) / 0.09, 2));
          radiusScale = lip * (1.01 - t * 0.16);
        } else {
          const u = (t - 0.3) / 0.7;
          const taper = 0.94 * Math.pow(1 - u, 0.9) + 0.035;
          radiusScale = taper;
        }

        const strata = (fbm(theta * 2.2 + 9.0, t * 7.5 - 1.3, 3) - 0.5);
        const ripple = Math.sin(theta * 5.0 - t * 7.0 + 1.6) * 0.07 * t * (1 - t);
        const rs = radiusScale * (1 + ripple + strata * 0.08 * t);
        const driftX = Math.sin(theta * 2.3 + 0.7) * 0.2 * t * t;
        const driftZ = Math.cos(theta * 3.1 - 1.1) * 0.16 * t * t;

        const x = b.x * rs + driftX;
        const z = b.z * rs + driftZ;
        const y = b.y - depth * Math.pow(t, 0.82) + Math.sin(theta * 7 + t * 9) * 0.022 * t;

        positions.push(x, y, z);

        if (t < 0.055) {
          temp.copy(undersideColors.lip);
        } else if (t < 0.24) {
          const band = 0.5 + 0.5 * Math.sin(t * 42 + theta * 3);
          temp.copy(undersideColors.soilA).lerp(undersideColors.soilB, band * 0.75);
        } else if (t < 0.46) {
          const band = 0.5 + 0.5 * Math.sin(t * 52 - theta * 2);
          temp.copy(undersideColors.soilB).lerp(undersideColors.strata, band * 0.55);
        } else {
          const band = 0.5 + 0.5 * Math.sin(t * 66 + theta * 4);
          temp.copy(undersideColors.rockA).lerp(undersideColors.rockB, band * 0.8);
          if (t > 0.82) temp.lerp(undersideColors.deep, smoothstep(0.82, 1, t) * 0.7);
        }
        const shade = 0.75 + fbm(x * 4.0, z * 4.0, 2) * 0.3;
        const frontBake = 0.78 + 0.3 * Math.max(0, Math.cos(theta - 0.8));
        const verticalBake = 1.02 - t * 0.34;
        const groove = t < 0.3 ? 0.74 + 0.3 * (0.5 + 0.5 * Math.sin(theta * 23.0 + t * 16.0 + 1.2)) : 1.0;
        temp.multiplyScalar(shade * frontBake * verticalBake * groove * 0.92);
        temp.lerp(undersideColors.coolShadow, smoothstep(0.28, 1, t) * 0.3);
        colors.push(temp.r, temp.g, temp.b);
      }
    }

    for (let layer = 0; layer < UNDERSIDE_LAYERS; layer += 1) {
      for (let i = 0; i < segments; i += 1) {
        const next = (i + 1) % segments;
        const a = layer * segments + i;
        const b = layer * segments + next;
        const c = (layer + 1) * segments + i;
        const d = (layer + 1) * segments + next;
        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }

    // Close the underside with a softly irregular point.
    const centerIndex = positions.length / 3;
    let avgX = 0;
    let avgZ = 0;
    let minY = Infinity;
    for (let i = 0; i < segments; i += 1) {
      const idx = UNDERSIDE_LAYERS * segments + i;
      avgX += positions[idx * 3];
      avgZ += positions[idx * 3 + 2];
      minY = Math.min(minY, positions[idx * 3 + 1]);
    }
    avgX /= segments;
    avgZ /= segments;
    positions.push(avgX + 0.06, minY - 0.26, avgZ - 0.03);
    temp.copy(undersideColors.deep).multiplyScalar(0.85);
    colors.push(temp.r, temp.g, temp.b);

    for (let i = 0; i < segments; i += 1) {
      const next = (i + 1) % segments;
      const a = UNDERSIDE_LAYERS * segments + i;
      const b = UNDERSIDE_LAYERS * segments + next;
      indices.push(centerIndex, b, a);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();

    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
    });
    undersideMagic.surfaceMaterial = material;

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.name = 'floating-rock-underside';
    worldContent.add(mesh);

    // A few long roots / hanging threads make the floating island feel rooted.
    const rootMaterial = new THREE.MeshStandardMaterial({
      color: 0x38402e,
      roughness: 0.96,
      metalness: 0,
    });
    for (let i = 0; i < 9; i += 1) {
      const idx = Math.floor((i / 9) * segments * 0.9 + segments * 0.05) % segments;
      const b = boundary[idx];
      const out = 0.98 + randomRange(-0.02, 0.04);
      const top = new V3(b.x * out, b.y - 0.8, b.z * out);
      const mid = new V3(
        b.x * (0.95 + randomRange(-0.04, 0.02)),
        b.y - 1.5 - random() * 0.3,
        b.z * (0.95 + randomRange(-0.04, 0.02))
      );
      const end = new V3(
        b.x * (0.88 + randomRange(-0.06, 0.03)),
        b.y - 2.0 - random() * 0.45,
        b.z * (0.88 + randomRange(-0.06, 0.03))
      );
      const curve = new THREE.CatmullRomCurve3([top, mid, end]);
      const geo = new THREE.TubeGeometry(curve, 10, 0.011, 3, false);
      worldContent.add(new THREE.Mesh(geo, rootMaterial));
    }
  }

  /* ------------------------------------------------------------------ *
   *  05 · River and lake surfaces
   * ------------------------------------------------------------------ */
  function makeWaterMaterial() {
    const uniforms = {
      uTime: { value: 0 },
      uSunDir: { value: new V3(0.4, 0.8, 0.4) },
      uSunColor: { value: new THREE.Color(1.0, 0.82, 0.56) },
      uDeep: { value: COLORS.waterDeep.clone() },
      uShallow: { value: COLORS.waterShallow.clone() },
      uSky: { value: COLORS.waterSky.clone() },
      uFoam: { value: COLORS.waterFoam.clone() },
      uEnvMap: { value: null },
      uEnvTint: { value: new THREE.Color(0x9fc7dc) },
      uEnvStrength: { value: 0.55 },
      uOpacity: { value: 0.84 },
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: `
        uniform float uTime;
        attribute float aEdge;
        attribute float aDepth;
        varying vec2 vUv;
        varying vec3 vWorld;
        varying float vEdge;
        varying float vDepth;

        void main() {
          vUv = uv;
          vEdge = aEdge;
          vDepth = aDepth;
          vec3 p = position;
          p.y += sin(position.x * 2.1 + uTime * 0.7) * 0.0025;
          vec4 world = modelMatrix * vec4(p, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uDeep;
        uniform vec3 uShallow;
        uniform vec3 uSky;
        uniform vec3 uFoam;
        uniform samplerCube uEnvMap;
        uniform vec3 uEnvTint;
        uniform float uEnvStrength;
        uniform float uOpacity;
        varying vec2 vUv;
        varying vec3 vWorld;
        varying float vEdge;
        varying float vDepth;

        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }

        float noise21(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash21(i);
          float b = hash21(i + vec2(1.0, 0.0));
          float c = hash21(i + vec2(0.0, 1.0));
          float d = hash21(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        void main() {
          vec2 p = vWorld.xz;
          float t = uTime;
          float nA = noise21(p * 4.8 + vec2(t * 0.11, -t * 0.07));
          float nB = noise21(p * 9.0 + vec2(-t * 0.16, t * 0.10));
          float nC = noise21(p * 22.0 + vec2(t * 0.22, t * 0.14));
          float nD = noise21(p * 42.0 + vec2(t * 0.31, -t * 0.19));
          vec2 grad = vec2((nA - 0.5) * 0.72 + (nC - 0.5) * 0.3, (nB - 0.5) * 0.72 + (nD - 0.5) * 0.26);
          vec3 N = normalize(vec3(grad.x * 0.26, 1.0, grad.y * 0.26));

          vec3 V = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
          float deepMask = smoothstep(0.02, 0.72, vDepth);
          float edgeFade = 1.0 - smoothstep(0.88, 1.0, vEdge);

          vec3 base = mix(uShallow, uDeep, deepMask * 0.9);
          base = mix(base, uShallow * 1.04, 0.1 + 0.14 * nB * (1.0 - deepMask));
          base *= 0.76 + 0.15 * smoothstep(0.0, 0.7, nA);
          vec3 R = reflect(-V, N);
          vec3 sky = mix(uSky * 0.36, uSky * 0.9, smoothstep(-0.1, 0.8, R.y));

          vec3 envRaw = (
            textureCube(uEnvMap, R).rgb +
            textureCube(uEnvMap, normalize(R + vec3(0.018, 0.006, 0.0))).rgb +
            textureCube(uEnvMap, normalize(R - vec3(0.018, 0.0, 0.006))).rgb
          ) / 3.0;
          float envLum = dot(envRaw, vec3(0.24, 0.52, 0.24));
          vec3 env = mix(envRaw, vec3(envLum), 0.24) * uEnvTint * uEnvStrength;
          vec3 col = base * (0.52 + 0.4 * max(dot(N, normalize(uSunDir)), 0.0));
          col += sky * fres * 0.26;
          col += env * (0.12 + 0.5 * fres);

          float spec = pow(max(dot(R, normalize(uSunDir)), 0.0), 110.0);
          col += uSunColor * spec * 1.35;

          float sparkle = smoothstep(0.915, 0.997, nC) * smoothstep(0.1, 0.65, max(dot(R, normalize(uSunDir)), 0.0));
          col += uSunColor * sparkle * 1.45;

          float foamNoise = smoothstep(0.58, 0.9, nB + nC * 0.24);
          float foamBand = smoothstep(0.78, 0.985, vEdge);
          float foam = foamBand * foamNoise * (0.4 + 0.6 * smoothstep(0.3, 0.8, nA));
          float shoreline = (1.0 - smoothstep(0.01, 0.13, vDepth)) * (1.0 - smoothstep(0.84, 0.995, vEdge));
          float shoreFoam = shoreline * smoothstep(0.54, 0.84, nA + nB * 0.35);
          col = mix(col, uFoam * 1.1, foam * 0.32 + shoreFoam * 0.27);

          float line = smoothstep(0.972, 0.998, sin(vEdge * 31.0 - uTime * 0.8 + nA * 6.4) * 0.5 + 0.5);
          col += uFoam * line * (1.0 - foamBand) * 0.026;

          float alpha = uOpacity * (0.6 + 0.3 * deepMask + 0.24 * fres + 0.16 * foam + 0.14 * shoreFoam) * edgeFade;
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });
    return material;
  }

  const waterMaterial = makeWaterMaterial();
  const waterMeshes = [];

  function buildRiver() {
    const longitudinal = 190;
    const lateral = 4;
    const positions = [];
    const uvs = [];
    const edges = [];
    const depths = [];
    const indices = [];

    for (let i = 0; i < longitudinal; i += 1) {
      const t = i / (longitudinal - 1);
      const p = riverCurve.getPoint(t);
      const tangent = riverCurve.getTangent(t);
      const nx = -tangent.z;
      const nz = tangent.x;
      const invLen = 1 / Math.max(0.0001, Math.hypot(nx, nz));
      const width = riverWidthAt(t);
      const y = riverSurfaceY(t) + 0.022;

      for (let j = 0; j < lateral + 1; j += 1) {
        const s = j / lateral;
        const offset = (s - 0.5) * width;
        const x = p.x + nx * invLen * offset;
        const z = p.z + nz * invLen * offset;
        positions.push(x, y, z);
        uvs.push(s, t);
        edges.push(Math.abs(s - 0.5) * 2);
        depths.push(clamp((y - terrainHeight(x, z)) / 0.3, 0, 1));
      }
    }

    for (let i = 0; i < longitudinal - 1; i += 1) {
      for (let j = 0; j < lateral; j += 1) {
        const a = i * (lateral + 1) + j;
        const b = a + 1;
        const c = (i + 1) * (lateral + 1) + j;
        const d = c + 1;
        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('aEdge', new THREE.Float32BufferAttribute(edges, 1));
    geometry.setAttribute('aDepth', new THREE.Float32BufferAttribute(depths, 1));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(geometry, waterMaterial);
    mesh.renderOrder = 2;
    mesh.name = 'winding-river';
    worldContent.add(mesh);
    waterMeshes.push(mesh);
    return mesh;
  }

  function buildLake() {
    const segments = 160;
    const rings = 28;
    const positions = [];
    const uvs = [];
    const edges = [];
    const depths = [];
    const indices = [];
    const surfaceY = LAKE.level + 0.024;

    // center
    positions.push(LAKE.x, surfaceY, LAKE.z);
    uvs.push(0.5, 0.5);
    edges.push(0);
    depths.push(clamp((surfaceY - terrainHeight(LAKE.x, LAKE.z)) / 0.38, 0, 1));

    for (let i = 1; i <= rings; i += 1) {
      const rt = i / rings;
      for (let j = 0; j < segments; j += 1) {
        const theta = (j / segments) * TAU;
        const shape = lakeShape(theta);
        const ex = LAKE.radius * 1.08 * shape;
        const ez = LAKE.radius * 0.9 * shape;
        const x = LAKE.x + Math.cos(theta) * ex * rt;
        const z = LAKE.z + Math.sin(theta) * ez * rt;
        positions.push(x, surfaceY, z);
        uvs.push(Math.cos(theta) * rt * 0.5 + 0.5, Math.sin(theta) * rt * 0.5 + 0.5);
        edges.push(rt);
        depths.push(clamp((surfaceY - terrainHeight(x, z)) / 0.38, 0, 1));
      }
    }

    for (let j = 0; j < segments; j += 1) {
      const current = 1 + j;
      const next = 1 + ((j + 1) % segments);
      indices.push(0, next, current);
    }

    for (let i = 1; i < rings; i += 1) {
      const inner = 1 + (i - 1) * segments;
      const outer = 1 + i * segments;
      for (let j = 0; j < segments; j += 1) {
        const next = (j + 1) % segments;
        const a = inner + j;
        const b = inner + next;
        const c = outer + j;
        const d = outer + next;
        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('aEdge', new THREE.Float32BufferAttribute(edges, 1));
    geometry.setAttribute('aDepth', new THREE.Float32BufferAttribute(depths, 1));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(geometry, waterMaterial);
    mesh.renderOrder = 2;
    mesh.name = 'mirror-lake';
    worldContent.add(mesh);
    waterMeshes.push(mesh);
    return mesh;
  }

  /* ------------------------------------------------------------------ *
   *  06 · The snow mountain massif
   * ------------------------------------------------------------------ */
  const MASSIF = {
    cx: -1.15,
    cz: -1.42,
    rx: 2.22,
    rz: 1.84,
    peaks: [
      { x: -1.46, z: -1.74, h: 2.92, sx: 1.62, sz: 1.40, rot: 0.22, seed: 2.3, power: 1.22 },
      { x: -0.55, z: -2.04, h: 1.92, sx: 1.02, sz: 0.88, rot: -0.18, seed: 4.4, power: 1.18 },
      { x: -2.48, z: -2.16, h: 1.54, sx: 1.08, sz: 0.96, rot: -0.35, seed: 5.8, power: 1.24 },
      { x: -0.28, z: -2.74, h: 1.10, sx: 1.16, sz: 0.96, rot: 0.40, seed: 8.1, power: 1.22 },
      { x: -1.95, z: -0.78, h: 1.22, sx: 1.02, sz: 0.80, rot: 0.12, seed: 6.7, power: 1.10 },
      { x: -2.50, z: -0.58, h: 0.72, sx: 0.82, sz: 0.68, rot: 0.20, seed: 9.0, power: 1.26 },
    ],
    gullies: [
      { peak: 0, angle: 0.62, width: 0.12, depth: 0.18 },
      { peak: 0, angle: 1.16, width: 0.085, depth: 0.24 },
      { peak: 0, angle: 1.92, width: 0.11, depth: 0.16 },
      { peak: 0, angle: 2.64, width: 0.07, depth: 0.12 },
      { peak: 1, angle: 0.92, width: 0.11, depth: 0.16 },
      { peak: 2, angle: 2.22, width: 0.13, depth: 0.14 },
      { peak: 3, angle: 1.34, width: 0.12, depth: 0.12 },
      { peak: 4, angle: 0.92, width: 0.13, depth: 0.17 },
      { peak: 4, angle: 1.48, width: 0.10, depth: 0.10 },
    ],
  };

  const MOUNTAIN_DEFS = MASSIF.peaks.map((peak) => ({
    ...peak,
    rx: peak.sx,
    rz: peak.sz,
  }));

  const mountainRockColors = {
    deep: color(0x2c3841),
    mid: color(0x4b5962),
    light: color(0x6c7880),
    moss: color(0x4d643f),
    snowShade: color(0x7e9ab2),
    snowLight: color(0xc6d9e7),
    ice: color(0x9fc7da),
    forest: color(0x314b36),
  };

  const snowMoundData = [];
  const mountainOutcropData = [];

  function wrapAngle(a) {
    while (a > Math.PI) a -= TAU;
    while (a < -Math.PI) a += TAU;
    return a;
  }

  function peakSample(x, z, peak) {
    const dx = x - peak.x;
    const dz = z - peak.z;
    const cos = Math.cos(peak.rot);
    const sin = Math.sin(peak.rot);
    const lx = dx * cos + dz * sin;
    const lz = -dx * sin + dz * cos;
    const theta = Math.atan2(lz / peak.sz, lx / peak.sx);
    const lobes =
      1 +
      0.092 * Math.sin(theta * 4 + peak.seed) +
      0.045 * Math.sin(theta * 7 - peak.seed * 1.63) +
      0.022 * Math.sin(theta * 11 + peak.seed * 0.61);
    const r = Math.sqrt((lx / peak.sx) ** 2 + (lz / peak.sz) ** 2) / lobes;
    if (r >= 1) return { h: 0, r: 2, theta };
    const radial = Math.pow(1 - Math.pow(r, 1.14), peak.power);
    return {
      h: peak.h * radial,
      r,
      theta,
    };
  }

  function massifSample(x, z) {
    const qx = (x - MASSIF.cx) / MASSIF.rx;
    const qz = (z - MASSIF.cz) / MASSIF.rz;
    const q = Math.sqrt(qx * qx + qz * qz);
    const edgeFade = 1 - smoothstep(0.68, 1.0, q);
    if (edgeFade <= 0.0001) {
      return { relief: 0, gully: 0, q, edgeFade: 0 };
    }

    const peaks = MASSIF.peaks.map((peak) => peakSample(x, z, peak));
    let maxPeak = 0;
    for (const peak of peaks) {
      if (peak.h > maxPeak) maxPeak = peak.h;
    }

    // A broad shoulder fuses the summits into one geological mass.
    const broad = 0.42 * smoothstep(1.06, 0.08, q) *
      (0.56 + 0.44 * fbm(x * 0.92 + 3.2, z * 0.92 - 2.1, 3));
    let relief = maxPeak + broad;

    // Mid-frequency erosion and a few sharp surviving ribs.
    const erosion = fbm(x * 3.05 + 4.2, z * 3.05 - 2.6, 4);
    relief += (erosion - 0.5) * 0.22 * Math.min(1, relief * 1.8);
    const ridge = 1 - Math.abs(fbm(x * 6.1 - 1.4, z * 6.1 + 3.7, 3) * 2 - 1);
    relief += (ridge - 0.55) * 0.105 * Math.min(1, relief * 1.4);

    // Radial gullies cut dark, snow-catching veins down the faces.
    let gully = 0;
    for (const def of MASSIF.gullies) {
      const peak = MASSIF.peaks[def.peak];
      const sample = peaks[def.peak];
      if (!sample || sample.r >= 1.02) continue;
      const delta = wrapAngle(sample.theta - def.angle);
      const width = def.width * (0.55 + sample.r * 0.65);
      const band = Math.exp(-((delta / width) ** 2));
      const profile = Math.sin(Math.PI * clamp(sample.r, 0, 1)) *
        smoothstep(0.015, 0.13, sample.r) *
        (1 - smoothstep(0.78, 1.02, sample.r));
      const strength = clamp(band * profile, 0, 1);
      relief -= def.depth * strength;
      gully = Math.max(gully, strength);
    }

    relief *= edgeFade;
    return {
      relief: Math.max(0, relief),
      gully,
      q,
      edgeFade,
    };
  }

  function massifReliefAt(x, z) {
    return massifSample(x, z).relief;
  }

  function massifSurfaceY(x, z) {
    return terrainHeight(x, z) + massifReliefAt(x, z);
  }

  function makeMassifMaterial() {
    const material = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.0,
      envMapIntensity: 0.46,
      flatShading: true,
      sheen: 0.58,
      sheenRoughness: 0.78,
      sheenColor: new THREE.Color(0xd0e4f4),
      clearcoat: 0.045,
      clearcoatRoughness: 0.65,
      dithering: true,
    });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           attribute float aSnow;
           varying float vSnow;
           varying vec3 vMassifPos;
           varying vec3 vMassifNormal;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           vSnow = aSnow;
           vMassifPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
           vMassifNormal = normalize(mat3(modelMatrix) * normal);`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           varying float vSnow;
           varying vec3 vMassifPos;
           varying vec3 vMassifNormal;

           float massifHash(vec2 p) {
             p = fract(p * vec2(123.34, 456.21));
             p += dot(p, p + 45.32);
             return fract(p.x * p.y);
           }

           float massifNoise(vec2 p) {
             vec2 i = floor(p);
             vec2 f = fract(p);
             f = f * f * (3.0 - 2.0 * f);
             float a = massifHash(i);
             float b = massifHash(i + vec2(1.0, 0.0));
             float c = massifHash(i + vec2(0.0, 1.0));
             float d = massifHash(i + vec2(1.0, 1.0));
             return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
           }`
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
           float snowFine = massifNoise(vMassifPos.xz * 12.0 + vMassifPos.y * 5.2 + 17.0);
           float snowBroad = massifNoise(vMassifPos.xz * 4.2 - vMassifPos.y * 2.1 - 8.0);
           float rockFine = massifNoise(vMassifPos.xz * 24.0 + vMassifPos.y * 8.0 + 2.0);
           float rockStrata = 0.5 + 0.5 * sin(vMassifPos.y * 24.0 + snowBroad * 6.0);
           if (vSnow > 0.48) {
             diffuseColor.rgb *= 0.93 + snowFine * 0.10 + snowBroad * 0.035;
             diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.54, 0.68, 0.82), smoothstep(0.62, 0.9, snowBroad) * 0.12);
             float sparkle = smoothstep(0.993, 1.0, massifHash(floor(vMassifPos.xz * 60.0 + vMassifPos.y * 31.0))) * 0.045;
             diffuseColor.rgb += vec3(sparkle * 0.7, sparkle * 0.85, sparkle);
           } else {
             diffuseColor.rgb *= 0.87 + snowBroad * 0.14 + rockFine * 0.12 + rockStrata * 0.055;
             float damp = smoothstep(0.62, 0.92, massifNoise(vMassifPos.xz * 7.0 + 13.0));
             diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.20, 0.27, 0.28), damp * 0.12);
           }`
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
           float massifGrain = massifNoise(vMassifPos.xz * 16.0 + vMassifPos.y * 7.0);
           float massifGlint = smoothstep(0.982, 1.0, massifHash(floor(vMassifPos.xz * 84.0 + vMassifPos.y * 43.0)));
           roughnessFactor = mix(roughnessFactor, 0.62 + massifGrain * 0.2, smoothstep(0.4, 0.8, vSnow));
           roughnessFactor = mix(roughnessFactor, 0.13, massifGlint * smoothstep(0.58, 0.88, vSnow));`
        );
    };
    material.customProgramCacheKey = () => 'terrarium-massif-v3';
    return material;
  }

  function buildMountains() {
    const segments = 200;
    const rings = 112;
    const positions = [];
    const qValues = [];
    const gullyValues = [];
    const reliefValues = [];
    const indices = [];
    const centerY = massifSurfaceY(MASSIF.cx, MASSIF.cz) - 0.035;

    // Center cap
    positions.push(MASSIF.cx, centerY, MASSIF.cz);
    qValues.push(0);
    gullyValues.push(0);
    reliefValues.push(centerY - terrainHeight(MASSIF.cx, MASSIF.cz));

    const ringStart = [];
    for (let i = 1; i <= rings; i += 1) {
      const t = i / rings;
      ringStart.push(positions.length / 3);
      for (let j = 0; j < segments; j += 1) {
        const theta = (j / segments) * TAU;
        const x = MASSIF.cx + Math.cos(theta) * MASSIF.rx * t;
        const z = MASSIF.cz + Math.sin(theta) * MASSIF.rz * t;
        const sample = massifSample(x, z);
        const y = terrainHeight(x, z) + sample.relief - 0.035;
        positions.push(x, y, z);
        qValues.push(sample.q);
        gullyValues.push(sample.gully);
        reliefValues.push(sample.relief);
      }
    }

    // The new mountain rises as a single high-density sheet over the island.
    // The first ring is a center fan; subsequent rings form quads.
    for (let j = 0; j < segments; j += 1) {
      const next = (j + 1) % segments;
      indices.push(0, 1 + next, 1 + j);
    }
    for (let i = 1; i < rings; i += 1) {
      const inner = ringStart[i - 1];
      const outer = ringStart[i];
      for (let j = 0; j < segments; j += 1) {
        const next = (j + 1) % segments;
        const a = inner + j;
        const b = inner + next;
        const c = outer + j;
        const d = outer + next;
        indices.push(a, b, d);
        indices.push(a, d, c);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const normalAttr = geometry.attributes.normal;
    const colors = [];
    const snowValues = [];
    const rockColor = new THREE.Color();
    const snowColor = new THREE.Color();
    const finalColor = new THREE.Color();
    const iceColor = mountainRockColors.ice;
    const valleyColor = mountainRockColors.deep;

    for (let i = 0; i < positions.length / 3; i += 1) {
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];
      const nx = normalAttr.getX(i);
      const ny = normalAttr.getY(i);
      const nz = normalAttr.getZ(i);
      const q = qValues[i];
      const gully = gullyValues[i];
      const relief = reliefValues[i];

      const grain = fbm(x * 4.8 + 4.2, z * 4.8 - 3.3, 3);
      const coarse = fbm(x * 1.65 - 2.2, z * 1.65 + 7.4, 3);
      const snowLine = 0.34 + (coarse - 0.5) * 0.55 + nx * 0.09 - nz * 0.05;

      let snow = smoothstep(snowLine - 0.18, snowLine + 0.42, y) *
        smoothstep(0.13, 0.5, ny);
      snow = Math.max(
        snow,
        smoothstep(1.66, 2.2, y) * smoothstep(0.04, 0.28, ny)
      );
      snow = clamp(snow + gully * 0.22 + smoothstep(0.58, 0.9, coarse) * 0.1, 0, 1);

      // Wind-scoured ribs of dark rock punch through the upper snowfields.
      const windRib = fbm(x * 3.6 + 7.4, z * 3.6 - 4.6, 3);
      const ribExposure = smoothstep(0.6, 0.82, windRib) * smoothstep(0.4, 1.25, y);
      snow *= 1 - ribExposure * 0.35;
      snow *= 0.88 + 0.12 * smoothstep(0.2, 0.9, coarse);
      snowValues.push(snow);

      // Weathered, stratified rock.
      rockColor.copy(mountainRockColors.deep).lerp(mountainRockColors.mid, 0.32 + grain * 0.58);
      const strata = 0.5 + 0.5 * Math.sin(y * 24.0 + coarse * 6.5);
      rockColor.lerp(mountainRockColors.light, strata * 0.12 + smoothstep(0.62, 0.88, grain) * 0.12);
      rockColor.multiplyScalar(0.82 + coarse * 0.25 + grain * 0.16);
      const lowerMoss = (1 - smoothstep(-0.25, 0.55, y)) * smoothstep(0.35, 0.9, ny);
      rockColor.lerp(mountainRockColors.moss, lowerMoss * 0.52);
      const lowerForest = (1 - smoothstep(0.15, 0.75, relief)) * smoothstep(0.2, 0.8, ny);
      rockColor.lerp(mountainRockColors.forest, lowerForest * 0.28);
      rockColor.lerp(valleyColor, gully * 0.16);
      rockColor.multiplyScalar(0.84 + (1 - gully) * 0.12 + (q < 0.86 ? 0 : 0.05));

      // Wind-packed snow with blue shadow pockets.
      snowColor.copy(mountainRockColors.snowShade).lerp(mountainRockColors.snowLight, 0.45 + grain * 0.45);
      snowColor.lerp(iceColor, smoothstep(0.55, 0.9, gully) * 0.18 + smoothstep(0.65, 0.95, snow) * 0.08);
      snowColor.multiplyScalar(0.92 + coarse * 0.1 - gully * 0.04);

      const blend = smoothstep(0.04, 0.64, snow);
      finalColor.copy(rockColor).lerp(snowColor, blend);
      const iceRim = smoothstep(0.06, 0.24, snow) * (1 - smoothstep(0.3, 0.56, snow));
      finalColor.lerp(iceColor, iceRim * 0.2);

      const snowAO = 1 - gully * 0.11;
      colors.push(finalColor.r * snowAO, finalColor.g * snowAO, finalColor.b * snowAO);

      if (snow > 0.52 && random() < 0.0042) {
        snowMoundData.push({
          position: new V3(x, y + 0.035, z),
          scale: randomRange(0.02, 0.075),
          rotation: random() * TAU,
        });
      }

      if (snow < 0.38 && ny > 0.3 && relief > 0.45 && random() < 0.00115 && mountainOutcropData.length < 44) {
        mountainOutcropData.push({
          position: new V3(x, y, z),
          normal: new V3(nx, ny, nz),
          scale: randomRange(0.075, 0.2),
          rotation: random() * TAU,
          tilt: randomRange(-0.3, 0.3),
          snowy: snow > 0.16,
        });
      }
    }

    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('aSnow', new THREE.Float32BufferAttribute(snowValues, 1));
    geometry.computeBoundingSphere();

    const material = makeMassifMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'snow-massif';
    worldContent.add(mesh);

    // Exposed rock plates cling to the steeper faces.
    if (mountainOutcropData.length > 0) {
      const outcropGeometry = new THREE.DodecahedronGeometry(1, 0);
      const attr = outcropGeometry.attributes.position;
      for (let i = 0; i < attr.count; i += 1) {
        const x = attr.getX(i);
        const y = attr.getY(i);
        const z = attr.getZ(i);
        const n = 0.72 + hash2(i * 2.1 + x * 7.5, z * 6.7) * 0.45;
        attr.setXYZ(i, x * n, y * (0.62 + n * 0.4), z * n);
      }
      outcropGeometry.computeVertexNormals();

      const outcropMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.94,
        metalness: 0,
        envMapIntensity: 0.28,
      });
      const rocks = new THREE.InstancedMesh(outcropGeometry, outcropMaterial, mountainOutcropData.length);
      rocks.castShadow = true;
      rocks.receiveShadow = true;
      rocks.frustumCulled = false;
      rocks.name = 'massif-outcrops';
      const matrix = new THREE.Matrix4();
      const quat = new THREE.Quaternion();
      const align = new THREE.Quaternion();
      const spin = new THREE.Quaternion();
      const pos = new V3();
      const scl = new V3();
      const tint = new THREE.Color();
      const up = new V3(0, 1, 0);
      const rockTint = [color(0x3f4a52), color(0x58625f), color(0x667069), color(0x4d564c)];
      mountainOutcropData.forEach((m, i) => {
        const scale = m.scale;
        align.setFromUnitVectors(up, m.normal);
        spin.setFromAxisAngle(up, m.rotation);
        quat.copy(align).multiply(spin);
        pos.copy(m.position).addScaledVector(m.normal, -scale * 0.38);
        scl.set(scale * randomRange(0.75, 1.25), scale * randomRange(0.32, 0.7), scale * randomRange(0.8, 1.2));
        matrix.compose(pos, quat, scl);
        rocks.setMatrixAt(i, matrix);
        tint.copy(m.snowy ? mountainRockColors.snowShade : rockTint[i % rockTint.length]);
        if (m.snowy) tint.multiplyScalar(0.9);
        rocks.setColorAt(i, tint);
      });
      rocks.instanceMatrix.needsUpdate = true;
      if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
      worldContent.add(rocks);
    }
  }

  /* ------------------------------------------------------------------ *
   *  06b · Crystalline roots underneath the floating island
   * ------------------------------------------------------------------ */
  const undersideMagic = {
    crystals: [],
    glows: [],
    light: null,
    cliffFill: null,
  };

  function buildUndersideMagic() {
    const crystalGeometry = new THREE.OctahedronGeometry(1, 0);
    const crystalMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x6ccddd,
      emissive: new THREE.Color(0x2c8ba4),
      emissiveIntensity: 2.2,
      roughness: 0.16,
      metalness: 0,
      transparent: true,
      opacity: 0.82,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      envMapIntensity: 1.8,
      depthWrite: false,
    });

    const glowMaterial = new THREE.SpriteMaterial({
      map: shared.glowTexture,
      color: 0x6cdeec,
      transparent: true,
      opacity: 0.26,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
    });

    const angles = [0.18, 0.46, 0.74, 1.02, 1.31, 1.65, 1.98, 2.34, -0.18, -0.52];
    angles.forEach((angle, i) => {
      const edgeR = terrainEdgeRadius(angle);
      const edgeX = Math.cos(angle) * edgeR;
      const edgeZ = Math.sin(angle) * edgeR;
      const edgeY = terrainHeight(edgeX, edgeZ);
      const inward = 0.955;
      const baseX = edgeX * inward;
      const baseZ = edgeZ * inward;
      const drop = randomRange(0.22, 0.8);
      const group = new THREE.Group();
      group.position.set(baseX, edgeY - drop, baseZ);
      group.rotation.y = -angle + randomRange(-0.4, 0.4);
      const count = 2 + Math.floor(random() * 3);
      for (let j = 0; j < count; j += 1) {
        const crystal = new THREE.Mesh(crystalGeometry, crystalMaterial);
        crystal.scale.set(
          randomRange(0.025, 0.07),
          randomRange(0.09, 0.22),
          randomRange(0.025, 0.07)
        );
        crystal.position.set(randomRange(-0.07, 0.07), randomRange(-0.06, 0.02), randomRange(-0.05, 0.05));
        crystal.rotation.set(randomRange(-0.45, 0.45), random() * TAU, randomRange(-0.45, 0.45));
        group.add(crystal);
        undersideMagic.crystals.push(crystal);
      }
      const glow = new THREE.Sprite(glowMaterial.clone());
      glow.material.opacity = randomRange(0.08, 0.2);
      glow.position.set(baseX, edgeY - drop + 0.02, baseZ);
      glow.scale.setScalar(randomRange(0.16, 0.34));
      glow.userData.phase = i * 0.9 + random();
      worldContent.add(glow);
      undersideMagic.glows.push(glow);
      worldContent.add(group);
    });

    const veinMaterial = new THREE.MeshBasicMaterial({
      color: 0x55adba,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    for (let i = 0; i < 4; i += 1) {
      const angle = 0.35 + i * 0.52;
      const edgeR = terrainEdgeRadius(angle) * 0.992;
      const x = Math.cos(angle) * edgeR;
      const z = Math.sin(angle) * edgeR;
      const y = terrainHeight(x, z);
      const curve = new THREE.CatmullRomCurve3([
        new V3(x, y - 0.04, z),
        new V3(x * 0.94, y - 0.55, z * 0.94),
        new V3(x * 0.8 + randomRange(-0.12, 0.12), y - 1.25 - random() * 0.4, z * 0.8),
        new V3(x * 0.68, y - 1.7 - random() * 0.5, z * 0.68 + randomRange(-0.1, 0.1)),
      ]);
      const vein = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.0085, 3, false), veinMaterial);
      worldContent.add(vein);
    }

    undersideMagic.light = new THREE.PointLight(0x5ccfdf, 3.0, 9.2, 2);
    undersideMagic.light.position.set(1.5, -3.25, 3.85);
    worldContent.add(undersideMagic.light);

    // A cool, low fill from outside the glass adds a final rim to the rock.
    undersideMagic.cliffFill = new THREE.PointLight(0x86c6dd, 5.5, 6.5, 2);
    undersideMagic.cliffFill.position.set(2.7, 0.9, 4.1);
    worldContent.add(undersideMagic.cliffFill);

    // Jagged teeth break the conical silhouette of the floating rock.
    const toothGeometry = new THREE.ConeGeometry(1, 1, 6, 1);
    const toothMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
    });
    const toothCount = 16;
    const teeth = new THREE.InstancedMesh(toothGeometry, toothMaterial, toothCount);
    teeth.castShadow = false;
    teeth.receiveShadow = false;
    teeth.frustumCulled = false;
    teeth.name = 'cliff-teeth';
    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const pos = new V3();
    const scl = new V3();
    const tint = new THREE.Color();
    const up = new V3(0, 1, 0);
    const dir = new V3();
    const toothColors = [color(0x5d675f), color(0x766e5b), color(0x515b5c), color(0x806d53)];
    for (let i = 0; i < toothCount; i += 1) {
      const theta = (i / toothCount) * TAU + randomRange(-0.16, 0.16);
      const t = randomRange(0.12, 0.62);
      const edgeR = terrainEdgeRadius(theta);
      const edgeY = terrainHeight(Math.cos(theta) * edgeR, Math.sin(theta) * edgeR);
      const radialScale = 0.03 + 0.97 * Math.pow(1 - t, 0.9);
      const x = Math.cos(theta) * edgeR * radialScale;
      const z = Math.sin(theta) * edgeR * radialScale;
      const y = edgeY - (2.0 + 0.16 * Math.sin(i * 3.4)) * Math.pow(t, 0.82);
      dir.set(Math.cos(theta) * 0.55, -1, Math.sin(theta) * 0.55).normalize();
      quat.setFromUnitVectors(up, dir);
      pos.set(x + dir.x * 0.07, y + randomRange(-0.02, 0.02), z + dir.z * 0.07);
      const w = randomRange(0.055, 0.14);
      const len = randomRange(0.22, 0.56);
      scl.set(w, len, w * randomRange(0.8, 1.2));
      matrix.compose(pos, quat, scl);
      teeth.setMatrixAt(i, matrix);
      tint.copy(toothColors[i % toothColors.length]).offsetHSL(0, randomRange(-0.03, 0.02), randomRange(-0.04, 0.04));
      teeth.setColorAt(i, tint);
    }
    teeth.instanceMatrix.needsUpdate = true;
    if (teeth.instanceColor) teeth.instanceColor.needsUpdate = true;
    worldContent.add(teeth);

    // A larger luminous heart-stone near the bottom of the island.
    const heartMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x7de5ee,
      emissive: new THREE.Color(0x54c2d4),
      emissiveIntensity: 2.6,
      roughness: 0.12,
      metalness: 0,
      transparent: true,
      opacity: 0.88,
      clearcoat: 1,
      envMapIntensity: 2.2,
      depthWrite: false,
    });
    const heartAngle = 0.75;
    const heartR = terrainEdgeRadius(heartAngle);
    const heartEdgeY = terrainHeight(Math.cos(heartAngle) * heartR, Math.sin(heartAngle) * heartR);
    for (let i = 0; i < 3; i += 1) {
      const crystal = new THREE.Mesh(crystalGeometry, heartMaterial);
      crystal.position.set(
        Math.cos(heartAngle) * heartR * 0.55 + randomRange(-0.17, 0.17),
        heartEdgeY - randomRange(1.65, 2.25),
        Math.sin(heartAngle) * heartR * 0.55 + randomRange(-0.14, 0.14)
      );
      crystal.scale.set(randomRange(0.045, 0.085), randomRange(0.2, 0.36), randomRange(0.045, 0.085));
      crystal.rotation.set(randomRange(-0.6, 0.6), random() * TAU, randomRange(-0.5, 0.5));
      worldContent.add(crystal);
    }
    const heartGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: shared.glowTexture,
      color: 0x70dce9,
      transparent: true,
      opacity: 0.24,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    heartGlow.position.set(Math.cos(heartAngle) * heartR * 0.55, heartEdgeY - 1.9, Math.sin(heartAngle) * heartR * 0.55);
    heartGlow.scale.setScalar(0.9);
    worldContent.add(heartGlow);
    undersideMagic.heartGlow = heartGlow;
  }

  /* ------------------------------------------------------------------ *
   *  07 · Ground dressing: stones, trees, shrubs, grass and flowers
   * ------------------------------------------------------------------ */
  const CLEARINGS = [
    { x: 2.48, z: 2.55, r: 0.82 },   // deer family
    { x: -0.54, z: 2.02, r: 0.69 },  // sheep meadow
    { x: -2.17, z: 1.12, r: 0.48 },  // rabbits
    { x: 0.02, z: 0.56, r: 0.58 },   // little bridge
    { x: -1.31, z: 0.09, r: 0.52 },  // waterfall pool
    { x: 1.35, z: 2.42, r: 0.56 },   // flower meadow
  ];

  function insideMountainFootprint(x, z, margin = 0) {
    const dx = (x - MASSIF.cx) / MASSIF.rx;
    const dz = (z - MASSIF.cz) / MASSIF.rz;
    const q = Math.sqrt(dx * dx + dz * dz);
    return q < 0.97 + margin * 0.24;
  }

  function inClearing(x, z, extra = 0) {
    for (const c of CLEARINGS) {
      if (Math.hypot(x - c.x, z - c.z) < c.r + extra) return true;
    }
    return false;
  }

  function terrainSlope(x, z) {
    const e = 0.075;
    const hx = terrainHeight(x + e, z) - terrainHeight(x - e, z);
    const hz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
    return Math.hypot(hx, hz) / (2 * e);
  }

  function buildGroundRocks() {
    const spots = [];
    const add = (x, z, scale, tint, yOffset = 0, stretch = 1) => {
      if (Math.hypot(x, z) > 3.97) return;
      spots.push({
        x,
        z,
        scale,
        tint,
        yOffset,
        stretch,
        yaw: random() * TAU,
        tilt: randomRange(-0.28, 0.28),
      });
    };

    // Boulders gathered around the base of the massif.
    for (let i = 0; i < 38; i += 1) {
      const theta = random() * TAU;
      const q = randomRange(1.02, 1.2);
      const x = MASSIF.cx + Math.cos(theta) * MASSIF.rx * q;
      const z = MASSIF.cz + Math.sin(theta) * MASSIF.rz * q;
      if (Math.hypot(x, z) > 3.96 || isWaterAt(x, z, 0.05)) continue;
      add(x, z, randomRange(0.06, 0.25), randomRange(0.55, 1.0), randomRange(-0.04, -0.01), randomRange(0.75, 1.3));
    }

    // Stones at the lake's lip.
    for (let i = 0; i < 24; i += 1) {
      const theta = random() * TAU;
      const shape = lakeShape(theta);
      const edgeX = LAKE.radius * 1.08 * shape;
      const edgeZ = LAKE.radius * 0.9 * shape;
      const s = randomRange(1.015, 1.15);
      const x = LAKE.x + Math.cos(theta) * edgeX * s;
      const z = LAKE.z + Math.sin(theta) * edgeZ * s;
      add(x, z, randomRange(0.05, 0.17), randomRange(0.45, 0.9), randomRange(-0.03, 0.01), randomRange(0.5, 0.8));
    }

    // Rounded stones resting on the riverbank.
    for (let i = 0; i < 24; i += 1) {
      const t = randomRange(0.05, 0.94);
      const p = riverCurve.getPoint(t);
      const tangent = riverCurve.getTangent(t);
      const side = randomSign();
      const offset = side * (riverWidthAt(t) * 0.5 + randomRange(0.04, 0.27));
      const x = p.x - tangent.z * offset;
      const z = p.z + tangent.x * offset;
      if (Math.hypot(x, z) > 3.9) continue;
      add(x, z, randomRange(0.035, 0.13), randomRange(0.45, 0.85), randomRange(-0.03, 0), randomRange(0.4, 0.8));
    }

    // Waterfall pool boulders.
    const poolX = -1.27;
    const poolZ = 0.04;
    for (let i = 0; i < 9; i += 1) {
      const theta = randomRange(-0.3, Math.PI + 0.65);
      const r = randomRange(0.18, 0.47);
      add(poolX + Math.cos(theta) * r, poolZ + Math.sin(theta) * r * 0.65, randomRange(0.075, 0.22), randomRange(0.5, 0.9), -0.02, randomRange(0.55, 1));
    }

    // A quiet scattering of little stones in the meadow.
    for (let i = 0; i < 18; i += 1) {
      const a = random() * TAU;
      const r = Math.sqrt(random()) * 3.45;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (isWaterAt(x, z, 0.12) || insideMountainFootprint(x, z, 0.06)) continue;
      add(x, z, randomRange(0.025, 0.075), randomRange(0.55, 0.95), 0, randomRange(0.4, 0.7));
    }

    if (!spots.length) return;

    const geometry = new THREE.DodecahedronGeometry(1, 0);
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      const n = 0.78 + hash2(i * 1.7 + x * 8.2, z * 5.1) * 0.36;
      position.setXYZ(i, x * n, y * (0.55 + n * 0.22), z * n);
    }
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.96,
      metalness: 0,
      envMapIntensity: 0.18,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, spots.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'scattered-stones';

    const matrix = new THREE.Matrix4();
    const pos = new V3();
    const scale = new V3();
    const quat = new THREE.Quaternion();
    const tint = new THREE.Color();
    const stonePalette = [color(0x687069), color(0x7d8074), color(0x565f5d), color(0x776f5d), color(0x696a5f)];

    spots.forEach((spot, index) => {
      const ground = terrainHeight(spot.x, spot.z);
      pos.set(spot.x, ground + spot.scale * 0.28 + spot.yOffset, spot.z);
      quat.setFromEuler(new THREE.Euler(spot.tilt, spot.yaw, spot.tilt * 0.6));
      scale.set(spot.scale, spot.scale * spot.stretch, spot.scale * randomRange(0.82, 1.25));
      matrix.compose(pos, quat, scale);
      mesh.setMatrixAt(index, matrix);
      tint.copy(stonePalette[index % stonePalette.length]);
      tint.offsetHSL(0, randomRange(-0.03, 0.02), randomRange(-0.06, 0.06) * spot.tint);
      mesh.setColorAt(index, tint);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    worldContent.add(mesh);

    // Soft contact shadows under the larger stones keep them grounded.
    const shadowGeometry = new THREE.PlaneGeometry(1, 1);
    shadowGeometry.rotateX(-Math.PI / 2);
    const shadowMaterial = new THREE.MeshBasicMaterial({
      map: shared.glowTexture,
      color: 0x08110c,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const stoneShadows = new THREE.InstancedMesh(shadowGeometry, shadowMaterial, spots.length);
    stoneShadows.renderOrder = 1;
    stoneShadows.frustumCulled = false;
    stoneShadows.name = 'stone-contact-shadows';
    const shadowMatrix = new THREE.Matrix4();
    const shadowQuat = new THREE.Quaternion();
    const shadowPos = new V3();
    const shadowScale = new V3();
    spots.forEach((spot, index) => {
      shadowPos.set(spot.x, terrainHeight(spot.x, spot.z) + 0.014, spot.z);
      shadowQuat.setFromEuler(new THREE.Euler(0, spot.yaw, 0));
      shadowScale.set(spot.scale * 2.8, 1, spot.scale * 2.1);
      shadowMatrix.compose(shadowPos, shadowQuat, shadowScale);
      stoneShadows.setMatrixAt(index, shadowMatrix);
    });
    stoneShadows.instanceMatrix.needsUpdate = true;
    worldContent.add(stoneShadows);
  }

  const TREE_PALETTES = {
    pine: [0x123c2a, 0x194631, 0x215139, 0x285b3e, 0x1d4b34, 0x316443],
    leaf: [0x245638, 0x30643e, 0x3d7044, 0x4b7d49, 0x5a894e, 0x376b4a],
    gold: [0x7a6f30, 0x92803f, 0xa58d4a, 0x74622b, 0xb29a5c],
    blossom: [0xc993a2, 0xd9acb3, 0xbd8595, 0xe2c1bf, 0xc28f9c],
  };

  function makeTreeRecord(x, z, type, tone, height, yaw = random() * TAU) {
    return {
      x,
      z,
      type,
      tone,
      height,
      yaw,
      y: terrainHeight(x, z),
      spread: randomRange(0.86, 1.12),
    };
  }

  function collectTrees() {
    const records = [];
    const zones = [
      { x: 1.32, z: -1.8, rx: 1.75, rz: 1.24, count: 31, pine: 0.5 },
      { x: 2.73, z: -0.42, rx: 0.7, rz: 1.52, count: 18, pine: 0.3 },
      { x: -2.95, z: -0.72, rx: 0.74, rz: 1.42, count: 19, pine: 0.6 },
      { x: 0.1, z: -2.65, rx: 1.32, rz: 0.54, count: 14, pine: 0.46 },
      { x: -2.95, z: 1.48, rx: 0.48, rz: 0.78, count: 9, pine: 0.14 },
    ];

    const minDistance = 0.19;
    const allowed = (x, z) => {
      if (Math.hypot(x, z) > 3.8) return false;
      if (insideMountainFootprint(x, z, 0.15)) return false;
      const nr = nearestRiver(x, z);
      if (nr.d < nr.width * 0.5 + 0.34) return false;
      const lake = lakeNormalized(x, z);
      if (lake.nd < 1.34) return false;
      if (inClearing(x, z, 0.10)) return false;
      if (terrainSlope(x, z) > 1.28) return false;
      return true;
    };

    const canPlace = (x, z) => {
      if (!allowed(x, z)) return false;
      for (const t of records) {
        if ((t.x - x) ** 2 + (t.z - z) ** 2 < minDistance * minDistance) return false;
      }
      return true;
    };

    zones.forEach((zone, zoneIndex) => {
      let added = 0;
      const attempts = zone.count * 22;
      for (let i = 0; i < attempts && added < zone.count; i += 1) {
        const angle = random() * TAU;
        const rr = Math.sqrt(random());
        const x = zone.x + Math.cos(angle) * zone.rx * rr;
        const z = zone.z + Math.sin(angle) * zone.rz * rr;
        if (!canPlace(x, z)) continue;

        let tone = 'green';
        if (zoneIndex === 2 && random() < 0.12) tone = 'gold';
        if (zoneIndex === 4 && random() < 0.22) tone = 'blossom';
        const type = random() < zone.pine ? 'pine' : 'leaf';
        const height = type === 'pine'
          ? randomRange(0.66, 1.26) * (zoneIndex === 0 || zoneIndex === 3 ? 1.04 : 0.96)
          : randomRange(0.62, 1.06);
        records.push(makeTreeRecord(x, z, type, tone, height));
        added += 1;
      }
    });

    // Individual trees at the edge of the meadow keep the forest from
    // becoming a closed wall around the central clearing.
    const scatter = [
      [-2.26, 2.52, 'leaf', 'green', 0.95],
      [-3.2, 0.32, 'pine', 'green', 1.25],
      [-2.0, -0.18, 'leaf', 'gold', 0.82],
      [3.16, 1.22, 'leaf', 'green', 0.82],
      [2.84, -2.05, 'pine', 'green', 1.24],
    ];
    scatter.forEach(([x, z, type, tone, h]) => {
      if (allowed(x, z)) {
        const distOk = records.every((t) => Math.hypot(t.x - x, t.z - z) > 0.24);
        if (distOk) records.push(makeTreeRecord(x, z, type, tone, h));
      }
    });

    // A handful of signature trees with more personality.
    const heroes = [
      { x: 3.36, z: 0.58, type: 'leaf', tone: 'blossom', height: 0.98 },
      { x: -2.5, z: 2.42, type: 'leaf', tone: 'gold', height: 1.04 },
      { x: -3.35, z: 1.28, type: 'pine', tone: 'green', height: 1.35 },
      { x: 2.05, z: -2.72, type: 'pine', tone: 'green', height: 1.42 },
      { x: -2.12, z: -0.36, type: 'leaf', tone: 'green', height: 0.86 },
    ];
    heroes.forEach((h) => {
      if (Math.hypot(h.x, h.z) > 3.88) return;
      if (!allowed(h.x, h.z)) return;
      records.push(makeTreeRecord(h.x, h.z, h.type, h.tone, h.height));
    });

    return records;
  }

  function pickTreeColor(tone, type, layer = 0) {
    const palette = tone === 'blossom'
      ? TREE_PALETTES.blossom
      : tone === 'gold'
        ? TREE_PALETTES.gold
        : TREE_PALETTES[type === 'pine' ? 'pine' : 'leaf'];
    const c = new THREE.Color(palette[Math.floor(random() * palette.length)]);
    c.offsetHSL(randomRange(-0.012, 0.012), randomRange(-0.03, 0.03), layer * 0.04 + randomRange(-0.025, 0.025));
    return c;
  }

  let treeCount = 0;

  function buildTrees() {
    const records = collectTrees();
    treeCount = records.length;
    const pines = records.filter((r) => r.type === 'pine');
    const leaves = records.filter((r) => r.type !== 'pine');

    // A soft baked contact shadow beneath each tree helps the clay silhouettes
    // sit on the ground even when the sun leaves the meadow edge.
    const shadowGeometry = new THREE.PlaneGeometry(1, 1);
    shadowGeometry.rotateX(-Math.PI / 2);
    const shadowMaterial = new THREE.MeshBasicMaterial({
      map: shared.glowTexture,
      color: 0x0b1410,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const treeShadows = new THREE.InstancedMesh(shadowGeometry, shadowMaterial, records.length);
    treeShadows.frustumCulled = false;
    treeShadows.renderOrder = 1;
    treeShadows.name = 'tree-contact-shadows';
    const shadowMatrix = new THREE.Matrix4();
    const shadowQuat = new THREE.Quaternion();
    const shadowPos = new V3();
    const shadowScale = new V3();
    records.forEach((tree, index) => {
      shadowPos.set(tree.x, tree.y + 0.012, tree.z);
      shadowQuat.setFromEuler(new THREE.Euler(0, tree.yaw, 0));
      const width = tree.height * (tree.type === 'pine' ? 0.58 : 0.7);
      shadowScale.set(width, 1, width * 0.68);
      shadowMatrix.compose(shadowPos, shadowQuat, shadowScale);
      treeShadows.setMatrixAt(index, shadowMatrix);
    });
    treeShadows.instanceMatrix.needsUpdate = true;
    worldContent.add(treeShadows);

    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const pos = new V3();
    const scl = new V3();
    const identity = new THREE.Quaternion();
    const birchColor = new THREE.Color();
    const trunkColors = [color(0x4b392b), color(0x594331), color(0x3d3228), color(0x66503c)];

    // Trunks for every tree.
    const trunkGeometry = new THREE.CylinderGeometry(0.62, 1, 1, 6, 1, false);
    const trunkMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.94,
      metalness: 0,
      envMapIntensity: 0.2,
    });
    const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, records.length);
    trunks.castShadow = true;
    trunks.receiveShadow = true;
    trunks.frustumCulled = false;
    records.forEach((tree, index) => {
      const trunkHeight = tree.type === 'pine' ? tree.height * 0.34 : tree.height * 0.53;
      const trunkRadius = Math.max(0.015, tree.height * (tree.type === 'pine' ? 0.035 : 0.043));
      pos.set(tree.x, tree.y + trunkHeight * 0.5 - 0.008, tree.z);
      scl.set(trunkRadius, trunkHeight, trunkRadius);
      matrix.compose(pos, identity, scl);
      trunks.setMatrixAt(index, matrix);
      birchColor.copy(trunkColors[Math.floor(random() * trunkColors.length)]);
      if (tree.tone === 'blossom') birchColor.lerp(color(0x74504c), 0.5);
      trunks.setColorAt(index, birchColor);
    });
    trunks.instanceMatrix.needsUpdate = true;
    if (trunks.instanceColor) trunks.instanceColor.needsUpdate = true;
    trunks.name = 'forest-trunks';
    worldContent.add(trunks);

    // Conifer crowns: three stacked, softly rounded tiers.
    const pineGeometry = (() => {
      const profile = [
        new THREE.Vector2(0.018, 0),
        new THREE.Vector2(0.92, 0.016),
        new THREE.Vector2(1.0, 0.12),
        new THREE.Vector2(0.8, 0.35),
        new THREE.Vector2(0.56, 0.6),
        new THREE.Vector2(0.3, 0.82),
        new THREE.Vector2(0.075, 0.95),
        new THREE.Vector2(0, 1),
      ];
      const geo = new THREE.LatheGeometry(profile, 10, 0, TAU);
      geo.computeVertexNormals();
      return geo;
    })();

    const pineMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.88,
      metalness: 0,
      envMapIntensity: 0.22,
      side: THREE.DoubleSide,
    });

    const pineLayers = [
      { at: 0.20, height: 0.43, radius: 0.27 },
      { at: 0.39, height: 0.40, radius: 0.205 },
      { at: 0.59, height: 0.39, radius: 0.137 },
    ];
    const pineMesh = new THREE.InstancedMesh(pineGeometry, pineMaterial, pines.length * pineLayers.length);
    pineMesh.castShadow = true;
    pineMesh.receiveShadow = true;
    pineMesh.frustumCulled = false;

    let pineIndex = 0;
    pines.forEach((tree) => {
      const jitter = tree.height * 0.022;
      pineLayers.forEach((layer, layerIndex) => {
        const y = tree.y + tree.height * layer.at;
        pos.set(
          tree.x + randomRange(-jitter, jitter),
          y,
          tree.z + randomRange(-jitter, jitter)
        );
        scl.set(
          tree.height * layer.radius * randomRange(0.9, 1.14),
          tree.height * layer.height,
          tree.height * layer.radius * randomRange(0.88, 1.06)
        );
        quat.setFromEuler(new THREE.Euler(0, tree.yaw + layerIndex * 0.4 + randomRange(-0.16, 0.16), 0));
        matrix.compose(pos, quat, scl);
        pineMesh.setMatrixAt(pineIndex, matrix);
        const c = pickTreeColor(tree.tone, 'pine', layerIndex * 0.75);
        pineMesh.setColorAt(pineIndex, c);
        pineIndex += 1;
      });
    });
    pineMesh.instanceMatrix.needsUpdate = true;
    if (pineMesh.instanceColor) pineMesh.instanceColor.needsUpdate = true;
    pineMesh.name = 'conifer-crowns';
    worldContent.add(pineMesh);

    // Broadleaf crowns: overlapping clay pebbles of foliage.
    const leafGeometry = new THREE.SphereGeometry(1, 8, 6);
    const leafMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.86,
      metalness: 0,
      envMapIntensity: 0.24,
    });

    const BLOBS_PER_LEAF = 9;
    const leafMesh = new THREE.InstancedMesh(leafGeometry, leafMaterial, leaves.length * BLOBS_PER_LEAF);
    leafMesh.castShadow = true;
    leafMesh.receiveShadow = true;
    leafMesh.frustumCulled = false;

    let leafIndex = 0;
    leaves.forEach((tree) => {
      const h = tree.height;
      const leanAngle = random() * TAU;
      const lean = h * randomRange(0.015, 0.09);
      const crownX = tree.x + Math.cos(leanAngle) * lean;
      const crownZ = tree.z + Math.sin(leanAngle) * lean;
      const crownY = tree.y + h * 0.7;
      const crownR = h * 0.242 * tree.spread;
      const baseYaw = tree.yaw;
      for (let b = 0; b < BLOBS_PER_LEAF; b += 1) {
        const center = b === 0;
        const satellite = b === BLOBS_PER_LEAF - 1;
        const angle = baseYaw + (b / (BLOBS_PER_LEAF - 1)) * TAU + randomRange(-0.5, 0.5);
        const radial = center ? 0 : crownR * (satellite ? randomRange(0.9, 1.22) : randomRange(0.34, 0.98));
        const x = crownX + Math.cos(angle) * radial;
        const z = crownZ + Math.sin(angle) * radial;
        const y = crownY + (center ? h * 0.09 : randomRange(-0.16, 0.2)) * h;
        const sx = crownR * randomRange(satellite ? 0.34 : 0.52, satellite ? 0.58 : 0.94) * (center ? 1.08 : 1);
        const sy = crownR * randomRange(0.48, 0.9);
        const sz = crownR * randomRange(satellite ? 0.34 : 0.52, satellite ? 0.58 : 0.94) * (center ? 1.08 : 1);
        pos.set(x, y, z);
        scl.set(sx, sy, sz);
        quat.setFromEuler(new THREE.Euler(
          randomRange(-0.08, 0.08),
          random() * TAU,
          randomRange(-0.16, 0.16)
        ));
        matrix.compose(pos, quat, scl);
        leafMesh.setMatrixAt(leafIndex, matrix);
        const leafColor = pickTreeColor(tree.tone, 'leaf', random() * 1.4);
        leafColor.multiplyScalar(0.88 + 0.16 * smoothstep(0.45, 0.8, (y - tree.y) / h));
        leafMesh.setColorAt(leafIndex, leafColor);
        leafIndex += 1;
      }
    });
    leafMesh.instanceMatrix.needsUpdate = true;
    if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true;
    leafMesh.name = 'broadleaf-crowns';
    worldContent.add(leafMesh);

    // A few bare branches reach out from below the broadleaf crowns.
    const branchCount = leaves.length * 3;
    if (branchCount > 0) {
      const branchGeometry = new THREE.CylinderGeometry(0.5, 1, 1, 4, 1);
      const branchMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.94,
        metalness: 0,
        envMapIntensity: 0.16,
      });
      const branches = new THREE.InstancedMesh(branchGeometry, branchMaterial, branchCount);
      branches.castShadow = true;
      branches.receiveShadow = true;
      branches.frustumCulled = false;
      branches.name = 'tree-branches';
      const branchMatrix = new THREE.Matrix4();
      const branchQuat = new THREE.Quaternion();
      const branchPos = new V3();
      const branchScale = new V3();
      const branchStart = new V3();
      const branchEnd = new V3();
      const branchDir = new V3();
      const up = new V3(0, 1, 0);
      const branchColor = new THREE.Color();
      let branchIndex = 0;
      leaves.forEach((tree) => {
        for (let b = 0; b < 3; b += 1) {
          const angle = tree.yaw + (b / 3) * TAU + randomRange(-0.4, 0.4);
          const startY = tree.y + tree.height * (0.32 + b * 0.06 + randomRange(-0.02, 0.03));
          const length = tree.height * randomRange(0.24, 0.4);
          branchDir.set(
            Math.cos(angle),
            randomRange(0.18, 0.42),
            Math.sin(angle)
          ).normalize();
          branchStart.set(tree.x, startY, tree.z);
          branchEnd.copy(branchStart).addScaledVector(branchDir, length);
          branchQuat.setFromUnitVectors(up, branchDir);
          branchPos.copy(branchStart).add(branchEnd).multiplyScalar(0.5);
          const branchRadius = Math.max(0.008, tree.height * 0.016);
          branchScale.set(branchRadius, length, branchRadius);
          branchMatrix.compose(branchPos, branchQuat, branchScale);
          branches.setMatrixAt(branchIndex, branchMatrix);
          branchColor.setHex(b === 0 ? 0x4a3628 : 0x5b4532);
          branches.setColorAt(branchIndex, branchColor);
          branchIndex += 1;
        }
      });
      branches.instanceMatrix.needsUpdate = true;
      if (branches.instanceColor) branches.instanceColor.needsUpdate = true;
      worldContent.add(branches);
    }

    // Low shrubs soften the forest floor.
    const shrubPositions = [];
    for (let i = 0; i < 300 && shrubPositions.length < 52; i += 1) {
      const a = random() * TAU;
      const r = Math.sqrt(random()) * 3.62;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (isWaterAt(x, z, 0.17) || insideMountainFootprint(x, z, 0.12) || inClearing(x, z, 0.02)) continue;
      if (terrainSlope(x, z) > 1.35) continue;
      const forestBias = fbm(x * 0.8 + 1.1, z * 0.8 - 3.2, 2);
      if (forestBias < 0.42 && random() < 0.5) continue;
      shrubPositions.push([x, z]);
    }

    if (shrubPositions.length) {
      const shrubMesh = new THREE.InstancedMesh(leafGeometry, leafMaterial, shrubPositions.length * 2);
      shrubMesh.castShadow = true;
      shrubMesh.receiveShadow = true;
      shrubMesh.frustumCulled = false;
      let si = 0;
      shrubPositions.forEach(([x, z]) => {
        const ground = terrainHeight(x, z);
        const scale = randomRange(0.075, 0.21);
        for (let j = 0; j < 2; j += 1) {
          pos.set(x + randomRange(-0.05, 0.05), ground + scale * (0.48 + j * 0.22), z + randomRange(-0.05, 0.05));
          scl.set(scale * randomRange(0.9, 1.4), scale * randomRange(0.5, 0.8), scale * randomRange(0.9, 1.35));
          quat.setFromEuler(new THREE.Euler(0, random() * TAU, 0));
          matrix.compose(pos, quat, scl);
          shrubMesh.setMatrixAt(si, matrix);
          shrubMesh.setColorAt(si, pickTreeColor(random() < 0.1 ? 'gold' : 'green', 'leaf', random()));
          si += 1;
        }
      });
      shrubMesh.instanceMatrix.needsUpdate = true;
      if (shrubMesh.instanceColor) shrubMesh.instanceColor.needsUpdate = true;
      shrubMesh.name = 'forest-shrubs';
      worldContent.add(shrubMesh);
    }
  }

  /* Grass and flowers ---------------------------------------------------- */
  const grassWindUniform = { value: 0 };
  let grassMesh = null;
  let flowerHeadMesh = null;

  function createGrassGeometry() {
    const H = 0.25;
    const rows = [
      { y: 0.0, w: 0.020, bend: 0.0 },
      { y: 0.085, w: 0.017, bend: 0.005 },
      { y: 0.17, w: 0.011, bend: 0.014 },
      { y: H, w: 0.0, bend: 0.028 },
    ];
    const positions = [];
    const indices = [];
    const rowsVerts = [];
    rows.forEach((row) => {
      if (row.w === 0) {
        const idx = positions.length / 3;
        positions.push(row.bend, row.y, 0);
        rowsVerts.push({ left: idx, right: idx });
      } else {
        const left = positions.length / 3;
        positions.push(-row.w + row.bend, row.y, 0);
        const right = positions.length / 3;
        positions.push(row.w + row.bend, row.y, 0);
        rowsVerts.push({ left, right });
      }
    });
    for (let i = 0; i < rows.length - 1; i += 1) {
      const a = rowsVerts[i];
      const b = rowsVerts[i + 1];
      if (a.left === a.right) continue;
      indices.push(a.left, b.left, a.right);
      indices.push(a.right, b.left, b.right);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  function buildGrass() {
    const count = QUALITY.mobile ? 3900 : 6900;
    const geometry = createGrassGeometry();
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.82,
      metalness: 0,
      side: THREE.DoubleSide,
      envMapIntensity: 0.2,
    });

    material.onBeforeCompile = (shader) => {
      shader.uniforms.uGrassTime = { value: 0 };
      material.userData.shader = shader;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform float uGrassTime;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           float bladeBend = pow(clamp(position.y / 0.25, 0.0, 1.0), 1.65);
           float wind = sin(uGrassTime * 1.25 + instanceMatrix[3].x * 2.4 + instanceMatrix[3].z * 1.9) * 0.017
                      + sin(uGrassTime * 2.8 + instanceMatrix[3].x * 4.2 - instanceMatrix[3].z * 2.7) * 0.006;
           transformed.x += wind * bladeBend;
           transformed.z += wind * 0.35 * bladeBend;`
        );
    };
    material.customProgramCacheKey = () => 'terrarium-grass-wind-v1';

    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.name = 'meadow-grass';

    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const pos = new V3();
    const scl = new V3();
    const tint = new THREE.Color();
    const palette = [0x436f43, 0x507d49, 0x5d894a, 0x6b9451, 0x3d673f, 0x789e57, 0x557f50];
    let placed = 0;
    let tries = 0;

    while (placed < count && tries < count * 8) {
      tries += 1;
      const a = random() * TAU;
      const r = Math.sqrt(random()) * 3.84;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (isWaterAt(x, z, 0.035)) continue;
      if (insideMountainFootprint(x, z, 0.02)) continue;
      if (inClearing(x, z, 0) && random() < 0.32) continue;
      const y = terrainHeight(x, z);
      const clearFactor = inClearing(x, z, 0.05) ? 0.56 : 1;
      const scale = randomRange(0.38, 0.88) * clearFactor;
      pos.set(x, y - 0.005, z);
      quat.setFromEuler(new THREE.Euler(randomRange(-0.08, 0.08), random() * TAU, randomRange(-0.11, 0.11)));
      scl.set(scale * randomRange(0.72, 1.28), scale, scale * randomRange(0.72, 1.28));
      matrix.compose(pos, quat, scl);
      mesh.setMatrixAt(placed, matrix);
      tint.setHex(palette[Math.floor(random() * palette.length)]);
      tint.offsetHSL(randomRange(-0.012, 0.012), randomRange(-0.03, 0.05), randomRange(-0.03, 0.04));
      mesh.setColorAt(placed, tint);
      placed += 1;
    }

    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    grassMesh = mesh;
    worldContent.add(mesh);
  }

  function buildFlowers() {
    const count = QUALITY.mobile ? 170 : 250;
    const shape = new THREE.Shape();
    const petals = 5;
    for (let i = 0; i < petals * 2; i += 1) {
      const angle = -Math.PI / 2 + (i / (petals * 2)) * TAU;
      const radius = i % 2 === 0 ? 0.58 : 0.19;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    shape.closePath();
    const headGeo = new THREE.ShapeGeometry(shape);
    headGeo.rotateX(-Math.PI / 2);
    headGeo.computeVertexNormals();

    const headMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.68,
      metalness: 0,
      side: THREE.DoubleSide,
      envMapIntensity: 0.3,
    });
    const heads = new THREE.InstancedMesh(headGeo, headMat, count);
    heads.castShadow = false;
    heads.receiveShadow = false;
    heads.frustumCulled = false;
    heads.name = 'meadow-flowers';

    const stemGeo = new THREE.CylinderGeometry(0.0045, 0.0065, 1, 4);
    const stemMat = new THREE.MeshStandardMaterial({
      color: 0x547743,
      roughness: 0.9,
      metalness: 0,
    });
    const stems = new THREE.InstancedMesh(stemGeo, stemMat, count);
    stems.castShadow = false;
    stems.receiveShadow = true;
    stems.frustumCulled = false;
    stems.name = 'flower-stems';

    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const pos = new V3();
    const scl = new V3();
    const tint = new THREE.Color();
    const flowerPalette = [0xf7f1dc, 0xf3e7cf, 0xe9c8ca, 0xdcb3bf, 0xf6e7b8, 0xeae2cf, 0xf2d4bd];
    const clusters = [
      { x: -0.35, z: 1.6, r: 1.1 },
      { x: 2.3, z: 2.15, r: 0.72 },
      { x: -1.9, z: 2.2, r: 0.8 },
      { x: 1.5, z: 2.75, r: 0.85 },
      { x: -2.6, z: 0.5, r: 0.7 },
    ];

    let placed = 0;
    let tries = 0;
    while (placed < count && tries < count * 12) {
      tries += 1;
      const cluster = clusters[Math.floor(random() * clusters.length)];
      const a = random() * TAU;
      const r = Math.sqrt(random()) * cluster.r;
      const x = cluster.x + Math.cos(a) * r;
      const z = cluster.z + Math.sin(a) * r;
      if (Math.hypot(x, z) > 3.82) continue;
      if (isWaterAt(x, z, 0.08) || insideMountainFootprint(x, z, 0.04) || inClearing(x, z, -0.15)) continue;
      const ground = terrainHeight(x, z);
      const h = randomRange(0.10, 0.21);
      pos.set(x, ground + h * 0.5, z);
      scl.set(1, h, 1);
      quat.identity();
      matrix.compose(pos, quat, scl);
      stems.setMatrixAt(placed, matrix);

      pos.set(x, ground + h, z);
      const size = randomRange(0.032, 0.065);
      scl.set(size, size, size);
      quat.setFromEuler(new THREE.Euler(0, random() * TAU, randomRange(-0.12, 0.12)));
      matrix.compose(pos, quat, scl);
      heads.setMatrixAt(placed, matrix);
      tint.setHex(flowerPalette[Math.floor(random() * flowerPalette.length)]);
      tint.offsetHSL(randomRange(-0.01, 0.01), 0, randomRange(-0.02, 0.02));
      heads.setColorAt(placed, tint);
      placed += 1;
    }

    heads.count = placed;
    stems.count = placed;
    heads.instanceMatrix.needsUpdate = true;
    if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
    stems.instanceMatrix.needsUpdate = true;
    flowerHeadMesh = heads;
    worldContent.add(stems);
    worldContent.add(heads);
  }

  /* Mushrooms, lily pads and reeds -------------------------------------- */
  function buildForestFloorDetails() {
    const count = 46;
    const stemGeo = new THREE.CylinderGeometry(0.007, 0.012, 1, 5);
    const capGeo = new THREE.SphereGeometry(1, 8, 4, 0, TAU, 0, Math.PI * 0.52);
    const stemMat = new THREE.MeshStandardMaterial({ color: 0xd6c6a8, roughness: 0.92 });
    const capMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, envMapIntensity: 0.3 });
    const stems = new THREE.InstancedMesh(stemGeo, stemMat, count);
    const caps = new THREE.InstancedMesh(capGeo, capMat, count);
    stems.frustumCulled = false;
    caps.frustumCulled = false;
    stems.castShadow = false;
    caps.castShadow = true;
    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const pos = new V3();
    const scl = new V3();
    const tint = new THREE.Color();
    const capPalette = [0xb96948, 0xc17f57, 0xa75943, 0xd6a36c, 0x9f5e4b];
    let n = 0;
    for (let i = 0; i < 500 && n < count; i += 1) {
      const a = random() * TAU;
      const r = Math.sqrt(random()) * 3.5;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (isWaterAt(x, z, 0.1) || insideMountainFootprint(x, z, 0.05) || inClearing(x, z, 0)) continue;
      if (fbm(x * 0.75 + 6.6, z * 0.75 - 2.2, 2) < 0.47) continue;
      const ground = terrainHeight(x, z);
      const h = randomRange(0.04, 0.09);
      const capSize = randomRange(0.03, 0.065);
      pos.set(x, ground + h * 0.5, z);
      scl.set(1, h, 1);
      quat.identity();
      matrix.compose(pos, quat, scl);
      stems.setMatrixAt(n, matrix);
      pos.set(x, ground + h, z);
      scl.set(capSize, capSize * 0.52, capSize);
      quat.setFromEuler(new THREE.Euler(0, random() * TAU, 0));
      matrix.compose(pos, quat, scl);
      caps.setMatrixAt(n, matrix);
      tint.setHex(capPalette[Math.floor(random() * capPalette.length)]);
      caps.setColorAt(n, tint);
      n += 1;
    }
    stems.count = n;
    caps.count = n;
    stems.instanceMatrix.needsUpdate = true;
    caps.instanceMatrix.needsUpdate = true;
    if (caps.instanceColor) caps.instanceColor.needsUpdate = true;
    worldContent.add(stems);
    worldContent.add(caps);
  }

  function createFernGeometry() {
    const positions = [];
    const indices = [];
    const fronds = 6;
    const segments = 4;
    for (let f = 0; f < fronds; f += 1) {
      const angle = (f / fronds) * TAU + (f % 2 === 0 ? 0.18 : -0.12);
      const ca = Math.cos(angle);
      const sa = Math.sin(angle);
      const base = positions.length / 3;
      for (let s = 0; s <= segments; s += 1) {
        const t = s / segments;
        const radial = 0.06 + t * 0.45;
        const arch = Math.sin(Math.PI * t) * 0.19 - t * t * 0.035;
        const width = 0.06 * Math.sin(Math.PI * t) * (0.78 + 0.22 * (1 - t)) + 0.003;
        const cx = ca * radial;
        const cz = sa * radial;
        // Perpendicular in the XZ plane.
        positions.push(cx - sa * width, arch, cz + ca * width);
        positions.push(cx + sa * width, arch, cz - ca * width);
      }
      for (let s = 0; s < segments; s += 1) {
        const a = base + s * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        indices.push(a, c, b, b, c, d);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  function buildFerns() {
    const count = QUALITY.mobile ? 52 : 92;
    const geometry = createFernGeometry();
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0,
      side: THREE.DoubleSide,
      envMapIntensity: 0.18,
    });
    const ferns = new THREE.InstancedMesh(geometry, material, count);
    ferns.castShadow = false;
    ferns.receiveShadow = true;
    ferns.frustumCulled = false;
    ferns.name = 'fern-understory';
    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const pos = new V3();
    const scl = new V3();
    const tint = new THREE.Color();
    const palette = [0x35613c, 0x437246, 0x527f49, 0x608c50, 0x2e5838];
    let placed = 0;
    for (let i = 0; i < 900 && placed < count; i += 1) {
      const a = random() * TAU;
      const r = Math.sqrt(random()) * 3.62;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (isWaterAt(x, z, 0.12) || insideMountainFootprint(x, z, 0.02) || inClearing(x, z, 0.02)) continue;
      if (fbm(x * 0.8 + 1.6, z * 0.8 - 4.1, 2) < 0.43 && random() < 0.55) continue;
      if (terrainSlope(x, z) > 1.35) continue;
      const ground = terrainHeight(x, z);
      const scale = randomRange(0.28, 0.62);
      pos.set(x, ground - 0.005, z);
      quat.setFromEuler(new THREE.Euler(0, random() * TAU, 0));
      scl.set(scale, scale, scale);
      matrix.compose(pos, quat, scl);
      ferns.setMatrixAt(placed, matrix);
      tint.setHex(palette[Math.floor(random() * palette.length)]);
      tint.offsetHSL(randomRange(-0.01, 0.01), randomRange(-0.04, 0.03), randomRange(-0.03, 0.04));
      ferns.setColorAt(placed, tint);
      placed += 1;
    }
    ferns.count = placed;
    ferns.instanceMatrix.needsUpdate = true;
    if (ferns.instanceColor) ferns.instanceColor.needsUpdate = true;
    worldContent.add(ferns);
  }

  /* ------------------------------------------------------------------ *
   *  08 · A little arched footbridge and its stepping-stone path
   * ------------------------------------------------------------------ */
  function makeBeamBetween(a, b, radius, material, radialSegments = 5) {
    const start = a.clone();
    const end = b.clone();
    const direction = end.clone().sub(start);
    const length = direction.length();
    const geo = new THREE.CylinderGeometry(radius * 0.82, radius, length, radialSegments, 1);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new V3(0, 1, 0), direction.normalize());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  function buildBridge() {
    const t = 0.435;
    const center = riverCurve.getPoint(t);
    const tangent = riverCurve.getTangent(t).normalize();
    const length = riverWidthAt(t) + 0.85;
    const group = new THREE.Group();
    group.name = 'little-footbridge';
    group.position.set(center.x, 0, center.z);
    group.rotation.y = Math.atan2(tangent.x, tangent.z);

    const leftWorld = new V3(
      center.x + Math.cos(group.rotation.y) * -length * 0.5,
      0,
      center.z - Math.sin(group.rotation.y) * -length * 0.5
    );
    const rightWorld = new V3(
      center.x + Math.cos(group.rotation.y) * length * 0.5,
      0,
      center.z - Math.sin(group.rotation.y) * length * 0.5
    );
    const leftY = terrainHeight(leftWorld.x, leftWorld.z);
    const rightY = terrainHeight(rightWorld.x, rightWorld.z);
    const deckEndY = Math.max(leftY, rightY, riverSurfaceY(t) + 0.075);
    const crownY = deckEndY + 0.105;
    const yAt = (u) => lerp(deckEndY + 0.008, crownY, 1 - u * u);

    const plankMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.87,
      metalness: 0,
      envMapIntensity: 0.24,
    });
    const darkWood = new THREE.MeshStandardMaterial({
      color: 0x4e3626,
      roughness: 0.9,
      metalness: 0,
    });

    const plankCount = 13;
    const plankWidth = length / plankCount;
    const plankGeo = new THREE.BoxGeometry(plankWidth * 0.9, 0.022, 0.245);
    const planks = new THREE.InstancedMesh(plankGeo, plankMaterial, plankCount);
    planks.castShadow = true;
    planks.receiveShadow = true;
    const plankMatrix = new THREE.Matrix4();
    const plankQuat = new THREE.Quaternion();
    const plankPos = new V3();
    const plankScale = new V3(1, 1, 1);
    const plankColor = new THREE.Color();
    const lightWoodColor = color(0x6f4f35);
    const darkPlankColor = color(0x4e3626);
    for (let i = 0; i < plankCount; i += 1) {
      const u = -1 + (i + 0.5) * (2 / plankCount);
      const rotZ = -(yAt(u + 0.05) - yAt(u - 0.05)) / (length * 0.1);
      plankPos.set(u * length * 0.5, yAt(u), 0);
      plankQuat.setFromEuler(new THREE.Euler(0, 0, rotZ));
      plankMatrix.compose(plankPos, plankQuat, plankScale);
      planks.setMatrixAt(i, plankMatrix);
      planks.setColorAt(i, i % 3 === 0 ? darkPlankColor : lightWoodColor);
    }
    planks.instanceMatrix.needsUpdate = true;
    if (planks.instanceColor) planks.instanceColor.needsUpdate = true;
    group.add(planks);

    // Handrail posts.
    const postGeo = new THREE.CylinderGeometry(0.011, 0.014, 0.15, 5);
    const posts = new THREE.InstancedMesh(postGeo, darkWood, 10);
    posts.castShadow = true;
    const postMatrix = new THREE.Matrix4();
    const postQuat = new THREE.Quaternion();
    const postPos = new V3();
    const postScale = new V3(1, 1, 1);
    let postIndex = 0;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i += 1) {
        const u = -1 + (i / 4) * 2;
        postPos.set(u * length * 0.47, yAt(u) + 0.075, side * 0.115);
        postMatrix.compose(postPos, postQuat, postScale);
        posts.setMatrixAt(postIndex, postMatrix);
        postIndex += 1;
      }
      const points = [];
      for (let i = 0; i < 13; i += 1) {
        const u = -1 + (i / 12) * 2;
        points.push(new V3(u * length * 0.47, yAt(u) + 0.155, side * 0.115));
      }
      const railCurve = new THREE.CatmullRomCurve3(points);
      const railGeo = new THREE.TubeGeometry(railCurve, 18, 0.008, 4, false);
      const rail = new THREE.Mesh(railGeo, darkWood);
      rail.castShadow = true;
      group.add(rail);
    }
    posts.instanceMatrix.needsUpdate = true;
    group.add(posts);

    const capMaterial = new THREE.MeshStandardMaterial({
      color: 0x8c6443,
      roughness: 0.82,
      metalness: 0,
    });
    const caps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.018, 6, 4), capMaterial, 4);
    caps.castShadow = true;
    const capMatrix = new THREE.Matrix4();
    const capQuat = new THREE.Quaternion();
    const capPos = new V3();
    const capScale = new V3(1, 1, 1);
    let capIndex = 0;
    for (const side of [-1, 1]) {
      for (const u of [-1, 1]) {
        capPos.set(u * length * 0.47, yAt(u) + 0.165, side * 0.115);
        capMatrix.compose(capPos, capQuat, capScale);
        caps.setMatrixAt(capIndex, capMatrix);
        capIndex += 1;
      }
    }
    caps.instanceMatrix.needsUpdate = true;
    group.add(caps);

    // A tiny warm lantern makes the bridge feel inhabited.
    const lanternGroup = new THREE.Group();
    const lanternPost = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.25, 5), darkWood);
    lanternPost.position.set(length * 0.43, yAt(0.88) + 0.16, -0.13);
    lanternGroup.add(lanternPost);
    const lanternArm = makeBeamBetween(
      new V3(length * 0.43, yAt(0.88) + 0.28, -0.13),
      new V3(length * 0.35, yAt(0.88) + 0.29, -0.13),
      0.005,
      darkWood,
      4
    );
    lanternGroup.add(lanternArm);
    const lanternMat = new THREE.MeshStandardMaterial({
      color: 0xffd28a,
      emissive: new THREE.Color(0xffb45f),
      emissiveIntensity: 2.2,
      roughness: 0.48,
      metalness: 0,
      transparent: true,
      opacity: 0.92,
    });
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 6), lanternMat);
    lantern.scale.set(0.78, 1.15, 0.78);
    lantern.position.set(length * 0.35, yAt(0.88) + 0.245, -0.13);
    lanternGroup.add(lantern);
    const lanternLight = new THREE.PointLight(0xffb466, 1.6, 1.1, 2);
    lanternLight.position.copy(lantern.position);
    lanternGroup.add(lanternLight);
    group.add(lanternGroup);

    // A tiny slate bird resting on the far handrail.
    const perched = new THREE.Group();
    const perchedMat = new THREE.MeshStandardMaterial({
      color: 0x44555b,
      roughness: 0.72,
      metalness: 0,
      envMapIntensity: 0.3,
    });
    const perchedBody = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), perchedMat);
    perchedBody.scale.set(0.045, 0.031, 0.026);
    perchedBody.position.set(-length * 0.21, yAt(-0.42) + 0.18, 0.115);
    perchedBody.rotation.y = -0.45;
    perched.add(perchedBody);
    const perchedHead = new THREE.Mesh(new THREE.SphereGeometry(0.022, 7, 5), perchedMat);
    perchedHead.position.set(-length * 0.21 + 0.038, yAt(-0.42) + 0.196, 0.106);
    perched.add(perchedHead);
    const perchedBeak = new THREE.Mesh(
      new THREE.ConeGeometry(0.008, 0.022, 4),
      new THREE.MeshStandardMaterial({ color: 0x2a2b28, roughness: 0.8 })
    );
    perchedBeak.rotation.z = -Math.PI / 2;
    perchedBeak.rotation.y = -0.45;
    perchedBeak.position.set(-length * 0.21 + 0.06, yAt(-0.42) + 0.193, 0.106);
    perched.add(perchedBeak);
    group.add(perched);

    worldContent.add(group);
    return { group, lantern, lanternLight };
  }

  function buildSteppingStones() {
    const path = new THREE.CatmullRomCurve3([
      new V3(-1.18, 0, 2.55),
      new V3(-0.82, 0, 2.26),
      new V3(-0.52, 0, 1.94),
      new V3(-0.26, 0, 1.64),
      new V3(-0.12, 0, 1.25),
      new V3(-0.18, 0, 0.92),
    ]);
    const count = 15;
    const geometry = new THREE.CylinderGeometry(1, 1, 0.045, 7);
    const material = new THREE.MeshStandardMaterial({
      color: 0x878478,
      roughness: 0.95,
      metalness: 0,
      envMapIntensity: 0.18,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.name = 'stepping-stones';
    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const pos = new V3();
    const scl = new V3();
    for (let i = 0; i < count; i += 1) {
      const t = (i + 0.5) / count;
      const p = path.getPoint(t);
      const tangent = path.getTangent(t);
      const w = randomRange(0.055, 0.095);
      const ground = terrainHeight(p.x, p.z);
      pos.set(p.x + randomRange(-0.03, 0.03), ground + 0.009, p.z + randomRange(-0.03, 0.03));
      quat.setFromEuler(new THREE.Euler(0, Math.atan2(tangent.x, tangent.z) + randomRange(-0.3, 0.3), 0));
      scl.set(w, 1, w * randomRange(0.68, 0.92));
      matrix.compose(pos, quat, scl);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    worldContent.add(mesh);
  }

  /* ------------------------------------------------------------------ *
   *  09 · Waterfall, foam and the occasional falling droplet
   * ------------------------------------------------------------------ */
  const waterfall = {
    source: new V3(-1.84, 0.74, -1.02),
    base: new V3(-1.275, WATER.poolY + 0.025, 0.06),
    material: null,
    group: null,
    rings: [],
    droplets: null,
    dropletPositions: null,
    mist: [],
  };

  const waterfallCurve = new THREE.CatmullRomCurve3([
    new V3(-1.84, 0.74, -1.02),
    new V3(-1.72, 0.57, -0.88),
    new V3(-1.60, 0.32, -0.70),
    new V3(-1.48, 0.02, -0.50),
    new V3(-1.38, -0.30, -0.30),
    new V3(-1.31, -0.62, -0.08),
    new V3(-1.275, WATER.poolY + 0.025, 0.06),
  ]);

  function makeWaterfallMaterial() {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0x8acfe1) },
        uFoam: { value: new THREE.Color(0xf2fbfb) },
        uOpacity: { value: 0.94 },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorld;
        void main() {
          vUv = uv;
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uColor;
        uniform vec3 uFoam;
        uniform float uOpacity;
        varying vec2 vUv;
        varying vec3 vWorld;

        float hash21(vec2 p) {
          p = fract(p * vec2(143.13, 269.61));
          p += dot(p, p + 34.5);
          return fract(p.x * p.y);
        }

        float noise21(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash21(i);
          float b = hash21(i + vec2(1.0, 0.0));
          float c = hash21(i + vec2(0.0, 1.0));
          float d = hash21(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        void main() {
          vec2 uv = vUv;
          float flow = uv.y * 3.0 - uTime * 1.12;
          float nA = noise21(vec2(uv.x * 7.0, flow * 1.5));
          float nB = noise21(vec2(uv.x * 23.0, flow * 3.2 + 7.0));
          float nC = noise21(vec2(uv.x * 42.0, flow * 5.0 + 11.0));
          float streak = nA * 0.44 + nB * 0.37 + nC * 0.19;
          float foam = smoothstep(0.48, 0.72, streak);
          vec3 col = mix(uColor, uFoam, 0.3 + foam * 0.68);
          col += uFoam * smoothstep(0.84, 0.98, streak) * 0.4;

          float sideFade = smoothstep(0.0, 0.16, uv.x) * (1.0 - smoothstep(0.84, 1.0, uv.x));
          float topFade = smoothstep(0.0, 0.06, uv.y);
          float bottomFade = 1.0 - smoothstep(0.83, 1.0, uv.y);
          float alpha = uOpacity * sideFade * topFade * bottomFade * (0.55 + 0.45 * foam);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });
  }

  function buildWaterfall() {
    const material = makeWaterfallMaterial();
    waterfall.material = material;

    const group = new THREE.Group();
    group.name = 'snowmelt-waterfall';
    waterfall.group = group;

    const segments = 54;
    const lateral = 4;
    const positions = [];
    const uvs = [];
    const indices = [];
    const side = new V3(0.82, 0, -0.57).normalize();

    for (let i = 0; i < segments; i += 1) {
      const t = i / (segments - 1);
      const p = waterfallCurve.getPoint(t);
      const width = lerp(0.26, 0.5, smoothstep(0.12, 1.0, t)) * (1 + 0.06 * Math.sin(t * 15));
      for (let j = 0; j < lateral + 1; j += 1) {
        const s = j / lateral;
        const offset = (s - 0.5) * width;
        positions.push(
          p.x + side.x * offset,
          p.y + Math.sin(t * 10 + s * 3) * 0.004,
          p.z + side.z * offset
        );
        uvs.push(s, t);
      }
    }

    for (let i = 0; i < segments - 1; i += 1) {
      for (let j = 0; j < lateral; j += 1) {
        const a = i * (lateral + 1) + j;
        const b = a + 1;
        const c = (i + 1) * (lateral + 1) + j;
        const d = c + 1;
        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const sheet = new THREE.Mesh(geometry, material);
    sheet.renderOrder = 3;
    group.add(sheet);

    // The narrow stream feeding the fall from the snow notch.
    const feedCurve = new THREE.CatmullRomCurve3([
      new V3(-1.98, 1.38, -1.46),
      new V3(-1.92, 1.10, -1.30),
      new V3(-1.88, 0.90, -1.15),
      new V3(-1.84, 0.74, -1.02),
    ]);
    const feedPositions = [];
    const feedUvs = [];
    const feedIndices = [];
    const feedSegments = 20;
    for (let i = 0; i < feedSegments; i += 1) {
      const t = i / (feedSegments - 1);
      const p = feedCurve.getPoint(t);
      const tangent = feedCurve.getTangent(t);
      const sideF = new V3(-tangent.z, 0, tangent.x).normalize();
      const w = lerp(0.035, 0.115, t);
      for (let j = 0; j < 3; j += 1) {
        const s = j / 2;
        feedPositions.push(
          p.x + sideF.x * (s - 0.5) * w,
          p.y + 0.003,
          p.z + sideF.z * (s - 0.5) * w
        );
        feedUvs.push(s, t);
      }
    }
    for (let i = 0; i < feedSegments - 1; i += 1) {
      for (let j = 0; j < 2; j += 1) {
        const a = i * 3 + j;
        const b = a + 1;
        const c = (i + 1) * 3 + j;
        const d = c + 1;
        feedIndices.push(a, c, b, b, c, d);
      }
    }
    const feedGeo = new THREE.BufferGeometry();
    feedGeo.setAttribute('position', new THREE.Float32BufferAttribute(feedPositions, 3));
    feedGeo.setAttribute('uv', new THREE.Float32BufferAttribute(feedUvs, 2));
    feedGeo.setIndex(feedIndices);
    feedGeo.computeVertexNormals();
    const feed = new THREE.Mesh(feedGeo, material);
    feed.renderOrder = 3;
    group.add(feed);

    // Foam rings at the meeting point of fall and river.
    const ringGeo = new THREE.RingGeometry(0.08, 0.34, 36);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xd9f1f2,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    for (let i = 0; i < 3; i += 1) {
      const ring = new THREE.Mesh(ringGeo, ringMat.clone());
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(waterfall.base.x, WATER.poolY + 0.034, waterfall.base.z + i * 0.075);
      ring.rotation.z = random() * TAU;
      ring.userData.phase = i * 0.31;
      ring.userData.baseOpacity = 0.2 - i * 0.04;
      ring.renderOrder = 4;
      group.add(ring);
      waterfall.rings.push(ring);
    }

    // Fine falling droplets, updated on the CPU because there are so few.
    const dropletCount = 110;
    const dpos = new Float32Array(dropletCount * 3);
    const dseed = [];
    for (let i = 0; i < dropletCount; i += 1) {
      const t = random();
      const p = waterfallCurve.getPoint(t);
      const sideOffset = randomRange(-0.14, 0.14);
      dpos[i * 3] = p.x + side.x * sideOffset + randomRange(-0.02, 0.02);
      dpos[i * 3 + 1] = p.y + randomRange(-0.1, 0.08);
      dpos[i * 3 + 2] = p.z + side.z * sideOffset + randomRange(-0.03, 0.03);
      dseed.push({ speed: randomRange(0.32, 0.8), offset: random() * TAU, sideOffset, drift: randomRange(0.02, 0.12) });
    }
    const dropletGeo = new THREE.BufferGeometry();
    dropletGeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
    const dropletMat = new THREE.PointsMaterial({
      color: 0xd8f4ff,
      size: 0.025,
      map: shared.glowTexture,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const droplets = new THREE.Points(dropletGeo, dropletMat);
    droplets.renderOrder = 5;
    group.add(droplets);
    waterfall.droplets = droplets;
    waterfall.dropletPositions = dpos;
    waterfall.dropletSeeds = dseed;

    // Loose mist gathered where the water lands.
    const baseMist = new THREE.Group();
    for (let i = 0; i < 6; i += 1) {
      const mat = new THREE.SpriteMaterial({
        map: shared.mistTexture,
        color: 0xe4f5fb,
        transparent: true,
        opacity: randomRange(0.07, 0.14),
        depthWrite: false,
        blending: THREE.NormalBlending,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.position.set(
        waterfall.base.x + randomRange(-0.35, 0.25),
        WATER.poolY + randomRange(0.1, 0.4),
        waterfall.base.z + randomRange(-0.16, 0.28)
      );
      const s = randomRange(0.35, 0.9);
      sprite.scale.set(s * 1.6, s, 1);
      sprite.userData = {
        origin: sprite.position.clone(),
        phase: random() * TAU,
        speed: randomRange(0.12, 0.24),
        scale: s,
      };
      baseMist.add(sprite);
      waterfall.mist.push(sprite);
    }
    group.add(baseMist);

    // A handful of foam sparks leap from the base of the fall.
    waterfall.spray = [];
    const sprayCount = QUALITY.mobile ? 7 : 12;
    for (let i = 0; i < sprayCount; i += 1) {
      const material = new THREE.SpriteMaterial({
        map: shared.glowTexture,
        color: 0xe3fbff,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
        blending: THREE.NormalBlending,
      });
      const sprite = new THREE.Sprite(material);
      sprite.userData = {
        phase: random(),
        speed: randomRange(0.12, 0.25),
        angle: random() * TAU,
        radius: randomRange(0.03, 0.24),
        size: randomRange(0.13, 0.3),
        height: randomRange(0.18, 0.42),
      };
      sprite.scale.setScalar(0.2);
      group.add(sprite);
      waterfall.spray.push(sprite);
    }

    // Small icy overhang at the source.
    const iceMat = new THREE.MeshPhysicalMaterial({
      color: 0xc7e7f4,
      roughness: 0.12,
      metalness: 0,
      transparent: true,
      opacity: 0.66,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      envMapIntensity: 1.4,
    });
    for (let i = 0; i < 4; i += 1) {
      const ice = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), iceMat);
      ice.position.set(-1.86 + i * 0.05, 0.78 + randomRange(-0.03, 0.04), -1.03 - i * 0.018);
      ice.scale.set(randomRange(0.028, 0.06), randomRange(0.09, 0.17), randomRange(0.028, 0.06));
      ice.rotation.set(randomRange(-0.4, 0.4), random() * TAU, randomRange(-0.4, 0.4));
      group.add(ice);
    }

    // The snow saddle the stream spills from, with a few dark rocks framing it.
    const shelfMat = new THREE.MeshStandardMaterial({
      color: 0xd6e7f1,
      roughness: 0.76,
      metalness: 0,
      envMapIntensity: 0.3,
    });
    const shelf = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), shelfMat);
    shelf.position.set(waterfall.source.x - 0.01, waterfall.source.y - 0.035, waterfall.source.z - 0.06);
    shelf.scale.set(0.21, 0.048, 0.14);
    shelf.rotation.set(0.12, 0.4, -0.06);
    shelf.castShadow = false;
    shelf.receiveShadow = true;
    group.add(shelf);

    const sourceRockMat = new THREE.MeshStandardMaterial({
      color: 0x4d5a60,
      roughness: 0.94,
      metalness: 0,
      envMapIntensity: 0.14,
    });
    const sourceRocks = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(1, 0),
      sourceRockMat,
      4
    );
    sourceRocks.castShadow = false;
    sourceRocks.receiveShadow = true;
    const sourceRockSpots = [
      [-0.14, 0.01, -0.05, 0.075],
      [0.13, -0.01, -0.02, 0.06],
      [-0.05, 0.02, -0.14, 0.085],
      [0.04, 0.01, -0.12, 0.052],
    ];
    const sourceRockMatrix = new THREE.Matrix4();
    const sourceRockQuat = new THREE.Quaternion();
    const sourceRockPos = new V3();
    const sourceRockScale = new V3();
    sourceRockSpots.forEach(([ox, oy, oz, s], index) => {
      sourceRockPos.set(
        waterfall.source.x + ox,
        waterfall.source.y + oy,
        waterfall.source.z + oz
      );
      sourceRockQuat.setFromEuler(new THREE.Euler(random() * 0.5, random() * TAU, random() * 0.5));
      sourceRockScale.set(s * 1.2, s * 0.7, s);
      sourceRockMatrix.compose(sourceRockPos, sourceRockQuat, sourceRockScale);
      sourceRocks.setMatrixAt(index, sourceRockMatrix);
    });
    sourceRocks.instanceMatrix.needsUpdate = true;
    group.add(sourceRocks);

    const glow = new THREE.PointLight(0x8bd8e4, 0.7, 1.8, 2);
    glow.position.set(waterfall.base.x, WATER.poolY + 0.3, waterfall.base.z);
    group.add(glow);
    waterfall.glow = glow;

    worldContent.add(group);
  }

  function buildLakeDetails() {
    const padMat = new THREE.MeshStandardMaterial({
      color: 0x4f7d53,
      roughness: 0.72,
      metalness: 0,
      side: THREE.DoubleSide,
      envMapIntensity: 0.35,
    });
    const lotusMat = new THREE.MeshStandardMaterial({
      color: 0xe5b2b5,
      roughness: 0.68,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < 8; i += 1) {
      const theta = random() * TAU;
      const dist = randomRange(0.48, 0.85);
      const p = new V3(
        LAKE.x + Math.cos(theta) * LAKE.radius * 0.92 * dist,
        LAKE.level + 0.037,
        LAKE.z + Math.sin(theta) * LAKE.radius * 0.78 * dist
      );
      const shape = new THREE.Shape();
      shape.absarc(0, 0, randomRange(0.055, 0.12), 0.23, TAU - 0.23, false);
      shape.lineTo(0, 0);
      const geo = new THREE.ShapeGeometry(shape, 12);
      geo.rotateX(-Math.PI / 2);
      const pad = new THREE.Mesh(geo, padMat);
      pad.position.copy(p);
      pad.rotation.y = random() * TAU;
      pad.scale.setScalar(1);
      pad.receiveShadow = false;
      worldContent.add(pad);

      if (i < 2) {
        const bloom = new THREE.Group();
        const petalGeo = new THREE.SphereGeometry(1, 6, 4);
        for (let k = 0; k < 6; k += 1) {
          const petal = new THREE.Mesh(petalGeo, lotusMat);
          const a = (k / 6) * TAU;
          petal.position.set(Math.cos(a) * 0.035, 0.015, Math.sin(a) * 0.035);
          petal.scale.set(0.026, 0.013, 0.044);
          petal.rotation.y = -a;
          petal.rotation.x = -0.38;
          bloom.add(petal);
        }
        const heart = new THREE.Mesh(
          new THREE.SphereGeometry(0.018, 6, 4),
          new THREE.MeshStandardMaterial({ color: 0xf0d896, roughness: 0.7 })
        );
        heart.position.y = 0.025;
        bloom.add(heart);
        bloom.position.copy(p);
        bloom.position.y += 0.018;
        bloom.rotation.y = random() * TAU;
        worldContent.add(bloom);
      }
    }

    // Reeds: slim vertical stems around the lake edge.
    const reedCount = QUALITY.mobile ? 38 : 64;
    const reedGeo = new THREE.CylinderGeometry(0.004, 0.007, 1, 4);
    const reedMat = new THREE.MeshStandardMaterial({ color: 0x6e8151, roughness: 0.9 });
    const reeds = new THREE.InstancedMesh(reedGeo, reedMat, reedCount);
    reeds.frustumCulled = false;
    reeds.castShadow = false;
    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const pos = new V3();
    const scl = new V3();
    for (let i = 0; i < reedCount; i += 1) {
      const theta = random() * TAU;
      const shape = lakeShape(theta);
      const edgeX = LAKE.radius * 1.08 * shape;
      const edgeZ = LAKE.radius * 0.9 * shape;
      const s = randomRange(1.01, 1.1);
      const x = LAKE.x + Math.cos(theta) * edgeX * s + randomRange(-0.06, 0.06);
      const z = LAKE.z + Math.sin(theta) * edgeZ * s + randomRange(-0.06, 0.06);
      const ground = Math.max(terrainHeight(x, z), LAKE.level - 0.02);
      const h = randomRange(0.13, 0.35);
      pos.set(x, ground + h * 0.5, z);
      scl.set(1, h, 1);
      quat.setFromEuler(new THREE.Euler(randomRange(-0.12, 0.12), random() * TAU, randomRange(-0.15, 0.15)));
      matrix.compose(pos, quat, scl);
      reeds.setMatrixAt(i, matrix);
    }
    reeds.instanceMatrix.needsUpdate = true;
    worldContent.add(reeds);
  }

  /* ------------------------------------------------------------------ *
   *  10 · Clouds, low mist and weather
   * ------------------------------------------------------------------ */
  const cloudData = [];
  const cloudSprites = [];

  function buildClouds() {
    const textures = [
      createCloudTexture(11),
      createCloudTexture(29),
      createCloudTexture(47),
    ];

    const defs = [
      { x: 0.82, y: 3.55, z: -0.62, scale: 1.02, drift: 0.26, speed: 0.035, phase: 1.2 },
      { x: -2.84, y: 2.97, z: -0.06, scale: 0.62, drift: 0.18, speed: 0.026, phase: 3.1 },
      { x: 2.56, y: 3.0, z: 1.18, scale: 0.7, drift: 0.21, speed: 0.043, phase: 4.4 },
      { x: -0.2, y: 4.16, z: 1.12, scale: 0.44, drift: 0.15, speed: 0.03, phase: 0.4 },
      { x: 1.35, y: 3.12, z: -2.52, scale: 0.36, drift: 0.12, speed: 0.038, phase: 2.5 },
    ];

    defs.forEach((def, cloudIndex) => {
      const group = new THREE.Group();
      group.name = 'floating-cloud';
      group.position.set(def.x, def.y, def.z);
      const spriteCount = 1;

      for (let i = 0; i < spriteCount; i += 1) {
        const core = i === 0;
        const texture = textures[(cloudIndex + i) % textures.length];
        const material = new THREE.SpriteMaterial({
          map: texture,
          color: 0xf4f8fb,
          transparent: true,
          opacity: core ? 0.88 : randomRange(0.3, 0.48),
          depthWrite: false,
          depthTest: true,
          blending: THREE.NormalBlending,
          rotation: randomRange(-0.06, 0.06),
        });
        const sprite = new THREE.Sprite(material);
        if (core) {
          sprite.position.set(randomRange(-0.04, 0.04) * def.scale, 0.14 * def.scale, 0);
          sprite.scale.set(def.scale * 2.15, def.scale * 1.08, 1);
        } else {
          const angle = random() * TAU;
          const radial = randomRange(0.3, 0.56) * def.scale;
          sprite.position.set(
            Math.cos(angle) * radial,
            randomRange(0.11, 0.32) * def.scale,
            randomRange(-0.2, 0.2) * def.scale
          );
          const sx = def.scale * randomRange(0.48, 0.9);
          sprite.scale.set(sx, sx * randomRange(0.38, 0.55), 1);
        }
        sprite.renderOrder = 2;
        sprite.userData = {
          baseOpacity: material.opacity,
          baseRotation: material.rotation,
          phase: random() * TAU,
          baseY: sprite.position.y,
          breathe: randomRange(0.01, 0.03),
        };
        group.add(sprite);
        cloudSprites.push(sprite);
      }

      worldContent.add(group);
      cloudData.push({
        group,
        originX: def.x,
        originY: def.y,
        drift: def.drift,
        speed: def.speed,
        phase: def.phase,
      });
    });
  }

  const mistSprites = [];

  function addMistSprite(x, y, z, scaleX, scaleY, opacity, speed, phase) {
    const softOpacity = opacity * 2.15;
    const material = new THREE.SpriteMaterial({
      map: shared.mistTexture,
      color: 0xe2f0f8,
      transparent: true,
      opacity: softOpacity,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(x, y, z);
    sprite.scale.set(scaleX * 1.08, scaleY * 1.08, 1);
    sprite.renderOrder = 3;
    sprite.userData = {
      baseX: x,
      baseY: y,
      baseZ: z,
      baseOpacity: softOpacity,
      baseScaleX: scaleX * 1.08,
      baseScaleY: scaleY * 1.08,
      speed,
      phase,
    };
    mistSprites.push(sprite);
    worldContent.add(sprite);
  }

  function buildMist() {
    for (let i = 0; i < (QUALITY.mobile ? 5 : 8); i += 1) {
      const theta = random() * TAU;
      const r = randomRange(0.2, 0.95);
      addMistSprite(
        LAKE.x + Math.cos(theta) * LAKE.radius * r,
        LAKE.level + randomRange(0.035, 0.13),
        LAKE.z + Math.sin(theta) * LAKE.radius * 0.82 * r,
        randomRange(0.75, 1.8),
        randomRange(0.18, 0.48),
        randomRange(0.055, 0.12),
        randomRange(0.06, 0.13),
        random() * TAU
      );
    }

    for (let i = 0; i < (QUALITY.mobile ? 6 : 9); i += 1) {
      const t = randomRange(0.06, 0.9);
      const p = riverCurve.getPoint(t);
      addMistSprite(
        p.x + randomRange(-0.45, 0.45),
        riverSurfaceY(t) + randomRange(0.06, 0.24),
        p.z + randomRange(-0.35, 0.35),
        randomRange(0.55, 1.35),
        randomRange(0.12, 0.3),
        randomRange(0.035, 0.08),
        randomRange(0.05, 0.12),
        random() * TAU
      );
    }

    for (let i = 0; i < (QUALITY.mobile ? 5 : 7); i += 1) {
      const a = random() * TAU;
      const r = randomRange(1.2, 3.2);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = terrainHeight(x, z) + randomRange(0.08, 0.34);
      addMistSprite(
        x,
        y,
        z,
        randomRange(0.8, 2.0),
        randomRange(0.16, 0.38),
        randomRange(0.03, 0.075),
        randomRange(0.04, 0.1),
        random() * TAU
      );
    }

    for (let i = 0; i < (QUALITY.mobile ? 3 : 5); i += 1) {
      const theta = randomRange(-0.4, 2.2);
      addMistSprite(
        -1.35 + Math.cos(theta) * randomRange(1.6, 2.9),
        -0.48 + randomRange(-0.05, 0.3),
        -1.6 + Math.sin(theta) * randomRange(1.5, 2.5),
        randomRange(1.5, 3.1),
        randomRange(0.24, 0.55),
        randomRange(0.05, 0.095),
        randomRange(0.04, 0.09),
        random() * TAU
      );
    }

    for (let i = 0; i < 3; i += 1) {
      addMistSprite(
        randomRange(-3.1, 3.1),
        randomRange(2.2, 3.6),
        randomRange(-3.1, 3.1),
        randomRange(0.9, 1.8),
        randomRange(0.12, 0.24),
        randomRange(0.018, 0.04),
        randomRange(0.02, 0.05),
        random() * TAU
      );
    }

    // Long, low veils drifting through the clearing.
    addMistSprite(-0.2, -0.64, 1.6, 2.9, 0.38, 0.066, 0.034, 1.2);
    addMistSprite(1.1, -0.52, 0.15, 2.5, 0.32, 0.055, 0.028, 3.6);
    addMistSprite(0.35, -0.7, 2.9, 2.2, 0.32, 0.052, 0.023, 5.1);
    addMistSprite(-1.85, -0.62, 0.65, 1.8, 0.3, 0.05, 0.026, 2.4);
  }

  /* ------------------------------------------------------------------ *
   *  11 · Tiny inhabitants
   * ------------------------------------------------------------------ */
  const creatureAnimations = [];
  const creatureMaterials = {};

  function buildCreatureMaterials() {
    creatureMaterials.deerBody = new THREE.MeshStandardMaterial({ color: 0x70492f, roughness: 0.88, metalness: 0, envMapIntensity: 0.2 });
    creatureMaterials.deerLight = new THREE.MeshStandardMaterial({ color: 0x967050, roughness: 0.9, metalness: 0 });
    creatureMaterials.deerDark = new THREE.MeshStandardMaterial({ color: 0x3d2a20, roughness: 0.92, metalness: 0 });
    creatureMaterials.cream = new THREE.MeshStandardMaterial({ color: 0xe8dcc4, roughness: 0.86, metalness: 0 });
    creatureMaterials.antler = new THREE.MeshStandardMaterial({ color: 0xd0b88e, roughness: 0.8, metalness: 0 });
    creatureMaterials.wool = new THREE.MeshStandardMaterial({ color: 0xe7e1d4, roughness: 1, metalness: 0, envMapIntensity: 0.2 });
    creatureMaterials.sheepFace = new THREE.MeshStandardMaterial({ color: 0x31302b, roughness: 0.9, metalness: 0 });
    creatureMaterials.rabbit = new THREE.MeshStandardMaterial({ color: 0xcbbdab, roughness: 0.92, metalness: 0 });
    creatureMaterials.rabbitLight = new THREE.MeshStandardMaterial({ color: 0xe5d8c7, roughness: 0.9, metalness: 0 });
    creatureMaterials.bird = new THREE.MeshStandardMaterial({ color: 0x343a3a, roughness: 0.8, metalness: 0, side: THREE.DoubleSide });
    creatureMaterials.birdLight = new THREE.MeshStandardMaterial({ color: 0x5b605b, roughness: 0.8, metalness: 0 });
    creatureMaterials.birdPale = new THREE.MeshStandardMaterial({ color: 0xd8d3c3, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
    creatureMaterials.birdPaleDark = new THREE.MeshStandardMaterial({ color: 0x8a8e87, roughness: 0.8, metalness: 0, side: THREE.DoubleSide });
    creatureMaterials.beak = new THREE.MeshStandardMaterial({ color: 0xc4884f, roughness: 0.7, metalness: 0 });
  }

  function orientTo(group, x, z, targetX, targetZ) {
    const dx = targetX - x;
    const dz = targetZ - z;
    group.rotation.y = Math.atan2(-dz, dx);
  }

  const creatureShadowMaterial = new THREE.MeshBasicMaterial({
    color: 0x10130e,
    map: shared.glowTexture,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  function addContactShadow(group, radiusX, radiusZ) {
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(radiusX * 2, radiusZ * 2), creatureShadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.012;
    shadow.renderOrder = 1;
    group.add(shadow);
  }

  function makeDeer(options = {}) {
    const scale = options.scale ?? 0.56;
    const antlers = Boolean(options.antlers);
    const fawn = Boolean(options.fawn);
    const bodyMat = fawn ? creatureMaterials.deerLight : creatureMaterials.deerBody;
    const group = new THREE.Group();
    group.name = fawn ? 'fawn' : 'deer';

    const bodyGeo = new THREE.SphereGeometry(1, 14, 10);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(0, 0.38, 0);
    body.scale.set(0.265, 0.16, 0.145);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const chest = new THREE.Mesh(bodyGeo, bodyMat);
    chest.position.set(0.12, 0.4, 0);
    chest.scale.set(0.15, 0.17, 0.145);
    chest.castShadow = true;
    chest.receiveShadow = true;
    group.add(chest);

    const rump = new THREE.Mesh(bodyGeo, bodyMat);
    rump.position.set(-0.15, 0.39, 0);
    rump.scale.set(0.16, 0.155, 0.14);
    rump.castShadow = true;
    rump.receiveShadow = true;
    group.add(rump);

    const legGeo = new THREE.CylinderGeometry(0.018, 0.027, 0.31, 5);
    const hoofGeo = new THREE.SphereGeometry(0.027, 5, 4);
    const legPositions = [
      [0.16, 0.17, 0.075],
      [0.16, 0.17, -0.075],
      [-0.16, 0.17, 0.07],
      [-0.16, 0.17, -0.07],
    ];
    legPositions.forEach(([x, y, z], i) => {
      const leg = new THREE.Mesh(legGeo, bodyMat);
      leg.position.set(x, y, z);
      leg.rotation.z = i < 2 ? -0.08 : 0.08;
      leg.castShadow = true;
      group.add(leg);
      const hoof = new THREE.Mesh(hoofGeo, creatureMaterials.deerDark);
      hoof.position.set(x + (i < 2 ? -0.012 : 0.012), 0.016, z);
      hoof.scale.set(0.8, 0.75, 1.1);
      group.add(hoof);
    });

    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.055, 7, 5), creatureMaterials.cream);
    tail.position.set(-0.28, 0.42, 0);
    tail.scale.set(0.7, 1.0, 0.7);
    tail.rotation.z = 0.25;
    group.add(tail);

    if (fawn) {
      const spotGeo = new THREE.SphereGeometry(0.017, 5, 4);
      for (let i = 0; i < 10; i += 1) {
        const spot = new THREE.Mesh(spotGeo, creatureMaterials.cream);
        spot.position.set(randomRange(-0.2, 0.2), 0.49 + randomRange(-0.02, 0.04), randomRange(-0.13, 0.13));
        spot.scale.set(1, 0.7, 1);
        group.add(spot);
      }
    }

    const headGroup = new THREE.Group();
    headGroup.position.set(0.16, 0.47, 0);
    group.add(headGroup);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.062, 0.33, 6), bodyMat);
    neck.position.set(0.075, 0.12, 0);
    neck.rotation.z = -0.54;
    neck.castShadow = true;
    headGroup.add(neck);

    const head = new THREE.Mesh(bodyGeo, bodyMat);
    head.position.set(0.17, 0.28, 0);
    head.scale.set(0.125, 0.095, 0.085);
    head.castShadow = true;
    headGroup.add(head);

    const muzzle = new THREE.Mesh(bodyGeo, creatureMaterials.deerLight);
    muzzle.position.set(0.275, 0.255, 0);
    muzzle.scale.set(0.09, 0.055, 0.055);
    muzzle.castShadow = true;
    headGroup.add(muzzle);

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 4), creatureMaterials.deerDark);
    nose.position.set(0.355, 0.252, 0);
    nose.scale.set(1, 0.8, 1);
    headGroup.add(nose);

    const eyeGeo = new THREE.SphereGeometry(0.017, 6, 4);
    for (const z of [-0.06, 0.06]) {
      const eye = new THREE.Mesh(eyeGeo, creatureMaterials.deerDark);
      eye.position.set(0.245, 0.303, z);
      headGroup.add(eye);
    }

    const earGeo = new THREE.ConeGeometry(0.038, 0.12, 6);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(earGeo, creatureMaterials.deerLight);
      ear.position.set(0.11, 0.375, side * 0.075);
      ear.rotation.set(side * 0.5, 0, -0.2);
      ear.castShadow = true;
      headGroup.add(ear);
    }

    if (antlers) {
      const antlerMaterial = creatureMaterials.antler;
      for (const side of [-1, 1]) {
        const base = new V3(0.13, 0.37, side * 0.052);
        const mid = new V3(0.22, 0.53, side * 0.105);
        const top = new V3(0.18, 0.7, side * 0.085);
        headGroup.add(makeBeamBetween(base, mid, 0.009, antlerMaterial, 4));
        headGroup.add(makeBeamBetween(mid, top, 0.007, antlerMaterial, 4));
        headGroup.add(makeBeamBetween(mid, new V3(0.32, 0.6, side * 0.14), 0.005, antlerMaterial, 4));
        headGroup.add(makeBeamBetween(new V3(0.19, 0.49, side * 0.08), new V3(0.28, 0.5, side * 0.14), 0.005, antlerMaterial, 4));
      }
    }

    group.scale.setScalar(scale);
    return { group, headGroup, tail, scale, phase: random() * TAU };
  }

  function makeSheep(scale = 0.68) {
    const group = new THREE.Group();
    group.name = 'sheep';
    const woolGeo = new THREE.SphereGeometry(1, 9, 7);
    const body = new THREE.Mesh(woolGeo, creatureMaterials.wool);
    body.position.set(0, 0.24, 0);
    body.scale.set(0.2, 0.16, 0.15);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    for (let i = 0; i < 6; i += 1) {
      const puff = new THREE.Mesh(woolGeo, creatureMaterials.wool);
      const a = (i / 6) * TAU;
      puff.position.set(Math.cos(a) * 0.11, 0.3 + Math.sin(a * 2) * 0.025, Math.sin(a) * 0.1);
      puff.scale.setScalar(randomRange(0.08, 0.12));
      puff.castShadow = true;
      group.add(puff);
    }

    const headGroup = new THREE.Group();
    headGroup.position.set(0.19, 0.27, 0);
    group.add(headGroup);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), creatureMaterials.sheepFace);
    head.scale.set(0.95, 1.1, 0.8);
    head.position.set(0.045, 0.03, 0);
    head.castShadow = true;
    headGroup.add(head);
    const earGeo = new THREE.SphereGeometry(0.035, 5, 4);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(earGeo, creatureMaterials.sheepFace);
      ear.position.set(0.02, 0.05, side * 0.075);
      ear.scale.set(1.4, 0.55, 0.7);
      ear.rotation.z = side * 0.2;
      headGroup.add(ear);
    }
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 5, 4), creatureMaterials.cream);
      eye.position.set(0.09, 0.055, side * 0.045);
      headGroup.add(eye);
    }

    const legGeo = new THREE.CylinderGeometry(0.015, 0.018, 0.18, 5);
    for (const [x, z] of [[0.1, 0.06], [0.1, -0.06], [-0.1, 0.06], [-0.1, -0.06]]) {
      const leg = new THREE.Mesh(legGeo, creatureMaterials.sheepFace);
      leg.position.set(x, 0.09, z);
      leg.castShadow = true;
      group.add(leg);
    }

    group.scale.setScalar(scale);
    return { group, headGroup, phase: random() * TAU };
  }

  function makeRabbit(scale = 0.52) {
    const group = new THREE.Group();
    group.name = 'rabbit';
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 7), creatureMaterials.rabbit);
    body.position.set(0, 0.15, 0);
    body.scale.set(0.17, 0.13, 0.12);
    body.castShadow = true;
    group.add(body);

    const headGroup = new THREE.Group();
    headGroup.position.set(0.12, 0.22, 0);
    group.add(headGroup);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 9, 7), creatureMaterials.rabbitLight);
    head.scale.set(0.9, 1, 0.85);
    head.position.set(0.03, 0.02, 0);
    head.castShadow = true;
    headGroup.add(head);

    const earGeo = new THREE.SphereGeometry(1, 7, 5);
    const ears = [];
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(earGeo, creatureMaterials.rabbitLight);
      ear.position.set(0.015, 0.16, side * 0.038);
      ear.scale.set(0.026, 0.115, 0.036);
      ear.rotation.z = side * -0.16;
      ear.rotation.x = side * 0.10;
      ear.castShadow = true;
      headGroup.add(ear);
      ears.push(ear);
    }
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 5, 4), creatureMaterials.sheepFace);
      eye.position.set(0.095, 0.035, side * 0.052);
      headGroup.add(eye);
    }
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4), creatureMaterials.cream);
    tail.position.set(-0.16, 0.18, 0);
    tail.scale.set(0.8, 0.8, 0.7);
    group.add(tail);

    group.scale.setScalar(scale);
    return { group, headGroup, earL: ears[0], earR: ears[1], scale, phase: random() * TAU };
  }

  function makeBird(scale = 0.52, pale = false) {
    const group = new THREE.Group();
    group.name = 'bird';
    const bodyMat = pale ? creatureMaterials.birdPale : creatureMaterials.bird;
    const wingMat = pale ? creatureMaterials.birdPaleDark : creatureMaterials.bird;
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 7, 5), bodyMat);
    body.scale.set(0.16, 0.055, 0.07);
    body.castShadow = false;
    group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 4), pale ? creatureMaterials.birdPale : creatureMaterials.birdLight);
    head.position.set(0.14, 0.018, 0);
    group.add(head);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.06, 4), creatureMaterials.beak);
    beak.rotation.z = -Math.PI / 2;
    beak.position.set(0.205, 0.012, 0);
    group.add(beak);

    const wingShape = new THREE.BufferGeometry();
    wingShape.setAttribute('position', new THREE.Float32BufferAttribute([
      0.10, 0, 0.01,
      -0.095, 0, 0.27,
      0.23, 0, 0.2,
    ], 3));
    wingShape.computeVertexNormals();
    const wingL = new THREE.Group();
    const left = new THREE.Mesh(wingShape, wingMat);
    wingL.add(left);
    wingL.position.set(0, 0.02, 0.03);
    group.add(wingL);

    const wingR = new THREE.Group();
    const right = new THREE.Mesh(wingShape, wingMat);
    right.scale.z = -1;
    wingR.add(right);
    wingR.position.set(0, 0.02, -0.03);
    group.add(wingR);

    group.scale.setScalar(scale);
    return { group, wingL, wingR, phase: random() * TAU };
  }

  function makeButterfly(wingColor, accentColor, scale = 0.55) {
    const group = new THREE.Group();
    group.name = 'butterfly';

    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(0.06, 0.025, 0.25, 0.08, 0.29, 0.22);
    shape.bezierCurveTo(0.25, 0.3, 0.12, 0.29, 0.03, 0.2);
    shape.bezierCurveTo(0.02, 0.12, 0.01, 0.06, 0, 0);

    const wingGeo = new THREE.ShapeGeometry(shape, 8);
    wingGeo.rotateX(-Math.PI / 2);
    const wingMat = new THREE.MeshStandardMaterial({
      color: wingColor,
      roughness: 0.66,
      metalness: 0,
      side: THREE.DoubleSide,
      emissive: new THREE.Color(accentColor),
      emissiveIntensity: 0.14,
    });
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x3d3025,
      roughness: 0.8,
      metalness: 0,
    });

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), bodyMat);
    body.scale.set(1.6, 0.43, 0.34);
    body.position.y = 0.02;
    group.add(body);

    const wingL = new THREE.Group();
    const left = new THREE.Mesh(wingGeo, wingMat);
    wingL.add(left);
    wingL.position.set(0.01, 0.028, -0.01);
    wingL.rotation.x = 0.18;
    group.add(wingL);

    const wingR = new THREE.Group();
    const right = new THREE.Mesh(wingGeo, wingMat);
    right.scale.z = -1;
    wingR.add(right);
    wingR.position.set(0.01, 0.028, 0.01);
    wingR.rotation.x = -0.18;
    group.add(wingR);

    group.scale.setScalar(scale);
    return { group, wingL, wingR, phase: random() * TAU };
  }

  function buildAnimals(bridgeLantern) {
    const softenCreatureShadows = (group) => {
      group.traverse((object) => {
        if (object.isMesh) object.castShadow = false;
      });
    };

    const deer = makeDeer({ scale: 0.82, antlers: true });
    deer.group.position.set(2.55, terrainHeight(2.55, 2.42), 2.42);
    orientTo(deer.group, 2.55, 2.42, LAKE.x, LAKE.z);
    addContactShadow(deer.group, 0.34, 0.22);
    softenCreatureShadows(deer.group);
    worldContent.add(deer.group);
    creatureAnimations.push({
      kind: 'deer',
      headGroup: deer.headGroup,
      tail: deer.tail,
      baseTilt: deer.headGroup.rotation.z,
      phase: deer.phase,
      speed: 0.31,
    });

    const doe = makeDeer({ scale: 0.74, antlers: false });
    doe.group.position.set(2.16, terrainHeight(2.16, 2.79), 2.79);
    orientTo(doe.group, 2.16, 2.79, 1.7, 2.2);
    addContactShadow(doe.group, 0.31, 0.2);
    softenCreatureShadows(doe.group);
    worldContent.add(doe.group);
    creatureAnimations.push({
      kind: 'deer',
      headGroup: doe.headGroup,
      tail: doe.tail,
      baseTilt: doe.headGroup.rotation.z,
      phase: doe.phase + 1.7,
      speed: 0.26,
    });

    const fawn = makeDeer({ scale: 0.55, antlers: false, fawn: true });
    fawn.group.position.set(2.83, terrainHeight(2.83, 2.25), 2.25);
    orientTo(fawn.group, 2.83, 2.25, 2.35, 1.98);
    fawn.group.rotation.y += 0.35;
    addContactShadow(fawn.group, 0.22, 0.14);
    softenCreatureShadows(fawn.group);
    worldContent.add(fawn.group);
    creatureAnimations.push({
      kind: 'deer',
      headGroup: fawn.headGroup,
      tail: fawn.tail,
      baseTilt: fawn.headGroup.rotation.z,
      phase: fawn.phase + 3.1,
      speed: 0.24,
    });

    const sheepPlaces = [
      [-0.55, 2.03, -2.35],
      [-0.28, 2.28, 1.6],
      [-0.82, 2.26, -0.7],
    ];
    sheepPlaces.forEach(([x, z, rot], i) => {
      const sheep = makeSheep(0.86 + i * 0.03);
      sheep.group.position.set(x, terrainHeight(x, z), z);
      sheep.group.rotation.y = rot;
      addContactShadow(sheep.group, 0.22, 0.15);
      softenCreatureShadows(sheep.group);
      worldContent.add(sheep.group);
      creatureAnimations.push({
        kind: 'sheep',
        headGroup: sheep.headGroup,
        phase: sheep.phase + i,
        speed: 0.22 + i * 0.02,
      });
    });

    const rabbitPlaces = [
      [-2.16, 1.16, 2.1],
      [-1.96, 1.33, 0.4],
    ];
    rabbitPlaces.forEach(([x, z, rot], i) => {
      const rabbit = makeRabbit(0.74 - i * 0.05);
      rabbit.group.position.set(x, terrainHeight(x, z), z);
      rabbit.group.rotation.y = rot;
      addContactShadow(rabbit.group, 0.14, 0.1);
      softenCreatureShadows(rabbit.group);
      worldContent.add(rabbit.group);
      creatureAnimations.push({
        kind: 'rabbit',
        headGroup: rabbit.headGroup,
        earL: rabbit.earL,
        earR: rabbit.earR,
        phase: rabbit.phase,
        speed: 0.5,
      });
    });

    const flightPaths = [
      { cx: 1.1, cz: 1.05, rx: 0.72, rz: 0.55, y: 0.72, speed: 0.15, phase: 0.0, scale: 0.55, pale: true },
      { cx: 0.1, cz: 1.55, rx: 1.45, rz: 0.95, y: 1.08, speed: 0.11, phase: 1.9, scale: 0.47, pale: false },
      { cx: -0.55, cz: 0.25, rx: 2.05, rz: 1.55, y: 1.62, speed: 0.09, phase: 3.7, scale: 0.4, pale: true },
      { cx: 2.25, cz: 0.95, rx: 0.85, rz: 0.68, y: 0.95, speed: 0.17, phase: 5.2, scale: 0.38, pale: false },
    ];
    flightPaths.forEach((path) => {
      const bird = makeBird(path.scale, path.pale);
      worldContent.add(bird.group);
      creatureAnimations.push({
        kind: 'bird',
        bird,
        path,
        phase: path.phase,
        speed: path.speed,
      });
    });

    const butterflyPaths = [
      { cx: 1.6, cz: 2.62, rx: 0.42, rz: 0.26, baseY: 0.74, speed: 0.62, phase: 0.4, scale: 0.58, wing: 0xe8b968, accent: 0xb96d38 },
      { cx: 0.28, cz: 2.38, rx: 0.5, rz: 0.3, baseY: 0.62, speed: 0.5, phase: 2.4, scale: 0.5, wing: 0x9fd3e4, accent: 0x5f93ad },
      { cx: -1.16, cz: 2.15, rx: 0.38, rz: 0.25, baseY: 0.58, speed: 0.7, phase: 4.1, scale: 0.52, wing: 0xefc2b4, accent: 0xc18375 },
      { cx: 2.2, cz: 1.38, rx: 0.34, rz: 0.24, baseY: 0.78, speed: 0.56, phase: 5.4, scale: 0.46, wing: 0xe6dca0, accent: 0xa99b56 },
    ];
    butterflyPaths.forEach((path) => {
      const butterfly = makeButterfly(path.wing, path.accent, path.scale);
      const ground = terrainHeight(path.cx, path.cz);
      butterfly.baseY = ground + path.baseY;
      butterfly.path = path;
      worldContent.add(butterfly.group);
      creatureAnimations.push({
        kind: 'butterfly',
        butterfly,
        path,
        phase: path.phase,
      });
    });
  }

  /* ------------------------------------------------------------------ *
   *  12 · The glass display cube
   * ------------------------------------------------------------------ */
  const glass = {
    group: null,
    paneMaterial: null,
    railMaterial: null,
    lineMaterials: [],
    cornerGlows: [],
    travellingGlints: [],
  };

  function buildGlassCube() {
    const group = new THREE.Group();
    group.name = 'glass-cube';
    group.position.y = CUBE.centerY;
    glass.group = group;

    const H = CUBE.half;
    const S = CUBE.size;

    const paneMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0.86 },
        uCool: { value: new THREE.Color(0x91c6e5) },
        uWarm: { value: new THREE.Color(0xffe1b8) },
        uEnvMap: { value: null },
        uEnvTint: { value: new THREE.Color(0xb8d7e8) },
        uEnvStrength: { value: 0.82 },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        varying vec3 vNormalView;
        varying vec2 vUv;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorldPosition = world.xyz;
          vNormalView = normalize(mat3(modelMatrix) * normal);
          vUv = uv;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uOpacity;
        uniform vec3 uCool;
        uniform vec3 uWarm;
        uniform samplerCube uEnvMap;
        uniform vec3 uEnvTint;
        uniform float uEnvStrength;
        varying vec3 vWorldPosition;
        varying vec3 vNormalView;
        varying vec2 vUv;

        float hash(vec2 p) {
          p = fract(p * vec2(234.34, 435.345));
          p += dot(p, p + 34.23);
          return fract(p.x * p.y);
        }

        void main() {
          vec3 N = normalize(vNormalView);
          vec3 V = normalize(cameraPosition - vWorldPosition);
          float fres = pow(1.0 - abs(dot(N, V)), 3.1);
          float diagonalA = sin((vUv.x * 1.1 + vUv.y * 0.7) * 7.0 + 1.9 + uTime * 0.025) * 0.5 + 0.5;
          float diagonalB = sin((vUv.x * -0.4 + vUv.y) * 12.0 - 4.0) * 0.5 + 0.5;
          float streaks = smoothstep(0.86, 0.995, diagonalA) * 0.75 + smoothstep(0.94, 1.0, diagonalB) * 0.35;
          float edge = smoothstep(0.0, 0.16, min(vUv.x, min(1.0 - vUv.x, min(vUv.y, 1.0 - vUv.y))));
          edge = 1.0 - edge;
          float dust = hash(vUv * 430.0 + uTime * 0.01) * 0.0035;
          vec3 tint = mix(uCool, uWarm, smoothstep(-0.2, 0.82, vWorldPosition.y - 0.8) * 0.46);

          vec3 R = reflect(-V, N);
          vec3 envRaw = textureCube(uEnvMap, R).rgb;
          float dispersion = smoothstep(0.18, 0.78, fres) * 0.2;
          vec3 envR = textureCube(uEnvMap, normalize(R + vec3(0.022, 0.004, 0.0))).rgb;
          vec3 envB = textureCube(uEnvMap, normalize(R - vec3(0.022, 0.0, 0.004))).rgb;
          envRaw.r = mix(envRaw.r, envR.r, dispersion);
          envRaw.b = mix(envRaw.b, envB.b, dispersion);
          float envLum = dot(envRaw, vec3(0.24, 0.52, 0.24));
          vec3 env = mix(envRaw, vec3(envLum), 0.2) * uEnvTint * uEnvStrength;
          float envAlpha = smoothstep(0.1, 0.9, envLum) * 0.06;
          float alpha = uOpacity * (0.008 + fres * 0.145 + streaks * 0.026 + edge * 0.028 + dust + envAlpha);
          vec3 col = tint * (0.48 + fres * 0.82 + streaks * 0.3) + env * (0.3 + fres * 1.0);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });
    glass.paneMaterial = paneMaterial;

    const paneGeometry = new THREE.PlaneGeometry(S, S);
    const faces = [
      { p: [0, 0, H], r: [0, 0, 0] },
      { p: [0, 0, -H], r: [0, Math.PI, 0] },
      { p: [H, 0, 0], r: [0, Math.PI / 2, 0] },
      { p: [-H, 0, 0], r: [0, -Math.PI / 2, 0] },
      { p: [0, H, 0], r: [-Math.PI / 2, 0, 0] },
      { p: [0, -H, 0], r: [Math.PI / 2, 0, 0] },
    ];
    faces.forEach((face) => {
      const pane = new THREE.Mesh(paneGeometry, paneMaterial);
      pane.position.set(face.p[0], face.p[1], face.p[2]);
      pane.rotation.set(face.r[0], face.r[1], face.r[2]);
      pane.renderOrder = 11;
      pane.name = 'glass-pane';
      group.add(pane);
    });

    const railMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xa9d2e8,
      roughness: 0.09,
      metalness: 0.22,
      transparent: true,
      opacity: 0.56,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      emissive: new THREE.Color(0x1e4d65),
      emissiveIntensity: 0.18,
      envMapIntensity: 2.1,
      depthWrite: false,
    });
    glass.railMaterial = railMaterial;

    const railGeometry = new THREE.CylinderGeometry(0.027, 0.027, S, 8, 1, false);
    const railSegments = [
      { p: [-H, 0, -H], r: [0, 0, 0] },
      { p: [H, 0, -H], r: [0, 0, 0] },
      { p: [-H, 0, H], r: [0, 0, 0] },
      { p: [H, 0, H], r: [0, 0, 0] },
      { p: [0, -H, -H], r: [0, 0, Math.PI / 2] },
      { p: [0, H, -H], r: [0, 0, Math.PI / 2] },
      { p: [0, -H, H], r: [0, 0, Math.PI / 2] },
      { p: [0, H, H], r: [0, 0, Math.PI / 2] },
      { p: [-H, -H, 0], r: [Math.PI / 2, 0, 0] },
      { p: [-H, H, 0], r: [Math.PI / 2, 0, 0] },
      { p: [H, -H, 0], r: [Math.PI / 2, 0, 0] },
      { p: [H, H, 0], r: [Math.PI / 2, 0, 0] },
    ];
    const railInstances = new THREE.InstancedMesh(railGeometry, railMaterial, railSegments.length);
    const railQuat = new THREE.Quaternion();
    const railPos = new V3();
    const railScl = new V3(1, 1, 1);
    const railMatrix = new THREE.Matrix4();
    railSegments.forEach((seg, index) => {
      railPos.set(seg.p[0], seg.p[1], seg.p[2]);
      railQuat.setFromEuler(new THREE.Euler(seg.r[0], seg.r[1], seg.r[2]));
      railMatrix.compose(railPos, railQuat, railScl);
      railInstances.setMatrixAt(index, railMatrix);
    });
    railInstances.instanceMatrix.needsUpdate = true;
    railInstances.renderOrder = 10;
    railInstances.frustumCulled = false;
    railInstances.castShadow = false;
    railInstances.receiveShadow = false;
    railInstances.name = 'glass-rails';
    group.add(railInstances);

    // Corner beads catch the light like polished cut glass.
    const nodeGeometry = new THREE.IcosahedronGeometry(0.065, 1);
    const nodeInstances = new THREE.InstancedMesh(nodeGeometry, railMaterial, 8);
    let nodeIndex = 0;
    const nodeMatrix = new THREE.Matrix4();
    const nodePos = new V3();
    const nodeQuat = new THREE.Quaternion();
    const nodeScl = new V3(1, 1, 1);
    for (const x of [-H, H]) {
      for (const y of [-H, H]) {
        for (const z of [-H, H]) {
          nodePos.set(x, y, z);
          nodeMatrix.compose(nodePos, nodeQuat, nodeScl);
          nodeInstances.setMatrixAt(nodeIndex, nodeMatrix);
          nodeIndex += 1;
        }
      }
    }
    nodeInstances.instanceMatrix.needsUpdate = true;
    nodeInstances.renderOrder = 10;
    nodeInstances.frustumCulled = false;
    nodeInstances.name = 'glass-corner-beads';
    group.add(nodeInstances);

    const boxEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(S, S, S));
    const lineSpecs = [
      { color: 0xc8efff, opacity: 0.34, scale: 1.0 },
      { color: 0xffe2bd, opacity: 0.09, scale: 1.004 },
      { color: 0xb8d6ff, opacity: 0.065, scale: 1.009 },
    ];
    lineSpecs.forEach((spec) => {
      const material = new THREE.LineBasicMaterial({
        color: spec.color,
        transparent: true,
        opacity: spec.opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const lines = new THREE.LineSegments(boxEdges, material);
      lines.scale.setScalar(spec.scale);
      lines.renderOrder = 12;
      group.add(lines);
      glass.lineMaterials.push({ material, baseOpacity: spec.opacity });
    });

    for (const x of [-H, H]) {
      for (const y of [-H, H]) {
        for (const z of [-H, H]) {
          const material = new THREE.SpriteMaterial({
            map: shared.glowTexture,
            color: 0xc6eeff,
            transparent: true,
            opacity: 0.28,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: true,
          });
          const sprite = new THREE.Sprite(material);
          sprite.position.set(x, y, z);
          sprite.scale.setScalar(0.3);
          sprite.userData.phase = random() * TAU;
          group.add(sprite);
          glass.cornerGlows.push(sprite);
        }
      }
    }

    const glintEdges = [
      [-H, -H],
      [H, -H],
      [-H, H],
      [H, H],
    ];
    glintEdges.forEach(([x, z], i) => {
      const material = new THREE.SpriteMaterial({
        map: shared.glowTexture,
        color: 0xe8f8ff,
        transparent: true,
        opacity: 0.25,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true,
      });
      const sprite = new THREE.Sprite(material);
      sprite.scale.setScalar(0.23);
      sprite.userData = {
        x,
        z,
        phase: i * 1.9 + random() * 0.7,
        speed: 0.11 + random() * 0.04,
      };
      group.add(sprite);
      glass.travellingGlints.push(sprite);
    });

    // A faint chromatic flank makes the edge feel like real refracting glass.
    const chromaticGeo = new THREE.BufferGeometry().setFromPoints([
      new V3(-H, -H, H),
      new V3(H, -H, H),
      new V3(H, -H, H),
      new V3(H, H, H),
      new V3(H, H, H),
      new V3(-H, H, H),
      new V3(-H, H, H),
      new V3(-H, -H, H),
      new V3(-H, -H, -H),
      new V3(H, -H, -H),
    ]);
    const chromaticMat = new THREE.LineBasicMaterial({
      color: 0xffb9cf,
      transparent: true,
      opacity: 0.09,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const chromaticLines = new THREE.LineSegments(chromaticGeo, chromaticMat);
    chromaticLines.position.set(0.004, 0.003, 0);
    chromaticLines.renderOrder = 12;
    group.add(chromaticLines);

    worldRoot.add(group);
  }

  /* ------------------------------------------------------------------ *
   *  13 · Cinematic lighting rig
   * ------------------------------------------------------------------ */
  const lighting = {};

  function buildLighting() {
    lighting.ambient = new THREE.AmbientLight(0xffe6cf, 0.22);
    scene.add(lighting.ambient);

    lighting.hemi = new THREE.HemisphereLight(0xb7d9f3, 0x6b543b, 0.7);
    lighting.hemi.position.set(0, 8, 0);
    scene.add(lighting.hemi);

    lighting.key = new THREE.DirectionalLight(0xffd6a0, 3.0);
    lighting.key.position.set(-10.5, 10.5, 7.5);
    lighting.key.target.position.set(0, 0, 0);
    lighting.key.castShadow = true;
    lighting.key.shadow.mapSize.set(QUALITY.shadowSize, QUALITY.shadowSize);
    lighting.key.shadow.camera.left = -8.2;
    lighting.key.shadow.camera.right = 8.2;
    lighting.key.shadow.camera.top = 8.2;
    lighting.key.shadow.camera.bottom = -8.2;
    lighting.key.shadow.camera.near = 1;
    lighting.key.shadow.camera.far = 42;
    lighting.key.shadow.bias = -0.00045;
    lighting.key.shadow.normalBias = 0.025;
    scene.add(lighting.key);
    scene.add(lighting.key.target);

    lighting.fill = new THREE.DirectionalLight(0x93c9e8, 0.55);
    lighting.fill.position.set(10, 5.5, 12);
    lighting.fill.target.position.set(0, 0.2, 0);
    scene.add(lighting.fill);
    scene.add(lighting.fill.target);

    // A low, cool fill from outside the glass reveals the floating cliff.
    lighting.underfill = new THREE.DirectionalLight(0x8fc8da, 1.35);
    lighting.underfill.position.set(4.5, -8, 9);
    lighting.underfill.target.position.set(0, -1.8, 0);
    lighting.underfill.castShadow = false;
    scene.add(lighting.underfill);
    scene.add(lighting.underfill.target);

    lighting.rim = new THREE.DirectionalLight(0xffd1ab, 0.9);
    lighting.rim.position.set(8, 7, -9);
    lighting.rim.target.position.set(0, 0.4, 0);
    scene.add(lighting.rim);
    scene.add(lighting.rim.target);

    lighting.warmBounce = new THREE.PointLight(0xffc68c, 2.4, 5.6, 2);
    lighting.warmBounce.position.set(2.35, -0.35, 3.15);
    scene.add(lighting.warmBounce);

    lighting.coolBounce = new THREE.PointLight(0x6cb9ee, 1.8, 6.0, 2);
    lighting.coolBounce.position.set(-2.8, 1.8, -1.6);
    scene.add(lighting.coolBounce);

    lighting.lake = new THREE.PointLight(0x7bd4d9, 0.6, 2.7, 2);
    lighting.lake.position.set(LAKE.x, LAKE.level + 0.3, LAKE.z);
    scene.add(lighting.lake);

    lighting.waterfall = new THREE.PointLight(0x99e1ea, 0.5, 2.2, 2);
    lighting.waterfall.position.set(-1.3, -0.5, 0.1);
    scene.add(lighting.waterfall);
  }

  /* ------------------------------------------------------------------ *
   *  14 · Atmosphere: deep space, stars, shafts, motes
   * ------------------------------------------------------------------ */
  const atmosphere = {
    paneBeams: [],
    motes: null,
    fireflies: null,
    snowSparkles: null,
    starMaterial: null,
    bokeh: [],
    backgroundMaterial: null,
  };

  function buildBackground() {
    const backgroundMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uNebula: { value: 0.7 },
      },
      vertexShader: `
        varying vec3 vDirection;
        void main() {
          vDirection = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uNebula;
        varying vec3 vDirection;

        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }

        float noise21(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash21(i);
          float b = hash21(i + vec2(1.0, 0.0));
          float c = hash21(i + vec2(0.0, 1.0));
          float d = hash21(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        float fbm21(vec2 p) {
          float value = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 5; i++) {
            value += noise21(p) * amp;
            p *= 2.02;
            amp *= 0.5;
          }
          return value;
        }

        void main() {
          vec3 dir = normalize(vDirection);
          float height = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 deep = vec3(0.0024, 0.0042, 0.0090);
          vec3 high = vec3(0.0100, 0.0200, 0.0390);
          vec3 col = mix(deep, high, smoothstep(0.17, 0.96, height));
          vec2 p = dir.xz * 2.4 + vec2(dir.y * 1.1, -dir.y * 0.7);
          float n = fbm21(p + vec2(uTime * 0.002, 0.0));
          float n2 = fbm21(p * 2.7 + vec2(4.2, -1.7));
          float neph = smoothstep(0.43, 0.77, n * 0.7 + n2 * 0.3);
          float band = smoothstep(0.2, 0.9, sin(dir.y * 7.8 + n * 1.8) * 0.5 + 0.5);
          vec3 coolNeb = vec3(0.012, 0.035, 0.065);
          vec3 warmNeb = vec3(0.046, 0.021, 0.042);
          vec3 nebula = mix(coolNeb, warmNeb, smoothstep(0.25, 0.85, n2));
          col += nebula * neph * band * uNebula;
          col += vec3(0.005, 0.010, 0.016) * smoothstep(0.5, 1.0, height);
          float horizonGlow = (1.0 - smoothstep(0.0, 0.25, abs(dir.y + 0.1))) * 0.012;
          col += vec3(0.014, 0.022, 0.038) * horizonGlow;
          float dither = hash21(gl_FragCoord.xy + uTime) * 0.0008;
          gl_FragColor = vec4(col + dither, 1.0);
        }
      `,
    });
    atmosphere.backgroundMaterial = backgroundMaterial;
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(86, 48, 32), backgroundMaterial);
    sphere.renderOrder = -1000;
    scene.add(sphere);
  }

  function buildStars() {
    const count = QUALITY.mobile ? 850 : 1500;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const colors = new Float32Array(count * 3);
    const palette = [color(0xd8e9ff), color(0xaecdf4), color(0xfff1d2), color(0xbfd8ea), color(0xf2dfc4)];
    const c = new THREE.Color();
    for (let i = 0; i < count; i += 1) {
      const theta = random() * TAU;
      const u = random() * 2 - 1;
      const r = randomRange(30, 72);
      const s = Math.sqrt(1 - u * u);
      positions[i * 3] = Math.cos(theta) * s * r;
      positions[i * 3 + 1] = u * r;
      positions[i * 3 + 2] = Math.sin(theta) * s * r;
      sizes[i] = Math.pow(random(), 2.2) * 2.4 + 0.45;
      phases[i] = random() * TAU;
      c.copy(palette[Math.floor(random() * palette.length)]);
      c.offsetHSL(0, randomRange(-0.04, 0.04), randomRange(-0.08, 0.06));
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute('aTint', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: renderer.getPixelRatio() },
        uOpacity: { value: 0.95 },
      },
      vertexShader: `
        uniform float uTime;
        uniform float uPixelRatio;
        attribute float aSize;
        attribute float aPhase;
        attribute vec3 aTint;
        varying vec3 vTint;
        varying float vTwinkle;

        void main() {
          vTint = aTint;
          vTwinkle = 0.62 + 0.38 * sin(uTime * 0.55 + aPhase * 9.0);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aSize * uPixelRatio * (54.0 / -mv.z), 0.7, 4.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uOpacity;
        varying vec3 vTint;
        varying float vTwinkle;

        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          float a = 1.0 - smoothstep(0.03, 0.5, d);
          float core = 1.0 - smoothstep(0.0, 0.16, d);
          vec3 col = vTint * (0.9 + core * 2.2) * (0.7 + vTwinkle * 0.8);
          gl_FragColor = vec4(col, a * vTwinkle * uOpacity);
        }
      `,
    });
    const stars = new THREE.Points(geometry, material);
    stars.renderOrder = -900;
    stars.frustumCulled = false;
    scene.add(stars);
    atmosphere.starMaterial = material;

    // Distant bokeh: soft evidence of a much larger universe.
    const bokehCount = QUALITY.mobile ? 9 : 18;
    const bokehPositions = new Float32Array(bokehCount * 3);
    const bokehSizes = new Float32Array(bokehCount);
    const bokehAlpha = new Float32Array(bokehCount);
    const bokehColors = new Float32Array(bokehCount * 3);
    const bokehPalette = [0x527cac, 0x7f6f9f, 0xa7846a, 0x4d6e7a, 0x6c8fb0];
    const bokehColor = new THREE.Color();
    for (let i = 0; i < bokehCount; i += 1) {
      const theta = random() * TAU;
      const r = randomRange(30, 52);
      bokehPositions[i * 3] = Math.cos(theta) * r;
      bokehPositions[i * 3 + 1] = randomRange(-12, 18);
      bokehPositions[i * 3 + 2] = Math.sin(theta) * r - 6;
      bokehSizes[i] = randomRange(24, 110);
      bokehAlpha[i] = randomRange(0.045, 0.16);
      bokehColor.setHex(bokehPalette[i % bokehPalette.length]);
      bokehColors[i * 3] = bokehColor.r;
      bokehColors[i * 3 + 1] = bokehColor.g;
      bokehColors[i * 3 + 2] = bokehColor.b;
    }
    const bokehGeometry = new THREE.BufferGeometry();
    bokehGeometry.setAttribute('position', new THREE.BufferAttribute(bokehPositions, 3));
    bokehGeometry.setAttribute('aSize', new THREE.BufferAttribute(bokehSizes, 1));
    bokehGeometry.setAttribute('aAlpha', new THREE.BufferAttribute(bokehAlpha, 1));
    bokehGeometry.setAttribute('aTint', new THREE.BufferAttribute(bokehColors, 3));
    const bokehMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uPixelRatio: { value: renderer.getPixelRatio() },
      },
      vertexShader: `
        uniform float uPixelRatio;
        attribute float aSize;
        attribute float aAlpha;
        attribute vec3 aTint;
        varying vec3 vTint;
        varying float vAlpha;
        void main() {
          vTint = aTint;
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uPixelRatio;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vTint;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          if (d > 1.0) discard;
          float disc = 1.0 - smoothstep(0.58, 1.0, d);
          float rim = smoothstep(0.52, 0.84, d) * (1.0 - smoothstep(0.84, 1.0, d));
          vec3 col = vTint * (0.35 + disc * 0.7 + rim * 0.6);
          gl_FragColor = vec4(col, disc * vAlpha);
        }
      `,
    });
    const bokehPoints = new THREE.Points(bokehGeometry, bokehMaterial);
    bokehPoints.renderOrder = -800;
    bokehPoints.frustumCulled = false;
    scene.add(bokehPoints);
    atmosphere.bokehPoints = bokehPoints;

    // A quiet halo beneath the cube, like light refusing to leave it.
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 12),
      new THREE.MeshBasicMaterial({
        map: shared.glowTexture,
        color: 0x2a5e7c,
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = -4.55;
    halo.renderOrder = -10;
    scene.add(halo);
    atmosphere.halo = halo;
  }

  function createMoteSystem(options) {
    const {
      count,
      positionFn,
      colors,
      sizes,
      drift,
      renderOrder,
    } = options;
    const positions = new Float32Array(count * 3);
    const aSizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const drifts = new Float32Array(count);
    const tint = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < count; i += 1) {
      const p = positionFn(i, count);
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
      aSizes[i] = randomRange(sizes[0], sizes[1]);
      phases[i] = random() * TAU;
      drifts[i] = randomRange(drift[0], drift[1]);
      c.setHex(colors[Math.floor(random() * colors.length)]);
      tint[i * 3] = c.r;
      tint[i * 3 + 1] = c.g;
      tint[i * 3 + 2] = c.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(aSizes, 1));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute('aDrift', new THREE.BufferAttribute(drifts, 1));
    geometry.setAttribute('aTint', new THREE.BufferAttribute(tint, 3));

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: renderer.getPixelRatio() },
        uOpacity: { value: 1 },
      },
      vertexShader: `
        uniform float uTime;
        uniform float uPixelRatio;
        attribute float aSize;
        attribute float aPhase;
        attribute float aDrift;
        attribute vec3 aTint;
        varying vec3 vTint;
        varying float vTwinkle;

        void main() {
          vTint = aTint;
          vec3 p = position;
          p.x += sin(uTime * 0.21 + aPhase * 6.0) * aDrift;
          p.y += sin(uTime * 0.33 + aPhase * 4.0) * aDrift * 0.7 + sin(uTime * 0.05 + aPhase) * aDrift * 0.5;
          p.z += cos(uTime * 0.18 + aPhase * 5.0) * aDrift;
          vTwinkle = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * 1.8 + aPhase * 8.0), 1.6);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = clamp(aSize * uPixelRatio * (86.0 / -mv.z), 0.7, 8.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        varying vec3 vTint;
        varying float vTwinkle;

        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          float halo = 1.0 - smoothstep(0.0, 0.5, d);
          float core = 1.0 - smoothstep(0.0, 0.2, d);
          vec3 col = vTint * (0.85 + core * 2.0) * (0.6 + vTwinkle * 0.9);
          gl_FragColor = vec4(col, halo * vTwinkle * uOpacity);
        }
      `,
    });
    const points = new THREE.Points(geometry, material);
    points.renderOrder = renderOrder || 5;
    points.frustumCulled = false;
    worldRoot.add(points);
    return { points, material };
  }

  function buildMotes() {
    const dustColors = [0xffe0af, 0xc6e7ff, 0xfff2d3, 0x9acbe0];
    atmosphere.motes = createMoteSystem({
      count: QUALITY.mobile ? 100 : 170,
      colors: dustColors,
      sizes: [0.45, 1.25],
      drift: [0.08, 0.3],
      renderOrder: 5,
      positionFn: () => ({
        x: randomRange(-4.35, 4.35),
        y: randomRange(-2.6, 4.8),
        z: randomRange(-4.35, 4.35),
      }),
    });

    const fireflyColors = [0xffd278, 0xffc56e, 0xb7efbc, 0xffe6b0, 0x9edfe2];
    atmosphere.fireflies = createMoteSystem({
      count: QUALITY.mobile ? 72 : 120,
      colors: fireflyColors,
      sizes: [1.2, 3.0],
      drift: [0.12, 0.44],
      renderOrder: 6,
      positionFn: () => {
        let x = 0;
        let z = 0;
        for (let i = 0; i < 8; i += 1) {
          const a = random() * TAU;
          const r = Math.sqrt(random()) * 3.55;
          x = Math.cos(a) * r;
          z = Math.sin(a) * r;
          if (!isWaterAt(x, z, 0.07) && !insideMountainFootprint(x, z, 0.1)) break;
        }
        const ground = terrainHeight(x, z);
        return {
          x,
          y: ground + randomRange(0.12, 1.2),
          z,
        };
      },
    });

    const snowPositions = snowMoundData.length > 0
      ? snowMoundData
      : [{ position: new V3(-1.36, 2.2, -1.58) }];
    atmosphere.snowSparkles = createMoteSystem({
      count: QUALITY.mobile ? 90 : 160,
      colors: [0xeaf8ff, 0xbcdfff, 0xffffff, 0xd3ecf8],
      sizes: [0.35, 1.2],
      drift: [0.01, 0.05],
      renderOrder: 5,
      positionFn: () => {
        const m = snowPositions[Math.floor(random() * snowPositions.length)];
        return {
          x: m.position.x + randomRange(-0.06, 0.06),
          y: m.position.y + randomRange(0.02, 0.08),
          z: m.position.z + randomRange(-0.06, 0.06),
        };
      },
    });
  }

  function makeVolumetricShaft(from, to, width, seed, opacity) {
    const group = new THREE.Group();
    const direction = to.clone().sub(from);
    const length = direction.length();
    const mid = from.clone().add(to).multiplyScalar(0.5);
    group.position.copy(mid);
    group.quaternion.setFromUnitVectors(new V3(0, 1, 0), direction.clone().normalize());

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0xffd9a2) },
        uOpacity: { value: opacity },
        uSeed: { value: seed },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uSeed;
        varying vec2 vUv;

        float hash21(vec2 p) {
          p = fract(p * vec2(234.34, 435.345));
          p += dot(p, p + 34.23);
          return fract(p.x * p.y);
        }

        float noise21(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash21(i);
          float b = hash21(i + vec2(1.0, 0.0));
          float c = hash21(i + vec2(0.0, 1.0));
          float d = hash21(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        void main() {
          float x = abs(vUv.x - 0.5) * 2.0;
          float edge = exp(-x * x * 4.3);
          float lengthFade = smoothstep(0.02, 0.26, vUv.y) * (1.0 - smoothstep(0.58, 1.0, vUv.y));
          float bands = 0.72 + 0.28 * sin(vUv.y * 13.0 - uTime * 0.25 + vUv.x * 3.0 + uSeed);
          float grain = smoothstep(0.22, 0.9, noise21(vec2(vUv.x * 4.0 + uSeed, vUv.y * 8.0 - uTime * 0.08)));
          float alpha = edge * lengthFade * bands * (0.6 + 0.4 * grain) * uOpacity;
          vec3 col = uColor * (0.6 + edge * 0.75 + grain * 0.18);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });

    const geometry = new THREE.PlaneGeometry(width, length, 1, 28);
    const planeA = new THREE.Mesh(geometry, material);
    planeA.renderOrder = 7;
    group.add(planeA);
    const planeB = new THREE.Mesh(geometry, material);
    planeB.rotation.y = Math.PI / 2;
    planeB.renderOrder = 7;
    group.add(planeB);

    worldRoot.add(group);
    atmosphere.paneBeams.push({ group, material, baseOpacity: opacity });
  }

  function buildVolumetricShafts() {
    makeVolumetricShaft(
      new V3(-3.25, 5.4, 1.7),
      new V3(-0.65, -1.15, 0.65),
      3.6,
      1.4,
      0.075
    );
    makeVolumetricShaft(
      new V3(3.15, 4.8, -1.8),
      new V3(1.0, -1.5, -0.1),
      2.2,
      5.6,
      0.032
    );
  }

  /* ------------------------------------------------------------------ *
   *  15 · Time-of-day choreography
   * ------------------------------------------------------------------ */
  const TIME_KEYS = [
    {
      hour: 0,
      sun: 0xa9c8ff, sunI: 0.62,
      hemiSky: 0x203a5b, hemiGround: 0x080e18, hemiI: 0.38,
      ambient: 0x7ca9da, ambientI: 0.14,
      fill: 0x5686b2, fillI: 0.26,
      rim: 0x88b9f2, rimI: 0.8,
      glass: 1.5, fireflies: 1.0, bloom: 0.92, exposure: 1.06, mist: 0.065,
      waterDeep: 0x041522, waterShallow: 0x0c3142, waterSky: 0x25465f, waterFoam: 0xaccde0,
      shaft: 0x8dc5ff,
    },
    {
      hour: 4.7,
      sun: 0xa9c8ff, sunI: 0.5,
      hemiSky: 0x1d3455, hemiGround: 0x0a0f18, hemiI: 0.34,
      ambient: 0x6e98c6, ambientI: 0.13,
      fill: 0x4f7fa9, fillI: 0.22,
      rim: 0x77aee9, rimI: 0.64,
      glass: 1.4, fireflies: 0.85, bloom: 0.9, exposure: 1.04, mist: 0.08,
      waterDeep: 0x061a28, waterShallow: 0x12394a, waterSky: 0x2a4d68, waterFoam: 0xbfd8e5,
      shaft: 0x9dc6ff,
    },
    {
      hour: 6.2,
      sun: 0xffc0a0, sunI: 1.4,
      hemiSky: 0x8ba4c5, hemiGround: 0x4b3b43, hemiI: 0.6,
      ambient: 0xffd2bc, ambientI: 0.19,
      fill: 0x6b93b8, fillI: 0.3,
      rim: 0xbedcff, rimI: 0.9,
      glass: 1.05, fireflies: 0.32, bloom: 0.8, exposure: 1.04, mist: 0.12,
      waterDeep: 0x0b2a37, waterShallow: 0x2b6b70, waterSky: 0x89aebf, waterFoam: 0xd9e9ea,
      shaft: 0xffc9a5,
    },
    {
      hour: 8.2,
      sun: 0xffe0b9, sunI: 2.65,
      hemiSky: 0xb8d7ee, hemiGround: 0x64553f, hemiI: 0.8,
      ambient: 0xfff0dd, ambientI: 0.2,
      fill: 0x86add0, fillI: 0.38,
      rim: 0xd1ebff, rimI: 1.04,
      glass: 0.66, fireflies: 0.1, bloom: 0.66, exposure: 1.01, mist: 0.11,
      waterDeep: 0x0c3142, waterShallow: 0x31817e, waterSky: 0xb2d2de, waterFoam: 0xddedef,
      shaft: 0xffdfb0,
    },
    {
      hour: 12.0,
      sun: 0xfff6e6, sunI: 3.15,
      hemiSky: 0xcde6fa, hemiGround: 0x6e6450, hemiI: 0.92,
      ambient: 0xfffaf0, ambientI: 0.18,
      fill: 0x94bdd9, fillI: 0.34,
      rim: 0xd9f1ff, rimI: 1.15,
      glass: 0.5, fireflies: 0.02, bloom: 0.58, exposure: 1.0, mist: 0.08,
      waterDeep: 0x0e3b4b, waterShallow: 0x3c9890, waterSky: 0xc9e3e9, waterFoam: 0xe9f5f2,
      shaft: 0xfff0cc,
    },
    {
      hour: 16.2,
      sun: 0xffd29a, sunI: 2.75,
      hemiSky: 0xb1c8dc, hemiGround: 0x70513a, hemiI: 0.7,
      ambient: 0xffd9b2, ambientI: 0.2,
      fill: 0x8b9eb0, fillI: 0.34,
      rim: 0xffd2ad, rimI: 0.94,
      glass: 0.75, fireflies: 0.18, bloom: 0.68, exposure: 1.02, mist: 0.1,
      waterDeep: 0x0c3041, waterShallow: 0x2f7e7e, waterSky: 0xb2cbd0, waterFoam: 0xe0efeb,
      shaft: 0xffd19a,
    },
    {
      hour: 17.9,
      sun: 0xffa471, sunI: 2.15,
      hemiSky: 0x9c93ad, hemiGround: 0x4b3031, hemiI: 0.55,
      ambient: 0xffad86, ambientI: 0.17,
      fill: 0x846f8d, fillI: 0.25,
      rim: 0xf3b9b0, rimI: 0.84,
      glass: 1.08, fireflies: 0.55, bloom: 0.8, exposure: 1.04, mist: 0.12,
      waterDeep: 0x0b2734, waterShallow: 0x2a6468, waterSky: 0x9fadb6, waterFoam: 0xd5e2dc,
      shaft: 0xffb287,
    },
    {
      hour: 19.2,
      sun: 0x9bb7f0, sunI: 0.68,
      hemiSky: 0x4e5f82, hemiGround: 0x151722, hemiI: 0.4,
      ambient: 0x9bbce3, ambientI: 0.14,
      fill: 0x426691, fillI: 0.28,
      rim: 0x8eb8fb, rimI: 0.78,
      glass: 1.45, fireflies: 0.95, bloom: 0.9, exposure: 1.04, mist: 0.09,
      waterDeep: 0x071c2c, waterShallow: 0x123e51, waterSky: 0x37586e, waterFoam: 0xbcd2df,
      shaft: 0xa4caff,
    },
    {
      hour: 21.6,
      sun: 0xa7c4ff, sunI: 0.58,
      hemiSky: 0x223a5c, hemiGround: 0x090f18, hemiI: 0.36,
      ambient: 0x7ea9d7, ambientI: 0.13,
      fill: 0x527ea7, fillI: 0.24,
      rim: 0x83b5ef, rimI: 0.74,
      glass: 1.55, fireflies: 1.0, bloom: 0.94, exposure: 1.06, mist: 0.07,
      waterDeep: 0x051724, waterShallow: 0x0f3343, waterSky: 0x294b62, waterFoam: 0xb4cfe0,
      shaft: 0x90c4ff,
    },
    {
      hour: 24,
      sun: 0xa9c8ff, sunI: 0.62,
      hemiSky: 0x203a5b, hemiGround: 0x080e18, hemiI: 0.38,
      ambient: 0x7ca9da, ambientI: 0.14,
      fill: 0x5686b2, fillI: 0.26,
      rim: 0x88b9f2, rimI: 0.8,
      glass: 1.5, fireflies: 1.0, bloom: 0.92, exposure: 1.06, mist: 0.065,
      waterDeep: 0x041522, waterShallow: 0x0c3142, waterSky: 0x25465f, waterFoam: 0xaccde0,
      shaft: 0x8dc5ff,
    },
  ];

  const PALETTE_COLOR_KEYS = [
    'sun', 'hemiSky', 'hemiGround', 'ambient', 'fill', 'rim',
    'waterDeep', 'waterShallow', 'waterSky', 'waterFoam', 'shaft',
  ];
  const PALETTE_NUMBER_KEYS = [
    'sunI', 'hemiI', 'ambientI', 'fillI', 'rimI',
    'glass', 'fireflies', 'bloom', 'exposure', 'mist',
  ];

  const palette = {};
  for (const key of PALETTE_COLOR_KEYS) palette[key] = new THREE.Color();
  for (const key of PALETTE_NUMBER_KEYS) palette[key] = 0;

  for (const key of TIME_KEYS) {
    for (const colorKey of PALETTE_COLOR_KEYS) {
      key[colorKey] = new THREE.Color(key[colorKey]);
    }
  }

  function samplePalette(hour) {
    let i = 0;
    while (i < TIME_KEYS.length - 2 && hour >= TIME_KEYS[i + 1].hour) i += 1;
    const a = TIME_KEYS[i];
    const b = TIME_KEYS[i + 1];
    const rawT = invLerp(a.hour, b.hour, hour);
    const t = rawT * rawT * (3 - 2 * rawT);
    for (const key of PALETTE_COLOR_KEYS) {
      palette[key].copy(a[key]).lerp(b[key], t);
    }
    for (const key of PALETTE_NUMBER_KEYS) {
      palette[key] = lerp(a[key], b[key], t);
    }
    palette.hour = hour;
    return palette;
  }

  const lightWhite = new THREE.Color(0xfff5e8);

  function updateLighting(hour) {
    const p = samplePalette(hour);
    lighting.key.color.copy(p.sun).lerp(lightWhite, 0.08);
    lighting.key.intensity = p.sunI * 1.5 * (1 + p.fireflies * 0.22);

    const solarAngle = ((hour - 6) / 24) * TAU;
    const altitude = Math.max(0.12, Math.sin(solarAngle));
    lighting.key.position.set(
      Math.cos(solarAngle) * 13.0,
      4.0 + altitude * 11.0,
      4.8 + Math.sin(solarAngle * 0.45) * 1.4
    );
    lighting.key.target.position.set(0, 0.1, 0);

    lighting.fill.color.copy(p.fill);
    lighting.fill.intensity = p.fillI * 1.24;
    lighting.underfill.color.copy(p.waterSky).lerp(p.hemiSky, 0.45);
    lighting.underfill.intensity = 0.9 + p.fireflies * 0.45;
    lighting.rim.color.copy(p.rim);
    lighting.rim.intensity = p.rimI * 1.28;
    lighting.hemi.color.copy(p.hemiSky);
    lighting.hemi.groundColor.copy(p.hemiGround);
    lighting.hemi.intensity = p.hemiI * 0.7 * (1 + p.fireflies * 0.1);
    lighting.ambient.color.copy(p.ambient);
    lighting.ambient.intensity = p.ambientI * 0.74 * (1 + p.fireflies * 0.12);

    lighting.warmBounce.intensity = 0.35 + p.sunI * 0.46;
    lighting.coolBounce.intensity = 0.55 + p.sunI * 0.3 + p.fireflies * 0.35;
    lighting.lake.intensity = 0.24 + p.fireflies * 0.75;
    lighting.waterfall.intensity = 0.2 + p.fireflies * 0.55;

    if (undersideMagic.light) {
      undersideMagic.light.intensity = 2.2 + p.fireflies * 2.0;
      undersideMagic.light.color.copy(p.waterShallow).lerp(p.waterSky, 0.36);
    }
    if (undersideMagic.cliffFill) {
      undersideMagic.cliffFill.intensity = 3.4 + p.sunI * 0.85;
      undersideMagic.cliffFill.color.copy(p.fill).lerp(p.sun, 0.22);
    }
    if (undersideMagic.surfaceMaterial) {
      const brightness = 2.55 + 0.3 * smoothstep(1.4, 3.4, p.sunI) + p.fireflies * 0.16;
      undersideMagic.surfaceMaterial.color.setScalar(brightness);
    }
    if (undersideMagic.crystals.length) {
      const crystalMaterial = undersideMagic.crystals[0].material;
      crystalMaterial.emissiveIntensity = 1.0 + p.fireflies * 1.4;
    }
    if (undersideMagic.heartGlow) {
      undersideMagic.heartGlow.material.opacity = 0.16 + p.fireflies * 0.22;
    }
    undersideMagic.glows.forEach((glow) => {
      const pulse = 0.55 + 0.45 * Math.sin(shared.time * 0.75 + glow.userData.phase);
      glow.material.opacity = (0.08 + p.fireflies * 0.14) * pulse;
      glow.scale.setScalar(0.18 + pulse * 0.12);
    });

    // Glass and water share the mood.
    if (glass.paneMaterial) {
      glass.paneMaterial.uniforms.uTime.value = shared.time;
      glass.paneMaterial.uniforms.uOpacity.value = 0.62 + p.glass * 0.055;
    }
    if (glass.railMaterial) {
      glass.railMaterial.emissiveIntensity = 0.12 + p.glass * 0.24;
      glass.railMaterial.opacity = 0.46 + p.glass * 0.075;
    }
    glass.lineMaterials.forEach((entry, index) => {
      entry.material.opacity = entry.baseOpacity * (0.62 + p.glass * 0.2) / (1 + index * 0.35);
    });
    glass.cornerGlows.forEach((s) => {
      const pulse = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(shared.time * 0.9 + s.userData.phase));
      s.material.opacity = (0.12 + p.glass * 0.12) * pulse;
      s.scale.setScalar(0.22 + pulse * 0.2);
    });

    waterMaterial.uniforms.uTime.value = shared.time;
    waterMaterial.uniforms.uSunDir.value.copy(lighting.key.position).normalize();
    waterMaterial.uniforms.uSunColor.value.copy(p.sun);
    waterMaterial.uniforms.uDeep.value.copy(p.waterDeep).multiplyScalar(0.86);
    waterMaterial.uniforms.uShallow.value.copy(p.waterShallow).multiplyScalar(1.04);
    waterMaterial.uniforms.uSky.value.copy(p.waterSky);
    waterMaterial.uniforms.uFoam.value.copy(p.waterFoam);
    waterMaterial.uniforms.uOpacity.value = 0.82 + 0.07 * p.fireflies;
    waterMaterial.uniforms.uEnvTint.value.copy(p.waterSky).lerp(lightWhite, 0.2);
    waterMaterial.uniforms.uEnvStrength.value = 0.12 + 0.2 * smoothstep(0.2, 3.2, p.sunI);

    if (glass.paneMaterial) {
      glass.paneMaterial.uniforms.uEnvTint.value.copy(p.hemiSky).lerp(lightWhite, 0.56);
      glass.paneMaterial.uniforms.uEnvStrength.value = 0.26 + 0.25 * smoothstep(0.25, 3.0, p.sunI);
    }
    if (glass.railMaterial) {
      glass.railMaterial.envMapIntensity = 0.55 + 0.35 * smoothstep(0.25, 3.0, p.sunI);
    }

    if (waterfall.material) {
      waterfall.material.uniforms.uTime.value = shared.time;
      waterfall.material.uniforms.uColor.value.copy(p.waterDeep).lerp(p.waterSky, 0.34);
      waterfall.material.uniforms.uFoam.value.copy(p.waterFoam);
      waterfall.material.uniforms.uOpacity.value = 0.94;
    }
    if (waterfall.glow) {
      waterfall.glow.intensity = 0.25 + p.fireflies * 0.7;
      waterfall.glow.color.copy(p.waterSky).lerp(p.waterFoam, 0.4);
    }

    if (cloudSprites.length) {
      const daylight = smoothstep(0.15, 2.8, p.sunI);
      cloudSprites.forEach((sprite) => {
        const d = sprite.userData;
        const pulse = 0.94 + 0.06 * Math.sin(shared.time * 0.14 + d.phase);
        sprite.material.color.copy(p.hemiSky).lerp(lightWhite, 0.42 + daylight * 0.24);
        sprite.material.color.lerp(p.sun, daylight * 0.22);
        sprite.material.opacity = d.baseOpacity * (0.56 + daylight * 0.4) * pulse;
      });
    }

    if (atmosphere.paneBeams) {
      atmosphere.paneBeams.forEach((beam, index) => {
        beam.material.uniforms.uTime.value = shared.time;
        beam.material.uniforms.uColor.value.copy(p.shaft);
        beam.material.uniforms.uOpacity.value = beam.baseOpacity * (0.45 + p.sunI * 0.16) * (index === 0 ? 1 : 0.82);
      });
    }
    if (atmosphere.fireflies) {
      atmosphere.fireflies.material.uniforms.uOpacity.value = p.fireflies;
    }
    if (atmosphere.motes) {
      atmosphere.motes.material.uniforms.uOpacity.value = 0.32 + p.sunI * 0.1;
    }
    if (atmosphere.snowSparkles) {
      atmosphere.snowSparkles.material.uniforms.uOpacity.value = 0.38 + p.sunI * 0.14;
    }
    if (atmosphere.starMaterial) {
      atmosphere.starMaterial.uniforms.uOpacity.value = 0.9 + (1 - smoothstep(0.6, 2.8, p.sunI)) * 0.14;
    }
    if (atmosphere.backgroundMaterial) {
      atmosphere.backgroundMaterial.uniforms.uTime.value = shared.time;
    }
    if (atmosphere.halo) {
      atmosphere.halo.material.opacity = 0.06 + p.fireflies * 0.07;
      atmosphere.halo.material.color.copy(p.waterSky).multiplyScalar(0.55);
    }

    mistSprites.forEach((sprite) => {
      sprite.material.opacity = sprite.userData.baseOpacity * (0.58 + p.mist * 2.4);
      sprite.material.color.copy(p.hemiSky).lerp(lightWhite, 0.72);
    });
    waterfall.mist.forEach((sprite) => {
      sprite.material.opacity = 0.055 + p.fireflies * 0.03 + 0.02;
    });

    if (post) {
      post.uniforms.uExposure.value = p.exposure + 0.03 + p.fireflies * 0.025;
      post.uniforms.uBloom.value = p.bloom * 0.76;
    }
    palette._ready = true;
    return p;
  }

  /* ------------------------------------------------------------------ *
   *  16 · Post-processing (bloom + tilt-shift + film grade)
   * ------------------------------------------------------------------ */
  let post = null;
  const FOCUS_POINT = new V3(0.7, -0.15, 1.15);
  const focusView = new V3();

  function createPostPipeline() {
    const drawingSize = renderer.getDrawingBufferSize(new THREE.Vector2());
    let width = Math.max(2, Math.floor(drawingSize.x));
    let height = Math.max(2, Math.floor(drawingSize.y));
    const renderScale = QUALITY.mobile ? 1.0 : 1.14;
    let sceneWidth = Math.max(2, Math.floor(width * renderScale));
    let sceneHeight = Math.max(2, Math.floor(height * renderScale));

    const supportsHalfFloat = renderer.capabilities.isWebGL2 &&
      (renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'));
    const targetType = supportsHalfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType;
    const depthType = renderer.capabilities.isWebGL2 ? THREE.UnsignedIntType : THREE.UnsignedShortType;

    const makeTarget = (w, h, withDepth = false) => {
      const target = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: targetType,
        depthBuffer: withDepth,
        stencilBuffer: false,
        generateMipmaps: false,
      });
      target.texture.colorSpace = THREE.NoColorSpace;
      if (withDepth) {
        const depthTexture = new THREE.DepthTexture(Math.max(1, w), Math.max(1, h), depthType);
        depthTexture.format = THREE.DepthFormat;
        depthTexture.minFilter = THREE.NearestFilter;
        depthTexture.magFilter = THREE.NearestFilter;
        target.depthTexture = depthTexture;
      }
      return target;
    };

    const sceneTarget = makeTarget(sceneWidth, sceneHeight, true);
    const brightTarget = makeTarget(width * 0.5, height * 0.5);
    const blurHalfA = makeTarget(width * 0.5, height * 0.5);
    const blurHalfB = makeTarget(width * 0.5, height * 0.5);
    const quarterTarget = makeTarget(width * 0.25, height * 0.25);
    const blurQuarterA = makeTarget(width * 0.25, height * 0.25);
    const blurQuarterB = makeTarget(width * 0.25, height * 0.25);
    const ldrTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    });
    ldrTarget.texture.colorSpace = THREE.NoColorSpace;

    const fullscreenScene = new THREE.Scene();
    const fullscreenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quadGeometry = new THREE.PlaneGeometry(2, 2);
    const quad = new THREE.Mesh(quadGeometry, null);
    quad.frustumCulled = false;
    fullscreenScene.add(quad);

    function runPass(material, target) {
      quad.material = material;
      renderer.setRenderTarget(target);
      renderer.clear(true, false, false);
      renderer.render(fullscreenScene, fullscreenCamera);
    }

    const brightPass = makeFullscreenPass(`
      uniform sampler2D tInput;
      uniform float uThreshold;
      uniform float uKnee;
      varying vec2 vUv;

      void main() {
        vec3 c = texture2D(tInput, vUv).rgb;
        float brightness = max(c.r, max(c.g, c.b));
        float soft = smoothstep(uThreshold, uThreshold + uKnee, brightness);
        gl_FragColor = vec4(c * soft, 1.0);
      }
    `, {
      tInput: { value: sceneTarget.texture },
      uThreshold: { value: 0.9 },
      uKnee: { value: 0.5 },
    });

    const blurPass = makeFullscreenPass(`
      uniform sampler2D tInput;
      uniform vec2 uDirection;
      varying vec2 vUv;

      void main() {
        vec3 sum = texture2D(tInput, vUv).rgb * 0.2270270270;
        sum += texture2D(tInput, vUv + uDirection * 1.0).rgb * 0.1945945946;
        sum += texture2D(tInput, vUv - uDirection * 1.0).rgb * 0.1945945946;
        sum += texture2D(tInput, vUv + uDirection * 2.0).rgb * 0.1216216216;
        sum += texture2D(tInput, vUv - uDirection * 2.0).rgb * 0.1216216216;
        sum += texture2D(tInput, vUv + uDirection * 3.0).rgb * 0.0540540541;
        sum += texture2D(tInput, vUv - uDirection * 3.0).rgb * 0.0540540541;
        sum += texture2D(tInput, vUv + uDirection * 4.0).rgb * 0.0162162162;
        sum += texture2D(tInput, vUv - uDirection * 4.0).rgb * 0.0162162162;
        gl_FragColor = vec4(sum, 1.0);
      }
    `, {
      tInput: { value: null },
      uDirection: { value: new THREE.Vector2() },
    });

    const copyPass = makeFullscreenPass(`
      uniform sampler2D tInput;
      varying vec2 vUv;
      void main() {
        gl_FragColor = texture2D(tInput, vUv);
      }
    `, {
      tInput: { value: null },
    });

    const finalPass = makeFullscreenPass(`
      uniform sampler2D tScene;
      uniform sampler2D tDepth;
      uniform sampler2D tBloomHalf;
      uniform sampler2D tBloomQuarter;
      uniform vec2 uSceneTexel;
      uniform float uTime;
      uniform float uExposure;
      uniform float uBloom;
      uniform float uHalation;
      uniform float uChroma;
      uniform float uTilt;
      uniform float uFocusY;
      uniform float uFocusDepth;
      uniform float uFocusRange;
      uniform float uAperture;
      uniform float uNear;
      uniform float uFar;
      uniform float uSaturation;
      uniform float uVignette;
      uniform float uGrain;
      varying vec2 vUv;

      vec3 acesFilm(vec3 x) {
        return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
      }

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      vec3 linearToSrgb(vec3 c) {
        return mix(c * 12.92, 1.055 * pow(max(c, 0.0), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
      }

      float luma(vec3 c) {
        return dot(c, vec3(0.2126, 0.7152, 0.0722));
      }

      float linearizeDepth(float d) {
        float z = d * 2.0 - 1.0;
        return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
      }

      void main() {
        vec2 uv = vUv;
        vec2 centered = uv - 0.5;

        vec3 sharp = texture2D(tScene, uv).rgb;
        // A whisper of lateral chromatic aberration, strongest at the frame edge.
        vec2 chromaOffset = centered * uChroma * (0.35 + dot(centered, centered) * 1.7);
        vec3 chromaR = texture2D(tScene, uv + chromaOffset).rgb;
        vec3 chromaB = texture2D(tScene, uv - chromaOffset).rgb;
        sharp.r = mix(sharp.r, chromaR.r, 0.42);
        sharp.b = mix(sharp.b, chromaB.b, 0.42);

        float rawDepth = texture2D(tDepth, uv).x;
        float sceneDepth = linearizeDepth(rawDepth);
        float depthCoc = smoothstep(uFocusRange, uFocusRange + uAperture, abs(sceneDepth - uFocusDepth));
        float screenCoc = smoothstep(0.1, 0.54, abs(uv.y - uFocusY));
        float coc = clamp(depthCoc * 0.66 + screenCoc * 0.26, 0.0, 1.0) * uTilt;

        vec3 color = sharp;
        if (coc > 0.0005) {
          vec3 blurred = vec3(0.0);
          float total = 0.0;
          for (int i = 0; i < 12; i++) {
            float fi = float(i);
            float angle = fi * 2.39996323 + 0.23;
            float radius = sqrt((fi + 0.5) / 12.0);
            vec2 offset = vec2(cos(angle), sin(angle)) * radius * coc * 0.015;
            float weight = 1.0 - radius * 0.32;
            blurred += texture2D(tScene, uv + offset).rgb * weight;
            total += weight;
          }
          blurred /= max(total, 0.0001);
          color = mix(sharp, blurred, smoothstep(0.0, 0.72, coc));
        }

        vec3 bloomHalf = texture2D(tBloomHalf, uv).rgb;
        vec3 bloomQuarter = texture2D(tBloomQuarter, uv).rgb;
        vec3 bloom = bloomHalf * 0.75 + bloomQuarter * 1.05;
        color += bloom * uBloom;
        color += bloom * vec3(1.0, 0.36, 0.18) * uHalation;

        color *= uExposure;
        color = acesFilm(color);

        float light = luma(color);
        color = mix(vec3(light), color, uSaturation);
        // Split tone: cool, lucid shadows and warm sunlit highlights.
        vec3 shadowTint = vec3(0.93, 0.995, 1.06);
        vec3 highlightTint = vec3(1.035, 1.005, 0.955);
        color *= mix(shadowTint, highlightTint, smoothstep(0.1, 0.8, light));
        color = mix(color, color * color * (3.0 - 2.0 * color), 0.12);
        color += vec3(0.004, 0.006, 0.011) * (1.0 - smoothstep(0.0, 0.42, light));
        color = pow(max(color, 0.0), vec3(0.982, 1.0, 1.012));

        float vignette = 1.0 - smoothstep(0.24, 1.02, length(centered * vec2(1.08, 0.95)));
        color *= mix(0.48, 1.0, uVignette * vignette + (1.0 - uVignette) * 0.66);
        float grain = hash21(gl_FragCoord.xy + floor(uTime * 24.0)) - 0.5;
        float grainB = hash21(gl_FragCoord.yx + floor(uTime * 23.0) + 19.0) - 0.5;
        float grainWeight = uGrain * (0.4 + (1.0 - light) * 0.72);
        color += vec3(grain, grain * 0.78 + grainB * 0.22, grainB) * grainWeight;
        color = max(color, 0.0);
        color = linearToSrgb(color);
        gl_FragColor = vec4(color, 1.0);
      }
    `, {
      tScene: { value: sceneTarget.texture },
      tDepth: { value: sceneTarget.depthTexture },
      tBloomHalf: { value: blurHalfB.texture },
      tBloomQuarter: { value: blurQuarterB.texture },
      uSceneTexel: { value: new THREE.Vector2(1 / width, 1 / height) },
      uTime: { value: 0 },
      uExposure: { value: 1.05 },
      uBloom: { value: 0.52 },
      uHalation: { value: 0.075 },
      uChroma: { value: 0.0009 },
      uTilt: { value: 0.27 },
      uFocusY: { value: 0.55 },
      uFocusDepth: { value: 27.0 },
      uFocusRange: { value: 2.1 },
      uAperture: { value: 6.5 },
      uNear: { value: camera.near },
      uFar: { value: camera.far },
      uSaturation: { value: 1.12 },
      uVignette: { value: 0.66 },
      uGrain: { value: 0.009 },
    });

    const uniforms = finalPass.material.uniforms;

    const fxaaPass = makeFullscreenPass(`
      uniform sampler2D tInput;
      uniform vec2 uTexel;
      varying vec2 vUv;

      float luma(vec3 c) {
        return dot(c, vec3(0.299, 0.587, 0.114));
      }

      void main() {
        vec3 rgbM = texture2D(tInput, vUv).rgb;
        vec3 rgbNW = texture2D(tInput, vUv + vec2(-1.0, -1.0) * uTexel).rgb;
        vec3 rgbNE = texture2D(tInput, vUv + vec2(1.0, -1.0) * uTexel).rgb;
        vec3 rgbSW = texture2D(tInput, vUv + vec2(-1.0, 1.0) * uTexel).rgb;
        vec3 rgbSE = texture2D(tInput, vUv + vec2(1.0, 1.0) * uTexel).rgb;
        vec3 rgbN = texture2D(tInput, vUv + vec2(0.0, 1.0) * uTexel).rgb;
        vec3 rgbS = texture2D(tInput, vUv + vec2(0.0, -1.0) * uTexel).rgb;
        vec3 rgbW = texture2D(tInput, vUv + vec2(-1.0, 0.0) * uTexel).rgb;
        vec3 rgbE = texture2D(tInput, vUv + vec2(1.0, 0.0) * uTexel).rgb;

        float lM = luma(rgbM);
        float lNW = luma(rgbNW);
        float lNE = luma(rgbNE);
        float lSW = luma(rgbSW);
        float lSE = luma(rgbSE);
        float lN = luma(rgbN);
        float lS = luma(rgbS);
        float lW = luma(rgbW);
        float lE = luma(rgbE);
        float lMin = min(lM, min(min(min(lNW, lNE), min(lSW, lSE)), min(min(lN, lS), min(lW, lE))));
        float lMax = max(lM, max(max(max(lNW, lNE), max(lSW, lSE)), max(max(lN, lS), max(lW, lE))));
        float range = lMax - lMin;

        if (range < max(0.032, lMax * 0.12)) {
          gl_FragColor = vec4(rgbM, 1.0);
          return;
        }

        float dirX = -((lNW + lW + lSW) - (lNE + lE + lSE));
        float dirY = (lNW + lN + lNE) - (lSW + lS + lSE);
        vec2 dir = vec2(dirX, dirY);
        float dirLength = length(dir);
        dir = dirLength > 0.0001 ? dir / dirLength : vec2(0.0);
        vec2 offset = dir * uTexel * 0.9;
        vec3 rgbA = 0.5 * (
          texture2D(tInput, vUv + offset * 0.5).rgb +
          texture2D(tInput, vUv - offset * 0.5).rgb
        );
        vec3 rgbB = rgbA * 0.5 + 0.25 * (
          texture2D(tInput, vUv + offset * 1.5).rgb +
          texture2D(tInput, vUv - offset * 1.5).rgb
        );
        float lB = luma(rgbB);
        vec3 result = (lB < lMin || lB > lMax) ? rgbA : rgbB;
        gl_FragColor = vec4(result, 1.0);
      }
    `, {
      tInput: { value: ldrTarget.texture },
      uTexel: { value: new THREE.Vector2(1 / width, 1 / height) },
    });

    function render(sceneToRender, cameraToRender, elapsed) {
      renderer.setRenderTarget(sceneTarget);
      renderer.clear(true, true, true);
      renderer.render(sceneToRender, cameraToRender);

      brightPass.material.uniforms.tInput.value = sceneTarget.texture;
      runPass(brightPass.material, brightTarget);

      blurPass.material.uniforms.tInput.value = brightTarget.texture;
      blurPass.material.uniforms.uDirection.value.set(1 / (width * 0.5), 0);
      runPass(blurPass.material, blurHalfA);

      blurPass.material.uniforms.tInput.value = blurHalfA.texture;
      blurPass.material.uniforms.uDirection.value.set(0, 1 / (height * 0.5));
      runPass(blurPass.material, blurHalfB);

      blurPass.material.uniforms.tInput.value = blurHalfB.texture;
      blurPass.material.uniforms.uDirection.value.set(2 / (width * 0.5), 0);
      runPass(blurPass.material, blurHalfA);

      blurPass.material.uniforms.tInput.value = blurHalfA.texture;
      blurPass.material.uniforms.uDirection.value.set(0, 2 / (height * 0.5));
      runPass(blurPass.material, blurHalfB);

      copyPass.material.uniforms.tInput.value = blurHalfB.texture;
      runPass(copyPass.material, quarterTarget);

      blurPass.material.uniforms.tInput.value = quarterTarget.texture;
      blurPass.material.uniforms.uDirection.value.set(1.5 / (width * 0.25), 0);
      runPass(blurPass.material, blurQuarterA);

      blurPass.material.uniforms.tInput.value = blurQuarterA.texture;
      blurPass.material.uniforms.uDirection.value.set(0, 1.5 / (height * 0.25));
      runPass(blurPass.material, blurQuarterB);

      uniforms.uTime.value = elapsed;
      runPass(finalPass.material, ldrTarget);
      runPass(fxaaPass.material, null);
    }

    function resize(w, h) {
      width = Math.max(2, Math.floor(w));
      height = Math.max(2, Math.floor(h));
      sceneWidth = Math.max(2, Math.floor(width * renderScale));
      sceneHeight = Math.max(2, Math.floor(height * renderScale));
      sceneTarget.setSize(sceneWidth, sceneHeight);
      if (sceneTarget.depthTexture) {
        sceneTarget.depthTexture.image.width = sceneWidth;
        sceneTarget.depthTexture.image.height = sceneHeight;
        sceneTarget.depthTexture.needsUpdate = true;
      }
      brightTarget.setSize(Math.max(1, Math.floor(width * 0.5)), Math.max(1, Math.floor(height * 0.5)));
      blurHalfA.setSize(Math.max(1, Math.floor(width * 0.5)), Math.max(1, Math.floor(height * 0.5)));
      blurHalfB.setSize(Math.max(1, Math.floor(width * 0.5)), Math.max(1, Math.floor(height * 0.5)));
      quarterTarget.setSize(Math.max(1, Math.floor(width * 0.25)), Math.max(1, Math.floor(height * 0.25)));
      blurQuarterA.setSize(Math.max(1, Math.floor(width * 0.25)), Math.max(1, Math.floor(height * 0.25)));
      blurQuarterB.setSize(Math.max(1, Math.floor(width * 0.25)), Math.max(1, Math.floor(height * 0.25)));
      ldrTarget.setSize(width, height);
      uniforms.uSceneTexel.value.set(1 / width, 1 / height);
      uniforms.tBloomHalf.value = blurHalfB.texture;
      uniforms.tBloomQuarter.value = blurQuarterB.texture;
      uniforms.tDepth.value = sceneTarget.depthTexture;
      uniforms.uNear.value = camera.near;
      uniforms.uFar.value = camera.far;
      fxaaPass.material.uniforms.uTexel.value.set(1 / width, 1 / height);
    }

    return {
      render,
      resize,
      uniforms,
      sceneTarget,
      get width() { return width; },
      get height() { return height; },
    };
  }

  /* ------------------------------------------------------------------ *
   *  17 · Interaction, camera, clock
   * ------------------------------------------------------------------ */
  const state = {
    hour: 16.25,
    auto: true,
    lastHourDisplay: -1,
    isDragging: false,
    isScrubbing: false,
    pointerId: null,
    pointerLastX: 0,
    pointerLastY: 0,
    pinchStart: 0,
    pinchStartedZoom: 1,
    pointers: new Map(),
    targetDistance: 30,
    distance: 30,
    zoom: 1,
    azimuth: 0.585,
    targetAzimuth: 0.585,
    polar: 1.19,
    targetPolar: 1.19,
    baseAzimuth: 0.585,
    basePolar: 1.19,
  };

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  state.auto = !prefersReducedMotion;

  function computeCameraDistance() {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    camera.aspect = aspect;
    camera.fov = aspect < 0.72 ? 33 : aspect < 1.0 ? 30 : 27.5;
    camera.updateProjectionMatrix();
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5);
    const bound = 6.22;
    const margin = aspect < 0.95 ? 1.055 : 1.1;
    const verticalDistance = (bound * margin) / tan;
    const horizontalDistance = (bound * margin) / (tan * aspect);
    return Math.max(verticalDistance, horizontalDistance, 24);
  }

  function applyCamera() {
    const dist = state.distance;
    const sinPolar = Math.sin(state.polar);
    const x = Math.sin(state.azimuth) * sinPolar * dist;
    const y = Math.cos(state.polar) * dist;
    const z = Math.cos(state.azimuth) * sinPolar * dist;
    camera.position.set(
      SCENE_TARGET.x + x,
      SCENE_TARGET.y + y,
      SCENE_TARGET.z + z
    );
    camera.lookAt(SCENE_TARGET);
  }

  function resetView() {
    state.targetAzimuth = state.baseAzimuth;
    state.targetPolar = state.basePolar;
    state.zoom = 1;
    state.targetDistance = computeCameraDistance();
  }

  function setupCamera() {
    state.azimuth = state.baseAzimuth;
    state.targetAzimuth = state.baseAzimuth;
    state.polar = state.basePolar;
    state.targetPolar = state.basePolar;
    state.targetDistance = computeCameraDistance();
    state.distance = state.targetDistance;
    camera.position.set(14.5, 12, 17);
    applyCamera();
  }

  function setupPointerControls() {
    const stage = document.getElementById('stage');

    const onPointerDown = (event) => {
      if (event.button !== undefined && event.button !== 0 && event.pointerType === 'mouse') return;
      state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (state.pointers.size === 1) {
        state.pointerId = event.pointerId;
        state.pointerLastX = event.clientX;
        state.pointerLastY = event.clientY;
        state.isDragging = true;
        stage.classList.add('is-dragging');
      } else if (state.pointers.size === 2) {
        const points = [...state.pointers.values()];
        state.pinchStart = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
        state.pinchStartedZoom = state.zoom;
        state.isDragging = false;
      }
      stage.setPointerCapture?.(event.pointerId);
    };

    const onPointerMove = (event) => {
      if (!state.pointers.has(event.pointerId)) return;
      state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (state.pointers.size === 2) {
        const points = [...state.pointers.values()];
        const pinch = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
        if (state.pinchStart > 0) {
          const ratio = state.pinchStart / Math.max(1, pinch);
          state.zoom = clamp(state.pinchStartedZoom * ratio, 0.78, 1.42);
          state.targetDistance = computeCameraDistance() * state.zoom;
        }
        return;
      }

      if (!state.isDragging) return;
      const dx = event.clientX - state.pointerLastX;
      const dy = event.clientY - state.pointerLastY;
      state.pointerLastX = event.clientX;
      state.pointerLastY = event.clientY;
      state.targetAzimuth -= dx * 0.0045;
      state.targetPolar -= dy * 0.003;
      state.targetAzimuth = clamp(state.targetAzimuth, state.baseAzimuth - 0.56, state.baseAzimuth + 0.56);
      state.targetPolar = clamp(state.targetPolar, 0.94, 1.26);
    };

    const finishPointer = (event) => {
      state.pointers.delete(event.pointerId);
      if (state.pointers.size === 0) {
        state.isDragging = false;
        stage.classList.remove('is-dragging');
        state.pointerId = null;
      } else if (state.pointers.size === 1) {
        const remaining = [...state.pointers.entries()][0];
        state.pointerId = remaining[0];
        state.pointerLastX = remaining[1].x;
        state.pointerLastY = remaining[1].y;
        state.isDragging = true;
        stage.classList.add('is-dragging');
      }
    };

    stage.addEventListener('pointerdown', onPointerDown, { passive: true });
    stage.addEventListener('pointermove', onPointerMove, { passive: true });
    stage.addEventListener('pointerup', finishPointer, { passive: true });
    stage.addEventListener('pointercancel', finishPointer, { passive: true });

    stage.addEventListener('wheel', (event) => {
      event.preventDefault();
      const factor = Math.exp(event.deltaY * 0.00085);
      state.zoom = clamp(state.zoom * factor, 0.78, 1.42);
      state.targetDistance = computeCameraDistance() * state.zoom;
    }, { passive: false });

    stage.addEventListener('dblclick', () => {
      resetView();
    });
  }

  function formatClock(hour) {
    let h = Math.floor(hour % 24);
    let m = Math.floor((hour % 1) * 60);
    if (h < 0) h += 24;
    if (m < 0) m = 0;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function getPhase(hour) {
    if (hour < 4.7) return ['夜深', 'NIGHT'];
    if (hour < 6.2) return ['破晓', 'FIRST LIGHT'];
    if (hour < 8.8) return ['晨光', 'MORNING'];
    if (hour < 15.2) return ['白昼', 'DAYLIGHT'];
    if (hour < 17.5) return ['斜阳', 'GOLDEN HOUR'];
    if (hour < 18.8) return ['薄暮', 'DUSK'];
    if (hour < 21.2) return ['暮色', 'TWILIGHT'];
    return ['夜深', 'NIGHT'];
  }

  const ui = {};

  function cacheUI() {
    ui.clock = document.getElementById('clock');
    ui.phase = document.getElementById('phase');
    ui.auto = document.getElementById('cycleToggle');
    ui.cycleState = document.getElementById('cycleState');
    ui.range = document.getElementById('timeRange');
    ui.fill = document.getElementById('timelineFill');
    ui.glow = document.getElementById('timelineGlow');
  }

  function syncUI(force = false) {
    const hour = state.hour;
    if (force || Math.abs(hour - state.lastHourDisplay) > 0.008) {
      state.lastHourDisplay = hour;
      const time = formatClock(hour);
      if (ui.clock.textContent !== time) ui.clock.textContent = time;
      const [cn, en] = getPhase(hour);
      const phrase = `${cn} · ${en}`;
      if (ui.phase.textContent !== phrase) ui.phase.textContent = phrase;
      if (ui.range && document.activeElement !== ui.range) {
        ui.range.value = String((hour / 24) * 24);
      }
      const progress = (hour / 24) * 100;
      if (ui.fill) ui.fill.style.width = `${progress}%`;
      if (ui.glow) ui.glow.style.left = `${progress}%`;
    }
    if (ui.auto) {
      ui.auto.classList.toggle('is-paused', !state.auto);
      ui.auto.setAttribute('aria-pressed', String(state.auto));
      ui.auto.setAttribute('aria-label', state.auto ? '暂停昼夜流转' : '继续昼夜流转');
      if (ui.cycleState) {
        ui.cycleState.classList.toggle('is-paused', !state.auto);
        ui.cycleState.lastChild.nodeValue = state.auto ? 'LIVE' : 'PAUSED';
      }
    }
  }

  function setAuto(value) {
    state.auto = value;
    syncUI(true);
  }

  function setupUI() {
    cacheUI();
    ui.auto.addEventListener('click', () => setAuto(!state.auto));
    ui.range.addEventListener('pointerdown', () => {
      state.isScrubbing = true;
      if (state.auto) setAuto(false);
    });
    ui.range.addEventListener('input', () => {
      state.hour = clamp(Number(ui.range.value), 0, 23.999);
      state.lastHourDisplay = -1;
      syncUI(true);
    });
    const releaseScrub = () => {
      state.isScrubbing = false;
    };
    ui.range.addEventListener('pointerup', releaseScrub);
    ui.range.addEventListener('pointercancel', releaseScrub);
    ui.range.addEventListener('blur', releaseScrub);
    ui.range.addEventListener('change', releaseScrub);
    window.addEventListener('pointerup', releaseScrub);

    syncUI(true);
  }

  /* ------------------------------------------------------------------ *
   *  18 · World build + render loop
   * ------------------------------------------------------------------ */
  let running = false;
  let lastTimestamp = performance.now();
  let firstFrame = true;
  let sceneReadyAt = 0;

  const worldBuilders = [];

  function buildWorld() {
    buildCreatureMaterials();
    buildTerrain();
    buildRiver();
    buildLake();
    buildMountains();
    buildUndersideMagic();
    buildGroundRocks();
    buildTrees();
    buildGrass();
    buildFlowers();
    buildForestFloorDetails();
    buildFerns();
    buildLakeDetails();
    const bridge = buildBridge();
    buildSteppingStones();
    buildWaterfall();
    buildClouds();
    buildMist();
    buildAnimals(bridge);
    buildGlassCube();
    buildLighting();
    buildBackground();
    buildStars();
    buildMotes();
    buildVolumetricShafts();

    // A last pass of warm fireflies near the lantern and bridge.
    updateLighting(state.hour);
  }

  function animate() {
    if (!running) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastTimestamp) / 1000);
    lastTimestamp = now;
    shared.time += dt;

    if (state.auto && !state.isScrubbing) {
      state.hour = (state.hour + dt * (24 / 150)) % 24;
    }

    // Smooth camera motion.
    state.azimuth = damp(state.azimuth, state.targetAzimuth, 5.2, dt);
    state.polar = damp(state.polar, state.targetPolar, 5.2, dt);
    state.distance = damp(state.distance, state.targetDistance, 3.6, dt);
    applyCamera();

    const p = updateLighting(state.hour);
    syncUI();

    // Gentle breath of the entire diorama.
    const motion = prefersReducedMotion ? 0.16 : 1;
    worldRoot.position.y = Math.sin(shared.time * 0.41) * 0.055 * motion;
    worldRoot.rotation.z = Math.sin(shared.time * 0.27) * 0.0018 * motion;
    worldRoot.rotation.x = Math.cos(shared.time * 0.23) * 0.0012 * motion;

    if (grassMesh && grassMesh.material.userData.shader) {
      grassMesh.material.userData.shader.uniforms.uGrassTime.value = shared.time;
    }
    if (atmosphere.motes) {
      atmosphere.motes.material.uniforms.uTime.value = shared.time;
    }
    if (atmosphere.fireflies) {
      atmosphere.fireflies.material.uniforms.uTime.value = shared.time;
      atmosphere.fireflies.material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
    }
    if (atmosphere.snowSparkles) {
      atmosphere.snowSparkles.material.uniforms.uTime.value = shared.time;
    }
    if (atmosphere.starMaterial) {
      atmosphere.starMaterial.uniforms.uTime.value = shared.time;
    }
    if (atmosphere.backgroundMaterial) {
      atmosphere.backgroundMaterial.uniforms.uTime.value = shared.time;
    }
    if (glass.paneMaterial) glass.paneMaterial.uniforms.uTime.value = shared.time;

    // Clouds breathe and drift inside the cube.
    cloudData.forEach((cloud) => {
      const t = shared.time * cloud.speed + cloud.phase;
      cloud.group.position.x = cloud.originX + Math.sin(t) * cloud.drift;
      cloud.group.position.y = cloud.originY + Math.sin(t * 0.8 + 0.7) * 0.07;
      cloud.group.rotation.y = Math.sin(t * 0.8) * 0.02;
    });
    cloudSprites.forEach((sprite) => {
      const d = sprite.userData;
      sprite.material.rotation = d.baseRotation + Math.sin(shared.time * 0.06 + d.phase) * 0.045;
      sprite.position.y = d.baseY + Math.sin(shared.time * 0.12 + d.phase) * d.breathe;
    });

    // Mist curls.
    mistSprites.forEach((sprite) => {
      const d = sprite.userData;
      sprite.position.x = d.baseX + Math.sin(shared.time * d.speed + d.phase) * 0.12;
      sprite.position.y = d.baseY + Math.sin(shared.time * d.speed * 0.7 + d.phase) * 0.025;
      const breathe = 0.94 + Math.sin(shared.time * d.speed * 1.3 + d.phase) * 0.06;
      sprite.scale.set(d.baseScaleX * breathe, d.baseScaleY * breathe, 1);
    });

    if (waterfall.material) {
      waterfall.material.uniforms.uTime.value = shared.time;
      waterfall.rings.forEach((ring) => {
        const local = (shared.time * 0.12 + ring.userData.phase) % 1;
        ring.scale.setScalar(0.82 + local * 1.8);
        ring.material.opacity = ring.userData.baseOpacity * (1 - local) * (0.8 + 0.2 * Math.sin(shared.time * 1.5));
      });
      waterfall.mist.forEach((sprite) => {
        const d = sprite.userData;
        const local = (shared.time * d.speed + d.phase * 0.15) % 1;
        sprite.position.x = d.origin.x + Math.sin(shared.time * 0.35 + d.phase) * 0.1;
        sprite.position.y = d.origin.y + local * 0.22;
        sprite.position.z = d.origin.z + Math.cos(shared.time * 0.27 + d.phase) * 0.06;
        sprite.material.opacity = (0.06 + p.fireflies * 0.04) * (1 - local) * (0.5 + 0.5 * Math.sin(shared.time + d.phase));
      });
      if (waterfall.spray) {
        waterfall.spray.forEach((sprite) => {
          const d = sprite.userData;
          const local = (shared.time * d.speed + d.phase) % 1;
          sprite.position.x = waterfall.base.x + Math.cos(d.angle) * (0.02 + d.radius * local);
          sprite.position.y = WATER.poolY + 0.03 + local * d.height;
          sprite.position.z = waterfall.base.z + Math.sin(d.angle) * (0.02 + d.radius * local * 0.7);
          sprite.scale.setScalar(d.size * (0.45 + local * 0.8));
          sprite.material.opacity = (1 - local) * (0.2 + p.fireflies * 0.04);
        });
      }
      if (waterfall.droplets) {
        const arr = waterfall.dropletPositions;
        for (let i = 0; i < waterfall.droplets.geometry.attributes.position.count; i += 1) {
          const seed = waterfall.dropletSeeds[i];
          arr[i * 3 + 1] -= dt * seed.speed;
          arr[i * 3] += Math.sin(shared.time * 1.7 + seed.offset) * dt * 0.012;
          if (arr[i * 3 + 1] < waterfall.base.y - 0.1) {
            const pnt = waterfallCurve.getPoint(randomRange(0.12, 0.82));
            const side = new V3(0.82, 0, -0.57).normalize();
            arr[i * 3] = pnt.x + side.x * seed.sideOffset;
            arr[i * 3 + 1] = pnt.y;
            arr[i * 3 + 2] = pnt.z + side.z * seed.sideOffset;
          }
        }
        waterfall.droplets.geometry.attributes.position.needsUpdate = true;
      }
    }

    // Small lives.
    creatureAnimations.forEach((creature) => {
      if (creature.kind === 'deer') {
        creature.headGroup.rotation.z = creature.baseTilt + Math.sin(shared.time * 0.55 + creature.phase) * 0.025;
        creature.headGroup.rotation.y = Math.sin(shared.time * 0.25 + creature.phase) * 0.08;
        creature.tail.rotation.y = Math.sin(shared.time * 0.8 + creature.phase) * 0.25;
      } else if (creature.kind === 'sheep') {
        creature.headGroup.rotation.z = Math.sin(shared.time * 0.33 + creature.phase) * 0.08 - 0.04;
        creature.headGroup.rotation.y = Math.sin(shared.time * 0.18 + creature.phase) * 0.04;
      } else if (creature.kind === 'rabbit') {
        creature.earL.rotation.x = Math.sin(shared.time * 0.7 + creature.phase) * 0.1;
        creature.earR.rotation.x = -Math.sin(shared.time * 0.7 + creature.phase + 0.4) * 0.1;
        creature.headGroup.rotation.y = Math.sin(shared.time * 0.22 + creature.phase) * 0.16;
      } else if (creature.kind === 'bird') {
        const path = creature.path;
        const t = shared.time * creature.speed + path.phase;
        const x = path.cx + Math.cos(t) * path.rx;
        const z = path.cz + Math.sin(t) * path.rz;
        const y = path.y + Math.sin(shared.time * 0.5 + path.phase) * 0.06;
        creature.bird.group.position.set(x, y, z);
        const tangentX = -Math.sin(t) * path.rx;
        const tangentZ = Math.cos(t) * path.rz;
        creature.bird.group.rotation.y = Math.atan2(-tangentZ, tangentX);
        creature.bird.group.rotation.z = Math.sin(shared.time * 0.8 + path.phase) * 0.1;
        const flap = Math.sin(shared.time * 3.6 + creature.phase) * 0.55;
        creature.bird.wingL.rotation.x = flap;
        creature.bird.wingR.rotation.x = -flap;
      } else if (creature.kind === 'butterfly') {
        const { butterfly, path } = creature;
        const t = shared.time * path.speed + path.phase;
        const x = path.cx + Math.cos(t) * path.rx;
        const z = path.cz + Math.sin(t) * path.rz;
        butterfly.group.position.set(
          x,
          butterfly.baseY + Math.sin(t * 2.3 + path.phase) * 0.06,
          z
        );
        const tangentX = -Math.sin(t) * path.rx;
        const tangentZ = Math.cos(t) * path.rz;
        butterfly.group.rotation.y = Math.atan2(-tangentZ, tangentX);
        butterfly.group.rotation.z = Math.sin(t * 1.7 + path.phase) * 0.12;
        const flap = Math.sin(shared.time * 12.5 + butterfly.phase) * 0.9;
        butterfly.wingL.rotation.x = 0.16 + flap;
        butterfly.wingR.rotation.x = -0.16 - flap;
      }
    });

    // Cloud glints and falling light.
    for (const glint of glass.travellingGlints) {
      const u = glint.userData;
      const travel = 0.5 + 0.5 * Math.sin(shared.time * u.speed + u.phase);
      glint.position.set(u.x, -CUBE.half + travel * CUBE.size, u.z);
      const opacityPulse = 0.16 + 0.3 * Math.pow(0.5 + 0.5 * Math.sin(shared.time * 0.65 + u.phase * 2.0), 2);
      glint.material.opacity = opacityPulse;
      const s = 0.18 + 0.16 * Math.sin(shared.time * 0.5 + u.phase);
      glint.scale.setScalar(s);
    }
    glass.cornerGlows.forEach((sprite) => {
      const pulse = 0.5 + 0.5 * Math.sin(shared.time * 0.9 + sprite.userData.phase);
      sprite.material.opacity = 0.22 + pulse * 0.18;
      sprite.scale.setScalar(0.3 + pulse * 0.2);
    });

    // Keep the shadow camera centred as the cube bobs.
    lighting.key.target.position.set(0, 0.1, 0);
    lighting.key.updateMatrixWorld();

    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    focusView.copy(FOCUS_POINT).applyMatrix4(camera.matrixWorldInverse);
    post.uniforms.uFocusDepth.value = Math.max(0.5, -focusView.z);
    post.uniforms.uSceneTexel.value.set(1 / post.width, 1 / post.height);
    post.render(scene, camera, shared.time);

    if (firstFrame) {
      firstFrame = false;
      sceneReadyAt = performance.now();
    }
    if (!sceneReadyAt || performance.now() - sceneReadyAt > 620) {
      finishLoading();
    }
    requestAnimationFrame(animate);
  }

  function finishLoading() {
    if (document.body.classList.contains('is-loaded')) return;
    loadingEl.classList.add('is-hidden');
    document.body.classList.add('is-loaded');
    setTimeout(() => {
      loadingEl.style.display = 'none';
    }, 1400);
  }

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY.maxDpr));
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);

    const base = computeCameraDistance();
    state.targetDistance = base * state.zoom;
    state.distance = Math.max(state.distance, base * 0.92);

    if (post) {
      const buffer = renderer.getDrawingBufferSize(new THREE.Vector2());
      post.resize(buffer.x, buffer.y);
      post.uniforms.uTime.value = shared.time;
    }
    const pixelRatio = renderer.getPixelRatio();
    if (atmosphere.starMaterial) atmosphere.starMaterial.uniforms.uPixelRatio.value = pixelRatio;
    if (atmosphere.motes) atmosphere.motes.material.uniforms.uPixelRatio.value = pixelRatio;
    if (atmosphere.fireflies) atmosphere.fireflies.material.uniforms.uPixelRatio.value = pixelRatio;
    if (atmosphere.snowSparkles) atmosphere.snowSparkles.material.uniforms.uPixelRatio.value = pixelRatio;
    if (atmosphere.bokehPoints) atmosphere.bokehPoints.material.uniforms.uPixelRatio.value = pixelRatio;
    applyCamera();
  }

  function handleVisibility() {
    if (document.hidden) {
      running = false;
    } else if (!running) {
      lastTimestamp = performance.now();
      running = true;
      requestAnimationFrame(animate);
    }
  }

  const reflections = {
    sceneTarget: null,
    lakeTarget: null,
  };

  function captureEnvironmentMaps() {
    const useHalfFloat = renderer.capabilities.isWebGL2 &&
      (renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'));
    const targetType = useHalfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType;
    const size = QUALITY.mobile ? 64 : 128;

    function makeCubeTarget() {
      const target = new THREE.WebGLCubeRenderTarget(size, {
        type: targetType,
        generateMipmaps: false,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        depthBuffer: true,
        stencilBuffer: false,
      });
      target.texture.colorSpace = THREE.NoColorSpace;
      return target;
    }

    reflections.sceneTarget = makeCubeTarget();
    reflections.lakeTarget = makeCubeTarget();

    const centerCamera = new THREE.CubeCamera(0.15, 150, reflections.sceneTarget);
    centerCamera.position.set(0, CUBE.centerY, 0);
    const lakeCamera = new THREE.CubeCamera(0.15, 150, reflections.lakeTarget);
    lakeCamera.position.set(LAKE.x, LAKE.level + 0.18, LAKE.z);

    const hidden = [];
    const hide = (object) => {
      if (!object) return;
      hidden.push({ object, visible: object.visible });
      object.visible = false;
    };
    hide(glass.group);
    waterMeshes.forEach((mesh) => hide(mesh));

    scene.updateMatrixWorld(true);
    renderer.setRenderTarget(null);
    centerCamera.update(renderer, scene);
    lakeCamera.update(renderer, scene);

    hidden.forEach(({ object, visible }) => {
      object.visible = visible;
    });
    renderer.setRenderTarget(null);

    glass.paneMaterial.uniforms.uEnvMap.value = reflections.sceneTarget.texture;
    waterMaterial.uniforms.uEnvMap.value = reflections.lakeTarget.texture;
    if (glass.railMaterial) {
      glass.railMaterial.envMap = reflections.sceneTarget.texture;
      glass.railMaterial.needsUpdate = true;
    }
  }

  function boot() {
    if (!window.WebGLRenderingContext) {
      showFatal('此浏览器不支持 WebGL。请尝试更新浏览器或开启硬件加速。');
      return;
    }

    // Provisional sizing before the first frame.
    resize();
    setupCamera();
    setupUI();
    setupPointerControls();

    try {
      buildWorld();
      post = createPostPipeline();
      captureEnvironmentMaps();
      window.__terrarium = {
        scene,
        camera,
        renderer,
        state,
        worldRoot,
        glass,
        lighting,
        atmosphere,
        reflections,
        treeCount,
        palette,
        getPost: () => post,
      };
      // Prime shader compilation while the visitor watches the loading screen.
      renderer.compile(scene, camera);
    } catch (error) {
      console.error(error);
      showFatal('场景生成时遇到问题。请刷新页面重试，或使用最新版 Chrome / Edge 打开。');
      return;
    }

    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') resetView();
    });

    running = true;
    lastTimestamp = performance.now();
    requestAnimationFrame(animate);
  }

  // The glass and post pipeline need to be created in a known order. The
  // requestAnimationFrame loop starts only after the whole diorama is built.
  boot();
})();
