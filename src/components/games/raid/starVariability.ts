const fract = (value: number) => value-Math.floor(value)

/** Independent star populations: steady points, slow breathing, brief twinkles.
 * Brightness stays continuous; stars are never toggled visible/invisible. */
export function sampleStarBrightness(seed: number, seconds: number, reduced = false) {
  const group = fract(seed*91.37), phase = seed*123.45
  const t = Math.max(0,seconds)*(reduced ? .22 : 1)
  let gain = 1
  if (group >= .08 && group < .45) {
    const wave = .5+.5*Math.sin(t*(.48+fract(seed*17.31)*.65)+phase)
    gain = .22+1.18*wave
  } else if (group >= .45) {
    let pulse = .5+.5*Math.sin(t*(1.0+fract(seed*43.17)*1.55)+phase)
    pulse *= pulse;pulse *= pulse
    gain = .12+1.95*pulse
  }
  return 1+(gain-1)*(reduced ? .35 : 1)
}

/** Same inexpensive curves for the batched GPU catalogue. */
export const STAR_VARIABILITY_GLSL = `
float starBrightness(float seed, float seconds, float amount) {
  float group = fract(seed*91.37), phase = seed*123.45;
  float gain = 1.;
  if (group >= .08 && group < .45) {
    float wave = .5+.5*sin(seconds*(.48+fract(seed*17.31)*.65)+phase);
    gain = .22+1.18*wave;
  } else if (group >= .45) {
    float pulse = .5+.5*sin(seconds*(1.+fract(seed*43.17)*1.55)+phase);
    pulse *= pulse; pulse *= pulse;
    gain = .12+1.95*pulse;
  }
  return mix(1.,gain,amount);
}`
