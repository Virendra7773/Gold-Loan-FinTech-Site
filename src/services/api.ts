import type {
  AuditLogEntry,
  BranchWalletSummary,
  GoldItem,
  GoldLoanApplication,
  KycDecision,
  KycDocumentAttachment,
  LendingPolicy,
  OcrExtractionResult,
  PurityGrade,
  RepaymentScheme,
  StaffUser,
} from '../types/portal.ts';

export interface BootstrapResponse {
  staffDirectory: StaffUser[];
  currentUser: StaffUser;
  policy: LendingPolicy;
  applications: GoldLoanApplication[];
  auditLogs: AuditLogEntry[];
  branchWallet: BranchWalletSummary;
}

export interface MutationResponse {
  application: GoldLoanApplication;
  auditEntry: AuditLogEntry;
  branchWallet?: BranchWalletSummary;
}

async function requestJson<T>(
  url: string,
  staffId: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-staff-id': staffId,
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const portalApi = {
  bootstrap(staffId: string) {
    return requestJson<BootstrapResponse>('/api/bootstrap', staffId);
  },

  extractOcr(
    staffId: string,
    payload: {
      base64Data: string;
      mimeType: string;
      documentHint?: 'PAN' | 'Aadhaar';
      applicationId?: string;
      applicationNumber?: string;
    }
  ) {
    return requestJson<OcrExtractionResult>('/api/ocr/extract', staffId, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  createApplication(
    staffId: string,
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
      kycDocuments: KycDocumentAttachment[];
      goldItems: GoldItem[];
      bankAccount: {
        accountHolderName: string;
        bankName: string;
        ifscCode: string;
        accountNumber: string;
      };
      submitForKyc: boolean;
    }
  ) {
    return requestJson<MutationResponse>(
      '/api/applications',
      staffId,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  updateIntake(
    staffId: string,
    applicationId: string,
    payload: {
      customer?: {
        fullName: string;
        phone: string;
        dateOfBirth: string;
        address: string;
        panNumber: string;
        aadhaarNumberOrLast4?: string;
        consentCaptured: boolean;
        ocrDisclaimerAcknowledged: boolean;
      };
      kycDocuments?: KycDocumentAttachment[];
      goldItems?: GoldItem[];
      bankAccount?: {
        accountHolderName: string;
        bankName: string;
        ifscCode: string;
        accountNumber?: string;
      };
      submitForKyc?: boolean;
    }
  ) {
    return requestJson<MutationResponse>(
      `/api/applications/${applicationId}/intake`,
      staffId,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    );
  },

  submitKycReview(
    staffId: string,
    applicationId: string,
    payload: { decision: KycDecision; remarks: string }
  ) {
    return requestJson<MutationResponse>(
      `/api/applications/${applicationId}/kyc-review`,
      staffId,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  submitAppraisal(
    staffId: string,
    applicationId: string,
    payload: {
      items: Array<{
        itemId: string;
        grossWeightGrams: number;
        stoneDetails: string;
        stoneDeductionGrams: number;
        purity: PurityGrade;
        appraiserNotes: string;
        supportingPhotoDataUrl?: string;
      }>;
      remarks: string;
    }
  ) {
    return requestJson<MutationResponse>(
      `/api/applications/${applicationId}/appraisal`,
      staffId,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  saveLoanOffer(
    staffId: string,
    applicationId: string,
    payload: {
      requestedAmount: number;
      sanctionedAmount: number;
      tenureMonths: number;
      repaymentScheme: RepaymentScheme;
      submitForSanction?: boolean;
    }
  ) {
    return requestJson<MutationResponse>(
      `/api/applications/${applicationId}/loan-offer`,
      staffId,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  signSanction(
    staffId: string,
    applicationId: string,
    payload: { signerType: 'customer' | 'branch_rep'; signatureDataUrl: string }
  ) {
    return requestJson<MutationResponse>(
      `/api/applications/${applicationId}/sanction-sign`,
      staffId,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  recordSanctionExport(
    staffId: string,
    applicationId: string,
    format: 'PDF' | 'PRINT'
  ) {
    return requestJson<MutationResponse>(
      `/api/applications/${applicationId}/sanction-export`,
      staffId,
      {
        method: 'POST',
        body: JSON.stringify({ format }),
      }
    );
  },

  saveCollateralStorage(
    staffId: string,
    applicationId: string,
    payload: {
      packageSealNumber: string;
      vaultLocation: string;
      storageBoxNumber: string;
      handedOverById: string;
      notes?: string;
    }
  ) {
    return requestJson<MutationResponse>(
      `/api/applications/${applicationId}/collateral`,
      staffId,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  appendCustodyEvent(
    staffId: string,
    applicationId: string,
    payload: { event: string; notes: string }
  ) {
    return requestJson<MutationResponse>(
      `/api/applications/${applicationId}/collateral/custody`,
      staffId,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  updateDisbursement(
    staffId: string,
    applicationId: string,
    payload: {
      verifyBankAccount?: boolean;
      disbursementStatus: 'Pending' | 'Initiated' | 'Disbursed';
      utrReference?: string;
      remarks?: string;
    }
  ) {
    return requestJson<MutationResponse>(
      `/api/applications/${applicationId}/disbursement`,
      staffId,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  recordRepayment(
    staffId: string,
    applicationId: string,
    payload: {
      installmentNumber?: number;
      paymentMode?: 'UPI' | 'NEFT' | 'Branch Cash' | 'Auto-Debit';
      transactionRef?: string;
    }
  ) {
    return requestJson<MutationResponse>(
      `/api/applications/${applicationId}/repayments`,
      staffId,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },
};
