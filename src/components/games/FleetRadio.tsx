import type { ReactNode } from 'react'
import './fleetRadio.css'

export function FleetRadio({ children }: { children: ReactNode }) {
  return <div className="fleet-radio" role="status">{children}</div>
}
