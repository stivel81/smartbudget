import React from 'react';
import { Alert, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

// Render icons as plain Views tagged by glyph name (no font loading under jest).
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MaterialCommunityIcons = ({ name, color }: { name: string; color?: string }) =>
    React.createElement(View, { testID: `icon-${name}`, iconColor: color });
  MaterialCommunityIcons.glyphMap = {};
  return { MaterialCommunityIcons };
});

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: mockGoBack }),
}));

const mockGetCategories = jest.fn();
const mockCreateCategory = jest.fn();
const mockUpdateCategory = jest.fn();
const mockDeleteCategory = jest.fn();
jest.mock('../../lib/api', () => ({
  getCategories: (...args: unknown[]) => mockGetCategories(...args),
  createCategory: (...args: unknown[]) => mockCreateCategory(...args),
  updateCategory: (...args: unknown[]) => mockUpdateCategory(...args),
  deleteCategory: (...args: unknown[]) => mockDeleteCategory(...args),
}));

import ManageCategoriesScreen, { deleteCategoryMessage } from '../../screens/ManageCategoriesScreen';
import { CategoriesProvider } from '../../lib/categoriesContext';
import {
  BASE_CATEGORY_IDS,
  CATEGORY_NAME_REQUIRED_MESSAGE,
  CATEGORY_NAME_TAKEN_MESSAGE,
  CUSTOM_CATEGORY_DEFAULT_COLOR,
  CUSTOM_CATEGORY_DEFAULT_ICON,
  RECEIPT_CATEGORIES,
} from '../../lib/categories';
import type { Category } from '../../lib/api';
import { CATEGORY_META } from '../../lib/theme';

function row(partial: Partial<Category> & { id: string; name: string }): Category {
  return {
    user_id: 'u1',
    icon: null,
    color: null,
    is_base: false,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    ...partial,
  };
}

const BASE_ROWS: Category[] = RECEIPT_CATEGORIES.map((name) =>
  row({ id: BASE_CATEGORY_IDS[name], name, is_base: true, user_id: null })
);
const PETS = row({ id: 'c-pets', name: 'Pets', icon: 'paw', color: '#DB2777' });

type AlertButton = { text?: string; style?: string; onPress?: () => void };

function renderScreen() {
  return render(
    <CategoriesProvider enabled>
      <ManageCategoriesScreen />
    </CategoriesProvider>
  );
}

async function renderLoaded(custom: Category[] = [PETS]) {
  mockGetCategories.mockResolvedValue({ categories: [...BASE_ROWS, ...custom] });
  renderScreen();
  if (custom.length > 0) {
    await waitFor(() => expect(screen.getByTestId(`category-item-${custom[0].name}`)).toBeTruthy());
  } else {
    await waitFor(() => expect(screen.getByTestId('categories-empty')).toBeTruthy());
  }
}

