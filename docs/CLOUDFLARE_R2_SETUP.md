# Cloudflare R2 Setup Guide — OCTAL-EHR

> Takes about 5-10 minutes. You need: a Cloudflare account (you already have one).

---

## Step 1 — Enable R2

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com)
2. In the left sidebar, click **R2 Object Storage**
3. If it asks you to enable R2, click **Enable** (it's free, no card required for the free tier)

---

## Step 2 — Create Your Bucket

1. Click **Create Bucket**
2. Bucket name: `octal-ehr-files`
3. Location: **Automatic** (or pick a region close to Nigeria if available)
4. Click **Create Bucket**

That's it. Your bucket is ready.

---

## Step 3 — Create an API Token

This token lets the server upload/download files to R2.

1. Go to **R2 Object Storage** → **Manage R2 API Tokens** (top right)
2. Click **Create API Token**
3. Settings:
   - Token name: `octal-ehr-server`
   - Permissions: **Object Read & Write**
   - Specify bucket: **octal-ehr-files**
   - TTL: leave as **Forever** (or set an expiry if you want)
4. Click **Create API Token**
5. **COPY AND SAVE these 3 values immediately — they are shown only once:**
   - Access Key ID
   - Secret Access Key
   - Endpoint URL (looks like: `https://<account-id>.r2.cloudflarestorage.com`)

---

## Step 4 — Give Me These 3 Values

Once you have them, share:
```
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
R2_BUCKET_NAME=octal-ehr-files
```

I'll add them to the Supabase Edge Function secrets (server-side only, never in the browser).

---

## That's It

No domain setup needed. No Workers needed. No DNS changes.

The Supabase Edge Function handles all uploads/downloads. R2 is just the storage backend — students and staff never interact with Cloudflare directly.

---

## Cost Reminder

| What | Free Limit | Your Usage |
|------|-----------|-----------|
| Storage | 10GB/month | ~9.5GB total |
| Writes | 1M/month | ~10K at most |
| Reads | 10M/month | ~50K at most |
| Downloads | **Always free** | Unlimited |

You will not pay anything unless you exceed 10GB stored.
