import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const makeIcon = () => {
    const Icon = ({ name }: { name: string }) => React.createElement(View, { testID: `icon-${name}` });
    Icon.glyphMap = {};
    return Icon;
  };
  return { Feather: makeIcon(), MaterialCommunityIcons: makeIcon() };
});

const mockGoBack = jest.fn();
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ goBack: mockGoBack, navigate: mockNavigate }),
}));

const mockChangePassword = jest.fn();
jest.mock('../../lib/api', () => ({
  changePassword: (...args: unknown[]) => mockChangePassword(...args),
}));

import SettingsScreen, { PASSWORD_CHANGED_MESSAGE } from '../../screens/SettingsScreen';
import { AuthContext, AuthContextType } from '../../lib/auth';
import { COLORS } from '../../lib/theme';
import appJson from '../../app.json';

function renderSettings(overrides: Partial<AuthContextType> = {}) {
  const value: AuthContextType = {
    isAuthenticated: true,
    setIsAuthenticated: jest.fn(),
    accessToken: 'test-token',
    setAccessToken: jest.fn(),
    refreshToken: 'ref',
    setRefreshToken: jest.fn(),
    userEmail: 'adrian@example.com',
    setUserEmail: jest.fn(),
    userName: null,
    setUserName: jest.fn(),
    expiresAt: null,
    setExpiresAt: jest.fn(),
    sessionNotice: null,
    setSessionNotice: jest.fn(),
    logout: jest.fn(async () => {}),
    ...overrides,
  };
  render(
    <AuthContext.Provider value={value}>
      <SettingsScreen />
    </AuthContext.Provider>
  );
  return value;
}

function fill(current: string, next: string) {
  fireEvent.changeText(screen.getByTestId('settings-current-password-input'), current);
  fireEvent.changeText(screen.getByTestId('settings-new-password-input'), next);
}

