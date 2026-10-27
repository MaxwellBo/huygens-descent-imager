import * as THREE from "../vendor/three.module.js";
import { STRIDE, TRACK } from "./timeline.js";

const X0 = -200;
const X1 = 28;
const Y0 = -8;
const Y1 = 172;

function trackPoints() {
  const pts = [];
  const n = TRACK.length / STRIDE;
  for (let i = 0; i < n; i += 2) {
    pts.push({ t: TRACK[i * STRIDE], x: TRACK[i * STRIDE + 3], y: TRACK[i * STRIDE + 1] });
  }
  const last = (n - 1) * STRIDE;
  pts.push({ t: TRACK[last], x: TRACK[last + 3], y: TRACK[last + 1] });
  return pts;
}

function buildRibbon(points, half) {
  const seg = points.length - 1;
  const pos = new Float32Array(seg * 6 * 3);
  for (let i = 0; i < seg; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * half;
    const ny = (dx / len) * half;
    const o = i * 18;
    const quad = [
      a.x + nx, a.y + ny, 0,
      a.x - nx, a.y - ny, 0,
      b.x + nx, b.y + ny, 0,
      a.x - nx, a.y - ny, 0,
      b.x - nx, b.y - ny, 0,
      b.x + nx, b.y + ny, 0,
    ];
    pos.set(quad, o);
  }
  return pos;
}

export function createTrajectory() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const cx = (X0 + X1) / 2;
  const cy = (Y0 + Y1) / 2;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 30);
  camera.position.set(cx, cy, 12);
  camera.lookAt(cx, cy, 0);

  const grid = [];
  for (let x = -180; x <= 20; x += 40) grid.push(x, Y0, 0, x, Y1, 0);
  for (let y = 0; y <= 150; y += 50) grid.push(X0, y, 0, X1, y, 0);
  scene.add(
    new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(grid, 3)),
      new THREE.LineBasicMaterial({ color: 0x4a463f }),
    ),
  );
  scene.add(
    new THREE.Line(
      new THREE.BufferGeometry().setAttribute(
        "position",
        new THREE.Float32BufferAttribute([X0, 0, 0, X1, 0, 0, X0, 0, 0, X0, Y1, 0], 3),
      ),
      new THREE.LineBasicMaterial({ color: 0x8a847c }),
    ),
  );

  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(7.2, 0);
  shape.lineTo(3.4, 8.849);
  shape.closePath();
  const everest = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({ color: 0xf2f2f2, side: THREE.DoubleSide }),
  );
  everest.position.set(-184, 0, 0.2);
  scene.add(everest);

  const points = trackPoints();
  const ribbon = new THREE.BufferAttribute(buildRibbon(points, 1.6), 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", ribbon);
  geo.setDrawRange(0, 0);
  const path = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x3dff6e, side: THREE.DoubleSide }));
  scene.add(path);

  const craft = new THREE.Mesh(
    new THREE.CircleGeometry(3.2, 20),
    new THREE.MeshBasicMaterial({ color: 0xefffbf, side: THREE.DoubleSide }),
  );
  const dropGeo = new THREE.BufferGeometry().setAttribute(
    "position",
    new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3),
  );
  const drop = new THREE.Line(dropGeo, new THREE.LineBasicMaterial({ color: 0x3dff6e }));
  scene.add(drop);
  scene.add(craft);

  const sun = new THREE.ArrowHelper(new THREE.Vector3(1, 0.18, 0).normalize(), new THREE.Vector3(-8, 156, 1), 18, 0xffb020, 4, 2.2);
  const cassini = new THREE.ArrowHelper(new THREE.Vector3(-0.7, 0.5, 0).normalize(), new THREE.Vector3(-168, 156, 1), 18, 0x3cb4ff, 4, 2.2);
  scene.add(sun, cassini);

  return {
    scene,
    camera,
    resize(aspect) {
      const worldW = X1 - X0;
      const worldH = Y1 - Y0;
      let halfW = worldW / 2;
      let halfH = worldH / 2;
      if (aspect > worldW / worldH) halfW = halfH * aspect;
      else halfH = halfW / aspect;
      camera.left = -halfW;
      camera.right = halfW;
      camera.top = halfH;
      camera.bottom = -halfH;
      camera.updateProjectionMatrix();
    },
    update(state) {
      let n = 0;
      for (let i = 0; i < points.length; i++) {
        if (points[i].t <= state.t) n = i;
        else break;
      }
      geo.setDrawRange(0, Math.max(0, n) * 6);
      craft.position.set(state.eastKm, state.altKm, 1);
      const dropPos = drop.geometry.attributes.position;
      dropPos.setXYZ(0, state.eastKm, state.altKm, 0.5);
      dropPos.setXYZ(1, state.eastKm, 0, 0.5);
      dropPos.needsUpdate = true;
      const el = state.elev / 58;
      cassini.setDirection(new THREE.Vector3(-0.85, 0.15 + el * 0.9, 0).normalize());
    },
  };
}
