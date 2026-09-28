import React from 'react';
import { Alert, Animated, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator } from 'expo-image-manipulator';
import { setStatusBarStyle } from 'expo-status-bar';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    // No NavigationContainer in these tests: treat "focused" as "mounted".
    useFocusEffect: (effect: () => void | (() => void)) => {
      const React = require('react');
      React.useEffect(effect, []);
    },
  };
});

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

jest.mock('expo-status-bar', () => ({
  setStatusBarStyle: jest.fn(),
}));

const mockScanReceipt = jest.fn();
const mockUpdateReceipt = jest.fn();
const mockDeleteReceipt = jest.fn();
jest.mock('../../lib/api', () => ({
  scanReceipt: (...args: unknown[]) => mockScanReceipt(...args),
  updateReceipt: (...args: unknown[]) => mockUpdateReceipt(...args),
  deleteReceipt: (...args: unknown[]) => mockDeleteReceipt(...args),
}));

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

// Mirrors the real API shape used by resizeForUpload():
// manipulate(uri) -> context { resize, renderAsync, release }
// renderAsync() -> image { saveAsync, release }
const mockContext = {
  resize: jest.fn(),
  renderAsync: jest.fn(),
  release: jest.fn(),
};
const mockImage = {
  saveAsync: jest.fn(),
  release: jest.fn(),
};
jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: {
    manipulate: jest.fn(() => mockContext),
  },
  SaveFormat: {
    JPEG: 'jpeg',
  },
}));

import ScanScreen from '../../screens/ScanScreen';
import { AuthContext, AuthContextType } from '../../lib/auth';

const picker = ImagePicker as jest.Mocked<typeof ImagePicker>;
const manipulate = ImageManipulator.manipulate as jest.Mock;

const ASSET = { uri: 'file:///receipt.jpg', width: 1200, height: 900 } as ImagePicker.ImagePickerAsset;

function authValue(overrides: Partial<AuthContextType> = {}): AuthContextType {
  return {
    isAuthenticated: true,
    setIsAuthenticated: () => {},
    accessToken: 'test-token',
    setAccessToken: () => {},
    refreshToken: 'test-refresh-token',
    setRefreshToken: () => {},
    userEmail: 'test@example.com',
    setUserEmail: () => {},
    userName: null,
    setUserName: () => {},
    logout: async () => {},
    ...overrides,
  };
}

function renderScan(overrides: Partial<AuthContextType> = {}) {
  const utils = render(
    <AuthContext.Provider value={authValue(overrides)}>
      <ScanScreen />
    </AuthContext.Provider>
  );
  const rerenderWith = (next: Partial<AuthContextType>) =>
    utils.rerender(
      <AuthContext.Provider value={authValue(next)}>
        <ScanScreen />
      </AuthContext.Provider>
    );
  return { ...utils, rerenderWith };
}

function scanResponse(overrides: Partial<{ merchant: string; total: number; date: string; items: { name: string; amount: number; category: string }[] }> = {}) {
  return {
    receipt: {
      id: 'r1',
      user_id: 'u1',
      created_at: '2026-09-01T10:00:00Z',
      image_path: null,
      raw_response: {
        merchant: 'Test Store',
        total: 100,
        date: '2026-09-01',
        items: [
          { name: 'Milk', amount: 60, category: 'Groceries' },
          { name: 'Bread', amount: 40, category: 'Groceries' },
        ],
        ...overrides,
      },
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function scanFromGallery() {
  fireEvent.press(screen.getByTestId('scan-gallery-button'));
  return screen.findByTestId('scan-result-card');
}

function inputStyle(testID: string) {
  return StyleSheet.flatten(screen.getByTestId(testID).props.style);
}

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  // Animation frames (scan-line loop, card slide) only advance inside RNTL's
  // act()-wrapped waitFor/findBy, never behind the test's back.
  jest.useFakeTimers();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true } as never);
  picker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true } as never);
  picker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [ASSET] } as never);
  picker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [ASSET] } as never);
  mockContext.renderAsync.mockResolvedValue(mockImage);
  mockImage.saveAsync.mockResolvedValue({ base64: 'base64data' });
  mockScanReceipt.mockResolvedValue(scanResponse());
  mockUpdateReceipt.mockResolvedValue(scanResponse());
  mockDeleteReceipt.mockResolvedValue(undefined);
});

