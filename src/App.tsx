import { getRaidSideShipNozzles, getRaidSideShipSpriteUrl } from './components/games/raid/sideArtwork'
import { getRaidBankingNozzles, raidBankingPreviewNozzle } from './components/games/raid/bankingArt'
import { getRaidExhaustScale, getRaidShipNozzles } from './components/games/raid/shipArtwork'
import { getDefaultPlayerVisualShipKey, getRaidGundamName } from './components/games/raid/state'
import { useDoorState, useSpaceDoor } from './components/ui/SpaceDoor'
import { startStudioSplash } from './startupSplash'
import { getCommandText } from './commandText'
import './App.css'
import { GameButton, GameMenuAction } from './components/ui/GameButton'
import { HomeMenuIcon } from './components/ui/HomeMenuIcon'
import { PlayerAvatar } from './components/ui/PlayerAvatar'
import { getAvatarOwner, loadAvatar, saveAvatar } from './profileAvatar'
import { GameDialog } from './components/ui/GameDialog'
import { GameMenuHints } from './components/ui/GameMenuHints'
import { ScreenSections } from './components/ui/PagedItems'
import { ControllerButton, RaidControllerInput } from './controllers'
import { ControllerMenuNavigation, confirmControllerControl, dismissControllerDialog, foregroundDialog, getMenuControls, markControllerMenuInput, scrollMenuRegion } from './components/ui/controllerMenu'
import { HomeSettingsDialog } from './components/HomeSettingsDialog'
import { restoreDisplayOrientation } from './components/games/raid/flightView'
import { LeaderboardsScreen } from './components/LeaderboardsScreen'
import { ProgressionScreen } from './components/ProgressionScreen'
import { RaidMultiplayerLobby, type RaidMultiplayerConnectionMode, type RaidMultiplayerSession } from './components/RaidMultiplayerLobby'
import { RunResultsOverlay } from './components/RunResultsOverlay'
import { GradiusRaid, preloadGradiusRaidAssets } from './components/games/GradiusRaid'
import { getRaidAlienSpriteUrl, getRaidEliteSpriteUrl, RaidShipSprite, useLandscapeScreen } from './components/games/RaidShipSprite'
import { getPublicAssetUrl } from './components/games/sound'
import { useHangarAmbience, useTransmission } from './components/games/raid/carrierAudio'
import {
  getInitialLanguage,
  getLanguageText,
  getRaidText,
  getReleaseText,
  isLanguageCode,
  saveLanguage,
  type LanguageCode,
} from './i18n'
import { getOrCreateStoredPlayerId, getStoredPlayerName, getStoredRecoveryCode, hasStoredPlayerName, isCreatorPlayerName, registerPlayerName, restorePlayerName, sanitizePlayerName, saveStoredPlayerId, saveStoredPlayerName, saveStoredRecoveryCode, uploadPlayerProgress, type PlayerNameRegistrationResult } from './leaderboards'
import { CORE_LANDER_GOD_GUNDAM_UNLOCK_SCORE, CORE_LANDER_UNLOCK_GRADIUS_ENDLESS_SCORE, getEquippedShipCosmetics, isCoreLanderGodGundamUnlocked, isCoreLanderUnlocked, isGradiusRaidEndlessUnlocked, isShipCosmeticUnlocked, loadProgress, normalizeProgress, mergeProgressForSync, markProgressSyncPending, getPendingProgressSyncToken, clearPendingProgressSyncToken, recordRunResult, resetProgressForNewAccount, saveProgress, setCoreLanderModel, SHIP_COSMETIC_SINGLE_RUN_SCORE, SHIP_COSMETIC_TOTAL_SCORE, type ProgressState, type ProgressUpdate, type RunResult } from './progression'
import { useEffect, useMemo, useState, useRef, type CSSProperties } from 'react'

type ProgressionView = 'profile' | 'missions' | 'achievements' | 'codex' | 'stageMap'
type ScreenState = 'title' | 'game' | 'rocketMode' | 'raidHangar' | 'raidStory' | 'raidEndingArchive' | 'raidCoopMode' | 'raidSameScreenBriefing' | 'raidMultiplayer' | 'leaderboards' | ProgressionView
type RaidLaunchMode = 'campaign' | 'endless' | 'bossRush'

const PROGRESSION_VIEWS: ProgressionView[] = ['profile', 'missions', 'achievements', 'codex', 'stageMap']

const RAID_COOP_SHIP_OPTIONS = [
  { key: 'rocket', name: 'Black Comet' },
  { key: 'fast', name: 'Red Wraith' },
  { key: 'gatling', name: 'Crimson Saw' },
  { key: 'laser', name: 'Night Lance' },
  { key: 'dreadnought', name: 'Obsidian Ark' },
  { key: 'xwing', name: 'Crosswing Nova' },
  { key: 'spaceEt', name: 'Space Jet' },
  { key: 'mesiah', name: 'Mesiah' },
  { key: 'coreLander', name: 'God Gundam' },
] as const

const RAID_STORY_SCENE_DURATION_MS = 6200
const RAID_STORY_FADE_MS = 720
const CODEX_ENDING_SCENE_DURATION_MS = 6400
const CODEX_ENDING_FADE_MS = 720
const RAID_HANGAR_SHIP_OPTIONS = RAID_COOP_SHIP_OPTIONS
const RAID_HANGAR_COSMETICS = ['trail', 'aura', 'frame'] as const
const RAID_STORY_SCENE_VISUALS = [
  {
    planet: 'planet_1.webp',
    galaxy: 'galaxy_2.webp',
    boss: 'assets/aliens/final_boss.png',
    secondaryBoss: 'assets/aliens/elite_4.png',
    fleet: [
      { key: 'fast', size: 54 },
      { key: 'xwing', size: 48 },
      { key: 'spaceEt', size: 52 },
    ],
    enemies: [
      { kind: 'normal', variant: 2 },
      { kind: 'elite', variant: 0 },
      { kind: 'normal', variant: 5 },
    ],
  },
  {
    planet: 'planet_4.webp',
    galaxy: 'galaxy_3.webp',
    boss: 'assets/aliens/squid_boss.png',
    secondaryBoss: 'assets/aliens/elite_2.png',
    fleet: [
      { key: 'rocket', size: 50 },
      { key: 'laser', size: 54 },
      { key: 'dreadnought', size: 58 },
    ],
    enemies: [
      { kind: 'normal', variant: 0 },
      { kind: 'normal', variant: 6 },
      { kind: 'elite', variant: 3 },
    ],
  },
  {
    planet: 'planet_5.webp',
    galaxy: 'galaxy_4.webp',
    boss: 'assets/aliens/cobra_boss.png',
    secondaryBoss: 'assets/aliens/elite_3.png',
    fleet: [
      { key: 'mesiahBlack', size: 68 },
      { key: 'gatling', size: 50 },
      { key: 'laser', size: 50 },
    ],
    enemies: [
      { kind: 'elite', variant: 1 },
      { kind: 'normal', variant: 7 },
      { kind: 'elite', variant: 4 },
    ],
  },
  {
    planet: 'planet_3.webp',
    galaxy: 'galaxy.webp',
    boss: 'assets/aliens/final_boss.png',
    secondaryBoss: 'assets/aliens/squid_boss.png',
    fleet: [
      { key: 'rocket', size: 54 },
      { key: 'dreadnought', size: 58 },
      { key: 'xwing', size: 52 },
      { key: 'spaceEt', size: 54 },
    ],
    enemies: [
      { kind: 'normal', variant: 3 },
      { kind: 'elite', variant: 2 },
      { kind: 'normal', variant: 4 },
    ],
  },
] as const

function isMenuBgmScreen(screen: ScreenState) {
  return screen !== 'game'
}

function getHangarAttackClass(shipKey: string) {
  if (shipKey === 'fast') return 'wraith'
  if (shipKey === 'gatling') return 'scatter'
  if (shipKey === 'laser') return 'lance'
  if (shipKey === 'dreadnought') return 'ark'
  if (shipKey === 'xwing') return 'nova'
  if (shipKey === 'spaceEt') return 'comet'
  if (shipKey === 'mesiah') return 'mesiah'
  if (shipKey === 'coreLander') return 'core'
  return 'comet'
}

