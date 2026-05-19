# OCTAL-EHR — Build Phases

> **Caleb University Health Center — Electronic Medical Records**
> Author: Giant / TAI Team
> Last Updated: May 19, 2026

---

## System Summary

OCTAL-EHR is the medical records system for **Caleb University Health Center**.

**Two surfaces:**

1. **Student App** — student logs in (matric no. or email + password), fills/edits their medical profile (once), uploads documents via AI scan, views their dashboard
2. **Medical Staff Dashboard** — staff logs in, registers students, searches any student, views full record, logs clinic visits, can reset student accounts

**One login. One role. No role hierarchy.**
Medical staff all have the same access. Controlled by invite-only Supabase Auth.

---

## Stack

| Layer | Tool |
|-------|------|
| Frontend | Vite + React |
| Backend | Supabase (PostgreSQL, Auth, Storage) |
| AI Extraction | Gemini 2.0 Flash (medical docs + matric scraping) |
| File Storage | Cloudflare R2 (free 10GB) |
| Hosting | Vercel |
| Encryption | Supabase column-level encryption (`_enc` columns) |
| Lookup | SHA-256 hash (matric number) — plaintext never queried |
| Offline Cache | IndexedDB (browser-local, 8-hour TTL, cleared on logout) |
| Password Reset | Supabase built-in email (free tier) |
| Retention | pg_cron (6-year auto-delete) |

---

## Authentication

### Student Login

- Student enters **matric number** (e.g. `24/15554`) **or email** + **password**
- If input contains `@`, it's treated as email → sign in directly
- If no `@`, it's a matric number → auto-derive email as `{slug}@calebuniversity.edu.ng` → sign in
- Default password for ALL students: **`Calebuniv`**
- After login:
  - Profile not completed → `/student/onboarding`
  - Profile completed (`profile_verified = true`, `profile_open = false`) → `/student/dashboard`

### Password Recovery

- "Forgot password?" link on both student and staff login pages
- Student enters matric number or email → Supabase sends reset link to the associated email
- Uses Supabase's built-in `resetPasswordForEmail()` — free tier includes email sending

### Staff Login

- Staff enters email + password (invite-only accounts)
- Same "Forgot password?" flow via Supabase email

---

## How Student Profiles Work

### Creation (Staff-initiated)

1. Staff navigates to `/staff/register`
2. Staff uploads a file (CSV, TXT, PDF, Excel, image) containing matric numbers **OR** types them manually with an optional email
3. Gemini AI reads the file and extracts all matric numbers automatically
4. Staff reviews the list, removes any mistakes, then clicks **Create Accounts**
5. The system creates a Supabase Auth account per student:
   - Email: provided by staff, or auto-derived `{slug}@calebuniversity.edu.ng`
   - Password: `Calebuniv` (universal default)
   - Student row is inserted with `profile_open = true`
6. Staff shares credentials with students securely

### Student Fills Profile

1. Student logs in with their matric number (or email) + `Calebuniv`
2. Student reaches the onboarding flow:
   - **Step 1** — Upload medical document (PDF, JPG, PNG)
   - **Step 2** — AI scans document, extracts name, DOB, email, blood group, genotype, allergies, medical history, emergency contact
   - **Step 3** — Student verifies extracted data
   - **Step 4** — Student gives NDPR consent → submits
3. On submit: `profile_open = false` (locked), `profile_verified = true`
4. Student is redirected to their **dashboard** (`/student/dashboard`)

### Student Dashboard

- Read-only view of: personal info, clinical summary, allergies, emergency contact, visit history, uploaded documents
- Students cannot edit their own profile (locked after submission)
- Note shown: "Need to update your info? Visit the Health Center and ask staff to open your profile."

### Editability — Open/Close System

- Each student profile has a `profile_open` flag (boolean)
- When a student is first created, `profile_open = true`
- Student logs in, fills their profile, submits → `profile_open = false` (auto-locked)
- **Once closed, student CANNOT edit their own profile**

**Medics can reopen a profile:**
- On the patient view, staff see an **"Open for Edit"** button
- Clicking it sets `profile_open = true` — student can now edit again
- Staff click **"Close Profile"** to lock it back down

### Account Reset (Staff Only — Per Matric Number)

Staff can reset any individual student's account from the patient view:

1. Staff opens the student's record → scrolls to **"⚠ Danger Zone"**
2. Clicks **"⚠ Reset Student Account"**
3. Confirmation modal requires typing the exact matric number to prevent accidental resets
4. On confirm:
   - All profile data wiped (name, DOB, phone, address, email, emergency contact, blood group, genotype, gender)
   - All allergies, medical history, documents, visits deleted
   - Uploaded files purged from storage
   - Password reset to `Calebuniv`
   - `profile_open = true`, `profile_verified = false` — student starts fresh
   - Auth account is preserved (same login, just need to re-onboard)
   - Action logged in audit trail (`ACCOUNT_RESET`)