afterEach(() => {
  alertSpy.mockRestore();
  jest.clearAllMocks();
  jest.useRealTimers();
});

describe('ScanScreen — layout (V2 Screen 4)', () => {
  it('renders the dark top bar with title and a Cancel button', () => {
    renderScan();
    expect(screen.getByText('Scan Receipt')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();
  });

  it('renders four corner guides, the scan line and the spec hint text', () => {
    renderScan();
    ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'].forEach((corner) => {
      expect(screen.getByTestId(`scan-corner-${corner}`)).toBeTruthy();
    });
    expect(screen.getByTestId('scan-line')).toBeTruthy();
    expect(screen.getByText('Align receipt within the frame')).toBeTruthy();
  });

  it('renders gallery and capture controls but no dead flash button', () => {
    renderScan();
    expect(screen.getByLabelText('Choose from gallery')).toBeTruthy();
    expect(screen.getByLabelText('Take photo')).toBeTruthy();
    expect(screen.getByTestId('icon-camera')).toBeTruthy(); // black camera glyph on the white capture button
    expect(screen.queryByLabelText(/flash/i)).toBeNull();
    expect(screen.queryByTestId('icon-flash')).toBeNull();
  });

  it('Cancel is disabled while there is no result to discard', () => {
    renderScan();
    const cancel = screen.getByTestId('scan-cancel-button');
    expect(cancel.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    fireEvent.press(cancel);
    expect(mockDeleteReceipt).not.toHaveBeenCalled();
  });

  it('does not show the result card before a scan', () => {
    renderScan();
    expect(screen.queryByTestId('scan-result-card')).toBeNull();
  });

  it('switches the status bar to light content while focused and restores it on blur', () => {
    const { unmount } = renderScan();
    expect(setStatusBarStyle).toHaveBeenLastCalledWith('light');
    unmount();
    expect(setStatusBarStyle).toHaveBeenLastCalledWith('auto');
  });

  it('sizes the scan line travel to the measured frame height', () => {
    renderScan();
    fireEvent(screen.getByTestId('scan-frame'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 402 } },
    });
    const transform = StyleSheet.flatten(screen.getByTestId('scan-line').props.style).transform;
    expect(transform).toBeDefined();
  });
});

