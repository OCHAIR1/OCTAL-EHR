/**
 * SHA-256 hash for matric number lookup.
 * NEVER send raw matric numbers to the database.
 */
export async function hashMatricNo(matricNo) {
  const normalized = matricNo.trim().toUpperCase()
  const encoder = new TextEncoder()
  const data = encoder.encode(normalized)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
