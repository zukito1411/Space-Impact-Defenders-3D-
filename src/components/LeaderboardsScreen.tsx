import { useEffect, useMemo, useState } from 'react'
import {
  EMPTY_LEADERBOARDS,
  fetchLeaderboards,
  RAID_LEADERBOARD_MODES,
  type LeaderboardMap,
  type LeaderboardMode,
} from '../leaderboards'
import { getLanguageText, type LanguageCode } from '../i18n'
import { GameButton } from './ui/GameButton'
import { getCommandText } from '../commandText'

type LeaderboardsScreenProps = {
  playerName: string | null
  language: LanguageCode
  onBack: () => void
  onChooseCallsign: () => void
}

export function LeaderboardsScreen({ playerName, language, onBack, onChooseCallsign }: LeaderboardsScreenProps) {
  const text = getLanguageText(language).leaderboards
  const [activeMode, setActiveMode] = useState<LeaderboardMode>('gradius_solo')
  const [leaderboards, setLeaderboards] = useState<LeaderboardMap>({ ...EMPTY_LEADERBOARDS })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const activeModeInfo = useMemo(
    () => RAID_LEADERBOARD_MODES.find((mode) => mode.key === activeMode) ?? RAID_LEADERBOARD_MODES[0],
    [activeMode],
  )
  const activeModeText = text.modes[activeModeInfo.key]
  const activeEntries = leaderboards[activeMode] ?? []
  const playerKey = playerName?.trim().toLowerCase()
  const command = getCommandText(language)

  const loadLeaderboards = async () => {
    setLoading(true)
    setError('')

    try {
      setLeaderboards(await fetchLeaderboards())
    } catch {
      setError(text.unavailable)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadLeaderboards()
  }, [])

  return (
    <div className="leaderboards-screen">
      <div className="leaderboards-screen__stars" />
      <div className="leaderboards-screen__shell">
        <header className="leaderboards-screen__header">
          <GameButton tone="quiet" className="leaderboards-screen__back" onClick={onBack}>
            {text.back}
          </GameButton>
          <div>
            <h1>{text.title}</h1>
            {playerName
              ? <p>{text.signedIn} <strong>{playerName}</strong></p>
              : <GameButton tone="quiet" onClick={onChooseCallsign}>{command.callsign}</GameButton>}
          </div>
          <GameButton className="leaderboards-screen__refresh" onClick={loadLeaderboards} disabled={loading}>
            {loading ? text.syncing : text.refresh}
          </GameButton>
        </header>

        <div className="leaderboards-screen__modes" aria-label="Leaderboard modes">
          {RAID_LEADERBOARD_MODES.map((mode) => (
            <button
              key={mode.key}
              type="button"
              aria-pressed={activeMode === mode.key}
              className={`leaderboards-screen__mode${activeMode === mode.key ? ' leaderboards-screen__mode--active' : ''}`}
              onClick={() => setActiveMode(mode.key)}
            >
              <strong>{text.modes[mode.key].label}</strong>
            </button>
          ))}
        </div>

        <section key={activeMode} className="leaderboards-screen__board" data-menu-scroll tabIndex={0} aria-label={activeModeText.label} aria-live="polite">
          <p className="leaderboards-screen__description">{activeModeText.description}</p>

          {error ? (
            <div className="leaderboards-screen__empty">{error}</div>
          ) : loading ? (
            <div className="leaderboards-screen__empty">{text.loading}</div>
          ) : activeEntries.length === 0 ? (
            <div className="leaderboards-screen__empty">{text.empty}</div>
          ) : (
            <ol className="leaderboards-screen__list">
              {activeEntries.map((entry) => {
                const isPlayer = entry.playerName.trim().toLowerCase() === playerKey

                return (
                  <li
                    key={`${entry.rank}-${entry.playerName}-${entry.score}-${entry.createdAt ?? ''}`}
                    data-rank={entry.rank}
                    className={`leaderboards-screen__row${isPlayer ? ' leaderboards-screen__row--player' : ''}`}
                  >
                    <span className="leaderboards-screen__rank">#{entry.rank}</span>
                    <span className="leaderboards-screen__pilot">
                      <strong>{entry.playerName}</strong>
                      <small>{entry.shipKey ? entry.shipKey : text.commandRun}</small>
                    </span>
                    <span className="leaderboards-screen__stage">
                      {entry.stage !== null && entry.stage !== undefined ? `${text.stage} ${entry.stage}` : text.finalRun}
                    </span>
                    <span className="leaderboards-screen__score">{entry.score.toLocaleString()}</span>
                  </li>
                )
              })}
            </ol>
          )}
        </section>
      </div>
    </div>
  )
}
