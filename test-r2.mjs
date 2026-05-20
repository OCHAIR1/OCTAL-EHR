import fs from 'fs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const envText = fs.readFileSync('.env.local', 'utf8');
const env = envText.split(/\r?\n/).reduce((acc, line) => {
  const parts = line.split('=');
  if(parts.length > 1) {
    const k = parts.shift().trim();
    const v = parts.join('=').trim().replace(/^"|"$/g, '');
    acc[k] = v;
  }
  return acc;
}, {});

const r2 = new S3Client({
  region: 'auto',
  endpoint: (env.R2_ENDPOINT || '').trim(),
  credentials: {
    accessKeyId: (env.R2_ACCESS_KEY_ID || '').trim(),
    secretAccessKey: (env.R2_SECRET_ACCESS_KEY || '').trim(),
  },
});

async function testUpload() {
  try {
    const buffer = Buffer.from('test upload', 'utf8');
    const storagePath = `test-${Date.now()}.txt`;
    
    await r2.send(new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: storagePath,
      Body: buffer,
      ContentType: 'text/plain',
    }));
    
    console.log("Upload SUCCESS! Path:", storagePath);
  } catch (err) {
    console.error("Upload FAILED:", err.message);
  }
}

testUpload();
