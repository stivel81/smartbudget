import React from 'react';
import { Image, StyleSheet } from 'react-native';
import { act, render, screen, waitFor, fireEvent, within } from '@testing-library/react-native';
import { budgetBarColor, COLORS } from '../../lib/theme';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ navigate: mockNavigate }),
    // Run the focus effect immediately on mount instead of requiring a real navigator.
    useFocusEffect: (effect: () => void | (() => void)) => {
      const React = require('react');
      React.useEffect(effect, []);
    },
  };
});

const mockGetReceipts = jest.fn();
const mockGetReceiptImageUrl = jest.fn();
const mockGetBudgets = jest.fn();
const mockUpdateItemCategories = jest.fn();
jest.mock('../../lib/api', () => ({
  getReceipts: (...args: unknown[]) => mockGetReceipts(...args),
  getReceiptImageUrl: (...args: unknown[]) => mockGetReceiptImageUrl(...args),
  getBudgets: (...args: unknown[]) => mockGetBudgets(...args),
  updateItemCategories: (...args: unknown[]) => mockUpdateItemCategories(...args),
}));

import DashboardScreen from '../../screens/DashboardScreen';
import { AuthContext } from '../../lib/auth';

// Pin "now" to Thursday 22 Jan 2026, 09:00 local, so month/week filtering
// and the greeting don't depend on when the suite runs.
const NOW = new Date(2026, 0, 22, 9, 0, 0);

function renderDashboard(
  {
    accessToken = 'test-token',
    refreshToken = 'test-refresh-token',
    userEmail = 'test@example.com',
    userName = null,
  }: { accessToken?: string | null; refreshToken?: string | null; userEmail?: string | null; userName?: string | null } = {}
) {
  return render(
    <AuthContext.Provider
      value={{
        isAuthenticated: true,
        setIsAuthenticated: () => {},
        accessToken,
        setAccessToken: () => {},
        refreshToken,
        setRefreshToken: () => {},
        userEmail,
        setUserEmail: () => {},
        userName,
        setUserName: () => {},
        expiresAt: null,
        setExpiresAt: () => {},
        sessionNotice: null,
        setSessionNotice: () => {},
        logout: async () => {},
      }}
    >
      <DashboardScreen />
    </AuthContext.Provider>
  );
}

function receipt(
  id: string,
  opts: { date: string; total: number; items?: { name: string; amount: number; category: string }[]; created_at?: string; merchant?: string }
) {
  return {
    id,
    user_id: 'u1',
    created_at: opts.created_at ?? '2026-01-01T00:00:00Z',
    image_path: null,
    raw_response: {
      merchant: opts.merchant ?? `Merchant ${id}`,
      total: opts.total,
      date: opts.date,
      items: opts.items ?? [],
    },
  };
}

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

function textOf(testID: string): string {
  const children = screen.getByTestId(testID).props.children;
  return Array.isArray(children) ? children.join('') : String(children);
}

