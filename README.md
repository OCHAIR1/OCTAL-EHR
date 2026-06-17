# OCTAL-EHR

OCTAL-EHR is the Electronic Medical Records system built for the Caleb University Health Center. It was created to transition the health center from a manual, paper-based student filing and verification workflow to a secure, automated, and offline-resilient digital system. The project was initiated after observing the inefficiencies of physical paperwork, providing a streamlined setup for medical staff and students.

## Overview

OCTAL-EHR provides a dual-surface medical records platform:

- Student App: Allows students to log in using their matric number or email, upload medical documents for automated AI clinical extraction, and view their health profile.
- Medical Staff Dashboard: Enables clinic staff to register students, lookup and search patient records, log daily clinic visits, and manage student profiles.

Authentication is handled via Supabase Auth with invite-only access for medical staff.

## Technology Stack

- Frontend: Vite + React 19
- Backend: Supabase (PostgreSQL, Auth, Edge Functions)
- AI Extraction: Gemini 2.0 Flash (for medical document OCR and extraction)
- File Storage: Cloudflare R2
- Hosting: Vercel
- Database Encryption: Supabase column-level encryption for sensitive columns
- Offline Cache: IndexedDB browser cache with 8-hour time-to-live (TTL)

## Authentication Flow

### Student Login
- Access via matric number (example: 24/15554) or email and password.
- Matric numbers automatically derive the account email as {slug}@calebuniversity.edu.ng.
- Default setup password is: Calebuniv

### Staff Login
- Access via email and password (invite-only accounts).
- Standard password recovery flow via Supabase email.

## Student Profile Lifecycle

1. Staff Registration: Staff upload matric files or manually enter matric numbers. Gemini AI extracts matric numbers automatically.
2. Student Onboarding: The student uploads their medical document. The AI extracts personal info, allergies, and medical history. The student verifies this data and submits it with NDPR consent.
3. Profile Lock: Once submitted, the profile open state is set to false, locking the profile from further student editing.
4. Staff Reopen: Medical staff can reopen locked profiles for student updates via the Open for Edit control.

## Document Processing

1. Student uploads PDF, JPG, or PNG during onboarding.
2. Gemini 2.0 Flash extracts structured data (name, date of birth, blood group, allergies, medical history, emergency contact).
3. Files are stored securely in Cloudflare R2 under the path pattern: medical-docs/{studentHash}/{timestamp}-{filename}
4. Encrypted document metadata is saved to Supabase.
5. Staff access files via pre-signed download URLs from /api/download.

## Encryption and Privacy

All personally identifiable information (PII) is stored encrypted at rest using Supabase column-level encryption:
- Target columns: full_name_enc, matric_no_enc, date_of_birth_enc, phone_number_enc, home_address_enc, email_enc, emergency_contact_enc

Matric number searches use a SHA-256 hash lookup. Plaintext matric numbers are never sent in queries.

The offline search cache uses IndexedDB with an 8-hour TTL, which is cleared on logout.

## Development

Install dependencies and start the local development server:

```bash
npm install
npm run dev
```

## Build and Deploy

Build the production bundle:

```bash
npm run build
```

The application is deployed via Vercel. Detailed phase-by-phase build documentation is located in docs/OCTAL_EHR_BUILD_PHASES.md.
