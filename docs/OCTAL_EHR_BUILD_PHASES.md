# OCTAL-EHR — Build Phases

> **Caleb University Health Center — Electronic Medical Records**
> Author: Giant / TAI Team
> Last Updated: May 18, 2026

---

## System Summary

OCTAL-EHR is the medical records system for **Caleb University Health Center**.

**Two surfaces:**

1. **Student App** — student logs in, fills their medical profile (once), uploads documents via AI scan
2. **Medical Staff Dashboard** — staff searches any student, views full record, logs clinic visits

**One login. One role. No role hierarchy.**
Medical staff all have the same access. Controlled by invite-only Supabase Auth.

---

## Stack

| Layer | Tool |
|-------|------|
| Frontend | Vite + React |
| Backend | Supabase (PostgreSQL, Auth, Storage) |
| AI Extraction | Gemini 2.0 Flash |
| File Storage | Cloudflare R2 (free 10GB) |
| Hosting | Vercel |
| Encryption | Supabase Vault (column-level PII) |
| Lookup | SHA-256 hash (matric number) |
| Offline Cache | IndexedDB (local on clinic PC) |
| Retention | pg_cron (6-year auto-delete) |

---

## How Student Profiles Work

### Creation

1. Admin collects matric numbers + emails from course reps
2. Admin runs SQL script → creates student auth accounts + empty profile rows
3. Each student gets: email + password login
4. Student logs in → fills their medical profile → uploads doc → AI scans → submits

### Editability — Open/Close System

- Each profile has `profile_open` flag (boolean)
- On creation → `profile_open = true`
- Student fills profile and submits → `profile_open = false` (auto-locked)
- **Student cannot edit once closed**
- Medics see **"Open for Edit"** / **"Close Profile"** buttons on patient view
- This gives medics full control over when a student can modify their record

### Encryption & Decryption

All PII columns encrypted using Supabase Vault (`pgsodium`):
- `full_name_enc`, `matric_no_enc`, `date_of_birth_enc`, `phone_number_enc`, `home_address_enc`, `email_enc`, `emergency_contact_enc`

**How search works (zero delay):**
- Matric number → SHA-256 hash → `WHERE matric_no_hash = hash`
- Hash lookup is instant (indexed)
- Encrypted columns are decrypted by Postgres at query time — transparent to the app
- No client-side decryption needed — Supabase handles it server-side
- Result arrives as plain text in the API response (RLS protects access)

### Offline / Local Storage

**Goal:** Clinic PC can search and view patient records even when internet drops.

**How it works:**
1. Every time a patient record is fetched from Supabase, it's cached in **IndexedDB**
2. On search:
   - App checks if online → queries Supabase (fresh data)
   - If offline → queries IndexedDB (cached data)
3. Cached data includes: student profile, allergies, medical history, visit history
4. Files (medical docs, photos) are NOT cached locally — too large
5. When internet reconnects, any new visits logged offline sync to Supabase

**No face photo required.** Profile photo may be added later via admin bulk upload, not during onboarding.

---

## Design

```
Primary:     #1B4332   Deep Forest Green
Surface:     #F4F6F0   Off-white
Text:        #0D1B0F   Warm near-black
Accent:      #40916C   Active states
Alert:       #C62828   ALLERGIES and critical warnings ONLY
Warning:     #E65100   Low confidence, review required

Fonts:  DM Serif Display (headers) · Outfit (body) · DM Mono (IDs)
Style:  Minimalistically Bold — no gradients, no decoration
```

---

# PHASE 1 — Foundation & Student Onboarding ✅

> Students register their medical profiles via AI-powered document scan.

| Built | File |
|-------|------|
| Supabase schema (tables, RLS, indexes, cron) | `frontend/schema.sql` |
| Gemini extraction service | `src/lib/gemini-extractor.js` |
| Student login (email + password) | `src/pages/student/Login.jsx` |
| Student onboarding (upload → AI verify → consent → submit) | `src/pages/student/Onboarding.jsx` |
| Staff login (invite-only) | `src/pages/staff/Login.jsx` |
| Staff search (matric hash lookup) | `src/pages/staff/Search.jsx` |
| Patient view (profile + allergies + docs) | `src/pages/staff/PatientView.jsx` |
| Allergy banner (always top, never hidden) | `src/components/AllergyBanner.jsx` |
| Design system | `src/index.css` |

**Status: ✅ Built, deployed**

---

# PHASE 2 — Clinical Encounters ✅

> Staff can log every clinic visit with vitals, diagnosis, and prescriptions.

| Built | File |
|-------|------|
| Visit logging form (complaint → vitals → diagnosis → Rx → review) | `src/pages/staff/NewVisitForm.jsx` |
| Visit history (expandable, vitals chips, close visit) | `src/pages/staff/VisitHistory.jsx` |
| Phase 2 schema migration | `frontend/schema-phase2.sql` |

**Status: ✅ Built, deployed**

---

# PHASE 3 — Profile Control & Offline ← CURRENT

> Medics control profile editability. Offline search via IndexedDB.

### What Gets Built

| Task | Description | Status |
|------|------------|--------|
| Remove face capture from onboarding | No face during registration | ✅ |
| Open/Close profile toggle on staff side | Medics can open/lock student profile | ✅ |
| Profile auto-lock on submit | `profile_open = false` after student submits | ✅ |
| Phase 3 schema migration | `profile_open` column, RLS, triggers | ✅ |
| IndexedDB cache layer | Cache patient records locally | ⬜ Building |
| Offline-first search | Check online → Supabase. Offline → IndexedDB | ⬜ Building |
| Offline visit logging | Log visits locally, sync when online | ⬜ |
| Bulk student creation script | SQL to create N student accounts from list | ⬜ |
| Student read-only dashboard | Student sees own profile (read-only when closed) | ⬜ |

### Offline Architecture

```
Search by Matric Number
    │
    ├── Online?
    │     ├── YES → Query Supabase (fresh)
    │     │         └── Cache result in IndexedDB
    │     │
    │     └── NO  → Query IndexedDB (cached)
    │               └── Show "Offline" badge on UI
    │
    └── Display patient record
```

```
Log New Visit (Offline)
    │
    ├── Online?
    │     └── YES → INSERT directly to Supabase
    │
    └── NO  → Save to IndexedDB "pending_visits"
              └── When online again → sync all pending to Supabase
              └── Show "Pending sync" badge on visit
```

---

# PHASE 4 — Compliance & Retention

> Automated 6-year data retention. Admin monitoring.

| Task | Description | Status |
|------|------------|--------|
| pg_cron retention job | Already in `schema.sql` — needs enabling | ✅ Defined |
| Deletion warning | 30-day notice before auto-delete | ⬜ |
| Admin panel | View pending deletions, system health | ⬜ |
| Convocation trigger | Mark student as `alumni` → starts 6-year clock | ⬜ |
| Student data export | Student can download their own records (NDPR right) | ⬜ |

---

# PHASE 5 — Analytics & Production

| Task | Description | Status |
|------|------------|--------|
| Visit analytics | Common diagnoses, visit volume, allergy trends | ⬜ |
| Production hardening | Rate limiting, monitoring, backups, uptime alerts | ⬜ |

---

# Phase Summary

| # | Phase | Status |
|:-:|-------|--------|
| **1** | Foundation & Onboarding | ✅ Done |
| **2** | Clinical Encounters | ✅ Done |
| **3** | Profile Control & Offline | 🔨 In Progress |
| **4** | Compliance & Retention | ⬜ |
| **5** | Analytics & Production | ⬜ |
