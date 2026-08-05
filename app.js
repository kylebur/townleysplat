/**
 * 3D TERRAIN EXPLORER & REAL-TIME TEXTURE ALIGNMENT TOOL
 * Version: v1.3.2
 * Built with Three.js & Soft Radial Gaussian Splatting
 */

// Global App State
const state = {
  demData: null,
  widthM: 0,
  heightM: 0,
  cols: 0,
  rows: 0,
  heightScale: 1.5,
  textureOpacity: 1.0,
  showWireframe: false,
  showElevationTint: false,
  // Splat Layer State (6-DOF Transform & Scale)
  showSplatLayer: false,
  splatScale: 1.0,
  splatParticleSize: 0.45,
  splatRotX: 0.0,
  splatRotY: 0.0,
  splatRotZ: 0.0,
  splatPosX: 339.2,
  splatPosY: 10.0,
  splatPosZ: 322.8,

  // UV Alignment Parameters
  scaleX: 1.0,
  scaleY: 1.0,
  offsetX: 0.0,
  offsetY: 0.0,
  rotationDeg: 0.0,
  
  // Navigation State
  mode: 'walk', // 'walk' or 'fly'
  player: {
    x: 0,
    z: 0,
    y: 1.7,
    eyeHeight: 1.8,
    speed: 15.0, // m/s
    yaw: 0, // radians
    pitch: 0, // radians
    verticalVelocity: 0,
    isGrounded: true
  },
  
  keys: {},
  mouseLocked: false
};

// Three.js Core Objects
let scene, camera, renderer, terrainMesh, terrainGeo, terrainMat, wireframeMesh, skyMesh;
let splatPivot, splatYawGroup, splatPitchGroup, splatRollGroup, splatMesh;
let satelliteTexture, heightmapTexture;
let orbitControls;
let clock = new THREE.Clock();

// Canvas & HUD Elements
let minimapCanvas, minimapCtx;

// Local Storage Key
const STORAGE_KEY = 'dem_texture_alignment_config';

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
  initUI();
  await loadDEMData();
  initThree();
  initMinimap();
  animate();
  loadSavedAlignment();
});

// -------------------------------------------------------------
// 1. DATA LOADING
// -------------------------------------------------------------
async function loadDEMData() {
  try {
    const response = await fetch('dem_data.json');
    state.demData = await response.json();
    state.cols = state.demData.cols;
    state.rows = state.demData.rows;
    state.widthM = state.demData.width_m;
    state.heightM = state.demData.height_m;

    // Set initial player position to center of terrain
    state.player.x = state.widthM / 2;
    state.player.z = state.heightM / 2;

    console.log(`DEM Loaded: ${state.cols}x${state.rows}, ${state.widthM.toFixed(1)}m x ${state.heightM.toFixed(1)}m`);
  } catch (err) {
    console.error('Failed to load dem_data.json:', err);
  }
}

// Helper function to check if running in Viewer Mode
function checkIsViewerMode() {
  return (document.body && document.body.classList.contains('viewer-mode')) || window.location.pathname.includes('viewer.html');
}

// -------------------------------------------------------------
// 2. THREE.JS SCENE SETUP
// -------------------------------------------------------------
function initThree() {
  const container = document.getElementById('canvas-container');
  const isViewer = checkIsViewerMode();

  if (isViewer) {
    state.mode = 'fly';
    state.heightScale = 1.0; // No terrain exaggeration
    state.showSplatLayer = true;
  }

  // Scene with bright daylight atmosphere
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb); // Sky blue
  scene.fog = new THREE.Fog(0x87ceeb, 400, 4000); // Soft linear fog

  const centerX = (state.widthM || 678.4) / 2;
  const centerZ = (state.heightM || 645.5) / 2;

  // Camera
  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 1.0, 8000);
  
  if (isViewer) {
    // 200 ft altitude view framing the property
    camera.position.set(centerX, 180, centerZ + 320);
  } else {
    camera.position.set(centerX, 20, centerZ + 20);
  }

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  container.appendChild(renderer.domElement);

  // Orbit Controls (for Fly View)
  orbitControls = new THREE.OrbitControls(camera, renderer.domElement);
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.05;
  orbitControls.maxPolarAngle = Math.PI / 2 - 0.01; // don't go below ground
  orbitControls.target.set(centerX, 20, centerZ);
  orbitControls.enabled = (state.mode === 'fly');

  // Ambient & Sun Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
  scene.add(ambientLight);

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
  hemiLight.position.set(0, 500, 0);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xfffaed, 1.4);
  sunLight.position.set(state.widthM * 0.5, 600, state.heightM * 0.5);
  sunLight.castShadow = true;

  // Sky Dome
  const skyGeo = new THREE.SphereGeometry(6000, 32, 15);
  const skyMat = new THREE.MeshBasicMaterial({
    color: 0x87ceeb,
    side: THREE.BackSide
  });
  skyMesh = new THREE.Mesh(skyGeo, skyMat);
  scene.add(skyMesh);
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 1000;
  const d = Math.max(state.widthM, state.heightM);
  sunLight.shadow.camera.left = -d;
  sunLight.shadow.camera.right = d;
  sunLight.shadow.camera.top = d;
  sunLight.shadow.camera.bottom = -d;
  // Create Water Plane at Sea Level (Y = 0)
  const waterGeo = new THREE.PlaneGeometry(state.widthM * 3, state.heightM * 3);
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x0f4c81,
    roughness: 0.1,
    metalness: 0.8,
    transparent: true,
    opacity: 0.7
  });
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.rotation.x = -Math.PI / 2;
  waterMesh.position.set(state.widthM / 2, 0.02, state.heightM / 2);
  scene.add(waterMesh);

  // Load Satellite Screenshot Texture
  const textureLoader = new THREE.TextureLoader();
  satelliteTexture = textureLoader.load('stitched_screenshots_clean.png', (tex) => {
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    
    // Enable maximum anisotropic filtering for super crisp detail at grazing angles
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    tex.anisotropy = maxAnisotropy;

    updateTextureTransform();
  });

  // Build Terrain Mesh
  buildTerrainMesh();

  // Event Listeners
  window.addEventListener('resize', onWindowResize);
  setupNavigationEvents();
}

