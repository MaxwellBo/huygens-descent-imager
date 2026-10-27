import * as THREE from "../vendor/three.module.js";
import { INSTRUMENTS } from "./instruments.js";

// Karkoschka 20 m/pixel and 4 m/pixel mosaics. Both frames share a center,
// placed here on the touchdown point. North is up, east is to the right.
export const WIDE = { x0: -12500, z0: -16000, w: 25000, h: 32000 };
export const DETAIL = { x0: -2500, z0: -3200, w: 5000, h: 6400 };
export const MAX_ANGLE = (110 * Math.PI) / 180;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(url));
    image.src = url;
  });
}

function worldToCanvas(x, z, frame, width, height) {
  const u = (x - frame.x0) / frame.w;
  const v = (z - frame.z0) / frame.h;
  return [u * width, (1 - v) * height];
}

export async function createMaps() {
  const [wide, detail] = await Promise.all([
    loadImage("./data/mosaic-wide.png"),
    loadImage("./data/mosaic-detail.png"),
  ]);
  const colorTex = new THREE.Texture(wide);
  colorTex.colorSpace = THREE.NoColorSpace;
  colorTex.needsUpdate = true;
  colorTex.anisotropy = 8;
  const detailTex = new THREE.Texture(detail);
  detailTex.colorSpace = THREE.NoColorSpace;
  detailTex.needsUpdate = true;
  detailTex.anisotropy = 8;
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = wide.width;
  maskCanvas.height = wide.height;
  const maskCtx = maskCanvas.getContext("2d");
  maskCtx.fillStyle = "#000";
  maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
  const maskTex = new THREE.CanvasTexture(maskCanvas);
  maskTex.colorSpace = THREE.NoColorSpace;
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
    const [px, py] = worldToCanvas(p[0], p[1], WIDE, maskCtx.canvas.width, maskCtx.canvas.height);
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
uniform float uMap;
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  #include <logdepthbuf_fragment>
  float u = (vWorld.x - (${WIDE.x0.toFixed(1)})) / ${WIDE.w.toFixed(1)};
  float v = (vWorld.z - (${WIDE.z0.toFixed(1)})) / ${WIDE.h.toFixed(1)};
  vec3 col = vec3(0.42, 0.24, 0.14);
  float reveal = 0.0;
  if (uMap > 0.5 && u > 0.0 && u < 1.0 && v > 0.0 && v < 1.0) {
    vec2 uv = vec2(u, v);
    vec4 tex = texture2D(uColor, uv);
    float r0 = texture2D(uMask, uv).r;
    float r1 = texture2D(uMask, uv + vec2(0.004, 0.0)).r;
    float r2 = texture2D(uMask, uv - vec2(0.004, 0.0)).r;
    float r3 = texture2D(uMask, uv + vec2(0.0, 0.004)).r;
    float r4 = texture2D(uMask, uv - vec2(0.0, 0.004)).r;
    reveal = (r0 * 2.0 + r1 + r2 + r3 + r4) / 6.0;
    float edge = smoothstep(0.0, 0.045, u) * smoothstep(1.0, 0.955, u)
      * smoothstep(0.0, 0.04, v) * smoothstep(1.0, 0.96, v);
    col = mix(col, tex.rgb, edge);
  }
  float du = (vWorld.x - (${DETAIL.x0.toFixed(1)})) / ${DETAIL.w.toFixed(1)};
  float dv = (vWorld.z - (${DETAIL.z0.toFixed(1)})) / ${DETAIL.h.toFixed(1)};
  if (uMap > 0.5 && du > 0.0 && du < 1.0 && dv > 0.0 && dv < 1.0) {
    float blend = smoothstep(8000.0, 1500.0, uAlt);
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

  const sunAz = (115 * Math.PI) / 180;
  const sunEl = (50 * Math.PI) / 180;
  const sun = new THREE.Vector3(
    Math.sin(sunAz) * Math.cos(sunEl),
    Math.sin(sunEl),
    Math.cos(sunAz) * Math.cos(sunEl),
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
      uMap: { value: 0 },
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
