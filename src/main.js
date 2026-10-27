import * as THREE from "../vendor/three.module.js";
import { createAudio } from "./audio.js";
import { drawCompass, drawSignal, drawSpectrum, layout, place, surfaceBoxes } from "./hud.js";
import { EVENTS, INSTRUMENTS } from "./instruments.js";
import { createProbe, createShield } from "./probe.js";
import { createSurface } from "./surface.js";
import { createMaps, createWorld, MAX_ANGLE, paintExposure } from "./terrain.js";
import { createTrajectory } from "./trajectory.js";
import {
  buildExposures,
  eventsUpTo,
  formatMission,
  formatUTC,
  LANDING_S,
  LINK_END_S,
  playbackRate,
  stateAt,
} from "./track.js";

const canvas = document.querySelector("#view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setClearColor(0xc4682c, 1);

const params = new URLSearchParams(location.search);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
let mission = Math.max(0, Math.min(LINK_END_S, Number(params.get("t")) || 0));
let playing = params.get("pause") !== "1" && !reduceMotion;
let mode = "film";
let scrubbing = false;

const maps = createMaps();
const world = createWorld(maps);
const worldProbe = createProbe();
const insetProbe = createProbe({ scaleFigure: true });
const shield = createShield();
const release = stateAt(32);
world.scene.add(worldProbe.root, shield.mesh);

const insetScene = new THREE.Scene();
insetScene.background = new THREE.Color(0x000000);
insetScene.add(insetProbe.root);
insetScene.add(new THREE.HemisphereLight(0xffc2a0, 0x1a120e, 0.75));
const insetKey = new THREE.DirectionalLight(0xfff6ea, 2.8);
insetKey.position.set(5, 9, 7);
const insetRim = new THREE.DirectionalLight(0xff7a3c, 1.15);
insetRim.position.set(-7, 2, -5);
insetScene.add(insetKey, insetRim);
const insetCam = new THREE.PerspectiveCamera(36, 1, 0.08, 80);
insetCam.position.set(7.2, 5.4, 15.6);
insetCam.lookAt(0.55, 4.6, 0);

const trajectory = createTrajectory();
const surface = createSurface();
const exposures = buildExposures();

const chase = new THREE.PerspectiveCamera(42, 1, 0.12, 1800000);
let orbitAz = 0.9;
let orbitEl = 0.28;
let orbitDist = 18;

const hud = new THREE.Scene();
const ortho = new THREE.OrthographicCamera(0, 1, 1, 0, -10, 10);
ortho.position.z = 6;

const fisheye = new THREE.Mesh(new THREE.CircleGeometry(0.5, 96), world.fisheyeMat);
const ring = new THREE.Mesh(
  new THREE.RingGeometry(0.48, 0.5, 96),
  new THREE.MeshBasicMaterial({ color: 0xe8e4dc, side: THREE.DoubleSide }),
);
const probeQuad = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ map: null }),
);
const trajQuad = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ map: null }),
);
const panelMats = [0, 1, 2].map(
  () => new THREE.MeshBasicMaterial({ map: null }),
);
const panelQuads = panelMats.map((mat) => new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat));
for (const mesh of [fisheye, ring, probeQuad, trajQuad, ...panelQuads]) {
  mesh.frustumCulled = false;
  hud.add(mesh);
}

const probeRT = target(640, 720);
const trajRT = target(640, 480);
const moonRT = target(512, 512);
const rawRT = target(512, 512);
const procRT = target(512, 512);
probeQuad.material.map = probeRT.texture;
trajQuad.material.map = trajRT.texture;
panelMats[0].map = moonRT.texture;
panelMats[1].map = rawRT.texture;
panelMats[2].map = procRT.texture;

const audio = createAudio();
let painted = 0;
let audioIndex = 0;
let eventIndex = 0;
let lastStamp = performance.now();

const ui = {
  utc: document.querySelector("#utc"),
  met: document.querySelector("#met"),
  events: document.querySelector("#events"),
  telem: document.querySelector("#telem"),
  meters: document.querySelector("#meters"),
  turns: document.querySelector("#turns"),
  spindir: document.querySelector("#spindir"),
  spinbar: document.querySelector("#spinbar"),
  spinrate: document.querySelector("#spinrate"),
  play: document.querySelector("#play"),
  scrub: document.querySelector("#scrub"),
  rate: document.querySelector("#rate"),
  mode: document.querySelector("#mode"),
  mute: document.querySelector("#mute"),
  sound: document.querySelector("#sound"),
  loading: document.querySelector("#loading"),
  ended: document.querySelector("#ended"),
  flyread: document.querySelector("#flyread"),
  flymet: document.querySelector("#flymet"),
  flyalt: document.querySelector("#flyalt"),
  site: document.querySelector("#site-dot"),
  rose: document.querySelector("#rose"),
  frames: {
    probe: document.querySelector("#frame-probe"),
    traj: document.querySelector("#frame-traj"),
    circle: document.querySelector("#frame-circle"),
    surface: document.querySelector("#frame-surface"),
    aside: document.querySelector("#aside"),
  },
};

