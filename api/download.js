import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const r2 = new S3Client({
  region: 'auto',
  endpoint: (process.env.R2_ENDPOINT || '').trim(),
  credentials: {
    accessKeyId: (process.env.R2_ACCESS_KEY_ID || '').trim(),
    secretAccessKey: (process.env.R2_SECRET_ACCESS_KEY || '').trim(),
  },
})

const BUCKET = process.env.R2_BUCKET_NAME

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { path } = req.query

    if (!path) {
      return res.status(400).json({ error: 'Missing path parameter' })
    }

    // Generate presigned URL — expires in 5 minutes
    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: path,
    })

    const signedUrl = await getSignedUrl(r2, command, { expiresIn: 300 })

    return res.status(200).json({
      success: true,
      url: signedUrl,
    })
  } catch (err) {
    console.error('R2 download error:', err)
    return res.status(500).json({ error: 'Download failed: ' + err.message })
  }
}
