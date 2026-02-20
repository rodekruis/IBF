import crypto from 'node:crypto';

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .pbkdf2Sync(password, salt, 1, 32, 'sha256')
    .toString('hex');
  return { hash, salt };
}
