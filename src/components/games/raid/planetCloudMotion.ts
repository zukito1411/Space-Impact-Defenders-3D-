const mod=(n:number,span:number)=>((n%span)+span)%span

/** Independent wind layers share scene time, not steering or ground UVs.
 * Wrap only after the entire cloud has left the viewport. */
export function planetCloudX(index:number,seconds:number,width:number,cloudWidth:number,mist=false) {
  const padding=Math.max(width*.2,cloudWidth*.6)
  const span=width+padding*2
  const seed=mist?.28+index*.48:.16+index*.217
  const rate=mist?.011+index*.005:.018+index%3*.010+Math.floor(index/3)*.001
  return mod(seed*span-Math.max(0,seconds)*width*rate,span)-padding
}
