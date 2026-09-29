import React from 'react';
import { Text } from 'react-native';
import { act, render, screen, waitFor } from '@testing-library/react-native';

const mockGetCategories = jest.fn();
const mockCreateCategory = jest.fn();
const mockUpdateCategory = jest.fn();
const mockDeleteCategory = jest.fn();
jest.mock('../../lib/api', () => ({
  getCategories: (...args: unknown[]) => mockGetCategories(...args),
  createCategory: (...args: unknown[]) => mockCreateCategory(...args),
  updateCategory: (...args: unknown[]) => mockUpdateCategory(...args),
  deleteCategory: (...args: unknown[]) => mockDeleteCategory(...args),
}));

import {
  CategoriesProvider,
  fallbackCategoriesValue,
  useCategories,
  type CategoriesContextValue,
} from '../../lib/categoriesContext';
import { BASE_CATEGORY_IDS, RECEIPT_CATEGORIES } from '../../lib/categories';
import { CATEGORY_META } from '../../lib/theme';
import type { Category } from '../../lib/api';

function row(partial: Partial<Category> & { id: string; name: string }): Category {
  return {
    user_id: 'u1',
    icon: null,
    color: null,
    is_base: false,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    ...partial,
  };
}

const BASE_ROWS: Category[] = RECEIPT_CATEGORIES.map((name) =>
  row({ id: BASE_CATEGORY_IDS[name], name, is_base: true, user_id: null })
);
const PETS = row({ id: 'c-pets', name: 'Pets', icon: 'paw', color: '#DB2777' });
const GIFTS = row({ id: 'c-gifts', name: 'Gifts', icon: 'gift-outline', color: '#0891B2' });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let current: CategoriesContextValue;
function Probe() {
  current = useCategories();
  return <Text testID="names">{current.names.join(',')}</Text>;
}

function renderProvider(props: { enabled?: boolean; retryKey?: unknown } = {}) {
  const { enabled = true, retryKey } = props;
  const utils = render(
    <CategoriesProvider enabled={enabled} retryKey={retryKey}>
      <Probe />
    </CategoriesProvider>
  );
  return {
    ...utils,
    rerenderWith: (next: { enabled?: boolean; retryKey?: unknown }) =>
      utils.rerender(
        <CategoriesProvider enabled={next.enabled ?? enabled} retryKey={next.retryKey}>
          <Probe />
        </CategoriesProvider>
      ),
  };
}

const names = () => screen.getByTestId('names').props.children as string;

