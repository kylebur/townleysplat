# 🚁 3D Land Explorer & Drone Gaussian Splat Photogrammetry

**Version**: `v3.0.0`  
**GitHub Repository**: [git@github.com:kylebur/townleysplat.git](https://github.com/kylebur/townleysplat)  
**Live Aholo 3.0 Pure 3DGS Engine**: [https://kylebur.github.io/townleysplat/aholo3.html](https://kylebur.github.io/townleysplat/aholo3.html)  
**Live Aholo 2.0 Dense Engine**: [https://kylebur.github.io/townleysplat/aholo2.html](https://kylebur.github.io/townleysplat/aholo2.html)  
**Live Aholo 1.0 3DGS Engine**: [https://kylebur.github.io/townleysplat/aholo.html](https://kylebur.github.io/townleysplat/aholo.html)  
**Live GitHub Pages Demo (Viewer)**: [https://kylebur.github.io/townleysplat/viewer.html](https://kylebur.github.io/townleysplat/viewer.html)  
**Live GitHub Pages Demo (Editor)**: [https://kylebur.github.io/townleysplat/index.html](https://kylebur.github.io/townleysplat/index.html)  

---

## 📌 Project Overview
3D Land Explorer is an interactive 3D WebGL application designed to visualize and analyze property land terrain. It seamlessly merges high-resolution elevation data from NOAA CUDEM 1/9 arc-second GeoTIFF DEMs with aerial satellite imagery and photogrammetric 3D Gaussian Splat models reconstructed from 4K drone video footage.

---

## ✨ Features

- **✨ Aholo 3.0 Pure 3DGS Engine (`aholo3.html`)**: Standalone WebGL viewer focusing **exclusively on the 3D Gaussian Splat point cloud geometry** (with basemap terrain disabled), featuring auto-centering bounding box origin alignment, interactive Splat Particle Size slider (`0.5px` - `8.0px`), and Opacity controls.
- **✨ Aholo 2.0 Dense Surface Engine (`aholo2.html`)**: Parallel web app rendering dense 3D Gaussian Surface Splats generated via Multi-View Stereo 2D-3D keyframe pixel triangulation.
- **✨ Aholo 1.0 3DGS Spatial Engine (`aholo.html`)**: Standalone web app rendering the 655,186 3D Gaussian Splat model and DEM terrain elevation using high-performance WebGL 3DGS shaders and spatial HUD metrics.
- **🚁 200 ft Flyover Presentation Mode (`viewer.html`)**: Read-only presentation mode defaulting to a 200 ft altitude flyover view, 1.0x physical height scale, and active 3D Gaussian Splat drone layer.
- **🚶 Interactive Walk Mode (`index.html`)**: First-person ground-level walkthrough at 1:1 human scale with Arrow/WASD controls, mouse-look pointer lock, jump physics, and bilinear elevation ground collision.

---

## 🚀 Getting Started

### Local Web Server
Run Python's built-in HTTP server on port 8080:
```bash
python3 -m http.server 8080
```

### Access Points
- **Aholo 3.0 Pure 3DGS Engine**: [http://localhost:8080/aholo3.html](http://localhost:8080/aholo3.html)
- **Aholo 2.0 Dense Surface Engine**: [http://localhost:8080/aholo2.html](http://localhost:8080/aholo2.html)
- **Aholo 1.0 3DGS Engine**: [http://localhost:8080/aholo.html](http://localhost:8080/aholo.html)
- **Read-Only 200 ft Flyover View**: [http://localhost:8080/viewer.html](http://localhost:8080/viewer.html)
- **Alignment & Controls Editor**: [http://localhost:8080/index.html](http://localhost:8080/index.html)

---

## 📝 Change Log

### `v3.0.0` - 2026-08-05
- **Added**: Built **Aholo 3.0 Pure 3DGS Engine** (`aholo3.html`, `aholo3.js`), focusing exclusively on 3D Gaussian Splat photogrammetry geometry without DEM basemap or satellite ground plane distractions. Includes auto-centering bounding box origin alignment, Splat Particle Size slider, and Opacity controls.


### `v1.7.5` - 2026-08-05
- **Fixed**: Implemented 2D Canvas Color Saturation Engine (+50% Saturation, +20% Contrast filter) and high-contrast ambient lighting (`0.25` ambient + `0.25` hemi + `1.25` sun) in `aholo.js` to bring out deep, rich, vivid aerial map colors.








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
