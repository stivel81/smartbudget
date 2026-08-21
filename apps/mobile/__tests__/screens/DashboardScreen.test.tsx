import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    // Run the focus effect immediately on mount instead of requiring a real navigator.
    useFocusEffect: (effect: () => void | (() => void)) => {
      const React = require('react');
      React.useEffect(effect, []);
    },
  };
});

const mockGetReceipts = jest.fn();
jest.mock('../../lib/api', () => ({
  getReceipts: (...args: unknown[]) => mockGetReceipts(...args),
}));

import DashboardScreen from '../../screens/DashboardScreen';
import { AuthContext } from '../../App';

function renderDashboard() {
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
      <DashboardScreen />
    </AuthContext.Provider>
  );
}

describe('DashboardScreen', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('shows the empty state when there are no receipts', async () => {
    mockGetReceipts.mockResolvedValue({ receipts: [] });

    renderDashboard();

    await waitFor(() => expect(screen.getByText('No receipts yet')).toBeTruthy());
    expect(screen.getByText('₪0')).toBeTruthy();
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

    renderDashboard();

    await waitFor(() => expect(screen.getByText('₪140')).toBeTruthy());
    expect(screen.getByText('2')).toBeTruthy(); // receipt count
    expect(screen.getByText('Rami Levy')).toBeTruthy();
    expect(screen.getByText('Cafe Aroma')).toBeTruthy();
    expect(screen.getByText('Groceries')).toBeTruthy();
    expect(screen.getByText('Dining')).toBeTruthy();
  });

  it('shows an error message when the fetch fails', async () => {
    mockGetReceipts.mockRejectedValue({ message: 'Failed to load receipts' });

    renderDashboard();

    await waitFor(() => expect(screen.getByText('Failed to load receipts')).toBeTruthy());
  });
});
