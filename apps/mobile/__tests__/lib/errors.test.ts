import { errorMessage, apiErrorMessage } from '../../lib/errors';

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
