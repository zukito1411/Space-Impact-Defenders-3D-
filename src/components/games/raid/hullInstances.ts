import { DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry, InstancedMesh,
  Mesh, type BufferGeometry, type MeshStandardMaterial, type Object3D } from 'three'

/** Original vertex/index attributes and materials, with one draw per repeated
 * hull. Each actor retains its own registration, pose, eclipse, fade and hit. */
export class HullInstances {
  readonly mesh: InstancedMesh<InstancedBufferGeometry, MeshStandardMaterial>
  private readonly state = new InstancedBufferAttribute(new Float32Array(64 * 3), 3).setUsage(DynamicDrawUsage)
  private count = 0
  private constructor(body: Mesh<BufferGeometry, MeshStandardMaterial>) {
    const source = body.geometry, geometry = new InstancedBufferGeometry()
    geometry.setIndex(source.index)
    for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute)
    geometry.setAttribute('raidHullState', this.state)
    for (const group of source.groups) geometry.addGroup(group.start, group.count, group.materialIndex)
    geometry.setDrawRange(source.drawRange.start, source.drawRange.count)
    this.mesh = new InstancedMesh(geometry, body.material, 64)
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    this.mesh.frustumCulled = false // Individual submissions already passed native view culling.
    this.mesh.matrixAutoUpdate = false
    this.mesh.visible = false; this.mesh.count = 0
  }
  static create(object: Object3D) {
    const bodies: Mesh[] = []
    object.traverse(child => { if (child instanceof Mesh) bodies.push(child) })
    if (bodies.length !== 1 || Array.isArray(bodies[0].material) || !('isMeshStandardMaterial' in bodies[0].material)) return null
    return new HullInstances(bodies[0] as Mesh<BufferGeometry, MeshStandardMaterial>)
  }
  reset() { this.count = 0; this.mesh.visible = false; this.mesh.count = 0 }
  add(body: Mesh, opacity: number, sun: number, hit: number) {
    if (this.count >= 64) return false
    body.updateWorldMatrix(true, false)
    this.mesh.setMatrixAt(this.count, body.matrixWorld)
    this.state.setXYZ(this.count++, opacity, sun, hit)
    body.visible = false
    return true
  }
  present() {
    this.mesh.count = this.count; this.mesh.visible = this.count > 0
    if (!this.count) return
    this.mesh.instanceMatrix.clearUpdateRanges(); this.mesh.instanceMatrix.addUpdateRange(0, this.count * 16)
    this.state.clearUpdateRanges(); this.state.addUpdateRange(0, this.count * 3)
    this.mesh.instanceMatrix.needsUpdate = true; this.state.needsUpdate = true
  }
  destroy() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.dispose() }
}
