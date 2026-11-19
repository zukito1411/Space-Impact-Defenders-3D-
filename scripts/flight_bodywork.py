"""Loft the primary flight structure in the same 288-unit datum as the painted wings."""
import math
import tempfile
from pathlib import Path

import bpy
import numpy as np
from PIL import Image, ImageDraw, ImageFont


# Body beam, crown, cockpit length, cockpit width, drive width, enamel, trim.
# Reactor carriers carry a broader spine; interceptors have longer, narrower glazing.
FAMILIES = {
    "rocket": (.125, .095, .35, .73, .070, "#394856", "#eaa526"),
    "fast": (.112, .089, .31, .76, .068, "#dad6c9", "#eeac17"),
    "gatling": (.135, .103, .29, .72, .071, "#e4e4da", "#ca2439"),
    "laser": (.122, .090, .42, .80, .075, "#d3e3e3", "#008ea0"),
    "dreadnought": (.162, .117, .25, .61, .083, "#38424c", "#e2a225"),
    "spaceEt": (.129, .101, .38, .81, .074, "#c9dce3", "#2477aa"),
    "xwing": (.086, .078, .31, .80, .055, "#d4d9d9", "#b82930"),
    "mesiahBlack": (.153, .109, .27, .62, .072, "#38404d", "#cca246"),
    "mesiahWhite": (.153, .109, .27, .62, .072, "#dedfd8", "#d7a13e"),
    "mesiahRaptorBlack": (.108, .080, .40, .79, .063, "#343946", "#b63141"),
    "mesiahRaptorWhite": (.108, .080, .40, .79, .063, "#e4e4df", "#c93640"),
    "coreLander": (.127, .099, .35, .76, .056, "#e2e0d6", "#bd2e36"),
    "coreLanderBurning": (.121, .096, .32, .76, .057, "#eadbc0", "#e04428"),
}
# Rounded chine, nearly vertical side belt, beveled keel. Each band has its own UV strip.
SECTION = [(0, 1), (.55,.96), (.85,.76), (.98,.42), (1,.12),
           (.96,-.28), (.72,-.74), (.38,-.95), (0,-1), (-.38,-.95),
           (-.72,-.74), (-.96,-.28), (-1,.12), (-.98,.42), (-.85,.76), (-.55,.96)]


def linear(hex_color):
    s = hex_color.lstrip("#")
    return tuple(((int(s[i:i+2],16)/255+.055)/1.055)**2.4 for i in (0,2,4))


def loft(name, rings, section, materials, slot, mesh_object, bevel=0):
    """Closed shell with outward faces, cyclic strip UVs and crisp longitudinal chines."""
    verts, faces, slots, coords = [], [], [], []
    count = len(section)
    for y, x, z, width, upper, lower in rings:
        verts.extend((x+a*width, 144-y, z+b*(upper if b>0 else lower)) for a,b in section)
    nose, length = rings[0][0], rings[-1][0] - rings[0][0]
    for k in range(len(rings)-1):
        u0, u1 = [(rings[j][0]-nose)/length for j in (k,k+1)]
        for i in range(count):
            j = (i+1)%count
            faces.append((k*count+i,(k+1)*count+i,(k+1)*count+j,k*count+j))
            coords.extend(((u0,1-i/count),(u1,1-i/count),(u1,1-(i+1)/count),(u0,1-(i+1)/count)))
            slots.append(slot(k,i))
    faces.extend([tuple(range(count)),tuple(reversed(range(len(verts)-count,len(verts))))])
    obj = mesh_object(name,verts,faces,materials)
    uv = obj.data.uv_layers.new(name="Manufactured panels")
    coords.extend([(0,0)]*(2*count))
    uv.data.foreach_set("uv",np.asarray(coords,dtype="f").ravel())
    for poly,index in zip(obj.data.polygons,slots):
        poly.material_index=index
    if bevel:
        edge=obj.modifiers.new("Machined edge radii","BEVEL")
        edge.width=bevel; edge.segments=2; edge.angle_limit=math.radians(22)
        normal=obj.modifiers.new("Panel normals","WEIGHTED_NORMAL")
        normal.keep_sharp=True
    return obj


