import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';

// Icon fonts can't load under jest (expo-asset registry); render icons as plain Views.
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const makeIcon = () => {
    const Icon = ({ name }: { name: string }) => React.createElement(View, { testID: `icon-${name}` });
    Icon.glyphMap = {};
    return Icon;
  };
  return { Feather: makeIcon(), MaterialCommunityIcons: makeIcon(), FontAwesome: makeIcon() };
});

function mockFetch(handlers: Record<string, () => { ok: boolean; status: number; json: () => Promise<any> }>) {
  global.fetch = jest.fn((url: string) => {
    const match = Object.entries(handlers).find(([pattern]) => url.includes(pattern));
    if (!match) return Promise.reject(new Error(`Unhandled fetch in test: ${url}`));
    return Promise.resolve(match[1]());
  }) as jest.Mock;
}

const okJson = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const errJson = (status: number, body: unknown) => ({ ok: false, status, json: async () => body });

describe('App session persistence', () => {
  afterEach(async () => {
    // clearAllMocks (not resetAllMocks): reset would strip the AsyncStorage jest mock's implementations,
    // making every later test read empty storage and pass vacuously.
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('shows the login screen when no session is persisted', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('login-email-input')).toBeTruthy();
    });
  });

  it('restores a session by refreshing the stored refresh token, and skips the login screen', async () => {
    mockFetch({
      '/api/v1/auth/refresh': () =>
        okJson({
          session: {
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
            user: { id: 'u1', email: 'stored@example.com' },
          },
        }),
      '/api/v1/receipts': () => okJson({ receipts: [] }),
    });
    await AsyncStorage.setItem('@smartbudget/refreshToken', 'stored-refresh-token');
    await AsyncStorage.setItem('@smartbudget/userEmail', 'stored@example.com');

    render(<App />);

    await waitFor(() => {
      expect(screen.queryByTestId('login-email-input')).toBeNull();
    });
  });

  it('does not render a navigator header above the tab screens (each screen draws its own)', async () => {
    mockFetch({
      '/api/v1/auth/refresh': () =>
        okJson({
          session: {
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
            user: { id: 'u1', email: 'stored@example.com' },
          },
        }),
      '/api/v1/receipts': () => okJson({ receipts: [] }),
      '/api/v1/budgets': () => okJson({ budgets: [] }),
    });
    await AsyncStorage.setItem('@smartbudget/refreshToken', 'stored-refresh-token');
    await AsyncStorage.setItem('@smartbudget/userEmail', 'stored@example.com');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('My Finances')).toBeTruthy();
    });
    // The tab bar label is "Home", so a "Dashboard" text can only come from a navigator header.
    expect(screen.queryByText('Dashboard')).toBeNull();
  });

  it('falls back to the login screen and clears storage when the stored refresh token is invalid', async () => {
    mockFetch({
      '/api/v1/auth/refresh': () => errJson(401, { error: 'Invalid or expired refresh token' }),
    });
    await AsyncStorage.setItem('@smartbudget/refreshToken', 'stale-refresh-token');
    await AsyncStorage.setItem('@smartbudget/userEmail', 'stored@example.com');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('login-email-input')).toBeTruthy();
    });
    expect(await AsyncStorage.getItem('@smartbudget/refreshToken')).toBeFalsy();
    expect(await AsyncStorage.getItem('@smartbudget/userEmail')).toBeFalsy();
  });
});
