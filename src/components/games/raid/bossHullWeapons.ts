import { Float32BufferAttribute, LatheGeometry, Mesh, MeshStandardMaterial, Quaternion, Vector2, Vector3 } from 'three'
import type { BufferGeometry, Texture } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { BOSS_HULL_DESIGNS, bossDeckElevation } from './bossHullDesigns'

/** Admission-only armament. Stepped jackets, recessed bores and seated mounting
 * collars are merged into one indexed mesh, sharing one generated metal atlas. */
export function buildBossWeapons(stage: number, paint: Texture) {
  const design = BOSS_HULL_DESIGNS[stage]
  if (!design || design.barrels.length === 0) return null
  const parts: BufferGeometry[] = [], up = new Vector3(0,1,0)
  const direction = new Vector3(), turn = new Quaternion()
  const add = (points: number[][], origin: Vector3, axis: Vector3, boreStart = Infinity) => {
    const geometry = new LatheGeometry(points.map(([r,y]) => new Vector2(r,y)), 20)
    turn.setFromUnitVectors(up,axis)
    geometry.applyQuaternion(turn); geometry.translate(origin.x,origin.y,origin.z)
    const positions = geometry.getAttribute('position'), uv = geometry.getAttribute('uv')
    const colors = new Float32Array(positions.count*3)
    for (let i=0;i<positions.count;i++) {
      // The bore is geometry with a dark interior, not a painted solid cap.
      const shade = i%points.length >= boreStart ? .075 : 1
      colors.set([shade,shade,shade],i*3)
      const phase = Math.floor(i/points.length)/20*Math.PI*2
      // The lower-right atlas tile is a neutral machined jacket, with no
      // painted glow and no transparent texels around a muzzle.
      uv.setXY(i, .51+(Math.cos(phase)*.5+.5)*.48, .01+uv.getY(i)*.48)
    }
    geometry.setAttribute('color',new Float32BufferAttribute(colors,3))
    parts.push(geometry)
  }
  for (const gun of design.barrels) {
    const [x,y]=gun.root, [mx,my]=gun.muzzle, r=gun.radius/512
    const length=Math.hypot(mx-x,my-y)/512
    const deck=bossDeckElevation(design,x/512,y/512)
    const elevation=Math.max(gun.height*.85,deck+r*.55)
    const origin=new Vector3(x/512-.5,.5-y/512,elevation)
    direction.set(mx-x,y-my,0).normalize()
    add([[0,0],[r*.9,0],[r*1.12,length*.08],[r*1.02,length*.18],
      [r*.75,length*.23],[r*.75,length*.66],[r*.9,length*.7],[r*.9,length*.77],
      [r*.72,length*.81],[r*.70,length],[r*.49,length],[r*.49,length*.79],[0,length*.79]],
    origin,direction,10)
    if (gun.mount) {
      // A raised, bevelled bearing descends into the deck under each breech.
      const rise=Math.max(r*.9,elevation-deck+r*.3)
      add([[0,0],[r*1.45,0],[r*1.65,r*.24],[r*1.65,rise*.72],[r*1.3,rise],[0,rise]],
        new Vector3(origin.x,origin.y,deck-r*.12),new Vector3(0,0,1))
    }
  }
  const geometry=mergeGeometries(parts,false)
  for (const part of parts) part.dispose()
  if (!geometry) return null
  geometry.computeBoundingSphere()
  const material=new MeshStandardMaterial({ map:paint,vertexColors:true,roughness:.54,metalness:.28,alphaTest:.15 })
  const mesh=new Mesh(geometry,material)
  mesh.name='boss-armament-v1'
  return mesh
}
