import type { MeshStandardMaterial } from 'three'

/** Preserve the old deck/wall PBR split inside one draw. The worker already
 * separates wall vertices, so this adds no geometry and changes no paint UVs. */
export function prepareVolumeSurface(material: MeshStandardMaterial) {
  if (!material.userData.raidVolumeSurface) return
  const previous=material.onBeforeCompile
  material.onBeforeCompile=(shader,renderer)=>{
    previous.call(material,shader,renderer)
    shader.vertexShader='attribute float hullWall;\nvarying float volumeWall;\n'+shader.vertexShader
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`
      #include <begin_vertex>
      volumeWall=hullWall;
    `)
    shader.fragmentShader='varying float volumeWall;\n'+shader.fragmentShader
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`
      #include <roughnessmap_fragment>
      roughnessFactor=mix(roughnessFactor,.60,volumeWall);
    `).replace('#include <metalnessmap_fragment>',`
      #include <metalnessmap_fragment>
      metalnessFactor=mix(metalnessFactor,.30,volumeWall);
    `)
  }
}
