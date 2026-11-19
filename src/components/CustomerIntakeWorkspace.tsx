import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  FileScan,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';
import type { IntakeDraftState, IntakeStep, OcrInputSource } from '../types/desk.ts';
import type {
  GoldItem,
  HallmarkStatus,
  KycDocumentAttachment,
  OrnamentProvenance,
  OrnamentType,
} from '../types/portal.ts';
import { maskAadhaarInput } from '../utils/loanMath.ts';
import { CameraModal } from './CameraModal.tsx';
import { OrnamentPhoto } from './OrnamentPhoto.tsx';

interface CustomerIntakeWorkspaceProps {
  draft: IntakeDraftState;
  isActiveSession: boolean;
  isCustomerSelfService?: boolean;
  onPatchDraft: (
    draftId: string,
    updater: Partial<IntakeDraftState> | ((prev: IntakeDraftState) => IntakeDraftState)
  ) => void;
  onRunOcr: (
    draftId: string,
    source: OcrInputSource,
    docCategory: KycDocumentAttachment['docCategory'],
    hint: 'PAN' | 'Aadhaar'
  ) => void;
  onSubmitDraft: (draftId: string, submitForKyc: boolean) => void;
  onStartAnotherWalkIn: () => void;
  onCloseDraft: (draftId: string) => void;
}

const ORNAMENT_TYPES: OrnamentType[] = [
  'Necklace',
  'Bangle',
  'Ring',
  'Chain',
  'Earrings',
  'Bracelet',
  'Coin',
  'Other',
];

const INTAKE_STEPS: Array<{ step: IntakeStep; shortLabel: string; title: string }> = [
  { step: 1, shortLabel: '01. KYC & Scan', title: 'KYC Document Upload & Instant Scan' },
  { step: 2, shortLabel: '02. Customer Profile', title: 'Customer Identity, Address & Consent' },
  { step: 3, shortLabel: '03. Gold Ornaments', title: 'Pledged Ornaments & Live Photographs' },
  { step: 4, shortLabel: '04. Bank & Review', title: 'Disbursement Bank & Final Review' },
];

