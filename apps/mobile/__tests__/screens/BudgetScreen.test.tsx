import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';

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
jest.mock('../../lib/api', () => ({
  ...jest.requireActual('../../lib/api'),
  getBudgets: (...args: unknown[]) => mockGetBudgets(...args),
  getReceipts: (...args: unknown[]) => mockGetReceipts(...args),
  upsertBudget: jest.fn(),
}));

import BudgetScreen from '../../screens/BudgetScreen';
import { AuthContext } from '../../App';

function renderBudget() {
  return render(
    <AuthContext.Provider
      value={{
        isAuthenticated: true,
        setIsAuthenticated: () => {},
        accessToken: 'test-token',
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
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('shows the empty state when there are no budgets', async () => {
    mockGetBudgets.mockResolvedValue({ budgets: [] });
    mockGetReceipts.mockResolvedValue({ receipts: [] });

    renderBudget();

    await waitFor(() => expect(screen.getByText('No budgets set')).toBeTruthy());
  });

  it('renders real spend, percentage, and an amber alert at 90%+ threshold', async () => {
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
    mockGetReceipts.mockResolvedValue({
      receipts: [
        {
          id: 'r1',
          user_id: 'u1',
          created_at: '2026-01-01T00:00:00Z',
          raw_response: {
            merchant: 'Store',
            total: 95,
            date: '2026-01-01',
            items: [{ name: 'Milk', amount: 95, category: 'Groceries' }],
          },
        },
      ],
    });

    renderBudget();

    await waitFor(() => expect(screen.getByText('Groceries')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('95%')).toBeTruthy());
    // Check for amber banner at 90%+
    await waitFor(() => expect(screen.getByText(/at 90%\+ of budget/)).toBeTruthy());
  });

  it('shows a red alert when any category is at 100%+ (over budget)', async () => {
    mockGetBudgets.mockResolvedValue({
      budgets: [
        {
          id: 'b1',
          user_id: 'u1',
          category: 'Dining',
          monthly_limit: 100,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    });
    mockGetReceipts.mockResolvedValue({
      receipts: [
        {
          id: 'r1',
          user_id: 'u1',
          created_at: '2026-01-01T00:00:00Z',
          raw_response: {
            merchant: 'Restaurant',
            total: 110,
            date: '2026-01-01',
            items: [{ name: 'Meal', amount: 110, category: 'Dining' }],
          },
        },
      ],
    });

    renderBudget();

    await waitFor(() => expect(screen.getByText('Dining')).toBeTruthy());
    expect(screen.getByText('₪110 / ₪100')).toBeTruthy();
    expect(screen.getByText('110%')).toBeTruthy();
    // Check for red banner at 100%+
    expect(screen.getByText(/is at 100%\+ of budget/)).toBeTruthy();
  });

  it('renders multiple categories with separate spent amounts', async () => {
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
    mockGetReceipts.mockResolvedValue({
      receipts: [
        {
          id: 'r1',
          user_id: 'u1',
          created_at: '2026-01-01T00:00:00Z',
          raw_response: {
            merchant: 'Market',
            total: 820,
            date: '2026-01-01',
            items: [{ name: 'Groceries', amount: 820, category: 'Groceries' }],
          },
        },
        {
          id: 'r2',
          user_id: 'u1',
          created_at: '2026-01-02T00:00:00Z',
          raw_response: {
            merchant: 'Restaurant',
            total: 368,
            date: '2026-01-02',
            items: [{ name: 'Dining', amount: 368, category: 'Dining' }],
          },
        },
      ],
    });

    renderBudget();

    await waitFor(() => expect(screen.getByText('Groceries')).toBeTruthy());
    expect(screen.getByText('Dining')).toBeTruthy();
    expect(screen.getByText('₪820 / ₪1000')).toBeTruthy(); // Groceries 82%
    expect(screen.getByText('₪368 / ₪400')).toBeTruthy(); // Dining 92% over alert threshold
    expect(screen.getByText('82%')).toBeTruthy();
    expect(screen.getByText('92%')).toBeTruthy();
  });

  it('calculates summary totals correctly', async () => {
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
    mockGetReceipts.mockResolvedValue({
      receipts: [
        {
          id: 'r1',
          user_id: 'u1',
          created_at: '2026-01-01T00:00:00Z',
          raw_response: {
            merchant: 'Market',
            total: 820,
            date: '2026-01-01',
            items: [{ name: 'Groceries', amount: 820, category: 'Groceries' }],
          },
        },
        {
          id: 'r2',
          user_id: 'u1',
          created_at: '2026-01-02T00:00:00Z',
          raw_response: {
            merchant: 'Restaurant',
            total: 368,
            date: '2026-01-02',
            items: [{ name: 'Dining', amount: 368, category: 'Dining' }],
          },
        },
      ],
    });

    renderBudget();

    await waitFor(() => expect(screen.getByText('Total Spent')).toBeTruthy());
    expect(screen.getByText('₪1188')).toBeTruthy(); // 820 + 368
    expect(screen.getByText('₪1400')).toBeTruthy(); // 1000 + 400
    expect(screen.getByText('₪212')).toBeTruthy(); // remaining: 1400 - 1188
  });

  it('shows an error message when the fetch fails', async () => {
    mockGetBudgets.mockRejectedValue({ message: 'Failed to load budgets' });
    mockGetReceipts.mockResolvedValue({ receipts: [] });

    renderBudget();

    await waitFor(() => expect(screen.getByText('Failed to load budgets')).toBeTruthy());
  });

  it('does not show alert banner when no categories exceed threshold', async () => {
    mockGetBudgets.mockResolvedValue({
      budgets: [
        {
          id: 'b1',
          user_id: 'u1',
          category: 'Entertainment',
          monthly_limit: 500,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    });
    mockGetReceipts.mockResolvedValue({
      receipts: [
        {
          id: 'r1',
          user_id: 'u1',
          created_at: '2026-01-01T00:00:00Z',
          raw_response: {
            merchant: 'Theater',
            total: 30,
            date: '2026-01-01',
            items: [{ name: 'Ticket', amount: 30, category: 'Entertainment' }],
          },
        },
      ],
    });

    renderBudget();

    await waitFor(() => expect(screen.getByText('Entertainment')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('6%')).toBeTruthy());
    expect(screen.queryByText(/at 90%\+ of budget/)).toBeNull();
  });
});
