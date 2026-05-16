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

# ─── Exhibit materials ──────────────────────────────────────────────
IRON_COLOR = hex_to_linear('#2e2c28')
STONE_FURN_COLOR = hex_to_linear('#383632')
DARK_COLOR = hex_to_linear('#141412')
BEIGE_COLOR = hex_to_linear('#c8b898')
BEIGE_DARK_COLOR = hex_to_linear('#a89878')
LABEL_COLOR = hex_to_linear('#0c0c0a')
GREY_METAL_COLOR = hex_to_linear('#999988')
DARK_KEYS_COLOR = hex_to_linear('#555550')
WATERLINE_COLOR = hex_to_linear('#4488aa')
LED_GREEN = hex_to_linear('#00ff41')

iron_mat = make_material('iron', IRON_COLOR, 0.65)
iron_mat.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value = 0.45
stone_furn_mat = make_material('stone_furniture', STONE_FURN_COLOR, 0.9)
dark_exhibit_mat = make_material('dark_exhibit', DARK_COLOR, 0.8)
dark_exhibit_mat.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value = 0.1
beige_mat = make_material('beige', BEIGE_COLOR, 0.85)
beige_dark_mat = make_material('beige_dark', BEIGE_DARK_COLOR, 0.85)
label_exhibit_mat = make_material('label', LABEL_COLOR, 0.7)
label_exhibit_mat.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value = 0.3
grey_metal_mat = make_material('grey_metal', GREY_METAL_COLOR, 0.6)
grey_metal_mat.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value = 0.3
dark_keys_mat = make_material('dark_keys', DARK_KEYS_COLOR, 0.8)
waterline_mat = make_material('waterline', WATERLINE_COLOR, 0.5)
led_green_mat = make_emissive_material('led_green', LED_GREEN, 3.0)

EXHIBIT_MAT_MAP = {
    'iron': iron_mat,
    'stone': stone_furn_mat,
    'dark': dark_exhibit_mat,
    'beige': beige_mat,
    'beige_dark': beige_dark_mat,
    'label': label_exhibit_mat,
    'grey_metal': grey_metal_mat,
    'dark_keys': dark_keys_mat,
    'led_green': led_green_mat,
    'waterline': waterline_mat,
}

# Cache for emissive materials keyed by color
_emissive_cache = {}

def get_emissive_mat(hex_color, intensity=0.5, flat=False):
    key = f"{hex_color}_{intensity}_{flat}"
    if key not in _emissive_cache:
        color = hex_to_linear(hex_color)
        mat = make_emissive_material(f"emissive_{hex_color}", color, intensity)
        if flat:
            # Blender doesn't have flatShading per-material, but we set auto smooth off on mesh
            pass
        _emissive_cache[key] = mat
    return _emissive_cache[key]

def get_ice_mat(color_hex, em_hex, em_int):
    key = f"ice_{color_hex}_{em_hex}_{em_int}"
    if key not in _emissive_cache:
        color = hex_to_linear(color_hex)
        em_color = hex_to_linear(em_hex)
        mat = bpy.data.materials.new(f"ice_{color_hex}")
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes['Principled BSDF']
        bsdf.inputs['Base Color'].default_value = color
        bsdf.inputs['Emission Color'].default_value = em_color
        bsdf.inputs['Emission Strength'].default_value = em_int
        bsdf.inputs['Roughness'].default_value = 0.4
        _emissive_cache[key] = mat
    return _emissive_cache[key]

# ─── Build exhibits ────────────────────────────────────────────────
print("Building exhibits...")
exhibit_count = 0

