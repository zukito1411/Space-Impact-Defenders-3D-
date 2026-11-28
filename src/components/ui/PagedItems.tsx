import { useCallback, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { getReleaseText } from '../../i18n'
import { GameButton } from './GameButton'

type PageCopy = Pick<ReturnType<typeof getReleaseText>['cutsceneArchive'], 'previous' | 'next'>

const compactQuery = '(orientation: landscape) and (max-height: 420px), (orientation: portrait) and (max-height: 600px)'

export function useCompactScreen(query = compactQuery) {
  const subscribe = useCallback((onChange: () => void) => {
    const media = window.matchMedia(query)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [query])
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false)
}

export function PagedItems<T>({ items, size, copy, children }: {
  items: readonly T[]
  size: number
  copy: PageCopy
  children: (visibleItems: readonly T[]) => ReactNode
}) {
  const [index, setIndex] = useState(0)
  const pageCount = Math.max(1, Math.ceil(items.length / size))
  const page = Math.min(pageCount - 1, Math.floor(index / size))

  return (
    <div className="paged-items">
      {children(items.slice(page * size, (page + 1) * size))}
      {pageCount > 1 && (
        <div className="paged-items__controls">
          <GameButton tone="quiet" aria-label={copy.previous} onClick={() => setIndex(((page + pageCount - 1) % pageCount) * size)}>‹</GameButton>
          <output aria-live="polite">{page + 1} / {pageCount}</output>
          <GameButton tone="quiet" aria-label={copy.next} onClick={() => setIndex(((page + 1) % pageCount) * size)}>›</GameButton>
        </div>
      )}
    </div>
  )
}

export function ScreenSections<T extends string>({ active, labels, label, onChange }: {
  active: T
  labels: Record<T, string>
  label: string
  onChange: (section: T) => void
}) {
  return (
    <div className="screen-sections" role="group" aria-label={label}>
      {(Object.entries(labels) as [T, string][]).map(([section, text]) => (
        <GameButton key={section} tone="quiet" aria-pressed={active === section} onClick={() => onChange(section)}>{text}</GameButton>
      ))}
    </div>
  )
}
