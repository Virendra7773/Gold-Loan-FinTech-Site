import { useMemo, useState } from 'react';
import { Download, Lock, Search, ShieldCheck } from 'lucide-react';
import type { AuditLogEntry, GoldLoanApplication, StaffRole } from '../types/portal.ts';

interface ComplianceAuditViewProps {
  applications: GoldLoanApplication[];
  auditLogs: AuditLogEntry[];
  currentRole: StaffRole;
  onSelectApplication: (id: string) => void;
}

export function ComplianceAuditView({
  applications,
  auditLogs,
  currentRole,
  onSelectApplication,
}: ComplianceAuditViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | StaffRole>('ALL');

  const filteredLogs = useMemo(() => {
    return auditLogs.filter((entry) => {
      if (roleFilter !== 'ALL' && entry.actorRole !== roleFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        entry.applicationNumber.toLowerCase().includes(q) ||
        entry.actorName.toLowerCase().includes(q) ||
        entry.action.toLowerCase().includes(q) ||
        entry.details.toLowerCase().includes(q)
      );
    });
  }, [auditLogs, searchQuery, roleFilter]);

  function exportAuditCsv() {
    const headers = [
      'Timestamp',
      'Audit ID',
      'Application #',
      'Actor',
      'Role',
      'Action',
      'Previous Status',
      'New Status',
      'Details',
      'Integrity Hash',
    ];
    const rows = filteredLogs.map((l) => [
      l.timestamp,
      l.id,
      l.applicationNumber,
      l.actorName,
      l.actorRole,
      l.action,
      l.previousStatus ?? '',
      l.newStatus ?? '',
      `"${l.details.replace(/"/g, '""')}"`,
      l.integrityHash,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `aurelia-vault-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Safeguards Verification Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 vault-card vault-card-interactive rounded-xl">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <Lock className="w-3.5 h-3.5 text-emerald-700" />
            <span>Field Encryption</span>
          </div>
          <p className="mt-2 text-sm font-semibold text-slate-900">AES-256-GCM Active</p>
          <p className="mt-1 text-xs text-slate-500">
            PAN &amp; Bank Accounts encrypted at rest on server
          </p>
        </div>

        <div className="p-4 vault-card vault-card-interactive rounded-xl">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
            <span>Aadhaar Minimization</span>
          </div>
          <p className="mt-2 text-sm font-semibold text-slate-900">Strict Masking Enforced</p>
          <p className="mt-1 text-xs text-slate-500">
            Zero full 12-digit numbers stored or exposed in UI
          </p>
        </div>

        <div className="p-4 vault-card vault-card-interactive rounded-xl">
          <div className="text-xs font-medium text-slate-500">RBAC Role View</div>
          <p className="mt-2 text-sm font-semibold text-slate-900 font-mono">{currentRole}</p>
          <p className="mt-1 text-xs text-slate-500">
            {currentRole === 'AUDITOR'
              ? 'Read-only access; PAN masked for audit privacy'
              : 'Server-validated operational permissions'}
          </p>
        </div>

        <div className="p-4 vault-card vault-card-interactive rounded-xl">
          <div className="text-xs font-medium text-slate-500">Immutable Audit Events</div>
          <p className="mt-2 text-2xl font-semibold text-slate-900 font-mono tabular-nums">
            {auditLogs.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Across {applications.length} loan file(s)
          </p>
        </div>
      </div>

      {/* Compliance Notice */}
      <div className="p-4 vault-card rounded-xl text-xs text-slate-600 space-y-1">
        <p className="font-semibold text-slate-900">
          Pre-Launch Legal &amp; Compliance Review Reminder
        </p>
        <p>
          OCR outputs are flagged as entry aids only and do not constitute proof of document authenticity. Legal and compliance teams must confirm local KYC retention rules, RBI gold loan LTV circulars, collateral custody SOPs, and digital signature admissibility before production launch.
        </p>
      </div>

      {/* Audit Log Controls & Table */}
      <div className="vault-card rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[260px]">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search application #, actor, or event..."
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:border-slate-500"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
              {(['ALL', 'BRANCH_STAFF', 'APPRAISER', 'BRANCH_ADMIN', 'AUDITOR', 'CUSTOMER'] as const).map(
                (r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRoleFilter(r)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                      roleFilter === r
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {r === 'ALL' ? 'All Roles' : r.replace('_', ' ')}
                  </button>
                )
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={exportAuditCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-md whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Audit CSV</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                <th className="py-2.5 px-4">Timestamp</th>
                <th className="py-2.5 px-4">Application #</th>
                <th className="py-2.5 px-4">Actor &amp; Role</th>
                <th className="py-2.5 px-4">Action</th>
                <th className="py-2.5 px-4">Details</th>
                <th className="py-2.5 px-4 text-right">Integrity Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No audit records match the current filter.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((entry) => (
                  <tr key={entry.id} className="hover:bg-amber-50/35 transition-colors">
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                      {new Date(entry.timestamp).toLocaleString('en-IN', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      {applications.some((a) => a.id === entry.applicationId) ? (
                        <button
                          type="button"
                          onClick={() => onSelectApplication(entry.applicationId)}
                          className="font-mono text-amber-800 hover:underline font-medium"
                        >
                          {entry.applicationNumber}
                        </button>
                      ) : (
                        <span className="font-mono text-slate-500">{entry.applicationNumber}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <span className="font-medium text-slate-900">{entry.actorName}</span>
                      <span className="mx-1.5 text-slate-300">·</span>
                      <span className="text-slate-500">{entry.actorRole}</span>
                    </td>
                    <td className="py-2.5 px-4 font-medium text-slate-900 whitespace-nowrap">
                      {entry.action}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 max-w-md">{entry.details}</td>
                    <td className="py-2.5 px-4 text-right font-mono text-[11px] text-slate-400">
                      {entry.integrityHash}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
