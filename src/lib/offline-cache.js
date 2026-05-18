/**
 * OCTAL-EHR — IndexedDB Offline Cache
 *
 * Every patient record fetched from Supabase gets cached locally.
 * When offline, staff can still search and view cached records.
 */

const DB_NAME = 'octal-ehr-cache'
const DB_VERSION = 1

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (e) => {
      const db = e.target.result

      // Patient profiles
      if (!db.objectStoreNames.contains('patients')) {
        const store = db.createObjectStore('patients', { keyPath: 'id' })
        store.createIndex('matric_hash', 'matric_no_hash', { unique: true })
      }

      // Allergies (by student_id)
      if (!db.objectStoreNames.contains('allergies')) {
        const store = db.createObjectStore('allergies', { keyPath: 'id' })
        store.createIndex('student_id', 'student_id', { unique: false })
      }

      // Medical history (by student_id)
      if (!db.objectStoreNames.contains('medical_history')) {
        const store = db.createObjectStore('medical_history', { keyPath: 'id' })
        store.createIndex('student_id', 'student_id', { unique: false })
      }

      // Visits (by student_id)
      if (!db.objectStoreNames.contains('visits')) {
        const store = db.createObjectStore('visits', { keyPath: 'id' })
        store.createIndex('student_id', 'student_id', { unique: false })
      }

      // Documents (by student_id)
      if (!db.objectStoreNames.contains('documents')) {
        const store = db.createObjectStore('documents', { keyPath: 'id' })
        store.createIndex('student_id', 'student_id', { unique: false })
      }

      // Pending visits (offline-created, awaiting sync)
      if (!db.objectStoreNames.contains('pending_visits')) {
        db.createObjectStore('pending_visits', { keyPath: 'local_id', autoIncrement: true })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// ── Generic helpers ───────────────────────────────────────

async function putRecord(storeName, record) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    tx.objectStore(storeName).put(record)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function putRecords(storeName, records) {
  if (!records || records.length === 0) return
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    records.forEach(r => store.put(r))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function getRecord(storeName, key) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const req = tx.objectStore(storeName).get(key)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

async function getByIndex(storeName, indexName, key) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const index = tx.objectStore(storeName).index(indexName)
    const req = index.getAll(key)
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  })
}

async function getAllRecords(storeName) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const req = tx.objectStore(storeName).getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  })
}

async function deleteRecord(storeName, key) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    tx.objectStore(storeName).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// ── Public API ────────────────────────────────────────────

/**
 * Cache a full patient record (student + allergies + history + visits + docs)
 */
export async function cachePatientRecord({ student, allergies, history, visits, documents }) {
  await putRecord('patients', student)
  await putRecords('allergies', allergies)
  await putRecords('medical_history', history)
  await putRecords('visits', visits)
  await putRecords('documents', documents)
}

/**
 * Search for a patient by matric hash in the local cache
 */
export async function searchCachedPatient(matricHash) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('patients', 'readonly')
    const index = tx.objectStore('patients').index('matric_hash')
    const req = index.get(matricHash)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

/**
 * Get full cached patient data
 */
export async function getCachedPatientFull(studentId) {
  const [student, allergies, history, visits, documents] = await Promise.all([
    getRecord('patients', studentId),
    getByIndex('allergies', 'student_id', studentId),
    getByIndex('medical_history', 'student_id', studentId),
    getByIndex('visits', 'student_id', studentId),
    getByIndex('documents', 'student_id', studentId)
  ])

  return { student, allergies, history, visits, documents }
}

/**
 * Save a visit created while offline
 */
export async function savePendingVisit(visitData) {
  await putRecord('pending_visits', {
    ...visitData,
    created_at_local: new Date().toISOString(),
    synced: false
  })
}

/**
 * Get all pending (unsynced) visits
 */
export async function getPendingVisits() {
  return getAllRecords('pending_visits')
}

/**
 * Remove a pending visit after it's synced
 */
export async function removePendingVisit(localId) {
  await deleteRecord('pending_visits', localId)
}

/**
 * Check if we're online
 */
export function isOnline() {
  return navigator.onLine
}
