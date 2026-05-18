# OCTAL-EHR — Build Phases

> **Caleb University Health Center — Electronic Medical Records**
> Author: Giant / TAI Team
> Last Updated: May 18, 2026

---

## System Summary

OCTAL-EHR is the medical records system for **Caleb University Health Center**.

**Two surfaces:**

1. **Student App** — student logs in, fills/edits their medical profile (once), uploads documents via AI scan
2. **Medical Staff Dashboard** — staff logs in, searches any student, views full record, logs clinic visits

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
| Retention | pg_cron (6-year auto-delete) |

---

## How Student Profiles Work

### Creation

1. Admin (you) collects matric numbers from course reps
2. Admin runs a SQL script that creates student auth accounts + empty profile rows
3. Each student gets: email + password login
4. Student logs in and fills their medical profile

### Editability — Open/Close System

- Each student profile has a `profile_open` flag (boolean)
- When a student is first created, `profile_open = true`
- Student logs in, fills their profile (face photo, personal info, uploads medical doc)
- Student submits → `profile_open` is set to `false` automatically
- **Once closed, student CANNOT edit their own profile**

**Medics can reopen a profile:**
- On the patient view, staff see an **"Open for Edit"** button
- Clicking it sets `profile_open = true` — student can now edit again
- Staff click **"Close Profile"** to lock it back down

This gives medics full control over when a student can modify their record.

### Encryption

All PII columns are encrypted using Supabase Vault:
- `full_name_enc`, `matric_no_enc`, `date_of_birth_enc`, `phone_number_enc`, `home_address_enc`, `email_enc`, `photo_url_enc`, `emergency_contact_enc`
- The matric number is also stored as a SHA-256 hash (`matric_no_hash`) for search — the plaintext matric number is never used in queries

### Local Data

The app runs in the browser on any PC. When a student or medic is logged in:
- All data fetched from Supabase is displayed in-browser
- Files (medical docs, photos) are stored in Cloudflare R2 and downloaded on demand
- No data is stored on the local machine permanently — it's fetched fresh each session
- This means: the PC needs internet to use the app

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
| Student onboarding (face → upload → AI verify → consent → submit) | `src/pages/student/Onboarding.jsx` |
| Face capture (webcam, WebP, locked after submit) | `src/components/FaceCapture.jsx` |
| Staff login (invite-only) | `src/pages/staff/Login.jsx` |
| Staff search (matric hash lookup) | `src/pages/staff/Search.jsx` |
| Patient view (profile + allergies + docs) | `src/pages/staff/PatientView.jsx` |
| Allergy banner (always top, never hidden) | `src/components/AllergyBanner.jsx` |
| Design system | `src/index.css` |

**Status: ✅ Built, deployed to Vercel**

---

# PHASE 2 — Clinical Encounters ✅

> Staff can log every clinic visit with vitals, diagnosis, and prescriptions.

| Built | File |
|-------|------|
| Visit logging form (complaint → vitals → diagnosis → Rx → review) | `src/pages/staff/NewVisitForm.jsx` |
| Visit history (expandable, vitals chips, close visit) | `src/pages/staff/VisitHistory.jsx` |
| Phase 2 schema migration (visits, vitals, diagnoses, prescriptions) | `frontend/schema-phase2.sql` |

**Status: ✅ Built, deployed to Vercel**

---

# PHASE 3 — Profile Control & Offline

> Medics control profile editability. App works locally on clinic PC.

### What Gets Built

| Task | Description | Status |
|------|------------|--------|
| Open/Close profile toggle | Medics can open a student profile for editing, then lock it | ⬜ |
| Student profile edit page | Student can edit their profile ONLY when `profile_open = true` | ⬜ |
| Bulk student creation SQL | Script to create N student accounts from matric number list | ⬜ |
| Student read-only dashboard | Student sees their own profile (read-only when closed) | ⬜ |
| PWA (offline-capable) | App installs on clinic PC, works without internet | ⬜ |
| Local data caching | IndexedDB cache for offline reads, sync on reconnect | ⬜ |

### Open/Close Flow

```
Admin creates student account (SQL)
    → profile_open = true (by default)
    │
Student logs in, fills profile, submits
    → profile_open = false (auto-locked)
    │
Student wants to update something
    → asks health center staff
    │
Staff clicks "Open for Edit" on patient view
    → profile_open = true
    │
Student edits their profile
    → submits changes
    → profile_open = false (auto-locked again)
    │
Staff can also manually close:
    → clicks "Close Profile"
    → profile_open = false
```

---

# PHASE 4 — Compliance & Retention

> Automated 6-year data retention. Admin monitoring.

### What Gets Built

| Task | Description | Status |
|------|------------|--------|
| pg_cron retention job | Already in `schema.sql` — needs enabling | ✅ Defined |
| 30-day deletion warning email | Edge Function → email to admin before auto-delete | ⬜ |
| Admin panel | View pending deletions, system health | ⬜ |
| Convocation trigger | Mark student as `alumni` → starts 6-year clock | ⬜ |
| File purge | Edge Function deletes files when student is deleted | ⬜ |
| Student data export | Student can download their own records (NDPR right) | ⬜ |

### Retention Lifecycle

```
Year 0        Student enrols → status = 'active'
Year 4-5      Graduates → admin marks 'alumni'
              scheduled_delete_at = convocation_date + 6 years
Year 10-11    pg_cron fires nightly:
              30 days before → status = 'pending_deletion' + email
              On date → DELETE (CASCADE) + purge files
              Audit logs kept 2 more years
```

---

# PHASE 5 — Analytics & Production

> Visit analytics, production hardening.

### What Gets Built

| Task | Description | Status |
|------|------------|--------|
| Visit analytics | Common diagnoses, visit volume by month, allergy trends | ⬜ |
| Caleb registry integration | Validate matric numbers against school DB | ⬜ |
| Production hardening | Rate limiting, monitoring, backups, uptime alerts | ⬜ |

---

# Phase Summary

| # | Phase | Status |
|:-:|-------|--------|
| **1** | Foundation & Onboarding | ✅ Done |
| **2** | Clinical Encounters | ✅ Done |
| **3** | Profile Control & Offline | ⬜ Next |
| **4** | Compliance & Retention | ⬜ |
| **5** | Analytics & Production | ⬜ |

---

# Open Questions

### Phase 3
- [ ] Do you have the matric number list from course reps ready?
- [ ] What format? (CSV, text file, Excel?)
- [ ] Does the clinic PC have reliable internet, or is offline critical from day one?

### Phase 4
- [ ] Who marks students as graduated?
- [ ] Who receives deletion warning emails?

### Phase 5
- [ ] Is Caleb student DB accessible via API or CSV export?
