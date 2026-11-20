/** Component positions follow the approved 512px top-view paintings. Heights
 * are fractions of hull span, independent of display size and flight view.
 * This admission-only data is shared with the geometry worker. */
export type BossDeckSection = {
  x: number; y: number; rx: number; ry: number; height: number
  angle?: number; round?: number; inner?: number
}
export type BossBarrel = {
  root: readonly [number, number]; muzzle: readonly [number, number]
  radius: number; height: number; mount?: boolean
}
export type BossHullDesign = {
  sections: BossDeckSection[]; recesses: BossDeckSection[]; barrels: BossBarrel[]
  keel: number
}
const section = (x: number, y: number, rx: number, ry: number, height: number,
  round = 4, angle = 0): BossDeckSection => ({ x, y, rx, ry, height, round, angle })
const barrel = (x: number, y: number, mx: number, my: number, radius: number,
  height: number, mount = true): BossBarrel => ({ root: [x, y], muzzle: [mx, my], radius, height, mount })
const pair = (x: number, y: number, rx: number, ry: number, height: number, round = 4) =>
  [section(x, y, rx, ry, height, round), section(512 - x, y, rx, ry, height, round)]
const twinBarrels = (x: number, y: number, mx: number, my: number, radius: number, height: number) =>
  [barrel(x, y, mx, my, radius, height), barrel(512-x, y, 512-mx, my, radius, height)]

function carrier(stage: number): BossHullDesign {
  const later = stage !== 1
  const sections = [section(256, 245, 70, 178, .115), section(256, 174, 32, 98, .17),
    ...pair(144, 252, 63, 151, .10), ...pair(73, 217, 46, 60, .055),
    ...pair(188, 104, 33, 60, .14), section(256, 86, 40, 43, .19)]
  const recesses = stage === 1 ? [...pair(112, 280, 33, 52, .054)] : []
  const barrels = stage === 1 ? [barrel(256, 402, 256, 477, 19, .09),
    ...twinBarrels(218, 398, 218, 450, 14, .09), ...twinBarrels(185, 385, 185, 425, 12, .085),
    ...twinBarrels(143, 162, 143, 79, 7, .10)]
    : [barrel(256, 397, 256, 473, 14, .12), ...twinBarrels(222, 385, 222, 460, 13, .105),
      ...twinBarrels(190, 373, 190, 443, 12, .09)]
  if (stage === 7) {
    sections.push(...pair(140, 141, 47, 111, .16), section(256, 214, 49, 101, .205))
    recesses.push(...pair(144, 151, 23, 75, .11))
  }
  if (stage === 13) {
    sections.push(...pair(140, 151, 53, 49, .165, 2), section(256, 232, 46, 142, .21),
      ...pair(112, 279, 58, 54, .125))
    recesses.push(...pair(114, 276, 40, 23, .078))
  }
  return { sections, recesses, barrels, keel: later ? .064 : .052 }
}

function orrery(stage: number): BossHullDesign {
  const prism = stage === 8
  const sections = [section(256, 256, 91, 91, prism ? .20 : .17, 2)]
  const recesses = [{ ...section(256, 256, 126, 126, .058, 2), inner: .72 }]
  const barrels: BossBarrel[] = []
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4, c = Math.cos(a), s = Math.sin(a)
    sections.push(section(256+c*151, 256+s*151, 69, prism ? 35 : 46,
      prism ? .105 : .095, 4, a), section(256+c*87, 256+s*87, 27, 31, .132, 4, a))
    // Existing inward tubes are reactor feed conduits. Separate outward
    // batteries sit on the outer pods, with unobstructed radial firing arcs.
    if (!prism) barrels.push(barrel(256+c*183, 256+s*183, 256+c*234, 256+s*234,
      stage === 14 ? 7 : 8, .116))
  }
  return { sections, recesses, barrels, keel: .055 }
}

