import { existsSync, statSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Fail production builds before a Netlify deploy or signed Android release
// if the shared menu artwork was not copied from public/ into dist/.
const campaignBossAssets = JSON.parse(readFileSync('docs/campaign-boss-art-manifest.json', 'utf8')).assets
const bankingRegistrations = JSON.parse(readFileSync('src/components/games/raid/bankingAnchors.json', 'utf8'))
const modelKeys=Object.keys(JSON.parse(readFileSync('public/assets/ships/models/v1/manifest.json','utf8')))
const mechs=['godGundam','godGundamBurning','spiegel']
const required = [
  'assets/ships/models/v1/manifest.json',
  ...modelKeys.map(key=>`assets/ships/models/v1/${key}.glb`),
  ...['god-gundam.png','god-gundam-burning.png','spiegel.png'].map(file=>`assets/ships/${file}`),
  ...Object.keys(bankingRegistrations).filter(key=>!mechs.includes(key)).flatMap(key=>['portrait','landscape'].map(view=>
    `assets/ships/previews/${key}-${view}-v${view==='landscape'?7:5}.webp`)),
  ...['god-gundam-flight-v4','god-gundam-burning-flight-v5','spiegel-flight-v2',
    'god-gundam-two-palm-v1','god-gundam-burning-two-palm-v1','spiegel-actions-v1',
    'god-gundam-launch-v3','spiegel-launch-v1'].map(file=>`assets/ships/sideview/${file}.webp`),
  ...['punch','kick','uppercut-1','uppercut-2','katana-1','katana-2','spiegel-attack','spiegel-kick',
    'spiegel-kunai-throw','spiegel-kunai-throw-above','spiegel-punch','spiegel-shadow-attack',
    'spiegel-spin','spiegel-stop','spiegel-upper-attack'].map(file=>`assets/G-gundam-attacks/${file}.png`),
  'assets/raid-fx/planet-weather-atlas-v1.webp',
  'assets/raid-fx/celestial-detail-atlas-v1.webp',
  'audio/immersion/manifest.json',
  ...JSON.parse(readFileSync('public/audio/immersion/manifest.json', 'utf8')).files.map(entry => entry.file),
  'assets/carrier/dock-clamp-atlas-v2.png',
  'assets/carrier/deck-cockpit-v1.webp',
  'assets/carrier/deck-props-v1.webp',
  'assets/carrier/deck-workers-v1.webp',
  'assets/carrier/deck-repair-v1.webp',
  'assets/carrier/deck-crew-motion-v1.webp',
  'assets/brand/zuki-logo-v1.png',
  'assets/carrier/carrier-bay-landscape-v1.webp',
  'assets/carrier/carrier-bay-portrait-v1.webp',
  ...campaignBossAssets.map((asset) => asset.path.replace(/^public\//, '')),
  ...Array.from({length:8},(_,index)=>`assets/aliens/alien_v${index}.png`),
  ...Array.from({length:5},(_,index)=>`assets/aliens/elite_${index}.png`),
  'assets/aliens/fighter-auric-artillery-v1.webp',
  'assets/aliens/fighter-cinder-interceptor-v1.webp',
  'assets/aliens/fighter-crimson-ram-v1.webp',
  'assets/aliens/fighter-jade-sensor-v1.webp',
  'assets/aliens/fighter-needle-scout-v1.webp',
  'assets/aliens/fighter-violet-gunship-v1.webp',
  'assets/raid-fx/wreck-ships-v1.webp',
  'assets/raid-fx/wreck-stations-v1.webp',
  'assets/raid-fx/terrain-water-v1.webp',
  'assets/raid-fx/terrain-basalt-v1.webp',
  'assets/raid-fx/destination-worlds-v1.webp',
  'assets/raid-fx/cosmos-regions-v1.webp',
  'assets/raid-fx/cosmos-regions-remaster-v2.webp',
  'assets/raid-fx/cosmos-landmarks-remaster-v2.webp',
  'assets/raid-fx/destination-worlds-remaster-v2.webp',
  'assets/raid-fx/wreck-ships-remaster-v2.webp',
  'assets/raid-fx/wreck-stations-remaster-v2.webp',
  'assets/raid-fx/cosmos-landmarks-v1.webp',
  'audio/cosmos-hull-v1.ogg',
  'audio/mesiah/amber-ringway.ogg',
  'audio/mesiah/silent-fleet.ogg',
  'audio/mesiah/violet-deepfield.ogg',
  'audio/mesiah/flight-deck.ogg',
  'audio/mesiah/command-fleet.ogg',
  'audio/mesiah/industrial-command.ogg',
  'audio/mesiah/devil-gundam.ogg',
  'audio/mesiah/hangar-bed.ogg',
  'audio/mesiah/hangar-ventilation.ogg',
  'audio/mesiah/transmission-link.ogg',
  'audio/mesiah/thruster-heat.ogg',
  'audio/mesiah/thruster-release.ogg',
  'audio/mesiah/hostile-channel.ogg',
  'assets/ui/mesiah-hostile-hologram-v1.webp',
  'assets/ui/mesiah-commander-hologram-v1.webp',
  'audio/sfx_boss_battle.mp3',
  'audio/bgm_boss_squid.mp3',
  'audio/bgm_boss_snake.mp3',
  'audio/bgm_boss_final.wav',
  'audio/boss/beam-charge.ogg',
  'audio/boss/beam-fire.ogg',
  'audio/boss/cannon.ogg',
  'audio/boss/creature-strike.ogg',
  'audio/boss/venom.ogg',
  'assets/raid-fx/player-missiles-v1.webp',
  'assets/raid-fx/nuke-missile-v1.webp',
  'assets/ui/space-door-v1.webp',
  'assets/ui/orbital-hangar-v1.png',
  'assets/ui/console-plate-v1.png',
  'assets/raid-fx/combat-atlas-v2.png',
  'assets/raid-fx/explosion-atlas-v2.png',
  'assets/raid-fx/boss-atlas-v1.png',
  'assets/raid-fx/boss-combat-effects-v1.webp',
  'assets/raid-fx/boss-plasma-beam-v1.webp',
]

for (const asset of required) {
  const source = join('public', asset)
  const destination = join('dist', asset)
  if (!existsSync(source) || !existsSync(destination)) {
    throw new Error(`Missing production asset: ${asset} (source: ${existsSync(source)}, dist: ${existsSync(destination)})`)
  }
  const expected = statSync(source).size
  const actual = statSync(destination).size
  if (actual !== expected || actual === 0) {
    throw new Error(`Production asset corrupted: ${asset} (expected ${expected} bytes, found ${actual})`)
  }
  console.log(`Verified production art: ${asset} (${actual} bytes)`)
}

console.log('All shared UI and raid artwork assets are present in dist.')
