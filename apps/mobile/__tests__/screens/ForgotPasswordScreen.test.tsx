import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react-native';

// Real vector icons load their font asynchronously and set state after the
// test's act() scope, producing act() warnings — stub them (as App.test does).
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

const mockRequestPasswordReset = jest.fn();
const mockResetPassword = jest.fn();
jest.mock('../../lib/api', () => ({
  requestPasswordReset: (...args: unknown[]) => mockRequestPasswordReset(...args),
  resetPassword: (...args: unknown[]) => mockResetPassword(...args),
}));

import ForgotPasswordScreen, { RESEND_COOLDOWN_SECONDS } from '../../screens/ForgotPasswordScreen';
import { AuthContext, AuthContextType } from '../../lib/auth';
import { COLORS } from '../../lib/theme';

const SESSION = {
  session: {
    access_token: 'new-access',
    refresh_token: 'new-refresh',
    user: { id: 'u1', email: 'a@b.com' },
  },
};

function renderForgot(params?: { email?: string }) {
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
    userName: null,
    setUserName: jest.fn(),
    expiresAt: null,
    setExpiresAt: jest.fn(),
    sessionNotice: null,
    setSessionNotice: jest.fn(),
    logout: jest.fn(async () => {}),
  };

  render(
    <AuthContext.Provider value={auth}>
      <ForgotPasswordScreen navigation={navigation} route={{ params } as any} />
    </AuthContext.Provider>
  );

  return { navigation, auth };
}

/** Complete step 1 and wait until step 2 is showing. */
async function goToResetStep(email = 'a@b.com') {
  mockRequestPasswordReset.mockResolvedValueOnce({ message: 'ok' });
  fireEvent.changeText(screen.getByTestId('forgot-email-input'), email);
  fireEvent.press(screen.getByTestId('forgot-send-button'));
  await waitFor(() => expect(screen.getByTestId('forgot-code-input')).toBeTruthy());
}

function fillResetForm(code = '123456', password = 'newpassword123') {
  fireEvent.changeText(screen.getByTestId('forgot-code-input'), code);
  fireEvent.changeText(screen.getByTestId('forgot-password-input'), password);
}

