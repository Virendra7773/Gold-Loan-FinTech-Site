import { GoogleGenAI, Type } from '@google/genai';
import type { OcrExtractionResult } from '../src/types/portal.ts';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function maskAadhaarDigits(raw: string | undefined): { masked?: string; last4?: string } {
  if (!raw) return {};
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 4) return {};
  const last4 = digits.slice(-4);
  return {
    masked: `XXXX-XXXX-${last4}`,
    last4,
  };
}

export async function extractKycDocumentWithGemini(params: {
  base64Data: string;
  mimeType: string;
  documentHint?: 'PAN' | 'Aadhaar';
}): Promise<OcrExtractionResult> {
  const ai = getGeminiClient();

  const cleanBase64 = params.base64Data.includes(',')
    ? params.base64Data.split(',')[1]
    : params.base64Data;

  const prompt = `Analyze this Indian KYC identity/address document image (${params.documentHint ?? 'PAN or Aadhaar'}).
Extract only what is visibly printed on the document. Do not fabricate missing fields.
If it is a PAN card, extract the 10-character PAN number (format AAAAA9999A), full name, and date of birth.
If it is an Aadhaar card, extract the full name, date of birth, address (if visible), and ONLY the last 4 digits of the Aadhaar number (or the full number so it can be immediately masked).
Provide concise confidenceNotes describing legibility or any cropped/blurry regions.`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: params.mimeType || 'image/jpeg',
            data: cleanBase64,
          },
        },
        { text: prompt },
      ],
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          documentType: {
            type: Type.STRING,
            description: 'One of PAN, Aadhaar, or Unknown',
          },
          fullName: {
            type: Type.STRING,
            description: 'Printed full name if legible',
          },
          panNumber: {
            type: Type.STRING,
            description: '10-character PAN if PAN card',
          },
          aadhaarRawOrLast4: {
            type: Type.STRING,
            description: 'Extracted Aadhaar digits if visible',
          },
          dateOfBirth: {
            type: Type.STRING,
            description: 'Date of birth in YYYY-MM-DD or printed format',
          },
          address: {
            type: Type.STRING,
            description: 'Printed residential address if visible',
          },
          confidenceNotes: {
            type: Type.STRING,
            description: 'Short note on OCR clarity and fields that staff should double-check',
          },
        },
        required: ['documentType', 'confidenceNotes'],
      },
    },
  });

  const rawText = (response.text ?? '{}').trim();
  const parsed = JSON.parse(rawText) as {
    documentType?: string;
    fullName?: string;
    panNumber?: string;
    aadhaarRawOrLast4?: string;
    dateOfBirth?: string;
    address?: string;
    confidenceNotes?: string;
  };

  const docType: OcrExtractionResult['documentType'] =
    parsed.documentType === 'PAN'
      ? 'PAN'
      : parsed.documentType === 'Aadhaar'
        ? 'Aadhaar'
        : 'Unknown';

  const maskedAadhaar = maskAadhaarDigits(parsed.aadhaarRawOrLast4);
  const cleanPan = parsed.panNumber
    ? parsed.panNumber.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)
    : undefined;

  return {
    documentType: docType,
    fullName: parsed.fullName?.trim() || undefined,
    panNumber: cleanPan || undefined,
    aadhaarMasked: maskedAadhaar.masked,
    aadhaarLast4: maskedAadhaar.last4,
    dateOfBirth: parsed.dateOfBirth?.trim() || undefined,
    address: parsed.address?.trim() || undefined,
    confidenceNotes:
      parsed.confidenceNotes?.trim() ||
      'OCR extraction completed. Verify all characters against the physical document.',
    disclaimer:
      'OCR is an entry aid only and is NOT proof of document authenticity. Branch staff and administrators must verify original documents before KYC approval.',
  };
}
