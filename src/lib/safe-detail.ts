// Shared sanitizer for database errors shown in API responses.
// Strips credential-like material and caps length. D1 error text contains no
// secrets, but this keeps UI output safe by construction.
export function toSafeDetail(msg: string): string {
  const cleaned = msg
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/token\s*[:=]\s*\S+/gi, 'token [redacted]')
    .trim()
    .slice(0, 300)
  return cleaned || 'Unknown database error. Check server logs.'
}
