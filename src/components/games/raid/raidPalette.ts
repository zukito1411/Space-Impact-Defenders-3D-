export type RaidPalette = {
  baseTop: string
  baseMid: string
  baseBottom: string
  surfaceMode: string
  surfaceA: string
  surfaceB: string
  surfaceC: string
  bgA: string
  bgB: string
  nebulaA: string
  nebulaB: string
  starTint: string
  streak: string
  planetA: string
  planetB: string
  planetC: string
}

export const DEFAULT_RAID_PALETTE: RaidPalette = {
  baseTop: '#020307',
  baseMid: '#060812',
  baseBottom: '#070a10',
  surfaceMode: 'ruins',
  surfaceA: '#172033',
  surfaceB: '#243447',
  surfaceC: '#64748b',
  bgA: 'rgba(239, 35, 60, 0.16)',
  bgB: 'rgba(14, 165, 233, 0.13)',
  nebulaA: 'rgba(127, 29, 29, 0.3)',
  nebulaB: 'rgba(8, 47, 73, 0.32)',
  starTint: 'rgba(248, 113, 113, 0.64)',
  streak: 'rgba(239, 35, 60, 0.5)',
  planetA: '#7c3aed',
  planetB: '#7f1d1d',
  planetC: '#164e63',
}
