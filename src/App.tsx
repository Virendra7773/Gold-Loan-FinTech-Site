import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  ArrowUpRight,
  ClipboardCheck,
  FileText,
  Landmark,
  Plus,
  Scale,
  Search,
  ShieldCheck,
  UserCheck,
  Vault,
} from 'lucide-react';
import type {
  ApplicationStatus,
  AuditLogEntry,
  BranchWalletSummary,
  GoldLoanApplication,
  LendingPolicy,
  StaffRole,
  StaffUser,
} from './types/portal.ts';
import { DEFAULT_LENDING_POLICY, formatGrams, formatINR } from './utils/loanMath.ts';
import { portalApi } from './services/api.ts';
import { ApplicationIntakeModal } from './components/ApplicationIntakeModal.tsx';
import { ApplicationWorkspace } from './components/ApplicationWorkspace.tsx';
import { BranchWalletView } from './components/BranchWalletView.tsx';
import { ComplianceAuditView } from './components/ComplianceAuditView.tsx';
import { CustomerPortalView } from './components/CustomerPortalView.tsx';
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
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);

  const [intakeOpen, setIntakeOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<GoldLoanApplication | null>(null);

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

  const selectedApplication = useMemo(() => {
    return applications.find((a) => a.id === selectedAppId) ?? null;
  }, [applications, selectedAppId]);

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

  function handleApplicationUpdated(
    updatedApp: GoldLoanApplication,
    auditEntry: AuditLogEntry,
    nextWallet?: BranchWalletSummary
  ) {
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
  }

  function handleRoleSwitch(nextStaffId: string) {
    const target = staffDirectory.find((s) => s.id === nextStaffId);
    setStaffId(nextStaffId);
    if (target?.role === 'CUSTOMER') {
      setSelectedAppId(null);
      setSection('queue');
    } else if (target && !['BRANCH_ADMIN', 'AUDITOR'].includes(target.role) && section === 'wallet') {
      setSection('queue');
    }
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
                    setSelectedAppId(null);
                  }}
                  className={`relative w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    section === 'queue' && !selectedAppId
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
                      setSelectedAppId(null);
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
                    setSelectedAppId(null);
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
                      setSelectedAppId(null);
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
                      setSelectedAppId(null);
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
                  onClick={() => handleRoleSwitch(s.id)}
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
            ) : selectedApplication ? (
              <button
                type="button"
                onClick={() => setSelectedAppId(null)}
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
                    setSelectedAppId(null);
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
                    setSelectedAppId(null);
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
                      setSelectedAppId(null);
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
                    setSelectedAppId(null);
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
                onClick={() => handleRoleSwitch('staff-01')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Staff Workspace</span>
              </button>
            ) : canCreateApplication ? (
              <button
                type="button"
                onClick={() => {
                  setEditingApp(null);
                  setIntakeOpen(true);
                }}
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
                  setSelectedAppId(null);
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
        <main className="flex-1 p-6 pb-24 max-w-[1360px] w-full mx-auto">
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
          ) : selectedApplication && currentUser ? (
            <ApplicationWorkspace
              application={selectedApplication}
              currentUser={currentUser}
              staffDirectory={staffDirectory}
              policy={policy}
              auditLogs={auditLogs}
              onApplicationUpdated={handleApplicationUpdated}
              onEditIntake={(app) => {
                setEditingApp(app);
                setIntakeOpen(true);
              }}
              onSwitchStaffRole={handleRoleSwitch}
            />
          ) : section === 'wallet' && branchWallet ? (
            <BranchWalletView
              wallet={branchWallet}
              applications={applications}
              onSelectApplication={(appId) => {
                setSection('queue');
                setSelectedAppId(appId);
              }}
            />
          ) : section === 'compliance' && currentUser ? (
            <ComplianceAuditView
              applications={applications}
              auditLogs={auditLogs}
              currentRole={currentUser.role}
              onSelectApplication={(appId) => {
                setSection('queue');
                setSelectedAppId(appId);
              }}
            />
          ) : (
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
                        onClick={() => {
                          setEditingApp(null);
                          setIntakeOpen(true);
                        }}
                        className="btn-bullion inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg"
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

                          return (
                            <tr
                              key={app.id}
                              onClick={() => setSelectedAppId(app.id)}
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
                                    setSelectedAppId(app.id);
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#8C5E12] bg-amber-50/80 hover:bg-amber-100/80 border border-amber-200/80 rounded-md transition-colors cursor-pointer"
                                >
                                  <span>{rowActionLabel}</span>
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
        </main>
      </div>

      {/* Floating Priority Case Quick-Jump Dock on Pipeline View */}
      {!isCustomerMode && !selectedApplication && section === 'queue' && urgentPipelineCase && (
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
            onClick={() => setSelectedAppId(urgentPipelineCase.id)}
            className="btn-bullion inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg whitespace-nowrap cursor-pointer"
          >
            <span>Open Case</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </motion.div>
      )}

      {intakeOpen && currentUser && (
        <ApplicationIntakeModal
          staffId={currentUser.id}
          existingApp={editingApp}
          onClose={() => {
            setIntakeOpen(false);
            setEditingApp(null);
          }}
          onSuccess={(app, auditEntry) => {
            handleApplicationUpdated(app, auditEntry as AuditLogEntry);
            setIntakeOpen(false);
            setEditingApp(null);
            setSelectedAppId(app.id);
            setSection('queue');
          }}
        />
      )}
    </div>
  );
}
