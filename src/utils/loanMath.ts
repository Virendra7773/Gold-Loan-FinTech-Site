import type {
  LendingPolicy,
  LoanOfferTerms,
  PurityGrade,
  RepaymentInstallment,
  RepaymentScheme,
} from '../types/portal.ts';

export const DEFAULT_LENDING_POLICY: LendingPolicy = {
  organizationName: 'Aurelia Bullion Finance Ltd.',
  maxLtvPercent: 75,
  goldRatesPerGram: {
    '24K': 7480,
    '22K': 6855,
    '20K': 6230,
    '18K': 5610,
  },
  interestRatesByScheme: {
    'Monthly EMI': 10.75,
    'Quarterly Interest': 11.25,
    'Bullet Maturity': 11.75,
  },
  processingFeePercent: 0.5,
  valuationFeeFlat: 350,
  gstPercent: 18,
  allowedTenuresMonths: [3, 6, 12, 18, 24],
};

export function formatINR(amount: number | undefined | null): string {
  const safe = Number.isFinite(amount) ? Number(amount) : 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Math.round(safe));
}

export function formatGrams(grams: number | undefined | null): string {
  const safe = Number.isFinite(grams) ? Number(grams) : 0;
  return `${safe.toFixed(2)} g`;
}

export function computeItemAppraisedValue(
  grossWeightGrams: number,
  stoneDeductionGrams: number,
  purity: PurityGrade,
  policy: LendingPolicy = DEFAULT_LENDING_POLICY
): { netWeightGrams: number; ratePerGram: number; appraisedValue: number } {
  const gross = Math.max(0, grossWeightGrams || 0);
  const deduction = Math.max(0, Math.min(gross, stoneDeductionGrams || 0));
  const netWeightGrams = Math.round((gross - deduction) * 100) / 100;
  const ratePerGram = policy.goldRatesPerGram[purity] ?? policy.goldRatesPerGram['22K'];
  const appraisedValue = Math.round(netWeightGrams * ratePerGram);
  return { netWeightGrams, ratePerGram, appraisedValue };
}

