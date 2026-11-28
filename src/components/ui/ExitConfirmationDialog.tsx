import { useId } from 'react'
import { getCommandText } from '../../commandText'
import type { LanguageCode } from '../../i18n'
import { GameButton } from './GameButton'
import { GameDialog } from './GameDialog'

export function ExitConfirmationDialog({ language, onConfirm, onCancel }: {
  language: LanguageCode
  onConfirm: () => void
  onCancel: () => void
}) {
  const title = useId()
  const text = getCommandText(language)

  return (
    <GameDialog className="result-overlay result-overlay--confirm-exit" aria-labelledby={title} onDismiss={onCancel}>
      <div className="result-overlay__panel result-overlay__dialog-panel">
        <h2 id={title}>{text.confirmExit}</h2>
        <div className="result-overlay__actions">
          <GameButton tone="danger" onClick={onConfirm}>{text.yes}</GameButton>
          <GameButton data-dialog-initial-focus data-dialog-dismiss onClick={onCancel}>{text.no}</GameButton>
        </div>
      </div>
    </GameDialog>
  )
}
