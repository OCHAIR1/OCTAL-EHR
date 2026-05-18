-- ============================================================
-- OCTAL-EHR - SUPABASE SCHEMA - PHASE 1
-- OCTAL-EHR Medical Records System
-- Author: Giant / TAI Team
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgsodium";       -- Supabase Vault (column encryption)
CREATE EXTENSION IF NOT EXISTS "pg_cron";         -- Automated retention jobs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";        -- SHA-256 hashing for matric lookup

-- ============================================================
-- VAULT: Encryption Keys
-- Run this once manually in Supabase SQL editor
-- ============================================================

-- Creates a named encryption key in Supabase Vault
-- This key never touches your application code
SELECT vault.create_secret('octal_ehr_pii_key', gen_random_uuid()::text);


-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE student_status AS ENUM (
  'active',
  'alumni',
  'pending_deletion',
  'suspended',
  'deleted'
);

CREATE TYPE staff_role AS ENUM (
  'doctor',
  'nurse',
  'pharmacist',
  'health_admin',
  'super_admin'
);

CREATE TYPE document_type AS ENUM (
  'medical_history_form',
  'lab_result',
  'doctor_letter',
  'vaccination_record',
  'other'
);

CREATE TYPE allergy_severity AS ENUM (
  'mild',
  'moderate',
  'severe',
  'life_threatening'
);

CREATE TYPE blood_group AS ENUM (
  'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'
);

CREATE TYPE genotype AS ENUM (
  'AA', 'AS', 'AC', 'SS', 'SC', 'CC', 'unknown'
);


-- ============================================================
-- STAFF TABLE (Medics, Admins — not encrypted, managed by school)
-- ============================================================

