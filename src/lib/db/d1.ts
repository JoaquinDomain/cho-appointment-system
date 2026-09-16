// Server-only Cloudflare D1 client over the HTTP API (app runs on Vercel,
// so there is no Workers binding — all queries go through api.cloudflare.com).
// Never import from a 'use client' component.

interface D1Envelope {
  success: boolean
  errors?: Array<{ message?: string }>
  result?: Array<{ results?: unknown[]; meta?: { changes?: number } }>
}

function getConfig() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID
  const apiToken = process.env.CLOUDFLARE_D1_API_TOKEN
  if (!accountId || !databaseId || !apiToken) {
    throw new Error(
      'Missing D1 env: set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, CLOUDFLARE_D1_API_TOKEN.'
    )
  }
  return { accountId, databaseId, apiToken }
}

export async function d1Query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const { accountId, databaseId, apiToken } = getConfig()
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
      cache: 'no-store',
    }
  )
  const json = (await res.json().catch(() => null)) as D1Envelope | null
  if (!res.ok || !json?.success) {
    const detail = json?.errors?.[0]?.message ?? `HTTP ${res.status}`
    throw new Error(`D1 query failed: ${detail}`)
  }
  const rows = json.result?.[0]?.results ?? []
  return rows as T[]
}

export async function d1First<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await d1Query<T>(sql, params)
  return rows[0] ?? null
}

// For INSERT/UPDATE/DELETE. Returns number of changed rows.
export async function d1Run(sql: string, params: unknown[] = []): Promise<number> {
  const { accountId, databaseId, apiToken } = getConfig()
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
      cache: 'no-store',
    }
  )
  const json = (await res.json().catch(() => null)) as D1Envelope | null
  if (!res.ok || !json?.success) {
    const detail = json?.errors?.[0]?.message ?? `HTTP ${res.status}`
    throw new Error(`D1 write failed: ${detail}`)
  }
  return json.result?.[0]?.meta?.changes ?? 0
}
