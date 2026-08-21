import { isRtlText, textDirectionStyle } from '../../lib/rtl';

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

  describe('textDirectionStyle', () => {
    it('right-aligns RTL text', () => {
      expect(textDirectionStyle('טיטניום בע"מ')).toEqual({
        textAlign: 'right',
        writingDirection: 'rtl',
      });
    });

    it('left-aligns LTR text', () => {
      expect(textDirectionStyle('Super-Sol')).toEqual({
        textAlign: 'left',
        writingDirection: 'ltr',
      });
    });
  });
});
