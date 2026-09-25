// MySQL 8.0 client for server use only. Do not import in client components.
// Every query goes through mysql2 server-side prepared statements (? markers),
// so user input is never concatenated into SQL.
import { readFileSync } from 'node:fs'
import mysql, { type Pool, type PoolOptions, type ResultSetHeader } from 'mysql2/promise'

const POOL_KEY = '__bchoMysqlPool'

function readPem(name: 'MYSQL_SSL_CA' | 'MYSQL_SSL_CERT' | 'MYSQL_SSL_KEY'): string | undefined {
  const path = process.env[name]
  if (!path) return undefined
  try {
    return readFileSync(path, 'utf8')
  } catch {
    throw new Error(`Cannot read ${name} file at ${path}.`)
  }
}

function sslConfig(): PoolOptions['ssl'] {
  const ca = readPem('MYSQL_SSL_CA')
  const cert = readPem('MYSQL_SSL_CERT')
  const key = readPem('MYSQL_SSL_KEY')
  const wanted = process.env.MYSQL_SSL === 'true' || Boolean(ca || cert || key)
  if (!wanted) return undefined
  return {
    ...(ca ? { ca } : {}),
    ...(cert ? { cert } : {}),
    ...(key ? { key } : {}),
    rejectUnauthorized: process.env.MYSQL_SSL_REJECT_UNAUTHORIZED !== 'false',
  }
}

function intFromEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`)
  }
  return value
}

function poolConfig(): PoolOptions {
  const host = process.env.MYSQL_HOST
  const database = process.env.MYSQL_DATABASE
  const user = process.env.MYSQL_USER
  const password = process.env.MYSQL_PASSWORD
  if (!host || !database || !user || password === undefined) {
    throw new Error(
      'Missing MySQL env: set MYSQL_HOST, MYSQL_PORT, MYSQL_DATABASE, MYSQL_USER and MYSQL_PASSWORD.'
    )
  }
  return {
    host,
    port: intFromEnv('MYSQL_PORT', 3306, 1, 65535),
    database,
    user,
    password,
    waitForConnections: true,
    connectionLimit: intFromEnv('MYSQL_CONNECTION_LIMIT', 10, 1, 100),
    queueLimit: 0,
    enableKeepAlive: true,
    // DATE/DATETIME columns come back as strings, never as Date objects that
    // shift with the server timezone.
    dateStrings: true,
    // Driver timestamps are formatted as UTC.
    timezone: 'Z',
    charset: 'UTF8MB4_GENERAL_CI',
    ssl: sslConfig(),
  }
}

// One pool per process; survives Next.js dev-server module reloads.
function getPool(): Pool {
  const holder = globalThis as unknown as Record<string, Pool | undefined>
  if (!holder[POOL_KEY]) {
    holder[POOL_KEY] = mysql.createPool(poolConfig())
  }
  return holder[POOL_KEY] as Pool
}

// Values mysql2 accepts as prepared-statement parameters. undefined is
// normalised to null so a missing optional field binds as SQL NULL.
type SqlValue = string | number | bigint | boolean | Date | Buffer | null

function toValues(params: unknown[]): SqlValue[] {
  return params.map((value) => (value === undefined ? null : value)) as SqlValue[]
}

/** SELECT (and any statement) → rows. Non-SELECT statements return []. */
export async function dbQuery<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const values = toValues(params)
  const [rows] = values.length > 0 ? await getPool().execute(sql, values) : await getPool().execute(sql)
  if (!Array.isArray(rows)) return []
  return rows as T[]
}

/** SELECT → first row or null. */
export async function dbFirst<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await dbQuery<T>(sql, params)
  return rows[0] ?? null
}

/**
 * INSERT/UPDATE/DELETE → affected rows.
 * mysql2 enables CLIENT_FOUND_ROWS by default, so an UPDATE that matches a row
 * reports 1 even when the stored values are unchanged (same as SQLite changes()).
 */
export async function dbRun(sql: string, params: unknown[] = []): Promise<number> {
  const values = toValues(params)
  const [result] = values.length > 0
    ? await getPool().execute(sql, values)
    : await getPool().execute(sql)
  if (result && typeof result === 'object' && 'affectedRows' in result) {
    return (result as ResultSetHeader).affectedRows
  }
  return 0
}