describe('ScanScreen — scan-line animation lifecycle', () => {
  it('starts a loop on mount and stops it on unmount', () => {
    const realLoop = Animated.loop;
    const loops: Animated.CompositeAnimation[] = [];
    const loopSpy = jest.spyOn(Animated, 'loop').mockImplementation((animation, config) => {
      const loop = realLoop(animation, config);
      jest.spyOn(loop, 'start');
      jest.spyOn(loop, 'stop');
      loops.push(loop);
      return loop;
    });

    try {
      const { unmount } = renderScan();
      expect(loops).toHaveLength(1);
      expect(loops[0].start).toHaveBeenCalledTimes(1);
      expect(loops[0].stop).not.toHaveBeenCalled();

      unmount();
      expect(loops[0].stop).toHaveBeenCalledTimes(1);
    } finally {
      loopSpy.mockRestore();
    }
  });

  it('stops scheduling animation frames after unmount', () => {
    const { unmount } = renderScan();
    act(() => {
      jest.advanceTimersByTime(5000); // run through at least two loop iterations
    });
    expect(jest.getTimerCount()).toBeGreaterThan(0); // loop is live while mounted

    unmount();
    // Frames already queued before unmount may flush once; after that nothing
    // may reschedule. (Guards against a self-restarting completion callback —
    // the old `sequence(...).start(() => restart())` pattern leaked here.)
    act(() => {
      jest.advanceTimersByTime(16);
    });
    expect(jest.getTimerCount()).toBe(0);
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('ScanScreen — permissions and picker', () => {
  it('alerts and stops when camera permission is denied', async () => {
    picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: false } as never);
    renderScan();

    fireEvent.press(screen.getByTestId('scan-capture-button'));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        'Camera permission required',
        'Enable camera access to scan a receipt.'
      )
    );
    expect(picker.launchCameraAsync).not.toHaveBeenCalled();
    expect(mockScanReceipt).not.toHaveBeenCalled();
  });

  it('alerts and stops when photo library permission is denied', async () => {
    picker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: false } as never);
    renderScan();

    fireEvent.press(screen.getByTestId('scan-gallery-button'));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        'Photo library permission required',
        'Enable photo access to select a receipt.'
      )
    );
    expect(picker.launchImageLibraryAsync).not.toHaveBeenCalled();
    expect(mockScanReceipt).not.toHaveBeenCalled();
  });

  it('does nothing when the user cancels the camera', async () => {
    picker.launchCameraAsync.mockResolvedValue({ canceled: true, assets: null } as never);
    renderScan();

    fireEvent.press(screen.getByTestId('scan-capture-button'));

    await waitFor(() => expect(picker.launchCameraAsync).toHaveBeenCalledWith({ quality: 0.7 }));
    expect(manipulate).not.toHaveBeenCalled();
    expect(mockScanReceipt).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('does nothing when the user cancels the gallery picker', async () => {
    picker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null } as never);
    renderScan();

    fireEvent.press(screen.getByTestId('scan-gallery-button'));

    await waitFor(() =>
      expect(picker.launchImageLibraryAsync).toHaveBeenCalledWith({ mediaTypes: ['images'], quality: 0.7 })
    );
    expect(manipulate).not.toHaveBeenCalled();
    expect(mockScanReceipt).not.toHaveBeenCalled();
  });

  it('does nothing when the picker returns no asset', async () => {
    picker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [] } as never);
    renderScan();

    fireEvent.press(screen.getByTestId('scan-gallery-button'));

    await waitFor(() => expect(picker.launchImageLibraryAsync).toHaveBeenCalled());
    expect(mockScanReceipt).not.toHaveBeenCalled();
  });
});

