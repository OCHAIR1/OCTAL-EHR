import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envText = fs.readFileSync('.env.local', 'utf8');
const env = envText.split(/\r?\n/).reduce((acc, line) => {
  const parts = line.split('=');
  if(parts.length > 1) {
    const k = parts.shift().trim();
    const v = parts.join('=').trim().replace(/^"|"$/g, '');
    acc[k] = v;
  }
  return acc;
}, {});

const supabaseAdmin = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function testInsert() {
  const { data: student } = await supabaseAdmin.from('students').select('id').limit(1).single();
  if (!student) {
    console.log("No student found to attach to");
    return;
  }
  
  const { data, error } = await supabaseAdmin.from('documents').insert({
    student_id: student.id,
    document_type: 'other',
    storage_path_enc: 'dummy-path',
    original_filename: 'test.pdf',
    file_size_bytes: 1000,
    mime_type: 'application/pdf',
    ai_raw_json: { test: true },
    ai_confidence: 0.9,
    extraction_status: 'verified'
  });
  
  console.log("Insert Error:", error);
  console.log("Insert Data:", data);
}

testInsert();
