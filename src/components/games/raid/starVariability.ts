const fract = (value: number) => value-Math.floor(value)

/** Every point breathes and twinkles independently, without visibility toggles. */
export function sampleStarBrightness(seed: number, seconds: number, reduced = false) {
  const phase = seed*123.45
  const t = Math.max(0,seconds)*(reduced ? .22 : 1)
  const breath = .5+.5*Math.sin(t*(.65+fract(seed*17.31)*.75)+phase)
  let pulse = .5+.5*Math.sin(t*(1.35+fract(seed*43.17)*1.65)+phase*1.73)
  pulse *= pulse;pulse *= pulse
  const gain = .08+.52*breath+(1.65+fract(seed*91.37)*1.4)*pulse
  return 1+(gain-1)*(reduced ? .35 : 1)
}

/** Keep the CPU sprite layers and the batched GPU catalogue in agreement. */
export const STAR_VARIABILITY_GLSL = `
float starBrightness(float seed, float seconds, float amount) {
  float phase = seed*123.45;
  float breath = .5+.5*sin(seconds*(.65+fract(seed*17.31)*.75)+phase);
  float pulse = .5+.5*sin(seconds*(1.35+fract(seed*43.17)*1.65)+phase*1.73);
  pulse *= pulse; pulse *= pulse;
  float gain = .08+.52*breath+(1.65+fract(seed*91.37)*1.4)*pulse;
  return mix(1.,gain,amount);
}`
