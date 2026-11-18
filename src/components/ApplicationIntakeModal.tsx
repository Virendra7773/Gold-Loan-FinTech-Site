import { useState } from 'react';
import {
  AlertTriangle,
  Camera,
  FileScan,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
  GoldItem,
  GoldLoanApplication,
  KycDocumentAttachment,
  OcrExtractionResult,
  OrnamentType,
} from '../types/portal.ts';
import { portalApi } from '../services/api.ts';
import { maskAadhaarInput } from '../utils/loanMath.ts';
import { CameraModal } from './CameraModal.tsx';
import { OrnamentPhoto } from './OrnamentPhoto.tsx';

interface ApplicationIntakeModalProps {
  staffId: string;
  existingApp?: GoldLoanApplication | null;
  onSuccess: (app: GoldLoanApplication, auditEntry: unknown) => void;
  onClose: () => void;
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

export function ApplicationIntakeModal({
  staffId,
  existingApp,
  onSuccess,
  onClose,
}: ApplicationIntakeModalProps) {
  const isEditing = Boolean(existingApp);

  const [fullName, setFullName] = useState(existingApp?.customer.fullName ?? '');
  const [phone, setPhone] = useState(existingApp?.customer.phone ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(existingApp?.customer.dateOfBirth ?? '');
  const [address, setAddress] = useState(existingApp?.customer.address ?? '');
  const [panNumber, setPanNumber] = useState(existingApp?.customer.panNumber ?? '');
  const [aadhaarInput, setAadhaarInput] = useState(
    existingApp?.customer.aadhaarLast4 ? `XXXX-XXXX-${existingApp.customer.aadhaarLast4}` : ''
  );
  const [aadhaarRawDigits, setAadhaarRawDigits] = useState(
    existingApp?.customer.aadhaarLast4 ?? ''
  );
  const [consentCaptured, setConsentCaptured] = useState(
    existingApp?.customer.consentCaptured ?? false
  );
  const [ocrDisclaimerAcknowledged, setOcrDisclaimerAcknowledged] = useState(
    existingApp?.customer.ocrDisclaimerAcknowledged ?? true
  );

  const [kycDocuments, setKycDocuments] = useState<KycDocumentAttachment[]>(
    existingApp?.kycDocuments ?? []
  );

  const [goldItems, setGoldItems] = useState<GoldItem[]>(
    existingApp?.goldItems ?? [
      {
        id: `itm-${Date.now()}`,
        itemType: 'Necklace',
        quantity: 1,
        customerDescription: '',
        livePhotoDataUrl: '',
        purchaseBillAvailable: false,
      },
    ]
  );

  const [accountHolderName, setAccountHolderName] = useState(
    existingApp?.bankAccount.accountHolderName ?? ''
  );
  const [bankName, setBankName] = useState(existingApp?.bankAccount.bankName ?? '');
  const [ifscCode, setIfscCode] = useState(existingApp?.bankAccount.ifscCode ?? '');
  const [accountNumber, setAccountNumber] = useState(
    existingApp?.bankAccount.accountNumberLast4
      ? `XXXX-XXXX-${existingApp.bankAccount.accountNumberLast4}`
      : ''
  );

  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrFeedback, setOcrFeedback] = useState<OcrExtractionResult | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);

  const [cameraItemId, setCameraItemId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function handleAadhaarChange(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 12);
    setAadhaarRawDigits(digits);
    if (digits.length >= 4) {
      const { masked } = maskAadhaarInput(digits);
      setAadhaarInput(masked);
    } else {
      setAadhaarInput(value);
    }
  }