// -------------------------------------------------------------
// 3. TERRAIN GEOMETRY & MATERIAL
// -------------------------------------------------------------
function buildTerrainMesh() {
  if (terrainMesh) scene.remove(terrainMesh);
  if (wireframeMesh) scene.remove(wireframeMesh);

  const cols = state.cols;
  const rows = state.rows;
  const widthM = state.widthM;
  const heightM = state.heightM;

  terrainGeo = new THREE.PlaneGeometry(widthM, heightM, cols - 1, rows - 1);
  terrainGeo.rotateX(-Math.PI / 2); // Orient horizontal (XZ plane)
  terrainGeo.translate(widthM / 2, 0, heightM / 2); // Origin at top-left corner (0,0)

  const posAttr = terrainGeo.attributes.position;
  const elevs = state.demData.elevations;

  // Apply DEM Height Values to Vertices
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const elev = elevs[r][c];
      posAttr.setY(idx, elev * state.heightScale);
    }
  }

  terrainGeo.computeVertexNormals();

  // Create Elevation Color Canvas Texture for DEM Tinting / Blending
  heightmapTexture = createElevationColorTexture();

  // Custom Standard Material with Blending Support
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

  // Wireframe Mesh Overlay
  const wireMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    wireframe: true,
    transparent: true,
    opacity: 0.3
  });
  wireframeMesh = new THREE.Mesh(terrainGeo, wireMat);
  wireframeMesh.position.y += 0.05; // avoid z-fighting
  wireframeMesh.visible = state.showWireframe;
  scene.add(wireframeMesh);
}

// Generate Elevation Tint Texture (Terrain Colormap)
function createElevationColorTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = state.cols;
  canvas.height = state.rows;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(state.cols, state.rows);

  const minE = state.demData.min_elev;
  const maxE = state.demData.max_elev;
  const range = Math.max(0.1, maxE - minE);

  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const idx = (r * state.cols + c) * 4;
      const elev = state.demData.elevations[r][c];
      const norm = (elev - minE) / range; // 0 to 1

      // Simple terrain color gradient (blue -> green -> yellow -> brown -> white)
      let rVal, gVal, bVal;
      if (norm < 0.1) { rVal = 30; gVal = 80; bVal = 180; } // deep water / shoreline
      else if (norm < 0.4) { rVal = 50 + norm*200; gVal = 160 + norm*100; bVal = 60; } // lowland green
      else if (norm < 0.75) { rVal = 180 + norm*60; gVal = 140 + norm*40; bVal = 40; } // highland brown
      else { rVal = 240; gVal = 240; bVal = 250; } // peak white

      imgData.data[idx] = rVal;
      imgData.data[idx + 1] = gVal;
      imgData.data[idx + 2] = bVal;
      imgData.data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

// -------------------------------------------------------------
// 4. REAL-TIME TEXTURE UV MATRIX TRANSFORM
// -------------------------------------------------------------
function updateTextureTransform() {
  if (!satelliteTexture) return;

  const rad = (state.rotationDeg * Math.PI) / 180;

  satelliteTexture.center.set(0.5, 0.5);
  satelliteTexture.rotation = rad;
  satelliteTexture.repeat.set(state.scaleX, state.scaleY);
  satelliteTexture.offset.set(state.offsetX, state.offsetY);
  satelliteTexture.needsUpdate = true;

  if (terrainMat) {
    terrainMat.opacity = state.textureOpacity;
    terrainMat.transparent = state.textureOpacity < 1.0;
    
    // Switch between Satellite Texture and Elevation Tint Map if requested
    if (state.showElevationTint) {
      terrainMat.map = heightmapTexture;
    } else {
      terrainMat.map = satelliteTexture;
    }
    terrainMat.needsUpdate = true;
  }

  if (wireframeMesh) {
    wireframeMesh.visible = state.showWireframe;
  }
}

