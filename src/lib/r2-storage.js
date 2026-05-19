/**
 * CLOUDFLARE R2 STORAGE CLIENT
 * Client-side helper that talks to Vercel serverless API routes.
 * Files are stored in Cloudflare R2 (10GB free) instead of Supabase Storage (1GB free).
 *
 * All R2 credentials stay server-side — never exposed to the browser.
 */

/**
 * Upload a file to R2 via the /api/upload serverless function.
 *
 * @param {File} file - The file to upload
 * @param {string} studentHash - Student matric hash for folder organization
 * @returns {Promise<{storagePath: string, size: number}>}
 */
export async function uploadToR2(file, studentHash) {
  // Convert file to base64
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      fileData: base64,
      contentType: file.type || 'application/octet-stream',
      studentHash,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload failed' }))
    throw new Error(err.error || `Upload failed (${res.status})`)
  }

  return res.json()
}

/**
 * Get a download URL for a file in R2.
 * Returns a presigned URL that expires in 5 minutes.
 *
 * @param {string} storagePath - The R2 storage path
 * @returns {Promise<string>} - Presigned download URL
 */
export async function getR2DownloadUrl(storagePath) {
  const res = await fetch(`/api/download?path=${encodeURIComponent(storagePath)}`)

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Download failed' }))
    throw new Error(err.error || `Download failed (${res.status})`)
  }

  const data = await res.json()
  return data.url
}

/**
 * Delete files from R2.
 *
 * @param {string[]} paths - Array of storage paths to delete
 * @returns {Promise<{results: Array}>}
 */
export async function deleteFromR2(paths) {
  const res = await fetch('/api/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Delete failed' }))
    throw new Error(err.error || `Delete failed (${res.status})`)
  }

  return res.json()
}
