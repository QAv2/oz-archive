"""
Oz Archive: Blender Scene Builder + Lightmap Bake Setup
========================================================
Reads scene-data.json and builds the museum in Blender with:
  - All architectural geometry (named, room-tagged via collections)
  - All lights (torches, ambient, accent) with correct colors/positions
  - Sconce geometry for visual reference
  - Tour cameras at the 7 viewpoints
  - UV2 lightmap unwrap on all architecture
  - Cycles bake settings configured for warm vault lighting

Usage:
  1. Open Blender 4.x
  2. Switch to the Scripting workspace
  3. Open this file and click Run Script
  4. Or from command line:
     blender --background --python build-blender-scene.py

After running:
  - Verify the scene visually (check camera views)
  - Bake: select all architecture > Bake (Diffuse, Direct+Indirect)
  - Save lightmap images from UV Editor
"""

import bpy
import bmesh
import json
import os
import math
from mathutils import Vector, Euler

# ─── Load scene data ────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(SCRIPT_DIR, 'scene-data.json')

with open(DATA_PATH, 'r') as f:
    data = json.load(f)

print(f"\nLoaded scene-data.json:")
print(f"  {len(data['meshes'])} meshes, {len(data['lights'])} lights")
print(f"  {len(data['sconces'])} sconces, {len(data['cameras'])} cameras")

# ─── Clean existing scene ───────────────────────────────────────────
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
for col in bpy.data.collections:
    if col.name != 'Scene Collection':
        bpy.data.collections.remove(col)
for mesh in bpy.data.meshes:
    bpy.data.meshes.remove(mesh)
for mat in bpy.data.materials:
    bpy.data.materials.remove(mat)
for img in bpy.data.images:
    bpy.data.images.remove(img)
for cam in bpy.data.cameras:
    bpy.data.cameras.remove(cam)
for light in bpy.data.lights:
    bpy.data.lights.remove(light)

