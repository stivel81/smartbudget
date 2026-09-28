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

describe('App Profile menu navigation (real navigator)', () => {
  afterEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  async function signInAndOpenProfile() {
    mockFetch({
      '/api/v1/auth/refresh': () =>
        okJson({
          session: {
            access_token: 'acc',
            refresh_token: 'ref',
            user: { id: 'u1', email: 'stored@example.com' },
          },
        }),
      '/api/v1/receipts': () => okJson({ receipts: [] }),
      '/api/v1/budgets': () => okJson({ budgets: [] }),
    });
    await AsyncStorage.setItem('@smartbudget/refreshToken', 'stored-refresh-token');
    render(<App />);
    await waitFor(() => expect(screen.getByText('No receipts yet')).toBeTruthy());
    fireEvent.press(screen.getByText('Profile'));
    await waitFor(() => expect(screen.getByTestId('profile-menu-settings')).toBeTruthy());
  }

  it.each([
    ['profile-menu-settings', 'settings-screen', 'settings-back-button'],
    ['profile-menu-privacy', 'privacy-screen', 'privacy-back-button'],
    ['profile-menu-help', 'help-screen', 'help-back-button'],
  ])('%s pushes %s, and its back button returns to Profile', async (row, screenId, backId) => {
    const errorSpy = jest.spyOn(console, 'error');
    await signInAndOpenProfile();

    fireEvent.press(screen.getByTestId(row));
    await waitFor(() => expect(screen.getByTestId(screenId)).toBeTruthy());

    fireEvent.press(screen.getByTestId(backId));
    await waitFor(() => expect(screen.queryByTestId(screenId)).toBeNull());
    expect(screen.getByTestId('profile-menu-settings')).toBeTruthy();

    const navErrors = errorSpy.mock.calls.filter((args) => /not handled by any navigator/.test(String(args[0])));
    expect(navErrors).toEqual([]);
    errorSpy.mockRestore();
  });
});

