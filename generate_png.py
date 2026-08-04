# -------------------------------------------------------------
# GeoTIFF DEM Analysis & PNG Generator
# Version: v1.2.0
# -------------------------------------------------------------
import cv2
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
from matplotlib.colors import LightSource
from mpl_toolkits.mplot3d import Axes3D

# Load DEM geotiff data using OpenCV (handles float32 TIFFs cleanly)
dem = cv2.imread('ncei_nintharcsec_dem_J1427776tR0_C0.tif', cv2.IMREAD_UNCHANGED)

ny, nx = dem.shape
res_x = 2.988579124266287
res_y = 2.988579124266287
width_m = nx * res_x
height_m = ny * res_y

min_elev = np.nanmin(dem)
max_elev = np.nanmax(dem)
mean_elev = np.nanmean(dem)
std_elev = np.nanstd(dem)

# Calculate Hillshade
ls = LightSource(azdeg=315, altdeg=45)
hillshade = ls.hillshade(dem, vert_exag=3.0, dx=res_x, dy=res_y)

# 1. Standalone Shaded Elevation PNG (direct visualization)
fig_standalone, ax = plt.subplots(figsize=(10, 9), dpi=300)
im = ax.imshow(dem, cmap='terrain', extent=[0, width_m, 0, height_m], origin='upper')
ax.imshow(hillshade, cmap='gray', alpha=0.35, extent=[0, width_m, 0, height_m], origin='upper')

cbar = plt.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
cbar.set_label('Elevation NAVD88 (meters)', fontsize=12, fontweight='bold')

ax.set_title('NCEI 1/9 Arc-Second DEM (Digital Elevation Model)\nTile: J1427776tR0_C0', fontsize=14, fontweight='bold', pad=12)
ax.set_xlabel('Distance East (meters)', fontsize=11)
ax.set_ylabel('Distance North (meters)', fontsize=11)

# Add scale bar
scalebar_len = 100 # 100 meters
sb_x = 20
sb_y = 30
ax.plot([sb_x, sb_x + scalebar_len], [sb_y, sb_y], color='black', lw=4)
ax.text(sb_x + scalebar_len/2, sb_y + 15, f'{scalebar_len} m', color='black', weight='bold', ha='center', fontsize=11,
        bbox=dict(boxstyle='round,pad=0.2', facecolor='white', alpha=0.8, edgecolor='none'))

# Add North Arrow
ax.annotate('N', xy=(width_m - 40, height_m - 40), xytext=(width_m - 40, height_m - 90),
            arrowprops=dict(facecolor='black', width=3, headwidth=10),
            ha='center', va='bottom', fontsize=12, weight='bold')

plt.tight_layout()
plt.savefig('ncei_nintharcsec_dem_J1427776tR0_C0.png', dpi=300)
plt.close()
print("Saved ncei_nintharcsec_dem_J1427776tR0_C0.png")

# 2. Multi-panel Dashboard PNG
plt.style.use('seaborn-v0_8-whitegrid' if 'seaborn-v0_8-whitegrid' in plt.style.available else 'default')
fig = plt.figure(figsize=(16, 12), dpi=300)

# Panel 1: Shaded Elevation Map
ax1 = fig.add_subplot(2, 2, 1)
im1 = ax1.imshow(dem, cmap='terrain', extent=[0, width_m, 0, height_m], origin='upper')
ax1.imshow(hillshade, cmap='gray', alpha=0.35, extent=[0, width_m, 0, height_m], origin='upper')
ax1.set_title('A. Shaded Elevation Map (NAVD88)', fontsize=13, fontweight='bold')
ax1.set_xlabel('Meters (E)')
ax1.set_ylabel('Meters (N)')
cbar1 = plt.colorbar(im1, ax=ax1, shrink=0.8)
cbar1.set_label('Elevation (m)')

# Panel 2: Slope Map (degrees)
gy, gx = np.gradient(dem, res_y, res_x)
slope_rad = np.arctan(np.sqrt(gx**2 + gy**2))
slope_deg = np.degrees(slope_rad)

ax2 = fig.add_subplot(2, 2, 2)
im2 = ax2.imshow(slope_deg, cmap='magma', extent=[0, width_m, 0, height_m], origin='upper')
ax2.set_title('B. Terrain Slope Map (Degrees)', fontsize=13, fontweight='bold')
ax2.set_xlabel('Meters (E)')
ax2.set_ylabel('Meters (N)')
cbar2 = plt.colorbar(im2, ax=ax2, shrink=0.8)
cbar2.set_label('Slope (°)')

# Panel 3: 3D Surface View
ax3 = fig.add_subplot(2, 2, 3, projection='3d')
X = np.linspace(0, width_m, nx)
Y = np.linspace(height_m, 0, ny)
X, Y = np.meshgrid(X, Y)
surf = ax3.plot_surface(X, Y, dem, cmap='terrain', rstride=2, cstride=2, linewidth=0, antialiased=True, alpha=0.9)
ax3.set_title('C. 3D Terrain Topography', fontsize=13, fontweight='bold')
ax3.set_xlabel('Meters (E)', labelpad=6)
ax3.set_ylabel('Meters (N)', labelpad=6)
ax3.set_zlabel('Elev (m)', labelpad=6)
ax3.view_init(elev=35, azim=-125)

# Panel 4: Elevation Distribution & Summary Stats
ax4 = fig.add_subplot(2, 2, 4)
n, bins, patches = ax4.hist(dem.flatten(), bins=40, color='#2b5c8f', edgecolor='black', alpha=0.75)
ax4.set_title('D. Elevation Profile & Data Summary', fontsize=13, fontweight='bold')
ax4.set_xlabel('Elevation (meters NAVD88)')
ax4.set_ylabel('Pixel Count')

stats_text = (
    f"--- DEM METADATA & STATS ---\n"
    f"Grid Dimensions: {nx} x {ny} pixels\n"
    f"Spatial Resolution: ~{res_x:.2f} m ({res_x*3.28084:.2f} ft)\n"
    f"Coverage Area: {width_m:.1f} m x {height_m:.1f} m\n"
    f"CRS: EPSG:26984 (Maine West State Plane)\n"
    f"-----------------------------\n"
    f"Min Elevation: {min_elev:.2f} m ({min_elev*3.28084:.2f} ft)\n"
    f"Max Elevation: {max_elev:.2f} m ({max_elev*3.28084:.2f} ft)\n"
    f"Mean Elevation: {mean_elev:.2f} m ({mean_elev*3.28084:.2f} ft)\n"
    f"Std Deviation: {std_elev:.2f} m\n"
    f"Max Slope: {np.nanmax(slope_deg):.1f}°"
)

ax4.text(0.55, 0.92, stats_text, transform=ax4.transAxes, fontsize=10,
         verticalalignment='top', fontfamily='monospace',
         bbox=dict(boxstyle='round,pad=0.5', facecolor='#f4f6f8', edgecolor='#cccccc', alpha=0.9))

plt.suptitle('NOAA / NCEI CUDEM 1/9 Arc-Second Digital Elevation Model Analysis', fontsize=16, fontweight='bold', y=0.98)
plt.tight_layout(rect=[0, 0, 1, 0.96])
plt.savefig('dem_analysis_dashboard.png', dpi=300)
plt.close()
print("Saved dem_analysis_dashboard.png")
