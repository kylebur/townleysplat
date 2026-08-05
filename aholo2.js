/**
 * AHOLO 2.0 VOLUMETRIC SURFACE 3DGS ENGINE
 * Version: v2.0.0
 * 
 * High-density continuous volumetric surface 3D Gaussian Splatting engine.
 */

const state = {
  demData: null,
  widthM: 0,
  heightM: 0,
  cols: 0,
  rows: 0,
  heightScale: 1.0,
  splatScale: 55.6,
  splatParticleSize: 4.5,
  splatRotX: 158.0,
  splatRotY: -90.0,
  splatRotZ: 0.0,
  splatPosX: 188.0,
  splatPosY: 69.0,
  splatPosZ: 255.0,
  scaleX: 1.136,
  scaleY: 1.136,
  offsetX: -0.012,
  offsetY: 0.066,
  rotationDeg: 0.0
};

let scene, camera, renderer, orbitControls;
let terrainMesh, terrainGeo, terrainMat, satelliteTexture, splatMesh;
let splatPivot, splatYawGroup, splatPitchGroup, splatRollGroup;
let clock = new THREE.Clock();
let frameCount = 0, lastFpsTime = performance.now();

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  initAholo2Engine();
});

function initAholo2Engine() {
  showToast('Initializing Aholo 2.0 Surface Engine...');
  
  fetch('dem_data.json?t=' + Date.now())
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(data => {
      state.demData = data;
      state.cols = data.cols;
      state.rows = data.rows;
      state.widthM = data.width_m;
      state.heightM = data.height_m;

      initThree();
      loadAlignmentAndSplat();
      animate();
    })
    .catch(err => {
      console.error('Failed to load dem_data.json:', err);
      showToast('Error loading elevation data');
    });
}

function initThree() {
  const container = document.getElementById('canvas-container');
  scene = new THREE.Scene();

  const centerX = state.widthM / 2;
  const centerZ = state.heightM / 2;

  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 8000);
  camera.position.set(centerX - 90, 80, centerZ + 110);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  container.appendChild(renderer.domElement);

  orbitControls = new THREE.OrbitControls(camera, renderer.domElement);
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.05;
  orbitControls.screenSpacePanning = false; // Lock panning strictly to horizontal base X-Z ground plane
  orbitControls.maxPolarAngle = Math.PI / 2 - 0.01;
  const initialTargetY = getTerrainHeightAt(centerX, centerZ);
  orbitControls.target.set(centerX, initialTargetY, centerZ);

  // High-Contrast Solar Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.25);
  scene.add(ambientLight);

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x222222, 0.25);
  hemiLight.position.set(0, 500, 0);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xfffaed, 1.25);
  sunLight.position.set(state.widthM * 0.5, 600, state.heightM * 0.5);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 1000;
  const d = Math.max(state.widthM, state.heightM);
  sunLight.shadow.camera.left = -d;
  sunLight.shadow.camera.right = d;
  sunLight.shadow.camera.top = d;
  sunLight.shadow.camera.bottom = -d;
  scene.add(sunLight);

  // Sky Dome (Sky Blue)
  const skyGeo = new THREE.SphereGeometry(6000, 32, 15);
  const skyMat = new THREE.MeshBasicMaterial({ color: 0x87ceeb, side: THREE.BackSide });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  // Load & Color-Boost Aerial Satellite Texture (+50% Saturation, +20% Contrast)
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = 'stitched_screenshots_clean.png';
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.filter = 'saturate(1.50) contrast(1.20) brightness(1.02)';
    ctx.drawImage(img, 0, 0);

    satelliteTexture = new THREE.CanvasTexture(canvas);
    satelliteTexture.wrapS = THREE.ClampToEdgeWrapping;
    satelliteTexture.wrapT = THREE.ClampToEdgeWrapping;
    satelliteTexture.minFilter = THREE.LinearMipmapLinearFilter;
    satelliteTexture.magFilter = THREE.LinearFilter;
    satelliteTexture.generateMipmaps = true;
    satelliteTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    updateTextureTransform();
  };

  buildTerrainMesh();

  // Event Listeners
  window.addEventListener('resize', onWindowResize);

  const btnRecenter = document.getElementById('btn-recenter');
  if (btnRecenter) {
    btnRecenter.addEventListener('click', recenterCamera);
  }

  const sliderSize = document.getElementById('slider-particle-size');
  const valSize = document.getElementById('val-particle-size');
  if (sliderSize) {
    sliderSize.value = state.splatParticleSize ?? 2.2;
    if (valSize) valSize.textContent = `${(state.splatParticleSize ?? 2.2).toFixed(1)}px`;
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

  renderer.domElement.addEventListener('dblclick', (e) => {
    const mouse = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(terrainMesh);
    if (intersects.length > 0) {
      const hitPt = intersects[0].point;
      orbitControls.target.copy(hitPt);
      orbitControls.update();
      showToast(`Aholo 2.0 target centered on (${Math.round(hitPt.x)}, ${Math.round(hitPt.z)})`);
    }
  });
}

