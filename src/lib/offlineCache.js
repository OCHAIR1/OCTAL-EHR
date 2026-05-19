/**
 * offlineCache.js — IndexedDB cache for OCTAL-EHR
 *
 * TWO STORES:
 *   1. student_cache — student records (matric hash → encrypted profile data)
 *      • 8-hour TTL, cleared on logout
 *   2. file_cache — file blobs mirroring Cloudflare R2 / Supabase Storage
 *      • NO TTL — persists until remote version changes or explicit purge
 *      • Stores the same binary blob as the remote (encrypted at rest)
 *      • Only replaced when the remote etag/updated_at changes
 *      • Cleared when student account is reset
 *
 * SYNC LOGIC (file_cache):
 *   Online access → check remote etag
 *     • etag matches local → serve from local (fast)
 *     • etag differs → re-download, overwrite local copy
 *   Offline access → serve from local (if cached)
 *   Account reset → purge all files for that student_id
 *   Logout → clear student_cache only (files are encrypted blobs, safe to keep)
 *
 * NOTE: IDB student_cache is cleared on logout to prevent data leakage
 *       on shared machines. File cache persists for speed.
 */

const DB_NAME = 'octal-ehr-cache'
const DB_VERSION = 2  // bumped from 1 → 2 to add file_cache store
const STUDENT_STORE = 'student_cache'
const FILE_STORE = 'file_cache'
const MAX_CACHE_AGE_MS = 8 * 60 * 60 * 1000 // 8 hours (student records only)

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = e.target.result

      // Student records store (v1)
      if (!db.objectStoreNames.contains(STUDENT_STORE)) {
        const store = db.createObjectStore(STUDENT_STORE, { keyPath: 'matric_hash' })
        store.createIndex('cached_at', 'cached_at', { unique: false })
      }

      // File blobs store (v2)
      if (!db.objectStoreNames.contains(FILE_STORE)) {
        const fileStore = db.createObjectStore(FILE_STORE, { keyPath: 'storage_path' })
        fileStore.createIndex('student_id', 'student_id', { unique: false })
        fileStore.createIndex('cached_at', 'cached_at', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// ═══════════════════════════════════════════════════════════
// STUDENT RECORD CACHE (unchanged from v1)
// ═══════════════════════════════════════════════════════════

/**
 * Cache a student record fetched from Supabase.
 * Call this every time a successful online fetch occurs.
 */
export async function cacheStudentRecord(matricHash, studentData) {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STUDENT_STORE, 'readwrite')
      tx.objectStore(STUDENT_STORE).put({
        matric_hash: matricHash,
        student_id: studentData.id,
        data: studentData,          // raw encrypted columns from Supabase
        cached_at: Date.now()
      })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // Cache write failures are non-fatal
  }
}

/**
 * Retrieve a cached student record by matric hash.
 * Returns null if not found or stale.
 */
export async function getCachedStudentRecord(matricHash) {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STUDENT_STORE, 'readonly')
      const req = tx.objectStore(STUDENT_STORE).get(matricHash)
      req.onsuccess = () => {
        const record = req.result
        if (!record) { resolve(null); return }
        const age = Date.now() - record.cached_at
        if (age > MAX_CACHE_AGE_MS) { resolve(null); return } // stale
        resolve(record)
      }
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

/**
 * Clear ALL cached student records.
 * Call on staff logout.
 */
export async function clearCache() {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STUDENT_STORE, 'readwrite')
      tx.objectStore(STUDENT_STORE).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // Non-fatal
  }
}

// ═══════════════════════════════════════════════════════════
// FILE CACHE — local mirror of Cloudflare R2 / Supabase Storage
// ═══════════════════════════════════════════════════════════

/**
 * Cache a file blob locally.
 *
 * @param {string} storagePath  - The R2/Storage path (used as primary key)
 * @param {Blob}   blob         - The file blob (binary data)
 * @param {string} studentId    - UUID of the owning student (for purge-by-student)
 * @param {string} etag         - Remote etag or updated_at timestamp (for freshness check)
 * @param {object} meta         - Optional metadata (filename, mime, size, etc.)
 */
