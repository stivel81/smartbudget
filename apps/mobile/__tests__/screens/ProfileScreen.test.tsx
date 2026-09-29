import React from 'react';
import { Alert, StyleSheet } from 'react-native';
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react-native';

// Render icons as plain Views tagged by glyph name: avoids the async
// font-load state update (act() noise) and lets tests assert which icon shows.
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MaterialCommunityIcons = ({ name }: { name: string }) =>
    React.createElement(View, { testID: `icon-${name}` });
  MaterialCommunityIcons.glyphMap = {};
  return { MaterialCommunityIcons };
});

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
}));

import ProfileScreen, { MENU_ITEMS } from '../../screens/ProfileScreen';
import { AuthContext, AuthContextType } from '../../lib/auth';
import { COLORS } from '../../lib/theme';

function renderProfile(overrides: Partial<AuthContextType> = {}) {
  const value: AuthContextType = {
    isAuthenticated: true,
    setIsAuthenticated: () => {},
    accessToken: 'test-token',
    setAccessToken: () => {},
    refreshToken: 'test-refresh-token',
    setRefreshToken: () => {},
    userEmail: 'adrian@example.com',
    setUserEmail: () => {},
    userName: null,
    setUserName: () => {},
    expiresAt: null,
    setExpiresAt: () => {},
    sessionNotice: null,
    setSessionNotice: () => {},
    logout: jest.fn(async () => {}),
    ...overrides,
  };

  return { ...render(
    <AuthContext.Provider value={value}>
      <ProfileScreen />
    </AuthContext.Provider>
  ), value };
}

