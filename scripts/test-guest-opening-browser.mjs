import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, readFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const origin = 'http://127.0.0.1:5210'
const output = process.env.OPENING_REVIEW_OUTPUT
const runtime = await readFile('src/components/games/raid/GradiusRaidRuntime.tsx', 'utf8')
const raidRefs = [...runtime.matchAll(/const (\w+Ref) = useRef/g)].map(match => match[1])
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5210', '--strictPort'], { stdio: 'ignore' })
const stopped = once(server, 'exit')
let browser

async function title(page) {
  await page.goto(origin)
  await page.locator('#startup-splash').waitFor({ state: 'detached', timeout: 30000 })
  assert.equal(await page.getByRole('dialog').count(), 0)
  assert.ok(await page.getByText('Guest pilot', { exact: true }).isVisible())
}

async function capture(page, name) {
  if (output) await page.screenshot({ path: `${output}/${name}.png` })
}

async function assertCompactCaption(caption) {
  const appearance = await caption.evaluate(el => {
    const style = getComputedStyle(el)
    return { background: style.backgroundColor, shadow: style.boxShadow, size: Number.parseFloat(style.fontSize) }
  })
  assert.equal(appearance.background, 'rgba(0, 0, 0, 0)')
  assert.equal(appearance.shadow, 'none')
  assert.ok(appearance.size <= 12, 'In-flight tutorial should fit in a small caption')
}

async function assertProjectileColors(page) {
  await page.evaluate(async () => {
    const { RAID_BOSS_ATLAS_URL, RAID_BOSS_BEAM_URL, applyRaidBossArtwork, getRaidCombatRootTextures, getRaidProjectileMaterial,
      getRaidProjectileTexture, sharesPlayerProjectileArt } =
      await import('/src/components/games/raid/combatArt.ts')
    const { createGpuBossProjectileCanvas } = await import('/src/components/games/raid/gpuBossProjectiles.ts')
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 48
    const context = canvas.getContext('2d', { willReadFrequently: true })
    const read = (source, x, y, width, height) => {
      context.clearRect(0, 0, 48, 48)
      context.drawImage(source, x, y, width, height, 0, 0, 48, 48)
      return context.getImageData(0, 0, 48, 48).data
    }
    const pinkFraction = data => {
      let pink = 0, total = 0
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 20) continue
        total++
        if (data[i] > data[i + 2] && data[i + 2] > data[i + 1] * 1.3) pink++
      }
      return pink / Math.max(1, total)
    }
    const fromTexture = (base, glow) => {
      const texture = getRaidProjectileTexture(base, glow)
      const { x, y, width, height } = texture.frame
      const scale = texture.source.resolution
      return pinkFraction(read(texture.source.resource, x * scale, y * scale, width * scale, height * scale))
    }
    const matching = ['blade', 'needle', 'scatterBoss']
    for (const glow of [false, true]) {
      for (const kind of matching) {
        if (!sharesPlayerProjectileArt(kind) || fromTexture(getRaidProjectileMaterial(kind, true).texture, glow) < .85) {
          throw Error(`Shared hostile projectile ${kind} should be magenta`)
        }
      }
      for (const kind of ['pulse', 'scatter', 'spread']) {
        if (fromTexture(getRaidProjectileMaterial(kind).texture, glow) > .2) throw Error(`Player ${kind} picked up the hostile color`)
      }
    }
    const originalSource = url => getRaidCombatRootTextures().find(texture =>
      texture.source.label === new URL(url, document.baseURI).href)?.source
    const expectOriginal = (kind, texture, url) => {
      const source = originalSource(url)
      if (sharesPlayerProjectileArt(kind) || !source || texture?.source !== source) {
        throw Error(`${kind} should use the original enemy-only texture source`)
      }
    }
    for (const kind of ['enemy', 'boss', 'plasma', 'orbShot', 'voidShot', 'superShot']) {
      expectOriginal(kind, getRaidProjectileMaterial(kind, true).texture, RAID_BOSS_ATLAS_URL)
    }
    for (const kind of ['beam', 'poisonCloud', 'snakeFang', 'venomSpit', 'squidBubble', 'squidInk', 'squidSpine']) {
      const texture = applyRaidBossArtwork({ kind, width: 50, height: 20, rotation: 0, alpha: 1, x: 0, y: 0 })
      expectOriginal(kind, texture, kind === 'beam' ? RAID_BOSS_BEAM_URL : RAID_BOSS_ATLAS_URL)
    }
    const beamFallback = createGpuBossProjectileCanvas('beam')
    if (pinkFraction(read(beamFallback, 0, 0, beamFallback.width, beamFallback.height)) > .1) {
      throw Error('The procedural boss beam should keep its original blue color')
    }
  })
}