for ex in data.get('exhibits', []):
    col_name = f"exhibit_{ex['id']}"
    ex_col = bpy.data.collections.new(col_name)
    bpy.context.scene.collection.children.link(ex_col)

    gx, gy, gz = ex['groupPosition']
    grotY = ex['groupRotationY']

    for part in ex['parts']:
        pname = f"{ex['id']}_{part['name']}"
        geo = part['geoType']
        args = part['geoArgs']
        px, py, pz = part['position']
        rx, ry, rz = part['rotation']
        mat_key = part['material']

        obj = None

        if geo == 'box':
            bpy.ops.mesh.primitive_cube_add(size=1)
            obj = bpy.context.active_object
            obj.scale = (args[0], args[2], args[1])  # XYZ → XZY
        elif geo == 'plane':
            bpy.ops.mesh.primitive_plane_add(size=1)
            obj = bpy.context.active_object
            obj.scale = (args[0], args[1], 1)
        elif geo == 'cylinder':
            # args: [radiusTop, radiusBottom, height, segments]
            r_top, r_bot, height = args[0], args[1], args[2]
            segs = int(args[3]) if len(args) > 3 else 8
            radius = (r_top + r_bot) / 2
            bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=height, vertices=segs)
            obj = bpy.context.active_object
            # Approximate taper by scaling top/bottom (Blender cylinder is uniform)
            # For small differences this is close enough
        elif geo == 'torus':
            # args: [majorR, tubeR, radialSegs, tubularSegs]
            bpy.ops.mesh.primitive_torus_add(
                major_radius=args[0], minor_radius=args[1],
                major_segments=int(args[3]) if len(args) > 3 else 24,
                minor_segments=int(args[2]) if len(args) > 2 else 8,
            )
            obj = bpy.context.active_object
        elif geo == 'icosahedron':
            # args: [radius, detail]
            bpy.ops.mesh.primitive_ico_sphere_add(radius=args[0], subdivisions=max(1, int(args[1]) + 1) if len(args) > 1 else 2)
            obj = bpy.context.active_object
        elif geo == 'sphere':
            bpy.ops.mesh.primitive_uv_sphere_add(radius=args[0],
                segments=int(args[1]) if len(args) > 1 else 16,
                ring_count=int(args[2]) if len(args) > 2 else 8)
            obj = bpy.context.active_object
        elif geo == 'ring':
            # args: [innerR, outerR, segments]
            segs = int(args[2]) if len(args) > 2 else 32
            bpy.ops.mesh.primitive_circle_add(vertices=segs, radius=args[1], fill_type='NGON')
            obj = bpy.context.active_object
            # Ring geometry — approximate with scaled circle
        elif geo == 'circle':
            segs = int(args[1]) if len(args) > 1 else 32
            bpy.ops.mesh.primitive_circle_add(vertices=segs, radius=args[0], fill_type='NGON')
            obj = bpy.context.active_object
        else:
            print(f"  Unknown geoType: {geo} for {pname}")
            continue

        obj.name = pname
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

        # Part-local position in Three.js space, then transform by group
        # Three.js: group at (gx, gy, gz) rotated groupRotY, part at (px, py, pz) rotated (rx, ry, rz)
        # In Blender: Y↔Z swap for positions + negate rotZ for Y-up→Z-up
        # Apply group transform: rotate part position by groupRotY around Y axis, then translate
        import math as _m
        cosG = _m.cos(grotY)
        sinG = _m.sin(grotY)
        # Rotate local position by groupRotY (around Three.js Y axis)
        wx = px * cosG + pz * sinG
        wz = -px * sinG + pz * cosG
        wy = py
        # Add group position
        wx += gx
        wz += gz
        wy += gy

        # Blender: swap Y↔Z
        obj.location = (wx, wz, wy)

        # Rotation: combine part rotation with group rotation
        # Part rotX in Three.js (e.g. PI/2 for sideways cylinder)
        # Group rotY in Three.js = rotation around up axis
        # In Blender: around Z axis (negated)
        part_rotZ_blender = -(ry + grotY)  # Three.js Y → Blender -Z
        part_rotX_blender = rx              # Three.js X → Blender X

        if geo == 'plane':
            # Planes in Blender are XY, in Three.js they face +Z
            # Exhibit planes face forward (toward atrium) after group rotation
            obj.rotation_euler = (math.pi / 2, 0, part_rotZ_blender)
        elif geo in ('cylinder',) and abs(rx - math.pi / 2) < 0.01:
            # Cylinder rotated 90° in Three.js X = lying on side
            obj.rotation_euler = (math.pi / 2, 0, part_rotZ_blender)
        elif geo == 'torus' and abs(rx - math.pi / 2) < 0.01:
            # Torus flat in Three.js (rotX=PI/2) = already flat in Blender
            obj.rotation_euler = (0, 0, part_rotZ_blender)
        elif geo == 'torus' and abs(rx - (-math.pi / 2)) < 0.01:
            # Torus flipped
            obj.rotation_euler = (math.pi, 0, part_rotZ_blender)
        else:
            obj.rotation_euler = (0, 0, part_rotZ_blender)

        # Assign material
        obj.data.materials.clear()
        if mat_key == 'screen':
            em_color = part.get('emissiveColor', '#ffffff')
            mat = get_emissive_mat(em_color, 0.8)
            obj.data.materials.append(mat)
        elif mat_key == 'emissive':
            em_color = part.get('emissiveColor', '#ffffff')
            em_int = part.get('emissiveIntensity', 0.5)
            mat = get_emissive_mat(em_color, em_int)
            obj.data.materials.append(mat)
        elif mat_key == 'ice':
            c = part.get('color', '#ffffff')
            ec = part.get('emissiveColor', '#ffffff')
            ei = part.get('emissiveIntensity', 0.2)
            mat = get_ice_mat(c, ec, ei)
            obj.data.materials.append(mat)
        elif mat_key in EXHIBIT_MAT_MAP:
            obj.data.materials.append(EXHIBIT_MAT_MAP[mat_key])

        # Move to exhibit collection
        for c in obj.users_collection:
            c.objects.unlink(obj)
        ex_col.objects.link(obj)
        exhibit_count += 1

print(f"  Created {exhibit_count} exhibit parts across {len(data.get('exhibits', []))} exhibits")