function App() {
  const [startupReady, setStartupReady] = useState(() => !document.getElementById('startup-splash'))
  useEffect(() => startStudioSplash(() => setStartupReady(true)), [])
  const landscapeScreen = useLandscapeScreen()
  const [screen, setScreen] = useDoorState<ScreenState>('title')
  const [language, setLanguage] = useState<LanguageCode>(getInitialLanguage)
  const [raidLaunchMode, setRaidLaunchMode] = useState<RaidLaunchMode>('campaign')
  const [raidMultiplayerConnectionMode, setRaidMultiplayerConnectionMode] = useState<RaidMultiplayerConnectionMode>('online')
  const [raidMultiplayerSession, setRaidMultiplayerSession] = useState<RaidMultiplayerSession | null>(null)
  const [raidSameScreenCoop, setRaidSameScreenCoop] = useState(false)
  const [sameScreenGuestShipKey, setSameScreenGuestShipKey] = useState('fast')
  const [hangarSection, setHangarSection] = useState<'overview' | 'systems' | 'cosmetics'>('overview')
  const [hangarShipKey, setHangarShipKey] = useState('rocket')
  const [raidStoryIndex, setRaidStoryIndex] = useState(0)
  const [raidStoryFading, setRaidStoryFading] = useState(false)
  const [playingCodexStory, setPlayingCodexStory] = useState(false)
  const [codexEndingIndex, setCodexEndingIndex] = useState(0)
  const [codexEndingFading, setCodexEndingFading] = useState(false)
  const { sequence: menuDoor } = useSpaceDoor()
  const menuControllerRef = useRef(new RaidControllerInput())
  const menuControllerNavigationRef = useRef(new ControllerMenuNavigation())
  const raidStoryTransitionTimerRef = useRef<number | null>(null)
  const raidStoryAutoFadeTimerRef = useRef<number | null>(null)
  const raidStoryAutoSceneTimerRef = useRef<number | null>(null)
  const codexEndingTransitionTimerRef = useRef<number | null>(null)
  const codexEndingAutoFadeTimerRef = useRef<number | null>(null)
  const codexEndingAutoSceneTimerRef = useRef<number | null>(null)
  const [playerName, setPlayerName] = useState(getStoredPlayerName)
  const [avatar, setAvatar] = useState(loadAvatar)
  const [playerNameDraft, setPlayerNameDraft] = useState(playerName === 'Pilot' && !hasStoredPlayerName() ? '' : playerName)
  const [showPlayerNamePrompt, setShowPlayerNamePrompt] = useState(false)
  const pendingLobbyRef = useRef<RaidMultiplayerConnectionMode | null>(null)
  const [playerNameSaving, setPlayerNameSaving] = useState(false)
  const [playerNameError, setPlayerNameError] = useState('')
  const [playerNameRestoreMode, setPlayerNameRestoreMode] = useState(false)
  const [recoveryCode, setRecoveryCode] = useState(getStoredRecoveryCode)
  const [recoveryCodeDraft, setRecoveryCodeDraft] = useState('')
  const [progress, setProgress] = useState<ProgressState>(() => loadProgress())
  const [lastRunUpdate, setLastRunUpdate] = useState<{ result: RunResult; update: ProgressUpdate; retry?: () => void } | null>(null)
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'offline' | 'connected' | 'conflict'>('offline')
  const [homeSettingsOpen, setHomeSettingsOpen] = useState(false)
  useEffect(() => { restoreDisplayOrientation() }, [])
  const cloudConnectedRef = useRef(false)
  const cloudSyncInFlightRef = useRef(false)

  const text = useMemo(() => getLanguageText(language), [language])
  const raidText = useMemo(() => getRaidText(language), [language])
  const releaseText = useMemo(() => getReleaseText(language), [language])
  const creatorUnlock = isCreatorPlayerName(playerName)
  const canPlayGradiusEndless = progress.gradiusRaidEndlessUnlocked || creatorUnlock
  const sameScreenShipOptions = useMemo(() => (
    RAID_COOP_SHIP_OPTIONS.filter((ship) => {
      if (ship.key === 'mesiah') return isGradiusRaidEndlessUnlocked(progress)
      if (ship.key === 'coreLander') return isCoreLanderUnlocked(progress)
      return true
    })
  ), [progress])
  const currentRaidStoryScene = text.raidStory.scenes[raidStoryIndex] ?? text.raidStory.scenes[0]
  const currentCodexEndingScenes = releaseText.cutsceneArchive.raidEndingScenes
  const currentCodexEndingScene = currentCodexEndingScenes[codexEndingIndex] ?? currentCodexEndingScenes[0]
  const command = getCommandText(language)
  const guestPilot = !hasStoredPlayerName()
  const commander = guestPilot ? command.guest : playerName
  const syncLabel = guestPilot ? command.localSave : releaseText.profileAccount[cloudSyncStatus]

  const updateAvatar = (owner: string, picture: string | null) => {
    saveAvatar(owner, picture)
    if (getAvatarOwner() === owner) setAvatar(picture)
  }
  const closeCodexCutsceneArchive = () => {
    setPlayingCodexStory(false)
    setCodexEndingIndex(0)
    setCodexEndingFading(false)
    setScreen('codex')
  }
  const openCodexEndingArchive = () => {
    setCodexEndingIndex(0)
    setCodexEndingFading(false)
    setScreen('raidEndingArchive')
  }
  const transitionCodexEnding = (target: 'close' | 'next' | number) => {
    const sceneCount = Math.max(1, currentCodexEndingScenes.length)

    if (typeof target === 'number' && target === codexEndingIndex) return
    if (codexEndingAutoFadeTimerRef.current !== null) {
      window.clearTimeout(codexEndingAutoFadeTimerRef.current)
      codexEndingAutoFadeTimerRef.current = null
    }
    if (codexEndingAutoSceneTimerRef.current !== null) {
      window.clearTimeout(codexEndingAutoSceneTimerRef.current)
      codexEndingAutoSceneTimerRef.current = null
    }
    if (codexEndingTransitionTimerRef.current !== null) {
      window.clearTimeout(codexEndingTransitionTimerRef.current)
    }

    setCodexEndingFading(true)
    codexEndingTransitionTimerRef.current = window.setTimeout(() => {
      codexEndingTransitionTimerRef.current = null

      if (target === 'close' || (target === 'next' && codexEndingIndex >= sceneCount - 1)) {
        closeCodexCutsceneArchive()
        return
      }

      if (typeof target === 'number') {
        setCodexEndingIndex(Math.max(0, Math.min(target, sceneCount - 1)))
      } else {
        setCodexEndingIndex((current) => Math.min(current + 1, sceneCount - 1))
      }
      setCodexEndingFading(false)
    }, CODEX_ENDING_FADE_MS)
  }
  const transitionRaidStory = (target: 'back' | 'game' | 'next' | number) => {
    if (typeof target === 'number' && target === raidStoryIndex) return
    if (raidStoryAutoFadeTimerRef.current !== null) {
      window.clearTimeout(raidStoryAutoFadeTimerRef.current)
      raidStoryAutoFadeTimerRef.current = null
    }
    if (raidStoryAutoSceneTimerRef.current !== null) {
      window.clearTimeout(raidStoryAutoSceneTimerRef.current)
      raidStoryAutoSceneTimerRef.current = null
    }
    if (raidStoryTransitionTimerRef.current !== null) {
      window.clearTimeout(raidStoryTransitionTimerRef.current)
    }
    setRaidStoryFading(true)
    raidStoryTransitionTimerRef.current = window.setTimeout(() => {
      raidStoryTransitionTimerRef.current = null
      if (target === 'back') {
        if (playingCodexStory) {
          closeCodexCutsceneArchive()
          setRaidStoryFading(false)
          return
        }
        setScreen('rocketMode')
      } else if (target === 'game' || (target === 'next' && raidStoryIndex >= text.raidStory.scenes.length - 1)) {
        if (playingCodexStory) openCodexEndingArchive()
        else setScreen('game')
      } else if (typeof target === 'number') {
        setRaidStoryIndex(Math.max(0, Math.min(target, text.raidStory.scenes.length - 1)))
      } else {
        setRaidStoryIndex((current) => Math.min(current + 1, text.raidStory.scenes.length - 1))
      }
      setRaidStoryFading(false)
    }, RAID_STORY_FADE_MS)
  }

  useTransmission(screen === 'raidStory' ? 'link' : null, raidStoryIndex)
  useHangarAmbience(screen === 'raidHangar', language)

  useEffect(() => {
    if (sameScreenShipOptions.some((ship) => ship.key === sameScreenGuestShipKey)) return
    setSameScreenGuestShipKey(sameScreenShipOptions[1]?.key ?? sameScreenShipOptions[0]?.key ?? 'fast')
  }, [sameScreenGuestShipKey, sameScreenShipOptions])

  useEffect(() => {
    if (startupReady) void preloadGradiusRaidAssets().catch(error => console.warn('Raid background preparation failed:', error))
  }, [startupReady])

  useEffect(() => () => {
    if (raidStoryTransitionTimerRef.current !== null) {
      window.clearTimeout(raidStoryTransitionTimerRef.current)
    }
    if (raidStoryAutoFadeTimerRef.current !== null) {
      window.clearTimeout(raidStoryAutoFadeTimerRef.current)
    }
    if (raidStoryAutoSceneTimerRef.current !== null) {
      window.clearTimeout(raidStoryAutoSceneTimerRef.current)
    }
    if (codexEndingTransitionTimerRef.current !== null) {
      window.clearTimeout(codexEndingTransitionTimerRef.current)
    }
    if (codexEndingAutoFadeTimerRef.current !== null) {
      window.clearTimeout(codexEndingAutoFadeTimerRef.current)
    }
    if (codexEndingAutoSceneTimerRef.current !== null) {
      window.clearTimeout(codexEndingAutoSceneTimerRef.current)
    }
  }, [])

  const handleLanguageChange = (nextLanguage: string) => {
    if (!isLanguageCode(nextLanguage)) return
    setLanguage(nextLanguage)
    saveLanguage(nextLanguage)
  }

  const syncCloudProgress = (_nextProgress: ProgressState) => {
    // Gameplay saves locally first; this merely wakes the asynchronous sync worker.
    // A failed upload never blocks play and remains pending on disk.
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('space-defenders:progress-changed'))
  }

  const applyRegisteredPlayer = (
    result: PlayerNameRegistrationResult,
    fallbackName: string,
    newAccount: boolean,
    keepGuestProgress = false,
  ) => {
    const switchingAccount = newAccount || Boolean(result.playerId && result.playerId !== getOrCreateStoredPlayerId())
    const localProgress = switchingAccount && !keepGuestProgress ? resetProgressForNewAccount(false) : loadProgress()
    if (result.playerId) saveStoredPlayerId(result.playerId)
    if (result.recoveryCode !== undefined || switchingAccount) saveStoredRecoveryCode(result.recoveryCode ?? '')
    const nextName = saveStoredPlayerName(result.playerName ?? fallbackName)
    const owner = getAvatarOwner()
    let nextAvatar = loadAvatar(owner)
    if (keepGuestProgress && !result.restored && !nextAvatar) {
      const guestAvatar = loadAvatar('guest')
      if (guestAvatar) {
        try {
          saveAvatar(owner, guestAvatar)
          nextAvatar = guestAvatar
        } catch {
          // Storage limits must not interrupt account registration.
        }
      }
    }
    setAvatar(nextAvatar)
    setPlayerName(nextName)
    setPlayerNameDraft(nextName)
    setRecoveryCode(result.recoveryCode ?? getStoredRecoveryCode())
    setRecoveryCodeDraft('')
    setPlayerNameRestoreMode(false)
    setShowPlayerNamePrompt(false)
    cloudConnectedRef.current = !result.offline
    setCloudSyncStatus(result.offline ? 'offline' : 'connected')

    const pending = getPendingProgressSyncToken()
    const cloudProgress = !newAccount && !result.offline && result.progress ? normalizeProgress(result.progress) : null
    const nextProgress = cloudProgress
      ? (pending || keepGuestProgress) ? mergeProgressForSync(localProgress, cloudProgress) : cloudProgress
      : localProgress
    saveProgress(nextProgress, false)
    setProgress(nextProgress)
    if (keepGuestProgress || (!result.offline && !cloudProgress && !pending)) markProgressSyncPending()
  }

  useEffect(() => {
    let active = true

    const attemptCloudSync = async () => {
      if (!active || cloudSyncInFlightRef.current || !hasStoredPlayerName()) return
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setCloudSyncStatus('offline')
        cloudConnectedRef.current = false
        return
      }

      cloudSyncInFlightRef.current = true
      try {
        if (!cloudConnectedRef.current) {
          const requestedName = getStoredPlayerName()
          const requestedId = getOrCreateStoredPlayerId()
          const result = await registerPlayerName(requestedName)
          if (!active || getStoredPlayerName() !== requestedName || getOrCreateStoredPlayerId() !== requestedId) return
          if (result.offline || !result.registered) {
            setCloudSyncStatus(result.taken ? 'conflict' : 'offline')
            return
          }

          // Do not overwrite the local run that might have completed while reconnecting.
          // Pending data is merged before any new cloud upload.
          const pending = getPendingProgressSyncToken()
          const cloudProgress = result.progress ? normalizeProgress(result.progress) : null
          if (cloudProgress) {
            const nextProgress = pending ? mergeProgressForSync(loadProgress(), cloudProgress) : cloudProgress
            saveProgress(nextProgress, false)
            setProgress(nextProgress)
          } else if (!pending) {
            markProgressSyncPending()
          }
          if (result.playerId && result.playerId !== requestedId) {
            saveStoredPlayerId(result.playerId)
            setAvatar(loadAvatar())
          }
          if (result.recoveryCode) setRecoveryCode(saveStoredRecoveryCode(result.recoveryCode))
          cloudConnectedRef.current = true
        }

        const token = getPendingProgressSyncToken()
        if (token) {
          const requestedName = getStoredPlayerName()
          const requestedId = getOrCreateStoredPlayerId()
          const upload = await uploadPlayerProgress(loadProgress())
          if (!active || getStoredPlayerName() !== requestedName || getOrCreateStoredPlayerId() !== requestedId) return
          if (!upload.saved) {
            cloudConnectedRef.current = false
            setCloudSyncStatus('offline')
            return
          }
          // An upload from before a newer local save must not clear its pending marker.
          clearPendingProgressSyncToken(token)
        }
        if (active) setCloudSyncStatus('connected')
      } finally {
        cloudSyncInFlightRef.current = false
      }
    }

    const retry = () => { void attemptCloudSync() }
    const retryWhenVisible = () => { if (!document.hidden) retry() }
    window.addEventListener('online', retry)
    window.addEventListener('offline', retry)
    window.addEventListener('focus', retry)
    window.addEventListener('space-defenders:progress-changed', retry)
    document.addEventListener('visibilitychange', retryWhenVisible)
    const interval = window.setInterval(retry, 20000)
    retry()
    return () => {
      active = false
      window.clearInterval(interval)
      window.removeEventListener('online', retry)
      window.removeEventListener('offline', retry)
      window.removeEventListener('focus', retry)
      window.removeEventListener('space-defenders:progress-changed', retry)
      document.removeEventListener('visibilitychange', retryWhenVisible)
    }
  }, [])

  // =========================
  // MENU BGM CONTROL
  // =========================
  const bgmRef = useRef<HTMLAudioElement | null>(null)
  const hasInteractedRef = useRef(false)

  // init audio
  useEffect(() => {
    const audio = new Audio(getPublicAssetUrl('audio/bgm_shelter.wav'))
    audio.loop = true
    audio.volume = 0.5

    bgmRef.current = audio

    return () => {
      audio.pause()
      bgmRef.current = null
    }
  }, [])

  // detect first interaction (required by browser)
  useEffect(() => {
    if (!startupReady) return
    const unlockAudio = () => {
      hasInteractedRef.current = true

      const bgm = bgmRef.current
      if (bgm && isMenuBgmScreen(screen)) {
        bgm.play().catch(() => {})
      }

      window.removeEventListener('click', unlockAudio)
      window.removeEventListener('keydown', unlockAudio)
    }

    window.addEventListener('click', unlockAudio)
    window.addEventListener('keydown', unlockAudio)

    return () => {
      window.removeEventListener('click', unlockAudio)
      window.removeEventListener('keydown', unlockAudio)
    }
  }, [screen, startupReady])

  // control music when switching screens
  useEffect(() => {
    const bgm = bgmRef.current
    if (!bgm) return

    if (startupReady && isMenuBgmScreen(screen)) {
      if (hasInteractedRef.current) {
        bgm.play().catch(() => {})
      }
    } else {
      bgm.pause()
    }
  }, [screen, startupReady])

  useEffect(() => {
    if (!startupReady || screen === 'game') return
    const isTypingTarget = (target: Element | null) => target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
    const getMenuScope = () => foregroundDialog() ?? document
    const moveFocus = (direction: 1 | -1) => {
      const controls = getMenuControls(getMenuScope())
      if (!controls.length) return
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
      const currentIndex = active ? controls.indexOf(active) : -1
      const nextIndex = currentIndex < 0 ? (direction > 0 ? 0 : controls.length - 1) : (currentIndex + direction + controls.length) % controls.length
      controls[nextIndex]?.focus()
      controls[nextIndex]?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
    const activateBackControl = () => {
      const dialog = foregroundDialog()
      if (dialog && dismissControllerDialog(dialog)) return
      if (screen === 'raidEndingArchive') {
        transitionCodexEnding('close')
        return
      }
      const backControl = document.querySelector<HTMLElement>('[data-controller-back], .mode-screen__back, .leaderboards-screen__back, .progress-panel__back, .cutscene__skip')
      backControl?.click()
    }
    const handleKeydown = (event: KeyboardEvent) => {
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
      if (isTypingTarget(active)) {
        if (event.key === 'Escape') {
          event.preventDefault()
          active.blur()
        }
        return
      }
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && scrollMenuRegion(active, event.key === 'ArrowDown' ? 1 : -1)) {
        event.preventDefault()
        return
      }
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault()
        moveFocus(1)
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault()
        moveFocus(-1)
      } else if (event.key === 'Escape') {
        event.preventDefault()
        activateBackControl()
      }
    }
    const focusFrame = window.requestAnimationFrame(() => {
      const scope = getMenuScope()
      if (scope !== document || isTypingTarget(document.activeElement)) return
      const firstAction = document.querySelector<HTMLElement>('[data-menu-default]:not(:disabled)')
      firstAction?.focus({ preventScroll: true })
    })
    let raf = 0
    const tick = (time: number) => {
      const { primary } = menuControllerRef.current.poll()
      if (primary && !menuDoor?.busy) {
        const scope = getMenuScope()
        menuControllerNavigationRef.current.move(primary, time, scope)
        if (primary.pressed & ControllerButton.Back) {
          markControllerMenuInput()
          activateBackControl()
        } else if (primary.pressed & (ControllerButton.Confirm | ControllerButton.Start)) confirmControllerControl(scope)
      }
      raf = window.requestAnimationFrame(tick)
    }
    raf = window.requestAnimationFrame(tick)
    window.addEventListener('keydown', handleKeydown)
    return () => {
      window.cancelAnimationFrame(raf)
      window.cancelAnimationFrame(focusFrame)
      window.removeEventListener('keydown', handleKeydown)
    }
  }, [menuDoor, screen, startupReady])
  useEffect(() => {
    if (screen !== 'raidStory') return
    setRaidStoryFading(false)

    raidStoryAutoFadeTimerRef.current = window.setTimeout(() => {
      raidStoryAutoFadeTimerRef.current = null
      setRaidStoryFading(true)
    }, RAID_STORY_SCENE_DURATION_MS - RAID_STORY_FADE_MS)

    raidStoryAutoSceneTimerRef.current = window.setTimeout(() => {
      raidStoryAutoSceneTimerRef.current = null
      setRaidStoryIndex((current) => {
        if (current >= text.raidStory.scenes.length - 1) {
          if (playingCodexStory) openCodexEndingArchive()
          else setScreen('game')
          return current
        }
        return current + 1
      })
      setRaidStoryFading(false)
    }, RAID_STORY_SCENE_DURATION_MS)

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        transitionRaidStory('back')
        return
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        transitionRaidStory('game')
      }
    }

    window.addEventListener('keydown', handleKeydown)

    return () => {
      if (raidStoryAutoFadeTimerRef.current !== null) {
        window.clearTimeout(raidStoryAutoFadeTimerRef.current)
        raidStoryAutoFadeTimerRef.current = null
      }
      if (raidStoryAutoSceneTimerRef.current !== null) {
        window.clearTimeout(raidStoryAutoSceneTimerRef.current)
        raidStoryAutoSceneTimerRef.current = null
      }
      window.removeEventListener('keydown', handleKeydown)
    }
  }, [screen, raidStoryIndex, text.raidStory.scenes.length, playingCodexStory])

  useEffect(() => {
    if (screen !== 'raidEndingArchive') return
    setCodexEndingFading(false)

    if (codexEndingIndex < currentCodexEndingScenes.length - 1) {
      codexEndingAutoFadeTimerRef.current = window.setTimeout(() => {
        codexEndingAutoFadeTimerRef.current = null
        setCodexEndingFading(true)
      }, CODEX_ENDING_SCENE_DURATION_MS - CODEX_ENDING_FADE_MS)

      codexEndingAutoSceneTimerRef.current = window.setTimeout(() => {
        codexEndingAutoSceneTimerRef.current = null
        setCodexEndingIndex((current) => Math.min(current + 1, currentCodexEndingScenes.length - 1))
        setCodexEndingFading(false)
      }, CODEX_ENDING_SCENE_DURATION_MS)
    }

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        transitionCodexEnding('close')
        return
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        transitionCodexEnding('next')
      }
    }

    window.addEventListener('keydown', handleKeydown)

    return () => {
      if (codexEndingAutoFadeTimerRef.current !== null) {
        window.clearTimeout(codexEndingAutoFadeTimerRef.current)
        codexEndingAutoFadeTimerRef.current = null
      }
      if (codexEndingAutoSceneTimerRef.current !== null) {
        window.clearTimeout(codexEndingAutoSceneTimerRef.current)
        codexEndingAutoSceneTimerRef.current = null
      }
      window.removeEventListener('keydown', handleKeydown)
    }
  }, [screen, codexEndingIndex, currentCodexEndingScenes.length])

  const startRocketRaidSingle = (mode: RaidLaunchMode = 'campaign') => {
    if ((mode === 'endless' || mode === 'bossRush') && !canPlayGradiusEndless) return
    setPlayingCodexStory(false)
    setRaidMultiplayerSession(null)
    setRaidSameScreenCoop(false)
    setRaidLaunchMode(mode)
    if (mode === 'campaign') {
      setRaidStoryIndex(0)
      setScreen('raidStory')
      return
    }
    setScreen('game')
  }

  const startSameScreenCoop = () => {
    setPlayingCodexStory(false)
    setRaidMultiplayerSession(null)
    setRaidSameScreenCoop(true)
    setRaidLaunchMode('campaign')
    setScreen('game')
  }

  const startCodexCutscenePlayback = () => {
    setPlayingCodexStory(true)
    setLastRunUpdate(null)
    setRaidStoryIndex(0)
    setRaidStoryFading(false)
    setScreen('raidStory')
  }

  const handleRunComplete = (result: RunResult, retry?: () => void) => {
    const update = recordRunResult(result)
    setProgress(update.progress)
    syncCloudProgress(update.progress)
    setLastRunUpdate({ result, update, retry })
  }

  const savePlayerName = async () => {
    if (!playerNameDraft.trim() || playerNameSaving) return
    const keepGuestProgress = !hasStoredPlayerName()
    const newAccount = !playerNameRestoreMode && cloudSyncStatus !== 'conflict' &&
      (!hasStoredPlayerName() || sanitizePlayerName(playerNameDraft).toLowerCase() !== getStoredPlayerName().toLowerCase())
    setPlayerNameSaving(true)
    setPlayerNameError('')
    const result = playerNameRestoreMode
      ? await restorePlayerName(playerNameDraft, recoveryCodeDraft)
      : await registerPlayerName(playerNameDraft, newAccount)
    setPlayerNameSaving(false)

    if (!result.registered) {
      if (result.taken) setPlayerNameRestoreMode(true)
      setPlayerNameError(
        playerNameRestoreMode
          ? text.player.recoveryInvalid
          : result.taken ? text.player.nameTakenRecovery : text.player.nameRegisterError,
      )
      return
    }

    applyRegisteredPlayer(result, playerNameDraft, newAccount, keepGuestProgress)
    const lobby = pendingLobbyRef.current
    pendingLobbyRef.current = null
    if (lobby) {
      setRaidMultiplayerConnectionMode(lobby)
      setScreen('raidMultiplayer')
    }
    if (!result.offline) syncCloudProgress(loadProgress())
  }

  const openProfileAccount = () => {
    setPlayerNameDraft('')
    setPlayerNameError('')
    setPlayerNameRestoreMode(false)
    setRecoveryCodeDraft('')
    setShowPlayerNamePrompt(true)
  }

  const dismissCallsign = () => {
    if (playerNameSaving) return
    pendingLobbyRef.current = null
    setShowPlayerNamePrompt(false)
  }

  const openMultiplayerLobby = (mode: RaidMultiplayerConnectionMode) => {
    if (!hasStoredPlayerName()) {
      pendingLobbyRef.current = mode
      setShowPlayerNamePrompt(true)
      return
    }
    setRaidMultiplayerConnectionMode(mode)
    setScreen('raidMultiplayer')
  }

  const playerNamePrompt = startupReady && showPlayerNamePrompt ? (
    <GameDialog className="player-name-modal" aria-labelledby="player-name-title" onDismiss={dismissCallsign}>
      <form
        className="player-name-modal__panel"
        onSubmit={(event) => {
          event.preventDefault()
          savePlayerName()
        }}
      >
        <div className="player-name-modal__heading">
          <span className="player-name-modal__eyebrow">{text.player.registration}</span>
          <GameButton tone="quiet" data-dialog-dismiss disabled={playerNameSaving} onClick={dismissCallsign}>{raidText.menu.close}</GameButton>
        </div>
        <h2 id="player-name-title">{guestPilot ? command.callsign : text.player.chooseName}</h2>
        <p>{guestPilot ? command.callsignUse : text.player.nameUse}</p>
        <input
          data-dialog-initial-focus
          aria-label={text.player.placeholder}
          autoComplete="nickname"
          maxLength={18}
          value={playerNameDraft}
          onChange={(event) => {
            setPlayerNameDraft(event.target.value)
            setPlayerNameError('')
          }}
          placeholder={text.player.placeholder}
        />
        {playerNameRestoreMode ? (
          <input
            maxLength={32}
            aria-label={text.player.recoveryPlaceholder}
            autoComplete="off"
            autoCapitalize="characters"
            value={recoveryCodeDraft}
            onChange={(event) => {
              setRecoveryCodeDraft(event.target.value)
              setPlayerNameError('')
            }}
            placeholder={text.player.recoveryPlaceholder}
          />
        ) : null}
        {playerNameError ? <small className="player-name-modal__error">{playerNameError}</small> : null}
        <GameButton type="submit" tone="primary" disabled={!playerNameDraft.trim() || playerNameSaving || (playerNameRestoreMode && !recoveryCodeDraft.trim())}>
          {playerNameSaving ? text.player.checking : playerNameRestoreMode ? text.player.restore : text.player.confirm}
        </GameButton>
        {(screen === 'profile' || playerNameRestoreMode) && (
          <GameButton type="button" tone="quiet" disabled={playerNameSaving} onClick={() => {
            setPlayerNameRestoreMode((restoring) => !restoring)
            setPlayerNameError('')
            setRecoveryCodeDraft('')
          }}>
            {playerNameRestoreMode ? releaseText.profileAccount.useNewName : releaseText.profileAccount.restoreAccount}
          </GameButton>
        )}
      </form>
    </GameDialog>
  ) : null

  const closeRocketRaid = () => {
    const nextProgress = loadProgress()
    setProgress(nextProgress)
    syncCloudProgress(nextProgress)
    raidMultiplayerSession?.socket.close()
    setRaidMultiplayerSession(null)
    setRaidSameScreenCoop(false)
    setScreen(raidMultiplayerSession || raidSameScreenCoop ? 'raidCoopMode' : 'rocketMode')
  }

  const runResultsOverlay = lastRunUpdate ? (
    <RunResultsOverlay
      result={lastRunUpdate.result}
      update={lastRunUpdate.update}
      language={language}
      onClose={() => setLastRunUpdate(null)}
      onRetry={screen === 'game' && lastRunUpdate.retry ? () => {
        setLastRunUpdate(null)
        lastRunUpdate.retry?.()
      } : undefined}
    />
  ) : null

  if (screen === 'title') {
    const shortcuts = [
      { screen: 'achievements', icon: 'achievements', label: releaseText.achievements },
      { screen: 'missions', icon: 'missions', label: releaseText.missions },
      { screen: 'raidHangar', icon: 'hangar', label: text.rocketMode.hangar },
      { screen: 'codex', icon: 'codex', label: releaseText.codex },
      { screen: 'stageMap', icon: 'almanac', label: releaseText.stageMap },
    ] as const
    return (
      <div className="start-screen">
        <header className="start-screen__topbar">
          <GameButton tone="quiet" className="start-screen__profile" aria-label={`${releaseText.profile} · ${commander}`} onClick={() => setScreen('profile')}>
            <PlayerAvatar picture={avatar} />
            <strong title={commander}>{commander}</strong>
          </GameButton>
          <GameButton tone="quiet" className="start-screen__settings" aria-haspopup="dialog" aria-expanded={homeSettingsOpen} onClick={() => setHomeSettingsOpen(true)}>{raidText.menu.settings}</GameButton>
        </header>
        <main className="start-screen__content">
          <div className="start-screen__command-panel">
            <div className="start-screen__brand">
              <span className="start-screen__signal" />
              <span>{text.title.brand}</span>
              <span className="start-screen__version">{text.title.version}</span>
            </div>
            <div className="start-screen__title-lockup">
              <div className="start-screen__eyebrow">{text.title.eyebrow}</div>
              <h1 className="start-screen__game-logo">{text.title.name}<span className="start-screen__game-logo-3d" aria-label="3D edition">3D</span></h1>
              <p>{text.title.subtitle}</p>
            </div>

            <nav className="start-screen__actions" aria-label={text.title.name}>
              <GameMenuAction
                data-menu-default
                label={text.rocketMode.single}
                icon={<HomeMenuIcon name="single" />}
                onClick={() => setScreen('rocketMode')}
              />
              <GameMenuAction icon={<HomeMenuIcon name="coop" />} label={text.rocketMode.coop} onClick={() => setScreen('raidCoopMode')} />
              <GameMenuAction icon={<HomeMenuIcon name="leaderboards" />} label={text.title.recordsTitle} onClick={() => setScreen('leaderboards')} />
            </nav>

            <nav className="start-screen__shortcuts" aria-label={releaseText.homeShortcuts}>
              {shortcuts.map(({ screen, icon, label }) => (
                <GameButton key={screen} tone="quiet" aria-label={label} title={label} onClick={() => setScreen(screen)}>
                  <HomeMenuIcon name={icon} />
                  <span className="start-screen__shortcut-label" aria-hidden="true">{label}</span>
                </GameButton>
              ))}
            </nav>
          </div>

          <GameMenuHints language={language} showBack={false} />
          <div className="start-screen__footer">
            <span>{text.title.copyright}</span>
            <span>{text.title.musicCredit}</span>
          </div>
        </main>
        {playerNamePrompt}
        {runResultsOverlay}
        {homeSettingsOpen && <HomeSettingsDialog language={language} onLanguageChange={handleLanguageChange} onClose={() => setHomeSettingsOpen(false)} />}
      </div>
    )
  }

  if (screen === 'raidStory') {
    const isLastStoryScene = raidStoryIndex >= text.raidStory.scenes.length - 1
    const storySceneClass = `raid-story--scene-${raidStoryIndex + 1}`
    const storyVisuals = RAID_STORY_SCENE_VISUALS[raidStoryIndex] ?? RAID_STORY_SCENE_VISUALS[0]

    return (
      <>
        <div className={raidStoryFading ? `raid-story ${storySceneClass} raid-story--fading` : `raid-story ${storySceneClass}`}>
          <div className="raid-story__stars" />
          <div className="raid-story__rift" />
          <img className="raid-story__earth" src={getPublicAssetUrl(`assets/others/${storyVisuals.planet}`)} alt="" aria-hidden="true" draggable={false} />
          <img className="raid-story__galaxy" src={getPublicAssetUrl(`assets/others/${storyVisuals.galaxy}`)} alt="" aria-hidden="true" draggable={false} />
          <img className="raid-story__fortress" src={getPublicAssetUrl(storyVisuals.boss)} alt="" aria-hidden="true" draggable={false} />
          <img className="raid-story__secondary-boss" src={getPublicAssetUrl(storyVisuals.secondaryBoss)} alt="" aria-hidden="true" draggable={false} />
          <div className="raid-story__fleet" aria-hidden="true">
            {storyVisuals.fleet.map((ship) => (
              <RaidShipSprite key={ship.key} shipKey={ship.key} size={ship.size} />
            ))}
          </div>
          <div className="raid-story__enemy-wave" aria-hidden="true">
            {storyVisuals.enemies.map((enemy) => (
              <img
                key={`${enemy.kind}-${enemy.variant}`}
                className={enemy.kind === 'elite' ? 'raid-story__enemy raid-story__enemy--elite' : 'raid-story__enemy'}
                src={enemy.kind === 'elite' ? getRaidEliteSpriteUrl(enemy.variant) : getRaidAlienSpriteUrl(enemy.variant)}
                alt=""
                draggable={false}
              />
            ))}
          </div>

          <div className="raid-story__hud">
            <button className="raid-story__skip" type="button" data-controller-back onClick={() => transitionRaidStory('back')}>
              {text.raidStory.back}
            </button>
            <button className="raid-story__skip raid-story__skip--launch" type="button" onClick={() => transitionRaidStory('game')}>
              {text.raidStory.skip}
            </button>
          </div>

          <section className="raid-story__panel" aria-labelledby="raid-story-title">
            <div className="raid-story__copy" key={raidStoryIndex} tabIndex={0}>
              <div className="raid-story__eyebrow">{currentRaidStoryScene.eyebrow}</div>
              <h1 id="raid-story-title">{currentRaidStoryScene.title}</h1>
              <p>{currentRaidStoryScene.text}</p>
            </div>

            <div className="raid-story__meta">
              <div className="raid-story__progress" aria-label={text.raidStory.progress}>
                {text.raidStory.scenes.map((scene, index) => (
                  <button
                    key={scene.title}
                    type="button"
                    className={index === raidStoryIndex ? 'raid-story__dot raid-story__dot--active' : 'raid-story__dot'}
                    aria-current={index === raidStoryIndex ? 'step' : undefined}
                    aria-label={`${text.raidStory.progress}: ${index + 1}. ${scene.title}`}
                    onClick={() => transitionRaidStory(index)}
                  />
                ))}
              </div>
              <button
                className="raid-story__next"
                type="button"
                data-menu-default
                onClick={() => {
                  transitionRaidStory(isLastStoryScene ? 'game' : 'next')
                }}
              >
                {isLastStoryScene ? text.raidStory.launch : text.raidStory.next}
              </button>
            </div>
          </section>
        </div>
        {playerNamePrompt}
        {runResultsOverlay}
      </>
    )
  }

  if (screen === 'raidEndingArchive') {
    const isLastEndingScene = codexEndingIndex >= currentCodexEndingScenes.length - 1
    const endingArchiveClass = `raid raid--ending-archive raid--ending-archive-scene-${codexEndingIndex + 1}${codexEndingFading ? ' raid--ending-archive-fading' : ''}`
    const archiveWingmen = ['fast', 'xwing', 'spaceEt', 'dreadnought']

    return (
      <>
        <div className={endingArchiveClass}>
          <div className="raid__ending" role="dialog" aria-modal="true" aria-labelledby="raid-ending-archive-title">
            <div className="raid__ending-scene" aria-hidden="true">
              <div className="raid__ending-stars raid__ending-stars--far" />
              <div className="raid__ending-stars raid__ending-stars--near" />
              <img className="raid__ending-galaxy raid__ending-galaxy--left" src={getPublicAssetUrl('assets/others/galaxy.webp')} alt="" draggable={false} />
              <img className="raid__ending-galaxy raid__ending-galaxy--right" src={getPublicAssetUrl('assets/others/galaxy_2.webp')} alt="" draggable={false} />
              <img className="raid__ending-sun-asset" src={getPublicAssetUrl('assets/others/sun.webp')} alt="" draggable={false} />
              <img className="raid__ending-comet" src={getPublicAssetUrl('assets/others/comet.webp')} alt="" draggable={false} />
              <img className="raid__ending-station" src={getPublicAssetUrl('assets/others/space_station.webp')} alt="" draggable={false} />
              <img className="raid__ending-asteroid raid__ending-asteroid--one" src={getPublicAssetUrl('assets/others/asteroid.webp')} alt="" draggable={false} />
              <img className="raid__ending-asteroid raid__ending-asteroid--two" src={getPublicAssetUrl('assets/others/asteroid.webp')} alt="" draggable={false} />
              <div className="raid__ending-sun" />
              <div className="raid__ending-final-burst">
                <i />
                <i />
                <i />
              </div>
              <img className="raid__ending-fortress" src={getPublicAssetUrl('assets/aliens/final_boss.png')} alt="" draggable={false} />
              <div className="raid__ending-retreat-wave">
                {[1, 4, 6].map((variant, index) => (
                  <img key={`ending-alien-${variant}`} src={getRaidAlienSpriteUrl(variant)} alt="" draggable={false} style={{ '--retreat-index': index } as CSSProperties} />
                ))}
                {[0, 3].map((variant, index) => (
                  <img key={`ending-elite-${variant}`} className="raid__ending-retreat-elite" src={getRaidEliteSpriteUrl(variant)} alt="" draggable={false} style={{ '--retreat-index': index + 3 } as CSSProperties} />
                ))}
              </div>
              <div className="raid__ending-earth" />
              <div className="raid__ending-city-lights">
                <i />
                <i />
                <i />
                <i />
              </div>
              <div className="raid__ending-home-signal">
                <span>{releaseText.cutsceneArchive.ending}</span>
                <b>{currentCodexEndingScene.title}</b>
              </div>
              <div className="raid__ending-wake raid__ending-wake--host" />
              <div className="raid__ending-ship raid__ending-ship--host">
                <RaidShipSprite shipKey="rocket" size={92} />
              </div>
              <div className="raid__ending-fleet">
                {archiveWingmen.map((shipKey, index) => (
                  <span key={shipKey} style={{ '--fleet-index': index } as CSSProperties}>
                    <RaidShipSprite shipKey={shipKey} size={44} />
                  </span>
                ))}
              </div>
            </div>

            <div className="raid__ending-panel">
              <div className="raid__kicker">{releaseText.cutsceneArchive.ending}</div>
              <h2 id="raid-ending-archive-title">{currentCodexEndingScene.title}</h2>
              <p>{currentCodexEndingScene.text}</p>
              <div className="raid__ending-log raid__ending-log--archive" aria-label={releaseText.cutsceneArchive.ending}>
                {currentCodexEndingScenes.map((scene, index) => (
                  <button
                    key={scene.title}
                    type="button"
                    className={index === codexEndingIndex ? 'raid__ending-signal raid__ending-signal--active' : 'raid__ending-signal'}
                    aria-current={index === codexEndingIndex ? 'step' : undefined}
                    aria-label={releaseText.cutsceneArchive.progress.replace('{current}', String(index + 1)).replace('{total}', String(currentCodexEndingScenes.length))}
                    onClick={() => transitionCodexEnding(index)}
                    style={{ '--ending-line': index } as CSSProperties}
                  />
                ))}
              </div>
              <div className="raid__pause-actions raid__ending-actions">
                <button type="button" className="raid__menu-button" data-menu-default data-dialog-dismiss={isLastEndingScene || undefined} onClick={() => transitionCodexEnding(isLastEndingScene ? 'close' : 'next')}>
                  {isLastEndingScene ? raidText.menu.close : releaseText.cutsceneArchive.next}
                </button>
              </div>
            </div>
          </div>
        </div>
        {playerNamePrompt}
      </>
    )
  }

  if (screen === 'raidHangar') {
    const selectedShip = RAID_HANGAR_SHIP_OPTIONS.find((ship) => ship.key === hangarShipKey) ?? RAID_HANGAR_SHIP_OPTIONS[0]
    const selectedShipCopy = raidText.ships[selectedShip.key as keyof typeof raidText.ships] ?? selectedShip
    const selectedMastery = progress.shipMastery[selectedShip.key] ?? { xp: 0, level: 1, runs: 0, bestScore: 0, totalScore: 0, victories: 0 }
    const selectedCosmetics = getEquippedShipCosmetics(progress, selectedShip.key)
    const selectedSpriteKey = getDefaultPlayerVisualShipKey(selectedShip.key, progress)
    const previewSide = landscapeScreen && !!getRaidSideShipSpriteUrl(selectedSpriteKey)
    const bankedPreviewNozzles = getRaidBankingNozzles(selectedSpriteKey, landscapeScreen)
    const previewNozzles = bankedPreviewNozzles ?? (previewSide ? getRaidSideShipNozzles(selectedSpriteKey) : getRaidShipNozzles(selectedSpriteKey))
    const previewTrailOverHull = selectedSpriteKey === 'godGundam' || selectedSpriteKey === 'spiegel'
    const previewSize = selectedShip.key === 'mesiah' ? 136 : selectedShip.key === 'coreLander' ? 122 : 106
    const trailClass = selectedCosmetics.trail ? 'raid-hangar__trail raid-hangar__trail--active' : 'raid-hangar__trail'
    const selectedAttackClass = getHangarAttackClass(selectedShip.key)
    const attackCopy = text.raidHangar.attacks[selectedShip.key as keyof typeof text.raidHangar.attacks] ?? text.raidHangar.attacks.rocket
    const specialCopy = text.raidHangar.specials[selectedShip.key as keyof typeof text.raidHangar.specials] ?? text.raidHangar.specials.rocket
    const isSelectedUnlocked = selectedShip.key === 'mesiah'
      ? canPlayGradiusEndless
      : selectedShip.key === 'coreLander'
        ? isCoreLanderUnlocked(progress)
        : true
    const unlockCopy = isSelectedUnlocked
      ? text.raidHangar.unlocked
      : selectedShip.key === 'coreLander'
        ? text.raidHangar.coreUnlock.replace('{score}', CORE_LANDER_UNLOCK_GRADIUS_ENDLESS_SCORE.toLocaleString())
        : text.raidHangar.raidClearUnlock

    return (
      <>
        <div className="raid-hangar">
          <div className="raid-hangar__stars" />
          <div className="raid-hangar__panel">
            <header className="raid-hangar__intro">
              <h1>{text.raidHangar.title}</h1>
              <div className="raid-hangar__actions">
                <GameButton tone="primary" className="raid-hangar__launch" disabled={!isSelectedUnlocked} onClick={() => startRocketRaidSingle('campaign')}>
                  {text.rocketMode.start}
                </GameButton>
                <GameButton tone="quiet" className="mode-screen__back" onClick={() => setScreen('title')}>
                  {text.rocketMode.back}
                </GameButton>
              </div>
            </header>

            <div className="raid-hangar__layout">
              <div className="raid-hangar__preview">
                <div className={isSelectedUnlocked ? 'raid-hangar__display' : 'raid-hangar__display raid-hangar__display--locked'}>
                  <div className={selectedCosmetics.aura ? 'raid-hangar__aura raid-hangar__aura--active' : 'raid-hangar__aura'} />
                  <div className={selectedCosmetics.frame ? 'raid-hangar__frame raid-hangar__frame--active' : 'raid-hangar__frame'} />
                  {previewTrailOverHull && <RaidShipSprite shipKey={selectedSpriteKey} size={previewSize} sideView={previewSide} />}
                  {previewNozzles ? previewNozzles.map(([x, y, width]) => (
                    <div
                      className={`${trailClass} raid-hangar__trail--nozzle`}
                      key={`${x}:${y}`}
                      style={{
                        left: `calc(50% + ${(bankedPreviewNozzles ? raidBankingPreviewNozzle(x, y, landscapeScreen).x : previewSide ? -y : x) * previewSize}px)`,
                        top: `calc(50% + ${(bankedPreviewNozzles ? raidBankingPreviewNozzle(x, y, landscapeScreen).y : previewSide ? x : y) * previewSize}px)`,
                        ...((previewSide || (landscapeScreen && bankedPreviewNozzles)) ? { transform: 'translateX(-50%) rotate(90deg)', transformOrigin: 'top center' } : {}),
                        width: width * previewSize,
                        height: previewSize * getRaidExhaustScale(selectedSpriteKey, previewNozzles.length) * (selectedCosmetics.trail ? .57 : .42),
                      }}
                    />
                  )) : <div className={trailClass} />}
                  {!previewTrailOverHull && <RaidShipSprite shipKey={selectedSpriteKey} size={previewSize} />}
                </div>
                <div className={`raid-hangar__attack raid-hangar__attack--${selectedAttackClass}`} aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <span />
                </div>
              </div>

              <div className="raid-hangar__details">
                <ScreenSections active={hangarSection} label={text.raidHangar.title} labels={{
                  overview: text.raidHangar.mastery, systems: releaseText.compactSections.systems,
                  cosmetics: releaseText.compactSections.cosmetics,
                }} onChange={setHangarSection} />
                {hangarSection === 'overview' && <>
                  <div className="raid-hangar__selected">
                    <h2>{selectedShip.key === 'coreLander' ? getRaidGundamName(selectedSpriteKey) : selectedShipCopy.name}</h2>
                    <span className={isSelectedUnlocked ? 'raid-hangar__status raid-hangar__status--ready' : 'raid-hangar__status'}>{unlockCopy}</span>
                  </div>
                  <p>{selectedShipCopy.role}</p>

                  <div className="raid-hangar__stats">
                    <span>
                      <small>{text.raidHangar.mastery}</small>
                      <b>{text.raidHangar.level.replace('{level}', selectedMastery.level.toLocaleString())}</b>
                    </span>
                    <span>
                      <small>{text.raidHangar.best}</small>
                      <b>{selectedMastery.bestScore.toLocaleString()}</b>
                    </span>
                    <span>
                      <small>{text.raidHangar.total}</small>
                      <b>{selectedMastery.totalScore.toLocaleString()}</b>
                    </span>
                    <span>
                      <small>{text.raidHangar.victories}</small>
                      <b>{selectedMastery.victories.toLocaleString()}</b>
                    </span>
                  </div>
                </>}

                {hangarSection === 'systems' && <div className="raid-hangar__systems">
                  <div>
                    <span>{text.raidHangar.attackProfile}</span>
                    <p>{attackCopy}</p>
                  </div>
                  <div>
                    <span>{text.raidHangar.specialSystems}</span>
                    <p>{specialCopy}</p>
                  </div>
                </div>}

                {hangarSection === 'cosmetics' && <>
                  <div className="raid-hangar__cosmetics">
                    {RAID_HANGAR_COSMETICS.map((cosmetic) => {
                      const unlocked = isShipCosmeticUnlocked(progress.shipMastery[selectedShip.key], cosmetic)
                      const equipped = selectedCosmetics[cosmetic]
                      const label = text.raidHangar.cosmetics[cosmetic]
                      return (
                        <span key={cosmetic} className={equipped ? 'raid-hangar__cosmetic raid-hangar__cosmetic--equipped' : 'raid-hangar__cosmetic'}>
                          <b>{label}</b>
                          <small>{unlocked ? equipped ? text.raidHangar.equipped : text.raidHangar.unlocked : cosmetic === 'trail' ? text.raidHangar.trailUnlock.replace('{score}', SHIP_COSMETIC_SINGLE_RUN_SCORE.toLocaleString()) : cosmetic === 'aura' ? text.raidHangar.auraUnlock : text.raidHangar.frameUnlock.replace('{score}', SHIP_COSMETIC_TOTAL_SCORE.toLocaleString())}</small>
                        </span>
                      )
                    })}
                  </div>

                  {selectedShip.key === 'coreLander' && isSelectedUnlocked ? (
                    <div className="progress-ship-color" aria-label={releaseText.coreLanderModel}>
                      {(['godGundam', 'spiegel'] as const).map((model) => (
                        <button
                          key={model}
                          type="button"
                          className={selectedSpriteKey === model ? 'progress-ship-color__button progress-ship-color__button--active' : 'progress-ship-color__button'}
                          aria-pressed={selectedSpriteKey === model}
                          disabled={model === 'spiegel' && !isCoreLanderGodGundamUnlocked(progress)}
                          onClick={() => setProgress(setCoreLanderModel(model))}
                        >
                          {getRaidGundamName(model)}
                        </button>
                      ))}
                      {!isCoreLanderGodGundamUnlocked(progress) && (
                        <p className="raid-hangar__model-note">
                          {text.raidHangar.coreModelUnlock.replace('{score}', CORE_LANDER_GOD_GUNDAM_UNLOCK_SCORE.toLocaleString())}
                        </p>
                      )}
                    </div>
                  ) : null}
                </>}
              </div>
            </div>

            <div className="raid-hangar__roster" aria-label={text.raidHangar.roster}>
              {RAID_HANGAR_SHIP_OPTIONS.map((ship) => {
                const shipCopy = raidText.ships[ship.key as keyof typeof raidText.ships] ?? ship
                const spriteKey = getDefaultPlayerVisualShipKey(ship.key, progress)
                const unlocked = ship.key === 'mesiah'
                  ? canPlayGradiusEndless
                  : ship.key === 'coreLander'
                    ? isCoreLanderUnlocked(progress)
                    : true
                return (
                  <button
                    key={ship.key}
                    type="button"
                    className={ship.key === selectedShip.key ? 'raid-hangar__ship-button raid-hangar__ship-button--active' : 'raid-hangar__ship-button'}
                    aria-pressed={ship.key === selectedShip.key}
                    onClick={() => setHangarShipKey(ship.key)}
                  >
                    <span className={unlocked ? 'raid-hangar__ship-thumb' : 'raid-hangar__ship-thumb raid-hangar__ship-thumb--locked'}>
                      <RaidShipSprite shipKey={spriteKey} size={ship.key === 'mesiah' || ship.key === 'coreLander' ? 48 : 40} />
                    </span>
                    <b>{ship.key === 'coreLander' ? getRaidGundamName(spriteKey) : shipCopy.name}</b>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        {playerNamePrompt}
        {runResultsOverlay}
      </>
    )
  }

  if (screen === 'rocketMode' || screen === 'raidCoopMode') {
    const solo = screen === 'rocketMode'
    const title = solo ? text.rocketMode.single : text.rocketMode.coop

    return (
      <div className="mode-screen mode-screen--menu">
        <section className="mode-screen__panel mode-screen__panel--menu" aria-labelledby="mode-menu-title">
          <header className="mode-screen__heading">
            <h1 id="mode-menu-title">{title}</h1>
            <GameButton tone="quiet" className="mode-screen__back" onClick={() => setScreen('title')}>
              {text.rocketMode.back}
            </GameButton>
          </header>
          {solo ? (
            <nav className="mode-screen__actions mode-screen__actions--raid" aria-label={title}>
              <GameMenuAction data-menu-default label={text.rocketMode.story} onClick={() => startRocketRaidSingle('campaign')} />
              <GameMenuAction label={text.rocketMode.endless} detail={!canPlayGradiusEndless ? text.rocketMode.endlessLocked : undefined} disabled={!canPlayGradiusEndless} onClick={() => startRocketRaidSingle('endless')} />
              <GameMenuAction label={text.rocketMode.bossRush} detail={!canPlayGradiusEndless ? text.rocketMode.bossRushLocked : undefined} disabled={!canPlayGradiusEndless} onClick={() => startRocketRaidSingle('bossRush')} />
            </nav>
          ) : (
            <nav className="mode-screen__actions mode-screen__actions--coop" aria-label={title}>
              <GameMenuAction data-menu-default label={text.lobby.localCoopTitle} detail={text.lobby.localCoopDesc} onClick={() => openMultiplayerLobby('local')} />
              <GameMenuAction label={text.lobby.onlineCoopTitle} detail={text.lobby.onlineCoopDesc} onClick={() => openMultiplayerLobby('online')} />
              <GameMenuAction label={text.lobby.sameScreenCoopTitle} detail={text.lobby.sameScreenCoopDesc} onClick={() => setScreen('raidSameScreenBriefing')} />
            </nav>
          )}
          <GameMenuHints language={language} />
        </section>

        {playerNamePrompt}
        {runResultsOverlay}
      </div>
    )
  }

  if (screen === 'raidSameScreenBriefing') {
    const selectedGuestShip = sameScreenShipOptions.find((ship) => ship.key === sameScreenGuestShipKey) ?? sameScreenShipOptions[0]

    return (
      <div className="mode-screen coop-briefing-screen">
        <div className="mode-screen__panel mode-screen__panel--briefing">
          <GameButton tone="quiet" className="mode-screen__back" onClick={() => setScreen('raidCoopMode')}>
            {text.lobby.back}
          </GameButton>

          <div className="mode-screen__eyebrow">{text.lobby.sameScreenEyebrow}</div>
          <h1>{text.lobby.sameScreenCoopTitle}</h1>
          <p>{text.lobby.sameScreenCopy}</p>

          <div className="same-screen-briefing">
            <div className="same-screen-briefing__card">
              <span>{text.lobby.sameScreenP1}</span>
              <strong>{text.lobby.sameScreenP1Controls}</strong>
            </div>
            <div className="same-screen-briefing__card same-screen-briefing__card--accent">
              <span>{text.lobby.sameScreenP2}</span>
              <strong>{text.lobby.sameScreenP2Controls}</strong>
            </div>
          </div>

          <div className="same-screen-ships" aria-label={text.lobby.sameScreenP2Ship}>
            <span>{text.lobby.sameScreenP2Ship}</span>
            <div className="same-screen-ships__grid">
              {sameScreenShipOptions.map((ship) => {
                const shipCopy = raidText.ships[ship.key as keyof typeof raidText.ships] ?? ship
                const spriteKey = getDefaultPlayerVisualShipKey(ship.key, progress)
                return (
                  <button
                    key={ship.key}
                    type="button"
                    className={sameScreenGuestShipKey === ship.key ? 'same-screen-ships__button same-screen-ships__button--active' : 'same-screen-ships__button'}
                    aria-pressed={sameScreenGuestShipKey === ship.key}
                    onClick={() => setSameScreenGuestShipKey(ship.key)}
                  >
                    <RaidShipSprite shipKey={spriteKey} size={ship.key === 'mesiah' || ship.key === 'coreLander' ? 50 : 42} />
                    <strong>{ship.key === 'coreLander' ? getRaidGundamName(spriteKey) : shipCopy.name}</strong>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mode-screen__actions mode-screen__actions--briefing">
            <button className="mode-screen__button" data-controller-back onClick={() => setScreen('raidCoopMode')}>
              <strong>{text.lobby.back}</strong>
            </button>
            <button className="mode-screen__button" disabled={!selectedGuestShip} onClick={startSameScreenCoop}>
              <strong>{text.lobby.sameScreenStart}</strong>
            </button>
          </div>
        </div>

        {playerNamePrompt}
        {runResultsOverlay}
      </div>
    )
  }

  if (screen === 'leaderboards') {
    return (
      <>
        <LeaderboardsScreen playerName={guestPilot ? null : playerName} language={language} onBack={() => setScreen('title')} onChooseCallsign={() => setShowPlayerNamePrompt(true)} />
        {playerNamePrompt}
        {runResultsOverlay}
      </>
    )
  }

  if (PROGRESSION_VIEWS.includes(screen as ProgressionView)) {
    const avatarOwner = getAvatarOwner()
    return (
      <>
        <ProgressionScreen
          key={screen === 'profile' ? avatarOwner : screen}
          view={screen as ProgressionView}
          progress={progress}
          language={language}
          playerName={commander}
          account={{
            avatar, guest: guestPilot, status: syncLabel, recoveryCode,
            onManage: openProfileAccount,
            onAvatarChange: (picture) => updateAvatar(avatarOwner, picture),
          }}
          onBack={() => setScreen('title')}
          onPlayCutscenes={startCodexCutscenePlayback}
          onProgressChange={(nextProgress) => {
            setProgress(nextProgress)
            syncCloudProgress(nextProgress)
          }}
        />
        {playerNamePrompt}
        {runResultsOverlay}
      </>
    )
  }

  if (screen === 'raidMultiplayer') {
    return (
      <>
        <RaidMultiplayerLobby
          playerName={playerName}
          language={language}
          connectionMode={raidMultiplayerConnectionMode}
          onBack={() => setScreen('raidCoopMode')}
          onStart={(session) => {
            setPlayingCodexStory(false)
            setRaidMultiplayerSession(session)
            setRaidSameScreenCoop(false)
            setRaidLaunchMode('campaign')
            setScreen('game')
          }}
        />
        {playerNamePrompt}
        {runResultsOverlay}
      </>
    )
  }

  return (
    <div className="app">
      <GradiusRaid
        onClose={closeRocketRaid}
        initialMode={raidLaunchMode}
        initialShipKey={raidMultiplayerSession || raidSameScreenCoop || (hangarShipKey === 'mesiah' && !canPlayGradiusEndless) || (hangarShipKey === 'coreLander' && !isCoreLanderUnlocked(progress)) ? undefined : hangarShipKey}
        multiplayerSession={raidMultiplayerSession}
        sameScreenCoop={raidSameScreenCoop}
        sameScreenGuestShipKey={sameScreenGuestShipKey}
        playerName={playerName}
        language={language}
        onRunComplete={handleRunComplete}
      />
      {playerNamePrompt}
      {runResultsOverlay}
    </div>
  )
}

export default App


