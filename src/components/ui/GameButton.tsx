import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { playGameSound } from '../games/sound'

type GameButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: 'primary' | 'secondary' | 'danger' | 'quiet'
}

export function GameButton({ tone = 'secondary', className = '', children, type = 'button', onClick, ...props }: GameButtonProps) {
  return (
    <button type={type} className={`game-button game-button--${tone} ${className}`} {...props} onClick={(event) => {
      playGameSound('select')
      onClick?.(event)
    }}>
      <span>{children}</span>
    </button>
  )
}

type GameMenuActionProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  label: ReactNode
  detail?: ReactNode
  icon?: ReactNode
}

export function GameMenuAction({ label, detail, icon, className = '', onClick, ...props }: GameMenuActionProps) {
  return (
    <button type="button" className={`game-menu-action${icon ? ' game-menu-action--icon' : ''} ${className}`} {...props} onClick={(event) => {
      playGameSound('select')
      onClick?.(event)
    }}>
      {icon && <span className="game-menu-action__icon" aria-hidden="true">{icon}</span>}
      <span className="game-menu-action__copy">
        <strong>{label}</strong>
        {detail && <small>{detail}</small>}
      </span>
    </button>
  )
}
