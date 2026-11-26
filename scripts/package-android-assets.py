"""Split the completed Android web build into the APK payload and immutable media packs."""

import hashlib
import json
from argparse import ArgumentParser
import zipfile
from collections import defaultdict
from pathlib import Path

RELEASE = "android-3d-assets-v1"
BASE_URL = f"https://github.com/zukito1411/Space-Impact-Defenders-3D-/releases/download/{RELEASE}/"
MEDIA_METADATA_SUFFIXES = {".txt", ".json"}

# The command deck, shared profile and Ship Defense use these named files.
# Raid art and archived versions stay in the downloadable release.
BUNDLED_MEDIA = {
    "assets/brand/zuki-logo-v1.png",
    "assets/ui/orbital-hangar-v1.png", "assets/ui/console-plate-v1.png", "assets/ui/space-door-v1.webp",
    "assets/aliens/alien_v0.png", "assets/aliens/alien_v3.png", "assets/aliens/alien_v6.png",
    "assets/aliens/elite_2.png", "assets/aliens/elite_3.png",
    "assets/aliens/squid_boss.png", "assets/aliens/cobra_boss.png", "assets/aliens/final_boss.png",
    "assets/others/planet_1.webp", "assets/others/space_station.webp", "assets/others/sun.webp",
    "assets/others/asteroid.webp", "assets/others/comet.webp", "assets/others/galaxy.webp",
    "assets/GundamEnemy/devil-rage.png", "assets/GundamEnemy/master-gundam.png",
    "assets/ships/god-gundam.png", "assets/ships/god-gundam-burning.png", "assets/ships/spiegel.png",
    "assets/ships/sideview/god-gundam-flight-v4.webp", "assets/ships/sideview/god-gundam-burning-flight-v5.webp",
    "assets/ships/sideview/spiegel-flight-v2.webp",
    "audio/bgm_shelter.wav", "audio/bgm_scifi_loop.ogg",
    "audio/immersion/sector-station.ogg",
    "audio/immersion/deploy.ogg", "audio/immersion/synergy.ogg", "audio/immersion/hq-warning.ogg",
    "audio/immersion/fighter-death.ogg", "audio/immersion/armored-death.ogg",
    "audio/immersion/capital-death.ogg",
    "audio/immersion/fleet-motif.ogg", "audio/immersion/fleet-defense-orders.ogg", "audio/immersion/fleet-deployed.ogg",
    "audio/sfx_cannon.wav", "audio/sfx_combo.wav", "audio/sfx_countdown.wav", "audio/sfx_damage.wav",
    "audio/sfx_explosion_big.wav", "audio/sfx_explosion_small.wav", "audio/sfx_gameover.wav", "audio/sfx_laser.wav",
    "audio/sfx_levelup.wav", "audio/sfx_rocket.wav", "audio/sfx_score.wav", "audio/sfx_shoot.wav",
    "audio/sfx_ui_select.wav", "audio/sfx_ui_swap.wav",
}

# Only the current profile and fleet previews are needed outside Raid. Use the
# explicitly selected version per orientation from the ship picker.
for ship, portrait, landscape in (
    ("coreLander", 5, 7), ("coreLanderBurning", 5, 7), ("dreadnought", 5, 7),
    ("fast", 10, 10), ("gatling", 12, 12), ("laser", 5, 7), ("mesiahBlack", 5, 7),
    ("mesiahWhite", 5, 7), ("rocket", 5, 7), ("spaceEt", 5, 7), ("xwing", 9, 9),
):
    for key in (ship, ship + "Elite"):
        BUNDLED_MEDIA.add(f"assets/ships/previews/{key}-portrait-v{portrait}.webp")
        BUNDLED_MEDIA.add(f"assets/ships/previews/{key}-landscape-v{landscape}.webp")


def package(public, dist, output):
    output.mkdir(parents=True, exist_ok=True)
    files = {}
    groups = defaultdict(dict)
    bundled_bytes = 0
    for media_root in ("assets", "audio"):
        for source in sorted((public / media_root).rglob("*")):
            name = source.relative_to(public).as_posix()
            if not source.is_file() or source.suffix.lower() in MEDIA_METADATA_SUFFIXES:
                continue
            if name in BUNDLED_MEDIA:
                bundled_bytes += (dist / name).stat().st_size
                continue
            if source.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp", ".svg", ".glb", ".mp3", ".wav", ".ogg"}:
                raise ValueError(f"Unrecognized Android media: {name}")
            data = (dist / name).read_bytes()
            digest = hashlib.sha256(data).hexdigest()
            files[name] = {"hash": digest, "bytes": len(data)}
            groups[digest[:2]][digest] = dist / name
    if not files:
        raise ValueError("No downloadable Android media")

    packs = []
    for bucket, entries in sorted(groups.items()):
        temporary = output / f"{bucket}.tmp"
        with zipfile.ZipFile(temporary, "w") as archive:
            for digest, path in sorted(entries.items()):
                item = zipfile.ZipInfo(digest, date_time=(2020, 1, 1, 0, 0, 0))
                archive.writestr(item, path.read_bytes(), zipfile.ZIP_DEFLATED, compresslevel=6)
        data = temporary.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        temporary.replace(output / f"{digest}.zip")
        packs.append({"hash": digest, "bytes": len(data), "files": sorted(entries)})

    manifest = {"version": 1, "baseUrl": BASE_URL, "files": files, "packs": packs}
    (dist / "native-assets.json").write_text(json.dumps(manifest, separators=(",", ":")), encoding="utf-8")
    for name in files:
        (dist / name).unlink()
    print(f"Android media: {bundled_bytes:,} bytes bundled; {len(files)} files in {len(packs)} packs, {sum(p['bytes'] for p in packs):,} bytes")


if __name__ == "__main__":
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("public", type=Path, nargs="?", default=Path("public"))
    parser.add_argument("dist", type=Path, nargs="?", default=Path("dist"))
    parser.add_argument("output", type=Path, nargs="?", default=Path("release/android-assets"))
    args = parser.parse_args()
    package(args.public, args.dist, args.output)
