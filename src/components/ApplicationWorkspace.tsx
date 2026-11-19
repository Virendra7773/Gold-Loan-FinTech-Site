import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Camera,
  CheckCircle2,
  Download,
  Edit3,
  Eye,
  FileCheck2,
  FileText,
  History,
  Lock,
  PenTool,
  Printer,
  Receipt,
  ShieldCheck,
  Upload,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import type {
  AuditLogEntry,
  BranchWalletSummary,
  GoldLoanApplication,
  KycDecision,
  KycDocumentAttachment,
  LendingPolicy,
  PurityGrade,
  RepaymentScheme,
  StaffRole,
  StaffUser,
} from '../types/portal.ts';
import {
  calculateLoanOffer,
  computeItemAppraisedValue,
  formatGrams,
  formatINR,
} from '../utils/loanMath.ts';
import {
  downloadRepaymentReceiptPdf,
  downloadSanctionLetterPdf,
  printElementInIsolatedFrame,
} from '../utils/sanctionPdf.ts';
import { portalApi, type MutationResponse } from '../services/api.ts';
import { CameraModal } from './CameraModal.tsx';
import { OrnamentPhoto } from './OrnamentPhoto.tsx';
import { SignatureModal } from './SignatureModal.tsx';
import {
  KycDecisionText,
  LifecycleStepper,
  StatusText,
  stageToTab,
} from './StatusText.tsx';

type WorkspaceTab =
  | 'overview'
  | 'appraisal'
  | 'offer'
  | 'sanction'
  | 'collateral'
  | 'audit';

interface ApplicationWorkspaceProps {
  application: GoldLoanApplication;
  currentUser: StaffUser;
  staffDirectory: StaffUser[];
  policy: LendingPolicy;
  auditLogs: AuditLogEntry[];
  isActiveSession?: boolean;
  onApplicationUpdated: (
    app: GoldLoanApplication,
    auditEntry: AuditLogEntry,
    branchWallet?: BranchWalletSummary
  ) => void;
  onEditIntake: (app: GoldLoanApplication) => void;
  onSwitchStaffRole?: (staffId: string) => void;
  onAsyncActivityChange?: (applicationId: string, label: string | null) => void;
  onStartAnotherWalkIn?: () => void;
}

interface AppraisalDraftItem {
  itemId: string;
  grossWeightGrams: number;
  stoneDetails: string;
  stoneDeductionGrams: number;
  purity: PurityGrade;
  appraiserNotes: string;
  supportingPhotoDataUrl?: string;
}

