import { getDefaultPlayerVisualShipKey, getRaidGundamName } from './games/raid/state'
import { GameButton } from './ui/GameButton'
import { useEffect, useMemo, useRef, useState } from 'react'
import { RaidShipSprite } from './games/RaidShipSprite'
import { getLanguageText, getRaidText, type LanguageCode } from '../i18n'
import { isNativeLanRelayAvailable, startLanRelay } from '../native/lanRelay'
import { isCoreLanderUnlocked, isGradiusRaidEndlessUnlocked, loadProgress } from '../progression'

const DEFAULT_RAID_RELAY_URL = 'https://space-raid-relay.onrender.com'

type RoomPlayer = {
  id: string
  name: string
  ready: boolean
  host: boolean
  shipKey: string
  visualShipKey?: string
}

type RoomSnapshot = {
  code: string
  players: RoomPlayer[]
}

type RelayMessage =
  | { type: 'hello'; peerId: string; capabilities?: string[] }
  | { type:'room-list'; rooms:PublicRoom[] }
  | { type: 'room-created' | 'room-joined' | 'room-update'; room: RoomSnapshot | null }
  | { type: 'game-started'; room: RoomSnapshot | null }
  | { type: 'game-message'; from: string; payload: unknown }
  | { type: 'left-room' }
  | { type: 'error'; message: string }
  | { type: 'pong'; at: number }

type PublicRoom = {code:string;hostName:string;shipKey:string;playerCount:number;capacity:number;createdAt:number}

export type RaidMultiplayerSession = {
  connectionMode?: 'online' | 'local'
  socket: WebSocket
  peerId: string
  roomCode: string
  isHost: boolean
  players: RoomPlayer[]
}

export type RaidMultiplayerConnectionMode = 'online' | 'local'

type RaidMultiplayerLobbyProps = {
  playerName: string
  language: LanguageCode
  connectionMode: RaidMultiplayerConnectionMode
  onBack: () => void
  onStart: (session: RaidMultiplayerSession) => void
}

const getDefaultRelayUrl = () => {
  const configuredUrl = import.meta.env.VITE_RAID_RELAY_URL
  if (configuredUrl) return configuredUrl

  if (
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    ['5173', '4173'].includes(window.location.port)
  ) {
    const relayHost = window.location.hostname.includes(':')
      ? `[${window.location.hostname}]`
      : window.location.hostname
    return `ws://${relayHost}:8787`
  }

  return DEFAULT_RAID_RELAY_URL
}

const isLocalRelayEndpoint = (value: string) => (
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1)/i.test(value)
)

const normalizeRelayUrl = (value: string, preferLocal = false) => {
  const trimmed = value.trim()
  if (!trimmed) return ''

  if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) return trimmed
  if (trimmed.startsWith('http://')) return `ws://${trimmed.slice('http://'.length)}`
  if (trimmed.startsWith('https://')) return `wss://${trimmed.slice('https://'.length)}`

  return `${preferLocal || isLocalRelayEndpoint(trimmed) ? 'ws' : 'wss'}://${trimmed}`
}

