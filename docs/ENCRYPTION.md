# OCTAL-EHR — How Encryption Works

> A human-readable guide to how student medical data is protected at every layer.

---

## The Problem

Caleb University stores student medical records digitally. If anyone — a hacker, a rogue database admin, or even someone who physically steals the hard drive — gets access to the database, they should **NOT** be able to read any student's medical information.

---

## The 3 Layers of Protection

```
┌─────────────────────────────────────────────────────┐
│                    LAYER 1                          │
│           SHA-256 Hash (Matric Lookup)              │
│    "I can find your row without knowing your name"  │
├─────────────────────────────────────────────────────┤
│                    LAYER 2                          │
│        Column-Level Encryption (_enc fields)        │
│    "Even if you see the row, it's gibberish"        │
├─────────────────────────────────────────────────────┤
│                    LAYER 3                          │
│          File Encryption (Cloudflare R2)            │
│    "Even the PDF/images are locked"                 │
└─────────────────────────────────────────────────────┘
```

---

## Layer 1: SHA-256 Hash — How We Find Students Without Storing Matric Numbers

### The Problem
When a medic searches for `24/15554`, we need to find that student's row in the database. But we don't want to store `24/15554` in plain text — that's PII.

### The Solution
We use a **one-way hash**. A hash is like a fingerprint: it always gives the same output for the same input, but you **cannot reverse it** to get the original.

```
INPUT:   "24/15554"
              │
              ▼
    SHA-256 algorithm
    (built into every browser)
              │
              ▼
OUTPUT:  "a3b8f2c1d4e5...7890abcdef" (64-character hex string)
```

### How it works in practice

```
STAFF TYPES: 24/15554
    │
    ▼
Browser computes: SHA-256("24/15554")
    │
    ▼
Result: "a3b8f2c1d4e5...7890abcdef"
    │
    ▼
Supabase query: WHERE matric_no_hash = "a3b8f2c1d4e5..."
    │
    ▼
Database finds the row → returns it
```

**The raw matric number "24/15554" is NEVER sent to the database.** Only the hash goes across the wire.

### Key properties
- Same input always produces the same hash (deterministic)
- Different inputs produce different hashes (collision-resistant)
- You CANNOT reverse a hash back to the original (one-way)
- Even changing one character produces a completely different hash

### Code location
- `src/lib/crypto.js` — the `hashMatricNo()` function

```javascript
// What happens inside hashMatricNo("24/15554"):
// 1. Normalize: "24/15554" → "24/15554" (trimmed, uppercased)
// 2. Encode: convert string to bytes
// 3. Hash: crypto.subtle.digest('SHA-256', bytes)
// 4. Convert: hash buffer → hex string "a3b8f2..."
```

---

## Layer 2: Column-Level Encryption — How PII Is Stored

### What is encrypted

Every column ending in `_enc` is encrypted before being saved:

| Column | Contains | Encrypted? |
|--------|----------|:----------:|
| `matric_no_enc` | `24/15554` | ✅ Yes |
| `full_name_enc` | `Ochuko Ederagoghene` | ✅ Yes |
| `date_of_birth_enc` | `2005-03-15` | ✅ Yes |
| `phone_number_enc` | `08012345678` | ✅ Yes |
| `home_address_enc` | `12 Lagos Street...` | ✅ Yes |
| `email_enc` | `ochuko.ederagoghene@...` | ✅ Yes |
| `emergency_contact_enc` | `{"name":"Mrs Edo..."}` | ✅ Yes |
| `allergen_enc` | `Penicillin` | ✅ Yes |
| `condition_enc` | `Asthma` | ✅ Yes |
| `blood_group` | `O+` | ❌ No (non-identifying) |
| `genotype` | `AA` | ❌ No (non-identifying) |
| `gender` | `male` | ❌ No (non-identifying) |

### Why blood_group and genotype aren't encrypted

These are **non-identifying** clinical values. Knowing someone is "O+" or "AA" doesn't tell you who they are. They're stored in plain text so the database can run queries like "how many students are AS genotype?" for public health analytics. They cannot be traced back to a specific person without the encrypted fields.

### How it works

```
APPLICATION WRITES:
    full_name_enc = "Ochuko Ederagoghene"
         │
         ▼
    Supabase Vault intercepts
         │
         ▼
    Encrypted with AES-256 using a key stored in Vault
         │
         ▼
    What's actually stored in PostgreSQL:
    full_name_enc = "gAAAAABl2.../x8Q2bK+vF..."
    (unreadable ciphertext)

APPLICATION READS:
    SELECT full_name_enc FROM students WHERE ...
         │
         ▼
    Supabase Vault decrypts automatically for authorized sessions
         │
         ▼
    App receives: "Ochuko Ederagoghene"
```

### The key is in Supabase Vault

- The encryption key is created once: `vault.create_secret('octal_ehr_pii_key', ...)`
- This key lives **inside Supabase's Vault** — it never appears in your code, your `.env` files, or your browser
- Even Supabase staff cannot read your vault keys
- If someone dumps the raw PostgreSQL data, they get meaningless ciphertext

### No decryption delay

Decryption happens **inline** at query time. When Supabase returns a row, the `_enc` columns are already decrypted (if the requesting user has the right RLS permissions). There is no separate "decrypt" API call, no loading spinner, no delay. It's transparent.

---

## Layer 3: File Encryption — Cloudflare R2

### What's stored in R2

When a student uploads their medical document (PDF, JPG, PNG), the file is stored in **Cloudflare R2** (an S3-compatible object store):

```
Bucket: octal-ehr-files/
├── a3b8f2c1...-doc-1716048000.pdf     ← Student A's medical form
├── f7d2e9a0...-doc-1716050000.jpg     ← Student B's lab result
└── ...
```

