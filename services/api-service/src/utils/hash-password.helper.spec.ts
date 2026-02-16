import { hashPassword } from '@api-service/src/utils/hash-password.helper';

describe('hashPassword', () => {
  it('should return an object with hash and salt properties', () => {
    const result = hashPassword('testPassword');
    expect(result).toHaveProperty('hash');
    expect(result).toHaveProperty('salt');
    expect(typeof result.hash).toBe('string');
    expect(typeof result.salt).toBe('string');
    expect(result.hash.length).toBeGreaterThan(0);
    expect(result.salt.length).toBeGreaterThan(0);
  });

  it('should generate different salts and hashes for the same password', () => {
    const first = hashPassword('testPassword');
    const second = hashPassword('testPassword');
    expect(first.salt).not.toBe(second.salt);
    expect(first.hash).not.toBe(second.hash);
  });

  it('should generate different hashes for different passwords', () => {
    const first = hashPassword('passwordOne');
    const second = hashPassword('passwordTwo');
    expect(first.hash).not.toBe(second.hash);
  });
});
