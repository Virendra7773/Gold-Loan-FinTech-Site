import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Landmark,
  Layers,
  Loader2,
  Plus,
  Scale,
  Search,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Vault,
  X,
} from 'lucide-react';
import type {
  AsyncNotice,
  DeskSession,
  IntakeDraftState,
  OcrInputSource,
} from './types/desk.ts';
import { createIntakeDraft } from './types/desk.ts';
import type {
  ApplicationStatus,
  AuditLogEntry,
  BranchWalletSummary,
  GoldLoanApplication,
  KycDocumentAttachment,
  LendingPolicy,
  StaffRole,
  StaffUser,
} from './types/portal.ts';
import { DEFAULT_LENDING_POLICY, formatGrams, formatINR } from './utils/loanMath.ts';
import { portalApi } from './services/api.ts';
import { ApplicationWorkspace } from './components/ApplicationWorkspace.tsx';
import { BranchWalletView } from './components/BranchWalletView.tsx';
import { ComplianceAuditView } from './components/ComplianceAuditView.tsx';
import { CustomerIntakeWorkspace } from './components/CustomerIntakeWorkspace.tsx';
import { CustomerPortalView } from './components/CustomerPortalView.tsx';
import { RoleLoginModal } from './components/RoleLoginModal.tsx';
import { StatusText } from './components/StatusText.tsx';

type MainSection = 'queue' | 'wallet' | 'compliance';
type QueueFilter = 'ALL' | 'KYC' | 'APPRAISAL' | 'SANCTION_VAULT' | 'DISBURSED';

const ROLE_LABELS: Record<StaffRole, string> = {
  BRANCH_STAFF: 'Branch Staff',
  APPRAISER: 'Appraiser',
  BRANCH_ADMIN: 'Branch Admin',
  AUDITOR: 'Auditor',
  CUSTOMER: 'Customer Portal',
};

