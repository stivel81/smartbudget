import { getSupportEmail, supportMailtoUrl, SUPPORT_EMAIL_SUBJECT } from '../../lib/support';

describe('lib/support', () => {
  describe('getSupportEmail (injected value)', () => {
    it('returns a valid address, trimmed', () => {
      expect(getSupportEmail('help@smartbudget.app')).toBe('help@smartbudget.app');
      expect(getSupportEmail('  help@smartbudget.app  ')).toBe('help@smartbudget.app');
    });

    it.each([undefined, '', '   ', 'not-an-email', 'a@b', '@b.com'])('returns null for %p', (raw) => {
      expect(getSupportEmail(raw)).toBeNull();
    });

    it('returns null for a non-string value', () => {
      expect(getSupportEmail(42 as unknown as string)).toBeNull();
    });
  });

  describe('getSupportEmail (default reads EXPO_PUBLIC_SUPPORT_EMAIL)', () => {
    const ORIGINAL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL;

    afterEach(() => {
      if (ORIGINAL === undefined) delete process.env.EXPO_PUBLIC_SUPPORT_EMAIL;
      else process.env.EXPO_PUBLIC_SUPPORT_EMAIL = ORIGINAL;
    });

    it('uses the env var when set', () => {
      jest.isolateModules(() => {
        process.env.EXPO_PUBLIC_SUPPORT_EMAIL = 'env@smartbudget.app';
        const { getSupportEmail: fresh } = require('../../lib/support');
        expect(fresh()).toBe('env@smartbudget.app');
      });
    });

    it('returns null when the env var is unset', () => {
      jest.isolateModules(() => {
        delete process.env.EXPO_PUBLIC_SUPPORT_EMAIL;
        const { getSupportEmail: fresh } = require('../../lib/support');
        expect(fresh()).toBeNull();
      });
    });
  });

  describe('supportMailtoUrl', () => {
    it('builds a mailto: URL with an encoded default subject', () => {
      expect(SUPPORT_EMAIL_SUBJECT).toBe('SmartBudget support');
      expect(supportMailtoUrl('help@smartbudget.app')).toBe('mailto:help@smartbudget.app?subject=SmartBudget%20support');
    });

    it('encodes a custom subject', () => {
      expect(supportMailtoUrl('a@b.com', 'Delete my data & export?')).toBe(
        'mailto:a@b.com?subject=Delete%20my%20data%20%26%20export%3F'
      );
    });
  });
});