export function calculateLoanOffer(params: {
  totalAppraisedValue: number;
  requestedAmount: number;
  sanctionedAmount: number;
  tenureMonths: number;
  repaymentScheme: RepaymentScheme;
  policy?: LendingPolicy;
}): { terms: LoanOfferTerms; schedule: RepaymentInstallment[] } {
  const policy = params.policy ?? DEFAULT_LENDING_POLICY;
  const maxEligibleAmount = Math.floor(
    (Math.max(0, params.totalAppraisedValue) * policy.maxLtvPercent) / 100
  );
  const requestedAmount = Math.max(0, Math.round(params.requestedAmount));
  const sanctionedAmount = Math.max(
    0,
    Math.min(maxEligibleAmount, Math.round(params.sanctionedAmount))
  );
  const tenureMonths = Math.max(1, params.tenureMonths);
  const annualInterestRate = policy.interestRatesByScheme[params.repaymentScheme];
  const monthlyRate = annualInterestRate / 12 / 100;

  const processingFeeAmount = Math.round((sanctionedAmount * policy.processingFeePercent) / 100);
  const valuationFeeAmount = sanctionedAmount > 0 ? policy.valuationFeeFlat : 0;
  const gstOnFeesAmount = Math.round(
    ((processingFeeAmount + valuationFeeAmount) * policy.gstPercent) / 100
  );
  const netDisbursementAmount = Math.max(
    0,
    sanctionedAmount - processingFeeAmount - valuationFeeAmount - gstOnFeesAmount
  );

  const schedule: RepaymentInstallment[] = [];
  let totalInterestPayable = 0;
  let monthlyInstallment = 0;

  if (sanctionedAmount > 0) {
    if (params.repaymentScheme === 'Monthly EMI') {
      const factor = Math.pow(1 + monthlyRate, tenureMonths);
      const emi = (sanctionedAmount * monthlyRate * factor) / (factor - 1);
      monthlyInstallment = Math.round(emi);
      let balance = sanctionedAmount;
      for (let m = 1; m <= tenureMonths; m++) {
        const interest = Math.round(balance * monthlyRate);
        let principal = Math.round(emi - interest);
        if (m === tenureMonths || principal > balance) {
          principal = balance;
        }
        const total = principal + interest;
        const closing = Math.max(0, balance - principal);
        totalInterestPayable += interest;
        schedule.push({
          installmentNumber: m,
          dueLabel: `Month ${m}`,
          openingPrincipal: balance,
          principalComponent: principal,
          interestComponent: interest,
          totalPayment: total,
          closingPrincipal: closing,
        });
        balance = closing;
      }
    } else if (params.repaymentScheme === 'Quarterly Interest') {
      const quarterlyInterest = Math.round(sanctionedAmount * (annualInterestRate / 100) * 0.25);
      monthlyInstallment = Math.round(quarterlyInterest / 3);
      const quarters = Math.max(1, Math.ceil(tenureMonths / 3));
      for (let q = 1; q <= quarters; q++) {
        const isFinal = q === quarters;
        const principal = isFinal ? sanctionedAmount : 0;
        const interest = quarterlyInterest;
        totalInterestPayable += interest;
        schedule.push({
          installmentNumber: q,
          dueLabel: `Quarter ${q} (M${Math.min(q * 3, tenureMonths)})`,
          openingPrincipal: sanctionedAmount,
          principalComponent: principal,
          interestComponent: interest,
          totalPayment: principal + interest,
          closingPrincipal: isFinal ? 0 : sanctionedAmount,
        });
      }
    } else {
      // Bullet Maturity: monthly interest servicing + full principal on final month
      const monthlyInt = Math.round(sanctionedAmount * monthlyRate);
      monthlyInstallment = monthlyInt;
      for (let m = 1; m <= tenureMonths; m++) {
        const isFinal = m === tenureMonths;
        const principal = isFinal ? sanctionedAmount : 0;
        const interest = monthlyInt;
        totalInterestPayable += interest;
        schedule.push({
          installmentNumber: m,
          dueLabel: isFinal ? `Month ${m} (Maturity)` : `Month ${m}`,
          openingPrincipal: sanctionedAmount,
          principalComponent: principal,
          interestComponent: interest,
          totalPayment: principal + interest,
          closingPrincipal: isFinal ? 0 : sanctionedAmount,
        });
      }
    }
  }

  const totalRepayableAmount = sanctionedAmount + totalInterestPayable;

  return {
    terms: {
      policyLtvPercent: policy.maxLtvPercent,
      maxEligibleAmount,
      requestedAmount,
      sanctionedAmount,
      tenureMonths,
      annualInterestRate,
      repaymentScheme: params.repaymentScheme,
      processingFeeAmount,
      valuationFeeAmount,
      gstOnFeesAmount,
      netDisbursementAmount,
      monthlyInstallment,
      totalInterestPayable,
      totalRepayableAmount,
      calculatedAt: new Date().toISOString(),
    },
    schedule,
  };
}

export function maskAadhaarInput(raw: string): { masked: string; last4: string } {
  const digits = raw.replace(/\D/g, '');
  const last4 = digits.slice(-4).padStart(4, 'X');
  if (digits.length === 0) {
    return { masked: '', last4: '' };
  }
  return {
    masked: `XXXX-XXXX-${last4}`,
    last4,
  };
}

export function maskAccountNumber(raw: string): { masked: string; last4: string } {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return { masked: '', last4: '' };
  const last4 = digits.slice(-4);
  return {
    masked: `XXXX-XXXX-${last4}`,
    last4,
  };
}

export function maskPanForAuditor(pan: string): string {
  const clean = pan.trim().toUpperCase();
  if (clean.length !== 10) return clean;
  return `${clean.slice(0, 2)}XXXXX${clean.slice(7)}`;
}