describe('useCategories / CategoriesProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('outside a provider serves the base list with base metadata', () => {
    render(<Probe />);
    expect(current).toBe(fallbackCategoriesValue);
    expect(current.names).toEqual([...RECEIPT_CATEGORIES]);
    expect(current.customCategories).toEqual([]);
    expect(current.loaded).toBe(false);
    expect(current.metaFor('Dining')).toEqual(CATEGORY_META.Dining);
    expect(current.metaFor('Pets')).toBe(CATEGORY_META.Other);
    // Not loaded yet: unknown names are kept, not folded into Other.
    expect(current.canonicalName('Pets')).toBe('Pets');
    expect(mockGetCategories).not.toHaveBeenCalled();
  });

  it('serves the base list while loading, then base + custom once loaded', async () => {
    const pending = deferred<{ categories: Category[] }>();
    mockGetCategories.mockReturnValue(pending.promise);

    renderProvider();

    expect(current.status).toBe('loading');
    expect(names()).toBe(RECEIPT_CATEGORIES.join(','));

    await act(async () => pending.resolve({ categories: [...BASE_ROWS, PETS, GIFTS] }));

    expect(mockGetCategories).toHaveBeenCalledTimes(1);
    expect(current.status).toBe('ready');
    expect(current.loaded).toBe(true);
    expect(current.names).toEqual([...RECEIPT_CATEGORIES, 'Pets', 'Gifts']);
    expect(current.customCategories.map((c) => c.name)).toEqual(['Pets', 'Gifts']);
    expect(current.metaFor('Pets')).toEqual({ icon: 'paw', color: '#DB2777', backgroundColor: '#DB27771F' });
    expect(current.metaFor('Groceries')).toEqual(CATEGORY_META.Groceries);
    expect(current.metaFor('Gone')).toBe(CATEGORY_META.Other);
    expect(current.findByName('pets')?.id).toBe('c-pets');
    expect(current.canonicalName('PETS')).toBe('Pets');
    expect(current.canonicalName('Gone')).toBe('Other');
  });

  it('keeps the base list when the fetch fails, and retries on demand', async () => {
    mockGetCategories.mockRejectedValueOnce({ message: 'offline' });

    renderProvider();

    await waitFor(() => expect(current.status).toBe('error'));
    expect(current.names).toEqual([...RECEIPT_CATEGORIES]);
    expect(current.loaded).toBe(false);
    expect(current.metaFor('Health')).toEqual(CATEGORY_META.Health);
    // Custom names in receipts aren't lumped into Other while the list is unknown.
    expect(current.canonicalName('Pets')).toBe('Pets');

    mockGetCategories.mockResolvedValueOnce({ categories: [...BASE_ROWS, PETS] });
    await act(async () => current.retryIfFailed());

    await waitFor(() => expect(current.status).toBe('ready'));
    expect(current.names).toContain('Pets');
  });

  it('retryIfFailed does nothing after a successful load', async () => {
    mockGetCategories.mockResolvedValue({ categories: BASE_ROWS });
    renderProvider();
    await waitFor(() => expect(current.status).toBe('ready'));

    await act(async () => current.retryIfFailed());

    expect(mockGetCategories).toHaveBeenCalledTimes(1);
  });

  it('a failed load retries when the retry key changes', async () => {
    mockGetCategories.mockRejectedValueOnce({ message: 'offline' });
    const utils = renderProvider({ retryKey: false });
    await waitFor(() => expect(current.status).toBe('error'));

    mockGetCategories.mockResolvedValueOnce({ categories: [...BASE_ROWS, GIFTS] });
    utils.rerenderWith({ retryKey: true });

    await waitFor(() => expect(current.names).toContain('Gifts'));
    expect(mockGetCategories).toHaveBeenCalledTimes(2);
  });

  it('does not load while disabled, and resets to the base list on sign-out', async () => {
    mockGetCategories.mockResolvedValue({ categories: [...BASE_ROWS, PETS] });
    const utils = renderProvider({ enabled: false });
    expect(mockGetCategories).not.toHaveBeenCalled();
    expect(current.status).toBe('idle');

    utils.rerenderWith({ enabled: true });
    await waitFor(() => expect(current.names).toContain('Pets'));

    utils.rerenderWith({ enabled: false });
    expect(current.names).toEqual([...RECEIPT_CATEGORIES]);
    expect(current.loaded).toBe(false);
  });

  it('ignores a load that finishes after sign-out', async () => {
    const pending = deferred<{ categories: Category[] }>();
    mockGetCategories.mockReturnValue(pending.promise);
    const utils = renderProvider();

    utils.rerenderWith({ enabled: false });
    await act(async () => pending.resolve({ categories: [...BASE_ROWS, PETS] }));

    expect(current.names).toEqual([...RECEIPT_CATEGORIES]);
  });

  it('createCategory adds the new row right away and then refreshes', async () => {
    mockGetCategories.mockResolvedValueOnce({ categories: BASE_ROWS });
    renderProvider();
    await waitFor(() => expect(current.status).toBe('ready'));

    mockCreateCategory.mockResolvedValue({ category: PETS });
    const refreshed = deferred<{ categories: Category[] }>();
    mockGetCategories.mockReturnValueOnce(refreshed.promise);

    let created: unknown;
    await act(async () => {
      created = await current.createCategory({ name: 'Pets', icon: 'paw', color: '#DB2777' });
    });

    expect(mockCreateCategory).toHaveBeenCalledWith({ name: 'Pets', icon: 'paw', color: '#DB2777' });
    expect(created).toMatchObject({ id: 'c-pets', name: 'Pets', icon: 'paw' });
    expect(current.names).toEqual([...RECEIPT_CATEGORIES, 'Pets']);
    expect(mockGetCategories).toHaveBeenCalledTimes(2);

    await act(async () => refreshed.resolve({ categories: [...BASE_ROWS, PETS, GIFTS] }));
    expect(current.names).toEqual([...RECEIPT_CATEGORIES, 'Pets', 'Gifts']);
  });

  it('createCategory rejects with the ApiError and leaves the list alone', async () => {
    mockGetCategories.mockResolvedValue({ categories: BASE_ROWS });
    renderProvider();
    await waitFor(() => expect(current.status).toBe('ready'));
    mockCreateCategory.mockRejectedValue({ message: 'A category named "Dining" already exists', code: 409 });

    await act(async () => {
      await expect(current.createCategory({ name: 'dining' })).rejects.toEqual({
        message: 'A category named "Dining" already exists',
        code: 409,
      });
    });

    expect(current.names).toEqual([...RECEIPT_CATEGORIES]);
    expect(mockGetCategories).toHaveBeenCalledTimes(1);
  });

  it('updateCategory swaps in the renamed row and refreshes', async () => {
    mockGetCategories.mockResolvedValueOnce({ categories: [...BASE_ROWS, PETS] });
    renderProvider();
    await waitFor(() => expect(current.names).toContain('Pets'));

    const renamed = { ...PETS, name: 'Animals', color: '#7C3AED' };
    mockUpdateCategory.mockResolvedValue({ category: renamed });
    mockGetCategories.mockResolvedValueOnce({ categories: [...BASE_ROWS, renamed] });

    await act(async () => {
      await current.updateCategory('c-pets', { name: 'Animals', color: '#7C3AED' });
    });

    expect(mockUpdateCategory).toHaveBeenCalledWith('c-pets', { name: 'Animals', color: '#7C3AED' });
    expect(current.names).toEqual([...RECEIPT_CATEGORIES, 'Animals']);
    expect(current.metaFor('Animals').color).toBe('#7C3AED');
    await waitFor(() => expect(mockGetCategories).toHaveBeenCalledTimes(2));
  });

  it('deleteCategory removes the row and refreshes', async () => {
    mockGetCategories.mockResolvedValueOnce({ categories: [...BASE_ROWS, PETS, GIFTS] });
    renderProvider();
    await waitFor(() => expect(current.names).toContain('Pets'));

    mockDeleteCategory.mockResolvedValue(undefined);
    mockGetCategories.mockResolvedValueOnce({ categories: [...BASE_ROWS, GIFTS] });

    await act(async () => {
      await current.deleteCategory('c-pets');
    });

    expect(mockDeleteCategory).toHaveBeenCalledWith('c-pets');
    expect(current.names).toEqual([...RECEIPT_CATEGORIES, 'Gifts']);
    // Items of the deleted category now read as Other.
    expect(current.metaFor('Pets')).toBe(CATEGORY_META.Other);
    await waitFor(() => expect(mockGetCategories).toHaveBeenCalledTimes(2));
  });

  it('a failed refresh after a change keeps the updated list', async () => {
    mockGetCategories.mockResolvedValueOnce({ categories: BASE_ROWS });
    renderProvider();
    await waitFor(() => expect(current.status).toBe('ready'));

    mockCreateCategory.mockResolvedValue({ category: GIFTS });
    mockGetCategories.mockRejectedValueOnce({ message: 'offline' });
    await act(async () => {
      await current.createCategory({ name: 'Gifts' });
    });

    await waitFor(() => expect(current.status).toBe('error'));
    expect(current.names).toEqual([...RECEIPT_CATEGORIES, 'Gifts']);
    expect(current.loaded).toBe(true);
  });
});
