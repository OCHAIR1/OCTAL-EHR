# OCTAL-EHR — Complete Build Plan

> **Caleb University Health Center — Electronic Medical Records**
> Author: Giant / TAI Team
> Last Updated: May 18, 2026

---

## What This System Is

OCTAL-EHR is the digital medical records system for **Caleb University Health Center**.

It has **two surfaces**:

1. **Student Onboarding App** — student uploads their medical document from their doctor, AI scans it and builds their profile. Done once.
2. **Medical Staff Dashboard** — the health center staff look up any student by matric number, view their full record, and log every clinic visit.

**One login. One role. Medical staff only.**
There is no multi-role hierarchy in this system. Every person who logs into the staff dashboard has full clinical access. Access is controlled at the Supabase Auth level — invite-only, managed by whoever runs this system.

---

## System Stack

| Layer | Tool | Purpose |
|-------|------|---------|
| Student UI | React (mobile-first) | Onboarding flow — built in `student-onboarding.jsx` |
| Staff Dashboard | React Web (desktop-first) | Patient lookup + clinical records |
| Backend | Supabase (PostgreSQL) | Database, Auth, Storage, Edge Functions |
| AI Extraction | Gemini 2.0 Flash | Reads uploaded medical docs → structured JSON |
| Encryption | Supabase Vault (`pgsodium`) | Column-level PII encryption — built in `schema.sql` |
| Lookup Hashing | `pgcrypto` SHA-256 | Search by matric number without storing it plain |
| Retention Engine | `pg_cron` | Auto-delete records 6 years post-convocation |
| Compliance | NDPR | Consent captured, audit trail, data lifecycle |

---

## Design System

```
Primary:     #1B4332   Deep Forest Green — authority, calm, medical
Surface:     #F4F6F0   Off-white — easy on the eyes
Text:        #0D1B0F   Warm near-black
Accent:      #40916C   Active states, confirmations
Alert:       #C62828   Red — ALLERGIES and critical warnings ONLY
Warning:     #E65100   Orange — low confidence, review required

Fonts:  DM Serif Display (headers)  ·  Outfit (body)  ·  DM Mono (IDs, codes)
Style:  Minimalistically Bold — no gradients, no decoration, tables over cards
```

---

## Current File Inventory

| File | What It Does | State |
|------|-------------|-------|
| `frontend/schema.sql` | Full Supabase database schema — all tables, RLS, indexes, cron job, encryption key setup | ✅ Built |
| `frontend/gemni-extractor.js` | Gemini 2.0 Flash extraction service — takes uploaded file, returns structured medical JSON | ✅ Built |
| `frontend/student-onboarding.jsx` | 4-step student onboarding UI — identity → upload → AI verify → consent → submit | ✅ Built |

These three files are the foundation. Every phase builds on top of them.

---

# PHASE 1 — Connect & Launch Student Onboarding

> **Goal**: Make the existing student onboarding fully functional. Wire the built UI to a live Supabase project and Gemini API. Students at Caleb University can register their medical profiles.

### What Gets Built

| Task | File | Status |
|------|------|--------|
| Create Supabase project (Pro plan recommended) | Supabase Dashboard | ⬜ |
| Run `schema.sql` in Supabase SQL Editor | `frontend/schema.sql` | ⬜ |
| Create Vault encryption key (`octal_ehr_pii_key`) | Supabase SQL Editor | ⬜ |
| Create storage buckets: `medical-documents`, `profile-photos` | Supabase Dashboard | ⬜ |
| Wire `gemni-extractor.js` to live Gemini API key | `frontend/gemni-extractor.js` | ⬜ |
| Replace mock data in onboarding with real Gemini call | `frontend/student-onboarding.jsx` | ⬜ |
| Connect verified form submission to Supabase inserts | `frontend/student-onboarding.jsx` | ⬜ |
| Student auth (Supabase Auth email/password) | New: `auth.js` | ⬜ |
| Deploy student app (Vercel / Netlify) | CI/CD | ⬜ |

### Student Onboarding Data Flow

