import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const serviceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY

// Standard client — used for normal operations (student reads, staff queries, etc.)
export const supabase = createClient(supabaseUrl, supabaseKey)

// Admin client — used ONLY for staff admin operations:
//   - Creating student auth accounts (no email verification)
//   - Resetting student passwords (direct, no email)
// This client bypasses RLS and has full admin access.
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// ── Auth helpers ──────────────────────────────────────────

export async function signUp(email, password, metadata = {}) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: metadata }
  })
  if (error) throw error
  return data
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })
  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}
