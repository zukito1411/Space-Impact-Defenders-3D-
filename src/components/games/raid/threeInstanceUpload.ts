import type { BufferAttribute } from 'three'

/** Upload only the active prefix of a reusable instance buffer. */
export function uploadInstanceRange(attribute: BufferAttribute, count: number) {
  if (!count) return
  attribute.clearUpdateRanges()
  attribute.addUpdateRange(0, count*attribute.itemSize)
  attribute.needsUpdate = true
}