> **This NEVER resets the whole system.** It always requires a specific matric number and only affects that one student.

### Encryption & Search

All PII columns are encrypted at rest:
- `full_name_enc`, `matric_no_enc`, `date_of_birth_enc`, `phone_number_enc`, `home_address_enc`, `email_enc`, `emergency_contact_enc`
- Allergy and diagnosis data stored in encrypted columns too

**Matric number search flow:**
```
Staff types matric number
    → SHA-256 hash computed in browser (crypto.subtle)
    → Hash is sent to Supabase .eq('matric_no_hash', hash)
    → Supabase returns the encrypted row
    → Encrypted values are decrypted at display time
    → Plaintext matric number is NEVER used in queries
```

**No decryption delay:** Decryption happens inline when columns are read. No separate decrypt step.

### Offline Search — IndexedDB Cache

```
Staff searches while ONLINE:
    → Supabase query → encrypted row returned
    → Result cached in IndexedDB (matric_hash → student data, 8-hour TTL)
    → Navigated to PatientView (live data)

Staff searches while OFFLINE:
    → IndexedDB queried by matric_hash
    → Cache hit + fresh → PatientView loaded from cached data
    → Cache miss / stale → "Record not cached, go online first" message
    → No stale data served after 8 hours

On logout:
    → IndexedDB cleared (prevent data leakage on shared clinic PCs)
```

---

## Design

```
Primary:     #1B4332   Deep Forest Green
Surface:     #F4F6F0   Off-white
Text:        #0D1B0F   Warm near-black
Accent:      #40916C   Active states
Alert:       #C62828   ALLERGIES, critical warnings, danger zone actions
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
| Phase 2 schema (visits, vitals) | `frontend/schema-phase2.sql` |
| Phase 3 schema (profile_open, RLS for reset) | `frontend/schema-phase3.sql` |
| Gemini extraction service | `src/lib/gemini-extractor.js` |
| SHA-256 matric hash utility | `src/lib/crypto.js` |
| IndexedDB offline cache | `src/lib/offlineCache.js` |
| Supabase client + auth helpers | `src/lib/supabase.js` |
| Student login (matric/email + password + forgot password) | `src/pages/student/Login.jsx` |
| Student onboarding (upload → AI verify → consent → submit) | `src/pages/student/Onboarding.jsx` |
| Student dashboard (read-only profile + visits) | `src/pages/student/Dashboard.jsx` |
| Staff login (email + password + forgot password) | `src/pages/staff/Login.jsx` |
| Staff student registration (file upload AI scrape OR manual + email) | `src/pages/staff/StudentOnboarding.jsx` |
| Staff search (matric hash lookup, online + offline cache) | `src/pages/staff/Search.jsx` |
| Patient view (profile + allergies + docs + account reset) | `src/pages/staff/PatientView.jsx` |
| Allergy banner (always top, never hidden) | `src/components/AllergyBanner.jsx` |
| Design system | `src/index.css` |
| App router | `src/App.jsx` |
| Encryption explainer | `docs/ENCRYPTION.md` |
| Staff user creation script | `scripts/create-staff-user.js` |

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
| Open/Close profile toggle | Medics can open a student profile for editing, then lock it | ✅ Built |
| Account reset per matric | Staff can wipe all data and reset password for one student | ✅ Built |
| Student dashboard | Student sees profile + visit history (read-only when closed) | ✅ Built |
| Password recovery | Supabase email reset on both login pages | ✅ Built |
| Local file cache | IndexedDB file mirror with sync-on-update (matches R2/Storage) | ✅ Built |
| Student profile edit page | Student can edit their profile ONLY when `profile_open = true` | ⬜ |
| PWA (offline-capable) | App installs on clinic PC, works without internet | ⬜ |
| PatientView offline fallback | PatientView reads from IndexedDB when `?offline=1` param present | ⬜ |

### Open/Close Flow

```
Staff registers student (CSV upload or manual)
    → profile_open = true (by default)
    → password = "Calebuniv"
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
| **3** | Profile Control & Offline | 🟡 Partial |
| **4** | Compliance & Retention | ⬜ |
| **5** | Analytics & Production | ⬜ |

---

# Open Questions

### Phase 3
- [ ] Should the student profile edit page show the AI-extracted data pre-filled?
- [ ] Does the clinic PC have reliable internet, or is PWA offline critical from day one?

### Phase 4
- [ ] Who marks students as graduated?
- [ ] Who receives deletion warning emails?

### Phase 5
- [ ] Is Caleb student DB accessible via API or CSV export?
