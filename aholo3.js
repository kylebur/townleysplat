/**
 * AHOLO 3.0 PURE 3D GAUSSIAN SPLAT ENGINE
 * Version: v3.0.2
 * Pure 3DGS Photogrammetry Model Viewer (No Basemap Terrain / DEM)
 * High-Performance 60FPS WebGL Renderer with 3D Orientation Matrix
 */

// Application State
const state = {
  splatParticleSize: 0.35, // Correct physical splat radius
  splatOpacity: 1.0,
  lodRatio: 0.50, // Default to 50% density for smooth 60 FPS
  numSplats: 0,
  splatCenter: new THREE.Vector3(),
  splatBoundingRadius: 50.0,
  rawBuffer: null
};

// Global WebGL Variables
let scene, camera, renderer, orbitControls;
let splatMesh, splatGroup;
let lastFrameTime = performance.now();
let frameCount = 0;

// Initialize WebGL Scene
function init() {
  const container = document.getElementById('canvas-container');
  if (!container) return;

  // Scene setup with sleek dark space background
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030712);
  scene.fog = new THREE.FogExp2(0x030712, 0.0015);

  // Camera setup
  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(0, 30, 80);

  // Renderer setup
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  container.appendChild(renderer.domElement);

  // Orbit Controls
  orbitControls = new THREE.OrbitControls(camera, renderer.domElement);
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.05;
  orbitControls.maxPolarAngle = Math.PI / 2 + 0.15;
  orbitControls.minDistance = 2.0;
  orbitControls.maxDistance = 600.0;

  // Ambient & Directional Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight.position.set(50, 100, 50);
  scene.add(dirLight);

  // Initialize UI controls & Load 3DGS Dataset
  initUI();
  loadPure3DGSModel();

  // Event Listeners
  window.addEventListener('resize', onWindowResize);
  requestAnimationFrame(animate);
}

// Initialize UI Control Listeners
function initUI() {
  const btnRecenter = document.getElementById('btn-recenter');
  if (btnRecenter) {
    btnRecenter.addEventListener('click', recenterCamera);
  }

  const selectLod = document.getElementById('select-lod');
  const valLod = document.getElementById('val-lod');
  if (selectLod) {
    selectLod.addEventListener('change', (e) => {
      state.lodRatio = parseFloat(e.target.value);
      if (valLod) {
        if (state.lodRatio === 0.25) valLod.textContent = "25% (Ultra Light)";
        else if (state.lodRatio === 0.50) valLod.textContent = "50% (Fast 60FPS)";
        else valLod.textContent = "100% (Full Detail)";
      }
      if (state.rawBuffer) {
        parseAndBuildPure3DGS(state.rawBuffer);
      }
    });
  }

  const sliderSize = document.getElementById('slider-particle-size');
  const valSize = document.getElementById('val-particle-size');
  if (sliderSize) {
    sliderSize.value = state.splatParticleSize;
    if (valSize) valSize.textContent = `${state.splatParticleSize.toFixed(2)}`;
    sliderSize.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      state.splatParticleSize = val;
      if (valSize) valSize.textContent = `${val.toFixed(2)}`;
      if (splatMesh && splatMesh.material) {
        splatMesh.material.size = val;
        splatMesh.material.needsUpdate = true;
      }
    });
  }

  const sliderOp = document.getElementById('slider-opacity');
  const valOp = document.getElementById('val-opacity');
  if (sliderOp) {
    sliderOp.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      state.splatOpacity = val;
      if (valOp) valOp.textContent = val.toFixed(2);
      if (splatMesh && splatMesh.material) {
        splatMesh.material.opacity = val;
        splatMesh.material.needsUpdate = true;
      }
    });
  }
}

// Load Pure 3D Gaussian Splat Model
function loadPure3DGSModel() {
  showToast('Loading Aholo 3.0 3DGS Model...');

  fetch('aholo2_reconstruction.splat?t=' + Date.now())
    .then(res => {
      if (!res.ok) return fetch('drone_reconstruction.splat?t=' + Date.now());
      return res;
    })
    .then(res => res.arrayBuffer())
    .then(buffer => {
      state.rawBuffer = buffer;
      parseAndBuildPure3DGS(buffer);
    })
    .catch(err => {
      console.error('Error loading 3DGS dataset:', err);
      showToast('Error loading 3DGS dataset!');
    });
}