export function ApplicationWorkspace({
  application,
  currentUser,
  staffDirectory,
  policy,
  auditLogs,
  isActiveSession = true,
  onApplicationUpdated,
  onEditIntake,
  onSwitchStaffRole,
  onAsyncActivityChange,
  onStartAnotherWalkIn,
}: ApplicationWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(() =>
    stageToTab(application.status)
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [inspectingDoc, setInspectingDoc] = useState<KycDocumentAttachment | null>(null);
  const [counterPayMode, setCounterPayMode] = useState<'Branch Cash' | 'UPI' | 'NEFT'>('Branch Cash');
  const sanctionLetterRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setActiveTab(stageToTab(application.status));
  }, [application.id]);

  // KYC Review State (Branch Admin)
  const [kycDecision, setKycDecision] = useState<KycDecision>(application.kycDecision);
  const [kycRemarks, setKycRemarks] = useState('');

  // Appraisal State (Appraiser)
  const [appraisalItems, setAppraisalItems] = useState<AppraisalDraftItem[]>([]);
  const [appraisalRemarks, setAppraisalRemarks] = useState('');
  const [supportingPhotoItemId, setSupportingPhotoItemId] = useState<string | null>(null);

  // Loan Offer State
  const [requestedAmount, setRequestedAmount] = useState<number>(0);
  const [sanctionedAmount, setSanctionedAmount] = useState<number>(0);
  const [tenureMonths, setTenureMonths] = useState<number>(12);
  const [repaymentScheme, setRepaymentScheme] = useState<RepaymentScheme>('Monthly EMI');

  // Sanction Signing Modal State
  const [signingFor, setSigningFor] = useState<'customer' | 'branch_rep' | null>(null);

  // Collateral Storage State (Branch Admin)
  const [sealNumber, setSealNumber] = useState('');
  const [vaultLocation, setVaultLocation] = useState('Vault A · Dual-Key Rack 03');
  const [storageBoxNumber, setStorageBoxNumber] = useState('');
  const [handedOverById, setHandedOverById] = useState('appraiser-01');
  const [custodyNotes, setCustodyNotes] = useState('');
  const [newCustodyEvent, setNewCustodyEvent] = useState('Routine Seal Audit');
  const [newCustodyNotes, setNewCustodyNotes] = useState('');

  // Disbursement State (Branch Admin)
  const [verifyBankAccount, setVerifyBankAccount] = useState(
    application.bankAccount.verificationStatus === 'Verified'
  );
  const [disbursementStatus, setDisbursementStatus] = useState<
    'Pending' | 'Initiated' | 'Disbursed'
  >(
    application.disbursement.status === 'Not Initiated'
      ? 'Pending'
      : application.disbursement.status
  );
  const [utrReference, setUtrReference] = useState(
    application.disbursement.utrReference ?? ''
  );
  const [disbursementRemarks, setDisbursementRemarks] = useState(
    application.disbursement.remarks ?? ''
  );

  // Sync local form state when switching applications or when server persists an update
  useEffect(() => {
    setActionError(null);
    setActionSuccess(null);
    setKycDecision(application.kycDecision);
    setKycRemarks('');

    setAppraisalItems(
      application.goldItems.map((item) => ({
        itemId: item.id,
        grossWeightGrams: item.grossWeightGrams ?? 0,
        stoneDetails: item.stoneDetails ?? 'No stones',
        stoneDeductionGrams: item.stoneDeductionGrams ?? 0,
        purity: item.purity ?? '22K',
        appraiserNotes: item.appraiserNotes ?? '',
        supportingPhotoDataUrl: item.supportingPhotoDataUrl,
      }))
    );
    setAppraisalRemarks('');

    const totalAppraised = application.goldItems.reduce(
      (sum, g) => sum + (g.appraisedValue ?? 0),
      0
    );
    const defaultMax = Math.floor((totalAppraised * policy.maxLtvPercent) / 100);
    setRequestedAmount(application.loanOffer?.requestedAmount ?? defaultMax);
    setSanctionedAmount(application.loanOffer?.sanctionedAmount ?? defaultMax);
    setTenureMonths(application.loanOffer?.tenureMonths ?? 12);
    setRepaymentScheme(application.loanOffer?.repaymentScheme ?? 'Monthly EMI');

    setSealNumber(
      application.collateralStorage?.packageSealNumber ??
        `SEAL-${application.branchCode.replace('-', '')}-${application.id.slice(-4)}`
    );
    setVaultLocation(
      application.collateralStorage?.vaultLocation ?? 'Vault A · Dual-Key Rack 03'
    );
    setStorageBoxNumber(
      application.collateralStorage?.storageBoxNumber ?? `BOX-A3-${application.id.slice(-2)}`
    );
    setHandedOverById(application.collateralStorage?.handedOverById ?? 'appraiser-01');
    setCustodyNotes('');

    setVerifyBankAccount(application.bankAccount.verificationStatus === 'Verified');
    setDisbursementStatus(
      application.disbursement.status === 'Not Initiated'
        ? 'Pending'
        : application.disbursement.status
    );
    setUtrReference(application.disbursement.utrReference ?? '');
    setDisbursementRemarks(application.disbursement.remarks ?? '');
  }, [application.id, application.updatedAt, policy.maxLtvPercent]);

  const totalAppraisedValue = useMemo(() => {
    return application.goldItems.reduce((sum, item) => sum + (item.appraisedValue ?? 0), 0);
  }, [application.goldItems]);

  const liveOfferPreview = useMemo(() => {
    return calculateLoanOffer({
      totalAppraisedValue,
      requestedAmount,
      sanctionedAmount,
      tenureMonths,
      repaymentScheme,
      policy,
    });
  }, [totalAppraisedValue, requestedAmount, sanctionedAmount, tenureMonths, repaymentScheme, policy]);

  const caseAuditLogs = useMemo(() => {
    return auditLogs.filter((l) => l.applicationId === application.id);
  }, [auditLogs, application.id]);

  const canEditIntake =
    (currentUser.role === 'BRANCH_STAFF' || currentUser.role === 'BRANCH_ADMIN') &&
    ['Draft', 'KYC Info Required', 'KYC Pending'].includes(application.status);
  const isAdmin = currentUser.role === 'BRANCH_ADMIN';
  const isAppraiser = currentUser.role === 'APPRAISER';
  const isStaffOrAdmin =
    currentUser.role === 'BRANCH_STAFF' || currentUser.role === 'BRANCH_ADMIN';
  const isAuditor = currentUser.role === 'AUDITOR';

  const isDualSigned = Boolean(
    application.sanctionSigning?.customerSigned &&
      application.sanctionSigning?.branchRepSigned
  );

  async function runAction(
    fn: () => Promise<MutationResponse>,
    successMsg: string
  ) {
    setActionError(null);
    setActionSuccess(null);
    setBusy(true);
    onAsyncActivityChange?.(application.id, 'Saving...');
    try {
      const res = await fn();
      onApplicationUpdated(res.application, res.auditEntry, res.branchWallet);
      setActionSuccess(successMsg);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setBusy(false);
      onAsyncActivityChange?.(application.id, null);
    }
  }

  function switchToRole(targetRole: StaffRole, targetTab?: WorkspaceTab) {
    const match = staffDirectory.find((s) => s.role === targetRole);
    if (match && onSwitchStaffRole) {
      onSwitchStaffRole(match.id);
      if (targetTab) setActiveTab(targetTab);
    }
  }

  async function handleDownloadSanctionPdf() {
    if (!isDualSigned) {
      setActionError(
        'Both Customer and Branch Administrator signatures are required before downloading the Sanction Letter.'
      );
      return;
    }
    setActionError(null);
    setExportingPdf(true);
    try {
      const filename = await downloadSanctionLetterPdf(application, policy);
      const res = await portalApi.recordSanctionExport(
        currentUser.id,
        application.id,
        'PDF'
      );
      onApplicationUpdated(res.application, res.auditEntry, res.branchWallet);
      setActionSuccess(
        `Downloaded ${filename} with ornament photographs and dual signatures.`
      );
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Unable to generate Sanction Letter PDF.'
      );
    } finally {
      setExportingPdf(false);
    }
  }

  async function handlePrintSanctionLetter() {
    if (!isDualSigned) {
      setActionError(
        'Both Customer and Branch Administrator signatures are required before printing the Sanction Letter.'
      );
      return;
    }
    setActionError(null);
    const node = sanctionLetterRef.current;
    let printed = false;
    if (node) {
      printed = printElementInIsolatedFrame(
        node.innerHTML,
        `Sanction Letter — ${application.applicationNumber}`
      );
    }
    if (!printed) {
      try {
        window.print();
        printed = true;
      } catch {
        printed = false;
      }
    }
    try {
      const res = await portalApi.recordSanctionExport(
        currentUser.id,
        application.id,
        'PRINT'
      );
      onApplicationUpdated(res.application, res.auditEntry, res.branchWallet);
    } catch {
      // Non-blocking audit log
    }
    setActionSuccess(
      'Print layout sent with ornament photos & dual signatures. You can also use "Download Sanction PDF" anytime.'
    );
  }

  const nextActionGuide = useMemo(() => {
    switch (application.status) {
      case 'Draft':
      case 'KYC Info Required':
        return {
          title: 'Complete customer intake and submit for KYC verification',
          requiredRole: 'BRANCH_STAFF' as StaffRole,
          roleLabel: 'Branch Staff',
          targetTab: 'overview' as WorkspaceTab,
          cta: 'Review Intake',
        };
      case 'KYC Pending':
        return {
          title: 'Verify KYC documents and record Admin decision',
          requiredRole: 'BRANCH_ADMIN' as StaffRole,
          roleLabel: 'Branch Administrator',
          targetTab: 'overview' as WorkspaceTab,
          cta: 'Open KYC Review',
        };
      case 'KYC Approved':
      case 'Appraisal Pending':
        return {
          title: 'Weigh ornaments, deduct stones, and record appraised value',
          requiredRole: 'APPRAISER' as StaffRole,
          roleLabel: 'Authorized Appraiser',
          targetTab: 'appraisal' as WorkspaceTab,
          cta: 'Open Appraisal Desk',
        };
      case 'Loan Offer Ready':
        return {
          title: 'Confirm requested/sanctioned amount & tenure, then issue Sanction Letter',
          requiredRole: 'BRANCH_STAFF' as StaffRole,
          roleLabel: 'Branch Staff / Admin',
          targetTab: 'offer' as WorkspaceTab,
          cta: 'Configure Loan Offer',
        };
      case 'Sanction Pending':
        return {
          title: !application.sanctionSigning?.customerSigned
            ? 'Capture Customer signature on the Sanction Letter'
            : 'Capture Branch Administrator signature to sanction loan',
          requiredRole: !application.sanctionSigning?.customerSigned
            ? ('BRANCH_STAFF' as StaffRole)
            : ('BRANCH_ADMIN' as StaffRole),
          roleLabel: !application.sanctionSigning?.customerSigned
            ? 'Branch Staff / Admin'
            : 'Branch Administrator',
          targetTab: 'sanction' as WorkspaceTab,
          cta: 'Open Signing Pad',
        };
      case 'Sanctioned':
        return {
          title: 'Sanction Letter signed — seal collateral package and assign vault location',
          requiredRole: 'BRANCH_ADMIN' as StaffRole,
          roleLabel: 'Branch Administrator',
          targetTab: 'collateral' as WorkspaceTab,
          cta: 'Proceed to Collateral Vault',
        };
      case 'Collateral Stored':
      case 'Disbursement Pending':
        return {
          title: 'Verify beneficiary bank account and release net disbursement with UTR',
          requiredRole: 'BRANCH_ADMIN' as StaffRole,
          roleLabel: 'Branch Administrator',
          targetTab: 'collateral' as WorkspaceTab,
          cta: 'Complete Disbursement',
        };
      default:
        return null;
    }
  }, [application.status, application.sanctionSigning]);

  const isGuideRoleReady = useMemo(() => {
    if (!nextActionGuide) return false;
    if (currentUser.role === 'BRANCH_ADMIN') {
      return nextActionGuide.requiredRole !== 'APPRAISER';
    }
    return currentUser.role === nextActionGuide.requiredRole;
  }, [currentUser.role, nextActionGuide]);

  return (
    <div className="space-y-5">
      {/* Clean Case Summary & Stepper */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="vault-card rounded-xl p-5 space-y-4 no-print"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-mono font-semibold text-slate-900">
                {application.applicationNumber}
              </span>
              <span aria-hidden="true">·</span>
              <span>{application.branchName}</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-semibold text-slate-900">
                {application.customer.fullName}
              </h2>
              <StatusText status={application.status} />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
              <span>
                KYC: <KycDecisionText decision={application.kycDecision} />
              </span>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span>
                Ornaments:{' '}
                <strong className="font-mono tabular-nums text-slate-900">
                  {application.goldItems.length}
                </strong>
              </span>
              {totalAppraisedValue > 0 && (
                <>
                  <span aria-hidden="true" className="text-slate-300">·</span>
                  <span>
                    Appraised:{' '}
                    <strong className="font-mono tabular-nums text-slate-900">
                      {formatINR(totalAppraisedValue)}
                    </strong>
                  </span>
                </>
              )}
              {application.loanOffer && (
                <>
                  <span aria-hidden="true" className="text-slate-300">·</span>
                  <span>
                    Sanctioned:{' '}
                    <strong className="font-mono tabular-nums text-slate-900">
                      {formatINR(application.loanOffer.sanctionedAmount)}
                    </strong>
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isStaffOrAdmin && onStartAnotherWalkIn && (
              <button
                type="button"
                onClick={onStartAnotherWalkIn}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5 text-[#9A6B16]" />
                <span>Next Walk-In</span>
              </button>
            )}
            {canEditIntake && (
              <button
                type="button"
                onClick={() => onEditIntake(application)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit Intake</span>
              </button>
            )}
            {isAuditor && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg">
                <Lock className="w-3.5 h-3.5" />
                <span>Read-Only Audit Mode</span>
              </span>
            )}
          </div>
        </div>

        <LifecycleStepper
          status={application.status}
          onSelectStage={(tab) => setActiveTab(tab)}
        />
      </motion.div>

      {/* Feedback Banners */}
      {actionError && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center gap-2 no-print">
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-700" />
          <span>{actionError}</span>
        </div>
      )}
      {actionSuccess && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center gap-2 no-print">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-700" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Clean Numbered Stage Tabs with Sliding Bullion Underline */}
      <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto no-print">
        {(
          [
            { id: 'overview', label: '1. Overview & KYC' },
            { id: 'appraisal', label: '2. Gold Appraisal' },
            { id: 'offer', label: '3. Loan Offer' },
            { id: 'sanction', label: '4. Sanction & Sign' },
            { id: 'collateral', label: '5. Vault & Payout' },
            { id: 'audit', label: `Audit (${caseAuditLogs.length})` },
          ] as const
        ).map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`relative px-4 py-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isActive ? 'text-slate-900 font-semibold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>{tab.label}</span>
              {isActive && (
                <motion.span
                  layoutId="workspaceTabIndicator"
                  transition={{ type: 'spring', stiffness: 450, damping: 36 }}
                  className="absolute inset-x-0 bottom-0 h-0.5 bg-[#B47B1B]"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW & KYC */}
      {activeTab === 'overview' && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          className="grid grid-cols-1 lg:grid-cols-12 gap-6"
        >
          <div className="lg:col-span-7 space-y-6">
            {/* Customer Profile */}
            <div className="vault-card rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  Customer Profile &amp; Masked KYC Identifiers
                </h3>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                  <Lock className="w-3 h-3" />
                  <span>{application.encryptionMetadata.algorithm} Encrypted</span>
                </span>
              </div>

              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-xs">
                <div>
                  <dt className="text-slate-500">Full Name</dt>
                  <dd className="mt-0.5 font-medium text-slate-900">
                    {application.customer.fullName}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Phone Number</dt>
                  <dd className="mt-0.5 font-mono text-slate-900">
                    {application.customer.phone}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">PAN Number</dt>
                  <dd className="mt-0.5 font-mono font-medium text-slate-900">
                    {application.customer.panNumber}
                    {isAuditor && (
                      <span className="ml-2 text-[11px] text-slate-400 font-sans">
                        (Masked for Auditor)
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Aadhaar (Strictly Masked)</dt>
                  <dd className="mt-0.5 font-mono font-medium text-slate-900">
                    {application.customer.aadhaarMasked}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Date of Birth</dt>
                  <dd className="mt-0.5 font-mono text-slate-900">
                    {application.customer.dateOfBirth || 'Not provided'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Customer Consent</dt>
                  <dd className="mt-0.5 text-slate-900">
                    {application.customer.consentCaptured ? (
                      <span className="text-emerald-700 font-medium">
                        Captured ·{' '}
                        <span className="font-mono">
                          {application.customer.consentTimestamp
                            ? new Date(application.customer.consentTimestamp).toLocaleDateString('en-IN')
                            : 'Recorded'}
                        </span>
                      </span>
                    ) : (
                      <span className="text-red-700 font-medium">Pending Consent</span>
                    )}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-slate-500">Residential Address</dt>
                  <dd className="mt-0.5 text-slate-900">
                    {application.customer.address || 'Not provided'}
                  </dd>
                </div>
              </dl>
            </div>

            {/* KYC Documents Visual Inspector */}
            <div className="vault-card rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Submitted Identity &amp; Address Documents
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Documents attached at customer intake — click any card to inspect full scan before KYC approval.
                  </p>
                </div>
                <span className="text-xs font-mono text-slate-500">
                  {application.kycDocuments.length} File(s)
                </span>
              </div>

              {application.kycDocuments.length === 0 ? (
                <p className="text-xs text-slate-500">No documents attached yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {application.kycDocuments.map((doc) => {
                    const isImage =
                      doc.previewDataUrl?.startsWith('data:image/') ||
                      doc.mimeType?.startsWith('image/');
                    return (
                      <div
                        key={doc.id}
                        className="vault-card vault-card-interactive rounded-xl overflow-hidden bg-slate-50/40 flex flex-col"
                      >
                        <button
                          type="button"
                          onClick={() => setInspectingDoc(doc)}
                          className="relative h-32 w-full bg-white border-b border-slate-200 flex items-center justify-center overflow-hidden group cursor-pointer"
                        >
                          {doc.previewDataUrl && isImage ? (
                            <img
                              src={doc.previewDataUrl}
                              alt={`${doc.docCategory} scan`}
                              className="w-full h-full object-contain p-1.5 transition-transform group-hover:scale-[1.02]"
                            />
                          ) : (
                            <div className="flex flex-col items-center gap-1 text-slate-500">
                              <FileText className="w-7 h-7 text-amber-700" />
                              <span className="text-[11px] font-mono">
                                {doc.mimeType?.includes('pdf') ? 'PDF Document' : 'Uploaded File'}
                              </span>
                            </div>
                          )}
                          <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-slate-900/85 text-white rounded">
                            <Eye className="w-3 h-3" />
                            <span>Inspect</span>
                          </span>
                        </button>

                        <div className="p-3 text-xs space-y-1 flex-1 flex flex-col justify-between">
                          <div>
                            <div className="font-semibold text-slate-900">
                              {doc.docCategory}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {doc.fileName}
                            </div>
                            {doc.ocrExtractedSummary && (
                              <p className="mt-1 text-[11px] text-slate-600 line-clamp-2">
                                {doc.ocrExtractedSummary}
                              </p>
                            )}
                          </div>
                          <div className="pt-1.5 flex items-center justify-between text-[11px] text-slate-400">
                            <span>{doc.ocrAssisted ? 'OCR Assisted' : 'Manual Attach'}</span>
                            <span className="font-mono">
                              {new Date(doc.uploadedAt).toLocaleDateString('en-IN')}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <p className="text-[11px] text-amber-900 bg-amber-50/70 border border-amber-200 rounded-md p-3">
                Compliance Safeguard: OCR assists data entry only and is not proof of authenticity. Branch Administrator must inspect submitted scans and physical originals before approving KYC.
              </p>
            </div>
          </div>

          {/* Right Column: KYC Review Workbench & History */}
          <div className="lg:col-span-5 space-y-6">
            <div className="vault-card rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h3 className="text-sm font-semibold text-slate-900">KYC Review Decision</h3>
                <KycDecisionText decision={application.kycDecision} />
              </div>

              {application.kycDocuments.length > 0 && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-md flex items-center justify-between gap-2 text-xs">
                  <span className="text-slate-600">
                    <strong className="text-slate-900">{application.kycDocuments.length}</strong>{' '}
                    intake document(s) ready to verify
                  </span>
                  <button
                    type="button"
                    onClick={() => setInspectingDoc(application.kycDocuments[0])}
                    className="inline-flex items-center gap-1 font-medium text-amber-800 hover:underline whitespace-nowrap"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View {application.kycDocuments[0].docCategory}</span>
                  </button>
                </div>
              )}

              {isAdmin ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Select Administrator Decision
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          'Approved',
                          'Requires more information',
                          'Rejected',
                          'Pending',
                        ] as KycDecision[]
                      ).map((dec) => (
                        <button
                          key={dec}
                          type="button"
                          onClick={() => setKycDecision(dec)}
                          className={`px-3 py-2 text-xs font-medium rounded-md border text-left transition-colors ${
                            kycDecision === dec
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {dec}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Review Remarks / Reason{' '}
                      {(kycDecision === 'Rejected' ||
                        kycDecision === 'Requires more information') &&
                        '*'}
                    </label>
                    <textarea
                      rows={3}
                      value={kycRemarks}
                      onChange={(e) => setKycRemarks(e.target.value)}
                      placeholder="Document verification findings, physical sighting confirmation, or required clarifications..."
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md focus:outline-none focus:border-slate-500"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      runAction(
                        () =>
                          portalApi.submitKycReview(currentUser.id, application.id, {
                            decision: kycDecision,
                            remarks: kycRemarks,
                          }),
                        `KYC review recorded as ${kycDecision}.`
                      )
                    }
                    className="btn-bullion w-full py-2.5 px-4 text-xs font-medium rounded-lg disabled:opacity-50 cursor-pointer"
                  >
                    {busy ? 'Recording Decision...' : 'Record KYC Decision'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-slate-600">
                    KYC approval, rejection, and information requests are restricted to{' '}
                    <strong className="text-slate-900">Branch Administrator</strong> role.
                  </p>
                  {!isAuditor && onSwitchStaffRole && (
                    <button
                      type="button"
                      onClick={() => switchToRole('BRANCH_ADMIN')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-amber-900 bg-amber-50 border border-amber-300 hover:bg-amber-100 rounded-md"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Switch to Branch Admin to Review KYC</span>
                    </button>
                  )}
                </div>
              )}

              <div className="pt-2 border-t border-slate-200 space-y-2.5">
                <h4 className="text-xs font-semibold text-slate-700">KYC Review History</h4>
                {application.kycReviewHistory.length === 0 ? (
                  <p className="text-xs text-slate-500">No KYC review actions recorded yet.</p>
                ) : (
                  <div className="space-y-2.5">
                    {application.kycReviewHistory.map((rev) => (
                      <div
                        key={rev.id}
                        className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <KycDecisionText decision={rev.decision} />
                          <span className="font-mono text-[11px] text-slate-500">
                            {new Date(rev.reviewedAt).toLocaleString('en-IN', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </span>
                        </div>
                        <p className="text-slate-700">{rev.remarks}</p>
                        <p className="text-[11px] text-slate-500">
                          Reviewed by {rev.reviewedByName}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* TAB 2: ORNAMENTS & APPRAISAL */}
      {activeTab === 'appraisal' && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-6"
        >
          {/* Rate Card Banner */}
          <div className="vault-card rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="text-xs text-slate-600">
              <span className="font-semibold text-slate-900">Approved Branch Bullion Rate Card:</span>
              <span className="ml-3 font-mono tabular-nums">
                24K: {formatINR(policy.goldRatesPerGram['24K'])}/g · 22K:{' '}
                {formatINR(policy.goldRatesPerGram['22K'])}/g · 20K:{' '}
                {formatINR(policy.goldRatesPerGram['20K'])}/g · 18K:{' '}
                {formatINR(policy.goldRatesPerGram['18K'])}/g
              </span>
            </div>
            <div className="flex items-center gap-3">
              {!isAppraiser && !isAuditor && application.kycDecision === 'Approved' && onSwitchStaffRole && (
                <button
                  type="button"
                  onClick={() => switchToRole('APPRAISER')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-900 bg-amber-50 border border-amber-300 hover:bg-amber-100 rounded-md"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Switch to Authorized Appraiser</span>
                </button>
              )}
              <div className="text-xs text-slate-600">
                Total Appraised Value:{' '}
                <strong className="font-mono tabular-nums text-slate-900 text-sm">
                  {formatINR(totalAppraisedValue)}
                </strong>
              </div>
            </div>
          </div>

          {/* Ornament Cards & Appraiser Inputs */}
          <div className="space-y-4">
            {application.goldItems.map((item, index) => {
              const draft = appraisalItems.find((d) => d.itemId === item.id);
              const preview = draft
                ? computeItemAppraisedValue(
                    draft.grossWeightGrams,
                    draft.stoneDeductionGrams,
                    draft.purity,
                    policy
                  )
                : {
                    netWeightGrams: item.netWeightGrams ?? 0,
                    ratePerGram: item.ratePerGram ?? 0,
                    appraisedValue: item.appraisedValue ?? 0,
                  };

              return (
                <div
                  key={item.id}
                  className="vault-card vault-card-interactive rounded-xl p-5 grid grid-cols-1 lg:grid-cols-12 gap-5"
                >
                  <div className="lg:col-span-4 space-y-2.5">
                    <OrnamentPhoto
                      src={item.livePhotoDataUrl}
                      alt={`${item.itemType} photo`}
                      label={`${item.itemType} (Qty ${item.quantity})`}
                      className="w-full h-44"
                    />
                    <div className="text-xs space-y-1">
                      <div className="font-semibold text-slate-900">
                        Item {index + 1}: {item.itemType} (Qty {item.quantity})
                      </div>
                      <p className="text-slate-600">{item.customerDescription}</p>
                      <p className="text-[11px] text-slate-500">
                        Provenance:{' '}
                        {item.provenanceType === 'generational'
                          ? `Generational (${item.generationalRelation || 'Family Heirloom'} · ${item.hallmarkStatus || 'Unhallmarked'})`
                          : item.purchaseBillAvailable
                            ? `Bill Verified (${item.purchaseBillRef || 'Attached'})`
                            : 'Not Available'}
                      </p>
                    </div>
                    {(draft?.supportingPhotoDataUrl || item.supportingPhotoDataUrl) && (
                      <div className="pt-2 border-t border-slate-200">
                        <div className="text-[11px] font-medium text-slate-500 mb-1">
                          Appraisal Supporting Photo
                        </div>
                        <OrnamentPhoto
                          src={draft?.supportingPhotoDataUrl || item.supportingPhotoDataUrl}
                          alt="Supporting appraisal photo"
                          label="Appraisal Assay Photo"
                          className="w-full h-24"
                        />
                      </div>
                    )}
                  </div>

                  <div className="lg:col-span-8 space-y-4">
                    {isAppraiser && application.kycDecision === 'Approved' && draft ? (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Gross Weight (g) *
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={draft.grossWeightGrams || ''}
                            onChange={(e) =>
                              setAppraisalItems((prev) =>
                                prev.map((p) =>
                                  p.itemId === item.id
                                    ? { ...p, grossWeightGrams: Number(e.target.value) }
                                    : p
                                )
                              )
                            }
                            className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-md"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Stone Deduction (g)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={draft.stoneDeductionGrams}
                            onChange={(e) =>
                              setAppraisalItems((prev) =>
                                prev.map((p) =>
                                  p.itemId === item.id
                                    ? { ...p, stoneDeductionGrams: Number(e.target.value) }
                                    : p
                                )
                              )
                            }
                            className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-md"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Purity Grade *
                          </label>
                          <select
                            value={draft.purity}
                            onChange={(e) =>
                              setAppraisalItems((prev) =>
                                prev.map((p) =>
                                  p.itemId === item.id
                                    ? { ...p, purity: e.target.value as PurityGrade }
                                    : p
                                )
                              )
                            }
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
                          >
                            {(['24K', '22K', '20K', '18K'] as PurityGrade[]).map((grade) => (
                              <option key={grade} value={grade}>
                                {grade} ({formatINR(policy.goldRatesPerGram[grade])}/g)
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Stone / Bead Details
                          </label>
                          <input
                            type="text"
                            value={draft.stoneDetails}
                            onChange={(e) =>
                              setAppraisalItems((prev) =>
                                prev.map((p) =>
                                  p.itemId === item.id
                                    ? { ...p, stoneDetails: e.target.value }
                                    : p
                                )
                              )
                            }
                            placeholder="e.g., Synthetic Kemp stones, enamel lacquer"
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                          />
                        </div>

                        <div className="bg-slate-50 border border-slate-200 rounded-md p-2.5">
                          <div className="text-[11px] text-slate-500">Computed Net &amp; Value</div>
                          <div className="mt-0.5 text-xs font-mono tabular-nums text-slate-900 font-semibold">
                            {formatGrams(preview.netWeightGrams)} · {formatINR(preview.appraisedValue)}
                          </div>
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Appraiser Assay Notes
                          </label>
                          <input
                            type="text"
                            value={draft.appraiserNotes}
                            onChange={(e) =>
                              setAppraisalItems((prev) =>
                                prev.map((p) =>
                                  p.itemId === item.id
                                    ? { ...p, appraiserNotes: e.target.value }
                                    : p
                                )
                              )
                            }
                            placeholder="Acid test, XRF purity reading, hallmark stamp observations"
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                          />
                        </div>

                        <div className="flex items-end gap-2">
                          <button
                            type="button"
                            onClick={() => setSupportingPhotoItemId(item.id)}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            <span>Assay Photo</span>
                          </button>
                          <label className="inline-flex items-center justify-center px-2.5 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50 cursor-pointer">
                            <Upload className="w-3.5 h-3.5" />
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (!f) return;
                                const r = new FileReader();
                                r.onload = () =>
                                  setAppraisalItems((prev) =>
                                    prev.map((p) =>
                                      p.itemId === item.id
                                        ? { ...p, supportingPhotoDataUrl: String(r.result) }
                                        : p
                                    )
                                  );
                                r.readAsDataURL(f);
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                        <div>
                          <div className="text-slate-500">Gross Weight</div>
                          <div className="mt-1 font-mono tabular-nums font-medium text-slate-900">
                            {item.grossWeightGrams ? formatGrams(item.grossWeightGrams) : 'Pending'}
                          </div>
                        </div>
                        <div>
                          <div className="text-slate-500">Stone Deduction</div>
                          <div className="mt-1 font-mono tabular-nums font-medium text-slate-900">
                            {item.stoneDeductionGrams !== undefined
                              ? formatGrams(item.stoneDeductionGrams)
                              : '—'}
                          </div>
                        </div>
                        <div>
                          <div className="text-slate-500">Net Gold Weight</div>
                          <div className="mt-1 font-mono tabular-nums font-semibold text-slate-900">
                            {item.netWeightGrams ? formatGrams(item.netWeightGrams) : 'Pending'}
                          </div>
                        </div>
                        <div>
                          <div className="text-slate-500">Purity &amp; Value</div>
                          <div className="mt-1 font-mono tabular-nums font-semibold text-slate-900">
                            {item.purity ? `${item.purity} · ${formatINR(item.appraisedValue)}` : 'Pending'}
                          </div>
                        </div>
                        <div className="col-span-2 sm:col-span-4 pt-2 border-t border-slate-100">
                          <span className="text-slate-500">Stone Details:</span>{' '}
                          <span className="text-slate-800">{item.stoneDetails || 'Not assessed'}</span>
                          {item.appraiserNotes && (
                            <p className="mt-1 text-slate-600">
                              <span className="text-slate-500">Appraiser Notes:</span>{' '}
                              {item.appraiserNotes}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Appraiser Submit Bar */}
          {isAppraiser && (
            <div className="vault-card rounded-xl p-5 space-y-3">
              {application.kycDecision !== 'Approved' ? (
                <p className="text-xs text-amber-800">
                  KYC must be Approved by a Branch Administrator before an appraisal can be submitted.
                </p>
              ) : (
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div className="flex-1 min-w-[260px]">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Overall Appraisal Summary &amp; Verification Remarks
                    </label>
                    <input
                      type="text"
                      value={appraisalRemarks}
                      onChange={(e) => setAppraisalRemarks(e.target.value)}
                      placeholder="e.g., XRF & touchstone checks completed across all pledged ornaments."
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      runAction(
                        () =>
                          portalApi.submitAppraisal(currentUser.id, application.id, {
                            items: appraisalItems,
                            remarks: appraisalRemarks,
                          }),
                        'Bullion appraisal saved and added to appraisal history.'
                      )
                    }
                    className="btn-bullion px-5 py-2.5 text-xs font-medium rounded-lg disabled:opacity-50 whitespace-nowrap cursor-pointer"
                  >
                    {busy ? 'Saving Appraisal...' : 'Record Gold Appraisal'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Appraisal History */}
          <div className="vault-card rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-slate-500" />
              <h3 className="text-sm font-semibold text-slate-900">
                Retained Appraisal History
              </h3>
            </div>
            {application.appraisalHistory.length === 0 ? (
              <p className="text-xs text-slate-500">No appraisal records logged yet.</p>
            ) : (
              <div className="space-y-3">
                {application.appraisalHistory.map((entry) => (
                  <div
                    key={entry.id}
                    className="p-4 border border-slate-200 rounded-md bg-slate-50/70 text-xs space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-semibold text-slate-900">{entry.appraiserName}</span>
                        <span className="mx-1.5 text-slate-400">·</span>
                        <span className="font-mono text-slate-500">
                          {new Date(entry.appraisedAt).toLocaleString('en-IN', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </span>
                      </div>
                      <div className="font-mono tabular-nums font-semibold text-slate-900">
                        Gross {formatGrams(entry.totalGrossWeightGrams)} · Net{' '}
                        {formatGrams(entry.totalNetWeightGrams)} · {formatINR(entry.totalAppraisedValue)}
                      </div>
                    </div>
                    <p className="text-slate-700">{entry.remarks}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* TAB 3: LOAN OFFER & REPAYMENT PLAN */}
      {activeTab === 'offer' && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-6"
        >
          {totalAppraisedValue <= 0 ? (
            <div className="p-6 vault-card rounded-xl text-xs text-slate-600">
              Loan eligibility and repayment schedules become available once the Authorized Appraiser records the gold valuation.
            </div>
          ) : (
            <>
              {/* Three Distinct Amount Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-5 vault-card vault-card-interactive rounded-xl">
                  <div className="text-xs font-medium text-slate-500">
                    1. Maximum Eligible Amount ({policy.maxLtvPercent}% LTV)
                  </div>
                  <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900">
                    {formatINR(liveOfferPreview.terms.maxEligibleAmount)}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Policy ceiling on {formatINR(totalAppraisedValue)} appraised gold
                  </p>
                </div>

                <div className="p-5 vault-card vault-card-interactive rounded-xl">
                  <div className="text-xs font-medium text-slate-500">
                    2. Customer Requested Amount
                  </div>
                  <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900">
                    {formatINR(requestedAmount)}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {requestedAmount > liveOfferPreview.terms.maxEligibleAmount
                      ? 'Exceeds policy LTV ceiling — capped on sanction'
                      : 'Within eligible LTV ceiling'}
                  </p>
                </div>

                <div className="p-5 vault-card vault-card-interactive rounded-xl bg-gradient-to-br from-amber-50/75 to-white border-amber-200/80">
                  <div className="text-xs font-medium text-amber-900">
                    3. Sanctioned Principal Amount
                  </div>
                  <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-amber-950">
                    {formatINR(liveOfferPreview.terms.sanctionedAmount)}
                  </div>
                  <p className="mt-1 text-xs text-amber-800">
                    Net Disbursement: {formatINR(liveOfferPreview.terms.netDisbursementAmount)}
                  </p>
                </div>
              </div>

              {/* Configurator + Breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-5 vault-card rounded-xl p-5 space-y-4">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Configure Loan Terms &amp; Repayment Plan
                  </h3>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Customer Requested Amount (₹)
                      </label>
                      <input
                        type="number"
                        disabled={!isStaffOrAdmin}
                        value={requestedAmount}
                        onChange={(e) => setRequestedAmount(Number(e.target.value) || 0)}
                        className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-md disabled:bg-slate-100"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Sanctioned Amount (₹ · Max {formatINR(liveOfferPreview.terms.maxEligibleAmount)})
                      </label>
                      <input
                        type="number"
                        disabled={!isStaffOrAdmin}
                        max={liveOfferPreview.terms.maxEligibleAmount}
                        value={sanctionedAmount}
                        onChange={(e) => setSanctionedAmount(Number(e.target.value) || 0)}
                        className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-md disabled:bg-slate-100"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Tenure (Months)
                        </label>
                        <select
                          disabled={!isStaffOrAdmin}
                          value={tenureMonths}
                          onChange={(e) => setTenureMonths(Number(e.target.value))}
                          className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md bg-white disabled:bg-slate-100"
                        >
                          {policy.allowedTenuresMonths.map((m) => (
                            <option key={m} value={m}>
                              {m} Months
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Repayment Plan
                        </label>
                        <select
                          disabled={!isStaffOrAdmin}
                          value={repaymentScheme}
                          onChange={(e) => setRepaymentScheme(e.target.value as RepaymentScheme)}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white disabled:bg-slate-100"
                        >
                          {(['Monthly EMI', 'Quarterly Interest', 'Bullet Maturity'] as RepaymentScheme[]).map(
                            (s) => (
                              <option key={s} value={s}>
                                {s} ({policy.interestRatesByScheme[s]}%)
                              </option>
                            )
                          )}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Charges & Fees Ledger */}
                  <div className="pt-3 border-t border-slate-200 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Applicable Interest Rate (p.a.)</span>
                      <span className="font-mono tabular-nums font-medium text-slate-900">
                        {liveOfferPreview.terms.annualInterestRate.toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">
                        Processing Fee ({policy.processingFeePercent}%)
                      </span>
                      <span className="font-mono tabular-nums text-slate-900">
                        {formatINR(liveOfferPreview.terms.processingFeeAmount)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Assay &amp; Valuation Fee</span>
                      <span className="font-mono tabular-nums text-slate-900">
                        {formatINR(liveOfferPreview.terms.valuationFeeAmount)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">GST on Fees ({policy.gstPercent}%)</span>
                      <span className="font-mono tabular-nums text-slate-900">
                        {formatINR(liveOfferPreview.terms.gstOnFeesAmount)}
                      </span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-slate-200 font-semibold text-slate-900">
                      <span>Net Bank Disbursement</span>
                      <span className="font-mono tabular-nums">
                        {formatINR(liveOfferPreview.terms.netDisbursementAmount)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Total Interest Over Tenure</span>
                      <span className="font-mono tabular-nums">
                        {formatINR(liveOfferPreview.terms.totalInterestPayable)}
                      </span>
                    </div>
                    <div className="flex justify-between font-semibold text-slate-900">
                      <span>Total Repayable</span>
                      <span className="font-mono tabular-nums">
                        {formatINR(liveOfferPreview.terms.totalRepayableAmount)}
                      </span>
                    </div>
                  </div>

                  {isStaffOrAdmin && (
                    <div className="pt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={
                          busy ||
                          sanctionedAmount <= 0 ||
                          sanctionedAmount > liveOfferPreview.terms.maxEligibleAmount
                        }
                        onClick={() =>
                          runAction(
                            () =>
                              portalApi.saveLoanOffer(currentUser.id, application.id, {
                                requestedAmount,
                                sanctionedAmount,
                                tenureMonths,
                                repaymentScheme,
                                submitForSanction: false,
                              }),
                            'Loan offer terms saved.'
                          )
                        }
                        className="flex-1 px-3 py-2 text-xs font-medium text-slate-800 border border-slate-300 bg-white hover:bg-slate-50 rounded-md disabled:opacity-50 whitespace-nowrap"
                      >
                        Save Offer Draft
                      </button>
                      <button
                        type="button"
                        disabled={
                          busy ||
                          sanctionedAmount <= 0 ||
                          sanctionedAmount > liveOfferPreview.terms.maxEligibleAmount
                        }
                        onClick={() =>
                          runAction(
                            () =>
                              portalApi.saveLoanOffer(currentUser.id, application.id, {
                                requestedAmount,
                                sanctionedAmount,
                                tenureMonths,
                                repaymentScheme,
                                submitForSanction: true,
                              }),
                            'Loan offer locked and Sanction Letter issued.'
                          )
                        }
                        className="btn-bullion flex-1 px-3 py-2 text-xs font-medium rounded-lg disabled:opacity-50 whitespace-nowrap cursor-pointer"
                      >
                        Issue Sanction Letter
                      </button>
                    </div>
                  )}
                </div>

                {/* Repayment Schedule Table */}
                <div className="lg:col-span-7 vault-card rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">
                      Repayment Schedule ({repaymentScheme})
                    </h3>
                    <span className="text-xs font-mono tabular-nums text-slate-600">
                      {repaymentScheme === 'Monthly EMI'
                        ? `EMI: ${formatINR(liveOfferPreview.terms.monthlyInstallment)}/mo`
                        : `Avg Servicing: ${formatINR(liveOfferPreview.terms.monthlyInstallment)}/mo`}
                    </span>
                  </div>
                  <div className="max-h-[420px] overflow-y-auto">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                        <tr>
                          <th className="py-2.5 px-4">#</th>
                          <th className="py-2.5 px-4">Due</th>
                          <th className="py-2.5 px-4 text-right">Principal</th>
                          <th className="py-2.5 px-4 text-right">Interest</th>
                          <th className="py-2.5 px-4 text-right">Total Due</th>
                          <th className="py-2.5 px-4 text-right">Closing Bal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-xs font-mono tabular-nums">
                        {liveOfferPreview.schedule.map((row) => (
                          <tr key={row.installmentNumber} className="hover:bg-slate-50">
                            <td className="py-2 px-4 text-slate-500">{row.installmentNumber}</td>
                            <td className="py-2 px-4 font-sans text-slate-800">{row.dueLabel}</td>
                            <td className="py-2 px-4 text-right text-slate-700">
                              {formatINR(row.principalComponent)}
                            </td>
                            <td className="py-2 px-4 text-right text-slate-700">
                              {formatINR(row.interestComponent)}
                            </td>
                            <td className="py-2 px-4 text-right font-semibold text-slate-900">
                              {formatINR(row.totalPayment)}
                            </td>
                            <td className="py-2 px-4 text-right text-slate-500">
                              {formatINR(row.closingPrincipal)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}
        </motion.div>
      )}

      {/* TAB 4: SANCTION LETTER & SIGNING */}
      {activeTab === 'sanction' && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-6"
        >
          {!application.loanOffer ? (
            <div className="p-6 vault-card rounded-xl text-xs text-slate-600 flex flex-wrap items-center justify-between gap-4">
              <span>Configure and issue the Loan Offer first to generate the Sanction Letter.</span>
              <button
                type="button"
                onClick={() => setActiveTab('offer')}
                className="btn-bullion inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg cursor-pointer"
              >
                <span>Go to Loan Offer</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <>
              <div className="vault-card rounded-xl px-5 py-4 flex flex-wrap items-center justify-between gap-4 no-print">
                <div className="space-y-0.5 text-xs">
                  <div className="text-slate-700">
                    Sanction Letter:{' '}
                    <strong className="font-mono text-slate-900">
                      {application.sanctionSigning?.sanctionLetterNumber ??
                        `SL-${application.applicationNumber}`}
                    </strong>
                  </div>
                  <div className={isDualSigned ? 'text-emerald-700 font-medium' : 'text-amber-800'}>
                    {isDualSigned
                      ? 'Signed by both Customer & Branch Admin — Download & Print unlocked.'
                      : `Locked until both parties sign (${
                          (application.sanctionSigning?.customerSigned ? 1 : 0) +
                          (application.sanctionSigning?.branchRepSigned ? 1 : 0)
                        }/2 signatures captured).`}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!isDualSigned || exportingPdf}
                    onClick={handleDownloadSanctionPdf}
                    title={
                      isDualSigned
                        ? 'Download signed Sanction Letter PDF with ornament photos'
                        : 'Unlocks once both Customer and Branch Admin sign below'
                    }
                    className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-md transition-colors ${
                      isDualSigned
                        ? 'text-white bg-slate-900 hover:bg-slate-800'
                        : 'text-slate-400 bg-slate-100 border border-slate-200 cursor-not-allowed'
                    }`}
                  >
                    {isDualSigned ? (
                      <Download className="w-3.5 h-3.5" />
                    ) : (
                      <Lock className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {exportingPdf
                        ? 'Generating PDF...'
                        : isDualSigned
                          ? 'Download Sanction PDF'
                          : 'PDF Locked (2 Signatures Needed)'}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={!isDualSigned}
                    onClick={handlePrintSanctionLetter}
                    title={
                      isDualSigned
                        ? 'Print dual-signed Sanction Letter with ornament photos'
                        : 'Unlocks once both Customer and Branch Admin sign below'
                    }
                    className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-md border transition-colors ${
                      isDualSigned
                        ? 'text-slate-800 bg-white border-slate-300 hover:bg-slate-50'
                        : 'text-slate-400 bg-slate-100 border-slate-200 cursor-not-allowed'
                    }`}
                  >
                    {isDualSigned ? (
                      <Printer className="w-3.5 h-3.5" />
                    ) : (
                      <Lock className="w-3.5 h-3.5" />
                    )}
                    <span>Print Letter</span>
                  </button>
                </div>
              </div>

              {/* Dual-Signed Next-Step Callout */}
              {application.sanctionSigning?.customerSigned &&
                application.sanctionSigning?.branchRepSigned && (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-md flex flex-wrap items-center justify-between gap-3 no-print">
                    <div className="flex items-center gap-2.5 text-xs text-emerald-950">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                      <div>
                        <span className="font-semibold">
                          Sanction Letter Signed by Both Parties.
                        </span>{' '}
                        <span className="text-emerald-900">
                          Proceed to Collateral Vaulting and Bank Disbursement.
                        </span>
                      </div>
                    </div>
                    {isAdmin || isAuditor ? (
                      <button
                        type="button"
                        onClick={() => setActiveTab('collateral')}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-md whitespace-nowrap"
                      >
                        <span>Proceed to Collateral &amp; Disbursement</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      onSwitchStaffRole && (
                        <button
                          type="button"
                          onClick={() => switchToRole('BRANCH_ADMIN', 'collateral')}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-md whitespace-nowrap"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>Switch to Branch Admin &amp; Open Collateral Vault</span>
                        </button>
                      )
                    )}
                  </div>
                )}

              {/* Printable Sanction Letter Document */}
              <div
                ref={sanctionLetterRef}
                className="vault-card rounded-xl p-8 space-y-6 print-only-container"
              >
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">
                      {policy.organizationName}
                    </h3>
                    <p className="text-xs text-slate-500">
                      Gold Loan Sanction Letter &amp; Key Fact Statement · {application.branchName}
                    </p>
                  </div>
                  <div className="text-right text-xs space-y-0.5">
                    <div className="font-mono font-semibold text-slate-900">
                      {application.sanctionSigning?.sanctionLetterNumber ??
                        `SL-${application.applicationNumber}`}
                    </div>
                    <div className="text-slate-500 font-mono">
                      Date:{' '}
                      {new Date(
                        application.sanctionSigning?.generatedAt ?? application.updatedAt
                      ).toLocaleDateString('en-IN')}
                    </div>
                  </div>
                </div>

                {/* Borrower Details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1">
                    <div className="text-slate-500 font-medium">Borrower Details</div>
                    <div className="font-semibold text-slate-900">
                      {application.customer.fullName}
                    </div>
                    <div className="text-slate-700">{application.customer.address}</div>
                    <div className="font-mono text-slate-700">
                      Phone: {application.customer.phone} · PAN: {application.customer.panNumber} · Aadhaar:{' '}
                      {application.customer.aadhaarMasked}
                    </div>
                  </div>

                  <div className="space-y-1 sm:text-right">
                    <div className="text-slate-500 font-medium">Disbursement Bank Account</div>
                    <div className="font-semibold text-slate-900">
                      {application.bankAccount.bankName}
                    </div>
                    <div className="font-mono text-slate-700">
                      A/C: {application.bankAccount.accountNumberMasked} · IFSC:{' '}
                      {application.bankAccount.ifscCode}
                    </div>
                    <div className="text-slate-600">
                      Holder: {application.bankAccount.accountHolderName}
                    </div>
                  </div>
                </div>

                {/* Loan Terms Summary */}
                <div className="border border-slate-200 rounded-md overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-900">
                    Sanctioned Facility &amp; Fee Summary
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 text-xs">
                    <div className="p-3.5">
                      <div className="text-slate-500">Max Eligible ({policy.maxLtvPercent}% LTV)</div>
                      <div className="mt-1 font-mono tabular-nums font-semibold text-slate-900">
                        {formatINR(application.loanOffer.maxEligibleAmount)}
                      </div>
                    </div>
                    <div className="p-3.5">
                      <div className="text-slate-500">Requested / Sanctioned</div>
                      <div className="mt-1 font-mono tabular-nums font-semibold text-slate-900">
                        {formatINR(application.loanOffer.requestedAmount)} /{' '}
                        {formatINR(application.loanOffer.sanctionedAmount)}
                      </div>
                    </div>
                    <div className="p-3.5">
                      <div className="text-slate-500">Interest &amp; Tenure</div>
                      <div className="mt-1 font-mono tabular-nums font-semibold text-slate-900">
                        {application.loanOffer.annualInterestRate}% p.a. ·{' '}
                        {application.loanOffer.tenureMonths}m ({application.loanOffer.repaymentScheme})
                      </div>
                    </div>
                    <div className="p-3.5">
                      <div className="text-slate-500">Charges &amp; Net Payout</div>
                      <div className="mt-1 font-mono tabular-nums font-semibold text-slate-900">
                        Fees{' '}
                        {formatINR(
                          application.loanOffer.processingFeeAmount +
                            application.loanOffer.valuationFeeAmount +
                            application.loanOffer.gstOnFeesAmount
                        )}{' '}
                        · Net {formatINR(application.loanOffer.netDisbursementAmount)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pledged Gold Schedule */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-900">
                    Pledged Gold Collateral Schedule
                  </div>
                  <table className="w-full text-left border-collapse border border-slate-200 text-xs">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr className="border-b border-slate-200">
                        <th className="py-2 px-3">Photo</th>
                        <th className="py-2 px-3">Item &amp; Description</th>
                        <th className="py-2 px-3 text-right">Gross (g)</th>
                        <th className="py-2 px-3 text-right">Net (g)</th>
                        <th className="py-2 px-3 text-right">Purity</th>
                        <th className="py-2 px-3 text-right">Appraised Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {application.goldItems.map((item) => (
                        <tr key={item.id}>
                          <td className="py-2 px-3 w-16">
                            <OrnamentPhoto
                              src={item.livePhotoDataUrl}
                              alt={item.itemType}
                              label={item.itemType}
                              className="w-12 h-10"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <div className="font-medium text-slate-900">
                              {item.itemType} (Qty {item.quantity})
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {item.customerDescription}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums">
                            {formatGrams(item.grossWeightGrams)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums">
                            {formatGrams(item.netWeightGrams)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono">{item.purity}</td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums font-medium">
                            {formatINR(item.appraisedValue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Dual Signing Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-200">
                  {/* Customer Signature */}
                  <div className="p-4 border border-slate-200 rounded-md space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-900">
                        1. Customer Acceptance &amp; Signature
                      </span>
                      {application.sanctionSigning?.customerSigned && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                          <FileCheck2 className="w-3.5 h-3.5" />
                          <span>Signed</span>
                        </span>
                      )}
                    </div>
                    {application.sanctionSigning?.customerSignatureDataUrl ? (
                      <div className="space-y-1">
                        <img
                          src={application.sanctionSigning.customerSignatureDataUrl}
                          alt="Customer signature"
                          className="h-20 border border-slate-200 rounded bg-white"
                        />
                        <div className="text-[11px] text-slate-500 font-mono">
                          Signed by {application.customer.fullName} ·{' '}
                          {new Date(
                            application.sanctionSigning.customerSignedAt!
                          ).toLocaleString('en-IN')}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs text-slate-500">
                          {application.sanctionSigning?.customerSigned
                            ? `Signed on ${new Date(application.sanctionSigning.customerSignedAt!).toLocaleString('en-IN')}`
                            : 'Awaiting customer digital signature on sanction terms.'}
                        </p>
                        {isStaffOrAdmin && !application.sanctionSigning?.customerSigned && (
                          <button
                            type="button"
                            onClick={() => setSigningFor('customer')}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md no-print"
                          >
                            <PenTool className="w-3.5 h-3.5" />
                            <span>Capture Customer Signature</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Authorized Branch Rep Signature */}
                  <div className="p-4 border border-slate-200 rounded-md space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-900">
                        2. Authorized Branch Representative
                      </span>
                      {application.sanctionSigning?.branchRepSigned && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Countersigned</span>
                        </span>
                      )}
                    </div>
                    {application.sanctionSigning?.branchRepSignatureDataUrl ? (
                      <div className="space-y-1">
                        <img
                          src={application.sanctionSigning.branchRepSignatureDataUrl}
                          alt="Branch representative signature"
                          className="h-20 border border-slate-200 rounded bg-white"
                        />
                        <div className="text-[11px] text-slate-500 font-mono">
                          Countersigned by {application.sanctionSigning.branchRepName} ·{' '}
                          {new Date(
                            application.sanctionSigning.branchRepSignedAt!
                          ).toLocaleString('en-IN')}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        <p className="text-xs text-slate-500">
                          {application.sanctionSigning?.branchRepSigned
                            ? `Countersigned by ${application.sanctionSigning.branchRepName}`
                            : 'Requires signature from Authorized Branch Administrator on the sanction pad.'}
                        </p>
                        {isAdmin && !application.sanctionSigning?.branchRepSigned && (
                          <button
                            type="button"
                            onClick={() => setSigningFor('branch_rep')}
                            className="btn-bullion inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg no-print cursor-pointer"
                          >
                            <PenTool className="w-3.5 h-3.5" />
                            <span>Capture Branch Admin Signature</span>
                          </button>
                        )}
                        {!isAdmin &&
                          !application.sanctionSigning?.branchRepSigned &&
                          onSwitchStaffRole && (
                            <button
                              type="button"
                              onClick={() => {
                                const adminUser = staffDirectory.find(
                                  (s) => s.role === 'BRANCH_ADMIN'
                                );
                                if (adminUser) onSwitchStaffRole(adminUser.id);
                              }}
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-amber-900 bg-amber-50 border border-amber-300 hover:bg-amber-100 rounded-md no-print"
                            >
                              <PenTool className="w-3.5 h-3.5" />
                              <span>Switch to Branch Admin to Sign</span>
                            </button>
                          )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </motion.div>
      )}

      {/* TAB 5: COLLATERAL & DISBURSEMENT */}
      {activeTab === 'collateral' && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          className="grid grid-cols-1 lg:grid-cols-12 gap-6"
        >
          {/* Left: Collateral Storage & Custody Chain */}
          <div className="lg:col-span-6 space-y-6">
            <div className="vault-card rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  Collateral Vault Packaging &amp; Custody
                </h3>
                {application.collateralStorage && (
                  <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-emerald-700">
                    <Lock className="w-3.5 h-3.5" />
                    <span>{application.collateralStorage.packageSealNumber}</span>
                  </span>
                )}
              </div>

              {isAdmin &&
              ['Sanctioned', 'Collateral Stored'].includes(application.status) ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Tamper-Evident Seal Number *
                      </label>
                      <input
                        type="text"
                        value={sealNumber}
                        onChange={(e) => setSealNumber(e.target.value.toUpperCase())}
                        className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Storage Box / Tray # *
                      </label>
                      <input
                        type="text"
                        value={storageBoxNumber}
                        onChange={(e) => setStorageBoxNumber(e.target.value.toUpperCase())}
                        className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Vault Location *
                      </label>
                      <input
                        type="text"
                        value={vaultLocation}
                        onChange={(e) => setVaultLocation(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Handed Over By
                      </label>
                      <select
                        value={handedOverById}
                        onChange={(e) => setHandedOverById(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white"
                      >
                        {staffDirectory
                          .filter((s) => s.role !== 'AUDITOR')
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.role})
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Custody Handover Notes
                    </label>
                    <input
                      type="text"
                      value={custodyNotes}
                      onChange={(e) => setCustodyNotes(e.target.value)}
                      placeholder="Dual-key vault deposit confirmation..."
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      runAction(
                        () =>
                          portalApi.saveCollateralStorage(currentUser.id, application.id, {
                            packageSealNumber: sealNumber,
                            vaultLocation,
                            storageBoxNumber,
                            handedOverById,
                            notes: custodyNotes,
                          }),
                        'Collateral sealed and stored in vault.'
                      )
                    }
                    className="w-full py-2 px-4 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md disabled:opacity-50"
                  >
                    {busy ? 'Recording Custody...' : 'Record Seal & Vault Handover'}
                  </button>
                </div>
              ) : application.collateralStorage ? (
                <dl className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <dt className="text-slate-500">Package Seal #</dt>
                    <dd className="mt-0.5 font-mono font-semibold text-slate-900">
                      {application.collateralStorage.packageSealNumber}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Storage Box</dt>
                    <dd className="mt-0.5 font-mono font-semibold text-slate-900">
                      {application.collateralStorage.storageBoxNumber}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Vault Location</dt>
                    <dd className="mt-0.5 text-slate-900">
                      {application.collateralStorage.vaultLocation}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Custody Handover</dt>
                    <dd className="mt-0.5 text-slate-900">
                      {application.collateralStorage.handedOverByName} →{' '}
                      {application.collateralStorage.receivedByName}
                    </dd>
                  </div>
                </dl>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500">
                    {application.status === 'Sanctioned'
                      ? 'Sanction Letter is dual-signed. Switch to Branch Administrator to record tamper-evident seal & vault location.'
                      : 'Collateral packaging and vault storage can be recorded by the Branch Administrator once the Sanction Letter is signed by both parties.'}
                  </p>
                  {!isAdmin &&
                    !isAuditor &&
                    application.status === 'Sanctioned' &&
                    onSwitchStaffRole && (
                      <button
                        type="button"
                        onClick={() => switchToRole('BRANCH_ADMIN')}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-amber-900 bg-amber-50 border border-amber-300 hover:bg-amber-100 rounded-md"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Switch to Branch Admin to Record Vault Seal</span>
                      </button>
                    )}
                </div>
              )}

              {/* Custody Chain History */}
              {application.collateralStorage && (
                <div className="pt-3 border-t border-slate-200 space-y-3">
                  <h4 className="text-xs font-semibold text-slate-700">Vault Custody Audit Trail</h4>
                  <div className="space-y-2">
                    {application.collateralStorage.custodyLog.map((c) => (
                      <div
                        key={c.id}
                        className="p-2.5 bg-slate-50 border border-slate-200 rounded text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-900">{c.event}</span>
                          <span className="font-mono text-[11px] text-slate-500">
                            {new Date(c.timestamp).toLocaleString('en-IN', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </span>
                        </div>
                        <p className="text-slate-600 mt-0.5">{c.notes}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Custodian: {c.actorName} ({c.actorRole})
                        </p>
                      </div>
                    ))}
                  </div>

                  {(isAdmin || isAppraiser) && (
                    <div className="pt-2 border-t border-slate-200 flex flex-wrap gap-2">
                      <input
                        type="text"
                        value={newCustodyEvent}
                        onChange={(e) => setNewCustodyEvent(e.target.value)}
                        placeholder="Event (e.g., Seal Verified)"
                        className="w-40 px-2.5 py-1.5 text-xs border border-slate-300 rounded-md"
                      />
                      <input
                        type="text"
                        value={newCustodyNotes}
                        onChange={(e) => setNewCustodyNotes(e.target.value)}
                        placeholder="Inspection remark..."
                        className="flex-1 min-w-[160px] px-2.5 py-1.5 text-xs border border-slate-300 rounded-md"
                      />
                      <button
                        type="button"
                        disabled={busy || !newCustodyNotes.trim()}
                        onClick={() =>
                          runAction(
                            () =>
                              portalApi.appendCustodyEvent(currentUser.id, application.id, {
                                event: newCustodyEvent,
                                notes: newCustodyNotes,
                              }),
                            'Custody inspection event logged.'
                          ).then(() => setNewCustodyNotes(''))
                        }
                        className="px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-md disabled:opacity-50"
                      >
                        Log Check
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right: Bank Account Verification & Disbursement */}
          <div className="lg:col-span-6 space-y-6">
            <div className="vault-card rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  Verified Bank Details &amp; Disbursement
                </h3>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-700">
                  <Banknote className="w-3.5 h-3.5 text-amber-700" />
                  <span>{application.disbursement.status}</span>
                </span>
              </div>

              <dl className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3.5 border border-slate-200 rounded-md">
                <div>
                  <dt className="text-slate-500">Account Holder</dt>
                  <dd className="mt-0.5 font-medium text-slate-900">
                    {application.bankAccount.accountHolderName}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Bank &amp; IFSC</dt>
                  <dd className="mt-0.5 font-mono text-slate-900">
                    {application.bankAccount.bankName} · {application.bankAccount.ifscCode}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Account Number (Masked)</dt>
                  <dd className="mt-0.5 font-mono font-semibold text-slate-900">
                    {application.bankAccount.accountNumberMasked}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Verification Status</dt>
                  <dd
                    className={`mt-0.5 font-semibold ${
                      application.bankAccount.verificationStatus === 'Verified'
                        ? 'text-emerald-700'
                        : 'text-amber-700'
                    }`}
                  >
                    {application.bankAccount.verificationStatus}
                  </dd>
                </div>
              </dl>

              {isAdmin && application.collateralStorage ? (
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-xs text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={verifyBankAccount}
                      onChange={(e) => setVerifyBankAccount(e.target.checked)}
                      className="rounded border-slate-300 text-amber-700"
                    />
                    <span>
                      Confirm beneficiary bank account verified (penny-drop / cancelled cheque match)
                    </span>
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Disbursement Status
                      </label>
                      <select
                        value={disbursementStatus}
                        onChange={(e) =>
                          setDisbursementStatus(
                            e.target.value as 'Pending' | 'Initiated' | 'Disbursed'
                          )
                        }
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white"
                      >
                        <option value="Pending">Pending</option>
                        <option value="Initiated">Initiated</option>
                        <option value="Disbursed">Disbursed</option>
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-medium text-slate-700">
                          UTR / Payment Reference #
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setUtrReference(
                              `AVUTR${new Date().toISOString().slice(0, 10).replace(/-/g, '')}${application.id.slice(-4)}`
                            )
                          }
                          className="text-[11px] font-medium text-amber-800 hover:underline"
                        >
                          Generate UTR
                        </button>
                      </div>
                      <input
                        type="text"
                        value={utrReference}
                        onChange={(e) => setUtrReference(e.target.value.toUpperCase())}
                        placeholder="e.g., HDFCR520261117004912"
                        className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Disbursement Remarks
                    </label>
                    <input
                      type="text"
                      value={disbursementRemarks}
                      onChange={(e) => setDisbursementRemarks(e.target.value)}
                      placeholder="NEFT / RTGS payout confirmation notes"
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      runAction(
                        () =>
                          portalApi.updateDisbursement(currentUser.id, application.id, {
                            verifyBankAccount,
                            disbursementStatus,
                            utrReference,
                            remarks: disbursementRemarks,
                          }),
                        `Disbursement status updated to ${disbursementStatus}.`
                      )
                    }
                    className="btn-bullion w-full py-2.5 px-4 text-xs font-medium rounded-lg disabled:opacity-50 cursor-pointer"
                  >
                    {busy ? 'Updating Disbursement...' : 'Save Bank Verification & Disbursement'}
                  </button>
                </div>
              ) : application.disbursement.status === 'Disbursed' ? (
                <div className="space-y-4">
                  <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-md text-xs space-y-1">
                    <div className="font-semibold text-emerald-900">
                      Disbursed {formatINR(application.disbursement.disbursedAmount)}
                    </div>
                    <div className="font-mono text-emerald-800">
                      UTR: {application.disbursement.utrReference}
                    </div>
                    <div className="text-emerald-800">
                      Released by {application.disbursement.disbursedByName} on{' '}
                      {new Date(application.disbursement.disbursedAt!).toLocaleString('en-IN')}
                    </div>
                  </div>

                  {/* Repayment & Counter Collection Summary */}
                  {application.loanOffer && (
                    <div className="pt-3 border-t border-slate-200 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                          <Receipt className="w-4 h-4 text-amber-700" />
                          <span>
                            EMI Collections ({application.repayments?.length ?? 0}/
                            {application.loanOffer.repaymentScheme === 'Bullet Maturity'
                              ? 1
                              : application.loanOffer.repaymentScheme === 'Quarterly Interest'
                                ? Math.max(1, Math.ceil(application.loanOffer.tenureMonths / 3))
                                : application.loanOffer.tenureMonths}{' '}
                            Paid)
                          </span>
                        </div>
                        {isStaffOrAdmin && (
                          <div className="flex items-center gap-2">
                            <select
                              value={counterPayMode}
                              onChange={(e) =>
                                setCounterPayMode(
                                  e.target.value as 'Branch Cash' | 'UPI' | 'NEFT'
                                )
                              }
                              className="px-2 py-1 text-[11px] border border-slate-300 rounded bg-white"
                            >
                              <option value="Branch Cash">Branch Cash</option>
                              <option value="UPI">UPI</option>
                              <option value="NEFT">NEFT</option>
                            </select>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                runAction(
                                  () =>
                                    portalApi.recordRepayment(currentUser.id, application.id, {
                                      paymentMode: counterPayMode,
                                    }),
                                  'Next EMI installment collected and receipt issued.'
                                )
                              }
                              className="btn-bullion px-3 py-1.5 text-[11px] font-medium rounded-md disabled:opacity-50 cursor-pointer"
                            >
                              Collect Next EMI
                            </button>
                          </div>
                        )}
                      </div>

                      {application.repayments && application.repayments.length > 0 && (
                        <div className="divide-y divide-slate-200 border border-slate-200 rounded-md">
                          {application.repayments.map((rcpt) => (
                            <div
                              key={rcpt.id}
                              className="px-3 py-2 flex items-center justify-between gap-3 text-xs"
                            >
                              <div>
                                <div className="font-medium text-slate-900">
                                  EMI #{rcpt.installmentNumber} ·{' '}
                                  <span className="font-mono">{rcpt.receiptNumber}</span>
                                </div>
                                <div className="text-[11px] text-slate-500 font-mono">
                                  {new Date(rcpt.paidAt).toLocaleDateString('en-IN')} ·{' '}
                                  {rcpt.paymentMode}
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="font-mono tabular-nums font-semibold text-emerald-700">
                                  {formatINR(rcpt.totalPaid)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    downloadRepaymentReceiptPdf(application, rcpt, policy)
                                  }
                                  className="text-[11px] font-medium text-amber-800 hover:underline"
                                >
                                  Receipt PDF
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500">
                    {application.collateralStorage
                      ? 'Collateral is stored in the vault. Switch to Branch Administrator to verify the bank account and release disbursement.'
                      : 'Disbursement requires dual-signed Sanction Letter, sealed collateral in vault custody, and Branch Administrator execution.'}
                  </p>
                  {!isAdmin &&
                    !isAuditor &&
                    application.collateralStorage &&
                    onSwitchStaffRole && (
                      <button
                        type="button"
                        onClick={() => switchToRole('BRANCH_ADMIN')}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-amber-900 bg-amber-50 border border-amber-300 hover:bg-amber-100 rounded-md"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Switch to Branch Admin to Disburse</span>
                      </button>
                    )}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* TAB 6: CASE AUDIT TRAIL */}
      {activeTab === 'audit' && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          className="vault-card rounded-xl overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900">
              Application Audit Log ({application.applicationNumber})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-4">Timestamp</th>
                  <th className="py-2.5 px-4">Actor &amp; Role</th>
                  <th className="py-2.5 px-4">Event</th>
                  <th className="py-2.5 px-4">Transition</th>
                  <th className="py-2.5 px-4">Details</th>
                  <th className="py-2.5 px-4 text-right">Hash</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {caseAuditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString('en-IN', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <span className="font-medium text-slate-900">{log.actorName}</span>
                      <span className="mx-1 text-slate-300">·</span>
                      <span className="text-slate-500">{log.actorRole}</span>
                    </td>
                    <td className="py-2.5 px-4 font-medium text-slate-900 whitespace-nowrap">
                      {log.action}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 whitespace-nowrap">
                      {log.previousStatus && log.newStatus
                        ? `${log.previousStatus} → ${log.newStatus}`
                        : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600">{log.details}</td>
                    <td className="py-2.5 px-4 text-right font-mono text-[11px] text-slate-400">
                      {log.integrityHash}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* Floating Next-Step Action Dock (Bottom-Right, active tab only) */}
      {isActiveSession && ((nextActionGuide && !isAuditor) || isDualSigned) && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="floating-dock fixed bottom-5 right-6 z-30 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3.5 text-white max-w-[92vw] no-print"
        >
          {nextActionGuide && !isAuditor ? (
            <>
              <div className="text-xs min-w-0">
                <div className="text-[11px] text-[#E6BF6F] font-medium">
                  Right Now · {nextActionGuide.roleLabel}
                </div>
                <div className="font-medium text-white truncate max-w-[300px]">
                  {nextActionGuide.title}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {isDualSigned && (
                  <button
                    type="button"
                    disabled={exportingPdf}
                    onClick={handleDownloadSanctionPdf}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-100 bg-white/10 hover:bg-white/15 border border-white/15 rounded-lg whitespace-nowrap cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{exportingPdf ? 'Generating...' : 'Sanction PDF'}</span>
                  </button>
                )}

                {isGuideRoleReady ? (
                  <button
                    type="button"
                    onClick={() => setActiveTab(nextActionGuide.targetTab)}
                    className="btn-bullion inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg whitespace-nowrap cursor-pointer"
                  >
                    <span>{nextActionGuide.cta}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  onSwitchStaffRole && (
                    <button
                      type="button"
                      onClick={() =>
                        switchToRole(nextActionGuide.requiredRole, nextActionGuide.targetTab)
                      }
                      className="btn-bullion inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg whitespace-nowrap cursor-pointer"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Switch to {nextActionGuide.roleLabel}</span>
                    </button>
                  )
                )}
              </div>
            </>
          ) : (
            isDualSigned && (
              <>
                <div className="text-xs">
                  <div className="text-[11px] text-[#E6BF6F] font-medium">
                    Dual-Signed Sanction Ready
                  </div>
                  <div className="font-medium text-white">
                    {application.applicationNumber} · {application.status}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={exportingPdf}
                  onClick={handleDownloadSanctionPdf}
                  className="btn-bullion inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg whitespace-nowrap cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{exportingPdf ? 'Generating...' : 'Download Sanction PDF'}</span>
                </button>
              </>
            )
          )}
        </motion.div>
      )}

      {supportingPhotoItemId && (
        <CameraModal
          title="Capture Appraisal Assay Photo"
          onClose={() => setSupportingPhotoItemId(null)}
          onCapture={(dataUrl) => {
            setAppraisalItems((prev) =>
              prev.map((p) =>
                p.itemId === supportingPhotoItemId
                  ? { ...p, supportingPhotoDataUrl: dataUrl }
                  : p
              )
            );
            setSupportingPhotoItemId(null);
          }}
        />
      )}

      {signingFor && (
        <SignatureModal
          title={
            signingFor === 'customer'
              ? 'Customer Sanction Acceptance'
              : 'Authorized Branch Representative Signature'
          }
          signerLabel={
            signingFor === 'customer'
              ? application.customer.fullName
              : `${currentUser.name} (${currentUser.designation})`
          }
          defaultTypedName={
            signingFor === 'customer' ? application.customer.fullName : currentUser.name
          }
          onClose={() => setSigningFor(null)}
          onConfirm={(signatureDataUrl) => {
            const target = signingFor;
            setSigningFor(null);
            runAction(
              () =>
                portalApi.signSanction(currentUser.id, application.id, {
                  signerType: target,
                  signatureDataUrl,
                }),
              target === 'customer'
                ? 'Customer signature recorded on Sanction Letter.'
                : 'Branch Administrator signature recorded and loan sanctioned.'
            );
          }}
        />
      )}

      {/* KYC Document Inspection Lightbox Modal */}
      {inspectingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-3xl max-h-[90vh] bg-white border border-slate-200 rounded-xl shadow-2xl flex flex-col overflow-hidden"
          >
            <div className="px-5 py-3.5 bg-[#0B111E] text-white flex items-center justify-between gap-4">
              <div>
                <div className="text-xs text-[#E6BF6F] font-semibold">
                  {inspectingDoc.docCategory} · Intake KYC Document
                </div>
                <div className="text-xs text-slate-300 font-mono">
                  {inspectingDoc.fileName}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectingDoc(null)}
                className="p-1.5 text-slate-300 hover:text-white rounded cursor-pointer"
                aria-label="Close document preview"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-auto bg-slate-100 p-4 flex items-center justify-center min-h-[340px]">
              {inspectingDoc.previewDataUrl ? (
                inspectingDoc.previewDataUrl.startsWith('data:application/pdf') ||
                inspectingDoc.mimeType?.includes('pdf') ? (
                  <iframe
                    title={inspectingDoc.fileName}
                    src={inspectingDoc.previewDataUrl}
                    className="w-full h-[65vh] bg-white border border-slate-300 rounded-lg"
                  />
                ) : (
                  <img
                    src={inspectingDoc.previewDataUrl}
                    alt={`${inspectingDoc.docCategory} preview`}
                    className="max-w-full max-h-[65vh] object-contain rounded-lg border border-slate-200 bg-white shadow-sm"
                  />
                )
              ) : (
                <div className="text-center text-xs text-slate-500 p-8">
                  No preview image available for {inspectingDoc.fileName}.
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="text-slate-600">
                {inspectingDoc.ocrExtractedSummary ||
                  'Visually verify name, photo, and ID details against original document.'}
              </div>
              <button
                type="button"
                onClick={() => setInspectingDoc(null)}
                className="btn-bullion px-4 py-1.5 font-medium rounded-lg cursor-pointer"
              >
                Done Inspecting
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
