import { createPool, loadEnv } from '../scripts/db-env.mjs'

const pool = createPool(loadEnv())
const q = async (sql, params = []) => {
  const [rows] = params.length > 0 ? await pool.execute(sql, params) : await pool.query(sql)
  return rows
}

try {
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
} finally {
  await pool.end()
}
