import * as THREE from "../vendor/three.module.js";

const ORANGE = 0xe25a12;
const CLOTH = 0xf4f1ea;
const GOLD = 0xc6862a;

function canopyCloth() {
  const group = new THREE.Group();
  const pts = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const y = t * 2.05;
    const r = 4.15 * (1 - t * 0.8) + 0.12;
    pts.push(new THREE.Vector2(r, y));
  }
  const gores = 10;
  const full = (Math.PI * 2) / gores;
  for (let i = 0; i < gores; i++) {
    const geo = new THREE.LatheGeometry(pts, 5, i * full, full * 0.9);
    const mat = new THREE.MeshStandardMaterial({
      color: i % 2 === 0 ? ORANGE : CLOTH,
      roughness: 0.86,
      metalness: 0.02,
      side: THREE.DoubleSide,
    });
    group.add(new THREE.Mesh(geo, mat));
  }
  const linePos = [];
  const rimR = pts[0].x;
  const rimY = pts[0].y;
  for (let i = 0; i < gores; i++) {
    const a = (i + 0.5) * full;
    linePos.push(Math.cos(a) * rimR, rimY, Math.sin(a) * rimR, 0, -6.5, 0);
  }
  const lines = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(linePos, 3)),
    new THREE.LineBasicMaterial({ color: 0xd9d3c7 }),
  );
  group.add(lines);
  return group;
}

function humanFigure() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.55, metalness: 0.05 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 12), mat);
  head.position.y = 1.58;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.38, 4, 8), mat);
  torso.position.y = 1.16;
  const hip = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), mat);
  hip.position.y = 0.86;
  const mkLimb = (x, y, len, rad, rot) => {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(rad, len, 3, 6), mat);
    m.position.set(x, y, 0);
    if (rot) m.rotation.z = rot;
    return m;
  };
  g.add(
    head,
    torso,
    hip,
    mkLimb(-0.08, 0.42, 0.55, 0.055, 0),
    mkLimb(0.08, 0.42, 0.55, 0.055, 0),
    mkLimb(-0.24, 1.18, 0.36, 0.042, 0.18),
    mkLimb(0.24, 1.18, 0.36, 0.042, -0.18),
  );
  g.position.set(1.9, 0, 0);
  return g;
}

