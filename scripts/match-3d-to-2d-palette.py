#!/usr/bin/env python3
"""Bake the actual 2D ship paint palette into each 3D banking atlas.

Preserves existing 3D geometry, poses, alpha silhouettes, panels and ship
shadows; remaps color/luminance from the matching portrait and sideview art.
This is a texture/grade upgrade, not a high-poly mesh replacement.
"""
from pathlib import Path
from argparse import ArgumentParser
import numpy as np
from PIL import Image

ROOT = Path("public/assets/ships")
CELL, COLS, ROWS = 448, 7, 2
NAMES = dict(rocket="black-comet", fast="red-wraith", gatling="crimson-saw",
             laser="night-lance", dreadnought="obsidian-ark",
             xwing="crosswing-nova", spaceEt="space-jet",
             mesiahBlack="mesiah-black", mesiahWhite="mesiah-white",
             mesiahRaptorBlack="mesiah-raptor-black",
             mesiahRaptorWhite="mesiah-raptor-white",
             coreLander="core-lander", coreLanderBurning="core-lander-burning",
             godGundam="god-gundam", godGundamBurning="god-gundam-burning",
             spiegel="spiegel")
PORTRAIT = dict(coreLander="core-lander.png",
                coreLanderBurning="core-lander-burning.png",
                coreLanderElite="core-lander-elite.webp",
                coreLanderBurningElite="core-lander-burning-elite.webp",
                godGundam="god-gundam.png",
                godGundamBurning="god-gundam-burning.png",
                spiegel="spiegel.png",
                mesiahRaptorBlack="mesiah-raptor-black.png",
                mesiahRaptorWhite="mesiah-raptor-white.png")
SIDE = dict(mesiahBlack="mesiah", mesiahWhite="mesiah-white",
            godGundam="god-gundam-flight-v4.webp",
            godGundamBurning="god-gundam-burning-flight-v5.webp",
            spiegel="spiegel-flight-v2.webp")

def references(key):
    elite = key.endswith("Elite")
    base = key[:-5] if elite else key
    name = NAMES[base]
    side = SIDE.get(base, name) if not elite else name + "-elite"
    if not side.endswith((".png", ".webp")):
        side += "-v1.png"
    front = PORTRAIT.get(key, name + ("-elite" if elite else "") +
                         "-remaster-v1.webp")
    paths = [p for p in (ROOT/"sideview"/side, ROOT/front) if p.is_file()]
    if not paths:
        raise FileNotFoundError(f"No original 2D artwork for {key}")
    return paths

def pixels(image):
    im = image.convert("RGBA")
    hsv = np.array(im.convert("RGB").convert("HSV"), dtype=np.float32)/255.
    alpha = np.array(im.getchannel("A"))
    mask = (alpha >= 150) & (hsv[...,2] > .105) & (hsv[...,2] < .985)
    return hsv[mask][::4]