const telemRows = [
  ["Altitude", "alt"],
  ["Descent", "vz"],
  ["Wind, model", "wind"],
  ["Pressure", "p"],
  ["Temperature", "temp"],
  ["Tilt", "tilt"],
  ["Cassini elev.", "elev"],
];
for (const [label, key] of telemRows) {
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.dataset.k = key;
  ui.telem.append(dt, dd);
}
const meterEls = INSTRUMENTS.map((inst) => {
  const row = document.createElement("div");
  row.className = "meter";
  row.style.setProperty("--c", inst.color);
  row.innerHTML = `<i></i><span>${inst.name}</span><b>0</b>`;
  ui.meters.append(row);
  return row;
});

ui.scrub.max = String(LINK_END_S);
ui.loading.hidden = true;

function target(w, h) {
  const rt = new THREE.WebGLRenderTarget(w, h);
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  return rt;
}

function exposureIndex(t) {
  let lo = 0;
  let hi = exposures.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (exposures[mid].t <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function syncMask(idx) {
  if (idx < painted) {
    maps.maskCtx.fillStyle = "#000";
    maps.maskCtx.fillRect(0, 0, maps.maskCanvas.width, maps.maskCanvas.height);
    painted = 0;
  }
  let changed = false;
  while (painted < idx) {
    paintExposure(maps.maskCtx, exposures[painted]);
    painted += 1;
    changed = true;
  }
  if (changed) maps.maskTex.needsUpdate = true;
}

function latestFlash(state, idx) {
  if (idx <= 0) return { r: 1, g: 1, b: 1, hot: false };
  const exp = exposures[idx - 1];
  const inst = INSTRUMENTS[exp.inst];
  return {
    r: inst.rgb[0],
    g: inst.rgb[1],
    b: inst.rgb[2],
    hot: state.t - exp.t < 12,
  };
}

function pushFlashes(state, idx) {
  const u = world.fisheyeMat.uniforms;
  const picked = [];
  for (let i = idx - 1; i >= 0 && picked.length < 4; i--) {
    const exp = exposures[i];
    if (state.t - exp.t > 16) break;
    const inst = INSTRUMENTS[exp.inst];
    if (inst.th0 == null) continue;
    picked.push({ exp, inst });
  }
  u.uFlashN.value = picked.length;
  u.uAzimuth.value = state.azimuth;
  for (let i = 0; i < 4; i++) {
    const item = picked[i];
    u.uFlashTh0.value[i] = item ? item.inst.th0 : 0;
    u.uFlashTh1.value[i] = item ? item.inst.th1 : 0;
    u.uFlashAz.value[i] = item ? item.exp.yaw : 0;
    u.uFlashHw.value[i] = item ? item.inst.hw : 0;
    u.uFlashA.value[i] = item ? 1 - (state.t - item.exp.t) / 16 : 0;
    if (item) u[`uFlashCol${i}`].value.set(item.inst.rgb[0], item.inst.rgb[1], item.inst.rgb[2]);
  }
}

function frameChase(state) {
  const focus = new THREE.Vector3(state.east, state.alt + 3.2, state.north);
  if (mode === "fly") {
    const h = Math.cos(orbitEl) * orbitDist;
    chase.position.set(
      state.east + Math.sin(orbitAz) * h,
      state.alt + 2.2 + Math.sin(orbitEl) * orbitDist,
      state.north + Math.cos(orbitAz) * h,
    );
    chase.lookAt(focus);
    return;
  }
  const az = 0.9;
  const el = 0.34;
  const dist = 24;
  const radial = Math.cos(el) * dist;
  chase.position.set(
    state.east + Math.sin(az) * radial,
    state.alt + 2.4 + Math.sin(el) * dist,
    state.north + Math.cos(az) * radial,
  );
  chase.lookAt(state.east + 5.5, state.alt + 3.4, state.north + 1.2);
}

function renderPass(rt, scene, camera, color) {
  renderer.setRenderTarget(rt);
  renderer.setViewport(0, 0, rt.width, rt.height);
  renderer.setClearColor(color, 1);
  renderer.clear(true, true, true);
  renderer.render(scene, camera);
}

function placeMesh(mesh, box, height, z = 0) {
  if (!box) {
    mesh.visible = false;
    return;
  }
  mesh.visible = true;
  mesh.position.set(box.x + box.w / 2, height - box.y - box.h / 2, z);
  mesh.scale.set(box.w, box.h, 1);
}

function applyChrome() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const box = layout(w, h, mode);
  const landed = mission >= LANDING_S;
  place(ui.frames.probe, box.probe);
  place(ui.frames.traj, box.traj);
  place(ui.frames.circle, landed ? null : box.circle);
  place(ui.frames.aside, box.aside);
  ui.frames.surface.hidden = !landed;
  if (landed) {
    const shots = surfaceBoxes(box.circle);
    [...ui.frames.surface.children].forEach((el, i) => place(el, shots[i]));
  }
  ui.flyread.hidden = mode !== "fly";
  document.body.classList.toggle("fly", mode === "fly");
  return box;
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  chase.aspect = w / h;
  chase.updateProjectionMatrix();
  ortho.left = 0;
  ortho.right = w;
  ortho.top = h;
  ortho.bottom = 0;
  ortho.updateProjectionMatrix();
  const box = applyChrome();
  if (box.probe) insetCam.aspect = box.probe.w / box.probe.h;
  insetCam.updateProjectionMatrix();
  if (box.traj) trajectory.resize(box.traj.w / box.traj.h);
  fit2d(document.querySelector("#compass"), box.aside ? box.aside.w - 8 : 180, 150);
  fit2d(document.querySelector("#spectrum"), box.aside ? box.aside.w - 8 : 220, 42);
  fit2d(document.querySelector("#signal"), box.aside ? box.aside.w - 8 : 220, 36);
}

const fitted = new WeakMap();
function fit2d(canvasEl, cssW, cssH) {
  if (!canvasEl) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(40, Math.floor(cssW));
  const h = Math.max(24, Math.floor(cssH));
  const prev = fitted.get(canvasEl);
  if (!prev || prev.w !== w || prev.h !== h) {
    canvasEl.width = Math.floor(w * dpr);
    canvasEl.height = Math.floor(h * dpr);
    canvasEl.style.width = `${w}px`;
    canvasEl.style.height = `${h}px`;
    fitted.set(canvasEl, { w, h, dpr });
  }
}

function paintHud() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const box = applyChrome();
  const landed = mission >= LANDING_S;
  placeMesh(fisheye, landed ? null : box.circle, h, 0);
  placeMesh(probeQuad, box.probe, h, 1);
  placeMesh(trajQuad, box.traj, h, 1);
  ring.visible = !landed && !!box.circle;
  if (ring.visible) {
    const radius = box.circle.w / 2;
    ring.geometry.dispose();
    ring.geometry = new THREE.RingGeometry(radius - 1.4, radius, 80);
    ring.position.set(
      box.circle.x + radius,
      h - box.circle.y - radius,
      2,
    );
    ring.scale.set(1, 1, 1);
  }
  const shots = landed ? surfaceBoxes(box.circle) : [null, null, null];
  panelQuads.forEach((quad, i) => placeMesh(quad, shots[i], h, 1));
  if (!landed && box.circle) positionSite(box.circle);
}

