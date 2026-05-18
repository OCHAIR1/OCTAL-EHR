/**
 * OCTAL-EHR — Gemini Flash Medical Document Extractor
 * Phase 1 — AI Extraction Service
 *
 * Flow:
 *   1. Student uploads file (PDF/image)
 *   2. This service sends it to Gemini 2.0 Flash
 *   3. Gemini returns structured medical JSON
 *   4. App shows student a verification screen
 *   5. Student confirms → data saved to Supabase
 *
 * Usage:
 *   const result = await extractMedicalData(file, matricNo)
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import crypto from "crypto";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ─── MASTER EXTRACTION PROMPT ────────────────────────────────────────────────
// This is the single most important thing for accuracy.
// Tuned for Nigerian medical documents, handwritten notes, doctor letters.

const EXTRACTION_SYSTEM_PROMPT = `
You are a medical records extraction AI for a Nigerian university health center.
Your task is to extract structured medical information from uploaded documents.

DOCUMENT TYPES you will encounter:
- Nigerian doctor's letters (LUTH, LASUTH, UCH, private clinics)
- Handwritten medical history forms
- Lab result sheets (blood tests, genotype, blood group)
- Vaccination records / immunization cards
- School entry medical examination forms
- Printed hospital discharge summaries

EXTRACTION RULES:
1. Extract ONLY information explicitly stated in the document. NEVER infer or assume.
2. If a field is not present in the document, return null for that field.
3. For Nigerian names: preserve full name exactly as written.
4. Blood group: standardize to format A+, A-, B+, B-, AB+, AB-, O+, O- or null.
5. Genotype: standardize to AA, AS, AC, SS, SC, CC or null.
6. Dates: convert to ISO 8601 format (YYYY-MM-DD) where possible.
7. Allergies: list each separately with severity if stated.
8. Medical conditions: include both current and historical if documented.

RESPONSE FORMAT:
Return ONLY valid JSON. No preamble, no markdown, no explanation.
Use this exact schema:

{
  "personal": {
    "full_name": "string | null",
    "date_of_birth": "YYYY-MM-DD | null",
    "gender": "male | female | other | null",
    "phone_number": "string | null",
    "home_address": "string | null",
    "email": "string | null",
    "emergency_contact": {
      "name": "string | null",
      "relationship": "string | null",
      "phone": "string | null"
    }
  },
  "clinical": {
    "blood_group": "A+ | A- | B+ | B- | AB+ | AB- | O+ | O- | null",
    "genotype": "AA | AS | AC | SS | SC | CC | null",
    "allergies": [
      {
        "allergen": "string",
        "severity": "mild | moderate | severe | life_threatening | unknown",
        "reaction": "string | null"
      }
    ],
    "medical_history": [
      {
        "condition": "string",
        "status": "active | resolved | managed | unknown",
        "diagnosed_date": "YYYY-MM-DD | null",
        "notes": "string | null"
      }
    ],
    "vaccinations": [
      {
        "vaccine": "string",
        "date": "YYYY-MM-DD | null"
      }
    ],
    "current_medications": [
      {
        "drug": "string",
        "dosage": "string | null",
        "frequency": "string | null"
      }
    ]
  },
  "document_meta": {
    "document_type": "medical_history_form | lab_result | doctor_letter | vaccination_record | other",
    "issuing_facility": "string | null",
    "issuing_doctor": "string | null",
    "document_date": "YYYY-MM-DD | null",
    "document_language": "string"
  },
  "extraction_meta": {
    "confidence": 0.0,
    "low_confidence_fields": [],
    "illegible_sections": [],
    "notes": "string | null"
  }
}

CONFIDENCE SCORING:
- Set confidence between 0.0 and 1.0
- Deduct 0.1 for each field that was partially illegible
- Deduct 0.2 for poor document quality overall
- Deduct 0.15 for handwritten documents (more error-prone)
- List any field names you are uncertain about in low_confidence_fields
- List page sections that were unreadable in illegible_sections
`;

// ─── FILE → BASE64 CONVERTER ─────────────────────────────────────────────────

/**
 * Converts a File/Blob to base64 string
 * Works in both browser and Node.js (Buffer)
 */
