/**
 * AHOLO 3D GAUSSIAN SPLAT ENGINE & SPATIAL INTELLIGENCE VIEWER
 * Version: v1.7.2
 * 
 * Standalone high-performance 3D Gaussian Splatting & DEM spatial viewer.
 */

const state = {
  demData: null,
  widthM: 0,
  heightM: 0,
  cols: 0,
  rows: 0,
  heightScale: 1.0,
  splatScale: 55.6,
  splatParticleSize: 4.0,
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
  initAholoEngine();
});

function initAholoEngine() {
  showToast('Initializing Aholo 3DGS Engine...');
  
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
  scene.background = new THREE.Color(0x0b0f19);

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
  orbitControls.screenSpacePanning = false; // Lock panning to horizontal base plane
  orbitControls.maxPolarAngle = Math.PI / 2 - 0.01;
  const initialTargetY = getTerrainHeightAt(centerX, centerZ);
  orbitControls.target.set(centerX, initialTargetY, centerZ);

  // Ambient & Directional Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
  scene.add(ambientLight);

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
  hemiLight.position.set(0, 500, 0);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xfffaed, 1.3);
  sunLight.position.set(state.widthM * 0.5, 600, state.heightM * 0.5);
  scene.add(sunLight);

  // Sky Dome
  const skyGeo = new THREE.SphereGeometry(6000, 32, 15);
  const skyMat = new THREE.MeshBasicMaterial({ color: 0x87ceeb, side: THREE.BackSide });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  // Load Aerial Satellite Texture with sRGB Color Encoding
  const textureLoader = new THREE.TextureLoader();
  satelliteTexture = textureLoader.load('stitched_screenshots_clean.png', (tex) => {
    tex.encoding = THREE.sRGBEncoding; // Enforce sRGB color space to prevent washed-out colors
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    updateTextureTransform();
  });

  buildTerrainMesh();

  // Event Listeners
  window.addEventListener('resize', onWindowResize);

  const btnRecenter = document.getElementById('btn-recenter');
  if (btnRecenter) {
    btnRecenter.addEventListener('click', () => {
      const targetX = state.splatPosX || (state.widthM / 2);
      const targetZ = state.splatPosZ || (state.heightM / 2);
      const targetY = getTerrainHeightAt(targetX, targetZ);
      orbitControls.target.set(targetX, targetY, targetZ);
      camera.position.set(targetX - 90, targetY + 60, targetZ + 110);
      orbitControls.update();
      showToast('Centered on Aholo Splat Focus');
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
      showToast(`Aholo target centered on (${Math.round(hitPt.x)}, ${Math.round(hitPt.z)})`);
    }
  });
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

  terrainGeo = new THREE.PlaneGeometry(state.widthM, state.heightM, state.cols - 1, state.rows - 1);
  terrainGeo.rotateX(-Math.PI / 2);
  terrainGeo.translate(state.widthM / 2, 0, state.heightM / 2);

  const posAttr = terrainGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    posAttr.setY(i, getTerrainHeightAt(x, z));
  }
  terrainGeo.computeVertexNormals();

  terrainMat = new THREE.MeshStandardMaterial({
    map: satelliteTexture,
    roughness: 0.8,
    metalness: 0.1
  });

  terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  scene.add(terrainMesh);
}

function updateTextureTransform() {
  if (!satelliteTexture) return;
  satelliteTexture.matrixAutoUpdate = false;
  satelliteTexture.matrix.identity()
    .translate(-0.5, -0.5)
    .scale(1 / state.scaleX, 1 / state.scaleY)
    .rotate(state.rotationDeg * Math.PI / 180)
    .translate(0.5 + state.offsetX, 0.5 + state.offsetY);
}

function loadAlignmentAndSplat() {
  fetch('terrain_alignment_config.json?t=' + Date.now())
    .then(res => res.json())
    .then(config => {
      state.scaleX = config.scaleX ?? 1.136;
      state.scaleY = config.scaleY ?? 1.136;
      state.offsetX = config.offsetX ?? -0.012;
      state.offsetY = config.offsetY ?? 0.066;
      state.rotationDeg = config.rotationDeg ?? 0.0;
      state.splatScale = config.splatScale ?? 55.6;
      state.splatParticleSize = config.splatParticleSize ?? 4.0;
      state.splatRotX = config.splatRotX ?? 158.0;
      state.splatRotY = config.splatRotY ?? -90.0;
      state.splatRotZ = config.splatRotZ ?? 0.0;
      state.splatPosX = config.splatPosX ?? 188.0;
      state.splatPosY = config.splatPosY ?? 69.0;
      state.splatPosZ = config.splatPosZ ?? 255.0;

      updateTextureTransform();

      fetch('drone_reconstruction.splat?t=' + Date.now())
        .then(res => res.arrayBuffer())
        .then(buffer => parseAndCreateAholoSplat(buffer))
        .catch(err => console.error('Splat load error:', err));
    });
}

function parseAndCreateAholoSplat(buffer) {
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
    if (Math.abs(y - meanY) > 2.8 * stdY) continue;

    const off = i * 32;
    validPositions.push(rawX[i], y, rawZ[i]);
    validColors.push(bytes[off + 24] / 255, bytes[off + 25] / 255, bytes[off + 26] / 255);
  }

  const cleanNumSplats = validPositions.length / 3;
  const positions = new Float32Array(validPositions);
  const colors = new Float32Array(validColors);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  if (!window._aholoGaussianTexture) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.2, 'rgba(255, 255, 255, 0.9)');
    grad.addColorStop(0.45, 'rgba(255, 255, 255, 0.55)');
    grad.addColorStop(0.7, 'rgba(255, 255, 255, 0.2)');
    grad.addColorStop(0.9, 'rgba(255, 255, 255, 0.05)');
    grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    window._aholoGaussianTexture = tex;
  }

  const mat = new THREE.PointsMaterial({
    size: state.splatParticleSize,
    map: window._aholoGaussianTexture,
    vertexColors: true,
    transparent: true,
    alphaTest: 0.005,
    depthWrite: false,
    opacity: 0.95,
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
  if (countEl) countEl.textContent = `${cleanNumSplats.toLocaleString()} Gaussians`;
  showToast(`Aholo Engine loaded ${cleanNumSplats.toLocaleString()} 3D Gaussians!`);
}

function updateSplatTransform() {
  if (!splatPivot || !splatMesh) return;
  splatPivot.position.set(state.splatPosX, state.splatPosY, state.splatPosZ);
  splatYawGroup.rotation.y = (state.splatRotY * Math.PI) / 180;
  splatPitchGroup.rotation.x = (state.splatRotX * Math.PI) / 180;
  splatRollGroup.rotation.z = (state.splatRotZ * Math.PI) / 180;
  splatMesh.scale.setScalar(state.splatScale);
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
