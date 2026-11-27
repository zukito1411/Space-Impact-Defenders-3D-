import type { LanguageCode } from '../../i18n'
import { useControllerConnected } from '../../controllers'

const LABELS = {
  en: { navigate: 'Navigate', select: 'Select', back: 'Back', move: 'Move', special: 'Special', pause: 'Pause' },
  zh: { navigate: '选择', select: '确认', back: '返回', move: '移动', special: '特殊攻击', pause: '暂停' },
  ja: { navigate: '移動', select: '決定', back: '戻る', move: '移動', special: '特殊攻撃', pause: '一時停止' },
  ko: { navigate: '이동', select: '선택', back: '뒤로', move: '이동', special: '특수 공격', pause: '일시 정지' },
}

export function GameMenuHints({ language, showBack = true }: { language: LanguageCode; showBack?: boolean }) {
  const text = LABELS[language]
  const connected = useControllerConnected()
  return (
    <div className="game-menu-hints">
      <span><kbd>{connected ? 'D-pad' : '↑ ↓'}</kbd>{text.navigate}</span>
      <span><kbd>{connected ? 'A / ×' : '↵'}</kbd>{text.select}</span>
      {showBack && <span><kbd>{connected ? 'B / ○' : 'Esc'}</kbd>{text.back}</span>}
    </div>
  )
}


export function ControllerFlightHints({ language }: { language: LanguageCode }) {
  const connected = useControllerConnected()
  if (!connected) return null
  const text = LABELS[language]
  return (
    <div className="game-menu-hints">
      <span><kbd>LS / D-pad</kbd>{text.move}</span>
      <span><kbd>RB / R1</kbd>{text.special}</span>
      <span><kbd>Menu / Options</kbd>{text.pause}</span>
    </div>
  )
}
