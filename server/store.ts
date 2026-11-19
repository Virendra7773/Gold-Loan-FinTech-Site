import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  AuditLogEntry,
  BranchWalletSummary,
  GoldLoanApplication,
  KycDocumentAttachment,
  LendingPolicy,
  PurityGrade,
  RepaymentReceipt,
  StaffRole,
  StaffUser,
} from '../src/types/portal.ts';
import {
  DEFAULT_LENDING_POLICY,
  calculateLoanOffer,
  maskAccountNumber,
  maskPanForAuditor,
} from '../src/utils/loanMath.ts';
import {
  computeAuditIntegrityHash,
  decryptSensitiveField,
  encryptSensitiveField,
  hashOneWay,
} from './crypto.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'portal-store.json');
const OPENING_BRANCH_CAPITAL = 5000000;

export const STAFF_DIRECTORY: StaffUser[] = [
  {
    id: 'staff-01',
    name: 'Priya Sharma',
    role: 'BRANCH_STAFF',
    designation: 'Senior Relationship Officer',
    employeeCode: 'AV-MUM-104',
    branchCode: 'MUM-04',
    branchName: 'Mumbai — Bandra West Branch',
    demoCredentials: {
      loginId: 'priya.staff@aurelia.in',
      password: 'Staff@2026',
    },
  },
  {
    id: 'appraiser-01',
    name: 'Rajesh Kulkarni',
    role: 'APPRAISER',
    designation: 'Certified Bullion Appraiser',
    employeeCode: 'AV-APP-208',
    branchCode: 'MUM-04',
    branchName: 'Mumbai — Bandra West Branch',
    demoCredentials: {
      loginId: 'rajesh.appraiser@aurelia.in',
      password: 'Assay@2026',
    },
  },
  {
    id: 'admin-01',
    name: 'Vikramaditya Nair',
    role: 'BRANCH_ADMIN',
    designation: 'Branch Operations Manager',
    employeeCode: 'AV-ADM-019',
    branchCode: 'MUM-04',
    branchName: 'Mumbai — Bandra West Branch',
    demoCredentials: {
      loginId: 'vikram.admin@aurelia.in',
      password: 'Admin@2026',
    },
  },
  {
    id: 'auditor-01',
    name: 'Meera Deshmukh',
    role: 'AUDITOR',
    designation: 'Internal Compliance & Vault Auditor',
    employeeCode: 'AV-AUD-007',
    branchCode: 'HQ-AUDIT',
    branchName: 'Central Risk & Audit Cell',
    demoCredentials: {
      loginId: 'meera.auditor@aurelia.in',
      password: 'Audit@2026',
    },
  },
  {
    id: 'customer-01',
    name: 'Ananya Deshpande',
    role: 'CUSTOMER',
    designation: 'Borrower Self-Service Portal',
    employeeCode: 'CUST-MUM-0841',
    branchCode: 'MUM-04',
    branchName: 'Mumbai — Bandra West Branch',
    phone: '+91 98204 71209',
    linkedCustomerName: 'Ananya Deshpande',
    demoCredentials: {
      loginId: 'ananya.customer@aurelia.in',
      password: 'Loan@2026',
    },
  },
];

export function getAllStaffUsers(db?: PersistedDatabase): StaffUser[] {
  const activeDb = db ?? loadDatabase();
  const customUsers = Array.isArray(activeDb.registeredUsers) ? activeDb.registeredUsers : [];
  return [...STAFF_DIRECTORY, ...customUsers];
}

export function authenticateRoleSwitch(
  staffId: string | undefined,
  loginId: string,
  password: string
): StaffUser {
  const allUsers = getAllStaffUsers();
  const normalizedInputId = loginId.trim().toLowerCase();

  const user = staffId
    ? allUsers.find((s) => s.id === staffId)
    : allUsers.find(
        (s) =>
          s.demoCredentials?.loginId.toLowerCase() === normalizedInputId ||
          s.employeeCode.toLowerCase() === normalizedInputId
      );

  if (!user || !user.demoCredentials) {
    throw new Error('No account found matching this Login ID.');
  }

  const validIds = [
    user.demoCredentials.loginId.toLowerCase(),
    user.employeeCode.toLowerCase(),
  ];
  if (!validIds.includes(normalizedInputId) || password !== user.demoCredentials.password) {
    throw new Error('Invalid Login ID or password.');
  }
  return user;
}

export function registerCustomerAccount(params: {
  fullName: string;
  phone: string;
  loginId: string;
  password: string;
}): { user: StaffUser; staffDirectory: StaffUser[]; auditEntry: AuditLogEntry } {
  const db = loadDatabase();
  if (!Array.isArray(db.registeredUsers)) {
    db.registeredUsers = [];
  }

  const normalizedLogin = params.loginId.trim().toLowerCase();
  const allUsers = [...STAFF_DIRECTORY, ...db.registeredUsers];
  const exists = allUsers.some(
    (u) =>
      u.demoCredentials?.loginId.toLowerCase() === normalizedLogin ||
      u.employeeCode.toLowerCase() === normalizedLogin
  );
  if (exists) {
    throw new Error('An account with this Login ID / Email already exists.');
  }

  const seq = 900 + db.registeredUsers.length + 1;
  const newUser: StaffUser = {
    id: `customer-reg-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    name: params.fullName.trim(),
    role: 'CUSTOMER',
    designation: 'Borrower Self-Service Portal',
    employeeCode: `CUST-MUM-${seq}`,
    branchCode: 'MUM-04',
    branchName: 'Mumbai — Bandra West Branch',
    phone: params.phone.trim(),
    linkedCustomerName: params.fullName.trim(),
    demoCredentials: {
      loginId: params.loginId.trim(),
      password: params.password,
    },
  };

  db.registeredUsers.push(newUser);
  const auditEntry = makeAudit({
    applicationId: 'ROLE-AUTH',
    applicationNumber: newUser.employeeCode,
    timestamp: new Date().toISOString(),
    actor: newUser,
    action: 'New Customer Account Registered',
    details: `Borrower ${newUser.name} (${newUser.demoCredentials?.loginId}, Phone ${params.phone.trim()}) created a self-service portal account.`,
  });
  db.auditLogs.unshift(auditEntry);
  saveDatabase(db);

  return {
    user: newUser,
    staffDirectory: [...STAFF_DIRECTORY, ...db.registeredUsers],
    auditEntry,
  };
}

interface StoredApplicationRecord {
  application: GoldLoanApplication;
  encryptedPan: string;
  encryptedAccountNumber: string;
  aadhaarVerificationHash: string;
}

interface PersistedDatabase {
  policy: LendingPolicy;
  applications: StoredApplicationRecord[];
  auditLogs: AuditLogEntry[];
  registeredUsers?: StaffUser[];
}

function makeSampleDocSvg(params: {
  title: string;
  headerBg: string;
  accent: string;
  lines: string[];
  footer: string;
}): string {
  const lineNodes = params.lines
    .map(
      (line, idx) =>
        `<text x="24" y="${96 + idx * 24}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="13" fill="#0f172a">${line
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')}</text>`
    )
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="290" viewBox="0 0 520 290">
    <rect width="520" height="290" rx="10" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
    <rect x="0" y="0" width="520" height="54" rx="10" fill="${params.headerBg}"/>
    <rect x="0" y="40" width="520" height="14" fill="${params.headerBg}"/>
    <text x="24" y="33" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="700" fill="#ffffff">${params.title}</text>
    <rect x="372" y="15" width="128" height="24" rx="4" fill="${params.accent}"/>
    <text x="436" y="31" font-family="system-ui, sans-serif" font-size="10" font-weight="700" fill="#ffffff" text-anchor="middle">INTAKE RECORD</text>
    ${lineNodes}
    <rect x="24" y="230" width="472" height="38" rx="6" fill="#f8fafc" stroke="#e2e8f0"/>
    <text x="36" y="253" font-family="system-ui, sans-serif" font-size="11" fill="#475569">${params.footer}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const SAMPLE_CUSTOMER_SIG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="88" viewBox="0 0 320 88"><rect width="320" height="88" fill="#ffffff"/><path d="M26 56 C44 22, 62 66, 84 42 C102 22, 114 62, 140 44 C162 28, 186 58, 214 40 C236 26, 260 52, 294 38" fill="none" stroke="#0f172a" stroke-width="2.4" stroke-linecap="round"/><text x="160" y="76" font-family="Georgia, serif" font-style="italic" font-size="11" fill="#475569" text-anchor="middle">Ananya Deshpande</text></svg>'
  );

