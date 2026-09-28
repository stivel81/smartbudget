import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';

const mockLogin = jest.fn();
jest.mock('../../lib/api', () => ({
  login: (...args: unknown[]) => mockLogin(...args),
}));

import LoginScreen from '../../screens/LoginScreen';
import { AuthContext, AuthContextType } from '../../App';
import { COLORS } from '../../lib/theme';

function renderLogin(overrides: Partial<AuthContextType> = {}) {
  const navigation = { reset: jest.fn(), navigate: jest.fn() } as any;
  const auth: AuthContextType = {
    isAuthenticated: false,
    setIsAuthenticated: jest.fn(),
    accessToken: null,
    setAccessToken: jest.fn(),
    refreshToken: null,
    setRefreshToken: jest.fn(),
    userEmail: null,
    setUserEmail: jest.fn(),
    logout: jest.fn(async () => {}),
    ...overrides,
  };

  render(
    <AuthContext.Provider value={auth}>
      <LoginScreen navigation={navigation} route={{} as any} />
    </AuthContext.Provider>
  );

  return { navigation, auth };
}

describe('LoginScreen', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('shows a validation error when submitting with empty fields', async () => {
    renderLogin();

    fireEvent.press(screen.getByTestId('login-button'));

    await waitFor(() => expect(screen.getByText('Email is required')).toBeTruthy());
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('shows a validation error for an invalid email', async () => {
    renderLogin();

    fireEvent.changeText(screen.getByTestId('login-email-input'), 'not-an-email');
    fireEvent.changeText(screen.getByTestId('login-password-input'), 'password123');
    fireEvent.press(screen.getByTestId('login-button'));

    await waitFor(() => expect(screen.getByText('Please enter a valid email')).toBeTruthy());
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('toggles password visibility', () => {
    renderLogin();

    const passwordInput = screen.getByTestId('login-password-input');
    expect(passwordInput.props.secureTextEntry).toBe(true);

    fireEvent.press(screen.getByTestId('login-password-toggle'));
    expect(passwordInput.props.secureTextEntry).toBe(false);

    fireEvent.press(screen.getByTestId('login-password-toggle'));
    expect(passwordInput.props.secureTextEntry).toBe(true);
  });

  it('logs in and updates auth state on success', async () => {
    mockLogin.mockResolvedValue({
      session: {
        access_token: 'access-tok',
        refresh_token: 'refresh-tok',
        user: { id: 'u1', email: 'a@b.com' },
      },
    });
    const { navigation, auth } = renderLogin();

    fireEvent.changeText(screen.getByTestId('login-email-input'), 'a@b.com');
    fireEvent.changeText(screen.getByTestId('login-password-input'), 'password123');
    fireEvent.press(screen.getByTestId('login-button'));

    await waitFor(() => expect(auth.setIsAuthenticated).toHaveBeenCalledWith(true));
    expect(auth.setAccessToken).toHaveBeenCalledWith('access-tok');
    expect(auth.setRefreshToken).toHaveBeenCalledWith('refresh-tok');
    expect(auth.setUserEmail).toHaveBeenCalledWith('a@b.com');
    // App.tsx swaps to the Main stack on isAuthenticated; no manual reset.
    expect(navigation.reset).not.toHaveBeenCalled();
  });

  it('shows the backend error message on failed login', async () => {
    mockLogin.mockRejectedValue({ message: 'Invalid email or password' });
    renderLogin();

    fireEvent.changeText(screen.getByTestId('login-email-input'), 'a@b.com');
    fireEvent.changeText(screen.getByTestId('login-password-input'), 'wrong-password');
    fireEvent.press(screen.getByTestId('login-button'));

    await waitFor(() => expect(screen.getByText('Invalid email or password')).toBeTruthy());
  });

  describe('V2 layout', () => {
    it('uses a page background that differs from the input background (inputs visible)', () => {
      renderLogin();

      const pageBg = StyleSheet.flatten(screen.getByTestId('login-screen').props.style).backgroundColor;
      const inputBg = StyleSheet.flatten(screen.getByTestId('login-email-input').props.style).backgroundColor;

      expect(inputBg).toBe(COLORS.background);
      expect(pageBg).toBe(COLORS.surface);
      expect(pageBg).not.toBe(inputBg);
    });

    it('does not show social sign-in (out of Phase 1)', () => {
      renderLogin();

      expect(screen.queryByText('Google')).toBeNull();
      expect(screen.queryByText('Apple')).toBeNull();
      expect(screen.queryByText('OR')).toBeNull();
      expect(screen.queryByTestId('login-google-button')).toBeNull();
      expect(screen.queryByTestId('login-apple-button')).toBeNull();
    });
  });

  describe('Forgot password link', () => {
    it('navigates to ForgotPassword, prefilling the trimmed email typed so far', () => {
      const { navigation } = renderLogin();

      fireEvent.changeText(screen.getByTestId('login-email-input'), '  a@b.com ');
      fireEvent.press(screen.getByTestId('login-forgot-password'));

      expect(navigation.navigate).toHaveBeenCalledTimes(1);
      expect(navigation.navigate).toHaveBeenCalledWith('ForgotPassword', { email: 'a@b.com' });
    });

    it('navigates without params when no email has been typed', () => {
      const { navigation } = renderLogin();

      fireEvent.press(screen.getByTestId('login-forgot-password'));

      expect(navigation.navigate).toHaveBeenCalledWith('ForgotPassword', undefined);
    });

    it('is disabled while a login is in flight', async () => {
      mockLogin.mockReturnValue(new Promise(() => {}));
      const { navigation } = renderLogin();

      fireEvent.changeText(screen.getByTestId('login-email-input'), 'a@b.com');
      fireEvent.changeText(screen.getByTestId('login-password-input'), 'password123');
      fireEvent.press(screen.getByTestId('login-button'));
      await waitFor(() => expect(screen.getByTestId('login-forgot-password')).toBeDisabled());

      fireEvent.press(screen.getByTestId('login-forgot-password'));
      expect(navigation.navigate).not.toHaveBeenCalled();
    });
  });

  it('trims the email before logging in', async () => {
    mockLogin.mockResolvedValue({
      session: { access_token: 'a', refresh_token: 'r', user: { id: 'u1', email: 'a@b.com' } },
    });
    const { auth } = renderLogin();

    fireEvent.changeText(screen.getByTestId('login-email-input'), ' a@b.com ');
    fireEvent.changeText(screen.getByTestId('login-password-input'), 'password123');
    fireEvent.press(screen.getByTestId('login-button'));

    await waitFor(() => expect(auth.setIsAuthenticated).toHaveBeenCalledWith(true));
    expect(mockLogin).toHaveBeenCalledWith('a@b.com', 'password123');
  });
});
