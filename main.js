import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { PLYLoader } from "three/addons/loaders/PLYLoader.js";

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

const viewport = document.getElementById("viewport");
const fileInput = document.getElementById("file-input");
const filenameLabel = document.getElementById("filename");
const colorInput = document.getElementById("color-input");
const wireframeInput = document.getElementById("wireframe-input");
const resetButton = document.getElementById("reset-view");
const rotateGizmoButton = document.getElementById("rotate-gizmo");
const screenshotButton = document.getElementById("screenshot");
const loadingBadge = document.getElementById("loading");
const hint = document.getElementById("hint");

const PLATFORM_SIZE = 200;
const DEFAULT_CAMERA_POS = new THREE.Vector3(220, -320, 240);
const DEFAULT_TARGET = new THREE.Vector3(0, 0, 0);

function makeGradientTexture(topHex, bottomHex) {
  const c = document.createElement("canvas");
  c.width = 2;
  c.height = 256;
  const ctx = c.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, topHex);
  grad.addColorStop(1, bottomHex);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const scene = new THREE.Scene();
scene.background = makeGradientTexture("#d6dce3", "#aab1ba");

const camera = new THREE.PerspectiveCamera(
  45,
  viewport.clientWidth / viewport.clientHeight,
  0.1,
  10000,
);
camera.position.copy(DEFAULT_CAMERA_POS);
camera.lookAt(DEFAULT_TARGET);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
viewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.copy(DEFAULT_TARGET);

const transformControls = new TransformControls(camera, renderer.domElement);
transformControls.setMode("rotate");
transformControls.addEventListener("dragging-changed", (e) => {
  controls.enabled = !e.value;
});
let gizmoActive = false;

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x40464d, 0.9);
hemiLight.position.set(0, 0, 1);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(150, -200, 300);
scene.add(dirLight);

scene.add(new THREE.AmbientLight(0xffffff, 0.15));

const platform = new THREE.Mesh(
  new THREE.PlaneGeometry(PLATFORM_SIZE, PLATFORM_SIZE),
  new THREE.MeshStandardMaterial({
    color: 0xe8eaee,
    roughness: 0.9,
    metalness: 0.0,
    transparent: true,
    opacity: 0.6,
  }),
);
platform.position.z = -0.01;
scene.add(platform);

const grid = new THREE.GridHelper(
  PLATFORM_SIZE,
  20,
  0x6b7280,
  0xb8bdc4,
);
grid.rotation.x = Math.PI / 2;
scene.add(grid);

const axes = new THREE.AxesHelper(20);
scene.add(axes);

let currentModel = null;
let currentColor = new THREE.Color(colorInput.value);
let currentWireframe = false;

function disposeObject(obj) {
  obj.traverse((child) => {
    if (child.isMesh) {
      child.geometry?.dispose();
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m) => m?.dispose());
    }
  });
}

function makeMaterial() {
  return new THREE.MeshStandardMaterial({
    color: currentColor.clone(),
    roughness: 0.55,
    metalness: 0.1,
    wireframe: currentWireframe,
    flatShading: false,
  });
}

function applyMaterialToModel(obj) {
  obj.traverse((child) => {
    if (child.isMesh) {
      child.material = makeMaterial();
    }
  });
}

function frameModel(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  if (box.isEmpty()) return;

  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  obj.position.x -= center.x;
  obj.position.y -= center.y;
  obj.position.z -= box.min.z;

  const maxDim = Math.max(size.x, size.y, size.z, 1);
  const fov = (camera.fov * Math.PI) / 180;
  const distance = (maxDim / Math.tan(fov / 2)) * 0.9;

  const dir = new THREE.Vector3(0.7, -1, 0.8).normalize();
  camera.position.copy(dir.multiplyScalar(distance));
  controls.target.set(0, 0, size.z / 2);
  camera.near = Math.max(0.1, distance / 1000);
  camera.far = distance * 100;
  camera.updateProjectionMatrix();
  controls.update();
}

function setModel(obj) {
  if (currentModel) {
    if (gizmoActive) transformControls.detach();
    scene.remove(currentModel);
    disposeObject(currentModel);
    currentModel = null;
  }
  applyMaterialToModel(obj);
  scene.add(obj);
  currentModel = obj;
  frameModel(obj);
  hint?.classList.add("hidden");
  if (gizmoActive) transformControls.attach(obj);
}

function meshFromGeometry(geometry) {
  if (!geometry.attributes.normal) {
    geometry.computeVertexNormals();
  }
  geometry.computeBoundingBox();
  return new THREE.Mesh(geometry, makeMaterial());
}

function readAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

