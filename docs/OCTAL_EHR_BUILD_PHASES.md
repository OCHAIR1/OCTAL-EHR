# CALUMED EHR — Complete Build Plan

> **Caleb University Medical Records System**
> Author: Giant / TAI Team
> Last Updated: May 18, 2026

---

## System At a Glance

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend (Student) | React / Mobile (Jojo) | Onboarding, document upload, profile view |
| Frontend (Medics) | React Web Dashboard | Patient lookup, visit logging, prescriptions |
| Backend | Supabase (PostgreSQL) | Auth, database, storage, edge functions |
| AI Engine | Gemini 2.0 Flash | Medical document extraction → structured JSON |
| Encryption | Supabase Vault (pgsodium) | Column-level PII encryption |
| Hashing | pgcrypto (SHA-256) | Matric number lookup without exposing plaintext |
| Scheduling | pg_cron | Automated 6-year retention + deletion |
| Compliance | NDPR | Consent flows, audit trail, data retention |

---

## Design System

```
Primary:      #1B4332  (Deep Forest Green — medical authority, calm)
Surface:      #F4F6F0  (Off-white, easy on the eyes)
Text:         #0D1B0F  (Warm near-black)
Accent:       #40916C  (Mid green for active states)
Alert:        #C62828  (Red — allergies, critical warnings ONLY)
Warning:      #E65100  (Orange — low confidence, review needed)

Fonts:        DM Serif Display (headers) · Outfit (body) · DM Mono (IDs, codes)
Corners:      4px standard · 8px cards
Approach:     Minimalistically Bold — no gradients, no decorative elements
```

---

## Role Hierarchy

| Role | Read Records | Write Clinical | Prescribe | View Audit Log | Manage Staff |
|------|:---:|:---:|:---:|:---:|:---:|
| **Super Admin** | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Doctor** | ✓ | ✓ | ✓ | ✗ | ✗ |
| **Nurse** | ✓ | ✓ (vitals, notes) | ✗ | ✗ | ✗ |
| **Pharmacist** | ✓ (prescriptions only) | ✗ | Dispense only | ✗ | ✗ |
| **Health Admin** | ✓ | ✗ | ✗ | ✓ | ✗ |

---

# PHASE 1 — Foundation & Student Onboarding

> **Goal**: Students can upload medical documents, AI extracts their data, and verified profiles are securely stored in Supabase.

### What Gets Built

| Component | File/Location | Status |
|-----------|--------------|--------|
| Supabase schema (all tables, RLS, indexes) | `frontend/schema.sql` | ✅ Built |
| Gemini Flash extraction service | `frontend/gemni-extractor.js` | ✅ Built |
| Student onboarding UI (4-step flow) | `frontend/student-onboarding.jsx` | ✅ Built |
| Supabase project setup | Supabase Dashboard | ⬜ Not started |
| Storage buckets (`medical-documents`, `profile-photos`) | Supabase Dashboard | ⬜ Not started |
| Vault encryption key creation | Supabase SQL Editor | ⬜ Not started |
| Connect extractor to live Gemini API | `gemni-extractor.js` | ⬜ Not started |
| Connect onboarding UI to Supabase inserts | `student-onboarding.jsx` | ⬜ Not started |
| Student auth (Supabase Auth — email/password) | New file | ⬜ Not started |

### Data Flow

```
Student opens app
    │
    ▼
┌─────────────────────┐
│ Step 1: Identity     │  Matric Number + Full Name
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Step 2: Upload       │  PDF / Image (max 10MB)
└──────────┬──────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│ Step 2b: AI Processing                  │
│                                         │
│  File → Base64 → Gemini 2.0 Flash      │
│  Gemini → Structured JSON              │
│  ┌─────────────────────────────────┐    │
│  │ personal: name, DOB, contact   │    │
│  │ clinical: blood, geno, allergy │    │
│  │ document_meta: type, facility  │    │
│  │ extraction_meta: confidence    │    │
│  └─────────────────────────────────┘    │
└──────────┬──────────────────────────────┘
           │
           ▼
┌─────────────────────┐
│ Step 3: Verify       │  Student reviews AI output
│                      │  Corrects errors manually
│                      │  Low-confidence fields flagged ⚠
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Step 4: Consent      │  NDPR consent checkbox
│ + Submit             │  "I authorize storage of my health data..."
└──────────┬──────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│ Secure Storage                          │
│                                         │
│  1. SHA-256(matric_no) → matric_no_hash │
│  2. Vault.encrypt(PII) → _enc columns  │
│  3. INSERT → students table             │
│  4. INSERT → allergies table            │
│  5. INSERT → medical_history table      │
│  6. Upload file → Storage bucket        │
│  7. INSERT → documents table            │
│  8. INSERT → audit_log                  │
└─────────────────────────────────────────┘
```