// -------------------------------------------------------------
// 5. TERRAIN HEIGHT INTERPOLATION & COLLISION
// -------------------------------------------------------------
function getTerrainHeightAt(x, z) {
  if (!state.demData) return 0;

  const widthM = state.widthM;
  const heightM = state.heightM;
  const cols = state.cols;
  const rows = state.rows;

  // Clamp coordinates within terrain bounds
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

  // Bilinear interpolation
  const hTop = h00 * (1 - tx) + h10 * tx;
  const hBottom = h01 * (1 - tx) + h11 * tx;
  const hInterp = hTop * (1 - tz) + hBottom * tz;

  return hInterp * state.heightScale;
}

// -------------------------------------------------------------
// 6. NAVIGATION & CONTROLS LOOP
// -------------------------------------------------------------
function setupNavigationEvents() {
  const canvas = renderer.domElement;

  // Keyboard events
  window.addEventListener('keydown', (e) => {
    state.keys[e.code] = true;
    
    // Quick shortcut nudges for texture alignment
    if (e.code === 'KeyI') nudgeOffset(0, 0.001);
    if (e.code === 'KeyK') nudgeOffset(0, -0.001);
    if (e.code === 'KeyJ') nudgeOffset(-0.001, 0);
    if (e.code === 'KeyL') nudgeOffset(0.001, 0);
    if (e.code === 'KeyU') nudgeScale(-0.01);
    if (e.code === 'KeyO') nudgeScale(0.01);
    if (e.code === 'KeyN') nudgeRotation(-0.5);
    if (e.code === 'KeyM') nudgeRotation(0.5);
  });

  window.addEventListener('keyup', (e) => {
    state.keys[e.code] = false;
  });

  // Pointer Lock for Walk Mode
  canvas.addEventListener('click', () => {
    if (state.mode === 'walk') {
      canvas.requestPointerLock();
    }
  });

  document.addEventListener('pointerlockchange', () => {
    state.mouseLocked = (document.pointerLockElement === canvas);
    const walkOverlay = document.getElementById('walk-overlay');
    if (state.mouseLocked) {
      walkOverlay.classList.add('hidden');
    } else if (state.mode === 'walk') {
      walkOverlay.classList.remove('hidden');
    }
  });

  // Mouse Look
  document.addEventListener('mousemove', (e) => {
    if (!state.mouseLocked || state.mode !== 'walk') return;

    const sensitivity = 0.0025;
    state.player.yaw -= e.movementX * sensitivity;
    state.player.pitch -= e.movementY * sensitivity;

    // Clamp pitch (-85° to +85°)
    const maxPitch = Math.PI / 2 - 0.05;
    state.player.pitch = Math.max(-maxPitch, Math.min(maxPitch, state.player.pitch));
  });
}

function updateWalkPhysics(delta) {
  if (state.mode !== 'walk') return;

  const player = state.player;
  let moveX = 0;
  let moveZ = 0;

  // Key direction inputs (Arrow keys or WASD)
  if (state.keys['ArrowUp'] || state.keys['KeyW']) moveZ -= 1;
  if (state.keys['ArrowDown'] || state.keys['KeyS']) moveZ += 1;
  if (state.keys['ArrowLeft'] || state.keys['KeyA']) moveX -= 1;
  if (state.keys['ArrowRight'] || state.keys['KeyD']) moveX += 1;

  // Run multiplier
  const runMultiplier = state.keys['ShiftLeft'] || state.keys['ShiftRight'] ? 2.2 : 1.0;
  const currentSpeed = player.speed * runMultiplier;

  if (moveX !== 0 || moveZ !== 0) {
    // Normalize movement vector
    const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
    moveX /= len;
    moveZ /= len;

    // Calculate movement in world space relative to camera yaw
    const forwardX = -Math.sin(player.yaw);
    const forwardZ = -Math.cos(player.yaw);
    const rightX = Math.cos(player.yaw);
    const rightZ = -Math.sin(player.yaw);

    const deltaX = (forwardX * moveZ + rightX * moveX) * currentSpeed * delta;
    const deltaZ = (forwardZ * moveZ + rightZ * moveX) * currentSpeed * delta;

    player.x += deltaX;
    player.z += deltaZ;
  }

  // Jump / Gravity Physics
  if (state.keys['Space'] && player.isGrounded) {
    player.verticalVelocity = 6.0; // Jump force
    player.isGrounded = false;
  }

  if (!player.isGrounded) {
    player.verticalVelocity -= 18.0 * delta; // Gravity
    player.y += player.verticalVelocity * delta;
  }

  // Ground Collision
  const groundY = getTerrainHeightAt(player.x, player.z) + player.eyeHeight;
  if (player.y <= groundY) {
    player.y = groundY;
    player.verticalVelocity = 0;
    player.isGrounded = true;
  }

  // Clamp player position to map area
  player.x = Math.max(5, Math.min(state.widthM - 5, player.x));
  player.z = Math.max(5, Math.min(state.heightM - 5, player.z));

  // Update Camera Position & Orientation
  camera.position.set(player.x, player.y, player.z);

  // Compute Look Direction
  const dir = new THREE.Vector3(
    Math.sin(player.yaw) * Math.cos(player.pitch),
    Math.sin(player.pitch),
    Math.cos(player.yaw) * Math.cos(player.pitch)
  );
  const target = new THREE.Vector3().copy(camera.position).add(dir);
  camera.lookAt(target);

  // Update Telemetry UI
  updateTelemetry(currentSpeed * (moveX !== 0 || moveZ !== 0 ? 1 : 0));
}