  async function handleOcrDocumentUpload(
    file: File,
    docCategory: KycDocumentAttachment['docCategory'],
    hint: 'PAN' | 'Aadhaar'
  ) {
    setOcrError(null);
    setOcrLoading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Failed to read selected file.'));
        reader.readAsDataURL(file);
      });

      const ocrResult = await portalApi.extractOcr(staffId, {
        base64Data: dataUrl,
        mimeType: file.type || 'image/jpeg',
        documentHint: hint,
        applicationId: existingApp?.id,
        applicationNumber: existingApp?.applicationNumber,
      });

      setOcrFeedback(ocrResult);
      if (ocrResult.fullName && !fullName) {
        setFullName(ocrResult.fullName);
      }
      if (ocrResult.fullName && !accountHolderName) {
        setAccountHolderName(ocrResult.fullName);
      }
      if (ocrResult.panNumber && !panNumber) {
        setPanNumber(ocrResult.panNumber);
      }
      if (ocrResult.dateOfBirth && !dateOfBirth) {
        setDateOfBirth(ocrResult.dateOfBirth);
      }
      if (ocrResult.address && !address) {
        setAddress(ocrResult.address);
      }
      if (ocrResult.aadhaarLast4) {
        setAadhaarRawDigits(ocrResult.aadhaarLast4);
        setAadhaarInput(ocrResult.aadhaarMasked || `XXXX-XXXX-${ocrResult.aadhaarLast4}`);
      }

      const summaryParts: string[] = [];
      if (ocrResult.fullName) summaryParts.push(`Name: ${ocrResult.fullName}`);
      if (ocrResult.panNumber) summaryParts.push(`PAN: ${ocrResult.panNumber}`);
      if (ocrResult.aadhaarMasked) summaryParts.push(`Aadhaar: ${ocrResult.aadhaarMasked}`);

      setKycDocuments((prev) => [
        ...prev,
        {
          id: `doc-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
          docCategory,
          fileName: file.name,
          mimeType: file.type || 'image/jpeg',
          previewDataUrl: dataUrl,
          ocrAssisted: true,
          ocrExtractedSummary: summaryParts.join(' · ') || ocrResult.confidenceNotes,
          uploadedAt: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      setOcrError(err instanceof Error ? err.message : 'OCR processing failed.');
    } finally {
      setOcrLoading(false);
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
    setKycDocuments((prev) => [
      ...prev,
      {
        id: `doc-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
        docCategory,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        previewDataUrl: dataUrl,
        ocrAssisted: false,
        uploadedAt: new Date().toISOString(),
      },
    ]);
  }

  function addOrnamentRow() {
    setGoldItems((prev) => [
      ...prev,
      {
        id: `itm-${Date.now()}-${Math.random().toString(16).slice(2, 5)}`,
        itemType: 'Bangle',
        quantity: 1,
        customerDescription: '',
        livePhotoDataUrl: '',
        purchaseBillAvailable: false,
      },
    ]);
  }

  function updateOrnament(id: string, patch: Partial<GoldItem>) {
    setGoldItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function removeOrnament(id: string) {
    if (goldItems.length <= 1) return;
    setGoldItems((prev) => prev.filter((item) => item.id !== id));
  }

  async function handlePurchaseBillUpload(itemId: string, file: File) {
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(file);
    });
    updateOrnament(itemId, {
      purchaseBillAvailable: true,
      purchaseBillImageUrl: dataUrl,
      purchaseBillRef: file.name,
    });
  }

  async function handleSave(submitForKyc: boolean) {
    setFormError(null);
    if (!fullName.trim() || !phone.trim() || !panNumber.trim()) {
      setFormError('Customer name, phone number, and PAN are required.');
      return;
    }
    if (submitForKyc && !consentCaptured) {
      setFormError('Customer consent confirmation is required before submitting for KYC.');
      return;
    }
    if (submitForKyc && goldItems.some((g) => !g.customerDescription.trim())) {
      setFormError('Provide a customer description for each pledged gold ornament.');
      return;
    }

    setSubmitting(true);
    try {
      const acctDigits = accountNumber.replace(/\D/g, '');
      if (isEditing && existingApp) {
        const res = await portalApi.updateIntake(staffId, existingApp.id, {
          customer: {
            fullName,
            phone,
            dateOfBirth,
            address,
            panNumber,
            aadhaarNumberOrLast4: aadhaarRawDigits || aadhaarInput,
            consentCaptured,
            ocrDisclaimerAcknowledged,
          },
          kycDocuments,
          goldItems,
          bankAccount: {
            accountHolderName: accountHolderName || fullName,
            bankName,
            ifscCode,
            accountNumber: acctDigits.length >= 6 ? acctDigits : undefined,
          },
          submitForKyc,
        });
        onSuccess(res.application, res.auditEntry);
      } else {
        const res = await portalApi.createApplication(staffId, {
          customer: {
            fullName,
            phone,
            dateOfBirth,
            address,
            panNumber,
            aadhaarNumberOrLast4: aadhaarRawDigits || aadhaarInput,
            consentCaptured,
            ocrDisclaimerAcknowledged,
          },
          kycDocuments,
          goldItems,
          bankAccount: {
            accountHolderName: accountHolderName || fullName,
            bankName,
            ifscCode,
            accountNumber: acctDigits || '000000',
          },
          submitForKyc,
        });
        onSuccess(res.application, res.auditEntry);
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save application.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/65 backdrop-blur-xs p-4">
      <div className="w-full max-w-4xl max-h-[92vh] bg-white border border-slate-200 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/80">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {isEditing
                ? `Update Intake · ${existingApp?.applicationNumber}`
                : 'New Gold Loan Customer Application'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              OCR assists data entry only; branch staff must verify physical KYC originals and record consent.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-200/60"
            aria-label="Close application form"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {formError && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-md text-xs text-red-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-700" />
              <span>{formError}</span>
            </div>
          )}

          {/* Section 1: OCR Document Assist & Safeguard Notice */}
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  1. KYC Document Upload & OCR Entry Aid
                </h3>
                <p className="text-xs text-slate-500">
                  Upload PAN or Aadhaar images to pre-fill fields. Aadhaar is automatically masked to last 4 digits.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-md hover:bg-slate-50 cursor-pointer whitespace-nowrap">
                  <FileScan className="w-3.5 h-3.5 text-amber-700" />
                  <span>Scan PAN (OCR)</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleOcrDocumentUpload(f, 'PAN', 'PAN');
                    }}
                  />
                </label>
                <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-md hover:bg-slate-50 cursor-pointer whitespace-nowrap">
                  <FileScan className="w-3.5 h-3.5 text-amber-700" />
                  <span>Scan Aadhaar (OCR)</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleOcrDocumentUpload(f, 'Aadhaar Front', 'Aadhaar');
                    }}
                  />
                </label>
                <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100 cursor-pointer whitespace-nowrap">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Attach Address Proof</span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handlePlainDocumentAttach(f, 'Address Proof');
                    }}
                  />
                </label>
              </div>
            </div>

            <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-md text-xs text-amber-950 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium">
                  Compliance Safeguard: OCR is an entry aid only and does not verify document authenticity.
                </p>
                <p className="text-amber-900/80">
                  Full 12-digit Aadhaar numbers are never displayed or stored in plaintext. Only masked identifiers (<span className="font-mono">XXXX-XXXX-1234</span>) and one-way hashes are retained; PAN and Bank Account numbers are AES-256-GCM encrypted at rest.
                </p>
              </div>
            </div>

            {ocrLoading && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-600">
                Running Gemini OCR extraction on uploaded document...
              </div>
            )}

            {ocrError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-800">
                OCR Error: {ocrError}
              </div>
            )}

            {ocrFeedback && (
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md text-xs space-y-1">
                <div className="font-medium text-slate-900">
                  OCR Extraction Summary ({ocrFeedback.documentType})
                </div>
                <p className="text-slate-600">{ocrFeedback.confidenceNotes}</p>
                <p className="text-[11px] text-amber-800">{ocrFeedback.disclaimer}</p>
              </div>
            )}

            {kycDocuments.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {kycDocuments.map((doc) => {
                  const isImage =
                    doc.previewDataUrl?.startsWith('data:image/') ||
                    doc.mimeType?.startsWith('image/');
                  return (
                    <div
                      key={doc.id}
                      className="p-3 border border-slate-200 rounded-md bg-slate-50/70 flex items-center gap-3 text-xs"
                    >
                      {doc.previewDataUrl && isImage ? (
                        <img
                          src={doc.previewDataUrl}
                          alt={doc.docCategory}
                          className="w-14 h-11 object-cover rounded border border-slate-200 bg-white shrink-0"
                        />
                      ) : (
                        <div className="w-14 h-11 rounded border border-slate-200 bg-white flex items-center justify-center text-[10px] font-mono font-semibold text-slate-500 shrink-0">
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
                          setKycDocuments((prev) => prev.filter((d) => d.id !== doc.id))
                        }
                        className="p-1 text-slate-400 hover:text-red-700"
                        title="Remove attachment"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <hr className="border-slate-200" />

          {/* Section 2: Customer Identity & Consent */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">
              2. Customer Identity & Address Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Customer Full Name *
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="As printed on PAN card"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-600/30 focus:border-amber-700"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Mobile Number *
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98200 00000"
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-600/30 focus:border-amber-700"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  PAN Number *
                </label>
                <input
                  type="text"
                  maxLength={10}
                  value={panNumber}
                  onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                  placeholder="ABCDE1234F"
                  className="w-full px-3 py-2 text-sm font-mono uppercase border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-600/30 focus:border-amber-700"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Aadhaar Number (Auto-masked on entry)
                </label>
                <input
                  type="text"
                  value={aadhaarInput}
                  onChange={(e) => handleAadhaarChange(e.target.value)}
                  placeholder="Enter 12 digits or last 4 digits"
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-600/30 focus:border-amber-700"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Stored strictly as masked format <span className="font-mono">XXXX-XXXX-{aadhaarRawDigits.slice(-4) || 'XXXX'}</span>.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Date of Birth
                </label>
                <input
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-600/30 focus:border-amber-700"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Residential Address
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Flat, Street, Locality, City, PIN"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-600/30 focus:border-amber-700"
                />
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentCaptured}
                  onChange={(e) => setConsentCaptured(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-amber-700 focus:ring-amber-600"
                />
                <span>
                  <strong className="text-slate-900">Customer Consent Captured:</strong> Customer consents to KYC verification, masked Aadhaar retention per regulatory guidelines, bullion purity testing (touchstone/XRF), and encrypted bank validation for disbursement.
                </span>
              </label>

              <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ocrDisclaimerAcknowledged}
                  onChange={(e) => setOcrDisclaimerAcknowledged(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-amber-700 focus:ring-amber-600"
                />
                <span>
                  Staff confirms original physical PAN and address/identity proofs were visually inspected and OCR output was not treated as proof of authenticity.
                </span>
              </label>
            </div>
          </section>

          <hr className="border-slate-200" />

          {/* Section 3: Gold Item & Live Photo Capture */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  3. Gold Ornaments & Live Photo Capture
                </h3>
                <p className="text-xs text-slate-500">
                  Record each ornament, capture a live photograph, and attach original purchase bills if available.
                </p>
              </div>
              <button
                type="button"
                onClick={addOrnamentRow}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Ornament</span>
              </button>
            </div>

            <div className="space-y-4">
              {goldItems.map((item, idx) => (
                <div
                  key={item.id}
                  className="p-4 border border-slate-200 rounded-md bg-slate-50/50 space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800">
                      Ornament {idx + 1}
                    </span>
                    {goldItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeOrnament(item.id)}
                        className="inline-flex items-center gap-1 text-xs text-red-700 hover:text-red-800"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                    <div className="md:col-span-4 space-y-2">
                      <OrnamentPhoto
                        src={item.livePhotoDataUrl}
                        alt={`${item.itemType} photograph`}
                        label={item.itemType}
                        className="w-full h-36"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setCameraItemId(item.id)}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md whitespace-nowrap"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>Live Camera</span>
                        </button>
                        <label className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md cursor-pointer whitespace-nowrap">
                          <Upload className="w-3.5 h-3.5" />
                          <span>Upload</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (!f) return;
                              const reader = new FileReader();
                              reader.onload = () =>
                                updateOrnament(item.id, {
                                  livePhotoDataUrl: String(reader.result),
                                });
                              reader.readAsDataURL(f);
                            }}
                          />
                        </label>
                      </div>
                    </div>

                    <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Item Type
                        </label>
                        <select
                          value={item.itemType}
                          onChange={(e) =>
                            updateOrnament(item.id, {
                              itemType: e.target.value as OrnamentType,
                            })
                          }
                          className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
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
                          value={item.quantity}
                          onChange={(e) =>
                            updateOrnament(item.id, {
                              quantity: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                          className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-md"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Original Purchase Bill
                        </label>
                        <select
                          value={item.purchaseBillAvailable ? 'yes' : 'no'}
                          onChange={(e) =>
                            updateOrnament(item.id, {
                              purchaseBillAvailable: e.target.value === 'yes',
                            })
                          }
                          className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
                        >
                          <option value="no">Not Available</option>
                          <option value="yes">Available</option>
                        </select>
                      </div>

                      <div className="sm:col-span-3">
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Customer-Provided Description *
                        </label>
                        <input
                          type="text"
                          value={item.customerDescription}
                          onChange={(e) =>
                            updateOrnament(item.id, { customerDescription: e.target.value })
                          }
                          placeholder="e.g., 22K gold necklace with red Kemp central stone, approximate 40g"
                          className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
                        />
                      </div>

                      {item.purchaseBillAvailable && (
                        <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
                          <input
                            type="text"
                            value={item.purchaseBillRef ?? ''}
                            onChange={(e) =>
                              updateOrnament(item.id, { purchaseBillRef: e.target.value })
                            }
                            placeholder="Invoice / Jeweller Bill Reference #"
                            className="flex-1 min-w-[200px] px-3 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md"
                          />
                          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 cursor-pointer">
                            <Upload className="w-3.5 h-3.5" />
                            <span>
                              {item.purchaseBillImageUrl ? 'Replace Bill Scan' : 'Attach Bill Scan'}
                            </span>
                            <input
                              type="file"
                              accept="image/*,application/pdf"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handlePurchaseBillUpload(item.id, f);
                              }}
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <hr className="border-slate-200" />

          {/* Section 4: Disbursement Bank Account Details */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">
              4. Beneficiary Bank Account Details (For Disbursement)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Account Holder Name
                </label>
                <input
                  type="text"
                  value={accountHolderName}
                  onChange={(e) => setAccountHolderName(e.target.value)}
                  placeholder="Must match customer KYC name"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Bank Name
                </label>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="e.g., HDFC Bank Ltd."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  IFSC Code
                </label>
                <input
                  type="text"
                  maxLength={11}
                  value={ifscCode}
                  onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                  placeholder="HDFC0000142"
                  className="w-full px-3 py-2 text-sm font-mono uppercase border border-slate-300 rounded-md"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Bank Account Number (Encrypted at rest)
                </label>
                <input
                  type="text"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="Enter full account number"
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
                />
              </div>
            </div>
          </section>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
          >
            Cancel
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleSave(false)}
              className="px-4 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 rounded-md disabled:opacity-50 whitespace-nowrap"
            >
              Save as Draft
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleSave(true)}
              className="btn-bullion px-4 py-2 text-xs font-medium rounded-lg disabled:opacity-50 whitespace-nowrap cursor-pointer"
            >
              {submitting ? 'Saving...' : 'Submit for KYC Review'}
            </button>
          </div>
        </div>
      </div>

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
