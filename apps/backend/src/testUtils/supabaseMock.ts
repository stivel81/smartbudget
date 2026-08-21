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
  ['select', 'eq', 'order', 'insert', 'update', 'upsert', 'delete'].forEach((method) => {
    builder[method] = jest.fn(() => builder);
  });
  builder.single = jest.fn(async () => nextResult());
  builder.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
    Promise.resolve().then(() => resolve(nextResult())).catch(reject);
  };
  return builder;
}

export const mockGetUser = jest.fn(async (token: string) => {
  if (token === 'valid-token') {
    return { data: { user: { id: 'user-123' } }, error: null };
  }
  return { data: { user: null }, error: { message: 'Invalid token' } };
});

export const supabase = {
  auth: { getUser: mockGetUser },
  from: jest.fn(() => makeBuilder()),
  storage: {
    from: jest.fn(() => ({
      upload: jest.fn(async () => nextStorageResult()),
      remove: jest.fn(async () => nextStorageResult()),
      createSignedUrl: jest.fn(async () => nextStorageResult()),
    })),
  },
};

// requireAuth verifies bearer tokens via a separate client instance
// (see packages/shared/lib/supabaseAuth.ts) — mocked here too so routes
// under test resolve the same way regardless of which client they use.
export const supabaseAuth = {
  auth: { getUser: mockGetUser },
};
