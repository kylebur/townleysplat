#!/usr/bin/env python3
"""
Litchi Mission Generator for 2-Battery 3D Photogrammetry
Version: v1.2.4

Property Bounding Box:
North-East Corner: 44.057737, -69.508578
South-West Corner: 44.053031, -69.515627
"""

import math
import csv

# Bounding box coordinates
LAT_NORTH = 44.057737
LAT_SOUTH = 44.053031
LON_EAST  = -69.508578
LON_WEST  = -69.515627

# Conversion constants at Lat 44.055°
METERS_PER_DEG_LAT = 111100.0
METERS_PER_DEG_LON = 111100.0 * math.cos(math.radians((LAT_NORTH + LAT_SOUTH) / 2.0))

WIDTH_M  = (LON_EAST - LON_WEST) * METERS_PER_DEG_LON   # ~564 meters
HEIGHT_M = (LAT_NORTH - LAT_SOUTH) * METERS_PER_DEG_LAT # ~523 meters

LITCHI_HEADER = [
    "latitude", "longitude", "altitude(m)", "heading(deg)", "curvesize(m)",
    "rotationdir", "gimbalmode", "gimbalpitch",
    "actiontype1", "actionparam1", "actiontype2", "actionparam2",
    "actiontype3", "actionparam3", "actiontype4", "actionparam4",
    "actiontype5", "actionparam5", "actiontype6", "actionparam6",
    "actiontype7", "actionparam7", "actiontype8", "actionparam8",
    "actiontype9", "actionparam9", "actiontype10", "actionparam10",
    "altitudemode", "speed(m/s)", "poi_latitude", "poi_longitude",
    "poi_altitude(m)", "poi_altitudemode", "photo_timeinterval", "photo_distanceinterval"
]

def make_litchi_row(lat, lon, alt_m, speed_mps, gimbal_pitch, heading=0):
    row = [
        f"{lat:.6f}", f"{lon:.6f}", f"{alt_m:.1f}", f"{heading}", "0",
        "0", "2", f"{gimbal_pitch}",
        "-1", "0", "-1", "0", "-1", "0", "-1", "0", "-1", "0",
        "-1", "0", "-1", "0", "-1", "0", "-1", "0", "-1", "0",
        "0", f"{speed_mps:.1f}", "0.000000", "0.000000", "0.0", "0", "0.0", "0.0"
    ]
    return row

def generate_battery1():
    """Battery 1: North-South Lawnmower Grid (Nadir -90°) at 200 ft (61m)"""
    filename = "Battery1_Nadir_Grid_200ft.csv"
    alt_m = 61.0      # 200 ft AGL
    speed_mps = 4.5  # 10 mph
    gimbal_pitch = -90
    spacing_m = 55.0 # 180 ft line spacing for 75% side overlap

    num_lines = int(math.ceil(WIDTH_M / spacing_m)) + 1
    lon_step = (LON_EAST - LON_WEST) / (num_lines - 1)

    rows = []
    for i in range(num_lines):
        curr_lon = LON_WEST + i * lon_step
        if i % 2 == 0:
            # Fly South to North
            rows.append(make_litchi_row(LAT_SOUTH, curr_lon, alt_m, speed_mps, gimbal_pitch, heading=0))
            rows.append(make_litchi_row(LAT_NORTH, curr_lon, alt_m, speed_mps, gimbal_pitch, heading=0))
        else:
            # Fly North to South
            rows.append(make_litchi_row(LAT_NORTH, curr_lon, alt_m, speed_mps, gimbal_pitch, heading=180))
            rows.append(make_litchi_row(LAT_SOUTH, curr_lon, alt_m, speed_mps, gimbal_pitch, heading=180))

    with open(filename, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(LITCHI_HEADER)
        writer.writerows(rows)

    print(f"Generated {filename} with {len(rows)} waypoints across {num_lines} flight lines.")

def generate_battery2():
    """Battery 2: Oblique Cross-Grid & Perimeter Orbit (-45°) at 175 ft (53m)"""
    filename = "Battery2_Oblique_Grid_175ft.csv"
    alt_m = 53.3      # 175 ft AGL
    speed_mps = 4.0  # 9 mph
    gimbal_pitch = -45
    spacing_m = 65.0 # East-West cross lines

    num_lines = int(math.ceil(HEIGHT_M / spacing_m)) + 1
    lat_step = (LAT_NORTH - LAT_SOUTH) / (num_lines - 1)

    rows = []
    
    # 1. Perimeter Ring (4 corners)
    rows.append(make_litchi_row(LAT_SOUTH, LON_WEST, alt_m, speed_mps, gimbal_pitch, heading=45))
    rows.append(make_litchi_row(LAT_NORTH, LON_WEST, alt_m, speed_mps, gimbal_pitch, heading=135))
    rows.append(make_litchi_row(LAT_NORTH, LON_EAST, alt_m, speed_mps, gimbal_pitch, heading=225))
    rows.append(make_litchi_row(LAT_SOUTH, LON_EAST, alt_m, speed_mps, gimbal_pitch, heading=315))
    rows.append(make_litchi_row(LAT_SOUTH, LON_WEST, alt_m, speed_mps, gimbal_pitch, heading=45))

    # 2. East-West Cross Grid
    for i in range(num_lines):
        curr_lat = LAT_SOUTH + i * lat_step
        if i % 2 == 0:
            # Fly West to East
            rows.append(make_litchi_row(curr_lat, LON_WEST, alt_m, speed_mps, gimbal_pitch, heading=90))
            rows.append(make_litchi_row(curr_lat, LON_EAST, alt_m, speed_mps, gimbal_pitch, heading=90))
        else:
            # Fly East to West
            rows.append(make_litchi_row(curr_lat, LON_EAST, alt_m, speed_mps, gimbal_pitch, heading=270))
            rows.append(make_litchi_row(curr_lat, LON_WEST, alt_m, speed_mps, gimbal_pitch, heading=270))

    with open(filename, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(LITCHI_HEADER)
        writer.writerows(rows)

    print(f"Generated {filename} with {len(rows)} waypoints (Perimeter Orbit + {num_lines} Cross Lines).")

if __name__ == "__main__":
    print(f"Property Extents: {WIDTH_M:.1f} meters wide x {HEIGHT_M:.1f} meters long")
    generate_battery1()
    generate_battery2()