export function createProbe({ scaleFigure = false } = {}) {
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  const yaw = new THREE.Group();
  root.add(tilt);
  tilt.add(yaw);

  const gold = new THREE.MeshStandardMaterial({
    color: GOLD,
    metalness: 0.82,
    roughness: 0.34,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x2c2926,
    metalness: 0.4,
    roughness: 0.55,
  });
  const deck = new THREE.MeshStandardMaterial({
    color: 0x4a4038,
    metalness: 0.25,
    roughness: 0.7,
  });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.7, 0.52, 28), gold);
  body.position.y = 0.42;
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.62, 0.16, 28), deck);
  skirt.position.y = 0.1;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.64, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2), gold);
  dome.position.y = 0.62;
  dome.scale.y = 0.55;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.42, 10), dark);
  mast.position.y = 1.02;
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 12), dark);
  collar.position.y = 0.8;
  yaw.add(body, skirt, dome);
  tilt.add(mast, collar);

  const boomGeo = new THREE.CylinderGeometry(0.015, 0.015, 1.15, 6);
  const boomMat = new THREE.MeshStandardMaterial({ color: 0xc5bfb4, metalness: 0.6, roughness: 0.35 });
  const boomL = new THREE.Mesh(boomGeo, boomMat);
  const boomR = new THREE.Mesh(boomGeo, boomMat);
  boomL.rotation.z = Math.PI / 2;
  boomR.rotation.z = Math.PI / 2;
  boomL.position.set(-1.05, 0.55, 0);
  boomR.position.set(1.05, 0.55, 0);
  yaw.add(boomL, boomR);

  const lensMat = new THREE.MeshStandardMaterial({
    color: 0x111111,
    emissive: 0x000000,
    emissiveIntensity: 0,
    metalness: 0.2,
    roughness: 0.25,
  });
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 12), lensMat);
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, 0.2, 0.68);
  const cover = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 0.05, 12),
    new THREE.MeshStandardMaterial({ color: 0x8a8178, metalness: 0.5, roughness: 0.4 }),
  );
  cover.rotation.x = Math.PI / 2;
  cover.position.set(0, 0.2, 0.74);
  yaw.add(lens, cover);

  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xffd27a,
    metalness: 1,
    roughness: 0.22,
    emissive: 0xffaa33,
    emissiveIntensity: 0,
  });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 10, 0, Math.PI * 2, 0, 1.15), lampMat);
  lamp.position.set(0.22, 0.12, 0.48);
  yaw.add(lamp);
  const lampLight = new THREE.PointLight(0xffbb66, 0, 8, 2);
  lampLight.position.copy(lamp.position);
  yaw.add(lampLight);

  const chute = canopyCloth();
  tilt.add(chute);

  let figure = null;
  if (scaleFigure) {
    figure = humanFigure();
    root.add(figure);
    const barGeo = new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute([2.62, 0, 0, 2.62, 1.75, 0, 2.5, 0, 0, 2.74, 0, 0, 2.5, 1.75, 0, 2.74, 1.75, 0], 3),
    );
    root.add(new THREE.LineSegments(barGeo, new THREE.LineBasicMaterial({ color: 0xffffff })));
  }

  const shieldMat = new THREE.MeshStandardMaterial({
    color: 0x6d655c,
    metalness: 0.45,
    roughness: 0.48,
    emissive: 0xff6a2a,
    emissiveIntensity: 0.35,
  });
  const shield = new THREE.Mesh(new THREE.ConeGeometry(1.32, 0.72, 28), shieldMat);
  shield.rotation.x = Math.PI;
  shield.position.y = -0.28;
  tilt.add(shield);

  function setChute(stabAmount) {
    const scale = 1 + (0.36 - 1) * stabAmount;
    chute.scale.setScalar(scale);
    chute.position.y = 1.25 + 6.5 * scale;
  }
  setChute(0);

  return {
    root,
    shield,
    update(state, flash) {
      const tx = Math.max(-50, Math.min(50, state.tiltx)) * (Math.PI / 180);
      const ty = Math.max(-50, Math.min(50, state.tilty)) * (Math.PI / 180);
      const wob = Math.sin(state.t * 0.32) * Math.min(0.05, Math.hypot(tx, ty) * 0.08);
      tilt.rotation.z = -tx * 0.55 + wob;
      tilt.rotation.x = ty * 0.55;
      chute.rotation.z = -tx * 0.4;
      chute.rotation.x = ty * 0.28;
      // Navigation azimuth is clockwise from north; three.js yaw is the opposite sense.
      yaw.rotation.y = -state.azimuth;
      const stab = state.stab ? Math.min(1, (state.t - 900) / 18) : 0;
      setChute(stab);
      shield.visible = state.shieldOn;
      const heat = Math.max(0, 1 - state.t / 90);
      shieldMat.emissiveIntensity = heat * 0.7;
      cover.visible = state.coverOn || state.t < 74;
      if (!state.coverOn) {
        const dt = state.t - 66;
        cover.position.set(0.15 * dt, 0.2 + 0.35 * dt, 0.74 + dt);
        cover.visible = dt < 6;
      } else {
        cover.position.set(0, 0.2, 0.74);
      }
      const boomScale = state.booms ? Math.min(1, (state.t - 62) / 8) : 0;
      boomL.scale.x = boomScale;
      boomR.scale.x = boomScale;
      lampMat.emissiveIntensity = state.lamp ? 1.4 : 0;
      lampLight.intensity = state.lamp ? 4 : 0;
      if (flash && flash.hot) {
        lensMat.emissive.setRGB(flash.r, flash.g, flash.b);
        lensMat.emissiveIntensity = 1.6;
      } else {
        lensMat.emissiveIntensity = 0;
      }
    },
  };
}

export function createShield() {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x6d655c,
    metalness: 0.5,
    roughness: 0.42,
    emissive: 0xff6a2a,
    emissiveIntensity: 0.4,
  });
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(1.32, 0.72, 24), mat);
  mesh.rotation.x = Math.PI;
  return {
    mesh,
    update(state, release) {
      const heat = Math.max(0, 1 - state.t / 90);
      mat.emissiveIntensity = heat * 0.8;
      if (state.t < 32) {
        mesh.visible = true;
        mesh.position.set(state.east, state.alt - 0.55, state.north);
        return;
      }
      const dt = state.t - 32;
      const y = release.alt - 0.55 - 0.5 * 1.352 * dt * dt;
      mesh.position.set(release.east + dt * 14, y, release.north + dt * 5);
      mesh.rotation.z = dt * 0.4;
      mesh.visible = y > -50 && dt < 50;
    },
  };
}
