import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'

interface Progress {
  done: number
  total: number
  message: string
}

const assets = registerPlugin<{
  status(): Promise<{ ready: boolean; bytes: number }>
  prepare(): Promise<void>
  addListener(name: 'progress', listener: (progress: Progress) => void): Promise<PluginListenerHandle>
}>('GameAssets')

let installation: Promise<void> | null = null
let latestProgress: Progress | null = null
const observers = new Set<(progress: Progress) => void>()

export const needsNativeRaidAssets = () => Capacitor.getPlatform() === 'android'

export async function getAndroidRaidAssetsStatus() {
  return needsNativeRaidAssets() ? assets.status() : { ready: true, bytes: 0 }
}

export function getPendingAndroidRaidInstall() {
  return installation
}

export function observeAndroidRaidInstall(observer: (progress: Progress) => void) {
  observers.add(observer)
  if (latestProgress) observer(latestProgress)
  return () => { observers.delete(observer) }
}

export function installAndroidRaidAssets() {
  installation ??= (async () => {
    const listener = await assets.addListener('progress', progress => {
      latestProgress = progress
      for (const notify of observers) notify(progress)
    })
    try {
      await assets.prepare()
    } finally {
      await listener.remove().catch(() => {})
    }
  })().finally(() => {
    installation = null
    latestProgress = null
  })
  return installation
}
