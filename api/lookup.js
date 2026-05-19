import { createClient } from '@supabase/supabase-js'

// Server-side Supabase admin client — bypasses RLS
const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { matric_hash } = req.body

    if (!matric_hash) {
      return res.status(400).json({ error: 'Missing matric_hash' })
    }

    // Look up email from students table — admin bypasses RLS
    const { data: student, error } = await supabaseAdmin
      .from('students')
      .select('email_enc')
      .eq('matric_no_hash', matric_hash)
      .maybeSingle()

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    if (!student || !student.email_enc) {
      return res.status(404).json({ error: 'No account found for this matric number.' })
    }

    // Return only the email — nothing else
    return res.status(200).json({ email: student.email_enc })
  } catch (err) {
    return res.status(500).json({ error: 'Lookup failed' })
  }
}
