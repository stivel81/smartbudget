const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';

export interface ApiError {
  message: string;
  code?: number;
}

async function request<T>(path: string, accessToken: string | null, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw { message: body.error || 'Request failed', code: response.status } as ApiError;
  }

  if (response.status === 204) return undefined as T;
  return response.json();
}

export interface LoginResult {
  session: {
    access_token: string;
    refresh_token: string;
    user: { id: string; email: string };
  };
}

export function login(email: string, password: string): Promise<LoginResult> {
  return request('/api/v1/auth/login', null, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export interface AdminUserSummary {
  id: string;
  email: string | null;
  name: string | null;
  created_at: string;
  is_admin: boolean;
}

export function getUsers(accessToken: string): Promise<{ users: AdminUserSummary[] }> {
  return request('/api/v1/admin/users', accessToken);
}

export interface AdminUserDetail extends AdminUserSummary {
  email_confirmed_at: string | null;
  banned_until: string | null;
}

export interface AdminUserStats {
  receiptCount: number;
  totalSpent: number;
  budgetCount: number;
}

export interface AdminBudget {
  id: string;
  category: string;
  monthly_limit: number;
}

export function getUserDetail(
  userId: string,
  accessToken: string
): Promise<{ user: AdminUserDetail; stats: AdminUserStats; budgets: AdminBudget[] }> {
  return request(`/api/v1/admin/users/${userId}`, accessToken);
}

export interface AdminReceipt {
  id: string;
  created_at: string;
  image_path: string | null;
  raw_response: {
    merchant: string;
    total: number;
    date: string;
    items: { name: string; amount: number; category: string }[];
  };
}

export function getUserReceipts(userId: string, accessToken: string): Promise<{ receipts: AdminReceipt[] }> {
  return request(`/api/v1/admin/users/${userId}/receipts`, accessToken);
}

export function grantAdmin(userId: string, accessToken: string): Promise<void> {
  return request(`/api/v1/admin/users/${userId}/admin`, accessToken, { method: 'POST' });
}

export function revokeAdmin(userId: string, accessToken: string): Promise<void> {
  return request(`/api/v1/admin/users/${userId}/admin`, accessToken, { method: 'DELETE' });
}

export function suspendUser(userId: string, accessToken: string): Promise<void> {
  return request(`/api/v1/admin/users/${userId}/suspend`, accessToken, { method: 'POST' });
}

export function unsuspendUser(userId: string, accessToken: string): Promise<void> {
  return request(`/api/v1/admin/users/${userId}/unsuspend`, accessToken, { method: 'POST' });
}

export function deleteUserData(userId: string, accessToken: string): Promise<void> {
  return request(`/api/v1/admin/users/${userId}`, accessToken, { method: 'DELETE' });
}

export interface UserDataExport {
  exportedAt: string;
  profile: Record<string, unknown>;
  receipts: unknown[];
  budgets: unknown[];
}

export function exportUserData(userId: string, accessToken: string): Promise<UserDataExport> {
  return request(`/api/v1/admin/users/${userId}/export`, accessToken);
}

export interface DailyUsage {
  date: string;
  scans: number;
  inputTokens: number;
  outputTokens: number;
}

export interface UsageSummary {
  totalScans: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCostUsd: number;
  byDay: DailyUsage[];
}

export function getUsage(accessToken: string): Promise<UsageSummary> {
  return request('/api/v1/admin/usage', accessToken);
}

export interface RateLimitViolation {
  id: string;
  ip: string | null;
  route: string;
  created_at: string;
}

export function getRateLimitViolations(accessToken: string): Promise<{ violations: RateLimitViolation[] }> {
  return request('/api/v1/admin/rate-limit-violations', accessToken);
}
