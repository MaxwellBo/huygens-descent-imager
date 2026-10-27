import * as THREE from "../vendor/three.module.js";
import { INSTRUMENTS } from "./instruments.js";

export const MAP_X0 = -210000;
export const MAP_Z0 = -20000;
export const MAP_SIZE = 250000;
export const DETAIL_SIZE = 18000;
export const DETAIL_X0 = -DETAIL_SIZE / 2;
export const DETAIL_Z0 = -DETAIL_SIZE / 2;
export const MAX_ANGLE = (110 * Math.PI) / 180;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix, iy, seed) {
  const n = Math.sin(ix * 127.1 + iy * 311.7 + seed * 17.13) * 43758.5453;
  return n - Math.floor(n);
}

function noise(x, y, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x, y, seed) {
  let v = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < 5; i++) {
    v += a * noise(x * f, y * f, seed + i * 19);
    f *= 2;
    a *= 0.5;
  }
  return v;
}

function streams(seed, origins) {
  const rand = mulberry32(seed);
  const lines = [];
  for (const origin of origins) {
    let x = origin.x;
    let z = origin.z;
    let ang = origin.ang;
    const pts = [];
    const steps = origin.steps;
    for (let i = 0; i < steps; i++) {
      ang += (rand() - 0.5) * origin.wander;
      if (rand() < 0.04) ang += (rand() - 0.5) * 1.2;
      const sp = origin.step;
      x += Math.sin(ang) * sp;
      z += Math.cos(ang) * sp;
      pts.push({ x, z, w: origin.width * (0.45 + i / steps) });
      if (rand() < origin.branch && i > 8 && i < steps - 12) {
        lines.push(
          ...streams(seed + i * 17 + origin.x, [
            {
              x,
              z,
              ang: ang + (rand() - 0.5) * 1.1,
              steps: Math.floor(steps * 0.45),
              step: origin.step,
              width: origin.width * 0.55,
              wander: origin.wander,
              branch: 0,
            },
          ]),
        );
      }
    }
    lines.push(pts);
  }
  return lines;
}

function worldToCanvas(x, z, x0, z0, size, w, h) {
  const u = (x - x0) / size;
  const v = (z - z0) / size;
  return [u * w, (1 - v) * h];
}

