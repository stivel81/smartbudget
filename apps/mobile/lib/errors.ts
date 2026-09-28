// Pure helper for turning a thrown value into user-facing Alert text.

/**
 * The thrown value's `message` when it is a non-empty string, else `fallback`.
 * Covers both `Error` instances and the plain `ApiError` objects lib/api throws.
 */
export function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const { message } = err as { message: unknown };
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}

/**
 * Message for a failed backend call. lib/api throws `{ message, code }`
 * where `code` is the HTTP status — those messages come from the backend
 * and are meant for the user. Anything else (e.g. fetch's
 * "TypeError: Network request failed") is a transport failure, so show
 * `networkFallback` instead of a raw technical string.
 */
export function apiErrorMessage(err: unknown, networkFallback: string): string {
  if (err && typeof err === 'object' && typeof (err as { code?: unknown }).code === 'number') {
    return errorMessage(err, networkFallback);
  }
  return networkFallback;
}
