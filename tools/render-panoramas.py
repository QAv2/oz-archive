"""
Oz Archive: Render equirectangular panoramas from tour stop viewpoints.
Pre-rendered backgrounds for mobile (Myst-style fixed viewpoints).

Usage:
  blender tools/oz-archive-scene.blend --background --python tools/render-panoramas.py
"""

import bpy
import os
import math
from mathutils import Vector

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(SCRIPT_DIR, '..', 'textures', 'pano')
os.makedirs(OUT_DIR, exist_ok=True)

# Tour stop positions (Three.js Y-up → Blender Z-up: swap Y↔Z)
# From scene-data.json cameras
STOPS = [
    {'name': 'stop_0', 'pos': (0, 0, 1.7)},              # atrium center
    {'name': 'stop_1', 'pos': (0, 16, 1.7)},              # alcove 0 (disclosure)
    {'name': 'stop_2', 'pos': (13.8564, 8, 1.7)},         # alcove 1 (qa)
    {'name': 'stop_3', 'pos': (13.8564, -8, 1.7)},        # alcove 2 (intel)
    {'name': 'stop_4', 'pos': (0, -16, 1.7)},             # alcove 3 (physics)
    {'name': 'stop_5', 'pos': (-13.8564, -8, 1.7)},       # alcove 4 (youtube)
    {'name': 'stop_6', 'pos': (-13.8564, 8, 1.7)},        # alcove 5 (iceberg)
]

# ─── Configure render settings ─────────────────────────────────────
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 128          # good balance for panoramas
scene.cycles.use_denoising = False   # not available in this build
scene.render.resolution_x = 2048
scene.render.resolution_y = 1024
scene.render.image_settings.file_format = 'JPEG'
scene.render.image_settings.quality = 85

# ─── Create panoramic camera ───────────────────────────────────────
cam_data = bpy.data.cameras.new('PanoCamera')
cam_data.type = 'PANO'
cam_data.panorama_type = 'EQUIRECTANGULAR'
cam_obj = bpy.data.objects.new('PanoCamera', cam_data)
bpy.context.scene.collection.objects.link(cam_obj)
scene.camera = cam_obj

# ─── Render each stop ──────────────────────────────────────────────
for stop in STOPS:
    name = stop['name']
    pos = stop['pos']

    cam_obj.location = pos
    cam_obj.rotation_euler = (math.pi / 2, 0, 0)  # point forward (Blender Z-up)

    out_path = os.path.join(OUT_DIR, name)
    scene.render.filepath = out_path
    print(f"\nRendering {name} at {pos}...")
    bpy.ops.render.render(write_still=True)
    print(f"  Saved: {out_path}.jpg")

print(f"\n{'='*50}")
print(f"All {len(STOPS)} panoramas rendered to {OUT_DIR}/")
print(f"{'='*50}")
