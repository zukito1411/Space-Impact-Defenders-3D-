export const HOSTILE_PROJECTILE_COLOR = 'rgba(255,55,154,0.94)'

/** Keep the painted silhouette, opacity and brightness while assigning a hostile hue. */
export function colorHostileProjectilePixels(ctx: CanvasRenderingContext2D) {
  const image = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height)
  for (let i = 0; i < image.data.length; i += 4) {
    if (image.data[i + 3] === 0) continue
    const light = Math.max(image.data[i], image.data[i + 1], image.data[i + 2])
    image.data[i] = light
    image.data[i + 1] = light * (.18 + light * .0012)
    image.data[i + 2] = light * (.59 + light * .0007)
  }
  ctx.putImageData(image, 0, 0)
}