describe('ScanScreen — scanning', () => {
  it('scans a camera photo: uploads the resized JPEG and shows the extracted fields', async () => {
    renderScan();

    fireEvent.press(screen.getByTestId('scan-capture-button'));
    await screen.findByTestId('scan-result-card');

    expect(manipulate).toHaveBeenCalledWith('file:///receipt.jpg');
    expect(mockImage.saveAsync).toHaveBeenCalledWith({ format: 'jpeg', compress: 0.7, base64: true });
    expect(mockContext.release).toHaveBeenCalled();
    expect(mockImage.release).toHaveBeenCalled();
    expect(mockScanReceipt).toHaveBeenCalledWith('base64data', 'image/jpeg', 'test-token');

    expect(screen.getByText('AI Extracted')).toBeTruthy();
    expect(screen.getByTestId('icon-creation')).toBeTruthy(); // sparkles
    expect(screen.getByTestId('icon-cart')).toBeTruthy(); // Groceries category icon
    expect(screen.getByTestId('scan-merchant-input').props.value).toBe('Test Store');
    expect(screen.getByText('Groceries')).toBeTruthy();
    expect(screen.getByText('2026-09-01')).toBeTruthy();
    expect(screen.getByTestId('scan-total-input').props.value).toBe('₪100.00');
    expect(screen.getByText('Save Receipt')).toBeTruthy();
  });

  it('scans a gallery image the same way', async () => {
    renderScan();
    await scanFromGallery();
    expect(mockScanReceipt).toHaveBeenCalledWith('base64data', 'image/jpeg', 'test-token');
  });

  it('shows the scanning state while the upload is in flight', async () => {
    const pending = deferred<ReturnType<typeof scanResponse>>();
    mockScanReceipt.mockReturnValue(pending.promise);
    renderScan();

    fireEvent.press(screen.getByTestId('scan-gallery-button'));

    expect(await screen.findByText('Analyzing receipt…')).toBeTruthy();
    expect(screen.getByTestId('scan-loading')).toBeTruthy();
    expect(screen.getByTestId('scan-capture-button').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true })
    );
    expect(screen.getByTestId('scan-gallery-button').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true })
    );

    await act(async () => {
      pending.resolve(scanResponse());
    });

    await screen.findByTestId('scan-result-card');
    expect(screen.getByText('Align receipt within the frame')).toBeTruthy();
    expect(screen.queryByTestId('scan-loading')).toBeNull();
  });

  it('lists every distinct category on the result card', async () => {
    mockScanReceipt.mockResolvedValue(
      scanResponse({
        items: [
          { name: 'Milk', amount: 10, category: 'Groceries' },
          { name: 'Coffee', amount: 12, category: 'Dining' },
          { name: 'Eggs', amount: 8, category: 'Groceries' },
        ],
      })
    );
    renderScan();
    await scanFromGallery();
    expect(screen.getByText('Groceries, Dining')).toBeTruthy();
  });

  it('shows "Uncategorized" when Claude returned no line items', async () => {
    mockScanReceipt.mockResolvedValue(scanResponse({ items: [] }));
    renderScan();
    await scanFromGallery();
    expect(screen.getByText('Uncategorized')).toBeTruthy();
    expect(screen.getByTestId('icon-dots-horizontal')).toBeTruthy();
  });

  it('right-aligns an RTL (Hebrew) merchant name on the result card', async () => {
    mockScanReceipt.mockResolvedValue(scanResponse({ merchant: 'רמי לוי' }));
    renderScan();
    await scanFromGallery();

    expect(inputStyle('scan-merchant-input')).toEqual(
      expect.objectContaining({ textAlign: 'right', writingDirection: 'rtl' })
    );
  });

  it('left-aligns a Latin merchant name and re-aligns as the user edits', async () => {
    renderScan();
    await scanFromGallery();

    expect(inputStyle('scan-merchant-input')).toEqual(
      expect.objectContaining({ textAlign: 'left', writingDirection: 'ltr' })
    );

    fireEvent.changeText(screen.getByTestId('scan-merchant-input'), 'שופרסל');
    expect(inputStyle('scan-merchant-input')).toEqual(
      expect.objectContaining({ textAlign: 'right', writingDirection: 'rtl' })
    );
  });

  it('shows the API error and stays usable after a scan failure', async () => {
    mockScanReceipt.mockRejectedValueOnce({ message: 'Claude could not read this receipt' });
    renderScan();

    fireEvent.press(screen.getByTestId('scan-gallery-button'));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('Scan failed', 'Claude could not read this receipt')
    );
    expect(screen.queryByTestId('scan-result-card')).toBeNull();
    expect(screen.getByText('Align receipt within the frame')).toBeTruthy();
    expect(screen.getByTestId('scan-gallery-button').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: false })
    );

    // Recoverable: a second attempt succeeds.
    await scanFromGallery();
    expect(mockScanReceipt).toHaveBeenCalledTimes(2);
  });

  it('falls back to a generic message when the scan error has none', async () => {
    mockScanReceipt.mockRejectedValueOnce({});
    renderScan();

    fireEvent.press(screen.getByTestId('scan-gallery-button'));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('Scan failed', 'Could not analyze this receipt.')
    );
  });

  it('reports an image-processing failure without calling the API', async () => {
    mockImage.saveAsync.mockResolvedValueOnce({ base64: undefined });
    renderScan();

    fireEvent.press(screen.getByTestId('scan-gallery-button'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Scan failed', 'Failed to process image'));
    expect(mockScanReceipt).not.toHaveBeenCalled();
  });

  it('asks the user to sign in again when there is no access token', async () => {
    renderScan({ accessToken: null });

    fireEvent.press(screen.getByTestId('scan-gallery-button'));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('Not signed in', 'Please sign in again to scan a receipt.')
    );
    expect(manipulate).not.toHaveBeenCalled();
    expect(mockScanReceipt).not.toHaveBeenCalled();
  });

  describe('resizing before upload', () => {
    it('clamps the width of a large landscape image', async () => {
      picker.launchImageLibraryAsync.mockResolvedValue({
        canceled: false,
        assets: [{ ...ASSET, width: 4000, height: 3000 }],
      } as never);
      renderScan();
      await scanFromGallery();
      expect(mockContext.resize).toHaveBeenCalledWith({ width: 1568 });
    });

    it('clamps the height of a large portrait image', async () => {
      picker.launchImageLibraryAsync.mockResolvedValue({
        canceled: false,
        assets: [{ ...ASSET, width: 3000, height: 4000 }],
      } as never);
      renderScan();
      await scanFromGallery();
      expect(mockContext.resize).toHaveBeenCalledWith({ height: 1568 });
    });

    it('does not resize an image already within the limit', async () => {
      renderScan();
      await scanFromGallery();
      expect(mockContext.resize).not.toHaveBeenCalled();
    });
  });
});

