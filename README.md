# 🚁 3D Land Explorer & Drone Gaussian Splat Photogrammetry

**Version**: `v1.3.3`  
**GitHub Repository**: [git@github.com:kylebur/townleysplat.git](https://github.com/kylebur/townleysplat)  
**Live GitHub Pages Demo (Viewer)**: [https://kylebur.github.io/townleysplat/viewer.html](https://kylebur.github.io/townleysplat/viewer.html)  
**Live GitHub Pages Demo (Editor)**: [https://kylebur.github.io/townleysplat/index.html](https://kylebur.github.io/townleysplat/index.html)  

---

## 📌 Project Overview
3D Land Explorer is an interactive 3D WebGL application designed to visualize and analyze property land terrain. It seamlessly merges high-resolution elevation data from NOAA CUDEM 1/9 arc-second GeoTIFF DEMs with aerial satellite imagery and photogrammetric 3D Gaussian Splat models reconstructed from 4K drone video footage.

---

## ✨ Features

- **🚁 200 ft Flyover Presentation Mode (`viewer.html`)**: Read-only presentation mode defaulting to a 200 ft altitude flyover view, 1.0x physical height scale, and active 3D Gaussian Splat drone layer.
- **🚶 Interactive Walk Mode (`index.html`)**: First-person ground-level walkthrough at 1:1 human scale with Arrow/WASD controls, mouse-look pointer lock, jump physics, and bilinear elevation ground collision.
- **📐 Real-Time Texture Alignment HUD**: Interactive matrix transform controls (Scale X/Y, Offset X/Y, Rotation, Opacity, Wireframe, DEM Elevation Tint).
- **✨ 3D Gaussian Splatting Overlay**: Integrated 3D drone photogrammetry point cloud generated via COLMAP Structure-from-Motion (SfM) from 4K drone flight video (`DJI_0001_remuxed.mp4`).
- **🕹️ Decoupled 6-DOF Pivot Hierarchy**: 3-tier pivot hierarchy (`splatPivot` -> `splatYawGroup` -> `splatPitchGroup` -> `splatRollGroup` -> `splatMesh`) eliminating Euler gimbal coupling for independent Compass Yaw, Tilt Pitch, and Bank Roll.
- **💾 Alignment Persistence**: Exports and auto-loads `terrain_alignment_config.json` across browser sessions.

---

## 🚀 Getting Started

### Local Web Server
Run Python's built-in HTTP server on port 8080:
```bash
python3 -m http.server 8080
```

### Access Points
- **Read-Only 200 ft Flyover View**: [http://localhost:8080/viewer.html](http://localhost:8080/viewer.html)
- **Alignment & Controls Editor**: [http://localhost:8080/index.html](http://localhost:8080/index.html)

---

## 📝 Change Log

### `v1.3.3` - 2026-08-05
- **Fixed**: Added timestamp cache buster (`drone_reconstruction.splat?t=...`) to `fetch` calls in `app.js` to force the browser to immediately load the new 212,975-point `.splat` file instead of serving stale cached HTTP responses.
- **Fixed**: Force re-fetching `.splat` files when `loadSavedAlignment()` initializes across browser sessions.


### `v1.3.0` - 2026-08-04
- **Added**: High-speed 1 fps keyframe photogrammetry pipeline script (`process_keyframes_photogrammetry.py`) targeting ~300k-500k 3D tie points across ~327 keyframes.
- **Added**: Sequential feature matching with overlap 15 and loop-closure detection.


### `v1.2.4` - 2026-08-04
- **Added**: COLMAP crash recovery detection & database audit script in `process_hd_photogrammetry.py`.
- **Verified**: SQLite database `colmap_hd_db.db` (26.36 GB) successfully preserved 100% of extracted SIFT keypoints, descriptors, and pairwise verified 2-view geometries across all 9,814 HD drone video frames.
 (up to pair `Image 9813 <-> Image 9814`).
- **Added**: Automatic step-skipping logic to resume directly from Step 4 (`colmap mapper`) without re-running heavy feature extraction or matching.


### `v1.2.0` - 2026-08-03
- **Added**: Dedicated Read-Only Presentation Page (`viewer.html`) defaulting to 200 ft flyover view, 1.0x terrain exaggeration, and automatic 3D drone splat overlay.
- **Added**: Decoupled 3-tier pivot hierarchy (`splatPivot` -> `splatYawGroup` -> `splatPitchGroup` -> `splatRollGroup`) for independent 6-DOF rotation without gimbal lock.
- **Added**: Direct numerical input boxes (`<input type="number">`) next to all rotation, scale, and position sliders.
- **Added**: Expanded splat scale limit up to 1000x and added `⛰️ Snap Ground` height calculation button.
- **Added**: GUI Version Badges in bottom corner and code headers according to project guidelines.

### `v1.1.0` - 2026-08-03
- **Added**: COLMAP Structure-from-Motion 3D photogrammetry reconstruction pipeline processing 164 frames from 4K drone flight video `DJI_0001_remuxed.mp4`.
- **Added**: Reconstructed 109,937 3D tie points exported to `drone_reconstruction.splat` (3.51 MB).
- **Added**: Binary `.splat` parser and `PointsMaterial` renderer overlay.

### `v1.0.0` - 2026-08-03
- **Initial Release**: Python GeoTIFF elevation extraction script (`generate_png.py`) producing `dem_data.json` and 4-panel analysis dashboard (`dem_analysis_dashboard.png`).
- **Added**: Three.js WebGL terrain heightmap engine with satellite texture mapping (`stitched_screenshots_clean.png`).
- **Added**: Walk/Fly navigation modes, minimap radar, and persistent JSON alignment storage.
