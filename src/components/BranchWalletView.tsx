import { ArrowUpRight, Lock, Scale, TrendingUp, Vault, Wallet } from 'lucide-react';
import { motion } from 'motion/react';
import type {
  BranchWalletSummary,
  GoldLoanApplication,
  PurityGrade,
} from '../types/portal.ts';
import { formatGrams, formatINR } from '../utils/loanMath.ts';
import { StatusText } from './StatusText.tsx';

interface BranchWalletViewProps {
  wallet: BranchWalletSummary;
  applications: GoldLoanApplication[];
  onSelectApplication: (applicationId: string) => void;
}

export function BranchWalletView({
  wallet,
  applications,
  onSelectApplication,
}: BranchWalletViewProps) {
  const vaultedApplications = applications.filter((a) => Boolean(a.collateralStorage));
  const todayPrefix = new Date().toISOString().slice(0, 10);

  const todayLedger = applications.flatMap((app) => {
    const entries: Array<{
      id: string;
      time: string;
      applicationId: string;
      applicationNumber: string;
      customerName: string;
      type: string;
      detail: string;
      profitImpact: number;
      cashFlow: number;
    }> = [];

    if (app.disbursement.status === 'Disbursed' && app.disbursement.disbursedAt?.slice(0, 10) === todayPrefix && app.loanOffer) {
      const feeProfit = app.loanOffer.processingFeeAmount + app.loanOffer.valuationFeeAmount;
      entries.push({
        id: `disb-${app.id}`,
        time: app.disbursement.disbursedAt,
        applicationId: app.id,
        applicationNumber: app.applicationNumber,
        customerName: app.customer.fullName,
        type: 'Loan Disbursement',
        detail: `UTR ${app.disbursement.utrReference} · Fees Earned`,
        profitImpact: feeProfit,
        cashFlow: -(app.disbursement.disbursedAmount ?? app.loanOffer.sanctionedAmount),
      });
    }

    for (const rcpt of app.repayments || []) {
      if (rcpt.paidAt.slice(0, 10) === todayPrefix) {
        entries.push({
          id: rcpt.id,
          time: rcpt.paidAt,
          applicationId: app.id,
          applicationNumber: app.applicationNumber,
          customerName: app.customer.fullName,
          type: `EMI #${rcpt.installmentNumber} Collection`,
          detail: `${rcpt.receiptNumber} · ${rcpt.paymentMode}`,
          profitImpact: rcpt.interestPaid,
          cashFlow: rcpt.totalPaid,
        });
      }
    }
    return entries;
  }).sort((a, b) => b.time.localeCompare(a.time));

  const purityGrades: PurityGrade[] = ['24K', '22K', '20K', '18K'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Branch Vault &amp; Financial Wallet
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {wallet.branchName} ({wallet.branchCode}) · Real-time vault gold custody, branch liquidity, and daily profit ledger.
          </p>
        </div>
        <div className="text-xs font-mono text-slate-500">
          Opening Capital: <strong className="text-slate-900">{formatINR(wallet.openingCapital)}</strong>
        </div>
      </div>

      {/* 4 Key Branch Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          className="vault-card vault-card-interactive rounded-xl p-5"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Branch Wallet Balance</span>
            <Wallet className="w-4 h-4 text-[#9A6B16]" />
          </div>
          <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900">
            {formatINR(wallet.walletBalance)}
          </div>
          <div className="mt-1.5 text-xs text-slate-500 font-mono tabular-nums">
            Disbursed {formatINR(wallet.totalDisbursedPrincipal)} · Repaid{' '}
            {formatINR(wallet.totalRepaidPrincipal)}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, delay: 0.04 }}
          className="vault-card vault-card-interactive rounded-xl p-5 bg-gradient-to-br from-emerald-50/80 to-white border-emerald-200/80"
        >
          <div className="flex items-center justify-between text-xs font-medium text-emerald-900">
            <span>Profit Made Today</span>
            <TrendingUp className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-emerald-950">
            {formatINR(wallet.todayProfit)}
          </div>
          <div className="mt-1.5 text-xs text-emerald-800 font-mono tabular-nums">
            Fees {formatINR(wallet.todayFeesProfit)} + Interest{' '}
            {formatINR(wallet.todayInterestProfit)}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, delay: 0.08 }}
          className="vault-card vault-card-interactive rounded-xl p-5 bg-gradient-to-br from-amber-50/70 to-white border-amber-200/80"
        >
          <div className="flex items-center justify-between text-xs font-medium text-amber-900">
            <span>Gold Stored in Vault</span>
            <Scale className="w-4 h-4 text-[#9A6B16]" />
          </div>
          <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-amber-950">
            {formatGrams(wallet.storedGoldNetGrams)}
          </div>
          <div className="mt-1.5 text-xs text-amber-800 font-mono tabular-nums">
            Gross {formatGrams(wallet.storedGoldGrossGrams)} · Valued{' '}
            {formatINR(wallet.storedGoldMarketValue)}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, delay: 0.12 }}
          className="vault-card vault-card-interactive rounded-xl p-5"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Vaulted Packets &amp; Total Profit</span>
            <Vault className="w-4 h-4 text-[#9A6B16]" />
          </div>
          <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900">
            {wallet.activeVaultPackets} Sealed
          </div>
          <div className="mt-1.5 text-xs text-slate-600 font-mono tabular-nums">
            Cumulative Profit: {formatINR(wallet.totalFeesEarned + wallet.totalInterestEarned)}
          </div>
        </motion.div>
      </div>

      {/* Purity Inventory & Today's Profit Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 vault-card rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h3 className="text-sm font-semibold text-slate-900">
              Vault Gold Breakdown by Purity
            </h3>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              Net {formatGrams(wallet.storedGoldNetGrams)}
            </span>
          </div>

          <div className="space-y-3">
            {purityGrades.map((grade) => {
              const grams = wallet.purityBreakdown[grade] || 0;
              const share =
                wallet.storedGoldNetGrams > 0
                  ? Math.round((grams / wallet.storedGoldNetGrams) * 100)
                  : 0;
              return (
                <div key={grade} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-800">{grade} Fine Bullion</span>
                    <span className="font-mono tabular-nums text-slate-700">
                      {formatGrams(grams)} ({share}%)
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                      className="h-full bg-gradient-to-r from-[#C5963A] to-[#9A6B16] rounded-full origin-left"
                      style={{ width: `${share}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-3 border-t border-slate-200 grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className="text-slate-500">Total Fees Earned</div>
              <div className="mt-0.5 font-mono font-semibold text-slate-900">
                {formatINR(wallet.totalFeesEarned)}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Total Interest Earned</div>
              <div className="mt-0.5 font-mono font-semibold text-slate-900">
                {formatINR(wallet.totalInterestEarned)}
              </div>
            </div>
          </div>
        </div>

        {/* Today's Profit & Cashflow Activity */}
        <div className="lg:col-span-7 vault-card rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Today&apos;s Profit &amp; Cashflow Activity
              </h3>
              <p className="text-xs text-slate-500">
                Collections {formatINR(wallet.todayRepaymentsCollected)} · Disbursed{' '}
                {formatINR(wallet.todayDisbursedAmount)}
              </p>
            </div>
            <div className="text-xs font-mono font-semibold text-emerald-700">
              Net Profit Today: {formatINR(wallet.todayProfit)}
            </div>
          </div>

          {todayLedger.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No loan disbursements or EMI collections recorded yet today.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                    <th className="py-2.5 px-4">Activity</th>
                    <th className="py-2.5 px-4">Customer / File</th>
                    <th className="py-2.5 px-4 text-right">Cashflow</th>
                    <th className="py-2.5 px-4 text-right">Profit Earned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {todayLedger.map((entry) => (
                    <tr
                      key={entry.id}
                      onClick={() => onSelectApplication(entry.applicationId)}
                      className="hover:bg-amber-50/35 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{entry.type}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{entry.detail}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{entry.customerName}</div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {entry.applicationNumber}
                        </div>
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono tabular-nums ${
                          entry.cashFlow >= 0 ? 'text-slate-900' : 'text-amber-800'
                        }`}
                      >
                        {entry.cashFlow >= 0 ? '+' : '-'}
                        {formatINR(Math.abs(entry.cashFlow))}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700">
                        +{formatINR(entry.profitImpact)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Vault Custody Register */}
      <div className="vault-card rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#9A6B16]" />
            <h3 className="text-sm font-semibold text-slate-900">
              Active Gold Vault Custody Register
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            Click any vaulted seal to open its full collateral audit trail
          </span>
        </div>

        {vaultedApplications.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No gold packets sealed in vault storage yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-4">Seal &amp; Box #</th>
                  <th className="py-2.5 px-4">Vault Location</th>
                  <th className="py-2.5 px-4">Borrower &amp; Loan #</th>
                  <th className="py-2.5 px-4 text-right">Net Gold</th>
                  <th className="py-2.5 px-4 text-right">Appraised Value</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">File</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {vaultedApplications.map((app) => {
                  const netGrams = app.goldItems.reduce(
                    (sum, g) => sum + (g.netWeightGrams ?? 0),
                    0
                  );
                  const appraisedVal = app.goldItems.reduce(
                    (sum, g) => sum + (g.appraisedValue ?? 0),
                    0
                  );
                  return (
                    <tr
                      key={app.id}
                      onClick={() => onSelectApplication(app.id)}
                      className="hover:bg-amber-50/35 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4 font-mono">
                        <div className="font-semibold text-slate-900">
                          {app.collateralStorage?.packageSealNumber}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {app.collateralStorage?.storageBoxNumber}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {app.collateralStorage?.vaultLocation}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{app.customer.fullName}</div>
                        <div className="font-mono text-[11px] text-slate-500">
                          {app.applicationNumber}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-slate-900">
                        {formatGrams(netGrams)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                        {formatINR(appraisedVal)}
                      </td>
                      <td className="py-3 px-4">
                        <StatusText status={app.status} />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="inline-flex items-center gap-1 text-amber-800 font-medium">
                          <span>Inspect</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