describe('ManageCategoriesScreen', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('renders the screen with a back button to Profile', async () => {
    await renderLoaded();
    expect(screen.getByTestId('categories-screen')).toBeTruthy();
    expect(screen.getByText('Categories')).toBeTruthy();
    fireEvent.press(screen.getByTestId('categories-back-button'));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('lists the base categories as built-in and locked, with no edit/delete controls', async () => {
    await renderLoaded();
    for (const name of RECEIPT_CATEGORIES) {
      const item = screen.getByTestId(`category-item-${name}`);
      expect(within(item).getByTestId(`category-base-lock-${name}`)).toBeTruthy();
      expect(screen.queryByTestId(`category-edit-${name}`)).toBeNull();
      expect(screen.queryByTestId(`category-delete-${name}`)).toBeNull();
      expect(item.props.accessibilityLabel).toBe(`${name}, built-in category, can't be edited`);
    }
    expect(screen.getByText('Built-in')).toBeTruthy();
  });

  it("lists the user's categories with their icon and edit/delete controls", async () => {
    await renderLoaded();
    const item = screen.getByTestId('category-item-Pets');
    expect(within(item).getByTestId('icon-paw').props.iconColor).toBe('#DB2777');
    expect(screen.getByTestId('category-edit-Pets')).toBeTruthy();
    expect(screen.getByTestId('category-delete-Pets')).toBeTruthy();
    expect(screen.queryByTestId('category-base-lock-Pets')).toBeNull();
  });

  it('shows an empty state when there are no custom categories', async () => {
    await renderLoaded([]);
    expect(screen.getByText('No custom categories yet')).toBeTruthy();
  });

  it('re-fetches the list when opened', async () => {
    await renderLoaded();
    // Provider's initial load + the screen's refresh on open.
    await waitFor(() => expect(mockGetCategories).toHaveBeenCalledTimes(2));
  });

  it('shows a retry notice when the list cannot be loaded, base rows still listed', async () => {
    mockGetCategories.mockRejectedValue(new TypeError('Network request failed'));
    renderScreen();

    await waitFor(() => expect(screen.getByTestId('categories-load-error')).toBeTruthy());
    expect(screen.getByTestId('category-item-Groceries')).toBeTruthy();

    mockGetCategories.mockResolvedValue({ categories: [...BASE_ROWS, PETS] });
    fireEvent.press(screen.getByTestId('categories-retry-button'));
    await waitFor(() => expect(screen.getByTestId('category-item-Pets')).toBeTruthy());
    expect(screen.queryByTestId('categories-load-error')).toBeNull();
  });

  describe('add', () => {
    it('creates a category with the picked icon and color, then lists it', async () => {
      await renderLoaded([]);
      fireEvent.press(screen.getByTestId('categories-add-button'));

      expect(screen.getByText('New category')).toBeTruthy();
      expect(screen.getByTestId('category-name-input').props.value).toBe('');
      // Defaults are preselected.
      expect(
        screen.getByTestId(`category-icon-option-${CUSTOM_CATEGORY_DEFAULT_ICON}`).props.accessibilityState
      ).toMatchObject({ selected: true });
      expect(
        screen.getByTestId(`category-color-option-${CUSTOM_CATEGORY_DEFAULT_COLOR.slice(1)}`).props.accessibilityState
      ).toMatchObject({ selected: true });

      fireEvent.changeText(screen.getByTestId('category-name-input'), '  Gifts ');
      fireEvent.press(screen.getByTestId('category-icon-option-gift-outline'));
      fireEvent.press(screen.getByTestId('category-color-option-0891B2'));
      expect(within(screen.getByTestId('category-editor-preview')).getByTestId('icon-gift-outline')).toBeTruthy();

      const gifts = row({ id: 'c-gifts', name: 'Gifts', icon: 'gift-outline', color: '#0891B2' });
      mockCreateCategory.mockResolvedValue({ category: gifts });
      mockGetCategories.mockResolvedValue({ categories: [...BASE_ROWS, gifts] });
      fireEvent.press(screen.getByTestId('category-save-button'));

      await waitFor(() => expect(screen.getByTestId('category-item-Gifts')).toBeTruthy());
      expect(mockCreateCategory).toHaveBeenCalledWith({ name: 'Gifts', icon: 'gift-outline', color: '#0891B2' });
      expect(screen.queryByText('New category')).toBeNull();
    });

    it('rejects an empty name without calling the server', async () => {
      await renderLoaded([]);
      fireEvent.press(screen.getByTestId('categories-add-button'));
      fireEvent.changeText(screen.getByTestId('category-name-input'), '   ');
      fireEvent.press(screen.getByTestId('category-save-button'));

      expect(screen.getByTestId('category-editor-error').props.children).toBe(CATEGORY_NAME_REQUIRED_MESSAGE);
      expect(mockCreateCategory).not.toHaveBeenCalled();
    });

    it('limits the name to 30 characters', async () => {
      await renderLoaded([]);
      fireEvent.press(screen.getByTestId('categories-add-button'));
      expect(screen.getByTestId('category-name-input').props.maxLength).toBe(30);
    });

    it('catches a clash with a base name locally (case-insensitive)', async () => {
      await renderLoaded([]);
      fireEvent.press(screen.getByTestId('categories-add-button'));
      fireEvent.changeText(screen.getByTestId('category-name-input'), 'dining');
      fireEvent.press(screen.getByTestId('category-save-button'));

      expect(screen.getByTestId('category-editor-error').props.children).toBe(CATEGORY_NAME_TAKEN_MESSAGE);
      expect(mockCreateCategory).not.toHaveBeenCalled();
    });

    it('shows the 409 from the server inline and keeps the editor open', async () => {
      await renderLoaded([]);
      fireEvent.press(screen.getByTestId('categories-add-button'));
      fireEvent.changeText(screen.getByTestId('category-name-input'), 'Travel');
      mockCreateCategory.mockRejectedValue({ message: 'A category named "Travel" already exists', code: 409 });

      fireEvent.press(screen.getByTestId('category-save-button'));

      await waitFor(() =>
        expect(screen.getByTestId('category-editor-error').props.children).toBe(
          'A category with that name already exists'
        )
      );
      expect(screen.getByText('New category')).toBeTruthy();
      expect(screen.getByTestId('category-name-input').props.value).toBe('Travel');
    });

    it("shows a 400 validation error's server message inline", async () => {
      await renderLoaded([]);
      fireEvent.press(screen.getByTestId('categories-add-button'));
      fireEvent.changeText(screen.getByTestId('category-name-input'), 'Travel');
      mockCreateCategory.mockRejectedValue({ message: 'color must be null or a hex color like #1A2B3C', code: 400 });

      fireEvent.press(screen.getByTestId('category-save-button'));

      await waitFor(() =>
        expect(screen.getByTestId('category-editor-error').props.children).toBe(
          'color must be null or a hex color like #1A2B3C'
        )
      );
    });

    it('shows a connection message when offline', async () => {
      await renderLoaded([]);
      fireEvent.press(screen.getByTestId('categories-add-button'));
      fireEvent.changeText(screen.getByTestId('category-name-input'), 'Travel');
      mockCreateCategory.mockRejectedValue(new TypeError('Network request failed'));

      fireEvent.press(screen.getByTestId('category-save-button'));

      await waitFor(() =>
        expect(screen.getByTestId('category-editor-error').props.children).toMatch(/Check your connection/)
      );
    });

    it('clears the error when the name is edited, and cancel closes the editor', async () => {
      await renderLoaded([]);
      fireEvent.press(screen.getByTestId('categories-add-button'));
      fireEvent.press(screen.getByTestId('category-save-button'));
      expect(screen.getByTestId('category-editor-error')).toBeTruthy();

      fireEvent.changeText(screen.getByTestId('category-name-input'), 'T');
      expect(screen.queryByTestId('category-editor-error')).toBeNull();

      fireEvent.press(screen.getByTestId('category-cancel-button'));
      expect(screen.queryByText('New category')).toBeNull();
    });

    it('shows a spinner and disables the buttons while saving', async () => {
      await renderLoaded([]);
      fireEvent.press(screen.getByTestId('categories-add-button'));
      fireEvent.changeText(screen.getByTestId('category-name-input'), 'Travel');
      let resolve!: (v: unknown) => void;
      mockCreateCategory.mockReturnValue(new Promise((r) => (resolve = r)));

      fireEvent.press(screen.getByTestId('category-save-button'));

      await waitFor(() => expect(screen.getByTestId('category-saving')).toBeTruthy());
      expect(screen.getByTestId('category-save-button').props.accessibilityState).toMatchObject({ disabled: true });
      fireEvent.press(screen.getByTestId('category-save-button'));
      expect(mockCreateCategory).toHaveBeenCalledTimes(1);

      await act(async () => resolve({ category: row({ id: 'c-t', name: 'Travel' }) }));
    });
  });

  describe('edit', () => {
    it('opens pre-filled and renames / recolors, sending only what changed', async () => {
      await renderLoaded();
      fireEvent.press(screen.getByTestId('category-edit-Pets'));

      expect(screen.getByText('Edit category')).toBeTruthy();
      expect(screen.getByTestId('category-name-input').props.value).toBe('Pets');
      expect(screen.getByTestId('category-icon-option-paw').props.accessibilityState).toMatchObject({ selected: true });
      expect(screen.getByTestId('category-color-option-DB2777').props.accessibilityState).toMatchObject({
        selected: true,
      });

      fireEvent.changeText(screen.getByTestId('category-name-input'), 'Animals');
      fireEvent.press(screen.getByTestId('category-color-option-7C3AED'));

      const renamed = { ...PETS, name: 'Animals', color: '#7C3AED' };
      mockUpdateCategory.mockResolvedValue({ category: renamed });
      mockGetCategories.mockResolvedValue({ categories: [...BASE_ROWS, renamed] });
      fireEvent.press(screen.getByTestId('category-save-button'));

      await waitFor(() => expect(screen.getByTestId('category-item-Animals')).toBeTruthy());
      expect(mockUpdateCategory).toHaveBeenCalledWith('c-pets', { name: 'Animals', color: '#7C3AED' });
      expect(screen.queryByTestId('category-item-Pets')).toBeNull();
      expect(screen.queryByText('Edit category')).toBeNull();
    });

    it('closes without a request when nothing changed', async () => {
      await renderLoaded();
      fireEvent.press(screen.getByTestId('category-edit-Pets'));
      fireEvent.press(screen.getByTestId('category-save-button'));

      expect(mockUpdateCategory).not.toHaveBeenCalled();
      expect(screen.queryByText('Edit category')).toBeNull();
    });

    it('allows changing only the casing of its own name', async () => {
      await renderLoaded();
      fireEvent.press(screen.getByTestId('category-edit-Pets'));
      fireEvent.changeText(screen.getByTestId('category-name-input'), 'PETS');
      mockUpdateCategory.mockResolvedValue({ category: { ...PETS, name: 'PETS' } });
      fireEvent.press(screen.getByTestId('category-save-button'));

      await waitFor(() => expect(mockUpdateCategory).toHaveBeenCalledWith('c-pets', { name: 'PETS' }));
    });

    it('shows a server 409 inline on rename', async () => {
      await renderLoaded();
      fireEvent.press(screen.getByTestId('category-edit-Pets'));
      fireEvent.changeText(screen.getByTestId('category-name-input'), 'Travel');
      mockUpdateCategory.mockRejectedValue({ message: 'clash', code: 409 });

      fireEvent.press(screen.getByTestId('category-save-button'));

      await waitFor(() =>
        expect(screen.getByTestId('category-editor-error').props.children).toBe(CATEGORY_NAME_TAKEN_MESSAGE)
      );
    });
  });

  describe('delete', () => {
    function lastConfirmButtons(): AlertButton[] {
      const call = alertSpy.mock.calls[alertSpy.mock.calls.length - 1];
      return call[2] as AlertButton[];
    }

    it('asks first, explaining that items move to Other and the budget is removed', async () => {
      await renderLoaded();
      fireEvent.press(screen.getByTestId('category-delete-Pets'));

      expect(alertSpy).toHaveBeenCalledWith(
        'Delete Pets?',
        'Items in Pets will move to Other and its budget will be removed.',
        expect.any(Array)
      );
      expect(deleteCategoryMessage('Pets')).toBe('Items in Pets will move to Other and its budget will be removed.');
      expect(mockDeleteCategory).not.toHaveBeenCalled();
    });

    it('Cancel keeps the category', async () => {
      await renderLoaded();
      fireEvent.press(screen.getByTestId('category-delete-Pets'));
      const cancel = lastConfirmButtons().find((b) => b.text === 'Cancel');
      expect(cancel?.style).toBe('cancel');
      cancel?.onPress?.();

      expect(mockDeleteCategory).not.toHaveBeenCalled();
      expect(screen.getByTestId('category-item-Pets')).toBeTruthy();
    });

    it('confirming deletes it and removes the row', async () => {
      await renderLoaded();
      fireEvent.press(screen.getByTestId('category-delete-Pets'));
      const confirm = lastConfirmButtons().find((b) => b.text === 'Delete');
      expect(confirm?.style).toBe('destructive');

      mockDeleteCategory.mockResolvedValue(undefined);
      mockGetCategories.mockResolvedValue({ categories: BASE_ROWS });
      await act(async () => confirm?.onPress?.());

      expect(mockDeleteCategory).toHaveBeenCalledWith('c-pets');
      await waitFor(() => expect(screen.queryByTestId('category-item-Pets')).toBeNull());
      expect(screen.getByTestId('categories-empty')).toBeTruthy();
    });

    it('a failed delete shows an Alert and keeps the row', async () => {
      await renderLoaded();
      fireEvent.press(screen.getByTestId('category-delete-Pets'));
      const confirm = lastConfirmButtons().find((b) => b.text === 'Delete');

      mockDeleteCategory.mockRejectedValue({ message: 'Category not found', code: 404 });
      await act(async () => confirm?.onPress?.());

      await waitFor(() =>
        expect(alertSpy).toHaveBeenCalledWith('Could not delete category', 'This category no longer exists')
      );
      expect(screen.getByTestId('category-item-Pets')).toBeTruthy();
    });
  });

  it("tints a custom tile with the category's color and keeps the base look for built-ins", async () => {
    await renderLoaded();
    const bg = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style).backgroundColor;
    expect(bg('category-icon-Pets')).toBe('#DB27771F');
    expect(bg('category-icon-Groceries')).toBe(CATEGORY_META.Groceries.backgroundColor);
  });
});
