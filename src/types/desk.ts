import type {
  GoldItem,
  GoldLoanApplication,
  KycDocumentAttachment,
  OcrExtractionResult,
} from './portal.ts';

export type IntakeStep = 1 | 2 | 3 | 4;

export type OcrInputSource =
  | File
  | {
      name: string;
      type: string;
      dataUrl: string;
    };

export interface IntakeDraftState {
  draftId: string;
  label: string;
  createdAt: string;
  currentStep: IntakeStep;
  existingAppId?: string;
  existingAppNumber?: string;
  fullName: string;
  phone: string;
  dateOfBirth: string;
  address: string;
  panNumber: string;
  aadhaarInput: string;
  aadhaarRawDigits: string;
  consentCaptured: boolean;
  ocrDisclaimerAcknowledged: boolean;
  kycDocuments: KycDocumentAttachment[];
  goldItems: GoldItem[];
  accountHolderName: string;
  bankName: string;
  ifscCode: string;
  accountNumber: string;
  ocrInFlightCount: number;
  ocrFeedback: OcrExtractionResult | null;
  ocrError: string | null;
  submitting: boolean;
  formError: string | null;
  lastSavedMessage: string | null;
}

export type DeskSession =
  | { id: string; kind: 'intake'; draftId: string }
  | { id: string; kind: 'case'; applicationId: string };

export interface AsyncNotice {
  id: string;
  title: string;
  detail: string;
  tone: 'ok' | 'err' | 'info';
  targetSessionId?: string;
}

export function createIntakeDraft(
  walkInNumber: number,
  existingApp?: GoldLoanApplication | null
): IntakeDraftState {
  const draftId = existingApp
    ? `intake-edit-${existingApp.id}`
    : `intake-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;

  return {
    draftId,
    label: existingApp ? `Edit · ${existingApp.customer.fullName}` : `Walk-In #${walkInNumber}`,
    createdAt: new Date().toISOString(),
    currentStep: 1,
    existingAppId: existingApp?.id,
    existingAppNumber: existingApp?.applicationNumber,
    fullName: existingApp?.customer.fullName ?? '',
    phone: existingApp?.customer.phone ?? '',
    dateOfBirth: existingApp?.customer.dateOfBirth ?? '',
    address: existingApp?.customer.address ?? '',
    panNumber: existingApp?.customer.panNumber ?? '',
    aadhaarInput: existingApp?.customer.aadhaarLast4
      ? `XXXX-XXXX-${existingApp.customer.aadhaarLast4}`
      : '',
    aadhaarRawDigits: existingApp?.customer.aadhaarLast4 ?? '',
    consentCaptured: existingApp?.customer.consentCaptured ?? false,
    ocrDisclaimerAcknowledged: existingApp?.customer.ocrDisclaimerAcknowledged ?? true,
    kycDocuments: existingApp?.kycDocuments ?? [],
    goldItems: existingApp?.goldItems ?? [
      {
        id: `itm-${Date.now()}-${Math.random().toString(16).slice(2, 5)}`,
        itemType: 'Necklace',
        quantity: 1,
        customerDescription: '',
        livePhotoDataUrl: '',
        purchaseBillAvailable: true,
      },
    ],
    accountHolderName: existingApp?.bankAccount.accountHolderName ?? '',
    bankName: existingApp?.bankAccount.bankName ?? '',
    ifscCode: existingApp?.bankAccount.ifscCode ?? '',
    accountNumber: existingApp?.bankAccount.accountNumberLast4
      ? `XXXX-XXXX-${existingApp.bankAccount.accountNumberLast4}`
      : '',
    ocrInFlightCount: 0,
    ocrFeedback: null,
    ocrError: null,
    submitting: false,
    formError: null,
    lastSavedMessage: null,
  };
}
