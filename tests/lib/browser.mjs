import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const WINDOWS_BROWSERS = [
  `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.PROGRAMFILES}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env.LOCALAPPDATA}\\Microsoft\\Edge\\Application\\msedge.exe`,
]

const POSIX_BROWSERS = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
]

const POSIX_COMMANDS = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'msedge']

export function findBrowser() {
  if (process.env.CHO_BROWSER_PATH) {
    if (!existsSync(process.env.CHO_BROWSER_PATH)) {
      throw new Error(`CHO_BROWSER_PATH does not exist: ${process.env.CHO_BROWSER_PATH}`)
    }
    return process.env.CHO_BROWSER_PATH
  }
  for (const candidate of process.platform === 'win32' ? WINDOWS_BROWSERS : POSIX_BROWSERS) {
    if (candidate && existsSync(candidate)) return candidate
  }
  if (process.platform !== 'win32') {
    for (const command of POSIX_COMMANDS) {
      const found = spawnSync('which', [command], { encoding: 'utf8' })
      if (found.status === 0 && found.stdout.trim()) return found.stdout.trim()
    }
  }
  throw new Error('No Chrome/Edge/Chromium found. Set CHO_BROWSER_PATH to a browser executable.')
}

export async function launchBrowser() {
  const executable = findBrowser()
  const profileDir = mkdtempSync(join(tmpdir(), 'cho-cdp-'))
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    '--window-size=1280,900',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ]
  const proc = spawn(executable, args, { stdio: 'ignore' })
  let exited = false
  let spawnError = null
  proc.on('exit', () => { exited = true })
  proc.on('error', err => { spawnError = err })

  const killProcess = () => {
    try {
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' })
      } else {
        proc.kill('SIGKILL')
      }
    } catch {}
  }

  const waitForExit = async () => {
    if (exited) return
    await Promise.race([
      new Promise(resolve => proc.once('exit', resolve)),
      sleep(3000),
    ])
  }

  const removeProfile = async () => {
    for (let i = 0; i < 20; i++) {
      try {
        rmSync(profileDir, { recursive: true, force: true })
        return
      } catch {
        await sleep(100)
      }
    }
  }

  try {
    const portFile = join(profileDir, 'DevToolsActivePort')
    let port = null
    for (let i = 0; i < 150; i++) {
      if (spawnError) throw spawnError
      if (exited) throw new Error('Browser exited before the DevTools endpoint was ready.')
      if (existsSync(portFile)) {
        const [line] = readFileSync(portFile, 'utf8').split('\n')
        if (line && /^\d+$/.test(line.trim())) {
          port = Number(line.trim())
          break
        }
      }
      await sleep(100)
    }
    if (!port) throw new Error('Timed out waiting for the browser DevTools endpoint.')

    const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()

    return {
      port,
      version,
      async newPage() {
        let res = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })
        if (!res.ok) res = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`)
        if (!res.ok) throw new Error(`Could not create a browser tab (HTTP ${res.status}).`)
        const target = await res.json()
        const page = new CdpPage(target.webSocketDebuggerUrl)
        await page.connect()
        return page
      },
      async close() {
        killProcess()
        await waitForExit()
        await removeProfile()
      },
    }
  } catch (error) {
    killProcess()
    await waitForExit()
    await removeProfile()
    throw error
  }
}

class CdpPage {
  constructor(wsUrl) {
    this.wsUrl = wsUrl
    this.ws = null
    this.nextId = 1
    this.pending = new Map()
    this.listeners = new Map()
    this.events = []
    this.requestUrls = new Map()
    this.responses = []
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl)
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true })
      this.ws.addEventListener('error', reject, { once: true })
    })
    this.ws.addEventListener('message', event => this.handleMessage(event.data))
  }

  handleMessage(raw) {
    const text = typeof raw === 'string' ? raw : raw.toString()
    const message = JSON.parse(text)
    if (message.id) {
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      if (message.error) {
        pending.reject(new Error(`${message.error.message} (${message.error.code})`))
      } else {
        pending.resolve(message.result)
      }
      return
    }

    this.events.push(message)
    if (message.method === 'Network.requestWillBeSent') {
      this.requestUrls.set(message.params.requestId, message.params.request.url)
    } else if (message.method === 'Network.responseReceived') {
      const response = message.params.response
      this.responses.push({
        url: response.url,
        status: response.status,
        mimeType: response.mimeType,
        headers: response.headers,
        protocol: response.protocol,
      })
    }

    const handlers = this.listeners.get(message.method)
    if (handlers) {
      for (const handler of handlers) {
        Promise.resolve(handler(message.params)).catch(() => {})
      }
    }
  }

  on(method, handler) {
    if (!this.listeners.has(method)) this.listeners.set(method, [])
    this.listeners.get(method).push(handler)
  }

  send(method, params = {}) {
    const id = this.nextId++
    this.ws.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
    })
  }

  async enable() {
    await this.send('Page.enable')
    await this.send('Runtime.enable')
    await this.send('Network.enable')
    await this.send('Log.enable')
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    })
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
    }
    return result.result?.value
  }

  async waitFor(expression, timeoutMs, label = expression) {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      if (await this.evaluate(expression)) return Date.now() - start
      await sleep(100)
    }
    throw new Error(`Timed out after ${timeoutMs}ms waiting for ${label}.`)
  }

  async navigate(url) {
    await this.send('Page.navigate', { url })
    await this.waitFor(`document.readyState === 'complete'`, 30000, 'document load')
  }

  async reload() {
    await this.send('Page.reload', { ignoreCache: false })
    await this.waitFor(`document.readyState === 'complete'`, 30000, 'reload')
  }

  async click(selector) {
    const positioned = await this.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      document.documentElement.style.scrollBehavior = 'auto';
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      return true;
    })()`)
    if (!positioned) throw new Error(`Element not found: ${selector}`)
    await sleep(150)

    const rect = await this.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      const r = el.getBoundingClientRect();
      return {
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
        vw: window.innerWidth,
        vh: window.innerHeight,
        text: (el.textContent || '').trim(),
        disabled: el.disabled === true,
      };
    })()`)
    if (rect.x < 0 || rect.y < 0 || rect.x > rect.vw || rect.y > rect.vh) {
      throw new Error(`Element is outside the viewport: ${selector}`)
    }

    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y })
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 })
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 })
    return rect
  }

  staticAssetFailures() {
    const failures = []
    const seen = new Set()
    const add = (url, status, detail) => {
      const key = `${url}|${status}|${detail}`
      if (seen.has(key)) return
      seen.add(key)
      failures.push({ url, status, detail })
    }
    for (const response of this.responses) {
      if (response.url.includes('/_next/static/') && response.status >= 400) {
        add(response.url, response.status, `${response.mimeType || 'unknown'} ${response.protocol || ''}`.trim())
      }
    }
    for (const event of this.events) {
      if (event.method !== 'Network.loadingFailed') continue
      const url = this.requestUrls.get(event.params.requestId) || ''
      if (url.includes('/_next/static/')) {
        add(url, 0, `${event.params.errorText} ${event.params.type}`.trim())
      }
    }
    return failures
  }

  consoleIssues() {
    const issues = []
    const add = (level, text) => {
      if (!text) return
      if (/challenges\.cloudflare\.com|Tracking Prevention|favicon/i.test(text)) return
      issues.push({ level, text })
    }
    for (const event of this.events) {
      if (event.method === 'Runtime.exceptionThrown') {
        add('exception', event.params.exceptionDetails?.exception?.description || event.params.exceptionDetails?.text)
      } else if (event.method === 'Log.entryAdded' && ['error', 'warning'].includes(event.params.entry.level)) {
        add(event.params.entry.level, event.params.entry.text)
      } else if (event.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(event.params.type)) {
        add(event.params.type, event.params.args?.map(arg => arg.value ?? arg.description ?? '').join(' '))
      }
    }
    return issues
  }

  hydrationIssues() {
    return this.consoleIssues().filter(issue => /hydrat|did not match|server rendered|client rendered/i.test(issue.text))
  }

  async close() {
    try {
      this.ws?.close()
    } catch {}
  }
}