# ─── Build portals ──────────────────────────────────────────────────
print("Building portals...")
portal_col = bpy.data.collections.new('portals')
bpy.context.scene.collection.children.link(portal_col)

portal_data = data.get('portals', {})

# Floor portal (hex glyph)
if 'floor' in portal_data:
    fp = portal_data['floor']
    fpx, fpy, fpz = fp['position']
    portal_cyan_mat = make_emissive_material('portal_cyan', hex_to_linear('#0abdc6'), 1.0)

    for part in fp['parts']:
        args = part['geoArgs']
        if part['geoType'] == 'ring':
            segs = int(args[2]) if len(args) > 2 else 32
            bpy.ops.mesh.primitive_circle_add(vertices=segs, radius=args[1], fill_type='NGON')
            obj = bpy.context.active_object
            # Hollow out: delete inner faces (approximate — use outer radius only)
        elif part['geoType'] == 'circle':
            segs = int(args[1]) if len(args) > 1 else 32
            bpy.ops.mesh.primitive_circle_add(vertices=segs, radius=args[0], fill_type='NGON')
            obj = bpy.context.active_object
        else:
            continue

        obj.name = f"portal_floor_{part['name']}"
        # Blender: Y↔Z swap
        obj.location = (fpx, fpz, fpy)
        # Floor portal: rotX=-PI/2 in Three.js = already flat in Blender (XY plane)
        obj.rotation_euler = (0, 0, 0)
        obj.data.materials.clear()
        obj.data.materials.append(portal_cyan_mat)
        for c in obj.users_collection:
            c.objects.unlink(obj)
        portal_col.objects.link(obj)

# Ceiling portal (quaternion device)
if 'ceiling' in portal_data:
    cp = portal_data['ceiling']
    cpx, cpy, cpz = cp['position']

    portal_gold_mat = make_emissive_material('portal_gold', hex_to_linear('#ffc060'), 2.0)
    portal_silver_mat = make_material('portal_silver', hex_to_linear('#b8c4d0'), 0.4)
    portal_silver_mat.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value = 0.8
    portal_amber_mat = make_emissive_material('portal_amber', hex_to_linear('#ffa040'), 1.5)

    PORTAL_CEIL_MATS = {
        'portal_gold': portal_gold_mat,
        'portal_silver': portal_silver_mat,
        'portal_amber': portal_amber_mat,
    }

    for part in cp['parts']:
        args = part['geoArgs']
        geo = part['geoType']
        pname = f"portal_ceiling_{part['name']}"

        if geo == 'sphere':
            bpy.ops.mesh.primitive_uv_sphere_add(radius=args[0],
                segments=int(args[1]) if len(args) > 1 else 16,
                ring_count=int(args[2]) if len(args) > 2 else 8)
        elif geo == 'icosahedron':
            bpy.ops.mesh.primitive_ico_sphere_add(radius=args[0], subdivisions=max(1, int(args[1]) + 1) if len(args) > 1 else 2)
        elif geo == 'torus':
            bpy.ops.mesh.primitive_torus_add(
                major_radius=args[0], minor_radius=args[1],
                major_segments=int(args[3]) if len(args) > 3 else 48,
                minor_segments=int(args[2]) if len(args) > 2 else 12,
            )
        else:
            continue

        obj = bpy.context.active_object
        obj.name = pname

        # Wireframe for Hg shell
        if part.get('wireframe'):
            mod = obj.modifiers.new('Wire', 'WIREFRAME')
            mod.thickness = 0.005

        # Position: Y↔Z swap
        obj.location = (cpx, cpz, cpy)

        # Apply pivot rotation for torus rings (i, j, k)
        if 'pivotRotation' in part:
            pr = part['pivotRotation']
            # Three.js pivot rotation → Blender: swap Y↔Z axes
            obj.rotation_euler = (pr[0], pr[2], -pr[1] if pr[1] != 0 else pr[1])

        # Material
        mat_key = part.get('material', '')
        if mat_key in PORTAL_CEIL_MATS:
            obj.data.materials.clear()
            obj.data.materials.append(PORTAL_CEIL_MATS[mat_key])

        for c in obj.users_collection:
            c.objects.unlink(obj)
        portal_col.objects.link(obj)

print("  Built floor + ceiling portals")

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
for col in bpy.data.collections:
    if col.name.startswith('exhibit_'):
        print(f"  {col.name}: {len(col.objects)} parts")
if 'portals' in [c.name for c in bpy.data.collections]:
    pcol = bpy.data.collections['portals']
    print(f"  portals: {len(pcol.objects)} objects")
print(f"  cameras: {len(cameras_col.objects)} cameras")

# ─── Save .blend file ──────────────────────────────────────────────
BLEND_PATH = os.path.join(SCRIPT_DIR, 'oz-archive-scene.blend')
bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)
print(f"\nSaved: {BLEND_PATH}")

# ─── Headless bake (when --background) ─────────────────────────────
import sys
if ('--background' in sys.argv or '-b' in sys.argv) and '--nobake' not in sys.argv:
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
