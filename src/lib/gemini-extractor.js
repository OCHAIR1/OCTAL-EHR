import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY)

const EXTRACTION_PROMPT = `
You are a medical records extraction AI for Caleb University Health Center (Nigeria).
Extract structured medical information from the uploaded document.

DOCUMENT TYPES you may encounter:
- Nigerian doctor's letters (LUTH, LASUTH, UCH, private clinics)
- Handwritten medical history forms
- Lab result sheets (blood tests, genotype, blood group)
- Vaccination records / immunization cards
- School entry medical examination forms
- Hospital discharge summaries

RULES:
1. Extract ONLY information explicitly stated. NEVER infer or assume.
2. If a field is not present, return null.
3. Preserve Nigerian names exactly as written.
4. Blood group: A+, A-, B+, B-, AB+, AB-, O+, O- or null.
5. Genotype: AA, AS, AC, SS, SC, CC or null.
6. Dates: ISO 8601 (YYYY-MM-DD) where possible.
7. List each allergy separately with severity if stated.

Return ONLY valid JSON with this exact schema:
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
      { "allergen": "string", "severity": "mild | moderate | severe | life_threatening | unknown", "reaction": "string | null" }
    ],
    "medical_history": [
      { "condition": "string", "status": "active | resolved | managed | unknown", "diagnosed_date": "YYYY-MM-DD | null", "notes": "string | null" }
    ],
    "vaccinations": [
      { "vaccine": "string", "date": "YYYY-MM-DD | null" }
    ],
    "current_medications": [
      { "drug": "string", "dosage": "string | null", "frequency": "string | null" }
    ]
  },
  "document_meta": {
    "document_type": "medical_history_form | lab_result | doctor_letter | vaccination_record | other",
    "issuing_facility": "string | null",
    "issuing_doctor": "string | null",
    "document_date": "YYYY-MM-DD | null"
  },
  "extraction_meta": {
    "confidence": 0.0,
    "low_confidence_fields": [],
    "notes": "string | null"
  }
}
`

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function getMimeType(file) {
  if (file.type) return file.type
  const ext = file.name?.split('.').pop()?.toLowerCase()
  const map = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
  return map[ext] || 'application/octet-stream'
}

export async function extractMedicalData(file) {
  const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  const mime = getMimeType(file)

  if (!allowed.includes(mime)) {
    throw new Error(`Unsupported file type: ${mime}. Upload a PDF or image.`)
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('File too large. Maximum size is 10MB.')
  }

  const base64 = await fileToBase64(file)

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: {
      temperature: 0.1,
      topP: 0.95,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json'
    },
    systemInstruction: EXTRACTION_PROMPT
  })

  const result = await model.generateContent([
    { inlineData: { mimeType: mime, data: base64 } },
    { text: 'Extract all medical information from this document.' }
  ])

  let raw = result.response.text()
  let parsed

  try {
    parsed = JSON.parse(raw)
  } catch {
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      throw new Error('AI returned unreadable data. The document may be too damaged to scan.')
    }
  }

  // Ensure arrays are never null
  if (!parsed.clinical) parsed.clinical = {}
  parsed.clinical.allergies = parsed.clinical.allergies || []
  parsed.clinical.medical_history = parsed.clinical.medical_history || []
  parsed.clinical.vaccinations = parsed.clinical.vaccinations || []
  parsed.clinical.current_medications = parsed.clinical.current_medications || []

  if (!parsed.extraction_meta) parsed.extraction_meta = { confidence: 0.5, low_confidence_fields: [], notes: null }

  return {
    extracted: parsed,
    rawJson: raw,
    confidence: parsed.extraction_meta.confidence,
    requiresReview: parsed.extraction_meta.confidence < 0.75 || (parsed.extraction_meta.low_confidence_fields?.length > 3)
  }
}
