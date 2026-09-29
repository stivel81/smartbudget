import React from 'react';
import { Alert, Animated, AppState } from 'react-native';
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react-native';
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

/**
 * Profile -> Sign Out asks for confirmation with a native Alert; press the
 * button, then the Alert's destructive "Sign Out" choice.
 */
function pressSignOutAndConfirm() {
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  fireEvent.press(screen.getByTestId('profile-sign-out-button'));
  const call = alertSpy.mock.calls.find((c) => c[0] === 'Sign out?');
  alertSpy.mockRestore();
  const confirm = (call?.[2] ?? []).find((b) => b.text === 'Sign Out');
  if (!confirm?.onPress) throw new Error('Sign-out confirmation was not shown');
  act(() => {
    confirm.onPress?.();
  });
}

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
    expect(screen.getByTestId('dashboard-greeting')).toHaveTextContent(/^Good (morning|afternoon|evening), Adrian$/);
    expect(screen.getByTestId('dashboard-avatar')).toHaveTextContent('AS');

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
    expect(screen.getByTestId('dashboard-greeting')).toHaveTextContent(/, Adrian$/);
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

describe("App user's display name", () => {
  afterEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  function refreshWith(user: Record<string, unknown>) {
    mockFetch({
      '/api/v1/auth/refresh': () => okJson({ session: { access_token: 'acc', refresh_token: 'ref', user } }),
      '/api/v1/auth/logout': () => okJson({ message: 'Signed out successfully' }),
      '/api/v1/receipts': () => okJson({ receipts: [] }),
      '/api/v1/budgets': () => okJson({ budgets: [] }),
    });
  }

  it('uses the name from the refreshed session on launch (greeting, avatar, Profile card)', async () => {
    refreshWith({ id: 'u1', email: 'stivel@gmail.com', name: 'Adrian Schtivelmager' });
    await AsyncStorage.setItem('@smartbudget/refreshToken', 'stored-refresh-token');

    render(<App />);

    await waitFor(() => expect(screen.getByText('No receipts yet')).toBeTruthy());
    expect(screen.getByTestId('dashboard-greeting')).toHaveTextContent(/, Adrian$/);
    expect(screen.getByTestId('dashboard-avatar')).toHaveTextContent('AS');

    fireEvent.press(screen.getByText('Profile'));
    await waitFor(() => expect(screen.getByTestId('profile-name')).toBeTruthy());
    expect(screen.getByTestId('profile-name')).toHaveTextContent('Adrian Schtivelmager');
    expect(screen.getByTestId('profile-email')).toHaveTextContent('stivel@gmail.com');
    expect(screen.getByTestId('profile-avatar')).toHaveTextContent('AS');
  });

  it('falls back to the persisted name when the backend sends none', async () => {
    refreshWith({ id: 'u1', email: 'stivel@gmail.com' });
    await AsyncStorage.setItem('@smartbudget/refreshToken', 'stored-refresh-token');
    await AsyncStorage.setItem('@smartbudget/userName', 'Adrian Schtivelmager');

    render(<App />);

    await waitFor(() => expect(screen.getByText('No receipts yet')).toBeTruthy());
    expect(screen.getByTestId('dashboard-greeting')).toHaveTextContent(/, Adrian$/);
  });

  it('email-only account: no name in the greeting and email initials', async () => {
    refreshWith({ id: 'u1', email: 'stivel@gmail.com', name: null });
    await AsyncStorage.setItem('@smartbudget/refreshToken', 'stored-refresh-token');

    render(<App />);

    await waitFor(() => expect(screen.getByText('No receipts yet')).toBeTruthy());
    expect(screen.getByTestId('dashboard-greeting')).toHaveTextContent(/^Good (morning|afternoon|evening)$/);
    expect(screen.getByTestId('dashboard-avatar')).toHaveTextContent('ST');
    expect(await AsyncStorage.getItem('@smartbudget/userName')).toBeNull();
  });

  it('clears the stored name on sign out', async () => {
    refreshWith({ id: 'u1', email: 'stivel@gmail.com', name: 'Adrian Schtivelmager' });
    await AsyncStorage.setItem('@smartbudget/refreshToken', 'stored-refresh-token');

    render(<App />);
    await waitFor(() => expect(screen.getByText('No receipts yet')).toBeTruthy());
    await waitFor(async () =>
      expect(await AsyncStorage.getItem('@smartbudget/userName')).toBe('Adrian Schtivelmager')
    );

    fireEvent.press(screen.getByText('Profile'));
    await waitFor(() => expect(screen.getByTestId('profile-sign-out-button')).toBeTruthy());
    pressSignOutAndConfirm();

    await waitFor(() => expect(screen.getByTestId('login-email-input')).toBeTruthy());
    await waitFor(async () => expect(await AsyncStorage.getItem('@smartbudget/userName')).toBeNull());
  });

  it('clears a stored name when the stored refresh token is invalid', async () => {
    mockFetch({ '/api/v1/auth/refresh': () => errJson(401, { error: 'Invalid or expired refresh token' }) });
    await AsyncStorage.setItem('@smartbudget/refreshToken', 'stale');
    await AsyncStorage.setItem('@smartbudget/userName', 'Adrian Schtivelmager');

    render(<App />);

    await waitFor(() => expect(screen.getByTestId('login-email-input')).toBeTruthy());
    expect(await AsyncStorage.getItem('@smartbudget/userName')).toBeNull();
  });
});

