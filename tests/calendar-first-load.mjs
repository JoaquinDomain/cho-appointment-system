import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { launchBrowser } from './lib/browser.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const MONTH_INDEX = Object.fromEntries(MONTHS.map((month, index) => [month, index]))

function fail(message, details = []) {
  console.error(`FAIL: ${message}`)
  for (const detail of details) console.error(`  - ${detail}`)
  process.exitCode = 1
}

function parseGridLabel(label) {
  const match = /^([A-Za-z]+) (\d{4})$/.exec(label || '')
  if (!match || MONTH_INDEX[match[1]] === undefined) {
    throw new Error(`Unexpected calendar heading: ${label}`)
  }
  return { month: MONTH_INDEX[match[1]], year: Number(match[2]) }
}

function displayDate(day, month, year) {
  return `${String(month + 1).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`
}

function isoDate(day, month, year) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

async function freePort() {
  return await new Promise((resolvePort, reject) => {
    const server = createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => resolvePort(address.port))
    })
  })
}

async function startServer() {
  if (!existsSync(join(ROOT, '.next', 'BUILD_ID'))) {
    throw new Error('No production build found. Run `npm run build` before this test.')
  }
  const port = await freePort()
  const nextBin = join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next')
  const output = []
  const proc = spawn(process.execPath, [nextBin, 'start', '-p', String(port)], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  proc.stdout.on('data', chunk => output.push(chunk.toString()))
  proc.stderr.on('data', chunk => output.push(chunk.toString()))

  const baseUrl = `http://127.0.0.1:${port}`
  const deadline = Date.now() + 60000
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) {
      throw new Error(`next start exited early:\n${output.join('').slice(-4000)}`)
    }
    try {
      const response = await fetch(baseUrl, { redirect: 'manual' })
      if (response.status === 200) {
        return {
          baseUrl,
          output,
          stop() {
            try {
              if (process.platform === 'win32') {
                spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' })
              } else {
                proc.kill('SIGTERM')
              }
            } catch {}
          },
        }
      }
    } catch {}
    await sleep(250)
  }
  proc.kill('SIGKILL')
  throw new Error(`next start did not become ready:\n${output.join('').slice(-4000)}`)
}

async function markFirstCell(page, kind) {
  const marker = `cho-${kind}-${Date.now()}`
  const found = await page.evaluate(`(() => {
    const cells = Array.from(document.querySelectorAll('button[role="gridcell"]'));
    const cell = cells.find(cell => ${kind === 'enabled' ? '!cell.disabled' : 'cell.disabled'});
    if (!cell) return null;
    cell.setAttribute('data-cho-test', ${JSON.stringify(marker)});
    return cell.textContent.trim();
  })()`)
  if (!found) return null
  return { selector: `[data-cho-test="${marker}"]`, text: found, marker }
}

async function enableApiStubs(page) {
  const quotaRequests = []
  page.on('Fetch.requestPaused', async params => {
    const url = params.request.url
    if (url.includes('/api/blocked-dates')) {
      await page.send('Fetch.fulfillRequest', {
        requestId: params.requestId,
        responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body: Buffer.from(JSON.stringify({ blocked: [] })).toString('base64'),
      })
      return
    }
    if (url.includes('/api/quotas')) {
      quotaRequests.push(url)
      await page.send('Fetch.fulfillRequest', {
        requestId: params.requestId,
        responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body: Buffer.from(JSON.stringify({ counts: {} })).toString('base64'),
      })
      return
    }
    await page.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {})
  })
  await page.send('Fetch.enable', {
    patterns: [
      { urlPattern: '*/api/blocked-dates*', requestStage: 'Request' },
      { urlPattern: '*/api/quotas*', requestStage: 'Request' },
    ],
  })
  return quotaRequests
}

