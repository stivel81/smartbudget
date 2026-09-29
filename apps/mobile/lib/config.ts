// Build-time configuration, resolved once at startup. Pure (no imports), so
// lib/api can use it without require cycles and tests can call it directly.
//
// EXPO_PUBLIC_* values are inlined into the JS bundle when it is built
// (Metro locally, EAS Build per profile in eas.json), so a wrong value is
// fixed by rebuilding, never at runtime.

/** Where local development reaches the backend (Metro + Simulator / Maestro). */
export const DEV_API_BASE_URL = 'http://localhost:3000';

export const API_BASE_URL_ENV = 'EXPO_PUBLIC_API_BASE_URL';

/** Marks the not-yet-real URLs in eas.json; a build carrying one must not start. */
export const PLACEHOLDER_MARKER = 'REPLACE_ME';

export type ApiBaseUrlResult = { ok: true; url: string } | { ok: false; error: string };

// scheme://host[:port][/path] — host is a name/IPv4 or a bracketed IPv6.
// No credentials, query or fragment: request paths are appended verbatim.
const ABSOLUTE_HTTP_URL = /^https?:\/\/(?:[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?|\[[0-9A-Fa-f:.]+\])(?::\d{1,5})?(?:\/[^\s?#]*)?$/i;

/**
 * The backend base URL from the raw env value. Unset or blank falls back to
 * DEV_API_BASE_URL only in development (`isDev`, i.e. __DEV__); in any other
 * build it is an error, as is a value that isn't an absolute http(s) URL
 * (also in development: a set-but-wrong value is never silently replaced).
 * Surrounding whitespace and trailing slashes are removed.
 */
export function resolveApiBaseUrl(raw: string | undefined, isDev: boolean): ApiBaseUrlResult {
  const value = (raw ?? '').trim();
  if (!value) {
    if (isDev) return { ok: true, url: DEV_API_BASE_URL };
    return {
      ok: false,
      error: `${API_BASE_URL_ENV} is not set. This build has no backend address; set it for the EAS build profile (eas.json) and rebuild.`,
    };
  }
  if (value.includes(PLACEHOLDER_MARKER)) {
    return {
      ok: false,
      error: `${API_BASE_URL_ENV} is still the placeholder "${value}". Put the real backend URL in eas.json and rebuild.`,
    };
  }
  const url = value.replace(/\/+$/, '');
  if (!ABSOLUTE_HTTP_URL.test(url)) {
    return {
      ok: false,
      error: `${API_BASE_URL_ENV} must be an absolute http(s) URL such as https://api.example.com (got "${value}").`,
    };
  }
  return { ok: true, url };
}