// -------------------------------------------------------------
// 7. MINIMAP & TELEMETRY
// -------------------------------------------------------------
function initMinimap() {
  minimapCanvas = document.getElementById('minimap-canvas');
  if (minimapCanvas) {
    minimapCtx = minimapCanvas.getContext('2d');
  }
}

function updateMinimap() {
  if (!minimapCtx || !state.demData) return;

  const ctx = minimapCtx;
  const w = minimapCanvas.width;
  const h = minimapCanvas.height;

  ctx.clearRect(0, 0, w, h);

  // Draw background terrain boundary
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Scale factor from world space to minimap
  const scale = (w - 20) / Math.max(state.widthM, state.heightM);

  const px = 10 + state.player.x * scale;
  const py = 10 + state.player.z * scale;

  // Draw player dot
  ctx.fillStyle = '#34d399';
  ctx.beginPath();
  ctx.arc(px, py, 4, 0, Math.PI * 2);
  ctx.fill();

  // Draw facing direction cone
  const coneLength = 14;
  const yaw = state.player.yaw;
  const dirX = px + Math.sin(yaw) * coneLength;
  const dirY = py + Math.cos(yaw) * coneLength;

  ctx.strokeStyle = '#34d399';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(dirX, dirY);
  ctx.stroke();
}

function updateTelemetry(currentSpeed) {
  document.getElementById('tele-x').textContent = `${state.player.x.toFixed(1)} m`;
  document.getElementById('tele-z').textContent = `${state.player.z.toFixed(1)} m`;
  
  const groundElev = getTerrainHeightAt(state.player.x, state.player.z) / state.heightScale;
  document.getElementById('tele-elev').textContent = `${groundElev.toFixed(1)} m`;
  
  let headingDeg = (Math.round((state.player.yaw * 180 / Math.PI)) % 360 + 360) % 360;
  let card = 'N';
  if (headingDeg >= 45 && headingDeg < 135) card = 'E';
  else if (headingDeg >= 135 && headingDeg < 225) card = 'S';
  else if (headingDeg >= 225 && headingDeg < 315) card = 'W';
  
  const headingEl = document.getElementById('tele-heading');
  if (headingEl) headingEl.textContent = `${headingDeg}° ${card}`;
  
  const speedEl = document.getElementById('tele-speed');
  if (speedEl) speedEl.textContent = `${(currentSpeed * 3.6).toFixed(1)} km/h`;
  
  const statsEl = document.getElementById('stats-badge');
  if (statsEl) statsEl.textContent = `Elev: ${groundElev.toFixed(1)}m | Scale: ${state.heightScale.toFixed(1)}x`;
}

