import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  Calculator,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  Edit3,
  FileCheck2,
  Lock,
  PenTool,
  Plus,
  Receipt,
  ShieldCheck,
  Sparkles,
  UserCheck,
  X,
} from 'lucide-react';
import type {
  AuditLogEntry,
  BranchWalletSummary,
  GoldLoanApplication,
  LendingPolicy,
  PurityGrade,
  RepaymentReceipt,
  RepaymentScheme,
  StaffUser,
} from '../types/portal.ts';
import { calculateLoanOffer, formatGrams, formatINR } from '../utils/loanMath.ts';
import {
  downloadRepaymentReceiptPdf,
  downloadSanctionLetterPdf,
} from '../utils/sanctionPdf.ts';
import { portalApi } from '../services/api.ts';
import { OrnamentPhoto } from './OrnamentPhoto.tsx';
import { SignatureModal } from './SignatureModal.tsx';
import { StatusText } from './StatusText.tsx';

interface CustomerPortalViewProps {
  currentUser: StaffUser;
  applications: GoldLoanApplication[];
  policy: LendingPolicy;
  preferredAppId?: string | null;
  onApplyForLoan: () => void;
  onEditApplication: (app: GoldLoanApplication) => void;
  onApplicationUpdated: (
    app: GoldLoanApplication,
    auditEntry: AuditLogEntry,
    wallet?: BranchWalletSummary
  ) => void;
}

const CUSTOMER_MILESTONES = [
  { key: 'intake', label: 'Application & KYC' },
  { key: 'appraisal', label: 'Gold Appraisal' },
  { key: 'offer', label: 'Loan Offer' },
  { key: 'sanction', label: 'Dual-Signed Sanction' },
  { key: 'disbursed', label: 'Vaulted & Disbursed' },
];

const PURITY_OPTIONS: PurityGrade[] = ['24K', '22K', '20K', '18K'];
const SCHEME_OPTIONS: RepaymentScheme[] = ['Monthly EMI', 'Quarterly Interest', 'Bullet Maturity'];

function getCustomerMilestoneIndex(app: GoldLoanApplication): number {
  switch (app.status) {
    case 'Draft':
    case 'KYC Pending':
    case 'KYC Info Required':
    case 'KYC Rejected':
      return 0;
    case 'KYC Approved':
    case 'Appraisal Pending':
      return 1;
    case 'Loan Offer Ready':
      return 2;
    case 'Sanction Pending':
    case 'Sanctioned':
      return 3;
    case 'Collateral Stored':
    case 'Disbursement Pending':
    case 'Disbursed':
      return 4;
    default:
      return 0;
  }
}

