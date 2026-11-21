import { Texture } from 'pixi.js'

/** Locate compact stellar highlights once during loading. R holds their share
 * of the painted light; GB stores one phase per connected highlight. Diffuse
 * galaxy light and long ring/filament structures are left alone. */
export function createPaintedStarMap(texture: Texture): Texture | undefined {
  if (typeof document === 'undefined') return
  const canvas = document.createElement('canvas')
  const w = texture.source.width, h = texture.source.height
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d',{willReadFrequently:true})
  if (!ctx) return
  try {
    ctx.drawImage(texture.source.resource as CanvasImageSource,0,0,w,h)
    const image = ctx.getImageData(0,0,w,h), pixels = image.data
    const stride = w+1, integral = new Float32Array(stride*(h+1))
    const luma = new Float32Array(w*h)
    for (let y=0;y<h;y++) {
      let sum = 0
      for (let x=0;x<w;x++) {
        const i=y*w+x, p=i*4
        luma[i] = (.2126*pixels[p]+.7152*pixels[p+1]+.0722*pixels[p+2])*pixels[p+3]/255
        sum += luma[i]
        integral[(y+1)*stride+x+1] = integral[y*stride+x+1]+sum
      }
    }
    for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
      const i=y*w+x, p=i*4
      const x0=Math.max(0,x-8),x1=Math.min(w,x+9),y0=Math.max(0,y-8),y1=Math.min(h,y+9)
      const background = (integral[y1*stride+x1]-integral[y0*stride+x1]-integral[y1*stride+x0]+integral[y0*stride+x0])/((x1-x0)*(y1-y0))
      pixels[p] = Math.min(255,Math.max(0,(luma[i]-background-2)/Math.max(12,luma[i])*340))
      if (pixels[p]<8) pixels[p]=0
      pixels[p+1]=0; pixels[p+2]=0; pixels[p+3]=255
    }
    const visited = new Uint8Array(w*h), queue = new Uint32Array(w*h)
    for (let start=0;start<visited.length;start++) {
      if (visited[start] || pixels[start*4] < 8) continue
      let head=0,tail=1,minX=w,maxX=0,minY=h,maxY=0
      queue[0]=start;visited[start]=1
      while (head<tail) {
        const i=queue[head++],x=i%w,y=Math.floor(i/w)
        minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y)
        for (let direction=0;direction<4;direction++) {
          if (direction===0 && x===0 || direction===1 && x===w-1 || direction===2 && y===0 || direction===3 && y===h-1) continue
          const n=i+(direction===0 ? -1 : direction===1 ? 1 : direction===2 ? -w : w)
          if (!visited[n] && pixels[n*4]>=8) { visited[n]=1;queue[tail++]=n }
        }
      }
      const compact = tail<=256 && maxX-minX<=32 && maxY-minY<=32
      const seed = (Math.imul(start+1,2654435761)>>>0)&65535
      for (let j=0;j<tail;j++) {
        const p=queue[j]*4
        if (!compact) pixels[p]=0
        pixels[p+1]=seed&255;pixels[p+2]=seed>>>8
      }
    }
    ctx.putImageData(image,0,0)
    const map = Texture.from(canvas)
    map.source.scaleMode='nearest';map.source.autoGenerateMipmaps=false
    return map
  } catch { return } // optional highlight decomposition cannot block original art
}
