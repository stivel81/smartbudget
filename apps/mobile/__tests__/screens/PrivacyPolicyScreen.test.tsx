import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen, within } from '@testing-library/react-native';

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

import PrivacyPolicyScreen from '../../screens/PrivacyPolicyScreen';
import { PRIVACY_POLICY_LAST_UPDATED, PRIVACY_POLICY_SECTIONS } from '../../lib/content/privacyPolicy';
import { COLORS } from '../../lib/theme';

function allText(): string {
  return screen.getAllByText(/.+/).map((n) => {
    const c = n.props.children;
    return Array.isArray(c) ? c.join('') : String(c);
  }).join('\n');
}

describe('PrivacyPolicyScreen', () => {
  afterEach(() => jest.clearAllMocks());

  it('renders the header with a back button that goes back', () => {
    render(<PrivacyPolicyScreen />);
    expect(screen.getByText('Privacy Policy')).toBeTruthy();
    fireEvent.press(screen.getByTestId('privacy-back-button'));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('shows a clearly visible draft label at the top, in the alert colors', () => {
    render(<PrivacyPolicyScreen />);
    const badge = screen.getByTestId('privacy-draft-label');
    expect(within(badge).getByText('Draft — pending legal review')).toBeTruthy();
    const style = StyleSheet.flatten(badge.props.style);
    expect(style.backgroundColor).toBe(COLORS.alertBg);
    expect(style.borderColor).toBe(COLORS.alertBorder);
    // It renders before the last-updated line and every policy section.
    const order = screen
      .getAllByTestId(/^privacy-(draft-label|last-updated|section-\d+)$/)
      .map((n) => n.props.testID);
    expect(order[0]).toBe('privacy-draft-label');
    expect(order[1]).toBe('privacy-last-updated');
  });

  it('shows the last-updated date', () => {
    render(<PrivacyPolicyScreen />);
    const updated = screen.getByTestId('privacy-last-updated').props.children;
    expect([].concat(updated).join('')).toBe(`Last updated: ${PRIVACY_POLICY_LAST_UPDATED}`);
  });

  it('renders every section heading and paragraph from the content module', () => {
    render(<PrivacyPolicyScreen />);
    PRIVACY_POLICY_SECTIONS.forEach((section, i) => {
      const el = screen.getByTestId(`privacy-section-${i}`);
      expect(within(el).getByText(section.heading)).toBeTruthy();
      section.paragraphs.forEach((p) => expect(within(el).getByText(p)).toBeTruthy());
    });
  });

  it.each([
    ['Anthropic / Claude', /Anthropic's Claude API/],
    ['Supabase', /Supabase Storage/],
    ['row-level security', /[Rr]ow-level security/],
    ['export on request', /Export:.*request/],
    ['deletion on request', /Deletion:.*request/],
    ['no ads/tracking', /no advertising, and no analytics or tracking SDKs/],
  ])('shows the key disclosure: %s', (_label, pattern) => {
    render(<PrivacyPolicyScreen />);
    expect(allText()).toMatch(pattern);
  });

  it('is scrollable', () => {
    render(<PrivacyPolicyScreen />);
    expect(screen.getByTestId('privacy-scroll').props.scrollEnabled).not.toBe(false);
  });
});
