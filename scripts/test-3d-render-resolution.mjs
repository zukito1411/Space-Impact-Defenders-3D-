import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

// Check the real raid viewport profile, not an isolated mock implementation.
const source = readFileSync('src/components/games/raid/graphics.ts', 'utf8')
const body = source.replace(/^import .*\n/gm, '')
const compiled = ts.transpileModule(`
  const MAX_ASTEROIDS = 20
  const MAX_ION_STRIKES = 20
  const MAX_METEORS = 20
  const MAX_RIPPLES = 20
  const MAX_SPARKS = 20
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))
  ${body}
`, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}}).outputText
const art = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'))

globalThis.window = {devicePixelRatio: 3}
try {
  const handset = {clientWidth: 432, clientHeight: 960}
  const maxProfile = art.getRaidGraphicsProfile('max', true, false)
  assert.equal(maxProfile.dprCap, 3)
  assert.equal(art.makeRaidViewportMetrics(handset, 'max', false).dpr, 3,
    'Max graphics should use native 3x DPR for handheld-sized viewports')
  const wide = {clientWidth: 1536, clientHeight: 709}
  const maxWide = art.makeRaidViewportMetrics(wide, 'max', false)
  assert.ok(maxWide.dpr > 2.7 && maxWide.dpr <= 3,
    'Max graphics should improve beyond the former 2x cap')
  assert.ok(maxWide.canvasWidth * maxWide.canvasHeight <= 9_000_000,
    'Do not allocate unconstrained desktop/Android framebuffers')
  const high = art.makeRaidViewportMetrics(wide, 'high', false)
  assert.equal(high.dpr, 1.5, 'Existing High graphics resolution unchanged')
  const large = art.makeRaidViewportMetrics({clientWidth: 3840,clientHeight: 2160}, 'max', false)
  assert.ok(large.canvasWidth * large.canvasHeight <= 9_000_000,
    'Max mode respects the pixel budget on 4K/desktop screens')
} finally {
  delete globalThis.window
}
console.log('3D raid native-pixel ship fidelity and bounded high-DPI canvas passed')
