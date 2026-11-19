import { Mesh, MeshStandardMaterial, type Object3D } from 'three'

export function rigMechHull(object: Object3D) {
  object.traverse(child => {
    if (!(child instanceof Mesh) || !(child.material instanceof MeshStandardMaterial)) return
    const material = child.material
    const attack = { value: 0 }, crouch = { value: 0 }
    material.userData.attack = attack
    material.userData.crouch = crouch
    material.onBeforeCompile = shader => {
      shader.uniforms.uMechAttack = attack
      shader.uniforms.uMechCrouch = crouch
      shader.vertexShader = 'uniform float uMechAttack, uMechCrouch;\n' + shader.vertexShader
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
        vec3 transformed = position;
        float leg = 1.-smoothstep(-.08,.04,position.y);
        transformed.y += -position.y*.31*leg*uMechCrouch;
        transformed.z += abs(position.y)*.52*leg*uMechCrouch;
        float arm = smoothstep(.13,.28,abs(position.x))*smoothstep(-.1,.04,position.y);
        transformed.y += arm*uMechAttack*.12;
        transformed.z += arm*uMechAttack*.17;
        transformed.x -= sign(position.x)*arm*uMechAttack*.065;
      `)
    }
    material.customProgramCacheKey = () => 'sid-live-mech-rig'
  })
}

export function poseMechHull(object: Object3D, attack: number, crouch: number) {
  object.traverse(child => {
    if (!(child instanceof Mesh) || !(child.material instanceof MeshStandardMaterial)) return
    const { userData } = child.material
    if (userData.attack) userData.attack.value = attack
    if (userData.crouch) userData.crouch.value = crouch
  })
}
