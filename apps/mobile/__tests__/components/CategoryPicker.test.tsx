import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen, within } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MaterialCommunityIcons = ({ name }: { name: string }) => React.createElement(View, { testID: `icon-${name}` });
  return { MaterialCommunityIcons };
});

import CategoryPicker from '../../components/CategoryPicker';
import { RECEIPT_CATEGORIES } from '../../lib/categories';
import { CATEGORY_META, COLORS } from '../../lib/theme';

function renderPicker(props: Partial<React.ComponentProps<typeof CategoryPicker>> = {}) {
  const onSelect = jest.fn();
  const onClose = jest.fn();
  render(
    <CategoryPicker
      visible
      categories={RECEIPT_CATEGORIES}
      selected="Groceries"
      onSelect={onSelect}
      onClose={onClose}
      {...props}
    />
  );
  return { onSelect, onClose };
}

describe('CategoryPicker', () => {
  it('lists every category passed in, in order, with its icon', () => {
    renderPicker();
    const options = RECEIPT_CATEGORIES.map((c) => screen.getByTestId(`category-option-${c}`));
    expect(options).toHaveLength(6);
    for (const category of RECEIPT_CATEGORIES) {
      const option = screen.getByTestId(`category-option-${category}`);
      expect(within(option).getByText(category)).toBeTruthy();
      expect(within(option).getByTestId(`icon-${CATEGORY_META[category].icon}`)).toBeTruthy();
    }
    expect(screen.getByText('Choose category')).toBeTruthy();
  });

  it('renders exactly the list it is given (not a hardcoded one)', () => {
    renderPicker({ categories: ['Dining', 'Pets'], selected: 'Pets' });
    expect(screen.getByTestId('category-option-Dining')).toBeTruthy();
    expect(screen.getByTestId('category-option-Pets')).toBeTruthy();
    expect(screen.queryByTestId('category-option-Groceries')).toBeNull();
    // Unknown categories get the "Other" icon.
    expect(within(screen.getByTestId('category-option-Pets')).getByTestId(`icon-${CATEGORY_META.Other.icon}`)).toBeTruthy();
  });

  it('checks only the current category and marks it selected for accessibility', () => {
    renderPicker({ selected: 'Dining' });
    expect(screen.getByTestId('category-option-check-Dining')).toBeTruthy();
    for (const category of RECEIPT_CATEGORIES.filter((c) => c !== 'Dining')) {
      expect(screen.queryByTestId(`category-option-check-${category}`)).toBeNull();
      expect(screen.getByTestId(`category-option-${category}`).props.accessibilityState).toEqual(
        expect.objectContaining({ selected: false })
      );
    }
    expect(screen.getByTestId('category-option-Dining').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true })
    );
  });

  it('checks nothing when there is no current category', () => {
    renderPicker({ selected: null });
    expect(screen.queryByTestId(/category-option-check-/)).toBeNull();
  });

  it('selecting a category calls onSelect with it, then closes', () => {
    const { onSelect, onClose } = renderPicker();
    fireEvent.press(screen.getByTestId('category-option-Health'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('Health');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.invocationCallOrder[0]).toBeLessThan(onClose.mock.invocationCallOrder[0]);
  });

  it('re-selecting the current category still reports it (the caller decides it is a no-op)', () => {
    const { onSelect, onClose } = renderPicker({ selected: 'Groceries' });
    fireEvent.press(screen.getByTestId('category-option-Groceries'));
    expect(onSelect).toHaveBeenCalledWith('Groceries');
    expect(onClose).toHaveBeenCalled();
  });

  it('closes without selecting from the close button, the backdrop and the back gesture', () => {
    const { onSelect, onClose } = renderPicker();
    fireEvent.press(screen.getByTestId('category-picker-close'));
    fireEvent.press(screen.getByTestId('category-picker-backdrop'));
    fireEvent(screen.UNSAFE_getByType(require('react-native').Modal), 'requestClose');
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('has accessible labels and roles', () => {
    renderPicker();
    expect(screen.getByLabelText('Close category picker')).toBeTruthy();
    expect(screen.getByLabelText('Dismiss category picker')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Choose category' })).toBeTruthy();
    for (const category of RECEIPT_CATEGORIES) {
      const option = screen.getByLabelText(category);
      expect(option.props.accessibilityRole).toBe('button');
    }
  });

  it('shows the line item name as a subtitle, start-aligned (RTL base direction) when Hebrew', () => {
    renderPicker({ subtitle: 'כללי' });
    const subtitle = screen.getByTestId('category-picker-subtitle');
    expect(subtitle.props.children).toBe('כללי');
    expect(subtitle.props.numberOfLines).toBe(1);
    expect(StyleSheet.flatten(subtitle.props.style)).toEqual(
      expect.objectContaining({ textAlign: 'left', writingDirection: 'rtl' })
    );
  });

  it('omits the subtitle when none is given', () => {
    renderPicker();
    expect(screen.queryByTestId('category-picker-subtitle')).toBeNull();
  });

  it('renders nothing when not visible', () => {
    renderPicker({ visible: false });
    expect(screen.queryByTestId('category-picker')).toBeNull();
  });

  it('is a bottom sheet on a dimmed backdrop using theme tokens', () => {
    renderPicker();
    expect(StyleSheet.flatten(screen.getByTestId('category-picker').props.style).justifyContent).toBe('flex-end');
    expect(StyleSheet.flatten(screen.getByTestId('category-picker-backdrop').props.style).backgroundColor).toBe(
      COLORS.overlay
    );
    expect(StyleSheet.flatten(screen.getByTestId('category-picker-sheet').props.style).backgroundColor).toBe(
      COLORS.surface
    );
  });
});
