import React from 'react';
import { Alert, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useFocusEffect: (effect: () => void | (() => void)) => {
      const React = require('react');
      React.useEffect(effect, []);
    },
  };
});

const mockGetBudgets = jest.fn();
const mockGetReceipts = jest.fn();
const mockUpsertBudget = jest.fn();
jest.mock('../../lib/api', () => ({
  ...jest.requireActual('../../lib/api'),
  getBudgets: (...args: unknown[]) => mockGetBudgets(...args),
  getReceipts: (...args: unknown[]) => mockGetReceipts(...args),
  upsertBudget: (...args: unknown[]) => mockUpsertBudget(...args),
}));

import BudgetScreen from '../../screens/BudgetScreen';
import { AuthContext } from '../../lib/auth';
import { COLORS } from '../../lib/theme';

// Pin "now" to mid-January 2026 (local time) so month filtering doesn't
// depend on the date the suite runs.
const NOW = new Date(2026, 0, 15, 10, 0, 0);

function budget(id: string, category: string, monthly_limit: number) {
  return {
    id,
    user_id: 'u1',
    category,
    monthly_limit,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function receipt(
  id: string,
  date: string,
  items: { name: string; amount: number; category: string }[],
  created_at = '2026-01-01T00:00:00Z'
) {
  return {
    id,
    user_id: 'u1',
    created_at,
    image_path: null,
    raw_response: {
      merchant: `Merchant ${id}`,
      total: items.reduce((s, i) => s + i.amount, 0),
      date,
      items,
    },
  };
}

function renderBudget(accessToken: string | null = 'test-token') {
  return render(
    <AuthContext.Provider
      value={{
        isAuthenticated: true,
        setIsAuthenticated: () => {},
        accessToken,
        setAccessToken: () => {},
        refreshToken: 'test-refresh-token',
        setRefreshToken: () => {},
        userEmail: 'test@example.com',
        setUserEmail: () => {},
        logout: async () => {},
      }}
    >
      <BudgetScreen />
    </AuthContext.Provider>
  );
}

describe('BudgetScreen', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    alertSpy.mockRestore();
    jest.clearAllMocks();
  });

  it('shows the empty state when there are no budgets', async () => {
    mockGetBudgets.mockResolvedValue({ budgets: [] });
    mockGetReceipts.mockResolvedValue({ receipts: [] });

    renderBudget();

    await waitFor(() => expect(screen.getByText('No budgets set')).toBeTruthy());
  });

  it('shows the current month in the header', async () => {
    mockGetBudgets.mockResolvedValue({ budgets: [] });
    mockGetReceipts.mockResolvedValue({ receipts: [] });

    renderBudget();

    await waitFor(() => expect(screen.getByText('January 2026')).toBeTruthy());
  });

  it('renders real spend, percentage, and an amber alert at 90%+ threshold', async () => {
    mockGetBudgets.mockResolvedValue({ budgets: [budget('b1', 'Groceries', 100)] });
    mockGetReceipts.mockResolvedValue({
      receipts: [receipt('r1', '2026-01-01', [{ name: 'Milk', amount: 95, category: 'Groceries' }])],
    });

    renderBudget();

    await waitFor(() => expect(screen.getByText('Groceries')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('95%')).toBeTruthy());
    // Amber banner at 90%+, singular verb for a single category
    expect(screen.getByText('Groceries is at 90%+ of budget')).toBeTruthy();
  });

  it('uses a plural verb when several categories are in the amber banner', async () => {
    mockGetBudgets.mockResolvedValue({
      budgets: [budget('b1', 'Groceries', 100), budget('b2', 'Dining', 100)],
    });
    mockGetReceipts.mockResolvedValue({
      receipts: [
        receipt('r1', '2026-01-02', [
          { name: 'Milk', amount: 91, category: 'Groceries' },
          { name: 'Meal', amount: 93, category: 'Dining' },
        ]),
      ],
    });

    renderBudget();

    await waitFor(() => expect(screen.getByText('Groceries and Dining are at 90%+ of budget')).toBeTruthy());
  });

  it('shows a red alert when any category is at 100%+ (over budget)', async () => {
    mockGetBudgets.mockResolvedValue({ budgets: [budget('b1', 'Dining', 100)] });
    mockGetReceipts.mockResolvedValue({
      receipts: [receipt('r1', '2026-01-01', [{ name: 'Meal', amount: 110, category: 'Dining' }])],
    });

    renderBudget();

    await waitFor(() => expect(screen.getByText('Dining')).toBeTruthy());
    expect(screen.getByText('₪110 / ₪100')).toBeTruthy();
    expect(screen.getByText('110%')).toBeTruthy();
    // Red banner at 100%+
    expect(screen.getByText(/is at 100%\+ of budget/)).toBeTruthy();
    // Over-budget percentage is rendered in the danger color
    expect(StyleSheet.flatten(screen.getByText('110%').props.style).color).toBe(COLORS.danger);
  });

  it('renders multiple categories with separate spent amounts', async () => {
    mockGetBudgets.mockResolvedValue({
      budgets: [budget('b1', 'Groceries', 1000), budget('b2', 'Dining', 400)],
    });
    mockGetReceipts.mockResolvedValue({
      receipts: [
        receipt('r1', '2026-01-01', [{ name: 'Groceries', amount: 820, category: 'Groceries' }]),
        receipt('r2', '2026-01-02', [{ name: 'Dining', amount: 368, category: 'Dining' }]),
      ],
    });

    renderBudget();

    await waitFor(() => expect(screen.getByText('Groceries')).toBeTruthy());
    expect(screen.getByText('Dining')).toBeTruthy();
    expect(screen.getByText('₪820 / ₪1,000')).toBeTruthy(); // Groceries 82%
    expect(screen.getByText('₪368 / ₪400')).toBeTruthy(); // Dining 92% over alert threshold
    expect(screen.getByText('82%')).toBeTruthy();
    expect(screen.getByText('92%')).toBeTruthy();
  });

  it('calculates summary totals correctly', async () => {
    mockGetBudgets.mockResolvedValue({
      budgets: [budget('b1', 'Groceries', 1000), budget('b2', 'Dining', 400)],
    });
    mockGetReceipts.mockResolvedValue({
      receipts: [
        receipt('r1', '2026-01-01', [{ name: 'Groceries', amount: 820, category: 'Groceries' }]),
        receipt('r2', '2026-01-02', [{ name: 'Dining', amount: 368, category: 'Dining' }]),
      ],
    });

    renderBudget();

    await waitFor(() => expect(screen.getByText('Total Spent')).toBeTruthy());
    expect(screen.getByText('₪1,188')).toBeTruthy(); // 820 + 368
    expect(screen.getByText('₪1,400')).toBeTruthy(); // 1000 + 400
    expect(screen.getByText('₪212')).toBeTruthy(); // remaining: 1400 - 1188
  });

  it('shows an error message when the fetch fails', async () => {
    mockGetBudgets.mockRejectedValue({ message: 'Failed to load budgets' });
    mockGetReceipts.mockResolvedValue({ receipts: [] });

    renderBudget();

    await waitFor(() => expect(screen.getByText('Failed to load budgets')).toBeTruthy());
  });

  it('falls back to a default error message when the error has none', async () => {
    mockGetBudgets.mockRejectedValue({});
    mockGetReceipts.mockResolvedValue({ receipts: [] });

    renderBudget();

    await waitFor(() => expect(screen.getByText('Failed to load budgets')).toBeTruthy());
    expect(screen.queryByText('No budgets set')).toBeNull();
  });

  it('does not show alert banner when no categories exceed threshold', async () => {
    mockGetBudgets.mockResolvedValue({ budgets: [budget('b1', 'Entertainment', 500)] });
    mockGetReceipts.mockResolvedValue({
      receipts: [receipt('r1', '2026-01-01', [{ name: 'Ticket', amount: 30, category: 'Entertainment' }])],
    });

    renderBudget();

    await waitFor(() => expect(screen.getByText('Entertainment')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('6%')).toBeTruthy());
    expect(screen.queryByText(/of budget/)).toBeNull();
  });

  it('shows 0% (not NaN/Infinity) for a budget with a 0 limit', async () => {
    mockGetBudgets.mockResolvedValue({ budgets: [budget('b1', 'Health', 0)] });
    mockGetReceipts.mockResolvedValue({
      receipts: [receipt('r1', '2026-01-03', [{ name: 'Pills', amount: 40, category: 'Health' }])],
    });

    renderBudget();

    await waitFor(() => expect(screen.getByText('Health')).toBeTruthy());
    expect(screen.getByText('0%')).toBeTruthy();
    expect(screen.queryByText(/NaN|Infinity/)).toBeNull();
    expect(screen.queryByText(/of budget/)).toBeNull();
  });

  describe('current-month filtering', () => {
    it('does not count receipts from a previous month toward spend or alerts', async () => {
      mockGetBudgets.mockResolvedValue({
        budgets: [budget('b1', 'Groceries', 100), budget('b2', 'Dining', 100)],
      });
      mockGetReceipts.mockResolvedValue({
        receipts: [
          // December purchases (way over budget) — must be ignored in January.
          receipt('dec1', '2025-12-10', [{ name: 'Big shop', amount: 500, category: 'Groceries' }], '2025-12-10T09:00:00Z'),
          receipt('dec2', '2025-12-31', [{ name: 'NYE dinner', amount: 250, category: 'Dining' }], '2026-01-02T09:00:00Z'),
          // A January purchase
          receipt('jan1', '2026-01-05', [{ name: 'Milk', amount: 20, category: 'Groceries' }]),
        ],
      });

      renderBudget();

      await waitFor(() => expect(screen.getByText('Groceries')).toBeTruthy());
      expect(screen.getByText('₪20 / ₪100')).toBeTruthy();
      expect(screen.getByText('20%')).toBeTruthy();
      expect(screen.getByText('₪0 / ₪100')).toBeTruthy();
      expect(screen.getByText('0%')).toBeTruthy();
      // No 90% / 100% banner even though December was far over budget
      expect(screen.queryByText(/of budget/)).toBeNull();
      // Summary only reflects January: spent 20 of 200, remaining 180
      expect(screen.getByText('₪20')).toBeTruthy();
      expect(screen.getByText('₪200')).toBeTruthy();
      expect(screen.getByText('₪180')).toBeTruthy();
    });

    it('does not trigger a red banner from previous-month receipts alone', async () => {
      mockGetBudgets.mockResolvedValue({ budgets: [budget('b1', 'Dining', 100)] });
      mockGetReceipts.mockResolvedValue({
        receipts: [receipt('nov', '2025-11-20', [{ name: 'Meal', amount: 300, category: 'Dining' }], '2025-11-20T09:00:00Z')],
      });

      renderBudget();

      await waitFor(() => expect(screen.getByText('Dining')).toBeTruthy());
      expect(screen.getByText('₪0 / ₪100')).toBeTruthy();
      expect(screen.queryByText(/100%\+ of budget/)).toBeNull();
      expect(screen.queryByText(/90%\+ of budget/)).toBeNull();
    });

    it('uses created_at when the receipt date is invalid', async () => {
      mockGetBudgets.mockResolvedValue({ budgets: [budget('b1', 'Groceries', 100)] });
      mockGetReceipts.mockResolvedValue({
        receipts: [
          // Invalid OCR date, uploaded last month -> excluded
          receipt('old', 'unknown', [{ name: 'Old', amount: 70, category: 'Groceries' }], '2025-12-20T12:00:00Z'),
          // Invalid OCR date, uploaded this month -> included
          receipt('new', '', [{ name: 'New', amount: 30, category: 'Groceries' }], '2026-01-10T12:00:00Z'),
        ],
      });

      renderBudget();

      await waitFor(() => expect(screen.getByText('₪30 / ₪100')).toBeTruthy());
      expect(screen.getByText('30%')).toBeTruthy();
    });
  });

  describe('set-budget modal', () => {
    beforeEach(() => {
      mockGetBudgets.mockResolvedValue({ budgets: [budget('b1', 'Dining', 400)] });
      mockGetReceipts.mockResolvedValue({ receipts: [] });
    });

    async function renderLoaded() {
      renderBudget();
      await waitFor(() => expect(screen.getByTestId('budget-item-b1')).toBeTruthy());
    }

    it('is hidden initially', async () => {
      await renderLoaded();
      expect(screen.queryByText('Set Budget')).toBeNull();
    });

    it('opens the add modal with the first category selected and an empty limit', async () => {
      await renderLoaded();

      fireEvent.press(screen.getByTestId('budget-add-button'));

      expect(screen.getByText('Set Budget')).toBeTruthy();
      expect(screen.getByTestId('budget-limit-input').props.value).toBe('');
      const groceries = screen.getByTestId('budget-category-chip-Groceries');
      const dining = screen.getByTestId('budget-category-chip-Dining');
      expect(StyleSheet.flatten(groceries.props.style).backgroundColor).not.toBe(
        StyleSheet.flatten(dining.props.style).backgroundColor
      );
    });

    it('opens the edit modal pre-filled with the tapped budget', async () => {
      await renderLoaded();

      fireEvent.press(screen.getByTestId('budget-item-b1'));

      expect(screen.getByText('Set Budget')).toBeTruthy();
      expect(screen.getByTestId('budget-limit-input').props.value).toBe('400');

      // Saving without changes upserts the pre-filled category/limit
      mockUpsertBudget.mockResolvedValue({ budget: budget('b1', 'Dining', 400) });
      fireEvent.press(screen.getByTestId('budget-save-button'));
      await waitFor(() => expect(mockUpsertBudget).toHaveBeenCalledWith('Dining', 400, 'test-token'));
    });

    it('resets the form when opening add after edit', async () => {
      await renderLoaded();
      fireEvent.press(screen.getByTestId('budget-item-b1'));
      fireEvent.press(screen.getByTestId('budget-cancel-button'));
      fireEvent.press(screen.getByTestId('budget-add-button'));

      expect(screen.getByTestId('budget-limit-input').props.value).toBe('');
    });

    it.each([
      ['empty', ''],
      ['zero', '0'],
      ['negative', '-5'],
      ['non-numeric', 'abc'],
    ])('shows an Alert and does not save when the limit is %s', async (_label, value) => {
      await renderLoaded();
      fireEvent.press(screen.getByTestId('budget-add-button'));
      if (value) fireEvent.changeText(screen.getByTestId('budget-limit-input'), value);

      fireEvent.press(screen.getByTestId('budget-save-button'));

      expect(alertSpy).toHaveBeenCalledWith('Invalid limit', 'Enter a limit greater than 0.');
      expect(mockUpsertBudget).not.toHaveBeenCalled();
      expect(screen.getByText('Set Budget')).toBeTruthy();
    });

    it('saves the selected category and limit, then refreshes budgets and closes', async () => {
      await renderLoaded();
      fireEvent.press(screen.getByTestId('budget-add-button'));
      fireEvent.press(screen.getByTestId('budget-category-chip-Transport'));
      fireEvent.changeText(screen.getByTestId('budget-limit-input'), '250');

      mockUpsertBudget.mockResolvedValue({ budget: budget('b2', 'Transport', 250) });
      mockGetBudgets.mockResolvedValue({
        budgets: [budget('b1', 'Dining', 400), budget('b2', 'Transport', 250)],
      });

      fireEvent.press(screen.getByTestId('budget-save-button'));

      await waitFor(() => expect(screen.queryByText('Set Budget')).toBeNull());
      expect(mockUpsertBudget).toHaveBeenCalledTimes(1);
      expect(mockUpsertBudget).toHaveBeenCalledWith('Transport', 250, 'test-token');
      // Initial load + refresh after save
      expect(mockGetBudgets).toHaveBeenCalledTimes(2);
      expect(mockGetBudgets).toHaveBeenLastCalledWith('test-token');
      // Upsert happens before the refresh
      expect(mockUpsertBudget.mock.invocationCallOrder[0]).toBeLessThan(
        mockGetBudgets.mock.invocationCallOrder[1]
      );
      expect(screen.getByTestId('budget-item-b2')).toBeTruthy();
      expect(screen.getByText('₪0 / ₪250')).toBeTruthy();
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it('shows a spinner and disables the buttons while saving', async () => {
      await renderLoaded();
      fireEvent.press(screen.getByTestId('budget-add-button'));
      fireEvent.changeText(screen.getByTestId('budget-limit-input'), '100');

      let resolveUpsert: (v: unknown) => void = () => {};
      mockUpsertBudget.mockReturnValue(new Promise((resolve) => (resolveUpsert = resolve)));

      fireEvent.press(screen.getByTestId('budget-save-button'));

      await waitFor(() => expect(screen.queryByText('Save')).toBeNull());
      expect(screen.getByTestId('budget-save-button').props.accessibilityState).toMatchObject({ disabled: true });
      expect(screen.getByTestId('budget-cancel-button').props.accessibilityState).toMatchObject({ disabled: true });

      await act(async () => {
        resolveUpsert({ budget: budget('b9', 'Groceries', 100) });
      });
      await waitFor(() => expect(screen.queryByText('Set Budget')).toBeNull());
    });

    it('shows an Alert with the error message when saving fails and keeps the modal open', async () => {
      await renderLoaded();
      fireEvent.press(screen.getByTestId('budget-add-button'));
      fireEvent.changeText(screen.getByTestId('budget-limit-input'), '100');
      mockUpsertBudget.mockRejectedValue({ message: 'Server exploded' });

      fireEvent.press(screen.getByTestId('budget-save-button'));

      await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Failed to save budget', 'Server exploded'));
      expect(screen.getByText('Set Budget')).toBeTruthy();
      // Only the initial load; no refresh after a failed save
      expect(mockGetBudgets).toHaveBeenCalledTimes(1);
      // Save button is usable again
      expect(screen.getByText('Save')).toBeTruthy();
    });

    it('shows a default Alert message when the save error has none', async () => {
      await renderLoaded();
      fireEvent.press(screen.getByTestId('budget-add-button'));
      fireEvent.changeText(screen.getByTestId('budget-limit-input'), '100');
      mockUpsertBudget.mockRejectedValue({});

      fireEvent.press(screen.getByTestId('budget-save-button'));

      await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Failed to save budget', 'Please try again.'));
    });

    it('shows an Alert when the refresh after save fails', async () => {
      await renderLoaded();
      fireEvent.press(screen.getByTestId('budget-add-button'));
      fireEvent.changeText(screen.getByTestId('budget-limit-input'), '100');
      mockUpsertBudget.mockResolvedValue({ budget: budget('b9', 'Groceries', 100) });
      mockGetBudgets.mockRejectedValue({ message: 'Failed to load budgets' });

      fireEvent.press(screen.getByTestId('budget-save-button'));

      await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Failed to save budget', 'Failed to load budgets'));
    });

    it('closes without saving when Cancel is pressed', async () => {
      await renderLoaded();
      fireEvent.press(screen.getByTestId('budget-add-button'));
      fireEvent.changeText(screen.getByTestId('budget-limit-input'), '100');

      fireEvent.press(screen.getByTestId('budget-cancel-button'));

      expect(screen.queryByText('Set Budget')).toBeNull();
      expect(mockUpsertBudget).not.toHaveBeenCalled();
    });

    it('closes when the modal receives a hardware back / request-close', async () => {
      await renderLoaded();
      fireEvent.press(screen.getByTestId('budget-add-button'));
      expect(screen.getByText('Set Budget')).toBeTruthy();

      fireEvent(screen.getByTestId('budget-modal'), 'requestClose');

      expect(screen.queryByText('Set Budget')).toBeNull();
    });
  });

  describe('without an access token', () => {
    it('does not fetch and does not save', async () => {
      renderBudget(null);

      expect(mockGetBudgets).not.toHaveBeenCalled();
      expect(mockGetReceipts).not.toHaveBeenCalled();

      fireEvent.press(screen.getByTestId('budget-add-button'));
      fireEvent.changeText(screen.getByTestId('budget-limit-input'), '100');
      fireEvent.press(screen.getByTestId('budget-save-button'));

      expect(mockUpsertBudget).not.toHaveBeenCalled();
      expect(alertSpy).not.toHaveBeenCalled();
    });
  });

  describe('currency formatting (formatCurrency: ₪ + thousands separators)', () => {
    it('formats per-budget and summary amounts with thousands separators', async () => {
      mockGetBudgets.mockResolvedValue({
        budgets: [budget('b1', 'Groceries', 4200), budget('b2', 'Dining', 1000)],
      });
      mockGetReceipts.mockResolvedValue({
        receipts: [
          receipt('r1', '2026-01-05', [
            { name: 'Food', amount: 2847, category: 'Groceries' },
            { name: 'Meal', amount: 100, category: 'Dining' },
          ]),
        ],
      });

      renderBudget();

      await waitFor(() => expect(screen.getByText('₪2,847 / ₪4,200')).toBeTruthy());
      expect(screen.getByText('₪100 / ₪1,000')).toBeTruthy();
      expect(screen.getByTestId('budget-total-spent').props.children).toBe('₪2,947');
      expect(screen.getByTestId('budget-total-limit').props.children).toBe('₪5,200');
      expect(screen.getByTestId('budget-remaining').props.children).toBe('₪2,253');
      expect(StyleSheet.flatten(screen.getByTestId('budget-remaining').props.style).color).toBe(COLORS.success);
    });

    it('shows a negative remaining amount as "-₪…" in the danger color', async () => {
      mockGetBudgets.mockResolvedValue({ budgets: [budget('b1', 'Groceries', 1000)] });
      mockGetReceipts.mockResolvedValue({
        receipts: [receipt('r1', '2026-01-05', [{ name: 'Food', amount: 1050, category: 'Groceries' }])],
      });

      renderBudget();

      await waitFor(() => expect(screen.getByTestId('budget-remaining').props.children).toBe('-₪50'));
      expect(StyleSheet.flatten(screen.getByTestId('budget-remaining').props.style).color).toBe(COLORS.danger);
      expect(screen.getByText('₪1,050 / ₪1,000')).toBeTruthy();
    });

    it('shows exactly zero remaining in the success color', async () => {
      mockGetBudgets.mockResolvedValue({ budgets: [budget('b1', 'Groceries', 1000)] });
      mockGetReceipts.mockResolvedValue({
        receipts: [receipt('r1', '2026-01-05', [{ name: 'Food', amount: 1000, category: 'Groceries' }])],
      });

      renderBudget();

      await waitFor(() => expect(screen.getByTestId('budget-remaining').props.children).toBe('₪0'));
      expect(StyleSheet.flatten(screen.getByTestId('budget-remaining').props.style).color).toBe(COLORS.success);
    });
  });

  describe('header (spec: white bg, full-bleed)', () => {
    async function renderSettled() {
      mockGetBudgets.mockResolvedValue({ budgets: [] });
      mockGetReceipts.mockResolvedValue({ receipts: [] });
      renderBudget();
      await waitFor(() => expect(screen.getByText('No budgets set')).toBeTruthy());
    }

    it('gives the header a white (surface) background', async () => {
      await renderSettled();
      expect(StyleSheet.flatten(screen.getByTestId('budget-header').props.style).backgroundColor).toBe(COLORS.surface);
    });

    it('makes the + button visible: its bg differs from the header bg', async () => {
      await renderSettled();
      const headerBg = StyleSheet.flatten(screen.getByTestId('budget-header').props.style).backgroundColor;
      const addBg = StyleSheet.flatten(screen.getByTestId('budget-add-button').props.style).backgroundColor;
      expect(addBg).toBe(COLORS.background); // spec: 30px #f2f2f7 circle
      expect(addBg).not.toBe(headerBg);
    });

    it('is full-bleed: white safe area (status bar strip) and no horizontal inset', async () => {
      await renderSettled();
      const root = StyleSheet.flatten(screen.getByTestId('budget-screen').props.style);
      const header = StyleSheet.flatten(screen.getByTestId('budget-header').props.style);
      expect(root.backgroundColor).toBe(COLORS.surface);
      expect(root.padding ?? root.paddingHorizontal ?? 0).toBe(0);
      expect(header.margin ?? header.marginHorizontal ?? 0).toBe(0);
    });

    it('keeps the page below the header grey', async () => {
      await renderSettled();
      expect(StyleSheet.flatten(screen.getByTestId('budget-scroll').props.style).backgroundColor).toBe(
        COLORS.background
      );
    });
  });
});