def calibrate(key, image):
    refs=[]
    for path in references(key):
        with Image.open(path) as source:
            source.thumbnail((640,640),Image.Resampling.LANCZOS)
            data=pixels(source)
            if len(data)>50:
                refs.append(data[::max(1,len(data)//15000)])
    if not refs:
        raise ValueError(f"2D reference colors missing: {key}")
    reference=np.concatenate(refs)
    portrait = image.crop((3*CELL,0,4*CELL,CELL))
    landscape = image.crop((3*CELL,CELL,4*CELL,2*CELL))
    original=np.concatenate([pixels(portrait),pixels(landscape)])
    if len(original)<100:
        raise ValueError(f"3D pixels missing: {key}")
    qs=[.05,.22,.42,.60,.78,.94]
    source_levels=np.maximum.accumulate(np.quantile(original[:,2],qs) +
                                        np.arange(len(qs))*1e-6)
    target_levels=np.clip(np.quantile(reference[:,2],qs),.045,.99)
    def accent(data):
        selected=data[(data[:,1]>.17)&(data[:,2]>.12)]
        return float(np.quantile(selected[:,1],.7)) if len(selected) else .3
    gain=float(np.clip(accent(reference)/max(accent(original),.05),.85,1.9))
    colored=reference[(reference[:,1]>.22)&(reference[:,2]>.19)]
    if len(colored)>150:
        hist,_=np.histogram(colored[:,0],bins=24,range=(0,1),
                            weights=colored[:,1]*np.sqrt(colored[:,2]))
        centers=(np.arange(24)+.5)/24
        target_hues=centers[hist >= max(hist.max()*.15,hist.mean()*.65)]
    else:
        target_hues=np.array([],dtype=np.float32)
    return source_levels,target_levels,gain,target_hues

def grade(tile, settings):
    low, high, gain, target_hues=settings
    im=tile.convert("RGBA")
    hsv=np.array(im.convert("RGB").convert("HSV"),dtype=np.uint8)
    alpha=im.getchannel("A")
    hue=hsv[...,0].astype(np.float32)/255.
    saturation=hsv[...,1].astype(np.float32)/255.
    value=hsv[...,2].astype(np.float32)/255.
    matched=np.interp(value,low,high)
    # Retain specular brightness and metal curvature while restoring the 2D
    # artwork's shadow and midtone contrast (no universal saturation filter).
    intensity=np.maximum(value*.88,value*.34+matched*.66)
    saturation=np.clip(saturation*(1+(gain-1)*np.clip(
        (saturation-.08)/.34,0,1)),0,.985)
    if len(target_hues):
        distances=(hue[...,None]-target_hues+.5)%1.-.5
        nearest=np.take_along_axis(distances,
            np.argmin(np.abs(distances),axis=-1)[...,None],-1)[...,0]
        weight=np.clip((.15-np.abs(nearest))/.1,0,1)*np.clip(
            (saturation-.13)/.4,0,.3)
        hue=(hue-nearest*weight)%1.
    hsv[...,0]=np.clip(hue*255,0,255).astype(np.uint8)
    hsv[...,1]=np.clip(saturation*255,0,255).astype(np.uint8)
    hsv[...,2]=np.clip(intensity*255,0,255).astype(np.uint8)
    out=Image.fromarray(hsv,"HSV").convert("RGB")
    out.putalpha(alpha)
    return out

def build(key, directory):
    source=directory/(key+"-v2.webp")
    dest=directory/(key+"-v3.webp")
    with Image.open(source) as atlas:
        if atlas.size!=(COLS*CELL,ROWS*CELL):
            raise ValueError(f"{source}: invalid banking frame dimensions")
        settings=calibrate(key,atlas)
        result=Image.new("RGBA",atlas.size,(0,0,0,0))
        for row in range(ROWS):
            for col in range(COLS):
                frame=atlas.crop((col*CELL,row*CELL,
                                  (col+1)*CELL,(row+1)*CELL))
                result.alpha_composite(grade(frame,settings),
                                       (col*CELL,row*CELL))
    result.save(dest,"WEBP",quality=96,method=5,exact=True)
    with Image.open(dest) as verify:
        assert verify.size==result.size and verify.mode=="RGBA"
    print(f"{key}: {', '.join(p.name for p in references(key))}; "
          f"2D saturation match factor={settings[2]:.2f}; "
          f"output={dest.stat().st_size:,} bytes")

if __name__=="__main__":
    parser=ArgumentParser()
    parser.add_argument("--only",action="append")
    args=parser.parse_args()
    folder=ROOT/"banking"
    files=sorted(folder.glob("*-v2.webp"))
    if args.only:
        files=[p for p in files if p.name.removesuffix("-v2.webp") in args.only]
    assert files, "No v2 banking atlases found"
    for file in files:
        build(file.name.removesuffix("-v2.webp"),folder)
    print(f"Recolored {len(files)} banking atlases to match original 2D ships.")
