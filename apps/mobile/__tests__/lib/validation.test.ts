import {
  MIN_PASSWORD_LENGTH,
  OTP_CODE_LENGTH,
  OTP_RESEND_COOLDOWN_SECONDS,
  isValidEmail,
  validateEmail,
  validateNewPassword,
  sanitizeOtpCode,
  validateOtpCode,
  calculatePasswordStrength,
  passwordStrengthTone,
  validatePasswordChange,
  SAME_PASSWORD_MESSAGE,
} from '../../lib/validation';

describe('lib/validation', () => {
  it('matches the backend rules (8-char passwords, 6-digit codes)', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(OTP_CODE_LENGTH).toBe(6);
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

  describe('sanitizeOtpCode', () => {
    it.each([
      ['123456', '123456'],
      ['12 34 56', '123456'],
      ['12a3b4', '1234'],
      ['1234567890', '123456'],
      ['abc', ''],
      ['', ''],
      ['１２３４５６', ''], // full-width digits are not accepted by the backend either
      ['٣٤٥', ''], // Arabic-Indic digits
      ['Your code is 482913.', '482913'], // pasted from the email
      [' 048 291 ', '048291'], // keeps leading zeros
    ])('%p -> %p', (input, expected) => {
      expect(sanitizeOtpCode(input)).toBe(expected);
    });
  });

  describe('validateOtpCode', () => {
    it('requires a code', () => {
      expect(validateOtpCode('')).toBe('Code is required');
    });

    it.each(['12345', '1234567', '12a456', 'abcdef', ' 12345', '１２３４５６'])('rejects %p', (code) => {
      expect(validateOtpCode(code)).toBe('Enter the 6-digit code from your email');
    });

    it('accepts six digits, including leading zeros', () => {
      expect(validateOtpCode('012345')).toBeNull();
    });
  });

  describe('OTP constants', () => {
    it("resend cooldown matches Supabase's 60s per-user email window", () => {
      expect(OTP_RESEND_COOLDOWN_SECONDS).toBe(60);
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

  describe('passwordStrengthTone', () => {
    it.each([
      ['', 'none'],
      ['Weak', 'danger'],
      ['Fair', 'warning'],
      ['Good', 'success'],
      ['Strong', 'success'],
    ] as const)('%p -> %s', (label, tone) => {
      expect(passwordStrengthTone(label)).toBe(tone);
    });

    it('maps every computed strength to its tone', () => {
      expect(passwordStrengthTone(calculatePasswordStrength('abc').label)).toBe('danger');
      expect(passwordStrengthTone(calculatePasswordStrength('abcdefgh1').label)).toBe('warning');
      expect(passwordStrengthTone(calculatePasswordStrength('Abcdefgh1').label)).toBe('success');
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
