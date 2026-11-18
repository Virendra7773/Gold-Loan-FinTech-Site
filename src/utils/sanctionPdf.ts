import { jsPDF } from 'jspdf';
import type {
  GoldLoanApplication,
  LendingPolicy,
  RepaymentReceipt,
} from '../types/portal.ts';
import { formatGrams, formatINR } from './loanMath.ts';

async function toPngDataUrl(src: string): Promise<string | null> {
  if (!src) return null;
  if (src.startsWith('data:image/png') || src.startsWith('data:image/jpeg')) {
    return src;
  }
  const resolvedSrc =
    src.startsWith('/') && typeof window !== 'undefined'
      ? `${window.location.origin}${src}`
      : src;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 320;
        canvas.height = img.naturalHeight || 240;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = resolvedSrc;
  });
}

function pdfCurrency(amount: number | undefined | null): string {
  const safe = Number.isFinite(amount) ? Math.round(Number(amount)) : 0;
  return `INR ${new Intl.NumberFormat('en-IN').format(safe)}`;
}

export async function downloadSanctionLetterPdf(
  application: GoldLoanApplication,
  policy: LendingPolicy
): Promise<string> {
  if (!application.loanOffer) {
    throw new Error('Loan offer must be configured before generating the sanction letter PDF.');
  }
  if (
    !application.sanctionSigning?.customerSigned ||
    !application.sanctionSigning?.branchRepSigned
  ) {
    throw new Error(
      'Sanction Letter PDF unlocks only after both Customer and Branch Administrator have signed.'
    );
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = 16;

  const ensureSpace = (needed: number) => {
    if (y + needed > 278) {
      doc.addPage();
      y = 16;
    }
  };

  // Top Header Band
  doc.setFillColor(15, 23, 42);
  doc.rect(margin, y, contentWidth, 20, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(policy.organizationName, margin + 5, y + 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  doc.text(
    `Gold Loan Sanction Letter & Key Fact Statement · ${application.branchName}`,
    margin + 5,
    y + 14.5
  );

  const sanctionNo =
    application.sanctionSigning?.sanctionLetterNumber ?? `SL-${application.applicationNumber}`;
  const sanctionDate = new Date(
    application.sanctionSigning?.generatedAt ?? application.updatedAt
  ).toLocaleDateString('en-IN');

  doc.setTextColor(251, 191, 36);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(sanctionNo, pageWidth - margin - 5, y + 8, { align: 'right' });
  doc.setTextColor(203, 213, 225);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Date: ${sanctionDate}`, pageWidth - margin - 5, y + 14.5, { align: 'right' });

  y += 26;

  // Borrower & Bank Columns
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('BORROWER DETAILS', margin, y);
  doc.text('DISBURSEMENT BANK ACCOUNT', margin + contentWidth / 2 + 4, y);
  y += 4.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);

  const borrowerLines = [
    `Name: ${application.customer.fullName}`,
    `Phone: ${application.customer.phone}`,
    `PAN: ${application.customer.panNumber} | Aadhaar: ${application.customer.aadhaarMasked}`,
    ...doc.splitTextToSize(`Address: ${application.customer.address || 'N/A'}`, contentWidth / 2 - 4),
  ];

  const bankLines = [
    `Holder: ${application.bankAccount.accountHolderName || application.customer.fullName}`,
    `Bank: ${application.bankAccount.bankName || 'N/A'}`,
    `IFSC: ${application.bankAccount.ifscCode || 'N/A'}`,
    `Account: ${application.bankAccount.accountNumberMasked || 'N/A'} (${application.bankAccount.verificationStatus})`,
  ];

  borrowerLines.forEach((line, i) => {
    doc.text(line, margin, y + i * 4.5);
  });
  bankLines.forEach((line, i) => {
    doc.text(line, margin + contentWidth / 2 + 4, y + i * 4.5);
  });

  y += Math.max(borrowerLines.length, bankLines.length) * 4.5 + 6;

  // Facility Summary Box
  ensureSpace(34);
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y, contentWidth, 28, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('SANCTIONED FACILITY & CHARGES SUMMARY', margin + 4, y + 6);

  const offer = application.loanOffer;
  const totalCharges =
    offer.processingFeeAmount + offer.valuationFeeAmount + offer.gstOnFeesAmount;

  const colW = contentWidth / 4;
  const summaryCols = [
    {
      label: `Max Eligible (${policy.maxLtvPercent}% LTV)`,
      val: pdfCurrency(offer.maxEligibleAmount),
    },
    {
      label: 'Requested / Sanctioned',
      val: `${pdfCurrency(offer.requestedAmount)} / ${pdfCurrency(offer.sanctionedAmount)}`,
    },
    {
      label: 'Interest & Tenure',
      val: `${offer.annualInterestRate}% p.a. · ${offer.tenureMonths}m (${offer.repaymentScheme})`,
    },
    {
      label: 'Charges & Net Payout',
      val: `${pdfCurrency(totalCharges)} · Net ${pdfCurrency(offer.netDisbursementAmount)}`,
    },
  ];

  summaryCols.forEach((col, idx) => {
    const cx = margin + 4 + idx * colW;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(col.label, cx, y + 13);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    const wrapped = doc.splitTextToSize(col.val, colW - 6);
    doc.text(wrapped, cx, y + 18.5);
  });

  y += 35;

  // Gold Collateral Schedule WITH Ornament Photographs
  ensureSpace(26);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('PLEDGED GOLD COLLATERAL SCHEDULE (WITH INTAKE PHOTOGRAPHS)', margin, y);
  y += 4;

  // Table header
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y, contentWidth, 7, 'F');
  doc.setFontSize(7.8);
  doc.setTextColor(71, 85, 105);
  doc.text('Photo', margin + 3, y + 4.8);
  doc.text('Item & Description', margin + 24, y + 4.8);
  doc.text('Gross', margin + 114, y + 4.8, { align: 'right' });
  doc.text('Net', margin + 132, y + 4.8, { align: 'right' });
  doc.text('Purity', margin + 148, y + 4.8, { align: 'right' });
  doc.text('Appraised Value', pageWidth - margin - 3, y + 4.8, { align: 'right' });
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  for (const item of application.goldItems) {
    const descLines = doc.splitTextToSize(
      `${item.itemType} (Qty ${item.quantity}) - ${item.customerDescription}`,
      72
    );
    const photoPng = item.livePhotoDataUrl
      ? await toPngDataUrl(item.livePhotoDataUrl)
      : null;
    const rowH = Math.max(18, descLines.length * 4 + 4);
    ensureSpace(rowH + 2);
    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, y, contentWidth, rowH);

    if (photoPng) {
      const imgType = photoPng.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(photoPng, imgType, margin + 2.5, y + 2, 18, 14);
    } else {
      doc.setDrawColor(203, 213, 225);
      doc.rect(margin + 2.5, y + 2, 18, 14);
      doc.setFontSize(6.5);
      doc.setTextColor(148, 163, 184);
      doc.text('No Photo', margin + 11.5, y + 10, { align: 'center' });
    }

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(8);
    doc.text(descLines, margin + 24, y + 5.5);
    doc.text(formatGrams(item.grossWeightGrams), margin + 114, y + 7, { align: 'right' });
    doc.text(formatGrams(item.netWeightGrams), margin + 132, y + 7, { align: 'right' });
    doc.text(item.purity || 'N/A', margin + 148, y + 7, { align: 'right' });
    doc.text(pdfCurrency(item.appraisedValue), pageWidth - margin - 3, y + 7, {
      align: 'right',
    });
    y += rowH;
  }

  y += 8;

  // Signatures Section
  ensureSpace(52);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('DOCUMENTED APPROVAL & SIGNATURES', margin, y);
  y += 5;

  const sigBoxW = (contentWidth - 6) / 2;
  const sigBoxH = 38;

  doc.setDrawColor(203, 213, 225);
  doc.rect(margin, y, sigBoxW, sigBoxH);
  doc.rect(margin + sigBoxW + 6, y, sigBoxW, sigBoxH);

  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text('1. Customer Acceptance & Signature', margin + 3, y + 5.5);
  doc.text('2. Authorized Branch Representative', margin + sigBoxW + 9, y + 5.5);

  const custSigPng = application.sanctionSigning?.customerSignatureDataUrl
    ? await toPngDataUrl(application.sanctionSigning.customerSignatureDataUrl)
    : null;
  const adminSigPng = application.sanctionSigning?.branchRepSignatureDataUrl
    ? await toPngDataUrl(application.sanctionSigning.branchRepSignatureDataUrl)
    : null;

  if (custSigPng) {
    const imgType = custSigPng.startsWith('data:image/png') ? 'PNG' : 'JPEG';
    doc.addImage(custSigPng, imgType, margin + 4, y + 8, sigBoxW - 14, 18);
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Signed by ${application.customer.fullName} on ${new Date(
      application.sanctionSigning.customerSignedAt!
    ).toLocaleString('en-IN')}`,
    margin + 3,
    y + 33
  );

  if (adminSigPng) {
    const imgType = adminSigPng.startsWith('data:image/png') ? 'PNG' : 'JPEG';
    doc.addImage(adminSigPng, imgType, margin + sigBoxW + 10, y + 8, sigBoxW - 14, 18);
  }
  doc.text(
    `Signed by ${application.sanctionSigning.branchRepName} on ${new Date(
      application.sanctionSigning.branchRepSignedAt!
    ).toLocaleString('en-IN')}`,
    margin + sigBoxW + 9,
    y + 33
  );

  y += sigBoxH + 8;
  ensureSpace(12);
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Application Ref: ${application.applicationNumber} | EMI/Servicing: ${formatINR(
      offer.monthlyInstallment
    )}/mo | Total Repayable: ${pdfCurrency(offer.totalRepayableAmount)}`,
    margin,
    y
  );

  const filename = `Sanction-Letter-${application.applicationNumber}.pdf`;
  doc.save(filename);
  return filename;
}

export async function downloadRepaymentReceiptPdf(
  application: GoldLoanApplication,
  receipt: RepaymentReceipt,
  policy: LendingPolicy
): Promise<string> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;
  let y = 14;

  doc.setFillColor(15, 23, 42);
  doc.rect(margin, y, contentWidth, 18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(policy.organizationName, margin + 4, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(203, 213, 225);
  doc.text(`Official EMI Payment Receipt · ${application.branchName}`, margin + 4, y + 13);

  doc.setTextColor(251, 191, 36);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(receipt.receiptNumber, pageWidth - margin - 4, y + 7.5, { align: 'right' });

  y += 25;
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`Borrower: ${application.customer.fullName}`, margin, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(`Loan Account: ${application.applicationNumber}`, margin, y + 5);
  doc.text(
    `Paid On: ${new Date(receipt.paidAt).toLocaleString('en-IN')}`,
    margin,
    y + 10
  );
  doc.text(
    `Payment Mode: ${receipt.paymentMode} · Ref: ${receipt.transactionRef}`,
    margin,
    y + 15
  );

  y += 22;
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y, contentWidth, 34, 'FD');

  const rows: Array<[string, string]> = [
    ['Installment Number', `EMI #${receipt.installmentNumber}`],
    ['Principal Component', pdfCurrency(receipt.principalPaid)],
    ['Interest Component', pdfCurrency(receipt.interestPaid)],
    ['Total Amount Received', pdfCurrency(receipt.totalPaid)],
  ];
  rows.forEach(([label, value], idx) => {
    const ry = y + 7 + idx * 7;
    doc.setFont('helvetica', idx === 3 ? 'bold' : 'normal');
    doc.setFontSize(idx === 3 ? 9.5 : 8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(label, margin + 4, ry);
    doc.text(value, pageWidth - margin - 4, ry, { align: 'right' });
  });

  y += 42;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Recorded by: ${receipt.collectedByName}`, margin, y);
  doc.text(
    'This is a system-generated receipt from Aurelia Vault Gold Loan Operations.',
    margin,
    y + 5
  );

  const filename = `Receipt-${receipt.receiptNumber}.pdf`;
  doc.save(filename);
  return filename;
}

export function printElementInIsolatedFrame(htmlContent: string, title: string): boolean {
  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const resolvedHtml = origin
      ? htmlContent.replace(/src="(\/[^"]+)"/g, `src="${origin}$1"`)
      : htmlContent;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const frameDoc = iframe.contentWindow?.document;
    const frameWin = iframe.contentWindow;
    if (!frameDoc || !frameWin) {
      iframe.remove();
      return false;
    }

    frameDoc.open();
    frameDoc.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; margin: 24px; font-size: 12px; line-height: 1.45; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: middle; }
    th { background: #f8fafc; font-weight: 600; }
    td:first-child img { width: 64px; height: 48px; object-fit: cover; border-radius: 4px; display: block; border: 1px solid #e2e8f0; }
    img { max-height: 76px; max-width: 180px; object-fit: contain; border-radius: 4px; }
    .no-print { display: none !important; }
  </style>
</head>
<body>${resolvedHtml}</body>
</html>`);
    frameDoc.close();

    const triggerPrint = () => {
      try {
        frameWin.focus();
        frameWin.print();
      } finally {
        setTimeout(() => {
          iframe.remove();
        }, 1500);
      }
    };

    const imgs = Array.from(frameDoc.images);
    if (imgs.length === 0) {
      triggerPrint();
    } else {
      let remaining = imgs.length;
      let printed = false;
      const done = () => {
        remaining -= 1;
        if (remaining <= 0 && !printed) {
          printed = true;
          triggerPrint();
        }
      };
      imgs.forEach((img) => {
        if (img.complete) {
          done();
        } else {
          img.addEventListener('load', done);
          img.addEventListener('error', done);
        }
      });
      setTimeout(() => {
        if (!printed) {
          printed = true;
          triggerPrint();
        }
      }, 900);
    }
    return true;
  } catch {
    return false;
  }
}
