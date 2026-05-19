/**
 * create-staff-user.js
 * 
 * Creates a staff auth account + staff table row in Supabase.
 * Run with: node scripts/create-staff-user.js
 * 
 * Requires: @supabase/supabase-js (already in project dependencies)
 * 
 * IMPORTANT: This script uses the SERVICE ROLE KEY, which has full
 * admin access. NEVER expose this key in the frontend or commit it to git.
 */

import { createClient } from '@supabase/supabase-js'

// ── Configuration ──────────────────────────────────────────
const SUPABASE_URL = 'https://ohbcqrxamcopxbcdluao.supabase.co'
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9oYmNxcnhhbWNvcHhiY2RsdWFvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTExNDE4MCwiZXhwIjoyMDk0NjkwMTgwfQ.FN8ctl5ujSNmlnuyLCi1Xl-_l5bLEUOmylvCnwDOcmw'

// Staff user to create
const STAFF_EMAIL = 'medics.calebuniv@gmail.com'
const STAFF_PASSWORD = 'Welcome123..'
const STAFF_NAME = 'OCTAL Medical Staff'
const STAFF_ROLE = 'doctor'  // Options: doctor, nurse, pharmacist, health_admin, super_admin

// ── Script ─────────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function main() {
  console.log('\n╔══════════════════════════════════════════╗')
  console.log('║   OCTAL-EHR — Staff User Creation        ║')
  console.log('╚══════════════════════════════════════════╝\n')

  // Step 1: Create auth user
  console.log(`→ Creating auth user: ${STAFF_EMAIL}`)
  
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email: STAFF_EMAIL,
    password: STAFF_PASSWORD,
    email_confirm: true,
    user_metadata: {
      role: 'staff',
      staff_role: STAFF_ROLE,
      full_name: STAFF_NAME
    }
  })

  if (authErr) {
    if (authErr.message?.includes('already been registered') || authErr.message?.includes('already exists')) {
      console.log(`⚠ Auth user already exists for ${STAFF_EMAIL}`)
      
      // Try to find the existing user
      const { data: users } = await supabase.auth.admin.listUsers()
      const existing = users?.users?.find(u => u.email === STAFF_EMAIL)
      
      if (existing) {
        console.log(`  Found existing user: ${existing.id}`)
        
        // Update password to make sure it matches
        await supabase.auth.admin.updateUserById(existing.id, {
          password: STAFF_PASSWORD
        })
        console.log(`  ✓ Password updated to: ${STAFF_PASSWORD}`)
        
        // Check if staff row exists
        const { data: staffRow } = await supabase
          .from('staff')
          .select('id')
          .eq('auth_user_id', existing.id)
          .maybeSingle()
        
        if (staffRow) {
          console.log(`  ✓ Staff row already exists: ${staffRow.id}`)
        } else {
          // Insert staff row
          const { error: rowErr } = await supabase.from('staff').insert({
            auth_user_id: existing.id,
            full_name: STAFF_NAME,
            email: STAFF_EMAIL,
            role: STAFF_ROLE
          })
          if (rowErr) {
            console.error(`  ✗ Failed to insert staff row: ${rowErr.message}`)
          } else {
            console.log(`  ✓ Staff row created`)
          }
        }
      }
    } else {
      console.error(`✗ Auth creation failed: ${authErr.message}`)
      process.exit(1)
    }
  } else {
    const userId = authData.user.id
    console.log(`  ✓ Auth user created: ${userId}`)

    // Step 2: Insert staff row
    console.log(`→ Creating staff table row...`)
    const { error: rowErr } = await supabase.from('staff').insert({
      auth_user_id: userId,
      full_name: STAFF_NAME,
      email: STAFF_EMAIL,
      role: STAFF_ROLE
    })

    if (rowErr) {
      console.error(`  ✗ Staff row insert failed: ${rowErr.message}`)
      console.log('  → The auth user was created but the staff row failed.')
      console.log('  → You may need to insert the staff row manually in the Supabase SQL editor:')
      console.log(`  → INSERT INTO staff (auth_user_id, full_name, email, role)`)
      console.log(`  → VALUES ('${userId}', '${STAFF_NAME}', '${STAFF_EMAIL}', '${STAFF_ROLE}');`)
    } else {
      console.log(`  ✓ Staff row created`)
    }
  }

  // Step 3: Audit log
  console.log(`→ Logging creation in audit trail...`)
  await supabase.from('audit_log').insert({
    actor_id: null,
    actor_role: 'system',
    action: 'CREATE_STAFF_ACCOUNT',
    resource_type: 'staff',
    metadata: { email: STAFF_EMAIL, role: STAFF_ROLE, created_by: 'create-staff-user.js' }
  })

  console.log('\n──────────────────────────────────────────────')
  console.log('  ✅ Staff account ready!')
  console.log('──────────────────────────────────────────────')
  console.log(`  Email:    ${STAFF_EMAIL}`)
  console.log(`  Password: ${STAFF_PASSWORD}`)
  console.log(`  Role:     ${STAFF_ROLE}`)
  console.log(`  Login at: /staff/login`)
  console.log('──────────────────────────────────────────────\n')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