async function readState(page) {
  return page.evaluate(`(() => {
    const input = document.querySelector('input[aria-label="Selected appointment date"]');
    const selected = document.querySelector('button[role="gridcell"][aria-selected="true"]');
    const grid = document.querySelector('[role="grid"]');
    return {
      inputValue: input ? input.value : '',
      selectedText: selected ? selected.textContent.trim() : null,
      gridLabel: grid ? grid.getAttribute('aria-label') : null,
      enabledCount: document.querySelectorAll('button[role="gridcell"]:not([disabled])').length,
      cellCount: document.querySelectorAll('button[role="gridcell"]').length,
      nextDisabled: document.querySelector('button[aria-label="Next month"]')?.disabled === true,
      submitDisabled: document.querySelector('button[type="submit"]')?.disabled === true,
      quotaText: document.body.innerText.includes('Checking test availability'),
    };
  })()`)
}

async function waitForInputValue(page, expected, timeoutMs = 5000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const value = await page.evaluate(`document.querySelector('input[aria-label="Selected appointment date"]')?.value || ''`)
    if (value === expected) return
    await sleep(100)
  }
  const actual = await page.evaluate(`document.querySelector('input[aria-label="Selected appointment date"]')?.value || ''`)
  throw new Error(`Selected date did not update: expected "${expected}", got "${actual}".`)
}

async function waitForSubmitEnabled(page, timeoutMs = 5000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const enabled = await page.evaluate(`document.querySelector('button[type="submit"]')?.disabled === false`)
    if (enabled) return
    await sleep(100)
  }
  throw new Error('Submit button never became enabled after selecting a date and a test.')
}

