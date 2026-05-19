-- ============================================================
-- OCTAL-EHR - EXTRACTION QUEUE
-- Database-backed job queue for document processing
-- ============================================================

-- The queue table — acts like a hospital ticketing system
CREATE TABLE extraction_queue (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id     UUID REFERENCES documents(id) ON DELETE CASCADE,
  student_id      UUID REFERENCES students(id) ON DELETE CASCADE,
  storage_path    TEXT NOT NULL,          -- path in Supabase Storage
  status          TEXT DEFAULT 'pending'
    CHECK (status IN ('pending','processing','done','failed')),
  attempts        INTEGER DEFAULT 0,
  last_error      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ
);

COMMENT ON TABLE extraction_queue IS 'Async document extraction queue. Buffers uploads, processes at Gemini rate limit pace.';

-- Index: worker picks next pending job in microseconds
CREATE INDEX idx_queue_pending ON extraction_queue(created_at)
  WHERE status = 'pending';

-- Index: student checks their own queue status
CREATE INDEX idx_queue_student ON extraction_queue(student_id);


-- ============================================================
-- RLS POLICIES
-- ============================================================

ALTER TABLE extraction_queue ENABLE ROW LEVEL SECURITY;

-- Staff can see and manage all queue items
CREATE POLICY queue_staff_all ON extraction_queue
  FOR ALL USING (current_staff_role() IS NOT NULL);

-- Students can read their own queue items
CREATE POLICY queue_student_read ON extraction_queue
  FOR SELECT USING (student_id = current_student_id());


-- ============================================================
-- STUCK JOB RECOVERY (add to nightly pg_cron)
-- ============================================================
-- Reset jobs stuck in 'processing' for over 10 minutes
-- (means the worker crashed or browser closed mid-extraction)

-- Add this to the existing nightly cron job:
-- UPDATE extraction_queue
-- SET status = 'pending',
--     last_error = 'Worker timeout — auto-reset'
-- WHERE status = 'processing'
--   AND started_at < NOW() - INTERVAL '10 minutes';


-- ============================================================
-- END OF QUEUE SCHEMA
-- ============================================================
