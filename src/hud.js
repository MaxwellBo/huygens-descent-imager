import { SUN_AZ } from "./instruments.js";
import { signalAt } from "./track.js";

export function layout(w, h, mode) {
  const header = 56;
  const footer = 68;
  if (mode === "fly") {
    const s = Math.min(240, Math.max(150, h * 0.28));
    return {
      header,
      footer,
      mode,
      circle: { x: 16, y: h - footer - s - 14, w: s, h: s },
      probe: null,
      traj: { x: 16, y: header + 12, w: Math.min(320, w * 0.28), h: 156 },
      aside: null,
    };
  }
  const right = Math.min(300, Math.max(220, w * 0.2));
  const usableH = h - header - footer;
  const circle = Math.max(220, Math.min(usableH - 24, (w - right) * 0.5));
  const x = w - right - circle - 18;
  const y = header + (usableH - circle) / 2;
  return {
    header,
    footer,
    mode,
    circle: { x, y, w: circle, h: circle },
    probe: { x: 14, y: header + 8, w: Math.min(250, w * 0.2), h: Math.min(300, usableH * 0.42) },
    traj: { x: 14, y: h - footer - Math.min(210, usableH * 0.3) - 8, w: Math.min(300, w * 0.24), h: Math.min(210, usableH * 0.3) },
    aside: { x: w - right + 6, y: header + 4, w: right - 14, h: usableH - 6 },
  };
}

export function surfaceBoxes(circle) {
  const gap = 10;
  const side = Math.min((circle.w - gap * 2) / 3, circle.h - 28);
  const total = side * 3 + gap * 2;
  const x0 = circle.x + (circle.w - total) / 2;
  const y = circle.y + (circle.h - side) / 2 + 8;
  return [0, 1, 2].map((i) => ({ x: x0 + i * (side + gap), y, w: side, h: side }));
}

function polar(cx, cy, az, r) {
  return [cx + Math.sin(az) * r, cy - Math.cos(az) * r];
}

export function drawCompass(ctx, w, h, state) {
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2 + 2;
  const r = Math.min(w, h) * 0.36;
  ctx.strokeStyle = "rgba(232,228,220,0.85)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#8d867e";
  ctx.font = "11px Helvetica, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const labels = [
    [0, "N"],
    [Math.PI / 2, "E"],
    [Math.PI, "S"],
    [-Math.PI / 2, "W"],
  ];
  for (const [az, text] of labels) {
    const [x, y] = polar(cx, cy, az, r + 12);
    ctx.fillText(text, x, y);
  }
  for (let i = 0; i < 8; i++) {
    const az = (i * Math.PI) / 4;
    const a = polar(cx, cy, az, r - 4);
    const b = polar(cx, cy, az, r);
    ctx.strokeStyle = "rgba(232,228,220,0.45)";
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }
  const sun = polar(cx, cy, SUN_AZ, r - 2);
  ctx.fillStyle = "#ffb020";
  ctx.beginPath();
  ctx.arc(sun[0], sun[1], 4, 0, Math.PI * 2);
  ctx.fill();
  const cassiniAz = (250 * Math.PI) / 180;
  const cassiniR = r * (0.28 + 0.7 * (state.elev / 58));
  const cas = polar(cx, cy, cassiniAz, cassiniR);
  ctx.fillStyle = "#3cb4ff";
  ctx.beginPath();
  ctx.arc(cas[0], cas[1], 4, 0, Math.PI * 2);
  ctx.fill();

  const tip = polar(cx, cy, state.azimuth, r - 8);
  ctx.strokeStyle = "#3dff6e";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(tip[0], tip[1]);
  ctx.stroke();
  ctx.fillStyle = "#3dff6e";
  ctx.beginPath();
  ctx.arc(tip[0], tip[1], 3.5, 0, Math.PI * 2);
  ctx.fill();
}

export function drawSpectrum(ctx, w, h, state) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#120e0c";
  ctx.fillRect(0, 0, w, h);
  const depth = Math.max(0, Math.min(1, (90 - state.altKm) / 90));
  const bands = [0.18, 0.31, 0.46, 0.57, 0.69, 0.84];
  for (let x = 0; x < w; x++) {
    const u = x / w;
    let bright = 0.78 - u * 0.18;
    for (const b of bands) {
      const d = u - b;
      bright -= depth * 0.62 * Math.exp(-(d * d) / 0.00055);
    }
    if (state.lamp) bright = Math.min(0.92, bright + 0.22);
    bright = Math.max(0.05, bright);
    const y = h - 3 - bright * (h - 8);
    ctx.strokeStyle = `hsl(${24 + u * 18}, 75%, ${28 + bright * 38}%)`;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, h - 2);
    ctx.lineTo(x + 0.5, y);
    ctx.stroke();
  }
}

export function drawSignal(ctx, w, h, t) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#120e0c";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#3cb4ff";
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  const n = Math.max(2, Math.floor(w));
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const time = t * u;
    const agc = signalAt(time);
    const y = h - 4 - Math.max(0, Math.min(1, (agc + 140) / 32)) * (h - 8);
    if (i === 0) ctx.moveTo(i, y);
    else ctx.lineTo(i, y);
  }
  ctx.stroke();
}

export function place(el, box) {
  if (!el) return;
  if (!box) {
    el.style.display = "none";
    return;
  }
  el.style.display = "block";
  el.style.left = `${box.x}px`;
  el.style.top = `${box.y}px`;
  el.style.width = `${box.w}px`;
  el.style.height = `${box.h}px`;
}
