import { useState, useRef, useCallback } from "react";

// ── DESIGN SYSTEM ─────────────────────────────────────────────────────────────
// Bold minimal. Deep forest green. Medical authority.
const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=Outfit:wght@300;400;500;600;700&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --green:       #1B4332;
    --green-mid:   #2D6A4F;
    --green-light: #40916C;
    --green-pale:  #D8F3DC;
    --surface:     #F4F6F0;
    --white:       #FAFCF8;
    --text:        #0D1B0F;
    --muted:       #5A7362;
    --border:      #C8D8CC;
    --alert:       #C62828;
    --alert-bg:    #FFEBEE;
    --warn:        #E65100;
    --warn-bg:     #FFF3E0;
    --success:     #1B4332;
    --radius:      4px;
    --radius-lg:   8px;
  }

  body {
    font-family: 'Outfit', sans-serif;
    background: var(--surface);
    color: var(--text);
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
  }

  .app {
    max-width: 480px;
    margin: 0 auto;
    min-height: 100vh;
    background: var(--white);
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
  }

  /* ── HEADER ── */
  .header {
    background: var(--green);
    padding: 20px 24px 18px;
    position: relative;
  }

  .header-brand {
    font-family: 'DM Serif Display', serif;
    font-size: 22px;
    color: var(--white);
    letter-spacing: -0.5px;
  }

  .header-sub {
    font-size: 11px;
    color: var(--green-pale);
    font-weight: 500;
    letter-spacing: 2px;
    text-transform: uppercase;
    margin-top: 2px;
  }

  /* ── PROGRESS BAR ── */
  .progress-bar {
    height: 3px;
    background: var(--green-pale);
    opacity: 0.3;
    position: relative;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--green-pale);
    opacity: 1;
    transition: width 0.4s ease;
  }

  /* ── STEP INDICATOR ── */
  .step-indicator {
    display: flex;
    align-items: center;
    gap: 0;
    padding: 20px 24px 0;
  }

  .step-dot {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    color: var(--muted);
    background: var(--white);
    flex-shrink: 0;
    transition: all 0.3s;
    font-family: 'DM Mono', monospace;
  }

  .step-dot.active {
    background: var(--green);
    border-color: var(--green);
    color: white;
  }

  .step-dot.done {
    background: var(--green-light);
    border-color: var(--green-light);
    color: white;
  }

  .step-line {
    flex: 1;
    height: 2px;
    background: var(--border);
    transition: background 0.3s;
  }

  .step-line.done {
    background: var(--green-light);
  }

  /* ── CONTENT AREA ── */
  .content {
    flex: 1;
    padding: 24px;
    overflow-y: auto;
  }

  .step-title {
    font-family: 'DM Serif Display', serif;
    font-size: 28px;
    line-height: 1.15;
    color: var(--text);
    margin-bottom: 6px;
  }

  .step-desc {
    font-size: 14px;
    color: var(--muted);
    line-height: 1.6;
    margin-bottom: 28px;
  }

  /* ── FORM ELEMENTS ── */
  .field {
    margin-bottom: 20px;
  }

  .field label {
    display: block;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: var(--muted);
    margin-bottom: 8px;
  }

  .field input, .field select {
    width: 100%;
    height: 52px;
    border: 2px solid var(--border);
    border-radius: var(--radius);
    padding: 0 16px;
    font-size: 16px;
    font-family: 'Outfit', sans-serif;
    color: var(--text);
    background: var(--white);
    transition: border-color 0.2s;
    outline: none;
    -webkit-appearance: none;
  }

  .field input:focus, .field select:focus {
    border-color: var(--green);
  }

  .field input.mono {
    font-family: 'DM Mono', monospace;
    letter-spacing: 1px;
    text-transform: uppercase;
  }

  /* ── UPLOAD ZONE ── */
  .upload-zone {
    border: 2px dashed var(--border);
    border-radius: var(--radius-lg);
    padding: 40px 24px;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s;
    background: var(--surface);
    position: relative;
  }

  .upload-zone:hover, .upload-zone.drag-over {
    border-color: var(--green);
    background: var(--green-pale);
  }

  .upload-zone.has-file {
    border-color: var(--green-light);
    background: #F0FAF4;
    border-style: solid;
  }

  .upload-icon {
    width: 48px;
    height: 48px;
    margin: 0 auto 16px;
    background: var(--green);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 22px;
  }

  .upload-zone.has-file .upload-icon {
    background: var(--green-light);
  }

  .upload-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 6px;
  }

  .upload-hint {
    font-size: 12px;
    color: var(--muted);
  }

  .file-name {
    font-family: 'DM Mono', monospace;
    font-size: 12px;
    color: var(--green);
    margin-top: 8px;
    word-break: break-all;
  }

  /* ── CONSENT BOX ── */
  .consent-box {
    border: 2px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 20px;
    margin-bottom: 20px;
    background: var(--surface);
  }

  .consent-text {
    font-size: 13px;
    line-height: 1.7;
    color: var(--muted);
    margin-bottom: 16px;
  }

  .consent-check {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    cursor: pointer;
  }

  .consent-check input[type="checkbox"] {
    width: 20px;
    height: 20px;
    border: 2px solid var(--border);
    border-radius: 3px;
    flex-shrink: 0;
    margin-top: 1px;
    cursor: pointer;
    accent-color: var(--green);
  }

  .consent-check span {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    line-height: 1.5;
  }

  /* ── EXTRACTED DATA CARDS ── */
  .section-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: var(--muted);
    margin: 24px 0 12px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .section-label::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border);
  }

  .verify-field {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 0;
    border-bottom: 1px solid var(--border);
  }

  .verify-field:last-child {
    border-bottom: none;
  }

  .verify-key {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--muted);
    width: 38%;
  }

  .verify-val {
    font-size: 14px;
    font-weight: 500;
    color: var(--text);
    text-align: right;
    width: 60%;
    word-break: break-word;
  }

  .verify-val.null-val {
    color: var(--muted);
    font-style: italic;
    font-weight: 400;
  }

  .allergy-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 100px;
    font-size: 12px;
    font-weight: 700;
    margin: 4px 4px 4px 0;
  }

  .allergy-pill.life_threatening, .allergy-pill.severe {
    background: var(--alert-bg);
    color: var(--alert);
    border: 1.5px solid var(--alert);
  }

  .allergy-pill.moderate {
    background: var(--warn-bg);
    color: var(--warn);
    border: 1.5px solid var(--warn);
  }

  .allergy-pill.mild {
    background: var(--green-pale);
    color: var(--green);
    border: 1.5px solid var(--green-light);
  }

  /* ── CONFIDENCE BADGE ── */
  .confidence-bar-wrap {
    background: var(--surface);
    border-radius: var(--radius-lg);
    padding: 16px 20px;
    margin-bottom: 20px;
    border: 1.5px solid var(--border);
  }

  .confidence-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }

  .confidence-label {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--muted);
  }

  .confidence-pct {
    font-family: 'DM Mono', monospace;
    font-size: 20px;
    font-weight: 500;
    color: var(--green);
  }

  .confidence-track {
    height: 6px;
    background: var(--border);
    border-radius: 100px;
    overflow: hidden;
  }

  .confidence-fill {
    height: 100%;
    border-radius: 100px;
    background: var(--green);
    transition: width 0.8s ease;
  }

  .review-warning {
    background: var(--warn-bg);
    border: 1.5px solid var(--warn);
    border-radius: var(--radius);
    padding: 12px 16px;
    font-size: 12px;
    color: var(--warn);
    font-weight: 600;
    margin-bottom: 16px;
    display: flex;
    gap: 8px;
    align-items: flex-start;
  }

  /* ── PROCESSING STATE ── */
  .processing-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 24px;
    text-align: center;
  }

  .spinner {
    width: 56px;
    height: 56px;
    border: 3px solid var(--green-pale);
    border-top-color: var(--green);
    border-radius: 50%;
    animation: spin 0.9s linear infinite;
    margin-bottom: 24px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .processing-title {
    font-family: 'DM Serif Display', serif;
    font-size: 22px;
    color: var(--text);
    margin-bottom: 8px;
  }

  .processing-sub {
    font-size: 13px;
    color: var(--muted);
    line-height: 1.6;
    max-width: 260px;
  }

  /* ── SUCCESS STATE ── */
  .success-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 40px 24px;
  }

  .success-icon {
    width: 72px;
    height: 72px;
    background: var(--green);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 32px;
    margin-bottom: 24px;
    animation: pop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  }

  @keyframes pop {
    from { transform: scale(0); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }

  .success-matric {
    font-family: 'DM Mono', monospace;
    font-size: 13px;
    background: var(--green-pale);
    color: var(--green);
    padding: 8px 16px;
    border-radius: 100px;
    margin-top: 12px;
    font-weight: 500;
  }

  /* ── BUTTONS ── */
  .btn-primary {
    width: 100%;
    height: 56px;
    background: var(--green);
    color: white;
    border: none;
    border-radius: var(--radius);
    font-size: 15px;
    font-weight: 700;
    font-family: 'Outfit', sans-serif;
    cursor: pointer;
    letter-spacing: 0.5px;
    transition: background 0.2s, transform 0.1s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .btn-primary:hover { background: var(--green-mid); }
  .btn-primary:active { transform: scale(0.99); }
  .btn-primary:disabled {
    background: var(--border);
    color: var(--muted);
    cursor: not-allowed;
  }

  .btn-secondary {
    width: 100%;
    height: 52px;
    background: transparent;
    color: var(--green);
    border: 2px solid var(--green);
    border-radius: var(--radius);
    font-size: 14px;
    font-weight: 700;
    font-family: 'Outfit', sans-serif;
    cursor: pointer;
    margin-top: 12px;
    transition: all 0.2s;
  }

  .btn-secondary:hover {
    background: var(--green-pale);
  }

  .btn-row {
    margin-top: 32px;
    padding-bottom: 32px;
  }

  /* ── FOOTER ── */
  .footer {
    padding: 12px 24px;
    background: var(--surface);
    border-top: 1px solid var(--border);
    font-size: 11px;
    color: var(--muted);
    text-align: center;
  }

  /* ── ERROR STATE ── */
  .error-msg {
    background: var(--alert-bg);
    border: 1.5px solid var(--alert);
    border-radius: var(--radius);
    padding: 12px 16px;
    font-size: 13px;
    color: var(--alert);
    margin-bottom: 16px;
  }
`;

// ── MOCK: Simulate Gemini extraction (replace with real service call) ─────────
const mockExtractedData = {
  personal: {
    full_name: "Adaeze Chioma Okafor",
    date_of_birth: "2002-03-15",
    gender: "female",
    phone_number: "08134567890",
    home_address: "14 Bode Thomas Street, Surulere, Lagos",
    email: "adaeze.okafor@student.calebuni.edu.ng",
    emergency_contact: {
      name: "Mrs. Grace Okafor",
      relationship: "Mother",
      phone: "08023456789",
    },
  },
  clinical: {
    blood_group: "O+",
    genotype: "AS",
    allergies: [
      { allergen: "Penicillin", severity: "severe", reaction: "Anaphylaxis — rash, difficulty breathing" },
      { allergen: "Ibuprofen", severity: "moderate", reaction: "Gastrointestinal distress" },
    ],
    medical_history: [
      { condition: "Mild Asthma", status: "managed", diagnosed_date: "2018-06-01", notes: "Uses Salbutamol inhaler PRN" },
    ],
    vaccinations: [
      { vaccine: "Hepatitis B", date: "2020-09-10" },
      { vaccine: "Yellow Fever", date: "2021-01-05" },
    ],
    current_medications: [
      { drug: "Salbutamol Inhaler", dosage: "100mcg", frequency: "As needed" },
    ],
  },
  document_meta: {
    document_type: "doctor_letter",
    issuing_facility: "Lagos University Teaching Hospital (LUTH)",
    issuing_doctor: "Dr. Emeka Eze",
    document_date: "2024-08-20",
    document_language: "English",
  },
  extraction_meta: {
    confidence: 0.91,
    low_confidence_fields: ["home_address"],
    illegible_sections: [],
    notes: "Home address partially obscured by document fold.",
  },
};

// ── HELPER COMPONENTS ─────────────────────────────────────────────────────────

function StepIndicator({ current, total }) {
  return (
    <div className="step-indicator">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", flex: i < total - 1 ? 1 : "none" }}>
          <div className={`step-dot ${i < current ? "done" : i === current ? "active" : ""}`}>
            {i < current ? "✓" : i + 1}
          </div>
          {i < total - 1 && <div className={`step-line ${i < current ? "done" : ""}`} />}
        </div>
      ))}
    </div>
  );
}

function VerifyField({ label, value }) {
  const isNull = value === null || value === undefined || value === "";
  return (
    <div className="verify-field">
      <span className="verify-key">{label}</span>
      <span className={`verify-val ${isNull ? "null-val" : ""}`}>
        {isNull ? "Not found in document" : String(value)}
      </span>
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function StudentOnboarding() {
  const [step, setStep] = useState(0);
  const [matricNo, setMatricNo] = useState("");
  const [fullName, setFullName] = useState("");
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [consent, setConsent] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [extracted, setExtracted] = useState(null);
  const [error, setError] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const fileRef = useRef();

  const totalSteps = 4;
  const progressPct = ((step + 1) / totalSteps) * 100;

  // ── Step 0: Identity ────────────────────────────────────────────────────────
  const renderIdentity = () => (
    <>
      <h1 className="step-title">Your Identity</h1>
      <p className="step-desc">
        Enter your matric number exactly as it appears on your student ID.
        This becomes your permanent medical record number.
      </p>

      <div className="field">
        <label>Matric Number</label>
        <input
          className="mono"
          type="text"
          placeholder="e.g. CSC/2021/001"
          value={matricNo}
          onChange={(e) => setMatricNo(e.target.value.toUpperCase())}
          maxLength={20}
        />
      </div>

      <div className="field">
        <label>Full Name (as on student ID)</label>
        <input
          type="text"
          placeholder="Surname Firstname Middlename"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
      </div>

      <div className="btn-row">
        <button
          className="btn-primary"
          disabled={!matricNo.trim() || !fullName.trim()}
          onClick={() => setStep(1)}
        >
          Continue →
        </button>
      </div>
    </>
  );

  // ── Step 1: Upload ──────────────────────────────────────────────────────────
  const handleFileDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer?.files?.[0] || e.target.files?.[0];
    if (dropped) setFile(dropped);
  }, []);

  const handleProcess = async () => {
    setProcessing(true);
    setError(null);

    // Simulate API call — replace with: extractMedicalData(file, matricNo)
    await new Promise((r) => setTimeout(r, 3000));
    setExtracted(mockExtractedData);
    setProcessing(false);
    setStep(2);
  };

  const renderUpload = () => (
    <>
      <h1 className="step-title">Upload Medical Document</h1>
      <p className="step-desc">
        Upload your medical history form, doctor's letter, or any health document
        from your personal physician. Our AI will extract your details automatically.
      </p>

      <div
        className={`upload-zone ${dragOver ? "drag-over" : ""} ${file ? "has-file" : ""}`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleFileDrop}
      >
        <div className="upload-icon">{file ? "✓" : "↑"}</div>
        <div className="upload-title">
          {file ? "Document ready" : "Tap to upload"}
        </div>
        <div className="upload-hint">
          {file
            ? "Tap to replace"
            : "PDF, JPG, PNG — max 10MB"}
        </div>
        {file && <div className="file-name">{file.name}</div>}
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          style={{ display: "none" }}
          onChange={handleFileDrop}
        />
      </div>

      {error && <div className="error-msg" style={{ marginTop: 16 }}>⚠ {error}</div>}

      <div className="btn-row">
        <button
          className="btn-primary"
          disabled={!file}
          onClick={handleProcess}
        >
          Scan with AI →
        </button>
        <button className="btn-secondary" onClick={() => setStep(0)}>
          ← Back
        </button>
      </div>
    </>
  );

  // ── Step 1b: Processing ─────────────────────────────────────────────────────
  const renderProcessing = () => (
    <div className="processing-state">
      <div className="spinner" />
      <h2 className="processing-title">Scanning document…</h2>
      <p className="processing-sub">
        Gemini AI is reading your medical document and extracting your health details.
        This takes 5–15 seconds.
      </p>
    </div>
  );

  // ── Step 2: Verify ──────────────────────────────────────────────────────────
  const renderVerify = () => {
    if (!extracted) return null;
    const { personal, clinical, extraction_meta } = extracted;
    const confidence = Math.round(extraction_meta.confidence * 100);

    return (
      <>
        <h1 className="step-title">Verify Your Details</h1>
        <p className="step-desc">
          Review what was extracted from your document. Correct anything that looks wrong
          before submitting — this is your permanent health record.
        </p>

        {/* Confidence */}
        <div className="confidence-bar-wrap">
          <div className="confidence-row">
            <span className="confidence-label">AI Accuracy</span>
            <span className="confidence-pct">{confidence}%</span>
          </div>
          <div className="confidence-track">
            <div className="confidence-fill" style={{ width: `${confidence}%` }} />
          </div>
        </div>

        {extraction_meta.low_confidence_fields.length > 0 && (
          <div className="review-warning">
            ⚠ Review carefully: {extraction_meta.low_confidence_fields.join(", ")} may be inaccurate.
          </div>
        )}

        {/* Allergies — always first */}
        {clinical.allergies.length > 0 && (
          <>
            <div className="section-label">⚠ Allergies</div>
            <div>
              {clinical.allergies.map((a, i) => (
                <span key={i} className={`allergy-pill ${a.severity}`}>
                  {a.allergen}
                  {a.severity === "life_threatening" || a.severity === "severe"
                    ? " ⚠"
                    : ""}
                </span>
              ))}
            </div>
          </>
        )}

        {/* Personal */}
        <div className="section-label">Personal</div>
        <VerifyField label="Full Name" value={personal.full_name} />
        <VerifyField label="Date of Birth" value={personal.date_of_birth} />
        <VerifyField label="Gender" value={personal.gender} />
        <VerifyField label="Phone" value={personal.phone_number} />
        <VerifyField label="Address" value={personal.home_address} />

        {/* Clinical */}
        <div className="section-label">Clinical</div>
        <VerifyField label="Blood Group" value={clinical.blood_group} />
        <VerifyField label="Genotype" value={clinical.genotype} />

        {clinical.medical_history.length > 0 && (
          <>
            <div className="section-label">Medical History</div>
            {clinical.medical_history.map((h, i) => (
              <VerifyField key={i} label={h.condition} value={`${h.status} — ${h.notes || ""}`} />
            ))}
          </>
        )}

        {/* Emergency Contact */}
        <div className="section-label">Emergency Contact</div>
        <VerifyField label="Name" value={personal.emergency_contact?.name} />
        <VerifyField label="Relation" value={personal.emergency_contact?.relationship} />
        <VerifyField label="Phone" value={personal.emergency_contact?.phone} />

        {/* Document source */}
        <div className="section-label">Source Document</div>
        <VerifyField label="Facility" value={extracted.document_meta.issuing_facility} />
        <VerifyField label="Doctor" value={extracted.document_meta.issuing_doctor} />
        <VerifyField label="Date" value={extracted.document_meta.document_date} />

        <div className="btn-row">
          <button className="btn-primary" onClick={() => setStep(3)}>
            This looks correct →
          </button>
          <button className="btn-secondary" onClick={() => setStep(1)}>
            ← Re-upload document
          </button>
        </div>
      </>
    );
  };

  // ── Step 3: Consent & Submit ────────────────────────────────────────────────
  const renderConsent = () => (
    <>
      <h1 className="step-title">Data Consent</h1>
      <p className="step-desc">
        Under Nigeria's Data Protection Regulation (NDPR), we are required to get
        your explicit consent before storing your health data.
      </p>

      <div className="consent-box">
        <p className="consent-text">
          OCTAL Medical Center will store your health records securely
          in an encrypted database. Your data will only be accessed by authorized
          health center staff for the purpose of providing you medical care.
          {"\n\n"}
          Your records will be retained for 6 years after your convocation, after
          which they will be permanently and automatically deleted. You may request
          access to your data at any time from the health center administration.
        </p>
        <label className="consent-check">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span>
            I understand and consent to my medical information being stored and
            used by OCTAL Health Center.
          </span>
        </label>
      </div>

      <div className="btn-row">
        <button
          className="btn-primary"
          disabled={!consent}
          onClick={() => {
            setConfirmed(true);
            setStep(4);
          }}
        >
          Submit Medical Record
        </button>
        <button className="btn-secondary" onClick={() => setStep(2)}>
          ← Back
        </button>
      </div>
    </>
  );

  // ── Step 4: Success ─────────────────────────────────────────────────────────
  const renderSuccess = () => (
    <div className="success-state">
      <div className="success-icon">✓</div>
      <h1 className="step-title" style={{ marginBottom: 8 }}>
        You're registered.
      </h1>
      <p className="step-desc" style={{ maxWidth: 300 }}>
        Your medical profile has been created. When you visit the health center,
        give them your matric number and your records will be pulled up instantly.
      </p>
      <div className="success-matric">{matricNo}</div>

      <div style={{ marginTop: 32, padding: 20, background: "var(--surface)", borderRadius: 8, width: "100%", textAlign: "left" }}>
        <div className="section-label" style={{ margin: "0 0 12px" }}>What's next</div>
        <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.7 }}>
          The health center staff will review your submitted document and verify
          your profile. You'll be notified if any corrections are needed.
          Keep your matric number handy for every health center visit.
        </p>
      </div>
    </div>
  );

  return (
    <>
      <style>{css}</style>
      <div className="app">
        <div className="header">
          <div className="header-brand">OCTAL-EHR</div>
          <div className="header-sub">OCTAL Health Center</div>
        </div>

        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progressPct}%` }} />
        </div>

        {step < 4 && (
          <StepIndicator current={step} total={totalSteps} />
        )}

        <div className="content">
          {processing && renderProcessing()}
          {!processing && step === 0 && renderIdentity()}
          {!processing && step === 1 && renderUpload()}
          {!processing && step === 2 && renderVerify()}
          {!processing && step === 3 && renderConsent()}
          {!processing && step === 4 && renderSuccess()}
        </div>

        <div className="footer">
          Encrypted · NDPR Compliant · OCTAL {new Date().getFullYear()}
        </div>
      </div>
    </>
  );
}