import { resolveApiBaseUrl } from './config';

// Backend base URL (no trailing slash), from EXPO_PUBLIC_API_BASE_URL; in
// development it falls back to http://localhost:3000 (see lib/config). The
// static `process.env.EXPO_PUBLIC_...` access is required: Expo inlines only
// that exact form into the bundle.
const apiBaseUrl = resolveApiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL, __DEV__);

/** The resolved backend URL, or '' when the build is misconfigured (see API_CONFIG_ERROR). */
export const API_BASE_URL: string = apiBaseUrl.ok ? apiBaseUrl.url : '';

/**
 * Why this build can't reach the backend (EXPO_PUBLIC_API_BASE_URL missing
 * outside development, or invalid), else null. App shows it on a startup
 * error screen, and every request rejects with it instead of going anywhere.
 */
export const API_CONFIG_ERROR: string | null = apiBaseUrl.ok ? null : apiBaseUrl.error;

/** Absolute URL of a backend route; throws the config error (as an ApiError) when misconfigured. */
function apiUrl(path: string): string {
  if (API_CONFIG_ERROR !== null) throw { message: API_CONFIG_ERROR } as ApiError;
  return `${API_BASE_URL}${path}`;
}

export { RECEIPT_CATEGORIES } from './categories';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  session: {
    access_token: string;
    refresh_token: string;
    /** Access-token expiry, unix seconds (absent/null from an older backend). */
    expires_at?: number | null;
    /** Access-token lifetime in seconds (absent/null from an older backend). */
    expires_in?: number | null;
    user: {
      id: string;
      email: string;
      /** Display name from signup (null/absent when none, or from an older backend). */
      name?: string | null;
    };
  };
}

export interface SignupRequest {
  email: string;
  password: string;
  name: string;
}

export interface SignupResponse {
  user: {
    id: string;
    email: string;
  };
}

export interface ApiError {
  message: string;
  /** HTTP status. */
  code?: number | string;
  /** Machine-readable backend error code, when the backend sends one (e.g. 'email_not_confirmed'). */
  errorCode?: string;
}

// ---------------------------------------------------------------------------
// Authenticated requests
//
// Every call that needs the user's access token goes through authedRequest
// (below). It gets the token from an injected AccessTokenProvider — App.tsx
// wires in lib/session's manager — instead of taking it from each caller, so
// screens never deal with expiry: on a 401 the provider renews the session
// once (single-flight across concurrent calls) and the request is retried
// once with the new token. Injected rather than imported so this module
// depends on nothing in lib/ (no require cycles).
// ---------------------------------------------------------------------------

export interface AccessTokenProvider {
  /** A usable access token (renewed first when it is about to expire), or null when signed out. */
  getAccessToken(): Promise<string | null>;
  /**
   * `rejectedToken` got a 401: resolve a renewed token to retry with, or
   * null when the session can't be renewed (the provider signs the user out
   * itself when the refresh token is dead). Rejects when renewal failed
   * transiently (offline, 429, 5xx): that error is what the call rejects
   * with — retryable, and the session is kept.
   */
  refreshAfterUnauthorized(rejectedToken: string): Promise<string | null>;
}

let accessTokenProvider: AccessTokenProvider | null = null;

/** Install (App mount) or remove (App unmount, tests) the source of access tokens. */
export function setAccessTokenProvider(provider: AccessTokenProvider | null): void {
  accessTokenProvider = provider;
}

/** Shown on Login after the session could not be renewed, and thrown by authed calls made while signed out. */
export const SESSION_EXPIRED_MESSAGE = 'Your session expired, please sign in again';

