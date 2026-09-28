// Pure helpers for showing who is signed in (Dashboard avatar/greeting, Profile card).

/** Avatar initials: first two characters of the email, upper-cased; `fallback` when empty. */
export function initialsFromEmail(email: string | null | undefined, fallback = '?'): string {
  const trimmed = (email ?? '').trim();
  return trimmed ? trimmed.slice(0, 2).toUpperCase() : fallback;
}

/** Whitespace-separated words of a name (any Unicode whitespace; empty for blank/missing). */
function nameWords(name: string | null | undefined): string[] {
  return (name ?? '').trim().split(/\s+/).filter(Boolean);
}

/**
 * First character of a word by code point (so astral characters aren't split
 * in half), upper-cased — unless upper-casing would change its length
 * ("ß" -> "SS"), in which case it's kept as is.
 */
function initialOf(word: string): string {
  const char = Array.from(word)[0];
  const upper = char.toUpperCase();
  return upper.length === char.length ? upper : char;
}

/**
 * Avatar initials. From the name: first letters of its first and last words
 * ("Adrian Schtivelmager" -> "AS", "Mary Ann Smith" -> "MS"), or one letter for
 * a single-word name ("Cher" -> "C"). Works for scripts without case (Hebrew
 * "אדריאן שטיבלמגר" -> "אש"). Without a name, falls back to the email
 * (initialsFromEmail), then "?".
 */
export function initialsFor(name?: string | null, email?: string | null): string {
  const words = nameWords(name);
  if (words.length === 0) return initialsFromEmail(email);
  const first = initialOf(words[0]);
  const last = words.length > 1 ? initialOf(words[words.length - 1]) : '';
  return first + last;
}

/** First word of the name ("Adrian Schtivelmager" -> "Adrian"); null when there's no name. */
export function firstNameOf(name?: string | null): string | null {
  const words = nameWords(name);
  return words.length ? words[0] : null;
}