describe('ProfileScreen', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
    jest.clearAllMocks();
  });

  it('renders the V2 header', () => {
    renderProfile();
    expect(screen.getByText('Account')).toBeTruthy();
    expect(screen.getByText('Profile')).toBeTruthy();
  });

  it("shows the signed-in user's email", () => {
    renderProfile({ userEmail: 'adrian@example.com' });

    expect(screen.getByText('adrian@example.com')).toBeTruthy();
    expect(screen.getByText('Signed in')).toBeTruthy();
  });

  it('shows avatar initials derived from the email', () => {
    renderProfile({ userEmail: 'adrian@example.com' });
    expect(screen.getByText('AD')).toBeTruthy();
  });

  it('falls back to "?" initials and an empty email when none is known', () => {
    renderProfile({ userEmail: null });
    expect(screen.getByText('?')).toBeTruthy();
    expect(screen.getByTestId('profile-email').props.children).toBe('');
  });

  describe('with a display name', () => {
    it('shows the name as the title and the email underneath (no "Signed in")', () => {
      renderProfile({ userName: 'Adrian Schtivelmager', userEmail: 'stivel@gmail.com' });

      expect(screen.getByTestId('profile-name').props.children).toBe('Adrian Schtivelmager');
      expect(screen.getByTestId('profile-email').props.children).toBe('stivel@gmail.com');
      expect(screen.queryByText('Signed in')).toBeNull();
    });

    it('styles the name as the bold title and the email as the grey subtitle', () => {
      renderProfile({ userName: 'Adrian Schtivelmager', userEmail: 'stivel@gmail.com' });

      const title = StyleSheet.flatten(screen.getByTestId('profile-name').props.style);
      const subtitle = StyleSheet.flatten(screen.getByTestId('profile-email').props.style);
      expect(title.color).toBe(COLORS.textPrimary);
      expect(title.fontWeight).toBe('600');
      expect(subtitle.color).toBe(COLORS.textSecondary);
      expect(Number(title.fontSize)).toBeGreaterThan(Number(subtitle.fontSize));
    });

    it('uses name initials ("AS"), not email initials ("ST")', () => {
      renderProfile({ userName: 'Adrian Schtivelmager', userEmail: 'stivel@gmail.com' });

      expect(screen.getByTestId('profile-avatar')).toHaveTextContent('AS');
      expect(screen.queryByText('ST')).toBeNull();
    });

    it('handles a Hebrew name', () => {
      renderProfile({ userName: 'אדריאן שטיבלמגר', userEmail: 'stivel@gmail.com' });

      expect(screen.getByTestId('profile-name').props.children).toBe('אדריאן שטיבלמגר');
      expect(screen.getByTestId('profile-avatar')).toHaveTextContent('אש');
    });

    it('trims the name', () => {
      renderProfile({ userName: '  Ada Lovelace  ', userEmail: 'ada@example.com' });

      expect(screen.getByTestId('profile-name').props.children).toBe('Ada Lovelace');
    });
  });

  describe('email-only accounts', () => {
    it.each([null, '', '   '])('userName %p: email is the title with "Signed in" under it', (userName) => {
      renderProfile({ userName, userEmail: 'stivel@gmail.com' });

      expect(screen.queryByTestId('profile-name')).toBeNull();
      expect(screen.getByTestId('profile-email').props.children).toBe('stivel@gmail.com');
      const title = StyleSheet.flatten(screen.getByTestId('profile-email').props.style);
      expect(title.color).toBe(COLORS.textPrimary);
      expect(screen.getByText('Signed in')).toBeTruthy();
      expect(screen.getByTestId('profile-avatar')).toHaveTextContent('ST');
    });
  });

  it('lists exactly the Settings, Privacy Policy and Help & Support rows', () => {
    renderProfile();
    expect(screen.getByText('General')).toBeTruthy();
    ['Settings', 'Categories', 'Privacy Policy', 'Help & Support'].forEach((label) => {
      expect(screen.getByText(label)).toBeTruthy();
    });
    ['cog-outline', 'tag-multiple-outline', 'file-document-outline', 'help-circle-outline'].forEach((icon) => {
      expect(screen.getByTestId(`icon-${icon}`)).toBeTruthy();
    });
    expect(MENU_ITEMS.map((i) => i.label)).toEqual(['Settings', 'Categories', 'Privacy Policy', 'Help & Support']);
  });

  it('has no Notifications row (push notifications are a later phase)', () => {
    renderProfile();
    expect(screen.queryByText('Notifications')).toBeNull();
    expect(screen.queryByTestId('icon-bell-outline')).toBeNull();
  });

  it.each([
    ['profile-menu-settings', 'Settings'],
    ['profile-menu-categories', 'ManageCategories'],
    ['profile-menu-privacy', 'PrivacyPolicy'],
    ['profile-menu-help', 'HelpSupport'],
  ])('%s navigates to %s (and does not sign out or alert)', (testID, route) => {
    const { value } = renderProfile();
    fireEvent.press(screen.getByTestId(testID));
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(route);
    expect(value.logout).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  type AlertButton = { text?: string; style?: string; onPress?: () => void };

  /** The buttons of the most recent "Sign out?" confirmation. */
  function confirmationButtons(): AlertButton[] {
    const call = alertSpy.mock.calls.filter((c) => c[0] === 'Sign out?').pop();
    if (!call) throw new Error('Sign-out confirmation was not shown');
    return call[2] as AlertButton[];
  }

  /** Press Sign Out, then the Alert's destructive "Sign Out" choice. */
  function signOutAndConfirm() {
    fireEvent.press(screen.getByTestId('profile-sign-out-button'));
    const confirm = confirmationButtons().find((b) => b.text === 'Sign Out');
    act(() => {
      confirm?.onPress?.();
    });
  }

  it('asks for confirmation before signing out (Cancel + destructive Sign Out)', () => {
    const { value } = renderProfile();

    fireEvent.press(screen.getByTestId('profile-sign-out-button'));

    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [title, message, buttons] = alertSpy.mock.calls[0];
    expect(title).toBe('Sign out?');
    expect(typeof message).toBe('string');
    expect(buttons).toEqual([
      expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
      expect.objectContaining({ text: 'Sign Out', style: 'destructive' }),
    ]);
    // Nothing happens until the user confirms.
    expect(value.logout).not.toHaveBeenCalled();
    expect(screen.queryByTestId('profile-signing-out')).toBeNull();
  });

  it('does not sign out when the confirmation is cancelled', () => {
    const { value } = renderProfile();

    fireEvent.press(screen.getByTestId('profile-sign-out-button'));
    const cancel = confirmationButtons().find((b) => b.text === 'Cancel');
    act(() => {
      cancel?.onPress?.();
    });

    expect(value.logout).not.toHaveBeenCalled();
    expect(screen.getByText('Sign Out')).toBeTruthy();
  });

  it('calls auth.logout() once Sign Out is confirmed', async () => {
    const { value } = renderProfile();

    signOutAndConfirm();

    await waitFor(() => expect(value.logout).toHaveBeenCalledTimes(1));
    // Only the confirmation alert, no error alert.
    expect(alertSpy).toHaveBeenCalledTimes(1);
  });

  it('shows a spinner and disables the button while signing out', async () => {
    let finish!: () => void;
    const logout = jest.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    renderProfile({ logout });

    signOutAndConfirm();

    expect(await screen.findByTestId('profile-signing-out')).toBeTruthy();
    expect(screen.queryByText('Sign Out')).toBeNull();
    expect(screen.getByTestId('profile-sign-out-button').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true })
    );

    // A second press while in flight is ignored (no second confirmation either).
    fireEvent.press(screen.getByTestId('profile-sign-out-button'));
    expect(logout).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      finish();
    });
    expect(screen.getByText('Sign Out')).toBeTruthy();
  });

  it('alerts with the error message when logout fails, and re-enables the button', async () => {
    const logout = jest.fn(async () => {
      throw new Error('Network down');
    });
    renderProfile({ logout });

    signOutAndConfirm();

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Failed to sign out', 'Network down'));
    expect(screen.getByText('Sign Out')).toBeTruthy();
    expect(screen.getByTestId('profile-sign-out-button').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: false })
    );
  });

  it('alerts with a generic message when logout fails without one', async () => {
    const logout = jest.fn(() => Promise.reject({}));
    renderProfile({ logout });

    signOutAndConfirm();

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Failed to sign out', 'Please try again.'));
  });

  describe('header (white bg, full-bleed — consistent with Dashboard/Budget)', () => {
    it('gives the header a white (surface) background that differs from the avatar bg', () => {
      renderProfile();
      const headerBg = StyleSheet.flatten(screen.getByTestId('profile-header').props.style).backgroundColor;
      const avatarBg = StyleSheet.flatten(screen.getByTestId('profile-avatar').props.style).backgroundColor;
      expect(headerBg).toBe(COLORS.surface);
      expect(avatarBg).not.toBe(headerBg);
    });

    it('is full-bleed with a white safe area and a grey page below', () => {
      renderProfile();
      const root = StyleSheet.flatten(screen.getByTestId('profile-screen').props.style);
      const header = StyleSheet.flatten(screen.getByTestId('profile-header').props.style);
      expect(root.backgroundColor).toBe(COLORS.surface);
      expect(root.padding ?? root.paddingHorizontal ?? 0).toBe(0);
      expect(header.margin ?? header.marginHorizontal ?? 0).toBe(0);
      expect(StyleSheet.flatten(screen.getByTestId('profile-scroll').props.style).backgroundColor).toBe(
        COLORS.background
      );
    });
  });
});
