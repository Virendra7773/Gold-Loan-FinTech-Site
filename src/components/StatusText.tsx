import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Lock,
  Scale,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import type { ApplicationStatus, KycDecision } from '../types/portal.ts';

export const LIFECYCLE_STAGES: ApplicationStatus[] = [
  'Draft',
  'KYC Pending',
  'KYC Approved',
  'Appraisal Pending',
  'Loan Offer Ready',
  'Sanction Pending',
  'Sanctioned',
  'Collateral Stored',
  'Disbursement Pending',
  'Disbursed',
];

export type StepTabTarget = 'overview' | 'appraisal' | 'offer' | 'sanction' | 'collateral';

export function stageToTab(stage: ApplicationStatus): StepTabTarget {
  switch (stage) {
    case 'Draft':
    case 'KYC Pending':
    case 'KYC Approved':
      return 'overview';
    case 'Appraisal Pending':
      return 'appraisal';
    case 'Loan Offer Ready':
      return 'offer';
    case 'Sanction Pending':
    case 'Sanctioned':
      return 'sanction';
    case 'Collateral Stored':
    case 'Disbursement Pending':
    case 'Disbursed':
      return 'collateral';
    default:
      return 'overview';
  }
}

export function StatusText({ status }: { status: ApplicationStatus }) {
  const tone = (() => {
    switch (status) {
      case 'Disbursed':
      case 'KYC Approved':
      case 'Sanctioned':
      case 'Collateral Stored':
        return {
          color: 'text-emerald-700',
          icon: status === 'Collateral Stored' ? Lock : CheckCircle2,
        };
      case 'KYC Rejected':
        return { color: 'text-red-700', icon: XCircle };
      case 'KYC Info Required':
        return { color: 'text-amber-700', icon: AlertTriangle };
      case 'Appraisal Pending':
        return { color: 'text-amber-700', icon: Scale };
      case 'Loan Offer Ready':
      case 'Sanction Pending':
        return { color: 'text-slate-800', icon: FileText };
      case 'Draft':
        return { color: 'text-slate-500', icon: Clock };
      default:
        return { color: 'text-amber-700', icon: Clock };
    }
  })();

  const Icon = tone.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${tone.color}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{status}</span>
    </span>
  );
}

export function KycDecisionText({ decision }: { decision: KycDecision }) {
  switch (decision) {
    case 'Approved':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
          <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Approved</span>
        </span>
      );
    case 'Rejected':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700">
          <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Rejected</span>
        </span>
      );
    case 'Requires more information':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700">
          <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Requires more information</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600">
          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Pending</span>
        </span>
      );
  }
}

export function LifecycleStepper({
  status,
  onSelectStage,
}: {
  status: ApplicationStatus;
  onSelectStage?: (tab: StepTabTarget) => void;
}) {
  const effectiveIndex = (() => {
    if (status === 'KYC Rejected' || status === 'KYC Info Required') return 1;
    const idx = LIFECYCLE_STAGES.indexOf(status);
    return idx === -1 ? 0 : idx;
  })();

  return (
    <div className="w-full overflow-x-auto pb-1">
      <div className="flex items-center min-w-[780px] gap-1.5">
        {LIFECYCLE_STAGES.map((stage, idx) => {
          const isCompleted = idx < effectiveIndex || status === 'Disbursed';
          const isCurrent = idx === effectiveIndex && status !== 'Disbursed';
          const isBlocked =
            idx === 1 && (status === 'KYC Rejected' || status === 'KYC Info Required');

          return (
            <button
              key={stage}
              type="button"
              onClick={() => onSelectStage?.(stageToTab(stage))}
              className="flex-1 flex flex-col gap-1.5 text-left group cursor-pointer focus:outline-none"
              title={`Open ${stage} step`}
            >
              <div
                className={`h-2 w-full rounded-sm transition-all group-hover:opacity-80 ${
                  isBlocked
                    ? 'bg-red-600'
                    : isCompleted
                      ? 'bg-emerald-600'
                      : isCurrent
                        ? 'bg-amber-600'
                        : 'bg-slate-200 group-hover:bg-slate-300'
                }`}
              />
              <span
                className={`text-[11px] leading-tight truncate transition-colors ${
                  isBlocked
                    ? 'text-red-700 font-semibold'
                    : isCurrent
                      ? 'text-slate-900 font-semibold'
                      : isCompleted
                        ? 'text-emerald-800 font-medium'
                        : 'text-slate-400 group-hover:text-slate-700'
                }`}
              >
                {stage}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
