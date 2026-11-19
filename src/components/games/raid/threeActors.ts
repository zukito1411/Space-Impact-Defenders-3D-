import { uploadInstanceRange } from './threeInstanceUpload'
import { ThreeFx } from './threeFx'
import { COMBAT_TILE, getRaidCombatFrame, getRaidExplosionFrame, getRaidProjectileMaterial } from './combatArt'
import { explosionDiameter, impactAlpha, impactFrameProgress } from './combatFeel'
import {
  Color, Group, InstancedMesh, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D,
  RingGeometry, SphereGeometry, type BufferGeometry,
} from 'three'
import { paintedVolume } from './paintedVolume'
import { getCanvasSpriteDimensions, getEliteAlienCanvasSprite, getEnemyCanvasSize, getNormalAlienCanvasSprite } from './assets'
import { drawCachedStageBossBody, drawFinalBossSpriteBody, drawDevilGundamBoss } from './bossRender'
import { drawGenericBossShip } from './genericBossRender'
import { isGpuEnemyShot, isGpuPlayerShot } from './gpuForeground'
import { raidObjectInView } from './visibility'
import type { Enemy, Shot } from './types'
import type { RaidGpuForegroundFrame } from './gpuForeground'

type Batch = { mesh: InstancedMesh<BufferGeometry, MeshStandardMaterial>; count: number; time: { value: number }; lastUse: number }
const shotColors: Partial<Record<Shot['kind'], number>> = {
  laser: 0x7df9ff, rocket: 0xffac52, needle: 0xbef264, homing: 0x99edff,
  orbShot: 0xa855f7, voidShot: 0xc084fc, superShot: 0xfbbf24, plasma: 0xff71a2,
  poisonCloud: 0x84cc16, venomSpit: 0xa8cf42, squidInk: 0xf472b6,
}

