import { useCallback, useEffect, useRef, useState } from 'react'
import { getAndroidRaidAssetsStatus, getPendingAndroidRaidInstall, installAndroidRaidAssets, observeAndroidRaidInstall } from '../androidAssetDownload'
import { getCommandText } from '../commandText'
import { getRaidText, type LanguageCode } from '../i18n'
import { GameButton } from './ui/GameButton'
import { GameDialog } from './ui/GameDialog'

type Download = { done: number; total: number }

export function AndroidRaidDownloadDialog({ language, onClose, onReady }: {
  language: LanguageCode
  onClose: () => void
  onReady: () => void
}) {
  const command = getCommandText(language)
  const text = getRaidText(language).menu
  const [download, setDownload] = useState<Download | null>(null)
  const [busy, setBusy] = useState(() => Boolean(getPendingAndroidRaidInstall()))
  const [failed, setFailed] = useState(false)
  const [check, setCheck] = useState(0)
  const ready = useRef(onReady)
  ready.current = onReady

  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    const unsubscribe = observeAndroidRaidInstall(({ done, total }) => setDownload({ done, total }))
    return () => { mounted.current = false; unsubscribe() }
  }, [])

  const followDownload = useCallback(async (task: Promise<void>) => {
    setBusy(true)
    try {
      await task
      if (mounted.current) ready.current()
    } catch {
      if (mounted.current) setFailed(true)
    } finally {
      if (mounted.current) setBusy(false)
    }
  }, [])

  useEffect(() => {
    const activeDownload = getPendingAndroidRaidInstall()
    if (activeDownload) { void followDownload(activeDownload); return }
    let active = true
    void getAndroidRaidAssetsStatus().then(status => {
      if (!active) return
      if (status.ready) ready.current()
      else setDownload({ done: 0, total: status.bytes })
    }).catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [check, followDownload])

  const startDownload = () => {
    setFailed(false)
    if (!download) { setCheck(check + 1); return }
    void followDownload(installAndroidRaidAssets())
  }

  const size = (bytes: number) => new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(bytes / 1048576)
  return (
    <GameDialog className="player-name-modal" aria-labelledby="raid-download-title" onDismiss={onClose}>
      <div className="player-name-modal__panel">
        <h2 id="raid-download-title">{command.raidFiles}</h2>
        <p>{failed ? command.raidDownloadFailed : command.raidDownloadDetail}</p>
        {download && (
          <label className="raid-download-progress">
            {busy && <progress max={download.total || 1} value={download.done} aria-label={command.raidFiles} />}
            <span>{busy ? `${size(download.done)} / ` : ''}{size(download.total)} MB</span>
          </label>
        )}
        <div className="result-overlay__actions">
          <GameButton data-dialog-initial-focus tone="primary" disabled={busy || (!download && !failed)} onClick={startDownload}>
            {failed ? command.retry : command.download}
          </GameButton>
          <GameButton data-dialog-dismiss tone="quiet" onClick={onClose}>{text.close}</GameButton>
        </div>
      </div>
    </GameDialog>
  )
}