// -------------------------------------------------------------
// 8. ANIMATION RENDER LOOP
// -------------------------------------------------------------
function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.1);

  if (state.mode === 'walk') {
    updateWalkPhysics(delta);
  } else {
    orbitControls.update();
  }

  renderer.render(scene, camera);
  updateMinimap();
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// -------------------------------------------------------------
// 9. UI CONTROL BINDINGS & HANDLERS
// -------------------------------------------------------------
function initUI() {
  const modeBadge = document.getElementById('mode-badge');
  const btnToggleMode = document.getElementById('btn-toggle-mode');
  const btnToggleTools = document.getElementById('btn-toggle-tools');
  const btnClosePanel = document.getElementById('btn-close-panel');
  const sidebar = document.getElementById('alignment-panel');
  const walkOverlay = document.getElementById('walk-overlay');
  const btnStartWalk = document.getElementById('btn-start-walk');

  // Mode Switch (Walk vs Fly/Orbit)
  if (btnToggleMode) {
    btnToggleMode.addEventListener('click', () => {
      if (state.mode === 'walk') {
        state.mode = 'fly';
        if (modeBadge) modeBadge.textContent = '✈️ Fly/Orbit View';
        btnToggleMode.innerHTML = '<span class="icon">🚶</span> Switch to Walk View';
        if (orbitControls) orbitControls.enabled = true;
        if (walkOverlay) walkOverlay.classList.add('hidden');
        if (document.pointerLockElement) document.exitPointerLock();
      } else {
        state.mode = 'walk';
        if (modeBadge) modeBadge.textContent = '🚶 Walk Mode';
        btnToggleMode.innerHTML = '<span class="icon">✈️</span> Switch to Fly/Orbit View';
        if (orbitControls) orbitControls.enabled = false;
        if (walkOverlay) walkOverlay.classList.remove('hidden');
      }
    });
  }

  const btnToggleSplat = document.getElementById('btn-toggle-splat');
  if (btnToggleSplat) {
    btnToggleSplat.addEventListener('click', () => {
      state.showSplatLayer = !state.showSplatLayer;
      if (splatPivot) splatPivot.visible = state.showSplatLayer;
      showToast(state.showSplatLayer ? '3D Splat Layer Visible' : '3D Splat Layer Hidden');
    });
  }

  if (btnStartWalk) {
    btnStartWalk.addEventListener('click', () => {
      renderer.domElement.requestPointerLock();
    });
  }

  // Sidebar Toggle
  if (btnToggleTools && sidebar) {
    btnToggleTools.addEventListener('click', () => {
      sidebar.classList.toggle('hidden');
    });
  }

  if (btnClosePanel && sidebar) {
    btnClosePanel.addEventListener('click', () => {
      sidebar.classList.add('hidden');
    });
  }

  // Slider Event Listeners
  bindSlider('slider-opacity', 'val-opacity', (val) => {
    state.textureOpacity = parseFloat(val);
    return `${Math.round(state.textureOpacity * 100)}%`;
  }, updateTextureTransform);

  bindSlider('slider-height-scale', 'val-height-scale', (val) => {
    state.heightScale = parseFloat(val);
    buildTerrainMesh();
    return `${state.heightScale.toFixed(1)}x`;
  });

  bindSlider('slider-scale-x', 'val-scale-x', (val) => {
    state.scaleX = parseFloat(val);
    if (state.lockAspect) {
      state.scaleY = state.scaleX;
      document.getElementById('slider-scale-y').value = state.scaleY;
      document.getElementById('val-scale-y').textContent = state.scaleY.toFixed(3);
    }
    return state.scaleX.toFixed(3);
  }, updateTextureTransform);

  bindSlider('slider-scale-y', 'val-scale-y', (val) => {
    state.scaleY = parseFloat(val);
    if (state.lockAspect) {
      state.scaleX = state.scaleY;
      document.getElementById('slider-scale-x').value = state.scaleX;
      document.getElementById('val-scale-x').textContent = state.scaleX.toFixed(3);
    }
    return state.scaleY.toFixed(3);
  }, updateTextureTransform);

  bindSlider('slider-offset-x', 'val-offset-x', (val) => {
    state.offsetX = parseFloat(val);
    return state.offsetX.toFixed(4);
  }, updateTextureTransform);

  bindSlider('slider-offset-y', 'val-offset-y', (val) => {
    state.offsetY = parseFloat(val);
    return state.offsetY.toFixed(4);
  }, updateTextureTransform);

  bindSlider('slider-rotation', 'val-rotation', (val) => {
    state.rotationDeg = parseFloat(val);
    return `${state.rotationDeg.toFixed(1)}°`;
  }, updateTextureTransform);

  // Checkboxes
  document.getElementById('chk-wireframe').addEventListener('change', (e) => {
    state.showWireframe = e.target.checked;
    updateTextureTransform();
  });

  document.getElementById('chk-elevation-color').addEventListener('change', (e) => {
    state.showElevationTint = e.target.checked;
    updateTextureTransform();
  });

  document.getElementById('chk-lock-aspect').addEventListener('change', (e) => {
    state.lockAspect = e.target.checked;
  });

  // Splat Layer Controls
  const chkSplat = document.getElementById('chk-splat-layer');
  if (chkSplat) {
    chkSplat.addEventListener('change', (e) => {
      state.showSplatLayer = e.target.checked;
      if (state.showSplatLayer && !splatMesh) {
        // Auto-load generated drone reconstruction splat if available
        fetch('drone_reconstruction.splat')
          .then(res => res.ok ? res.arrayBuffer() : null)
          .then(buffer => {
            if (buffer) parseAndCreateSplatMesh(buffer, 'drone_reconstruction.splat');
          }).catch(err => console.log('No default splat file found:', err));
      } else if (splatMesh) {
        splatMesh.visible = state.showSplatLayer;
      }
    });
  }

  const inputSplat = document.getElementById('input-splat-file');
  if (inputSplat) {
    inputSplat.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handleSplatFileUpload(file);
    });
  }

  bindSlider('slider-splat-scale', 'val-splat-scale', (val) => {
    state.splatScale = parseFloat(val);
    updateSplatTransform();
    return `${state.splatScale.toFixed(1)}x`;
  });
  bindNumberInput('num-splat-scale', (val) => { state.splatScale = val; syncSplatSliders(); updateSplatTransform(); });

  bindSlider('slider-splat-psize', 'val-splat-psize', (val) => {
    state.splatParticleSize = parseFloat(val);
    updateSplatTransform();
    return `${state.splatParticleSize.toFixed(2)}`;
  });
  bindNumberInput('num-splat-psize', (val) => { state.splatParticleSize = val; syncSplatSliders(); updateSplatTransform(); });

  bindSlider('slider-splat-rot-x', 'val-splat-rot-x', (val) => {
    state.splatRotX = parseFloat(val);
    updateSplatTransform();
    return `${state.splatRotX.toFixed(0)}°`;
  });
  bindNumberInput('num-splat-rot-x', (val) => { state.splatRotX = val; syncSplatSliders(); updateSplatTransform(); });

  bindSlider('slider-splat-rot-y', 'val-splat-rot-y', (val) => {
    state.splatRotY = parseFloat(val);
    updateSplatTransform();
    return `${state.splatRotY.toFixed(0)}°`;
  });
  bindNumberInput('num-splat-rot-y', (val) => { state.splatRotY = val; syncSplatSliders(); updateSplatTransform(); });

  bindSlider('slider-splat-rot-z', 'val-splat-rot-z', (val) => {
    state.splatRotZ = parseFloat(val);
    updateSplatTransform();
    return `${state.splatRotZ.toFixed(0)}°`;
  });
  bindNumberInput('num-splat-rot-z', (val) => { state.splatRotZ = val; syncSplatSliders(); updateSplatTransform(); });

  bindSlider('slider-splat-pos-x', 'val-splat-pos-x', (val) => {
    state.splatPosX = parseFloat(val);
    updateSplatTransform();
    return `${state.splatPosX.toFixed(0)} m`;
  });
  bindNumberInput('num-splat-pos-x', (val) => { state.splatPosX = val; syncSplatSliders(); updateSplatTransform(); });

  bindSlider('slider-splat-pos-y', 'val-splat-pos-y', (val) => {
    state.splatPosY = parseFloat(val);
    updateSplatTransform();
    return `${state.splatPosY.toFixed(1)} m`;
  });
  bindNumberInput('num-splat-pos-y', (val) => { state.splatPosY = val; syncSplatSliders(); updateSplatTransform(); });

  bindSlider('slider-splat-pos-z', 'val-splat-pos-z', (val) => {
    state.splatPosZ = parseFloat(val);
    updateSplatTransform();
    return `${state.splatPosZ.toFixed(0)} m`;
  });
  bindNumberInput('num-splat-pos-z', (val) => { state.splatPosZ = val; syncSplatSliders(); updateSplatTransform(); });

  const safeClick = (id, fn) => {
    const el = document.getElementById(id) || document.getElementById(`btn-${id}`);
    if (el) el.addEventListener('click', fn);
  };

  // Quick Action Buttons for Splat
  safeClick('btn-splat-flip-x', () => {
    state.splatRotX = (state.splatRotX + 180) % 360;
    if (state.splatRotX > 180) state.splatRotX -= 360;
    syncSplatSliders();
    updateSplatTransform();
  });

  safeClick('btn-splat-snap-ground', () => {
    state.splatPosY = getTerrainHeightAt(state.splatPosX, state.splatPosZ);
    syncSplatSliders();
    updateSplatTransform();
    showToast(`Snapped Splat to Ground (${state.splatPosY.toFixed(1)}m)`);
  });

  safeClick('btn-splat-center', () => {
    state.splatPosX = state.widthM / 2;
    state.splatPosZ = state.heightM / 2;
    syncSplatSliders();
    updateSplatTransform();
  });

  safeClick('btn-splat-reset', () => {
    state.splatScale = 1.0;
    state.splatParticleSize = 0.18;
    state.splatRotX = 0;
    state.splatRotY = 0;
    state.splatRotZ = 0;
    state.splatPosX = state.widthM / 2;
    state.splatPosY = 10;
    state.splatPosZ = state.heightM / 2;
    syncSplatSliders();
    updateSplatTransform();
  });

  // D-Pad Nudge Buttons
  safeClick('nudge-up', () => nudgeOffset(0, 0.001));
  safeClick('nudge-down', () => nudgeOffset(0, -0.001));
  safeClick('nudge-left', () => nudgeOffset(-0.001, 0));
  safeClick('nudge-right', () => nudgeOffset(0.001, 0));
  safeClick('nudge-center', () => {
    state.offsetX = 0;
    state.offsetY = 0;
    syncSliderValues();
    updateTextureTransform();
  });

  // Rotation Quick Buttons
  safeClick('btn-rot-ccw', () => nudgeRotation(-1.0));
  safeClick('btn-rot-cw', () => nudgeRotation(1.0));
  safeClick('btn-rot-zero', () => {
    state.rotationDeg = 0;
    syncSliderValues();
    updateTextureTransform();
  });

  // Actions: Save & Load Config
  safeClick('btn-save-config', saveAlignmentConfig);
  safeClick('btn-load-config', loadSavedAlignment);
  safeClick('btn-reset-alignment', resetAlignment);
}

