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
  await page.evaluate(() => {
    const { refs, update, draw, sync } = window.openingTest
    const player = refs.playerRef.current
    player.invuln = 999
    refs.bossTimerRef.current = 0
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

  const mobileChecks = [testDefense, testCallsign, testNativeDownload]
  const checks = process.argv.includes('--raid-only') ? [testRaid]
    : process.argv.includes('--defense-only') ? mobileChecks : [testRaid, ...mobileChecks]
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
    // Keep renderer initialization and the real UI, but step the sortie at a
    // fixed rate so software-rendered builds don't depend on host frame pacing.
    await desktop.evaluate(() => { window.openingManualFrames = true })
    await desktop.getByRole('button', { name: /Launch Gradius Raid/ }).click()
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
      for (let frame = 0; frame < 500 && !refs.openingReportRef.current; frame++) update(1 / 60)
      sync()
    })
    const report = desktop.getByRole('dialog', { name: 'First interception complete' })
    await report.waitFor()
    assert.ok(await report.getByRole('button', { name: 'Retry', exact: true }).isVisible())
    await capture(desktop, 'opening-report')
    await report.getByRole('button', { name: 'Continue campaign' }).click()
    await report.waitFor({ state: 'hidden' })
    assert.equal(await desktop.evaluate(() => window.openingTest.refs.stageRef.current), 2)
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
    console.log('Desktop guest launch, boss warning, counterattack, reports, campaign continuation and retry passed')
  } catch (error) {
    const visible = await desktop.locator('body').innerText({ timeout: 4000 }).catch(() => '')
    throw new Error(`Raid did not complete its opening check. Visible state: ${visible.slice(0, 1000)}`, { cause: error })
  } finally { await desktop.close() }
}

async function testDefense() {
  const phone = await browser.newPage({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true })
  const phoneTraffic = []
  await setUp(phone, false, phoneTraffic, false)
  await title(phone)
  await phone.getByRole('button', { name: /Tower Defense Campaign/ }).tap()
  await phone.getByRole('button', { name: 'Skip Briefing' }).tap()
  await phone.locator('.defense-board').waitFor()
  await phone.getByText(/Dispatch a ship to cover the approach/).waitFor()
  await phone.locator('.defense-shop button').first().tap()
  for (const [col, row] of [[3, 2], [2, 3], [4, 2], [1, 0], [5, 4]]) {
    const cell = phone.locator(`[data-grid-col="${col}"][data-grid-row="${row}"]`)
    await cell.tap()
    if (!await phone.getByText(/Tap again to deploy/).isVisible()) continue
    await capture(phone, 'defense-touch-range')
    assert.equal(await phone.locator('.defense-tower-mark').count(), 0)
    await cell.tap()
    break
  }
  await phone.getByText(/Warship on station/).waitFor()
  assert.equal(await phone.locator('.defense-tower-mark').count(), 1)
  await capture(phone, 'defense-tower-deployed')
  assert.deepEqual(phoneTraffic, [])
  await phone.close()
  console.log('Android-sized touch layout, two-tap range preview and warship dispatch passed')
}

async function testCallsign() {
  const phone = await browser.newPage({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' })
  const traffic = []
  try {
    await setUp(phone, false, traffic, false)
    await title(phone)
    await phone.evaluate(() => localStorage.setItem('space-impact-release-progress', JSON.stringify({ totalRuns: 2, totalScore: 650 })))
    await phone.getByRole('button', { name: 'Leaderboards', exact: true }).tap()
    const callsign = phone.getByRole('button', { name: 'Choose a callsign', exact: true })
    await callsign.tap()
    await phone.getByRole('textbox', { name: 'Commander name' }).fill('Test Cadet')
    await phone.getByRole('button', { name: 'Confirm Name', exact: true }).tap()
    await phone.getByRole('dialog').waitFor({ state: 'hidden' })
    assert.equal(await phone.evaluate(() => JSON.parse(localStorage.getItem('space-impact-release-progress')).totalScore), 650)
    assert.ok(traffic.some(path => path.endsWith('/players/register')))
    console.log('Optional callsign registration preserved the guest save')
  } finally { await phone.close() }
}

async function testNativeDownload() {
  const phone = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true })
  try {
    await setUp(phone, true, [])
    await phone.route(url => url.pathname.endsWith('/src/androidAssetDownload.ts'), route => route.fulfill({
      contentType: 'text/javascript',
      body: `
        let ready = false, pending = null;
        export const needsNativeRaidAssets = () => true;
        export const getAndroidRaidAssetsStatus = async () => ({ ready, bytes: ready ? 0 : 7000000 });
        export const getPendingAndroidRaidInstall = () => pending;
        export const observeAndroidRaidInstall = () => () => {};
        export function installAndroidRaidAssets() {
          return pending ??= new Promise(resolve => {
            window.completeTestRaidDownload = () => { ready = true; pending = null; resolve(); };
          });
        }
      `,
    }))
    await title(phone)
    await phone.getByRole('button', { name: 'Raid Operations' }).tap()
    const offer = phone.getByRole('dialog', { name: 'Gradius Raid files' })
    await offer.getByRole('button', { name: 'Download for offline play' }).tap()
    await phone.waitForFunction(() => typeof window.completeTestRaidDownload === 'function')
    await offer.getByRole('button', { name: 'Close' }).tap()
    await phone.getByRole('button', { name: /Tower Defense Campaign/ }).tap()
    await phone.getByRole('button', { name: 'Skip Briefing' }).tap()
    await phone.locator('.defense-board').waitFor()
    await phone.evaluate(() => window.completeTestRaidDownload())
    assert.ok(await phone.locator('.defense-board').isVisible(), 'background completion must not interrupt another mode')
    console.log('Android bridge fixture passed optional download and uninterrupted Ship Defense')
  } finally { await phone.close() }
}

try { await main() } finally {
  await browser?.close()
  server.kill()
  await stopped
}
