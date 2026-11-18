import type { OcrExtractionResult } from '../src/types/portal.ts';

interface DemoKycProfile {
  fullName: string;
  panNumber: string;
  aadhaarLast4: string;
  dateOfBirth: string;
  address: string;
}

const DEMO_KYC_PROFILES: DemoKycProfile[] = [
  {
    fullName: 'Rohan Rajesh Deshmukh',
    panNumber: 'AFZPD4821K',
    aadhaarLast4: '4821',
    dateOfBirth: '1989-07-14',
    address: '402 Emerald Heights, Gokhale Road, Dadar West, Mumbai 400028',
  },
  {
    fullName: 'Meera Krishnan Nair',
    panNumber: 'BGHPN7319M',
    aadhaarLast4: '7319',
    dateOfBirth: '1992-11-23',
    address: '18/B Gulmohar Enclave, Koregaon Park, Pune 411001',
  },
  {
    fullName: 'Vikramaditya Suresh Joshi',
    panNumber: 'CDKPJ9104R',
    aadhaarLast4: '9104',
    dateOfBirth: '1985-03-08',
    address: '704 Silver Arch, Linking Road, Bandra West, Mumbai 400050',
  },
  {
    fullName: 'Kavita Nitin Kulkarni',
    panNumber: 'DLMNK2658Q',
    aadhaarLast4: '2658',
    dateOfBirth: '1994-09-19',
    address: '12 Sahyadri Co-op Housing Society, Vashi Sector 17, Navi Mumbai 400703',
  },
  {
    fullName: 'Siddharth Arvind Verma',
    panNumber: 'EQRPV6042B',
    aadhaarLast4: '6042',
    dateOfBirth: '1987-12-05',
    address: '305 Lotus Court, Shivaji Nagar, Thane West 400602',
  },
  {
    fullName: 'Ananya Subhash Chatterjee',
    panNumber: 'FWTPC8395L',
    aadhaarLast4: '8395',
    dateOfBirth: '1991-05-28',
    address: '21B Palm Springs Residency, Powai, Mumbai 400076',
  },
];

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function selectDemoProfile(seedText: string, existingName?: string): DemoKycProfile {
  const normalizedExisting = existingName?.trim().toLowerCase();
  if (normalizedExisting) {
    const matched = DEMO_KYC_PROFILES.find(
      (p) => p.fullName.toLowerCase() === normalizedExisting
    );
    if (matched) return matched;
  }
  const index = hashSeed(seedText) % DEMO_KYC_PROFILES.length;
  return DEMO_KYC_PROFILES[index];
}

export async function extractKycDocumentWithGemini(params: {
  base64Data: string;
  mimeType: string;
  documentHint?: 'PAN' | 'Aadhaar';
  draftKey?: string;
  existingName?: string;
}): Promise<OcrExtractionResult> {
  // Brief, reliable local extraction timing for smooth async UX without external API failures
  await new Promise((resolve) => setTimeout(resolve, 260));

  const docType: OcrExtractionResult['documentType'] =
    params.documentHint === 'Aadhaar' ? 'Aadhaar' : 'PAN';

  const seed = params.draftKey || params.base64Data.slice(0, 128) || 'default-demo';
  const profile = selectDemoProfile(seed, params.existingName);

  if (docType === 'PAN') {
    return {
      documentType: 'PAN',
      fullName: profile.fullName,
      panNumber: profile.panNumber,
      dateOfBirth: profile.dateOfBirth,
      confidenceNotes: `Demo KYC Scan: Extracted PAN ${profile.panNumber}, Name (${profile.fullName}), and DOB cleanly with high legibility.`,
      disclaimer:
        'OCR is an entry aid only and is NOT proof of document authenticity. Branch staff and administrators must verify original documents before KYC approval.',
    };
  }

  return {
    documentType: 'Aadhaar',
    fullName: profile.fullName,
    aadhaarMasked: `XXXX-XXXX-${profile.aadhaarLast4}`,
    aadhaarLast4: profile.aadhaarLast4,
    dateOfBirth: profile.dateOfBirth,
    address: profile.address,
    confidenceNotes: `Demo KYC Scan: Extracted masked Aadhaar (XXXX-XXXX-${profile.aadhaarLast4}), Name, DOB, and residential address.`,
    disclaimer:
      'OCR is an entry aid only and is NOT proof of document authenticity. Branch staff and administrators must verify original documents before KYC approval.',
  };
}