function buildSampleDocDataUrl(docKind: 'PAN' | 'Aadhaar', labelSeed: string): string {
  const safeLabel = labelSeed.replace(/[^a-zA-Z0-9 #.-]/g, '').slice(0, 28) || 'Walk-In Customer';
  const isPan = docKind === 'PAN';
  const bgStart = isPan ? '#0B2545' : '#1E293B';
  const bgEnd = isPan ? '#1D4E89' : '#0F172A';
  const badgeColor = isPan ? '#D4A94B' : '#38BDF8';
  const docHeading = isPan ? 'INCOME TAX DEPARTMENT · PAN CARD (DEMO)' : 'UIDAI · AADHAAR (MASKED DEMO)';
  const docSub = isPan ? 'Instant Demo KYC Sample Scan' : 'Masked Last-4 Verified Demo Scan';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="300" viewBox="0 0 520 300">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${bgStart}"/>
        <stop offset="100%" stop-color="${bgEnd}"/>
      </linearGradient>
    </defs>
    <rect width="520" height="300" rx="18" fill="url(#g)"/>
    <rect x="20" y="20" width="480" height="260" rx="12" fill="none" stroke="${badgeColor}" stroke-opacity="0.45" stroke-width="1.5"/>
    <text x="36" y="54" fill="${badgeColor}" font-family="sans-serif" font-size="14" font-weight="700">${docHeading}</text>
    <text x="36" y="76" fill="#CBD5E1" font-family="sans-serif" font-size="11">${docSub}</text>
    <rect x="36" y="102" width="96" height="114" rx="8" fill="#FFFFFF" fill-opacity="0.1" stroke="#FFFFFF" stroke-opacity="0.25"/>
    <circle cx="84" cy="144" r="20" fill="#CBD5E1" fill-opacity="0.45"/>
    <path d="M54 198 C54 176, 114 176, 114 198" fill="#CBD5E1" fill-opacity="0.45"/>
    <text x="154" y="128" fill="#94A3B8" font-family="sans-serif" font-size="11">Applicant Reference</text>
    <text x="154" y="152" fill="#FFFFFF" font-family="sans-serif" font-size="18" font-weight="700">${safeLabel}</text>
    <text x="154" y="186" fill="#94A3B8" font-family="sans-serif" font-size="11">Document Status</text>
    <text x="154" y="208" fill="${badgeColor}" font-family="monospace" font-size="15" font-weight="700">${isPan ? 'VERIFIED PAN DEMO SCAN' : 'XXXX-XXXX-DEMO'}</text>
    <text x="36" y="254" fill="#94A3B8" font-family="monospace" font-size="11">Aurelia Vault · Local Instant KYC Aid (No External API Wait)</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function buildSampleGoldBillDataUrl(ornamentType: OrnamentType, invoiceNo: string): string {
  const safeType = ornamentType.replace(/[^a-zA-Z0-9 ]/g, '');
  const safeInv = invoiceNo.replace(/[^a-zA-Z0-9-]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="320" viewBox="0 0 520 320">
    <rect width="520" height="320" rx="12" fill="#FFFBEB" stroke="#D97706" stroke-width="2"/>
    <rect x="0" y="0" width="520" height="58" rx="12" fill="#0B111E"/>
    <rect x="0" y="42" width="520" height="16" fill="#0B111E"/>
    <text x="24" y="34" fill="#D4A94B" font-family="sans-serif" font-size="16" font-weight="700">ORIGINAL JEWELLER TAX INVOICE · GOLD BILL</text>
    <text x="24" y="92" fill="#334155" font-family="monospace" font-size="13">Invoice Ref : ${safeInv}</text>
    <text x="24" y="118" fill="#334155" font-family="monospace" font-size="13">Ornament    : 22K Hallmarked Gold ${safeType}</text>
    <text x="24" y="144" fill="#334155" font-family="monospace" font-size="13">Showroom    : Tribhovandas Bhimji Zaveri · Mumbai</text>
    <text x="24" y="170" fill="#334155" font-family="monospace" font-size="13">BIS HUID    : HUID-916-AVMUM04</text>
    <rect x="24" y="200" width="472" height="84" rx="8" fill="#FFFFFF" stroke="#E2E8F0"/>
    <text x="40" y="232" fill="#0F172A" font-family="sans-serif" font-size="12" font-weight="700">GST Paid &amp; Ownership Provenance Confirmed</text>
    <text x="40" y="256" fill="#64748B" font-family="monospace" font-size="11">Attached as mandatory gold purchase bill at loan intake</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function CustomerIntakeWorkspace({
  draft,
  isActiveSession,
  isCustomerSelfService = false,
  onPatchDraft,
  onRunOcr,
  onSubmitDraft,
  onStartAnotherWalkIn,
  onCloseDraft,
}: CustomerIntakeWorkspaceProps) {
  const [cameraItemId, setCameraItemId] = useState<string | null>(null);
  const [activeOrnamentIndex, setActiveOrnamentIndex] = useState(0);
  const isEditing = Boolean(draft.existingAppId);

  useEffect(() => {
    if (activeOrnamentIndex >= draft.goldItems.length) {
      setActiveOrnamentIndex(Math.max(0, draft.goldItems.length - 1));
    }
  }, [activeOrnamentIndex, draft.goldItems.length]);

  const currentStep = draft.currentStep ?? 1;

  function goToStep(step: IntakeStep) {
    onPatchDraft(draft.draftId, { currentStep: step, formError: null });
  }

  function handleAadhaarChange(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 12);
    if (digits.length >= 4) {
      const { masked } = maskAadhaarInput(digits);
      onPatchDraft(draft.draftId, { aadhaarRawDigits: digits, aadhaarInput: masked });
    } else {
      onPatchDraft(draft.draftId, { aadhaarRawDigits: digits, aadhaarInput: value });
    }
  }

  async function handlePlainDocumentAttach(
    file: File,
    docCategory: KycDocumentAttachment['docCategory']
  ) {
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(file);
    });
    onPatchDraft(draft.draftId, (prev) => ({
      ...prev,
      kycDocuments: [
        ...prev.kycDocuments,
        {
          id: `doc-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
          docCategory,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          previewDataUrl: dataUrl,
          ocrAssisted: false,
          uploadedAt: new Date().toISOString(),
        },
      ],
    }));
  }

  function handleInstantDemoScan(kind: 'PAN' | 'Aadhaar' | 'BOTH') {
    if (kind === 'PAN' || kind === 'BOTH') {
      onRunOcr(
        draft.draftId,
        {
          name: `demo-pan-${draft.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.svg`,
          type: 'image/svg+xml',
          dataUrl: buildSampleDocDataUrl('PAN', draft.fullName || draft.label),
        },
        'PAN',
        'PAN'
      );
    }
    if (kind === 'Aadhaar' || kind === 'BOTH') {
      onRunOcr(
        draft.draftId,
        {
          name: `demo-aadhaar-${draft.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.svg`,
          type: 'image/svg+xml',
          dataUrl: buildSampleDocDataUrl('Aadhaar', draft.fullName || draft.label),
        },
        'Aadhaar Front',
        'Aadhaar'
      );
    }
    if (kind === 'BOTH' && !draft.phone.trim()) {
      onPatchDraft(draft.draftId, {
        phone: '+91 98204 51290',
        consentCaptured: true,
        ocrDisclaimerAcknowledged: true,
      });
    }
  }

  function isOrnamentProvenanceReady(item: GoldItem): boolean {
    if (item.provenanceType === 'generational') {
      return Boolean(item.generationalDeclarationAccepted && item.generationalRelation?.trim());
    }
    return (
      item.purchaseBillAvailable &&
      Boolean(item.purchaseBillRef?.trim()) &&
      Boolean(item.purchaseBillImageUrl)
    );
  }

  function addOrnamentRow() {
    const nextIndex = draft.goldItems.length;
    onPatchDraft(draft.draftId, (prev) => ({
      ...prev,
      goldItems: [
        ...prev.goldItems,
        {
          id: `itm-${Date.now()}-${Math.random().toString(16).slice(2, 5)}`,
          itemType: 'Bangle',
          quantity: 1,
          customerDescription: '',
          livePhotoDataUrl: '',
          provenanceType: 'bill',
          hallmarkStatus: 'BIS Hallmarked',
          purchaseBillAvailable: true,
        },
      ],
    }));
    setActiveOrnamentIndex(nextIndex);
  }

  function updateOrnament(id: string, patch: Partial<GoldItem>) {
    onPatchDraft(draft.draftId, (prev) => ({
      ...prev,
      goldItems: prev.goldItems.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
  }

  function removeOrnament(id: string) {
    if (draft.goldItems.length <= 1) return;
    onPatchDraft(draft.draftId, (prev) => ({
      ...prev,
      goldItems: prev.goldItems.filter((item) => item.id !== id),
    }));
    setActiveOrnamentIndex((idx) => Math.max(0, idx - 1));
  }

  async function handlePurchaseBillUpload(itemId: string, file: File) {
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(file);
    });
    updateOrnament(itemId, {
      provenanceType: 'bill',
      purchaseBillAvailable: true,
      purchaseBillImageUrl: dataUrl,
      purchaseBillRef: file.name,
    });
  }

  const displayTitle = draft.fullName.trim() || draft.label;
  const activeOrnament = draft.goldItems[activeOrnamentIndex] ?? draft.goldItems[0];

  const stepComplete: Record<IntakeStep, boolean> = {
    1: draft.kycDocuments.length > 0,
    2:
      Boolean(draft.fullName.trim()) &&
      Boolean(draft.phone.trim()) &&
      Boolean(draft.panNumber.trim()) &&
      draft.consentCaptured,
    3: draft.goldItems.every(
      (g) => Boolean(g.customerDescription.trim()) && isOrnamentProvenanceReady(g)
    ),
    4:
      Boolean(draft.bankName.trim()) &&
      Boolean(draft.ifscCode.trim()) &&
      Boolean(draft.accountNumber.trim()),
  };

  return (
    <div className="space-y-5">
      {/* Compact Header + Multi-Page Step Bar */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
        className="vault-card rounded-xl p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-mono font-semibold text-[#9A6B16]">
                {isEditing
                  ? `Update Intake · ${draft.existingAppNumber}`
                  : isCustomerSelfService
                    ? 'Customer Self-Application'
                    : draft.label}
              </span>
              <span aria-hidden="true">·</span>
              <span>Page {currentStep} of 4</span>
              <span aria-hidden="true">·</span>
              <span>
                {isCustomerSelfService
                  ? 'Reviewed by Branch Admin upon submission'
                  : 'Auto-saved across concurrent customer tabs'}
              </span>
            </div>
            <h2 className="text-xl font-semibold text-slate-900 truncate">
              {isEditing
                ? `Editing ${displayTitle}`
                : isCustomerSelfService
                  ? `Gold Loan Application — ${displayTitle}`
                  : `Customer Intake — ${displayTitle}`}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {!isEditing && !isCustomerSelfService && (
              <button
                type="button"
                onClick={onStartAnotherWalkIn}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5 text-[#9A6B16]" />
                <span>Next Walk-In</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onCloseDraft(draft.draftId)}
              className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isCustomerSelfService ? (
                <>
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Portal</span>
                </>
              ) : (
                <>
                  <X className="w-3.5 h-3.5" />
                  <span>Discard Tab</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Clean Segmented 4-Page Step Switcher */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 p-1 bg-slate-100 rounded-lg">
          {INTAKE_STEPS.map((item) => {
            const isCurrent = currentStep === item.step;
            const isDone = stepComplete[item.step];
            return (
              <button
                key={item.step}
                type="button"
                onClick={() => goToStep(item.step)}
                className={`px-3 py-2 rounded-md text-xs font-medium flex items-center justify-between gap-2 transition-all whitespace-nowrap cursor-pointer ${
                  isCurrent
                    ? 'bg-[#0B111E] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
                }`}
              >
                <span className="truncate">{item.shortLabel}</span>
                {isDone && (
                  <Check
                    className={`w-3.5 h-3.5 shrink-0 ${
                      isCurrent ? 'text-[#E6BF6F]' : 'text-emerald-600'
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Inline Feedback & Validation Alerts */}
      {draft.formError && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-700" />
          <span>{draft.formError}</span>
        </div>
      )}

      {draft.lastSavedMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-700" />
          <span>{draft.lastSavedMessage}</span>
        </div>
      )}

      {/* PAGE 1: KYC DOCUMENTS & INSTANT DEMO SCAN */}
      {currentStep === 1 && (
        <motion.div
          key="step-1"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          className="vault-card rounded-xl p-6 space-y-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200/80 pb-4">
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-slate-900">
                {INTAKE_STEPS[0].title}
              </h3>
              <p className="text-xs text-slate-500">
                Upload PAN or Aadhaar scans or run an instant demo KYC extraction. All extracted fields auto-fill Page 2 immediately without external API delays.
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleInstantDemoScan('BOTH')}
              className="btn-bullion inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileScan className="w-3.5 h-3.5" />
              <span>Instant Demo KYC Auto-Fill</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="p-4 border border-slate-200 hover:border-[#C5963A] rounded-lg bg-slate-50/70 hover:bg-amber-50/30 transition-colors cursor-pointer space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-900">PAN Card Scan</span>
                <FileScan className="w-4 h-4 text-[#9A6B16]" />
              </div>
              <p className="text-[11px] text-slate-500">
                Upload PAN image or PDF to extract Name, PAN number, and DOB.
              </p>
              <span className="inline-block text-[11px] font-medium text-[#9A6B16]">
                Choose File →
              </span>
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onRunOcr(draft.draftId, f, 'PAN', 'PAN');
                  e.target.value = '';
                }}
              />
            </label>

            <label className="p-4 border border-slate-200 hover:border-[#C5963A] rounded-lg bg-slate-50/70 hover:bg-amber-50/30 transition-colors cursor-pointer space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-900">Aadhaar Card Scan</span>
                <FileScan className="w-4 h-4 text-[#9A6B16]" />
              </div>
              <p className="text-[11px] text-slate-500">
                Upload Aadhaar scan to extract address and auto-masked last 4 digits.
              </p>
              <span className="inline-block text-[11px] font-medium text-[#9A6B16]">
                Choose File →
              </span>
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onRunOcr(draft.draftId, f, 'Aadhaar Front', 'Aadhaar');
                  e.target.value = '';
                }}
              />
            </label>

            <label className="p-4 border border-slate-200 hover:border-slate-300 rounded-lg bg-slate-50/70 hover:bg-slate-100/70 transition-colors cursor-pointer space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-900">Address Proof</span>
                <Upload className="w-4 h-4 text-slate-600" />
              </div>
              <p className="text-[11px] text-slate-500">
                Attach utility bill, passport, or bank passbook for Admin KYC verification.
              </p>
              <span className="inline-block text-[11px] font-medium text-slate-700">
                Attach Document →
              </span>
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handlePlainDocumentAttach(f, 'Address Proof');
                  e.target.value = '';
                }}
              />
            </label>
          </div>

          {draft.ocrInFlightCount > 0 && (
            <div className="p-3 bg-slate-900 text-slate-100 rounded-lg text-xs flex items-center gap-2.5">
              <Loader2 className="w-4 h-4 text-[#E6BF6F] animate-spin shrink-0" />
              <span>
                Extracting KYC fields ({draft.ocrInFlightCount} file) — you can proceed to Page 2 or switch customer tabs anytime.
              </span>
            </div>
          )}

          {draft.ocrError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
              Scan Notice: {draft.ocrError}
            </div>
          )}

          {draft.ocrFeedback && (
            <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-lg text-xs space-y-1">
              <div className="font-medium text-emerald-950 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                <span>Extracted ({draft.ocrFeedback.documentType})</span>
              </div>
              <p className="text-emerald-900">{draft.ocrFeedback.confidenceNotes}</p>
            </div>
          )}

          {draft.kycDocuments.length > 0 ? (
            <div className="space-y-2">
              <div className="text-xs font-medium text-slate-700">
                Attached Documents ({draft.kycDocuments.length})
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {draft.kycDocuments.map((doc) => {
                  const isImage =
                    doc.previewDataUrl?.startsWith('data:image/') ||
                    doc.mimeType?.startsWith('image/');
                  return (
                    <div
                      key={doc.id}
                      className="p-3 border border-slate-200 rounded-lg bg-slate-50/70 flex items-center gap-3 text-xs"
                    >
                      {doc.previewDataUrl && isImage ? (
                        <img
                          src={doc.previewDataUrl}
                          alt={doc.docCategory}
                          className="w-16 h-11 object-cover rounded border border-slate-200 bg-white shrink-0"
                        />
                      ) : (
                        <div className="w-16 h-11 rounded border border-slate-200 bg-white flex items-center justify-center text-[10px] font-mono font-semibold text-slate-500 shrink-0">
                          {doc.mimeType?.includes('pdf') ? 'PDF' : 'DOC'}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-slate-900 truncate">
                          {doc.docCategory} · <span className="text-slate-600">{doc.fileName}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 truncate mt-0.5">
                          {doc.ocrExtractedSummary ||
                            (doc.ocrAssisted ? 'OCR Assisted' : 'Attached for Admin KYC review')}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          onPatchDraft(draft.draftId, (prev) => ({
                            ...prev,
                            kycDocuments: prev.kycDocuments.filter((d) => d.id !== doc.id),
                          }))
                        }
                        className="p-1 text-slate-400 hover:text-red-700 cursor-pointer"
                        title="Remove attachment"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-lg text-xs text-amber-950 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-[#9A6B16] shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-medium">
                  OCR is an entry aid only and does not verify document authenticity.
                </p>
                <p className="text-amber-900/80">
                  Full 12-digit Aadhaar numbers are masked immediately (<span className="font-mono">XXXX-XXXX-1234</span>); PAN and Bank Account numbers are encrypted at rest.
                </p>
              </div>
            </div>
          )}

          {/* Page 1 Footer Controls */}
          <div className="pt-4 border-t border-slate-200/80 flex items-center justify-between gap-4">
            <span className="text-xs text-slate-500">
              Step 1 of 4 · Upload scans or continue to manual entry
            </span>
            <button
              type="button"
              onClick={() => goToStep(2)}
              className="btn-bullion inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg whitespace-nowrap cursor-pointer"
            >
              <span>Next: Customer Profile</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      )}

      {/* PAGE 2: CUSTOMER IDENTITY, ADDRESS & CONSENT */}
      {currentStep === 2 && (
        <motion.div
          key="step-2"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          className="vault-card rounded-xl p-6 space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                {INTAKE_STEPS[1].title}
              </h3>
              <p className="text-xs text-slate-500">
                Verify customer identity details and capture statutory lending consent before proceeding.
              </p>
            </div>
            {draft.kycDocuments.length === 0 && (
              <button
                type="button"
                onClick={() => handleInstantDemoScan('BOTH')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#8C5E12] bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-lg whitespace-nowrap cursor-pointer"
              >
                <FileScan className="w-3.5 h-3.5" />
                <span>Auto-Fill Sample Customer</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Customer Full Name *
              </label>
              <input
                type="text"
                value={draft.fullName}
                onChange={(e) => onPatchDraft(draft.draftId, { fullName: e.target.value })}
                placeholder="As printed on PAN card"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#B47B1B]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Mobile Number *
              </label>
              <input
                type="tel"
                value={draft.phone}
                onChange={(e) => onPatchDraft(draft.draftId, { phone: e.target.value })}
                placeholder="+91 98200 00000"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-[#B47B1B]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                PAN Number *
              </label>
              <input
                type="text"
                maxLength={10}
                value={draft.panNumber}
                onChange={(e) =>
                  onPatchDraft(draft.draftId, { panNumber: e.target.value.toUpperCase() })
                }
                placeholder="ABCDE1234F"
                className="w-full px-3 py-2 text-sm font-mono uppercase border border-slate-300 rounded-lg focus:outline-none focus:border-[#B47B1B]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Aadhaar Number (Auto-masked on entry)
              </label>
              <input
                type="text"
                value={draft.aadhaarInput}
                onChange={(e) => handleAadhaarChange(e.target.value)}
                placeholder="Enter 12 digits or last 4 digits"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-[#B47B1B]"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Stored strictly as masked format{' '}
                <span className="font-mono">
                  XXXX-XXXX-{draft.aadhaarRawDigits.slice(-4) || 'XXXX'}
                </span>
                .
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Date of Birth
              </label>
              <input
                type="date"
                value={draft.dateOfBirth}
                onChange={(e) => onPatchDraft(draft.draftId, { dateOfBirth: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-[#B47B1B]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Residential Address
              </label>
              <input
                type="text"
                value={draft.address}
                onChange={(e) => onPatchDraft(draft.draftId, { address: e.target.value })}
                placeholder="Flat, Street, Locality, City, PIN"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#B47B1B]"
              />
            </div>
          </div>

          <div className="p-4 bg-slate-50/80 border border-slate-200 rounded-lg space-y-2.5">
            <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.consentCaptured}
                onChange={(e) => onPatchDraft(draft.draftId, { consentCaptured: e.target.checked })}
                className="mt-0.5 rounded border-slate-300 text-amber-700"
              />
              <span>
                <strong className="text-slate-900">Customer Consent Captured:</strong> Customer consents to KYC verification, masked Aadhaar retention per regulatory guidelines, bullion purity testing (touchstone/XRF), and encrypted bank validation for disbursement.
              </span>
            </label>

            <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.ocrDisclaimerAcknowledged}
                onChange={(e) =>
                  onPatchDraft(draft.draftId, { ocrDisclaimerAcknowledged: e.target.checked })
                }
                className="mt-0.5 rounded border-slate-300 text-amber-700"
              />
              <span>
                Staff confirms original physical PAN and address/identity proofs were visually inspected and OCR output was not treated as proof of authenticity.
              </span>
            </label>
          </div>

          <div className="pt-4 border-t border-slate-200/80 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => goToStep(1)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Previous: KYC &amp; Scan</span>
            </button>
            <button
              type="button"
              onClick={() => goToStep(3)}
              className="btn-bullion inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg whitespace-nowrap cursor-pointer"
            >
              <span>Next: Gold Ornaments</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      )}

      {/* PAGE 3: GOLD ORNAMENTS & LIVE PHOTO CAPTURE */}
      {currentStep === 3 && activeOrnament && (
        <motion.div
          key="step-3"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          className="vault-card rounded-xl p-6 space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                {INTAKE_STEPS[2].title}
              </h3>
              <p className="text-xs text-slate-500">
                Capture live photos and descriptions ornament-by-ornament without scrolling through long lists.
              </p>
            </div>
            <button
              type="button"
              onClick={addOrnamentRow}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-[#9A6B16]" />
              <span>Add Ornament ({draft.goldItems.length})</span>
            </button>
          </div>

          {/* Ornament Pager Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {draft.goldItems.map((itm, idx) => {
                const isSelected = idx === activeOrnamentIndex;
                const provenanceReady = isOrnamentProvenanceReady(itm);
                const statusTag =
                  itm.provenanceType === 'generational'
                    ? provenanceReady
                      ? ' · Generational OK'
                      : ' · Decl Pending'
                    : provenanceReady
                      ? ' · Bill OK'
                      : ' · Bill Missing';
                return (
                  <button
                    key={itm.id}
                    type="button"
                    onClick={() => setActiveOrnamentIndex(idx)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                      isSelected
                        ? 'bg-[#0B111E] text-white border-[#0B111E]'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    #{idx + 1} · {itm.itemType}
                    {statusTag}
                  </button>
                );
              })}
            </div>

            {draft.goldItems.length > 1 && (
              <button
                type="button"
                onClick={() => removeOrnament(activeOrnament.id)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-red-700 hover:bg-red-50 rounded-lg cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove Ornament #{activeOrnamentIndex + 1}</span>
              </button>
            )}
          </div>

          {/* Focused Single Ornament Editor */}
          <div className="p-4 border border-slate-200 rounded-lg bg-slate-50/50">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
              <div className="md:col-span-4 space-y-2.5">
                <OrnamentPhoto
                  src={activeOrnament.livePhotoDataUrl}
                  alt={`${activeOrnament.itemType} photograph`}
                  label={activeOrnament.itemType}
                  className="w-full h-44"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCameraItemId(activeOrnament.id)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg whitespace-nowrap cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Live Camera</span>
                  </button>
                  <label className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer whitespace-nowrap">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Photo</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const reader = new FileReader();
                        reader.onload = () =>
                          updateOrnament(activeOrnament.id, {
                            livePhotoDataUrl: String(reader.result),
                          });
                        reader.readAsDataURL(f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
              </div>

              <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Item Type
                  </label>
                  <select
                    value={activeOrnament.itemType}
                    onChange={(e) =>
                      updateOrnament(activeOrnament.id, {
                        itemType: e.target.value as OrnamentType,
                      })
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    {ORNAMENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Quantity (pcs)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={activeOrnament.quantity}
                    onChange={(e) =>
                      updateOrnament(activeOrnament.id, {
                        quantity: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                    className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Provenance / Gold Bill *
                  </label>
                  <select
                    value={activeOrnament.provenanceType ?? 'bill'}
                    onChange={(e) => {
                      const nextProv = e.target.value as OrnamentProvenance;
                      updateOrnament(activeOrnament.id, {
                        provenanceType: nextProv,
                        purchaseBillAvailable: nextProv === 'bill',
                        hallmarkStatus:
                          nextProv === 'generational'
                            ? 'Unhallmarked (Generational / Legacy)'
                            : 'BIS Hallmarked',
                      });
                    }}
                    className="w-full px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="bill">Original Gold Bill</option>
                    <option value="generational">Generational (No Bill / No Hallmark)</option>
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Customer-Provided Description *
                  </label>
                  <input
                    type="text"
                    value={activeOrnament.customerDescription}
                    onChange={(e) =>
                      updateOrnament(activeOrnament.id, { customerDescription: e.target.value })
                    }
                    placeholder="e.g., 22K gold necklace with red Kemp central stone, approximate 40g"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  />
                </div>

                {activeOrnament.provenanceType === 'generational' ? (
                  <div className="sm:col-span-3 p-4 bg-white border border-amber-200 rounded-lg space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-900">
                        Generational / Inherited Gold Declaration (No Bill &amp; No Hallmark Allowed)
                      </span>
                      <span
                        className={`text-[11px] font-medium ${
                          isOrnamentProvenanceReady(activeOrnament)
                            ? 'text-emerald-700'
                            : 'text-amber-800'
                        }`}
                      >
                        {isOrnamentProvenanceReady(activeOrnament)
                          ? 'Declaration Complete · Queued for XRF Assay'
                          : 'Origin & Ownership Declaration Required'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Hallmark Status
                        </label>
                        <select
                          value={
                            activeOrnament.hallmarkStatus ?? 'Unhallmarked (Generational / Legacy)'
                          }
                          onChange={(e) =>
                            updateOrnament(activeOrnament.id, {
                              hallmarkStatus: e.target.value as HallmarkStatus,
                            })
                          }
                          className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                        >
                          <option value="Unhallmarked (Generational / Legacy)">
                            Unhallmarked (Pre-BIS / Heirloom)
                          </option>
                          <option value="BIS Hallmarked">Legacy Hallmark Present</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Generational / Family Source *
                        </label>
                        <input
                          type="text"
                          value={activeOrnament.generationalRelation ?? ''}
                          onChange={(e) =>
                            updateOrnament(activeOrnament.id, {
                              generationalRelation: e.target.value,
                            })
                          }
                          placeholder="e.g., Inherited Maternal Family Heirloom (1994)"
                          className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                        />
                      </div>
                    </div>

                    <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(activeOrnament.generationalDeclarationAccepted)}
                        onChange={(e) =>
                          updateOrnament(activeOrnament.id, {
                            generationalDeclarationAccepted: e.target.checked,
                          })
                        }
                        className="mt-0.5 rounded border-slate-300 text-amber-700"
                      />
                      <span>
                        <strong className="text-slate-900">
                          Self-Declaration &amp; Indemnity Accepted:
                        </strong>{' '}
                        Customer declares lawful, unencumbered family ownership without an original bill or BIS hallmark and consents to mandatory XRF/touchstone purity verification during Appraisal.
                      </span>
                    </label>
                  </div>
                ) : (
                  <div className="sm:col-span-3 p-3.5 bg-white border border-slate-200 rounded-lg space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-900">
                        Gold Purchase Bill Invoice &amp; Scan (Mandatory for Billed Gold) *
                      </span>
                      <span
                        className={`text-[11px] font-medium ${
                          activeOrnament.purchaseBillRef?.trim() &&
                          activeOrnament.purchaseBillImageUrl
                            ? 'text-emerald-700'
                            : 'text-amber-800'
                        }`}
                      >
                        {activeOrnament.purchaseBillRef?.trim() &&
                        activeOrnament.purchaseBillImageUrl
                          ? 'Gold Bill Attached'
                          : 'Invoice # and Bill Scan Required'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      <input
                        type="text"
                        value={activeOrnament.purchaseBillRef ?? ''}
                        onChange={(e) =>
                          updateOrnament(activeOrnament.id, {
                            provenanceType: 'bill',
                            purchaseBillAvailable: true,
                            purchaseBillRef: e.target.value,
                          })
                        }
                        placeholder="Jeweller Invoice / Gold Bill # *"
                        className="flex-1 min-w-[200px] px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg"
                      />
                      <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap">
                        <Upload className="w-3.5 h-3.5" />
                        <span>
                          {activeOrnament.purchaseBillImageUrl
                            ? 'Replace Gold Bill Scan'
                            : 'Upload Gold Bill *'}
                        </span>
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handlePurchaseBillUpload(activeOrnament.id, f);
                            e.target.value = '';
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const inv =
                            activeOrnament.purchaseBillRef?.trim() ||
                            `TBZ-MUM-${2024 + activeOrnamentIndex}-${1040 + activeOrnamentIndex}`;
                          updateOrnament(activeOrnament.id, {
                            provenanceType: 'bill',
                            purchaseBillAvailable: true,
                            purchaseBillRef: inv,
                            purchaseBillImageUrl: buildSampleGoldBillDataUrl(
                              activeOrnament.itemType,
                              inv
                            ),
                          });
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#8C5E12] bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-lg whitespace-nowrap cursor-pointer"
                      >
                        <FileScan className="w-3.5 h-3.5" />
                        <span>Sample Gold Bill (Demo)</span>
                      </button>
                    </div>

                    {activeOrnament.purchaseBillImageUrl && (
                      <div className="flex items-center gap-3 pt-1 text-xs">
                        <img
                          src={activeOrnament.purchaseBillImageUrl}
                          alt="Gold purchase bill preview"
                          className="w-16 h-11 object-cover rounded border border-slate-200 bg-slate-50 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="font-mono font-medium text-slate-900 truncate">
                            Bill Ref: {activeOrnament.purchaseBillRef || 'Attached'}
                          </div>
                          <div className="text-[11px] text-emerald-700">
                            Original jeweller bill scan verified for intake
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200/80 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => goToStep(2)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Previous: Customer Profile</span>
            </button>
            <button
              type="button"
              onClick={() => goToStep(4)}
              className="btn-bullion inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg whitespace-nowrap cursor-pointer"
            >
              <span>Next: Bank &amp; Review</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      )}

      {/* PAGE 4: BENEFICIARY BANK ACCOUNT & SUBMISSION REVIEW */}
      {currentStep === 4 && (
        <motion.div
          key="step-4"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          className="vault-card rounded-xl p-6 space-y-5"
        >
          <div className="border-b border-slate-200/80 pb-4">
            <h3 className="text-base font-semibold text-slate-900">
              {INTAKE_STEPS[3].title}
            </h3>
            <p className="text-xs text-slate-500">
              Enter the beneficiary bank details for loan disbursement and review the application summary before submission.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Account Holder Name
              </label>
              <input
                type="text"
                value={draft.accountHolderName}
                onChange={(e) =>
                  onPatchDraft(draft.draftId, { accountHolderName: e.target.value })
                }
                placeholder="Must match customer KYC name"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Bank Name
              </label>
              <input
                type="text"
                value={draft.bankName}
                onChange={(e) => onPatchDraft(draft.draftId, { bankName: e.target.value })}
                placeholder="e.g., HDFC Bank Ltd."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                IFSC Code
              </label>
              <input
                type="text"
                maxLength={11}
                value={draft.ifscCode}
                onChange={(e) =>
                  onPatchDraft(draft.draftId, { ifscCode: e.target.value.toUpperCase() })
                }
                placeholder="HDFC0000142"
                className="w-full px-3 py-2 text-sm font-mono uppercase border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Bank Account Number (Encrypted at rest)
              </label>
              <input
                type="text"
                value={draft.accountNumber}
                onChange={(e) => onPatchDraft(draft.draftId, { accountNumber: e.target.value })}
                placeholder="Enter full account number"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          {/* Clean Pre-Submission Summary */}
          <div className="p-4 bg-slate-50/80 border border-slate-200 rounded-lg space-y-3">
            <div className="text-xs font-semibold text-slate-900">
              Application Readiness Checklist
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">01. KYC Documents</span>
                  <button
                    type="button"
                    onClick={() => goToStep(1)}
                    className="text-[#9A6B16] hover:underline cursor-pointer"
                  >
                    Edit
                  </button>
                </div>
                <div className="font-medium text-slate-900 tabular-nums">
                  {draft.kycDocuments.length} attachment(s)
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">02. Customer Identity</span>
                  <button
                    type="button"
                    onClick={() => goToStep(2)}
                    className="text-[#9A6B16] hover:underline cursor-pointer"
                  >
                    Edit
                  </button>
                </div>
                <div className="font-medium text-slate-900 truncate">
                  {draft.fullName.trim() || 'Name required'} ·{' '}
                  <span className="font-mono">{draft.panNumber.trim() || 'PAN missing'}</span>
                </div>
                <div className="text-[11px] text-slate-500">
                  {draft.consentCaptured ? 'Consent captured' : 'Consent checkbox pending'}
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">03. Pledged Ornaments</span>
                  <button
                    type="button"
                    onClick={() => goToStep(3)}
                    className="text-[#9A6B16] hover:underline cursor-pointer"
                  >
                    Edit
                  </button>
                </div>
                <div className="font-medium text-slate-900 tabular-nums">
                  {draft.goldItems.length} item(s) ·{' '}
                  {draft.goldItems.filter((g) => g.livePhotoDataUrl).length} photo(s) ·{' '}
                  {draft.goldItems.filter((g) => isOrnamentProvenanceReady(g)).length}/
                  {draft.goldItems.length} provenance ready
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => goToStep(3)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Previous: Gold Ornaments</span>
            </button>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                disabled={draft.submitting}
                onClick={() => onSubmitDraft(draft.draftId, false)}
                className="px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg disabled:opacity-50 whitespace-nowrap cursor-pointer"
              >
                {draft.submitting ? 'Saving...' : 'Save as Draft'}
              </button>
              <button
                type="button"
                disabled={draft.submitting}
                onClick={() => onSubmitDraft(draft.draftId, true)}
                className="btn-bullion px-4 py-2 text-xs font-medium rounded-lg disabled:opacity-50 whitespace-nowrap cursor-pointer"
              >
                {draft.submitting ? 'Submitting...' : 'Submit for KYC Review'}
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Floating Bottom-Right Intake Dock */}
      {isActiveSession && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="floating-dock fixed bottom-5 right-6 z-30 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3.5 text-white max-w-[92vw] no-print"
        >
          <div className="text-xs min-w-0">
            <div className="text-[11px] text-[#E6BF6F] font-medium">
              {draft.submitting
                ? 'Submitting...'
                : `Page ${currentStep} of 4 · ${displayTitle}`}
            </div>
            <div className="font-medium text-white truncate max-w-[240px]">
              {draft.kycDocuments.length} doc(s) · {draft.goldItems.length} ornament(s)
              {draft.ocrInFlightCount > 0 ? ' · Scanning' : ''}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={draft.submitting}
              onClick={() => onSubmitDraft(draft.draftId, false)}
              className="px-3 py-2 text-xs font-medium text-slate-100 bg-white/10 hover:bg-white/15 border border-white/15 rounded-lg disabled:opacity-50 whitespace-nowrap cursor-pointer"
            >
              {draft.submitting ? 'Saving...' : 'Save Draft'}
            </button>
            {currentStep < 4 ? (
              <button
                type="button"
                onClick={() => goToStep((currentStep + 1) as IntakeStep)}
                className="btn-bullion inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg whitespace-nowrap cursor-pointer"
              >
                <span>Continue</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                disabled={draft.submitting}
                onClick={() => onSubmitDraft(draft.draftId, true)}
                className="btn-bullion px-4 py-2 text-xs font-medium rounded-lg disabled:opacity-50 whitespace-nowrap cursor-pointer"
              >
                {draft.submitting ? 'Submitting...' : 'Submit for KYC Review'}
              </button>
            )}
          </div>
        </motion.div>
      )}

      {cameraItemId && (
        <CameraModal
          title="Capture Live Ornament Photograph"
          onClose={() => setCameraItemId(null)}
          onCapture={(dataUrl) => {
            updateOrnament(cameraItemId, { livePhotoDataUrl: dataUrl });
            setCameraItemId(null);
          }}
        />
      )}
    </div>
  );
}