function bindSlider(sliderId, valId, formatFn, callback) {
  const slider = document.getElementById(sliderId);
  const valDisplay = document.getElementById(valId);

  slider.addEventListener('input', (e) => {
    const formatted = formatFn(e.target.value);
    if (valDisplay) valDisplay.textContent = formatted;
    if (callback) callback();
  });
}

function bindNumberInput(numId, callback) {
  const input = document.getElementById(numId);
  if (!input) return;

  const handleUpdate = () => {
    const val = parseFloat(input.value);
    if (!isNaN(val)) {
      callback(val);
    }
  };

  input.addEventListener('input', handleUpdate);
  input.addEventListener('change', handleUpdate);
}

function nudgeOffset(dx, dy) {
  state.offsetX = Math.max(-0.5, Math.min(0.5, state.offsetX + dx));
  state.offsetY = Math.max(-0.5, Math.min(0.5, state.offsetY + dy));
  syncSliderValues();
  updateTextureTransform();
}

function nudgeScale(ds) {
  state.scaleX = Math.max(0.2, Math.min(3.0, state.scaleX + ds));
  state.scaleY = Math.max(0.2, Math.min(3.0, state.scaleY + ds));
  syncSliderValues();
  updateTextureTransform();
}

function nudgeRotation(dDeg) {
  state.rotationDeg = (state.rotationDeg + dDeg);
  syncSliderValues();
  updateTextureTransform();
}

