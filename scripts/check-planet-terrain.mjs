import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'

/** Exercise the actual loaded Pixi scene, including pixel submission, rather
 * than accepting a vertex count as proof that the custom shader rendered. */
export async function checkPlanetTerrain(page, output, landscape) {
  const checks=[]
  for(const stage of [5,10]) {
    const result=await page.evaluate(async({stage,landscape})=>{
      const review=window.campaignReview
      review.reset(stage)
      review.frame(false)
      const bg=review.background, atmosphere=bg.landscapeAtmosphere
      if(!landscape)return {stage,landscape,active:atmosphere.root.visible}
      const terrain=atmosphere.terrain.get(stage===5?'pelagic':'cinder')
      if(!terrain)throw Error('Missing terrain geometry')
      const {projectPlanetFlightPoint,PLANET_FLIGHT_VIEW,PLANET_FLIGHT_ALTITUDE,PLANET_FLIGHT_PERIOD,PLANET_FLIGHT_SPEED}=await import('/src/components/games/raid/planetFlightCamera.ts')
      const {samplePlanetMountain}=await import('/src/components/games/raid/planetTerrainGeometry.ts')
      const [c,s]=PLANET_FLIGHT_VIEW
      const width=atmosphere.frame.width,height=atmosphere.frame.height
      const renderer=bg.app.renderer,probe=document.createElement('canvas')
      probe.width=renderer.canvas.width;probe.height=renderer.canvas.height
      const ctx=probe.getContext('2d',{willReadFrequently:true})
      const pixels=()=>{renderer.render(bg.app.stage);ctx.clearRect(0,0,probe.width,probe.height);ctx.drawImage(renderer.canvas,0,0);return ctx.getImageData(0,0,probe.width,probe.height).data}
      const frames=[]
      for(const seconds of [40,45,PLANET_FLIGHT_PERIOD/PLANET_FLIGHT_SPEED-.001,PLANET_FLIGHT_PERIOD/PLANET_FLIGHT_SPEED+.001]) {
        atmosphere.lastTime=null
        atmosphere.update(height,width,seconds*1000,stage===5?'pelagic':'cinder','max',false,false,0,bg.shipLighting)
        const ground=atmosphere.surface.parameters.uniforms,mesh=terrain.parameters.uniforms
        const visible=pixels()
        terrain.mesh.visible=false
        const hidden=pixels()
        terrain.mesh.visible=true
        let changed=0
        for(let i=0;i<visible.length;i+=4)if(Math.abs(visible[i]-hidden[i])+Math.abs(visible[i+1]-hidden[i+1])+Math.abs(visible[i+2]-hidden[i+2])>9)changed++
        const peak=terrain.peaks.find(peak=>Math.abs(((peak.x-ground.uTravel+PLANET_FLIGHT_PERIOD*1.5)%PLANET_FLIGHT_PERIOD)-PLANET_FLIGHT_PERIOD*.5)<.9)??terrain.peaks[8]
        const point={x:0,y:0,scale:0}
        projectPlanetFlightPoint(peak.x,0,peak.distance,width,height,ground.uTravel,point)
        // Invert the ground camera at a projected terrain foot. Its UV must
        // identify the same world point, including across travel wrap.
        const rayX=(point.x-width/2)/ground.uFocal,rayY=(height/2-point.y)/ground.uFocal
        const depth=PLANET_FLIGHT_ALTITUDE/(c-rayY*s)
        const worldX=rayX*depth+ground.uTravel,worldD=(s+rayY*c)*depth
        const footError=Math.max(Math.abs((worldX-peak.x)/PLANET_FLIGHT_PERIOD-Math.round((worldX-peak.x)/PLANET_FLIGHT_PERIOD)),Math.abs(worldD-peak.distance))
        let anchorError=0
        if(stage===10)for(let i=0;i<atmosphere.vents.length;i++) {
          const vent=atmosphere.vents[i]
          if(!vent.visible)continue
          const peak=terrain.peaks[i]
          projectPlanetFlightPoint(peak.x,samplePlanetMountain(0,0,peak,false),peak.distance,width,height,ground.uTravel,point)
          anchorError=Math.max(anchorError,Math.hypot(vent.x-point.x,vent.y-point.y))
        }
        frames.push({seconds,changed,groundTravel:ground.uTravel,terrainTravel:mesh.uTravel,footError,anchorError})
      }
      const before=atmosphere.seconds
      atmosphere.update(height,width,999000,stage===5?'pelagic':'cinder','max',false,true,0,bg.shipLighting)
      const paused=atmosphere.seconds===before
      atmosphere.lastTime=null
      atmosphere.update(height,width,40000,stage===5?'pelagic':'cinder','max',true,false,0,bg.shipLighting)
      const reduced=atmosphere.surface.parameters.uniforms.uTravel===0&&terrain.parameters.uniforms.uTravel===0
      atmosphere.lastTime=null
      review.frame(false)
      const position=terrain.mesh.geometry.attributes.aPosition.buffer.data
      return {stage,landscape,active:atmosphere.root.visible,vertices:position.length/3,
        triangles:terrain.mesh.geometry.indexBuffer.data.length/3,
        elevated:Array.from(position).some((v,i)=>i%3===1&&v>.1),oldRidges:!!atmosphere.ridges,paused,reduced,frames}
    },{stage,landscape})
    assert.equal(result.active,landscape)
    if(landscape) {
      assert.ok(result.vertices>10000&&result.elevated,'Terrain has no 3D relief')
      assert.equal(result.oldRidges,false,'Old billboard ridges remain')
      assert.equal(result.paused,true,'Terrain advanced while paused')
      assert.equal(result.reduced,true,'Reduced motion ignored')
      for(const frame of result.frames) {
        assert.equal(frame.groundTravel,frame.terrainTravel,'Floor and mountains travel separately')
        assert.ok(frame.changed>500,'Terrain shader did not render visible pixels: '+JSON.stringify(frame))
        assert.ok(frame.footError<.00001,'Terrain slides over the ground')
        assert.ok(frame.anchorError<.001,'Smoke detached from its crater')
      }
    }
    checks.push(result)
  }
  await writeFile(output+'/terrain-'+(landscape?'landscape':'portrait')+'-checks.json',JSON.stringify(checks,null,2))
  console.log('Verified planet terrain',landscape?'landscape':'portrait')
}
