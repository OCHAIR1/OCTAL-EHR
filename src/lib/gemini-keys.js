import { GoogleGenerativeAI } from '@google/generative-ai'

/**
 * GEMINI KEY ROTATION
 * Rotates across multiple API keys from separate Google Cloud projects.
 * Each project has its own 150 RPM free-tier quota.
 * 4 keys = 600 RPM effective capacity.
 */

const API_KEYS = [
  import.meta.env.VITE_GEMINI_API_KEY,
  import.meta.env.VITE_GEMINI_API_KEY_2,
  import.meta.env.VITE_GEMINI_API_KEY_3,
  import.meta.env.VITE_GEMINI_API_KEY_4,
].filter(Boolean) // only include keys that exist

// Pre-create clients for each key
const clients = API_KEYS.map(key => new GoogleGenerativeAI(key))

let currentIndex = 0

/**
 * Get the next API key in round-robin rotation.
 */
export function getNextKey() {
  if (API_KEYS.length === 0) throw new Error('No Gemini API keys configured')
  const key = API_KEYS[currentIndex]
  currentIndex = (currentIndex + 1) % API_KEYS.length
  return key
}

/**
 * Get the next GoogleGenerativeAI client in round-robin rotation.
 */
export function getNextClient() {
  if (clients.length === 0) throw new Error('No Gemini API keys configured')
  const client = clients[currentIndex]
  currentIndex = (currentIndex + 1) % clients.length
  return client
}

/**
 * Execute a Gemini call with automatic key rotation on rate limit (429).
 * Tries each key once before giving up.
 *
 * @param {function} callFn - async (client: GoogleGenerativeAI) => result
 * @returns {Promise<any>} - the result of the first successful call
 */
export async function callWithRotation(callFn) {
  const totalKeys = clients.length
  let lastError = null

  for (let attempt = 0; attempt < totalKeys; attempt++) {
    const client = getNextClient()
    try {
      return await callFn(client)
    } catch (err) {
      lastError = err
      const status = err?.status || err?.httpStatus || err?.code
      const msg = err?.message || ''

      // Only rotate on rate limit errors
      const isRateLimit = status === 429 ||
        msg.includes('429') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('rate') ||
        msg.includes('quota')

      if (!isRateLimit) {
        throw err // non-rate-limit error — don't retry
      }

      // Rate limited — try next key
      console.warn(`Gemini key ${attempt + 1}/${totalKeys} rate limited, rotating...`)
    }
  }

  // All keys exhausted
  throw new Error(
    `All ${totalKeys} Gemini API keys are rate limited. Please wait a moment and try again. ` +
    `Last error: ${lastError?.message || 'Unknown'}`
  )
}

/**
 * How many keys are available.
 */
export const keyCount = API_KEYS.length
