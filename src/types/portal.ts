export type StaffRole =
  | 'BRANCH_STAFF'
  | 'APPRAISER'
  | 'BRANCH_ADMIN'
  | 'AUDITOR'
  | 'CUSTOMER';

export interface StaffUser {
  id: string;
  name: string;
  role: StaffRole;
  designation: string;
  employeeCode: string;
  branchCode: string;
  branchName: string;
  linkedCustomerName?: string;
  demoCredentials?: {
    loginId: string;
    password: string;
  };
}

export type ApplicationStatus =
  | 'Draft'
  | 'KYC Pending'
  | 'KYC Info Required'
  | 'KYC Rejected'
  | 'KYC Approved'
  | 'Appraisal Pending'
  | 'Loan Offer Ready'
  | 'Sanction Pending'
  | 'Sanctioned'
  | 'Collateral Stored'
  | 'Disbursement Pending'
  | 'Disbursed';

export type KycDecision =
  | 'Pending'
  | 'Approved'
  | 'Rejected'
  | 'Requires more information';

export type PurityGrade = '24K' | '22K' | '20K' | '18K';

export type RepaymentScheme =
  | 'Monthly EMI'
  | 'Bullet Maturity'
  | 'Quarterly Interest';

export type OrnamentType =
  | 'Necklace'
  | 'Bangle'
  | 'Ring'
  | 'Chain'
  | 'Earrings'
  | 'Bracelet'
  | 'Coin'
  | 'Other';

export interface GoldItem {
  id: string;
  itemType: OrnamentType;
  quantity: number;
  customerDescription: string;
  livePhotoDataUrl: string;
  purchaseBillAvailable: boolean;
  purchaseBillRef?: string;
  purchaseBillImageUrl?: string;
  grossWeightGrams?: number;
  stoneDetails?: string;
  stoneDeductionGrams?: number;
  netWeightGrams?: number;
  purity?: PurityGrade;
  ratePerGram?: number;
  appraisedValue?: number;
  appraiserNotes?: string;
  supportingPhotoDataUrl?: string;
}

export interface AppraisalHistoryEntry {
  id: string;
  appraisedAt: string;
  appraiserId: string;
  appraiserName: string;
  totalGrossWeightGrams: number;
  totalNetWeightGrams: number;
  totalAppraisedValue: number;
  remarks: string;
  itemSnapshots: Array<{
    itemId: string;
    itemType: OrnamentType;
    grossWeightGrams: number;
    netWeightGrams: number;
    purity: PurityGrade;
    appraisedValue: number;
  }>;
}

export interface KycDocumentAttachment {
  id: string;
  docCategory: 'PAN' | 'Aadhaar Front' | 'Aadhaar Back' | 'Address Proof';
  fileName: string;
  mimeType?: string;
  previewDataUrl?: string;
  ocrAssisted: boolean;
  ocrExtractedSummary?: string;
  uploadedAt: string;
}

export interface KycReviewHistoryEntry {
  id: string;
  decision: KycDecision;
  remarks: string;
  reviewedById: string;
  reviewedByName: string;
  reviewedAt: string;
}

export interface CustomerDetails {
  fullName: string;
  phone: string;
  dateOfBirth: string;
  address: string;
  panNumber: string;
  aadhaarMasked: string;
  aadhaarLast4: string;
  consentCaptured: boolean;
  consentTimestamp?: string;
  ocrDisclaimerAcknowledged: boolean;
}

export interface BankAccountDetails {
  accountHolderName: string;
  bankName: string;
  ifscCode: string;
  accountNumberMasked: string;
  accountNumberLast4: string;
  verificationStatus: 'Unverified' | 'Verified';
  verifiedAt?: string;
  verifiedByName?: string;
}

export interface LoanOfferTerms {
  policyLtvPercent: number;
  maxEligibleAmount: number;
  requestedAmount: number;
  sanctionedAmount: number;
  tenureMonths: number;
  annualInterestRate: number;
  repaymentScheme: RepaymentScheme;
  processingFeeAmount: number;
  valuationFeeAmount: number;
  gstOnFeesAmount: number;
  netDisbursementAmount: number;
  monthlyInstallment: number;
  totalInterestPayable: number;
  totalRepayableAmount: number;
  calculatedAt: string;
}