# ─── Materials ──────────────────────────────────────────────────────
def hex_to_linear(hex_str):
    """Convert #rrggbb to linear RGB tuple (Blender uses linear)."""
    hex_str = hex_str.lstrip('#')
    r, g, b = [int(hex_str[i:i+2], 16) / 255.0 for i in (0, 2, 4)]
    # sRGB to linear
    def s2l(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (s2l(r), s2l(g), s2l(b), 1.0)

WALL_COLOR = hex_to_linear('#3a3a42')
FLOOR_COLOR = hex_to_linear('#2a2a30')
CEILING_COLOR = hex_to_linear('#1a1a22')
SCONCE_COLOR = hex_to_linear('#2a2a2a')
FLAME_COLOR = hex_to_linear('#ff8844')

def make_material(name, color, roughness=0.85):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = color
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = 0.0
    return mat

def make_emissive_material(name, color, strength=2.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = color
    bsdf.inputs['Emission Color'].default_value = color
    bsdf.inputs['Emission Strength'].default_value = strength
    return mat

wall_mat = make_material('wall', WALL_COLOR, 0.85)
floor_mat = make_material('floor', FLOOR_COLOR, 0.9)
ceiling_mat = make_material('ceiling', CEILING_COLOR, 0.8)
sconce_mat = make_material('sconce_bracket', SCONCE_COLOR, 0.9)
flame_mat = make_emissive_material('sconce_flame', FLAME_COLOR, 2.0)

MAT_MAP = {
    'wall': wall_mat,
    'floor': floor_mat,
    'ceiling': ceiling_mat,
}

# ─── Collections (one per room) ─────────────────────────────────────
room_collections = {}

def get_collection(room):
    if room not in room_collections:
        col = bpy.data.collections.new(room)
        bpy.context.scene.collection.children.link(col)
        room_collections[room] = col
    return room_collections[room]

# ─── Build geometry ─────────────────────────────────────────────────
def create_mesh(mesh_data):
    name = mesh_data['name']
    room = mesh_data['room']
    mat_type = mesh_data['materialType']
    geo_type = mesh_data['geoType']
    args = mesh_data['geoArgs']
    pos = mesh_data['position']
    rot = mesh_data['rotation']

    if geo_type == 'box':
        bpy.ops.mesh.primitive_cube_add(size=1)
        obj = bpy.context.active_object
        obj.scale = (args[0], args[2], args[1])  # Three.js XYZ → Blender XYZ (Y↔Z swap)
    elif geo_type == 'plane':
        bpy.ops.mesh.primitive_plane_add(size=1)
        obj = bpy.context.active_object
        obj.scale = (args[0], args[1], 1)
    elif geo_type == 'circle':
        bpy.ops.mesh.primitive_circle_add(vertices=args[1], radius=args[0], fill_type='NGON')
        obj = bpy.context.active_object
    else:
        print(f"  Unknown geoType: {geo_type} for {name}")
        return None

    obj.name = name

    # Three.js uses Y-up, Blender uses Z-up
    # Three.js rotation order is XYZ (Euler)
    # We need to convert coordinate system:
    #   Three.js (x, y, z) → Blender (x, z, y) with Z-up
    #   Three.js rotY → Blender rotZ (around up axis)
    obj.location = (pos[0], pos[2], pos[1])  # swap Y↔Z

    # Convert rotations: Three.js XYZ → Blender
    # For walls: rotY in Three.js = rotation around Y (up) = rotZ in Blender
    # For floors: rotX = -PI/2 in Three.js = already flat in Blender (plane is XY by default)
    # For ceilings: rotX = PI/2 = flip
    if geo_type == 'box':
        # Walls: only rotY matters (rotation around vertical axis)
        obj.rotation_euler = (0, 0, -rot[1])
    elif geo_type == 'plane' or geo_type == 'circle':
        # Floors/ceilings: Three.js rotates planes to be horizontal
        # In Blender, planes are already horizontal (XY plane)
        # Three.js: rotX=-PI/2 for floor (face up), rotX=PI/2 for ceiling (face down)
        # Blender: plane is already XY (face up = +Z)
        rx = rot[0]
        rz_threejs = rot[2]  # This is the spoke angle rotation

        if abs(rx - (-math.pi / 2)) < 0.01:
            # Floor: face up (default in Blender), just apply Z rotation
            obj.rotation_euler = (0, 0, -rz_threejs)
        elif abs(rx - (math.pi / 2)) < 0.01:
            # Ceiling: face down, flip around X
            obj.rotation_euler = (math.pi, 0, -rz_threejs)
        else:
            # Other rotation
            obj.rotation_euler = (rx, rz_threejs, rot[1])

    # Apply scale to mesh data
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    # Assign material
    mat = MAT_MAP.get(mat_type)
    if mat:
        obj.data.materials.clear()
        obj.data.materials.append(mat)

    # Move to room collection
    col = get_collection(room)
    for c in obj.users_collection:
        c.objects.unlink(obj)
    col.objects.link(obj)

    return obj

print("\nBuilding geometry...")
for m in data['meshes']:
    create_mesh(m)
print(f"  Created {len(data['meshes'])} meshes")

# ─── Build lights ───────────────────────────────────────────────────
print("Placing lights...")
lights_col = bpy.data.collections.new('lights')
bpy.context.scene.collection.children.link(lights_col)

for idx, l in enumerate(data['lights']):
    pos = l['position']
    # Coordinate swap: Three.js Y → Blender Z
    blender_pos = (pos[0], pos[2], pos[1])

    if l['type'] == 'ambient':
        # Blender doesn't have ambient lights — we'll use world background
        continue
    elif l['type'] == 'hemisphere':
        # Approximate with a large area light pointing down
        bpy.ops.object.light_add(type='AREA')
        obj = bpy.context.active_object
        obj.name = f"hemi_{idx}"
        obj.location = (0, 0, data['config']['CEILING_HEIGHT'] + 2)
        obj.data.color = hex_to_linear(l['color'])[:3]
        obj.data.energy = l['intensity'] * 50  # Scale for Cycles
        obj.data.size = data['config']['ATRIUM_RADIUS'] * 2
    elif l['type'] == 'point':
        bpy.ops.object.light_add(type='POINT')
        obj = bpy.context.active_object
        obj.name = f"torch_{l['room']}_{idx}"
        obj.location = blender_pos
        obj.data.color = hex_to_linear(l['color'])[:3]

        # Convert Three.js intensity to Blender Cycles watts
        # Three.js PointLight intensity is in candela-ish units
        # Cycles uses watts. Rough conversion: watts ≈ intensity * 20-40
        # Calibrate visually after first render
        obj.data.energy = l['intensity'] * 30
        if l.get('distance'):
            obj.data.use_custom_distance = True
            obj.data.cutoff_distance = l['distance']
        obj.data.shadow_soft_size = 0.05  # Small source = sharper shadows
    else:
        continue

    for c in obj.users_collection:
        c.objects.unlink(obj)
    lights_col.objects.link(obj)

# World ambient (replaces AmbientLight)
world = bpy.data.worlds.new('OzWorld')
bpy.context.scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes['Background']
bg.inputs['Color'].default_value = hex_to_linear('#1a1814')
bg.inputs['Strength'].default_value = 0.3

print(f"  Placed {len(data['lights'])} lights")

# ─── Build sconces ──────────────────────────────────────────────────
print("Building sconces...")
sconces_col = bpy.data.collections.new('sconces')
bpy.context.scene.collection.children.link(sconces_col)

for idx, s in enumerate(data['sconces']):
    pos = s['position']
    rotY = s['rotationY']

    # Bracket (cylinder)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.035, depth=0.15, vertices=6)
    bracket = bpy.context.active_object
    bracket.name = f"sconce_bracket_{idx}"
    bracket.location = (pos[0], pos[2], pos[1])  # Y↔Z swap
    bracket.rotation_euler = (0, math.pi / 2, rotY)
    bracket.data.materials.clear()
    bracket.data.materials.append(sconce_mat)

    # Cup
    bpy.ops.mesh.primitive_cylinder_add(radius=0.05, depth=0.08, vertices=8)
    cup = bpy.context.active_object
    cup.name = f"sconce_cup_{idx}"
    cup.location = (pos[0], pos[2], pos[1])
    cup.data.materials.clear()
    cup.data.materials.append(sconce_mat)

    # Flame
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.04, segments=8, ring_count=6)
    flame = bpy.context.active_object
    flame.name = f"sconce_flame_{idx}"
    flame.location = (pos[0], pos[2], pos[1] + 0.06)  # Y↔Z swap + offset
    flame.data.materials.clear()
    flame.data.materials.append(flame_mat)

    for obj in [bracket, cup, flame]:
        for c in obj.users_collection:
            c.objects.unlink(obj)
        sconces_col.objects.link(obj)

print(f"  Created {len(data['sconces'])} sconces ({len(data['sconces']) * 3} meshes)")

# ─── Tour cameras ───────────────────────────────────────────────────
print("Setting up cameras...")
cameras_col = bpy.data.collections.new('cameras')
bpy.context.scene.collection.children.link(cameras_col)

for cam_data in data['cameras']:
    cam = bpy.data.cameras.new(cam_data['name'])
    cam.lens = 18.0  # ~70 degree FOV
    cam_obj = bpy.data.objects.new(cam_data['name'], cam)

    p = cam_data['position']
    t = cam_data['lookAt']
    cam_obj.location = (p[0], p[2], p[1])  # Y↔Z swap

    # Point camera at lookAt target
    direction = Vector((t[0] - p[0], t[2] - p[2], t[1] - p[1]))
    rot_quat = direction.to_track_quat('-Z', 'Y')
    cam_obj.rotation_euler = rot_quat.to_euler()

    for c in cam_obj.users_collection:
        c.objects.unlink(cam_obj)
    cameras_col.objects.link(cam_obj)

print(f"  Created {len(data['cameras'])} cameras")

# ─── UV2 Lightmap Unwrap ────────────────────────────────────────────
print("Creating UV2 lightmap coordinates...")

# Select all architecture meshes (walls, floors, ceilings)
arch_objects = []
for col_name, col in room_collections.items():
    for obj in col.objects:
        if obj.type == 'MESH':
            arch_objects.append(obj)

# Deselect all
bpy.ops.object.select_all(action='DESELECT')

for obj in arch_objects:
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

    # Add second UV map for lightmap
    if len(obj.data.uv_layers) < 2:
        obj.data.uv_layers.new(name='UVMap_Lightmap')

    obj.select_set(False)

# Smart UV Project on all architecture for UV2
bpy.ops.object.select_all(action='DESELECT')
for obj in arch_objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = arch_objects[0] if arch_objects else None

# Set UV2 as active for unwrapping
for obj in arch_objects:
    if len(obj.data.uv_layers) >= 2:
        obj.data.uv_layers[1].active = True

bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=0.2618, island_margin=0.005)  # 15 degrees
bpy.ops.object.mode_set(mode='OBJECT')