describe('ForgotPasswordScreen', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('layout', () => {
    it('uses a white page so the grey V2 inputs are visible against it', () => {
      renderForgot();

      const pageBg = StyleSheet.flatten(screen.getByTestId('forgot-screen').props.style).backgroundColor;
      const inputBg = StyleSheet.flatten(screen.getByTestId('forgot-email-input').props.style).backgroundColor;

      expect(pageBg).toBe(COLORS.surface);
      expect(inputBg).toBe(COLORS.background);
      expect(pageBg).not.toBe(inputBg);
    });

    it('shows no social sign-in options', () => {
      renderForgot();

      expect(screen.queryByText('Google')).toBeNull();
      expect(screen.queryByText('Apple')).toBeNull();
      expect(screen.queryByText('OR')).toBeNull();
    });
  });

  describe('step 1 — request a code', () => {
    it('starts on the email step with the title and Send code button', () => {
      renderForgot();

      expect(screen.getByText('Forgot password?')).toBeTruthy();
      expect(screen.getByText('Send code')).toBeTruthy();
      expect(screen.queryByTestId('forgot-code-input')).toBeNull();
    });

    it('prefills the email from the route param', () => {
      renderForgot({ email: 'prefilled@example.com' });

      expect(screen.getByTestId('forgot-email-input').props.value).toBe('prefilled@example.com');
    });

    it('starts with an empty email when no param is given', () => {
      renderForgot();

      expect(screen.getByTestId('forgot-email-input').props.value).toBe('');
    });

    it('requires an email', async () => {
      renderForgot();

      fireEvent.press(screen.getByTestId('forgot-send-button'));

      await waitFor(() => expect(screen.getByText('Email is required')).toBeTruthy());
      expect(mockRequestPasswordReset).not.toHaveBeenCalled();
    });

    it('rejects a malformed email', async () => {
      renderForgot();

      fireEvent.changeText(screen.getByTestId('forgot-email-input'), 'not-an-email');
      fireEvent.press(screen.getByTestId('forgot-send-button'));

      await waitFor(() => expect(screen.getByText('Please enter a valid email')).toBeTruthy());
      expect(mockRequestPasswordReset).not.toHaveBeenCalled();
    });

    it('sends the trimmed email and moves to the code step with a non-committal notice', async () => {
      renderForgot();
      mockRequestPasswordReset.mockResolvedValueOnce({ message: 'ok' });

      fireEvent.changeText(screen.getByTestId('forgot-email-input'), '  a@b.com  ');
      fireEvent.press(screen.getByTestId('forgot-send-button'));

      await waitFor(() => expect(screen.getByTestId('forgot-code-input')).toBeTruthy());
      expect(mockRequestPasswordReset).toHaveBeenCalledTimes(1);
      expect(mockRequestPasswordReset).toHaveBeenCalledWith('a@b.com');
      // Title and primary button both read "Reset password" on step 2.
      expect(screen.getAllByText('Reset password')).toHaveLength(2);
      expect(screen.queryByText('Send code')).toBeNull();
      expect(screen.getByTestId('forgot-sent-to')).toHaveTextContent('a@b.com');
      expect(screen.getByTestId('forgot-notice')).toHaveTextContent(
        "If an account exists for a@b.com, we've sent a 6-digit code to it."
      );
    });

    it('shows a spinner and disables the button while sending', async () => {
      renderForgot();
      let resolveSend!: (v: unknown) => void;
      mockRequestPasswordReset.mockReturnValueOnce(new Promise((r) => (resolveSend = r)));

      fireEvent.changeText(screen.getByTestId('forgot-email-input'), 'a@b.com');
      fireEvent.press(screen.getByTestId('forgot-send-button'));

      await waitFor(() => expect(screen.getByTestId('forgot-send-loading')).toBeTruthy());
      expect(screen.getByTestId('forgot-send-button')).toBeDisabled();

      await act(async () => resolveSend({ message: 'ok' }));
      await waitFor(() => expect(screen.getByTestId('forgot-code-input')).toBeTruthy());
    });

    it('shows the backend message (e.g. rate limited) and stays on the email step', async () => {
      renderForgot();
      mockRequestPasswordReset.mockRejectedValueOnce({
        message: 'Too many requests, please try again later.',
        code: 429,
      });

      fireEvent.changeText(screen.getByTestId('forgot-email-input'), 'a@b.com');
      fireEvent.press(screen.getByTestId('forgot-send-button'));

      await waitFor(() =>
        expect(screen.getByText('Too many requests, please try again later.')).toBeTruthy()
      );
      expect(screen.queryByTestId('forgot-code-input')).toBeNull();
      expect(screen.getByTestId('forgot-send-button')).not.toBeDisabled();
    });

    it('shows a friendly message on a network failure', async () => {
      renderForgot();
      mockRequestPasswordReset.mockRejectedValueOnce(new TypeError('Network request failed'));

      fireEvent.changeText(screen.getByTestId('forgot-email-input'), 'a@b.com');
      fireEvent.press(screen.getByTestId('forgot-send-button'));

      await waitFor(() =>
        expect(
          screen.getByText('Could not send the code. Check your connection and try again.')
        ).toBeTruthy()
      );
      expect(screen.queryByText('Network request failed')).toBeNull();
      expect(screen.queryByTestId('forgot-code-input')).toBeNull();
    });
  });

  describe('step 2 — enter code and new password', () => {
    it('keeps only digits in the code field, capped at 6', async () => {
      renderForgot();
      await goToResetStep();

      const codeInput = screen.getByTestId('forgot-code-input');
      expect(codeInput.props.maxLength).toBe(6);
      expect(codeInput.props.keyboardType).toBe('number-pad');
      fireEvent.changeText(codeInput, '12a 34-5678');

      expect(screen.getByTestId('forgot-code-input').props.value).toBe('123456');
    });

    it('does not stretch the placeholder: letter spacing only once a digit is typed', async () => {
      renderForgot();
      await goToResetStep();

      const empty = StyleSheet.flatten(screen.getByTestId('forgot-code-input').props.style);
      expect(screen.getByTestId('forgot-code-input').props.placeholder).toBe('6-digit code');
      expect(empty.letterSpacing).toBeUndefined();

      fireEvent.changeText(screen.getByTestId('forgot-code-input'), '12');
      const filled = StyleSheet.flatten(screen.getByTestId('forgot-code-input').props.style);
      expect(filled.letterSpacing).toBe(6);

      fireEvent.changeText(screen.getByTestId('forgot-code-input'), '');
      const cleared = StyleSheet.flatten(screen.getByTestId('forgot-code-input').props.style);
      expect(cleared.letterSpacing).toBeUndefined();
    });

    it('offers one-time-code autofill on the code field', async () => {
      renderForgot();
      await goToResetStep();

      const codeInput = screen.getByTestId('forgot-code-input');
      expect(codeInput.props.textContentType).toBe('oneTimeCode');
      expect(codeInput.props.autoComplete).toBe('one-time-code');
    });

    it("stores the user's display name from the reset session", async () => {
      const { auth } = renderForgot();
      await goToResetStep('a@b.com');
      mockResetPassword.mockResolvedValueOnce({
        session: { ...SESSION.session, user: { id: 'u1', email: 'a@b.com', name: 'Adrian Schtivelmager' } },
      });

      fillResetForm();
      fireEvent.press(screen.getByTestId('forgot-reset-button'));

      await waitFor(() => expect(auth.setIsAuthenticated).toHaveBeenCalledWith(true));
      expect(auth.setUserName).toHaveBeenCalledWith('Adrian Schtivelmager');
    });

    it('requires the code', async () => {
      renderForgot();
      await goToResetStep();

      fireEvent.changeText(screen.getByTestId('forgot-password-input'), 'newpassword123');
      fireEvent.press(screen.getByTestId('forgot-reset-button'));

      await waitFor(() => expect(screen.getByText('Code is required')).toBeTruthy());
      expect(mockResetPassword).not.toHaveBeenCalled();
    });

    it('rejects a code shorter than 6 digits', async () => {
      renderForgot();
      await goToResetStep();

      fillResetForm('123', 'newpassword123');
      fireEvent.press(screen.getByTestId('forgot-reset-button'));

      await waitFor(() =>
        expect(screen.getByText('Enter the 6-digit code from your email')).toBeTruthy()
      );
      expect(mockResetPassword).not.toHaveBeenCalled();
    });

    it('applies the signup password rules', async () => {
      renderForgot();
      await goToResetStep();

      fillResetForm('123456', 'short');
      fireEvent.press(screen.getByTestId('forgot-reset-button'));

      await waitFor(() =>
        expect(screen.getByText('Password must be at least 8 characters')).toBeTruthy()
      );
      expect(mockResetPassword).not.toHaveBeenCalled();
    });

    it('requires a new password', async () => {
      renderForgot();
      await goToResetStep();

      fillResetForm('123456', '');
      fireEvent.press(screen.getByTestId('forgot-reset-button'));

      await waitFor(() => expect(screen.getByText('Password is required')).toBeTruthy());
      expect(mockResetPassword).not.toHaveBeenCalled();
    });

    it('toggles new-password visibility', async () => {
      renderForgot();
      await goToResetStep();

      expect(screen.getByTestId('forgot-password-input').props.secureTextEntry).toBe(true);
      fireEvent.press(screen.getByTestId('forgot-password-toggle'));
      expect(screen.getByTestId('forgot-password-input').props.secureTextEntry).toBe(false);
      fireEvent.press(screen.getByTestId('forgot-password-toggle'));
      expect(screen.getByTestId('forgot-password-input').props.secureTextEntry).toBe(true);
    });

    it('shows the same strength meter as signup', async () => {
      renderForgot();
      await goToResetStep();

      expect(screen.queryByText('Weak')).toBeNull();
      fireEvent.changeText(screen.getByTestId('forgot-password-input'), 'Sup3r$ecure!');

      expect(screen.getByText('Strong')).toBeTruthy();
      for (const bar of [1, 2, 3, 4]) {
        const style = StyleSheet.flatten(screen.getByTestId(`forgot-strength-bar-${bar}`).props.style);
        expect(style.backgroundColor).toBe(COLORS.success);
      }
    });

    it('resets the password with the right args and signs in via the auth context', async () => {
      const { auth, navigation } = renderForgot();
      await goToResetStep('a@b.com');
      mockResetPassword.mockResolvedValueOnce(SESSION);

      fillResetForm('123456', 'newpassword123');
      fireEvent.press(screen.getByTestId('forgot-reset-button'));

      await waitFor(() => expect(auth.setIsAuthenticated).toHaveBeenCalledWith(true));
      expect(mockResetPassword).toHaveBeenCalledTimes(1);
      expect(mockResetPassword).toHaveBeenCalledWith('a@b.com', '123456', 'newpassword123');
      expect(auth.setAccessToken).toHaveBeenCalledWith('new-access');
      expect(auth.setRefreshToken).toHaveBeenCalledWith('new-refresh');
      expect(auth.setUserEmail).toHaveBeenCalledWith('a@b.com');
      expect(auth.setUserName).toHaveBeenCalledWith(null);
      // App.tsx swaps to the Main stack on isAuthenticated; no manual reset.
      expect(navigation.reset).not.toHaveBeenCalled();
    });

    it('shows a spinner and disables the button while resetting', async () => {
      renderForgot();
      await goToResetStep();
      let resolveReset!: (v: unknown) => void;
      mockResetPassword.mockReturnValueOnce(new Promise((r) => (resolveReset = r)));

      fillResetForm();
      fireEvent.press(screen.getByTestId('forgot-reset-button'));

      await waitFor(() => expect(screen.getByTestId('forgot-reset-loading')).toBeTruthy());
      expect(screen.getByTestId('forgot-reset-button')).toBeDisabled();

      await act(async () => resolveReset(SESSION));
      await waitFor(() => expect(screen.queryByTestId('forgot-reset-loading')).toBeNull());
    });

    it('shows "Invalid or expired code" and does not sign in on a bad code', async () => {
      const { auth, navigation } = renderForgot();
      await goToResetStep();
      mockResetPassword.mockRejectedValueOnce({ message: 'Invalid or expired code', code: 400 });

      fillResetForm('000000', 'newpassword123');
      fireEvent.press(screen.getByTestId('forgot-reset-button'));

      // Wait for the rejection to be handled (error rendered, button re-enabled)
      // before asserting nothing else happened.
      await waitFor(() => expect(screen.getByText('Invalid or expired code')).toBeTruthy());
      await waitFor(() => expect(screen.getByTestId('forgot-reset-button')).not.toBeDisabled());
      expect(auth.setIsAuthenticated).not.toHaveBeenCalled();
      expect(auth.setAccessToken).not.toHaveBeenCalled();
      expect(navigation.reset).not.toHaveBeenCalled();
      // Still on step 2 so the user can fix the code.
      expect(screen.getByTestId('forgot-code-input')).toBeTruthy();
    });

    it('shows a friendly message on a network failure and does not sign in', async () => {
      const { auth } = renderForgot();
      await goToResetStep();
      mockResetPassword.mockRejectedValueOnce(new TypeError('Network request failed'));

      fillResetForm();
      fireEvent.press(screen.getByTestId('forgot-reset-button'));

      await waitFor(() =>
        expect(
          screen.getByText('Could not reset your password. Check your connection and try again.')
        ).toBeTruthy()
      );
      await waitFor(() => expect(screen.getByTestId('forgot-reset-button')).not.toBeDisabled());
      expect(auth.setIsAuthenticated).not.toHaveBeenCalled();
    });

    it('"Change" returns to the email step with the email kept and the code cleared', async () => {
      renderForgot();
      await goToResetStep('a@b.com');
      fillResetForm('123456', 'newpassword123');

      fireEvent.press(screen.getByTestId('forgot-change-email'));

      expect(screen.getByTestId('forgot-email-input').props.value).toBe('a@b.com');
      expect(screen.queryByTestId('forgot-notice')).toBeNull();

      // Going forward again starts with empty code/password fields.
      await goToResetStep('a@b.com');
      expect(screen.getByTestId('forgot-code-input').props.value).toBe('');
      expect(screen.getByTestId('forgot-password-input').props.value).toBe('');
    });
  });

  describe('resend code', () => {
    it(`is disabled for ${RESEND_COOLDOWN_SECONDS}s after sending, then resends to the same email`, async () => {
      jest.useFakeTimers();
      renderForgot();
      await goToResetStep('a@b.com');

      expect(screen.getByText(`Resend code in ${RESEND_COOLDOWN_SECONDS}s`)).toBeTruthy();
      expect(screen.getByTestId('forgot-resend-button')).toBeDisabled();

      for (let i = 0; i < RESEND_COOLDOWN_SECONDS - 1; i++) {
        act(() => {
          jest.advanceTimersByTime(1000);
        });
      }
      expect(screen.getByText('Resend code in 1s')).toBeTruthy();
      expect(screen.getByTestId('forgot-resend-button')).toBeDisabled();

      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(screen.getByText('Resend code')).toBeTruthy();
      expect(screen.getByTestId('forgot-resend-button')).not.toBeDisabled();

      fillResetForm('111111', 'newpassword123');
      mockRequestPasswordReset.mockResolvedValueOnce({ message: 'ok' });
      fireEvent.press(screen.getByTestId('forgot-resend-button'));

      await waitFor(() =>
        expect(screen.getByTestId('forgot-notice')).toHaveTextContent(
          'If an account exists for a@b.com, a new code is on its way. Use the newest code.'
        )
      );
      expect(mockRequestPasswordReset).toHaveBeenCalledTimes(2);
      expect(mockRequestPasswordReset).toHaveBeenLastCalledWith('a@b.com');
      // Old code cleared; cooldown restarted.
      expect(screen.getByTestId('forgot-code-input').props.value).toBe('');
      expect(screen.getByText(`Resend code in ${RESEND_COOLDOWN_SECONDS}s`)).toBeTruthy();
    });

    it('does not resend while the cooldown is running', async () => {
      renderForgot();
      await goToResetStep();

      fireEvent.press(screen.getByTestId('forgot-resend-button'));

      // Nothing async was started; the button stays in its cooldown state.
      await waitFor(() => expect(screen.getByTestId('forgot-resend-button')).toBeDisabled());
      expect(mockRequestPasswordReset).toHaveBeenCalledTimes(1);
    });

    it('shows "Sending…" while resending and surfaces a failure', async () => {
      jest.useFakeTimers();
      renderForgot();
      await goToResetStep();
      // Advance one tick at a time so each re-scheduled timeout fires.
      for (let i = 0; i < RESEND_COOLDOWN_SECONDS; i++) {
        act(() => {
          jest.advanceTimersByTime(1000);
        });
      }
      await waitFor(() => expect(screen.getByText('Resend code')).toBeTruthy());

      let rejectResend!: (e: unknown) => void;
      mockRequestPasswordReset.mockReturnValueOnce(new Promise((_r, rej) => (rejectResend = rej)));
      fireEvent.press(screen.getByTestId('forgot-resend-button'));

      await waitFor(() => expect(screen.getByText('Sending…')).toBeTruthy());
      expect(screen.getByTestId('forgot-reset-button')).toBeDisabled();

      await act(async () => rejectResend(new TypeError('Network request failed')));

      await waitFor(() =>
        expect(
          screen.getByText('Could not send the code. Check your connection and try again.')
        ).toBeTruthy()
      );
      // Failed resend does not start a new cooldown.
      expect(screen.getByText('Resend code')).toBeTruthy();
      expect(screen.getByTestId('forgot-resend-button')).not.toBeDisabled();
    });
  });

  describe('back to sign in', () => {
    it('navigates to Login from the email step', () => {
      const { navigation } = renderForgot();

      fireEvent.press(screen.getByTestId('forgot-back-button'));

      expect(navigation.navigate).toHaveBeenCalledWith('Login');
    });

    it('navigates to Login from the code step', async () => {
      const { navigation } = renderForgot();
      await goToResetStep();

      fireEvent.press(screen.getByTestId('forgot-back-button'));

      expect(navigation.navigate).toHaveBeenCalledWith('Login');
    });
  });
});
