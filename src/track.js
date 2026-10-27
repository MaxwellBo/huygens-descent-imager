import { LANDING_S, LINK_END_S, STRIDE, TRACK, T0_MS } from "./timeline.js";
import { EVENTS, INSTRUMENTS, SUN_AZ } from "./instruments.js";

const STEP = 0.25;
const N = Math.ceil(LINK_END_S / STEP) + 2;
const yawTable = new Float32Array(N);
const spinTable = new Float32Array(N);
const turnsTable = new Float32Array(N);

// Positive spin is the designed counterclockwise sense, viewed from above.
// Azimuth is clockwise from north, so counterclockwise spin decreases it.
function spinCcwDeg(t) {
  if (t >= LANDING_S) return 0;
  const a = Math.sin(t * 0.017);
  const b = Math.sin(t * 0.0051 + 1.3);
  const c = Math.sin(t * 0.041);
  if (t < 500) return 5.8 * Math.exp(-t / 280);
  if (t < 900) {
    const u = (t - 500) / 400;
    return 1.0 * (1 - u) + -2.2 * u;
  }
  if (t < 3600) return -3.2 + 4.8 * a * b + 1.4 * c;
  return -3.1 + 0.7 * Math.sin(t * 0.01);
}

{
  let az = SUN_AZ;
  let turns = 0;
  for (let i = 0; i < N; i++) {
    const t = i * STEP;
    const sp = spinCcwDeg(t);
    spinTable[i] = sp;
    yawTable[i] = az;
    turnsTable[i] = turns;
    const rad = (sp * Math.PI) / 180;
    az -= rad * STEP;
    turns += (Math.abs(rad) * STEP) / (2 * Math.PI);
  }
}

function lerp(a, b, u) {
  return a + (b - a) * u;
}

function bracket(table, t) {
  const max = table.length - 1;
  const x = Math.max(0, Math.min(max, t / STEP));
  const i = Math.min(max - 1, Math.floor(x));
  return [i, x - i];
}

export function yawAt(t) {
  const [i, f] = bracket(yawTable, t);
  return lerp(yawTable[i], yawTable[i + 1], f);
}

export function spinAt(t) {
  const [i, f] = bracket(spinTable, t);
  return lerp(spinTable[i], spinTable[i + 1], f);
}

export function turnsAt(t) {
  const [i, f] = bracket(turnsTable, t);
  return lerp(turnsTable[i], turnsTable[i + 1], f);
}

function unpack(index) {
  const o = index * STRIDE;
  return {
    t: TRACK[o],
    altKm: TRACK[o + 1],
    vz: TRACK[o + 2],
    eastKm: TRACK[o + 3],
    northKm: TRACK[o + 4],
    tiltx: TRACK[o + 5],
    tilty: TRACK[o + 6],
    temp: TRACK[o + 7],
    pressure: TRACK[o + 8],
    agc: TRACK[o + 9],
    wind: TRACK[o + 10],
  };
}

export function sample(t) {
  const n = TRACK.length / STRIDE;
  if (t <= TRACK[0]) return unpack(0);
  const last = n - 1;
  if (t >= TRACK[last * STRIDE]) return unpack(last);
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (TRACK[mid * STRIDE] <= t) lo = mid;
    else hi = mid;
  }
  const a = unpack(lo);
  const b = unpack(hi);
  const f = (t - a.t) / Math.max(1e-4, b.t - a.t);
  return {
    t,
    altKm: lerp(a.altKm, b.altKm, f),
    vz: lerp(a.vz, b.vz, f),
    eastKm: lerp(a.eastKm, b.eastKm, f),
    northKm: lerp(a.northKm, b.northKm, f),
    tiltx: lerp(a.tiltx, b.tiltx, f),
    tilty: lerp(a.tilty, b.tilty, f),
    temp: lerp(a.temp, b.temp, f),
    pressure: lerp(a.pressure, b.pressure, f),
    agc: lerp(a.agc, b.agc, f),
    wind: lerp(a.wind, b.wind, f),
  };
}

export function cassiniElevation(t) {
  const f = Math.min(1, Math.max(0, t / LINK_END_S));
  return 58 * Math.cos(f * Math.PI * 0.5);
}

export function playbackRate(t) {
  return t < LANDING_S ? 40 : 100;
}

export function stateAt(t) {
  const clamped = Math.min(t, LANDING_S);
  const s = sample(clamped);
  let tiltx = s.tiltx;
  let tilty = s.tilty;
  if (t >= LANDING_S) {
    const u = Math.min(1, (t - LANDING_S) / 25);
    tiltx = lerp(tiltx, 7, u);
    tilty = lerp(tilty, -4, u);
  }
  const landed = t >= LANDING_S;
  return {
    t,
    landed,
    alt: landed ? 0 : s.altKm * 1000,
    altKm: landed ? 0 : s.altKm,
    vz: landed ? 0 : s.vz,
    east: landed ? 0 : s.eastKm * 1000,
    north: landed ? 0 : s.northKm * 1000,
    eastKm: landed ? 0 : s.eastKm,
    northKm: landed ? 0 : s.northKm,
    tiltx,
    tilty,
    temp: landed ? 93.7 : s.temp,
    pressure: landed ? 146700 : s.pressure,
    agc: s.agc,
    wind: landed ? 0 : s.wind,
    azimuth: yawAt(t),
    spin: spinAt(t),
    turns: turnsAt(t),
    elev: cassiniElevation(t),
    lamp: t >= 8745,
    stab: t >= 900,
    shieldOn: t < 32,
    coverOn: t < 66,
    booms: t >= 62,
  };
}

const PATTERN = [0, 1, 2, 0, 1, 4, 3, 0, 2, 5, 6, 8, 1, 0, 7, 9, 4, 2, 10, 0, 1, 11, 6, 0, 2, 1, 4];

export function buildExposures() {
  const list = [];
  let t = 70;
  let i = 0;
  while (t < LINK_END_S && list.length < 3500) {
    let inst = PATTERN[i % PATTERN.length];
    if (t > 8745 && i % 11 === 0) inst = 12;
    if (t < 8745 && inst === 12) inst = 0;
    const s = stateAt(t);
    list.push({
      t,
      inst,
      yaw: s.azimuth,
      x: s.east,
      z: s.north,
      alt: Math.max(1, s.alt),
    });
    t += t < LANDING_S ? 2.9 : 9.4;
    i++;
  }
  return list;
}

export function signalAt(t) {
  const s = stateAt(t);
  const az = s.azimuth;
  let agc = s.agc + 1.7 * Math.sin(az * 2) + 0.55 * Math.sin(az * 5 + 0.4);
  if (s.elev < 10) agc -= (10 - s.elev) * 2.5;
  if (t >= LINK_END_S - 2) agc = -160;
  return agc;
}

export function formatMission(t) {
  const x = Math.max(0, t);
  const h = Math.floor(x / 3600);
  const m = Math.floor(x / 60) % 60;
  const s = Math.floor(x % 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatUTC(t) {
  const d = new Date(T0_MS + t * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

export function eventsUpTo(t) {
  return EVENTS.filter((e) => e.t <= t + 0.001);
}

export { INSTRUMENTS, LANDING_S, LINK_END_S, SUN_AZ };
