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

  it('renders real spend, percentage, and an over-budget alert', async () => {
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
    expect(screen.getByText('₪95 / ₪100')).toBeTruthy();
    expect(screen.getByText('95%')).toBeTruthy();
    expect(screen.getByText(/is at 90%\+ of budget/)).toBeTruthy();
  });

  it('shows an error message when the fetch fails', async () => {
    mockGetBudgets.mockRejectedValue({ message: 'Failed to load budgets' });
    mockGetReceipts.mockResolvedValue({ receipts: [] });

    renderBudget();

    await waitFor(() => expect(screen.getByText('Failed to load budgets')).toBeTruthy());
  });
});
