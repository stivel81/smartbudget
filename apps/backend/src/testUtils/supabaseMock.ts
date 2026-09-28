/**
 * A minimal fake of the Supabase query builder for route tests.
 *
 * Each chain method (select/eq/order/insert/update/upsert/delete) just
 * returns the same builder so any chain shape resolves; the builder is
 * "thenable" so both `await builder` and `await builder.single()` work.
 * Tests queue results in the exact order the route handler awaits them.
 */

let resultQueue: any[] = [];
let storageResultQueue: any[] = [];

export function queueResult(result: unknown) {
  resultQueue.push(result);
}

export function queueStorageResult(result: unknown) {
  storageResultQueue.push(result);
}

export function resetQueue() {
  resultQueue = [];
  storageResultQueue = [];
}

function nextResult() {
  if (resultQueue.length === 0) {
    throw new Error('supabaseMock: no result queued for this call');
  }
  return resultQueue.shift();
}

function nextStorageResult() {
  if (storageResultQueue.length === 0) {
    throw new Error('supabaseMock: no storage result queued for this call');
  }
  return storageResultQueue.shift();
}

function makeBuilder(): any {
  const builder: any = {};
  ['select', 'eq', 'in', 'not', 'order', 'limit', 'insert', 'update', 'upsert', 'delete'].forEach((method) => {
    builder[method] = jest.fn(() => builder);
  });
  builder.single = jest.fn(async () => nextResult());
  builder.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
    Promise.resolve().then(() => resolve(nextResult())).catch(reject);
  };
  return builder;
}

export const mockGetUser = jest.fn(async (token: string): Promise<any> => {
  if (token === 'valid-token') {
    return { data: { user: { id: 'user-123', email: 'user@example.com' } }, error: null };
  }
  return { data: { user: null }, error: { message: 'Invalid token' } };
});

// Admin-API mocks used by the admin routes (user detail, suspend, delete).
// Configure per-test with mockResolvedValueOnce.
export const mockGetUserById = jest.fn();
export const mockUpdateUserById = jest.fn();
export const mockDeleteUserAdmin = jest.fn();
export const mockListUsers = jest.fn();

export const supabase = {
  auth: {
    getUser: mockGetUser,
    admin: {
      getUserById: mockGetUserById,
      updateUserById: mockUpdateUserById,
      deleteUser: mockDeleteUserAdmin,
      listUsers: mockListUsers,
    },
  },
  from: jest.fn(() => makeBuilder()),
  storage: {
    from: jest.fn(() => ({
      upload: jest.fn(async () => nextStorageResult()),
      remove: jest.fn(async () => nextStorageResult()),
      createSignedUrl: jest.fn(async () => nextStorageResult()),
    })),
  },
};

// requireAuth verifies bearer tokens, and routes/auth.ts signs up/in/out,
// via a separate client instance (see packages/shared/lib/supabaseAuth.ts)
// — mocked here too so routes under test resolve the same way regardless
// of which client they use. Auth tests configure these per-test with
// mockResolvedValueOnce rather than the queue pattern above.
export const mockSignUp = jest.fn();
export const mockSignInWithPassword = jest.fn();
export const mockRefreshSession = jest.fn();
export const mockAdminSignOut = jest.fn();
export const mockResetPasswordForEmail = jest.fn(async (..._args: unknown[]): Promise<any> => ({ data: {}, error: null }));

// Password reset runs verifyOtp + updateUser on a fresh per-request client
// (createIsolatedAuthClient). Each call here returns a *new* object whose
// methods delegate to these shared mocks, and records it in
// isolatedClients so tests can assert one client per request and that
// updateUser ran on the same instance as verifyOtp.
export const mockVerifyOtp = jest.fn();
export const mockUpdateUser = jest.fn();
// Change password verifies the current password with signInWithPassword on
// an isolated client — deliberately a different mock from the shared
// client's mockSignInWithPassword, so tests can prove which client ran it.
export const mockIsolatedSignIn = jest.fn();
export const mockIsolatedAdminSignOut = jest.fn(async (..._args: unknown[]): Promise<any> => ({ data: {}, error: null }));
export const isolatedClients: any[] = [];
export const createIsolatedAuthClient = jest.fn(() => {
  const client: any = { auth: {} };
  client.auth.verifyOtp = jest.fn((...args: unknown[]) => mockVerifyOtp(...args));
  client.auth.updateUser = jest.fn((...args: unknown[]) => mockUpdateUser(...args));
  client.auth.signInWithPassword = jest.fn((...args: unknown[]) => mockIsolatedSignIn(...args));
  client.auth.admin = { signOut: jest.fn((...args: unknown[]) => mockIsolatedAdminSignOut(...args)) };
  isolatedClients.push(client);
  return client;
});

export const supabaseAuth = {
  auth: {
    getUser: mockGetUser,
    signUp: mockSignUp,
    signInWithPassword: mockSignInWithPassword,
    refreshSession: mockRefreshSession,
    resetPasswordForEmail: mockResetPasswordForEmail,
    admin: { signOut: mockAdminSignOut },
  },
};
