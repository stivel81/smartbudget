import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen, within } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MaterialCommunityIcons = ({ name }: { name: string }) => React.createElement(View, { testID: `icon-${name}` });
  return { MaterialCommunityIcons };
});

import ReceiptItemsList from '../../components/ReceiptItemsList';
import { CATEGORY_META } from '../../lib/theme';

const ITEMS = [
  { name: 'כללי', amount: 350, category: 'Other' },
  { name: 'Milk', amount: 1234.5, category: 'Groceries' },
];

const style = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style);

describe('ReceiptItemsList', () => {
  it('renders one row per item with name, formatted amount and category chip', () => {
    render(<ReceiptItemsList items={ITEMS} onPressCategory={jest.fn()} />);
    expect(screen.getByTestId('receipt-line-name-0').props.children).toBe('כללי');
    expect(screen.getByTestId('receipt-line-amount-0').props.children).toBe('₪350.00');
    expect(screen.getByTestId('receipt-line-amount-1').props.children).toBe('₪1,234.50');
    const chip = screen.getByTestId('receipt-line-category-1');
    expect(within(chip).getByText('Groceries')).toBeTruthy();
    expect(within(chip).getByTestId(`icon-${CATEGORY_META.Groceries.icon}`)).toBeTruthy();
    expect(within(chip).getByTestId('icon-chevron-down')).toBeTruthy();
  });

  it('tapping a chip reports its index', () => {
    const onPressCategory = jest.fn();
    render(<ReceiptItemsList items={ITEMS} onPressCategory={onPressCategory} />);
    fireEvent.press(screen.getByTestId('receipt-line-category-1'));
    expect(onPressCategory).toHaveBeenCalledWith(1);
  });

  it('labels each chip with the item and its current category', () => {
    render(<ReceiptItemsList items={ITEMS} onPressCategory={jest.fn()} />);
    expect(screen.getByLabelText('Category for Milk: Groceries. Change category')).toBeTruthy();
    expect(screen.getByTestId('receipt-line-category-0').props.accessibilityRole).toBe('button');
  });

  it('disables the chips when disabled', () => {
    const onPressCategory = jest.fn();
    render(<ReceiptItemsList items={ITEMS} onPressCategory={onPressCategory} disabled />);
    fireEvent.press(screen.getByTestId('receipt-line-category-0'));
    expect(onPressCategory).not.toHaveBeenCalled();
    expect(screen.getByTestId('receipt-line-category-0').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true })
    );
  });

  it('is read-only without onPressCategory (no chevron, disabled)', () => {
    render(<ReceiptItemsList items={ITEMS} />);
    expect(screen.queryByTestId('icon-chevron-down')).toBeNull();
    expect(screen.getByTestId('receipt-line-category-0').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true })
    );
    fireEvent.press(screen.getByTestId('receipt-line-category-0')); // no crash
  });

  it('shows "Saving…" on the line being saved and locks every chip meanwhile', () => {
    const onPressCategory = jest.fn();
    render(<ReceiptItemsList items={ITEMS} onPressCategory={onPressCategory} savingIndex={0} />);
    expect(within(screen.getByTestId('receipt-line-category-0')).getByText('Saving…')).toBeTruthy();
    expect(screen.getByTestId('receipt-line-category-0').props.accessibilityState).toEqual(
      expect.objectContaining({ busy: true, disabled: true })
    );
    fireEvent.press(screen.getByTestId('receipt-line-category-1'));
    expect(onPressCategory).not.toHaveBeenCalled();
  });

  it('uses the given testID prefix', () => {
    render(<ReceiptItemsList items={ITEMS} testIDPrefix="scan-item" />);
    expect(screen.getByTestId('scan-items')).toBeTruthy();
    expect(screen.getByTestId('scan-item-category-0')).toBeTruthy();
  });

  it('renders an empty list without rows', () => {
    render(<ReceiptItemsList items={[]} />);
    expect(screen.queryByTestId('receipt-line-0')).toBeNull();
  });

  describe('layout (a long Hebrew name never collides with the amount)', () => {
    beforeEach(() => {
      render(<ReceiptItemsList items={ITEMS} onPressCategory={jest.fn()} />);
    });

    it('lays the row out horizontally with a fixed gap between cells', () => {
      expect(style('receipt-line-0')).toEqual(expect.objectContaining({ flexDirection: 'row', gap: 8 }));
    });

    it('lets the name take the leftover width, shrink, and ellipsize on one line', () => {
      expect(style('receipt-line-name-0')).toEqual(expect.objectContaining({ flex: 1, minWidth: 0 }));
      expect(screen.getByTestId('receipt-line-name-0').props.numberOfLines).toBe(1);
      expect(screen.getByTestId('receipt-line-name-0').props.ellipsizeMode).toBe('tail');
    });

    it('never shrinks the amount or the chip', () => {
      expect(style('receipt-line-amount-0').flexShrink).toBe(0);
      expect(style('receipt-line-category-0').flexShrink).toBe(0);
    });

    it('start-aligns both a Hebrew and a Latin name (bidi direction follows the script)', () => {
      expect(style('receipt-line-name-0')).toEqual(expect.objectContaining({ textAlign: 'left', writingDirection: 'rtl' }));
      expect(style('receipt-line-name-1')).toEqual(expect.objectContaining({ textAlign: 'left', writingDirection: 'ltr' }));
    });

    it('colors the chip from the category metadata', () => {
      expect(style('receipt-line-category-1').backgroundColor).toBe(CATEGORY_META.Groceries.backgroundColor);
    });
  });
});

import { BASE_CATEGORY_LIST, toCategoryInfo } from '../../lib/categories';
import { CategoriesContext, staticCategoriesValue } from '../../lib/categoriesContext';

describe('ReceiptItemsList with custom categories', () => {
  const PETS = toCategoryInfo({
    id: 'c-pets',
    user_id: 'u1',
    name: 'Pets',
    icon: 'paw',
    color: '#DB2777',
    is_base: false,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
  });

  it("renders a custom category chip with its icon and tint; unknown names look like Other", () => {
    render(
      <CategoriesContext.Provider value={staticCategoriesValue([...BASE_CATEGORY_LIST, PETS])}>
        <ReceiptItemsList
          items={[
            { name: 'Kibble', amount: 40, category: 'Pets' },
            { name: 'Old', amount: 5, category: 'Gone' },
          ]}
          onPressCategory={jest.fn()}
        />
      </CategoriesContext.Provider>
    );
    const chip = screen.getByTestId('receipt-line-category-0');
    expect(within(chip).getByTestId('icon-paw')).toBeTruthy();
    expect(within(chip).getByText('Pets')).toBeTruthy();
    expect(style('receipt-line-category-0').backgroundColor).toBe('#DB27771F');
    expect(within(screen.getByTestId('receipt-line-category-1')).getByTestId(`icon-${CATEGORY_META.Other.icon}`)).toBeTruthy();
    expect(style('receipt-line-category-1').backgroundColor).toBe(CATEGORY_META.Other.backgroundColor);
  });
});
