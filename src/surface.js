import * as THREE from "../vendor/three.module.js";

function sandTexture(tint) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4000; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const v = 80 + Math.random() * 140;
    ctx.fillStyle = `rgba(${v}, ${v * 0.8}, ${v * 0.55}, 0.35)`;
    ctx.fillRect(x, y, 1.4, 1.4);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

function buildRocks(material, seedShift, scale) {
  const group = new THREE.Group();
  const geo = new THREE.IcosahedronGeometry(1, 1);
  let s = seedShift;
  const rand = () => {
    s = (s * 16807 + 11) % 2147483647;
    return (s & 0x7fffffff) / 2147483647;
  };
  for (let i = 0; i < 70; i++) {
    const rock = new THREE.Mesh(geo, material);
    const r = 0.035 + rand() * rand() * 0.12;
    rock.scale.set(r * (0.8 + rand() * 0.6), r * (0.45 + rand() * 0.35), r * (0.8 + rand() * 0.5));
    const spread = i < 16 ? 1.6 : 3.4;
    rock.position.set((rand() - 0.5) * spread * scale, rock.scale.y * 0.85, rand() * 2.8 * scale + 0.15);
    rock.rotation.set(rand() * 3, rand() * 6, rand() * 3);
    group.add(rock);
  }
  return group;
}

function makeScene({ sand, rockColor, sky, lamp, harsh }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(sky);
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(8, 40),
    new THREE.MeshStandardMaterial({ map: sandTexture(sand), roughness: 1, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const rockMat = new THREE.MeshStandardMaterial({
    color: rockColor,
    roughness: harsh ? 0.92 : 0.72,
    metalness: harsh ? 0.02 : 0.08,
  });
  scene.add(buildRocks(rockMat, harsh ? 9 : 3, 1));
  scene.add(new THREE.HemisphereLight(harsh ? 0xffffff : 0xffc49a, harsh ? 0x888888 : 0x3a241c, harsh ? 0.85 : 0.55));
  const sun = new THREE.DirectionalLight(harsh ? 0xffffff : 0xffe0b0, harsh ? 3.2 : 0.9);
  sun.position.set(-1.5, 2.2, 0.4);
  scene.add(sun);
  let spot = null;
  if (lamp) {
    spot = new THREE.SpotLight(0xffc07a, 28, 7, 0.7, 0.45, 1.2);
    spot.position.set(-0.15, 0.55, -0.2);
    spot.target.position.set(0.2, 0, 1.3);
    scene.add(spot, spot.target);
    const dish = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 16, 10, 0, Math.PI * 2, 0, 1.15),
      new THREE.MeshStandardMaterial({
        color: 0xffd27a,
        metalness: 1,
        roughness: 0.18,
        emissive: 0xffaa33,
        emissiveIntensity: 0.8,
        side: THREE.DoubleSide,
      }),
    );
    dish.position.set(-0.18, 0.16, -0.05);
    scene.add(dish);
  }
  const camera = new THREE.PerspectiveCamera(52, 1, 0.02, 20);
  camera.position.set(0.05, 0.46, -0.15);
  camera.lookAt(0.12, 0.04, 1.25);
  return { scene, camera, spot };
}

export function createSurface() {
  const processed = makeScene({ sand: "#6a4a32", rockColor: 0x8a6244, sky: 0x9a5a30, lamp: true, harsh: false });
  const raw = makeScene({ sand: "#3a2a22", rockColor: 0x5c4034, sky: 0x4a2e22, lamp: true, harsh: false });
  const moon = makeScene({ sand: "#8a8a8a", rockColor: 0x9a9a9a, sky: 0x111111, lamp: false, harsh: true });
  return {
    processed,
    raw,
    moon,
    setExposure(mission) {
      const blink = 0.45 + 0.55 * Math.abs(Math.sin(mission * 0.55));
      if (raw.spot) raw.spot.intensity = 8 + blink * 36;
      if (processed.spot) processed.spot.intensity = 26;
    },
  };
}
