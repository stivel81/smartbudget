import { errorMessage, apiErrorMessage, EMAIL_NOT_CONFIRMED, isEmailNotConfirmedError } from '../../lib/errors';

describe('lib/errors — errorMessage', () => {
  it('returns an Error instance message', () => {
    expect(errorMessage(new Error('boom'), 'fallback')).toBe('boom');
  });

  it('returns the message of a plain ApiError-shaped object', () => {
    expect(errorMessage({ message: 'Invalid token', code: 401 }, 'fallback')).toBe('Invalid token');
  });

  it.each([
    ['an empty message', new Error('')],
    ['a non-string message', { message: 42 }],
    ['an object without message', { code: 500 }],
    ['a string', 'oops'],
    ['null', null],
    ['undefined', undefined],
  ])('falls back for %s', (_label, err) => {
    expect(errorMessage(err, 'fallback')).toBe('fallback');
  });
});

describe('lib/errors — apiErrorMessage', () => {
  it('returns the backend message for an ApiError (numeric HTTP code)', () => {
    expect(apiErrorMessage({ message: 'Invalid or expired code', code: 400 }, 'network')).toBe('Invalid or expired code');
  });

  it('falls back when an ApiError has no usable message', () => {
    expect(apiErrorMessage({ message: '', code: 500 }, 'network')).toBe('network');
  });

  it.each([
    ['a fetch network TypeError', new TypeError('Network request failed')],
    ['an object with a non-numeric code', { message: 'x', code: 'ECONNRESET' }],
    ['null', null],
    ['a string', 'oops'],
  ])('uses the network fallback for %s', (_label, err) => {
    expect(apiErrorMessage(err, 'network')).toBe('network');
  });
});

describe('lib/errors — isEmailNotConfirmedError', () => {
  it("matches the backend's code", () => {
    expect(EMAIL_NOT_CONFIRMED).toBe('email_not_confirmed');
    expect(isEmailNotConfirmedError({ message: 'x', code: 401, errorCode: 'email_not_confirmed' })).toBe(true);
  });

  it.each([
    ['wrong password', { message: 'Invalid email or password', code: 401 }],
    ['another error code', { message: 'x', code: 403, errorCode: 'user_banned' }],
    ['the status in errorCode', { message: 'x', code: 401, errorCode: 401 }],
    ['the code as the HTTP status field', { message: 'x', code: 'email_not_confirmed' }],
    ['only the message text', { message: 'Please verify your email before signing in' }],
    ['an explicit undefined errorCode', { message: 'x', errorCode: undefined }],
    ['a network error', new TypeError('Network request failed')],
    ['null', null],
    ['undefined', undefined],
    ['a string', 'email_not_confirmed'],
  ])('is false for %s', (_label, err) => {
    expect(isEmailNotConfirmedError(err)).toBe(false);
  });
});
