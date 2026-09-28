import { initialsFromEmail } from '../../lib/profile';

describe('lib/profile — initialsFromEmail', () => {
  it('upper-cases the first two characters', () => {
    expect(initialsFromEmail('adrian@example.com')).toBe('AD');
  });

  it('ignores surrounding whitespace', () => {
    expect(initialsFromEmail('  bo@example.com')).toBe('BO');
  });

  it('handles a one-character email', () => {
    expect(initialsFromEmail('x')).toBe('X');
  });

  it.each([null, undefined, '', '   '])('returns "?" for %p', (email) => {
    expect(initialsFromEmail(email)).toBe('?');
  });

  it('accepts a custom fallback', () => {
    expect(initialsFromEmail(null, 'U')).toBe('U');
  });
});
