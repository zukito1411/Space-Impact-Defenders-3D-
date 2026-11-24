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
console.log('Stage 13 AT-5 encounter assertions passed')