/** One instanced draw per admitted enemy material and one pooled projectile draw. */
export class ThreeActors {
  readonly root = new Group()
  private readonly batches = new Map<string, Batch>()
  private readonly preparing = new Set<string>()
  private readonly rendered = new Set<number>()
  private readonly shots = new InstancedMesh(new SphereGeometry(1, 8, 6), new MeshBasicMaterial({ color: 0xffffff }), 4096)
  private readonly rings = new InstancedMesh(new RingGeometry(.82, 1, 48), new MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: .5, depthWrite: false,
  }), 256)
  private readonly effects = new ThreeFx(this.root)
  private readonly pose = new Object3D()
  private readonly color = new Color()
  private disposed = false
  private shotCount = 0
  private ringCount = 0

  constructor() {
    this.shots.instanceMatrix.setUsage(35048)
    this.rings.instanceMatrix.setUsage(35048)
    this.shots.frustumCulled = this.rings.frustumCulled = false
    this.root.add(this.shots, this.rings)
  }

  private key(enemy: Enemy) {
    return enemy.isBoss ? 'boss:' + (enemy.mirageKind && (enemy.mirageTimer ?? 0) > 0 ? enemy.mirageKind : enemy.bossKind) + ':' + (enemy.bossArtStage ?? enemy.variant)
      : (enemy.isMiniBoss ? 'elite:' : 'alien:') + enemy.variant
  }

  private prepare(enemy: Enemy) {
    const key = this.key(enemy)
    if (this.preparing.has(key) || this.batches.has(key)) return
    this.preparing.add(key)
    const blueprint: Enemy = { ...enemy, hp: enemy.maxHp, hitFlash: 0, shieldTime: 0,
      defeatTimer: 0, devilVisualPose: 'idle' }
    const operation = async () => {
      let body: Mesh<BufferGeometry, MeshStandardMaterial>
      if (enemy.isBoss) {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 768
        const ctx = canvas.getContext('2d')!
        ctx.translate(384, 384)
        const kind = enemy.mirageKind && (enemy.mirageTimer ?? 0) > 0 ? enemy.mirageKind : enemy.bossKind
        if (kind === 'squid' || kind === 'snake') drawCachedStageBossBody(ctx, kind, 460, 0)
        else if (kind === 'final') drawFinalBossSpriteBody(ctx, 460, 0, 0)
        else if (kind === 'devil') drawDevilGundamBoss(ctx, blueprint, 460, 0, false)
        else drawGenericBossShip(ctx, blueprint, 0, 0, 460, 0, 1, 1)
        body = await paintedVolume(canvas, 768, 768, 96)
        // The raster includes the original boss's deliberate surrounding space.
        body.geometry.scale(768/460, 768/460, 1)
      } else {
        const sprite = enemy.isMiniBoss ? getEliteAlienCanvasSprite(enemy.variant) : getNormalAlienCanvasSprite(enemy.variant)
        await sprite.ready
        if (!sprite.loaded) throw new Error('Enemy artwork unavailable')
        const image = getCanvasSpriteDimensions(sprite)
        body = await paintedVolume(image.source, image.width, image.height, 56)
      }
      if (this.disposed) {
        body.geometry.dispose(); body.material.map?.dispose(); body.material.dispose()
        return
      }
      const time = { value: 0 }
      if (enemy.isBoss && (enemy.bossKind === 'squid' || enemy.bossKind === 'snake')) {
        const snake = enemy.bossKind === 'snake'
        body.material.onBeforeCompile = shader => {
          shader.uniforms.uOrganicTime = time
          shader.vertexShader = 'uniform float uOrganicTime;\n' + shader.vertexShader
          shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
            vec3 transformed = position;
            float freeEnd = (1.-smoothstep(-.65,.22,position.y));
            transformed.x += sin(position.y*9.+uOrganicTime*2.4)*freeEnd*${snake ? '.065' : '.035'};
            transformed.z += cos(position.x*11.+uOrganicTime*1.8)*freeEnd*.045;
          `)
        }
        body.material.customProgramCacheKey = () => snake ? 'live-snake' : 'live-squid'
      }
      const batch = new InstancedMesh(body.geometry, body.material, enemy.isBoss ? 4 : 512)
      batch.instanceMatrix.setUsage(35048)
      batch.frustumCulled = false
      batch.count = 0
      this.batches.set(key, { mesh: batch, count: 0, time, lastUse: performance.now() })
      this.root.add(batch)
    }
    // One-time contour work is admitted between frames, never in the draw loop.
    const run = () => { void operation().catch(error => console.warn('3D actor preparation:', key, error))
      .finally(() => this.preparing.delete(key)) }
    if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 1000 })
    else setTimeout(run, 0)
  }

  hasEnemy(id: number) { return this.rendered.has(id) }

  update(frame: RaidGpuForegroundFrame) {
    this.rendered.clear()
    for (const batch of this.batches.values()) batch.count = 0
    const width = frame.width, height = frame.height
    for (const enemy of frame.enemies) {
      if (!raidObjectInView(frame.bounds, enemy.x, enemy.y, enemy.radius + 12)) continue
      const batch = this.batches.get(this.key(enemy))
      if (!batch) { this.prepare(enemy); continue }
      if (batch.count >= batch.mesh.instanceMatrix.count) continue
      batch.lastUse = performance.now()
      const size = getEnemyCanvasSize(enemy, width, frame.landscape) * (width > 1100 ? .96 : 1)
      this.pose.position.set(enemy.x * width / 100, height - enemy.y * height / 100, 0)
      this.pose.scale.setScalar(size)
      this.pose.rotation.set(0, Math.max(-.32, Math.min(.32, enemy.vx * .006)), 0)
      if (frame.landscape) this.pose.rotation.y += .30
      if (enemy.isBoss) {
        this.pose.rotation.y = Math.sin(frame.time*.00032)*.10
        this.pose.rotation.z = Math.sin(frame.time*.00021)*.025
      }
      this.pose.updateMatrix()
      batch.mesh.setMatrixAt(batch.count, this.pose.matrix)
      this.color.set((enemy.hitFlash ?? 0) > .03 ? 0xffd7d7 : 0xffffff)
      batch.mesh.setColorAt(batch.count++, this.color)
      this.rendered.add(enemy.id)
    }
    for (const batch of this.batches.values()) {
      batch.time.value = frame.time/1000
      batch.mesh.count = batch.count
      if (batch.count) {
        uploadInstanceRange(batch.mesh.instanceMatrix,batch.count)
        if (batch.mesh.instanceColor) uploadInstanceRange(batch.mesh.instanceColor,batch.count)
      }
    }
    this.shotCount = 0
    this.effects.begin()
    const showShot = (shot: Shot, enemy: boolean) => {
      if (this.shotCount >= 4096 || !raidObjectInView(frame.bounds, shot.x, shot.y, shot.radius + 12)) return
      if (!(enemy ? isGpuEnemyShot(shot, frame.drawAdvancedShotFx) : isGpuPlayerShot(shot, frame.drawAdvancedShotFx))) return
      const illustrated = getRaidProjectileMaterial(shot.kind, enemy)
      if (illustrated) {
        this.effects.draw(illustrated.texture, shot.x*width/100, height-shot.y*height/100,
          illustrated.width*frame.visualScale, illustrated.height*frame.visualScale,
          illustrated.directional ? Math.atan2(-shot.vy*height,shot.vx*width) : frame.time*.0003+shot.id)
      }
      const radius = Math.max(1.2, shot.radius * width / 100)
      const elongate = shot.kind === 'laser' || shot.kind === 'needle' || shot.kind === 'rocket' || shot.kind === 'homing'
      this.pose.position.set(shot.x * width / 100, height - shot.y * height / 100, 8)
      this.pose.scale.set(radius, radius * (elongate ? 3.8 : 1), radius)
      this.pose.rotation.set(0, 0, Math.atan2(-shot.vx, -shot.vy))
      this.pose.updateMatrix()
      this.shots.setMatrixAt(this.shotCount, this.pose.matrix)
      this.color.set(shotColors[shot.kind] ?? (enemy ? 0xff7185 : 0x7df9ff))
      this.shots.setColorAt(this.shotCount++, this.color)
    }
    for (const shot of frame.shots) showShot(shot, false)
    for (const shot of frame.guestShots) showShot(shot, false)
    for (const shot of frame.enemyShots) showShot(shot, true)
    for (let i = 0; i < Math.min(frame.sparks.length, frame.maxSparks); i++) {
      const spark = frame.sparks[i]
      if (this.shotCount >= 4096) break
      this.pose.position.set(spark.x * width/100, height-spark.y*height/100, 10)
      const life = Math.max(0,spark.life/Math.max(.001,spark.maxLife))
      this.effects.draw(getRaidCombatFrame(spark.fragment ? COMBAT_TILE.fragment : COMBAT_TILE.spark),
        spark.x*width/100,height-spark.y*height/100,
        Math.max(5,spark.size*(1.4+life*2)),Math.max(2,spark.size*.7),
        Math.atan2(-spark.vy*height,spark.vx*width),life,spark.color)
      this.pose.scale.setScalar(Math.max(.5,spark.size*.24*life))
      this.pose.rotation.set(0, 0, 0)
      this.pose.updateMatrix()
      this.shots.setMatrixAt(this.shotCount, this.pose.matrix)
      this.color.set(spark.color)
      this.shots.setColorAt(this.shotCount++, this.color)
    }
    this.shots.count = this.shotCount
    uploadInstanceRange(this.shots.instanceMatrix,this.shotCount)
    if (this.shots.instanceColor) uploadInstanceRange(this.shots.instanceColor,this.shotCount)
    this.ringCount = 0
    if (frame.drawRipples) for (let i = 0; i < Math.min(frame.ripples.length, 256, frame.maxRipples); i++) {
      const ripple = frame.ripples[i]
      const progress = 1-ripple.life/Math.max(.001,ripple.maxLife)
      const diameter = explosionDiameter(ripple.size,frame.visualScale,progress)
      this.effects.draw(getRaidExplosionFrame(impactFrameProgress(progress)),ripple.x*width/100,
        height-ripple.y*height/100,diameter,diameter,ripple.id*2.399,impactAlpha(progress))
      const radius = ripple.size*2.7*(.35+progress*1.05)
      this.pose.position.set(ripple.x*width/100, height-ripple.y*height/100, 12)
      this.pose.scale.setScalar(radius)
      this.color.set(ripple.color).multiplyScalar(Math.max(0,ripple.life/Math.max(.001,ripple.maxLife)))
      this.rings.setColorAt(this.ringCount,this.color)
      this.pose.rotation.set(0, 0, 0)
      this.pose.updateMatrix()
      this.rings.setMatrixAt(this.ringCount++, this.pose.matrix)
    }
    this.rings.count = this.ringCount
    uploadInstanceRange(this.rings.instanceMatrix,this.ringCount)
    if (this.rings.instanceColor) uploadInstanceRange(this.rings.instanceColor,this.ringCount)
    this.effects.end()
    if (this.batches.size > 32) {
      const now = performance.now()
      for (const [key, batch] of this.batches) {
        if (!batch.count && now-batch.lastUse > 6000) {
          batch.mesh.removeFromParent()
          batch.mesh.dispose(); batch.mesh.geometry.dispose()
          batch.mesh.material.map?.dispose(); batch.mesh.material.dispose()
          this.batches.delete(key)
          break
        }
      }
    }
  }

  stats() { return { shots: this.shotCount, textures: this.batches.size, particles: this.ringCount, bossTextureMB: 0 } }

  destroy() {
    this.disposed = true
    this.effects.destroy()
    for (const batch of this.batches.values()) {
      batch.mesh.dispose(); batch.mesh.geometry.dispose()
      batch.mesh.material.map?.dispose(); batch.mesh.material.dispose()
    }
    for (const mesh of [this.shots, this.rings]) {
      mesh.dispose(); mesh.geometry.dispose(); mesh.material.dispose()
    }
    this.root.removeFromParent()
    this.batches.clear()
  }
}
