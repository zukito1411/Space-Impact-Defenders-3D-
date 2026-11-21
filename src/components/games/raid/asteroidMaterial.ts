/** Canonical asteroid pigment response shared by hazards, scenery and the belt. */
export const ASTEROID_SURFACE_GLSL = `
vec3 shadeAsteroid(vec3 pigment, vec3 normal, vec3 light, vec3 halfLight) {
  float day = max(0.,dot(normal,light));
  vec3 color = pigment*mix(vec3(.10,.13,.19),vec3(1.22,1.16,1.09),day);
  float glint = pow(max(0.,dot(normal,halfLight)),30.);
  return color+vec3(.22,.20,.17)*glint*day;
}`

/** Normalize pose-wide lighting once on the CPU for both asteroid renderers. */
export function writeOrbitalLight(sun: Float32Array, source: Float32Array, half?: Float32Array) {
  const scale = 1/Math.max(1e-12,Math.hypot(source[0],source[1],source[2]))
  const x = source[0]*scale,y = source[1]*scale,z = source[2]*scale
  sun[0] = x;sun[1] = y;sun[2] = z
  if (half) {
    const rate = 1/Math.max(1e-12,Math.hypot(x,y,z+1))
    half[0] = x*rate;half[1] = y*rate;half[2] = (z+1)*rate
  }
}
