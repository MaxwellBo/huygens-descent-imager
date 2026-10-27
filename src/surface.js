import * as THREE from "../vendor/three.module.js";

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(url));
    image.src = url;
  });
}

function photoView(image, background) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);
  const tex = new THREE.Texture(image);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  const aspect = image.width / image.height;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(aspect, 1),
    new THREE.MeshBasicMaterial({ map: tex }),
  );
  scene.add(mesh);
  const camera = new THREE.OrthographicCamera(-aspect / 2, aspect / 2, 0.5, -0.5, 0.1, 10);
  camera.position.z = 2;
  return { scene, camera, tex, mesh, aspect };
}

export function fitPhoto(view, viewAspect, contain = false, anchor = "center") {
  const imageAspect = view.aspect;
  let halfH = 0.5;
  let halfW = imageAspect / 2;
  const wider = viewAspect > imageAspect;
  if (contain ? wider : !wider) halfW = halfH * viewAspect;
  else halfH = halfW / viewAspect;
  let top = halfH;
  let bottom = -halfH;
  if (anchor === "top") {
    top = 0.5;
    bottom = 0.5 - halfH * 2;
  }
  const camera = view.camera;
  camera.left = -halfW;
  camera.right = halfW;
  camera.top = top;
  camera.bottom = bottom;
  camera.updateProjectionMatrix();
}

export async function createSurface(rawList) {
  const [processedImg, moonImg, frames] = await Promise.all([
    loadImage("./data/surface-processed.jpg"),
    loadImage("./data/surface-moon.jpg"),
    Promise.all(rawList.map(async ([t, file]) => ({ t, image: await loadImage(`./data/${file}`) }))),
  ]);
  frames.sort((a, b) => a.t - b.t);
  const processed = photoView(processedImg, 0x1a100c);
  const moon = photoView(moonImg, 0x111111);
  const raw = photoView(frames[0]?.image || processedImg, 0x1a100c);
  const rawBasis = raw.aspect;
  let shown = -1;
  return {
    processed,
    raw,
    moon,
    setTime(t) {
      if (!frames.length) return;
      let lo = 0;
      let hi = frames.length - 1;
      if (t < frames[0].t) return;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (frames[mid].t <= t) lo = mid;
        else hi = mid - 1;
      }
      if (lo === shown) return;
      shown = lo;
      raw.tex.image = frames[lo].image;
      raw.tex.needsUpdate = true;
      raw.aspect = frames[lo].image.width / frames[lo].image.height;
      raw.mesh.scale.set(raw.aspect / rawBasis, 1, 1);
    },
  };
}
