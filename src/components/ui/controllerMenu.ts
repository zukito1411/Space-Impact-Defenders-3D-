import { controllerDirection, type RaidController } from '../../controllers'

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

export function foregroundDialog() {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')).pop()
}

export function getMenuControls(scope: Document | HTMLElement) {
  return Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(control => {
    const rect = control.getBoundingClientRect()
    return control.tabIndex >= 0 && !control.matches(':disabled') && !control.closest('[inert], [aria-hidden="true"]')
      && rect.width > 0 && rect.height > 0 && getComputedStyle(control).visibility !== 'hidden'
  })
}

export function markControllerMenuInput() {
  document.documentElement.dataset.menuInput = 'controller'
}

export class ControllerMenuNavigation {
  private direction = ''
  private next = 0

  move(pad: RaidController | undefined, time: number, scope: Document | HTMLElement) {
    const axis = pad ? controllerDirection(pad, .5) : { x: 0, y: 0 }
    const horizontal = Math.abs(axis.x) > Math.abs(axis.y)
    const sign = Math.sign(horizontal ? axis.x : axis.y)
    if (!sign) {
      this.direction = ''
      return
    }
    const direction = `${horizontal}:${sign}`
    if (direction === this.direction && time < this.next) return
    this.next = time + (direction === this.direction ? 145 : 285)
    this.direction = direction
    markControllerMenuInput()
    const controls = getMenuControls(scope)
    const active = controls.find(control => control === document.activeElement)
    if (horizontal && active instanceof HTMLInputElement && active.type === 'range') {
      const previous = active.value
      const step = Number(active.step) || 1
      const value = Math.max(Number(active.min || 0), Math.min(Number(active.max || 100), Number(previous) + step * sign))
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(active, String(value))
      if (active.value !== previous) active.dispatchEvent(new Event('input', { bubbles: true }))
      return
    }
    if (horizontal && active instanceof HTMLSelectElement) {
      const previous = active.selectedIndex
      active.selectedIndex = Math.max(0, Math.min(active.options.length - 1, previous + sign))
      if (active.selectedIndex !== previous) active.dispatchEvent(new Event('change', { bubbles: true }))
      return
    }

    let next: HTMLElement | undefined = controls.find(control => control.matches('[data-menu-default], [data-dialog-initial-focus]')) ?? controls[0]
    if (active) {
      const origin = active.getBoundingClientRect()
      let best = Infinity
      next = undefined
      for (const control of controls) {
        if (control === active) continue
        const rect = control.getBoundingClientRect()
        const x = rect.left + rect.width / 2 - (origin.left + origin.width / 2)
        const y = rect.top + rect.height / 2 - (origin.top + origin.height / 2)
        const forward = sign * (horizontal ? x : y)
        if (forward <= 4) continue
        const distance = forward + 2.8 * Math.abs(horizontal ? y : x)
        if (distance < best) {
          next = control
          best = distance
        }
      }
    }
    if (!next) return
    next.focus({ preventScroll: true })
    next.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }
}

export function confirmControllerControl(scope: Document | HTMLElement, preferred = '[data-menu-default], [data-dialog-initial-focus]') {
  const controls = getMenuControls(scope)
  const control = controls.find(item => item === document.activeElement) ?? controls.find(item => item.matches(preferred)) ?? controls[0]
  if (!control) return
  markControllerMenuInput()
  control.focus({ preventScroll: true })
  if (control instanceof HTMLButtonElement || control instanceof HTMLAnchorElement
    || (control instanceof HTMLInputElement && ['checkbox', 'radio'].includes(control.type))) control.click()
}

export function dismissControllerDialog(dialog: HTMLElement) {
  const dismiss = getMenuControls(dialog).find(control => control.hasAttribute('data-dialog-dismiss'))
  if (dismiss) dismiss.click()
  else if (dialog.hasAttribute('data-game-dialog')) dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  else return false
  return true
}