function positionSite(circle) {
  const state = stateAt(mission);
  const dx = -state.east;
  const dz = -state.north;
  const theta = Math.atan2(Math.hypot(dx, dz), Math.max(state.alt, 1));
  const bearing = Math.atan2(dx, dz);
  const frac = Math.min(1, theta / MAX_ANGLE) * 42;
  ui.site.style.left = `${50 + Math.sin(bearing) * frac}%`;
  ui.site.style.top = `${50 - Math.cos(bearing) * frac}%`;
  ui.site.classList.toggle("beyond", theta > MAX_ANGLE);
}

function syncDom(state) {
  ui.utc.textContent = formatUTC(state.t);
  ui.met.textContent = formatMission(state.t);
  ui.flymet.textContent = formatMission(state.t);
  ui.flyalt.textContent = `${state.altKm.toFixed(1)} km · ${Math.abs(state.vz).toFixed(1)} m/s down`;
  ui.rate.textContent = state.landed ? "100×" : "40×";
  ui.play.textContent = playing ? "Pause" : state.t >= LINK_END_S - 0.2 ? "Replay" : "Play";
  ui.ended.hidden = state.t < LINK_END_S - 0.2;
  if (!scrubbing) ui.scrub.value = String(state.t);
  const past = eventsUpTo(state.t).slice(-4);
  ui.events.replaceChildren(
    ...past.map((event) => {
      const li = document.createElement("li");
      li.textContent = `${formatMission(event.t)}  ${event.label}`;
      return li;
    }),
  );
  const tilt = Math.hypot(state.tiltx, state.tilty);
  const values = {
    alt: `${state.altKm.toFixed(2)} km`,
    vz: `${Math.abs(state.vz).toFixed(1)} m/s`,
    wind: `${state.wind.toFixed(1)} m/s`,
    p: `${(state.pressure / 100).toFixed(state.pressure > 5000 ? 0 : 2)} mbar`,
    temp: `${state.temp.toFixed(1)} K`,
    tilt: `${tilt.toFixed(1)}°`,
    elev: `${state.elev.toFixed(1)}°`,
  };
  for (const dd of ui.telem.querySelectorAll("dd")) dd.textContent = values[dd.dataset.k];
  const idx = exposureIndex(state.t);
  const counts = Array(INSTRUMENTS.length).fill(0);
  for (let i = 0; i < idx; i++) counts[exposures[i].inst] += 1;
  meterEls.forEach((row, i) => {
    const hot = idx > 0 && exposures[idx - 1].inst === i && state.t - exposures[idx - 1].t < 12;
    row.classList.toggle("on", hot);
    row.querySelector("b").textContent = String(counts[i]);
  });
  ui.turns.textContent = state.turns.toFixed(2);
  const dir = state.spin > 0.25 ? "CCW" : state.spin < -0.25 ? "CW" : "still";
  ui.spindir.textContent = dir;
  ui.spinrate.textContent = `${state.spin.toFixed(1)} °/s`;
  ui.spinbar.style.width = `${Math.min(100, (Math.abs(state.spin) / 8) * 100)}%`;

  const compass = document.querySelector("#compass");
  const spectrum = document.querySelector("#spectrum");
  const signal = document.querySelector("#signal");
  const cFit = fitted.get(compass);
  const sFit = fitted.get(spectrum);
  const gFit = fitted.get(signal);
  if (cFit) {
    const ctx = compass.getContext("2d");
    ctx.setTransform(cFit.dpr, 0, 0, cFit.dpr, 0, 0);
    drawCompass(ctx, cFit.w, cFit.h, state);
  }
  if (sFit) {
    const ctx = spectrum.getContext("2d");
    ctx.setTransform(sFit.dpr, 0, 0, sFit.dpr, 0, 0);
    drawSpectrum(ctx, sFit.w, sFit.h, state);
  }
  if (gFit) {
    const ctx = signal.getContext("2d");
    ctx.setTransform(gFit.dpr, 0, 0, gFit.dpr, 0, 0);
    drawSignal(ctx, gFit.w, gFit.h, state.t);
  }
}

