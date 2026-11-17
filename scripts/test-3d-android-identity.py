"""Guard against 3D Android releases overwriting the original 2D installation."""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP_ID = "com.zukito.spaceimpactdefender3d"
APP_NAME = "Space Impact Defenders 3D"
MEDIA_URL = "https://github.com/zukito1411/Space-Impact-Defenders-3D-/releases/download/android-3d-assets-v1/"

def source(name: str) -> str:
    return (ROOT / name).read_text(encoding="utf-8")

capacitor = source("capacitor.config.ts")
gradle = source("android/app/build.gradle")
labels = source("android/app/src/main/res/values/strings.xml")
native_assets = source("android/app/src/main/java/com/zukito/spaceimpactdefender/GameAssetStore.java")
packager = source("scripts/package-android-assets.py")
workflow = source(".github/workflows/android-release.yml")
verify = source(".github/workflows/verify.yml")

assert f"appId: '{APP_ID}'" in capacitor
assert f"appName: '{APP_NAME}'" in capacitor
assert f'applicationId "{APP_ID}"' in gradle
assert "SpaceImpactDefenders3D-${variant.name}.apk" in gradle
assert f'<string name="app_name">{APP_NAME}</string>' in labels
assert f'<string name="package_name">{APP_ID}</string>' in labels
assert f'<string name="custom_url_scheme">{APP_ID}</string>' in labels
assert MEDIA_URL in native_assets
assert "Space-Impact-Defenders-3D-/releases/download/{RELEASE}/" in packager
assert 'RELEASE = "android-3d-assets-v1"' in packager
assert "SpaceImpactDefenders3D-release.apk" in workflow
assert "SpaceImpactDefenders3D-release.apk" in verify
assert 'TAG="android-3d-v${GITHUB_RUN_NUMBER}"' in workflow
assert "com.zukito.spaceimpactdefender3d" in workflow
assert "publish-itch-android" not in workflow
assert "butler" not in workflow.lower()
assert "itch.io" not in workflow.lower()
assert "space-defenders-impact/releases/" not in native_assets
print("Verified independent 3D Android ID, display name, media host, APK, and no itch.io publishing")
