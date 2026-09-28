// Pure helpers for the Profile screen.

/** Avatar initials: first two characters of the email, upper-cased; `fallback` when empty. */
export function initialsFromEmail(email: string | null | undefined, fallback = '?'): string {
  const trimmed = (email ?? '').trim();
  return trimmed ? trimmed.slice(0, 2).toUpperCase() : fallback;
}
