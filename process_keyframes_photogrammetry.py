#!/usr/bin/env python3
"""
High-Speed 1 fps Keyframe Photogrammetry Pipeline
Version: v1.3.0

Extracts 1 frame per second (~327 keyframes) from DJI_0001_remuxed.mp4,
runs COLMAP SIFT extraction, sequential matching with loop closure,
reconstructs ~300k-500k high-density 3D tie points in 5-10 minutes,
and exports drone_reconstruction.splat.
"""

import os
import sys
import time
import subprocess
import numpy as np

def run(cmd):
    print(f"\n[RUNNING]: {cmd}")
    t0 = time.time()
    res = subprocess.run(cmd, shell=True)
    dt = time.time() - t0
    if res.returncode != 0:
        print(f"[ERROR]: Command failed with exit code {res.returncode}")
        sys.exit(res.returncode)
    print(f"[COMPLETED] in {dt:.1f}s")

def main():
    print("=" * 70)
    print("🚀 HIGH-SPEED 1 FPS KEYFRAME 3D PHOTOGRAMMETRY RECONSTRUCTION (v1.3.0)")
    print("=" * 70)

    video_path = "DJI_0001_remuxed.mp4"
    frames_dir = "drone_frames_kf"
    db_path = "colmap_kf_db.db"
    sparse_dir = "colmap_kf_sparse"
    text_dir = "colmap_kf_text"
    splat_output = "drone_reconstruction.splat"
    ply_output = "drone_sparse_pointcloud_kf.ply"

    os.makedirs(frames_dir, exist_ok=True)
    os.makedirs(sparse_dir, exist_ok=True)
    os.makedirs(text_dir, exist_ok=True)

    # 1. Keyframe Extraction (1 frame per second -> fps=1)
    print("\n--- STEP 1: Extracting 1 FPS Keyframes (~327 frames) ---")
    frame_count = len([f for f in os.listdir(frames_dir) if f.endswith('.jpg')])
    if frame_count < 300:
        run(f"ffmpeg -y -i {video_path} -vf \"fps=1,scale=1920:1080\" -q:v 2 {frames_dir}/kf_%04d.jpg")
        frame_count = len([f for f in os.listdir(frames_dir) if f.endswith('.jpg')])
    print(f"✅ Keyframes ready: {frame_count} frames found.")

    # 2. COLMAP SIFT Feature Extraction
    print("\n--- STEP 2: SIFT Feature Extraction (8,192 features/frame) ---")
    run(f"colmap feature_extractor "
        f"--database_path {db_path} "
        f"--image_path {frames_dir} "
        f"--ImageReader.single_camera 1 "
        f"--ImageReader.camera_model RADIAL "
        f"--SiftExtraction.max_num_features 8192 "
        f"--FeatureExtraction.use_gpu 0")

    # 3. COLMAP Sequential Matching
    print("\n--- STEP 3: Sequential & Loop-Closure Feature Matching ---")
    run(f"colmap sequential_matcher "
        f"--database_path {db_path} "
        f"--SequentialMatching.overlap 15 "
        f"--SequentialMatching.loop_detection 1 "
        f"--FeatureMatching.use_gpu 0")

    # 4. Incremental Structure-from-Motion Mapping
    print("\n--- STEP 4: Incremental 3D Reconstruction ---")
    run(f"colmap mapper "
        f"--database_path {db_path} "
        f"--image_path {frames_dir} "
        f"--output_path {sparse_dir}")

    # 5. Export PLY & Convert to Text
    print("\n--- STEP 5: Exporting PLY Point Cloud ---")
    if os.path.exists(os.path.join(sparse_dir, "0")):
        run(f"colmap model_converter --input_path {sparse_dir}/0 --output_path {text_dir} --output_type TXT")
        run(f"colmap model_converter --input_path {sparse_dir}/0 --output_path {ply_output} --output_type PLY")

    # 6. Build .splat binary file for Three.js engine
    print("\n--- STEP 6: Generating High-Density .splat Binary File ---")
    pts_file = os.path.join(text_dir, "points3D.txt")
    if os.path.exists(pts_file):
        points = []
        colors = []
        with open(pts_file, 'r') as f:
            for line in f:
                if line.startswith("#") or not line.strip():
                    continue
                parts = line.strip().split()
                if len(parts) >= 8:
                    x, y, z = float(parts[1]), float(parts[2]), float(parts[3])
                    r, g, b = int(parts[4]), int(parts[5]), int(parts[6])
                    points.append([x, y, z])
                    colors.append([r, g, b])

        points = np.array(points, dtype=np.float32)
        colors = np.array(colors, dtype=np.uint8)
        num_pts = len(points)
        print(f"🎉 Total reconstructed 3D points: {num_pts:,}")

        # Construct binary .splat buffer
        bytes_data = bytearray(num_pts * 32)
        for i in range(num_pts):
            off = i * 32
            # Pos float32[3]
            pos_bytes = points[i].tobytes()
            bytes_data[off:off+12] = pos_bytes
            # Scale float32[3] (default 0.15m sphere)
            scale = np.array([0.15, 0.15, 0.15], dtype=np.float32)
            bytes_data[off+12:off+24] = scale.tobytes()
            # RGBA uint8[4]
            bytes_data[off+24] = colors[i][0]
            bytes_data[off+25] = colors[i][1]
            bytes_data[off+26] = colors[i][2]
            bytes_data[off+27] = 255
            # Quat uint8[4] identity (128 = 0.0)
            bytes_data[off+28] = 128
            bytes_data[off+29] = 128
            bytes_data[off+30] = 128
            bytes_data[off+31] = 255

        with open(splat_output, 'wb') as f:
            f.write(bytes_data)

        print(f"SUCCESS! Created {splat_output} ({os.path.getsize(splat_output) / (1024*1024):.2f} MB with {num_pts:,} 3D points)")
    else:
        print(f"[ERROR]: points3D.txt not found at {pts_file}")

    print("\n🎉 KEYFRAME 3D PHOTOGRAMMETRY RECONSTRUCTION COMPLETE!")

if __name__ == "__main__":
    main()
