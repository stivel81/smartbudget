// Merchant and line-item names come from Claude's OCR of the receipt photo
// and are often Hebrew (this is an Israeli budget app — currency is ₪).
//
// Two separate concerns:
//
// 1. Alignment (where the text block sits in its row): always the row's
//    start edge, whatever the script. Rows put the name next to the icon and
//    the amount at the end; a Hebrew name must sit where an English one does,
//    not float over to the amount. Left alone, RN aligns text "naturally"
//    (NSTextAlignmentNatural / Android's first-strong heuristic), which pushes
//    a Hebrew string to the right edge. An earlier fix made that explicit
//    (textAlign: 'right' for Hebrew), which is exactly the collision the user
//    saw. We now pin textAlign: 'left'. RN swaps left/right when the app
//    itself runs in RTL layout (I18nManager.isRTL), so 'left' is the layout's
//    start edge in both cases.
//
// 2. Base writing direction (bidi ordering inside the string): from the first
//    strong character (Unicode bidi rules P2/P3), so "רמי לוי 2" keeps its
//    number at the end and "SHUFERSAL שופרסל" is read as an LTR run with a
//    Hebrew word in it, rather than being re-ordered wholesale.
const RTL_CHAR_REGEX = /[֐-׿؀-ۿיִ-﷿ﹰ-﻿]/; // Hebrew, Arabic (+ presentation forms)
// Strong-direction letters: the RTL blocks above, or common LTR letter blocks
// (Latin, Latin-1/Extended, Greek, Cyrillic). Digits and punctuation are weak
// or neutral and never decide the direction.
const STRONG_CHAR_REGEX =
  /[֐-׿؀-ۿיִ-﷿ﹰ-﻿A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/;

/** True when the text contains any Hebrew/Arabic character. */
export function isRtlText(text: string): boolean {
  return RTL_CHAR_REGEX.test(text);
}

/** Base direction from the first strong character; 'ltr' when there is none. */
export function baseWritingDirection(text: string): 'ltr' | 'rtl' {
  const match = STRONG_CHAR_REGEX.exec(text);
  return match && RTL_CHAR_REGEX.test(match[0]) ? 'rtl' : 'ltr';
}

export interface TextDirectionStyle {
  textAlign: 'left';
  writingDirection: 'ltr' | 'rtl';
}

/**
 * Style for a name shown in a row: start-aligned always, with the base
 * writing direction taken from the text so bidi ordering is correct.
 */
export function textDirectionStyle(text: string): TextDirectionStyle {
  return { textAlign: 'left', writingDirection: baseWritingDirection(text) };
}
