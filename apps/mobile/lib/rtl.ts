// Merchant names come from Claude's OCR of the receipt photo and are often
// Hebrew (this is an Israeli budget app — currency is ₪). React Native's
// default text alignment is LTR regardless of content, so a Hebrew string
// in a plain Text/TextInput renders with correct in-word character order
// but anchored to the wrong side of its container — it reads right-to-left
// internally while the whole block sits flush left. Detect RTL script and
// align accordingly instead of assuming either language.
const RTL_CHAR_REGEX = /[֐-׿؀-ۿ]/; // Hebrew, Arabic blocks

export function isRtlText(text: string): boolean {
  return RTL_CHAR_REGEX.test(text);
}

export interface TextDirectionStyle {
  textAlign: 'left' | 'right';
  writingDirection: 'ltr' | 'rtl';
}

export function textDirectionStyle(text: string): TextDirectionStyle {
  return isRtlText(text)
    ? { textAlign: 'right', writingDirection: 'rtl' }
    : { textAlign: 'left', writingDirection: 'ltr' };
}
