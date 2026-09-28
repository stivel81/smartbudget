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

const mockVerifySignup = jest.fn();
const mockResendSignupCode = jest.fn();
jest.mock('../../lib/api', () => ({
  verifySignup: (...args: unknown[]) => mockVerifySignup(...args),
  resendSignupCode: (...args: unknown[]) => mockResendSignupCode(...args),
}));

import VerifyEmailScreen, { NOT_VERIFIED_NOTICE, RESENT_NOTICE } from '../../screens/VerifyEmailScreen';
import { AuthContext, AuthContextType } from '../../lib/auth';
import { OTP_RESEND_COOLDOWN_SECONDS } from '../../lib/validation';
import { COLORS } from '../../lib/theme';

const EMAIL = 'new@example.com';
const SESSION = {
  session: {
    access_token: 'verified-access',
    refresh_token: 'verified-refresh',
    user: { id: 'u9', email: EMAIL, name: 'Adrian Schtivelmager' },
  },
};

function renderVerify(params: { email: string; sendCode?: boolean } = { email: EMAIL }) {
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
    logout: jest.fn(async () => {}),
  };

  const utils = render(
    <AuthContext.Provider value={auth}>
      <VerifyEmailScreen navigation={navigation} route={{ key: 'VerifyEmail', name: 'VerifyEmail', params } as any} />
    </AuthContext.Provider>
  );

  return { navigation, auth, ...utils };
}

/** Run the resend cooldown down to 0, one tick at a time so each re-scheduled timeout fires. */
function runOutCooldown() {
  for (let i = 0; i < OTP_RESEND_COOLDOWN_SECONDS; i++) {
    act(() => {
      jest.advanceTimersByTime(1000);
    });
  }
}