/** The only place an Authorization header is built. */
function bearerHeaders(accessToken: string, json: boolean): Record<string, string> {
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${accessToken}`,
  };
}

/** ApiError for a non-2xx response: the backend's `error` text (or `fallback`) plus the HTTP status. */
async function toApiError(response: Response, fallback: string): Promise<ApiError> {
  let body: { error?: unknown } = {};
  try {
    body = (await response.json()) ?? {};
  } catch {
    // Non-JSON error body (proxy page, empty 502...): use the fallback.
  }
  return {
    message: typeof body.error === 'string' && body.error ? body.error : fallback,
    code: response.status,
  };
}

interface AuthedRequestInit {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** JSON-serialized as the request body (and sets Content-Type). */
  body?: unknown;
}

/**
 * fetch() an authenticated backend route. 401 -> renew the session once and
 * retry once; a second 401, or no renewed token, is returned as is; a
 * transient renewal failure rejects with its own (retryable) error. Other
 * statuses are never retried.
 */
async function authedFetch(path: string, init: AuthedRequestInit): Promise<Response> {
  const token = accessTokenProvider ? await accessTokenProvider.getAccessToken() : null;
  if (!token) {
    throw { message: SESSION_EXPIRED_MESSAGE, code: 401 } as ApiError;
  }

  const hasBody = init.body !== undefined;
  const send = (accessToken: string) =>
    fetch(apiUrl(path), {
      ...(init.method && init.method !== 'GET' ? { method: init.method } : {}),
      headers: bearerHeaders(accessToken, hasBody),
      ...(hasBody ? { body: JSON.stringify(init.body) } : {}),
    });

  const response = await send(token);
  if (response.status !== 401 || !accessTokenProvider) return response;

  const renewed = await accessTokenProvider.refreshAfterUnauthorized(token);
  return renewed ? send(renewed) : response;
}

/** authedFetch, then the JSON body on 2xx or a thrown ApiError (backend message or `fallback`). */
async function authedRequest<T>(path: string, init: AuthedRequestInit, fallback: string): Promise<T> {
  const response = await authedFetch(path, init);
  if (!response.ok) throw await toApiError(response, fallback);
  return response.json();
}

/** authedFetch for routes whose success body is ignored. */
async function authedRequestNoContent(path: string, init: AuthedRequestInit, fallback: string): Promise<void> {
  const response = await authedFetch(path, init);
  if (!response.ok) throw await toApiError(response, fallback);
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await fetch(apiUrl(`/api/v1/auth/login`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const error = await response.json();
    const apiError: ApiError = {
      message: error.error || 'Invalid credentials',
      code: response.status,
    };
    if (typeof error.code === 'string') apiError.errorCode = error.code;
    throw apiError;
  }

  return response.json();
}

export async function refreshSession(refreshToken: string): Promise<LoginResponse> {
  const response = await fetch(apiUrl(`/api/v1/auth/refresh`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  // Always carries the HTTP status, even for a non-JSON body (proxy page,
  // empty 502): lib/session tells a dead token (401) from a temporary
  // failure by that code alone.
  if (!response.ok) throw await toApiError(response, 'Session expired');

  return response.json();
}

export interface ReceiptExtraction {
  merchant: string;
  total: number;
  /** ISO "YYYY-MM-DD" (null when the receipt had no legible date; older rows may hold other strings). */
  date: string | null;
  items: { name: string; amount: number; category: string }[];
}

export interface Receipt {
  id: string;
  user_id: string;
  raw_response: ReceiptExtraction;
  created_at: string;
  image_path: string | null;
}

/** An existing receipt the backend thinks a new/edited one duplicates. */
export interface DuplicateReceipt {
  id: string;
  merchant: string;
  date: string;
  total: number;
}

/** Response of POST /receipts/scan and PATCH /receipts/:id. */
export interface ScanReceiptResponse {
  receipt: Receipt;
  /**
   * Set when the receipt looks like one the user already has. Absent from an
   * older backend (treat like null).
   */
  duplicate_of?: DuplicateReceipt | null;
}

export interface GetReceiptsResponse {
  receipts: Receipt[];
}

export function scanReceipt(
  base64Image: string,
  mediaType: 'image/jpeg' | 'image/png'
): Promise<ScanReceiptResponse> {
  return authedRequest(
    '/api/v1/receipts/scan',
    { method: 'POST', body: { image: base64Image, mediaType } },
    'Failed to scan receipt'
  );
}

export function getReceipts(): Promise<GetReceiptsResponse> {
  return authedRequest('/api/v1/receipts', {}, 'Failed to load receipts');
}

/**
 * Re-categorize one line item: raw_response.items[index].category = category.
 * `category` is a NAME: a base one or one of the user's custom categories.
 */
export interface ItemCategoryUpdate {
  index: number;
  category: string;
}

export interface ReceiptUpdates {
  merchant?: string;
  total?: number;
  /** ISO "YYYY-MM-DD" or day-first "DD/MM/YYYY"; the backend stores ISO. */
  date?: string;
  items?: ItemCategoryUpdate[];
}

export function updateReceipt(id: string, updates: ReceiptUpdates): Promise<ScanReceiptResponse> {
  return authedRequest(`/api/v1/receipts/${id}`, { method: 'PATCH', body: updates }, 'Failed to update receipt');
}

/** Change line-item categories on a saved receipt (PATCH items). Resolves with the updated receipt. */
export function updateItemCategories(id: string, items: ItemCategoryUpdate[]): Promise<ScanReceiptResponse> {
  return updateReceipt(id, { items });
}

export async function getReceiptImageUrl(id: string): Promise<string> {
  const { url } = await authedRequest<{ url: string }>(
    `/api/v1/receipts/${id}/image-url`,
    {},
    'Failed to load receipt image'
  );
  return url;
}

export function deleteReceipt(id: string): Promise<void> {
  return authedRequestNoContent(`/api/v1/receipts/${id}`, { method: 'DELETE' }, 'Failed to delete receipt');
}

export interface Budget {
  id: string;
  user_id: string;
  /** The category's name (base or custom). */
  category: string;
  /** The category's id (absent from an older backend). */
  category_id?: string | null;
  monthly_limit: number;
  created_at: string;
  updated_at: string;
}

export interface GetBudgetsResponse {
  budgets: Budget[];
}

export interface UpsertBudgetResponse {
  budget: Budget;
}

export function getBudgets(): Promise<GetBudgetsResponse> {
  return authedRequest('/api/v1/budgets', {}, 'Failed to load budgets');
}

/** Which category a budget is for: its id (preferred) or, for older callers, its name. */
export type BudgetCategoryRef = string | { categoryId: string };

/**
 * Create or replace the monthly limit for one category. Pass
 * `{ categoryId }` (works for base and custom categories); a plain string is
 * sent as the category name.
 */
export function upsertBudget(category: BudgetCategoryRef, monthlyLimit: number): Promise<UpsertBudgetResponse> {
  const body =
    typeof category === 'string'
      ? { category, monthlyLimit }
      : { category_id: category.categoryId, monthlyLimit };
  return authedRequest('/api/v1/budgets', { method: 'POST', body }, 'Failed to save budget');
}

export function deleteBudget(id: string): Promise<void> {
  return authedRequestNoContent(`/api/v1/budgets/${id}`, { method: 'DELETE' }, 'Failed to delete budget');
}

// ---------------------------------------------------------------------------
// Spending categories (base + the user's custom ones)
//
// Errors are ApiError with `code` = HTTP status:
//   400 validation (name 1-30 chars after trim, color #RRGGBB, icon 1-64 chars)
//   403 a built-in (base) category can't be changed or deleted
//   404 not one of your categories
//   409 the name clashes (case-insensitively) with a base or one of yours
// lib/categories' categoryErrorMessage turns these into UI text.
// ---------------------------------------------------------------------------

export interface Category {
  id: string;
  /** Null for the built-in (base) categories. */
  user_id: string | null;
  name: string;
  /** MaterialCommunityIcons name; null when the user picked none. */
  icon: string | null;
  /** "#RRGGBB"; null when the user picked none. */
  color: string | null;
  is_base: boolean;
  created_at: string;
  updated_at: string;
}

export interface CategoryInput {
  name: string;
  icon?: string | null;
  color?: string | null;
}

/** PATCH body: any of name / icon / color. */
export type CategoryUpdate = Partial<CategoryInput>;

export interface GetCategoriesResponse {
  /** Base categories first, then the user's own. */
  categories: Category[];
}

export interface CategoryResponse {
  category: Category;
}

export function getCategories(): Promise<GetCategoriesResponse> {
  return authedRequest('/api/v1/categories', {}, 'Failed to load categories');
}

export function createCategory(input: CategoryInput): Promise<CategoryResponse> {
  return authedRequest('/api/v1/categories', { method: 'POST', body: input }, 'Failed to create category');
}

export function updateCategory(id: string, updates: CategoryUpdate): Promise<CategoryResponse> {
  return authedRequest(
    `/api/v1/categories/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: updates },
    'Failed to update category'
  );
}