describe('ScanScreen — result card actions', () => {
  it('Save with no edits closes the card without calling the API', async () => {
    renderScan();
    await scanFromGallery();

    fireEvent.press(screen.getByTestId('scan-save-button'));

    await waitFor(() => expect(screen.queryByTestId('scan-result-card')).toBeNull());
    expect(mockUpdateReceipt).not.toHaveBeenCalled();
    expect(mockDeleteReceipt).not.toHaveBeenCalled();
  });

  it('Save sends only the edited (trimmed) merchant', async () => {
    renderScan();
    await scanFromGallery();

    fireEvent.changeText(screen.getByTestId('scan-merchant-input'), '  Rami Levy  ');
    fireEvent.press(screen.getByTestId('scan-save-button'));

    await waitFor(() =>
      expect(mockUpdateReceipt).toHaveBeenCalledWith('r1', { merchant: 'Rami Levy' }, 'test-token')
    );
    await waitFor(() => expect(screen.queryByTestId('scan-result-card')).toBeNull());
  });

  it('Save sends only the edited total', async () => {
    renderScan();
    await scanFromGallery();

    fireEvent.changeText(screen.getByTestId('scan-total-input'), '42.5');
    fireEvent.press(screen.getByTestId('scan-save-button'));

    await waitFor(() => expect(mockUpdateReceipt).toHaveBeenCalledWith('r1', { total: 42.5 }, 'test-token'));
  });

  it('Save sends both fields when both changed', async () => {
    renderScan();
    await scanFromGallery();

    fireEvent.changeText(screen.getByTestId('scan-merchant-input'), 'Aroma');
    fireEvent.changeText(screen.getByTestId('scan-total-input'), '18');
    fireEvent.press(screen.getByTestId('scan-save-button'));

    await waitFor(() =>
      expect(mockUpdateReceipt).toHaveBeenCalledWith('r1', { merchant: 'Aroma', total: 18 }, 'test-token')
    );
  });

  it('Save rejects an empty merchant', async () => {
    renderScan();
    await scanFromGallery();

    fireEvent.changeText(screen.getByTestId('scan-merchant-input'), '   ');
    fireEvent.press(screen.getByTestId('scan-save-button'));

    expect(alertSpy).toHaveBeenCalledWith('Merchant required', 'Merchant name cannot be empty.');
    expect(mockUpdateReceipt).not.toHaveBeenCalled();
    expect(screen.getByTestId('scan-result-card')).toBeTruthy();
  });

  it.each(['', '0', '-5', 'abc'])('Save rejects an invalid total (%p)', async (total) => {
    renderScan();
    await scanFromGallery();

    fireEvent.changeText(screen.getByTestId('scan-total-input'), total);
    fireEvent.press(screen.getByTestId('scan-save-button'));

    expect(alertSpy).toHaveBeenCalledWith('Invalid total', 'Total must be a positive number.');
    expect(mockUpdateReceipt).not.toHaveBeenCalled();
  });

  it('locks the card while saving', async () => {
    const pending = deferred<ReturnType<typeof scanResponse>>();
    mockUpdateReceipt.mockReturnValue(pending.promise);
    renderScan();
    await scanFromGallery();

    fireEvent.changeText(screen.getByTestId('scan-total-input'), '55');
    fireEvent.press(screen.getByTestId('scan-save-button'));

    await waitFor(() => expect(screen.queryByText('Save Receipt')).toBeNull());
    expect(screen.getByTestId('scan-merchant-input').props.editable).toBe(false);
    expect(screen.getByTestId('scan-total-input').props.editable).toBe(false);
    expect(screen.getByTestId('scan-cancel-button').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true })
    );

    await act(async () => {
      pending.resolve(scanResponse());
    });
    await waitFor(() => expect(screen.queryByTestId('scan-result-card')).toBeNull());
  });

  it('keeps the card open and shows the error when saving fails', async () => {
    mockUpdateReceipt.mockRejectedValueOnce({ message: 'Server exploded' });
    renderScan();
    await scanFromGallery();

    fireEvent.changeText(screen.getByTestId('scan-total-input'), '55');
    fireEvent.press(screen.getByTestId('scan-save-button'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Failed to save changes', 'Server exploded'));
    expect(screen.getByTestId('scan-result-card')).toBeTruthy();
    expect(screen.getByText('Save Receipt')).toBeTruthy();
    expect(screen.getByTestId('scan-total-input').props.editable).toBe(true);
  });

  it('uses a generic message when saving fails without one', async () => {
    mockUpdateReceipt.mockRejectedValueOnce(new Error(''));
    renderScan();
    await scanFromGallery();

    fireEvent.changeText(screen.getByTestId('scan-total-input'), '55');
    fireEvent.press(screen.getByTestId('scan-save-button'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Failed to save changes', 'Please try again.'));
  });

  it('Save just closes the card if the session was lost meanwhile', async () => {
    const { rerenderWith } = renderScan();
    await scanFromGallery();

    rerenderWith({ accessToken: null });
    fireEvent.changeText(screen.getByTestId('scan-total-input'), '55');
    fireEvent.press(screen.getByTestId('scan-save-button'));

    await waitFor(() => expect(screen.queryByTestId('scan-result-card')).toBeNull());
    expect(mockUpdateReceipt).not.toHaveBeenCalled();
  });

  it('the close icon dismisses the card without calling the API', async () => {
    renderScan();
    await scanFromGallery();

    fireEvent.press(screen.getByTestId('scan-close-button'));

    await waitFor(() => expect(screen.queryByTestId('scan-result-card')).toBeNull());
    expect(mockUpdateReceipt).not.toHaveBeenCalled();
    expect(mockDeleteReceipt).not.toHaveBeenCalled();
  });
});

describe('ScanScreen — top-bar Cancel (discard)', () => {
  it('is enabled once a result is shown and deletes the scanned receipt', async () => {
    renderScan();
    await scanFromGallery();

    const cancel = screen.getByTestId('scan-cancel-button');
    expect(cancel.props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));

    fireEvent.press(cancel);

    await waitFor(() => expect(mockDeleteReceipt).toHaveBeenCalledWith('r1', 'test-token'));
    await waitFor(() => expect(screen.queryByTestId('scan-result-card')).toBeNull());
    expect(mockUpdateReceipt).not.toHaveBeenCalled();
  });

  it('locks the card while discarding', async () => {
    const pending = deferred<void>();
    mockDeleteReceipt.mockReturnValue(pending.promise);
    renderScan();
    await scanFromGallery();

    fireEvent.press(screen.getByTestId('scan-cancel-button'));

    await waitFor(() => expect(screen.queryByText('Cancel')).toBeNull());
    expect(screen.getByTestId('scan-merchant-input').props.editable).toBe(false);
    expect(screen.getByTestId('scan-save-button').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true })
    );

    await act(async () => {
      pending.resolve();
    });
    await waitFor(() => expect(screen.queryByTestId('scan-result-card')).toBeNull());
  });

  it('keeps the card and shows the error when discarding fails', async () => {
    mockDeleteReceipt.mockRejectedValueOnce({ message: 'Not found' });
    renderScan();
    await scanFromGallery();

    fireEvent.press(screen.getByTestId('scan-cancel-button'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Failed to discard', 'Not found'));
    expect(screen.getByTestId('scan-result-card')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();
  });

  it('uses a generic message when discarding fails without one', async () => {
    mockDeleteReceipt.mockRejectedValueOnce({});
    renderScan();
    await scanFromGallery();

    fireEvent.press(screen.getByTestId('scan-cancel-button'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Failed to discard', 'Please try again.'));
  });

  it('just closes the card if the session was lost meanwhile', async () => {
    const { rerenderWith } = renderScan();
    await scanFromGallery();

    rerenderWith({ accessToken: null });
    fireEvent.press(screen.getByTestId('scan-cancel-button'));

    await waitFor(() => expect(screen.queryByTestId('scan-result-card')).toBeNull());
    expect(mockDeleteReceipt).not.toHaveBeenCalled();
  });
});

describe('ScanScreen — total formatting (formatCurrency)', () => {
  it('pre-fills a large total with ₪, thousands separators and agorot', async () => {
    mockScanReceipt.mockResolvedValue(scanResponse({ total: 1234.5 }));
    renderScan();
    await scanFromGallery();

    expect(screen.getByTestId('scan-total-input').props.value).toBe('₪1,234.50');
    expect(screen.getByText('Total')).toBeTruthy();
  });

  it('saving the untouched formatted total sends no update and closes the card', async () => {
    mockScanReceipt.mockResolvedValue(scanResponse({ total: 1234.5 }));
    renderScan();
    await scanFromGallery();

    fireEvent.press(screen.getByTestId('scan-save-button'));

    await waitFor(() => expect(screen.queryByTestId('scan-result-card')).toBeNull());
    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockUpdateReceipt).not.toHaveBeenCalled();
  });

  it('accepts an edited total that keeps the ₪ and separators', async () => {
    mockScanReceipt.mockResolvedValue(scanResponse({ total: 1234.5 }));
    renderScan();
    await scanFromGallery();

    fireEvent.changeText(screen.getByTestId('scan-total-input'), '₪1,300.00');
    fireEvent.press(screen.getByTestId('scan-save-button'));

    await waitFor(() => expect(mockUpdateReceipt).toHaveBeenCalledWith('r1', { total: 1300 }, 'test-token'));
    await waitFor(() => expect(screen.queryByTestId('scan-result-card')).toBeNull());
  });

  it('rejects an ambiguous comma total ("1,5") instead of guessing', async () => {
    renderScan();
    await scanFromGallery();

    fireEvent.changeText(screen.getByTestId('scan-total-input'), '1,5');
    fireEvent.press(screen.getByTestId('scan-save-button'));

    expect(alertSpy).toHaveBeenCalledWith('Invalid total', 'Total must be a positive number.');
    expect(mockUpdateReceipt).not.toHaveBeenCalled();
  });
});
