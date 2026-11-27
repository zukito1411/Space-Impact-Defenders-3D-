import type { LanguageCode } from '../../../i18n'
import { BOSS_FX, drawBossFx } from './combatArt'
import { CHALLENGE_NOTICE_SECONDS, getCruiseChallengeTarget, RELAY_GATE_COUNT, RELAY_GATE_SECONDS, SALVAGE_LOCK_SECONDS, SALVAGE_SECONDS, type CruiseChallenge } from './cruiseChallenge'

const copy = {
  en: { relay: 'Relay Gates', salvage: 'Salvage Beacon', gate: 'Fly through 3 gates', hold: 'Stay inside the field', shield: 'Shield charged', repair: 'Salvage secured', missed: 'Signal lost' },
  zh: { relay: '中继航门', salvage: '打捞信标', gate: '飞过 3 道航门', hold: '留在信标范围内', shield: '护盾已充能', repair: '打捞成功', missed: '信号丢失' },
  ja: { relay: 'リレーゲート', salvage: '回収ビーコン', gate: 'ゲートを3つ通過', hold: 'フィールド内に留まる', shield: 'シールド補充', repair: '回収完了', missed: '信号消失' },
  ko: { relay: '중계 관문', salvage: '회수 신호기', gate: '관문 3개 통과', hold: '범위 안에서 유지', shield: '보호막 충전', repair: '회수 완료', missed: '신호 끊김' },
} satisfies Record<LanguageCode, Record<string, string>>

export function drawCruiseChallengeTarget(ctx: CanvasRenderingContext2D, challenge: CruiseChallenge,
  toX: (value: number) => number, toY: (value: number) => number, reducedMotion: boolean) {
  if (challenge.outcome) return
  const target = getCruiseChallengeTarget(challenge)
  const x = toX(target.x), y = toY(target.y)
  const rx = toX(target.radius), ry = toY(target.radius)
  const relay = challenge.kind === 'relay'
  const ready = challenge.age >= CHALLENGE_NOTICE_SECONDS
  const coverage = relay ? 1 - challenge.gateAge / RELAY_GATE_SECONDS : challenge.signal / SALVAGE_LOCK_SECONDS
  const span = Math.min(rx, ry) * (relay ? 3.55 : 3.2)
  const pulse = reducedMotion ? .68 : .64 + Math.cos(challenge.age * 5) * .14
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  drawBossFx(ctx, relay ? BOSS_FX.precision : BOSS_FX.pulse, x, y, span, span, ready ? pulse : .32, 0, true)
  ctx.globalAlpha *= ready ? .94 : .48
  ctx.strokeStyle = relay ? '#84e7ff' : '#fbd488'
  ctx.fillStyle = relay ? 'rgba(38,149,227,.1)' : 'rgba(242,157,61,.14)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  if (ready && coverage > 0) {
    ctx.lineWidth = 3.5
    ctx.beginPath()
    ctx.ellipse(x, y, rx, ry, 0, -Math.PI / 2, (coverage * 2 - .5) * Math.PI)
    ctx.stroke()
  }
  ctx.restore()
}

export function drawCruiseChallengeStatus(ctx: CanvasRenderingContext2D, challenge: CruiseChallenge, width: number, y: number, language: LanguageCode) {
  if (challenge.outcome && challenge.age - (challenge.outcomeAge ?? challenge.age) >= 2.4) return
  const labels = copy[language] ?? copy.en
  const title = labels[challenge.kind]
  const relay = challenge.kind === 'relay'
  const detail = challenge.outcome === 'missed' ? labels.missed : challenge.outcome === 'complete'
    ? relay ? labels.shield : labels.repair : relay ? labels.gate : labels.hold
  const meter = relay
    ? `${challenge.gate}/${RELAY_GATE_COUNT}`
    : `${Math.round(challenge.signal / SALVAGE_LOCK_SECONDS * 100)}%`
  const seconds = Math.ceil(Math.max(0, relay
    ? RELAY_GATE_SECONDS - challenge.gateAge : SALVAGE_SECONDS - Math.max(0, challenge.age - CHALLENGE_NOTICE_SECONDS)))
  const status = challenge.outcome ? detail : `${detail}  ·  ${meter}  ·  ${seconds}s`
  const panelWidth = Math.min(width * .84, 290)

  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = 'rgba(5,14,29,.9)'
  ctx.fillRect((width - panelWidth) / 2, y, panelWidth, 43)
  ctx.fillStyle = relay ? '#94e9ff' : '#ffdb98'
  ctx.font = 'bold 13px system-ui, sans-serif'
  ctx.fillText(title, width / 2, y + 12, panelWidth - 16)
  ctx.font = '12px system-ui, sans-serif'
  ctx.fillStyle = '#e2e8f0'
  ctx.fillText(status, width / 2, y + 30, panelWidth - 16)
  ctx.restore()
}
