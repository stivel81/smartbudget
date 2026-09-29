jest.mock('@smartbudget/shared/lib/supabase', () => ({
  supabase: require('../testUtils/supabaseMock').supabase,
}));

import { supabase } from '@smartbudget/shared/lib/supabase';
import { queueResult, resetQueue } from '../testUtils/supabaseMock';
import {
  BASE_CATEGORY_IDS,
  CategoryRow,
  OTHER_CATEGORY_ID,
  findBaseCategory,
  findBaseCategoryById,
  resolveCategoryId,
  validateCategoryName,
} from '../services/categories';
import {
  buildTransactionRows,
  isoDateOrNull,
  itemAmount,
  syncReceiptTransactions,
  transactionDate,
} from '../services/transactionSync';

const USER = 'user-123';
const OTHER_USER = 'user-999';
const CUSTOM_PETS = 'cccccccc-0000-4000-8000-00000000000a';
const FOREIGN_SNACKS = 'cccccccc-0000-4000-8000-00000000000b';

const BASE_ROWS: CategoryRow[] = Object.entries(BASE_CATEGORY_IDS).map(([name, id]) => ({ id, user_id: null, name }));
const CATEGORIES: CategoryRow[] = [
  ...BASE_ROWS,
  { id: CUSTOM_PETS, user_id: USER, name: 'Pets' },
  { id: FOREIGN_SNACKS, user_id: OTHER_USER, name: 'Snacks' },
];

/** Builders returned by supabase.from(table), in call order. */
function buildersFor(table: string): any[] {
  const from = supabase.from as jest.Mock;
  return from.mock.calls
    .map((call, i) => (call[0] === table ? from.mock.results[i].value : null))
    .filter(Boolean);
}