describe('App first-run Dashboard shortcuts (real navigator)', () => {
  afterEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  async function signIn() {
    mockFetch({
      '/api/v1/auth/refresh': () =>
        okJson({ session: { access_token: 'acc', refresh_token: 'ref', user: { id: 'u1', email: 'a@b.com' } } }),
      '/api/v1/receipts': () => okJson({ receipts: [] }),
      '/api/v1/budgets': () => okJson({ budgets: [] }),
    });
    await AsyncStorage.setItem('@smartbudget/refreshToken', 'stored-refresh-token');
    render(<App />);
    await waitFor(() => expect(screen.getByText('No receipts yet')).toBeTruthy());
  }

  it('"Scan your first receipt" opens the Scan tab', async () => {
    // The Scan tab's scan-line animation would keep updating after the test
    // (act() noise); it's covered in ScanScreen.test — stub the loop here.
    const loopSpy = jest
      .spyOn(Animated, 'loop')
      .mockReturnValue({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() } as unknown as Animated.CompositeAnimation);
    const errorSpy = jest.spyOn(console, 'error');
    await signIn();

    expect(screen.queryByTestId('scan-frame')).toBeNull(); // tabs mount lazily
    fireEvent.press(screen.getByTestId('dashboard-scan-first'));

    await waitFor(() => expect(screen.getByTestId('scan-frame')).toBeTruthy());
    const navErrors = errorSpy.mock.calls.filter((args) => /not handled by any navigator/.test(String(args[0])));
    expect(navErrors).toEqual([]);
    errorSpy.mockRestore();
    loopSpy.mockRestore();
  });

  it('the "No budget" stat opens the Budget tab', async () => {
    const errorSpy = jest.spyOn(console, 'error');
    await signIn();
    expect(screen.getByTestId('hero-budget-pct')).toHaveTextContent('—');

    expect(screen.queryByTestId('budget-screen')).toBeNull(); // tabs mount lazily
    fireEvent.press(screen.getByTestId('hero-budget-stat'));

    await waitFor(() => expect(screen.getByTestId('budget-screen')).toBeTruthy());
    // Let the Budget tab's own load settle inside the test.
    await waitFor(() => expect(screen.getByText('No budgets set')).toBeTruthy());
    const navErrors = errorSpy.mock.calls.filter((args) => /not handled by any navigator/.test(String(args[0])));
    expect(navErrors).toEqual([]);
    errorSpy.mockRestore();
  });
});

