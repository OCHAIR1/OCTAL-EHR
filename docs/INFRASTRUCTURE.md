# OCTAL-EHR — Infrastructure & Storage Plan

> Simple. Direct. What runs where and what it costs.

---

## Where Everything Lives

| What | Where | Cost |
|------|-------|------|
| Database (all student records, visits, audit logs) | Supabase Free | $0/month |
| Authentication (student + staff logins) | Supabase Auth | $0/month |
| File storage (medical docs, profile photos) | Cloudflare R2 | $0/month (under 10GB) |
| AI document scanning | Gemini 2.0 Flash (free tier) | $0/month |
| Hosting (student app + staff dashboard) | Vercel | $0/month |
| Scheduled jobs (retention cleanup) | Supabase pg_cron | $0/month |
| Database backups | Cloudflare R2 `/backups/` folder | $0/month |
| Anti-pause ping | cron-job.org | $0/month |

**Total monthly cost: $0**

---

## Storage Math

| Item | Per Student | 10,000 Students |
|------|------------|-----------------|
| Profile photo (WebP, compressed) | 80KB | 800MB |
| Medical document (PDF/image) | 800KB | 8GB |
| Database rows (all tables) | 30KB | 300MB |
| Visit records (over 4 years) | 20KB | 200MB |
| Audit logs | 10KB | 100MB |
| **Total** | ~940KB | **~9.5GB** |

Cloudflare R2 gives you **10GB free**. Your entire system fits.

---

## Supabase Free Tier Limits

| Resource | Limit | Your Usage |
|----------|-------|-----------|
| Database | 500MB | ~300MB ✅ |
| File Storage | 1GB | Not using (files go to R2) |
| Auth users | 50,000 MAU | ~10,000 ✅ |
| Edge Functions | 500K calls/month | Minimal ✅ |

---

## Cloudflare R2 Pricing

```
First 10GB storage:    FREE
After 10GB:            $0.015/GB/month
Downloads:             ALWAYS FREE (no egress fees)
```

Even at 15GB: $0.075/month. Effectively free forever at your scale.

---

## The Pause Problem

Supabase free tier pauses your project after 7 days of no activity.

**Fix**: Set up a free ping at [cron-job.org](https://cron-job.org):
- URL: your Supabase REST endpoint
- Interval: every 3 days
- Cost: $0, set and forget

---

## Backups

Medical data must be backed up. Here's how — free:

1. A Supabase Edge Function runs weekly (via pg_cron)
2. It exports the database as compressed SQL
3. Uploads to Cloudflare R2 under `/backups/YYYY-MM-DD.sql.gz`
4. Keeps last 12 weeks, deletes older ones
5. Total backup storage: ~600MB — still under 10GB free

---

## When to Upgrade

| Trigger | Action |
|---------|--------|
| Database hits 400MB | Upgrade Supabase to Pro ($25/month) |
| Active students exceed 8,000 | Upgrade to Pro |
| School officially adopts the system | School pays for Pro |

Pro gives you: 8GB database, 100GB storage, daily automated backups, no pausing.

**N40,000/month** — less than paper folders for 100 students.

---

## Long-Term Cost

```
Year 0-1:   $0/month     (everything under free limits)
Year 1-3:   $0-$3/month  (R2 slightly over 10GB)
Year 3+:    ~$28/month   (School pays Supabase Pro + R2)
Year 6+:    Cost stays flat or drops (old records auto-delete)
```
