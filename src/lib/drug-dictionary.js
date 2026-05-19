/**
 * COMMON DRUGS — Nigerian University Health Center
 * Top 250 drugs used in primary care / campus clinics.
 * Used for autocomplete suggestions in prescription forms.
 */

const DRUG_LIST = [
  // ── Antimalarials ──
  'Artemether-Lumefantrine (Coartem)',
  'Artesunate',
  'Amodiaquine',
  'Chloroquine',
  'Quinine',
  'Proguanil',
  'Sulfadoxine-Pyrimethamine (Fansidar)',
  'Dihydroartemisinin-Piperaquine (P-Alaxin)',
  'Mefloquine',

  // ── Antibiotics ──
  'Amoxicillin',
  'Amoxicillin-Clavulanate (Augmentin)',
  'Ampicillin',
  'Azithromycin (Zithromax)',
  'Cefuroxime',
  'Ceftriaxone',
  'Cefixime',
  'Ciprofloxacin',
  'Clarithromycin',
  'Clindamycin',
  'Cloxacillin',
  'Co-trimoxazole (Septrin)',
  'Doxycycline',
  'Erythromycin',
  'Flucloxacillin',
  'Gentamicin',
  'Levofloxacin',
  'Metronidazole (Flagyl)',
  'Nitrofurantoin',
  'Norfloxacin',
  'Ofloxacin',
  'Penicillin V',
  'Tetracycline',
  'Tinidazole (Fasigyn)',

  // ── Analgesics / Anti-inflammatory ──
  'Paracetamol (Acetaminophen)',
  'Ibuprofen',
  'Diclofenac',
  'Aspirin',
  'Naproxen',
  'Piroxicam',
  'Meloxicam',
  'Celecoxib',
  'Tramadol',
  'Codeine',
  'Pentazocine',
  'Ketoprofen',
  'Mefenamic Acid (Ponstan)',
  'Indomethacin',
  'Ketorolac',

  // ── Antihistamines / Anti-allergy ──
  'Cetirizine',
  'Loratadine',
  'Chlorpheniramine (Piriton)',
  'Fexofenadine',
  'Promethazine',
  'Diphenhydramine',
  'Hydroxyzine',
  'Desloratadine',
  'Prednisolone',
  'Dexamethasone',
  'Hydrocortisone',
  'Betamethasone',

  // ── Respiratory ──
  'Salbutamol (Ventolin)',
  'Aminophylline',
  'Theophylline',
  'Montelukast',
  'Fluticasone Inhaler',
  'Beclomethasone Inhaler',
  'Bromhexine',
  'Carbocisteine',
  'Guaifenesin',
  'Dextromethorphan',
  'Pseudoephedrine',

  // ── GI / Antacids ──
  'Omeprazole',
  'Pantoprazole',
  'Esomeprazole',
  'Ranitidine',
  'Cimetidine',
  'Antacid (Aluminium/Magnesium)',
  'Domperidone',
  'Metoclopramide',
  'Loperamide (Imodium)',
  'Oral Rehydration Salts (ORS)',
  'Zinc Tablets',
  'Hyoscine Butylbromide (Buscopan)',
  'Bisacodyl',
  'Lactulose',
  'Magnesium Trisilicate',
  'Activated Charcoal',
  'Misoprostol',

  // ── Antifungals ──
  'Fluconazole',
  'Clotrimazole',
  'Ketoconazole',
  'Miconazole',
  'Nystatin',
  'Terbinafine',
  'Griseofulvin',
  'Itraconazole',

  // ── Antivirals ──
  'Acyclovir',
  'Valacyclovir',
  'Oseltamivir (Tamiflu)',

  // ── Antihelminthics / Antiparasitics ──
  'Albendazole',
  'Mebendazole',
  'Ivermectin',
  'Praziquantel',
  'Levamisole',
  'Niclosamide',
  'Permethrin Cream',
  'Benzyl Benzoate Lotion',

  // ── Cardiovascular ──
  'Amlodipine',
  'Lisinopril',
  'Enalapril',
  'Losartan',
  'Atenolol',
  'Propranolol',
  'Nifedipine',
  'Hydrochlorothiazide',
  'Furosemide (Lasix)',
  'Spironolactone',
  'Methyldopa',
  'Digoxin',
  'Simvastatin',
  'Atorvastatin',
  'Clopidogrel',
  'Warfarin',
  'Heparin',

  // ── Diabetes ──
  'Metformin',
  'Glibenclamide',
  'Glimepiride',
  'Insulin (Regular)',
  'Insulin (NPH)',
  'Insulin (Premixed 70/30)',
  'Pioglitazone',

  // ── CNS / Psychiatric ──
  'Diazepam',
  'Lorazepam',
  'Carbamazepine',
  'Phenytoin',
  'Sodium Valproate',
  'Phenobarbital',
  'Amitriptyline',
  'Fluoxetine',
  'Sertraline',
  'Haloperidol',
  'Chlorpromazine',
  'Risperidone',
  'Alprazolam',

  // ── Vitamins & Supplements ──
  'Vitamin C (Ascorbic Acid)',
  'Vitamin B Complex',
  'Folic Acid',
  'Ferrous Sulphate (Iron)',
  'Vitamin D3',
  'Calcium + Vitamin D',
  'Multivitamin',
  'Vitamin A',
  'Vitamin E',
  'Vitamin B12',
  'Zinc Supplement',

  // ── Topical / Dermatology ──
  'Calamine Lotion',
  'Hydrocortisone Cream',
  'Betamethasone Cream',
  'Gentamicin Cream',
  'Fusidic Acid Cream',
  'Silver Sulfadiazine Cream',
  'Benzoyl Peroxide Gel',
  'Salicylic Acid',
  'Whitfield Ointment',
  'Crotamiton Cream',
  'Mupirocin Ointment',
  'Clotrimazole Cream',
  'Ketoconazole Cream',

  // ── Eye / Ear ──
  'Chloramphenicol Eye Drops',
  'Ciprofloxacin Eye Drops',
  'Gentamicin Eye Drops',
  'Artificial Tears (Hypromellose)',
  'Prednisolone Eye Drops',
  'Ofloxacin Ear Drops',
  'Neomycin-Polymyxin Ear Drops',

  // ── Gynecological / Contraceptive ──
  'Norethisterone',
  'Tranexamic Acid',
  'Combined Oral Contraceptive',
  'Levonorgestrel (Emergency)',
  'Clomiphene',
  'Misoprostol',
  'Ergometrine',

  // ── Muscle Relaxants ──
  'Orphenadrine',
  'Methocarbamol (Robaxin)',
  'Tizanidine',
  'Baclofen',

  // ── Anti-emetics ──
  'Ondansetron',
  'Prochlorperazine',
  'Cyclizine',
  'Dimenhydrinate (Dramamine)',

  // ── Emergency / Resuscitation ──
  'Epinephrine (Adrenaline)',
  'Atropine',
  'Naloxone',
  'Glucose 50% IV',
  'Normal Saline IV',
  'Ringer Lactate IV',
  'Dextrose 5% IV',

  // ── Others commonly used ──
  'Cough Syrup (Benylin)',
  'Menthol Rub (Robb)',
  'Vaseline (Petroleum Jelly)',
  'Povidone Iodine (Betadine)',
  'Hydrogen Peroxide',
  'Chlorhexidine',
  'Diphenhydramine Cough Syrup',
  'Magnesium Sulphate',
  'Adrenaline Auto-injector',
]

// Pre-sorted and deduplicated
export const COMMON_DRUGS = [...new Set(DRUG_LIST)].sort((a, b) =>
  a.toLowerCase().localeCompare(b.toLowerCase())
)

/**
 * Search drugs — matches start of word or brand name in parentheses.
 * Returns top 8 matches.
 */
export function searchDrugs(query) {
  if (!query || query.length < 2) return []
  const q = query.toLowerCase()
  return COMMON_DRUGS
    .filter(drug => {
      const lower = drug.toLowerCase()
      // Match start of drug name
      if (lower.startsWith(q)) return true
      // Match start of any word
      if (lower.split(/[\s\-\/\(]+/).some(w => w.startsWith(q))) return true
      // Match inside parentheses (brand names)
      const paren = lower.match(/\(([^)]+)\)/)
      if (paren && paren[1].startsWith(q)) return true
      // Fuzzy: contains
      return lower.includes(q)
    })
    .slice(0, 8)
}
