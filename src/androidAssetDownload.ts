import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { getCommandText } from './commandText'
import { getInitialLanguage } from './i18n'

const assets = registerPlugin<{
  status(): Promise<{ ready: boolean; bytes: number }>
  prepare(): Promise<void>
  addListener(name: 'progress', listener: (progress: { done: number; total: number }) => void): Promise<PluginListenerHandle>
}>('GameAssets')

export async function prepareAndroidAssets() {
  if (Capacitor.getPlatform() !== 'android') return
  const status = await assets.status().catch(() => null)
  if (status?.ready) return

  const language = getInitialLanguage()
  const text = getCommandText(language)
  const format = new Intl.NumberFormat(language, { maximumFractionDigits: 1 })
  const size = (bytes: number) => `${format.format(bytes / 1_000_000)} MB`
  const panel = document.createElement('section')
  panel.className = 'startup-error startup-download'
  panel.setAttribute('aria-label', text.gameFiles)
  const message = document.createElement('p')
  message.setAttribute('aria-live', 'polite')
  const progress = document.createElement('progress')
  progress.setAttribute('aria-label', text.download)
  progress.hidden = true
  const button = document.createElement('button')
  button.type = 'button'
  panel.append(message, progress, button)

  let downloadBytes = status?.bytes
  let listener: PluginListenerHandle | undefined
  const showPrompt = () => {
    message.textContent = downloadBytes === undefined ? text.assetCheckFailed : text.assetDownloadDetail.replace('{size}', size(downloadBytes))
    button.textContent = downloadBytes === undefined ? text.retry : text.download
  }
  showPrompt()
  const splash = document.getElementById('startup-splash')!
  splash.classList.add('is-downloading')
  splash.append(panel)
  try {
    await new Promise<void>(resolve => {
      button.onclick = async () => {
        button.disabled = true
        try {
          if (downloadBytes === undefined) {
            const current = await assets.status()
            if (current.ready) { resolve(); return }
            downloadBytes = current.bytes
            showPrompt()
            return
          }
          progress.hidden = false
          progress.max = downloadBytes || 1
          progress.removeAttribute('value')
          message.textContent = text.download
          listener ??= await assets.addListener('progress', ({ done, total }) => {
            progress.max = total || 1
            progress.value = done
            message.textContent = `${size(done)} / ${size(total)}`
          })
          await assets.prepare()
          resolve()
        } catch {
          progress.hidden = true
          message.textContent = downloadBytes === undefined ? text.assetCheckFailed : text.assetDownloadFailed
          button.textContent = text.retry
        } finally {
          button.disabled = false
        }
      }
    })
  } finally {
    panel.remove()
    splash.classList.remove('is-downloading')
    await listener?.remove().catch(() => {})
  }
}
