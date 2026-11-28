import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { useSyncExternalStore } from 'react'

export const ControllerButton = {
  Confirm: 1 << 0, Back: 1 << 1, Special: (1 << 5) | (1 << 7), Start: 1 << 9,
  Up: 1 << 12, Down: 1 << 13, Left: 1 << 14, Right: 1 << 15,
} as const

export type RaidController = { id: string; x: number; y: number; buttons: number }
type NativeState = { controllers: RaidController[]; reset?: boolean }
const NativeControllers = registerPlugin<{
  getState(): Promise<NativeState>
  addListener(event: 'controllerState', listener: (state: NativeState) => void): Promise<PluginListenerHandle>
}>('GameControllers')

const android = Capacitor.getPlatform() === 'android'
const nativePresses = new Map<string, number>()
let nativeState: RaidController[] | undefined
let nativeStarted = false
let browserGamepadBlocked = false
let connected = false
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function useControllerConnected() {
  return useSyncExternalStore(subscribe, () => connected, () => false)
}

function acceptNativeState(state: NativeState, capturePresses: boolean) {
  if (state.reset || document.hidden) nativePresses.clear()
  else if (capturePresses) {
    for (const id of nativePresses.keys()) {
      if (!state.controllers.some(pad => pad.id === id)) nativePresses.delete(id)
    }
    for (const pad of state.controllers) {
      const held = nativeState?.find(previous => previous.id === pad.id)?.buttons ?? 0
      const pressed = pad.buttons & ~held
      if (pressed) nativePresses.set(pad.id, pressed | (nativePresses.get(pad.id) ?? 0))
    }
  }
  nativeState = state.controllers
}

function startNativeControllers() {
  if (nativeStarted || !android || !Capacitor.isPluginAvailable('GameControllers')) return
  nativeStarted = true
  let received = false
  void NativeControllers.addListener('controllerState', state => {
    received = true
    acceptNativeState(state, true)
  }).catch(() => { /* Native input may be unavailable in an older wrapper. */ })
  void NativeControllers.getState().then(state => {
    if (!received) acceptNativeState(state, false)
  }).catch(() => { /* Keep browser input available if the bridge cannot respond. */ })
}

export function readRaidControllers(): readonly RaidController[] {
  startNativeControllers()
  let pads: readonly RaidController[] = []
  // Android owns window focus and resets its input when the activity loses it.
  // The WebView can lack DOM focus while the activity still receives gamepad events.
  if (!document.hidden && (android || document.hasFocus())) {
    if (nativeState?.length) pads = nativeState
    else if (!browserGamepadBlocked && typeof navigator.getGamepads === 'function') {
      try {
        const active: RaidController[] = []
        for (const pad of navigator.getGamepads()) {
          if (!pad?.connected || (pad.mapping !== 'standard' && (pad.axes.length < 2 || pad.buttons.length < 2))) continue
          let buttons = 0
          pad.buttons.forEach((button, index) => {
            if (index < 16 && (button.pressed || button.value > .55)) buttons |= 1 << index
          })
          active.push({ id: `web:${pad.index}`, x: pad.axes[0] ?? 0, y: pad.axes[1] ?? 0, buttons })
        }
        pads = active
      } catch {
        browserGamepadBlocked = true
      }
    }
  }
  if (document.hidden) nativePresses.clear()
  if (connected !== Boolean(pads.length)) {
    connected = Boolean(pads.length)
    for (const listener of listeners) listener()
  }
  return pads
}

/** Keep a pilot's pad assigned even when the other pad disconnects. */
export class RaidControllerInput {
  private first: string | undefined
  private second: string | undefined
  private previous = new Map<string, number>()

  poll(sharedScreen = false) {
    const pads = readRaidControllers()
    if (!pads.length) {
      this.first = this.second = undefined
      this.previous.clear()
      return { primary: undefined, secondary: undefined }
    }
    const connected = new Set(pads.map(pad => pad.id))
    if (!this.first || !connected.has(this.first)) this.first = undefined
    if (!sharedScreen || !this.second || !connected.has(this.second)) this.second = undefined
    for (const pad of pads) {
      if (pad.id === this.first || pad.id === this.second) continue
      // Some Bluetooth drivers expose extra idle logical devices. Assign a
      // native pad when it actually sends input, then keep the pilot slot.
      const active = Math.hypot(pad.x, pad.y) > .18 || pad.buttons || nativePresses.has(pad.id)
      if (pad.id.startsWith('android:') && !active) continue
      if (!this.first) this.first = pad.id
      else if (sharedScreen && !this.second) this.second = pad.id
    }
    const snapshot = (id: string | undefined) => {
      const pad = pads.find(item => item.id === id)
      if (!pad) return undefined
      if (pad.id.startsWith('android:')) {
        const pressed = nativePresses.get(pad.id) ?? 0
        // Preserve a D-pad tap for one frame even if it has already released.
        const directions = ControllerButton.Up | ControllerButton.Down | ControllerButton.Left | ControllerButton.Right
        return { ...pad, buttons: pad.buttons | (pressed & directions), pressed }
      }
      return { ...pad, pressed: pad.buttons & ~(this.previous.get(pad.id) ?? pad.buttons) }
    }
    const primary = snapshot(this.first)
    const secondary = snapshot(this.second)
    nativePresses.clear()
    this.previous.clear()
    for (const pad of pads) this.previous.set(pad.id, pad.buttons)
    return { primary, secondary }
  }
}

export function controllerDirection(pad: RaidController, deadzone = .18) {
  const x = Number(Boolean(pad.buttons & ControllerButton.Right)) - Number(Boolean(pad.buttons & ControllerButton.Left))
  const y = Number(Boolean(pad.buttons & ControllerButton.Down)) - Number(Boolean(pad.buttons & ControllerButton.Up))
  if (x || y) {
    const length = Math.hypot(x, y)
    return { x: x / length, y: y / length }
  }
  const length = Math.hypot(pad.x, pad.y)
  if (!Number.isFinite(length) || length <= deadzone) return { x: 0, y: 0 }
  const magnitude = Math.min(1, (length - deadzone) / (1 - deadzone))
  return { x: pad.x * magnitude / length, y: pad.y * magnitude / length }
}
