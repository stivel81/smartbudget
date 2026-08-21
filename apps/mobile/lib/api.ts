// API base URL for backend communication
export const API_BASE_URL = 'http://localhost:3000';

// Must stay in sync with RECEIPT_CATEGORIES in apps/backend/src/services/claude.ts
export const RECEIPT_CATEGORIES = [
  'Groceries',
  'Dining',
  'Transport',
  'Entertainment',
  'Health',
  'Other',
] as const;

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
  code?: number | string;
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
    throw {
      message: error.error || 'Invalid credentials',
      code: response.status,
    } as ApiError;
  }

  return response.json();
}

export interface ReceiptExtraction {
  merchant: string;
  total: number;
  date: string;
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

export async function updateReceipt(
  id: string,
  updates: { merchant?: string; total?: number; date?: string },
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