function reaper(stage: number): BossHullDesign {
  const sections = [section(256, 180, 57, 121, .15), section(256, 124, 39, 55, .185),
    ...pair(121, 209, 49, 66, .09, 2), ...pair(78, 166, 30, 87, .072),
    ...pair(78, 314, 27, 85, .064), ...pair(186, 311, 26, 66, .102)]
  for (let i = 0; i < 4; i++) sections.push(section(256, 90+i*45, 42-i*3, 20, .18-i*.014))
  return { sections, recesses: [], keel: .044, barrels: [
    ...twinBarrels(89, 371, 110, stage === 3 ? 474 : 455, 7, .07),
    ...twinBarrels(185, 328, 176, 396, 8, .105),
  ] }
}

function razor(): BossHullDesign {
  const sections = [section(256, 204, 52, 163, .148), ...pair(131, 179, 48, 52, .116, 2),
    ...pair(147, 320, 32, 82, .105), section(256, 355, 30, 89, .125)]
  for (let i = 0; i < 6; i++) sections.push(section(256, 67+i*33, 34+i*2, 19, .17-i*.007))
  return { sections, recesses: [], keel: .05, barrels: [barrel(256, 357, 256, 423, 8, .13),
    ...twinBarrels(147, 341, 147, 405, 8, .11)] }
}

function fortress(stage: number): BossHullDesign {
  const cathedral = stage === 12
  const sections = [section(256, 257, 107, 108, .108), ...pair(96, 236, 64, 158, .145),
    section(256, 211, 43, 134, cathedral ? .235 : .17), ...pair(119, 93, 35, 64, .175),
    ...pair(174, 316, 37, 56, .12)]
  if (cathedral) sections.push(...pair(114, 170, 28, 110, .225), section(256, 128, 28, 90, .255),
    ...pair(49, 273, 22, 65, .11))
  return { sections, recesses: [section(256, 276, 20, 38, .086)], keel: .072,
    barrels: [...twinBarrels(cathedral ? 123 : 80, 389, cathedral ? 123 : 80, 478, 10, .13),
      ...twinBarrels(cathedral ? 208 : 174, 389, cathedral ? 208 : 174, 478, 10, .125)] }
}

function hydra(): BossHullDesign {
  const sections = [section(256, 194, 67, 100, .155), ...pair(124, 209, 63, 65, .108),
    section(256, 320, 43, 108, .165), ...pair(117, 323, 37, 96, .13)]
  for (let i = 0; i < 5; i++) {
    sections.push(section(256, 237+i*30, 40, 18, .19-i*.009),
      ...pair(117, 238+i*29, 32, 18, .155-i*.007))
  }
  return { sections, recesses: [], keel: .057, barrels: [barrel(256, 417, 256, 491, 11, .12),
    ...twinBarrels(113, 398, 113, 462, 10, .10)] }
}

export const BOSS_HULL_DESIGNS: Readonly<Record<number, BossHullDesign>> = {
  1: carrier(1), 2: orrery(2), 3: reaper(3), 4: razor(), 6: fortress(6),
  7: carrier(7), 8: orrery(8), 9: reaper(9), 11: hydra(), 12: fortress(12),
  13: carrier(13), 14: orrery(14),
}

function coverage(part: BossDeckSection, x: number, y: number) {
  const dx = x-part.x, dy = y-part.y, c = Math.cos(part.angle ?? 0), s = Math.sin(part.angle ?? 0)
  const px = Math.abs((c*dx+s*dy)/part.rx), py = Math.abs((-s*dx+c*dy)/part.ry)
  const n = part.round ?? 4, radius = (px**n+py**n)**(1/n)
  const bevel = Math.max(0, Math.min(1, (1-radius)/.32))
  const inner = part.inner ? Math.max(0,Math.min(1,(radius-part.inner)/.12)) : 1
  return bevel*bevel*(3-2*bevel)*inner
}

/** Deck loft follows armor, machinery and cavities, never painted luminance. */
export function sampleBossDeck(design: BossHullDesign, u: number, v: number) {
  const x=u*512, y=v*512
  let height=.036
  for (const part of design.sections) height=Math.max(height,.036+(part.height-.036)*coverage(part,x,y))
  for (const part of design.recesses) height += (Math.min(height,part.height)-height)*coverage(part,x,y)
  return height
}

/** Match weapon seating and the worker's loft, including the deck datum. */
export function bossDeckElevation(design: BossHullDesign, u: number, v: number, bevel = 1) {
  return .008 + bevel*sampleBossDeck(design,u,v)*.85
}