export interface CustodyEvent {
  id: string;
  timestamp: string;
  event: string;
  actorName: string;
  actorRole: StaffRole;
  notes: string;
}

export interface CollateralStorageRecord {
  packageSealNumber: string;
  vaultLocation: string;
  storageBoxNumber: string;
  handedOverById: string;
  handedOverByName: string;
  receivedById: string;
  receivedByName: string;
  handoverTimestamp: string;
  custodyLog: CustodyEvent[];
}

export interface SanctionSigningRecord {
  sanctionLetterNumber: string;
  generatedAt: string;
  customerSigned: boolean;
  customerSignatureDataUrl?: string;
  customerSignedAt?: string;
  branchRepSigned: boolean;
  branchRepId?: string;
  branchRepName?: string;
  branchRepSignatureDataUrl?: string;
  branchRepSignedAt?: string;
}

export interface DisbursementRecord {
  status: 'Not Initiated' | 'Pending' | 'Initiated' | 'Disbursed';
  utrReference?: string;
  disbursedAmount?: number;
  disbursedAt?: string;
  disbursedById?: string;
  disbursedByName?: string;
  remarks?: string;
}

export interface RepaymentReceipt {
  id: string;
  receiptNumber: string;
  installmentNumber: number;
  paidAt: string;
  principalPaid: number;
  interestPaid: number;
  totalPaid: number;
  paymentMode: 'UPI' | 'NEFT' | 'Branch Cash' | 'Auto-Debit';
  transactionRef: string;
  collectedByName: string;
}

export interface AuditLogEntry {
  id: string;
  applicationId: string;
  applicationNumber: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  actorRole: StaffRole;
  action: string;
  details: string;
  previousStatus?: ApplicationStatus;
  newStatus?: ApplicationStatus;
  integrityHash: string;
}

export interface GoldLoanApplication {
  id: string;
  applicationNumber: string;
  branchCode: string;
  branchName: string;
  status: ApplicationStatus;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  createdByName: string;
  customer: CustomerDetails;
  kycDocuments: KycDocumentAttachment[];
  kycDecision: KycDecision;
  kycReviewHistory: KycReviewHistoryEntry[];
  goldItems: GoldItem[];
  appraisalHistory: AppraisalHistoryEntry[];
  loanOffer?: LoanOfferTerms;
  collateralStorage?: CollateralStorageRecord;
  sanctionSigning?: SanctionSigningRecord;
  bankAccount: BankAccountDetails;
  disbursement: DisbursementRecord;
  repayments: RepaymentReceipt[];
  encryptionMetadata: {
    encryptedFields: string[];
    algorithm: 'AES-256-GCM';
    aadhaarStoredFull: false;
  };
}

export interface LendingPolicy {
  organizationName: string;
  maxLtvPercent: number;
  goldRatesPerGram: Record<PurityGrade, number>;
  interestRatesByScheme: Record<RepaymentScheme, number>;
  processingFeePercent: number;
  valuationFeeFlat: number;
  gstPercent: number;
  allowedTenuresMonths: number[];
}

export interface BranchWalletSummary {
  branchCode: string;
  branchName: string;
  openingCapital: number;
  walletBalance: number;
  totalDisbursedPrincipal: number;
  totalRepaidPrincipal: number;
  totalFeesEarned: number;
  totalInterestEarned: number;
  todayProfit: number;
  todayFeesProfit: number;
  todayInterestProfit: number;
  todayDisbursedAmount: number;
  todayRepaymentsCollected: number;
  storedGoldGrossGrams: number;
  storedGoldNetGrams: number;
  storedGoldMarketValue: number;
  activeVaultPackets: number;
  purityBreakdown: Record<PurityGrade, number>;
}

export interface OcrExtractionResult {
  documentType: 'PAN' | 'Aadhaar' | 'Unknown';
  fullName?: string;
  panNumber?: string;
  aadhaarMasked?: string;
  aadhaarLast4?: string;
  dateOfBirth?: string;
  address?: string;
  confidenceNotes: string;
  disclaimer: string;
}

export interface RepaymentInstallment {
  installmentNumber: number;
  dueLabel: string;
  openingPrincipal: number;
  principalComponent: number;
  interestComponent: number;
  totalPayment: number;
  closingPrincipal: number;
}
