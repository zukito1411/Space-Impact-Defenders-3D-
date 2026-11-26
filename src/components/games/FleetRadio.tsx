import type { ReactNode } from 'react'
import './fleetRadio.css'

export function FleetRadio({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="fleet-radio" role="status">
      <span className="fleet-mark" aria-hidden="true" />
      <div><strong>{name}</strong>{children}</div>
    </div>
  )
}
