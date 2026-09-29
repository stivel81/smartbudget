// API base URL for backend communication
export const API_BASE_URL = 'http://localhost:3000';

export { RECEIPT_CATEGORIES } from './categories';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  session: {
    access_token: string;
    refresh_token: string;
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

export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
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
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw {
      message: error.error || 'Session expired',
      code: response.status,
    } as ApiError;
  }

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

export interface ScanReceiptResponse {
  receipt: Receipt;
}

export interface GetReceiptsResponse {
  receipts: Receipt[];
}

export async function scanReceipt(
  base64Image: string,
  mediaType: 'image/jpeg' | 'image/png',
  accessToken: string
): Promise<ScanReceiptResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/receipts/scan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ image: base64Image, mediaType }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw {
      message: error.error || 'Failed to scan receipt',
      code: response.status,
    } as ApiError;
  }

  return response.json();
}

export async function getReceipts(accessToken: string): Promise<GetReceiptsResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/receipts`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw {
      message: error.error || 'Failed to load receipts',
      code: response.status,
    } as ApiError;
  }

  return response.json();
}

/** Re-categorize one line item: raw_response.items[index].category = category. */
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

export async function updateReceipt(
  id: string,
  updates: ReceiptUpdates,
  accessToken: string
): Promise<ScanReceiptResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/receipts/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const error = await response.json();
    throw {
      message: error.error || 'Failed to update receipt',
      code: response.status,
    } as ApiError;
  }

  return response.json();
}

/** Change line-item categories on a saved receipt (PATCH items). Resolves with the updated receipt. */
export function updateItemCategories(
  id: string,
  items: ItemCategoryUpdate[],
  accessToken: string
): Promise<ScanReceiptResponse> {
  return updateReceipt(id, { items }, accessToken);
}

export async function getReceiptImageUrl(id: string, accessToken: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/v1/receipts/${id}/image-url`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw {
      message: error.error || 'Failed to load receipt image',
      code: response.status,
    } as ApiError;
  }

  const { url } = await response.json();
  return url;
}

export async function deleteReceipt(id: string, accessToken: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/receipts/${id}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw {
      message: error.error || 'Failed to delete receipt',
      code: response.status,
    } as ApiError;
  }
}

export interface Budget {
  id: string;
  user_id: string;
  category: string;
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

export async function getBudgets(accessToken: string): Promise<GetBudgetsResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/budgets`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw {
      message: error.error || 'Failed to load budgets',
      code: response.status,
    } as ApiError;
  }

  return response.json();
}

export async function upsertBudget(
  category: string,
  monthlyLimit: number,
  accessToken: string
): Promise<UpsertBudgetResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/budgets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ category, monthlyLimit }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw {
      message: error.error || 'Failed to save budget',
      code: response.status,
    } as ApiError;
  }

  return response.json();
}

export async function deleteBudget(id: string, accessToken: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/budgets/${id}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw {
      message: error.error || 'Failed to delete budget',
      code: response.status,
    } as ApiError;
  }
}

export async function logout(accessToken: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw {
      message: error.error || 'Failed to sign out',
      code: response.status,
    } as ApiError;
  }
}

export async function signup(
  email: string,
  password: string,
  name: string
): Promise<SignupResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/signup`, {
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
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/forgot-password`, {
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
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/reset-password`, {
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
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
  accessToken: string
): Promise<ChangePasswordResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ currentPassword, newPassword }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw {
      message: error.error || 'Could not change password',
      code: response.status,
    } as ApiError;
  }

  return response.json();
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
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/verify-signup`, {
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
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/resend-signup`, {
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