export default function App() {
  const [staffId, setStaffId] = useState<string>('staff-01');
  const [staffDirectory, setStaffDirectory] = useState<StaffUser[]>([]);
  const [currentUser, setCurrentUser] = useState<StaffUser | null>(null);
  const [policy, setPolicy] = useState<LendingPolicy>(DEFAULT_LENDING_POLICY);
  const [applications, setApplications] = useState<GoldLoanApplication[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [branchWallet, setBranchWallet] = useState<BranchWalletSummary | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [section, setSection] = useState<MainSection>('queue');
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Concurrent Multi-Customer Desk State
  const [openSessions, setOpenSessions] = useState<DeskSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [intakeDrafts, setIntakeDrafts] = useState<Record<string, IntakeDraftState>>({});
  const [caseAsyncLabels, setCaseAsyncLabels] = useState<Record<string, string | null>>({});
  const [asyncNotices, setAsyncNotices] = useState<AsyncNotice[]>([]);
  const [pendingRoleSwitchId, setPendingRoleSwitchId] = useState<string | null>(null);

  const walkInSeqRef = useRef(0);
  const activeSessionIdRef = useRef<string | null>(null);
  const intakeDraftsRef = useRef<Record<string, IntakeDraftState>>({});
  const staffIdRef = useRef(staffId);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  useEffect(() => {
    intakeDraftsRef.current = intakeDrafts;
  }, [intakeDrafts]);

  useEffect(() => {
    staffIdRef.current = staffId;
  }, [staffId]);

  const loadPortalData = useCallback(async (activeStaffId: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await portalApi.bootstrap(activeStaffId);
      setStaffDirectory(data.staffDirectory);
      setCurrentUser(data.currentUser);
      setPolicy(data.policy);
      setApplications(data.applications);
      setAuditLogs(data.auditLogs);
      setBranchWallet(data.branchWallet);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to connect to portal server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPortalData(staffId);
  }, [staffId, loadPortalData]);

  const activeSession = useMemo(() => {
    return openSessions.find((s) => s.id === activeSessionId) ?? null;
  }, [openSessions, activeSessionId]);

  const selectedApplication = useMemo(() => {
    if (activeSession?.kind !== 'case') return null;
    return applications.find((a) => a.id === activeSession.applicationId) ?? null;
  }, [applications, activeSession]);

  const filteredApplications = useMemo(() => {
    return applications.filter((app) => {
      if (queueFilter === 'KYC') {
        if (!['Draft', 'KYC Pending', 'KYC Info Required', 'KYC Rejected'].includes(app.status)) {
          return false;
        }
      } else if (queueFilter === 'APPRAISAL') {
        if (!['KYC Approved', 'Appraisal Pending'].includes(app.status)) return false;
      } else if (queueFilter === 'SANCTION_VAULT') {
        if (
          ![
            'Loan Offer Ready',
            'Sanction Pending',
            'Sanctioned',
            'Collateral Stored',
            'Disbursement Pending',
          ].includes(app.status)
        ) {
          return false;
        }
      } else if (queueFilter === 'DISBURSED') {
        if (app.status !== 'Disbursed') return false;
      }

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        app.applicationNumber.toLowerCase().includes(q) ||
        app.customer.fullName.toLowerCase().includes(q) ||
        app.customer.phone.toLowerCase().includes(q) ||
        app.customer.panNumber.toLowerCase().includes(q)
      );
    });
  }, [applications, queueFilter, searchQuery]);

  const kpis = useMemo(() => {
    const kycPendingCount = applications.filter((a) =>
      ['KYC Pending', 'KYC Info Required'].includes(a.status)
    ).length;
    const appraisalPendingCount = applications.filter((a) =>
      ['KYC Approved', 'Appraisal Pending'].includes(a.status)
    ).length;
    const totalDisbursedAmount = applications
      .filter((a) => a.status === 'Disbursed')
      .reduce((sum, a) => sum + (a.loanOffer?.sanctionedAmount ?? 0), 0);
    return {
      totalFiles: applications.length,
      kycPendingCount,
      appraisalPendingCount,
      totalDisbursedAmount,
    };
  }, [applications]);

  const pushNotice = useCallback((notice: Omit<AsyncNotice, 'id'>) => {
    const id = `notice-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    setAsyncNotices((prev) => [{ ...notice, id }, ...prev].slice(0, 4));
    window.setTimeout(() => {
      setAsyncNotices((prev) => prev.filter((n) => n.id !== id));
    }, 6500);
  }, []);

  const handleApplicationUpdated = useCallback(
    (
      updatedApp: GoldLoanApplication,
      auditEntry: AuditLogEntry,
      nextWallet?: BranchWalletSummary
    ) => {
      setApplications((prev) => {
        const exists = prev.some((a) => a.id === updatedApp.id);
        if (exists) {
          return prev.map((a) => (a.id === updatedApp.id ? updatedApp : a));
        }
        return [updatedApp, ...prev];
      });
      if (auditEntry) {
        setAuditLogs((prev) => [auditEntry, ...prev]);
      }
      if (nextWallet) {
        setBranchWallet(nextWallet);
      }
    },
    []
  );

  const patchDraft = useCallback(
    (
      draftId: string,
      updater: Partial<IntakeDraftState> | ((prev: IntakeDraftState) => IntakeDraftState)
    ) => {
      setIntakeDrafts((prev) => {
        const current = prev[draftId];
        if (!current) return prev;
        const nextDraft =
          typeof updater === 'function' ? updater(current) : { ...current, ...updater };
        const nextMap = { ...prev, [draftId]: nextDraft };
        intakeDraftsRef.current = nextMap;
        return nextMap;
      });
    },
    []
  );

  const openNewWalkInSession = useCallback(() => {
    walkInSeqRef.current += 1;
    const draft = createIntakeDraft(walkInSeqRef.current);
    setIntakeDrafts((prev) => {
      const next = { ...prev, [draft.draftId]: draft };
      intakeDraftsRef.current = next;
      return next;
    });
    setOpenSessions((prev) => [...prev, { id: draft.draftId, kind: 'intake', draftId: draft.draftId }]);
    setActiveSessionId(draft.draftId);
    setSection('queue');
  }, []);

  const openEditIntakeSession = useCallback(
    (app: GoldLoanApplication) => {
      const existingSessionId = `intake-edit-${app.id}`;
      const alreadyOpen = openSessions.some((s) => s.id === existingSessionId);
      if (!alreadyOpen) {
        const draft = createIntakeDraft(0, app);
        setIntakeDrafts((prev) => {
          const next = { ...prev, [draft.draftId]: draft };
          intakeDraftsRef.current = next;
          return next;
        });
        setOpenSessions((prev) => [
          ...prev,
          { id: draft.draftId, kind: 'intake', draftId: draft.draftId },
        ]);
      }
      setActiveSessionId(existingSessionId);
      setSection('queue');
    },
    [openSessions]
  );

  const openCaseSession = useCallback(
    (applicationId: string) => {
      const caseSessionId = `case-${applicationId}`;
      setOpenSessions((prev) => {
        if (prev.some((s) => s.id === caseSessionId)) return prev;
        return [...prev, { id: caseSessionId, kind: 'case', applicationId }];
      });
      setActiveSessionId(caseSessionId);
      setSection('queue');
    },
    []
  );

  const closeDeskSession = useCallback((sessionId: string) => {
    setOpenSessions((prev) => {
      const idx = prev.findIndex((s) => s.id === sessionId);
      if (idx === -1) return prev;
      const target = prev[idx];
      const next = prev.filter((s) => s.id !== sessionId);
      if (target.kind === 'intake') {
        setIntakeDrafts((draftPrev) => {
          const copy = { ...draftPrev };
          delete copy[target.draftId];
          intakeDraftsRef.current = copy;
          return copy;
        });
      }
      if (activeSessionIdRef.current === sessionId) {
        const fallback = next[idx] ?? next[idx - 1] ?? null;
        setActiveSessionId(fallback ? fallback.id : null);
      }
      return next;
    });
  }, []);

  // Asynchronous background demo OCR runner per customer draft
  const runDraftOcr = useCallback(
    async (
      draftId: string,
      source: OcrInputSource,
      docCategory: KycDocumentAttachment['docCategory'],
      hint: 'PAN' | 'Aadhaar'
    ) => {
      patchDraft(draftId, (prev) => ({
        ...prev,
        ocrError: null,
        ocrInFlightCount: prev.ocrInFlightCount + 1,
      }));

      try {
        const dataUrl =
          'dataUrl' in source
            ? source.dataUrl
            : await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result));
                reader.onerror = () => reject(new Error('Failed to read selected file.'));
                reader.readAsDataURL(source);
              });

        const draftSnapshot = intakeDraftsRef.current[draftId];
        const ocrResult = await portalApi.extractOcr(staffIdRef.current, {
          base64Data: dataUrl,
          mimeType: source.type || 'image/jpeg',
          documentHint: hint,
          applicationId: draftSnapshot?.existingAppId,
          applicationNumber: draftSnapshot?.existingAppNumber,
          draftKey: draftId,
          existingName: draftSnapshot?.fullName || undefined,
        });

        const summaryParts: string[] = [];
        if (ocrResult.fullName) summaryParts.push(`Name: ${ocrResult.fullName}`);
        if (ocrResult.panNumber) summaryParts.push(`PAN: ${ocrResult.panNumber}`);
        if (ocrResult.aadhaarMasked) summaryParts.push(`Aadhaar: ${ocrResult.aadhaarMasked}`);

        let updatedLabel: string = hint;
        patchDraft(draftId, (prev) => {
          const nextName = ocrResult.fullName && !prev.fullName ? ocrResult.fullName : prev.fullName;
          updatedLabel = nextName || prev.label;
          return {
            ...prev,
            ocrInFlightCount: Math.max(0, prev.ocrInFlightCount - 1),
            ocrFeedback: ocrResult,
            fullName: nextName,
            accountHolderName:
              ocrResult.fullName && !prev.accountHolderName
                ? ocrResult.fullName
                : prev.accountHolderName,
            panNumber:
              ocrResult.panNumber && !prev.panNumber ? ocrResult.panNumber : prev.panNumber,
            dateOfBirth:
              ocrResult.dateOfBirth && !prev.dateOfBirth
                ? ocrResult.dateOfBirth
                : prev.dateOfBirth,
            address: ocrResult.address && !prev.address ? ocrResult.address : prev.address,
            aadhaarRawDigits: ocrResult.aadhaarLast4 || prev.aadhaarRawDigits,
            aadhaarInput: ocrResult.aadhaarLast4
              ? ocrResult.aadhaarMasked || `XXXX-XXXX-${ocrResult.aadhaarLast4}`
              : prev.aadhaarInput,
            kycDocuments: [
              ...prev.kycDocuments,
              {
                id: `doc-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
                docCategory,
                fileName: source.name,
                mimeType: source.type || 'image/jpeg',
                previewDataUrl: dataUrl,
                ocrAssisted: true,
                ocrExtractedSummary: summaryParts.join(' · ') || ocrResult.confidenceNotes,
                uploadedAt: new Date().toISOString(),
              },
            ],
          };
        });

        if (activeSessionIdRef.current !== draftId) {
          pushNotice({
            tone: 'ok',
            title: `KYC Scan Ready · ${updatedLabel}`,
            detail: `${docCategory} extracted and fields pre-filled in background.`,
            targetSessionId: draftId,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'OCR processing failed.';
        patchDraft(draftId, (prev) => ({
          ...prev,
          ocrInFlightCount: Math.max(0, prev.ocrInFlightCount - 1),
          ocrError: message,
        }));
        if (activeSessionIdRef.current !== draftId) {
          pushNotice({
            tone: 'err',
            title: 'Background Scan Failed',
            detail: message,
            targetSessionId: draftId,
          });
        }
      }
    },
    [patchDraft, pushNotice]
  );

  // Asynchronous background customer application submission per draft
  const submitDraft = useCallback(
    async (draftId: string, submitForKyc: boolean) => {
      const draft = intakeDraftsRef.current[draftId];
      if (!draft) return;

      if (!draft.fullName.trim() || !draft.phone.trim() || !draft.panNumber.trim()) {
        patchDraft(draftId, {
          currentStep: 2,
          formError: 'Customer name, phone number, and PAN are required.',
        });
        return;
      }
      if (submitForKyc && !draft.consentCaptured) {
        patchDraft(draftId, {
          currentStep: 2,
          formError: 'Customer consent confirmation is required before submitting for KYC.',
        });
        return;
      }
      if (submitForKyc && draft.goldItems.some((g) => !g.customerDescription.trim())) {
        patchDraft(draftId, {
          currentStep: 3,
          formError: 'Provide a customer description for each pledged gold ornament.',
        });
        return;
      }
      if (
        submitForKyc &&
        draft.goldItems.some(
          (g) => !g.purchaseBillAvailable || !g.purchaseBillRef?.trim() || !g.purchaseBillImageUrl
        )
      ) {
        patchDraft(draftId, {
          currentStep: 3,
          formError:
            'Original Gold Bill (invoice number and bill scan) is mandatory for every pledged ornament.',
        });
        return;
      }

      patchDraft(draftId, { submitting: true, formError: null });
      const activeActorId = staffIdRef.current;

      try {
        const acctDigits = draft.accountNumber.replace(/\D/g, '');
        const res =
          draft.existingAppId
            ? await portalApi.updateIntake(activeActorId, draft.existingAppId, {
                customer: {
                  fullName: draft.fullName,
                  phone: draft.phone,
                  dateOfBirth: draft.dateOfBirth,
                  address: draft.address,
                  panNumber: draft.panNumber,
                  aadhaarNumberOrLast4: draft.aadhaarRawDigits || draft.aadhaarInput,
                  consentCaptured: draft.consentCaptured,
                  ocrDisclaimerAcknowledged: draft.ocrDisclaimerAcknowledged,
                },
                kycDocuments: draft.kycDocuments,
                goldItems: draft.goldItems,
                bankAccount: {
                  accountHolderName: draft.accountHolderName || draft.fullName,
                  bankName: draft.bankName,
                  ifscCode: draft.ifscCode,
                  accountNumber: acctDigits.length >= 6 ? acctDigits : undefined,
                },
                submitForKyc,
              })
            : await portalApi.createApplication(activeActorId, {
                customer: {
                  fullName: draft.fullName,
                  phone: draft.phone,
                  dateOfBirth: draft.dateOfBirth,
                  address: draft.address,
                  panNumber: draft.panNumber,
                  aadhaarNumberOrLast4: draft.aadhaarRawDigits || draft.aadhaarInput,
                  consentCaptured: draft.consentCaptured,
                  ocrDisclaimerAcknowledged: draft.ocrDisclaimerAcknowledged,
                },
                kycDocuments: draft.kycDocuments,
                goldItems: draft.goldItems,
                bankAccount: {
                  accountHolderName: draft.accountHolderName || draft.fullName,
                  bankName: draft.bankName,
                  ifscCode: draft.ifscCode,
                  accountNumber: acctDigits || '000000',
                },
                submitForKyc,
              });

        const savedApp = res.application;
        handleApplicationUpdated(savedApp, res.auditEntry, res.branchWallet);
        const caseSessionId = `case-${savedApp.id}`;

        setOpenSessions((prev) => {
          const withoutDuplicateCase = prev.filter(
            (s) => s.id === draftId || s.id !== caseSessionId
          );
          return withoutDuplicateCase.map((s) =>
            s.id === draftId
              ? ({ id: caseSessionId, kind: 'case', applicationId: savedApp.id } as DeskSession)
              : s
          );
        });

        setIntakeDrafts((prev) => {
          const copy = { ...prev };
          delete copy[draftId];
          intakeDraftsRef.current = copy;
          return copy;
        });

        if (activeSessionIdRef.current === draftId) {
          setActiveSessionId(caseSessionId);
          setSection('queue');
        }

        setAsyncNotices((prev) => prev.filter((n) => n.targetSessionId !== draftId));

        pushNotice({
          tone: 'ok',
          title: `${savedApp.applicationNumber} · ${savedApp.customer.fullName}`,
          detail: submitForKyc
            ? 'Submitted for Branch Admin KYC review.'
            : 'Saved as Draft in pipeline.',
          targetSessionId: caseSessionId,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to save application.';
        patchDraft(draftId, { submitting: false, formError: message });
        if (activeSessionIdRef.current !== draftId) {
          pushNotice({
            tone: 'err',
            title: `Submission Failed · ${draft.fullName || draft.label}`,
            detail: message,
            targetSessionId: draftId,
          });
        }
      }
    },
    [handleApplicationUpdated, patchDraft, pushNotice]
  );

  function requestRoleSwitch(nextStaffId: string) {
    if (nextStaffId === staffId) return;
    setPendingRoleSwitchId(nextStaffId);
  }

  function completeRoleSwitch(verifiedUser: StaffUser) {
    setStaffId(verifiedUser.id);
    setPendingRoleSwitchId(null);
    if (verifiedUser.role === 'CUSTOMER') {
      setActiveSessionId(null);
      setSection('queue');
    } else if (!['BRANCH_ADMIN', 'AUDITOR'].includes(verifiedUser.role) && section === 'wallet') {
      setSection('queue');
    }
    pushNotice({
      tone: 'ok',
      title: `Signed In · ${ROLE_LABELS[verifiedUser.role]}`,
      detail: `Active workspace switched to ${verifiedUser.name} (${verifiedUser.employeeCode}).`,
    });
  }

  const isCustomerMode = currentUser?.role === 'CUSTOMER';
  const canCreateApplication =
    currentUser?.role === 'BRANCH_STAFF' || currentUser?.role === 'BRANCH_ADMIN';
  const canViewWallet =
    currentUser?.role === 'BRANCH_ADMIN' || currentUser?.role === 'AUDITOR';

  // Priority next file for the floating quick-open dock on pipeline view
  const urgentPipelineCase = useMemo(() => {
    if (!currentUser) return null;
    if (currentUser.role === 'BRANCH_ADMIN') {
      return (
        applications.find((a) => a.status === 'KYC Pending') ??
        applications.find((a) =>
          ['Sanction Pending', 'Sanctioned', 'Collateral Stored', 'Disbursement Pending'].includes(
            a.status
          )
        ) ??
        null
      );
    }
    if (currentUser.role === 'APPRAISER') {
      return (
        applications.find((a) => ['KYC Approved', 'Appraisal Pending'].includes(a.status)) ?? null
      );
    }
    if (currentUser.role === 'BRANCH_STAFF') {
      return (
        applications.find((a) => ['Loan Offer Ready', 'Sanction Pending'].includes(a.status)) ??
        null
      );
    }
    return null;
  }, [applications, currentUser]);

  return (
    <div className="min-h-screen flex text-slate-900">
      {/* Deep Obsidian Sidebar */}
      <aside className="w-68 shrink-0 bg-[#0B111E] text-slate-100 flex flex-col justify-between border-r border-slate-800/90 no-print">
        <div className="p-5 space-y-6">
          <div className="pb-4 border-b border-slate-800/80">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#D4A94B] to-[#9A6B16] flex items-center justify-center shadow-sm">
                <Landmark className="w-4 h-4 text-slate-950" aria-hidden="true" />
              </div>
              <div>
                <span className="font-display text-base font-bold tracking-tight text-white block leading-none">
                  Aurelia Vault
                </span>
                <span className="mt-1 text-[11px] text-slate-400 block">
                  {isCustomerMode
                    ? 'Borrower Self-Service · MUM-04'
                    : 'Private Bullion Lending · MUM-04'}
                </span>
              </div>
            </div>
          </div>

          {!isCustomerMode ? (
            <>
              <nav className="space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    setSection('queue');
                    setActiveSessionId(null);
                  }}
                  className={`relative w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    section === 'queue' && !activeSessionId
                      ? 'bg-white/10 text-white'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <FileText className="w-4 h-4 text-[#D4A94B] shrink-0" />
                  <span>Loan Pipeline</span>
                </button>

                {canViewWallet && (
                  <button
                    type="button"
                    onClick={() => {
                      setSection('wallet');
                      setActiveSessionId(null);
                    }}
                    className={`relative w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                      section === 'wallet'
                        ? 'bg-white/10 text-white'
                        : 'text-slate-300 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <Vault className="w-4 h-4 text-[#D4A94B] shrink-0" />
                    <span>Branch Vault &amp; Wallet</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setSection('compliance');
                    setActiveSessionId(null);
                  }}
                  className={`relative w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    section === 'compliance'
                      ? 'bg-white/10 text-white'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4 text-[#D4A94B] shrink-0" />
                  <span>Audit &amp; Safeguards</span>
                </button>
              </nav>

              {/* Priority Queues */}
              <div className="pt-4 border-t border-slate-800/80 space-y-2">
                <div className="px-3 text-[11px] font-medium text-slate-400">
                  Priority Queues
                </div>
                <div className="space-y-1 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setSection('queue');
                      setActiveSessionId(null);
                      setQueueFilter('KYC');
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 text-slate-300 hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <ClipboardCheck className="w-3.5 h-3.5 text-slate-400" />
                      <span>KYC Review</span>
                    </span>
                    <span className="font-mono tabular-nums text-[#D4A94B] font-semibold">
                      {kpis.kycPendingCount}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSection('queue');
                      setActiveSessionId(null);
                      setQueueFilter('APPRAISAL');
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 text-slate-300 hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <Scale className="w-3.5 h-3.5 text-slate-400" />
                      <span>Bullion Appraisal</span>
                    </span>
                    <span className="font-mono tabular-nums text-[#D4A94B] font-semibold">
                      {kpis.appraisalPendingCount}
                    </span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="p-3.5 bg-white/5 border border-slate-800 rounded-lg text-xs text-slate-300 space-y-1.5">
              <div className="font-semibold text-white">Borrower Self-Service</div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Track loan milestones, inspect pledged vault seals, pay monthly EMIs, and download official receipts.
              </p>
            </div>
          )}
        </div>

        {/* 1-Click Role Perspective Switcher */}
        <div className="p-4 border-t border-slate-800/80 bg-[#070B14] space-y-2.5">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 px-1">
            <UserCheck className="w-3.5 h-3.5 text-[#D4A94B]" />
            <span>Switch Role Perspective</span>
          </div>
          <div className="space-y-1">
            {staffDirectory.map((s) => {
              const isActive = s.id === staffId;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => requestRoleSwitch(s.id)}
                  className={`w-full px-2.5 py-2 rounded-lg text-left transition-all flex items-center justify-between gap-2 text-xs cursor-pointer ${
                    isActive
                      ? 'bg-gradient-to-r from-[#C5963A]/20 to-transparent border border-[#C5963A]/50 text-white'
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {s.role === 'CUSTOMER' ? s.name : ROLE_LABELS[s.role]}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">
                      {s.role === 'CUSTOMER' ? 'Customer Portal' : s.name}
                    </div>
                  </div>
                  {isActive && (
                    <span className="text-[10px] font-mono text-[#D4A94B] shrink-0">Active</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Clean 3-Zone Top Bar */}
        <header className="h-16 bg-white/85 backdrop-blur-md border-b border-slate-200/80 px-6 flex items-center justify-between gap-8 sticky top-0 z-20 no-print">
          {/* Zone 1: Context Wordmark / Breadcrumb */}
          <div className="flex items-center gap-3 min-w-0">
            {isCustomerMode ? (
              <h1 className="text-base font-semibold text-slate-900 whitespace-nowrap shrink-0">
                Customer Loan Portal
              </h1>
            ) : activeSession?.kind === 'intake' ? (
              <button
                type="button"
                onClick={() => setActiveSessionId(null)}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900 hover:text-[#9A6B16] whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>
                  Pipeline /{' '}
                  {intakeDrafts[activeSession.draftId]?.fullName.trim() ||
                    intakeDrafts[activeSession.draftId]?.label ||
                    'Walk-In Intake'}
                </span>
              </button>
            ) : selectedApplication ? (
              <button
                type="button"
                onClick={() => setActiveSessionId(null)}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900 hover:text-[#9A6B16] whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Pipeline / {selectedApplication.applicationNumber}</span>
              </button>
            ) : (
              <h1 className="text-base font-semibold text-slate-900 whitespace-nowrap shrink-0">
                {section === 'wallet'
                  ? 'Branch Vault & Wallet'
                  : section === 'compliance'
                    ? 'Compliance & Vault Audit'
                    : 'Gold Loan Origination'}
              </h1>
            )}
          </div>

          {/* Zone 2: Concise Single-Line Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-600">
            {isCustomerMode ? (
              <span className="text-slate-500 whitespace-nowrap shrink-0">
                Loan Status · EMI Receipts · Vault Custody
              </span>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setSection('queue');
                    setActiveSessionId(null);
                    setQueueFilter('ALL');
                  }}
                  className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  All Files
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSection('queue');
                    setActiveSessionId(null);
                    setQueueFilter('KYC');
                  }}
                  className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  KYC Review
                </button>
                {canViewWallet && (
                  <button
                    type="button"
                    onClick={() => {
                      setSection('wallet');
                      setActiveSessionId(null);
                    }}
                    className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Vault &amp; Wallet
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setSection('compliance');
                    setActiveSessionId(null);
                  }}
                  className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Audit Logs
                </button>
              </>
            )}
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="shrink-0">
            {isCustomerMode ? (
              <button
                type="button"
                onClick={() => requestRoleSwitch('staff-01')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Staff Workspace</span>
              </button>
            ) : canCreateApplication ? (
              <button
                type="button"
                onClick={openNewWalkInSession}
                className="btn-bullion inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Application</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSection(canViewWallet ? 'wallet' : 'compliance');
                  setActiveSessionId(null);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{canViewWallet ? 'Vault & Wallet' : 'Audit Trail'}</span>
              </button>
            )}
          </div>
        </header>

        {/* Viewport Container */}
        <main className="flex-1 p-6 pb-24 max-w-[1360px] w-full mx-auto space-y-5">
          {/* Concurrent Multi-Customer Active Desk Bar */}
          {!isCustomerMode && openSessions.length > 0 && !loadError && currentUser && (
            <div className="vault-card rounded-xl px-3 py-2 flex items-center justify-between gap-3 no-print">
              <div className="flex items-center gap-1.5 overflow-x-auto min-w-0 py-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setSection('queue');
                    setActiveSessionId(null);
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    section === 'queue' && activeSessionId === null
                      ? 'bg-[#0B111E] text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5 text-[#D4A94B]" />
                  <span>Pipeline ({applications.length})</span>
                </button>

                <span className="h-4 w-px bg-slate-200 mx-1 shrink-0" aria-hidden="true" />

                {openSessions.map((sess) => {
                  const isFocused = section === 'queue' && activeSessionId === sess.id;
                  if (sess.kind === 'intake') {
                    const draft = intakeDrafts[sess.draftId];
                    if (!draft) return null;
                    const title = draft.fullName.trim() || draft.label;
                    const sub = draft.submitting
                      ? 'Submitting…'
                      : draft.ocrInFlightCount > 0
                        ? 'OCR Running…'
                        : 'Intake Draft';
                    const isAsyncBusy = draft.submitting || draft.ocrInFlightCount > 0;
                    return (
                      <div
                        key={sess.id}
                        className={`inline-flex items-center rounded-lg border text-xs transition-all shrink-0 ${
                          isFocused
                            ? 'bg-[#0B111E] text-white border-[#C5963A]/60 shadow-xs'
                            : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setSection('queue');
                            setActiveSessionId(sess.id);
                          }}
                          className="pl-3 pr-1.5 py-1.5 flex items-center gap-2 cursor-pointer whitespace-nowrap"
                        >
                          {isAsyncBusy && (
                            <Loader2
                              className={`w-3 h-3 animate-spin shrink-0 ${
                                isFocused ? 'text-[#E6BF6F]' : 'text-[#9A6B16]'
                              }`}
                            />
                          )}
                          <span className="font-medium max-w-[140px] truncate">{title}</span>
                          <span
                            className={`text-[11px] font-mono ${
                              isFocused ? 'text-[#E6BF6F]' : 'text-slate-500'
                            }`}
                          >
                            · {sub}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => closeDeskSession(sess.id)}
                          aria-label={`Close ${title}`}
                          className={`pr-2 pl-1 py-1.5 rounded-r-lg cursor-pointer ${
                            isFocused
                              ? 'text-slate-300 hover:text-white'
                              : 'text-slate-400 hover:text-slate-800'
                          }`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  }

                  const app = applications.find((a) => a.id === sess.applicationId);
                  if (!app) return null;
                  const asyncLabel = caseAsyncLabels[app.id];
                  return (
                    <div
                      key={sess.id}
                      className={`inline-flex items-center rounded-lg border text-xs transition-all shrink-0 ${
                        isFocused
                          ? 'bg-[#0B111E] text-white border-[#C5963A]/60 shadow-xs'
                          : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSection('queue');
                          setActiveSessionId(sess.id);
                        }}
                        className="pl-3 pr-1.5 py-1.5 flex items-center gap-2 cursor-pointer whitespace-nowrap"
                      >
                        {asyncLabel && (
                          <Loader2
                            className={`w-3 h-3 animate-spin shrink-0 ${
                              isFocused ? 'text-[#E6BF6F]' : 'text-[#9A6B16]'
                            }`}
                          />
                        )}
                        <span className="font-medium max-w-[140px] truncate">
                          {app.customer.fullName}
                        </span>
                        <span
                          className={`text-[11px] font-mono ${
                            isFocused ? 'text-[#E6BF6F]' : 'text-slate-500'
                          }`}
                        >
                          · {asyncLabel || app.status}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => closeDeskSession(sess.id)}
                        aria-label={`Close ${app.customer.fullName}`}
                        className={`pr-2 pl-1 py-1.5 rounded-r-lg cursor-pointer ${
                          isFocused
                            ? 'text-slate-300 hover:text-white'
                            : 'text-slate-400 hover:text-slate-800'
                        }`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {canCreateApplication && (
                <button
                  type="button"
                  onClick={openNewWalkInSession}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#8C5E12] bg-amber-50/90 hover:bg-amber-100 border border-amber-200 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>+ Walk-In</span>
                </button>
              )}
            </div>
          )}

          {loadError ? (
            <div className="p-6 vault-card rounded-xl border-red-200 text-sm text-red-800 space-y-3">
              <p className="font-semibold">Unable to load portal data</p>
              <p className="text-xs">{loadError}</p>
              <button
                type="button"
                onClick={() => loadPortalData(staffId)}
                className="px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg"
              >
                Retry Connection
              </button>
            </div>
          ) : loading && !currentUser ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse"
                  />
                ))}
              </div>
              <div className="h-80 bg-white border border-slate-200 rounded-xl animate-pulse" />
            </div>
          ) : isCustomerMode && currentUser ? (
            <CustomerPortalView
              currentUser={currentUser}
              applications={applications}
              policy={policy}
              onApplicationUpdated={handleApplicationUpdated}
            />
          ) : section === 'wallet' && branchWallet ? (
            <BranchWalletView
              wallet={branchWallet}
              applications={applications}
              onSelectApplication={(appId) => openCaseSession(appId)}
            />
          ) : section === 'compliance' && currentUser ? (
            <ComplianceAuditView
              applications={applications}
              auditLogs={auditLogs}
              currentRole={currentUser.role}
              onSelectApplication={(appId) => openCaseSession(appId)}
            />
          ) : (
            <>
              {/* Mounted Concurrent Customer Sessions (Preserves all unsaved inputs & async promises across tabs) */}
              {currentUser &&
                openSessions.map((sess) => {
                  const isFocused = section === 'queue' && activeSessionId === sess.id;
                  if (sess.kind === 'intake') {
                    const draft = intakeDrafts[sess.draftId];
                    if (!draft) return null;
                    return (
                      <div key={sess.id} className={isFocused ? 'block' : 'hidden'}>
                        <CustomerIntakeWorkspace
                          draft={draft}
                          isActiveSession={isFocused}
                          onPatchDraft={patchDraft}
                          onRunOcr={runDraftOcr}
                          onSubmitDraft={submitDraft}
                          onStartAnotherWalkIn={openNewWalkInSession}
                          onCloseDraft={closeDeskSession}
                        />
                      </div>
                    );
                  }

                  const app = applications.find((a) => a.id === sess.applicationId);
                  if (!app) return null;
                  return (
                    <div key={sess.id} className={isFocused ? 'block' : 'hidden'}>
                      <ApplicationWorkspace
                        application={app}
                        currentUser={currentUser}
                        staffDirectory={staffDirectory}
                        policy={policy}
                        auditLogs={auditLogs}
                        isActiveSession={isFocused}
                        onApplicationUpdated={handleApplicationUpdated}
                        onEditIntake={(targetApp) => openEditIntakeSession(targetApp)}
                        onSwitchStaffRole={requestRoleSwitch}
                        onAsyncActivityChange={(appId, label) =>
                          setCaseAsyncLabels((prev) => ({ ...prev, [appId]: label }))
                        }
                        onStartAnotherWalkIn={
                          canCreateApplication ? openNewWalkInSession : undefined
                        }
                      />
                    </div>
                  );
                })}

              {/* Pipeline Overview (visible when no customer tab is focused) */}
              {!activeSession && (
            <div className="space-y-6">
              {/* 4-Column Floating KPI Strip */}
              {canViewWallet && branchWallet ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <motion.button
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18 }}
                    type="button"
                    onClick={() => setSection('wallet')}
                    className="vault-card vault-card-interactive p-5 rounded-xl text-left cursor-pointer"
                  >
                    <div className="text-xs font-medium text-slate-500">Branch Wallet Balance</div>
                    <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-slate-900">
                      {formatINR(branchWallet.walletBalance)}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                      Capital {formatINR(branchWallet.openingCapital)} · Open Ledger →
                    </div>
                  </motion.button>

                  <motion.button
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18, delay: 0.04 }}
                    type="button"
                    onClick={() => setSection('wallet')}
                    className="vault-card vault-card-interactive p-5 rounded-xl text-left bg-gradient-to-br from-emerald-50/80 to-white border-emerald-200/80 cursor-pointer"
                  >
                    <div className="text-xs font-medium text-emerald-900">Profit Made Today</div>
                    <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-emerald-950">
                      {formatINR(branchWallet.todayProfit)}
                    </div>
                    <div className="mt-1 text-xs text-emerald-800 font-mono tabular-nums">
                      Fees {formatINR(branchWallet.todayFeesProfit)} + Int{' '}
                      {formatINR(branchWallet.todayInterestProfit)}
                    </div>
                  </motion.button>

                  <motion.button
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18, delay: 0.08 }}
                    type="button"
                    onClick={() => setSection('wallet')}
                    className="vault-card vault-card-interactive p-5 rounded-xl text-left bg-gradient-to-br from-amber-50/70 to-white border-amber-200/80 cursor-pointer"
                  >
                    <div className="text-xs font-medium text-amber-900">Vault Gold Stored</div>
                    <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-amber-950">
                      {formatGrams(branchWallet.storedGoldNetGrams)}
                    </div>
                    <div className="mt-1 text-xs text-amber-800 font-mono tabular-nums">
                      {branchWallet.activeVaultPackets} Seal(s) ·{' '}
                      {formatINR(branchWallet.storedGoldMarketValue)}
                    </div>
                  </motion.button>

                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18, delay: 0.12 }}
                    className="vault-card p-5 rounded-xl"
                  >
                    <div className="text-xs font-medium text-slate-500">KYC Pending Review</div>
                    <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-[#9A6B16]">
                      {kpis.kycPendingCount}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {kpis.totalFiles} total files in MUM-04
                    </div>
                  </motion.div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18 }}
                    className="vault-card p-5 rounded-xl"
                  >
                    <div className="text-xs font-medium text-slate-500">Active Loan Files</div>
                    <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-slate-900">
                      {kpis.totalFiles}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Branch MUM-04 pipeline
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18, delay: 0.04 }}
                    className="vault-card p-5 rounded-xl"
                  >
                    <div className="text-xs font-medium text-slate-500">KYC Review Queue</div>
                    <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-[#9A6B16]">
                      {kpis.kycPendingCount}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Requires Branch Admin decision
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18, delay: 0.08 }}
                    className="vault-card p-5 rounded-xl"
                  >
                    <div className="text-xs font-medium text-slate-500">Appraisal Queue</div>
                    <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-slate-900">
                      {kpis.appraisalPendingCount}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Ready for bullion assay
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18, delay: 0.12 }}
                    className="vault-card p-5 rounded-xl"
                  >
                    <div className="text-xs font-medium text-slate-500">Sanctioned &amp; Disbursed</div>
                    <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-emerald-700">
                      {formatINR(kpis.totalDisbursedAmount)}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Policy Cap: {policy.maxLtvPercent}% LTV
                    </div>
                  </motion.div>
                </div>
              )}

              {/* Applications Queue Table */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: 0.08 }}
                className="vault-card rounded-xl overflow-hidden"
              >
                <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
                    {(
                      [
                        { id: 'ALL', label: 'All Applications' },
                        { id: 'KYC', label: 'KYC Stage' },
                        { id: 'APPRAISAL', label: 'Appraisal' },
                        { id: 'SANCTION_VAULT', label: 'Offer & Vault' },
                        { id: 'DISBURSED', label: 'Disbursed' },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setQueueFilter(tab.id)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap cursor-pointer ${
                          queueFilter === tab.id
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="relative w-full sm:w-72">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search customer, PAN, phone, ID..."
                      className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50/70 border border-slate-300 rounded-lg focus:outline-none focus:bg-white focus:border-[#B47B1B]"
                    />
                  </div>
                </div>

                {filteredApplications.length === 0 ? (
                  <div className="p-12 text-center space-y-3">
                    <p className="text-sm font-medium text-slate-900">
                      No gold loan applications match this filter
                    </p>
                    <p className="text-xs text-slate-500">
                      Adjust your filter criteria or start a new customer intake application.
                    </p>
                    {canCreateApplication && (
                      <button
                        type="button"
                        onClick={openNewWalkInSession}
                        className="btn-bullion inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>New Application</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-500">
                          <th className="py-3 px-4">Application #</th>
                          <th className="py-3 px-4">Customer</th>
                          <th className="py-3 px-4">Masked KYC</th>
                          <th className="py-3 px-4 text-right">Ornaments</th>
                          <th className="py-3 px-4 text-right">Appraised</th>
                          <th className="py-3 px-4 text-right">Sanctioned</th>
                          <th className="py-3 px-4">Stage</th>
                          <th className="py-3 px-4 text-right">Next Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/80 text-xs">
                        {filteredApplications.map((app) => {
                          const appraisedVal = app.goldItems.reduce(
                            (sum, g) => sum + (g.appraisedValue ?? 0),
                            0
                          );
                          const rowActionLabel = (() => {
                            switch (app.status) {
                              case 'KYC Pending':
                                return 'Review KYC';
                              case 'KYC Info Required':
                              case 'Draft':
                                return 'Complete Intake';
                              case 'KYC Approved':
                              case 'Appraisal Pending':
                                return 'Appraise Gold';
                              case 'Loan Offer Ready':
                                return 'Configure Offer';
                              case 'Sanction Pending':
                                return 'Sign Sanction';
                              case 'Sanctioned':
                                return 'Store Collateral';
                              case 'Collateral Stored':
                              case 'Disbursement Pending':
                                return 'Disburse Funds';
                              default:
                                return 'View File';
                            }
                          })();

                          const isOpenInDesk = openSessions.some(
                            (s) => s.kind === 'case' && s.applicationId === app.id
                          );

                          return (
                            <tr
                              key={app.id}
                              onClick={() => openCaseSession(app.id)}
                              className="hover:bg-amber-50/35 cursor-pointer transition-colors"
                            >
                              <td className="py-3.5 px-4 font-mono font-semibold text-slate-900 whitespace-nowrap">
                                {app.applicationNumber}
                              </td>
                              <td className="py-3.5 px-4 whitespace-nowrap">
                                <div className="font-medium text-slate-900">
                                  {app.customer.fullName}
                                </div>
                                <div className="font-mono text-[11px] text-slate-500">
                                  {app.customer.phone}
                                </div>
                              </td>
                              <td className="py-3.5 px-4 font-mono text-slate-600 whitespace-nowrap">
                                {app.customer.panNumber} · {app.customer.aadhaarMasked}
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700">
                                {app.goldItems.length}
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-900">
                                {appraisedVal > 0 ? formatINR(appraisedVal) : '—'}
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                                {app.loanOffer?.sanctionedAmount
                                  ? formatINR(app.loanOffer.sanctionedAmount)
                                  : '—'}
                              </td>
                              <td className="py-3.5 px-4 whitespace-nowrap">
                                <StatusText status={app.status as ApplicationStatus} />
                              </td>
                              <td className="py-3.5 px-4 text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openCaseSession(app.id);
                                  }}
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer border ${
                                    isOpenInDesk
                                      ? 'text-slate-900 bg-slate-100 border-slate-300 hover:bg-slate-200'
                                      : 'text-[#8C5E12] bg-amber-50/80 hover:bg-amber-100/80 border-amber-200/80'
                                  }`}
                                >
                                  <span>{isOpenInDesk ? 'In Desk' : rowActionLabel}</span>
                                  <ArrowUpRight className="w-3 h-3" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </motion.div>
            </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Asynchronous Background Task Completion Notices */}
      {asyncNotices.length > 0 && (
        <div className="fixed top-20 right-6 z-40 space-y-2 max-w-sm w-full no-print">
          {asyncNotices.map((notice) => (
            <motion.div
              key={notice.id}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="floating-dock rounded-xl p-3.5 text-white flex items-start justify-between gap-3"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                {notice.tone === 'err' ? (
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-[#E6BF6F] shrink-0 mt-0.5" />
                )}
                <div className="text-xs min-w-0">
                  <div className="font-semibold text-white truncate">{notice.title}</div>
                  <div className="text-[11px] text-slate-300 mt-0.5">{notice.detail}</div>
                  {notice.targetSessionId && (
                    <button
                      type="button"
                      onClick={() => {
                        const targetId = notice.targetSessionId!;
                        setSection('queue');
                        if (openSessions.some((s) => s.id === targetId)) {
                          setActiveSessionId(targetId);
                        } else if (targetId.startsWith('case-')) {
                          openCaseSession(targetId.slice(5));
                        } else {
                          setActiveSessionId(null);
                        }
                        setAsyncNotices((prev) => prev.filter((n) => n.id !== notice.id));
                      }}
                      className="mt-1.5 text-[11px] font-medium text-[#E6BF6F] hover:underline cursor-pointer"
                    >
                      Open Customer Tab →
                    </button>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  setAsyncNotices((prev) => prev.filter((n) => n.id !== notice.id))
                }
                className="text-slate-400 hover:text-white p-0.5 cursor-pointer"
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ))}
        </div>
      )}

      {/* Floating Priority Case Quick-Jump Dock on Pipeline View */}
      {!isCustomerMode &&
        !activeSession &&
        section === 'queue' &&
        urgentPipelineCase && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="floating-dock fixed bottom-5 right-6 z-30 rounded-xl px-4 py-3 flex items-center gap-4 text-white no-print"
          >
            <div className="text-xs">
              <div className="text-[11px] text-[#E6BF6F] font-medium">
                Action Needed Now · {urgentPipelineCase.applicationNumber}
              </div>
              <div className="font-medium text-white truncate max-w-[240px]">
                {urgentPipelineCase.customer.fullName} ({urgentPipelineCase.status})
              </div>
            </div>
            <button
              type="button"
              onClick={() => openCaseSession(urgentPipelineCase.id)}
              className="btn-bullion inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg whitespace-nowrap cursor-pointer"
            >
              <span>Open Case</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}

      {pendingRoleSwitchId && staffDirectory.length > 0 && (
        <RoleLoginModal
          targetStaffId={pendingRoleSwitchId}
          staffDirectory={staffDirectory}
          roleLabels={ROLE_LABELS}
          onClose={() => setPendingRoleSwitchId(null)}
          onAuthenticated={completeRoleSwitch}
        />
      )}
    </div>
  );
}