function paintBase(ctx, w, h, x0, z0, size, seed, pebble) {
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const wx = x0 + (x / w) * size;
      const wz = z0 + (1 - y / h) * size;
      const n = fbm(wx * 0.00008, wz * 0.00008, seed);
      const n2 = fbm(wx * 0.00045, wz * 0.00045, seed + 3);
      // Bright highlands sit north and west of the landing site. The probe
      // comes down on the dark plain just south of that boundary.
      const highland = Math.exp(-((wx + 6000) ** 2) / 8e7 - (wz - 5000) ** 2 / 4.2e7);
      const farBright = Math.exp(-((wx + 70000) ** 2) / 6e9 - (wz - 15000) ** 2 / 3e9);
      const dark = Math.max(0, Math.min(1, (wx + 2000) / 14000));
      let bright = 0.18 + n * 0.22 + highland * 0.85 + farBright * 0.55 - dark * 0.12;
      bright += (n2 - 0.5) * 0.08;
      if (pebble) {
        const g = fbm(wx * 0.004, wz * 0.004, 9);
        bright += (g - 0.5) * 0.07;
      }
      bright = Math.max(0, Math.min(1, bright));
      const r = 28 + bright * 175;
      const g = 16 + bright * 130;
      const b = 12 + bright * 78;
      const i = (y * w + x) * 4;
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function strokeStreams(ctx, lines, x0, z0, size, w, h, alpha) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const line of lines) {
    if (line.length < 2) continue;
    ctx.beginPath();
    line.forEach((p, i) => {
      const [px, py] = worldToCanvas(p.x, p.z, x0, z0, size, w, h);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    const width = Math.max(0.6, ((line[0].w + line[line.length - 1].w) * 0.5 * w) / size);
    ctx.strokeStyle = `rgba(22, 12, 10, ${alpha})`;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.strokeStyle = `rgba(186, 154, 112, ${alpha * 0.35})`;
    ctx.lineWidth = Math.max(0.4, width * 0.28);
    ctx.stroke();
  }
}

export function createMaps() {
  const broad = document.createElement("canvas");
  broad.width = 768;
  broad.height = 768;
  const bctx = broad.getContext("2d", { willReadFrequently: true });
  paintBase(bctx, 768, 768, MAP_X0, MAP_Z0, MAP_SIZE, 2, false);
  const regional = streams(4, [
    { x: -90000, z: 18000, ang: 0.7, steps: 80, step: 1800, width: 900, wander: 0.4, branch: 0.08 },
    { x: -40000, z: 12000, ang: 1.1, steps: 70, step: 1400, width: 700, wander: 0.45, branch: 0.1 },
    { x: -15000, z: 8000, ang: 1.6, steps: 50, step: 900, width: 420, wander: 0.5, branch: 0.08 },
  ]);
  strokeStreams(bctx, regional, MAP_X0, MAP_Z0, MAP_SIZE, 768, 768, 0.55);

  const detail = document.createElement("canvas");
  detail.width = 1024;
  detail.height = 1024;
  const dctx = detail.getContext("2d", { willReadFrequently: true });
  paintBase(dctx, 1024, 1024, DETAIL_X0, DETAIL_Z0, DETAIL_SIZE, 5, true);
  const local = streams(11, [
    { x: -4200, z: 5200, ang: 2.4, steps: 46, step: 180, width: 70, wander: 0.55, branch: 0.18 },
    { x: -1800, z: 6100, ang: 2.15, steps: 42, step: 170, width: 55, wander: 0.6, branch: 0.16 },
    { x: 800, z: 4800, ang: 2.7, steps: 36, step: 160, width: 40, wander: 0.5, branch: 0.12 },
    { x: -2500, z: 1500, ang: 1.3, steps: 28, step: 140, width: 36, wander: 0.4, branch: 0.1 },
  ]);
  strokeStreams(dctx, local, DETAIL_X0, DETAIL_Z0, DETAIL_SIZE, 1024, 1024, 0.8);

  // Cobble grain in the last few hundred metres, where DISR actually resolves it.
  const rand = mulberry32(21);
  for (let i = 0; i < 1800; i++) {
    const x = (rand() - 0.5) * 700;
    const z = (rand() - 0.5) * 700 - 80;
    const [px, py] = worldToCanvas(x, z, DETAIL_X0, DETAIL_Z0, DETAIL_SIZE, 1024, 1024);
    const rad = 1.2 + rand() * 3.2;
    const shade = 70 + rand() * 130;
    dctx.fillStyle = `rgba(${shade}, ${shade * 0.72}, ${shade * 0.48}, 0.85)`;
    dctx.beginPath();
    dctx.ellipse(px, py, rad, rad * (0.65 + rand() * 0.4), rand() * 3, 0, Math.PI * 2);
    dctx.fill();
  }

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = 1024;
  maskCanvas.height = 1024;
  const maskCtx = maskCanvas.getContext("2d");
  maskCtx.fillStyle = "#000";
  maskCtx.fillRect(0, 0, 1024, 1024);

  const colorTex = new THREE.CanvasTexture(broad);
  colorTex.colorSpace = THREE.NoColorSpace;
  colorTex.wrapS = colorTex.wrapT = THREE.ClampToEdgeWrapping;
  const detailTex = new THREE.CanvasTexture(detail);
  detailTex.colorSpace = THREE.NoColorSpace;
  detailTex.wrapS = detailTex.wrapT = THREE.ClampToEdgeWrapping;
  detailTex.anisotropy = 8;
  const maskTex = new THREE.CanvasTexture(maskCanvas);
  maskTex.colorSpace = THREE.NoColorSpace;
  maskTex.wrapS = maskTex.wrapT = THREE.ClampToEdgeWrapping;
  maskTex.minFilter = THREE.LinearFilter;
  maskTex.magFilter = THREE.LinearFilter;

  return { colorTex, detailTex, maskTex, maskCtx, maskCanvas };
}

export function paintExposure(maskCtx, exp) {
  const inst = INSTRUMENTS[exp.inst];
  if (!inst?.paint || exp.alt <= 0) return;
  const steps = 5;
  const left = [];
  const right = [];
  for (let i = 0; i <= steps; i++) {
    const th = inst.th0 + ((inst.th1 - inst.th0) * i) / steps;
    if (th > 1.35) continue;
    const horiz = Math.tan(th) * exp.alt;
    const az0 = exp.yaw - inst.hw;
    const az1 = exp.yaw + inst.hw;
    left.push([exp.x + Math.sin(az0) * horiz, exp.z + Math.cos(az0) * horiz]);
    right.push([exp.x + Math.sin(az1) * horiz, exp.z + Math.cos(az1) * horiz]);
  }
  if (left.length < 2) return;
  maskCtx.beginPath();
  const move = (p, first) => {
    const [px, py] = worldToCanvas(p[0], p[1], MAP_X0, MAP_Z0, MAP_SIZE, maskCtx.canvas.width, maskCtx.canvas.height);
    if (first) maskCtx.moveTo(px, py);
    else maskCtx.lineTo(px, py);
  };
  move(left[0], true);
  for (let i = 1; i < left.length; i++) move(left[i], false);
  for (let i = right.length - 1; i >= 0; i--) move(right[i], false);
  maskCtx.closePath();
  const alpha = Math.min(0.72, 14000 / exp.alt);
  maskCtx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
  maskCtx.fill();
}

const groundVertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vec3 p = position;
  float r2 = p.x * p.x + p.z * p.z;
  p.y -= r2 / (2.0 * 2575000.0);
  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(vec3(p.x, p.y + 2575000.0, p.z));
  gl_Position = projectionMatrix * viewMatrix * world;
  #include <logdepthbuf_vertex>
}
`;

const groundFragment = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uColor;
uniform sampler2D uDetail;
uniform sampler2D uMask;
uniform float uAlt;
uniform vec2 uProbe;
uniform vec3 uSun;
uniform float uLamp;
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  #include <logdepthbuf_fragment>
  float u = (vWorld.x - ${MAP_X0.toFixed(1)}) / ${MAP_SIZE.toFixed(1)};
  float v = (vWorld.z - ${MAP_Z0.toFixed(1)}) / ${MAP_SIZE.toFixed(1)};
  vec3 col = vec3(0.42, 0.24, 0.14);
  float reveal = 0.0;
  float inside = smoothstep(0.0, 0.06, u) * smoothstep(1.0, 0.94, u) * smoothstep(0.0, 0.06, v) * smoothstep(1.0, 0.94, v);
  if (u > -0.02 && u < 1.02 && v > -0.02 && v < 1.02) {
    vec2 uv = clamp(vec2(u, v), 0.0, 1.0);
    vec3 tex = texture2D(uColor, uv).rgb;
    float r0 = texture2D(uMask, uv).r;
    float r1 = texture2D(uMask, uv + vec2(0.012, 0.0)).r;
    float r2 = texture2D(uMask, uv - vec2(0.012, 0.0)).r;
    float r3 = texture2D(uMask, uv + vec2(0.0, 0.012)).r;
    float r4 = texture2D(uMask, uv - vec2(0.0, 0.012)).r;
    reveal = (r0 * 2.0 + r1 + r2 + r3 + r4) / 6.0;
    col = mix(col, tex, inside);
  }
  float du = (vWorld.x - ${DETAIL_X0.toFixed(1)}) / ${DETAIL_SIZE.toFixed(1)};
  float dv = (vWorld.z - ${DETAIL_Z0.toFixed(1)}) / ${DETAIL_SIZE.toFixed(1)};
  if (du > 0.0 && du < 1.0 && dv > 0.0 && dv < 1.0) {
    float blend = smoothstep(16000.0, 3500.0, uAlt);
    col = mix(col, texture2D(uDetail, vec2(du, dv)).rgb, blend);
  }
  float ndl = max(dot(normalize(vNormal), normalize(uSun)), 0.0);
  col *= 0.48 + 0.62 * ndl;
  float dist = distance(vWorld.xz, uProbe);
  float haze = 1.0 - exp(-uAlt / 26000.0);
  haze = max(haze, 1.0 - exp(-dist / 42000.0));
  haze = clamp(haze, 0.0, 1.0);
  vec3 hazeCol = vec3(0.80, 0.44, 0.18);
  float clear = 1.0 - haze;
  float seen = clamp(clear * 0.78 + reveal * min(1.0, clear + 0.35), 0.0, 1.0);
  col = mix(hazeCol, col, seen);
  float pool = uLamp * exp(-length(vWorld.xz) / 22.0);
  col += vec3(1.0, 0.74, 0.38) * pool * clear;
  gl_FragColor = vec4(col, 1.0);
}
`;

const skyVertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
  #include <logdepthbuf_vertex>
}
`;

const skyFragment = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uSun;
uniform vec3 uCam;
varying vec3 vWorld;
void main() {
  #include <logdepthbuf_fragment>
  vec3 rd = normalize(vWorld - uCam);
  float up = rd.y;
  vec3 zenith = vec3(0.45, 0.16, 0.05);
  vec3 horizon = vec3(0.95, 0.58, 0.26);
  vec3 col = mix(horizon, zenith, smoothstep(-0.08, 0.62, up));
  float sun = pow(max(dot(rd, normalize(uSun)), 0.0), 160.0);
  col += vec3(1.0, 0.86, 0.55) * sun;
  col += vec3(1.0, 0.7, 0.4) * pow(max(dot(rd, normalize(uSun)), 0.0), 8.0) * 0.18;
  gl_FragColor = vec4(col, 1.0);
}
`;

const fisheyeFragment = /* glsl */ `
uniform samplerCube tCube;
uniform float uMax;
uniform float uAzimuth;
uniform int uFlashN;
uniform float uFlashTh0[4];
uniform float uFlashTh1[4];
uniform float uFlashAz[4];
uniform float uFlashHw[4];
uniform float uFlashA[4];
uniform vec3 uFlashCol0;
uniform vec3 uFlashCol1;
uniform vec3 uFlashCol2;
uniform vec3 uFlashCol3;
varying vec2 vUv;
float flashMask(float theta, float phi, float th0, float th1, float az, float hw) {
  float dphi = abs(atan(sin(phi - az), cos(phi - az)));
  float inTh = smoothstep(th0 - 0.03, th0 + 0.01, theta) * (1.0 - smoothstep(th1 - 0.01, th1 + 0.04, theta));
  float inPh = 1.0 - smoothstep(hw * 0.65, hw, dphi);
  return 0.62 * inTh * inPh;
}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float theta = r * uMax;
  float phi = atan(p.x, p.y);
  vec3 dir = normalize(vec3(sin(theta) * sin(phi), -cos(theta), sin(theta) * cos(phi)));
  vec3 col = textureCube(tCube, dir).rgb;
  float dline = abs(atan(sin(phi - uAzimuth), cos(phi - uAzimuth)));
  if (dline < 0.006 && theta > 0.18 && theta < 0.72) {
    col = mix(col, vec3(0.35, 1.0, 0.55), 0.75);
  }
  col = mix(col, uFlashCol0, flashMask(theta, phi, uFlashTh0[0], uFlashTh1[0], uFlashAz[0], uFlashHw[0]) * uFlashA[0] * step(0.5, float(uFlashN)));
  col = mix(col, uFlashCol1, flashMask(theta, phi, uFlashTh0[1], uFlashTh1[1], uFlashAz[1], uFlashHw[1]) * uFlashA[1] * step(1.5, float(uFlashN)));
  col = mix(col, uFlashCol2, flashMask(theta, phi, uFlashTh0[2], uFlashTh1[2], uFlashAz[2], uFlashHw[2]) * uFlashA[2] * step(2.5, float(uFlashN)));
  col = mix(col, uFlashCol3, flashMask(theta, phi, uFlashTh0[3], uFlashTh1[3], uFlashAz[3], uFlashHw[3]) * uFlashA[3] * step(3.5, float(uFlashN)));
  float vignette = smoothstep(1.0, 0.72, r);
  col *= 0.88 + 0.12 * vignette;
  gl_FragColor = vec4(col, 1.0);
}
`;