### Database Tables Used

- `students` — core encrypted profile
- `allergies` — linked allergy records
- `medical_history` — pre-existing conditions
- `documents` — uploaded file metadata + AI raw JSON
- `audit_log` — record creation logged

### Security in Phase 1

- **Encryption**: All PII columns use Supabase Vault (`calumed_pii_key`)
- **Hashing**: Matric number stored as SHA-256 hash for search
- **RLS**: Students can only read their own row
- **Consent**: NDPR consent timestamp recorded before any data is saved
- **File validation**: Only PDF/JPG/PNG/WEBP accepted, max 10MB

---

# PHASE 2 — Medics Dashboard & Clinical Core

> **Goal**: Health center staff can look up students, view their full medical profile, and log clinical encounters (visits, vitals, diagnosis, prescriptions).

### What Gets Built

| Component | Description | Status |
|-----------|------------|--------|
| Medics web dashboard | React web app — desktop-first | ⬜ Not started |
| Matric number search | Hash-based lookup via `lookup_student_by_matric()` | ⬜ Not started |
| Patient overview card | Allergies banner (top), blood group, genotype, history | ⬜ Not started |
| Visit/encounter form | Log complaint, vitals, diagnosis, treatment notes | ⬜ Not started |
| Vitals entry | BP, temperature, weight, height, pulse | ⬜ Not started |
| Prescription recording | Drug, dosage, duration, dispensed_by | ⬜ Not started |
| Document download | Medics can download original uploaded docs | ⬜ Not started |
| Staff auth | Supabase Auth — invite-only for medics | ⬜ Not started |
| Audit trail (auto) | Every record view/edit logged automatically | ⬜ Not started |

### New Tables Required