const normalizeLanEndpoint = (value: string) => {
  const trimmed = value.trim().replace(/^wss?:\/\//i, '').replace(/^https?:\/\//i, '').replace(/\/+$/, '')
  if (!trimmed) return ''
  return trimmed.includes(':') ? trimmed : `${trimmed}:8787`
}

const isValidLanEndpoint = (endpoint: string) => {
  try {
    const url = new URL(`http://${endpoint}`)
    const port = Number(url.port || '8787')
    const isValidPort = Number.isInteger(port) && port > 0 && port <= 65535
    const isPlainEndpoint = url.pathname === '/' && !url.search && !url.hash
    const isLocalhost = url.hostname.toLowerCase() === 'localhost'
    const isIpv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(url.hostname)
      && url.hostname.split('.').every((part) => Number(part) >= 0 && Number(part) <= 255)

    return isValidPort && isPlainEndpoint && (isLocalhost || isIpv4)
  } catch {
    return false
  }
}

const probeLanEndpoint = async (endpoint: string) => {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 4500)
  try {
    const response = await fetch(`http://${endpoint}/health?t=${Date.now()}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok) throw new Error('LAN relay health check failed')
  } finally {
    window.clearTimeout(timeout)
  }
}

const SHIP_OPTIONS = [
  { key: 'rocket', name: 'Black Comet' },
  { key: 'fast', name: 'Red Wraith' },
  { key: 'gatling', name: 'Crimson Saw' },
  { key: 'laser', name: 'Night Lance' },
  { key: 'dreadnought', name: 'Obsidian Ark' },
  { key: 'xwing', name: 'Crosswing Nova' },
  { key: 'spaceEt', name: 'Space Jet' },
  { key: 'mesiah', name: 'Mesiah' },
  { key: 'coreLander', name: 'God Gundam' },
]

const getShipName = (shipKey: string) => SHIP_OPTIONS.find((ship) => ship.key === shipKey)?.name ?? 'Black Comet'

const getLobbyShipSize = (shipKey: string) => {
  if (shipKey === 'mesiah') return 58
  if (shipKey === 'coreLander') return 56
  if (shipKey === 'dreadnought') return 52
  if (shipKey === 'spaceEt') return 54
  if (shipKey === 'xwing') return 50
  return 48
}

const getMultiplayerShipOptions = (progress: ReturnType<typeof loadProgress>) => (
  SHIP_OPTIONS.filter((ship) => {
    if (ship.key === 'mesiah') return isGradiusRaidEndlessUnlocked(progress)
    if (ship.key === 'coreLander') return isCoreLanderUnlocked(progress)
    return true
  })
)

export function RaidMultiplayerLobby({ playerName, language, connectionMode, onBack, onStart }: RaidMultiplayerLobbyProps) {
  const text = getLanguageText(language).lobby
  const raidText = getRaidText(language)
  const getLocalizedShipName = (shipKey: string, visualKey?: string) => shipKey === 'coreLander'
    ? getRaidGundamName(visualKey ?? getDefaultPlayerVisualShipKey(shipKey, progress))
    : raidText.ships[shipKey as keyof typeof raidText.ships]?.name ?? getShipName(shipKey)
  const progress = useMemo(() => loadProgress(), [])
  const availableShipOptions = useMemo(() => getMultiplayerShipOptions(progress), [progress])
  const messageHandlerRef = useRef<(message:RelayMessage)=>void>(()=>{})
  const aliveRef = useRef(true)
  const socketRef = useRef<WebSocket | null>(null)
  const handoffRef = useRef(false)
  const roomRef = useRef<RoomSnapshot | null>(null)
  const peerIdRef = useRef<string | null>(null)
  const [selectedShipKey, setSelectedShipKey] = useState(SHIP_OPTIONS[0].key)
  const getSelectedShipPayload = (shipKey = selectedShipKey) => ({
    shipKey,
    visualShipKey: getDefaultPlayerVisualShipKey(shipKey, progress),
  })
  const onlineRelayUrl = useMemo(getDefaultRelayUrl, [])
  const [joinCode, setJoinCode] = useState('')
  const [publicRooms,setPublicRooms]=useState<PublicRoom[]>([])
  const [publicRoom,setPublicRoom]=useState(true)
  const [directoryAvailable,setDirectoryAvailable]=useState<boolean|null>(null)
  const [localHostInput, setLocalHostInput] = useState('')
  const [localHostAddress, setLocalHostAddress] = useState('')
  const [room, setRoom] = useState<RoomSnapshot | null>(null)
  const [peerId, setPeerId] = useState<string | null>(null)
  const [status, setStatus] = useState<string>(text.statusInitial)
  const [error, setError] = useState('')
  const [connecting, setConnecting] = useState(false)
  const isLocalMode = connectionMode === 'local'
  const canHostLocalRelay = !isLocalMode || isNativeLanRelayAvailable()

  const ownPlayer = useMemo(
    () => room?.players.find((player) => player.id === peerId) ?? null,
    [peerId, room],
  )
  const canStart = Boolean(room && room.players.length === 2 && room.players.every((player) => player.ready))

  useEffect(() => {
    roomRef.current = room
  }, [room])

  useEffect(() => {
    peerIdRef.current = peerId
  }, [peerId])

  useEffect(() => {
    if (ownPlayer?.shipKey) setSelectedShipKey(ownPlayer.shipKey)
  }, [ownPlayer?.shipKey])

  useEffect(() => {
    if (availableShipOptions.some((ship) => ship.key === selectedShipKey)) return
    setSelectedShipKey(availableShipOptions[0]?.key ?? SHIP_OPTIONS[0].key)
  }, [availableShipOptions, selectedShipKey])

  useEffect(() => {
    aliveRef.current=true
    return () => {
      aliveRef.current=false
      if (!handoffRef.current) {
        socketRef.current?.close()
        socketRef.current = null
      }
    }
  }, [])

  const connect = (onOpen: (socket: WebSocket) => void, relayTarget = onlineRelayUrl) => {
    if(!isLocalMode && socketRef.current?.readyState===WebSocket.OPEN){setError('');onOpen(socketRef.current);return}
    const url = normalizeRelayUrl(relayTarget, isLocalMode)
    if (!url) {
      setError(text.noService)
      return
    }

    setError('')
    setConnecting(true)
    setStatus(text.connecting)

    socketRef.current?.close()
    setPeerId(null);peerIdRef.current=null
    const socket = new WebSocket(url)
    socketRef.current = socket
    let opened = false
    const connectTimeout = window.setTimeout(() => {
      if (opened || socketRef.current !== socket) return
      if (socketRef.current === socket) {
        setConnecting(false)
        setStatus(text.disconnected)
        setError(`${text.unreachable} ${relayTarget}`)
        socketRef.current = null
      }
      socket.close()
    }, isLocalMode?9000:30000)
    const clearConnectTimeout = () => window.clearTimeout(connectTimeout)

    socket.onopen = () => {
      if (socketRef.current !== socket) return
      opened = true
      clearConnectTimeout()
      setConnecting(false)
      setStatus(text.connected)
      onOpen(socket)
    }

    socket.onmessage = (event) => {
      if (socketRef.current !== socket) return
      try {
        const message = JSON.parse(event.data) as RelayMessage
        if(!handoffRef.current)messageHandlerRef.current(message)
      } catch {
        setError(text.unreadable)
      }
    }

    socket.onerror = () => {
      if (socketRef.current !== socket) return
      clearConnectTimeout()
      setConnecting(false)
      setError(text.unreachable)
    }

    socket.onclose = () => {
      clearConnectTimeout()
      if (socketRef.current !== socket || !aliveRef.current) return
      setConnecting(false)
      setStatus(text.disconnected)
      setRoom(null);roomRef.current=null;setPublicRooms([]);setDirectoryAvailable(null)
      socketRef.current = null
    }
  }

  const send = (socket: WebSocket | null, payload: Record<string, unknown>) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setError(text.notConnected)
      return
    }

    socket.send(JSON.stringify(payload))
  }

  const handleRelayMessage = (message: RelayMessage) => {
    if (message.type === 'hello') {
      peerIdRef.current=message.peerId
      setPeerId(message.peerId)
      if(!isLocalMode){
        const available=message.capabilities?.includes('public-rooms-v1') ?? false
        setDirectoryAvailable(available)
        if(available)send(socketRef.current,{type:'list-rooms'})
      }
      return
    }

    if(message.type==='room-list'){
      if(Array.isArray(message.rooms))setPublicRooms(message.rooms.filter(room=>room && typeof room.code==='string' && typeof room.hostName==='string' && room.playerCount===1 && room.capacity===2).slice(0,64))
      setDirectoryAvailable(true);return
    }

    if (message.type === 'room-created') {
      roomRef.current=message.room
      setRoom(message.room)
      setError('');setStatus(text.roomCreated)
      return
    }

    if (message.type === 'room-joined') {
      roomRef.current=message.room
      setRoom(message.room)
      setError('');setStatus(text.roomJoined)
      return
    }

    if (message.type === 'room-update') {
      roomRef.current=message.room
      setRoom(message.room)
      if (message.room?.players.length === 2) {
        setStatus(text.secondLinked)
      }
      return
    }

    if (message.type === 'game-started') {
      const startedRoom = message.room ?? roomRef.current
      const currentPeerId = peerIdRef.current
      const socket = socketRef.current
      if (!startedRoom || !currentPeerId || !socket) return

      const ownPlayer = startedRoom.players.find((player) => player.id === currentPeerId)
      if (!ownPlayer) return

      handoffRef.current = true
      onStart({
        socket,
        connectionMode,
        peerId: currentPeerId,
        roomCode: startedRoom.code,
        isHost: ownPlayer.host,
        players: startedRoom.players,
      })
      return
    }

    if (message.type === 'left-room') {
      setRoom(null);roomRef.current=null
      if(!isLocalMode && directoryAvailable)send(socketRef.current,{type:'list-rooms'})
      setStatus(text.leftRoom)
      return
    }

    if (message.type === 'error') {
      setError(message.message)
    }
  }

  const hostRoom = () => {
    if (!isLocalMode) {
      connect((socket) => {
        send(socket, { type: 'create-room', name: playerName, public:!isLocalMode && publicRoom, ...getSelectedShipPayload() })
      })
      return
    }

    if (!isNativeLanRelayAvailable()) {
      setError(text.localHostUnavailable)
      return
    }

    setError('')
    setConnecting(true)
    setStatus(text.localHostStarting)
    void startLanRelay(8787).then((relay) => {
      if(!aliveRef.current)return
      if (!relay.running) {
        setConnecting(false)
        setError(text.localHostUnavailable)
        return
      }

      const port = relay.port || 8787
      const shareUrl = relay.url || (relay.ipAddress ? `ws://${relay.ipAddress}:${port}` : '')
      setLocalHostAddress(shareUrl.replace(/^ws:\/\//i, ''))
      setLocalHostInput(shareUrl.replace(/^ws:\/\//i, ''))
      connect((socket) => {
        send(socket, { type: 'create-room', name: playerName, public:!isLocalMode && publicRoom, ...getSelectedShipPayload() })
      }, `127.0.0.1:${port}`)
    }).catch(() => {
      setConnecting(false)
      setError(text.localHostUnavailable)
    })
  }

  const joinRoom = (listedCode?:string) => {
    const code = (listedCode ?? joinCode).trim().toUpperCase()
    if (!code) {
      setError(text.enterCode)
      return
    }

    if (isLocalMode) {
      const endpoint = normalizeLanEndpoint(localHostInput)
      if (!endpoint) {
        setError(text.enterHostAddress)
        return
      }
      if (!isValidLanEndpoint(endpoint)) {
        setError(text.invalidHostAddress)
        return
      }

      setError('')
      setConnecting(true)
      setStatus(text.connecting)
      void probeLanEndpoint(endpoint).then(() => {
        if(!aliveRef.current)return
        connect((socket) => {
          send(socket, { type: 'join-room', name: playerName, roomCode: code, ...getSelectedShipPayload() })
        }, endpoint)
      }).catch(() => {
        setConnecting(false)
        setStatus(text.disconnected)
        setError(`${text.unreachable} ${endpoint}`)
      })
      return
    }

    connect((socket) => {
      send(socket, { type: 'join-room', name: playerName, roomCode: code, ...getSelectedShipPayload() })
    })
  }

  const chooseShip = (shipKey: string) => {
    setSelectedShipKey(shipKey)
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      send(socketRef.current, { type: 'set-ship', ...getSelectedShipPayload(shipKey) })
    }
  }

  const toggleReady = () => {
    send(socketRef.current, { type: 'set-ready', ready: !ownPlayer?.ready })
  }

  const startCoop = () => {
    send(socketRef.current, { type: 'start-game' })
  }

  const leaveRoom = () => {
    send(socketRef.current, { type: 'leave-room' })
    if(isLocalMode)socketRef.current?.close()
    setRoom(null);roomRef.current=null
  }

  messageHandlerRef.current=handleRelayMessage
  useEffect(()=>{
    if(!isLocalMode)connect(()=>{})
    const heartbeat=window.setInterval(()=>{
      const socket=socketRef.current
      if(socket?.readyState===WebSocket.OPEN && !handoffRef.current)socket.send(JSON.stringify({type:'ping'}))
    },10000)
    return ()=>window.clearInterval(heartbeat)
  },[isLocalMode])

  const refreshRooms=()=>connect(socket=>send(socket,{type:'list-rooms'}))

  const joinFields=(
    <form className="coop-lobby__join" aria-busy={connecting} onSubmit={event=>{event.preventDefault();joinRoom()}}>
      {isLocalMode && <label><span>{text.localHostAddress}</span><input value={localHostInput}
        placeholder={text.localHostPlaceholder} disabled={connecting} autoCapitalize="off" autoCorrect="off" spellCheck={false}
        inputMode="url" onChange={event=>setLocalHostInput(event.target.value)} /></label>}
      <label><span>{text.roomCode}</span><input value={joinCode} placeholder={text.roomPlaceholder}
        maxLength={12} disabled={connecting} autoCapitalize="characters" autoCorrect="off" spellCheck={false}
        onChange={event=>setJoinCode(event.target.value.toUpperCase())} /></label>
      <GameButton type="submit" disabled={connecting}>{text.join}</GameButton>
    </form>
  )

  return (
    <div className="mode-screen coop-lobby-screen">
      <div className="mode-screen__stars" />
      <div className="mode-screen__panel raid-lobby coop-lobby">
        <header className="coop-lobby__header">
          <GameButton tone="quiet" data-controller-back onClick={onBack}>{text.back}</GameButton>
          <div className="coop-lobby__intro">
            <span className="mode-screen__eyebrow">{isLocalMode ? text.localEyebrow : text.eyebrow}</span>
            <h1>{isLocalMode ? text.localCoopTitle : text.onlineCoopTitle}</h1>
            <div className="coop-lobby__identity"><span>{getLanguageText(language).player.pilotName}</span><strong title={playerName}>{playerName}</strong></div>
          </div>
        </header>

        <div className="coop-lobby__body">
          <section className="coop-lobby__fleet" aria-label={text.chooseShip}>
            <div className="coop-lobby__fleet-heading"><h2>{text.chooseShip}</h2><span>{getLocalizedShipName(selectedShipKey)}</span></div>
            <div className="coop-lobby__ships">
              {availableShipOptions.map(ship=>{
                const spriteKey=getDefaultPlayerVisualShipKey(ship.key,progress)
                return <button key={ship.key} type="button" data-ship={ship.key}
                  className="coop-lobby__ship" aria-pressed={selectedShipKey===ship.key}
                  onClick={()=>chooseShip(ship.key)} disabled={connecting || Boolean(ownPlayer?.ready)}>
                  <span className="coop-lobby__ship-art" aria-hidden="true"><RaidShipSprite shipKey={spriteKey} size={getLobbyShipSize(ship.key)} /></span>
                  <span>{getLocalizedShipName(ship.key)}</span>
                </button>
              })}
            </div>
          </section>

          <section className="coop-lobby__session" aria-label={isLocalMode ? text.localCoopTitle : text.onlineCoopTitle}>
            {room ? (
              <div className="coop-lobby__room">
                <div className="coop-lobby__code"><span>{text.roomCode}</span><strong>{room.code}</strong></div>
                {isLocalMode && localHostAddress && <div className="coop-lobby__address"><span>{text.localHostAddress}</span><strong>{localHostAddress}</strong></div>}
                <div className="coop-lobby__players">
                  {room.players.map(pilot=>(
                    <div className="coop-lobby__player" key={pilot.id} data-ready={pilot.ready}>
                      <RaidShipSprite shipKey={pilot.visualShipKey ?? pilot.shipKey} size={42} />
                      <div><strong>{pilot.name}</strong><small>{pilot.host?text.host:text.guest} · {getLocalizedShipName(pilot.shipKey,pilot.visualShipKey)}</small></div>
                      <span>{pilot.ready?text.ready:text.waiting}</span>
                    </div>
                  ))}
                  {room.players.length<2 && <div className="coop-lobby__empty-seat"><strong>{text.guest}</strong><span>{text.waiting}</span></div>}
                </div>
                <p>{canStart?text.readyMessage:room.players.length===2?text.secondLinked:text.roomCreated}</p>
                {isLocalMode && localHostAddress && <p>{text.localHostHint}</p>}
              </div>
            ) : (
              <>
                <p className="coop-lobby__copy">{isLocalMode?text.localCopy:text.copy}</p>
                {isLocalMode?joinFields:(
                  <details className="coop-lobby__code-entry"><summary>{text.joinByCode}</summary>{joinFields}</details>
                )}
                {!isLocalMode && <section className="coop-lobby__directory" aria-label={text.onlineRooms}>
                  <div className="coop-lobby__directory-heading"><h2>{text.onlineRooms}</h2>
                    <GameButton tone="quiet" disabled={connecting || directoryAvailable===false} onClick={refreshRooms}>{text.refreshRooms}</GameButton>
                  </div>
                  <div className="coop-lobby__rooms">
                    {publicRooms.map(listed=>(
                      <div className="coop-lobby__listed" key={listed.code}>
                        <div><strong>{listed.hostName}</strong><small>{getLocalizedShipName(listed.shipKey)} · {listed.playerCount}/{listed.capacity}</small></div>
                        <GameButton disabled={connecting} onClick={()=>joinRoom(listed.code)}>{text.join}</GameButton>
                      </div>
                    ))}
                  </div>
                  {!publicRooms.length && <p>{directoryAvailable===false?text.directoryUnavailable:connecting?text.connecting:text.noOpenRooms}</p>}
                </section>}
              </>
            )}
          </section>
        </div>

        <footer className="coop-lobby__footer">
          <div className="coop-lobby__status" role="status" aria-live="polite">{status}</div>
          {error && <div className="coop-lobby__error" role="alert">{error}</div>}
          {room ? (
            <div className="coop-lobby__room-actions">
              <GameButton tone={ownPlayer?.ready?'quiet':'primary'} aria-pressed={Boolean(ownPlayer?.ready)} onClick={toggleReady}>{ownPlayer?.ready?text.cancelReady:text.ready}</GameButton>
              {ownPlayer?.host && <GameButton tone="primary" disabled={!canStart} onClick={startCoop}>{text.startCoop}</GameButton>}
              <GameButton tone="quiet" onClick={leaveRoom}>{text.leave}</GameButton>
            </div>
          ) : (
            <div className="coop-lobby__host-actions">
              {!isLocalMode && <label className="coop-lobby__visibility"><input type="checkbox" checked={publicRoom} onChange={event=>setPublicRoom(event.target.checked)} />{text.listRoomPublicly}</label>}
              {canHostLocalRelay && <GameButton tone="primary" disabled={connecting} onClick={hostRoom}>{isLocalMode?text.startLanHost:text.hostRoom}</GameButton>}
            </div>
          )}
        </footer>
      </div>
    </div>
  )
}