/** Deletes one of your categories; the server moves its items to "Other" and removes its budget. */
export function deleteCategory(id: string): Promise<void> {
  return authedRequestNoContent(
    `/api/v1/categories/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    'Failed to delete category'
  );
}

export interface LogoutTokens {
  accessToken: string | null;
  refreshToken: string | null;
}

/**
 * Revoke the session server-side. Sends both tokens as they are — no
 * renewal/retry (renewing just to sign out would be wasteful, and the
 * session manager is already detached by then): the backend revokes via the
 * refresh token when the access token has expired, and answers 200 whenever
 * a token is given. Resolves without a request when there is no token.
 */
export async function logout({ accessToken, refreshToken }: LogoutTokens): Promise<void> {
  if (!accessToken && !refreshToken) return;
  const response = await fetch(apiUrl(`/api/v1/auth/logout`), {
    method: 'POST',
    headers: accessToken ? bearerHeaders(accessToken, true) : { 'Content-Type': 'application/json' },
    body: JSON.stringify(refreshToken ? { refresh_token: refreshToken } : {}),
  });

  if (!response.ok) throw await toApiError(response, 'Failed to sign out');
}

export async function signup(
  email: string,
  password: string,
  name: string
): Promise<SignupResponse> {
  const response = await fetch(apiUrl(`/api/v1/auth/signup`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password, name }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw {
      message: error.error || 'Signup failed',
      code: response.status,
    } as ApiError;
  }

  return response.json();
}

export interface ForgotPasswordResponse {
  message: string;
}

/**
 * Ask the backend to email a 6-digit reset code. The backend answers the
 * same generic 200 whether or not the account exists, so success here does
 * not mean the email is registered.
 */
export async function requestPasswordReset(email: string): Promise<ForgotPasswordResponse> {
  const response = await fetch(apiUrl(`/api/v1/auth/forgot-password`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw {
      message: error.error || 'Could not send reset code',
      code: response.status,
    } as ApiError;
  }

  return response.json();
}

/**
 * Redeem the emailed code and set a new password. Resolves with a fresh
 * session in the same shape as login(), so the caller can sign straight in.
 */
export async function resetPassword(
  email: string,
  code: string,
  newPassword: string
): Promise<LoginResponse> {
  const response = await fetch(apiUrl(`/api/v1/auth/reset-password`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, code, newPassword }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw {
      message: error.error || 'Could not reset password',
      code: response.status,
    } as ApiError;
  }

  return response.json();
}

export interface ChangePasswordResponse {
  message: string;
}

/**
 * Change the signed-in user's password. The backend verifies
 * `currentPassword` first; a wrong one rejects with code 400 and the
 * message "Current password is incorrect". The current session stays valid.
 * (A 400 is never treated as an expired session — only 401 triggers renewal.)
 */
export function changePassword(currentPassword: string, newPassword: string): Promise<ChangePasswordResponse> {
  return authedRequest(
    '/api/v1/auth/change-password',
    { method: 'POST', body: { currentPassword, newPassword } },
    'Could not change password'
  );
}

export interface ResendSignupResponse {
  message: string;
}

/**
 * Confirm a new account with the 6-digit code from the signup email.
 * Resolves with a session in the same shape as login(), so the caller can
 * sign straight in. A wrong/expired code rejects with code 400.
 */
export async function verifySignup(email: string, code: string): Promise<LoginResponse> {
  const response = await fetch(apiUrl(`/api/v1/auth/verify-signup`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, code }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw {
      message: error.error || 'Could not verify your email',
      code: response.status,
    } as ApiError;
  }

  return response.json();
}

/**
 * Ask the backend to email a fresh signup code. The backend answers the same
 * generic 200 whatever the account's state, so success does not mean an
 * email was actually sent.
 */
export async function resendSignupCode(email: string): Promise<ResendSignupResponse> {
  const response = await fetch(apiUrl(`/api/v1/auth/resend-signup`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw {
      message: error.error || 'Could not send a new code',
      code: response.status,
    } as ApiError;
  }

  return response.json();
}
