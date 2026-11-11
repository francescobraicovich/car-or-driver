"""Optimize the user-supplied car and seated driver, replace liveries, and export GLBs."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import struct
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Vector, Matrix

parser = argparse.ArgumentParser()
parser.add_argument('--input', required=True, help='Converted legacy driver triangle JSON')
parser.add_argument('--output', required=True)
parser.add_argument('--project', required=True)
arguments = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
root = Path(__file__).resolve().parent.parent
output = Path(arguments.output)
project = Path(arguments.project)
output.mkdir(parents=True, exist_ok=True)
project.parent.mkdir(parents=True, exist_ok=True)
source_files = ['tools/build-stage-models.mjs', 'tools/build-stage-scene.py', 'tools/read-stage-driver.c', 'site/assets/f1-mercedes-car/source/F12022_bodytest.fbx', 'site/assets/f1-driver/source/rhp_bell_hp77_driver_f1.7z', 'site/assets/f1-driver/textures/2025_driver_suit_diff.png', 'site/assets/f1-driver/textures/2025_driver_suit_nm.png']
source_hash = hashlib.sha256(b''.join((root / path).read_bytes() for path in source_files)).hexdigest()
source_models = [
    {'name':'F1 Mercedes W13 Concept', 'author':'Nick Broad', 'url':'https://sketchfab.com/3d-models/f1-mercedes-w13-concept-b9e85594aec847f78883343d67ee97fb', 'license':'CC BY 4.0'},
    {'name':'rhp_bell_hp77_driver_f1', 'author':'MattDoesBlender', 'url':'https://sketchfab.com/3d-models/rhp-bell-hp77-driver-f1-2916ac047ea84abe9394c38e4fa2d4bd', 'license':'CC BY-NC-SA 4.0'},
]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)


def material(name, color, metal, roughness, detail=0):
    item = bpy.data.materials.new(name)
    item.use_nodes = True
    shader = item.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Metallic'].default_value = metal
    shader.inputs['Roughness'].default_value = roughness
    item['detail'] = detail
    return item


materials = {
    'silver':material('Brushed titanium', (.52,.58,.68), .94,.32),
    'chrome':material('Polished aluminium', (.68,.74,.82), 1,.23),
    'carbon':material('Woven carbon', (.022,.028,.04), .36,.4,1),
    'rubber':material('Unbranded tyre rubber', (.009,.012,.018), .02,.78,3),
    'cobalt':material('Anodised cobalt', (.013,.055,.37), .8,.23),
    'dark':material('Graphite equipment', (.013,.019,.03), .25,.46),
    'visor':material('Smoked titanium visor', (.045,.085,.14), .94,.13),
    'suit':material('Silver technical fabric', (.56,.62,.72), .22,.56,2),
    'gloves':material('Graphite driving gloves', (.018,.026,.045), .04,.67,2),
    'light':material('Cobalt instrument lens', (.015,.10,.65), .4,.18),
}


def activate(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def reduce_mesh(obj, ratio):
    if ratio >= 1: return
    activate(obj)
    modifier = obj.modifiers.new('Preserve silhouette reduction', 'DECIMATE')
    modifier.ratio = ratio
    modifier.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def join_objects(objects, name):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects: obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.data.validate(clean_customdata=True)
    return obj


def clean_suit_maps():
    directory = root / 'site/assets/f1-driver/textures'
    for filename, normal in [('2025_driver_suit_diff.png', False), ('2025_driver_suit_nm.png', True)]:
        image = bpy.data.images.load(str(directory / filename), check_existing=False)
        width, height = image.size
        pixels = np.array(image.pixels[:], dtype=np.float32).reshape(height,width,4)[::-1].copy()
        # Remove the shoulder logos, certification patch, boot branding and texture-author mark.
        rectangles = [(.235,.028,.271,.069),(.398,.028,.435,.07),(.866,.865,.962,.953),(.668,.946,.88,1)]
        if not normal:
            rectangles += [(0,.865,.12,1),(.20,.87,.50,1),(.53,.69,.775,.80),(.53,.825,.765,.93)]
        for left, top, right, bottom in rectangles:
            x0,y0,x1,y1 = int(left*width),int(top*height),int(right*width),min(height,int(bottom*height))
            if normal:
                pixels[y0:y1,x0:x1,:3] = (.5,.5,1)
            else:
                # Horizontal interpolation retains the underlying fabric shade without a mark.
                left_values = pixels[y0:y1,max(0,x0-2):max(2,x0),:3].mean(axis=1)
                right_values = pixels[y0:y1,x1:min(width,x1+2),:3].mean(axis=1)
                weights = np.linspace(0,1,x1-x0)[None,:,None]
                pixels[y0:y1,x0:x1,:3] = left_values[:,None,:]*(1-weights)+right_values[:,None,:]*weights
        image.pixels.foreach_set(pixels[::-1].copy().ravel())
        image.scale(512 if normal else 1024,512 if normal else 1024)
        image.name = 'Unbranded suit normal' if normal else 'Unbranded technical suit'
        image.file_format = 'PNG' if normal else 'JPEG'
        image.filepath_raw = str(project.parent / ('suit-normal.png' if normal else 'suit-color.jpg'))
        image.save()
        image.pack()
        nodes = materials['suit'].node_tree.nodes
        links = materials['suit'].node_tree.links
        texture = nodes.new('ShaderNodeTexImage')
        texture.image = image
        shader = nodes.get('Principled BSDF')
        if normal:
            image.colorspace_settings.name = 'Non-Color'
            mapping = nodes.new('ShaderNodeNormalMap')
            mapping.inputs['Strength'].default_value = .65
            links.new(texture.outputs['Color'],mapping.inputs['Color'])
            links.new(mapping.outputs['Normal'],shader.inputs['Normal'])
        else:
            links.new(texture.outputs['Color'],shader.inputs['Base Color'])


clean_suit_maps()
bpy.ops.import_scene.fbx(filepath=str(root / 'site/assets/f1-mercedes-car/source/F12022_bodytest.fbx'))
car_objects = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
source_triangles = {}
source_triangles['car'] = sum(sum(len(face.vertices)-2 for face in obj.data.polygons) for obj in car_objects)
steering = []
for obj in car_objects:
    activate(obj)
    world = obj.matrix_world.copy()
    obj.parent = None
    obj.matrix_world = Matrix.Rotation(math.pi/2,4,'Z') @ world
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    original = [slot.material.name if slot.material else '' for slot in obj.material_slots]
    face_materials = [face.material_index for face in obj.data.polygons]
    assigned = list(materials.values())
    obj.data.materials.clear()
    for item in assigned: obj.data.materials.append(item)
    for face in obj.data.polygons:
        source_index = face_materials[face.index]
        name = original[source_index] if source_index < len(original) else ''
        position = face.center
        key = 'dark'
        if name in {'Body_Main','Body_Wings'}: key = 'silver'
        elif name == 'Titanium': key = 'chrome'
        elif name == 'Carbon Fiber': key = 'carbon'
        elif name == 'Tyre': key = 'rubber'
        elif name in {'Glass','Mirror'}: key = 'visor'
        elif name == 'GlassLight': key = 'light'
        elif name == 'Details': key = 'chrome' if 'Hub' in obj.name else 'dark'
        if name == 'Body_Main' and abs(position.y)<.047 and position.z>.43: key = 'cobalt'
        if name == 'Body_Wings' and 'Wing' in obj.name and abs(position.y)>.90: key = 'cobalt'
        face.material_index = assigned.index(materials[key])
    ratio = .85 if any(name in obj.name for name in ['Body_low','Wing_low','Tyre','Mirror']) else .55
    if 'SteeringWheel' in obj.name or obj.name.startswith('Cube.02'): ratio = .42
    reduce_mesh(obj,ratio)
    # The supplied wheel moves with the driver's hands in the exploded view.
    if 'SteeringWheel' in obj.name or obj.name in {'Cube.028','Cube.029'}:
        steering.append(obj)


driver_scale = 1.12
# Match the 28 cm full-size Ferrari SF-24 reference; measure after the driver scale is applied.
# https://www.amalgamcollection.com/blogs/news/revealing-the-ferrari-sf-24-steering-wheel
wheel_width = .28
wheel_vertices = [vertex.co for obj in steering for vertex in obj.data.vertices]
wheel_scale = wheel_width / driver_scale / (max(point.y for point in wheel_vertices)-min(point.y for point in wheel_vertices))
wheel_origin = Vector((-.574,0,.64))
wheel_rim = next(obj for obj in steering if obj.name == 'SteeringWheel.012')
grip_section = np.array([vertex.co[:] for vertex in wheel_rim.data.vertices if vertex.co.y > .07 and abs(vertex.co.z-.64) < .018])
source_grip = Vector(((grip_section.min(axis=0)+grip_section.max(axis=0))*.5).tolist())
finger_radius = (grip_section[:,1].max()-grip_section[:,1].min())*.5*wheel_scale + .006/driver_scale
finger_straight = .105 - math.pi*finger_radius
finger_bend_x = -.64-finger_straight

# Rotate each forearm about the elbow; translate the hands without changing their size or grip orientation.
elbow = Vector((-.22,.26,1.83))
wrist = Vector((-.56,.2756,1.85))
grip_anchor = Vector((finger_bend_x,.2756+.008-finger_radius,1.85))
hand_inset = source_grip.y*wheel_scale-grip_anchor.y
forearm = wrist-elbow
arm_angle = math.atan2(forearm.y,-forearm.x)-math.asin((forearm.y+hand_inset)/math.hypot(forearm.x,forearm.y))
hand_translation = elbow+Matrix.Rotation(arm_angle,3,'Z')@forearm-wrist
wheel_position = grip_anchor+hand_translation-(source_grip-wheel_origin)*wheel_scale
wheel_position.y = 0

source = json.loads(Path(arguments.input).read_text())
source_triangles['driver'] = sum(len(part['faces']) for part in source)
driver_objects = []
skip = ['Logo','Decal','Sticker','Tag','_001_001','Comms_Kit','GEO_Driver_FACE','GEO_Driver_Eyes','TearOff']
for part in source:
    name = part['name']
    if any(token in name for token in skip): continue
    positions, faces, coordinates, normals = [], [], [], []
    for values in part['faces']:
        face = []
        for offset in [1,9,17]:
            x,y,z,nx,ny,nz,u,v = values[offset:offset+8]
            # The archive uses a centimetre-scaled rig. Bake its seated pose and face the nose.
            position = Vector((y*100,-x*100,z*100+.83))
            normal = Vector((ny,-nx,nz))
            if name == 'DRIVER:GLOVES':
                original_x = position.x
                # Curl the open fingers around the grip, then turn the palm inward.
                if original_x < finger_bend_x:
                    angle = min(math.pi,(finger_bend_x-original_x)/finger_radius)
                    position.x = finger_bend_x-finger_radius*math.sin(angle)
                    position.z += finger_radius*(math.cos(angle)-1)
                    normal = Matrix.Rotation(-angle,3,'Y') @ normal
                # Preserve the sleeve connection while the gauntlet twists into a driving grip.
                twist = max(0,min(1,(-.43-original_x)/.14))
                twist = twist*twist*(3-2*twist)
                side = 1 if position.y > 0 else -1
                rotation = Matrix.Rotation(-side*math.pi/2*twist,3,'X')
                wrist = Vector((position.x,side*.2756,1.85))
                position = wrist + rotation @ (position-wrist)
                normal = rotation @ normal
                # The gauntlet follows the forearm, and the palm keeps facing the wheel.
                hand_weight = max(0,min(1,(-.48-original_x)/.10))
                hand_weight = hand_weight*hand_weight*(3-2*hand_weight)
                pivot = Vector((elbow.x,side*elbow.y,elbow.z))
                arm_rotation = Matrix.Rotation(side*arm_angle,3,'Z')
                arm_position = pivot+arm_rotation@(position-pivot)
                hand_position = position+Vector((hand_translation.x,side*hand_translation.y,0))
                position = arm_position.lerp(hand_position,hand_weight)
                normal = Matrix.Rotation(side*arm_angle*(1-hand_weight),3,'Z')@normal
            elif name == 'DRIVER:SUIT' and u < .5 and 1.2 < v < 1.5:
                side = 1 if position.y > 0 else -1
                amount = max(0,min(1,(-.10-position.x)/.18))
                amount = amount*amount*(3-2*amount)
                rotation = Matrix.Rotation(side*arm_angle*amount,3,'Z')
                pivot = Vector((elbow.x,side*elbow.y,elbow.z))
                position = pivot+rotation@(position-pivot)
                normal = rotation@normal
            positions.append(position)
            normals.append(normal)
            coordinates.append((u,v))
            face.append(len(positions)-1)
        faces.append(face)
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(positions,[],faces)
    mesh.update()
    uv = mesh.uv_layers.new(name='Source surface coordinates')
    for loop in mesh.loops: uv.data[loop.index].uv = coordinates[loop.vertex_index]
    for face in mesh.polygons: face.use_smooth = True
    mesh.normals_split_custom_set_from_vertices(normals)
    obj = bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(obj)
    if 'SUIT' in name: key='suit'
    elif 'GLOVES' in name: key='gloves'
    elif name == 'Helmet_Visor': key='visor'
    elif 'Base' in name or name == 'Helmet_Wing': key='chrome'
    elif 'Metal' in part['materials'][0] or 'Screw' in name: key='chrome'
    elif 'Carbon' in part['materials'][0]: key='carbon'
    else: key='dark'
    mesh.materials.append(materials[key])
    if key == 'chrome' and ('Base' in name or name == 'Helmet_Wing'):
        mesh.materials.append(materials['cobalt'])
        for face in mesh.polygons:
            if abs(face.center.y)<.028 and face.center.z>2.13: face.material_index = 1
    if key == 'gloves':
        mesh.materials.append(materials['cobalt'])
        for face in mesh.polygons:
            if -.49<face.center.x<-.465: face.material_index = 1
    # Weld split corners before reduction while retaining imported UVs and custom normals.
    edit=bmesh.new()
    edit.from_mesh(mesh)
    bmesh.ops.remove_doubles(edit,verts=list(edit.verts),dist=.000005)
    edit.to_mesh(mesh)
    edit.free()
    ratio = 1 if 'SUIT' in name or 'GLOVES' in name else .66
    reduce_mesh(obj,ratio)
    driver_objects.append(obj)

# Align the actual steering wheel to the supplied driver's grip, keeping its intricate controls.
for obj in steering:
    car_objects.remove(obj)
    # Scale around the wheel centre and place it in the supplied driver's grip.
    for vertex in obj.data.vertices:
        vertex.co = (vertex.co-wheel_origin)*wheel_scale+wheel_position
    driver_objects.append(obj)

# The source driver is slightly undersized against the car's metre-scale cockpit.
for obj in driver_objects:
    for vertex in obj.data.vertices:
        vertex.co = (vertex.co - Vector((.03,0,1.5)))*driver_scale + Vector((.03,0,1.5))

actors = {'car':join_objects(car_objects,'Racing car'), 'driver':join_objects(driver_objects,'Seated racing driver')}
for name,obj in actors.items(): obj['actor']=name


def projection_points(objects):
    vertices = np.concatenate([np.array([vertex.co[:] for vertex in obj.data.vertices]) for obj in objects])
    points = []
    for index in range(96):
        y = 1 - 2 * (index + .5) / 96
        angle = index * math.pi * (3 - math.sqrt(5))
        direction = np.array([math.cos(angle) * math.sqrt(1-y*y), y, math.sin(angle) * math.sqrt(1-y*y)])
        x, depth, height = vertices[np.argmax(vertices @ direction)]
        point = [float(x), float(height), float(-depth)]
        if point not in points:
            points.append(point)
    return points


def annotate_glb(path, objects):
    raw = path.read_bytes()
    json_length = struct.unpack_from('<I', raw, 12)[0]
    document = json.loads(raw[20:20 + json_length])
    document['asset']['extras'] = {
        'sourceHash': source_hash, 'authoring': f'Blender {bpy.app.version_string}',
        'projectionPoints': projection_points(objects), 'pose': 'Seated driving position above the cockpit', 'sourceModels': source_models, 'sourceTriangles': source_triangles,
    }
    text = json.dumps(document, separators=(',', ':')).encode()
    text += b' ' * ((-len(text)) % 4)
    remaining = raw[20 + json_length:]
    header = struct.pack('<III', 0x46546C67, 2, 20 + len(text) + len(remaining))
    path.write_bytes(header + struct.pack('<II', len(text), 0x4E4F534A) + text + remaining)


for filename, objects in [('racing-car.glb', [actors['car']]), ('racing-driver.glb', [actors['driver']]), ('car-and-driver.glb', list(actors.values()))]:
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    path = project.parent / filename
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True, export_yup=True, export_apply=True, export_extras=True, export_copyright='Car: Nick Broad, CC BY 4.0. Driver: MattDoesBlender, CC BY-NC-SA 4.0. Modified by Car or Driver; see NOTICE.txt.')
    annotate_glb(path, objects)
    path = path.replace(output / filename)
    print(f'EXPORTED {path.name}: {path.stat().st_size / 1024:.0f} KB', flush=True)

# Keep an editable studio scene alongside the generated preview artifacts.
bpy.context.scene.render.engine = 'CYCLES'
bpy.context.scene.cycles.samples = 32
bpy.context.scene.cycles.use_denoising = True
world = bpy.data.worlds.new('Silver studio') if not bpy.data.worlds else bpy.data.worlds[0]
bpy.context.scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (.15, .17, .21, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = .45
for name, position, energy, size in [('Key softbox', (-4,-5,7), 1000, 5), ('Edge softbox', (3,4,6), 1400, 4), ('Front fill', (-4,3,4), 650, 4)]:
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = energy
    data.shape = 'DISK'
    data.size = size
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = position
    obj.rotation_euler = (Vector((0,0,1)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
camera_data = bpy.data.cameras.new('Scene camera')
camera = bpy.data.objects.new('Scene camera', camera_data)
bpy.context.collection.objects.link(camera)
camera.location = (-7,-8,5)
camera.rotation_euler = (Vector((0,0,1.1)) - camera.location).to_track_quat('-Z','Y').to_euler()
camera_data.type = 'ORTHO'
camera_data.ortho_scale = 7.0
bpy.context.scene.camera = camera
bpy.context.scene.render.resolution_x = 1600
bpy.context.scene.render.resolution_y = 1200
bpy.context.scene.render.resolution_percentage = 100
bpy.context.scene.render.film_transparent = True
bpy.ops.wm.save_as_mainfile(filepath=str(project))
print(f'BLENDER PROJECT {arguments.project}', flush=True)
