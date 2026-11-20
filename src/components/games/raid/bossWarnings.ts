import type { LanguageCode } from '../../../i18n'
import type { Enemy } from './types'

export function bossChargeKind(enemy: Enemy) {
  return enemy.bossKind === 'final' && (enemy.mirageTimer ?? 0) > 0 && enemy.mirageKind
    ? enemy.mirageKind : enemy.bossKind
}

export function bossChargeProgress(enemy: Enemy, fallbackSeconds: number) {
  const duration = enemy.attackAudio?.cue === 'charge' ? enemy.attackAudio.seconds : undefined
  const seconds = duration && Number.isFinite(duration) && duration > 0 ? duration : fallbackSeconds
  return Math.max(0,Math.min(1,1-enemy.chargeTimer/Math.max(.01,seconds)))
}

const labels = {
  en: { danger:'DANGER',beam:'BEAM',sweep:'SWEEPING BEAMS',burst:'AREA BURST',lunge:'TRACKING LUNGE',whip:'TENTACLE STRIKE',bubble:'SEEKING BUBBLE',venom:'VENOM VOLLEY',bite:'BITE ZONE',cloud:'POISON CLOUDS' },
  zh: { danger:'危险',beam:'光束攻击',sweep:'扫射光束',burst:'区域爆发',lunge:'追踪突袭',whip:'触手打击',bubble:'追踪气泡',venom:'毒液齐射',bite:'撕咬区域',cloud:'毒云' },
  ja: { danger:'危険',beam:'ビーム攻撃',sweep:'回転ビーム',burst:'範囲攻撃',lunge:'追尾突進',whip:'触手攻撃',bubble:'追尾バブル',venom:'毒液斉射',bite:'噛みつき範囲',cloud:'毒雲' },
  ko: { danger:'위험',beam:'빔 공격',sweep:'회전 빔',burst:'광역 폭발',lunge:'추적 돌진',whip:'촉수 공격',bubble:'추적 버블',venom:'독액 일제 사격',bite:'물기 구역',cloud:'독 구름' },
}

export function bossChargeLabel(enemy: Enemy, language: LanguageCode) {
  const text = labels[language], kind = bossChargeKind(enemy), pattern = enemy.chargePattern
  const name = kind === 'squid' ? pattern === 'rotate' ? text.bubble : text.whip
    : kind === 'snake' ? pattern === 'cross' ? text.bite : pattern === 'horizontal' ? text.cloud : text.venom
    : kind === 'devil' && pattern === 'cross' ? text.burst
    : kind === 'devil' && pattern === 'diagonal' ? text.lunge
    : pattern === 'rotate' ? text.sweep : text.beam
  return `${text.danger} · ${name} · ${Math.max(0,enemy.chargeTimer).toFixed(1)}s`
}
