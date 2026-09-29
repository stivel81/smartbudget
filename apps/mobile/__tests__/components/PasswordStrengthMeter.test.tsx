import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import PasswordStrengthMeter from '../../components/PasswordStrengthMeter';
import { COLORS } from '../../lib/theme';

const barColors = () =>
  [1, 2, 3, 4].map((bar) => StyleSheet.flatten(screen.getByTestId(`pw-strength-bar-${bar}`).props.style).backgroundColor);
const labelColor = () => StyleSheet.flatten(screen.getByTestId('pw-strength-label').props.style).color;

describe('components/PasswordStrengthMeter', () => {
  it('shows empty bars and no label for an empty password', () => {
    render(<PasswordStrengthMeter password="" testIDPrefix="pw" />);
    expect(barColors()).toEqual([COLORS.border, COLORS.border, COLORS.border, COLORS.border]);
    expect(screen.queryByTestId('pw-strength-label')).toBeNull();
  });

  it.each([
    // password, label, filled bars, color
    ['abc', 'Weak', 1, COLORS.danger],
    ['abcdefgh1', 'Fair', 2, COLORS.warning],
    ['Abcdefgh1', 'Good', 3, COLORS.success],
    ['Abcdefgh1!', 'Strong', 4, COLORS.success],
  ])('%p: %s colors %i bar(s) and the label', (password, label, filled, color) => {
    render(<PasswordStrengthMeter password={password} testIDPrefix="pw" />);
    expect(screen.getByTestId('pw-strength-label').props.children).toBe(label);
    expect(labelColor()).toBe(color);
    expect(barColors()).toEqual([1, 2, 3, 4].map((bar) => (bar <= filled ? color : COLORS.border)));
  });

  it('uses distinct colors for Weak, Fair and Good', () => {
    const colorFor = (password: string) => {
      const { unmount } = render(<PasswordStrengthMeter password={password} testIDPrefix="pw" />);
      const color = labelColor();
      unmount();
      return color;
    };
    expect(new Set([colorFor('abc'), colorFor('abcdefgh1'), colorFor('Abcdefgh1')]).size).toBe(3);
  });

  it('re-colors as the password gets stronger', () => {
    const { rerender } = render(<PasswordStrengthMeter password="abc" testIDPrefix="pw" />);
    expect(labelColor()).toBe(COLORS.danger);
    rerender(<PasswordStrengthMeter password="abcdefgh1" testIDPrefix="pw" />);
    expect(labelColor()).toBe(COLORS.warning);
    rerender(<PasswordStrengthMeter password="Abcdefgh1!" testIDPrefix="pw" />);
    expect(labelColor()).toBe(COLORS.success);
  });
});
