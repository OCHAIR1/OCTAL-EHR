-- ============================================================
-- OCTAL-EHR - PHASE 2 SCHEMA MIGRATION
-- Visit logging, vitals, diagnoses, prescriptions
-- Run this in Supabase SQL Editor AFTER Phase 1 schema
-- ============================================================

-- VISITS (each clinic encounter)
CREATE TABLE IF NOT EXISTS visits (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    complaint_enc   TEXT NOT NULL,           -- encrypted chief complaint
    notes_enc       TEXT,                    -- encrypted clinical notes
    status          TEXT DEFAULT 'open'
        CHECK (status IN ('open', 'closed', 'referred')),
    seen_by         UUID REFERENCES staff(id),
    closed_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- VITALS (per visit)
CREATE TABLE IF NOT EXISTS vitals (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    visit_id         UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
    blood_pressure   TEXT,           -- "120/80"
    temperature      DECIMAL(4,1),   -- °C
    weight           DECIMAL(5,1),   -- kg
    height           DECIMAL(5,1),   -- cm
    pulse            INTEGER,        -- bpm
    respiratory_rate INTEGER,
    spo2             INTEGER,        -- oxygen saturation %
    recorded_by      UUID REFERENCES staff(id),
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- DIAGNOSES (per visit)
CREATE TABLE IF NOT EXISTS diagnoses (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    visit_id        UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
    icd_code        TEXT,            -- optional ICD-10
    description_enc TEXT NOT NULL,   -- encrypted diagnosis
    notes_enc       TEXT,            -- encrypted notes
    diagnosed_by    UUID REFERENCES staff(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- PRESCRIPTIONS (per visit)
CREATE TABLE IF NOT EXISTS prescriptions (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    visit_id      UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
    drug_enc      TEXT NOT NULL,     -- encrypted drug name
    dosage        TEXT,
    frequency     TEXT,
    duration      TEXT,
    prescribed_by UUID REFERENCES staff(id),
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_visits_student ON visits(student_id);
CREATE INDEX IF NOT EXISTS idx_visits_created ON visits(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vitals_visit ON vitals(visit_id);
CREATE INDEX IF NOT EXISTS idx_diagnoses_visit ON diagnoses(visit_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_visit ON prescriptions(visit_id);

-- ── RLS Policies ─────────────────────────────────────────
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE vitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnoses ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;

-- Staff can read/write all clinical data
CREATE POLICY staff_visits_all ON visits
    FOR ALL USING (
        EXISTS (SELECT 1 FROM staff WHERE auth_user_id = auth.uid())
    );

CREATE POLICY staff_vitals_all ON vitals
    FOR ALL USING (
        EXISTS (SELECT 1 FROM staff WHERE auth_user_id = auth.uid())
    );

CREATE POLICY staff_diagnoses_all ON diagnoses
    FOR ALL USING (
        EXISTS (SELECT 1 FROM staff WHERE auth_user_id = auth.uid())
    );

CREATE POLICY staff_prescriptions_all ON prescriptions
    FOR ALL USING (
        EXISTS (SELECT 1 FROM staff WHERE auth_user_id = auth.uid())
    );

-- Students can view their own visits (read-only)
CREATE POLICY student_visits_read ON visits
    FOR SELECT USING (
        student_id IN (SELECT id FROM students WHERE auth_user_id = auth.uid())
    );