async function setUp(page, landscape, relayTraffic, loadRaidMedia = true) {
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === origin) {
      if (!loadRaidMedia && (url.pathname.endsWith('.glb') || url.pathname.startsWith('/assets/raid-fx/'))) return route.abort()
      return route.continue()
    }
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type' }
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (url.pathname.endsWith('/players/register')) {
      relayTraffic.push(url.pathname)
      const { playerName, playerId } = route.request().postDataJSON()
      return route.fulfill({ headers, json: { registered: true, playerName, playerId, recoveryCode: 'QA-ONLY' } })
    }
    if (url.pathname.endsWith('/players/progress')) return route.fulfill({ headers, json: { saved: true } })
    if (route.request().method() === 'POST') relayTraffic.push(url.pathname)
    return route.abort()
  })
  await page.addInitScript(landscape => {
    localStorage.setItem('gameSoundEnabled', '0')
    localStorage.setItem('raid-flight-view', landscape ? 'landscape' : 'vertical')
    const schedule = window.requestAnimationFrame.bind(window)
    window.requestAnimationFrame = callback => {
      const raidLoop = callback.toString().includes('tick(time)')
      return raidLoop && window.openingManualFrames ? -1 : schedule(callback)
    }
  }, landscape)
}

async function takeSimulationControl(page) {
  await page.evaluate(names => {
    const root = document.querySelector('.raid')
    let fiber = root[Object.keys(root).find(key => key.startsWith('__reactFiber$'))]
    while (fiber && fiber.type?.name !== 'GradiusRaid') fiber = fiber.return
    if (!fiber) throw Error('Raid runtime not found')
    const refs = [], callbacks = []
    for (let hook = fiber.memoizedState; hook; hook = hook.next) {
      const value = hook.memoizedState
      if (value && typeof value === 'object' && Object.keys(value).length === 1 && Object.hasOwn(value, 'current')) refs.push(value)
      if (Array.isArray(value) && typeof value[0] === 'function') callbacks.push(value[0])
    }
    const offset = refs.findIndex(ref => typeof ref.current?.getShipStats === 'function') - names.indexOf('shipsRef')
    const refsByName = Object.fromEntries(names.map((name, index) => [name, refs[index + offset]]))
    const update = callbacks.find(fn => fn.toString().includes('const scoreMult = scoreMultRef.current')
      && fn.toString().includes('nearMissCooldownRef.current'))
    const draw = callbacks.find(fn => fn.toString().includes('RAID_FX_CANVAS_CONTEXT_SETTINGS'))
    const sync = callbacks.find(fn => fn.toString().includes('const bossAlertBucket'))
    if (!update || !draw || !sync || refsByName.phaseRef.current !== 'playing') throw Error('Invalid opening fixture mapping')
    window.openingManualFrames = true
    window.openingTest = { refs: refsByName, update, draw, sync }
  }, raidRefs)
}