export function CustomerPortalView({
  currentUser,
  applications,
  policy,
  preferredAppId,
  onApplyForLoan,
  onEditApplication,
  onApplicationUpdated,
}: CustomerPortalViewProps) {
  const myApplications = useMemo(() => {
    const linkedName = currentUser.linkedCustomerName?.trim().toLowerCase();
    return applications.filter(
      (a) =>
        a.createdById === currentUser.id ||
        (Boolean(linkedName) && a.customer.fullName.trim().toLowerCase() === linkedName)
    );
  }, [applications, currentUser.id, currentUser.linkedCustomerName]);

  const [selectedAppId, setSelectedAppId] = useState<string>(() => {
    return preferredAppId || myApplications[0]?.id || '';
  });

  useEffect(() => {
    if (preferredAppId && myApplications.some((a) => a.id === preferredAppId)) {
      setSelectedAppId(preferredAppId);
    } else if (!myApplications.some((a) => a.id === selectedAppId)) {
      setSelectedAppId(myApplications[0]?.id ?? '');
    }
  }, [preferredAppId, myApplications, selectedAppId]);

  const activeApp = useMemo(
    () => myApplications.find((a) => a.id === selectedAppId) ?? myApplications[0] ?? null,
    [myApplications, selectedAppId]
  );

  // Quick Loan Eligibility Estimator state (for new customers exploring offers)
  const [estGrams, setEstGrams] = useState<number>(25);
  const [estPurity, setEstPurity] = useState<PurityGrade>('22K');
  const [estTenure, setEstTenure] = useState<number>(policy.allowedTenuresMonths[2] ?? 12);
  const [estScheme, setEstScheme] = useState<RepaymentScheme>('Monthly EMI');

  const [paymentMode, setPaymentMode] = useState<'UPI' | 'NEFT' | 'Auto-Debit'>('UPI');
  const [paying, setPaying] = useState(false);
  const [signingOpen, setSigningOpen] = useState(false);
  const [exportingSanction, setExportingSanction] = useState(false);
  const [viewingReceipt, setViewingReceipt] = useState<RepaymentReceipt | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const estimatorOffer = useMemo(() => {
    const safeGrams = Number.isFinite(estGrams) && estGrams > 0 ? estGrams : 1;
    const marketValue = Math.round(safeGrams * policy.goldRatesPerGram[estPurity]);
    const maxEligible = Math.round(marketValue * (policy.maxLtvPercent / 100));
    const offer = calculateLoanOffer({
      totalAppraisedValue: marketValue,
      requestedAmount: maxEligible,
      sanctionedAmount: maxEligible,
      tenureMonths: estTenure,
      repaymentScheme: estScheme,
      policy,
    });
    return { marketValue, offer: offer.terms };
  }, [estGrams, estPurity, estTenure, estScheme, policy]);

  const scheduleInfo = useMemo(() => {
    if (!activeApp?.loanOffer) return null;
    const totalAppraised = activeApp.goldItems.reduce(
      (sum, g) => sum + (g.appraisedValue ?? 0),
      0
    );
    return calculateLoanOffer({
      totalAppraisedValue: totalAppraised || activeApp.loanOffer.sanctionedAmount,
      requestedAmount: activeApp.loanOffer.requestedAmount,
      sanctionedAmount: activeApp.loanOffer.sanctionedAmount,
      tenureMonths: activeApp.loanOffer.tenureMonths,
      repaymentScheme: activeApp.loanOffer.repaymentScheme,
      policy,
    });
  }, [activeApp, policy]);

  if (!activeApp) {
    return (
      <div className="space-y-6 pb-24">
        {/* Customer Account Details + Hero CTA */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="vault-card rounded-xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5"
        >
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-[#9A6B16]">
              <UserCheck className="w-3.5 h-3.5" />
              <span>Borrower Self-Service Account · Active</span>
            </div>
            <h2 className="text-2xl font-semibold text-slate-900">
              Welcome, {currentUser.name}
            </h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
              <span>
                Customer ID:{' '}
                <strong className="font-mono text-slate-900">{currentUser.employeeCode}</strong>
              </span>
              {currentUser.phone && (
                <span>
                  Mobile: <strong className="font-mono text-slate-900">{currentUser.phone}</strong>
                </span>
              )}
              {currentUser.demoCredentials?.loginId && (
                <span>
                  Login ID:{' '}
                  <strong className="font-mono text-slate-900">
                    {currentUser.demoCredentials.loginId}
                  </strong>
                </span>
              )}
              <span>Branch: {currentUser.branchName}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onApplyForLoan}
              className="btn-bullion inline-flex items-center justify-center gap-2 px-5 py-3 text-xs sm:text-sm font-semibold rounded-lg whitespace-nowrap cursor-pointer w-full sm:w-auto"
            >
              <Plus className="w-4 h-4" />
              <span>Apply for Gold Loan</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </motion.div>

        {/* Live Bullion Rates & Lending Terms */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {PURITY_OPTIONS.map((purity, idx) => (
            <motion.div
              key={purity}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, delay: idx * 0.03 }}
              className="vault-card rounded-xl p-4 sm:p-5"
            >
              <div className="text-xs font-medium text-slate-500">
                {purity} Gold Rate (Per Gram)
              </div>
              <div className="mt-1.5 text-xl sm:text-2xl font-semibold font-mono tabular-nums text-slate-900">
                {formatINR(policy.goldRatesPerGram[purity])}
              </div>
              <div className="mt-1 text-[11px] text-[#9A6B16] font-mono">
                Up to {policy.maxLtvPercent}% LTV ·{' '}
                {formatINR(
                  Math.round(policy.goldRatesPerGram[purity] * (policy.maxLtvPercent / 100))
                )}
                /g loan
              </div>
            </motion.div>
          ))}
        </div>

        {/* Personalized Gold Loan Offers */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.06 }}
          className="vault-card rounded-xl p-5 sm:p-6 space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 text-xs font-medium text-[#9A6B16]">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Instant Gold Loan Offers · {policy.organizationName}</span>
              </div>
              <h3 className="text-base font-semibold text-slate-900">
                Choose a Repayment Scheme &amp; Submit Application From Your Phone
              </h3>
            </div>
            <div className="text-xs font-mono text-slate-500">
              Processing {policy.processingFeePercent}% · Assay {formatINR(policy.valuationFeeFlat)}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {SCHEME_OPTIONS.map((scheme) => {
              const rate = policy.interestRatesByScheme[scheme];
              const description =
                scheme === 'Monthly EMI'
                  ? 'Equal monthly principal + interest payments with instant PDF receipts.'
                  : scheme === 'Quarterly Interest'
                    ? 'Pay interest quarterly and settle principal comfortably at maturity.'
                    : 'Zero monthly installments — repay entire principal + interest on closing date.';
              return (
                <div
                  key={scheme}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-900">{scheme}</span>
                      <span className="font-mono text-xs font-semibold text-[#9A6B16]">
                        {rate}% p.a.
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{description}</p>
                    <div className="pt-1 text-[11px] font-mono text-slate-500">
                      Tenures: {policy.allowedTenuresMonths.join(' / ')} months · Up to{' '}
                      {policy.maxLtvPercent}% LTV
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onApplyForLoan}
                    className="w-full py-2 px-3 text-xs font-medium text-slate-900 bg-white border border-slate-300 hover:border-[#B47B1B] hover:bg-amber-50/50 rounded-lg inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span>Apply with {scheme}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#9A6B16]" />
                  </button>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Interactive Loan Eligibility Estimator */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.1 }}
          className="vault-card rounded-xl p-5 sm:p-6 space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div className="flex items-center gap-2">
              <Calculator className="w-4 h-4 text-[#9A6B16]" />
              <h3 className="text-sm font-semibold text-slate-900">
                Instant Gold Loan Eligibility Estimator
              </h3>
            </div>
            <span className="text-xs text-slate-500">
              Final sanction is confirmed after Certified Appraiser assay
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Approx. Net Gold Weight (grams)
                </label>
                <input
                  type="number"
                  min={1}
                  max={5000}
                  value={estGrams}
                  onChange={(e) => setEstGrams(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2.5 text-sm font-mono border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-[#B47B1B]"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Gold Purity</label>
                <select
                  value={estPurity}
                  onChange={(e) => setEstPurity(e.target.value as PurityGrade)}
                  className="w-full px-3 py-2.5 text-sm font-medium border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-[#B47B1B]"
                >
                  {PURITY_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p} ({formatINR(policy.goldRatesPerGram[p])}/g)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Loan Tenure</label>
                <select
                  value={estTenure}
                  onChange={(e) => setEstTenure(Number(e.target.value))}
                  className="w-full px-3 py-2.5 text-sm font-medium border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-[#B47B1B]"
                >
                  {policy.allowedTenuresMonths.map((m) => (
                    <option key={m} value={m}>
                      {m} Months
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Repayment Scheme</label>
                <select
                  value={estScheme}
                  onChange={(e) => setEstScheme(e.target.value as RepaymentScheme)}
                  className="w-full px-3 py-2.5 text-sm font-medium border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-[#B47B1B]"
                >
                  {SCHEME_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s} ({policy.interestRatesByScheme[s]}% p.a.)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="lg:col-span-6 p-4 sm:p-5 rounded-xl bg-[#0B111E] text-white space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-medium text-[#E6BF6F]">
                    Estimated Max Eligible Loan ({policy.maxLtvPercent}% LTV)
                  </div>
                  <div className="mt-1 text-2xl sm:text-3xl font-semibold font-mono tabular-nums text-white">
                    {formatINR(estimatorOffer.offer.maxEligibleAmount)}
                  </div>
                </div>
                <div className="text-right text-xs">
                  <div className="text-slate-400">Est. Gold Value</div>
                  <div className="font-mono font-semibold text-slate-100 tabular-nums">
                    {formatINR(estimatorOffer.marketValue)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-800 text-xs">
                <div>
                  <div className="text-slate-400">Interest Rate</div>
                  <div className="font-mono font-semibold text-white">
                    {estimatorOffer.offer.annualInterestRate}% p.a.
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">
                    {estScheme === 'Monthly EMI' ? 'Est. Monthly EMI' : 'Installment'}
                  </div>
                  <div className="font-mono font-semibold text-white tabular-nums">
                    {formatINR(estimatorOffer.offer.monthlyInstallment)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Net Disbursal</div>
                  <div className="font-mono font-semibold text-emerald-400 tabular-nums">
                    {formatINR(estimatorOffer.offer.netDisbursementAmount)}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={onApplyForLoan}
                className="btn-bullion w-full py-2.5 px-4 text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Start Application for {formatINR(estimatorOffer.offer.maxEligibleAmount)}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-600">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-900">1. Scan KYC Docs:</strong> Upload or demo-scan PAN
                &amp; Aadhaar with automatic last-4 masking.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-900">2. Gold Provenance:</strong> Capture ornament photo
                + attach Gold Bill OR Generational / Inherited declaration.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-900">3. Submit for Review:</strong> Sent straight to
                Branch Admin KYC queue as usual.
              </span>
            </div>
          </div>
        </motion.div>

        {/* Floating Bottom-Right Self-Service CTA */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="floating-dock fixed bottom-5 right-6 z-30 rounded-xl px-4 py-3 flex items-center gap-4 text-white max-w-[92vw] no-print"
        >
          <div className="text-xs">
            <div className="text-[11px] text-[#E6BF6F] font-medium">
              Pre-Approved Policy · {policy.maxLtvPercent}% LTV
            </div>
            <div className="font-medium text-white">
              Ready to pledge ornaments? Apply directly from your phone
            </div>
          </div>
          <button
            type="button"
            onClick={onApplyForLoan}
            className="btn-bullion inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Apply for Loan</span>
          </button>
        </motion.div>
      </div>
    );
  }

  const repayments = activeApp.repayments || [];
  const totalScheduledEmis = scheduleInfo?.schedule.length ?? 0;
  const emisPaidCount = repayments.length;
  const emisLeftCount = Math.max(0, totalScheduledEmis - emisPaidCount);

  const totalPaidAmount = repayments.reduce((sum, r) => sum + r.totalPaid, 0);
  const principalPaidSoFar = repayments.reduce((sum, r) => sum + r.principalPaid, 0);
  const interestPaidSoFar = repayments.reduce((sum, r) => sum + r.interestPaid, 0);

  const totalRepayable = activeApp.loanOffer?.totalRepayableAmount ?? 0;
  const remainingBalance = Math.max(0, totalRepayable - totalPaidAmount);

  const paidNumbers = new Set(repayments.map((r) => r.installmentNumber));
  const nextDueRow = scheduleInfo?.schedule.find((r) => !paidNumbers.has(r.installmentNumber));

  const bothSigned = Boolean(
    activeApp.sanctionSigning?.customerSigned && activeApp.sanctionSigning?.branchRepSigned
  );
  const milestoneIdx = getCustomerMilestoneIndex(activeApp);

  async function handlePayNextInstallment(installmentNumber?: number) {
    if (!activeApp) return;
    setFeedback(null);
    setPaying(true);
    try {
      const res = await portalApi.recordRepayment(currentUser.id, activeApp.id, {
        installmentNumber,
        paymentMode,
      });
      onApplicationUpdated(res.application, res.auditEntry, res.branchWallet);
      const latestReceipt = res.application.repayments[res.application.repayments.length - 1];
      setFeedback({
        type: 'ok',
        text: `Payment confirmed! Receipt ${latestReceipt?.receiptNumber ?? ''} issued for ${formatINR(latestReceipt?.totalPaid)}.`,
      });
      if (latestReceipt) setViewingReceipt(latestReceipt);
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to record installment payment.',
      });
    } finally {
      setPaying(false);
    }
  }

  async function handleCustomerSign(signatureDataUrl: string) {
    if (!activeApp) return;
    setSigningOpen(false);
    setFeedback(null);
    try {
      const res = await portalApi.signSanction(currentUser.id, activeApp.id, {
        signerType: 'customer',
        signatureDataUrl,
      });
      onApplicationUpdated(res.application, res.auditEntry, res.branchWallet);
      setFeedback({
        type: 'ok',
        text: 'Your signature is recorded. Sanction PDF download unlocks once the Branch Admin countersigns.',
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to save signature.',
      });
    }
  }

  async function handleDownloadSanction() {
    if (!activeApp) return;
    setFeedback(null);
    setExportingSanction(true);
    try {
      const file = await downloadSanctionLetterPdf(activeApp, policy);
      const res = await portalApi.recordSanctionExport(currentUser.id, activeApp.id, 'PDF');
      onApplicationUpdated(res.application, res.auditEntry, res.branchWallet);
      setFeedback({ type: 'ok', text: `Downloaded ${file}` });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Download failed.',
      });
    } finally {
      setExportingSanction(false);
    }
  }

  const canEditIntake = ['Draft', 'KYC Info Required'].includes(activeApp.status);
  const latestKycReview = activeApp.kycReviewHistory[0];

  return (
    <div className="space-y-6 pb-24">
      {/* Customer Context Header & Selector */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="vault-card rounded-xl p-5 flex flex-wrap items-center justify-between gap-4"
      >
        <div className="space-y-1">
          <div className="text-xs font-medium text-[#9A6B16]">
            Customer Self-Service Account · {currentUser.employeeCode}
          </div>
          <h2 className="text-xl font-semibold text-slate-900">
            Welcome, {activeApp.customer.fullName}
          </h2>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
            <span className="font-mono font-medium text-slate-900">
              {activeApp.applicationNumber}
            </span>
            <span className="text-slate-300">·</span>
            <StatusText status={activeApp.status} />
            <span className="text-slate-300">·</span>
            <span className="font-mono">{activeApp.customer.phone || currentUser.phone}</span>
            <span className="text-slate-300">·</span>
            <span>{activeApp.branchName}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              Your Loan File(s) ({myApplications.length})
            </label>
            <select
              value={activeApp.id}
              onChange={(e) => {
                setSelectedAppId(e.target.value);
                setFeedback(null);
              }}
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg font-medium text-slate-900 focus:outline-none focus:border-[#B47B1B]"
            >
              {myApplications.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.customer.fullName} · {app.applicationNumber} ({app.status})
                </option>
              ))}
            </select>
          </div>

          {canEditIntake && (
            <button
              type="button"
              onClick={() => onEditApplication(activeApp)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-amber-950 bg-amber-50 border border-amber-300 hover:bg-amber-100 rounded-lg whitespace-nowrap cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>
                {activeApp.status === 'Draft' ? 'Complete Draft' : 'Update & Resubmit KYC'}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={onApplyForLoan}
            className="btn-bullion inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Apply for New Loan</span>
          </button>
        </div>
      </motion.div>

      {activeApp.status === 'KYC Pending' && (
        <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/70 text-xs text-amber-950 flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="font-semibold">Submitted for Branch Admin Review:</span> Your KYC
            documents and gold ornament details ({activeApp.applicationNumber}) are now in the
            Branch Admin KYC verification queue.
          </div>
          <span className="font-mono text-[11px] text-amber-800">
            Today&apos;s {policy.maxLtvPercent}% LTV · Rates locked upon appraisal
          </span>
        </div>
      )}

      {activeApp.status === 'KYC Info Required' && latestKycReview && (
        <div className="p-4 rounded-xl border border-amber-300 bg-amber-50 text-xs text-amber-950 flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="font-semibold">Branch Admin Requested More Info:</span>{' '}
            {latestKycReview.remarks}
          </div>
          <button
            type="button"
            onClick={() => onEditApplication(activeApp)}
            className="btn-bullion px-3.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap cursor-pointer"
          >
            Edit &amp; Resubmit Details
          </button>
        </div>
      )}

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Clean 5-Step Journey Progress */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, delay: 0.04, ease: [0.16, 1, 0.3, 1] }}
        className="vault-card rounded-xl p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-900">Your Gold Loan Status</h3>
          <div className="flex flex-wrap items-center gap-2">
            {activeApp.loanOffer &&
              !activeApp.sanctionSigning?.customerSigned &&
              ['Loan Offer Ready', 'Sanction Pending'].includes(activeApp.status) && (
                <button
                  type="button"
                  onClick={() => setSigningOpen(true)}
                  className="btn-bullion inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg cursor-pointer"
                >
                  <PenTool className="w-3.5 h-3.5" />
                  <span>Sign Sanction Letter</span>
                </button>
              )}
            {bothSigned && (
              <button
                type="button"
                disabled={exportingSanction}
                onClick={handleDownloadSanction}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-900 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>
                  {exportingSanction ? 'Generating...' : 'Download Signed Sanction Letter'}
                </span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {CUSTOMER_MILESTONES.map((step, idx) => {
            const done = idx < milestoneIdx || activeApp.status === 'Disbursed';
            const active = idx === milestoneIdx && activeApp.status !== 'Disbursed';
            return (
              <div
                key={step.key}
                className={`p-3 rounded-md border text-xs ${
                  done
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                    : active
                      ? 'bg-amber-50 border-amber-300 text-amber-950'
                      : 'bg-slate-50 border-slate-200 text-slate-500'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] font-semibold">Step {idx + 1}</span>
                  {done ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                  ) : (
                    <Clock className="w-3.5 h-3.5 opacity-60" />
                  )}
                </div>
                <div className="mt-1.5 font-medium">{step.label}</div>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Loan Repayment Metrics (Visible once Offer/Loan exists) */}
      {activeApp.loanOffer && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className="vault-card vault-card-interactive rounded-xl p-5"
          >
            <div className="text-xs font-medium text-slate-500">Sanctioned Loan Principal</div>
            <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-slate-900">
              {formatINR(activeApp.loanOffer.sanctionedAmount)}
            </div>
            <div className="mt-1 text-xs text-slate-500 font-mono">
              {activeApp.loanOffer.annualInterestRate}% p.a. · {activeApp.loanOffer.repaymentScheme}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, delay: 0.04 }}
            className="vault-card vault-card-interactive rounded-xl p-5 bg-gradient-to-br from-emerald-50/80 to-white border-emerald-200/80"
          >
            <div className="text-xs font-medium text-emerald-900">Total Amount Paid</div>
            <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-emerald-950">
              {formatINR(totalPaidAmount)}
            </div>
            <div className="mt-1 text-xs text-emerald-800 font-mono tabular-nums">
              Principal {formatINR(principalPaidSoFar)} + Interest {formatINR(interestPaidSoFar)}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, delay: 0.08 }}
            className="vault-card vault-card-interactive rounded-xl p-5"
          >
            <div className="text-xs font-medium text-slate-500">Remaining Balance</div>
            <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-slate-900">
              {formatINR(remainingBalance)}
            </div>
            <div className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
              Out of {formatINR(totalRepayable)} total payable
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, delay: 0.12 }}
            className="vault-card vault-card-interactive rounded-xl p-5 bg-gradient-to-br from-amber-50/75 to-white border-amber-200/80"
          >
            <div className="text-xs font-medium text-amber-900">EMIs Left</div>
            <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-amber-950">
              {activeApp.status === 'Disbursed' ? `${emisLeftCount} Left` : `${totalScheduledEmis} Planned`}
            </div>
            <div className="mt-1 text-xs text-amber-800 font-mono tabular-nums">
              {emisPaidCount} of {totalScheduledEmis} installments paid
            </div>
          </motion.div>
        </div>
      )}

      {/* Pay Next Installment Action Bar for Disbursed Loans */}
      {activeApp.status === 'Disbursed' && nextDueRow && (
        <div className="vault-card rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <CreditCard className="w-4 h-4 text-[#9A6B16]" />
              <span>
                Next Due: Installment #{nextDueRow.installmentNumber} ({nextDueRow.dueLabel}) —{' '}
                <span className="font-mono tabular-nums">{formatINR(nextDueRow.totalPayment)}</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 font-mono tabular-nums">
              Includes Principal {formatINR(nextDueRow.principalComponent)} + Interest{' '}
              {formatINR(nextDueRow.interestComponent)} · Instant PDF Receipt generated upon payment.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={paymentMode}
              onChange={(e) =>
                setPaymentMode(e.target.value as 'UPI' | 'NEFT' | 'Auto-Debit')
              }
              className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="UPI">UPI Instant Pay</option>
              <option value="NEFT">NEFT / NetBanking</option>
              <option value="Auto-Debit">Auto-Debit Mandate</option>
            </select>
            <button
              type="button"
              disabled={paying}
              onClick={() => handlePayNextInstallment(nextDueRow.installmentNumber)}
              className="btn-bullion px-4 py-2 text-xs font-medium rounded-lg disabled:opacity-50 whitespace-nowrap cursor-pointer"
            >
              {paying
                ? 'Processing Payment...'
                : `Pay ${formatINR(nextDueRow.totalPayment)} Now`}
            </button>
          </div>
        </div>
      )}

      {/* Two-Column Detail Grid: Receipts & Schedule + Pledged Gold & Vault */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Payment Receipts & Installment Schedule */}
        <div className="lg:col-span-7 vault-card rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-amber-700" />
              <h3 className="text-sm font-semibold text-slate-900">
                EMI Schedule &amp; Payment Receipts
              </h3>
            </div>
            <span className="text-xs font-mono text-slate-500">
              {repayments.length} Receipt(s) Issued
            </span>
          </div>

          {!scheduleInfo ? (
            <div className="p-8 text-center text-xs text-slate-500">
              Your repayment schedule will appear once your gold appraisal and loan offer are finalized.
            </div>
          ) : (
            <div className="max-h-[460px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                  <tr>
                    <th className="py-2.5 px-4">EMI #</th>
                    <th className="py-2.5 px-4">Schedule</th>
                    <th className="py-2.5 px-4 text-right">Amount</th>
                    <th className="py-2.5 px-4">Status / Receipt</th>
                    <th className="py-2.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {scheduleInfo.schedule.map((row) => {
                    const receipt = repayments.find(
                      (r) => r.installmentNumber === row.installmentNumber
                    );
                    return (
                      <tr key={row.installmentNumber} className="hover:bg-slate-50/80">
                        <td className="py-2.5 px-4 font-mono text-slate-600">
                          #{row.installmentNumber}
                        </td>
                        <td className="py-2.5 px-4 text-slate-800">{row.dueLabel}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums font-medium text-slate-900">
                          {formatINR(row.totalPayment)}
                        </td>
                        <td className="py-2.5 px-4">
                          {receipt ? (
                            <div className="space-y-0.5">
                              <div className="font-medium text-emerald-700 flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Paid · {receipt.receiptNumber}</span>
                              </div>
                              <div className="text-[11px] font-mono text-slate-500">
                                {new Date(receipt.paidAt).toLocaleDateString('en-IN')} ·{' '}
                                {receipt.paymentMode}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-500">
                              {activeApp.status === 'Disbursed' ? 'Upcoming' : 'Scheduled'}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right whitespace-nowrap">
                          {receipt ? (
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setViewingReceipt(receipt)}
                                className="text-xs font-medium text-slate-700 hover:text-slate-900 underline"
                              >
                                View
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  downloadRepaymentReceiptPdf(activeApp, receipt, policy)
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-amber-900 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded"
                              >
                                <Download className="w-3 h-3" />
                                <span>Receipt PDF</span>
                              </button>
                            </div>
                          ) : activeApp.status === 'Disbursed' &&
                            nextDueRow?.installmentNumber === row.installmentNumber ? (
                            <button
                              type="button"
                              disabled={paying}
                              onClick={() => handlePayNextInstallment(row.installmentNumber)}
                              className="px-2.5 py-1 text-[11px] font-medium text-white bg-slate-900 hover:bg-slate-800 rounded"
                            >
                              Pay EMI
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pledged Ornaments & Vault Safety */}
        <div className="lg:col-span-5 space-y-6">
          <div className="vault-card rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-sm font-semibold text-slate-900">
                Your Pledged Gold &amp; Vault Custody
              </h3>
              {activeApp.collateralStorage && (
                <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-emerald-700">
                  <Lock className="w-3.5 h-3.5" />
                  <span>{activeApp.collateralStorage.packageSealNumber}</span>
                </span>
              )}
            </div>

            {activeApp.collateralStorage ? (
              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-md text-xs text-emerald-950 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold">
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  <span>Sealed &amp; Insured in Branch Vault</span>
                </div>
                <div className="font-mono text-emerald-800">
                  Seal {activeApp.collateralStorage.packageSealNumber} ·{' '}
                  {activeApp.collateralStorage.storageBoxNumber} ·{' '}
                  {activeApp.collateralStorage.vaultLocation}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Ornaments are inspected by our Certified Bullion Appraiser and sealed in dual-key vault custody upon sanction.
              </p>
            )}

            <div className="space-y-3">
              {activeApp.goldItems.map((item) => (
                <div
                  key={item.id}
                  className="p-3 border border-slate-200 rounded-md flex items-center gap-3"
                >
                  <OrnamentPhoto
                    src={item.livePhotoDataUrl}
                    alt={item.itemType}
                    label={item.itemType}
                    className="w-16 h-14 shrink-0"
                  />
                  <div className="min-w-0 flex-1 text-xs">
                    <div className="font-semibold text-slate-900">
                      {item.itemType} (Qty {item.quantity})
                    </div>
                    <p className="text-slate-600 truncate">{item.customerDescription}</p>
                    <div className="mt-1 font-mono text-[11px] text-slate-500 tabular-nums">
                      {item.netWeightGrams
                        ? `Net ${formatGrams(item.netWeightGrams)} · ${item.purity} · Valued ${formatINR(item.appraisedValue)}`
                        : 'Pending bullion appraisal'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Disbursement Bank Info */}
          <div className="vault-card rounded-xl p-5 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-900">Registered Bank Account</span>
              <span className="font-medium text-emerald-700">
                {activeApp.bankAccount.verificationStatus}
              </span>
            </div>
            <div className="text-slate-700">
              {activeApp.bankAccount.bankName} ·{' '}
              <span className="font-mono">{activeApp.bankAccount.accountNumberMasked}</span>
            </div>
            {activeApp.disbursement.status === 'Disbursed' && (
              <div className="pt-2 border-t border-slate-200 text-emerald-800 font-mono">
                Disbursed {formatINR(activeApp.disbursement.disbursedAmount)} · UTR{' '}
                {activeApp.disbursement.utrReference}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Payment Receipt Modal */}
      {viewingReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-xs p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden"
          >
            <div className="px-5 py-4 bg-[#0B111E] text-white flex items-center justify-between">
              <div>
                <div className="text-xs text-[#E6BF6F] font-mono">
                  {viewingReceipt.receiptNumber}
                </div>
                <h4 className="text-sm font-semibold">Official EMI Payment Receipt</h4>
              </div>
              <button
                type="button"
                onClick={() => setViewingReceipt(null)}
                className="p-1 text-slate-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div className="flex items-center gap-2 text-emerald-700 font-semibold">
                <FileCheck2 className="w-4 h-4" />
                <span>Payment Confirmed · Installment #{viewingReceipt.installmentNumber}</span>
              </div>
              <dl className="space-y-2 border-y border-slate-200 py-3">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Borrower</dt>
                  <dd className="font-medium text-slate-900">{activeApp.customer.fullName}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Loan Account</dt>
                  <dd className="font-mono text-slate-900">{activeApp.applicationNumber}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Paid Date</dt>
                  <dd className="font-mono text-slate-900">
                    {new Date(viewingReceipt.paidAt).toLocaleString('en-IN')}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Mode &amp; Reference</dt>
                  <dd className="font-mono text-slate-900">
                    {viewingReceipt.paymentMode} · {viewingReceipt.transactionRef}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Principal Paid</dt>
                  <dd className="font-mono tabular-nums text-slate-900">
                    {formatINR(viewingReceipt.principalPaid)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Interest Paid</dt>
                  <dd className="font-mono tabular-nums text-slate-900">
                    {formatINR(viewingReceipt.interestPaid)}
                  </dd>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-200 font-semibold text-slate-900 text-sm">
                  <dt>Total Received</dt>
                  <dd className="font-mono tabular-nums">
                    {formatINR(viewingReceipt.totalPaid)}
                  </dd>
                </div>
              </dl>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setViewingReceipt(null)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => downloadRepaymentReceiptPdf(activeApp, viewingReceipt, policy)}
                  className="btn-bullion inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Receipt PDF</span>
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Floating Customer Right-Now Action Dock */}
      {((activeApp.status === 'Disbursed' && nextDueRow) ||
        (activeApp.loanOffer &&
          !activeApp.sanctionSigning?.customerSigned &&
          ['Loan Offer Ready', 'Sanction Pending'].includes(activeApp.status)) ||
        bothSigned) && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="floating-dock fixed bottom-5 right-6 z-30 rounded-xl px-4 py-3 flex items-center gap-4 text-white max-w-[92vw] no-print"
        >
          {activeApp.status === 'Disbursed' && nextDueRow ? (
            <>
              <div className="text-xs">
                <div className="text-[11px] text-[#E6BF6F] font-medium">
                  Right Now · Next EMI #{nextDueRow.installmentNumber} ({nextDueRow.dueLabel})
                </div>
                <div className="font-mono font-semibold text-white">
                  Due {formatINR(nextDueRow.totalPayment)} · {emisLeftCount} EMI(s) left
                </div>
              </div>
              <button
                type="button"
                disabled={paying}
                onClick={() => handlePayNextInstallment(nextDueRow.installmentNumber)}
                className="btn-bullion inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg whitespace-nowrap cursor-pointer disabled:opacity-50"
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>{paying ? 'Paying...' : `Pay ${formatINR(nextDueRow.totalPayment)}`}</span>
              </button>
            </>
          ) : activeApp.loanOffer &&
            !activeApp.sanctionSigning?.customerSigned &&
            ['Loan Offer Ready', 'Sanction Pending'].includes(activeApp.status) ? (
            <>
              <div className="text-xs">
                <div className="text-[11px] text-[#E6BF6F] font-medium">
                  Right Now · Signature Pending
                </div>
                <div className="font-medium text-white">
                  Sign Sanction Letter for {formatINR(activeApp.loanOffer.sanctionedAmount)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSigningOpen(true)}
                className="btn-bullion inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg whitespace-nowrap cursor-pointer"
              >
                <PenTool className="w-3.5 h-3.5" />
                <span>Sign Sanction Letter</span>
              </button>
            </>
          ) : (
            <>
              <div className="text-xs">
                <div className="text-[11px] text-[#E6BF6F] font-medium">
                  Sanction Verified
                </div>
                <div className="font-medium text-white">
                  Dual-signed Sanction Letter ready
                </div>
              </div>
              <button
                type="button"
                disabled={exportingSanction}
                onClick={handleDownloadSanction}
                className="btn-bullion inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg whitespace-nowrap cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{exportingSanction ? 'Generating...' : 'Download Sanction PDF'}</span>
              </button>
            </>
          )}
        </motion.div>
      )}

      {signingOpen && (
        <SignatureModal
          title="Customer Sanction Acceptance"
          signerLabel={activeApp.customer.fullName}
          defaultTypedName={activeApp.customer.fullName}
          onClose={() => setSigningOpen(false)}
          onConfirm={handleCustomerSign}
        />
      )}
    </div>
  );
}
