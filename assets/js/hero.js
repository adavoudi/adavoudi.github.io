/* ==========================================================================
   Landing-page scene.

   One particle system, two formations:
     1. Portrait  – sampled from assets/img/portrait.svg. Starts as a raw
                    event stream and "refines" into the portrait.
     2. Pipeline  – the same particles reflow into a Capture → Process →
                    Store → Operate pipeline that the camera flies through
                    as you scroll. Particles leave the pipeline as colour.

   Everything is positioned in the vertex shader; JS only feeds uniforms.
   ========================================================================== */
import * as THREE from './lib/three.module.min.js';

const root = document.documentElement;
const canvas = document.getElementById('scene');
const TAU = Math.PI * 2;
const { clamp, lerp, smoothstep } = THREE.MathUtils;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const smallScreen = matchMedia('(max-width: 820px)').matches;

// Colours used when the SVG is rasterised for sampling: a "thermal" ramp
// that stays visible on a dark background (hair/shadows become indigo/violet).
const GLOW = { 1: '#2a1d63', 2: '#9440c0', 3: '#ec5a4e', 4: '#ffa04a', 5: '#ffd3a0' };
const GLOW_HAIR = { 1: '#4a3ed8', 2: '#7d62f6', 3: '#c3b4ff' };
const PARTICLES = smallScreen ? 14000 : 34000;
const SAMPLE_RES = 380;

// Pipeline geometry. Keep `pathAt` in sync with the GLSL version below.
const NODE_U = [0.14, 0.38, 0.62, 0.86];
const pathAt = (u, out = new THREE.Vector3()) =>
  out.set(
    lerp(-9, 9, u),
    Math.sin(u * TAU * 1.25 + 0.6) * 1.3 + Math.sin(u * TAU * 2.7) * 0.25,
    Math.cos(u * TAU * 1.1) * 1.8
  );

const supportsWebGL = () => {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
};

if (!canvas || !supportsWebGL()) {
  root.classList.add('no-webgl');
} else {
  main().catch((err) => {
    console.warn('Scene failed, falling back to static portrait.', err);
    root.classList.add('no-webgl');
  });
}

/* -------------------------------------------------------------------------
   Portrait sampling
   ---------------------------------------------------------------------- */