const OCCT_VERSION = "0.0.23";
const OCCT_BASE = `https://unpkg.com/occt-import-js@${OCCT_VERSION}/dist/`;
let occtPromise = null;
function loadOcct() {
  if (occtPromise) return occtPromise;
  occtPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${OCCT_BASE}occt-import-js.js`;
    script.onload = () => {
      try {
        window
          .occtimportjs({ locateFile: (p) => `${OCCT_BASE}${p}` })
          .then(resolve, reject);
      } catch (e) {
        reject(e);
      }
    };
    script.onerror = () => reject(new Error("Failed to load occt-import-js"));
    document.head.appendChild(script);
  });
  return occtPromise;
}

function stepResultToGroup(result) {
  const group = new THREE.Group();
  for (const meshData of result.meshes) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(meshData.attributes.position.array);
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    if (meshData.attributes.normal) {
      const normals = new Float32Array(meshData.attributes.normal.array);
      geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    }
    if (meshData.index?.array) {
      const vertexCount = positions.length / 3;
      const IndexArray = vertexCount > 65535 ? Uint32Array : Uint16Array;
      geometry.setIndex(
        new THREE.BufferAttribute(new IndexArray(meshData.index.array), 1),
      );
    }
    if (!meshData.attributes.normal) geometry.computeVertexNormals();
    group.add(new THREE.Mesh(geometry, makeMaterial()));
  }
  return group;
}

async function loadModel(file) {
  const ext = file.name.split(".").pop()?.toLowerCase();
  loadingBadge.classList.remove("hidden");
  try {
    let object;
    if (ext === "stl") {
      const buffer = await readAsArrayBuffer(file);
      const geometry = new STLLoader().parse(buffer);
      object = meshFromGeometry(geometry);
    } else if (ext === "ply") {
      const buffer = await readAsArrayBuffer(file);
      const geometry = new PLYLoader().parse(buffer);
      object = meshFromGeometry(geometry);
    } else if (ext === "obj") {
      const text = await readAsText(file);
      object = new OBJLoader().parse(text);
    } else if (ext === "step" || ext === "stp") {
      const buffer = await readAsArrayBuffer(file);
      const occt = await loadOcct();
      const result = occt.ReadStepFile(new Uint8Array(buffer), null);
      if (!result?.success) throw new Error("STEP parse failed");
      object = stepResultToGroup(result);
    } else {
      alert(`Unsupported file type: .${ext}`);
      return;
    }
    setModel(object);
    filenameLabel.textContent = file.name;
    filenameLabel.title = file.name;
  } catch (err) {
    console.error(err);
    alert(`Failed to load model: ${err?.message ?? err}`);
  } finally {
    loadingBadge.classList.add("hidden");
  }
}

fileInput.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (file) loadModel(file);
});

colorInput.addEventListener("input", (e) => {
  currentColor.set(e.target.value);
  if (currentModel) {
    currentModel.traverse((child) => {
      if (child.isMesh && child.material?.color) {
        child.material.color.copy(currentColor);
      }
    });
  }
});

wireframeInput.addEventListener("change", (e) => {
  currentWireframe = e.target.checked;
  if (currentModel) {
    currentModel.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material.wireframe = currentWireframe;
      }
    });
  }
});

resetButton.addEventListener("click", () => {
  if (currentModel) {
    frameModel(currentModel);
  } else {
    camera.position.copy(DEFAULT_CAMERA_POS);
    controls.target.copy(DEFAULT_TARGET);
    controls.update();
  }
});

const GIZMO_ON_CLASSES = ["bg-orange-500", "text-white", "border-orange-500"];
const GIZMO_OFF_CLASSES = ["bg-white", "border-neutral-300", "hover:bg-neutral-50"];
rotateGizmoButton.addEventListener("click", () => {
  gizmoActive = !gizmoActive;
  if (gizmoActive) {
    if (currentModel) transformControls.attach(currentModel);
    scene.add(transformControls);
    rotateGizmoButton.classList.remove(...GIZMO_OFF_CLASSES);
    rotateGizmoButton.classList.add(...GIZMO_ON_CLASSES);
    rotateGizmoButton.setAttribute("aria-pressed", "true");
  } else {
    transformControls.detach();
    scene.remove(transformControls);
    rotateGizmoButton.classList.remove(...GIZMO_ON_CLASSES);
    rotateGizmoButton.classList.add(...GIZMO_OFF_CLASSES);
    rotateGizmoButton.setAttribute("aria-pressed", "false");
  }
});

screenshotButton.addEventListener("click", () => {
  renderer.render(scene, camera);
  const dataURL = renderer.domElement.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = dataURL;
  a.download = "Model_Viewer_Screenshot.png";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
});

const resizeObserver = new ResizeObserver(() => {
  const w = viewport.clientWidth;
  const h = viewport.clientHeight;
  if (w === 0 || h === 0) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
});
resizeObserver.observe(viewport);

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

async function loadDefaultModel() {
  const url = "./model.stl";
  loadingBadge.classList.remove("hidden");
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = await res.arrayBuffer();
    const geometry = new STLLoader().parse(buffer);
    const object = meshFromGeometry(geometry);
    setModel(object);
    filenameLabel.textContent = "model.stl";
    filenameLabel.title = "model.stl";
  } catch (err) {
    console.warn("Default model not loaded:", err);
  } finally {
    loadingBadge.classList.add("hidden");
  }
}
loadDefaultModel();