describe('VerifyEmailScreen', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('layout', () => {
    it('shows "Check your email" and the address the code went to', () => {
      renderVerify();

      expect(screen.getByText('Check your email')).toBeTruthy();
      expect(screen.getByText('Enter the 6-digit code we sent to')).toBeTruthy();
      expect(screen.getByTestId('verify-email-address')).toHaveTextContent(EMAIL);
      expect(screen.getByText('Verify')).toBeTruthy();
      expect(screen.getByText('Back to sign in')).toBeTruthy();
    });

    it('uses a white page so the grey code input is visible against it (ForgotPassword style)', () => {
      renderVerify();

      const pageBg = StyleSheet.flatten(screen.getByTestId('verify-screen').props.style).backgroundColor;
      const inputBg = StyleSheet.flatten(screen.getByTestId('verify-code-input').props.style).backgroundColor;
      expect(pageBg).toBe(COLORS.surface);
      expect(inputBg).toBe(COLORS.background);
    });

    it('starts with an empty code and no banners', () => {
      renderVerify();

      expect(screen.getByTestId('verify-code-input').props.value).toBe('');
      expect(screen.queryByTestId('verify-error')).toBeNull();
      expect(screen.queryByTestId('verify-notice')).toBeNull();
    });
  });

  describe('code field', () => {
    it('keeps only digits, capped at 6, with number pad and one-time-code autofill', () => {
      renderVerify();

      const input = screen.getByTestId('verify-code-input');
      expect(input.props.maxLength).toBe(6);
      expect(input.props.keyboardType).toBe('number-pad');
      expect(input.props.textContentType).toBe('oneTimeCode');
      expect(input.props.autoComplete).toBe('one-time-code');

      fireEvent.changeText(input, '12a 34-5678');
      expect(screen.getByTestId('verify-code-input').props.value).toBe('123456');
    });

    it('does not stretch the placeholder: letter spacing only once a digit is typed', () => {
      renderVerify();

      expect(screen.getByTestId('verify-code-input').props.placeholder).toBe('6-digit code');
      const empty = StyleSheet.flatten(screen.getByTestId('verify-code-input').props.style);
      expect(empty.letterSpacing).toBeUndefined();

      fireEvent.changeText(screen.getByTestId('verify-code-input'), '4');
      const filled = StyleSheet.flatten(screen.getByTestId('verify-code-input').props.style);
      expect(filled.letterSpacing).toBe(6);
    });
  });

  describe('verify', () => {
    it('requires a code, without calling the backend', async () => {
      renderVerify();

      fireEvent.press(screen.getByTestId('verify-button'));

      await waitFor(() => expect(screen.getByText('Code is required')).toBeTruthy());
      expect(mockVerifySignup).not.toHaveBeenCalled();
    });

    it('rejects a code shorter than 6 digits, without calling the backend', async () => {
      renderVerify();

      fireEvent.changeText(screen.getByTestId('verify-code-input'), '123');
      fireEvent.press(screen.getByTestId('verify-button'));

      await waitFor(() => expect(screen.getByText('Enter the 6-digit code from your email')).toBeTruthy());
      expect(mockVerifySignup).not.toHaveBeenCalled();
    });

    it('verifies the email + code and signs in via the auth context (incl. the name)', async () => {
      const { auth, navigation } = renderVerify();
      mockVerifySignup.mockResolvedValueOnce(SESSION);

      fireEvent.changeText(screen.getByTestId('verify-code-input'), '123456');
      fireEvent.press(screen.getByTestId('verify-button'));

      await waitFor(() => expect(auth.setIsAuthenticated).toHaveBeenCalledWith(true));
      expect(mockVerifySignup).toHaveBeenCalledTimes(1);
      expect(mockVerifySignup).toHaveBeenCalledWith(EMAIL, '123456');
      expect(auth.setAccessToken).toHaveBeenCalledWith('verified-access');
      expect(auth.setRefreshToken).toHaveBeenCalledWith('verified-refresh');
      expect(auth.setUserEmail).toHaveBeenCalledWith(EMAIL);
      expect(auth.setUserName).toHaveBeenCalledWith('Adrian Schtivelmager');
      // App.tsx swaps to the Main stack on isAuthenticated; no manual navigation.
      expect(navigation.reset).not.toHaveBeenCalled();
      expect(navigation.navigate).not.toHaveBeenCalled();
    });

    it('shows a spinner and disables Verify and Resend while verifying', async () => {
      jest.useFakeTimers();
      renderVerify();
      runOutCooldown();
      let resolveVerify!: (v: unknown) => void;
      mockVerifySignup.mockReturnValueOnce(new Promise((r) => (resolveVerify = r)));

      fireEvent.changeText(screen.getByTestId('verify-code-input'), '123456');
      fireEvent.press(screen.getByTestId('verify-button'));

      await waitFor(() => expect(screen.getByTestId('verify-loading')).toBeTruthy());
      expect(screen.getByTestId('verify-button')).toBeDisabled();
      expect(screen.getByTestId('verify-resend-button')).toBeDisabled();
      expect(screen.getByTestId('verify-code-input').props.editable).toBe(false);
      expect(screen.getByTestId('verify-back-button')).toBeDisabled();

      // A second tap while in flight does nothing.
      fireEvent.press(screen.getByTestId('verify-button'));
      expect(mockVerifySignup).toHaveBeenCalledTimes(1);

      await act(async () => resolveVerify(SESSION));
      await waitFor(() => expect(screen.queryByTestId('verify-loading')).toBeNull());
    });

    it('shows "Invalid or expired code", stays on the screen and does not sign in', async () => {
      const { auth, navigation } = renderVerify();
      mockVerifySignup.mockRejectedValueOnce({ message: 'Invalid or expired code', code: 400 });

      fireEvent.changeText(screen.getByTestId('verify-code-input'), '000000');
      fireEvent.press(screen.getByTestId('verify-button'));

      // Wait for the rejection to be fully handled before asserting nothing else happened.
      await waitFor(() => expect(screen.getByTestId('verify-error')).toHaveTextContent('Invalid or expired code'));
      await waitFor(() => expect(screen.getByTestId('verify-button')).not.toBeDisabled());
      expect(auth.setIsAuthenticated).not.toHaveBeenCalled();
      expect(auth.setAccessToken).not.toHaveBeenCalled();
      expect(auth.setUserName).not.toHaveBeenCalled();
      expect(navigation.navigate).not.toHaveBeenCalled();
      // The code is kept so the user can correct a typo.
      expect(screen.getByTestId('verify-code-input').props.value).toBe('000000');
    });

    it('shows the rate-limit message from the backend', async () => {
      renderVerify();
      mockVerifySignup.mockRejectedValueOnce({ message: 'Too many requests, please try again later.', code: 429 });

      fireEvent.changeText(screen.getByTestId('verify-code-input'), '123456');
      fireEvent.press(screen.getByTestId('verify-button'));

      await waitFor(() => expect(screen.getByText('Too many requests, please try again later.')).toBeTruthy());
    });

    it('shows a friendly message on a network failure and does not sign in', async () => {
      const { auth } = renderVerify();
      mockVerifySignup.mockRejectedValueOnce(new TypeError('Network request failed'));

      fireEvent.changeText(screen.getByTestId('verify-code-input'), '123456');
      fireEvent.press(screen.getByTestId('verify-button'));

      await waitFor(() =>
        expect(screen.getByText('Could not verify your email. Check your connection and try again.')).toBeTruthy()
      );
      await waitFor(() => expect(screen.getByTestId('verify-button')).not.toBeDisabled());
      expect(screen.queryByText('Network request failed')).toBeNull();
      expect(auth.setIsAuthenticated).not.toHaveBeenCalled();
    });

    it('clears a previous error when verifying again', async () => {
      const { auth } = renderVerify();
      mockVerifySignup.mockRejectedValueOnce({ message: 'Invalid or expired code', code: 400 });
      fireEvent.changeText(screen.getByTestId('verify-code-input'), '000000');
      fireEvent.press(screen.getByTestId('verify-button'));
      await waitFor(() => expect(screen.getByTestId('verify-error')).toBeTruthy());
      await waitFor(() => expect(screen.getByTestId('verify-button')).not.toBeDisabled());

      mockVerifySignup.mockResolvedValueOnce(SESSION);
      fireEvent.changeText(screen.getByTestId('verify-code-input'), '123456');
      fireEvent.press(screen.getByTestId('verify-button'));

      await waitFor(() => expect(auth.setIsAuthenticated).toHaveBeenCalledWith(true));
      expect(screen.queryByTestId('verify-error')).toBeNull();
    });
  });

  describe('opened right after signup (code already sent)', () => {
    it('does not send another code on open, and starts the resend cooldown', async () => {
      renderVerify({ email: EMAIL });

      expect(screen.getByText(`Resend code in ${OTP_RESEND_COOLDOWN_SECONDS}s`)).toBeTruthy();
      expect(screen.getByTestId('verify-resend-button')).toBeDisabled();
      // Let any mount effects settle before asserting nothing was sent.
      await act(async () => {});
      expect(mockResendSignupCode).not.toHaveBeenCalled();
      expect(screen.queryByTestId('verify-notice')).toBeNull();
    });

    it(`enables "Resend code" after ${OTP_RESEND_COOLDOWN_SECONDS}s, resends to the same email and restarts the cooldown`, async () => {
      jest.useFakeTimers();
      renderVerify({ email: EMAIL });

      for (let i = 0; i < OTP_RESEND_COOLDOWN_SECONDS - 1; i++) {
        act(() => {
          jest.advanceTimersByTime(1000);
        });
      }
      expect(screen.getByText('Resend code in 1s')).toBeTruthy();
      expect(screen.getByTestId('verify-resend-button')).toBeDisabled();

      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(screen.getByText('Resend code')).toBeTruthy();
      expect(screen.getByTestId('verify-resend-button')).not.toBeDisabled();

      fireEvent.changeText(screen.getByTestId('verify-code-input'), '111111');
      mockResendSignupCode.mockResolvedValueOnce({ message: 'ok' });
      fireEvent.press(screen.getByTestId('verify-resend-button'));

      await waitFor(() => expect(screen.getByTestId('verify-notice')).toHaveTextContent(RESENT_NOTICE));
      expect(mockResendSignupCode).toHaveBeenCalledTimes(1);
      expect(mockResendSignupCode).toHaveBeenCalledWith(EMAIL);
      expect(screen.getByTestId('verify-code-input').props.value).toBe('');
      expect(screen.getByText(`Resend code in ${OTP_RESEND_COOLDOWN_SECONDS}s`)).toBeTruthy();
    });

    it('does not resend while the cooldown is running', async () => {
      renderVerify({ email: EMAIL });

      fireEvent.press(screen.getByTestId('verify-resend-button'));

      await waitFor(() => expect(screen.getByTestId('verify-resend-button')).toBeDisabled());
      expect(mockResendSignupCode).not.toHaveBeenCalled();
    });

    it('shows "Sending…" while resending, surfaces a failure and does not restart the cooldown', async () => {
      jest.useFakeTimers();
      renderVerify({ email: EMAIL });
      runOutCooldown();
      await waitFor(() => expect(screen.getByText('Resend code')).toBeTruthy());

      let rejectResend!: (e: unknown) => void;
      mockResendSignupCode.mockReturnValueOnce(new Promise((_r, rej) => (rejectResend = rej)));
      fireEvent.press(screen.getByTestId('verify-resend-button'));

      await waitFor(() => expect(screen.getByText('Sending…')).toBeTruthy());
      expect(screen.getByTestId('verify-button')).toBeDisabled();

      await act(async () => rejectResend(new TypeError('Network request failed')));

      await waitFor(() =>
        expect(screen.getByText('Could not send the code. Check your connection and try again.')).toBeTruthy()
      );
      expect(screen.getByText('Resend code')).toBeTruthy();
      expect(screen.getByTestId('verify-resend-button')).not.toBeDisabled();
      expect(screen.queryByTestId('verify-notice')).toBeNull();
    });
  });

  describe('opened from Login for an unverified account (sendCode)', () => {
    it('sends a fresh code once on open, then shows the notice and starts the cooldown', async () => {
      mockResendSignupCode.mockResolvedValueOnce({ message: 'ok' });
      renderVerify({ email: EMAIL, sendCode: true });

      await waitFor(() => expect(screen.getByTestId('verify-notice')).toHaveTextContent(NOT_VERIFIED_NOTICE));
      expect(mockResendSignupCode).toHaveBeenCalledTimes(1);
      expect(mockResendSignupCode).toHaveBeenCalledWith(EMAIL);
      expect(screen.getByText(`Resend code in ${OTP_RESEND_COOLDOWN_SECONDS}s`)).toBeTruthy();
      expect(screen.getByTestId('verify-resend-button')).toBeDisabled();
    });

    it('shows "Sending…" and disables Verify while the first code is being sent', async () => {
      let resolveSend!: (v: unknown) => void;
      mockResendSignupCode.mockReturnValueOnce(new Promise((r) => (resolveSend = r)));
      renderVerify({ email: EMAIL, sendCode: true });

      await waitFor(() => expect(screen.getByText('Sending…')).toBeTruthy());
      expect(screen.getByTestId('verify-button')).toBeDisabled();

      await act(async () => resolveSend({ message: 'ok' }));
      await waitFor(() => expect(screen.getByTestId('verify-button')).not.toBeDisabled());
    });

    it('surfaces a failed send and lets the user retry straight away', async () => {
      mockResendSignupCode.mockRejectedValueOnce({ message: 'Too many requests, please try again later.', code: 429 });
      renderVerify({ email: EMAIL, sendCode: true });

      await waitFor(() => expect(screen.getByText('Too many requests, please try again later.')).toBeTruthy());
      await waitFor(() => expect(screen.getByTestId('verify-resend-button')).not.toBeDisabled());
      expect(screen.getByText('Resend code')).toBeTruthy();
      expect(screen.queryByTestId('verify-notice')).toBeNull();

      mockResendSignupCode.mockResolvedValueOnce({ message: 'ok' });
      fireEvent.press(screen.getByTestId('verify-resend-button'));
      await waitFor(() => expect(screen.getByTestId('verify-notice')).toHaveTextContent(RESENT_NOTICE));
      expect(screen.queryByTestId('verify-error')).toBeNull();
      expect(mockResendSignupCode).toHaveBeenCalledTimes(2);
    });

    it('does not update state after unmounting mid-send (no act/unmounted warnings)', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      let resolveSend!: (v: unknown) => void;
      mockResendSignupCode.mockReturnValueOnce(new Promise((r) => (resolveSend = r)));
      const { unmount } = renderVerify({ email: EMAIL, sendCode: true });
      await waitFor(() => expect(mockResendSignupCode).toHaveBeenCalledTimes(1));

      unmount();
      await act(async () => resolveSend({ message: 'ok' }));

      expect(errorSpy).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  describe('back to sign in', () => {
    it('navigates to Login', () => {
      const { navigation } = renderVerify();

      fireEvent.press(screen.getByTestId('verify-back-button'));

      expect(navigation.navigate).toHaveBeenCalledWith('Login');
    });

    it('stays available while a code is being sent', async () => {
      let resolveSend!: (v: unknown) => void;
      mockResendSignupCode.mockReturnValueOnce(new Promise((r) => (resolveSend = r)));
      const { navigation } = renderVerify({ email: EMAIL, sendCode: true });
      await waitFor(() => expect(screen.getByText('Sending…')).toBeTruthy());

      fireEvent.press(screen.getByTestId('verify-back-button'));

      expect(navigation.navigate).toHaveBeenCalledWith('Login');
      await act(async () => resolveSend({ message: 'ok' }));
    });
  });
});
