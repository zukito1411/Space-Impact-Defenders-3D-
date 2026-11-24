import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  AT5_PASS_START, AT5_PASS_DURATION, AT5_RADIUS_KM, AT5_SIGNAL_START,
  AT5_SIGNAL_DURATION, AT5_SIGNAL_LINES, at5DistanceKm, at5SignalOpacity,
  isAt5Campaign,
} from '../src/components/games/raid/stage13At5.ts'

assert.equal(isAt5Campaign(13, 'campaign'), true)
for (const stage of [1, 3, 12, 14, 15]) assert.equal(isAt5Campaign(stage, 'campaign'), false)
for (const mode of ['endless', 'bossRush', undefined]) assert.equal(isAt5Campaign(13, mode), false)
assert.equal(AT5_RADIUS_KM, 1800)
assert.equal(at5DistanceKm(AT5_PASS_START), 112000)
assert.equal(at5DistanceKm(AT5_PASS_START + AT5_PASS_DURATION), 112000)
assert.equal(at5DistanceKm(AT5_PASS_START + AT5_PASS_DURATION / 2), 36000)
for (let age = AT5_PASS_START; age <= AT5_PASS_START + AT5_PASS_DURATION; age++) {
  assert.ok(at5DistanceKm(age) >= AT5_RADIUS_KM * 20, 'moon must remain a distant orbital body')
}
assert.equal(at5SignalOpacity(AT5_SIGNAL_START - .01), 0)
assert.equal(at5SignalOpacity(AT5_SIGNAL_START + 2), 1)
assert.equal(at5SignalOpacity(AT5_SIGNAL_START + AT5_SIGNAL_DURATION), 0)
assert.deepEqual(AT5_SIGNAL_LINES, [
  'UNIDENTIFIED TRANSMISSION',
  'Origin: Uncharted moon',
  'Vessel ID: SM-8',
  'Status: SIGNAL LOST',
  'Last recorded depth: UNKNOWN',
])
const root = new URL('../src/components/games/raid/', import.meta.url)
const source = name => readFileSync(new URL(name, root), 'utf8')
assert.match(source('background.ts'), /isAt5Campaign\(this\.journeyInput\.stageNumber/)
assert.match(source('background.ts'), /AT5_RADIUS_KM \* focal \/ \(globeStyles\.at5\.radius \* at5DistanceKm\(age\)\)/)
assert.match(source('background.ts'), /style !== globeStyles\.adrian && style !== globeStyles\.at5/)
assert.match(source('orbitalSpace.ts'), /this\.surface\.setBloodOcean\(Boolean\(this\.style\.bloodOcean\)\)/)
assert.match(source('orbitalBodies.ts'), /uBloodOcean > \.5/)
assert.match(source('worldStories.ts'), /isAt5Campaign\(stage, campaign \? 'campaign'/)
assert.match(source('worldStories.ts'), /this\.cue !== 'at5:sm8'/)
// Sample the same GLSL height field over an equal-area Fibonacci sphere.
const fract = v => v - Math.floor(v)
const mix = (a,b,t) => a+(b-a)*t
function hash(x,y,z) {
  x=fract(x*.1031); y=fract(y*.1031); z=fract(z*.1031)
  const d=x*(y+33.33)+y*(z+33.33)+z*(x+33.33)
  x+=d; y+=d; z+=d
  return fract((x+y)*z)
}
function noise(x,y,z) {
  const i=Math.floor(x),j=Math.floor(y),k=Math.floor(z)
  let a=fract(x),b=fract(y),c=fract(z)
  a=a*a*(3-2*a); b=b*b*(3-2*b); c=c*c*(3-2*c)
  return mix(
    mix(mix(hash(i,j,k),hash(i+1,j,k),a),mix(hash(i,j+1,k),hash(i+1,j+1,k),a),b),
    mix(mix(hash(i,j,k+1),hash(i+1,j,k+1),a),mix(hash(i,j+1,k+1),hash(i+1,j+1,k+1),a),b),c)
}
const material=source('orbitalBodies.ts')
const globeSource=source('orbitalSpace.ts')
assert.match(globeSource,/at5: \{[^\n]*air: \[\.55,\.14,\.18\][^\n]*thinAtmosphere: true/)
assert.equal((globeSource.match(/thinAtmosphere: true/g) ?? []).length,1,'only AT-5 receives the thin atmosphere')
assert.match(globeSource,/this\.style\.thinAtmosphere \?\? false/)
assert.ok(material.includes('mix(1.018,1.012,uThinAtmosphere)'))
assert.ok(material.includes('r = thinAtmosphere ? 1.012 : 1.018'))
assert.ok(material.includes('.55*smoothstep(0.,.75,incidence)'))
assert.ok(material.includes('u.uThinAtmosphere = thinAtmosphere ? 1 : 0'))
for (const expression of [
  'at5Noise(p*3.1+vec3(11.3,7.1,-4.8))',
  'at5Noise(p*8.4+vec3(-6.2,14.7,9.1))',
  'at5Noise(p*24.5+vec3(17.4,-5.3,2.9))',
  '.64*continent+.25*broken+.11*fine',
  '1.-smoothstep(.623,.643,elevation)',
]) assert.ok(material.includes(expression),'coverage model must match GLSL: '+expression)
const samples=18000
let oceanArea=0
for(let i=0;i<samples;i++){
  const z=1-2*(i+.5)/samples,r=Math.sqrt(1-z*z),a=i*2.399963229728653
  const x=r*Math.cos(a),y=r*Math.sin(a)
  const elevation=.64*noise(x*3.1+11.3,y*3.1+7.1,z*3.1-4.8)
    +.25*noise(x*8.4-6.2,y*8.4+14.7,z*8.4+9.1)
    +.11*noise(x*24.5+17.4,y*24.5-5.3,z*24.5+2.9)
  const blend=Math.max(0,Math.min(1,(elevation-.623)/.020))
  oceanArea+=1-blend*blend*(3-2*blend)
}
const coverage=oceanArea/samples
assert.ok(coverage>=.70 && coverage<=.80,'AT-5 ocean fraction: '+coverage)
console.log('Stage 13 AT-5 encounter assertions passed; sampled ocean coverage '+(coverage*100).toFixed(1)+'%')
