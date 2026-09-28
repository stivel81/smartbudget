import type {
  AdminReceipt,
  AdminUserDetail,
  AdminUserSummary,
  AuditLogEntry,
  RateLimitViolation,
  ScanFailure,
  ScanLogEntry,
  UsageSummary,
} from '../../lib/api';

/** Fixed "now" used by view tests (a Wednesday, mid-afternoon UTC). */
export const NOW = new Date('2026-03-04T15:30:00Z');

/**
 * Fake only Date so `new Date()` is deterministic, leaving real timers in
 * place for promises, waitFor and user-event.
 */
export function freezeDate(now: Date = NOW) {
  jest.useFakeTimers({
    now,
    doNotFake: [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'setImmediate',
      'clearImmediate',
      'queueMicrotask',
      'nextTick',
      'hrtime',
      'performance',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
    ],
  });
}

/** A promise that never settles — for asserting loading states. */
export function pending<T>(): Promise<T> {
  return new Promise<T>(() => {});
}

/** A promise plus its resolve/reject, for controlling timing in tests. */
export function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function makeUser(overrides: Partial<AdminUserSummary> = {}): AdminUserSummary {
  return {
    id: 'u1',
    email: 'alice@example.com',
    name: 'Alice Smith',
    created_at: '2026-03-04T10:00:00Z',
    is_admin: false,
    ...overrides,
  };
}

export function makeUserDetail(overrides: Partial<AdminUserDetail> = {}): AdminUserDetail {
  return {
    ...makeUser(),
    email_confirmed_at: '2026-03-04T10:05:00Z',
    banned_until: null,
    ...overrides,
  };
}

export function makeUsage(overrides: Partial<UsageSummary> = {}): UsageSummary {
  return {
    totalScans: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    estimatedCostUsd: 0,
    byDay: [],
    ...overrides,
  };
}

export function makeFailure(overrides: Partial<ScanFailure> = {}): ScanFailure {
  return {
    id: 'f1',
    user_id: 'u1',
    error_message: 'Could not parse receipt',
    media_type: 'image/jpeg',
    created_at: '2026-03-04T12:00:00Z',
    ...overrides,
  };
}

export function makeScanLogEntry(overrides: Partial<ScanLogEntry> = {}): ScanLogEntry {
  return {
    id: 's1',
    userId: 'u1',
    email: 'alice@example.com',
    createdAt: '2026-03-04T12:00:00Z',
    status: 'success',
    inputTokens: 1500,
    outputTokens: 300,
    costUsd: 0.003,
    error: null,
    ...overrides,
  };
}

export function makeReceipt(overrides: Partial<AdminReceipt> = {}): AdminReceipt {
  return {
    id: 'r1',
    created_at: '2026-03-04T10:00:00Z',
    image_path: null,
    raw_response: { merchant: 'Shufersal', total: 42.5, date: '2026-03-04', items: [] },
    ...overrides,
  };
}

export function makeAuditEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: 'a1',
    admin_id: 'admin-1',
    admin_email: 'admin@example.com',
    action: 'suspend_user',
    target_user_id: 'u1',
    details: { email: 'alice@example.com' },
    created_at: '2026-03-04T12:00:00Z',
    ...overrides,
  };
}

export function makeViolation(overrides: Partial<RateLimitViolation> = {}): RateLimitViolation {
  return {
    id: 'v1',
    ip: '203.0.113.7',
    route: '/api/v1/receipts/scan',
    created_at: '2026-03-04T12:00:00Z',
    ...overrides,
  };
}