```
Student opens app (Caleb University student)
    │
    ▼
┌────────────────────────────────────┐
│ Step 1 — Identity                  │
│ Enter Matric Number + Full Name    │
│ (validated format: XXX/YYYY/NNN)   │
└──────────────┬─────────────────────┘
               │
               ▼
┌────────────────────────────────────┐
│ Step 2 — Upload Medical Document   │
│ PDF, JPG, PNG — max 10MB           │
│ (doctor's letter, lab result, etc) │
└──────────────┬─────────────────────┘
               │
               ▼
┌────────────────────────────────────────────────┐
│ Gemini 2.0 Flash — AI Extraction               │
│ (gemni-extractor.js)                           │
│                                                │
│  File → Base64 → Gemini API                    │
│  Returns JSON:                                 │
│   personal { name, DOB, phone, address }       │
│   clinical { blood_group, genotype, allergies, │
│              medical_history, vaccinations }    │
│   extraction_meta { confidence, low_fields }   │
└──────────────┬─────────────────────────────────┘
               │
               ▼
┌────────────────────────────────────┐
│ Step 3 — Verify                    │
│ Student reviews every field        │
│ ⚠ Low-confidence fields flagged   │
│ Student corrects if needed         │
└──────────────┬─────────────────────┘
               │
               ▼
┌────────────────────────────────────┐
│ Step 4 — NDPR Consent + Submit     │
│ Checkbox required before saving    │
└──────────────┬─────────────────────┘
               │
               ▼
┌────────────────────────────────────────────────┐
│ Secure Save to Supabase                        │
│                                                │
│  1. SHA-256(matric_no)  → matric_no_hash       │
│  2. Vault.encrypt(PII)  → _enc columns         │
│  3. INSERT → students                          │
│  4. INSERT → allergies (each one)              │
│  5. INSERT → medical_history                   │
│  6. Upload file → medical-documents bucket     │
│  7. INSERT → documents (with ai_raw_json)      │
│  8. INSERT → audit_log (action: ONBOARD)       │
└────────────────────────────────────────────────┘
```

### Key Security Rules (from `schema.sql`)

- Matric number **never stored plaintext** — SHA-256 hash only
- PII columns (`full_name_enc`, `matric_no_enc`, `date_of_birth_enc`, etc.) encrypted by Supabase Vault
- Students can **only read their own row** (RLS policy)
- NDPR consent timestamp required before any INSERT
- Uploaded files stored in private bucket — not publicly accessible

---

# PHASE 2 — Medical Staff Dashboard

> **Goal**: Caleb University health center staff can log in, look up any student by matric number, see their full medical profile, and record every clinic visit.

### What Gets Built

| Task | Description | Status |
|------|------------|--------|
| Staff login page | Supabase Auth — invite-only, single shared role | ⬜ |
| Matric number search | Hashed lookup → decrypt → display patient card | ⬜ |
| Patient overview card | Photo, name, blood group, genotype, allergies banner | ⬜ |
| Allergy banner (always top) | Red/orange badges — cannot be hidden | ⬜ |
| Visit history table | All past visits — date, complaint, staff, status | ⬜ |
| New visit form | Complaint, vitals, diagnosis, notes | ⬜ |
| Document viewer + download | View and download original uploaded medical docs | ⬜ |
| Auto audit logging | Every record view/edit → written to `audit_log` | ⬜ |

### Additional Tables Needed

