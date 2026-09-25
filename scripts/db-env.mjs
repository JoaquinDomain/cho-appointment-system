// Shared env + MySQL pool for the standalone Node scripts (no Next.js here).
// Priority: real process env first, then .env.local for anything unset.
// Credentials only ever come from the environment — never hardcode them.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import mysql from 'mysql2/promise'

export function loadEnv() {
  const env = { ...process.env }
  try {
    const text = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
    for (const line of text.split(/\r?\n/)) {
      if (!line.includes('=') || line.trimStart().startsWith('#')) continue
      const i = line.indexOf('=')
      const key = line.slice(0, i).trim()
      const value = line.slice(i + 1).trim()
      // explicit values (including an empty password) always win
      if (env[key] === undefined) env[key] = value
    }
  } catch {
    // no .env.local — process env only
  }
  return env
}

export function createPool(env = loadEnv()) {
  const { MYSQL_HOST, MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD } = env
  if (!MYSQL_HOST || !MYSQL_DATABASE || !MYSQL_USER || MYSQL_PASSWORD === undefined) {
    throw new Error(
      'Missing MySQL env: set MYSQL_HOST, MYSQL_PORT, MYSQL_DATABASE, MYSQL_USER and MYSQL_PASSWORD.'
    )
  }
  return mysql.createPool({
    host: MYSQL_HOST,
    port: Number(env.MYSQL_PORT || 3306),
    database: MYSQL_DATABASE,
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    dateStrings: true,
    timezone: 'Z',
    charset: 'UTF8MB4_GENERAL_CI',
  })
}