const SAMPLE_ADMIN_SIG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="88" viewBox="0 0 320 88"><rect width="320" height="88" fill="#ffffff"/><path d="M24 38 L52 60 L82 24 C98 48, 122 54, 146 36 C168 20, 182 58, 212 42 C238 28, 258 48, 292 34" fill="none" stroke="#0f172a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><text x="160" y="76" font-family="Georgia, serif" font-style="italic" font-size="11" fill="#475569" text-anchor="middle">Vikramaditya Nair · Branch Admin</text></svg>'
  );

function getSeededDocPreview(appId: string, doc: KycDocumentAttachment): { previewDataUrl: string; mimeType: string } {
  if (appId === 'GL-2026-0841') {
    if (doc.docCategory === 'PAN') {
      return {
        mimeType: 'image/svg+xml',
        previewDataUrl: makeSampleDocSvg({
          title: 'INCOME TAX DEPARTMENT · PAN CARD SCAN',
          headerBg: '#0f172a',
          accent: '#b45309',
          lines: [
            'Name       : ANANYA DESHPANDE',
            'PAN Number : BHAPD4821K',
            'DOB        : 14/04/1988',
            'Status     : Individual · Physical Original Sighted',
          ],
          footer: 'Uploaded at branch intake · Verified against physical PAN card',
        }),
      };
    }
    return {
      mimeType: 'image/svg+xml',
      previewDataUrl: makeSampleDocSvg({
        title: 'AADHAAR CARD (AUTO-MASKED COPY)',
        headerBg: '#1e293b',
        accent: '#047857',
        lines: [
          'Name       : Ananya Deshpande',
          'Aadhaar    : XXXX-XXXX-7392 (Last 4 digits retained)',
          'Address    : 402 Sea Breeze Apts, Bandra West, Mumbai',
          'Consent    : Customer e-KYC & storage consent captured',
        ],
        footer: 'Full 12-digit Aadhaar redacted per regulatory data safeguards',
      }),
    };
  }

  if (appId === 'GL-2026-0842') {
    if (doc.docCategory === 'PAN') {
      return {
        mimeType: 'image/svg+xml',
        previewDataUrl: makeSampleDocSvg({
          title: 'INCOME TAX DEPARTMENT · PAN CARD SCAN',
          headerBg: '#0f172a',
          accent: '#b45309',
          lines: [
            'Name       : ROHAN MALHOTRA',
            'PAN Number : CRMPM7712R',
            'DOB        : 22/09/1991',
            'Status     : Individual · Verified',
          ],
          footer: 'OCR entry-aid match · Physical original sighted by Branch Admin',
        }),
      };
    }
    return {
      mimeType: 'image/svg+xml',
      previewDataUrl: makeSampleDocSvg({
        title: 'AADHAAR CARD (AUTO-MASKED COPY)',
        headerBg: '#1e293b',
        accent: '#047857',
        lines: [
          'Name       : Rohan Malhotra',
          'Aadhaar    : XXXX-XXXX-2048',
          'Address    : 14B Pali Hill Residency, Bandra West, Mumbai',
          'Match      : Name & address match intake form',
        ],
        footer: 'Masked copy retained for branch compliance file',
      }),
    };
  }

  if (appId === 'GL-2026-0843') {
    return {
      mimeType: 'image/svg+xml',
      previewDataUrl: makeSampleDocSvg({
        title: 'INCOME TAX DEPARTMENT · PAN CARD SCAN',
        headerBg: '#0f172a',
        accent: '#b45309',
        lines: [
          'Name       : SIDDHARTH JOSHI',
          'PAN Number : ABCPJ6190M',
          'DOB        : 03/11/1985',
          'Aadhaar    : XXXX-XXXX-5518 (Masked)',
        ],
        footer: 'Uploaded during intake · KYC approved by Branch Admin',
      }),
    };
  }

  // GL-2026-0844 (Kavita Iyer — Pending KYC Review)
  if (doc.docCategory === 'PAN') {
    return {
      mimeType: 'image/svg+xml',
      previewDataUrl: makeSampleDocSvg({
        title: 'INCOME TAX DEPARTMENT · PAN CARD SCAN',
        headerBg: '#0f172a',
        accent: '#d97706',
        lines: [
          'Name       : KAVITA IYER',
          'PAN Number : AAAPI3042N',
          'DOB        : 28/06/1979',
          'OCR Note   : Name & PAN extracted via OCR · Awaiting Admin Check',
        ],
        footer: 'Pending Branch Administrator physical verification & decision',
      }),
    };
  }
  return {
    mimeType: 'image/svg+xml',
    previewDataUrl: makeSampleDocSvg({
      title: 'ADDRESS PROOF · ELECTRICITY UTILITY BILL',
      headerBg: '#334155',
      accent: '#d97706',
      lines: [
        'Consumer   : KAVITA IYER',
        'Address    : 22 Carter Road CHS, Khar West, Mumbai 400052',
        'Bill Cycle : Oct 2026 · Tata Power Mumbai',
        'Status     : Attached at customer intake for KYC verification',
      ],
      footer: 'Pending Branch Administrator review · Original bill sighted at desk',
    }),
  };
}