```sql
-- VITALS (per visit)
CREATE TABLE vitals (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    visit_id         UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
    blood_pressure   TEXT,           -- "120/80"
    temperature      DECIMAL(4,1),   -- °C
    weight           DECIMAL(5,1),   -- kg
    height           DECIMAL(5,1),   -- cm
    pulse            INTEGER,        -- bpm
    respiratory_rate INTEGER,
    recorded_by      UUID REFERENCES staff(id),
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- DIAGNOSES (per visit)
CREATE TABLE diagnoses (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    visit_id        UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
    icd_code        TEXT,            -- optional ICD-10
    description_enc TEXT NOT NULL,   -- encrypted
    notes_enc       TEXT,            -- encrypted
    diagnosed_by    UUID REFERENCES staff(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- PRESCRIPTIONS (per visit)
CREATE TABLE prescriptions (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    visit_id      UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
    drug_enc      TEXT NOT NULL,     -- encrypted drug name
    dosage        TEXT,
    frequency     TEXT,
    duration      TEXT,
    prescribed_by UUID REFERENCES staff(id),
    created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### Staff Dashboard Layout

```
┌──────────────────────────────────────────────────────────┐
│  OCTAL-EHR                    Caleb University  [Logout] │
│  ELECTRONIC HEALTH RECORDS                               │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │  🔍  Enter Matric Number             [ SEARCH ]  │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │  🔴  ALLERGIES: Penicillin (SEVERE) · Ibuprofen  │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  ┌────────────┐  ┌──────────────────────────────────┐    │
│  │  [PHOTO]   │  │  ADAEZE CHIOMA OKAFOR            │    │
│  │            │  │  CSC/2021/001                    │    │
│  │            │  │  Blood Group: O+  · Genotype: AS │    │
│  └────────────┘  │  Level: 300L · Dept: Comp Sci    │    │
│                  └──────────────────────────────────┘    │
│                                                          │
│  ── VISIT HISTORY ────────────────────────────────────   │
│  2026-05-10 │ Headache, suspected malaria  │ Closed      │
│  2026-03-22 │ Sprained ankle              │ Closed      │
│  2026-01-15 │ Routine checkup             │ Closed      │
│                                                          │
│  [ + Log New Visit ]          [ 📄 View Documents ]      │
└──────────────────────────────────────────────────────────┘
```

### Allergy Rule — Non-Negotiable

> Allergies are **always** at the very top of every patient card.
> `life_threatening` / `severe` → solid red banner.
> `moderate` → orange badge.
> This cannot be collapsed, hidden, or scrolled past. It is a patient safety feature.

---

# PHASE 3 — Referrals, Offline & Clinic Polish

> **Goal**: Track external referrals, allow the clinic to function without internet, and add an emergency QR card per student.

### What Gets Built

| Task | Description | Status |
|------|------------|--------|
| Referral logging | Record when a student is sent to LUTH or a specialist | ⬜ |
| Referral outcome tracking | Update when outcome is known | ⬜ |
| Offline mode (PWA) | Full read/write offline, sync on reconnect | ⬜ |
| Emergency QR card | Printable QR per student — scans to pull record | ⬜ |

### Referrals Table

```sql
CREATE TABLE referrals (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    visit_id        UUID REFERENCES visits(id) ON DELETE SET NULL,
    referred_to_enc TEXT NOT NULL,   -- encrypted hospital/specialist
    reason_enc      TEXT NOT NULL,   -- encrypted reason
    outcome_enc     TEXT,            -- encrypted outcome
    status          TEXT DEFAULT 'pending'
        CHECK (status IN ('pending', 'completed', 'cancelled', 'no_show')),
    referred_by     UUID REFERENCES staff(id),
    referred_date   DATE DEFAULT CURRENT_DATE,
    outcome_date    DATE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### Offline Flow

```
Clinic has no internet
        │
        ▼
Dashboard reads from local IndexedDB cache
Staff logs visit → saved locally, marked "pending sync"
        │
Internet restored
        │
        ▼
Background sync sends queued writes to Supabase
Conflicts: server version wins
```

---

# PHASE 4 — Compliance, Retention & Administration

> **Goal**: Automated 6-year data retention, admin controls, NDPR compliance enforcement, deletion warning emails, legal hold override.

### What Gets Built

| Task | Description | Status |
|------|------------|--------|
| `pg_cron` nightly retention job | Already in `schema.sql` — just needs enabling | ✅ Defined |
| 30-day deletion warning email | Supabase Edge Function → sends email to system admin | ⬜ |
| Admin panel | View pending deletions, access logs, system health | ⬜ |
| Legal hold flag | Prevent a specific record from being auto-deleted | ⬜ |
| Convocation trigger | Mark student as `alumni` → starts 6-year clock | ⬜ |
| File purge Edge Function | Deletes actual files from Storage when student is deleted | ⬜ |
| Student data export | Student can download their own records (NDPR right) | ⬜ |

### Retention Lifecycle

```
Year 0        Student enrols at Caleb University
              Medical profile created → status = 'active'
              NDPR consent timestamp recorded

Year 4–5      Student graduates / convocates
              Admin marks → status = 'alumni'
              convocation_date set → scheduled_delete_at = convocation_date + 6 years

Year 10–11    pg_cron job fires nightly @ 2:00 AM WAT

              30 days before scheduled_delete_at:
                → status = 'pending_deletion'
                → Email alert sent to system admin

              On scheduled_delete_at:
                → DELETE FROM students  (CASCADE wipes all linked records)
                → Edge Function purges files from Storage bucket
                → Audit logs retained for 2 more years then purged
```

---

# PHASE 5 — Intelligence & Future Features

> **Goal**: Face scan check-in (V2), Caleb University registry integration, visit analytics, production hardening.

### What Gets Built

| Task | Description | Status |
|------|------------|--------|
| Face scan check-in | Match face at clinic → pull record automatically | ⬜ V2 |
| Caleb registry integration | Validate matric numbers against school student DB | ⬜ |
| Visit analytics | Common diagnoses, allergy trends, visit volume by month | ⬜ |
| Production hardening | Rate limiting, backups, monitoring, uptime alerts | ⬜ |

> **Face scan note**: No schema changes needed. `photo_url_enc` is already captured during Phase 1 onboarding. V2 adds a matching layer on top.

---

# Phase Summary

| # | Phase | Core Deliverable |
|:-:|-------|-----------------|
| **1** | Connect & Launch | Students register at Caleb University via AI doc scan |
| **2** | Staff Dashboard | Health center staff look up patients and log visits |
| **3** | Referrals & Offline | External referrals tracked, clinic works offline |
| **4** | Compliance & Admin | 6-year retention automated, admin controls live |
| **5** | Intelligence | Face scan, registry integration, analytics |

---

# Open Questions — Answer Before Building Each Phase

### Phase 1
- [ ] Supabase project created? (Pro plan — $25/month for 10k+ students)
- [ ] Gemini API key ready?
- [ ] Who deploys the student app — same person or Jojo?

### Phase 2
- [ ] How many staff need initial login accounts?
- [ ] Do staff use a shared station or individual logins?

### Phase 3
- [ ] Does the clinic have reliable internet day-to-day?
- [ ] Should the QR card be printed per student or just digital?

### Phase 4
- [ ] Who is responsible for marking students as graduated ("alumni")?
- [ ] Who gets the 30-day deletion warning email?

### Phase 5
- [ ] Is Caleb University student database accessible via API or export?
- [ ] Who maintains the system long-term after handover?

---

> **We build in order. Phase 1 first. Every line of code from here maps to the 3 files already in the repo.**
