import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  ApplicationStatus,
  GoldItem,
  KycDecision,
  PurityGrade,
  RepaymentScheme,
  StaffRole,
  StaffUser,
} from './src/types/portal.ts';
import { calculateLoanOffer, computeItemAppraisedValue } from './src/utils/loanMath.ts';
import { extractKycDocumentWithGemini } from './server/ocr.ts';
import {
  STAFF_DIRECTORY,
  appendStandaloneAuditLog,
  authenticateRoleSwitch,
  createNewApplication,
  getAllStaffUsers,
  getBootstrapData,
  getPolicy,
  getStaffById,
  mutateApplication,
  registerCustomerAccount,
  updateRecordEncryptedFields,
} from './server/store.ts';

interface AuthenticatedRequest extends Request {
  staffUser?: StaffUser;
}

function attachStaffUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const headerId = req.header('x-staff-id') || (req.query.staffId as string | undefined) || 'staff-01';
  const staff = getStaffById(headerId);
  if (!staff) {
    res.status(401).json({ error: 'Invalid or unrecognized staff identity.' });
    return;
  }
  req.staffUser = staff;
  next();
}

function requireRoles(allowed: StaffRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const actor = req.staffUser;
    if (!actor || !allowed.includes(actor.role)) {
      res.status(403).json({
        error: `Access denied for role ${actor?.role ?? 'UNKNOWN'}. Required role: ${allowed.join(' or ')}.`,
      });
      return;
    }
    next();
  };
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '15mb' }));

  // Staff & Bootstrap
  app.get('/api/staff', (_req, res) => {
    res.json({ staffDirectory: getAllStaffUsers() });
  });

  app.post('/api/auth/login', (req, res) => {
    try {
      const { staffId, loginId, password } = req.body as {
        staffId?: string;
        loginId?: string;
        password?: string;
      };
      if (!loginId || !password) {
        res.status(400).json({ error: 'Login ID and Password are required.' });
        return;
      }
      const user = authenticateRoleSwitch(staffId, loginId, password);
      const auditEntry = appendStandaloneAuditLog({
        applicationId: 'ROLE-AUTH',
        applicationNumber: user.employeeCode,
        actor: user,
        action: `Role Sign-In Verified (${user.role})`,
        details: `${user.name} (${user.employeeCode}) authenticated via sign-in portal.`,
      });
      res.json({ user, auditEntry });
    } catch (err) {
      res.status(401).json({
        error: err instanceof Error ? err.message : 'Authentication failed.',
      });
    }
  });

  app.post('/api/auth/register', (req, res) => {
    try {
      const { fullName, phone, loginId, password } = req.body as {
        fullName?: string;
        phone?: string;
        loginId?: string;
        password?: string;
      };
      if (!fullName?.trim() || !phone?.trim() || !loginId?.trim() || !password?.trim()) {
        res.status(400).json({
          error: 'Full name, mobile number, login ID, and password are required.',
        });
        return;
      }
      if (password.trim().length < 6) {
        res.status(400).json({ error: 'Password must be at least 6 characters.' });
        return;
      }
      const result = registerCustomerAccount({ fullName, phone, loginId, password });
      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Registration failed.',
      });
    }
  });

  app.get('/api/bootstrap', attachStaffUser, (req: AuthenticatedRequest, res) => {
    const data = getBootstrapData(req.staffUser!);
    res.json(data);
  });

  // Instant Demo KYC OCR Assist (Branch Staff / Branch Admin / Customer Self-Service)
  app.post(
    '/api/ocr/extract',
    attachStaffUser,
    requireRoles(['BRANCH_STAFF', 'BRANCH_ADMIN', 'CUSTOMER']),
    async (req: AuthenticatedRequest, res) => {
      try {
        const {
          base64Data,
          mimeType,
          documentHint,
          applicationId,
          applicationNumber,
          draftKey,
          existingName,
        } = req.body as {
          base64Data?: string;
          mimeType?: string;
          documentHint?: 'PAN' | 'Aadhaar';
          applicationId?: string;
          applicationNumber?: string;
          draftKey?: string;
          existingName?: string;
        };

        if (!base64Data) {
          res.status(400).json({ error: 'Document image data is required for OCR.' });
          return;
        }

        const result = await extractKycDocumentWithGemini({
          base64Data,
          mimeType: mimeType || 'image/jpeg',
          documentHint,
          draftKey,
          existingName,
        });

        appendStandaloneAuditLog({
          applicationId: applicationId || 'INTAKE-NEW',
          applicationNumber: applicationNumber || 'NEW-INTAKE',
          actor: req.staffUser!,
          action: `OCR Extraction Assist (${result.documentType})`,
          details: `Demo KYC OCR processed ${documentHint ?? result.documentType} scan. Aadhaar automatically masked (${result.aadhaarMasked ?? 'N/A'}). Staff reminded OCR is an entry aid only.`,
        });

        res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'OCR extraction failed.';
        res.status(500).json({ error: message });
      }
    }
  );

  // Create Customer Application (Branch Staff / Branch Admin / Customer Self-Service)
  app.post(
    '/api/applications',
    attachStaffUser,
    requireRoles(['BRANCH_STAFF', 'BRANCH_ADMIN', 'CUSTOMER']),
    (req: AuthenticatedRequest, res) => {
      try {
        const body = req.body;
        if (!body?.customer?.fullName || !body?.customer?.phone || !body?.customer?.panNumber) {
          res.status(400).json({ error: 'Customer name, phone, and PAN are required.' });
          return;
        }
        if (body.submitForKyc && !body.customer.consentCaptured) {
          res.status(400).json({
            error: 'Explicit customer consent must be captured before submitting for KYC review.',
          });
          return;
        }
        if (body.submitForKyc) {
          const items: GoldItem[] = Array.isArray(body.goldItems) ? body.goldItems : [];
          if (items.length === 0) {
            res.status(400).json({ error: 'At least one gold ornament must be pledged.' });
            return;
          }
          const missingProvenance = items.some((item) => {
            if (item.provenanceType === 'generational') {
              return !item.generationalDeclarationAccepted || !item.generationalRelation?.trim();
            }
            return (
              !item.purchaseBillAvailable ||
              !item.purchaseBillRef?.trim() ||
              !item.purchaseBillImageUrl
            );
          });
          if (missingProvenance) {
            res.status(400).json({
              error:
                'Each ornament requires either an Original Gold Bill (invoice # + bill scan) OR a signed Generational Gold Ownership Declaration.',
            });
            return;
          }
        }
        const created = createNewApplication(req.staffUser!, body);
        res.status(201).json(created);
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create application.' });
      }
    }
  );

  // Update Intake / Resubmit after More Info Requested (Branch Staff / Branch Admin / Customer owner)
  app.patch(
    '/api/applications/:id/intake',
    attachStaffUser,
    requireRoles(['BRANCH_STAFF', 'BRANCH_ADMIN', 'CUSTOMER']),
    (req: AuthenticatedRequest, res) => {
      try {
        const id = String(req.params.id);
        const body = req.body as {
          customer?: {
            fullName: string;
            phone: string;
            dateOfBirth: string;
            address: string;
            panNumber: string;
            aadhaarNumberOrLast4?: string;
            consentCaptured: boolean;
            ocrDisclaimerAcknowledged: boolean;
          };
          kycDocuments?: GoldItem[] extends never ? never : unknown[];
          goldItems?: GoldItem[];
          bankAccount?: {
            accountHolderName: string;
            bankName: string;
            ifscCode: string;
            accountNumber?: string;
          };
          submitForKyc?: boolean;
        };

        const updated = mutateApplication(id, req.staffUser!, (app, record) => {
          if (req.staffUser?.role === 'CUSTOMER') {
            const linkedName = req.staffUser.linkedCustomerName?.trim().toLowerCase();
            const isOwner =
              app.createdById === req.staffUser.id ||
              (Boolean(linkedName) && app.customer.fullName.trim().toLowerCase() === linkedName);
            if (!isOwner) {
              throw new Error('You can only edit your own loan application.');
            }
          }
          const allowedStatuses: ApplicationStatus[] = ['Draft', 'KYC Info Required', 'KYC Pending'];
          if (!allowedStatuses.includes(app.status)) {
            throw new Error(`Cannot edit intake while status is ${app.status}.`);
          }
          if (body.customer) {
            app.customer.fullName = body.customer.fullName.trim();
            app.customer.phone = body.customer.phone.trim();
            app.customer.dateOfBirth = body.customer.dateOfBirth;
            app.customer.address = body.customer.address.trim();
            app.customer.panNumber = body.customer.panNumber.trim().toUpperCase();
            app.customer.consentCaptured = body.customer.consentCaptured;
            if (body.customer.consentCaptured && !app.customer.consentTimestamp) {
              app.customer.consentTimestamp = new Date().toISOString();
            }
            app.customer.ocrDisclaimerAcknowledged = body.customer.ocrDisclaimerAcknowledged;
            if (body.customer.aadhaarNumberOrLast4) {
              const digits = body.customer.aadhaarNumberOrLast4.replace(/\D/g, '');
              const last4 = digits.slice(-4).padStart(4, 'X');
              app.customer.aadhaarLast4 = last4;
              app.customer.aadhaarMasked = `XXXX-XXXX-${last4}`;
            }
            updateRecordEncryptedFields(record, {
              panNumber: app.customer.panNumber,
              aadhaarRaw: body.customer.aadhaarNumberOrLast4,
            });
          }
          if (Array.isArray(body.goldItems)) {
            app.goldItems = body.goldItems;
          }
          if (Array.isArray(body.kycDocuments)) {
            app.kycDocuments = body.kycDocuments as typeof app.kycDocuments;
          }
          if (body.bankAccount) {
            app.bankAccount.accountHolderName = body.bankAccount.accountHolderName.trim();
            app.bankAccount.bankName = body.bankAccount.bankName.trim();
            app.bankAccount.ifscCode = body.bankAccount.ifscCode.trim().toUpperCase();
            if (body.bankAccount.accountNumber) {
              const digits = body.bankAccount.accountNumber.replace(/\D/g, '');
              const last4 = digits.slice(-4);
              app.bankAccount.accountNumberLast4 = last4;
              app.bankAccount.accountNumberMasked = `XXXX-XXXX-${last4 || 'XXXX'}`;
              updateRecordEncryptedFields(record, { bankAccountNumber: digits });
            }
          }

          const prev = app.status;
          if (body.submitForKyc) {
            if (!app.customer.consentCaptured) {
              throw new Error('Customer consent is required prior to KYC submission.');
            }
            if (app.goldItems.length === 0) {
              throw new Error('At least one gold ornament must be captured.');
            }
            const missingProvenance = app.goldItems.some((item) => {
              if (item.provenanceType === 'generational') {
                return !item.generationalDeclarationAccepted || !item.generationalRelation?.trim();
              }
              return (
                !item.purchaseBillAvailable ||
                !item.purchaseBillRef?.trim() ||
                !item.purchaseBillImageUrl
              );
            });
            if (missingProvenance) {
              throw new Error(
                'Each ornament requires either an Original Gold Bill (invoice # + bill scan) OR a signed Generational Gold Ownership Declaration.'
              );
            }
            app.status = 'KYC Pending';
            app.kycDecision = 'Pending';
          }

          return {
            action: body.submitForKyc ? 'Submitted Application for KYC Review' : 'Updated Application Intake',
            details: `Intake saved for ${app.customer.fullName} with ${app.goldItems.length} ornament(s).`,
            previousStatus: prev,
            newStatus: app.status,
          };
        });

        res.json(updated);
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : 'Update failed.' });
      }
    }
  );

  // KYC Review (Branch Administrator ONLY)
  app.post(
    '/api/applications/:id/kyc-review',
    attachStaffUser,
    requireRoles(['BRANCH_ADMIN']),
    (req: AuthenticatedRequest, res) => {
      try {
        const id = String(req.params.id);
        const { decision, remarks } = req.body as { decision: KycDecision; remarks: string };
        const validDecisions: KycDecision[] = [
          'Pending',
          'Approved',
          'Rejected',
          'Requires more information',
        ];
        if (!validDecisions.includes(decision)) {
          res.status(400).json({ error: 'Invalid KYC decision.' });
          return;
        }
        if ((decision === 'Rejected' || decision === 'Requires more information') && !remarks?.trim()) {
          res.status(400).json({
            error: 'A clear reason or remark is mandatory when rejecting or requesting additional information.',
          });
          return;
        }

        const updated = mutateApplication(id, req.staffUser!, (app) => {
          const prev = app.status;
          const now = new Date().toISOString();
          app.kycDecision = decision;
          app.kycReviewHistory.unshift({
            id: `kyc-${crypto.randomBytes(3).toString('hex')}`,
            decision,
            remarks: remarks?.trim() || 'Verified original documents against intake records.',
            reviewedById: req.staffUser!.id,
            reviewedByName: req.staffUser!.name,
            reviewedAt: now,
          });

          if (decision === 'Approved') {
            app.status = 'Appraisal Pending';
          } else if (decision === 'Rejected') {
            app.status = 'KYC Rejected';
          } else if (decision === 'Requires more information') {
            app.status = 'KYC Info Required';
          } else {
            app.status = 'KYC Pending';
          }

          return {
            action: `KYC Decision: ${decision}`,
            details: remarks?.trim() || `KYC marked as ${decision} by ${req.staffUser!.name}.`,
            previousStatus: prev,
            newStatus: app.status,
          };
        });

        res.json(updated);
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : 'KYC review failed.' });
      }
    }
  );

  // Gold Appraisal (Authorized Appraiser ONLY)
  app.post(
    '/api/applications/:id/appraisal',
    attachStaffUser,
    requireRoles(['APPRAISER']),
    (req: AuthenticatedRequest, res) => {
      try {
        const id = String(req.params.id);
        const { items, remarks } = req.body as {
          items: Array<{
            itemId: string;
            grossWeightGrams: number;
            stoneDetails: string;
            stoneDeductionGrams: number;
            purity: PurityGrade;
            appraiserNotes: string;
            supportingPhotoDataUrl?: string;
          }>;
          remarks: string;
        };

        if (!Array.isArray(items) || items.length === 0) {
          res.status(400).json({ error: 'Appraisal entries for gold items are required.' });
          return;
        }

        const policy = getPolicy();

        const updated = mutateApplication(id, req.staffUser!, (app) => {
          if (app.kycDecision !== 'Approved') {
            throw new Error('KYC must be approved before bullion appraisal can be finalized.');
          }
          const prev = app.status;
          let totalGross = 0;
          let totalNet = 0;
          let totalValue = 0;

          const snapshots: Array<{
            itemId: string;
            itemType: GoldItem['itemType'];
            grossWeightGrams: number;
            netWeightGrams: number;
            purity: PurityGrade;
            appraisedValue: number;
          }> = [];

          app.goldItems = app.goldItems.map((ornament) => {
            const input = items.find((i) => i.itemId === ornament.id);
            if (!input) {
              throw new Error(`Missing appraisal input for item ${ornament.itemType}`);
            }
            const computed = computeItemAppraisedValue(
              Number(input.grossWeightGrams),
              Number(input.stoneDeductionGrams),
              input.purity,
              policy
            );
            totalGross += Number(input.grossWeightGrams);
            totalNet += computed.netWeightGrams;
            totalValue += computed.appraisedValue;

            snapshots.push({
              itemId: ornament.id,
              itemType: ornament.itemType,
              grossWeightGrams: Number(input.grossWeightGrams),
              netWeightGrams: computed.netWeightGrams,
              purity: input.purity,
              appraisedValue: computed.appraisedValue,
            });

            return {
              ...ornament,
              grossWeightGrams: Number(input.grossWeightGrams),
              stoneDetails: input.stoneDetails?.trim() || 'No stones',
              stoneDeductionGrams: Number(input.stoneDeductionGrams) || 0,
              netWeightGrams: computed.netWeightGrams,
              purity: input.purity,
              ratePerGram: computed.ratePerGram,
              appraisedValue: computed.appraisedValue,
              appraiserNotes: input.appraiserNotes?.trim() || '',
              supportingPhotoDataUrl: input.supportingPhotoDataUrl || ornament.supportingPhotoDataUrl,
            };
          });

          const now = new Date().toISOString();
          app.appraisalHistory.unshift({
            id: `apr-${crypto.randomBytes(3).toString('hex')}`,
            appraisedAt: now,
            appraiserId: req.staffUser!.id,
            appraiserName: req.staffUser!.name,
            totalGrossWeightGrams: Math.round(totalGross * 100) / 100,
            totalNetWeightGrams: Math.round(totalNet * 100) / 100,
            totalAppraisedValue: totalValue,
            remarks: remarks?.trim() || 'Bullion assay & weight verification completed.',
            itemSnapshots: snapshots,
          });

          app.status = 'Loan Offer Ready';

          // Initialize or refresh loan offer eligibility ceiling
          const { terms } = calculateLoanOffer({
            totalAppraisedValue: totalValue,
            requestedAmount:
              app.loanOffer?.requestedAmount ?? Math.floor((totalValue * policy.maxLtvPercent) / 100),
            sanctionedAmount:
              app.loanOffer?.sanctionedAmount ?? Math.floor((totalValue * policy.maxLtvPercent) / 100),
            tenureMonths: app.loanOffer?.tenureMonths ?? 12,
            repaymentScheme: app.loanOffer?.repaymentScheme ?? 'Monthly EMI',
            policy,
          });
          app.loanOffer = terms;

          return {
            action: 'Gold Appraisal Recorded',
            details: `Appraised ${app.goldItems.length} item(s): Gross ${totalGross.toFixed(2)}g, Net ${totalNet.toFixed(2)}g, Value ₹${totalValue.toLocaleString('en-IN')}.`,
            previousStatus: prev,
            newStatus: app.status,
          };
        });

        res.json(updated);
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : 'Appraisal failed.' });
      }
    }
  );

  // Configure Loan Offer & Submit for Sanction (Branch Staff / Branch Admin)
  app.post(
    '/api/applications/:id/loan-offer',
    attachStaffUser,
    requireRoles(['BRANCH_STAFF', 'BRANCH_ADMIN']),
    (req: AuthenticatedRequest, res) => {
      try {
        const id = String(req.params.id);
        const { requestedAmount, sanctionedAmount, tenureMonths, repaymentScheme, submitForSanction } =
          req.body as {
            requestedAmount: number;
            sanctionedAmount: number;
            tenureMonths: number;
            repaymentScheme: RepaymentScheme;
            submitForSanction?: boolean;
          };

        const policy = getPolicy();

        const updated = mutateApplication(id, req.staffUser!, (app) => {
          const totalAppraised = app.goldItems.reduce(
            (sum, item) => sum + (item.appraisedValue || 0),
            0
          );
          if (totalAppraised <= 0) {
            throw new Error('Cannot compute loan offer before gold appraisal is completed.');
          }
          const maxEligible = Math.floor((totalAppraised * policy.maxLtvPercent) / 100);
          if (sanctionedAmount > maxEligible) {
            throw new Error(
              `Sanctioned amount (₹${sanctionedAmount}) cannot exceed maximum eligible LTV ceiling (₹${maxEligible}).`
            );
          }
          if (sanctionedAmount <= 0) {
            throw new Error('Sanctioned amount must be greater than zero.');
          }

          const prev = app.status;
          const { terms } = calculateLoanOffer({
            totalAppraisedValue: totalAppraised,
            requestedAmount: Number(requestedAmount),
            sanctionedAmount: Number(sanctionedAmount),
            tenureMonths: Number(tenureMonths),
            repaymentScheme,
            policy,
          });
          app.loanOffer = terms;

          if (submitForSanction) {
            app.status = 'Sanction Pending';
            if (!app.sanctionSigning) {
              app.sanctionSigning = {
                sanctionLetterNumber: `SL-${app.applicationNumber}`,
                generatedAt: new Date().toISOString(),
                customerSigned: false,
                branchRepSigned: false,
              };
            }
          }

          return {
            action: submitForSanction ? 'Loan Offer Locked & Sanction Letter Issued' : 'Loan Offer Updated',
            details: `Eligible: ₹${terms.maxEligibleAmount.toLocaleString('en-IN')} | Requested: ₹${terms.requestedAmount.toLocaleString('en-IN')} | Sanctioned: ₹${terms.sanctionedAmount.toLocaleString('en-IN')} (${terms.tenureMonths}m ${terms.repaymentScheme}).`,
            previousStatus: prev,
            newStatus: app.status,
          };
        });

        res.json(updated);
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : 'Loan offer update failed.' });
      }
    }
  );

  // Sanction Letter Approval & Signing (Branch Staff/Customer can sign customer slot; Branch Admin signs as Authorized Rep & approves Sanction)
  app.post(
    '/api/applications/:id/sanction-sign',
    attachStaffUser,
    requireRoles(['BRANCH_STAFF', 'BRANCH_ADMIN', 'CUSTOMER']),
    (req: AuthenticatedRequest, res) => {
      try {
        const id = String(req.params.id);
        const { signerType, signatureDataUrl } = req.body as {
          signerType: 'customer' | 'branch_rep';
          signatureDataUrl: string;
        };

        if (!signatureDataUrl) {
          res.status(400).json({ error: 'Signature capture is required.' });
          return;
        }
        if (signerType === 'branch_rep' && req.staffUser!.role !== 'BRANCH_ADMIN') {
          res.status(403).json({
            error: 'Only an Authorized Branch Administrator can countersign the Sanction Letter.',
          });
          return;
        }

        const updated = mutateApplication(id, req.staffUser!, (app) => {
          if (!app.loanOffer) {
            throw new Error('Loan offer must be configured prior to sanction signing.');
          }
          const prev = app.status;
          const now = new Date().toISOString();
          if (!app.sanctionSigning) {
            app.sanctionSigning = {
              sanctionLetterNumber: `SL-${app.applicationNumber}`,
              generatedAt: now,
              customerSigned: false,
              branchRepSigned: false,
            };
          }

          if (signerType === 'customer') {
            app.sanctionSigning.customerSigned = true;
            app.sanctionSigning.customerSignatureDataUrl = signatureDataUrl;
            app.sanctionSigning.customerSignedAt = now;
          } else {
            app.sanctionSigning.branchRepSigned = true;
            app.sanctionSigning.branchRepId = req.staffUser!.id;
            app.sanctionSigning.branchRepName = req.staffUser!.name;
            app.sanctionSigning.branchRepSignatureDataUrl = signatureDataUrl;
            app.sanctionSigning.branchRepSignedAt = now;
          }

          if (app.sanctionSigning.customerSigned && app.sanctionSigning.branchRepSigned) {
            app.status = 'Sanctioned';
          } else {
            app.status = 'Sanction Pending';
          }

          return {
            action:
              signerType === 'customer'
                ? 'Customer Signed Sanction Letter'
                : 'Branch Rep Countersigned & Sanctioned Loan',
            details: `Sanction Letter ${app.sanctionSigning.sanctionLetterNumber} signed by ${signerType === 'customer' ? app.customer.fullName : req.staffUser!.name}.`,
            previousStatus: prev,
            newStatus: app.status,
          };
        });

        res.json(updated);
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : 'Sanction signing failed.' });
      }
    }
  );

  // Record Sanction Letter PDF Export / Print in Audit Log (Strictly unlocked only when BOTH parties have signed)
  app.post(
    '/api/applications/:id/sanction-export',
    attachStaffUser,
    (req: AuthenticatedRequest, res) => {
      try {
        const id = String(req.params.id);
        const { format } = req.body as { format?: 'PDF' | 'PRINT' };
        const updated = mutateApplication(id, req.staffUser!, (app) => {
          if (!app.sanctionSigning?.customerSigned || !app.sanctionSigning?.branchRepSigned) {
            throw new Error(
              'Sanction letter download and print unlock only after both Customer and Branch Administrator have signed.'
            );
          }
          return {
            action: `Sanction Letter ${format === 'PRINT' ? 'Printed' : 'PDF Downloaded'}`,
            details: `Generated ${format === 'PRINT' ? 'print layout' : 'dual-signed PDF'} for ${app.sanctionSigning.sanctionLetterNumber}.`,
          };
        });
        res.json(updated);
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : 'Export log failed.' });
      }
    }
  );

  // Collateral Storage & Seal Handover (Branch Admin ONLY)
  app.post(
    '/api/applications/:id/collateral',
    attachStaffUser,
    requireRoles(['BRANCH_ADMIN']),
    (req: AuthenticatedRequest, res) => {
      try {
        const id = String(req.params.id);
        const {
          packageSealNumber,
          vaultLocation,
          storageBoxNumber,
          handedOverById,
          notes,
        } = req.body as {
          packageSealNumber: string;
          vaultLocation: string;
          storageBoxNumber: string;
          handedOverById: string;
          notes?: string;
        };

        if (!packageSealNumber?.trim() || !vaultLocation?.trim() || !storageBoxNumber?.trim()) {
          res.status(400).json({
            error: 'Package seal number, vault location, and storage box number are mandatory.',
          });
          return;
        }

        const handoverStaff = getStaffById(handedOverById) ?? STAFF_DIRECTORY[1];

        const updated = mutateApplication(id, req.staffUser!, (app) => {
          if (app.status !== 'Sanctioned' && app.status !== 'Collateral Stored') {
            throw new Error('Loan must be Sanctioned before vault collateral intake.');
          }
          const prev = app.status;
          const now = new Date().toISOString();
          const existingLog = app.collateralStorage?.custodyLog ?? [];
          app.collateralStorage = {
            packageSealNumber: packageSealNumber.trim().toUpperCase(),
            vaultLocation: vaultLocation.trim(),
            storageBoxNumber: storageBoxNumber.trim().toUpperCase(),
            handedOverById: handoverStaff.id,
            handedOverByName: handoverStaff.name,
            receivedById: req.staffUser!.id,
            receivedByName: req.staffUser!.name,
            handoverTimestamp: now,
            custodyLog: [
              {
                id: `cus-${crypto.randomBytes(3).toString('hex')}`,
                timestamp: now,
                event: 'Sealed & Vaulted',
                actorName: req.staffUser!.name,
                actorRole: req.staffUser!.role,
                notes:
                  notes?.trim() ||
                  `Sealed ${packageSealNumber.trim().toUpperCase()} received from ${handoverStaff.name} and stored in ${vaultLocation.trim()} (${storageBoxNumber.trim().toUpperCase()}).`,
              },
              ...existingLog,
            ],
          };

          app.status = 'Collateral Stored';
          return {
            action: 'Collateral Sealed & Stored in Vault',
            details: `Seal ${app.collateralStorage.packageSealNumber} placed in ${app.collateralStorage.vaultLocation} · ${app.collateralStorage.storageBoxNumber}.`,
            previousStatus: prev,
            newStatus: app.status,
          };
        });

        res.json(updated);
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : 'Collateral storage failed.' });
      }
    }
  );

  // Append Custody Inspection / Verification Event (Branch Admin or Appraiser)
  app.post(
    '/api/applications/:id/collateral/custody',
    attachStaffUser,
    requireRoles(['BRANCH_ADMIN', 'APPRAISER']),
    (req: AuthenticatedRequest, res) => {
      try {
        const id = String(req.params.id);
        const { event, notes } = req.body as { event: string; notes: string };
        if (!event?.trim() || !notes?.trim()) {
          res.status(400).json({ error: 'Custody event and notes are required.' });
          return;
        }

        const updated = mutateApplication(id, req.staffUser!, (app) => {
          if (!app.collateralStorage) {
            throw new Error('Collateral has not been sealed into vault storage yet.');
          }
          const now = new Date().toISOString();
          app.collateralStorage.custodyLog.unshift({
            id: `cus-${crypto.randomBytes(3).toString('hex')}`,
            timestamp: now,
            event: event.trim(),
            actorName: req.staffUser!.name,
            actorRole: req.staffUser!.role,
            notes: notes.trim(),
          });

          return {
            action: `Vault Custody Event: ${event.trim()}`,
            details: notes.trim(),
          };
        });

        res.json(updated);
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : 'Custody log update failed.' });
      }
    }
  );

  // Verify Bank & Disburse Funds (Branch Admin ONLY)
  app.post(
    '/api/applications/:id/disbursement',
    attachStaffUser,
    requireRoles(['BRANCH_ADMIN']),
    (req: AuthenticatedRequest, res) => {
      try {
        const id = String(req.params.id);
        const { verifyBankAccount, disbursementStatus, utrReference, remarks } = req.body as {
          verifyBankAccount?: boolean;
          disbursementStatus: 'Pending' | 'Initiated' | 'Disbursed';
          utrReference?: string;
          remarks?: string;
        };

        const updated = mutateApplication(id, req.staffUser!, (app) => {
          if (!app.collateralStorage) {
            throw new Error('Collateral must be sealed and stored in vault before disbursement.');
          }
          if (!app.sanctionSigning?.customerSigned || !app.sanctionSigning?.branchRepSigned) {
            throw new Error('Both customer and branch representative signatures are required before disbursement.');
          }
          if (!app.loanOffer) {
            throw new Error('Loan offer terms missing.');
          }

          const prev = app.status;
          const now = new Date().toISOString();

          if (verifyBankAccount) {
            app.bankAccount.verificationStatus = 'Verified';
            app.bankAccount.verifiedAt = now;
            app.bankAccount.verifiedByName = req.staffUser!.name;
          }

          if (disbursementStatus === 'Disbursed' && app.bankAccount.verificationStatus !== 'Verified') {
            throw new Error('Customer bank account must be verified before marking Disbursed.');
          }
          if (disbursementStatus === 'Disbursed' && !utrReference?.trim()) {
            throw new Error('UTR / Bank transfer reference number is required for Disbursed status.');
          }

          app.disbursement = {
            status: disbursementStatus,
            utrReference: utrReference?.trim() || app.disbursement.utrReference,
            disbursedAmount: app.loanOffer.netDisbursementAmount,
            disbursedAt: disbursementStatus === 'Disbursed' ? now : undefined,
            disbursedById: disbursementStatus === 'Disbursed' ? req.staffUser!.id : undefined,
            disbursedByName: disbursementStatus === 'Disbursed' ? req.staffUser!.name : undefined,
            remarks: remarks?.trim() || app.disbursement.remarks,
          };

          app.status = disbursementStatus === 'Disbursed' ? 'Disbursed' : 'Disbursement Pending';

          return {
            action:
              disbursementStatus === 'Disbursed'
                ? 'Loan Disbursed to Verified Bank Account'
                : `Disbursement Status: ${disbursementStatus}`,
            details:
              disbursementStatus === 'Disbursed'
                ? `Net ₹${app.loanOffer.netDisbursementAmount.toLocaleString('en-IN')} credited via UTR ${utrReference?.trim()} to ${app.bankAccount.bankName} (${app.bankAccount.accountNumberMasked}).`
                : remarks?.trim() || `Disbursement queued (${disbursementStatus}).`,
            previousStatus: prev,
            newStatus: app.status,
          };
        });

        res.json(updated);
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : 'Disbursement update failed.' });
      }
    }
  );

  // Record EMI / Installment Repayment & Issue Receipt (Customer, Branch Staff, or Branch Admin)
  app.post(
    '/api/applications/:id/repayments',
    attachStaffUser,
    requireRoles(['BRANCH_STAFF', 'BRANCH_ADMIN', 'CUSTOMER']),
    (req: AuthenticatedRequest, res) => {
      try {
        const id = String(req.params.id);
        const { installmentNumber, paymentMode, transactionRef } = req.body as {
          installmentNumber?: number;
          paymentMode?: 'UPI' | 'NEFT' | 'Branch Cash' | 'Auto-Debit';
          transactionRef?: string;
        };

        const policy = getPolicy();

        const updated = mutateApplication(id, req.staffUser!, (app) => {
          if (app.status !== 'Disbursed' || !app.loanOffer) {
            throw new Error('Repayments can only be recorded for active Disbursed loans.');
          }
          if (!Array.isArray(app.repayments)) {
            app.repayments = [];
          }

          const totalAppraised = app.goldItems.reduce(
            (sum, item) => sum + (item.appraisedValue ?? 0),
            0
          );
          const { schedule } = calculateLoanOffer({
            totalAppraisedValue: totalAppraised || app.loanOffer.sanctionedAmount,
            requestedAmount: app.loanOffer.requestedAmount,
            sanctionedAmount: app.loanOffer.sanctionedAmount,
            tenureMonths: app.loanOffer.tenureMonths,
            repaymentScheme: app.loanOffer.repaymentScheme,
            policy,
          });

          const paidSet = new Set(app.repayments.map((r) => r.installmentNumber));
          const targetRow = installmentNumber
            ? schedule.find((row) => row.installmentNumber === Number(installmentNumber))
            : schedule.find((row) => !paidSet.has(row.installmentNumber));

          if (!targetRow) {
            throw new Error('All scheduled installments for this loan have already been paid.');
          }
          if (paidSet.has(targetRow.installmentNumber)) {
            throw new Error(`Installment #${targetRow.installmentNumber} has already been paid.`);
          }

          const now = new Date().toISOString();
          const receiptNum = `RCPT-${app.id.slice(-4)}-${String(targetRow.installmentNumber).padStart(2, '0')}`;
          const mode = paymentMode || (req.staffUser!.role === 'CUSTOMER' ? 'UPI' : 'Branch Cash');
          const ref =
            transactionRef?.trim() ||
            `${mode === 'Branch Cash' ? 'CASH' : mode.replace(/[^A-Z]/gi, '').toUpperCase()}${Date.now().toString().slice(-8)}`;

          app.repayments.push({
            id: `rcpt-${crypto.randomBytes(3).toString('hex')}`,
            receiptNumber: receiptNum,
            installmentNumber: targetRow.installmentNumber,
            paidAt: now,
            principalPaid: targetRow.principalComponent,
            interestPaid: targetRow.interestComponent,
            totalPaid: targetRow.totalPayment,
            paymentMode: mode,
            transactionRef: ref,
            collectedByName:
              req.staffUser!.role === 'CUSTOMER'
                ? 'Self-Service Portal'
                : req.staffUser!.name,
          });

          return {
            action: `EMI #${targetRow.installmentNumber} Paid (${receiptNum})`,
            details: `Collected ₹${targetRow.totalPayment.toLocaleString('en-IN')} (Principal ₹${targetRow.principalComponent.toLocaleString('en-IN')} + Interest ₹${targetRow.interestComponent.toLocaleString('en-IN')}) via ${mode} · Ref ${ref}.`,
          };
        });

        res.status(201).json(updated);
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : 'Repayment recording failed.' });
      }
    }
  );

  // Vite dev middleware or static dist serving
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found. Run npm run build.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Aurelia Vault Gold Loan Portal running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
