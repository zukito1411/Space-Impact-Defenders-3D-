import type { DestructionParticle } from './destructionEffects'
import { Color, type MeshStandardMaterial } from 'three'
import type { Player, Ripple, Shot } from './types'
import { getWeaponIgnition, sampleRaidMuzzleFlash, type RaidMuzzleFlash } from './weaponPresentation'

export type CombatLightInput = {
  destructionEffects?: readonly DestructionParticle[]
  time: number; paused: boolean; ripples: readonly Ripple[]; shots: readonly Shot[]
  muzzles: readonly RaidMuzzleFlash[]
  deepSpace?: boolean
}
/** Four analytic light lobes, evaluated inside existing hull draws. No shadow
 * maps, extra light objects, postprocessing or light-dependent shader variants. */
export class CombatLightField {
  readonly positions = {value:new Float32Array(16)}
  readonly colors = {value:new Float32Array(16)}
  private count=0
  private readonly selected=new Int32Array(3)
  private readonly scores=new Float32Array(3)
  private readonly color=new Color()
  update(width: number, height: number, input?: CombatLightInput) {
    this.count=0;this.positions.value.fill(0);this.colors.value.fill(0)
    if (!input) return
    // Delayed core/partial failures light nearby hulls at the actual blast,
    // rather than emitting an early explosion just to drive the lighting.
    let blast:DestructionParticle|undefined,blastScore=0
    for(const particle of input.destructionEffects ?? []) {
      if(particle.kind!=='explosion')continue
      const score=particle.width*(1-particle.progress)**2
      if(score>blastScore){blast=particle;blastScore=score}
    }
    if(blast && this.count<4)this.add(blast.x*width/100,height-blast.y*height/100,30,
      Math.max(65,Math.min(300,blast.width*1.25)),1,.42,.12,2.6*(1-blast.progress)**2)
    // Reserve up to two of the existing four lights for firing pilots.
    let firstPilot: Player | undefined
    if (!input.paused) for (let i = input.muzzles.length - 1; i >= 0; i--) {
      const muzzle = input.muzzles[i]
      const age = sampleRaidMuzzleFlash(input.time, muzzle)
      if (age >= 1 || muzzle.owner.hp <= 0 || muzzle.owner === firstPilot) continue
      const style = getWeaponIgnition(muzzle.kind)
      const [red, green, blue] = style.rgb
      this.add((muzzle.owner.x + muzzle.x) * width / 100, height - (muzzle.owner.y + muzzle.y) * height / 100,
        20, style.size * 1.35, red, green, blue, (1 - age) ** 1.5 * (input.deepSpace ? 3.4 : 1.9))
      if (firstPilot) break
      firstPilot = muzzle.owner
    }
    this.selected.fill(-1);this.scores.fill(0)
    for(let i=input.ripples.length-1;i>=0;i--){
      const r=input.ripples[i],age=1-r.life/Math.max(.001,r.maxLife)
      if(age<0 || age>.68 || r.size<5 || r.x< -5 || r.x>105 || r.y< -5 || r.y>105)continue
      const score=r.size*(1-age)*(1-age)
      for(let slot=0;slot<3;slot++)if(score>this.scores[slot]){
        for(let j=2;j>slot;j--){this.selected[j]=this.selected[j-1];this.scores[j]=this.scores[j-1]}
        this.selected[slot]=i;this.scores[slot]=score;break
      }
    }
    for(const index of this.selected){
      if(index<0 || this.count>=4)break
      const r=input.ripples[index],age=1-r.life/Math.max(.001,r.maxLife)
      this.color.set(r.color)
      this.add(r.x*width/100,height-r.y*height/100,36,Math.max(65,Math.min(270,r.size*12)),
        this.color.r,this.color.g,this.color.b,2.5*Math.exp(-age*6))
    }
    for (let i=input.shots.length-1;i>=0 && this.count<4;i--) {
      const s=input.shots[i]
      if (s.kind!=='rocket' && s.kind!=='homing' || s.y<0 || s.y>100) continue
      const warm=s.kind==='rocket'
      this.add(s.x*width/100,height-s.y*height/100,14,58,warm?1:.2,warm?.38:.65,warm?.08:1,.7)
    }
  }
  private add(x:number,y:number,z:number,r:number,red:number,green:number,blue:number,power:number) {
    const i=this.count++*4
    const positions=this.positions.value,colors=this.colors.value
    positions[i]=x;positions[i+1]=y;positions[i+2]=z;positions[i+3]=r
    colors[i]=red;colors[i+1]=green;colors[i+2]=blue;colors[i+3]=power
  }
}

export function bindCombatLighting(material: MeshStandardMaterial, field: CombatLightField) {
  const previous=material.onBeforeCompile, key=material.customProgramCacheKey()
  material.onBeforeCompile=(shader,renderer)=>{
    previous.call(material,shader,renderer)
    shader.uniforms.raidBlastPositions=field.positions;shader.uniforms.raidBlastColors=field.colors
    shader.vertexShader='varying vec3 raidWorldPoint;\n'+shader.vertexShader
    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`
      #include <project_vertex>
      vec4 raidWorld = vec4(transformed,1.);
      #ifdef USE_INSTANCING
        raidWorld = instanceMatrix*raidWorld;
      #endif
      raidWorldPoint = (modelMatrix*raidWorld).xyz;
    `)
    shader.fragmentShader='varying vec3 raidWorldPoint;\nuniform vec4 raidBlastPositions[4], raidBlastColors[4];\n'+shader.fragmentShader
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`
      #include <lights_fragment_end>
      for(int raidLight=0;raidLight<4;raidLight++) {
        vec4 source=raidBlastPositions[raidLight];
        if(source.w>0.) {
          vec3 delta=source.xyz-raidWorldPoint;
          float range=max(0.,1.-dot(delta,delta)/(source.w*source.w));
          vec3 direction=normalize(mat3(viewMatrix)*delta);
          float incidence=max(0.,dot(normal,direction));
          reflectedLight.directDiffuse += diffuseColor.rgb*raidBlastColors[raidLight].rgb*
            raidBlastColors[raidLight].a*range*range*incidence;
        }
      }
    `)
  }
  material.customProgramCacheKey=()=>key+':local-blast-v1'
}