function frame(now) {
  try {
  const dt = Math.min(0.05, (now - lastStamp) / 1000);
  lastStamp = now;
  if (playing && !scrubbing) {
    if (mission >= LINK_END_S - 0.05) playing = false;
    else mission = Math.min(LINK_END_S, mission + dt * playbackRate(mission));
  }
  const state = stateAt(mission);
  const idx = exposureIndex(mission);
  const missionStep = dt * playbackRate(Math.max(0, mission - dt));
  syncMask(idx);
  if (playing && idx > audioIndex && idx - audioIndex <= 6) audio.exposures(exposures.slice(audioIndex, idx));
  audioIndex = idx;
  if (eventIndex > 0 && EVENTS[eventIndex - 1].t > mission) {
    const next = EVENTS.findIndex((event) => event.t > mission);
    eventIndex = next < 0 ? EVENTS.length : next;
  }
  while (eventIndex < EVENTS.length && EVENTS[eventIndex].t <= mission) {
    if (playing && missionStep < 90) audio.event(EVENTS[eventIndex].id);
    eventIndex += 1;
  }
  audio.update(state, playing);

  const flash = latestFlash(state, idx);
  worldProbe.root.position.set(state.east, state.alt, state.north);
  worldProbe.update(state, flash);
  insetProbe.update(state, flash);
  shield.update(state, release);
  world.groundMat.uniforms.uAlt.value = Math.max(state.alt, 0);
  world.groundMat.uniforms.uProbe.value.set(state.east, state.north);
  world.groundMat.uniforms.uLamp.value = state.lamp ? 1 : 0;
  world.skyMat.uniforms.uCam.value.set(state.east, state.alt + 1, state.north);
  pushFlashes(state, idx);

  const probeWas = worldProbe.root.visible;
  const shieldWas = shield.mesh.visible;
  worldProbe.root.visible = false;
  shield.mesh.visible = false;
  world.cube.position.set(state.east, Math.max(state.alt, 4), state.north);
  if (!state.landed) world.cube.update(renderer, world.scene);
  worldProbe.root.visible = probeWas;
  shield.mesh.visible = shieldWas;

  frameChase(state);
  const viewW = renderer.domElement.width;
  const viewH = renderer.domElement.height;
  renderer.setRenderTarget(null);
  renderer.setViewport(0, 0, viewW, viewH);
  if (state.landed) {
    surface.setExposure(state.t);
    for (const view of [surface.moon, surface.raw, surface.processed]) {
      view.camera.aspect = 1;
      view.camera.updateProjectionMatrix();
    }
    renderPass(moonRT, surface.moon.scene, surface.moon.camera, 0x111111);
    renderPass(rawRT, surface.raw.scene, surface.raw.camera, 0x4a2e22);
    renderPass(procRT, surface.processed.scene, surface.processed.camera, 0x9a5a30);
    const cam = surface.processed.camera;
    cam.aspect = window.innerWidth / window.innerHeight;
    cam.updateProjectionMatrix();
    renderer.setRenderTarget(null);
    renderer.setViewport(0, 0, viewW, viewH);
    renderer.setClearColor(0x9a5a30, 1);
    renderer.render(surface.processed.scene, cam);
  } else {
    renderer.setClearColor(0xc4682c, 1);
    renderer.render(world.scene, chase);
  }
  trajectory.update(state);
  renderPass(probeRT, insetScene, insetCam, 0x000000);
  renderPass(trajRT, trajectory.scene, trajectory.camera, 0x000000);

  renderer.setRenderTarget(null);
  renderer.setViewport(0, 0, viewW, viewH);
  renderer.autoClear = false;
  renderer.clearDepth();
  paintHud();
  renderer.render(hud, ortho);
  renderer.autoClear = true;
  syncDom(state);
  window.__ready = true;
  } catch (error) {
    console.error(error);
  }
  requestAnimationFrame(frame);
}

