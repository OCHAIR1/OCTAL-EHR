-- ============================================================
-- OCTAL-EHR - PHASE 3 SCHEMA MIGRATION
-- Profile control, account reset, student self-service
-- Author: Giant / TAI Team
-- ============================================================

-- 1. Add profile_open column to students
ALTER TABLE students ADD COLUMN IF NOT EXISTS profile_open BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN students.profile_open IS 'When true, student can edit their own profile. Auto-locked after first onboarding submission.';


-- 2. RLS: Students can UPDATE their own record ONLY when profile_open = true
CREATE POLICY students_own_update ON students
  FOR UPDATE USING (
    auth.uid() = auth_user_id
    AND profile_open = true
  );

-- 3. RLS: Students can INSERT their own record (onboarding — first profile creation)
CREATE POLICY students_own_insert ON students
  FOR INSERT WITH CHECK (
    auth.uid() = auth_user_id
  );

-- 4. RLS: Any authenticated staff can INSERT students (staff registration flow)
CREATE POLICY students_staff_insert ON students
  FOR INSERT WITH CHECK (
    current_staff_role() IS NOT NULL
  );

-- 5. RLS: Students can insert their own allergies during onboarding
CREATE POLICY allergies_own_insert ON allergies
  FOR INSERT WITH CHECK (
    student_id = current_student_id()
  );

-- 6. RLS: Students can insert their own medical history during onboarding
CREATE POLICY medical_history_own_read ON medical_history
  FOR SELECT USING (
    student_id = current_student_id()
  );

CREATE POLICY medical_history_own_insert ON medical_history
  FOR INSERT WITH CHECK (
    student_id = current_student_id()
  );

CREATE POLICY medical_history_staff_all ON medical_history
  FOR ALL USING (
    current_staff_role() IS NOT NULL
  );

-- 7. RLS: Students can insert documents during onboarding
CREATE POLICY documents_own_insert ON documents
  FOR INSERT WITH CHECK (
    student_id = current_student_id()
  );

-- 8. RLS: Visits — student can read own visits (for dashboard)
-- (Already exists from Phase 1: visits_own_read)

-- 9. RLS: Audit log — all authenticated users can INSERT (students log onboarding, staff log actions)
CREATE POLICY audit_all_insert ON audit_log
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
  );

-- 10. Staff can delete allergies (needed for account reset)
CREATE POLICY allergies_staff_delete ON allergies
  FOR DELETE USING (
    current_staff_role() IS NOT NULL
  );

-- 11. Staff can delete medical history (needed for account reset)
CREATE POLICY medical_history_staff_delete ON medical_history
  FOR DELETE USING (
    current_staff_role() IS NOT NULL
  );

-- 12. Staff can delete documents (needed for account reset)
CREATE POLICY documents_staff_delete ON documents
  FOR DELETE USING (
    current_staff_role() IS NOT NULL
  );

-- 13. Staff can delete visits (needed for account reset)
CREATE POLICY visits_staff_delete ON visits
  FOR DELETE USING (
    current_staff_role() IS NOT NULL
  );


-- ============================================================
-- END OF PHASE 3 MIGRATION
-- ============================================================