function recenterCamera() {
  const targetX = state.splatPosX || (state.widthM / 2);
  const targetZ = state.splatPosZ || (state.heightM / 2);
  const targetY = getTerrainHeightAt(targetX, targetZ);
  orbitControls.target.set(targetX, targetY, targetZ);
  camera.position.set(targetX - 90, targetY + 60, targetZ + 110);
  orbitControls.update();
  showToast('Centered on Aholo 2.0 Splat Focus');
}

function getTerrainHeightAt(x, z) {
  if (!state.demData || !state.demData.elevations) return 0;
  
  const widthM = state.widthM;
  const heightM = state.heightM;
  const cols = state.cols;
  const rows = state.rows;

  const clampedX = Math.max(0, Math.min(widthM, x));
  const clampedZ = Math.max(0, Math.min(heightM, z));

  const colF = (clampedX / widthM) * (cols - 1);
  const rowF = (clampedZ / heightM) * (rows - 1);

  const c0 = Math.floor(colF);
  const c1 = Math.min(cols - 1, c0 + 1);
  const r0 = Math.floor(rowF);
  const r1 = Math.min(rows - 1, r0 + 1);

  const tx = colF - c0;
  const tz = rowF - r0;

  const elevs = state.demData.elevations;
  const h00 = elevs[r0][c0];
  const h10 = elevs[r0][c1];
  const h01 = elevs[r1][c0];
  const h11 = elevs[r1][c1];

  const hTop = h00 * (1 - tx) + h10 * tx;
  const hBot = h01 * (1 - tx) + h11 * tx;

  return (hTop * (1 - tz) + hBot * tz) * state.heightScale;
}

function buildTerrainMesh() {
  if (terrainMesh) scene.remove(terrainMesh);

  const cols = state.cols;
  const rows = state.rows;
  const widthM = state.widthM;
  const heightM = state.heightM;

  terrainGeo = new THREE.PlaneGeometry(widthM, heightM, cols - 1, rows - 1);
  terrainGeo.rotateX(-Math.PI / 2); // Horizontal XZ plane
  terrainGeo.translate(widthM / 2, 0, heightM / 2); // Origin at (0,0)

  const posAttr = terrainGeo.attributes.position;
  const elevs = state.demData.elevations;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const elev = elevs[r][c];
      posAttr.setY(idx, elev * state.heightScale);
    }
  }
  terrainGeo.computeVertexNormals();

  terrainMat = new THREE.MeshStandardMaterial({
    map: satelliteTexture,
    roughness: 0.75,
    metalness: 0.1,
    flatShading: false,
    side: THREE.DoubleSide
  });

  terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  terrainMesh.castShadow = true;
  scene.add(terrainMesh);
}

function updateTextureTransform() {
  if (!satelliteTexture) return;
  const rad = (state.rotationDeg * Math.PI) / 180;
  satelliteTexture.center.set(0.5, 0.5);
  satelliteTexture.rotation = rad;
  satelliteTexture.repeat.set(state.scaleX, state.scaleY);
  satelliteTexture.offset.set(state.offsetX, state.offsetY);
  satelliteTexture.needsUpdate = true;

  if (terrainMat) {
    terrainMat.map = satelliteTexture;
    terrainMat.needsUpdate = true;
  }
}

function loadAlignmentAndSplat() {
  const cfgUrl = 'aholo2_alignment_config.json?t=' + Date.now();
  fetch(cfgUrl)
    .then(res => res.ok ? res.json() : fetch('terrain_alignment_config.json?t=' + Date.now()).then(r => r.json()))
    .then(config => {
      state.scaleX = config.scaleX ?? 1.136;
      state.scaleY = config.scaleY ?? 1.136;
      state.offsetX = config.offsetX ?? -0.012;
      state.offsetY = config.offsetY ?? 0.066;
      state.rotationDeg = config.rotationDeg ?? 0.0;
      state.splatScale = config.splatScale ?? 55.6;
      state.splatParticleSize = config.splatParticleSize ?? 4.5;
      state.splatRotX = config.splatRotX ?? 158.0;
      state.splatRotY = config.splatRotY ?? -90.0;
      state.splatRotZ = config.splatRotZ ?? 0.0;
      state.splatPosX = config.splatPosX ?? 188.0;
      state.splatPosY = config.splatPosY ?? 69.0;
      state.splatPosZ = config.splatPosZ ?? 255.0;

      updateTextureTransform();

      const splatUrl = 'aholo2_reconstruction.splat?t=' + Date.now();
      fetch(splatUrl)
        .then(res => res.ok ? res.arrayBuffer() : fetch('drone_reconstruction.splat?t=' + Date.now()).then(r => r.arrayBuffer()))
        .then(buffer => parseAndCreateAholo2Splat(buffer))
        .catch(err => console.error('Splat load error:', err));
    });
}