async function advanceToBossWarning(page) {
  await page.evaluate(async () => {
    const { CRUISE_FLYBY_START, GRACE_FLYBY_START, ASTROPHAGE_START, STAGE_ONE_CRUISE_SEQUENCE_END } =
      await import('/src/components/games/raid/cruiseTiming.ts')
    const { refs, update, draw, sync } = window.openingTest
    const { cruiseFlybys, sceneryHulls, astrophage } = refs.pixiBackgroundRef.current
    const slots = sceneryHulls.slots.filter(slot => cruiseFlybys.includes(slot.anchor))
    const timeline = [
      { age: CRUISE_FLYBY_START + 3.5, ships: ['rockyFlyby'], field: false },
      { age: GRACE_FLYBY_START + 2.6, ships: ['rockyFlyby', 'graceFlyby'], field: false },
      { age: GRACE_FLYBY_START + 6.7, ships: ['graceFlyby'], field: false },
      { age: ASTROPHAGE_START + 4.3, ships: [], field: true },
      { age: STAGE_ONE_CRUISE_SEQUENCE_END - .5, ships: [], field: true },
    ]
    for (const { age, ships, field } of timeline) {
      for (let frame = 0; frame < 4200 && refs.journeyStageAgeRef.current < age; frame++) {
        // A pickup or collision can replace the pilot's invulnerability timer.
        // Keep this stationary scenery check independent of combat damage.
        refs.playerRef.current.invuln = 999
        update(1 / 60)
      }
      if (refs.journeyStageAgeRef.current < age || refs.enemiesRef.current.some(enemy => enemy.isBoss)) {
        throw Error(`Cruise at ${refs.journeyStageAgeRef.current.toFixed(1)}s did not reach the ${age}s checkpoint in ${refs.phaseRef.current} phase`)
      }
      draw(performance.now())
      const visible = slots.filter(slot => slot.parts.some(part => part.mesh.visible)).map(slot => slot.key)
      if (visible.join() !== ships.join() || astrophage.root.visible !== field) {
        throw Error(`Unexpected cruise scenery at ${age}s. Ships: ${visible}; field: ${astrophage.root.visible}`)
      }
    }
    for (let frame = 0; frame < 900; frame++) {
      update(1 / 60)
      const boss = refs.enemiesRef.current.find(enemy => enemy.isBoss)
      if (boss?.bossAttackState === 'warning' && boss.bossAttackPattern === 'beam') {
        draw(performance.now())
        sync()
        return
      }
    }
    throw Error('Crimson Bastion did not telegraph its opening attack')
  })
}

async function main() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await fetch(origin)).ok) break } catch {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  if (output) await mkdir(output, { recursive: true })
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] })

  const mobileChecks = [testCoopMenu, testCallsign, testNativeDownload]
  const checks = process.argv.includes('--raid-only') ? [testRaid]
    : process.argv.includes('--android-startup-only') ? [testNativeDownload]
    : process.argv.includes('--menu-only') ? mobileChecks : [testRaid, ...mobileChecks]
  const failures = []
  for (const check of checks) {
    try { await check() } catch (error) { failures.push(error) }
  }
  if (failures.length) throw new AggregateError(failures, 'Guest launch or deployment verification failed')
}

