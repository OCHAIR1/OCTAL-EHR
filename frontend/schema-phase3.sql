-- ============================================================
-- OCTAL-EHR - PHASE 3 SCHEMA MIGRATION
-- Profile open/close editability + simplified staff role
-- Run this in Supabase SQL Editor AFTER Phase 1 + Phase 2 schemas
-- ============================================================

-- Add profile_open flag to students table
ALTER TABLE students ADD COLUMN IF NOT EXISTS profile_open BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN students.profile_open IS 'When TRUE, student can edit their profile. Auto-set to FALSE on submit. Medics can re-open.';

-- ── Simplified staff role (drop old enum if you haven't run schema.sql yet) ──
-- All staff have the same access — the role is informational only, not a permission gate.
-- If the old enum causes issues, you can update it manually. No permissions are role-based.

-- ── Bulk student creation function ──────────────────────────────
-- Call: SELECT create_student_account('CSC/2021/001', 'student@email.com', 'tempPass123');
CREATE OR REPLACE FUNCTION create_student_account(
    p_matric_no TEXT,
    p_email TEXT,
    p_password TEXT
) RETURNS UUID AS $$
DECLARE
    v_user_id UUID;
    v_matric_hash TEXT;
BEGIN
    -- Create auth user
    v_user_id := (
        SELECT id FROM auth.users
        WHERE email = p_email
        LIMIT 1
    );

    IF v_user_id IS NULL THEN
        -- Use Supabase admin API to create user (must be called from Edge Function or dashboard)
        -- For SQL-based creation, use the Supabase Auth admin functions
        RAISE NOTICE 'User % must be created via Supabase Auth Dashboard or Edge Function first', p_email;
        RETURN NULL;
    END IF;

    -- Hash matric number
    v_matric_hash := encode(digest(UPPER(TRIM(p_matric_no)), 'sha256'), 'hex');

    -- Create empty student profile (open for first edit)
    INSERT INTO students (
        auth_user_id,
        matric_no_hash,
        matric_no_enc,
        full_name_enc,
        profile_open,
        profile_verified,
        status
    ) VALUES (
        v_user_id,
        v_matric_hash,
        p_matric_no,   -- will be encrypted by Vault trigger
        '',            -- empty, student fills this
        TRUE,          -- open for student to fill
        FALSE,
        'active'
    )
    ON CONFLICT (matric_no_hash) DO NOTHING;

    RETURN v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── RLS: Students can only UPDATE their own row when profile_open = true ──
DROP POLICY IF EXISTS student_update_own ON students;
CREATE POLICY student_update_own ON students
    FOR UPDATE USING (
        auth_user_id = auth.uid()
        AND profile_open = TRUE
    )
    WITH CHECK (
        auth_user_id = auth.uid()
        AND profile_open = TRUE
    );

-- ── RLS: Staff can toggle profile_open ──
DROP POLICY IF EXISTS staff_toggle_profile ON students;
CREATE POLICY staff_toggle_profile ON students
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM staff WHERE auth_user_id = auth.uid())
    );

-- ── Trigger: Auto-close profile on student submit ──
CREATE OR REPLACE FUNCTION auto_close_profile()
RETURNS TRIGGER AS $$
BEGIN
    -- When student fills in their name (first submission), auto-close
    IF NEW.profile_verified = TRUE AND OLD.profile_verified = FALSE THEN
        NEW.profile_open := FALSE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_close_profile ON students;
CREATE TRIGGER trg_auto_close_profile
    BEFORE UPDATE ON students
    FOR EACH ROW
    EXECUTE FUNCTION auto_close_profile();