function parseAndCreateAholo2Splat(buffer) {
  if (splatMesh) scene.remove(splatMesh);

  const bytes = new Uint8Array(buffer);
  const numSplats = Math.floor(bytes.length / 32);

  let sumY = 0, sumY2 = 0;
  const rawX = new Float32Array(numSplats);
  const rawY = new Float32Array(numSplats);
  const rawZ = new Float32Array(numSplats);
  const dataView = new DataView(buffer);

  for (let i = 0; i < numSplats; i++) {
    const off = i * 32;
    const x = dataView.getFloat32(off, true);
    const y = dataView.getFloat32(off + 4, true);
    const z = dataView.getFloat32(off + 8, true);
    rawX[i] = x;
    rawY[i] = y;
    rawZ[i] = z;
    sumY += y;
    sumY2 += y * y;
  }

  const meanY = sumY / numSplats;
  const varY = Math.max(0, (sumY2 / numSplats) - (meanY * meanY));
  const stdY = Math.sqrt(varY);

  const validPositions = [];
  const validColors = [];

  for (let i = 0; i < numSplats; i++) {
    const y = rawY[i];
    if (Math.abs(y - meanY) > 2.2 * stdY) continue;

    const off = i * 32;
    const r = bytes[off + 24] / 255;
    const g = bytes[off + 25] / 255;
    const b = bytes[off + 26] / 255;

    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    if (luminance < 0.12 || (r < 0.10 && g < 0.10 && b < 0.10)) continue;

    validPositions.push(rawX[i], y, rawZ[i]);
    validColors.push(r, g, b);
  }

  const cleanNumSplats = validPositions.length / 3;
  const positions = new Float32Array(validPositions);
  const colors = new Float32Array(validColors);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  if (!window._aholo2GaussianTexture) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.25, 'rgba(255, 255, 255, 0.95)');
    grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.65)');
    grad.addColorStop(0.75, 'rgba(255, 255, 255, 0.25)');
    grad.addColorStop(0.95, 'rgba(255, 255, 255, 0.05)');
    grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    window._aholo2GaussianTexture = tex;
  }

  const mat = new THREE.PointsMaterial({
    size: state.splatParticleSize,
    map: window._aholo2GaussianTexture,
    vertexColors: true,
    transparent: true,
    alphaTest: 0.005,
    depthWrite: false,
    opacity: 0.98,
    blending: THREE.NormalBlending
  });

  splatMesh = new THREE.Points(geo, mat);
  splatMesh.raycast = function() {}; // Prevent splats from intercepting raycasts

  if (splatPivot) scene.remove(splatPivot);
  splatPivot = new THREE.Group();
  splatYawGroup = new THREE.Group();
  splatPitchGroup = new THREE.Group();
  splatRollGroup = new THREE.Group();

  splatPivot.add(splatYawGroup);
  splatYawGroup.add(splatPitchGroup);
  splatPitchGroup.add(splatRollGroup);
  splatRollGroup.add(splatMesh);
  scene.add(splatPivot);

  updateSplatTransform();

  const countEl = document.getElementById('aholo-splat-count');
  if (countEl) countEl.textContent = `${cleanNumSplats.toLocaleString()} Dense Volumetric Gaussians`;
  showToast(`Aholo 2.0 loaded ${cleanNumSplats.toLocaleString()} Dense Volumetric Surface Gaussians!`);
}

function updateSplatTransform() {
  if (!splatPivot || !splatMesh) return;
  splatPivot.position.set(state.splatPosX, state.splatPosY, state.splatPosZ);
  splatYawGroup.rotation.y = (state.splatRotY * Math.PI) / 180;
  splatPitchGroup.rotation.x = (state.splatRotX * Math.PI) / 180;
  splatRollGroup.rotation.z = (state.splatRotZ * Math.PI) / 180;
  splatMesh.scale.setScalar(state.splatScale);
  if (splatMesh.material) {
    splatMesh.material.size = state.splatParticleSize;
  }
}

function animate() {
  requestAnimationFrame(animate);

  if (orbitControls) {
    const groundY = getTerrainHeightAt(orbitControls.target.x, orbitControls.target.z);
    orbitControls.target.y = groundY;
    orbitControls.update();
  }

  renderer.render(scene, camera);

  // Performance Meter
  frameCount++;
  const now = performance.now();
  if (now - lastFpsTime >= 1000) {
    const fps = Math.round((frameCount * 1000) / (now - lastFpsTime));
    const fpsEl = document.getElementById('aholo-fps');
    if (fpsEl) fpsEl.textContent = `${fps} FPS`;
    frameCount = 0;
    lastFpsTime = now;
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3500);
}
