/**
 * AHOLO 3.0 PURE 3D GAUSSIAN SPLAT ENGINE
 * Version: v3.0.0
 * Pure 3DGS Photogrammetry Model Viewer (No Basemap Terrain / DEM)
 */

// Application State
const state = {
  splatParticleSize: 3.0,
  splatOpacity: 1.0,
  numSplats: 0,
  splatCenter: new THREE.Vector3(),
  splatBoundingRadius: 50.0
};

// Global WebGL Variables
let scene, camera, renderer, orbitControls;
let splatMesh, splatPivot;
let lastFrameTime = performance.now();
let frameCount = 0;

// Initialize WebGL Scene
function init() {
  const container = document.getElementById('canvas-container');
  if (!container) return;

  // Scene setup with sleek dark background
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030712);
  scene.fog = new THREE.FogExp2(0x030712, 0.002);

  // Camera setup
  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 45, 90);

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
  orbitControls.maxPolarAngle = Math.PI / 2 + 0.1; // Allow slight under-view
  orbitControls.minDistance = 2.0;
  orbitControls.maxDistance = 500.0;

  // Ambient & Directional Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
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

  const sliderSize = document.getElementById('slider-particle-size');
  const valSize = document.getElementById('val-particle-size');
  if (sliderSize) {
    sliderSize.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      state.splatParticleSize = val;
      if (valSize) valSize.textContent = `${val.toFixed(1)}px`;
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

  // Try loading dense dataset first, fallback to baseline
  fetch('aholo2_reconstruction.splat?t=' + Date.now())
    .then(res => {
      if (!res.ok) return fetch('drone_reconstruction.splat?t=' + Date.now());
      return res;
    })
    .then(res => res.arrayBuffer())
    .then(buffer => parseAndBuildPure3DGS(buffer))
    .catch(err => {
      console.error('Error loading 3DGS dataset:', err);
      showToast('Error loading 3DGS dataset!');
    });
}

// Parse Binary Splat & Build Centered 3DGS Geometry
function parseAndBuildPure3DGS(buffer) {
  if (splatMesh) scene.remove(splatMesh);

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

  const validPositions = [];
  const validColors = [];

  let maxDistSq = 0;

  for (let i = 0; i < totalSplats; i++) {
    const r = bytes[i * 32 + 24] / 255;
    const g = bytes[i * 32 + 25] / 255;
    const b = bytes[i * 32 + 26] / 255;

    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum < 0.10) continue; // Noise filter

    // Center coordinates around origin (0,0,0)
    const px = rawX[i] - cx;
    const py = rawY[i] - cy;
    const pz = rawZ[i] - cz;

    const dSq = px * px + py * py + pz * pz;
    if (dSq > maxDistSq) maxDistSq = dSq;

    validPositions.push(px, py, pz);
    validColors.push(r, g, b);
  }

  state.splatBoundingRadius = Math.sqrt(maxDistSq);
  state.numSplats = validPositions.length / 3;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(validPositions), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(validColors), 3));

  // Build Gaussian Texture
  if (!window._aholo3GaussianTexture) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.3, 'rgba(255, 255, 255, 0.9)');
    grad.addColorStop(0.6, 'rgba(255, 255, 255, 0.5)');
    grad.addColorStop(0.9, 'rgba(255, 255, 255, 0.1)');
    grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    window._aholo3GaussianTexture = tex;
  }

  const mat = new THREE.PointsMaterial({
    size: state.splatParticleSize,
    map: window._aholo3GaussianTexture,
    vertexColors: true,
    transparent: true,
    alphaTest: 0.005,
    depthWrite: false,
    opacity: state.splatOpacity,
    blending: THREE.NormalBlending
  });

  splatMesh = new THREE.Points(geo, mat);
  scene.add(splatMesh);

  // Position camera cleanly relative to model bounding radius
  recenterCamera();

  const countEl = document.getElementById('aholo-splat-count');
  if (countEl) countEl.textContent = `${state.numSplats.toLocaleString()} Pure Gaussians`;
  showToast(`Aholo 3.0 loaded ${state.numSplats.toLocaleString()} Pure 3D Gaussian Splats!`);
}

// Recenter Camera Focus
function recenterCamera() {
  orbitControls.target.set(0, 0, 0);
  const r = state.splatBoundingRadius || 40.0;
  camera.position.set(0, r * 0.7, r * 1.5);
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
