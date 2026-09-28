import React from 'react';
import { Alert, StyleSheet } from 'react-native';
import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';

const mockSignup = jest.fn();
jest.mock('../../lib/api', () => ({
  signup: (...args: unknown[]) => mockSignup(...args),
}));

import SignupScreen from '../../screens/SignupScreen';
import { COLORS } from '../../lib/theme';

function renderSignup() {
  const navigation = { reset: jest.fn(), navigate: jest.fn() } as any;
  render(<SignupScreen navigation={navigation} route={{} as any} />);
  return { navigation };
}

function fillValidForm() {
  fireEvent.changeText(screen.getByTestId('signup-firstname-input'), 'Ada');
  fireEvent.changeText(screen.getByTestId('signup-lastname-input'), 'Lovelace');
  fireEvent.changeText(screen.getByTestId('signup-email-input'), 'ada@example.com');
  fireEvent.changeText(screen.getByTestId('signup-password-input'), 'password123');
}

describe('SignupScreen', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
    alertSpy.mockRestore();
  });

  it('shows a validation error when submitting with empty fields', async () => {
    renderSignup();

    fireEvent.press(screen.getByTestId('signup-button'));

    await waitFor(() => expect(screen.getByText('First name is required')).toBeTruthy());
    expect(mockSignup).not.toHaveBeenCalled();
  });

  it('shows a validation error for a short password', async () => {
    renderSignup();
    fillValidForm();
    fireEvent.changeText(screen.getByTestId('signup-password-input'), 'short');

    fireEvent.press(screen.getByTestId('signup-button'));

    await waitFor(() => expect(screen.getByText('Password must be at least 8 characters')).toBeTruthy());
    expect(mockSignup).not.toHaveBeenCalled();
  });

  it('shows no strength bars filled and no label for an empty password', () => {
    renderSignup();

    expect(screen.queryByText('Weak')).toBeNull();
    expect(screen.queryByText('Strong')).toBeNull();
  });

  it('shows "Strong" once the password meets every criterion', () => {
    renderSignup();

    fireEvent.changeText(screen.getByTestId('signup-password-input'), 'Sup3r$ecure!');

    expect(screen.getByText('Strong')).toBeTruthy();
  });

  it('signs up and replaces itself with Login + VerifyEmail for the new address', async () => {
    mockSignup.mockResolvedValue({ user: { id: 'u1', email: 'ada@example.com' } });
    const { navigation } = renderSignup();
    fillValidForm();

    fireEvent.press(screen.getByTestId('signup-button'));

    await waitFor(() => expect(navigation.reset).toHaveBeenCalledTimes(1));
    expect(mockSignup).toHaveBeenCalledWith('ada@example.com', 'password123', 'Ada Lovelace');
    expect(navigation.reset).toHaveBeenCalledWith({
      index: 1,
      routes: [{ name: 'Login' }, { name: 'VerifyEmail', params: { email: 'ada@example.com' } }],
    });
    // The code screen replaces the old "check your inbox for a link" alert.
    expect(alertSpy).not.toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('shows the backend error message on failed signup and does not navigate', async () => {
    mockSignup.mockRejectedValue({ message: 'Email already registered' });
    const { navigation } = renderSignup();
    fillValidForm();

    fireEvent.press(screen.getByTestId('signup-button'));

    await waitFor(() => expect(screen.getByText('Email already registered')).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId('signup-button')).not.toBeDisabled());
    expect(navigation.reset).not.toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  describe('V2 layout', () => {
    it('uses a page background that differs from the input background (inputs visible)', () => {
      renderSignup();

      const pageBg = StyleSheet.flatten(screen.getByTestId('signup-screen').props.style).backgroundColor;
      expect(pageBg).toBe(COLORS.surface);
      for (const id of ['signup-firstname-input', 'signup-lastname-input', 'signup-email-input', 'signup-password-input']) {
        const inputBg = StyleSheet.flatten(screen.getByTestId(id).props.style).backgroundColor;
        expect(inputBg).toBe(COLORS.background);
        expect(pageBg).not.toBe(inputBg);
      }
    });

    it('does not show social sign-in (out of Phase 1)', () => {
      renderSignup();

      expect(screen.queryByText('Google')).toBeNull();
      expect(screen.queryByText('Apple')).toBeNull();
      expect(screen.queryByText('OR')).toBeNull();
      expect(screen.queryByTestId('signup-google-button')).toBeNull();
      expect(screen.queryByTestId('signup-apple-button')).toBeNull();
    });
  });

  it('shows a validation error for a malformed email', async () => {
    renderSignup();
    fillValidForm();
    fireEvent.changeText(screen.getByTestId('signup-email-input'), 'not-an-email');

    fireEvent.press(screen.getByTestId('signup-button'));

    await waitFor(() => expect(screen.getByText('Please enter a valid email')).toBeTruthy());
    expect(mockSignup).not.toHaveBeenCalled();
  });

  it('fills strength bars to match the password strength', () => {
    renderSignup();

    fireEvent.changeText(screen.getByTestId('signup-password-input'), 'abcdefgh1');

    expect(screen.getByText('Fair')).toBeTruthy();
    const colors = [1, 2, 3, 4].map(
      (bar) => StyleSheet.flatten(screen.getByTestId(`signup-strength-bar-${bar}`).props.style).backgroundColor
    );
    expect(colors).toEqual([COLORS.success, COLORS.success, COLORS.border, COLORS.border]);
  });

  it('trims the email before signing up', async () => {
    mockSignup.mockResolvedValue({ user: { id: 'u1', email: 'ada@example.com' } });
    const { navigation } = renderSignup();
    fillValidForm();
    fireEvent.changeText(screen.getByTestId('signup-email-input'), ' ada@example.com ');

    fireEvent.press(screen.getByTestId('signup-button'));

    await waitFor(() => expect(mockSignup).toHaveBeenCalledWith('ada@example.com', 'password123', 'Ada Lovelace'));
    await waitFor(() =>
      expect(navigation.reset).toHaveBeenCalledWith({
        index: 1,
        routes: [{ name: 'Login' }, { name: 'VerifyEmail', params: { email: 'ada@example.com' } }],
      })
    );
  });

  it('requires a last name', async () => {
    renderSignup();
    fillValidForm();
    fireEvent.changeText(screen.getByTestId('signup-lastname-input'), '   ');

    fireEvent.press(screen.getByTestId('signup-button'));

    await waitFor(() => expect(screen.getByText('Last name is required')).toBeTruthy());
    expect(mockSignup).not.toHaveBeenCalled();
  });

  it('"Sign in" goes back to Login', () => {
    const { navigation } = renderSignup();

    fireEvent.press(screen.getByText('Sign in'));

    expect(navigation.navigate).toHaveBeenCalledWith('Login');
  });
});
