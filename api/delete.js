import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3'

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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { paths } = req.body

    if (!paths || !Array.isArray(paths) || paths.length === 0) {
      return res.status(400).json({ error: 'Missing paths array' })
    }

    const results = []
    for (const path of paths) {
      try {
        await r2.send(new DeleteObjectCommand({
          Bucket: BUCKET,
          Key: path,
        }))
        results.push({ path, deleted: true })
      } catch (err) {
        results.push({ path, deleted: false, error: err.message })
      }
    }

    return res.status(200).json({ success: true, results })
  } catch (err) {
    console.error('R2 delete error:', err)
    return res.status(500).json({ error: 'Delete failed: ' + err.message })
  }
}