print(f"  UV2 created on {len(arch_objects)} meshes")

# ─── Create lightmap bake image ─────────────────────────────────────
LIGHTMAP_RES = 2048
lightmap_img = bpy.data.images.new('lightmap_bake', LIGHTMAP_RES, LIGHTMAP_RES)
lightmap_img.colorspace_settings.name = 'Linear Rec.709'

# Add Image Texture node to each architecture material for baking target
for mat in [wall_mat, floor_mat, ceiling_mat]:
    nodes = mat.node_tree.nodes
    img_node = nodes.new('ShaderNodeTexImage')
    img_node.name = 'Lightmap_Bake'
    img_node.image = lightmap_img
    # Select this node as active (bake target)
    nodes.active = img_node
    # Use UV2 for the image node
    uv_node = nodes.new('ShaderNodeUVMap')
    uv_node.uv_map = 'UVMap_Lightmap'
    mat.node_tree.links.new(uv_node.outputs['UV'], img_node.inputs['Vector'])

print(f"  Lightmap image: {LIGHTMAP_RES}x{LIGHTMAP_RES}")

# ─── Cycles Render Settings ─────────────────────────────────────────
print("Configuring Cycles bake settings...")
bpy.context.scene.render.engine = 'CYCLES'
bpy.context.scene.cycles.device = 'CPU'  # Change to 'GPU' if available
bpy.context.scene.cycles.samples = 256
bpy.context.scene.cycles.use_denoising = False  # No denoisers in this Blender build

