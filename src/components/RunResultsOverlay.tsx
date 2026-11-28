import { RaidShipSprite, useLandscapeScreen } from './games/RaidShipSprite'
import { getLanguageText, getRaidText, getReleaseText, type LanguageCode } from '../i18n'
import type { ProgressUpdate, RunResult } from '../progression'
import { GameButton } from './ui/GameButton'
import { GameDialog } from './ui/GameDialog'
import { getCommandText } from '../commandText'
import { useState } from 'react'
import { PagedItems } from './ui/PagedItems'

type RunResultsOverlayProps = {
  result: RunResult
  update: ProgressUpdate
  language: LanguageCode
  onClose: () => void
  onRetry?: () => void
}

export function RunResultsOverlay({ result, update, language, onClose, onRetry }: RunResultsOverlayProps) {
  const landscape = useLandscapeScreen()
  const [section, setSection] = useState<'summary' | 'pilots' | 'rewards'>('summary')
  const text = getReleaseText(language)
  const modeText = getLanguageText(language).leaderboards.modes[result.mode]
  const raidText = getRaidText(language)
  const statusLabel = result.status === 'victory' ? text.victory : result.status === 'gameover' ? text.gameover : text.exit
  const shipName = result.shipKey ? raidText.ships[result.shipKey as keyof typeof raidText.ships]?.name : null
  const hasPilots = Boolean(result.pilots?.length)
  const scoreDisplay = result.teamScore ?? result.score
  const mvpPilot = result.pilots?.reduce((best, pilot) => (pilot.score > best.score ? pilot : best), result.pilots[0])
  const completedMissions = update.completedMissions.map((id) => text.missionsMap[id].title)
  const unlocks = [
    ...update.unlockedAchievements.map((id) => text.achievementsMap[id].title),
    ...update.unlockedCodex.map((id) => text.codexMap[id].title),
    ...(update.shipLevelUp && update.shipLevel ? [`${text.shipMastery} ${update.shipLevel}`] : []),
  ]

  const rewardPages = Array.from({ length: Math.max(1, Math.ceil(Math.max(unlocks.length, completedMissions.length) / 2)) }, (_, page) => ({
    unlocks: unlocks.slice(page * 2, page * 2 + 2),
    missions: completedMissions.slice(page * 2, page * 2 + 2),
  }))

  return (
    <GameDialog className={`result-overlay result-overlay--${result.status}`} aria-labelledby="result-title" onDismiss={onClose}>
      <div className="result-overlay__panel">
        <div className="result-overlay__hero">
          <RaidShipSprite className="result-overlay__ship" shipKey={result.visualShipKey ?? result.shipKey ?? 'dreadnought'} size={96} sideView={landscape} />
          <span>{modeText.title} {modeText.label}</span>
          <h2 id="result-title">{statusLabel}</h2>
          <div className="result-overlay__score"><small>{result.teamScore != null ? text.teamScore : text.score}</small><strong>{scoreDisplay.toLocaleString()}</strong></div>
        </div>

        <div className="result-overlay__report">
          {section === 'summary' && (
            <>
              <div className="result-overlay__stats">
                <div><b>{text.stage}</b><strong>{result.stage}</strong></div>
                {typeof result.wave === 'number' ? <div><b>{text.wave}</b><strong>{result.wave}</strong></div> : null}
                <div><b>{text.duration}</b><strong>{formatDuration(result.durationMs ?? 0)}</strong></div>
                {result.difficulty ? <div><b>{text.difficulty}</b><strong>{formatDifficulty(result.difficulty)}</strong></div> : null}
                {mvpPilot ? <div><b>{text.mvpPilot}</b><strong>{mvpPilot.label} - {mvpPilot.score.toLocaleString()}</strong></div> : null}
                {shipName ? <div><b>{text.ship}</b><strong>{shipName}</strong></div> : null}
                <div><b>{text.enemies}</b><strong>{result.enemiesDestroyed ?? 0}</strong></div>
                <div><b>{text.bosses}</b><strong>{result.bossesDefeated ?? 0}</strong></div>
                <div><b>{text.pickups}</b><strong>{result.pickupsCollected ?? 0}</strong></div>
              </div>
              {rewardPages.length > 1 && (
                <p className="result-overlay__reward-count">
                  {text.newUnlocks} · {unlocks.length} &nbsp; {text.missionsCompleted} · {completedMissions.length}
                </p>
              )}
            </>
          )}
          {(section === 'rewards' || (section === 'summary' && rewardPages.length === 1)) && (
            <PagedItems items={rewardPages} size={1} copy={text.cutsceneArchive}>
              {([page]) => (
                <div className="result-overlay__rewards">
                  {(page.unlocks.length > 0 || unlocks.length === 0) && (
                    <section className="result-overlay__unlocks">
                      <h3>{text.newUnlocks}{unlocks.length > 1 && ` · ${unlocks.length}`}</h3>
                      {page.unlocks.length > 0
                        ? <ul>{page.unlocks.map((unlock, index) => <li key={index}>{unlock}</li>)}</ul>
                        : <p>{text.noNewUnlocks}</p>}
                    </section>
                  )}
                  {page.missions.length > 0 && (
                    <section className="result-overlay__unlocks result-overlay__missions">
                      <h3>{text.missionsCompleted}{completedMissions.length > 1 && ` · ${completedMissions.length}`}</h3>
                      <ul>{page.missions.map((mission, index) => <li key={index}>{mission}</li>)}</ul>
                    </section>
                  )}
                </div>
              )}
            </PagedItems>
          )}
          {section === 'pilots' && result.pilots?.length ? (
            <section className="result-overlay__pilots">
              <h3>{text.pilotBreakdown}</h3>
              <div className="result-overlay__pilot-grid">
                {result.pilots.map((pilot) => {
                  const pilotShipName = raidText.ships[pilot.shipKey as keyof typeof raidText.ships]?.name ?? pilot.shipKey
                  const hull = `${Math.max(0, Math.ceil(pilot.hp))}/${Math.max(1, Math.ceil(pilot.maxHp))}`
                  return (
                    <article key={pilot.label} className="result-overlay__pilot-card">
                      <span>{pilot.label}</span>
                      <strong>{pilot.name}</strong>
                      <dl>
                        <div><dt>{text.ship}</dt><dd>{pilotShipName}</dd></div>
                        <div><dt>{text.score}</dt><dd>{pilot.score.toLocaleString()}</dd></div>
                        <div><dt>{text.hull}</dt><dd>{hull}</dd></div>
                      </dl>
                    </article>
                  )
                })}
              </div>
            </section>
          ) : null}
        </div>

        <div className="result-overlay__actions">
          {hasPilots && (
            <GameButton tone="quiet" aria-pressed={section === 'pilots'} onClick={() => setSection(section === 'pilots' ? 'summary' : 'pilots')}>
              {section === 'pilots' ? text.compactSections.summary : text.pilotBreakdown}
            </GameButton>
          )}
          {rewardPages.length > 1 && (
            <GameButton tone="quiet" aria-pressed={section === 'rewards'} onClick={() => setSection(section === 'rewards' ? 'summary' : 'rewards')}>
              {section === 'rewards' ? text.compactSections.summary : text.compactSections.rewards}
            </GameButton>
          )}
          {onRetry && <GameButton tone="primary" data-dialog-initial-focus onClick={onRetry}>{getCommandText(language).retry}</GameButton>}
          <GameButton data-dialog-dismiss tone={onRetry ? 'secondary' : 'primary'} onClick={onClose}>{text.continue}</GameButton>
        </div>
      </div>
    </GameDialog>
  )
}

function formatDuration(durationMs: number) {
  const seconds = Math.max(0, Math.round(durationMs / 1000))
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  if (minutes <= 0) return `${remainder}s`
  return `${minutes}m ${remainder.toString().padStart(2, '0')}s`
}

function formatDifficulty(difficulty: RunResult['difficulty']) {
  if (!difficulty) return ''
  return difficulty.charAt(0).toUpperCase() + difficulty.slice(1)
}