async function main() {
  let server = null
  let browser = null
  let page = null
  const checks = []
  const pass = name => { checks.push({ name, ok: true }); console.log(`PASS: ${name}`) }

  try {
    server = await startServer()
    browser = await launchBrowser()
    page = await browser.newPage()
    await page.enable()
    const quotaRequests = await enableApiStubs(page)

    console.log(`Browser: ${browser.version.Browser}`)
    console.log(`Server:  ${server.baseUrl}`)

    await page.navigate(server.baseUrl)
    await page.waitFor('window.__choReady === true', 30000, 'React hydration')
    await page.waitFor(`document.querySelectorAll('button[role="gridcell"]:not([disabled])').length > 0`, 5000, 'enabled calendar dates')
    pass('calendar renders and hydrates on a fresh page load')

    let state = await readState(page)
    if (state.cellCount < 28) throw new Error(`Expected a full month of dates, found ${state.cellCount} cells.`)
    if (state.enabledCount < 1) throw new Error('No selectable dates on first load.')
    pass(`calendar exposes ${state.enabledCount} enabled date(s) without a refresh`)

    const firstGrid = parseGridLabel(state.gridLabel)
    const enabled = await markFirstCell(page, 'enabled')
    if (!enabled) throw new Error('Could not find an enabled date cell.')
    await page.click(enabled.selector)
    const expectedFirst = displayDate(Number(enabled.text), firstGrid.month, firstGrid.year)
    await waitForInputValue(page, expectedFirst)
    state = await readState(page)
    if (state.selectedText !== enabled.text) throw new Error('Clicked date is not marked selected.')
    pass(`enabled date ${expectedFirst} selects immediately on first load`)

    const expectedIso = isoDate(Number(enabled.text), firstGrid.month, firstGrid.year)
    const quotaDeadline = Date.now() + 5000
    while (Date.now() < quotaDeadline && !quotaRequests.some(url => url.includes(expectedIso))) {
      await sleep(100)
    }
    if (!quotaRequests.some(url => url.includes(expectedIso))) {
      throw new Error(`Selecting ${expectedIso} did not trigger the quota check for that date.`)
    }
    pass('selected date reaches the appointment form quota/validation path')

    const valueBeforeDisabledClick = state.inputValue
    const disabled = await markFirstCell(page, 'disabled')
    if (!disabled) throw new Error('Could not find a disabled date cell to test.')
    await page.click(disabled.selector)
    await sleep(400)
    state = await readState(page)
    if (state.inputValue !== valueBeforeDisabledClick) {
      throw new Error('Clicking a disabled date changed the selected date.')
    }
    pass('disabled (weekend/holiday/blocked) dates remain unselectable')

    const monthBefore = state.gridLabel
    await page.click('button[aria-label="Next month"]')
    await page.waitFor(`document.querySelector('[role="grid"]')?.getAttribute('aria-label') !== ${JSON.stringify(monthBefore)}`, 5000, 'next month')
    const nextGridLabel = await page.evaluate(`document.querySelector('[role="grid"]')?.getAttribute('aria-label')`)
    pass(`month navigation works (${monthBefore} -> ${nextGridLabel})`)

    const nextGrid = parseGridLabel(nextGridLabel)
    const nextEnabled = await markFirstCell(page, 'enabled')
    if (!nextEnabled) throw new Error('No enabled date in the next month.')
    await page.click(nextEnabled.selector)
    const expectedNext = displayDate(Number(nextEnabled.text), nextGrid.month, nextGrid.year)
    await waitForInputValue(page, expectedNext)
    pass(`date selection still works after changing months (${expectedNext})`)

    await page.click('button[aria-label="Previous month"]')
    await page.waitFor(`document.querySelector('[role="grid"]')?.getAttribute('aria-label') === ${JSON.stringify(monthBefore)}`, 5000, 'previous month')

    const cbcCheckbox = await page.evaluate(`(() => {
      const label = Array.from(document.querySelectorAll('label')).find(label => {
        const name = label.querySelector('span');
        return name && name.textContent.trim() === 'CBC';
      });
      const input = label?.querySelector('input[type="checkbox"]');
      if (!input) return null;
      input.setAttribute('data-cho-test', 'cbc');
      return true;
    })()`)
    if (!cbcCheckbox) throw new Error('Could not find the CBC test checkbox.')
    await page.click('[data-cho-test="cbc"]')
    await waitForSubmitEnabled(page)
    pass('appointment validation still accepts a valid date with a selected test')

    await page.reload()
    await page.waitFor('window.__choReady === true', 30000, 'hydration after reload')
    await page.waitFor(`document.querySelectorAll('button[role="gridcell"]:not([disabled])').length > 0`, 5000, 'enabled dates after reload')
    const reloadGrid = parseGridLabel(await page.evaluate(`document.querySelector('[role="grid"]')?.getAttribute('aria-label')`))
    const reloadEnabled = await markFirstCell(page, 'enabled')
    if (!reloadEnabled) throw new Error('No enabled date after reload.')
    await page.click(reloadEnabled.selector)
    await waitForInputValue(page, displayDate(Number(reloadEnabled.text), reloadGrid.month, reloadGrid.year))
    pass('calendar remains functional after a full-page refresh')

    const staticFailures = page.staticAssetFailures()
    if (staticFailures.length > 0) {
      throw new Error(`JavaScript/CSS chunks failed to load: ${staticFailures.map(f => `${f.status || f.detail} ${f.url}`).join('; ')}`)
    }
    pass('every /_next/static asset loaded successfully')

    const hydrationIssues = page.hydrationIssues()
    if (hydrationIssues.length > 0) {
      throw new Error(`Hydration warnings/errors: ${hydrationIssues.map(i => i.text).join(' | ')}`)
    }
    pass('no hydration warnings or errors')

    console.log(`\nPASS: ${checks.length} calendar first-load checks passed.`)
  } catch (error) {
    const extras = []
    if (page) {
      for (const failure of page.staticAssetFailures()) {
        extras.push(`static asset ${failure.status || failure.detail}: ${failure.url}`)
      }
      for (const issue of page.consoleIssues()) {
        extras.push(`${issue.level}: ${issue.text}`)
      }
    }
    if (server) extras.push(`server log: ${server.output.join('').slice(-3000)}`)
    fail(error.message, extras)
  } finally {
    await page?.close()
    await browser?.close()
    server?.stop()
  }
}

main()