async function testRaid() {
  const desktop = await browser.newPage({ viewport: { width: 844, height: 470 }, reducedMotion: 'reduce' })
  try {
    const traffic = [], errors = []
    desktop.on('pageerror', error => errors.push(error.message))
    await setUp(desktop, true, traffic)
    await title(desktop)
    await desktop.getByRole('button', { name: 'Single Player', exact: true }).click()
    const raidModes = desktop.getByRole('navigation', { name: 'Single Player' })
    await raidModes.waitFor()
    for (const name of ['Story Mode', 'Endless Mode', 'Boss Rush']) {
      assert.ok(await raidModes.getByRole('button', { name }).isVisible())
    }
    assert.equal(await desktop.locator('.raid').count(), 0, 'Opening Raid modes must not launch a sortie')
    assert.equal(await raidModes.getByRole('button').count(), 3)
    await raidModes.getByRole('button', { name: /Story Mode/ }).click()
    await desktop.getByRole('button', { name: 'Skip To Launch' }).click()
    await desktop.getByRole('button', { name: 'Start Raid', exact: true }).click({ timeout: 120000 })
    const carrierSkip = desktop.locator('.raid__carrier-skip')
    await carrierSkip.waitFor({ timeout: 120000 })
    // Keep renderer initialization and the real UI, but step the sortie at a
    // fixed rate so software-rendered builds don't depend on host frame pacing.
    await desktop.evaluate(() => { window.openingManualFrames = true })
    await carrierSkip.click()
    await desktop.getByText('Flight deck clear. You have the launch lane.').waitFor({ timeout: 120000 })
    await takeSimulationControl(desktop)
    await desktop.evaluate(() => window.openingTest.draw(performance.now()))
    await capture(desktop, 'opening-launch')
    await desktop.evaluate(() => {
      const { refs, update, draw, sync } = window.openingTest
      for (let frame = 0; frame < 650 && refs.stageEntryRef.current > 0; frame++) update(1 / 60)
      draw(performance.now())
      sync()
    })
    await desktop.getByText(/Weapons fire automatically/).waitFor()
    assert.ok(await desktop.getByText(/WASD/).isVisible())
    await assertCompactCaption(desktop.locator('.raid__fleet-radio .fleet-radio'))
    await assertProjectileColors(desktop)
    await desktop.keyboard.down('ArrowUp')
    await desktop.evaluate(() => {
      const { refs, update } = window.openingTest
      const before = refs.playerRef.current.x
      for (let frame = 0; frame < 30; frame++) update(1 / 60)
      if (refs.playerRef.current.x === before) throw Error('The ship did not respond to steering')
    })
    await desktop.keyboard.up('ArrowUp')
    await advanceToBossWarning(desktop)
    await desktop.getByText(/Move clear of the marked fire/).waitFor()
    await capture(desktop, 'opening-boss-warning')
    await desktop.evaluate(() => {
      const { refs, update, draw, sync } = window.openingTest
      for (let frame = 0; frame < 210; frame++) update(1 / 60)
      const boss = refs.enemiesRef.current.find(enemy => enemy.isBoss)
      if (boss.bossAttackState !== 'recovery') throw Error('Opening counterattack window did not begin')
      draw(performance.now())
      sync()
    })
    await desktop.getByText(/Their guns are cycling/).waitFor()
    await capture(desktop, 'opening-counterattack')
    await desktop.evaluate(() => {
      const { refs, update, sync } = window.openingTest
      const boss = refs.enemiesRef.current.find(enemy => enemy.isBoss)
      refs.shotsRef.current.push({ id: -1, x: boss.x, y: boss.y, vx: 0, vy: 0, kind: 'pulse', damage: boss.hp + 1, radius: 2 })
      for (let frame = 0; frame < 500 && refs.stageRef.current === 1; frame++) update(1 / 60)
      if (refs.stageRef.current !== 2) throw Error('The next stage did not start automatically')
      const entryRemaining = refs.stageEntryRef.current
      update(1 / 60)
      if (refs.stageEntryRef.current >= entryRemaining) throw Error('Stage 2 did not progress without player input')
      sync()
    })
    assert.equal(await desktop.getByRole('dialog').count(), 0, 'Stage transition must not show a score screen')
    await desktop.evaluate(() => {
      const { refs, update, sync } = window.openingTest
      for (let frame = 0; frame < 650 && refs.stageEntryRef.current > 0; frame++) update(1 / 60)
      const player = refs.playerRef.current
      Object.assign(player, { hp: 1, invuln: 0, shield: 0, forceField: 0 })
      refs.enemyShotsRef.current = [{ id: -2, x: player.x, y: player.y, vx: 0, vy: 0, kind: 'enemy', damage: 3, radius: 3, life: 2 }]
      update(1 / 60)
      if (refs.phaseRef.current !== 'gameover') throw Error('The final shot did not end the run')
      sync()
    })
    const runReport = desktop.getByRole('dialog').filter({ hasText: 'Combat Report' })
    await runReport.getByRole('button', { name: 'Retry', exact: true }).click()
    await desktop.getByText('Flight deck clear. You have the launch lane.').waitFor({ timeout: 30000 })
    await takeSimulationControl(desktop)
    assert.equal(await desktop.evaluate(() => window.openingTest.refs.stageRef.current), 1)
    assert.deepEqual(traffic, [], 'a guest run must not call the online profile or leaderboard APIs')
    assert.deepEqual(errors, [])
    console.log('Desktop guest launch, boss warning, automatic stage advance, end-of-run report and retry passed')
  } catch (error) {
    const visible = await desktop.locator('body').innerText({ timeout: 4000 }).catch(() => '')
    throw new Error(`Raid did not complete its opening check. Visible state: ${visible.slice(0, 1000)}`, { cause: error })
  } finally { await desktop.close() }
}