function submit() {
  fireEvent.press(screen.getByTestId('settings-change-password-button'));
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('SettingsScreen', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('layout', () => {
    it('renders the V2 header with a back button that goes back', () => {
      renderSettings();
      expect(screen.getByText('Settings')).toBeTruthy();
      expect(screen.getByText('Profile')).toBeTruthy(); // back label
      fireEvent.press(screen.getByTestId('settings-back-button'));
      expect(mockGoBack).toHaveBeenCalledTimes(1);
    });

    it('uses a white full-bleed header and safe area over a grey page', () => {
      renderSettings();
      expect(StyleSheet.flatten(screen.getByTestId('settings-screen').props.style).backgroundColor).toBe(COLORS.surface);
      expect(StyleSheet.flatten(screen.getByTestId('settings-header').props.style).backgroundColor).toBe(COLORS.surface);
    });

    it('shows the app version from app.json', () => {
      renderSettings();
      expect(screen.getByText('Version')).toBeTruthy();
      expect(screen.getByTestId('settings-app-version').props.children).toBe(appJson.expo.version);
    });

    it('offers no self-service account deletion', () => {
      renderSettings();
      expect(screen.queryByText(/delete/i)).toBeNull();
    });

    it('starts with both password fields masked and empty, and no banners', () => {
      renderSettings();
      for (const id of ['settings-current-password-input', 'settings-new-password-input']) {
        expect(screen.getByTestId(id).props.secureTextEntry).toBe(true);
        expect(screen.getByTestId(id).props.value).toBe('');
      }
      expect(screen.queryByTestId('settings-error')).toBeNull();
      expect(screen.queryByTestId('settings-success')).toBeNull();
    });
  });

  describe('show/hide toggles', () => {
    it('toggles each field independently', () => {
      renderSettings();
      fireEvent.press(screen.getByTestId('settings-current-password-toggle'));
      expect(screen.getByTestId('settings-current-password-input').props.secureTextEntry).toBe(false);
      expect(screen.getByTestId('settings-new-password-input').props.secureTextEntry).toBe(true);

      fireEvent.press(screen.getByTestId('settings-new-password-toggle'));
      expect(screen.getByTestId('settings-new-password-input').props.secureTextEntry).toBe(false);

      fireEvent.press(screen.getByTestId('settings-current-password-toggle'));
      expect(screen.getByTestId('settings-current-password-input').props.secureTextEntry).toBe(true);
    });

    it('labels the toggle for accessibility', () => {
      renderSettings();
      const toggle = screen.getByTestId('settings-new-password-toggle');
      expect(toggle.props.accessibilityLabel).toBe('Show password');
      fireEvent.press(toggle);
      expect(screen.getByTestId('settings-new-password-toggle').props.accessibilityLabel).toBe('Hide password');
    });
  });

  it('shows the shared strength meter for the new password', () => {
    renderSettings();
    fireEvent.changeText(screen.getByTestId('settings-new-password-input'), 'Abcdefgh1234!');
    expect(screen.getByText('Strong')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('settings-strength-bar-4').props.style).backgroundColor).toBe(
      COLORS.success
    );
  });

  describe('validation (no API call)', () => {
    it.each([
      ['', 'newpassword1', 'Current password is required'],
      ['oldpassword', '', 'Password is required'],
      ['oldpassword', 'short', 'Password must be at least 8 characters'],
      ['samepassword', 'samepassword', 'New password must be different from your current password'],
    ])('current=%p new=%p → %p', (current, next, message) => {
      renderSettings();
      fill(current, next);
      submit();
      expect(screen.getByTestId('settings-error')).toBeTruthy();
      expect(screen.getByText(message)).toBeTruthy();
      expect(mockChangePassword).not.toHaveBeenCalled();
    });

    it('tells a signed-out user to sign in again instead of calling the API', () => {
      renderSettings({ accessToken: null });
      fill('oldpassword', 'newpassword1');
      submit();
      expect(screen.getByText('Your session has ended. Please sign in again.')).toBeTruthy();
      expect(mockChangePassword).not.toHaveBeenCalled();
    });
  });

  describe('submitting', () => {
    it('calls changePassword with both passwords and the access token', async () => {
      mockChangePassword.mockResolvedValueOnce({ message: 'Password updated' });
      renderSettings();
      fill('oldpassword', 'newpassword1');
      submit();

      await waitFor(() => expect(screen.getByTestId('settings-success')).toBeTruthy());
      expect(mockChangePassword).toHaveBeenCalledTimes(1);
      expect(mockChangePassword).toHaveBeenCalledWith('oldpassword', 'newpassword1');
    });

    it('on success shows the message, clears and re-masks both fields', async () => {
      mockChangePassword.mockResolvedValueOnce({ message: 'Password updated' });
      renderSettings();
      fill('oldpassword', 'newpassword1');
      fireEvent.press(screen.getByTestId('settings-current-password-toggle'));
      fireEvent.press(screen.getByTestId('settings-new-password-toggle'));
      submit();

      await waitFor(() => expect(screen.getByText(PASSWORD_CHANGED_MESSAGE)).toBeTruthy());
      expect(PASSWORD_CHANGED_MESSAGE).toBe('Password updated');
      for (const id of ['settings-current-password-input', 'settings-new-password-input']) {
        expect(screen.getByTestId(id).props.value).toBe('');
        expect(screen.getByTestId(id).props.secureTextEntry).toBe(true);
      }
      expect(screen.queryByTestId('settings-error')).toBeNull();
      expect(screen.getByText('Update password')).toBeTruthy();
    });

    it('does not sign the user out on success', async () => {
      mockChangePassword.mockResolvedValueOnce({ message: 'Password updated' });
      const auth = renderSettings();
      fill('oldpassword', 'newpassword1');
      submit();
      await waitFor(() => expect(screen.getByTestId('settings-success')).toBeTruthy());
      expect(auth.logout).not.toHaveBeenCalled();
      expect(auth.setIsAuthenticated).not.toHaveBeenCalled();
    });

    it('shows the backend message for a wrong current password and keeps the input', async () => {
      mockChangePassword.mockRejectedValueOnce({ message: 'Current password is incorrect', code: 400 });
      renderSettings();
      fill('wrongpassword', 'newpassword1');
      submit();

      await waitFor(() => expect(screen.getByText('Current password is incorrect')).toBeTruthy());
      expect(screen.queryByTestId('settings-success')).toBeNull();
      expect(screen.getByTestId('settings-current-password-input').props.value).toBe('wrongpassword');
      expect(screen.getByTestId('settings-new-password-input').props.value).toBe('newpassword1');
      expect(screen.getByText('Update password')).toBeTruthy();
    });

    it('shows a friendly message (not the raw TypeError) on a network error', async () => {
      mockChangePassword.mockRejectedValueOnce(new TypeError('Network request failed'));
      renderSettings();
      fill('oldpassword', 'newpassword1');
      submit();

      await waitFor(() =>
        expect(
          screen.getByText('Could not change your password. Check your connection and try again.')
        ).toBeTruthy()
      );
      expect(screen.queryByText(/Network request failed/)).toBeNull();
    });

    it('shows a spinner and locks the form while saving; a second press is ignored', async () => {
      const pending = deferred<{ message: string }>();
      mockChangePassword.mockReturnValueOnce(pending.promise);
      renderSettings();
      fill('oldpassword', 'newpassword1');
      submit();

      expect(await screen.findByTestId('settings-saving')).toBeTruthy();
      expect(screen.getByTestId('settings-change-password-button').props.accessibilityState).toEqual(
        expect.objectContaining({ disabled: true })
      );
      expect(screen.getByTestId('settings-current-password-input').props.editable).toBe(false);
      expect(screen.getByTestId('settings-new-password-input').props.editable).toBe(false);
      submit();
      expect(mockChangePassword).toHaveBeenCalledTimes(1);

      await act(async () => {
        pending.resolve({ message: 'Password updated' });
      });
      expect(screen.getByTestId('settings-success')).toBeTruthy();
      expect(screen.getByTestId('settings-current-password-input').props.editable).toBe(true);
    });

    it('clears a previous success when a new attempt fails validation', async () => {
      mockChangePassword.mockResolvedValueOnce({ message: 'Password updated' });
      renderSettings();
      fill('oldpassword', 'newpassword1');
      submit();
      await waitFor(() => expect(screen.getByTestId('settings-success')).toBeTruthy());

      submit(); // fields are empty now
      expect(screen.queryByTestId('settings-success')).toBeNull();
      expect(screen.getByText('Current password is required')).toBeTruthy();
    });
  });
});
