// The app's source of spending categories (base + the user's custom ones).
//
// App.tsx renders <CategoriesProvider enabled={signedIn}>: it loads
// GET /api/v1/categories once after sign-in (and again when a launch
// restore's pending renewal lands), and every create / rename / delete made
// through it updates the list right away and then re-fetches it.
//
// Screens call useCategories(). Until the list has loaded — or when loading
// failed, or outside the provider (screen tests) — it serves the 6 base
// categories, so nothing breaks while offline.
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  createCategory as createCategoryApi,
  deleteCategory as deleteCategoryApi,
  getCategories,
  updateCategory as updateCategoryApi,
  type CategoryInput,
  type CategoryUpdate,
} from './api';
import {
  BASE_CATEGORY_LIST,
  buildCategoryList,
  canonicalCategoryName,
  findCategory,
  resolveCategoryMeta,
  toCategoryInfo,
  type CategoryInfo,
  type CategoryMeta,
} from './categories';

export type CategoriesStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface CategoriesContextValue {
  /** Base first, then custom — the choices for pickers. */
  categories: readonly CategoryInfo[];
  /** Just the user's own categories. */
  customCategories: readonly CategoryInfo[];
  /** `categories` names, in the same order. */
  names: readonly string[];
  status: CategoriesStatus;
  /** True once the user's full list has been fetched at least once. */
  loaded: boolean;
  /** Icon/colors for a category name (unknown names look like Other). */
  metaFor: (name: string) => CategoryMeta;
  /** The category with that name (case-insensitive), if known. */
  findByName: (name: string) => CategoryInfo | undefined;
  /** Name spending is grouped under (see canonicalCategoryName). */
  canonicalName: (name: string) => string;
  /** Re-fetch the list. Never rejects (a failure keeps the current list and sets status 'error'). */
  refresh: () => Promise<void>;
  /** Re-fetch only when the last load failed or never ran. */
  retryIfFailed: () => void;
  /** POST; rejects with the ApiError (409 clash, 400 validation...). */
  createCategory: (input: CategoryInput) => Promise<CategoryInfo>;
  /** PATCH; rejects with the ApiError (403 base, 404, 409, 400). */
  updateCategory: (id: string, updates: CategoryUpdate) => Promise<CategoryInfo>;
  /** DELETE; rejects with the ApiError (403 base, 404). */
  deleteCategory: (id: string) => Promise<void>;
}

function makeValue(
  list: readonly CategoryInfo[],
  status: CategoriesStatus,
  loaded: boolean,
  actions: Pick<CategoriesContextValue, 'refresh' | 'retryIfFailed' | 'createCategory' | 'updateCategory' | 'deleteCategory'>
): CategoriesContextValue {
  return {
    categories: list,
    customCategories: list.filter((c) => !c.isBase),
    names: list.map((c) => c.name),
    status,
    loaded,
    metaFor: (name) => resolveCategoryMeta(list, name),
    findByName: (name) => findCategory(list, name),
    canonicalName: (name) => canonicalCategoryName(list, name, loaded),
    ...actions,
  };
}

/**
 * Value used outside a provider: the base list, with stateless actions that
 * still reach the API (so a screen rendered on its own keeps working).
 */
export const fallbackCategoriesValue: CategoriesContextValue = makeValue(BASE_CATEGORY_LIST, 'idle', false, {
  refresh: async () => {},
  retryIfFailed: () => {},
  createCategory: async (input) => toCategoryInfo((await createCategoryApi(input)).category),
  updateCategory: async (id, updates) => toCategoryInfo((await updateCategoryApi(id, updates)).category),
  deleteCategory: (id) => deleteCategoryApi(id),
});

export const CategoriesContext = React.createContext<CategoriesContextValue>(fallbackCategoriesValue);

/** The app's categories (base + custom) and the actions that change them. */
export function useCategories(): CategoriesContextValue {
  return useContext(CategoriesContext);
}

/**
 * A fixed context value for `list` (tests / previews): actions resolve
 * without calling the API. Pass `loaded: false` to mimic the fallback state.
 */