export async function cacheFile(storagePath, blob, studentId, etag, meta = {}) {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(FILE_STORE, 'readwrite')
      tx.objectStore(FILE_STORE).put({
        storage_path: storagePath,
        blob: blob,
        student_id: studentId,
        etag: etag || null,
        cached_at: Date.now(),
        original_filename: meta.filename || null,
        mime_type: meta.mimeType || null,
        file_size: meta.fileSize || null
      })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // Cache write failures are non-fatal
  }
}

/**
 * Retrieve a cached file blob.
 * Returns { blob, etag, cached_at, ... } or null if not cached.
 * Does NOT check freshness — caller should compare etag with remote.
 */
export async function getCachedFile(storagePath) {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(FILE_STORE, 'readonly')
      const req = tx.objectStore(FILE_STORE).get(storagePath)
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

/**
 * Check if a cached file is still fresh by comparing etags.
 * Returns true if the local etag matches the remote etag (no re-download needed).
 *
 * @param {string} storagePath - The R2/Storage path
 * @param {string} remoteEtag  - The current remote etag or updated_at
 * @returns {boolean}
 */
export async function isFileFresh(storagePath, remoteEtag) {
  try {
    const cached = await getCachedFile(storagePath)
    if (!cached) return false
    return cached.etag === remoteEtag
  } catch {
    return false
  }
}

/**
 * Remove a specific file from the local cache.
 * Call when the remote version is updated and we need to invalidate.
 */
export async function removeCachedFile(storagePath) {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(FILE_STORE, 'readwrite')
      tx.objectStore(FILE_STORE).delete(storagePath)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // Non-fatal
  }
}

/**
 * Purge ALL cached files for a specific student.
 * Call during account reset.
 *
 * @param {string} studentId - UUID of the student whose files should be purged
 */
export async function purgeStudentFiles(studentId) {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(FILE_STORE, 'readwrite')
      const store = tx.objectStore(FILE_STORE)
      const index = store.index('student_id')
      const req = index.openCursor(IDBKeyRange.only(studentId))

      req.onsuccess = (e) => {
        const cursor = e.target.result
        if (cursor) {
          cursor.delete()
          cursor.continue()
        }
      }

      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // Non-fatal
  }
}

/**
 * Clear ALL cached files (nuclear option).
 * Use only if needed for a full cache reset.
 */
export async function clearFileCache() {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(FILE_STORE, 'readwrite')
      tx.objectStore(FILE_STORE).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // Non-fatal
  }
}

// ═══════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════

/**
 * Check if the browser is online.
 */
export function isOnline() {
  return navigator.onLine
}

/**
 * Get file from cache or download fresh.
 * The main function for file access — handles the sync-on-update logic.
 *
 * @param {string}   storagePath  - R2/Storage path
 * @param {string}   studentId    - Student UUID
 * @param {string}   remoteEtag   - Current remote etag/updated_at (null if unknown)
 * @param {function} downloadFn   - Async function that downloads the file, returns { blob, etag }
 * @param {object}   meta         - Optional { filename, mimeType, fileSize }
 * @returns {{ blob: Blob, fromCache: boolean }}
 */
export async function getFileWithSync(storagePath, studentId, remoteEtag, downloadFn, meta = {}) {
  // 1. Check local cache
  const cached = await getCachedFile(storagePath)

  // 2. If offline, return whatever we have locally
  if (!isOnline()) {
    if (cached) return { blob: cached.blob, fromCache: true }
    return null // nothing cached, can't download
  }

  // 3. Online — check if local copy is still fresh
  if (cached && remoteEtag && cached.etag === remoteEtag) {
    // Local matches remote — serve from cache (fast!)
    return { blob: cached.blob, fromCache: true }
  }

  // 4. Either no cache, or stale — download fresh
  try {
    const result = await downloadFn()
    if (result && result.blob) {
      // Cache the fresh copy
      await cacheFile(storagePath, result.blob, studentId, result.etag || remoteEtag, meta)
      return { blob: result.blob, fromCache: false }
    }
  } catch {
    // Download failed — fall back to cached version if available
    if (cached) return { blob: cached.blob, fromCache: true }
  }

  return null
}
