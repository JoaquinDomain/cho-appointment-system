import { readFileSync } from 'node:fs'
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i), l.slice(i + 1).trim()]
    })
)
const ep = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${env.CLOUDFLARE_D1_DATABASE_ID}/query`
const q = async (sql, params = []) => {
  const r = await fetch(ep, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CLOUDFLARE_D1_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
  })
  const j = await r.json()
  return j.success ? j.result[0].results : j.errors
}
console.log('admins:', JSON.stringify(await q('SELECT email FROM admin_users')))
console.log(
  'e2e leftover sessions:',
  JSON.stringify(
    await q("SELECT COUNT(*) AS c FROM admin_sessions WHERE email LIKE 'e2e-tmp-%'")
  )
)
console.log(
  'e2e leftover admins:',
  JSON.stringify(
    await q("SELECT COUNT(*) AS c FROM admin_users WHERE email LIKE 'e2e-tmp-%'")
  )
)