function buildSeededApp1Repayments(offer: NonNullable<GoldLoanApplication['loanOffer']>): RepaymentReceipt[] {
  const calc = calculateLoanOffer({
    totalAppraisedValue: 412671,
    requestedAmount: offer.requestedAmount,
    sanctionedAmount: offer.sanctionedAmount,
    tenureMonths: offer.tenureMonths,
    repaymentScheme: offer.repaymentScheme,
    policy: DEFAULT_LENDING_POLICY,
  });
  const first = calc.schedule[0];
  const second = calc.schedule[1];
  const todayIso = new Date().toISOString();
  const yesterdayDate = new Date(Date.now() - 86400000).toISOString();

  return [
    {
      id: 'rcpt-0841-1',
      receiptNumber: 'RCPT-0841-01',
      installmentNumber: 1,
      paidAt: yesterdayDate,
      principalPaid: first.principalComponent,
      interestPaid: first.interestComponent,
      totalPaid: first.totalPayment,
      paymentMode: 'UPI',
      transactionRef: 'UPI632089114201',
      collectedByName: 'Priya Sharma',
    },
    {
      id: 'rcpt-0841-2',
      receiptNumber: 'RCPT-0841-02',
      installmentNumber: 2,
      paidAt: todayIso,
      principalPaid: second.principalComponent,
      interestPaid: second.interestComponent,
      totalPaid: second.totalPayment,
      paymentMode: 'Auto-Debit',
      transactionRef: 'NACH202611170841',
      collectedByName: 'Vikramaditya Nair',
    },
  ];
}

