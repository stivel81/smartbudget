import {
  MIN_PASSWORD_LENGTH,
  RESET_CODE_LENGTH,
  isValidEmail,
  validateEmail,
  validateNewPassword,
  sanitizeResetCode,
  validateResetCode,
  calculatePasswordStrength,
  validatePasswordChange,
  SAME_PASSWORD_MESSAGE,
} from '../../lib/validation';

describe('lib/validation', () => {
  it('matches the backend rules (8-char passwords, 6-digit codes)', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(RESET_CODE_LENGTH).toBe(6);
  });

  describe('isValidEmail', () => {
    it.each(['a@b.com', 'first.last+tag@sub.example.co'])('accepts %p', (email) => {
      expect(isValidEmail(email)).toBe(true);
    });

    it.each(['', 'a', 'a@b', '@b.com', 'a@.com', 'a b@c.com', 'a@b .com'])('rejects %p', (email) => {
      expect(isValidEmail(email)).toBe(false);
    });
  });

  describe('validateEmail', () => {
    it.each(['', '   '])('requires an email (%p)', (email) => {
      expect(validateEmail(email)).toBe('Email is required');
    });

    it('rejects a malformed email', () => {
      expect(validateEmail('not-an-email')).toBe('Please enter a valid email');
    });

    it('accepts a valid email, ignoring surrounding whitespace', () => {
      expect(validateEmail('  a@b.com  ')).toBeNull();
    });
  });

  describe('validateNewPassword', () => {
    it.each(['', '    '])('requires a password (%p)', (pw) => {
      expect(validateNewPassword(pw)).toBe('Password is required');
    });

    it('rejects a password one character short of the minimum', () => {
      expect(validateNewPassword('1234567')).toBe('Password must be at least 8 characters');
    });

    it('accepts a password of exactly the minimum length', () => {
      expect(validateNewPassword('12345678')).toBeNull();
    });
  });

  describe('sanitizeResetCode', () => {
    it.each([
      ['123456', '123456'],
      ['12 34 56', '123456'],
      ['12a3b4', '1234'],
      ['1234567890', '123456'],
      ['abc', ''],
      ['', ''],
    ])('%p -> %p', (input, expected) => {
      expect(sanitizeResetCode(input)).toBe(expected);
    });
  });

  describe('validateResetCode', () => {
    it('requires a code', () => {
      expect(validateResetCode('')).toBe('Code is required');
    });

    it.each(['12345', '1234567', '12a456', 'abcdef'])('rejects %p', (code) => {
      expect(validateResetCode(code)).toBe('Enter the 6-digit code from your email');
    });

    it('accepts six digits, including leading zeros', () => {
      expect(validateResetCode('012345')).toBeNull();
    });
  });

  describe('calculatePasswordStrength', () => {
    it.each([
      ['', 0, ''],
      ['abc', 1, 'Weak'],
      ['abcdefgh', 1, 'Weak'],
      ['abcdefgh1', 2, 'Fair'],
      ['Abcdefgh1', 3, 'Good'],
      ['Abcdefgh1!', 4, 'Strong'],
      ['Sup3r$ecure!', 4, 'Strong'],
      ['abcdefghijkl', 2, 'Fair'],
    ])('%p -> %i bars, %p', (pw, strength, label) => {
      expect(calculatePasswordStrength(pw)).toEqual({ strength, label });
    });
  });

  describe('validatePasswordChange', () => {
    it('accepts a present current password and a different, valid new one', () => {
      expect(validatePasswordChange('oldpassword', 'newpassword1')).toBeNull();
    });

    it('requires the current password first', () => {
      expect(validatePasswordChange('', '')).toBe('Current password is required');
      expect(validatePasswordChange('', 'newpassword1')).toBe('Current password is required');
    });

    it('applies the same new-password rules as signup/reset', () => {
      expect(validatePasswordChange('oldpassword', '')).toBe(validateNewPassword(''));
      expect(validatePasswordChange('oldpassword', 'short')).toBe(validateNewPassword('short'));
      expect(validatePasswordChange('oldpassword', '        ')).toBe('Password is required');
    });

    it('accepts a new password of exactly the minimum length', () => {
      expect(validatePasswordChange('oldpassword', '12345678')).toBeNull();
    });

    it('rejects a new password equal to the current one (matching the backend message)', () => {
      expect(SAME_PASSWORD_MESSAGE).toBe('New password must be different from your current password');
      expect(validatePasswordChange('samepassword', 'samepassword')).toBe(SAME_PASSWORD_MESSAGE);
    });

    it('does not trim when comparing (a trailing space is a different password)', () => {
      expect(validatePasswordChange('samepassword', 'samepassword ')).toBeNull();
    });
  });
});
