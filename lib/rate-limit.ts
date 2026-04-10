// TODO: Para múltiplas instâncias Vercel, migrar para Upstash Redis

interface RateLimitEntry {
  count: number
  windowStart: number
}

const store = new Map<string, RateLimitEntry>()

/**
 * In-memory rate limiter.
 * Returns true if the request is allowed, false if it should be blocked (429).
 *
 * @param ip       - Client IP address
 * @param key      - Route identifier (e.g. "simular", "aplicacao")
 * @param maxRequests - Max allowed requests within the window
 * @param windowMs    - Time window in milliseconds
 */
export function rateLimit(
  ip: string,
  key: string,
  maxRequests: number,
  windowMs: number
): boolean {
  const storeKey = `${key}:${ip}`
  const now = Date.now()
  const entry = store.get(storeKey)

  if (!entry || now - entry.windowStart >= windowMs) {
    // New window
    store.set(storeKey, { count: 1, windowStart: now })
    return true
  }

  if (entry.count >= maxRequests) {
    return false
  }

  entry.count += 1
  return true
}

/**
 * Extracts the client IP from a Next.js request.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return '127.0.0.1'
}