export function createWorld(maps) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xc4682c);

  const sun = new THREE.Vector3(
    Math.sin((100 * Math.PI) / 180) * Math.cos((18 * Math.PI) / 180),
    Math.sin((18 * Math.PI) / 180),
    Math.cos((100 * Math.PI) / 180) * Math.cos((18 * Math.PI) / 180),
  ).normalize();

  const groundMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: maps.colorTex },
      uDetail: { value: maps.detailTex },
      uMask: { value: maps.maskTex },
      uAlt: { value: 150000 },
      uProbe: { value: new THREE.Vector2() },
      uSun: { value: sun },
      uLamp: { value: 0 },
    },
    vertexShader: groundVertex,
    fragmentShader: groundFragment,
  });
  const groundGeo = new THREE.PlaneGeometry(2400000, 2400000, 180, 180);
  groundGeo.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.frustumCulled = false;
  scene.add(ground);

  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      uSun: { value: sun },
      uCam: { value: new THREE.Vector3() },
    },
    vertexShader: skyVertex,
    fragmentShader: skyFragment,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900000, 32, 24), skyMat);
  sky.frustumCulled = false;
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(0xff9966, 0x3a2218, 0.85);
  const key = new THREE.DirectionalLight(0xfff2dd, 2.4);
  key.position.copy(sun);
  const fill = new THREE.DirectionalLight(0xff8844, 0.6);
  fill.position.set(-1, 0.4, -0.5);
  scene.add(hemi, key, fill);

  const cubeRT = new THREE.WebGLCubeRenderTarget(320, {
    generateMipmaps: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  });
  const cube = new THREE.CubeCamera(1.5, 1600000, cubeRT);
  scene.add(cube);

  const fisheyeMat = new THREE.ShaderMaterial({
    uniforms: {
      tCube: { value: cubeRT.texture },
      uMax: { value: MAX_ANGLE },
      uAzimuth: { value: 0 },
      uFlashN: { value: 0 },
      uFlashTh0: { value: new Float32Array(4) },
      uFlashTh1: { value: new Float32Array(4) },
      uFlashAz: { value: new Float32Array(4) },
      uFlashHw: { value: new Float32Array(4) },
      uFlashA: { value: new Float32Array(4) },
      uFlashCol0: { value: new THREE.Vector3() },
      uFlashCol1: { value: new THREE.Vector3() },
      uFlashCol2: { value: new THREE.Vector3() },
      uFlashCol3: { value: new THREE.Vector3() },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: fisheyeFragment,
    depthTest: false,
    transparent: true,
  });

  return { scene, groundMat, skyMat, cube, fisheyeMat, sun };
}
