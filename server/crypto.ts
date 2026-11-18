import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const KEY_FILE = path.join(DATA_DIR, '.vault-master.key');

function getMasterKey(): Buffer {
  const envSecret = process.env.PORTAL_ENCRYPTION_SECRET;
  if (envSecret && envSecret.length >= 16) {
    return crypto.scryptSync(envSecret, 'aurelia-vault-salt-v1', 32);
  }
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (fs.existsSync(KEY_FILE)) {
    const hex = fs.readFileSync(KEY_FILE, 'utf8').trim();
    if (hex.length === 64) {
      return Buffer.from(hex, 'hex');
    }
  }
  const generated = crypto.randomBytes(32);
  fs.writeFileSync(KEY_FILE, generated.toString('hex'), { mode: 0o600 });
  return generated;
}

export function encryptSensitiveField(plaintext: string): string {
  if (!plaintext) return '';
  const key = getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSensitiveField(payload: string): string {
  if (!payload || !payload.includes(':')) return payload;
  try {
    const [ivHex, tagHex, dataHex] = payload.split(':');
    if (!ivHex || !tagHex || !dataHex) return '';
    const key = getMasterKey();
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(ivHex, 'hex')
    );
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    return '';
  }
}

export function hashOneWay(value: string): string {
  return crypto
    .createHash('sha256')
    .update(`aurelia-aadhaar-hash:${value.replace(/\s+/g, '')}`)
    .digest('hex');
}

export function computeAuditIntegrityHash(entry: {
  id: string;
  applicationId: string;
  timestamp: string;
  actorId: string;
  action: string;
  details: string;
}): string {
  const payload = `${entry.id}|${entry.applicationId}|${entry.timestamp}|${entry.actorId}|${entry.action}|${entry.details}`;
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
}