// Session renewal through the real navigator + real lib/api + lib/session:
// the access token expires while the app runs (the live "Invalid or
// expired token" bug), and screens never deal with it themselves.
describe('App session renewal (real navigator)', () => {
  afterEach(async () => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  const sessionBody = (n: number, extra: Record<string, unknown> = {}) => ({
    session: {
      access_token: `acc-${n}`,
      refresh_token: `ref-${n}`,
      expires_in: 3600,
      user: { id: 'u1', email: 'a@b.com', name: 'Ada Lovelace' },
      ...extra,
    },
  });

  type Reply = { ok: boolean; status: number; json: () => Promise<any> };

  /**
   * Backend fake: /refresh answers from `refreshReplies` in order; data
   * routes answer 200 only for `validToken()` and 401 otherwise.
   */
  function fakeBackend(refreshReplies: (Reply | Error)[], validToken: () => string) {
    const refreshQueue = [...refreshReplies];
    global.fetch = jest.fn((url: string, init: any = {}) => {
      if (url.includes('/api/v1/auth/refresh')) {
        const reply = refreshQueue.shift();
        if (reply instanceof Error) return Promise.reject(reply); // fetch itself failed (offline)
        return reply ? Promise.resolve(reply) : Promise.reject(new Error('unexpected refresh'));
      }
      if (url.includes('/api/v1/auth/logout')) return Promise.resolve(okJson({ message: 'Signed out successfully' }));
      const authorized = init.headers?.Authorization === `Bearer ${validToken()}`;
      if (!authorized) return Promise.resolve(errJson(401, { error: 'Invalid or expired token', status: 401 }));
      if (url.includes('/api/v1/receipts')) return Promise.resolve(okJson({ receipts: [] }));
      if (url.includes('/api/v1/budgets')) return Promise.resolve(okJson({ budgets: [] }));
      return Promise.reject(new Error(`Unhandled fetch in test: ${url}`));
    }) as jest.Mock;
  }

  const calls = (fragment: string) =>
    (global.fetch as jest.Mock).mock.calls.filter(([url]) => String(url).includes(fragment));

  it('a Dashboard load after the access token expired transparently succeeds, and the rotated refresh token is persisted', async () => {
    let valid = 'acc-1';
    // Launch restore -> acc-1; then the server-side token "expires" (acc-2 is the only valid one).
    fakeBackend([okJson(sessionBody(1)), okJson(sessionBody(2))], () => valid);
    await AsyncStorage.setItem('@smartbudget/refreshToken', 'stored-ref');

    render(<App />);
    await waitFor(() => expect(screen.getByText('No receipts yet')).toBeTruthy());
    await waitFor(async () => expect(await AsyncStorage.getItem('@smartbudget/refreshToken')).toBe('ref-1'));

    // Visit Budget while the token is still good...
    fireEvent.press(screen.getByText('Budget'));
    await waitFor(() => expect(screen.getByText('No budgets set')).toBeTruthy());
    const receiptCallsBefore = calls('/api/v1/receipts').length;

    // ...then the access token expires server-side, and the Dashboard reloads on focus.
    valid = 'acc-2';
    fireEvent.press(screen.getByText('Home'));
    await waitFor(() =>
      expect(calls('/api/v1/receipts').some(([, init]) => init.headers.Authorization === 'Bearer acc-2')).toBe(true)
    );
    await waitFor(() => expect(screen.getByText('No receipts yet')).toBeTruthy());
    expect(screen.queryByText('Invalid or expired token')).toBeNull();

    // The Dashboard's two parallel loads both got a 401, shared ONE refresh
    // (with the rotated token from launch), and were each retried once.
    const refreshCalls = calls('/auth/refresh');
    expect(refreshCalls.map(([, init]) => JSON.parse(init.body))).toEqual([
      { refresh_token: 'stored-ref' },
      { refresh_token: 'ref-1' },
    ]);
    const dashboardLoad = [...calls('/api/v1/receipts').slice(receiptCallsBefore), ...calls('/api/v1/budgets').slice(-2)];
    expect(dashboardLoad.map(([, init]) => init.headers.Authorization).sort()).toEqual([
      'Bearer acc-1',
      'Bearer acc-1',
      'Bearer acc-2',
      'Bearer acc-2',
    ]);
    await waitFor(async () => expect(await AsyncStorage.getItem('@smartbudget/refreshToken')).toBe('ref-2'));

    // Later calls use the renewed token straight away (no further refresh).
    fireEvent.press(screen.getByText('Budget'));
    await waitFor(() =>
      expect(calls('/api/v1/budgets').at(-1)![1].headers.Authorization).toBe('Bearer acc-2')
    );
    await waitFor(() => expect(screen.getByText('No budgets set')).toBeTruthy());
    expect(calls('/auth/refresh')).toHaveLength(2);
  });

  it('with a dead refresh token the user lands on Login with the session-expired message, and storage is cleared', async () => {
    let valid = 'acc-1';
    fakeBackend(
      [okJson(sessionBody(1)), errJson(401, { error: 'Invalid or expired refresh token', status: 401 })],
      () => valid
    );
    await AsyncStorage.setItem('@smartbudget/refreshToken', 'stored-ref');
    await AsyncStorage.setItem('@smartbudget/userName', 'Ada Lovelace');

    render(<App />);
    await waitFor(() => expect(screen.getByText('No receipts yet')).toBeTruthy());

    valid = 'nobody';
    fireEvent.press(screen.getByText('Budget'));

    await waitFor(() => expect(screen.getByTestId('login-session-notice')).toBeTruthy());
    expect(screen.getByTestId('login-session-notice')).toHaveTextContent('Your session expired, please sign in again');
    expect(screen.getByTestId('login-email-input')).toBeTruthy();
    await waitFor(async () => expect(await AsyncStorage.getItem('@smartbudget/refreshToken')).toBeNull());
    await waitFor(async () => expect(await AsyncStorage.getItem('@smartbudget/userName')).toBeNull());
    // One refresh attempt, no loop.
    expect(calls('/auth/refresh')).toHaveLength(2);
  });

  it('signing in again after an expiry clears the message', async () => {
    let valid = 'acc-1';
    fakeBackend([okJson(sessionBody(1)), errJson(401, { error: 'dead', status: 401 })], () => valid);
    await AsyncStorage.setItem('@smartbudget/refreshToken', 'stored-ref');
    render(<App />);
    await waitFor(() => expect(screen.getByText('No receipts yet')).toBeTruthy());
    valid = 'nobody';
    fireEvent.press(screen.getByText('Budget'));
    await waitFor(() => expect(screen.getByTestId('login-session-notice')).toBeTruthy());

    const fetchMock = global.fetch as jest.Mock;
    const fallback = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string, init: any) =>
      String(url).includes('/auth/login') ? Promise.resolve(okJson(sessionBody(7))) : fallback(url, init)
    );
    valid = 'acc-7';
    fireEvent.changeText(screen.getByTestId('login-email-input'), 'a@b.com');
    fireEvent.changeText(screen.getByTestId('login-password-input'), 'password123');
    fireEvent.press(screen.getByTestId('login-button'));
    await waitFor(() => expect(screen.getByText('No receipts yet')).toBeTruthy());

    fireEvent.press(screen.getByText('Profile'));
    await waitFor(() => expect(screen.getByTestId('profile-sign-out-button')).toBeTruthy());
    pressSignOutAndConfirm();
    await waitFor(() => expect(screen.getByTestId('login-email-input')).toBeTruthy());
    expect(screen.queryByTestId('login-session-notice')).toBeNull();
  });

  it('returning to the foreground with an expired token renews it before anything else (AppState active)', async () => {
    let appStateHandler: ((state: string) => void) | undefined;
    const remove = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_type: string, handler: (s: string) => void) => {
      appStateHandler = handler;
      return { remove };
    }) as any);
    fakeBackend([okJson(sessionBody(1)), okJson(sessionBody(2))], () => 'acc-1');
    await AsyncStorage.setItem('@smartbudget/refreshToken', 'stored-ref');

    const { unmount } = render(<App />);
    await waitFor(() => expect(screen.getByText('No receipts yet')).toBeTruthy());
    expect(appStateHandler).toBeDefined();

    // The app was suspended in the background for 2h (JS timers didn't run).
    const realNow = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(realNow + 2 * 3_600_000);
    await act(async () => {
      appStateHandler!('active');
    });

    await waitFor(() => expect(calls('/auth/refresh')).toHaveLength(2));
    expect(JSON.parse(calls('/auth/refresh')[1][1].body)).toEqual({ refresh_token: 'ref-1' });
    await waitFor(async () => expect(await AsyncStorage.getItem('@smartbudget/refreshToken')).toBe('ref-2'));

    unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  describe('launch restore', () => {
    const rateLimited = () => errJson(429, { error: 'Too many requests, please try again later.' });
    const serverError = () => errJson(500, { error: 'Internal server error' });
    const offline = () => new TypeError('Network request failed');

    async function storeSession() {
      await AsyncStorage.setItem('@smartbudget/refreshToken', 'stored-ref');
      await AsyncStorage.setItem('@smartbudget/userEmail', 'a@b.com');
      await AsyncStorage.setItem('@smartbudget/userName', 'Ada Lovelace');
    }

    function captureAppState() {
      const handler: { current?: (state: string) => void } = {};
      jest.spyOn(AppState, 'addEventListener').mockImplementation(((_type: string, h: (s: string) => void) => {
        handler.current = h;
        return { remove: jest.fn() };
      }) as any);
      return handler;
    }

    it('a dead stored refresh token (401) lands on Login with the session-expired message and clears storage', async () => {
      fakeBackend([errJson(401, { error: 'Invalid or expired refresh token' })], () => 'acc-1');
      await storeSession();

      render(<App />);

      await waitFor(() => expect(screen.getByTestId('login-session-notice')).toBeTruthy());
      expect(screen.getByTestId('login-session-notice')).toHaveTextContent('Your session expired, please sign in again');
      expect(screen.getByTestId('login-email-input')).toBeTruthy();
      await waitFor(async () => expect(await AsyncStorage.getItem('@smartbudget/refreshToken')).toBeNull());
      expect(await AsyncStorage.getItem('@smartbudget/userEmail')).toBeNull();
      expect(await AsyncStorage.getItem('@smartbudget/userName')).toBeNull();
      expect(calls('/auth/refresh')).toHaveLength(1);
    });

    it.each([
      ['rate limited (429)', rateLimited, 'Too many requests, please try again later.'],
      ['server error (5xx)', serverError, 'Internal server error'],
      ['offline (network error)', offline, 'Network request failed'],
    ])('a temporary failure (%s) keeps the stored session: the app opens signed in, never on Login', async (_label, fail, message) => {
      // Launch restore fails, and so does the Dashboard's own renewal attempt.
      fakeBackend([fail(), fail()], () => 'acc-1');
      await storeSession();

      render(<App />);

      await waitFor(() => expect(screen.getByText(message)).toBeTruthy());
      expect(screen.queryByTestId('login-email-input')).toBeNull();
      expect(screen.queryByTestId('login-session-notice')).toBeNull();
      // Nothing was sent without a token; both renewals used the stored (unconsumed) refresh token.
      expect(calls('/api/v1/receipts')).toHaveLength(0);
      expect(calls('/auth/refresh').map(([, init]) => JSON.parse(init.body))).toEqual([
        { refresh_token: 'stored-ref' },
        { refresh_token: 'stored-ref' },
      ]);
      expect(await AsyncStorage.getItem('@smartbudget/refreshToken')).toBe('stored-ref');
      expect(await AsyncStorage.getItem('@smartbudget/userEmail')).toBe('a@b.com');
      expect(await AsyncStorage.getItem('@smartbudget/userName')).toBe('Ada Lovelace');
    });

    it('after a temporary failure, the next API call renews and loads normally', async () => {
      fakeBackend([rateLimited(), okJson(sessionBody(1))], () => 'acc-1');
      await storeSession();

      render(<App />);

      await waitFor(() => expect(screen.getByText('No receipts yet')).toBeTruthy());
      expect(screen.queryByTestId('login-email-input')).toBeNull();
      expect(calls('/auth/refresh')).toHaveLength(2);
      await waitFor(async () => expect(await AsyncStorage.getItem('@smartbudget/refreshToken')).toBe('ref-1'));
    });

    it('after a temporary failure, returning to the foreground renews, and the Dashboard loads by itself', async () => {
      const appState = captureAppState();
      fakeBackend([offline(), offline(), okJson(sessionBody(1))], () => 'acc-1');
      await storeSession();

      render(<App />);
      await waitFor(() => expect(screen.getByText('Network request failed')).toBeTruthy());
      expect(calls('/api/v1/receipts')).toHaveLength(0);

      await act(async () => {
        appState.current!('active');
      });

      await waitFor(() => expect(screen.getByText('No receipts yet')).toBeTruthy());
      expect(calls('/auth/refresh')).toHaveLength(3);
      expect(calls('/api/v1/receipts').at(-1)![1].headers.Authorization).toBe('Bearer acc-1');
      await waitFor(async () => expect(await AsyncStorage.getItem('@smartbudget/refreshToken')).toBe('ref-1'));
    });

    it('after a temporary failure, a later renewal that finds the token dead goes to Login with the message', async () => {
      const appState = captureAppState();
      fakeBackend([rateLimited(), rateLimited(), errJson(401, { error: 'Invalid or expired refresh token' })], () => 'acc-1');
      await storeSession();

      render(<App />);
      await waitFor(() => expect(screen.getByText('Too many requests, please try again later.')).toBeTruthy());

      await act(async () => {
        appState.current!('active');
      });

      await waitFor(() => expect(screen.getByTestId('login-session-notice')).toBeTruthy());
      expect(screen.getByTestId('login-session-notice')).toHaveTextContent('Your session expired, please sign in again');
      await waitFor(async () => expect(await AsyncStorage.getItem('@smartbudget/refreshToken')).toBeNull());
    });
  });

  it('sign-out sends the refresh token too, so the backend can revoke an expired session', async () => {
    fakeBackend([okJson(sessionBody(1))], () => 'acc-1');
    await AsyncStorage.setItem('@smartbudget/refreshToken', 'stored-ref');

    render(<App />);
    await waitFor(() => expect(screen.getByText('No receipts yet')).toBeTruthy());
    fireEvent.press(screen.getByText('Profile'));
    await waitFor(() => expect(screen.getByTestId('profile-sign-out-button')).toBeTruthy());
    pressSignOutAndConfirm();

    await waitFor(() => expect(screen.getByTestId('login-email-input')).toBeTruthy());
    const [[, init]] = calls('/auth/logout');
    expect(init.headers.Authorization).toBe('Bearer acc-1');
    expect(JSON.parse(init.body)).toEqual({ refresh_token: 'ref-1' });
    await waitFor(async () => expect(await AsyncStorage.getItem('@smartbudget/refreshToken')).toBeNull());
    // Signed out: no session-expired message for a deliberate sign-out.
    expect(screen.queryByTestId('login-session-notice')).toBeNull();
  });

  it('sign-out with a failing backend still signs out locally', async () => {
    fakeBackend([okJson(sessionBody(1))], () => 'acc-1');
    const fetchMock = global.fetch as jest.Mock;
    const fallback = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string, init: any) =>
      String(url).includes('/auth/logout') ? Promise.reject(new TypeError('Network request failed')) : fallback(url, init)
    );
    await AsyncStorage.setItem('@smartbudget/refreshToken', 'stored-ref');

    render(<App />);
    await waitFor(() => expect(screen.getByText('No receipts yet')).toBeTruthy());
    fireEvent.press(screen.getByText('Profile'));
    await waitFor(() => expect(screen.getByTestId('profile-sign-out-button')).toBeTruthy());
    pressSignOutAndConfirm();

    await waitFor(() => expect(screen.getByTestId('login-email-input')).toBeTruthy());
    await waitFor(async () => expect(await AsyncStorage.getItem('@smartbudget/refreshToken')).toBeNull());
  });
});