function makeAudit(params: {
  applicationId: string;
  applicationNumber: string;
  timestamp: string;
  actor: StaffUser;
  action: string;
  details: string;
  previousStatus?: GoldLoanApplication['status'];
  newStatus?: GoldLoanApplication['status'];
}): AuditLogEntry {
  const id = `AUD-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const integrityHash = computeAuditIntegrityHash({
    id,
    applicationId: params.applicationId,
    timestamp: params.timestamp,
    actorId: params.actor.id,
    action: params.action,
    details: params.details,
  });
  return {
    id,
    applicationId: params.applicationId,
    applicationNumber: params.applicationNumber,
    timestamp: params.timestamp,
    actorId: params.actor.id,
    actorName: params.actor.name,
    actorRole: params.actor.role,
    action: params.action,
    details: params.details,
    previousStatus: params.previousStatus,
    newStatus: params.newStatus,
    integrityHash,
  };
}

function buildSeedDatabase(): PersistedDatabase {
  const staff = STAFF_DIRECTORY[0];
  const appraiser = STAFF_DIRECTORY[1];
  const admin = STAFF_DIRECTORY[2];

  const t1 = '2026-11-15T09:20:00.000Z';
  const t2 = '2026-11-15T10:05:00.000Z';
  const t3 = '2026-11-15T11:30:00.000Z';
  const t4 = '2026-11-16T08:45:00.000Z';
  const t5 = new Date().toISOString();
  const t6 = new Date().toISOString();

  // Application 1: Disbursed (full lifecycle completed + 2 paid EMIs, 1 collected today)
  const offer1 = calculateLoanOffer({
    totalAppraisedValue: 412671,
    requestedAmount: 280000,
    sanctionedAmount: 280000,
    tenureMonths: 12,
    repaymentScheme: 'Monthly EMI',
    policy: DEFAULT_LENDING_POLICY,
  }).terms;

  const doc1a: KycDocumentAttachment = {
    id: 'doc-1a',
    docCategory: 'PAN',
    fileName: 'ananya_pan_scan.jpg',
    ocrAssisted: true,
    ocrExtractedSummary: 'Name: Ananya Deshpande · PAN: BHAPD4821K · DOB: 1988-04-14',
    uploadedAt: t1,
  };
  const doc1b: KycDocumentAttachment = {
    id: 'doc-1b',
    docCategory: 'Aadhaar Front',
    fileName: 'ananya_aadhaar_masked.jpg',
    ocrAssisted: true,
    ocrExtractedSummary: 'Masked Aadhaar: XXXX-XXXX-7392 · Bandra West, Mumbai',
    uploadedAt: t1,
  };

  const app1: GoldLoanApplication = {
    id: 'GL-2026-0841',
    applicationNumber: 'AVGL-MUM04-0841',
    branchCode: 'MUM-04',
    branchName: 'Mumbai — Bandra West Branch',
    status: 'Disbursed',
    createdAt: t1,
    updatedAt: t5,
    createdById: staff.id,
    createdByName: staff.name,
    customer: {
      fullName: 'Ananya Deshpande',
      phone: '+91 98204 51923',
      dateOfBirth: '1988-04-14',
      address: '402 Sea Breeze Apartments, Chapel Road, Bandra West, Mumbai 400050',
      panNumber: 'BHAPD4821K',
      aadhaarMasked: 'XXXX-XXXX-7392',
      aadhaarLast4: '7392',
      consentCaptured: true,
      consentTimestamp: t1,
      ocrDisclaimerAcknowledged: true,
    },
    kycDocuments: [
      { ...doc1a, ...getSeededDocPreview('GL-2026-0841', doc1a) },
      { ...doc1b, ...getSeededDocPreview('GL-2026-0841', doc1b) },
    ],
    kycDecision: 'Approved',
    kycReviewHistory: [
      {
        id: 'kyc-1',
        decision: 'Approved',
        remarks:
          'Original PAN and masked Aadhaar verified against physical presentation. Address matches electricity utility record.',
        reviewedById: admin.id,
        reviewedByName: admin.name,
        reviewedAt: t2,
      },
    ],
    goldItems: [
      {
        id: 'itm-101',
        itemType: 'Necklace',
        quantity: 1,
        customerDescription: 'Traditional 22K bridal temple choker necklace with small Kemp stone accents',
        livePhotoDataUrl: '/src/assets/images/ornament_gold_necklace_1794929672496.jpg',
        purchaseBillAvailable: true,
        purchaseBillRef: 'TBZ-MUM-2022-9104',
        grossWeightGrams: 42.6,
        stoneDetails: 'Red & green Kemp synthetic stones in central pendant',
        stoneDeductionGrams: 3.1,
        netWeightGrams: 39.5,
        purity: '22K',
        ratePerGram: 6855,
        appraisedValue: 270773,
        appraiserNotes: '916 BIS hallmark verified under 10x loupe. XRF scan avg 91.7%.',
      },
      {
        id: 'itm-102',
        itemType: 'Bangle',
        quantity: 2,
        customerDescription: 'Pair of solid 22K carved floral kada bangles',
        livePhotoDataUrl: '/src/assets/images/ornament_gold_bangles_1794929672762.jpg',
        purchaseBillAvailable: false,
        grossWeightGrams: 20.7,
        stoneDetails: 'No stones — solid metal',
        stoneDeductionGrams: 0,
        netWeightGrams: 20.7,
        purity: '22K',
        ratePerGram: 6855,
        appraisedValue: 141898,
        appraiserNotes: 'Clean acid test & ultrasonic density check passed.',
      },
    ],
    appraisalHistory: [
      {
        id: 'apr-1',
        appraisedAt: t3,
        appraiserId: appraiser.id,
        appraiserName: appraiser.name,
        totalGrossWeightGrams: 63.3,
        totalNetWeightGrams: 60.2,
        totalAppraisedValue: 412671,
        remarks: '2 items appraised using XRF + touchstone verification. Total net 22K weight 60.20g.',
        itemSnapshots: [
          {
            itemId: 'itm-101',
            itemType: 'Necklace',
            grossWeightGrams: 42.6,
            netWeightGrams: 39.5,
            purity: '22K',
            appraisedValue: 270773,
          },
          {
            itemId: 'itm-102',
            itemType: 'Bangle',
            grossWeightGrams: 20.7,
            netWeightGrams: 20.7,
            purity: '22K',
            appraisedValue: 141898,
          },
        ],
      },
    ],
    loanOffer: offer1,
    collateralStorage: {
      packageSealNumber: 'SEAL-MUM04-88412',
      vaultLocation: 'Vault A · Dual-Key Rack 02',
      storageBoxNumber: 'BOX-A2-14',
      handedOverById: appraiser.id,
      handedOverByName: appraiser.name,
      receivedById: admin.id,
      receivedByName: admin.name,
      handoverTimestamp: t4,
      custodyLog: [
        {
          id: 'cus-1',
          timestamp: t4,
          event: 'Sealed & Vaulted',
          actorName: admin.name,
          actorRole: 'BRANCH_ADMIN',
          notes:
            'Tamper-evident pouch SEAL-MUM04-88412 verified by dual custodians and placed in BOX-A2-14.',
        },
      ],
    },
    sanctionSigning: {
      sanctionLetterNumber: 'SL-2026-MUM04-0841',
      generatedAt: t4,
      customerSigned: true,
      customerSignatureDataUrl: SAMPLE_CUSTOMER_SIG,
      customerSignedAt: t4,
      branchRepSigned: true,
      branchRepId: admin.id,
      branchRepName: admin.name,
      branchRepSignatureDataUrl: SAMPLE_ADMIN_SIG,
      branchRepSignedAt: t4,
    },
    bankAccount: {
      accountHolderName: 'Ananya Deshpande',
      bankName: 'HDFC Bank Ltd.',
      ifscCode: 'HDFC0000142',
      accountNumberMasked: 'XXXX-XXXX-6619',
      accountNumberLast4: '6619',
      verificationStatus: 'Verified',
      verifiedAt: t5,
      verifiedByName: admin.name,
    },
    disbursement: {
      status: 'Disbursed',
      utrReference: 'HDFCR52026111700984122',
      disbursedAmount: offer1.netDisbursementAmount,
      disbursedAt: t5,
      disbursedById: admin.id,
      disbursedByName: admin.name,
      remarks: 'NEFT/RTGS credit confirmed to verified HDFC account ending 6619.',
    },
    repayments: buildSeededApp1Repayments(offer1),
    encryptionMetadata: {
      encryptedFields: ['panNumber', 'bankAccountNumber', 'aadhaarVerificationHash'],
      algorithm: 'AES-256-GCM',
      aadhaarStoredFull: false,
    },
  };

  // Application 2: Loan Offer Ready (awaiting customer confirmation & sanction signing)
  const offer2 = calculateLoanOffer({
    totalAppraisedValue: 185085,
    requestedAmount: 130000,
    sanctionedAmount: 130000,
    tenureMonths: 6,
    repaymentScheme: 'Bullet Maturity',
    policy: DEFAULT_LENDING_POLICY,
  }).terms;

  const doc2a: KycDocumentAttachment = {
    id: 'doc-2a',
    docCategory: 'PAN',
    fileName: 'rohan_pan.jpg',
    ocrAssisted: true,
    ocrExtractedSummary: 'Name: Rohan Malhotra · PAN: CRMPM7712R',
    uploadedAt: t3,
  };
  const doc2b: KycDocumentAttachment = {
    id: 'doc-2b',
    docCategory: 'Aadhaar Front',
    fileName: 'rohan_aadhaar_front.jpg',
    ocrAssisted: false,
    uploadedAt: t3,
  };

  const app2: GoldLoanApplication = {
    id: 'GL-2026-0842',
    applicationNumber: 'AVGL-MUM04-0842',
    branchCode: 'MUM-04',
    branchName: 'Mumbai — Bandra West Branch',
    status: 'Loan Offer Ready',
    createdAt: t3,
    updatedAt: t5,
    createdById: staff.id,
    createdByName: staff.name,
    customer: {
      fullName: 'Rohan Malhotra',
      phone: '+91 98192 33041',
      dateOfBirth: '1991-09-22',
      address: '14B Pali Hill Residency, Bandra West, Mumbai 400050',
      panNumber: 'CRMPM7712R',
      aadhaarMasked: 'XXXX-XXXX-2048',
      aadhaarLast4: '2048',
      consentCaptured: true,
      consentTimestamp: t3,
      ocrDisclaimerAcknowledged: true,
    },
    kycDocuments: [
      { ...doc2a, ...getSeededDocPreview('GL-2026-0842', doc2a) },
      { ...doc2b, ...getSeededDocPreview('GL-2026-0842', doc2b) },
    ],
    kycDecision: 'Approved',
    kycReviewHistory: [
      {
        id: 'kyc-2',
        decision: 'Approved',
        remarks: 'KYC documents verified in person.',
        reviewedById: admin.id,
        reviewedByName: admin.name,
        reviewedAt: t4,
      },
    ],
    goldItems: [
      {
        id: 'itm-201',
        itemType: 'Bangle',
        quantity: 2,
        customerDescription: 'Pair of 22K solid gold family heirloom bangles',
        livePhotoDataUrl: '/src/assets/images/ornament_gold_bangles_1794929672762.jpg',
        purchaseBillAvailable: true,
        purchaseBillRef: 'KALYAN-2020-3321',
        grossWeightGrams: 27.0,
        stoneDetails: 'None',
        stoneDeductionGrams: 0,
        netWeightGrams: 27.0,
        purity: '22K',
        ratePerGram: 6855,
        appraisedValue: 185085,
        appraiserNotes: '22K 916 verified. Uniform density.',
      },
    ],
    appraisalHistory: [
      {
        id: 'apr-2',
        appraisedAt: t5,
        appraiserId: appraiser.id,
        appraiserName: appraiser.name,
        totalGrossWeightGrams: 27.0,
        totalNetWeightGrams: 27.0,
        totalAppraisedValue: 185085,
        remarks: 'Completed primary bullion evaluation.',
        itemSnapshots: [
          {
            itemId: 'itm-201',
            itemType: 'Bangle',
            grossWeightGrams: 27.0,
            netWeightGrams: 27.0,
            purity: '22K',
            appraisedValue: 185085,
          },
        ],
      },
    ],
    loanOffer: offer2,
    bankAccount: {
      accountHolderName: 'Rohan Malhotra',
      bankName: 'ICICI Bank',
      ifscCode: 'ICIC0000391',
      accountNumberMasked: 'XXXX-XXXX-8114',
      accountNumberLast4: '8114',
      verificationStatus: 'Unverified',
    },
    disbursement: {
      status: 'Not Initiated',
    },
    repayments: [],
    encryptionMetadata: {
      encryptedFields: ['panNumber', 'bankAccountNumber', 'aadhaarVerificationHash'],
      algorithm: 'AES-256-GCM',
      aadhaarStoredFull: false,
    },
  };

  // Application 3: Appraisal Pending (KYC Approved, ready for Appraiser)
  const doc3a: KycDocumentAttachment = {
    id: 'doc-3a',
    docCategory: 'PAN',
    fileName: 'siddharth_pan.jpg',
    ocrAssisted: true,
    ocrExtractedSummary: 'Name: Siddharth Joshi · PAN: ABCPJ6190M',
    uploadedAt: t5,
  };

  const app3: GoldLoanApplication = {
    id: 'GL-2026-0843',
    applicationNumber: 'AVGL-MUM04-0843',
    branchCode: 'MUM-04',
    branchName: 'Mumbai — Bandra West Branch',
    status: 'Appraisal Pending',
    createdAt: t5,
    updatedAt: t6,
    createdById: staff.id,
    createdByName: staff.name,
    customer: {
      fullName: 'Siddharth Joshi',
      phone: '+91 98210 74512',
      dateOfBirth: '1985-11-03',
      address: '901 Silver Arch, Hill Road, Bandra West, Mumbai 400050',
      panNumber: 'ABCPJ6190M',
      aadhaarMasked: 'XXXX-XXXX-5518',
      aadhaarLast4: '5518',
      consentCaptured: true,
      consentTimestamp: t5,
      ocrDisclaimerAcknowledged: true,
    },
    kycDocuments: [{ ...doc3a, ...getSeededDocPreview('GL-2026-0843', doc3a) }],
    kycDecision: 'Approved',
    kycReviewHistory: [
      {
        id: 'kyc-3',
        decision: 'Approved',
        remarks: 'KYC verified; routed to bullion appraisal desk.',
        reviewedById: admin.id,
        reviewedByName: admin.name,
        reviewedAt: t6,
      },
    ],
    goldItems: [
      {
        id: 'itm-301',
        itemType: 'Ring',
        quantity: 1,
        customerDescription: 'Heavy 22K men’s signet ring with 916 hallmark inside band',
        livePhotoDataUrl: '/src/assets/images/ornament_gold_ring_1794929675362.jpg',
        purchaseBillAvailable: false,
      },
      {
        id: 'itm-302',
        itemType: 'Necklace',
        quantity: 1,
        customerDescription: 'Traditional gold necklace brought for short-term working capital pledge',
        livePhotoDataUrl: '/src/assets/images/ornament_gold_necklace_1794929672496.jpg',
        purchaseBillAvailable: true,
        purchaseBillRef: 'PN-GADGIL-2023-114',
      },
    ],
    appraisalHistory: [],
    bankAccount: {
      accountHolderName: 'Siddharth Joshi',
      bankName: 'State Bank of India',
      ifscCode: 'SBIN0001824',
      accountNumberMasked: 'XXXX-XXXX-3902',
      accountNumberLast4: '3902',
      verificationStatus: 'Unverified',
    },
    disbursement: {
      status: 'Not Initiated',
    },
    repayments: [],
    encryptionMetadata: {
      encryptedFields: ['panNumber', 'bankAccountNumber', 'aadhaarVerificationHash'],
      algorithm: 'AES-256-GCM',
      aadhaarStoredFull: false,
    },
  };

  // Application 4: KYC Pending (awaiting Branch Admin KYC decision)
  const doc4a: KycDocumentAttachment = {
    id: 'doc-4a',
    docCategory: 'PAN',
    fileName: 'kavita_pan_ocr.jpg',
    ocrAssisted: true,
    ocrExtractedSummary: 'Name: Kavita Iyer · PAN: AAAPI3042N',
    uploadedAt: t6,
  };
  const doc4b: KycDocumentAttachment = {
    id: 'doc-4b',
    docCategory: 'Address Proof',
    fileName: 'kavita_utility_bill.jpg',
    ocrAssisted: false,
    uploadedAt: t6,
  };

  const app4: GoldLoanApplication = {
    id: 'GL-2026-0844',
    applicationNumber: 'AVGL-MUM04-0844',
    branchCode: 'MUM-04',
    branchName: 'Mumbai — Bandra West Branch',
    status: 'KYC Pending',
    createdAt: t6,
    updatedAt: t6,
    createdById: staff.id,
    createdByName: staff.name,
    customer: {
      fullName: 'Kavita Iyer',
      phone: '+91 97691 88402',
      dateOfBirth: '1979-06-28',
      address: '22 Carter Road CHS, Khar West, Mumbai 400052',
      panNumber: 'AAAPI3042N',
      aadhaarMasked: 'XXXX-XXXX-9104',
      aadhaarLast4: '9104',
      consentCaptured: true,
      consentTimestamp: t6,
      ocrDisclaimerAcknowledged: true,
    },
    kycDocuments: [
      { ...doc4a, ...getSeededDocPreview('GL-2026-0844', doc4a) },
      { ...doc4b, ...getSeededDocPreview('GL-2026-0844', doc4b) },
    ],
    kycDecision: 'Pending',
    kycReviewHistory: [],
    goldItems: [
      {
        id: 'itm-401',
        itemType: 'Ring',
        quantity: 1,
        customerDescription: '22K solid gold signet ring',
        livePhotoDataUrl: '/src/assets/images/ornament_gold_ring_1794929675362.jpg',
        purchaseBillAvailable: true,
        purchaseBillRef: 'TANISHQ-2021-4091',
      },
    ],
    appraisalHistory: [],
    bankAccount: {
      accountHolderName: 'Kavita Iyer',
      bankName: 'Axis Bank',
      ifscCode: 'UTIB0000112',
      accountNumberMasked: 'XXXX-XXXX-1287',
      accountNumberLast4: '1287',
      verificationStatus: 'Unverified',
    },
    disbursement: {
      status: 'Not Initiated',
    },
    repayments: [],
    encryptionMetadata: {
      encryptedFields: ['panNumber', 'bankAccountNumber', 'aadhaarVerificationHash'],
      algorithm: 'AES-256-GCM',
      aadhaarStoredFull: false,
    },
  };

  const storedApps: StoredApplicationRecord[] = [
    {
      application: app1,
      encryptedPan: encryptSensitiveField('BHAPD4821K'),
      encryptedAccountNumber: encryptSensitiveField('50100293846619'),
      aadhaarVerificationHash: hashOneWay('998811227392'),
    },
    {
      application: app2,
      encryptedPan: encryptSensitiveField('CRMPM7712R'),
      encryptedAccountNumber: encryptSensitiveField('039101508114'),
      aadhaarVerificationHash: hashOneWay('774455662048'),
    },
    {
      application: app3,
      encryptedPan: encryptSensitiveField('ABCPJ6190M'),
      encryptedAccountNumber: encryptSensitiveField('301982733902'),
      aadhaarVerificationHash: hashOneWay('663322115518'),
    },
    {
      application: app4,
      encryptedPan: encryptSensitiveField('AAAPI3042N'),
      encryptedAccountNumber: encryptSensitiveField('9180100441287'),
      aadhaarVerificationHash: hashOneWay('441188999104'),
    },
  ];

  const auditLogs: AuditLogEntry[] = [
    makeAudit({
      applicationId: app1.id,
      applicationNumber: app1.applicationNumber,
      timestamp: t1,
      actor: staff,
      action: 'Application Created & KYC Submitted',
      details: 'Customer intake completed with OCR assist and explicit consent recorded. Aadhaar masked on intake.',
      previousStatus: 'Draft',
      newStatus: 'KYC Pending',
    }),
    makeAudit({
      applicationId: app1.id,
      applicationNumber: app1.applicationNumber,
      timestamp: t2,
      actor: admin,
      action: 'KYC Decision: Approved',
      details: 'Branch Administrator verified original PAN and masked Aadhaar.',
      previousStatus: 'KYC Pending',
      newStatus: 'Appraisal Pending',
    }),
    makeAudit({
      applicationId: app1.id,
      applicationNumber: app1.applicationNumber,
      timestamp: t3,
      actor: appraiser,
      action: 'Gold Appraisal Completed',
      details: '2 ornaments appraised: Gross 63.30g, Net 60.20g (22K), Total Value ₹4,12,671.',
      previousStatus: 'Appraisal Pending',
      newStatus: 'Loan Offer Ready',
    }),
    makeAudit({
      applicationId: app1.id,
      applicationNumber: app1.applicationNumber,
      timestamp: t4,
      actor: admin,
      action: 'Collateral Sealed & Sanction Signed',
      details: 'Package sealed (SEAL-MUM04-88412) in Vault A / BOX-A2-14. Dual signatures captured.',
      previousStatus: 'Sanctioned',
      newStatus: 'Collateral Stored',
    }),
    makeAudit({
      applicationId: app1.id,
      applicationNumber: app1.applicationNumber,
      timestamp: t5,
      actor: admin,
      action: 'Loan Disbursed',
      details: `Disbursed ${offer1.netDisbursementAmount} INR via UTR HDFCR52026111700984122 to verified HDFC account ending 6619.`,
      previousStatus: 'Disbursement Pending',
      newStatus: 'Disbursed',
    }),
    makeAudit({
      applicationId: app2.id,
      applicationNumber: app2.applicationNumber,
      timestamp: t5,
      actor: appraiser,
      action: 'Gold Appraisal Completed',
      details: '2 bangles appraised: Net 27.00g (22K), Total Value ₹1,85,085. Eligible up to ₹1,38,813.',
      previousStatus: 'Appraisal Pending',
      newStatus: 'Loan Offer Ready',
    }),
    makeAudit({
      applicationId: app3.id,
      applicationNumber: app3.applicationNumber,
      timestamp: t6,
      actor: admin,
      action: 'KYC Decision: Approved',
      details: 'KYC approved and queued for bullion appraisal.',
      previousStatus: 'KYC Pending',
      newStatus: 'Appraisal Pending',
    }),
    makeAudit({
      applicationId: app4.id,
      applicationNumber: app4.applicationNumber,
      timestamp: t6,
      actor: staff,
      action: 'Submitted for KYC Review',
      details: 'Customer Kavita Iyer intake submitted with OCR-assisted PAN extraction and consent.',
      previousStatus: 'Draft',
      newStatus: 'KYC Pending',
    }),
  ];

  return {
    policy: DEFAULT_LENDING_POLICY,
    applications: storedApps,
    auditLogs,
  };
}

function loadDatabase(): PersistedDatabase {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const seed = buildSeedDatabase();
    fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2));
    return seed;
  }

  const raw = fs.readFileSync(DB_FILE, 'utf8');
  const parsed = JSON.parse(raw) as PersistedDatabase;
  let dirty = false;

  for (const record of parsed.applications) {
    const app = record.application;
    if (!Array.isArray(app.repayments)) {
      app.repayments = [];
      dirty = true;
    }

    // Hydrate seeded app1 signatures & initial repayments if absent on legacy disk file
    if (app.id === 'GL-2026-0841') {
      if (
        app.sanctionSigning &&
        app.sanctionSigning.customerSigned &&
        !app.sanctionSigning.customerSignatureDataUrl
      ) {
        app.sanctionSigning.customerSignatureDataUrl = SAMPLE_CUSTOMER_SIG;
        app.sanctionSigning.branchRepSignatureDataUrl = SAMPLE_ADMIN_SIG;
        dirty = true;
      }
      if (app.repayments.length === 0 && app.loanOffer) {
        app.repayments = buildSeededApp1Repayments(app.loanOffer);
        dirty = true;
      }
      if (app.disbursement.status === 'Disbursed' && app.disbursement.disbursedAt?.startsWith('2026-11-16')) {
        // Keep a realistic today disbursement or leave today's repayment active — today's repayment already feeds todayProfit!
      }
    }

    // Hydrate seeded document previews so Branch Admin always has inspectable KYC documents on existing disk DB
    if (['GL-2026-0841', 'GL-2026-0842', 'GL-2026-0843', 'GL-2026-0844'].includes(app.id)) {
      app.kycDocuments = app.kycDocuments.map((doc) => {
        if (!doc.previewDataUrl) {
          dirty = true;
          return { ...doc, ...getSeededDocPreview(app.id, doc) };
        }
        return doc;
      });
    }
  }

  if (dirty) {
    saveDatabase(parsed);
  }
  return parsed;
}

function saveDatabase(db: PersistedDatabase): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${DB_FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2));
  fs.renameSync(tmpFile, DB_FILE);
}

export function getStaffById(staffId: string | undefined): StaffUser | undefined {
  if (!staffId) return undefined;
  return getAllStaffUsers().find((s) => s.id === staffId);
}

export function computeBranchWalletSummary(db: PersistedDatabase): BranchWalletSummary {
  const todayPrefix = new Date().toISOString().slice(0, 10);

  let totalDisbursedPrincipal = 0;
  let totalRepaidPrincipal = 0;
  let totalFeesEarned = 0;
  let totalInterestEarned = 0;

  let todayFeesProfit = 0;
  let todayInterestProfit = 0;
  let todayDisbursedAmount = 0;
  let todayRepaymentsCollected = 0;

  let storedGoldGrossGrams = 0;
  let storedGoldNetGrams = 0;
  let storedGoldMarketValue = 0;
  let activeVaultPackets = 0;
  const purityBreakdown: Record<PurityGrade, number> = {
    '24K': 0,
    '22K': 0,
    '20K': 0,
    '18K': 0,
  };

  for (const record of db.applications) {
    const app = record.application;

    // Gold stored in vault (sealed/stored/pending disbursement/disbursed)
    if (app.collateralStorage) {
      activeVaultPackets += 1;
      for (const item of app.goldItems) {
        const gross = item.grossWeightGrams ?? 0;
        const net = item.netWeightGrams ?? 0;
        const val = item.appraisedValue ?? 0;
        storedGoldGrossGrams += gross;
        storedGoldNetGrams += net;
        storedGoldMarketValue += val;
        if (item.purity && purityBreakdown[item.purity] !== undefined) {
          purityBreakdown[item.purity] =
            Math.round((purityBreakdown[item.purity] + net) * 100) / 100;
        }
      }
    }

    // Disbursed loans & fee income
    if (app.disbursement.status === 'Disbursed' && app.loanOffer) {
      const feeIncome =
        app.loanOffer.processingFeeAmount + app.loanOffer.valuationFeeAmount;
      totalDisbursedPrincipal += app.loanOffer.sanctionedAmount;
      totalFeesEarned += feeIncome;

      if (app.disbursement.disbursedAt?.slice(0, 10) === todayPrefix) {
        todayDisbursedAmount += app.disbursement.disbursedAmount ?? app.loanOffer.netDisbursementAmount;
        todayFeesProfit += feeIncome;
      }
    }

    // Repayment collections & interest profit
    for (const rcpt of app.repayments || []) {
      totalRepaidPrincipal += rcpt.principalPaid;
      totalInterestEarned += rcpt.interestPaid;

      if (rcpt.paidAt.slice(0, 10) === todayPrefix) {
        todayRepaymentsCollected += rcpt.totalPaid;
        todayInterestProfit += rcpt.interestPaid;
      }
    }
  }

  const walletBalance =
    OPENING_BRANCH_CAPITAL -
    totalDisbursedPrincipal +
    totalRepaidPrincipal +
    totalFeesEarned +
    totalInterestEarned;

  return {
    branchCode: 'MUM-04',
    branchName: 'Mumbai — Bandra West Branch',
    openingCapital: OPENING_BRANCH_CAPITAL,
    walletBalance: Math.round(walletBalance),
    totalDisbursedPrincipal: Math.round(totalDisbursedPrincipal),
    totalRepaidPrincipal: Math.round(totalRepaidPrincipal),
    totalFeesEarned: Math.round(totalFeesEarned),
    totalInterestEarned: Math.round(totalInterestEarned),
    todayProfit: Math.round(todayFeesProfit + todayInterestProfit),
    todayFeesProfit: Math.round(todayFeesProfit),
    todayInterestProfit: Math.round(todayInterestProfit),
    todayDisbursedAmount: Math.round(todayDisbursedAmount),
    todayRepaymentsCollected: Math.round(todayRepaymentsCollected),
    storedGoldGrossGrams: Math.round(storedGoldGrossGrams * 100) / 100,
    storedGoldNetGrams: Math.round(storedGoldNetGrams * 100) / 100,
    storedGoldMarketValue: Math.round(storedGoldMarketValue),
    activeVaultPackets,
    purityBreakdown,
  };
}

export function projectApplicationForRole(
  record: StoredApplicationRecord,
  role: StaffRole
): GoldLoanApplication {
  const clone: GoldLoanApplication = JSON.parse(JSON.stringify(record.application));
  const decryptedPan = decryptSensitiveField(record.encryptedPan) || clone.customer.panNumber;

  if (role === 'AUDITOR') {
    clone.customer.panNumber = maskPanForAuditor(decryptedPan);
  } else {
    clone.customer.panNumber = decryptedPan;
  }

  // Strictly guarantee full Aadhaar is never exposed in API payloads
  clone.customer.aadhaarMasked = `XXXX-XXXX-${clone.customer.aadhaarLast4 || 'XXXX'}`;
  clone.bankAccount.accountNumberMasked = maskAccountNumber(
    clone.bankAccount.accountNumberLast4
  ).masked;
  if (!Array.isArray(clone.repayments)) {
    clone.repayments = [];
  }
  return clone;
}

export function getBootstrapData(actor: StaffUser) {
  const db = loadDatabase();
  return {
    staffDirectory: getAllStaffUsers(db),
    currentUser: actor,
    policy: db.policy,
    applications: db.applications.map((r) => projectApplicationForRole(r, actor.role)),
    auditLogs: db.auditLogs.slice().sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    branchWallet: computeBranchWalletSummary(db),
  };
}

export function mutateApplication(
  applicationId: string,
  actor: StaffUser,
  mutator: (
    app: GoldLoanApplication,
    record: StoredApplicationRecord,
    db: PersistedDatabase
  ) => {
    action: string;
    details: string;
    previousStatus?: GoldLoanApplication['status'];
    newStatus?: GoldLoanApplication['status'];
  }
): {
  application: GoldLoanApplication;
  auditEntry: AuditLogEntry;
  branchWallet: BranchWalletSummary;
} {
  const db = loadDatabase();
  const idx = db.applications.findIndex((r) => r.application.id === applicationId);
  if (idx === -1) {
    throw new Error('Application not found');
  }
  const record = db.applications[idx];
  const prevStatus = record.application.status;
  const result = mutator(record.application, record, db);
  record.application.updatedAt = new Date().toISOString();

  const auditEntry = makeAudit({
    applicationId: record.application.id,
    applicationNumber: record.application.applicationNumber,
    timestamp: record.application.updatedAt,
    actor,
    action: result.action,
    details: result.details,
    previousStatus: result.previousStatus ?? prevStatus,
    newStatus: result.newStatus ?? record.application.status,
  });

  db.auditLogs.unshift(auditEntry);
  saveDatabase(db);

  return {
    application: projectApplicationForRole(record, actor.role),
    auditEntry,
    branchWallet: computeBranchWalletSummary(db),
  };
}

export function createNewApplication(
  actor: StaffUser,
  payload: {
    customer: {
      fullName: string;
      phone: string;
      dateOfBirth: string;
      address: string;
      panNumber: string;
      aadhaarNumberOrLast4: string;
      consentCaptured: boolean;
      ocrDisclaimerAcknowledged: boolean;
    };
    kycDocuments: GoldLoanApplication['kycDocuments'];
    goldItems: GoldLoanApplication['goldItems'];
    bankAccount: {
      accountHolderName: string;
      bankName: string;
      ifscCode: string;
      accountNumber: string;
    };
    submitForKyc: boolean;
  }
): {
  application: GoldLoanApplication;
  auditEntry: AuditLogEntry;
  branchWallet: BranchWalletSummary;
} {
  const db = loadDatabase();
  const now = new Date().toISOString();
  const maxSeq = db.applications.reduce((max, r) => {
    const m = r.application.id.match(/(\d+)$/);
    const num = m ? Number(m[1]) : 0;
    return Number.isFinite(num) && num > max ? num : max;
  }, 844);
  const seq = maxSeq + 1;
  const paddedSeq = String(seq).padStart(4, '0');
  const id = `GL-2026-${paddedSeq}`;
  const applicationNumber = `AVGL-MUM04-${paddedSeq}`;

  const rawAadhaarDigits = payload.customer.aadhaarNumberOrLast4.replace(/\D/g, '');
  const aadhaarLast4 = rawAadhaarDigits.slice(-4).padStart(4, 'X');
  const aadhaarMasked = `XXXX-XXXX-${aadhaarLast4}`;

  const acctDigits = payload.bankAccount.accountNumber.replace(/\D/g, '');
  const acctLast4 = acctDigits.slice(-4);
  const initialStatus: GoldLoanApplication['status'] = payload.submitForKyc
    ? 'KYC Pending'
    : 'Draft';

  const newApp: GoldLoanApplication = {
    id,
    applicationNumber,
    branchCode: actor.branchCode,
    branchName: actor.branchName,
    status: initialStatus,
    createdAt: now,
    updatedAt: now,
    createdById: actor.id,
    createdByName: actor.name,
    customer: {
      fullName: payload.customer.fullName.trim(),
      phone: payload.customer.phone.trim(),
      dateOfBirth: payload.customer.dateOfBirth,
      address: payload.customer.address.trim(),
      panNumber: payload.customer.panNumber.trim().toUpperCase(),
      aadhaarMasked,
      aadhaarLast4,
      consentCaptured: payload.customer.consentCaptured,
      consentTimestamp: payload.customer.consentCaptured ? now : undefined,
      ocrDisclaimerAcknowledged: payload.customer.ocrDisclaimerAcknowledged,
    },
    kycDocuments: payload.kycDocuments,
    kycDecision: 'Pending',
    kycReviewHistory: [],
    goldItems: payload.goldItems,
    appraisalHistory: [],
    bankAccount: {
      accountHolderName: payload.bankAccount.accountHolderName.trim(),
      bankName: payload.bankAccount.bankName.trim(),
      ifscCode: payload.bankAccount.ifscCode.trim().toUpperCase(),
      accountNumberMasked: `XXXX-XXXX-${acctLast4 || 'XXXX'}`,
      accountNumberLast4: acctLast4,
      verificationStatus: 'Unverified',
    },
    disbursement: {
      status: 'Not Initiated',
    },
    repayments: [],
    encryptionMetadata: {
      encryptedFields: ['panNumber', 'bankAccountNumber', 'aadhaarVerificationHash'],
      algorithm: 'AES-256-GCM',
      aadhaarStoredFull: false,
    },
  };

  const record: StoredApplicationRecord = {
    application: newApp,
    encryptedPan: encryptSensitiveField(newApp.customer.panNumber),
    encryptedAccountNumber: encryptSensitiveField(acctDigits),
    aadhaarVerificationHash: hashOneWay(rawAadhaarDigits || aadhaarLast4),
  };

  db.applications.unshift(record);

  const auditEntry = makeAudit({
    applicationId: id,
    applicationNumber,
    timestamp: now,
    actor,
    action: payload.submitForKyc ? 'Application Created & Submitted for KYC' : 'Application Saved as Draft',
    details: `Applicant ${newApp.customer.fullName} · ${newApp.goldItems.length} gold ornament(s) · Aadhaar masked (${aadhaarMasked}).`,
    previousStatus: 'Draft',
    newStatus: initialStatus,
  });

  db.auditLogs.unshift(auditEntry);
  saveDatabase(db);

  return {
    application: projectApplicationForRole(record, actor.role),
    auditEntry,
    branchWallet: computeBranchWalletSummary(db),
  };
}

export function appendStandaloneAuditLog(params: {
  applicationId: string;
  applicationNumber: string;
  actor: StaffUser;
  action: string;
  details: string;
}): AuditLogEntry {
  const db = loadDatabase();
  const entry = makeAudit({
    applicationId: params.applicationId,
    applicationNumber: params.applicationNumber,
    timestamp: new Date().toISOString(),
    actor: params.actor,
    action: params.action,
    details: params.details,
  });
  db.auditLogs.unshift(entry);
  saveDatabase(db);
  return entry;
}

export function updateRecordEncryptedFields(
  record: StoredApplicationRecord,
  updates: { panNumber?: string; bankAccountNumber?: string; aadhaarRaw?: string }
) {
  if (updates.panNumber) {
    record.encryptedPan = encryptSensitiveField(updates.panNumber.trim().toUpperCase());
  }
  if (updates.bankAccountNumber) {
    record.encryptedAccountNumber = encryptSensitiveField(
      updates.bankAccountNumber.replace(/\D/g, '')
    );
  }
  if (updates.aadhaarRaw) {
    record.aadhaarVerificationHash = hashOneWay(updates.aadhaarRaw);
  }
}

export function getPolicy(): LendingPolicy {
  return loadDatabase().policy;
}
