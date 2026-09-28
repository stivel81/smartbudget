import { CURRENCY_SYMBOL, formatCurrency, parseAmountInput } from '../../lib/currency';

describe('lib/currency', () => {
  describe('formatCurrency', () => {
    it('uses the shekel symbol', () => {
      expect(CURRENCY_SYMBOL).toBe('₪');
    });

    it.each([
      [0, '₪0'],
      [5, '₪5'],
      [999, '₪999'],
      [1000, '₪1,000'],
      [1673, '₪1,673'],
      [2847, '₪2,847'],
      [4200, '₪4,200'],
      [12345, '₪12,345'],
      [123456, '₪123,456'],
      [1234567, '₪1,234,567'],
      [1000000000, '₪1,000,000,000'],
    ])('formats %p as %p with thousands separators (no decimals by default)', (amount, expected) => {
      expect(formatCurrency(amount)).toBe(expected);
    });

    it.each([
      [0, '₪0.00'],
      [12.5, '₪12.50'],
      [1234.5, '₪1,234.50'],
      [1234.567, '₪1,234.57'],
      [0.1 + 0.2, '₪0.30'],
      [999999.995, '₪1,000,000.00'],
    ])('formats %p with 2 decimals as %p', (amount, expected) => {
      expect(formatCurrency(amount, { decimals: 2 })).toBe(expected);
    });

    describe('rounding is half away from zero, consistently', () => {
      it.each([
        [0.5, '₪1'],
        [1.5, '₪2'],
        [2.5, '₪3'],
        [2.4999, '₪2'],
        [999.5, '₪1,000'],
        [-0.5, '-₪1'],
        [-2.5, '-₪3'],
        [-2.4, '-₪2'],
      ])('%p → %p', (amount, expected) => {
        expect(formatCurrency(amount)).toBe(expected);
      });

      it('rounds binary artefacts the way people expect (1.005 → 1.01, not 1.00)', () => {
        // (1.005).toFixed(2) === '1.00' — the bug this guards against.
        expect(formatCurrency(1.005, { decimals: 2 })).toBe('₪1.01');
        expect(formatCurrency(-1.005, { decimals: 2 })).toBe('-₪1.01');
        expect(formatCurrency(8.345, { decimals: 2 })).toBe('₪8.35');
      });
    });

    describe('negative values', () => {
      it.each([
        [-50, '-₪50'],
        [-1000, '-₪1,000'],
        [-1234.5, '-₪1,235'],
      ])('puts the sign before the symbol: %p → %p', (amount, expected) => {
        expect(formatCurrency(amount)).toBe(expected);
      });

      it('keeps the sign with decimals', () => {
        expect(formatCurrency(-12.34, { decimals: 2 })).toBe('-₪12.34');
      });

      it('never prints negative zero', () => {
        expect(formatCurrency(-0)).toBe('₪0');
        expect(formatCurrency(-0.4)).toBe('₪0');
        expect(formatCurrency(-0.004, { decimals: 2 })).toBe('₪0.00');
        // String(1e-7) is "1e-7" (exponent form) — must still round to zero.
        expect(formatCurrency(-1e-7, { decimals: 2 })).toBe('₪0.00');
        expect(formatCurrency(-1e-7)).toBe('₪0');
      });

      it('rounds tiny exponent-form amounts that are not zero', () => {
        expect(formatCurrency(5e-7, { decimals: 6 })).toBe('₪0.000001');
      });
    });

    describe('non-finite / invalid input never produces ₪NaN or ₪Infinity', () => {
      it.each([NaN, Infinity, -Infinity])('%p formats as zero', (amount) => {
        expect(formatCurrency(amount)).toBe('₪0');
        expect(formatCurrency(amount, { decimals: 2 })).toBe('₪0.00');
      });

      it.each([undefined, null, '12', {}])('non-number %p formats as zero', (amount) => {
        expect(formatCurrency(amount as unknown as number)).toBe('₪0');
      });
    });

    describe('decimals option', () => {
      it('defaults to 0 when omitted or options are empty', () => {
        expect(formatCurrency(12.7)).toBe('₪13');
        expect(formatCurrency(12.7, {})).toBe('₪13');
      });

      it('supports other precisions', () => {
        expect(formatCurrency(1234.5678, { decimals: 1 })).toBe('₪1,234.6');
        expect(formatCurrency(1234.5678, { decimals: 3 })).toBe('₪1,234.568');
      });

      it.each([
        [-1, '₪13'],
        [NaN, '₪13'],
        [Infinity, '₪13'],
        [2.9, '₪12.70'],
        [50, '₪12.7000000000'],
      ])('normalizes decimals=%p', (decimals, expected) => {
        expect(formatCurrency(12.7, { decimals })).toBe(expected);
      });
    });

    it('does not group digits after the decimal point', () => {
      expect(formatCurrency(0.123456, { decimals: 6 })).toBe('₪0.123456');
    });

    it('handles very large amounts without throwing', () => {
      expect(formatCurrency(1e15)).toBe('₪1,000,000,000,000,000');
      expect(formatCurrency(1e21)).toBe('₪1e+21');
      expect(formatCurrency(-1e21)).toBe('-₪1e+21');
      expect(formatCurrency(1e300, { decimals: 10 })).toBe('₪1e+300');
    });
  });

  describe('parseAmountInput', () => {
    it.each([
      ['100', 100],
      ['100.00', 100],
      ['42.5', 42.5],
      ['.5', 0.5],
      ['0', 0],
      ['  18  ', 18],
      ['1,234', 1234],
      ['1,234.50', 1234.5],
      ['1,000,000', 1000000],
      ['₪12.50', 12.5],
      ['₪ 1,234.50', 1234.5],
      [' ₪1,000 ', 1000],
    ])('parses %p as %p', (text, expected) => {
      expect(parseAmountInput(text)).toBe(expected);
    });

    it('round-trips formatCurrency output', () => {
      for (const amount of [0, 5, 12.5, 1234.5, 999999.99, 2847]) {
        expect(parseAmountInput(formatCurrency(amount, { decimals: 2 }))).toBe(amount);
      }
    });

    it.each([
      '',
      '   ',
      '₪',
      'abc',
      'NaN',
      'Infinity',
      '-1',
      '-₪5',
      '1e3',
      '1,5',
      '12,34',
      '1,2345',
      ',123',
      '1.2.3',
      '1.',
      '12 34',
      '$12',
    ])('rejects %p with NaN', (text) => {
      expect(parseAmountInput(text)).toBeNaN();
    });

    it('rejects non-strings', () => {
      expect(parseAmountInput(undefined as unknown as string)).toBeNaN();
      expect(parseAmountInput(12 as unknown as string)).toBeNaN();
    });
  });
});
