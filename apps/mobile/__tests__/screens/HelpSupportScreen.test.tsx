import React from 'react';
import { Alert, Linking, StyleSheet } from 'react-native';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Icon = ({ name }: { name: string }) => React.createElement(View, { testID: `icon-${name}` });
  Icon.glyphMap = {};
  return { MaterialCommunityIcons: Icon, Feather: Icon };
});

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ goBack: mockGoBack, navigate: jest.fn() }),
}));

import HelpSupportScreen, { SUPPORT_NOT_CONFIGURED } from '../../screens/HelpSupportScreen';
import { FAQ_ITEMS } from '../../lib/content/helpFaq';
import { COLORS } from '../../lib/theme';

describe('HelpSupportScreen', () => {
  let openSpy: jest.SpyInstance;
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    openSpy.mockRestore();
    alertSpy.mockRestore();
    jest.clearAllMocks();
  });

  it('renders the header with a back button that goes back', () => {
    render(<HelpSupportScreen supportEmail="help@smartbudget.app" />);
    expect(screen.getByText('Help & Support')).toBeTruthy();
    fireEvent.press(screen.getByTestId('help-back-button'));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('lists every FAQ item with its question and answer', () => {
    render(<HelpSupportScreen supportEmail="help@smartbudget.app" />);
    for (const item of FAQ_ITEMS) {
      const el = screen.getByTestId(`help-faq-${item.id}`);
      expect(within(el).getByText(item.question)).toBeTruthy();
      expect(within(el).getByText(item.answer)).toBeTruthy();
    }
    expect(screen.getByText('How do budgets and alerts work?')).toBeTruthy();
    expect(screen.getByText(/90% of its limit an amber banner/)).toBeTruthy();
    expect(screen.getByText(/100% or more the banner turns red/)).toBeTruthy();
  });

  describe('support email configured', () => {
    it('opens a mailto: link to the configured address', async () => {
      render(<HelpSupportScreen supportEmail="help@smartbudget.app" />);
      expect(screen.getByText('Contact support')).toBeTruthy();
      expect(screen.getByTestId('help-support-email').props.children).toBe('help@smartbudget.app');

      fireEvent.press(screen.getByTestId('help-contact-button'));

      await waitFor(() =>
        expect(openSpy).toHaveBeenCalledWith('mailto:help@smartbudget.app?subject=SmartBudget%20support')
      );
      expect(openSpy).toHaveBeenCalledTimes(1);
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it('alerts with the address when no mail app can open it', async () => {
      openSpy.mockRejectedValueOnce(new Error('No app'));
      render(<HelpSupportScreen supportEmail="help@smartbudget.app" />);

      fireEvent.press(screen.getByTestId('help-contact-button'));

      await waitFor(() =>
        expect(alertSpy).toHaveBeenCalledWith('Could not open your mail app', 'Email us at help@smartbudget.app.')
      );
    });

    it('reads EXPO_PUBLIC_SUPPORT_EMAIL by default', async () => {
      const original = process.env.EXPO_PUBLIC_SUPPORT_EMAIL;
      process.env.EXPO_PUBLIC_SUPPORT_EMAIL = 'env@smartbudget.app';
      try {
        render(<HelpSupportScreen />);
        fireEvent.press(screen.getByTestId('help-contact-button'));
        await waitFor(() =>
          expect(openSpy).toHaveBeenCalledWith('mailto:env@smartbudget.app?subject=SmartBudget%20support')
        );
      } finally {
        if (original === undefined) delete process.env.EXPO_PUBLIC_SUPPORT_EMAIL;
        else process.env.EXPO_PUBLIC_SUPPORT_EMAIL = original;
      }
    });
  });

  describe('support email not configured', () => {
    it.each([null, undefined])('shows a disabled button with an explanation (%p)', async (value) => {
      const original = process.env.EXPO_PUBLIC_SUPPORT_EMAIL;
      delete process.env.EXPO_PUBLIC_SUPPORT_EMAIL;
      try {
        render(<HelpSupportScreen supportEmail={value as null | undefined} />);
        const button = screen.getByTestId('help-contact-button');
        expect(screen.getByText(SUPPORT_NOT_CONFIGURED)).toBeTruthy();
        expect(SUPPORT_NOT_CONFIGURED).toBe('Support email not configured');
        expect(screen.queryByText('Contact support')).toBeNull();
        expect(screen.queryByTestId('help-support-email')).toBeNull();
        expect(button.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
        expect(StyleSheet.flatten(button.props.style).backgroundColor).toBe(COLORS.border);

        fireEvent.press(button);
        // Let any (wrongly) scheduled async work run before the negative assertion.
        await new Promise((r) => setImmediate(r));
        expect(openSpy).not.toHaveBeenCalled();
        expect(alertSpy).not.toHaveBeenCalled();
      } finally {
        if (original !== undefined) process.env.EXPO_PUBLIC_SUPPORT_EMAIL = original;
      }
    });

    it('treats a malformed address as not configured', () => {
      render(<HelpSupportScreen supportEmail={'' as unknown as null} />);
      expect(screen.getByText(SUPPORT_NOT_CONFIGURED)).toBeTruthy();
    });
  });
});
