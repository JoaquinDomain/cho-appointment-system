import { launchBrowser } from '../tests/lib/browser.mjs'

const url = process.argv[2] || process.env.CHO_SITE_URL || 'http://127.0.0.1:3000/'
const failures = []
const warnings = []

function check(condition, message, details = []) {
  if (condition) {
    console.log(`PASS: ${message}`)
  } else {
    failures.push({ message, details })
    console.error(`FAIL: ${message}`)
    for (const detail of details) console.error(`  - ${detail}`)
  }
}

let browser = null
let page = null

try {
  browser = await launchBrowser()
  page = await browser.newPage()
  await page.enable()

  console.log(`Browser: ${browser.version.Browser}`)
  console.log(`Site:    ${url}`)

  await page.navigate(url)
  const hydrated = await page
    .waitFor('window.__choReady === true', 30000, 'React hydration')
    .then(() => true)
    .catch(() => false)

  const staticFailures = page.staticAssetFailures()
  check(
    staticFailures.length === 0,
    'every /_next/static asset loaded successfully',
    staticFailures.map(failure => `${failure.status || failure.detail} ${failure.url}`)
  )

  check(hydrated, 'page hydrated on a cold first load (window.__choReady === true)')
  if (!hydrated) {
    const issues = page.consoleIssues()
    for (const issue of issues.slice(0, 10)) warnings.push(`${issue.level}: ${issue.text}`)
  }

  if (hydrated) {
    const state = await page.evaluate(`(() => {
      const input = document.querySelector('input[aria-label="Selected appointment date"]');
      const grid = document.querySelector('[role="grid"]');
      return {
        inputValue: input ? input.value : '',
        gridLabel: grid ? grid.getAttribute('aria-label') : null,
        enabledCount: document.querySelectorAll('button[role="gridcell"]:not([disabled])').length,
      };
    })()`)

    check(state.enabledCount > 0, 'calendar exposes enabled dates after hydration', [
      `calendar heading: ${state.gridLabel || 'missing'}`,
      `enabled dates: ${state.enabledCount}`,
    ])

    if (state.enabledCount > 0) {
      const marker = `cho-deploy-${Date.now()}`
      const cell = await page.evaluate(`(() => {
        const cell = Array.from(document.querySelectorAll('button[role="gridcell"]')).find(cell => !cell.disabled);
        if (!cell) return null;
        cell.setAttribute('data-cho-test', ${JSON.stringify(marker)});
        return cell.textContent.trim();
      })()`)
      if (cell) {
        await page.click(`[data-cho-test="${marker}"]`)
        const changed = await page
          .waitFor(`document.querySelector('input[aria-label="Selected appointment date"]')?.value !== ''`, 5000, 'date selection')
          .then(() => true)
          .catch(() => false)
        const value = await page.evaluate(`document.querySelector('input[aria-label="Selected appointment date"]')?.value || ''`)
        check(changed, 'clicking an enabled date updates the appointment form on first load', [
          `selected day: ${cell}`,
          `input value: ${value || '(empty)'}`,
        ])
      } else {
        check(false, 'clicking an enabled date updates the appointment form on first load', ['no enabled date cell found'])
      }
    }

  }
} catch (error) {
  failures.push({ message: error.message, details: [] })
  console.error(`FAIL: ${error.message}`)
} finally {
  await page?.close()
  await browser?.close()
}

if (warnings.length > 0) {
  console.log('\nWARNINGS')
  for (const warning of [...new Set(warnings)]) console.log(`  - ${warning}`)
}

if (failures.length > 0) {
  console.error(`\nFAILED: ${failures.length} deployment check(s) failed.`)
  process.exitCode = 1
} else {
  console.log('\nPASS: deployment checks passed.')
}
