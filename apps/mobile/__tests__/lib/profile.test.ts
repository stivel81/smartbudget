import { initialsFromEmail, initialsFor, firstNameOf } from '../../lib/profile';

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

describe('lib/profile — initialsFor(name, email)', () => {
  describe('from the name', () => {
    it.each([
      ['Adrian Schtivelmager', 'AS'],
      ['adrian schtivelmager', 'AS'], // upper-cased
      ['Mary Ann Smith', 'MS'], // first + last word, middle ignored
      ['Jean-Luc Picard', 'JP'], // hyphenated first name is one word
      ["Conan O'Brien", 'CO'],
      ['Ada', 'A'], // single name -> one letter
      ['  Adrian   Schtivelmager  ', 'AS'], // extra spaces
      ['Adrian\tSchtivelmager', 'AS'], // tab
      ['Adrian\u00a0Schtivelmager', 'AS'], // non-breaking space
      ['Adrian\u3000Schtivelmager', 'AS'], // ideographic space
      ['אדריאן שטיבלמגר', 'אש'], // Hebrew (no case)
      ['שָׁלוֹם עֲלֵיכֶם', 'שע'], // Hebrew with niqqud: base letters only
      ['Ólafur Ragnar', 'ÓR'],
      ['élodie durand', 'ÉD'],
      ['Иван Петров', 'ИП'], // Cyrillic
      ['Σωκράτης', 'Σ'], // Greek single name
      ['山田 太郎', '山太'], // CJK
      ['𝒜da 𝒮mith', '𝒜𝒮'], // astral code points are not split in half
      ['straße', 'S'],
      ['ßtraße Weg', 'ßW'], // "ß" would upper-case to "SS": kept as is
    ])('%p -> %p', (name, expected) => {
      expect(initialsFor(name, 'stivel@gmail.com')).toBe(expected);
    });

    it('prefers the name over the email', () => {
      expect(initialsFor('Adrian Schtivelmager', 'stivel@gmail.com')).toBe('AS');
    });

    it('never returns more than two characters', () => {
      expect(Array.from(initialsFor('A B C D E F', null))).toHaveLength(2);
    });
  });

  describe('falls back to the email', () => {
    it.each([null, undefined, '', '   ', '\t\n'])('when the name is %p', (name) => {
      expect(initialsFor(name, 'stivel@gmail.com')).toBe('ST');
    });

    it('when no name argument is given at all', () => {
      expect(initialsFor(undefined, '  bo@example.com')).toBe('BO');
    });
  });

  describe('then to "?"', () => {
    it.each([
      [null, null],
      [undefined, undefined],
      ['', ''],
      ['  ', '  '],
    ])('name %p, email %p -> "?"', (name, email) => {
      expect(initialsFor(name, email)).toBe('?');
    });

    it('with no arguments', () => {
      expect(initialsFor()).toBe('?');
    });
  });
});

describe('lib/profile — firstNameOf', () => {
  it.each([
    ['Adrian Schtivelmager', 'Adrian'],
    ['  Adrian   Schtivelmager ', 'Adrian'],
    ['Ada', 'Ada'],
    ['אדריאן שטיבלמגר', 'אדריאן'],
    ['Jean-Luc Picard', 'Jean-Luc'],
    ['adrian', 'adrian'], // not re-cased: shown as the user typed it
  ])('%p -> %p', (name, expected) => {
    expect(firstNameOf(name)).toBe(expected);
  });

  it.each([null, undefined, '', '   '])('%p -> null', (name) => {
    expect(firstNameOf(name)).toBeNull();
  });

  it('returns null with no argument', () => {
    expect(firstNameOf()).toBeNull();
  });
});
