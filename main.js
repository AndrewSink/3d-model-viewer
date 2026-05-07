import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { PLYLoader } from "three/addons/loaders/PLYLoader.js";

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

const viewport = document.getElementById("viewport");
const fileInput = document.getElementById("file-input");
const dropzone = document.getElementById("dropzone");
const filenameLabel = document.getElementById("filename");
const colorInput = document.getElementById("color-input");
const wireframeInput = document.getElementById("wireframe-input");
const resetButton = document.getElementById("reset-view");
const rotateGizmoButton = document.getElementById("rotate-gizmo");
const screenshotButton = document.getElementById("screenshot");
const loadingBadge = document.getElementById("loading");
const hint = document.getElementById("hint");
const sidebar = document.getElementById("sidebar");
const sidebarToggle = document.getElementById("sidebar-toggle");

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
scene.background = makeGradientTexture("#dce4ed", "#b8c8d8");

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
controls.mouseButtons = {
  LEFT: THREE.MOUSE.ROTATE,
  MIDDLE: THREE.MOUSE.PAN,
  RIGHT: THREE.MOUSE.ROTATE,
};

const transformControls = new TransformControls(camera, renderer.domElement);
transformControls.setMode("rotate");
transformControls.addEventListener("dragging-changed", (e) => {
  controls.enabled = !e.value;
});
const transformGizmo = transformControls.getHelper();
let gizmoActive = false;

const hemiLight = new THREE.HemisphereLight(0xffffff, 0xc8d4de, 0.7);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
dirLight.position.set(5, 10, 7);
scene.add(dirLight);

const fillLight = new THREE.DirectionalLight(0xe8f0f8, 0.35);
fillLight.position.set(-8, 3, -5);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffffff, 0.15);
rimLight.position.set(0, -5, -8);
scene.add(rimLight);

let grid = new THREE.GridHelper(PLATFORM_SIZE, 20, 0x8a9eb2, 0xaabccc);
grid.rotation.x = Math.PI / 2;
scene.add(grid);


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
  return new THREE.MeshPhongMaterial({
    color: currentColor.clone(),
    specular: new THREE.Color(0x4a7a9b),
    shininess: 40,
    wireframe: currentWireframe,
    side: THREE.DoubleSide,
  });
}

function applyMaterialToModel(obj) {
  obj.traverse((child) => {
    if (child.isMesh) {
      child.material = makeMaterial();
    }
  });
}

function updateGrid(size) {
  scene.remove(grid);
  const maxDim = Math.max(size.x, size.y, size.z, 50);
  const gridSize = maxDim * 3;
  const divisions = Math.round(gridSize / (maxDim / 6));
  grid = new THREE.GridHelper(gridSize, divisions, 0x8a9eb2, 0xaabccc);
  grid.rotation.x = Math.PI / 2;
  scene.add(grid);
}

function frameModel(pivot) {
  const size = pivot.userData?.size;
  if (!size) return;

  pivot.position.set(0, 0, size.z / 2);

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

  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  obj.position.set(-center.x, -center.y, -center.z);

  const pivot = new THREE.Group();
  pivot.add(obj);
  pivot.userData.size = size.clone();

  scene.add(pivot);
  currentModel = pivot;
  updateGrid(size);
  frameModel(pivot);
  hint?.classList.add("hidden");
  if (gizmoActive) transformControls.attach(pivot);
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

// Dropzone drag-and-drop
dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("drag-active");
});
dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("drag-active");
});
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("drag-active");
  const file = e.dataTransfer?.files?.[0];
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

const GIZMO_ON_CLASSES = ["bg-indigo-600", "text-white", "hover:bg-indigo-500"];
const GIZMO_OFF_CLASSES = ["bg-slate-700", "hover:bg-slate-600", "text-slate-300"];

function deactivateGizmo() {
  if (!gizmoActive) return;
  gizmoActive = false;
  transformControls.detach();
  scene.remove(transformGizmo);
  rotateGizmoButton.classList.remove(...GIZMO_ON_CLASSES);
  rotateGizmoButton.classList.add(...GIZMO_OFF_CLASSES);
  rotateGizmoButton.setAttribute("aria-pressed", "false");
}

resetButton.addEventListener("click", () => {
  deactivateGizmo();
  if (currentModel) {
    currentModel.rotation.set(0, 0, 0);
    frameModel(currentModel);
  } else {
    camera.position.copy(DEFAULT_CAMERA_POS);
    controls.target.copy(DEFAULT_TARGET);
    controls.update();
  }
});

rotateGizmoButton.addEventListener("click", () => {
  gizmoActive = !gizmoActive;
  if (gizmoActive) {
    if (currentModel) transformControls.attach(currentModel);
    scene.add(transformGizmo);
    rotateGizmoButton.classList.remove(...GIZMO_OFF_CLASSES);
    rotateGizmoButton.classList.add(...GIZMO_ON_CLASSES);
    rotateGizmoButton.setAttribute("aria-pressed", "true");
  } else {
    deactivateGizmo();
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

// Mobile sidebar toggle
sidebarToggle.addEventListener("click", () => {
  sidebar.classList.toggle("collapsed");
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