def enamel_sheet(key, base, enamel, trim, solid):
    """Paint on panel-local UVs. Mirrored layout keeps both flanks independently legible."""
    size=1024
    face=tuple(int(enamel[i:i+2],16) for i in (1,3,5))
    def tone(mult):
        return tuple(min(255,round(c*mult)) for c in face)
    strip=Image.new("RGB",(size,size//2),face)
    d=ImageDraw.Draw(strip)
    # Large uninterrupted fields, restrained seams and a swept squadron flash.
    for x0,x1,t in [(0,172,.94),(173,425,1.02),(426,696,.97),(697,1023,1.04)]:
        d.polygon([(x0,0),(x1,0),(x1-26,280),(x0-26,280)],fill=tone(t))
    for x in (182,445,715,900):
        line=[(x,0),(x,68),(x-27,98),(x-27,242),(x+10,283),(x+10,512)]
        d.line(line,fill=tone(.48),width=3)
        d.line([(a+3,b) for a,b in line],fill=tone(1.12),width=2)
    d.polygon([(595,0),(623,0),(733,137),(821,137),(821,147),(717,147)],fill=trim)
    d.polygon([(40,215),(420,202),(479,181),(432,213),(43,224)],fill=trim)
    for x,y,w,h in [(500,168,110,47),(734,230,94,44),(275,286,74,42)]:
        d.rounded_rectangle((x,y,x+w,y+h),radius=7,outline=tone(.5),width=3)
        for dx in (7,w-7):
            for dy in (7,h-7):
                d.ellipse((x+dx-1,y+dy-1,x+dx+1,y+dy+1),fill=tone(.4))
    ink = "#d3dce1" if sum(face)<380 else "#354652"
    serial = f"{list(FAMILIES).index(base)+11}{'E' if key.endswith('Elite') else 'A'}"
    try:
        lettering=ImageFont.truetype("DejaVuSans-Bold.ttf",29)
    except OSError:
        lettering=ImageFont.load_default()
    d.text((486,122),serial,fill=ink,font=lettering)
    for x in range(808,867,11):
        d.polygon([(x,175),(x+6,175),(x+1,191),(x-5,191)],fill=tone(.37))
    d.polygon([(403,173),(422,173),(412,191)],outline=trim,width=3)
    # Service-access markings on the keel; no cockpit graphics on the underside.
    for x in range(574,688,13):
        d.polygon([(x,401),(x+5,401),(x-5,425),(x-10,425)],fill=tone(.34))
    canvas=Image.new("RGB",(size,size))
    canvas.paste(strip,(0,0));canvas.paste(strip.transpose(Image.Transpose.FLIP_TOP_BOTTOM),(0,size//2))
    mat=solid("Ceramic composite · "+key,linear(enamel),.27)
    shader=mat.node_tree.nodes.get("Principled BSDF");shader.inputs["Roughness"].default_value=.37
    tex=mat.node_tree.nodes.new("ShaderNodeTexImage")
    with tempfile.TemporaryDirectory() as tmp:
        file=Path(tmp)/(key+"-body.jpg")
        canvas.save(file,quality=96,subsampling=0)
        tex.image=bpy.data.images.load(str(file));tex.image.pack();tex.image.filepath="//"+file.name
    mat.node_tree.links.new(tex.outputs["Color"],shader.inputs["Base Color"])
    mat.node_tree.nodes.active=tex
    return mat


def build_bodywork(key, mask, cy, hardpoints, mesh_object, solid):
    base=key.removesuffix("Elite")
    beam,crown,canopy_length,canopy_width,duct_width,enamel,trim=FAMILIES[base]
    ys=np.flatnonzero(np.any(mask[:,137:152],axis=1))
    nose,aft=int(ys[0]),int(ys[-1])
    if base in ("fast","gatling"):
        nose=76  # Existing turret head and three barrels remain forward of the cockpit.
    length=aft-nose
    width, height=beam*length,crown*length
    paint=enamel_sheet(key,base,enamel,trim,solid)
    alloy=solid("Satin titanium",linear("#667784"),.68)
    seal=solid("Recess and canopy gasket",linear("#18232d"),.20)
    lining=solid("Belly and drive casing",linear("#53616b"),.56)
    flash=solid("Squadron enamel",linear(trim),.25)
    glass=solid("Smoked blue ceramic glazing",linear("#164358"),.54)
    bsdf=glass.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value=.16
    bsdf.inputs["Coat Weight"].default_value=.7
    bsdf.inputs["Coat Roughness"].default_value=.12

    # The curved sky reflection stays coherent across the glass panes even
    # when the camera sees only a narrow slice of the windscreen.
    edge=glass.node_tree.nodes.new("ShaderNodeLayerWeight")
    ramp=glass.node_tree.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color=(*linear("#0b2837"),1)
    ramp.color_ramp.elements[1].color=(*linear("#5494a8"),1)
    glass.node_tree.links.new(edge.outputs["Facing"],ramp.inputs[0])
    glass.node_tree.links.new(ramp.outputs["Color"],bsdf.inputs["Base Color"])
    # Place the windscreen over the original cabin. Taper the new forebody from
    # that location and blend a wider drive deck into the existing wing roots.
    cabin=np.clip((cy-nose)/length,.26,.53)
    stations=np.array([0,.08,cabin-.13,cabin,cabin+.13,.73,.86,.96,1])
    breadth=np.array([.09,.29,.66,.90,1,1,.86,.59,.30])
    roof=np.array([.09,.31,.59,.83,.91,1,.87,.58,.39])
    keel=np.array([.14,.38,.69,.90,1,.90,.76,.47,.3])
    def section(t):
        return (width*np.interp(t,stations,breadth),height*np.interp(t,stations,roof),
                height*.83*np.interp(t,stations,keel))
    heavy=base=="dreadnought" or base in ("mesiahBlack","mesiahWhite")
    sleek=base in ("rocket","laser","spaceEt","mesiahRaptorBlack","mesiahRaptorWhite")
    body=[]
    for t in stations:
        w,h,b=section(t)
        body.append((nose+t*length,0,4,w,h,b))
    loft("Pressure hull · chine and ventral shell",body,SECTION,[paint,lining,alloy],
         lambda k,i: 2 if k==0 and i in (4,11) else 1 if i in (6,7,8,9) else 0,mesh_object,.008*length)

    start=max(.055,cabin-canopy_length*.57);end=min(.77,cabin+canopy_length*.51)
    canopy_sections=[(0,.24,.02),(.13,.57,.27),(.46,.88,.84),(.64,1,1),(.84,.96,.90),(1.02,.83,.53),(1.23,.52,.07)]
    def canopy_ring(p,w,h):
        t=start+(end-start)*p
        beam_here,deck,_=section(t)
        return (nose+t*length,0,4+deck*.72,beam_here*canopy_width*w,height*(.16+h*(.65 if heavy else .82)),height*.24)
    cockpit=[canopy_ring(*spec) for spec in canopy_sections]
    cabin_mesh=loft("Cockpit · framed windscreen and side lights",cockpit,SECTION,[glass,seal,paint],
         lambda k,i: 2 if k>=4 else 1 if i in (4,5,10,11) else 0,mesh_object,.003*length)
    if sleek:
        for face in cabin_mesh.data.polygons:
            face.use_smooth=face.material_index==0 and len(face.vertices)==4
    # A structural arch at the windscreen break wraps roof and both side windows.
    p,w,h=canopy_sections[2]
    arch=[list(canopy_ring(p+delta,w*1.026,h*1.04)) for delta in (-.015,.015)]
    loft("Windscreen arch",arch,SECTION,[alloy],lambda k,i:0,mesh_object,.16)

    # A pair of cheek intakes sweeps into the engine stations. Their forward
    # mouths have a recessed cavity with a raised lip visible in oblique views.
    if base=="xwing":
        drive_x=24
    else:
        outer=max((abs(x-144) for x,_,_ in hardpoints),default=0)
        drive_x=max(width*.74,min(outer,width*1.65))
    drive_w=length*duct_width
    for side in (-1,1):
        start_t=.58 if canopy_length>.36 else .51
        inlet=nose+start_t*length
        back=nose+.89*length
        mid=(inlet+back)*.5
        x0=side*max(width*.89,drive_x*.86)
        x1=side*drive_x
        z=height*.18
        # First ring is inside the opening. The profile doubles back to the lip.
        rings=[(inlet+length*.052,x0,z,drive_w*.59,drive_w*.48,drive_w*.38),
               (inlet,x0,z,drive_w*.88,drive_w*.72,drive_w*.62),
               (inlet+length*.015,x0,z,drive_w,drive_w*.88,drive_w*.72),
               (mid,(x0+x1)/2,z,width*.12+drive_w,drive_w*1.18,drive_w*.84),
               (back-length*.035,x1,5,drive_w*.91,drive_w*.95,drive_w*.74),
               (back-length*.023,x1,5,drive_w*.86,drive_w*.90,drive_w*.69),
               (back,x1,5,drive_w*.83,drive_w*.89,drive_w*.7)]
        loft("Port intake" if side<0 else "Starboard intake",rings,SECTION,[seal,alloy,paint,flash],
             lambda k,i: 0 if k==0 else 1 if k==1 else 3 if k==4 and i in (1,2,3,12,13,14) else 2,mesh_object,.4)
        # The side service recess sits in a raised flange on the drive casing.
        # An inset face and three bridges give it a readable lip from either side.
        panel_y=mid
        panel_z=z+drive_w*.10
        panel_x=abs((x0+x1)/2)+width*.12+drive_w
        half_length=length*.047
        half_height=drive_w*.32
        corners=[(-.82,1),(.88,1),(1,.55),(1,-.58),(.82,-1),(-.86,-1),(-1,-.55),(-1,.50)]
        verts=[];faces=[]
        for inset,scale in [(-1.6,1.11),(1.1,1.),(1.1,.82),(-.3,.73)]:
            verts.extend((side*(panel_x+inset),144-(panel_y+a*half_length*scale),
                          panel_z+b*half_height*scale) for a,b in corners)
        for k in range(3):
            for i in range(8):
                j=(i+1)%8
                faces.append((k*8+i,(k+1)*8+i,(k+1)*8+j,k*8+j))
        faces.append(tuple(range(24,32)))
        panel=mesh_object("Flank cooling port",verts,faces,[alloy,lining,seal])
        for f in panel.data.polygons:
            f.material_index=0 if f.index<16 else 2
        for offset in (-.42,0,.42):
            y=panel_y+offset*half_length
            rings=[(y,side*(panel_x+.24),panel_z,.71,.68*half_height,.68*half_height),
                   (y+1.25,side*(panel_x+.62),panel_z,.63,.68*half_height,.68*half_height)]
            loft("Cooling port fin",rings,SECTION,[lining],lambda k,i:0,mesh_object)
    # Recessed dorsal radiator bed and louvres step down toward the drive.
    vent_x=.43*width
    for side in (-1,1):
        vent_w=width*.19
        for t in (.735,.763,.791,.819):
            _,deck,_=section(t)
            y=nose+t*length
            z=4+deck*.98
            r=[(y,side*vent_x,z,vent_w,.35,1.9),
               (y+length*.014,side*vent_x,z+.5,vent_w,1.55,2.)]
            loft("Radiator louvre",r,SECTION,[seal,alloy],lambda k,i: 1 if i in (0,15) else 0,mesh_object)