CREATE TABLE staff (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_user_id      UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name         TEXT NOT NULL,
  email             TEXT UNIQUE NOT NULL,
  role              staff_role NOT NULL DEFAULT 'nurse',
  department        TEXT,
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE staff IS 'Health center staff — doctors, nurses, pharmacists, admins';


-- ============================================================
-- STUDENTS TABLE (All PII columns encrypted via Vault)
-- ============================================================

CREATE TABLE students (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_user_id          UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Lookup key (hashed matric for fast search, never stored plain)
  matric_no_hash        TEXT UNIQUE NOT NULL,   -- SHA-256(matric_no) for WHERE queries

  -- Encrypted PII (Vault encrypted)
  matric_no_enc         TEXT NOT NULL,          -- encrypted matric number
  full_name_enc         TEXT NOT NULL,          -- encrypted full name
  date_of_birth_enc     TEXT,                   -- encrypted DOB
  phone_number_enc      TEXT,                   -- encrypted phone
  home_address_enc      TEXT,                   -- encrypted address
  email_enc             TEXT,                   -- encrypted email
  photo_url_enc         TEXT,                   -- encrypted storage path to photo
  emergency_contact_enc TEXT,                   -- encrypted emergency contact

  -- Non-sensitive clinical identifiers (stored plain for queries)
  blood_group           blood_group DEFAULT 'unknown',
  genotype              genotype DEFAULT 'unknown',
  gender                TEXT CHECK (gender IN ('male', 'female', 'other')),

  -- Academic metadata
  department            TEXT,
  faculty               TEXT,
  level                 TEXT,                   -- e.g. '300L'
  entry_year            INTEGER,

  -- Status & retention
  status                student_status DEFAULT 'active',
  convocation_date      DATE,
  scheduled_delete_at   DATE GENERATED ALWAYS AS (
    convocation_date + INTERVAL '6 years'
  ) STORED,

  -- Consent
  ndpr_consent          BOOLEAN DEFAULT FALSE,
  ndpr_consent_at       TIMESTAMPTZ,

  -- AI extraction metadata
  ai_extraction_model   TEXT DEFAULT 'gemini-2.0-flash',
  ai_extraction_raw     JSONB,                  -- raw Gemini output for audit
  profile_verified      BOOLEAN DEFAULT FALSE,  -- student confirmed extracted data

  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE students IS 'Core student medical profile. PII encrypted via Supabase Vault.';
COMMENT ON COLUMN students.matric_no_hash IS 'SHA-256 of matric_no — used for lookup queries';
COMMENT ON COLUMN students.ai_extraction_raw IS 'Raw Gemini JSON output stored for audit trail';


-- ============================================================
-- ALLERGIES TABLE
-- ============================================================

CREATE TABLE allergies (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  allergen_enc    TEXT NOT NULL,                -- encrypted allergen name
  severity        allergy_severity NOT NULL DEFAULT 'moderate',
  reaction_enc    TEXT,                         -- encrypted reaction description
  notes_enc       TEXT,                         -- encrypted additional notes
  confirmed_by    UUID REFERENCES staff(id),    -- medic who confirmed this allergy
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE allergies IS 'Student allergy records — always displayed at top of patient card';


-- ============================================================
-- MEDICAL HISTORY TABLE
-- ============================================================

CREATE TABLE medical_history (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id        UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  condition_enc     TEXT NOT NULL,              -- encrypted condition name
  diagnosed_date    DATE,
  status            TEXT DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'managed')),
  notes_enc         TEXT,                       -- encrypted clinical notes
  reported_by       UUID REFERENCES staff(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- DOCUMENTS TABLE (uploaded files — stored in Supabase Storage)
-- ============================================================

CREATE TABLE documents (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id          UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  document_type       document_type NOT NULL DEFAULT 'other',
  storage_path_enc    TEXT NOT NULL,            -- encrypted path to file in bucket
  original_filename   TEXT,
  file_size_bytes     INTEGER,
  mime_type           TEXT,

  -- AI extraction
  ai_raw_json         JSONB,                   -- full Gemini response
  ai_confidence       DECIMAL(4,3),            -- 0.000 to 1.000
  extraction_status   TEXT DEFAULT 'pending'
    CHECK (extraction_status IN ('pending', 'extracted', 'failed', 'verified')),

  -- Medic access
  uploaded_at         TIMESTAMPTZ DEFAULT NOW(),
  verified_by         UUID REFERENCES staff(id),
  verified_at         TIMESTAMPTZ,

  created_at          TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE documents IS 'Student uploaded medical documents. Files stored in Supabase Storage bucket, path encrypted.';


-- ============================================================
-- VISITS TABLE (each clinic visit — Phase 1 basic, expanded in Phase 2)
-- ============================================================

CREATE TABLE visits (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id                UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  visit_date                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  presenting_complaint_enc  TEXT,              -- encrypted chief complaint
  attending_staff_id        UUID REFERENCES staff(id),
  notes_enc                 TEXT,              -- encrypted visit notes
  status                    TEXT DEFAULT 'open'
    CHECK (status IN ('open', 'closed', 'referred')),
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- AUDIT LOG (never deleted until 2 years post student deletion)
-- ============================================================

CREATE TABLE audit_log (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id      UUID,                           -- staff or student user
  actor_role    TEXT,
  action        TEXT NOT NULL,                  -- e.g. 'VIEW_RECORD', 'DOWNLOAD_DOC'
  resource_type TEXT,                           -- e.g. 'students', 'documents'
  resource_id   UUID,
  metadata      JSONB,                          -- extra context (IP, device, etc.)
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE audit_log IS 'Immutable access log. Retained 2 years beyond student record deletion.';

-- Audit log is append-only — no UPDATE or DELETE for any role
CREATE RULE no_update_audit AS ON UPDATE TO audit_log DO INSTEAD NOTHING;
CREATE RULE no_delete_audit AS ON DELETE TO audit_log DO INSTEAD NOTHING;


-- ============================================================
-- INDEXES
-- ============================================================

-- Primary lookups
CREATE INDEX idx_students_matric_hash   ON students(matric_no_hash);
CREATE INDEX idx_students_status        ON students(status);
CREATE INDEX idx_students_delete_at     ON students(scheduled_delete_at);
CREATE INDEX idx_allergies_student      ON allergies(student_id);
CREATE INDEX idx_documents_student      ON documents(student_id);
CREATE INDEX idx_visits_student         ON visits(student_id);
CREATE INDEX idx_audit_actor            ON audit_log(actor_id);
CREATE INDEX idx_audit_resource         ON audit_log(resource_id);
CREATE INDEX idx_audit_created          ON audit_log(created_at);


-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_students_updated_at
  BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_staff_updated_at
  BEFORE UPDATE ON staff
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_visits_updated_at
  BEFORE UPDATE ON visits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE students        ENABLE ROW LEVEL SECURITY;
ALTER TABLE allergies       ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents       ENABLE ROW LEVEL SECURITY;
ALTER TABLE visits          ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff           ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log       ENABLE ROW LEVEL SECURITY;

-- Helper: get current user's role from staff table
CREATE OR REPLACE FUNCTION current_staff_role()
RETURNS TEXT AS $$
  SELECT role::TEXT FROM staff WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- Helper: get current student's id
CREATE OR REPLACE FUNCTION current_student_id()
RETURNS UUID AS $$
  SELECT id FROM students WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- STUDENTS: Staff (any role) can read all. Student can only read own.
CREATE POLICY students_staff_read ON students
  FOR SELECT USING (
    current_staff_role() IN ('doctor','nurse','pharmacist','health_admin','super_admin')
  );

CREATE POLICY students_staff_write ON students
  FOR ALL USING (
    current_staff_role() IN ('doctor','health_admin','super_admin')
  );

CREATE POLICY students_own_read ON students
  FOR SELECT USING (
    auth.uid() = auth_user_id
  );

-- ALLERGIES: same pattern
CREATE POLICY allergies_staff_read ON allergies
  FOR SELECT USING (
    current_staff_role() IS NOT NULL
  );

CREATE POLICY allergies_staff_write ON allergies
  FOR ALL USING (
    current_staff_role() IN ('doctor','nurse','super_admin')
  );

CREATE POLICY allergies_own_read ON allergies
  FOR SELECT USING (
    student_id = current_student_id()
  );

-- DOCUMENTS: staff can read + download. Student can read own.
CREATE POLICY documents_staff_all ON documents
  FOR ALL USING (
    current_staff_role() IS NOT NULL
  );

CREATE POLICY documents_own_read ON documents
  FOR SELECT USING (
    student_id = current_student_id()
  );

-- AUDIT LOG: only super_admin and health_admin can read
CREATE POLICY audit_admin_read ON audit_log
  FOR SELECT USING (
    current_staff_role() IN ('super_admin','health_admin')
  );

-- VISITS: staff can read/write, student read own
CREATE POLICY visits_staff_all ON visits
  FOR ALL USING (current_staff_role() IS NOT NULL);

CREATE POLICY visits_own_read ON visits
  FOR SELECT USING (student_id = current_student_id());


-- ============================================================
-- STORAGE BUCKETS (run via Supabase dashboard or CLI)
-- ============================================================

-- Create these buckets in Supabase Storage:
-- 1. "medical-documents"  → private, max 10MB, accept: pdf, jpg, png
-- 2. "profile-photos"     → private, max 2MB, accept: jpg, png, webp

-- RLS on storage: only the owning student can upload,
-- staff with valid session can download via signed URLs


-- ============================================================
-- RETENTION: pg_cron automated deletion
-- ============================================================

-- Runs every night at 2:00 AM WAT (UTC+1 = 01:00 UTC)
SELECT cron.schedule(
  'octal-ehr-nightly-retention',
  '0 1 * * *',
  $$
    -- Step 1: Warn records approaching deletion within 30 days
    UPDATE students
    SET status = 'pending_deletion'
    WHERE scheduled_delete_at <= CURRENT_DATE + INTERVAL '30 days'
      AND status = 'alumni';

    -- Step 2: Hard delete records past retention date
    -- Cascade deletes allergies, history, visits, documents rows
    -- Edge Function handles deleting actual files from Storage
    DELETE FROM students
    WHERE scheduled_delete_at <= CURRENT_DATE
      AND status = 'pending_deletion';
  $$
);


-- ============================================================
-- UTILITY: Lookup student by matric number (app-level helper)
-- Pass in SHA-256 hash from application, never raw matric
-- ============================================================

CREATE OR REPLACE FUNCTION lookup_student_by_matric(p_matric_hash TEXT)
RETURNS TABLE (
  id UUID,
  blood_group blood_group,
  genotype genotype,
  gender TEXT,
  department TEXT,
  faculty TEXT,
  level TEXT,
  status student_status,
  profile_verified BOOLEAN,
  -- encrypted columns returned as-is, app decrypts
  matric_no_enc TEXT,
  full_name_enc TEXT,
  date_of_birth_enc TEXT,
  photo_url_enc TEXT,
  emergency_contact_enc TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id, s.blood_group, s.genotype, s.gender,
    s.department, s.faculty, s.level, s.status,
    s.profile_verified,
    s.matric_no_enc, s.full_name_enc, s.date_of_birth_enc,
    s.photo_url_enc, s.emergency_contact_enc
  FROM students s
  WHERE s.matric_no_hash = p_matric_hash
    AND s.status NOT IN ('deleted', 'pending_deletion');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- SEED: Super admin account (update email before running)
-- ============================================================

-- Run after creating the auth user in Supabase dashboard:
-- INSERT INTO staff (auth_user_id, full_name, email, role)
-- VALUES ('[paste auth.users UUID here]', 'System Administrator', 'admin@octal-ehr.ng', 'super_admin');


-- ============================================================
-- END OF PHASE 1 SCHEMA
-- ============================================================