```sql
-- VITALS (linked to each visit)
CREATE TABLE vitals (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    visit_id        UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
    blood_pressure  TEXT,          -- e.g. "120/80"
    temperature     DECIMAL(4,1),  -- °C
    weight          DECIMAL(5,1),  -- kg
    height          DECIMAL(5,1),  -- cm
    pulse           INTEGER,       -- bpm
    respiratory_rate INTEGER,
    notes_enc       TEXT,          -- encrypted
    recorded_by     UUID REFERENCES staff(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- DIAGNOSES (linked to each visit)
CREATE TABLE diagnoses (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    visit_id        UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
    icd_code        TEXT,          -- ICD-10 code if applicable
    description_enc TEXT NOT NULL, -- encrypted diagnosis
    notes_enc       TEXT,          -- encrypted clinical notes
    diagnosed_by    UUID REFERENCES staff(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- PRESCRIPTIONS (linked to each visit)
CREATE TABLE prescriptions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    visit_id        UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
    drug_enc        TEXT NOT NULL, -- encrypted drug name
    dosage          TEXT,
    duration        TEXT,
    frequency       TEXT,
    prescribed_by   UUID REFERENCES staff(id),
    dispensed_by    UUID REFERENCES staff(id),
    dispensed_at    TIMESTAMPTZ,
    status          TEXT DEFAULT 'prescribed'
        CHECK (status IN ('prescribed', 'dispensed', 'cancelled')),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### Medics Dashboard Layout

```
┌──────────────────────────────────────────────────────────┐
│  CALUMED                              Dr. Emeka ▾  [🔔] │
│  ELECTRONIC HEALTH RECORDS                               │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────────────────────────────┐          │
│  │ 🔍  Enter Matric Number    [SEARCH]        │          │
│  └────────────────────────────────────────────┘          │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 🔴 ALLERGIES: Penicillin (SEVERE) · Ibuprofen     │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────┐  ┌──────────────────────────────────┐  │
│  │ PHOTO        │  │ ADAEZE CHIOMA OKAFOR             │  │
│  │              │  │ CSC/2021/001                     │  │
│  │              │  │ Blood: O+  ·  Genotype: AS      │  │
│  │              │  │ Level: 300L · Dept: Comp Science │  │
│  └──────────────┘  └──────────────────────────────────┘  │
│                                                          │
│  ── VISIT HISTORY ──────────────────────────────────── │  │
│  │ 2026-05-10 │ Headache, Malaria │ Dr. Eze │ Closed │  │
│  │ 2026-03-22 │ Sprained ankle    │ Nurse A │ Closed │  │
│  │ 2026-01-15 │ Routine checkup   │ Dr. Eze │ Closed │  │
│                                                          │
│  [ + New Visit ]    [ 📄 Documents ]    [ Referral ]     │
└──────────────────────────────────────────────────────────┘
```

### Allergy Display Rule (Non-Negotiable)

> **Allergies are ALWAYS visible at the top of every patient view.**
> A `life_threatening` or `severe` allergy shows a red banner.
> A `moderate` allergy shows an orange badge.
> This is a patient safety requirement — it cannot be hidden, collapsed, or scrolled past.

---

# PHASE 3 — Referrals, Advanced Roles & Offline Sync

> **Goal**: Referral tracking, proper role-based workflows (doctor vs nurse vs pharmacist), and offline-first capability for the clinic.

### What Gets Built

| Component | Description | Status |
|-----------|------------|--------|
| Referral tracking | Log external referrals (LUTH, specialists) + outcomes | ⬜ Not started |
| Role-based UI views | Doctor sees full dashboard; Nurse sees vitals form; Pharmacist sees prescriptions only | ⬜ Not started |
| Offline mode (medics) | Full read/write offline → sync on reconnect | ⬜ Not started |
| Emergency QR card | Printable QR per student → scans to pull record | ⬜ Not started |
| Dispensary module | Pharmacist marks prescriptions as dispensed | ⬜ Not started |

### New Table Required

```sql
-- REFERRALS (linked to visit or standalone)
CREATE TABLE referrals (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    visit_id        UUID REFERENCES visits(id) ON DELETE SET NULL,
    referred_to_enc TEXT NOT NULL,  -- encrypted: hospital/specialist name
    reason_enc      TEXT NOT NULL,  -- encrypted: reason for referral
    outcome_enc     TEXT,           -- encrypted: what happened
    status          TEXT DEFAULT 'pending'
        CHECK (status IN ('pending', 'completed', 'cancelled', 'no_show')),
    referred_by     UUID REFERENCES staff(id),
    referred_date   DATE DEFAULT CURRENT_DATE,
    outcome_date    DATE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### Offline Architecture

```
┌─────────────────────────┐
│   MEDICS DASHBOARD      │
│   (Browser/PWA)         │
│                         │
│  ┌───────────────────┐  │         ┌──────────────────┐
│  │ IndexedDB Cache   │◄─┼── sync ─┤  Supabase Cloud  │
│  │ (local copy)      │──┼── sync ─►  (source of truth)│
│  └───────────────────┘  │         └──────────────────┘
│                         │
│  • Read: local first    │
│  • Write: queue locally │
│  • Sync: on reconnect   │
│  • Conflict: server wins│
└─────────────────────────┘
```

---

# PHASE 4 — Compliance, Retention & Admin Dashboard

> **Goal**: NDPR compliance flows, automated data retention/deletion, admin analytics, and data export capabilities.

### What Gets Built

| Component | Description | Status |
|-----------|------------|--------|
| pg_cron retention engine | Nightly job: flag → warn → delete after 6 years | ✅ Defined in schema |
| Admin dashboard | View retention queue, access reports, system health | ⬜ Not started |
| 30-day deletion warning emails | Edge Function → email before auto-delete | ⬜ Not started |
| Legal hold override | Admin can freeze a record from deletion | ⬜ Not started |
| Student data export | Student can export their own records (NDPR right) | ⬜ Not started |
| Storage file cleanup | Edge Function deletes actual files when student deleted | ⬜ Not started |
| Audit log viewer | Admin can search/filter access logs | ⬜ Not started |
| Convocation handshake | Mark students as "alumni" (manual or registry API) | ⬜ Not started |

### Retention Lifecycle

```
YEAR 0          Student enrolls → status = 'active'
                Record created, NDPR consent stored
                    │
YEAR 4-5        Student convocates
                Admin sets → status = 'alumni'
                convocation_date recorded
                scheduled_delete_at = convocation_date + 6 years
                    │
YEAR 10-11      scheduled_delete_at approaching
                    │
                    ▼
            ┌───────────────────────────────────┐
            │ pg_cron nightly @ 2:00 AM WAT     │
            │                                   │
            │ 30 days before delete_at:         │
            │   → status = 'pending_deletion'   │
            │   → email alert to admin          │
            │                                   │
            │ On delete_at:                     │
            │   → DELETE FROM students (CASCADE)│
            │   → Edge Function purges files    │
            │                                   │
            │ Audit logs retained 2 extra years │
            └───────────────────────────────────┘
```

### Legal Hold Flow

```
Admin identifies record that must NOT be auto-deleted
    │
    ▼
Admin clicks "Legal Hold" on the patient card
    │
    ▼
System sets:
    status = 'active'  (overrides 'pending_deletion')
    legal_hold = TRUE
    legal_hold_reason = "..."
    legal_hold_by = admin UUID
    │
    ▼
pg_cron skips records where legal_hold = TRUE
    │
    ▼
Admin releases hold when resolved → normal retention resumes
```

---

# PHASE 5 — Intelligence, Biometrics & Integration

> **Goal**: Face scan verification (V2), school registry integration, analytics intelligence, and production hardening.

### What Gets Built

| Component | Description | Status |
|-----------|------------|--------|
| Face scan verification | Match student's face to stored photo at clinic check-in | ⬜ Not started (V2) |
| School registry integration | Cross-verify matric numbers against official student database | ⬜ Not started |
| Emergency access flow | Pull records by photo/QR when student is unconscious | ⬜ Not started |
| Analytics dashboard | Visit trends, common diagnoses, allergy prevalence | ⬜ Not started |
| Multi-campus support | Extend to satellite clinics if applicable | ⬜ Not started |
| Production hardening | Rate limiting, DDoS protection, monitoring, backups | ⬜ Not started |
| Mobile app (student) | Hand off to Jojo for native mobile implementation | ⬜ Not started |

### Face Scan Architecture (V2)

```
Student arrives at clinic
    │
    ▼
┌─────────────────────────────┐
│ Clinic tablet camera        │
│ captures face               │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ Face embedding generated    │
│ (on-device or Gemini API)   │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ Compare against stored      │
│ photo_url_enc → decrypt     │
│ → generate embedding        │
│ → cosine similarity match   │
└──────────┬──────────────────┘
           │
           ▼
    Match found? → Pull record
    No match?   → Fall back to matric number search
```

> **Note**: No schema changes needed for V2 face scan. The `photo_url_enc` column captured during Phase 1 onboarding already stores the reference image.

---

# Phase Summary

| Phase | Name | Depends On | Core Deliverable |
|:-----:|------|:----------:|------------------|
| **1** | Foundation & Onboarding | — | Students can register via AI-powered doc scan |
| **2** | Medics Dashboard & Clinical Core | Phase 1 | Staff can look up patients and log visits |
| **3** | Referrals, Roles & Offline | Phase 2 | Role-specific views, referral tracking, offline |
| **4** | Compliance & Admin | Phase 1-3 | Retention engine, audit viewer, legal holds |
| **5** | Intelligence & Biometrics | Phase 1-4 | Face scan, analytics, registry integration |

---

# Open Questions (To Be Answered Before Each Phase)

### Before Phase 1
- [ ] Has the Supabase project been created? (Free or Pro plan?)
- [ ] Do we have a Gemini API key provisioned?
- [ ] Is Jojo building the mobile app separately, or is this Phase 1 UI also the student app?

### Before Phase 2
- [ ] Does the health center have a dispensary/pharmacy?
- [ ] How many staff accounts need to be seeded initially?
- [ ] Do nurses have a separate login or shared station?

### Before Phase 3
- [ ] What hospitals does the school commonly refer to?
- [ ] Does the clinic have reliable internet, or is offline mode critical from day one?
- [ ] Should QR cards be physical (printed) or digital (in-app)?

### Before Phase 4
- [ ] Who has authority to trigger convocation status changes?
- [ ] Does the school registry have an API, or is it a manual CSV upload?
- [ ] Who receives the 30-day deletion warning emails?

### Before Phase 5
- [ ] Budget for face recognition API (if using cloud) vs on-device?
- [ ] Is multi-campus actually needed or future scope?
- [ ] Who maintains the system after handover?

---

> **Next Step**: Confirm Phase 1 plan details, and we begin building.