async function samplePortrait(count) {
  const url = new URL('../img/portrait.svg', import.meta.url);
  const svg = await (await fetch(url)).text();
  const themed = svg
    .replace(/var\(--p(\d),\s*#[0-9a-f]{6}\)/gi, (_, n) => GLOW[n])
    .replace(/var\(--h(\d),\s*#[0-9a-f]{6}\)/gi, (_, n) => GLOW_HAIR[n])
    .replace(/<svg[^>]*>/, (tag) => tag.replace(/\s(width|height)="[^"]*"/g, '').replace('<svg', `<svg width="${SAMPLE_RES}" height="${SAMPLE_RES}"`));
  const blobUrl = URL.createObjectURL(new Blob([themed], { type: 'image/svg+xml' }));
  const img = new Image();
  img.src = blobUrl;
  await img.decode();

  const ctx = Object.assign(document.createElement('canvas'), { width: SAMPLE_RES, height: SAMPLE_RES }).getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, SAMPLE_RES, SAMPLE_RES);
  URL.revokeObjectURL(blobUrl);
  const px = ctx.getImageData(0, 0, SAMPLE_RES, SAMPLE_RES).data;

  // Weighted rejection sampling: the head carries the likeness, so it gets
  // more dots than the shirt.
  const target = new Float32Array(count * 3);
  const color = new Float32Array(count * 3);
  let n = 0;
  let guard = 0;
  while (n < count && guard++ < count * 60) {
    const x = Math.floor(Math.random() * SAMPLE_RES);
    const y = Math.floor(Math.random() * SAMPLE_RES);
    const i = (y * SAMPLE_RES + x) * 4;
    if (px[i + 3] < 200) continue;
    const v = y / SAMPLE_RES;
    if (Math.random() > (v < 0.6 ? 1 : 0.16)) continue;

    const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255;
    const lum = 0.3 * r + 0.59 * g + 0.11 * b;
    const lx = (x + Math.random()) / SAMPLE_RES - 0.5;
    const ly = 0.5 - (y + Math.random()) / SAMPLE_RES;
    // Relief: brighter = nearer, plus a dome over the head so tilting reads as 3D.
    const dx = lx / 0.34, dy = (ly - 0.18) / 0.42;
    const dome = ly > -0.05 ? Math.max(0, 1 - dx * dx - dy * dy) * 0.16 : 0;
    target.set([lx, ly, (lum - 0.5) * 0.1 + dome + (Math.random() - 0.5) * 0.012], n * 3);
    color.set([r, g, b], n * 3);
    n++;
  }
  return { target: target.subarray(0, n * 3), color: color.subarray(0, n * 3), count: n };
}

/* -------------------------------------------------------------------------
   Shaders
   ---------------------------------------------------------------------- */
const vertexShader = /* glsl */ `
  uniform float uTime, uIntro, uMorph, uPx, uScan, uFade;
  uniform vec2  uMouse;
  uniform vec2  uTilt;
  uniform vec3  uPPos;
  uniform float uPScale;

  attribute vec3 aTarget;
  attribute vec3 aColor;
  attribute vec4 aRand;
  attribute vec4 aPath;

  varying vec3  vColor;
  varying float vAlpha;

  const float TAU = 6.2831853;
  const float N0 = ${NODE_U[0]}, N1 = ${NODE_U[1]}, N2 = ${NODE_U[2]}, N3 = ${NODE_U[3]};

  vec3 pathAt(float u) {
    return vec3(
      mix(-9.0, 9.0, u),
      sin(u * TAU * 1.25 + 0.6) * 1.3 + sin(u * TAU * 2.7) * 0.25,
      cos(u * TAU * 1.1) * 1.8
    );
  }

  void main() {
    // --- 1. raw event stream -------------------------------------------
    float spd = 0.35 + aRand.z * 0.5;
    float sx  = mod(aRand.x * 16.0 + uTime * spd * 3.0, 16.0) - 8.0;
    vec3 S = vec3(
      sx,
      (aRand.y - 0.5) * 7.0 + sin(sx * 0.9 + aRand.w * TAU + uTime) * 0.35,
      (aRand.z - 0.5) * 5.0
    );

    // --- 2. portrait ---------------------------------------------------
    vec3 l = aTarget;
    float cy = cos(uTilt.x), sy = sin(uTilt.x), cx = cos(uTilt.y), sx2 = sin(uTilt.y);
    l = vec3(l.x * cy + l.z * sy, l.y, -l.x * sy + l.z * cy);
    l = vec3(l.x, l.y * cx - l.z * sx2, l.y * sx2 + l.z * cx);
    vec3 P = uPPos + l * uPScale;

    // breathing
    P += 0.010 * vec3(
      sin(uTime * 0.8 + aRand.x * 40.0),
      cos(uTime * 0.9 + aRand.y * 40.0),
      sin(uTime * 0.7 + aRand.z * 40.0)
    );

    // cursor: particles scatter away and spring back as it leaves
    vec2  d  = P.xy - uMouse;
    float md = length(d);
    float push = exp(-md * md * 5.0) * (1.0 - uMorph);
    P.xy += (d / (md + 1e-3)) * push * (0.12 + aRand.z * 0.3);
    P.z  += push * (aRand.w - 0.5) * 0.9;

    // "ETL job" scan line sweeping down the face
    float bd = (aTarget.y - uScan) * 13.0;
    float band = exp(-bd * bd);
    P.z += band * 0.12;

    // intro: stream → portrait, staggered per particle
    float k = clamp(uIntro * 1.75 - aRand.w * 0.75, 0.0, 1.0);
    k = 1.0 - pow(1.0 - k, 3.0);
    vec3 A = mix(S, P, k);
    A.y += sin(k * 3.14159) * (aRand.y - 0.5) * 2.4;

    // --- 3. pipeline ---------------------------------------------------
    float u = fract(aPath.x + uTime * aPath.w);
    vec3  c = pathAt(u);
    vec3  tg  = normalize(pathAt(u + 0.004) - pathAt(u - 0.004));
    vec3  nrm = normalize(cross(tg, vec3(0.0, 1.0, 0.0)));
    vec3  bin = cross(tg, nrm);
    float dn  = min(min(abs(u - N0), abs(u - N1)), min(abs(u - N2), abs(u - N3)));
    float rad = mix(0.14, 1.0, smoothstep(0.0, 0.085, dn)) * (0.55 + 0.5 * aPath.z);
    float ang = aPath.y * TAU + uTime * (0.25 + aPath.w * 18.0);
    vec3  B = c + (cos(ang) * nrm + sin(ang) * bin) * rad;

    // --- blend ---------------------------------------------------------
    float m = smoothstep(aRand.w * 0.45, aRand.w * 0.45 + 0.55, uMorph);
    float t = sin(m * 3.14159);
    vec3 pos = mix(A, B, m);
    pos.y += t * (aRand.x - 0.5) * 3.0;
    pos.z += t * (aRand.y - 0.5) * 3.0;

    // colour: raw (cyan/violet) → refined (portrait colour) along the pipe
    vec3 raw   = mix(vec3(0.38, 0.9, 0.84), vec3(0.55, 0.5, 1.0), aRand.x);
    vec3 pipeC = mix(raw, aColor, smoothstep(0.6, 0.9, u));
    vec3 streamC = mix(raw, aColor, k);
    vec3 col = mix(streamC, pipeC, m);
    col += band * vec3(0.25, 0.55, 0.6) * (1.0 - m);
    col += push * 0.5;
    vColor = col;

    float bottomFade = mix(smoothstep(-0.5, -0.26, aTarget.y), 1.0, m);
    float introA = mix(0.55, 1.0, k);
    vAlpha = mix(0.7, 1.0, m) * bottomFade * introA * uFade;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uPx * (0.75 + aRand.z * 0.95) * 17.0 / -mv.z;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3  vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    gl_FragColor = vec4(vColor, smoothstep(0.5, 0.05, d) * vAlpha);
  }
`;

/* -------------------------------------------------------------------------
   Scene
   ---------------------------------------------------------------------- */
async function main() {
  const sample = await samplePortrait(PARTICLES);
  const count = sample.count;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x07090f, 1);
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);

  const FOV = 40;
  const HERO_Z = 9;
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  const scene = new THREE.Scene();

  // --- particles ---------------------------------------------------------
  const rand = new Float32Array(count * 4);
  const pathAttr = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    for (let j = 0; j < 4; j++) rand[i * 4 + j] = Math.random();
    pathAttr[i * 4] = Math.random();                     // position along the pipe
    pathAttr[i * 4 + 1] = Math.random();                 // angle around the pipe
    pathAttr[i * 4 + 2] = Math.random();                 // radial spread
    pathAttr[i * 4 + 3] = 0.006 + Math.random() * 0.012; // flow speed
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('aTarget', new THREE.BufferAttribute(sample.target, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(sample.color, 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 4));
  geo.setAttribute('aPath', new THREE.BufferAttribute(pathAttr, 4));

  const uniforms = {
    uTime: { value: 0 },
    uIntro: { value: reduceMotion ? 1 : 0 },
    uMorph: { value: 0 },
    uPx: { value: dpr },
    uScan: { value: 2 },
    uFade: { value: 1 },
    uMouse: { value: new THREE.Vector2(99, 99) },
    uTilt: { value: new THREE.Vector2() },
    uPPos: { value: new THREE.Vector3() },
    uPScale: { value: 5 },
  };
  const points = new THREE.Points(
    geo,
    new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })
  );
  points.frustumCulled = false;
  scene.add(points);

  // --- pipeline furniture ------------------------------------------------
  const nodes = NODE_U.map((u) => pathAt(u));
  const furniture = new THREE.Group();
  scene.add(furniture);
  const lineMats = [];
  const nodeMats = NODE_U.map(() => []);
  let building = -1;
  const wire = (geometry, color = 0xffb45c, opacity = 0.7) => {
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
    mat.userData.base = opacity;
    (building >= 0 ? nodeMats[building] : lineMats).push(mat);
    return new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 1), mat);
  };

  // guide line through the pipe
  const guide = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(Array.from({ length: 240 }, (_, i) => pathAt(i / 239))),
    new THREE.LineBasicMaterial({ color: 0x62e6d5, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthTest: false })
  );
  guide.material.userData.base = 0.16;
  lineMats.push(guide.material);
  furniture.add(guide);

  const spinners = [];
  const makeNode = (k) => {
    building = k;
    const g = new THREE.Group();
    g.position.copy(nodes[k]);
    let spin = new THREE.Vector3(0, 0.35, 0);
    if (k === 0) { // Capture: sources converging
      g.add(wire(new THREE.IcosahedronGeometry(0.95, 1)));
      const inner = wire(new THREE.IcosahedronGeometry(0.48, 0), 0x62e6d5, 0.8);
      g.add(inner);
      spin.set(0.12, 0.3, 0.08);
    } else if (k === 1) { // Process: transformation gates along the flow axis
      [-0.55, 0, 0.55].forEach((x, i) => {
        const ring = wire(new THREE.TorusGeometry(1.05 - i * 0.12, 0.035, 4, 56));
        ring.rotation.y = Math.PI / 2;
        ring.position.x = x;
        g.add(ring);
      });
      spin.set(0.4, 0, 0);
    } else if (k === 2) { // Store: lakehouse layers
      [-0.48, -0.16, 0.16, 0.48].forEach((y, i) => {
        const disc = wire(new THREE.CylinderGeometry(1.05, 1.05, 0.07, 6), i % 2 ? 0xffb45c : 0xef6f5e);
        disc.position.y = y;
        disc.rotation.y = i * 0.26;
        g.add(disc);
      });
      spin.set(0, 0.18, 0);
    } else { // Operate: a guarded core
      g.add(wire(new THREE.OctahedronGeometry(0.95, 0)));
      const ring = wire(new THREE.TorusGeometry(1.45, 0.02, 4, 72), 0x62e6d5, 0.8);
      ring.rotation.x = Math.PI / 2.6;
      g.add(ring);
      spin.set(0.05, 0.4, 0);
    }
    spinners.push({ g, spin });
    furniture.add(g);
    building = -1;
  };
  NODE_U.forEach((_, k) => makeNode(k));
  furniture.visible = false;

  // --- DOM hooks ---------------------------------------------------------
  const pipeline = document.getElementById('pipeline');
  const panels = [...document.querySelectorAll('.pipeline .panel')]; // [intro, ...stages]
  const dots = [...document.querySelectorAll('.progress li')];
  const labels = [...document.querySelectorAll('.label')];

  // --- layout ------------------------------------------------------------
  let portraitLayout = false;
  const heroCam = new THREE.Vector3(0, 0, HERO_Z);
  const keyCams = [];
  const overview = { pos: new THREE.Vector3(), look: new THREE.Vector3() };

  function layout() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    portraitLayout = camera.aspect < 0.95;
    const halfH = Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * HERO_Z;
    const halfW = halfH * camera.aspect;
    if (!portraitLayout) {
      uniforms.uPScale.value = Math.min(halfH * 2 * 1.15, halfW * 0.98);
      uniforms.uPPos.value.set(halfW * 0.4, -halfH * 0.16, 0);
    } else {
      uniforms.uPScale.value = Math.min(halfW * 2 * 0.95, halfH * 2 * 0.5);
      uniforms.uPPos.value.set(0, halfH * 0.36, 0);
    }

    keyCams.length = 0;
    nodes.forEach((n) => {
      keyCams.push(
        portraitLayout
          ? { pos: n.clone().add(new THREE.Vector3(0, 0.5, 8.6)), look: n.clone().add(new THREE.Vector3(0, -1.55, 0)) }
          : { pos: n.clone().add(new THREE.Vector3(-4.0, 0.9, 7.4)), look: n.clone().add(new THREE.Vector3(-2.7, -0.1, 0)) }
      );
    });
    if (portraitLayout) {
      overview.pos.copy(nodes[0]).add(new THREE.Vector3(2, 1.6, 17));
      overview.look.copy(nodes[0]).add(new THREE.Vector3(2.5, -1.4, 0));
    } else {
      overview.pos.set(-4.6, 2.4, 21);
      overview.look.set(-4.6, 0, 0);
    }
    requestRender();
  }

  // --- scroll ------------------------------------------------------------
  const state = { enter: 0, p: 0, exit: 0, visible: true, focus: 0, stagePos: 0 };
  const ease = (t) => t * t * (3 - 2 * t);
  function readScroll() {
    const r = pipeline.getBoundingClientRect();
    const vh = window.innerHeight;
    state.enter = clamp(1 - r.top / vh, 0, 1);
    state.p = clamp(-r.top / Math.max(1, r.height - vh), 0, 1);
    state.exit = clamp(1 - r.bottom / vh, 0, 1);
    state.visible = r.bottom > -vh * 0.2;
  }

  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const tmpA = new THREE.Vector3();
  function placeCamera() {
    const { enter, p } = state;
    // hero → overview as the pipeline section scrolls in
    camPos.lerpVectors(heroCam, overview.pos, ease(enter));
    camLook.set(0, 0, 0).lerp(overview.look, ease(enter));

    let active = -1; // -1 = intro panel
    state.focus = 0;
    state.stagePos = 0;
    if (p > 0) {
      const HOLD_OVERVIEW = 0.12, TO_FIRST = 0.2;
      if (p < HOLD_OVERVIEW) {
        camPos.copy(overview.pos); camLook.copy(overview.look);
      } else if (p < TO_FIRST) {
        const t = ease((p - HOLD_OVERVIEW) / (TO_FIRST - HOLD_OVERVIEW));
        camPos.lerpVectors(overview.pos, keyCams[0].pos, t);
        camLook.lerpVectors(overview.look, keyCams[0].look, t);
        state.focus = t;
        active = t > 0.55 ? 0 : -1;
      } else {
        const sp = ((p - TO_FIRST) / (1 - TO_FIRST)) * (keyCams.length - 1);
        const k = Math.min(Math.floor(sp), keyCams.length - 2);
        const f = sp - k;
        const t = ease(clamp((f - 0.3) / 0.5, 0, 1));
        camPos.lerpVectors(keyCams[k].pos, keyCams[k + 1].pos, t);
        camLook.lerpVectors(keyCams[k].look, keyCams[k + 1].look, t);
        state.focus = 1;
        state.stagePos = k + t;
        active = k + (f > 0.55 ? 1 : 0);
      }
    }
    return active;
  }

  let lastActive = -2;
  function setActivePanel(active) {
    if (active === lastActive) return;
    lastActive = active;
    panels.forEach((el, i) => el.classList.toggle('is-active', i === active + 1));
    dots.forEach((el, i) => el.classList.toggle('is-active', i === active));
  }

  // --- pointer -----------------------------------------------------------
  const pointer = { x: 0, y: 0, tx: 0, ty: 0, active: false };
  window.addEventListener('pointermove', (e) => {
    pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.ty = -((e.clientY / window.innerHeight) * 2 - 1);
    pointer.active = true;
    if (reduceMotion) requestRender();
  }, { passive: true });
  window.addEventListener('mouseout', (e) => { if (!e.relatedTarget) pointer.active = false; });

  // --- render ------------------------------------------------------------
  const clock = new THREE.Clock();
  let introStart = null;
  let frames = 0, slow = 0, needsRender = true, running = false;
  const proj = new THREE.Vector3();

  function requestRender() {
    needsRender = true;
    if (!running && reduceMotion) requestAnimationFrame(frame);
  }

  function frame(now) {
    const dt = Math.min(clock.getDelta(), 0.1);
    if (!reduceMotion) running = true;

    readScroll();
    canvas.style.visibility = state.visible ? 'visible' : 'hidden';
    if (!state.visible && !reduceMotion) { requestAnimationFrame(frame); return; }

    // time + intro
    if (!reduceMotion) uniforms.uTime.value += dt;
    else uniforms.uTime.value = 14;
    if (introStart === null) introStart = now + 250;
    if (!reduceMotion) uniforms.uIntro.value = ease(clamp((now - introStart) / 3600, 0, 1));
    const introDone = uniforms.uIntro.value >= 1;
    uniforms.uScan.value = introDone && !reduceMotion ? 0.62 - ((uniforms.uTime.value * 0.16) % 1.9) : 2;

    // pointer smoothing
    const k = reduceMotion ? 1 : 1 - Math.pow(0.0005, dt);
    pointer.x += (pointer.tx - pointer.x) * k;
    pointer.y += (pointer.ty - pointer.y) * k;
    const halfH = Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * HERO_Z;
    uniforms.uMouse.value.set(pointer.active ? pointer.x * halfH * camera.aspect : 99, pointer.active ? pointer.y * halfH : 99);
    uniforms.uTilt.value.set(pointer.x * 0.28, -pointer.y * 0.16);

    // scroll → morph, camera, panels
    const morph = ease(smoothstep(state.enter, 0.12, 1));
    uniforms.uMorph.value = morph;
    uniforms.uFade.value = 1 - 0.85 * ease(state.exit);
    const active = placeCamera();
    setActivePanel(state.p > 0.001 ? active : -1);
    const px = pointer.x * 0.35 * (1 - morph * 0.6), py = pointer.y * 0.2 * (1 - morph * 0.6);
    camera.position.copy(camPos).add(tmpA.set(px, py, 0));
    camera.lookAt(camLook);

    // pipeline furniture
    furniture.visible = morph > 0.02;
    if (furniture.visible) {
      lineMats.forEach((m) => { m.opacity = m.userData.base * morph; });
      nodeMats.forEach((mats, k) => {
        const near = 1 - clamp(Math.abs(state.stagePos - k) * 1.1, 0, 1);
        const rel = lerp(1, 0.1 + 0.9 * near, state.focus);
        mats.forEach((m) => { m.opacity = m.userData.base * morph * rel; });
      });
      spinners.forEach(({ g, spin }) => {
        g.rotation.x += spin.x * dt; g.rotation.y += spin.y * dt; g.rotation.z += spin.z * dt;
      });
      camera.updateMatrixWorld();
      labels.forEach((el, i) => {
        proj.copy(nodes[i]).add(tmpA.set(0, 1.5, 0)).project(camera);
        const onScreen = proj.z < 1 && Math.abs(proj.x) < 1.1 && Math.abs(proj.y) < 1.1;
        const show = onScreen && morph > 0.6 && ((state.p < 0.2 && !portraitLayout) || active === i);
        el.style.opacity = show ? (active === i ? 1 : 0.55) : 0;
        el.style.transform = `translate(${((proj.x + 1) / 2) * window.innerWidth}px, ${((1 - proj.y) / 2) * window.innerHeight}px) translate(-50%, -100%)`;
      });
    }

    renderer.render(scene, camera);
    root.classList.add('webgl-ready');

    // adaptive quality: drop to DPR 1 and fewer dots if the first seconds are slow
    if (!reduceMotion && ++frames > 30 && frames < 150) {
      if (dt > 0.034) slow++;
      if (frames === 149 && slow > 60 && dpr > 1) {
        dpr = 1; renderer.setPixelRatio(1); uniforms.uPx.value = 1; layout();
      }
    }

    if (!reduceMotion) requestAnimationFrame(frame);
    else { running = false; needsRender = false; }
  }

  window.addEventListener('resize', layout);
  if (reduceMotion) window.addEventListener('scroll', requestRender, { passive: true });
  layout();
  requestAnimationFrame(frame);
}