describe('DashboardScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('shows the empty state when there are no receipts', async () => {
    mockGetReceipts.mockResolvedValue({ receipts: [] });
    mockGetBudgets.mockResolvedValue({ budgets: [] });

    renderDashboard();

    await waitFor(() => expect(screen.getByText('No receipts yet')).toBeTruthy());
    // Hero card should show ₪0 spent
    expect(screen.getByText('SPENT THIS MONTH')).toBeTruthy();
  });

  it('renders hero card with spent this month and stats row', async () => {
    const twoWeeksAgo = new Date(NOW.getTime() - 14 * 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000);

    mockGetReceipts.mockResolvedValue({
      receipts: [
        {
          id: 'r1',
          user_id: 'u1',
          created_at: twoWeeksAgo.toISOString(),
          raw_response: {
            merchant: 'Rami Levy',
            total: 100,
            date: '2026-01-08',
            items: [{ name: 'Groceries', amount: 100, category: 'Groceries' }],
          },
        },
        {
          id: 'r2',
          user_id: 'u1',
          created_at: threeDaysAgo.toISOString(),
          raw_response: {
            merchant: 'Cafe Aroma',
            total: 50,
            date: '2026-01-19',
            items: [{ name: 'Coffee', amount: 50, category: 'Dining' }],
          },
        },
      ],
    });
    mockGetBudgets.mockResolvedValue({
      budgets: [
        {
          id: 'b1',
          user_id: 'u1',
          category: 'Groceries',
          monthly_limit: 1000,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'b2',
          user_id: 'u1',
          category: 'Dining',
          monthly_limit: 400,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    });

    renderDashboard();

    // Hero card shows "SPENT THIS MONTH" with amount 150
    await waitFor(() => expect(screen.getByText('SPENT THIS MONTH')).toBeTruthy());
    const allByText150 = screen.queryAllByText('₪150');
    expect(allByText150.length).toBeGreaterThan(0); // Should appear in hero card
    expect(screen.getByText('of ₪1,400 budget')).toBeTruthy(); // 1000 + 400
    // Stats row shows this week, receipts count, budget % used
    expect(screen.getByText('This week')).toBeTruthy();
    expect(screen.getByText('Receipts')).toBeTruthy();
    expect(screen.getByText('Budget used')).toBeTruthy();
    expect(screen.getByText('Rami Levy')).toBeTruthy(); // Recent list with old receipt
    expect(screen.getByText('Cafe Aroma')).toBeTruthy(); // Recent list with recent receipt
    expect(textOf('hero-spent')).toBe('₪150');
    expect(textOf('hero-week')).toBe('₪50'); // only the receipt from 3 days ago
    expect(textOf('hero-count')).toBe('2');
    expect(textOf('hero-budget-pct')).toBe('11%'); // 150 / 1400
  });

  it('renders real totals and category breakdown from fetched receipts', async () => {
    mockGetReceipts.mockResolvedValue({
      receipts: [
        {
          id: 'r1',
          user_id: 'u1',
          created_at: '2026-01-02T00:00:00Z',
          raw_response: {
            merchant: 'Rami Levy',
            total: 100,
            date: '2026-01-02',
            items: [{ name: 'Milk', amount: 60, category: 'Groceries' }],
          },
        },
        {
          id: 'r2',
          user_id: 'u1',
          created_at: '2026-01-01T00:00:00Z',
          raw_response: {
            merchant: 'Cafe Aroma',
            total: 40,
            date: '2026-01-01',
            items: [{ name: 'Coffee', amount: 40, category: 'Dining' }],
          },
        },
      ],
    });
    mockGetBudgets.mockResolvedValue({ budgets: [] });

    renderDashboard();

    await waitFor(() => expect(screen.getByText('₪140')).toBeTruthy());
    expect(screen.getByText('2')).toBeTruthy(); // receipt count
    expect(screen.getByText('Rami Levy')).toBeTruthy();
    expect(screen.getByText('Cafe Aroma')).toBeTruthy();
    expect(screen.getByText('Groceries')).toBeTruthy();
    expect(screen.getByText('Dining')).toBeTruthy();
  });

  it('right-aligns a Hebrew merchant name but left-aligns an English one', async () => {
    mockGetReceipts.mockResolvedValue({
      receipts: [
        {
          id: 'r1',
          user_id: 'u1',
          created_at: '2026-01-01T00:00:00Z',
          raw_response: { merchant: 'טיטניום בע"מ', total: 350, date: '2026-01-01', items: [] },
        },
        {
          id: 'r2',
          user_id: 'u1',
          created_at: '2026-01-02T00:00:00Z',
          raw_response: { merchant: 'Rami Levy', total: 100, date: '2026-01-02', items: [] },
        },
      ],
    });
    mockGetBudgets.mockResolvedValue({ budgets: [] });

    renderDashboard();

    const hebrewMerchant = await screen.findByText('טיטניום בע"מ');
    expect(StyleSheet.flatten(hebrewMerchant.props.style)).toMatchObject({
      textAlign: 'right',
      writingDirection: 'rtl',
    });

    const englishMerchant = screen.getByText('Rami Levy');
    expect(StyleSheet.flatten(englishMerchant.props.style)).toMatchObject({
      textAlign: 'left',
      writingDirection: 'ltr',
    });
  });

  it('category progress bar uses budgetBarColor when budget exists', async () => {
    mockGetReceipts.mockResolvedValue({
      receipts: [
        {
          id: 'r1',
          user_id: 'u1',
          created_at: '2026-01-02T00:00:00Z',
          raw_response: {
            merchant: 'Rami Levy',
            total: 82,
            date: '2026-01-02',
            items: [{ name: 'Groceries', amount: 82, category: 'Groceries' }],
          },
        },
      ],
    });
    mockGetBudgets.mockResolvedValue({
      budgets: [
        {
          id: 'b1',
          user_id: 'u1',
          category: 'Groceries',
          monthly_limit: 100,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    });

    renderDashboard();

    await waitFor(() => expect(screen.getByText('Spending by Category')).toBeTruthy());
    expect(screen.getByText('Groceries')).toBeTruthy(); // category in grid
    const bar = StyleSheet.flatten(screen.getByTestId('category-bar-Groceries').props.style);
    expect(bar.width).toBe('82%');
    expect(bar.backgroundColor).toBe(budgetBarColor(82));
  });

  it('category progress bar shows share of total spend in the success color when no budget exists', async () => {
    mockGetReceipts.mockResolvedValue({
      receipts: [
        receipt('r1', {
          date: '2026-01-10',
          total: 100,
          items: [
            { name: 'Milk', amount: 75, category: 'Groceries' },
            { name: 'Coffee', amount: 25, category: 'Dining' },
          ],
        }),
      ],
    });
    mockGetBudgets.mockResolvedValue({ budgets: [] });

    renderDashboard();

    await waitFor(() => expect(screen.getByTestId('category-bar-Groceries')).toBeTruthy());
    const groceries = StyleSheet.flatten(screen.getByTestId('category-bar-Groceries').props.style);
    const dining = StyleSheet.flatten(screen.getByTestId('category-bar-Dining').props.style);
    expect(groceries.width).toBe('75%');
    expect(dining.width).toBe('25%');
    expect(groceries.backgroundColor).toBe(COLORS.success);
  });

  it('caps an over-budget category bar at 100% width', async () => {
    mockGetReceipts.mockResolvedValue({
      receipts: [
        receipt('r1', { date: '2026-01-10', total: 300, items: [{ name: 'Meal', amount: 300, category: 'Dining' }] }),
      ],
    });
    mockGetBudgets.mockResolvedValue({ budgets: [budget('b1', 'Dining', 100)] });

    renderDashboard();

    await waitFor(() => expect(screen.getByTestId('category-bar-Dining')).toBeTruthy());
    const bar = StyleSheet.flatten(screen.getByTestId('category-bar-Dining').props.style);
    expect(bar.width).toBe('100%');
    expect(bar.backgroundColor).toBe(budgetBarColor(300));
    expect(textOf('hero-budget-pct')).toBe('300%');
  });

  describe('current-month filtering', () => {
    const RECEIPTS = [
      // This month
      receipt('jan-a', {
        merchant: 'Rami Levy',
        date: '2026-01-20',
        total: 120,
        items: [{ name: 'Milk', amount: 120, category: 'Groceries' }],
      }),
      receipt('jan-b', {
        merchant: 'Cafe Aroma',
        date: '2026-01-01',
        total: 30,
        items: [{ name: 'Coffee', amount: 30, category: 'Dining' }],
      }),
      // Previous month (last day of December), uploaded in January
      receipt('dec', {
        merchant: 'Big Electronics',
        date: '2025-12-31',
        total: 900,
        created_at: '2026-01-02T08:00:00Z',
        items: [{ name: 'TV', amount: 900, category: 'Entertainment' }],
      }),
      // Two months ago, bad OCR date -> falls back to created_at
      receipt('nov', {
        merchant: 'Old Pharmacy',
        date: 'n/a',
        total: 400,
        created_at: '2025-11-15T08:00:00Z',
        items: [{ name: 'Pills', amount: 400, category: 'Health' }],
      }),
    ];

    it('excludes previous-month receipts from hero total, %, count and category bars', async () => {
      mockGetReceipts.mockResolvedValue({ receipts: RECEIPTS });
      mockGetBudgets.mockResolvedValue({ budgets: [budget('b1', 'Groceries', 200), budget('b2', 'Entertainment', 100)] });

      renderDashboard();

      await waitFor(() => expect(screen.getByText('Spending by Category')).toBeTruthy());
      expect(textOf('hero-spent')).toBe('₪150'); // 120 + 30, not 1450
      expect(screen.getByText('of ₪300 budget')).toBeTruthy();
      expect(textOf('hero-budget-pct')).toBe('50%'); // 150 / 300
      expect(textOf('hero-count')).toBe('2');
      expect(screen.getByTestId('category-bar-Groceries')).toBeTruthy();
      expect(screen.getByTestId('category-bar-Dining')).toBeTruthy();
      expect(screen.queryByTestId('category-bar-Entertainment')).toBeNull();
      expect(screen.queryByTestId('category-bar-Health')).toBeNull();
      expect(screen.queryByText('₪900')).toBeNull();
    });

    it('still shows previous-month receipts in the Recent list', async () => {
      mockGetReceipts.mockResolvedValue({ receipts: RECEIPTS });
      mockGetBudgets.mockResolvedValue({ budgets: [] });

      renderDashboard();

      await waitFor(() => expect(screen.getByText('Recent Receipts')).toBeTruthy());
      expect(screen.getByTestId('receipt-item-jan-a')).toBeTruthy();
      expect(screen.getByTestId('receipt-item-jan-b')).toBeTruthy();
      expect(screen.getByTestId('receipt-item-dec')).toBeTruthy();
      expect(screen.getByTestId('receipt-item-nov')).toBeTruthy();
      expect(screen.getByText('Big Electronics')).toBeTruthy();
    });

    it('limits the Recent list to the latest 5 receipts', async () => {
      const many = Array.from({ length: 7 }, (_, i) =>
        receipt(`r${i}`, { date: '2026-01-10', total: 1 })
      );
      mockGetReceipts.mockResolvedValue({ receipts: many });
      mockGetBudgets.mockResolvedValue({ budgets: [] });

      renderDashboard();

      await waitFor(() => expect(screen.getByTestId('receipt-item-r4')).toBeTruthy());
      expect(screen.queryByTestId('receipt-item-r5')).toBeNull();
      expect(textOf('hero-count')).toBe('7');
    });

    it('shows no category section when all receipts are from previous months', async () => {
      mockGetReceipts.mockResolvedValue({ receipts: [RECEIPTS[2], RECEIPTS[3]] });
      mockGetBudgets.mockResolvedValue({ budgets: [budget('b1', 'Entertainment', 100)] });

      renderDashboard();

      await waitFor(() => expect(screen.getByText('Recent Receipts')).toBeTruthy());
      expect(screen.queryByText('Spending by Category')).toBeNull();
      expect(textOf('hero-spent')).toBe('₪0');
      expect(textOf('hero-count')).toBe('0');
      expect(textOf('hero-budget-pct')).toBe('0%');
      expect(screen.queryByText('No receipts yet')).toBeNull();
    });

    it('counts "this week" by receipt date across the month boundary', async () => {
      // NOW is Jan 22; pin to Jan 3 so the week spans Dec 27 – Jan 3.
      jest.setSystemTime(new Date(2026, 0, 3, 12, 0, 0));
      mockGetReceipts.mockResolvedValue({
        receipts: [
          receipt('dec30', { date: '2025-12-30', total: 40 }),
          receipt('dec20', { date: '2025-12-20', total: 500 }),
          receipt('jan2', { date: '2026-01-02', total: 10 }),
        ],
      });
      mockGetBudgets.mockResolvedValue({ budgets: [] });

      renderDashboard();

      await waitFor(() => expect(screen.getByText('Recent Receipts')).toBeTruthy());
      expect(textOf('hero-week')).toBe('₪50'); // Dec 30 + Jan 2
      expect(textOf('hero-spent')).toBe('₪10'); // only January
    });
  });

  describe('without budgets', () => {
    it('shows no "of ₪X budget" line and "—" / "No budget" instead of 0% (never NaN)', async () => {
      mockGetReceipts.mockResolvedValue({
        receipts: [
          receipt('r1', { date: '2026-01-10', total: 80, items: [{ name: 'Milk', amount: 80, category: 'Groceries' }] }),
        ],
      });
      mockGetBudgets.mockResolvedValue({ budgets: [] });

      renderDashboard();

      await waitFor(() => expect(screen.getByText('Spending by Category')).toBeTruthy());
      expect(screen.queryByText(/of ₪[\d,]+ budget/)).toBeNull();
      expect(textOf('hero-budget-pct')).toBe('—');
      expect(textOf('hero-budget-label')).toBe('No budget');
      expect(screen.queryByText('Budget used')).toBeNull();
      expect(screen.queryByText(/^\d+%$/)).toBeNull();
      expect(screen.queryByText(/NaN|Infinity/)).toBeNull();
      const bar = StyleSheet.flatten(screen.getByTestId('category-bar-Groceries').props.style);
      expect(bar.width).toBe('100%');
    });

    it('shows ₪0 and "—" with no receipts and no budgets, and never "0%"', async () => {
      mockGetReceipts.mockResolvedValue({ receipts: [] });
      mockGetBudgets.mockResolvedValue({ budgets: [] });

      renderDashboard();

      await waitFor(() => expect(screen.getByText('No receipts yet')).toBeTruthy());
      expect(textOf('hero-spent')).toBe('₪0');
      expect(textOf('hero-week')).toBe('₪0');
      expect(textOf('hero-count')).toBe('0');
      expect(textOf('hero-budget-pct')).toBe('—');
      expect(screen.getByText('No budget')).toBeTruthy();
      expect(screen.queryByText('0%')).toBeNull();
      expect(screen.queryByText(/NaN|Infinity/)).toBeNull();
    });

    it('treats budgets whose limits sum to 0 as no budget', async () => {
      mockGetReceipts.mockResolvedValue({ receipts: [] });
      mockGetBudgets.mockResolvedValue({ budgets: [budget('b1', 'Groceries', 0)] });

      renderDashboard();

      await waitFor(() => expect(screen.getByText('No receipts yet')).toBeTruthy());
      expect(textOf('hero-budget-pct')).toBe('—');
      expect(screen.queryByText('0%')).toBeNull();
    });

    it('makes the "No budget" stat a button that opens the Budget tab', async () => {
      mockGetReceipts.mockResolvedValue({ receipts: [] });
      mockGetBudgets.mockResolvedValue({ budgets: [] });

      renderDashboard();
      await waitFor(() => expect(screen.getByText('No receipts yet')).toBeTruthy());

      const stat = screen.getByTestId('hero-budget-stat');
      expect(stat.props.accessibilityRole).toBe('button');
      fireEvent.press(stat);

      expect(mockNavigate).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith('Budget');
    });
  });

  describe('with budgets', () => {
    it('shows the rounded % and "Budget used", and the stat is not a button', async () => {
      mockGetReceipts.mockResolvedValue({
        receipts: [receipt('r1', { date: '2026-01-10', total: 125, items: [{ name: 'Milk', amount: 125, category: 'Groceries' }] })],
      });
      mockGetBudgets.mockResolvedValue({ budgets: [budget('b1', 'Groceries', 300)] });

      renderDashboard();

      await waitFor(() => expect(textOf('hero-budget-pct')).toBe('42%'));
      expect(textOf('hero-budget-label')).toBe('Budget used');
      expect(screen.queryByText('No budget')).toBeNull();
      expect(screen.queryByText('—')).toBeNull();
      expect(screen.getByTestId('hero-budget-stat').props.accessibilityRole).toBeUndefined();
      fireEvent.press(screen.getByTestId('hero-budget-stat'));
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('shows 0% (a real value) when a budget exists but nothing is spent', async () => {
      mockGetReceipts.mockResolvedValue({ receipts: [] });
      mockGetBudgets.mockResolvedValue({ budgets: [budget('b1', 'Groceries', 300)] });

      renderDashboard();

      await waitFor(() => expect(textOf('hero-budget-pct')).toBe('0%'));
      expect(textOf('hero-budget-label')).toBe('Budget used');
    });
  });

  describe('empty state', () => {
    it('offers a primary "Scan your first receipt" button that opens the Scan tab', async () => {
      mockGetReceipts.mockResolvedValue({ receipts: [] });
      mockGetBudgets.mockResolvedValue({ budgets: [] });

      renderDashboard();
      await waitFor(() => expect(screen.getByText('No receipts yet')).toBeTruthy());

      const button = screen.getByTestId('dashboard-scan-first');
      expect(within(button).getByText('Scan your first receipt')).toBeTruthy();
      expect(button.props.accessibilityRole).toBe('button');
      expect(StyleSheet.flatten(button.props.style).backgroundColor).toBe(COLORS.button);
      fireEvent.press(button);

      expect(mockNavigate).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith('Scan');
    });

    it('has no scan button once there are receipts', async () => {
      mockGetReceipts.mockResolvedValue({ receipts: [receipt('r1', { date: '2026-01-10', total: 5 })] });
      mockGetBudgets.mockResolvedValue({ budgets: [] });

      renderDashboard();

      await waitFor(() => expect(screen.getByText('Recent Receipts')).toBeTruthy());
      expect(screen.queryByTestId('dashboard-scan-first')).toBeNull();
      expect(screen.queryByText('No receipts yet')).toBeNull();
    });

    it('has no scan button while loading or after a load error', async () => {
      let rejectLoad!: (e: unknown) => void;
      mockGetReceipts.mockReturnValue(new Promise((_r, rej) => (rejectLoad = rej)));
      mockGetBudgets.mockResolvedValue({ budgets: [] });

      renderDashboard();
      expect(screen.queryByTestId('dashboard-scan-first')).toBeNull();

      rejectLoad({ message: 'Failed to load receipts' });
      await waitFor(() => expect(screen.getByText('Failed to load receipts')).toBeTruthy());
      expect(screen.queryByTestId('dashboard-scan-first')).toBeNull();
    });
  });

  describe('greeting', () => {
    it.each([
      [9, 'Good morning'],
      [14, 'Good afternoon'],
      [19, 'Good evening'],
      [2, 'Good evening'],
    ])('at %i:00 local time shows "%s"', async (hour, expected) => {
      jest.setSystemTime(new Date(2026, 0, 22, hour, 0));
      mockGetReceipts.mockResolvedValue({ receipts: [] });
      mockGetBudgets.mockResolvedValue({ budgets: [] });

      renderDashboard();

      await waitFor(() => expect(screen.getByText('No receipts yet')).toBeTruthy());
      expect(textOf('dashboard-greeting')).toBe(expected);
    });
  });

  describe('greeting with the user\'s name', () => {
    it('adds the first name when a name is known', async () => {
      jest.setSystemTime(new Date(2026, 0, 22, 19, 0));
      mockGetReceipts.mockResolvedValue({ receipts: [] });
      mockGetBudgets.mockResolvedValue({ budgets: [] });

      renderDashboard({ userName: 'Adrian Schtivelmager' });

      await waitFor(() => expect(screen.getByText('No receipts yet')).toBeTruthy());
      expect(textOf('dashboard-greeting')).toBe('Good evening, Adrian');
    });

    it.each([null, '', '   '])('shows no name for userName %p', async (userName) => {
      jest.setSystemTime(new Date(2026, 0, 22, 19, 0));
      mockGetReceipts.mockResolvedValue({ receipts: [] });
      mockGetBudgets.mockResolvedValue({ budgets: [] });

      renderDashboard({ userName });

      await waitFor(() => expect(screen.getByText('No receipts yet')).toBeTruthy());
      expect(textOf('dashboard-greeting')).toBe('Good evening');
    });
  });

  describe('avatar initials', () => {
    it.each([
      ['Adrian Schtivelmager', 'stivel@gmail.com', 'AS'],
      [null, 'stivel@gmail.com', 'ST'],
      ['אדריאן שטיבלמגר', 'stivel@gmail.com', 'אש'],
      [null, null, '?'],
    ])('name %p + email %p -> %p', async (userName, userEmail, expected) => {
      mockGetReceipts.mockResolvedValue({ receipts: [] });
      mockGetBudgets.mockResolvedValue({ budgets: [] });

      renderDashboard({ userName, userEmail });

      await waitFor(() => expect(screen.getByText('No receipts yet')).toBeTruthy());
      expect(within(screen.getByTestId('dashboard-avatar')).getByText(expected)).toBeTruthy();
    });
  });

  it('does not fetch when signed out', () => {
    renderDashboard({ accessToken: null, refreshToken: null });

    expect(mockGetReceipts).not.toHaveBeenCalled();
    expect(mockGetBudgets).not.toHaveBeenCalled();
  });

  it('falls back to a default error message when the error has none', async () => {
    mockGetReceipts.mockRejectedValue({});
    mockGetBudgets.mockResolvedValue({ budgets: [] });

    renderDashboard();

    await waitFor(() => expect(screen.getByText('Failed to load receipts')).toBeTruthy());
  });

  it('shows an error message when the fetch fails', async () => {
    mockGetReceipts.mockRejectedValue({ message: 'Failed to load receipts' });
    mockGetBudgets.mockResolvedValue({ budgets: [] });

    renderDashboard();

    await waitFor(() => expect(screen.getByText('Failed to load receipts')).toBeTruthy());
  });

  describe('receipt image modal', () => {
    const RECEIPT = {
      id: 'r1',
      user_id: 'u1',
      created_at: '2026-01-02T00:00:00Z',
      raw_response: {
        merchant: 'Rami Levy',
        total: 100,
        date: '2026-01-02',
        items: [{ name: 'Milk', amount: 60, category: 'Groceries' }],
      },
    };

    it('opens the image modal on tap and shows the signed image URL', async () => {
      mockGetReceipts.mockResolvedValue({ receipts: [RECEIPT] });
      mockGetBudgets.mockResolvedValue({ budgets: [] });
      mockGetReceiptImageUrl.mockResolvedValue('https://example.com/signed-image.jpg');

      renderDashboard();
      await waitFor(() => expect(screen.getByTestId('receipt-item-r1')).toBeTruthy());

      fireEvent.press(screen.getByTestId('receipt-item-r1'));

      await waitFor(() => expect(mockGetReceiptImageUrl).toHaveBeenCalledWith('r1'));
      await waitFor(() => expect(screen.getByTestId('receipt-modal-close')).toBeTruthy());
    });

    it('shows a default error inside the modal when the error has no message', async () => {
      mockGetReceipts.mockResolvedValue({ receipts: [RECEIPT] });
      mockGetBudgets.mockResolvedValue({ budgets: [] });
      mockGetReceiptImageUrl.mockRejectedValue({});

      renderDashboard();
      await waitFor(() => expect(screen.getByTestId('receipt-item-r1')).toBeTruthy());

      fireEvent.press(screen.getByTestId('receipt-item-r1'));

      await waitFor(() => expect(screen.getByText('No image available for this receipt')).toBeTruthy());
    });

    it('ignores an image URL that resolves after the modal is closed', async () => {
      mockGetReceipts.mockResolvedValue({ receipts: [RECEIPT] });
      mockGetBudgets.mockResolvedValue({ budgets: [] });
      let resolveUrl: (v: string) => void = () => {};
      mockGetReceiptImageUrl.mockReturnValue(new Promise<string>((resolve) => (resolveUrl = resolve)));

      renderDashboard();
      await waitFor(() => expect(screen.getByTestId('receipt-item-r1')).toBeTruthy());
      fireEvent.press(screen.getByTestId('receipt-item-r1'));
      await waitFor(() => expect(screen.getByTestId('receipt-modal-close')).toBeTruthy());
      fireEvent.press(screen.getByTestId('receipt-modal-close'));

      resolveUrl('https://example.com/late.jpg');
      await waitFor(() => expect(screen.queryByTestId('receipt-modal-close')).toBeNull());
    });

    it('ignores an image error that arrives after the modal is closed', async () => {
      mockGetReceipts.mockResolvedValue({ receipts: [RECEIPT] });
      mockGetBudgets.mockResolvedValue({ budgets: [] });
      let rejectUrl: (e: unknown) => void = () => {};
      mockGetReceiptImageUrl.mockReturnValue(new Promise<string>((_resolve, reject) => (rejectUrl = reject)));

      renderDashboard();
      await waitFor(() => expect(screen.getByTestId('receipt-item-r1')).toBeTruthy());
      fireEvent.press(screen.getByTestId('receipt-item-r1'));
      await waitFor(() => expect(screen.getByTestId('receipt-modal-close')).toBeTruthy());
      fireEvent.press(screen.getByTestId('receipt-modal-close'));

      rejectUrl({ message: 'late failure' });
      await waitFor(() => expect(screen.queryByText('late failure')).toBeNull());
    });

    it('shows an error inside the modal when the receipt has no image', async () => {
      mockGetReceipts.mockResolvedValue({ receipts: [RECEIPT] });
      mockGetBudgets.mockResolvedValue({ budgets: [] });
      mockGetReceiptImageUrl.mockRejectedValue({ message: 'This receipt has no stored image' });

      renderDashboard();
      await waitFor(() => expect(screen.getByTestId('receipt-item-r1')).toBeTruthy());

      fireEvent.press(screen.getByTestId('receipt-item-r1'));

      await waitFor(() => expect(screen.getByText('This receipt has no stored image')).toBeTruthy());
    });

    it('closes the modal when the close button is pressed', async () => {
      mockGetReceipts.mockResolvedValue({ receipts: [RECEIPT] });
      mockGetBudgets.mockResolvedValue({ budgets: [] });
      mockGetReceiptImageUrl.mockResolvedValue('https://example.com/signed-image.jpg');

      renderDashboard();
      await waitFor(() => expect(screen.getByTestId('receipt-item-r1')).toBeTruthy());
      fireEvent.press(screen.getByTestId('receipt-item-r1'));
      await waitFor(() => expect(screen.getByTestId('receipt-modal-close')).toBeTruthy());

      fireEvent.press(screen.getByTestId('receipt-modal-close'));

      await waitFor(() => expect(screen.queryByTestId('receipt-modal-close')).toBeNull());
    });
  });

  describe('currency formatting (formatCurrency: ₪ + thousands separators)', () => {
    it('formats hero, week, budget, category and receipt amounts with separators', async () => {
      mockGetReceipts.mockResolvedValue({
        receipts: [
          // 3 days before NOW: counts toward this week and this month
          receipt('r1', {
            date: '2026-01-19',
            total: 1673,
            merchant: 'Big Shop',
            items: [{ name: 'TV', amount: 1673, category: 'Entertainment' }],
          }),
          // earlier this month: month only
          receipt('r2', {
            date: '2026-01-02',
            total: 1234.5,
            merchant: 'Rami Levy',
            items: [{ name: 'Groceries', amount: 1234.5, category: 'Groceries' }],
          }),
        ],
      });
      mockGetBudgets.mockResolvedValue({ budgets: [budget('b1', 'Groceries', 4200)] });

      renderDashboard();

      await waitFor(() => expect(textOf('hero-spent')).toBe('₪2,908')); // 1673 + 1234.5, rounded
      expect(textOf('hero-week')).toBe('₪1,673');
      expect(screen.getByText('of ₪4,200 budget')).toBeTruthy();
      // Category cards (whole shekels); ₪1,673 is also the hero "This week" value
      expect(screen.getAllByText('₪1,673')).toHaveLength(2);
      expect(screen.getByText('₪1,235')).toBeTruthy();
      // Receipt rows keep agorot
      expect(screen.getByText('₪1,673.00')).toBeTruthy();
      expect(screen.getByText('₪1,234.50')).toBeTruthy();
      // No unformatted leftovers
      expect(screen.queryByText(/₪\d{4}/)).toBeNull();
    });

    it('formats the amount in the receipt image modal subtitle', async () => {
      mockGetReceipts.mockResolvedValue({
        receipts: [receipt('r1', { date: '2026-01-19', total: 2847.3, merchant: 'Big Shop' })],
      });
      mockGetBudgets.mockResolvedValue({ budgets: [] });
      mockGetReceiptImageUrl.mockResolvedValue('https://example.com/r1.jpg');

      renderDashboard();

      fireEvent.press(await screen.findByTestId('receipt-item-r1'));

      expect(await screen.findByText('19/01/2026 · ₪2,847.30')).toBeTruthy();
      // Let the image URL request settle inside the test.
      expect(mockGetReceiptImageUrl).toHaveBeenCalledWith('r1');
      await waitFor(() => expect(screen.UNSAFE_getByType(Image).props.source).toEqual({ uri: 'https://example.com/r1.jpg' }));
    });
  });

  describe('header (spec: white bg, full-bleed)', () => {
    async function renderSettled() {
      mockGetReceipts.mockResolvedValue({ receipts: [] });
      mockGetBudgets.mockResolvedValue({ budgets: [] });
      renderDashboard({ userEmail: 'adrian@example.com' });
      await waitFor(() => expect(screen.getByText('No receipts yet')).toBeTruthy());
    }

    it('gives the header a white (surface) background', async () => {
      await renderSettled();
      expect(StyleSheet.flatten(screen.getByTestId('dashboard-header').props.style).backgroundColor).toBe(
        COLORS.surface
      );
    });

    it('makes the avatar circle visible: its bg differs from the header bg', async () => {
      await renderSettled();
      const headerBg = StyleSheet.flatten(screen.getByTestId('dashboard-header').props.style).backgroundColor;
      const avatarBg = StyleSheet.flatten(screen.getByTestId('dashboard-avatar').props.style).backgroundColor;
      expect(avatarBg).toBe(COLORS.background); // spec: #f2f2f7 circle
      expect(avatarBg).not.toBe(headerBg);
    });

    it('shows black initials on the grey avatar (not black-on-black)', async () => {
      await renderSettled();
      const initials = screen.getByText('AD');
      const avatarBg = StyleSheet.flatten(screen.getByTestId('dashboard-avatar').props.style).backgroundColor;
      expect(StyleSheet.flatten(initials.props.style).color).toBe(COLORS.textPrimary);
      expect(StyleSheet.flatten(initials.props.style).color).not.toBe(avatarBg);
    });

    it('is full-bleed: white safe area (status bar strip) and no horizontal inset', async () => {
      await renderSettled();
      const root = StyleSheet.flatten(screen.getByTestId('dashboard-screen').props.style);
      const header = StyleSheet.flatten(screen.getByTestId('dashboard-header').props.style);
      expect(root.backgroundColor).toBe(COLORS.surface);
      expect(root.padding ?? root.paddingHorizontal ?? 0).toBe(0);
      expect(header.margin ?? header.marginHorizontal ?? 0).toBe(0);
      expect(header.borderRadius).toBeUndefined();
    });

    it('keeps the page below the header grey', async () => {
      await renderSettled();
      expect(StyleSheet.flatten(screen.getByTestId('dashboard-scroll').props.style).backgroundColor).toBe(
        COLORS.background
      );
    });
  });

  describe('category grid (2 columns)', () => {
    const FIVE = ['Groceries', 'Dining', 'Transport', 'Entertainment', 'Health'];

    async function renderCategories(categories: string[]) {
      mockGetReceipts.mockResolvedValue({
        receipts: [
          receipt('r1', {
            date: '2026-01-05',
            total: categories.length * 10,
            // distinct amounts so the sort order is deterministic
            items: categories.map((category, i) => ({ name: category, amount: 100 - i, category })),
          }),
        ],
      });
      mockGetBudgets.mockResolvedValue({ budgets: [] });
      renderDashboard();
      await waitFor(() => expect(screen.getByTestId(`category-card-${categories[categories.length - 1]}`)).toBeTruthy());
    }

    it('keeps the last card of an odd count (5) the same half width as the others', async () => {
      await renderCategories(FIVE);
      const widths = FIVE.map((c) => StyleSheet.flatten(screen.getByTestId(`category-card-${c}`).props.style).width);
      expect(widths).toEqual(['48%', '48%', '48%', '48%', '48%']);
      const last = StyleSheet.flatten(screen.getByTestId('category-card-Health').props.style);
      // Nothing may let it grow into the empty second column.
      expect(last.flex).toBeUndefined();
      expect(last.flexGrow).toBeUndefined();
      expect(last.minWidth).toBeUndefined();
      expect(last.alignSelf).toBeUndefined();
    });

    it('renders the cards in the wrapping 2-column grid container', async () => {
      await renderCategories(FIVE);
      const gridEl = screen.getByTestId('category-grid');
      for (const c of FIVE) expect(within(gridEl).getByTestId(`category-card-${c}`)).toBeTruthy();
      const grid = StyleSheet.flatten(gridEl.props.style);
      expect(grid.flexDirection).toBe('row');
      expect(grid.flexWrap).toBe('wrap');
      // Gutter from space-between (not a fixed px gap) so 2 × 48% always fits.
      expect(grid.justifyContent).toBe('space-between');
      expect(grid.columnGap ?? grid.gap).toBeUndefined();
    });

    it('a single category card is also half width', async () => {
      await renderCategories(['Groceries']);
      expect(StyleSheet.flatten(screen.getByTestId('category-card-Groceries').props.style).width).toBe('48%');
    });
  });

  describe('receipt dates (Israeli receipts, day-first display)', () => {
    // "Now" is late September; the scanned receipt is from August.
    const SEPT_29 = new Date(2026, 8, 29, 9, 0, 0);
    const TITANIUM = {
      id: 'tit',
      user_id: 'u1',
      created_at: new Date(2026, 8, 29, 8, 0, 0).toISOString(), // scanned today
      image_path: null,
      raw_response: {
        merchant: 'טיטניום בע"מ',
        total: 350,
        date: '2026-08-17', // ISO, as the backend now stores it
        items: [{ name: 'כללי', amount: 350, category: 'Other' }],
      },
    };

    beforeEach(() => {
      jest.setSystemTime(SEPT_29);
    });

    it('does not count an August-dated receipt in September (month, week, count, categories)', async () => {
      mockGetReceipts.mockResolvedValue({ receipts: [TITANIUM] });
      mockGetBudgets.mockResolvedValue({ budgets: [] });

      renderDashboard();
      await screen.findByTestId('receipt-item-tit');

      expect(textOf('hero-spent')).toBe('₪0');
      expect(textOf('hero-week')).toBe('₪0');
      expect(textOf('hero-count')).toBe('0');
      expect(screen.queryByTestId('category-grid')).toBeNull();
      // Still listed under Recent Receipts, dated as printed.
      expect(textOf('receipt-date-tit')).toBe('17/08/2026');
    });

    it('counts it once the Dashboard is viewed in August', async () => {
      jest.setSystemTime(new Date(2026, 7, 20, 9, 0, 0));
      mockGetReceipts.mockResolvedValue({ receipts: [TITANIUM] });
      mockGetBudgets.mockResolvedValue({ budgets: [] });

      renderDashboard();
      await screen.findByTestId('receipt-item-tit');

      expect(textOf('hero-spent')).toBe('₪350');
      expect(textOf('hero-week')).toBe('₪350');
      expect(textOf('hero-count')).toBe('1');
    });

    it('a legacy un-normalized "17/08/2026" still falls back to the upload day (why the backfill exists)', async () => {
      mockGetReceipts.mockResolvedValue({
        receipts: [{ ...TITANIUM, raw_response: { ...TITANIUM.raw_response, date: '17/08/2026' } }],
      });
      mockGetBudgets.mockResolvedValue({ budgets: [] });

      renderDashboard();
      await screen.findByTestId('receipt-item-tit');

      expect(textOf('hero-count')).toBe('1');
      expect(textOf('receipt-date-tit')).toBe('29/09/2026');
    });

    it('shows the upload day for a receipt with no date', async () => {
      mockGetReceipts.mockResolvedValue({
        receipts: [{ ...TITANIUM, raw_response: { ...TITANIUM.raw_response, date: null } }],
      });
      mockGetBudgets.mockResolvedValue({ budgets: [] });

      renderDashboard();
      await screen.findByTestId('receipt-item-tit');

      expect(textOf('receipt-date-tit')).toBe('29/09/2026');
      expect(textOf('hero-spent')).toBe('₪350');
    });

    it('shows the day-first date in the receipt modal subtitle', async () => {
      mockGetReceipts.mockResolvedValue({ receipts: [TITANIUM] });
      mockGetBudgets.mockResolvedValue({ budgets: [] });
      mockGetReceiptImageUrl.mockResolvedValue('https://example.com/t.jpg');

      renderDashboard();
      fireEvent.press(await screen.findByTestId('receipt-item-tit'));

      expect(await screen.findByText('17/08/2026 · ₪350.00')).toBeTruthy();
      await waitFor(() => expect(screen.UNSAFE_getByType(Image).props.source).toEqual({ uri: 'https://example.com/t.jpg' }));
    });
  });

  describe('Recent Receipts row layout (merchant never collides with the amount)', () => {
    const style = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style);

    async function renderRow(merchant: string) {
      mockGetReceipts.mockResolvedValue({ receipts: [receipt('r1', { date: '2026-01-19', total: 350, merchant })] });
      mockGetBudgets.mockResolvedValue({ budgets: [] });
      renderDashboard();
      await screen.findByTestId('receipt-item-r1');
    }

    it('gives the merchant column the leftover width and lets it shrink', async () => {
      await renderRow('טיטניום בע"מ');
      expect(style('receipt-info-r1')).toEqual(expect.objectContaining({ flex: 1, minWidth: 0 }));
    });

    it('keeps the merchant on one ellipsized line, right-aligned for Hebrew', async () => {
      await renderRow('טיטניום בע"מ');
      const merchant = screen.getByTestId('receipt-merchant-r1');
      expect(merchant.props.numberOfLines).toBe(1);
      expect(merchant.props.ellipsizeMode).toBe('tail');
      expect(style('receipt-merchant-r1')).toEqual(expect.objectContaining({ textAlign: 'right', writingDirection: 'rtl' }));
    });

    it('keeps a fixed gap before the amount, which never shrinks', async () => {
      await renderRow('טיטניום בע"מ');
      const amount = style('receipt-amount-r1');
      expect(amount.marginLeft).toBeGreaterThanOrEqual(8);
      expect(amount.flexShrink).toBe(0);
      expect(textOf('receipt-amount-r1')).toBe('₪350.00');
    });

    it('left-aligns a Latin merchant with the same layout', async () => {
      await renderRow('Rami Levy');
      expect(style('receipt-merchant-r1')).toEqual(expect.objectContaining({ textAlign: 'left' }));
      expect(style('receipt-info-r1').minWidth).toBe(0);
    });
  });

  describe('receipt modal: change a line item category', () => {
    const MODAL_RECEIPT = {
      id: 'r1',
      user_id: 'u1',
      created_at: '2026-01-02T00:00:00Z',
      image_path: null,
      raw_response: {
        merchant: 'טיטניום בע"מ',
        total: 350,
        date: '2026-01-19',
        items: [
          { name: 'כללי', amount: 300, category: 'Other' },
          { name: 'Coffee', amount: 50, category: 'Dining' },
        ],
      },
    };

    function withCategory(index: number, category: string) {
      const items = MODAL_RECEIPT.raw_response.items.map((item, i) => (i === index ? { ...item, category } : item));
      return { ...MODAL_RECEIPT, raw_response: { ...MODAL_RECEIPT.raw_response, items } };
    }

    async function openModal() {
      mockGetReceipts.mockResolvedValue({ receipts: [MODAL_RECEIPT] });
      mockGetBudgets.mockResolvedValue({ budgets: [] });
      mockGetReceiptImageUrl.mockResolvedValue('https://example.com/r1.jpg');
      renderDashboard();
      fireEvent.press(await screen.findByTestId('receipt-item-r1'));
      await screen.findByTestId('receipt-modal-close');
      // Let the image request settle so later negative assertions are meaningful.
      await waitFor(() => expect(screen.UNSAFE_getByType(Image)).toBeTruthy());
    }

    function chipLabel(index: number) {
      return screen.getByTestId(`receipt-modal-item-category-${index}`).props.accessibilityLabel;
    }

    it('lists the line items with name, amount and category chip', async () => {
      await openModal();
      expect(textOf('receipt-modal-item-name-0')).toBe('כללי');
      expect(textOf('receipt-modal-item-amount-0')).toBe('₪300.00');
      expect(chipLabel(0)).toBe('Category for כללי: Other. Change category');
      expect(chipLabel(1)).toBe('Category for Coffee: Dining. Change category');
    });

    it('opens the picker with the current category checked', async () => {
      await openModal();
      fireEvent.press(screen.getByTestId('receipt-modal-item-category-0'));
      expect(screen.getByTestId('category-picker')).toBeTruthy();
      expect(screen.getByTestId('category-option-check-Other')).toBeTruthy();
      expect(screen.queryByTestId('category-option-check-Dining')).toBeNull();
      expect(textOf('category-picker-subtitle')).toBe('כללי');
    });

    it('saves the change immediately and refreshes totals and category cards', async () => {
      await openModal();
      expect(screen.getByTestId('category-card-Other')).toBeTruthy();
      mockUpdateItemCategories.mockResolvedValue({ receipt: withCategory(0, 'Groceries') });

      fireEvent.press(screen.getByTestId('receipt-modal-item-category-0'));
      fireEvent.press(screen.getByTestId('category-option-Groceries'));

      expect(screen.queryByTestId('category-picker')).toBeNull();
      expect(mockUpdateItemCategories).toHaveBeenCalledWith('r1', [{ index: 0, category: 'Groceries' }]);

      await waitFor(() => expect(chipLabel(0)).toBe('Category for כללי: Groceries. Change category'));
      expect(screen.getByTestId('category-card-Groceries')).toBeTruthy();
      expect(screen.queryByTestId('category-card-Other')).toBeNull();
      expect(within(screen.getByTestId('category-card-Groceries')).getByText('₪300')).toBeTruthy();
      expect(textOf('hero-spent')).toBe('₪350'); // total unchanged
      // Updated from the PATCH response — no refetch needed.
      expect(mockGetReceipts).toHaveBeenCalledTimes(1);
    });

    it('shows "Saving…" and locks the chips while the change is in flight', async () => {
      await openModal();
      let resolve!: (v: unknown) => void;
      mockUpdateItemCategories.mockReturnValue(new Promise((r) => (resolve = r)));

      fireEvent.press(screen.getByTestId('receipt-modal-item-category-1'));
      fireEvent.press(screen.getByTestId('category-option-Health'));

      expect(within(screen.getByTestId('receipt-modal-item-category-1')).getByText('Saving…')).toBeTruthy();
      fireEvent.press(screen.getByTestId('receipt-modal-item-category-0'));
      expect(screen.queryByTestId('category-picker')).toBeNull();

      await act(async () => resolve({ receipt: withCategory(1, 'Health') }));
      await waitFor(() => expect(chipLabel(1)).toBe('Category for Coffee: Health. Change category'));
      expect(screen.queryByText('Saving…')).toBeNull();
    });

    it('shows an error and keeps the old category when saving fails', async () => {
      await openModal();
      mockUpdateItemCategories.mockRejectedValue({ message: 'Each item category must be one of: …' });

      fireEvent.press(screen.getByTestId('receipt-modal-item-category-0'));
      fireEvent.press(screen.getByTestId('category-option-Dining'));

      expect(await screen.findByText('Each item category must be one of: …')).toBeTruthy();
      expect(chipLabel(0)).toBe('Category for כללי: Other. Change category');
      expect(screen.getByTestId('category-card-Other')).toBeTruthy();
    });

    it('falls back to a generic error message', async () => {
      await openModal();
      mockUpdateItemCategories.mockRejectedValue({});

      fireEvent.press(screen.getByTestId('receipt-modal-item-category-0'));
      fireEvent.press(screen.getByTestId('category-option-Dining'));

      expect(await screen.findByText('Could not change the category. Please try again.')).toBeTruthy();
    });

    it('clears a previous error on the next attempt', async () => {
      await openModal();
      mockUpdateItemCategories.mockRejectedValueOnce({ message: 'Network down' });
      fireEvent.press(screen.getByTestId('receipt-modal-item-category-0'));
      fireEvent.press(screen.getByTestId('category-option-Dining'));
      await screen.findByText('Network down');

      mockUpdateItemCategories.mockResolvedValueOnce({ receipt: withCategory(0, 'Dining') });
      fireEvent.press(screen.getByTestId('receipt-modal-item-category-0'));
      fireEvent.press(screen.getByTestId('category-option-Dining'));

      await waitFor(() => expect(chipLabel(0)).toBe('Category for כללי: Dining. Change category'));
      expect(screen.queryByText('Network down')).toBeNull();
    });

    it('does not call the API when the current category is picked again', async () => {
      await openModal();
      fireEvent.press(screen.getByTestId('receipt-modal-item-category-0'));
      fireEvent.press(screen.getByTestId('category-option-Other'));

      expect(screen.queryByTestId('category-picker')).toBeNull();
      await act(async () => {}); // flush any pending work before the negative assertion
      expect(mockUpdateItemCategories).not.toHaveBeenCalled();
      expect(screen.queryByText('Saving…')).toBeNull();
    });

    it('ignores a save that completes after the modal was closed (no state update on unmount)', async () => {
      await openModal();
      let resolve!: (v: unknown) => void;
      mockUpdateItemCategories.mockReturnValue(new Promise((r) => (resolve = r)));
      fireEvent.press(screen.getByTestId('receipt-modal-item-category-0'));
      fireEvent.press(screen.getByTestId('category-option-Health'));
      fireEvent.press(screen.getByTestId('receipt-modal-close'));
      await waitFor(() => expect(screen.queryByTestId('receipt-modal-close')).toBeNull());

      await act(async () => resolve({ receipt: withCategory(0, 'Health') }));

      // The closed modal dropped the result; the Dashboard still shows the old data.
      expect(screen.getByTestId('category-card-Other')).toBeTruthy();
      expect(screen.queryByTestId('category-card-Health')).toBeNull();
    });

    it('ignores a failure that arrives after the modal was closed', async () => {
      await openModal();
      let reject!: (e: unknown) => void;
      mockUpdateItemCategories.mockReturnValue(new Promise((_r, j) => (reject = j)));
      fireEvent.press(screen.getByTestId('receipt-modal-item-category-0'));
      fireEvent.press(screen.getByTestId('category-option-Health'));
      fireEvent.press(screen.getByTestId('receipt-modal-close'));
      await waitFor(() => expect(screen.queryByTestId('receipt-modal-close')).toBeNull());

      await act(async () => reject({ message: 'late failure' }));
      expect(screen.queryByText('late failure')).toBeNull();
    });

    it('closing the picker without choosing saves nothing', async () => {
      await openModal();
      fireEvent.press(screen.getByTestId('receipt-modal-item-category-0'));
      fireEvent.press(screen.getByTestId('category-picker-close'));
      expect(screen.queryByTestId('category-picker')).toBeNull();
      await act(async () => {});
      expect(mockUpdateItemCategories).not.toHaveBeenCalled();
    });

    it('shows no item list for a receipt without items', async () => {
      mockGetReceipts.mockResolvedValue({ receipts: [receipt('r9', { date: '2026-01-19', total: 5 })] });
      mockGetBudgets.mockResolvedValue({ budgets: [] });
      mockGetReceiptImageUrl.mockResolvedValue('https://example.com/r9.jpg');
      renderDashboard();
      fireEvent.press(await screen.findByTestId('receipt-item-r9'));
      await waitFor(() => expect(screen.UNSAFE_getByType(Image)).toBeTruthy());
      expect(screen.queryByTestId('receipt-modal-items')).toBeNull();
    });

    it('lays the modal header out so a long merchant never runs into the close button', async () => {
      await openModal();
      expect(StyleSheet.flatten(screen.getByTestId('receipt-modal-header-text').props.style)).toEqual(
        expect.objectContaining({ flex: 1, minWidth: 0, marginRight: 12 })
      );
      expect(screen.getByTestId('receipt-modal-title').props.numberOfLines).toBe(2);
      expect(StyleSheet.flatten(screen.getByTestId('receipt-modal-title').props.style)).toEqual(
        expect.objectContaining({ textAlign: 'right' })
      );
    });
  });
});

