import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
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
      '/api/v1/budgets': () => okJson({ budgets: [] }),
    });
    await AsyncStorage.setItem('@smartbudget/refreshToken', 'stored-refresh-token');
    await AsyncStorage.setItem('@smartbudget/userEmail', 'stored@example.com');

    render(<App />);

    await waitFor(() => {
      expect(screen.queryByTestId('login-email-input')).toBeNull();
    });
    // Let the Dashboard's initial load settle inside the test (otherwise its
    // state updates land after the test ends -> act() warnings).
    await waitFor(() => expect(screen.getByText('No receipts yet')).toBeTruthy());
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

describe('App password reset flow', () => {
  afterEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('goes Login -> Forgot password (email prefilled) -> reset -> signed in, and persists the new session', async () => {
    const errorSpy = jest.spyOn(console, 'error');
    mockFetch({
      '/api/v1/auth/forgot-password': () => okJson({ message: 'ok' }),
      '/api/v1/auth/reset-password': () =>
        okJson({
          session: {
            access_token: 'reset-access',
            refresh_token: 'reset-refresh',
            user: { id: 'u1', email: 'a@b.com' },
          },
        }),
      '/api/v1/receipts': () => okJson({ receipts: [] }),
      '/api/v1/budgets': () => okJson({ budgets: [] }),
    });

    render(<App />);
    await waitFor(() => expect(screen.getByTestId('login-email-input')).toBeTruthy());

    fireEvent.changeText(screen.getByTestId('login-email-input'), 'a@b.com');
    fireEvent.press(screen.getByTestId('login-forgot-password'));

    await waitFor(() => expect(screen.getByTestId('forgot-email-input')).toBeTruthy());
    expect(screen.getByTestId('forgot-email-input').props.value).toBe('a@b.com');

    fireEvent.press(screen.getByTestId('forgot-send-button'));
    await waitFor(() => expect(screen.getByTestId('forgot-code-input')).toBeTruthy());

    fireEvent.changeText(screen.getByTestId('forgot-code-input'), '123456');
    fireEvent.changeText(screen.getByTestId('forgot-password-input'), 'newpassword123');
    fireEvent.press(screen.getByTestId('forgot-reset-button'));

    await waitFor(() => expect(screen.getByText('My Finances')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('No receipts yet')).toBeTruthy());
    expect(screen.queryByTestId('forgot-screen')).toBeNull();

    const calls = (global.fetch as jest.Mock).mock.calls;
    const resetCall = calls.find(([url]) => String(url).includes('/auth/reset-password'));
    expect(JSON.parse(resetCall[1].body)).toEqual({ email: 'a@b.com', code: '123456', newPassword: 'newpassword123' });
    await waitFor(async () =>
      expect(await AsyncStorage.getItem('@smartbudget/refreshToken')).toBe('reset-refresh')
    );
    // The switch to Main must come from auth state, not an unhandled navigation action.
    const navErrors = errorSpy.mock.calls.filter((args) => /not handled by any navigator/.test(String(args[0])));
    expect(navErrors).toEqual([]);
    errorSpy.mockRestore();
  });

  it('signs in from Login without an unhandled navigation action', async () => {
    const errorSpy = jest.spyOn(console, 'error');
    mockFetch({
      '/api/v1/auth/login': () =>
        okJson({
          session: { access_token: 'acc', refresh_token: 'ref', user: { id: 'u1', email: 'a@b.com' } },
        }),
      '/api/v1/receipts': () => okJson({ receipts: [] }),
      '/api/v1/budgets': () => okJson({ budgets: [] }),
    });

    render(<App />);
    await waitFor(() => expect(screen.getByTestId('login-email-input')).toBeTruthy());
    fireEvent.changeText(screen.getByTestId('login-email-input'), 'a@b.com');
    fireEvent.changeText(screen.getByTestId('login-password-input'), 'password123');
    fireEvent.press(screen.getByTestId('login-button'));

    await waitFor(() => expect(screen.getByText('No receipts yet')).toBeTruthy());
    const navErrors = errorSpy.mock.calls.filter((args) => /not handled by any navigator/.test(String(args[0])));
    expect(navErrors).toEqual([]);
    errorSpy.mockRestore();
  });

  it('"Back to sign in" returns to the Login screen', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('login-email-input')).toBeTruthy());

    fireEvent.press(screen.getByTestId('login-forgot-password'));
    await waitFor(() => expect(screen.getByTestId('forgot-back-button')).toBeTruthy());

    fireEvent.press(screen.getByTestId('forgot-back-button'));
    await waitFor(() => expect(screen.queryByTestId('forgot-screen')).toBeNull());
    expect(screen.getByTestId('login-email-input')).toBeTruthy();
  });
});
