// Clean up db error before sending to frontend.
// Hide tokens and limit length.
export function toSafeDetail(msg: string): string {
  const cleaned = msg
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/token\s*[:=]\s*\S+/gi, 'token [redacted]')
    .trim()
    .slice(0, 300)
  return cleaned || 'Unknown database error. Check server logs.'
}
