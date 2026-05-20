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

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_SERVICE_ROLE_KEY);
supabase.from('documents').select('*').limit(5).then(console.log).catch(console.error);