### How files are protected

1. **File names are hashed** — the filename is `{matric_hash}-doc-{timestamp}.{ext}`, so even the filename doesn't reveal who the student is
2. **R2 bucket is private** — no public URL, no CDN. Files can only be accessed via signed URLs generated by the server
3. **Signed URLs expire** — when staff needs to view a document, a temporary URL is generated that expires after a few minutes
4. **The file path is stored encrypted** — the `storage_path_enc` column in the `documents` table is encrypted, so even the path to the file is unreadable without vault access

### Storage vs Display flow

```
STUDENT UPLOADS FILE:
    document.pdf
         │
         ▼
    Upload to R2: octal-ehr-files/{hash}-doc-{timestamp}.pdf
         │
         ▼
    Store encrypted path in DB:
    storage_path_enc = ENCRYPT("{hash}-doc-{timestamp}.pdf")

STAFF VIEWS FILE:
    Staff clicks "Download" on patient view
         │
         ▼
    App reads storage_path_enc → decrypted to "{hash}-doc-{timestamp}.pdf"
         │
         ▼
    Generate signed URL: R2.getSignedUrl("{hash}-doc-{timestamp}.pdf", expires: 5min)
         │
         ▼
    Browser downloads file via temporary URL
```

---

## Local File Cache — IndexedDB Mirror

### Why cache files locally?

The clinic may have intermittent internet. If staff viewed a student's document while online, we cache the file blob locally in the browser's **IndexedDB** so it's available next time — even offline.

### How it works

```
ONLINE — Staff views a document:
    1. Download file from R2 (via signed URL)
    2. Store the blob in IndexedDB:
       { storage_path, blob, etag, cached_at }
    3. Display the file

NEXT ACCESS — Same document:
    1. Check IndexedDB for cached blob
    2. If cached AND remote hasn't changed (same etag) → serve local copy
    3. If remote has changed → re-download, replace local copy
    4. If offline → serve local copy regardless

FILE DELETED when:
    - Remote version is updated (student re-uploads, staff re-processes)
    - Student account is reset (all data wiped)
    - Cache is cleared on logout (student record cache)
```

### What's stored locally

The IndexedDB file cache stores the **same encrypted/binary blob** that R2 holds. It does NOT store decrypted files. The file is only decrypted in-memory when the browser renders it (e.g., in an `<img>` tag or PDF viewer).

---

## The Complete Data Lifecycle

```
                    ┌──────────────────┐
                    │  STUDENT UPLOADS │
                    │  medical document│
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │  GEMINI AI       │
                    │  Extracts data   │
                    │  (in browser)    │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
    ┌─────────▼──────┐ ┌────▼─────┐ ┌──────▼──────┐
    │ Structured data│ │ Raw file │ │ Matric hash │
    │ name, DOB, etc │ │ PDF/JPG  │ │ SHA-256     │
    └─────────┬──────┘ └────┬─────┘ └──────┬──────┘
              │              │              │
    ┌─────────▼──────┐ ┌────▼─────┐ ┌──────▼──────┐
    │ Vault encrypts │ │ Upload   │ │ Stored as   │
    │ _enc columns   │ │ to R2    │ │ plain hash  │
    └─────────┬──────┘ └────┬─────┘ └──────┬──────┘
              │              │              │
    ┌─────────▼──────────────▼──────────────▼──────┐
    │              SUPABASE DATABASE                │
    │  matric_no_hash  │ full_name_enc │ genotype   │
    │  a3b8f2c1...     │ gAAAABl2...   │ AA         │
    │                  │ (ciphertext)  │ (plain)    │
    └──────────────────────────────────────────────┘
```

---

## What Happens During Account Reset

When staff resets a student's account:

```
1. DELETE allergies WHERE student_id = X
2. DELETE medical_history WHERE student_id = X
3. DELETE documents WHERE student_id = X
   → Also purge files from R2/Storage
   → Also purge from local IndexedDB file cache
4. DELETE visits WHERE student_id = X
5. UPDATE students SET:
   - full_name_enc = '' (empty)
   - date_of_birth_enc = NULL
   - phone_number_enc = NULL
   - email_enc = NULL
   - all other _enc = NULL
   - blood_group = 'unknown'
   - genotype = 'unknown'
   - profile_verified = false
   - profile_open = true
6. RESET password to "Calebuniv"
7. INSERT audit_log (action: 'ACCOUNT_RESET')
```

After reset:
- The student's auth account still exists (same matric number, same email)
- But ALL medical data is gone
- Password is back to default
- The student must onboard again from scratch

---

## Security Properties Summary

| Threat | Protection |
|--------|------------|
| Database dump stolen | `_enc` columns are AES-256 ciphertext — unreadable |
| Raw matric number exposure | Never stored in plain text; only SHA-256 hash |
| Unauthorized file access | R2 bucket is private; files served via expiring signed URLs |
| Shared clinic PC data leakage | IndexedDB cleared on logout; no stored plaintext |
| Stolen `.env` file | Only contains anon key (read-only); service role key never in frontend |
| Man-in-the-middle | HTTPS enforced (Supabase + Cloudflare); all data in transit is TLS encrypted |
| Staff sees wrong student | Hash-based lookup guarantees exact match — no partial search |
| Accidental mass reset | Reset requires typing exact matric number in confirmation modal |

---

## Files

| File | Role |
|------|------|
| `src/lib/crypto.js` | SHA-256 hash function for matric numbers |
| `src/lib/offlineCache.js` | IndexedDB cache for student records + file blobs |
| `frontend/schema.sql` | Database schema with `_enc` columns and Vault key setup |
| `frontend/schema-phase3.sql` | RLS policies for profile control |
