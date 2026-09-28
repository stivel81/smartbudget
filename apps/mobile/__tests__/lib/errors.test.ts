import { errorMessage } from '../../lib/errors';

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