async function fileToBase64(file) {
    // Browser environment
    if (typeof FileReader !== "undefined") {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(",")[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    // Node.js environment
    const buffer = await file.arrayBuffer();
    return Buffer.from(buffer).toString("base64");
}

// ─── MIME TYPE DETECTION ──────────────────────────────────────────────────────

function getMimeType(file) {
    if (file.type) return file.type;

    const ext = file.name?.split(".").pop()?.toLowerCase();
    const mimeMap = {
        pdf: "application/pdf",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
        heic: "image/heic",
        heif: "image/heif",
    };

    return mimeMap[ext] || "application/octet-stream";
}

// ─── MAIN EXTRACTOR FUNCTION ──────────────────────────────────────────────────

/**
 * @param {File} file - The uploaded medical document
 * @param {string} matricNo - Student's matric number (for audit, not sent to Gemini)
 * @returns {Promise<ExtractionResult>}
 */
export async function extractMedicalData(file, matricNo) {
    // Validate file
    const allowedTypes = [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/heic",
    ];

    const mimeType = getMimeType(file);
    if (!allowedTypes.includes(mimeType)) {
        throw new Error(
            `Unsupported file type: ${mimeType}. Upload a PDF or image.`
        );
    }

    const maxSizeMB = 10;
    if (file.size > maxSizeMB * 1024 * 1024) {
        throw new Error(`File too large. Maximum size is ${maxSizeMB}MB.`);
    }

    // Convert to base64
    const base64Data = await fileToBase64(file);

    // Initialize Gemini model
    const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash",
        generationConfig: {
            temperature: 0.1,       // Low temperature = more deterministic extraction
            topP: 0.95,
            maxOutputTokens: 4096,
            responseMimeType: "application/json",
        },
        systemInstruction: EXTRACTION_SYSTEM_PROMPT,
    });

    // Build the prompt content
    const promptParts = [
        {
            inlineData: {
                mimeType,
                data: base64Data,
            },
        },
        {
            text: `Extract all medical information from this document following the schema provided.
      
      This document was uploaded by a student for their university health records.
      Extract every piece of relevant medical information visible in the document.
      If this appears to be a multi-page document, extract from all visible content.`,
        },
    ];

    // Call Gemini
    let rawResponse;
    let extractedData;

    try {
        const result = await model.generateContent(promptParts);
        rawResponse = result.response.text();
        extractedData = JSON.parse(rawResponse);
    } catch (parseError) {
        // Strip any accidental markdown fences and retry parse
        const cleaned = rawResponse
            ?.replace(/```json\n?/g, "")
            ?.replace(/```\n?/g, "")
            ?.trim();

        try {
            extractedData = JSON.parse(cleaned);
        } catch {
            throw new Error(
                "Gemini returned malformed JSON. The document may be unreadable."
            );
        }
    }

    // ── Post-process: normalize fields ──────────────────────────────────────────

    // Ensure arrays are never null (always empty arrays)
    if (!extractedData.clinical.allergies) {
        extractedData.clinical.allergies = [];
    }
    if (!extractedData.clinical.medical_history) {
        extractedData.clinical.medical_history = [];
    }
    if (!extractedData.clinical.vaccinations) {
        extractedData.clinical.vaccinations = [];
    }
    if (!extractedData.clinical.current_medications) {
        extractedData.clinical.current_medications = [];
    }

    // Confidence floor — never trust a 0.0
    if (extractedData.extraction_meta.confidence < 0.3) {
        console.warn(
            `Low confidence extraction (${extractedData.extraction_meta.confidence}) for matric: ${matricNo}`
        );
    }

    // ── Build final result object ────────────────────────────────────────────────

    return {
        success: true,
        matricNo,
        extracted: extractedData,
        rawJson: rawResponse,                        // stored in documents.ai_raw_json
        extractedAt: new Date().toISOString(),
        model: "gemini-2.0-flash",
        fileHash: await hashFile(base64Data),        // for deduplication
        requiresManualReview:
            extractedData.extraction_meta.confidence < 0.75 ||
            extractedData.extraction_meta.low_confidence_fields.length > 3,
    };
}

// ─── FILE HASH (deduplication) ────────────────────────────────────────────────

async function hashFile(base64Data) {
    if (typeof crypto.subtle !== "undefined") {
        // Browser
        const buffer = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
        const hash = await crypto.subtle.digest("SHA-256", buffer);
        return Array.from(new Uint8Array(hash))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
    } else {
        // Node.js
        return crypto
            .createHash("sha256")
            .update(Buffer.from(base64Data, "base64"))
            .digest("hex");
    }
}

// ─── MATRIC HASH (for Supabase lookup) ────────────────────────────────────────

/**
 * Call this on the client before querying Supabase.
 * NEVER send raw matric number to the database.
 * @param {string} matricNo - e.g. "CSC/2021/001"
 * @returns {string} SHA-256 hex hash
 */
export function hashMatricNo(matricNo) {
    // Normalize: uppercase, trim whitespace
    const normalized = matricNo.trim().toUpperCase();

    if (typeof crypto.subtle !== "undefined") {
        // Browser: use subtle crypto (async version available separately)
        // For sync usage in browser, use this simplified version:
        throw new Error(
            "Use hashMatricNoBrowser() in browser environments (async)"
        );
    }

    // Node.js
    return crypto.createHash("sha256").update(normalized).digest("hex");
}

export async function hashMatricNoBrowser(matricNo) {
    const normalized = matricNo.trim().toUpperCase();
    const encoder = new TextEncoder();
    const data = encoder.encode(normalized);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

// ─── EXAMPLE USAGE ───────────────────────────────────────────────────────────
/*

// In your onboarding component:

import { extractMedicalData, hashMatricNoBrowser } from './gemini-extractor.js'

const handleUpload = async (file, matricNo) => {
  setLoading(true)

  try {
    const result = await extractMedicalData(file, matricNo)

    if (result.requiresManualReview) {
      // Show banner: "Some fields need your attention"
      setNeedsReview(true)
    }

    // Show student the verification screen
    setExtractedData(result.extracted)
    setStep('verify')

  } catch (err) {
    setError(err.message)
  } finally {
    setLoading(false)
  }
}

// After student verifies and confirms:
const handleConfirm = async (verifiedData) => {
  const matricHash = await hashMatricNoBrowser(matricNo)

  // Encrypt PII fields here using Supabase Vault before insert
  // Then insert into students table with matric_no_hash = matricHash
}

*/