async function testCoopMenu() {
  const phone = await browser.newPage({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true })
  const traffic = []
  try {
    await setUp(phone, false, traffic, false)
    await title(phone)
    assert.deepEqual(await phone.locator('.start-screen__actions button').allTextContents(), ['Single Player', 'Co-op'])
    await phone.getByRole('button', { name: 'Co-op', exact: true }).tap()
    const menu = phone.getByRole('navigation', { name: 'Co-op', exact: true })
    await menu.waitFor()
    assert.deepEqual(await menu.locator('button strong').allTextContents(), ['Same Wi-Fi', 'Online Co-op', 'Shared Screen'])
    await menu.getByRole('button', { name: /Shared Screen/ }).tap()
    await phone.getByRole('heading', { name: 'Shared Screen', exact: true }).waitFor()
    assert.equal(await phone.getByRole('dialog').count(), 0)
    await phone.locator('.mode-screen__back').tap()
    for (const name of [/Same Wi-Fi/, /Online Co-op/]) {
      await menu.getByRole('button', { name }).tap()
      const dialog = phone.getByRole('dialog')
      await dialog.waitFor()
      await dialog.getByRole('button', { name: 'Close', exact: true }).tap()
      await dialog.waitFor({ state: 'hidden' })
    }
    await phone.locator('.mode-screen__back').tap()
    await phone.getByRole('button', { name: 'Single Player', exact: true }).waitFor()
    assert.deepEqual(traffic, [])
    await phone.evaluate(() => localStorage.setItem('space-defenders-player-name', 'Menu Cadet'))
    await phone.reload()
    await phone.locator('#startup-splash').waitFor({ state: 'detached', timeout: 30000 })
    await phone.getByRole('button', { name: 'Co-op', exact: true }).tap()
    for (const name of ['Same Wi-Fi', 'Online Co-op']) {
      await menu.getByRole('button', { name: new RegExp('^' + name) }).tap()
      await phone.getByRole('heading', { name, exact: true }).waitFor()
      await phone.getByRole('button', { name: 'Back', exact: true }).tap()
    }
    console.log('Mobile Raid-only menu and all three co-op routes passed')
  } finally { await phone.close() }
}