function syncSliderValues() {
  document.getElementById('slider-scale-x').value = state.scaleX;
  document.getElementById('val-scale-x').textContent = state.scaleX.toFixed(3);

  document.getElementById('slider-scale-y').value = state.scaleY;
  document.getElementById('val-scale-y').textContent = state.scaleY.toFixed(3);

  document.getElementById('slider-offset-x').value = state.offsetX;
  document.getElementById('val-offset-x').textContent = state.offsetX.toFixed(4);

  document.getElementById('slider-offset-y').value = state.offsetY;
  document.getElementById('val-offset-y').textContent = state.offsetY.toFixed(4);

  document.getElementById('slider-rotation').value = state.rotationDeg;
  document.getElementById('val-rotation').textContent = `${state.rotationDeg.toFixed(1)}°`;
}

// Save Alignment Config to LocalStorage and trigger Download
function saveAlignmentConfig() {
  const config = {
    scaleX: state.scaleX,
    scaleY: state.scaleY,
    offsetX: state.offsetX,
    offsetY: state.offsetY,
    rotationDeg: state.rotationDeg,
    heightScale: state.heightScale,
    
    // 6-DOF Splat Model Parameters
    splatScale: state.splatScale,
    splatParticleSize: state.splatParticleSize,
    splatRotX: state.splatRotX,
    splatRotY: state.splatRotY,
    splatRotZ: state.splatRotZ,
    splatPosX: state.splatPosX,
    splatPosY: state.splatPosY,
    splatPosZ: state.splatPosZ,

    // Saved Camera Position & Orbit Target Angle
    cameraPosX: camera ? camera.position.x : null,
    cameraPosY: camera ? camera.position.y : null,
    cameraPosZ: camera ? camera.position.z : null,
    targetPosX: orbitControls ? orbitControls.target.x : null,
    targetPosY: orbitControls ? orbitControls.target.y : null,
    targetPosZ: orbitControls ? orbitControls.target.z : null,
    
    timestamp: new Date().toISOString()
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));

  // Trigger JSON file download
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'terrain_alignment_config.json';
  a.click();
  URL.revokeObjectURL(url);

  showToast('Alignment, Splat & Camera Angle saved to config!');
}

async function loadSavedAlignment() {
  let config = null;
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      config = JSON.parse(saved);
    } catch (e) {}
  }
  if (!config) {
    try {
      const res = await fetch('terrain_alignment_config.json');
      if (res.ok) {
        config = await res.json();
      }
    } catch (e) {}
  }

  if (config) {
    state.scaleX = config.scaleX ?? 1.0;
    state.scaleY = config.scaleY ?? 1.0;
    state.offsetX = config.offsetX ?? 0.0;
    state.offsetY = config.offsetY ?? 0.0;
    state.rotationDeg = config.rotationDeg ?? 0.0;
    const isViewer = checkIsViewerMode();
    if (isViewer) {
      state.heightScale = 1.0; // No terrain exaggeration
      state.showSplatLayer = true;
    } else {
      state.heightScale = config.heightScale ?? 1.5;
    }

    state.splatScale = config.splatScale ?? 1.0;
    state.splatParticleSize = config.splatParticleSize ?? 0.18;
    state.splatRotX = config.splatRotX ?? 0.0;
    state.splatRotY = config.splatRotY ?? 0.0;
    state.splatRotZ = config.splatRotZ ?? 0.0;
    state.splatPosX = config.splatPosX ?? (state.widthM / 2);
    state.splatPosY = config.splatPosY ?? 10.0;
    state.splatPosZ = config.splatPosZ ?? (state.heightM / 2);

    syncSliderValues();
    syncSplatSliders();
    buildTerrainMesh();
    updateTextureTransform();

    // Auto-load 3D Splat Mesh if Splat Layer is enabled
    if (state.showSplatLayer && !splatMesh) {
      fetch('drone_reconstruction.splat')
        .then(res => res.ok ? res.arrayBuffer() : null)
        .then(buffer => {
          if (buffer) parseAndCreateSplatMesh(buffer, 'drone_reconstruction.splat');
        }).catch(err => console.log('No default splat file:', err));
    } else {
      updateSplatTransform();
    }

    if (config.cameraPosX !== undefined && config.cameraPosX !== null && orbitControls) {
      // Restore exact saved camera position & orbit target angle
      orbitControls.target.set(config.targetPosX, config.targetPosY, config.targetPosZ);
      camera.position.set(config.cameraPosX, config.cameraPosY, config.cameraPosZ);
      camera.lookAt(config.targetPosX, config.targetPosY, config.targetPosZ);
      orbitControls.update();
    } else if (isViewer && orbitControls) {
      const targetX = state.splatPosX || (state.widthM / 2);
      const targetZ = state.splatPosZ || (state.heightM / 2);
      const targetY = Math.max(0, state.splatPosY || 10);
      const flyoverAltM = 60.96; // 200 ft altitude

      const camX = targetX - 90;
      const camZ = targetZ + 110;
      const groundAtCam = getTerrainHeightAt(camX, camZ);
      const camY = Math.max(groundAtCam + flyoverAltM, targetY + flyoverAltM + 10);

      orbitControls.target.set(targetX, targetY, targetZ);
      camera.position.set(camX, camY, camZ);
      camera.lookAt(targetX, targetY, targetZ);
      orbitControls.update();
    }

    showToast('Loaded 200 ft Flyover View & 3D Drone Model!');
  }
}

