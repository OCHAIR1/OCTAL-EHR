import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
})

const BUCKET = process.env.R2_BUCKET_NAME

// Max 10MB
const MAX_SIZE = 10 * 1024 * 1024

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { fileName, fileData, contentType, studentHash } = req.body

    if (!fileName || !fileData || !contentType) {
      return res.status(400).json({ error: 'Missing fileName, fileData, or contentType' })
    }

    // Decode base64 file data
    const buffer = Buffer.from(fileData, 'base64')

    if (buffer.length > MAX_SIZE) {
      return res.status(413).json({ error: 'File too large. Maximum 10MB.' })
    }

    // Build storage path: medical-docs/{studentHash}/{timestamp}-{filename}
    const storagePath = `medical-docs/${studentHash || 'unknown'}/${Date.now()}-${fileName}`

    await r2.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: storagePath,
      Body: buffer,
      ContentType: contentType,
    }))

    return res.status(200).json({
      success: true,
      storagePath,
      size: buffer.length,
    })
  } catch (err) {
    console.error('R2 upload error:', err)
    return res.status(500).json({ error: 'Upload failed: ' + err.message })
  }
}

// Vercel body parser config — allow larger payloads for file uploads
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '12mb',
    },
  },
}
