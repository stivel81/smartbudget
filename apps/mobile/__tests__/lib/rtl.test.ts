import { baseWritingDirection, isRtlText, textDirectionStyle } from '../../lib/rtl';

describe('lib/rtl', () => {
  describe('isRtlText', () => {
    it('detects Hebrew text', () => {
      expect(isRtlText('טיטניום בע"מ')).toBe(true);
    });

    it('detects Arabic text', () => {
      expect(isRtlText('مرحبا')).toBe(true);
    });

    it('returns false for English text', () => {
      expect(isRtlText('Rami Levy')).toBe(false);
    });

    it('returns false for numbers and punctuation only', () => {
      expect(isRtlText('123-45')).toBe(false);
    });

    it('returns false for an empty string', () => {
      expect(isRtlText('')).toBe(false);
    });
  });

  describe('baseWritingDirection (first strong character)', () => {
    it.each([
      ['רמי לוי', 'rtl'],
      ['مرحبا', 'rtl'],
      ['Rami Levy', 'ltr'],
      ['Café Neto', 'ltr'],
      // Mixed: whichever script comes first sets the paragraph direction.
      ['SHUFERSAL שופרסל', 'ltr'],
      ['שופרסל DEAL', 'rtl'],
      // Leading digits/punctuation are weak/neutral and are skipped.
      ['24/7 AM:PM', 'ltr'],
      ['7 - רמי לוי', 'rtl'],
      ['"רמי לוי"', 'rtl'],
      // No strong character at all.
      ['123-45', 'ltr'],
      ['', 'ltr'],
    ])('%p -> %s', (text, expected) => {
      expect(baseWritingDirection(text)).toBe(expected);
    });
  });

  describe('textDirectionStyle', () => {
    it.each(['רמי לוי', 'טיטניום בע"מ', 'Super-Sol', 'SHUFERSAL שופרסל', 'שופרסל DEAL', '12345', ''])(
      'start-aligns %p (textAlign left) whatever its script',
      (text) => {
        expect(textDirectionStyle(text).textAlign).toBe('left');
      }
    );

    it('uses an RTL base direction for Hebrew', () => {
      expect(textDirectionStyle('רמי לוי')).toEqual({ textAlign: 'left', writingDirection: 'rtl' });
    });

    it('uses an LTR base direction for English', () => {
      expect(textDirectionStyle('Super-Sol')).toEqual({ textAlign: 'left', writingDirection: 'ltr' });
    });

    it('takes the base direction of a mixed name from its first strong character', () => {
      expect(textDirectionStyle('SHUFERSAL שופרסל')).toEqual({ textAlign: 'left', writingDirection: 'ltr' });
      expect(textDirectionStyle('שופרסל DEAL')).toEqual({ textAlign: 'left', writingDirection: 'rtl' });
    });
  });
});