let errorSpy: jest.SpyInstance;
beforeEach(() => {
  resetQueue();
  jest.clearAllMocks();
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

describe('resolveCategoryId', () => {
  it('maps a base name exactly', () => {
    expect(resolveCategoryId('Groceries', USER, CATEGORIES)).toBe(BASE_CATEGORY_IDS.Groceries);
  });

  it('maps base names case-insensitively and ignores surrounding spaces', () => {
    expect(resolveCategoryId('  dINing ', USER, CATEGORIES)).toBe(BASE_CATEGORY_IDS.Dining);
  });

  it("maps the user's own custom category name (case-insensitive)", () => {
    expect(resolveCategoryId('pets', USER, CATEGORIES)).toBe(CUSTOM_PETS);
  });

  it("ignores another user's custom category and falls back to Other", () => {
    expect(resolveCategoryId('Snacks', USER, CATEGORIES)).toBe(OTHER_CATEGORY_ID);
  });

  it('maps an unknown name to Other', () => {
    expect(resolveCategoryId('Casino', USER, CATEGORIES)).toBe(OTHER_CATEGORY_ID);
  });

  it('maps non-string / blank categories to Other', () => {
    expect(resolveCategoryId(undefined, USER, CATEGORIES)).toBe(OTHER_CATEGORY_ID);
    expect(resolveCategoryId(5, USER, CATEGORIES)).toBe(OTHER_CATEGORY_ID);
    expect(resolveCategoryId('   ', USER, CATEGORIES)).toBe(OTHER_CATEGORY_ID);
  });

  it('prefers the base category when a custom row somehow has the same name', () => {
    const clash = [...CATEGORIES, { id: 'dddddddd-0000-4000-8000-000000000001', user_id: USER, name: 'Health' }];
    expect(resolveCategoryId('health', USER, clash)).toBe(BASE_CATEGORY_IDS.Health);
  });
});

describe('category helpers', () => {
  it('findBaseCategory / findBaseCategoryById', () => {
    expect(findBaseCategory(' groceries')).toEqual({ id: BASE_CATEGORY_IDS.Groceries, name: 'Groceries' });
    expect(findBaseCategory('Pets')).toBeNull();
    expect(findBaseCategoryById(BASE_CATEGORY_IDS.Other.toUpperCase())).toEqual({ id: OTHER_CATEGORY_ID, name: 'Other' });
    expect(findBaseCategoryById(CUSTOM_PETS)).toBeNull();
  });

  it('validateCategoryName trims and enforces 1-30 characters', () => {
    expect(validateCategoryName('  Pets ')).toEqual({ name: 'Pets' });
    expect(validateCategoryName('x'.repeat(30))).toEqual({ name: 'x'.repeat(30) });
    expect(validateCategoryName('x'.repeat(31))).toHaveProperty('error');
    expect(validateCategoryName('   ')).toHaveProperty('error');
    expect(validateCategoryName(42)).toHaveProperty('error');
    // Counted in code points like Postgres char_length: 30 emoji is fine.
    expect(validateCategoryName('🐶'.repeat(30))).toEqual({ name: '🐶'.repeat(30) });
  });
});

describe('itemAmount / isoDateOrNull / transactionDate', () => {
  it('accepts finite numbers and plain decimal strings only', () => {
    expect(itemAmount(3.5)).toBe(3.5);
    expect(itemAmount(-1)).toBe(-1);
    expect(itemAmount(' 2.25 ')).toBe(2.25);
    expect(itemAmount('1e3')).toBeNull();
    expect(itemAmount('abc')).toBeNull();
    expect(itemAmount(null)).toBeNull();
    expect(itemAmount(undefined)).toBeNull();
    expect(itemAmount(NaN)).toBeNull();
    expect(itemAmount(Infinity)).toBeNull();
  });

  it('accepts only real YYYY-MM-DD dates', () => {
    expect(isoDateOrNull('2026-09-11')).toBe('2026-09-11');
    expect(isoDateOrNull('2026-02-31')).toBeNull();
    expect(isoDateOrNull('11/09/2026')).toBeNull();
    expect(isoDateOrNull(null)).toBeNull();
  });

  it("falls back to created_at's UTC date when raw date is unusable", () => {
    expect(transactionDate({ id: 'r', raw_response: { date: '2026-09-11' }, created_at: '2026-01-01T00:00:00Z' })).toBe('2026-09-11');
    expect(transactionDate({ id: 'r', raw_response: { date: null }, created_at: '2026-09-10T23:30:00+00:00' })).toBe('2026-09-10');
    expect(transactionDate({ id: 'r', raw_response: { date: 'bad' } })).toBeNull();
  });
});

describe('buildTransactionRows', () => {
  const RECEIPT = {
    id: 'receipt-1',
    created_at: '2026-09-10T10:00:00Z',
    raw_response: {
      date: '2026-09-11',
      items: [
        { name: 'Milk', amount: 3.5, category: 'Groceries' },
        { name: 'Kibble', amount: 20, category: 'pets' },
        { name: 'Chips', amount: 2, category: 'Snacks' },
        'not-an-object',
        { name: 'NoAmount', category: 'Health' },
        { name: 99, amount: '4.00', category: 'Casino' },
      ],
    },
  };

  it('maps every usable item, keeping its original index as position', () => {
    const rows = buildTransactionRows(USER, RECEIPT, CATEGORIES);
    expect(rows).toEqual([
      { receipt_id: 'receipt-1', user_id: USER, category_id: BASE_CATEGORY_IDS.Groceries, name: 'Milk', amount: 3.5, date: '2026-09-11', position: 0 },
      { receipt_id: 'receipt-1', user_id: USER, category_id: CUSTOM_PETS, name: 'Kibble', amount: 20, date: '2026-09-11', position: 1 },
      { receipt_id: 'receipt-1', user_id: USER, category_id: OTHER_CATEGORY_ID, name: 'Chips', amount: 2, date: '2026-09-11', position: 2 },
      { receipt_id: 'receipt-1', user_id: USER, category_id: OTHER_CATEGORY_ID, name: null, amount: 4, date: '2026-09-11', position: 5 },
    ]);
  });

  it('returns no rows when items is missing or not an array', () => {
    expect(buildTransactionRows(USER, { id: 'r', raw_response: {} }, CATEGORIES)).toEqual([]);
    expect(buildTransactionRows(USER, { id: 'r', raw_response: { items: null } }, CATEGORIES)).toEqual([]);
    expect(buildTransactionRows(USER, { id: 'r', raw_response: null }, CATEGORIES)).toEqual([]);
  });
});

describe('syncReceiptTransactions', () => {
  const RECEIPT = {
    id: 'receipt-1',
    raw_response: { date: '2026-09-11', items: [{ name: 'Kibble', amount: 20, category: 'Pets' }] },
  };

  it('fetches base + own categories, deletes the receipt rows, then inserts the mapped rows', async () => {
    queueResult({ data: CATEGORIES, error: null }); // categories
    queueResult({ error: null }); // delete
    queueResult({ error: null }); // insert

    await expect(syncReceiptTransactions(USER, RECEIPT)).resolves.toBe(true);

    const [categoriesQuery] = buildersFor('categories');
    expect(categoriesQuery.or).toHaveBeenCalledWith(`user_id.is.null,user_id.eq.${USER}`);

    const [deleteQuery, insertQuery] = buildersFor('transactions');
    expect(deleteQuery.delete).toHaveBeenCalled();
    expect(deleteQuery.eq).toHaveBeenCalledWith('receipt_id', 'receipt-1');
    expect(deleteQuery.eq).toHaveBeenCalledWith('user_id', USER);
    expect(insertQuery.insert).toHaveBeenCalledWith([
      { receipt_id: 'receipt-1', user_id: USER, category_id: CUSTOM_PETS, name: 'Kibble', amount: 20, date: '2026-09-11', position: 0 },
    ]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('only deletes (no insert) when the receipt has no usable items', async () => {
    queueResult({ data: CATEGORIES, error: null });
    queueResult({ error: null });

    await expect(syncReceiptTransactions(USER, { id: 'receipt-1', raw_response: { items: [] } })).resolves.toBe(true);
    expect(buildersFor('transactions')).toHaveLength(1);
  });

  it('logs and returns false (no delete) when loading categories fails', async () => {
    queueResult({ data: null, error: { message: 'boom' } });

    await expect(syncReceiptTransactions(USER, RECEIPT)).resolves.toBe(false);
    expect(buildersFor('transactions')).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('(categories)'), { message: 'boom' });
  });

  it('logs and returns false (no insert) when the delete fails', async () => {
    queueResult({ data: CATEGORIES, error: null });
    queueResult({ error: { message: 'delete failed' } });

    await expect(syncReceiptTransactions(USER, RECEIPT)).resolves.toBe(false);
    expect(buildersFor('transactions')).toHaveLength(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('(delete)'), { message: 'delete failed' });
  });

  it('logs and returns false when the insert fails', async () => {
    queueResult({ data: CATEGORIES, error: null });
    queueResult({ error: null });
    queueResult({ error: { message: 'insert failed' } });

    await expect(syncReceiptTransactions(USER, RECEIPT)).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('(insert)'), { message: 'insert failed' });
  });

  it('never throws, even when the client itself throws', async () => {
    // Nothing queued: the mock throws on the first await.
    await expect(syncReceiptTransactions(USER, RECEIPT)).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('skips (returns false) without a user or receipt id', async () => {
    await expect(syncReceiptTransactions('', RECEIPT)).resolves.toBe(false);
    await expect(syncReceiptTransactions(USER, { id: '' })).resolves.toBe(false);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