describe('App signup email verification (real navigator)', () => {
  afterEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  const VERIFIED_SESSION = {
    session: {
      access_token: 'verified-access',
      refresh_token: 'verified-refresh',
      user: { id: 'u9', email: 'adrian@example.com', name: 'Adrian Schtivelmager' },
    },
  };

  function fetchCalls(fragment: string) {
    return (global.fetch as jest.Mock).mock.calls.filter(([url]) => String(url).includes(fragment));
  }

  it('Signup -> Verify email (code) -> signed in on the Dashboard with the name, and persists it', async () => {
    const errorSpy = jest.spyOn(console, 'error');
    mockFetch({
      '/api/v1/auth/signup': () => ({ ok: true, status: 201, json: async () => ({ user: { id: 'u9', email: 'adrian@example.com' } }) }),
      '/api/v1/auth/verify-signup': () => okJson(VERIFIED_SESSION),
      '/api/v1/receipts': () => okJson({ receipts: [] }),
      '/api/v1/budgets': () => okJson({ budgets: [] }),
    });

    render(<App />);
    await waitFor(() => expect(screen.getByTestId('login-email-input')).toBeTruthy());
    fireEvent.press(screen.getByText('Sign up'));
    await waitFor(() => expect(screen.getByTestId('signup-screen')).toBeTruthy());

    fireEvent.changeText(screen.getByTestId('signup-firstname-input'), 'Adrian');
    fireEvent.changeText(screen.getByTestId('signup-lastname-input'), 'Schtivelmager');
    fireEvent.changeText(screen.getByTestId('signup-email-input'), 'adrian@example.com');
    fireEvent.changeText(screen.getByTestId('signup-password-input'), 'password123');
    fireEvent.press(screen.getByTestId('signup-button'));

    await waitFor(() => expect(screen.getByTestId('verify-screen')).toBeTruthy());
    expect(screen.queryByTestId('signup-screen')).toBeNull();
    expect(screen.getByTestId('verify-email-address')).toHaveTextContent('adrian@example.com');
    // Supabase already sent the code with the signup — no extra resend.
    expect(fetchCalls('/auth/resend-signup')).toHaveLength(0);

    fireEvent.changeText(screen.getByTestId('verify-code-input'), '123456');
    fireEvent.press(screen.getByTestId('verify-button'));

    await waitFor(() => expect(screen.getByText('My Finances')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('No receipts yet')).toBeTruthy());
    expect(screen.queryByTestId('verify-screen')).toBeNull();

    const [, verifyInit] = fetchCalls('/auth/verify-signup')[0];
    expect(JSON.parse(verifyInit.body)).toEqual({ email: 'adrian@example.com', code: '123456' });
    await waitFor(async () =>
      expect(await AsyncStorage.getItem('@smartbudget/refreshToken')).toBe('verified-refresh')
    );
    await waitFor(async () =>
      expect(await AsyncStorage.getItem('@smartbudget/userName')).toBe('Adrian Schtivelmager')
    );
    const navErrors = errorSpy.mock.calls.filter((args) => /not handled by any navigator/.test(String(args[0])));
    expect(navErrors).toEqual([]);
    errorSpy.mockRestore();
  });

  it('Login with an unverified email -> Verify email (fresh code sent) -> signed in', async () => {
    const errorSpy = jest.spyOn(console, 'error');
    mockFetch({
      '/api/v1/auth/login': () =>
        errJson(401, {
          error: 'Please verify your email before signing in — enter the 6-digit code we emailed you.',
          status: 401,
          code: 'email_not_confirmed',
        }),
      '/api/v1/auth/resend-signup': () => okJson({ message: 'generic' }),
      '/api/v1/auth/verify-signup': () => okJson(VERIFIED_SESSION),
      '/api/v1/receipts': () => okJson({ receipts: [] }),
      '/api/v1/budgets': () => okJson({ budgets: [] }),
    });

    render(<App />);
    await waitFor(() => expect(screen.getByTestId('login-email-input')).toBeTruthy());
    fireEvent.changeText(screen.getByTestId('login-email-input'), 'adrian@example.com');
    fireEvent.changeText(screen.getByTestId('login-password-input'), 'password123');
    fireEvent.press(screen.getByTestId('login-button'));

    await waitFor(() => expect(screen.getByTestId('verify-screen')).toBeTruthy());
    expect(screen.getByTestId('verify-email-address')).toHaveTextContent('adrian@example.com');
    await waitFor(() => expect(screen.getByTestId('verify-notice')).toBeTruthy());
    const resendCalls = fetchCalls('/auth/resend-signup');
    expect(resendCalls).toHaveLength(1);
    expect(JSON.parse(resendCalls[0][1].body)).toEqual({ email: 'adrian@example.com' });

    fireEvent.changeText(screen.getByTestId('verify-code-input'), '654321');
    fireEvent.press(screen.getByTestId('verify-button'));

    await waitFor(() => expect(screen.getByText('No receipts yet')).toBeTruthy());
    const navErrors = errorSpy.mock.calls.filter((args) => /not handled by any navigator/.test(String(args[0])));
    expect(navErrors).toEqual([]);
    errorSpy.mockRestore();
  });

  it('a wrong code keeps the user on Verify email, signed out', async () => {
    mockFetch({
      '/api/v1/auth/login': () => errJson(401, { error: 'verify', status: 401, code: 'email_not_confirmed' }),
      '/api/v1/auth/resend-signup': () => okJson({ message: 'generic' }),
      '/api/v1/auth/verify-signup': () => errJson(400, { error: 'Invalid or expired code', status: 400 }),
    });

    render(<App />);
    await waitFor(() => expect(screen.getByTestId('login-email-input')).toBeTruthy());
    fireEvent.changeText(screen.getByTestId('login-email-input'), 'adrian@example.com');
    fireEvent.changeText(screen.getByTestId('login-password-input'), 'password123');
    fireEvent.press(screen.getByTestId('login-button'));
    await waitFor(() => expect(screen.getByTestId('verify-notice')).toBeTruthy());

    fireEvent.changeText(screen.getByTestId('verify-code-input'), '000000');
    fireEvent.press(screen.getByTestId('verify-button'));

    await waitFor(() => expect(screen.getByText('Invalid or expired code')).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId('verify-button')).not.toBeDisabled());
    expect(screen.queryByText('My Finances')).toBeNull();
    expect(await AsyncStorage.getItem('@smartbudget/refreshToken')).toBeNull();
  });

  it('"Back to sign in" on Verify email returns to Login', async () => {
    mockFetch({
      '/api/v1/auth/signup': () => ({ ok: true, status: 201, json: async () => ({ user: { id: 'u9', email: 'a@b.com' } }) }),
    });

    render(<App />);
    await waitFor(() => expect(screen.getByTestId('login-email-input')).toBeTruthy());
    fireEvent.press(screen.getByText('Sign up'));
    await waitFor(() => expect(screen.getByTestId('signup-screen')).toBeTruthy());
    fireEvent.changeText(screen.getByTestId('signup-firstname-input'), 'A');
    fireEvent.changeText(screen.getByTestId('signup-lastname-input'), 'B');
    fireEvent.changeText(screen.getByTestId('signup-email-input'), 'a@b.com');
    fireEvent.changeText(screen.getByTestId('signup-password-input'), 'password123');
    fireEvent.press(screen.getByTestId('signup-button'));
    await waitFor(() => expect(screen.getByTestId('verify-screen')).toBeTruthy());

    fireEvent.press(screen.getByTestId('verify-back-button'));

    await waitFor(() => expect(screen.queryByTestId('verify-screen')).toBeNull());
    expect(screen.getByTestId('login-email-input')).toBeTruthy();
    expect(screen.queryByTestId('signup-screen')).toBeNull();
  });
});
