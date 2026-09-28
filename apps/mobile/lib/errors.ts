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