async function testCallsign() {
  const phone = await browser.newPage({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' })
  const traffic = []
  try {
    await setUp(phone, false, traffic, false)
    await title(phone)
    await phone.evaluate(() => localStorage.setItem('space-impact-release-progress', JSON.stringify({ totalRuns: 2, totalScore: 650 })))
    await phone.getByRole('button', { name: 'Single Player', exact: true }).tap()
    await phone.getByRole('button', { name: 'Leaderboards', exact: true }).tap()
    const leaderboardModes = phone.locator('.leaderboards-screen__mode')
    await leaderboardModes.first().waitFor()
    assert.equal(await leaderboardModes.count(), 4)
    const callsign = phone.getByRole('button', { name: 'Choose a callsign', exact: true })
    await callsign.tap()
    await phone.getByRole('textbox', { name: 'Commander name' }).fill('Test Cadet')
    await phone.getByRole('button', { name: 'Confirm Name', exact: true }).tap()
    await phone.getByRole('dialog').waitFor({ state: 'hidden' })
    assert.equal(await phone.evaluate(() => JSON.parse(localStorage.getItem('space-impact-release-progress')).totalScore), 650)
    assert.ok(traffic.some(path => path.endsWith('/players/register')))
    console.log('Optional callsign registration preserved the guest save')

    await phone.locator('.leaderboards-screen__back').tap()
    for (const [screen, selector] of [
      ['Profile', '.progress-card--scores'],
      ['Achievements', '.unlock-section'],
      ['Codex', '.codex-cutscene-launcher'],
      ['Almanac', '.enemy-almanac'],
    ]) {
      await phone.getByRole('button', { name: screen, exact: true }).tap()
      await phone.locator(selector).waitFor()
      assert.doesNotMatch(await phone.locator('.progress-panel').innerText(), /Ship Defense|Tower Defense|Endless Defense|Earth Defense Grid/)
      await phone.locator('.progress-panel__back').tap()
    }
    console.log('Raid profile, achievements, Codex and enemy Almanac passed')
  } finally { await phone.close() }
}

async function testNativeDownload() {
  const phone = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, locale: 'en-US' })
  try {
    await setUp(phone, true, [], false)
    await phone.addInitScript(() => {
      window.androidBridge = {}
      const fixture = { progress: null, finish: null, fail: null, started: 0, failStatus: true }
      window.testGameAssets = fixture
      window.Capacitor = {
        PluginHeaders: [{ name: 'GameAssets', methods: [
          { name: 'status', rtype: 'promise' }, { name: 'prepare', rtype: 'promise' },
          { name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'promise' },
        ] }],
        async nativePromise(plugin, method) {
          if (plugin !== 'GameAssets') throw Error(plugin)
          if (method === 'status') {
            if (fixture.failStatus && !sessionStorage.getItem('fixture-status-checked')) {
              sessionStorage.setItem('fixture-status-checked', '1')
              throw Error('Asset status temporarily unavailable')
            }
            const ready = sessionStorage.getItem('fixture-assets-ready') === '1'
            return { ready, bytes: ready ? 0 : 7000000 }
          }
          if (method === 'removeListener') { fixture.progress = null; return }
          if (method !== 'prepare') throw Error(method)
          fixture.started++
          return new Promise((resolve, reject) => {
            fixture.progress({ done: 2000000, total: 7000000 })
            fixture.finish = () => { sessionStorage.setItem('fixture-assets-ready', '1'); resolve() }
            fixture.fail = () => reject(new Error('Network interrupted'))
          })
        },
        async nativeCallback(plugin, method, { eventName }, callback) {
          if (plugin !== 'GameAssets' || method !== 'addListener' || eventName !== 'progress') throw Error(method)
          fixture.progress = callback
          return 'listener-1'
        },
      }
    })
    await phone.goto(origin)
    const splash = phone.locator('#startup-splash')
    const retry = splash.getByRole('button', { name: 'Retry', exact: true })
    await splash.getByText('The game could not check its files. Try again.').waitFor()
    assert.equal(await phone.locator('#root').evaluate(el => el.childElementCount), 0)
    await retry.tap()
    await splash.getByText('Download 7 MB of game files to start playing.').waitFor()
    assert.equal(await phone.evaluate(() => window.testGameAssets.started), 0, 'Downloads need player consent')
    const offer = splash.getByRole('button', { name: 'Download game files' })
    await offer.tap()
    await splash.getByText('2 MB / 7 MB').waitFor()
    assert.equal(await phone.locator('.start-screen, .raid').count(), 0)
    assert.equal(await phone.locator('#root').evaluate(el => el.inert), true)
    await phone.evaluate(() => window.testGameAssets.fail())
    await splash.getByText(/The download could not finish/).waitFor()
    assert.equal(await phone.locator('.start-screen').count(), 0)
    await retry.tap()
    await phone.waitForFunction(() => window.testGameAssets.started === 2)
    assert.equal(await phone.locator('.start-screen').count(), 0)
    await phone.evaluate(() => window.testGameAssets.finish())
    await splash.waitFor({ state: 'detached', timeout: 30000 })
    await phone.getByRole('button', { name: 'Single Player', exact: true }).waitFor()
    await phone.getByRole('button', { name: 'Co-op', exact: true }).waitFor()
    await phone.reload()
    await splash.waitFor({ state: 'detached', timeout: 30000 })
    assert.equal(await phone.evaluate(() => window.testGameAssets.started), 0, 'Already-ready installs must skip the download')
    assert.ok(await phone.getByText('Guest pilot', { exact: true }).isVisible())
    console.log('Android startup blocked both modes until installation, handled status and download retries, then skipped the prompt on relaunch')
  } finally { await phone.close() }
}

try { await main() } finally {
  await browser?.close()
  server.kill()
  await stopped
}
