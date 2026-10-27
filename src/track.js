import { LANDING_S, LINK_END_S, STRIDE, TRACK, T0_MS } from "./timeline.js";
import { EVENTS } from "./instruments.js";

// DISR descent parameters: time, east m, north m, rotation count, sun azimuth deg.
let ATT = null;

function yawFrom(rot, sunDeg) {
  const frac = rot - Math.floor(rot);
  return (((sunDeg + frac * 360) % 360) * Math.PI) / 180;
}

export function applyAttitude(rows) {
  ATT = rows;
  const n = TRACK.length / STRIDE;
  for (let i = 0; i < n; i++) {
    const t = TRACK[i * STRIDE];
    const a = attitudeAt(Math.min(t, LANDING_S));
    const b = attitudeAt(Math.min(t + 2, LANDING_S));
    TRACK[i * STRIDE + 3] = a.east / 1000;
    TRACK[i * STRIDE + 4] = a.north / 1000;
    TRACK[i * STRIDE + 10] = t >= LANDING_S ? 0 : (b.east - a.east) / 2;
  }
}

function attitudeAt(t) {
  const rows = ATT;
  const last = rows.length - 1;
  let lo = 0;
  let hi = last;
  if (t <= rows[0][0]) hi = 1;
  else if (t >= rows[last][0]) lo = last - 1;
  else {
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (rows[mid][0] <= t) lo = mid;
      else hi = mid;
    }
  }
  const a = rows[lo];
  const b = rows[hi];
  const f = a === b ? 0 : (t - a[0]) / (b[0] - a[0]);
  const rot = a[3] + (b[3] - a[3]) * f;
  const sun = a[4] + (b[4] - a[4]) * f;
  const dt = Math.max(0.5, b[0] - a[0]);
  return {
    east: a[1] + (b[1] - a[1]) * f,
    north: a[2] + (b[2] - a[2]) * f,
    rot,
    sun,
    azimuth: yawFrom(rot, sun),
    // Rotation count increases clockwise, so a falling count is counterclockwise.
    spin: (-(b[3] - a[3]) / dt) * 360,
  };
}

function lerp(a, b, u) {
  return a + (b - a) * u;
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
  const pose = attitudeAt(Math.min(t, LANDING_S));
  return {
    t,
    landed,
    alt: landed ? 0 : s.altKm * 1000,
    altKm: landed ? 0 : s.altKm,
    vz: landed ? 0 : s.vz,
    east: landed ? 0 : pose.east,
    north: landed ? 0 : pose.north,
    eastKm: landed ? 0 : pose.east / 1000,
    northKm: landed ? 0 : pose.north / 1000,
    tiltx,
    tilty,
    temp: landed ? 93.7 : s.temp,
    pressure: landed ? 146700 : s.pressure,
    agc: s.agc,
    wind: landed ? 0 : s.wind,
    azimuth: pose.azimuth,
    spin: landed ? 0 : pose.spin,
    turns: pose.rot,
    sunAz: (pose.sun * Math.PI) / 180,
    elev: cassiniElevation(t),
    lamp: t >= 8734,
    stab: t >= 900,
    shieldOn: t < 32,
    coverOn: t < 66,
    booms: t >= 62,
  };
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

export { LANDING_S, LINK_END_S };