# Bake settings
bpy.context.scene.cycles.bake_type = 'DIFFUSE'
bpy.context.scene.render.bake.use_pass_direct = True
bpy.context.scene.render.bake.use_pass_indirect = True
bpy.context.scene.render.bake.use_pass_color = False  # Lighting only, not albedo
bpy.context.scene.render.bake.margin = 4

# Tone mapping to match Three.js
bpy.context.scene.view_settings.view_transform = 'AgX'  # Closest to ACES Filmic
bpy.context.scene.view_settings.exposure = 1.0

# Film
bpy.context.scene.render.film_transparent = False
bpy.context.scene.render.resolution_x = 1920
bpy.context.scene.render.resolution_y = 1080

print("  Engine: Cycles (CPU)")
print("  Samples: 256")
print("  Bake: Diffuse (Direct + Indirect, no color)")
print("  Denoising: disabled (not available in this build)")

# ─── Summary ────────────────────────────────────────────────────────
print("\n" + "=" * 50)
print("Scene built successfully!")
print("=" * 50)
print(f"\nCollections:")
for name, col in room_collections.items():
    print(f"  {name}: {len(col.objects)} objects")
print(f"  lights: {len(lights_col.objects)} lights")
print(f"  sconces: {len(sconces_col.objects)} sconce parts")
print(f"  cameras: {len(cameras_col.objects)} cameras")

# ─── Save .blend file ──────────────────────────────────────────────
BLEND_PATH = os.path.join(SCRIPT_DIR, 'oz-archive-scene.blend')
bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)
print(f"\nSaved: {BLEND_PATH}")

# ─── Headless bake (when --background) ─────────────────────────────
import sys
if '--background' in sys.argv or '-b' in sys.argv:
    print("\n--- Starting headless lightmap bake ---")

    # Select all architecture objects
    bpy.ops.object.select_all(action='DESELECT')
    for col_name, col in room_collections.items():
        for obj in col.objects:
            if obj.type == 'MESH':
                obj.select_set(True)
    bpy.context.view_layer.objects.active = arch_objects[0]

    # Ensure UV2 is active render UV for bake target
    for obj in arch_objects:
        if len(obj.data.uv_layers) >= 2:
            obj.data.uv_layers[1].active = True
            obj.data.uv_layers[1].active_render = True

    # Ensure lightmap image node is active in all materials
    for mat in [wall_mat, floor_mat, ceiling_mat]:
        mat.node_tree.nodes.active = mat.node_tree.nodes['Lightmap_Bake']

    print(f"  Baking {len(arch_objects)} meshes at {LIGHTMAP_RES}x{LIGHTMAP_RES}, 256 samples...")
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, margin=4)
    print("  Bake complete!")

    # Save lightmap as JPEG
    LIGHTMAP_OUT = os.path.join(SCRIPT_DIR, '..', 'textures', 'lightmap.jpg')
    lightmap_img.filepath_raw = LIGHTMAP_OUT
    lightmap_img.file_format = 'JPEG'
    lightmap_img.save()
    print(f"  Saved: {os.path.abspath(LIGHTMAP_OUT)}")

    # Also render a preview from the atrium camera
    PREVIEW_OUT = os.path.join(SCRIPT_DIR, 'preview-atrium.png')
    for cam_obj in cameras_col.objects:
        if 'atrium' in cam_obj.name.lower() or 'stop_0' in cam_obj.name.lower():
            bpy.context.scene.camera = cam_obj
            break
    bpy.context.scene.render.resolution_x = 960
    bpy.context.scene.render.resolution_y = 540
    bpy.context.scene.render.filepath = PREVIEW_OUT
    bpy.context.scene.cycles.samples = 64  # Lower for preview
    bpy.ops.render.render(write_still=True)
    print(f"  Preview render: {PREVIEW_OUT}")

    # Save blend with baked data
    bpy.ops.wm.save_mainfile()
    print("\nPipeline complete!")
else:
    print(f"""
NEXT STEPS (interactive mode):
  1. Review the scene — check camera views (Numpad 0 with camera selected)
  2. Adjust light energy multipliers if too bright/dim
  3. Select all architecture objects (Room collections)
  4. Bake: Render > Bake (Diffuse)
  5. In UV Editor, select 'lightmap_bake' image
  6. Image > Save As > textures/lightmap.jpg (JPEG, quality 85)
""")