function resetAlignment() {
  state.scaleX = 1.0;
  state.scaleY = 1.0;
  state.offsetX = 0.0;
  state.offsetY = 0.0;
  state.rotationDeg = 0.0;
  state.heightScale = 1.5;

  syncSliderValues();
  buildTerrainMesh();
  updateTextureTransform();
  showToast('Alignment reset to default.');
}

function handleSplatFileUpload(file) {
  showToast(`Loading 3D Splat: ${file.name}...`);
  const reader = new FileReader();
  reader.onload = (e) => {
    parseAndCreateSplatMesh(e.target.result, file.name);
  };
  reader.readAsArrayBuffer(file);
}

function parseAndCreateSplatMesh(buffer, filename) {
  if (splatMesh) scene.remove(splatMesh);

  const bytes = new Uint8Array(buffer);
  const numSplats = Math.floor(bytes.length / 32);

  if (numSplats <= 0) {
    showToast('Error: Invalid .splat file format');
    return;
  }

  const positions = new Float32Array(numSplats * 3);
  const colors = new Float32Array(numSplats * 3);
  const dataView = new DataView(buffer);

  for (let i = 0; i < numSplats; i++) {
    const off = i * 32;
    const x = dataView.getFloat32(off, true);
    const y = dataView.getFloat32(off + 4, true);
    const z = dataView.getFloat32(off + 8, true);

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    const r = bytes[off + 24] / 255;
    const g = bytes[off + 25] / 255;
    const b = bytes[off + 26] / 255;

    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  if (!window._gaussianSplatTexture) {
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
    window._gaussianSplatTexture = tex;
  }

  const mat = new THREE.PointsMaterial({
    size: state.splatParticleSize,
    map: window._gaussianSplatTexture,
    vertexColors: true,
    transparent: true,
    alphaTest: 0.005,
    depthWrite: false,
    opacity: 0.95,
    blending: THREE.NormalBlending
  });

  splatMesh = new THREE.Points(geo, mat);

  // Build Decoupled 3-Tier Pivot Hierarchy
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

  state.showSplatLayer = true;
  const chkSplat = document.getElementById('chk-splat-layer');
  if (chkSplat) chkSplat.checked = true;
  showToast(`Loaded ${numSplats.toLocaleString()} 3D Gaussians!`);
}

function updateSplatTransform() {
  if (!splatPivot || !splatMesh) return;

  // 1. World Position (Position X, Y, Z)
  splatPivot.position.set(state.splatPosX, state.splatPosY, state.splatPosZ);

  // 2. World Yaw (Rotation around vertical Y axis)
  splatYawGroup.rotation.y = (state.splatRotY * Math.PI) / 180;

  // 3. Local Pitch (Rotation around X axis - tilt / flip)
  splatPitchGroup.rotation.x = (state.splatRotX * Math.PI) / 180;

  // 4. Local Roll (Rotation around Z axis - bank)
  splatRollGroup.rotation.z = (state.splatRotZ * Math.PI) / 180;

  // 5. Scale & Particle Size
  splatMesh.scale.setScalar(state.splatScale);
  if (splatMesh.material) {
    splatMesh.material.size = state.splatParticleSize;
  }

  splatPivot.visible = state.showSplatLayer;
}

function syncSplatSliders() {
  const setVal = (id, val, str) => {
    const el = document.getElementById(id);
    const numEl = document.getElementById(id.replace('slider-', 'num-'));
    const label = document.getElementById(`val-${id.replace('slider-', '')}`);
    if (el) el.value = val;
    if (numEl) numEl.value = val;
    if (label) label.textContent = str;
  };

  setVal('slider-splat-scale', state.splatScale, `${state.splatScale.toFixed(1)}x`);
  setVal('slider-splat-psize', state.splatParticleSize, state.splatParticleSize.toFixed(2));
  setVal('slider-splat-rot-x', state.splatRotX, `${state.splatRotX.toFixed(0)}°`);
  setVal('slider-splat-rot-y', state.splatRotY, `${state.splatRotY.toFixed(0)}°`);
  setVal('slider-splat-rot-z', state.splatRotZ, `${state.splatRotZ.toFixed(0)}°`);
  setVal('slider-splat-pos-x', state.splatPosX, `${state.splatPosX.toFixed(0)} m`);
  setVal('slider-splat-pos-y', state.splatPosY, `${state.splatPosY.toFixed(1)} m`);
  setVal('slider-splat-pos-z', state.splatPosZ, `${state.splatPosZ.toFixed(0)} m`);
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  if (toast) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
  }
}