export function staticCategoriesValue(
  list: readonly CategoryInfo[],
  { loaded = true, status = 'ready' as CategoriesStatus } = {}
): CategoriesContextValue {
  return makeValue(list, status, loaded, {
    refresh: async () => {},
    retryIfFailed: () => {},
    createCategory: async () => {
      throw new Error('staticCategoriesValue: createCategory is not supported');
    },
    updateCategory: async () => {
      throw new Error('staticCategoriesValue: updateCategory is not supported');
    },
    deleteCategory: async () => {},
  });
}

export interface CategoriesProviderProps {
  /** Signed in: load the list. Signing out resets it to the base list. */
  enabled: boolean;
  /**
   * Changing this while enabled re-runs a load that failed (App passes
   * "has an access token", which flips once a pending launch renewal lands).
   */
  retryKey?: unknown;
  children: React.ReactNode;
}

export function CategoriesProvider({ enabled, retryKey, children }: CategoriesProviderProps): React.ReactElement {
  const [list, setList] = useState<readonly CategoryInfo[]>(BASE_CATEGORY_LIST);
  const [status, setStatus] = useState<CategoriesStatus>('idle');
  const [loaded, setLoaded] = useState(false);
  // Only the latest load may write; bumped on sign-out/unmount too.
  const loadSeq = useRef(0);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const statusRef = useRef(status);
  statusRef.current = status;

  const refresh = useCallback(async () => {
    if (!enabledRef.current) return;
    const seq = ++loadSeq.current;
    setStatus('loading');
    try {
      const { categories } = await getCategories();
      if (seq !== loadSeq.current) return;
      setList(buildCategoryList(Array.isArray(categories) ? categories : []));
      setLoaded(true);
      setStatus('ready');
    } catch {
      // Keep whatever is shown (base list, or the last good list).
      if (seq === loadSeq.current) setStatus('error');
    }
  }, []);

  const retryIfFailed = useCallback(() => {
    if (statusRef.current === 'error' || statusRef.current === 'idle') void refresh();
  }, [refresh]);

  useEffect(() => {
    if (enabled) {
      void refresh();
    } else {
      loadSeq.current++;
      setList(BASE_CATEGORY_LIST);
      setLoaded(false);
      setStatus('idle');
    }
  }, [enabled, refresh]);

  // A failed first load (e.g. launch restore still renewing) retries when
  // the retry key changes.
  const firstRetryKey = useRef(true);
  useEffect(() => {
    if (firstRetryKey.current) {
      firstRetryKey.current = false;
      return;
    }
    if (enabledRef.current && statusRef.current === 'error') void refresh();
  }, [retryKey, refresh]);

  useEffect(
    () => () => {
      loadSeq.current++;
    },
    []
  );

  const createCategory = useCallback(
    async (input: CategoryInput) => {
      const { category } = await createCategoryApi(input);
      const info = toCategoryInfo(category);
      setList((prev) => [...prev.filter((c) => c.id !== info.id), info]);
      void refresh();
      return info;
    },
    [refresh]
  );

  const updateCategory = useCallback(
    async (id: string, updates: CategoryUpdate) => {
      const { category } = await updateCategoryApi(id, updates);
      const info = toCategoryInfo(category);
      setList((prev) => prev.map((c) => (c.id === id ? info : c)));
      void refresh();
      return info;
    },
    [refresh]
  );

  const deleteCategory = useCallback(
    async (id: string) => {
      await deleteCategoryApi(id);
      setList((prev) => prev.filter((c) => c.id !== id));
      void refresh();
    },
    [refresh]
  );

  const value = useMemo(
    () =>
      makeValue(list, status, loaded, {
        refresh,
        retryIfFailed,
        createCategory,
        updateCategory,
        deleteCategory,
      }),
    [list, status, loaded, refresh, retryIfFailed, createCategory, updateCategory, deleteCategory]
  );

  return <CategoriesContext.Provider value={value}>{children}</CategoriesContext.Provider>;
}
