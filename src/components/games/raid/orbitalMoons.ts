import type { Texture } from 'pixi.js'
import { OrbitalSurface } from './orbitalBodies'
import type { OrbitalCamera, OrbitalGlobe, globeStyles } from './orbitalSpace'

type GlobeStyle = typeof globeStyles[keyof typeof globeStyles]
const AIRLESS = [0,0,0] as const

/** Bounded satellites share the prepared sphere geometry and existing crater art.
 * Positions and eclipse rays use the same planet-relative 3D coordinates. */
export class OrbitalMoons {
  private readonly moons: { surface: OrbitalSurface; body: Float32Array; parent: Float32Array }[]
  constructor(private readonly globe: OrbitalGlobe, private readonly index: number) {
    this.moons = Array.from({length:index === 0 ? 2 : 1}, () => {
      const surface = new OrbitalSurface()
      globe.anchor.parent!.addChild(surface.mesh)
      return {surface,body:new Float32Array(4),parent:new Float32Array(4)}
    })
  }
  update(texture: Texture | undefined, style: GlobeStyle, camera: OrbitalCamera | null,
    distanceKm: number, seconds: number, enabled: boolean) {
    const anchor = this.globe.anchor
    this.globe.setOccluders()
    for (const moon of this.moons) { moon.surface.mesh.visible = false; moon.body.fill(0) }
    if (!enabled || !texture || !camera || distanceKm <= 0) return
    const radiusKm = style.radiusKm
    // Inclined orbital planes allow genuine front/back passes and solar eclipses.
    // The displayed orbital clock is compressed; no physics objects are spawned.
    for (let i=0;i<this.moons.length;i++) {
      const {surface,body,parent} = this.moons[i], mesh = surface.mesh
      const relativeRadius = i === 0 ? .18+(this.index%2)*.025 : .105
      const radius = radiusKm*relativeRadius
      const ringed = style.swing === 0
      // Compact paths remain outside the surface and authored ring footprint.
      const orbit = (ringed ? 2.35 : 1.65)+i*.65
      const node = 2.248+this.index*.13+i*.11
      const tilt = .90+i*.16-this.index*.08
      // Slow orbital motion; outer satellites take longer to circle the planet.
      const rate = (.0068-this.index*.0004)*Math.pow(1.65/orbit,1.5)
      const angle = seconds*rate+1.16+i*2.4+this.index*.7
      const ca = Math.cos(angle), sa = Math.sin(angle), cn = Math.cos(node), sn = Math.sin(node)
      body[0] = orbit*(cn*ca-sn*Math.sin(tilt)*sa)
      body[1] = orbit*(sn*ca+cn*Math.sin(tilt)*sa)
      body[2] = orbit*Math.cos(tilt)*sa
      body[3] = relativeRadius
      const distance = distanceKm-body[2]*radiusKm
      if (distance <= radius*1.025) continue
      const x = camera.width*.5+((anchor.x-camera.width*.5)*distanceKm/camera.focal+body[0]*radiusKm)*camera.focal/distance
      const y = camera.height*.5+((anchor.y-camera.height*.5)*distanceKm/camera.focal+body[1]*radiusKm)*camera.focal/distance
      // Parent shadows the moon on the far side, using the same sun-ray test.
      for (let axis=0;axis<3;axis++) parent[axis] = -body[axis]/relativeRadius
      parent[3] = 1/relativeRadius
      surface.setTexture(texture)
      surface.setLight(camera.sunDirection)
      surface.setOccluders(parent)
      surface.setPerspective(radius/distance,(x-camera.width*.5)/camera.focal,(y-camera.height*.5)/camera.focal)
      surface.pose(seconds*(.008+i*.003)+this.index+i*1.9,.12+i*.17,.40,.40,AIRLESS)
      mesh.position.set(x,y)
      const diameter = radius*camera.focal/distance/.40
      mesh.scale.set(diameter,diameter)
      mesh.rotation = 0
      mesh.alpha = anchor.alpha
      mesh.tint = anchor.tint
      // Same distance sort as the planet; foreground moons cross its disc,
      // rear moons disappear behind it instead of drawing over the surface.
      mesh.zIndex = anchor.zIndex+body[2]*radiusKm
      mesh.visible = true
    }
    this.globe.setOccluders(this.moons[0].body,this.moons[1]?.body)
  }
  destroy() { for (const moon of this.moons) moon.surface.destroy() }
}
