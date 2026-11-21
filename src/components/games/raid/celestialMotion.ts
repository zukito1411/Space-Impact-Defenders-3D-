import { sampleStarBrightness } from './starVariability'

const unit = (n: number) => n - Math.floor(n)
const mod = (n: number, span: number) => ((n % span) + span) % span
export type CelestialSample = { x: number; y: number; size: number; alpha: number }
/** Steady, breathing and twinkling points share stable spatial catalogue slots. */
export function sampleCelestialStar(index: number, width: number, height: number, seconds: number,
  atmospheric: boolean, reduced: boolean, out: CelestialSample, brightnessSeconds = seconds) {
  const seed = unit(index * .61803398875 + .071)
  const t = reduced ? 0 : Math.max(0, seconds)
  out.x = atmospheric ? width * (.025 + seed * .95) : mod(seed * (width + 40) - t * width * (.0007 + index % 3 * .0005), width + 40) - 20
  out.y = height * (atmospheric ? .055 + unit(index * .414213 + .11) * .45 : .025 + unit(index * .414213 + .11) * .95)
  if (!atmospheric) {
    // Distant bright stars share a pinhole projection, with a smooth fade
    // while a catalogue point crosses the back of the viewing volume.
    const depth = 3 + mod(index * .731 - t * .025, 12)
    const focal = Math.max(width, height) * .93
    out.x = width * .5 + (seed-.5) * 11 * focal / depth
    out.y = height * .5 + (unit(index * .414213 + .11)-.5) * 11 * focal / depth
  }
  out.size = Math.max(10, Math.min(24, Math.min(width, height) * .025)) * (.65 + unit(index * .729) * .7)
  out.alpha = Math.min(1,(atmospheric ? .43 : .58)*sampleStarBrightness(seed,brightnessSeconds,reduced))
  if (!atmospheric) {
    const depth = mod(index * .731 - t * .025, 12)
    out.alpha *= Math.min(1, depth * 2, (12-depth) * 2)
  }
  return out
}

/** Scene-local transport; paused time and hidden intervals cannot create a resume leap. */
export class CelestialClock {
  seconds = 0
  private previous: number | null = null
  advance(time: number, paused: boolean, reduced: boolean) {
    if (this.previous === null) this.seconds = Math.max(0, time / 1000)
    else if (!paused && !reduced) this.seconds += Math.max(0, Math.min(50, time - this.previous)) / 1000
    this.previous = time
    return reduced ? 0 : this.seconds
  }
  hide() { this.previous = null }
}
