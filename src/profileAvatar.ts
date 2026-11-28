import { getOrCreateStoredPlayerId, hasStoredPlayerName } from './leaderboards'

const STORAGE_PREFIX = 'space-defenders-avatar:'
const AVATAR_SIZE = 192
const MAX_SOURCE_BYTES = 24 * 1024 * 1024

export function getAvatarOwner(): string {
  return hasStoredPlayerName() ? `pilot:${getOrCreateStoredPlayerId()}` : 'guest'
}

export function loadAvatar(owner = getAvatarOwner()): string | null {
  try {
    const picture = window.localStorage.getItem(STORAGE_PREFIX + owner)
    return picture && /^data:image\/(?:webp|png);base64,/.test(picture) ? picture : null
  } catch {
    return null
  }
}

export function saveAvatar(owner: string, picture: string | null) {
  const key = STORAGE_PREFIX + owner
  if (picture) window.localStorage.setItem(key, picture)
  else window.localStorage.removeItem(key)
}

export async function prepareAvatar(file: File): Promise<string> {
  if (file.size > MAX_SOURCE_BYTES || (file.type && (!file.type.startsWith('image/') || file.type === 'image/svg+xml'))) {
    throw new Error('Unsupported profile photo')
  }
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const crop = Math.min(image.naturalWidth, image.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = AVATAR_SIZE
    const context = canvas.getContext('2d')
    if (!crop || !context) throw new Error('Could not read profile photo')
    context.drawImage(image, (image.naturalWidth - crop) / 2, (image.naturalHeight - crop) / 2, crop, crop, 0, 0, AVATAR_SIZE, AVATAR_SIZE)
    return canvas.toDataURL('image/webp', .86)
  } finally {
    URL.revokeObjectURL(url)
  }
}
