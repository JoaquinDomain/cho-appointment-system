// Password hash using node scrypt, no extra package needed.
// Saved format: scrypt$v=1$n=16384$r=8$p=1$<salt>$<hash>
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const PREFIX = 'scrypt$v=1$n=16384$r=8$p=1$'

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('base64')
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('base64')
  return `${PREFIX}${salt}$${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    if (!stored.startsWith(PREFIX)) return false
    const parts = stored.split('$') // scrypt, v=1, n=..., r=..., p=..., salt, hash
    const salt = parts[5]
    const expected = parts[6]
    if (!salt || !expected) return false
    const actual = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 })
    const expectedBuf = Buffer.from(expected, 'base64')
    if (actual.length !== expectedBuf.length) return false
    return timingSafeEqual(actual, expectedBuf)
  } catch {
    return false
  }
}

// Fake hash so login time is same even if email does not exist.
const DUMMY_HASH = `${PREFIX}AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`

export function verifyAgainstDummy(password: string): void {
  verifyPassword(password, DUMMY_HASH)
}
