-- ============================================================
-- OCTAL-EHR - PHASE 4 SCHEMA MIGRATION
-- RLS Fix for Student Profile Updates
-- ============================================================

-- 1. Allow students to delete their own allergies (needed when updating profile)
CREATE POLICY allergies_own_delete ON allergies
  FOR DELETE USING (
    student_id = current_student_id()
  );

-- 2. Allow students to delete their own medical history (needed when updating profile)
CREATE POLICY medical_history_own_delete ON medical_history
  FOR DELETE USING (
    student_id = current_student_id()
  );
