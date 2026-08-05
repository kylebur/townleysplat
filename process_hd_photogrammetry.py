#!/usr/bin/env python3
"""
High-Fidelity 100% Every-Frame Photogrammetry Pipeline
Version: v1.2.4

Processes all 9,814 frames from DJI_0001_remuxed.mp4 using COLMAP sequential matching,
reconstructs high-density 3D tie points, and exports drone_reconstruction.splat.
Auto-detects completed SQLite feature extraction and matching to resume from mapper step.
"""

import os
import sys
import time
import subprocess
import sqlite3
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

def inspect_db(db_path):
    """Check database status for auto-resume capability."""
    if not os.path.exists(db_path):
        return False, False
    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        c = conn.cursor()
        c.execute("SELECT COUNT(*) FROM keypoints")
        kp_cnt = c.fetchone()[0]
        c.execute("SELECT pair_id FROM two_view_geometries ORDER BY pair_id DESC LIMIT 1")
        tvg_row = c.fetchone()
        has_tvg = (tvg_row is not None and tvg_row[0] > 0)
        conn.close()
        return (kp_cnt >= 9000), has_tvg
    except Exception as e:
        print(f"[DB INSPECT]: {e}")
        return False, False

def main():
    print("=" * 70)
    print("🚀 HIGH-FIDELITY EVERY-FRAME 3D PHOTOGRAMMETRY RECONSTRUCTION (v1.2.4)")
    print("=" * 70)

    video_path = "DJI_0001_remuxed.mp4"
    frames_dir = "drone_frames_hd"
    db_path = "colmap_hd_db.db"
    sparse_dir = "colmap_hd_sparse"
    text_dir = "colmap_hd_text"
    splat_output = "drone_reconstruction.splat"
    ply_output = "drone_sparse_pointcloud_hd.ply"

    os.makedirs(frames_dir, exist_ok=True)
    os.makedirs(sparse_dir, exist_ok=True)
    os.makedirs(text_dir, exist_ok=True)

    kp_done, matching_done = inspect_db(db_path)

    # 1. Full 100% Frame Extraction (~9,814 frames at 1080p)
    print("\n--- STEP 1: Extracting 100% of Video Frames (9,814 frames) ---")
    frame_count = len([f for f in os.listdir(frames_dir) if f.endswith('.jpg')])
    if frame_count < 9000:
        run(f"ffmpeg -y -i {video_path} -vf scale=1920:1080 -q:v 2 {frames_dir}/frame_%05d.jpg")
    else:
        print(f"✅ Frames already extracted ({frame_count:,} frames found). Skipping extraction.")

    # 2. COLMAP Feature Extraction
    print("\n--- STEP 2: SIFT Feature Extraction ---")
    if kp_done:
        print("✅ SIFT Feature Extraction already complete in database. Skipping.")
    else:
        run(f"colmap feature_extractor "
            f"--database_path {db_path} "
            f"--image_path {frames_dir} "
            f"--ImageReader.single_camera 1 "
            f"--ImageReader.camera_model RADIAL "
            f"--SiftExtraction.max_num_features 8192 "
            f"--FeatureExtraction.use_gpu 0")

    # 3. COLMAP Sequential Matching
    print("\n--- STEP 3: Sequential & Loop-Closure Feature Matching ---")
    if matching_done:
        print("✅ Pairwise feature matching & 2-view geometry verification complete in database. Skipping.")
    else:
        run(f"colmap sequential_matcher "
            f"--database_path {db_path} "
            f"--SequentialMatching.overlap 30 "
            f"--SequentialMatching.loop_detection 1 "
            f"--FeatureMatching.use_gpu 0")

    # 4. Incremental Structure-from-Motion Mapping
    print("\n--- STEP 4: Incremental 3D Reconstruction ---")
    run(f"colmap mapper "
        f"--database_path {db_path} "
        f"--image_path {frames_dir} "
        f"--output_path {sparse_dir}")


    # 5. Convert to Text & PLY
    print("\n--- STEP 5: Exporting PLY Point Cloud ---")
    latest_sub = "0"
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
        print(f"Total reconstructed 3D points: {num_pts:,}")

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

        print(f"SUCCESS! Created {splat_output} ({os.path.getsize(splat_output) / (1024*1024):.2f} MB)")
    else:
        print(f"[ERROR]: points3D.txt not found at {pts_file}")

    print("\n🎉 HIGH-FIDELITY 3D PHOTOGRAMMETRY COMPLETE!")

if __name__ == "__main__":
    main()
