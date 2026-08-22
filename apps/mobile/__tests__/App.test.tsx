import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';

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
    jest.resetAllMocks();
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