ui.play.addEventListener("click", async () => {
  await audio.resume();
  ui.sound.hidden = true;
  if (mission >= LINK_END_S - 0.2) {
    mission = 0;
    playing = true;
  } else {
    playing = !playing;
  }
});
ui.mute.addEventListener("click", async () => {
  await audio.resume();
  audio.setMuted(!audio.muted);
  ui.mute.textContent = audio.muted ? "Sound" : "Mute";
  ui.sound.hidden = true;
});
ui.sound.addEventListener("click", async () => {
  await audio.resume();
  ui.sound.hidden = true;
});
ui.mode.addEventListener("click", () => {
  mode = mode === "film" ? "fly" : "film";
  ui.mode.textContent = mode === "film" ? "Fly alongside" : "Film layout";
  resize();
});
ui.scrub.addEventListener("pointerdown", () => {
  scrubbing = true;
});
ui.scrub.addEventListener("pointerup", () => {
  scrubbing = false;
});
ui.scrub.addEventListener("input", () => {
  mission = Number(ui.scrub.value);
});
window.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement) return;
  if (event.code === "Space") {
    event.preventDefault();
    ui.play.click();
  } else if (event.key === "m" || event.key === "M") ui.mute.click();
  else if (event.key === "c" || event.key === "C") ui.mode.click();
  else if (event.key === "ArrowRight") mission = Math.min(LINK_END_S, mission + (event.shiftKey ? 300 : 40));
  else if (event.key === "ArrowLeft") mission = Math.max(0, mission - (event.shiftKey ? 300 : 40));
});

let dragging = false;
let lastX = 0;
let lastY = 0;
canvas.addEventListener("pointerdown", (event) => {
  if (mode !== "fly") return;
  dragging = true;
  lastX = event.clientX;
  lastY = event.clientY;
});
window.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  orbitAz -= (event.clientX - lastX) * 0.005;
  orbitEl = Math.max(-0.15, Math.min(1.15, orbitEl + (event.clientY - lastY) * 0.004));
  lastX = event.clientX;
  lastY = event.clientY;
});
window.addEventListener("pointerup", () => {
  dragging = false;
});
canvas.addEventListener(
  "wheel",
  (event) => {
    if (mode !== "fly") return;
    orbitDist = Math.max(6, Math.min(90, orbitDist + event.deltaY * 0.015));
    event.preventDefault();
  },
  { passive: false },
);

window.addEventListener("resize", resize);
resize();
if (!playing) ui.play.textContent = "Play";
window.__huygens = {
  seek(t) {
    mission = Math.max(0, Math.min(LINK_END_S, t));
  },
  state: () => stateAt(mission),
  exposures: exposures.length,
};

requestAnimationFrame(frame);