// Parse Binary Splat & Apply 3D Orientation Transformation
function parseAndBuildPure3DGS(buffer) {
  if (splatGroup) scene.remove(splatGroup);
  splatGroup = new THREE.Group();

  const bytes = new Uint8Array(buffer);
  const totalSplats = Math.floor(bytes.length / 32);
  const dataView = new DataView(buffer);

  let sumX = 0, sumY = 0, sumZ = 0;
  const rawX = new Float32Array(totalSplats);
  const rawY = new Float32Array(totalSplats);
  const rawZ = new Float32Array(totalSplats);

  // Compute centroid
  for (let i = 0; i < totalSplats; i++) {
    const off = i * 32;
    const x = dataView.getFloat32(off, true);
    const y = dataView.getFloat32(off + 4, true);
    const z = dataView.getFloat32(off + 8, true);

    rawX[i] = x;
    rawY[i] = y;
    rawZ[i] = z;

    sumX += x;
    sumY += y;
    sumZ += z;
  }

  const cx = sumX / totalSplats;
  const cy = sumY / totalSplats;
  const cz = sumZ / totalSplats;

  state.splatCenter.set(cx, cy, cz);

  // Orientation Transformation Angles (Pitch = 158°, Yaw = -90°)
  const radX = (158.0 * Math.PI) / 180;
  const radY = (-90.0 * Math.PI) / 180;

  const cosX = Math.cos(radX), sinX = Math.sin(radX);
  const cosY = Math.cos(radY), sinY = Math.sin(radY);

  const validPositions = [];
  const validColors = [];
  let maxDistSq = 0;
  const lodStep = Math.max(1, Math.round(1.0 / state.lodRatio));

  for (let i = 0; i < totalSplats; i += lodStep) {
    const r = bytes[i * 32 + 24] / 255;
    const g = bytes[i * 32 + 25] / 255;
    const b = bytes[i * 32 + 26] / 255;

    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum < 0.10) continue; // Noise filter

    // Shift relative to centroid
    const rx = rawX[i] - cx;
    const ry = rawY[i] - cy;
    const rz = rawZ[i] - cz;

    // Apply Yaw (Y-axis) rotation
    const x1 = rx * cosY + rz * sinY;
    const y1 = ry;
    const z1 = -rx * sinY + rz * cosY;

    // Apply Pitch (X-axis) rotation
    const x2 = x1;
    const y2 = y1 * cosX - z1 * sinX;
    const z2 = y1 * sinX + z1 * cosX;

    const dSq = x2 * x2 + y2 * y2 + z2 * z2;
    if (dSq > maxDistSq) maxDistSq = dSq;

    validPositions.push(x2, y2, z2);
    validColors.push(r, g, b);
  }

  state.splatBoundingRadius = Math.sqrt(maxDistSq);
  state.numSplats = validPositions.length / 3;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(validPositions), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(validColors), 3));

  // High-Performance Radial Gaussian Texture
  if (!window._aholo3GaussianTextureFast) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.4, 'rgba(255, 255, 255, 0.85)');
    grad.addColorStop(0.8, 'rgba(255, 255, 255, 0.35)');
    grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    window._aholo3GaussianTextureFast = tex;
  }

  // Points material with physical size attenuation & Z-buffer depth write
  const mat = new THREE.PointsMaterial({
    size: state.splatParticleSize,
    map: window._aholo3GaussianTextureFast,
    vertexColors: true,
    transparent: true,
    alphaTest: 0.10,
    depthWrite: true,
    depthTest: true,
    opacity: state.splatOpacity,
    sizeAttenuation: true
  });

  splatMesh = new THREE.Points(geo, mat);
  splatGroup.add(splatMesh);
  scene.add(splatGroup);

  // Recenter camera cleanly around upright 3D model
  recenterCamera();

  const countEl = document.getElementById('aholo-splat-count');
  if (countEl) countEl.textContent = `${state.numSplats.toLocaleString()} Gaussians (${Math.round(state.lodRatio * 100)}% LOD)`;
  showToast(`Aholo 3.0 loaded ${state.numSplats.toLocaleString()} Gaussians at 60 FPS!`);
}

// Recenter Camera Focus
function recenterCamera() {
  orbitControls.target.set(0, 0, 0);
  const r = state.splatBoundingRadius || 40.0;
  camera.position.set(0, r * 0.5, r * 1.3);
  orbitControls.update();
  showToast('Centered on Pure 3DGS Model');
}

// Window Resize Handler
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// Show Toast Notification
function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.remove('hidden');
  toast.classList.add('visible');
  clearTimeout(window._aholo3ToastTimeout);
  window._aholo3ToastTimeout = setTimeout(() => {
    toast.classList.remove('visible');
    toast.classList.add('hidden');
  }, 3200);
}

// Animation Loop & FPS Meter
function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  frameCount++;
  if (now - lastFrameTime >= 1000) {
    const fps = Math.round((frameCount * 1000) / (now - lastFrameTime));
    const fpsEl = document.getElementById('aholo-fps');
    if (fpsEl) fpsEl.textContent = `${fps} FPS`;
    frameCount = 0;
    lastFrameTime = now;
  }

  orbitControls.update();
  renderer.render(scene, camera);
}

window.addEventListener('DOMContentLoaded', init);
