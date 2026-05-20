# Medical Document Lifecycle & Architecture

This document explains the exact flow of a medical document from the moment a student selects it during onboarding, to how it is processed by AI, securely stored in the cloud, and eventually viewed by medical staff.

## 1. Upload & Client-Side Processing (`Onboarding.jsx`)

When a student selects files (PDF, JPG, PNG) in the drag-and-drop zone:
1. **Validation**: The client checks file size (max 10MB) and allowed MIME types.
2. **Base64 Conversion**: The file is read into a Base64 string via `FileReader`.
3. **Gemini Extraction**: The Base64 string is sent to the Gemini 2.5 Flash model alongside a strict system prompt. Gemini acts as an OCR + Intelligence layer, reading the raw image/PDF and returning a structured JSON payload containing personal details, allergies, medications, etc.
4. **Merging**: If multiple files are uploaded, their AI extractions are intelligently merged (e.g., deduplicating allergies) to create a single comprehensive student profile.

## 2. Secure Cloud Storage (`api/upload.js` -> Cloudflare R2)

Once the student clicks "This looks correct →" and submits the consent form:
1. **Serverless Endpoint**: The client sends the raw file buffer to the `/api/upload` serverless endpoint.
2. **R2 PutObject**: The Vercel backend uses the `@aws-sdk/client-s3` library to stream the file into Caleb University's Cloudflare R2 Bucket.
3. **Storage Path Generation**: Files are saved with the pattern: `medical-docs/{studentHash}/{timestamp}-{filename}`.
4. **Response**: R2 returns a success status, and the API returns the exact `storagePath` back to the frontend.

> [!WARNING]
> **Common Failure - Invalid Authorization Header**: If the `R2_ACCESS_KEY_ID` or `R2_SECRET_ACCESS_KEY` environment variables on Vercel contain trailing spaces or invisible newline characters (`\n`), the AWS SDK will generate a malformed HTTP header. This causes an `Invalid character in header content ["authorization"]` crash. This is mitigated by explicitly calling `.trim()` on the credentials in the API route.

## 3. Database Persistence (`Onboarding.jsx` -> Supabase)

After the file is successfully in Cloudflare R2, the system records it in PostgreSQL:
1. **Bypass RLS**: Because the `students_own_update` Row-Level Security policy restricts complex inserts, the system switches to the `supabaseAdmin` service role key to bypass RLS.
2. **Profile Creation**: The student's core demographics are saved to the `students` table.
3. **Sub-tables**: Allergies and Medical History are inserted into their respective tables.
4. **Document Record**: A row is inserted into the `documents` table for *each* uploaded file. This row contains:
   - `storage_path_enc`: The path to the file in R2.
   - `original_filename`: The name of the file (e.g., "LabResult.pdf").
   - `ai_raw_json`: The complete, raw JSON extraction for this specific file.
   - `document_type`: Validated against the strict ENUM (`medical_history_form`, `lab_result`, etc.).

> [!IMPORTANT]
> **Strict Error Catching**: Supabase JS does NOT throw exceptions for database errors (like an ENUM violation) by default. If `error` is returned, it must be explicitly thrown (`if (err) throw err`). If not, the insert fails silently, and the document record is lost, leading to "no document uploaded" in the staff portal.

## 4. Medical Staff Retrieval (`PatientView.jsx`)

When a medical staff member opens a student's profile:
1. **Fetch**: The staff client queries the `documents` table where `student_id = <ID>`. (Staff have RLS permission to read all documents via `documents_staff_all`).
2. **Artifact Rendering**: The UI iterates over the documents. For each document, it parses the `ai_raw_json` and builds the interactive "Document Artifact" UI, showing exact clinical values extracted from that specific file.
3. **Download Request**: If the staff clicks "Download Original File", the client calls `/api/download?path={storage_path_enc}`.
4. **Pre-signed URL**: The Vercel backend uses the R2 credentials to generate a temporary, secure pre-signed download URL, which the client then opens in a new tab to display the original PDF/Image.
