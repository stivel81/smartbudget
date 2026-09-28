import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Icon = ({ name }: { name: string }) => React.createElement(View, { testID: `icon-${name}` });
  Icon.glyphMap = {};
  return { MaterialCommunityIcons: Icon };
});

import ScreenHeader from '../../components/ScreenHeader';
import { COLORS } from '../../lib/theme';

describe('components/ScreenHeader', () => {
  it('renders the title as a header and a chevron back button', () => {
    render(<ScreenHeader title="Settings" onBack={() => {}} testIDPrefix="x" />);
    expect(screen.getByText('Settings').props.accessibilityRole).toBe('header');
    expect(screen.getByTestId('icon-chevron-left')).toBeTruthy();
  });

  it('defaults the back label to "Back"', () => {
    render(<ScreenHeader title="T" onBack={() => {}} testIDPrefix="x" />);
    expect(screen.getByText('Back')).toBeTruthy();
    expect(screen.getByTestId('x-back-button').props.accessibilityLabel).toBe('Back to Back');
  });

  it('uses a custom back label', () => {
    render(<ScreenHeader title="T" backLabel="Profile" onBack={() => {}} testIDPrefix="x" />);
    expect(screen.getByText('Profile')).toBeTruthy();
    expect(screen.getByTestId('x-back-button').props.accessibilityLabel).toBe('Back to Profile');
  });

  it('calls onBack when pressed', () => {
    const onBack = jest.fn();
    render(<ScreenHeader title="T" onBack={onBack} testIDPrefix="x" />);
    fireEvent.press(screen.getByTestId('x-back-button'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('is a white full-bleed bar', () => {
    render(<ScreenHeader title="T" onBack={() => {}} testIDPrefix="x" />);
    const style = StyleSheet.flatten(screen.getByTestId('x-header').props.style);
    expect(style.backgroundColor).toBe(COLORS.surface);
    expect(style.margin ?? style.marginHorizontal ?? 0).toBe(0);
  });
});
