// API base URL for backend communication
export const API_BASE_URL = 'http://localhost:3000';

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
