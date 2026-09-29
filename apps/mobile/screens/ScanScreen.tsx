import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  Animated,
  Easing,
  ActivityIndicator,
  Alert,
  TextInput,
  LayoutChangeEvent,
  ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { setStatusBarStyle } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { scanReceipt, updateReceipt, deleteReceipt } from '../lib/api';
import { AuthContext } from '../lib/auth';
import { textDirectionStyle } from '../lib/rtl';
import { COLORS, FONT_FAMILY, RADIUS, SPACING } from '../lib/theme';
import {
  JPEG_QUALITY,
  PICKER_QUALITY,
  ScanResult,
  categoryRowIcon,
  categoryRowLabel,
  commonCategory,
  resizeTargetFor,
  resolveReceiptEdits,
  toScanResult,
  withCategories,
} from '../lib/scan';
import { RECEIPT_CATEGORIES } from '../lib/categories';
import { errorMessage } from '../lib/errors';
import { formatCurrency } from '../lib/currency';
import CategoryPicker from '../components/CategoryPicker';
import ReceiptItemsList from '../components/ReceiptItemsList';
const SCAN_LINE_HEIGHT = 2;
const SCAN_LINE_DURATION_MS = 2000;
const CORNER_SIZE = 22;
const CORNER_WIDTH = 2;
// Far enough below the screen edge to hide the result card before it slides up.
const CARD_HIDDEN_OFFSET = 500;
const ALL_ITEMS = 'all';

async function resizeForUpload(asset: ImagePicker.ImagePickerAsset): Promise<string> {
  const context = ImageManipulator.manipulate(asset.uri);
  const target = resizeTargetFor(asset.width, asset.height);
  if (target) {
    context.resize(target);
  }

  const image = await context.renderAsync();
  const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY, base64: true });
  context.release();
  image.release();

  if (!result.base64) {
    throw new Error('Failed to process image');
  }
  return result.base64;
}

/**
 * Drives the decorative scan line: a 0→1 progress value looping top-to-bottom
 * for as long as the screen is mounted. The loop is stopped on unmount so no
 * animation frames/timers outlive the component.
 */
function useScanLineProgress(): Animated.Value {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: SCAN_LINE_DURATION_MS,
        easing: Easing.linear,
        useNativeDriver: false,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [progress]);

  return progress;
}

type Corner = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';
const CORNERS: Corner[] = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];

const CornerGuide: React.FC<{ corner: Corner }> = ({ corner }) => (
  <View style={[styles.cornerGuide, styles[corner]]} testID={`scan-corner-${corner}`} />
);

interface ResultRowProps {
  label: string;
  children: React.ReactNode;
  last?: boolean;
}

const ResultRow: React.FC<ResultRowProps> = ({ label, children, last }) => (
  <View style={[styles.resultRow, last && styles.resultRowLast]}>
    <Text style={styles.resultLabel}>{label}</Text>
    <View style={styles.resultValueContainer}>{children}</View>
  </View>
);

export default function ScanScreen(): React.ReactElement {
  const [showResult, setShowResult] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [editedMerchant, setEditedMerchant] = useState('');
  const [editedTotal, setEditedTotal] = useState('');
  // One category per line item (same order as result.items); starts as Claude's choice.
  const [editedCategories, setEditedCategories] = useState<string[]>([]);
  // Which category picker is open: one line's (its index), the Category
  // row's (ALL_ITEMS: applies to every line), or none.
  const [pickerIndex, setPickerIndex] = useState<number | typeof ALL_ITEMS | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [frameHeight, setFrameHeight] = useState(0);
  const auth = useContext(AuthContext);
  const slideAnim = useRef(new Animated.Value(CARD_HIDDEN_OFFSET)).current;
  const scanLineProgress = useScanLineProgress();

  // Dark screen: light status-bar content while focused, back to the app
  // default when the user leaves the tab.
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle('auto');
    }, [])
  );

  const showResultCard = (scanned: ScanResult) => {
    setResult(scanned);
    setEditedMerchant(scanned.merchant);
    setEditedTotal(formatCurrency(scanned.total, { decimals: 2 }));
    setEditedCategories(scanned.items.map((item) => item.category));
    setPickerIndex(null);
    setShowResult(true);

    // Animate result card sliding up
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  };

  const processImage = async (asset: ImagePicker.ImagePickerAsset) => {
    if (!auth.accessToken) {
      Alert.alert('Not signed in', 'Please sign in again to scan a receipt.');
      return;
    }

    setLoading(true);
    try {
      const base64 = await resizeForUpload(asset);
      const { receipt } = await scanReceipt(base64, 'image/jpeg');
      showResultCard(toScanResult(receipt));
    } catch (err: unknown) {
      Alert.alert('Scan failed', errorMessage(err, 'Could not analyze this receipt.'));
    } finally {
      setLoading(false);
    }
  };

  const handleCapture = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera permission required', 'Enable camera access to scan a receipt.');
      return;
    }

    const picked = await ImagePicker.launchCameraAsync({
      quality: PICKER_QUALITY,
    });

    if (!picked.canceled && picked.assets[0]) {
      await processImage(picked.assets[0]);
    }
  };

  const handlePickFromGallery = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo library permission required', 'Enable photo access to select a receipt.');
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: PICKER_QUALITY,
    });

    if (!picked.canceled && picked.assets[0]) {
      await processImage(picked.assets[0]);
    }
  };

  const handleDismiss = () => {
    Animated.timing(slideAnim, {
      toValue: CARD_HIDDEN_OFFSET,
      duration: 300,
      useNativeDriver: false,
    }).start(() => {
      setShowResult(false);
      setResult(null);
    });
  };

  // Discard: the scan already persisted the receipt, so cancelling deletes it.
  const handleCancel = async () => {
    if (!result || !auth.accessToken) {
      handleDismiss();
      return;
    }

    setDiscarding(true);
    try {
      await deleteReceipt(result.id);
      handleDismiss();
    } catch (err: unknown) {
      Alert.alert('Failed to discard', errorMessage(err, 'Please try again.'));
    } finally {
      setDiscarding(false);
    }
  };

  // Save: the receipt is already stored; only PATCH fields the user edited.
  const handleConfirm = async () => {
    if (!result || !auth.accessToken) {
      handleDismiss();
      return;
    }

    const outcome = resolveReceiptEdits(result, editedMerchant, editedTotal, editedCategories);
    if (outcome.kind === 'invalid') {
      Alert.alert(outcome.title, outcome.message);
      return;
    }
    if (outcome.kind === 'unchanged') {
      handleDismiss();
      return;
    }

    setConfirming(true);
    try {
      await updateReceipt(result.id, outcome.updates);
      handleDismiss();
    } catch (err: unknown) {
      Alert.alert('Failed to save changes', errorMessage(err, 'Please try again.'));
    } finally {
      setConfirming(false);
    }
  };

  const chooseCategory = (index: number, category: string) => {
    setEditedCategories((prev) => prev.map((current, i) => (i === index ? category : current)));
  };

  // The Category row's picker: one choice for every line. Saved like
  // per-line changes (Save sends each line whose category differs).
  const chooseCategoryForAll = (category: string) => {
    setEditedCategories((prev) => prev.map(() => category));
  };

  const busy = confirming || discarding;
  const displayedItems = result ? withCategories(result.items, editedCategories) : [];
  const categoryLabel = categoryRowLabel(displayedItems);
  const canPickForAll = displayedItems.length > 0 && !busy;
  const canCancel = showResult && result !== null && !busy;
  const scanLineTravel = Math.max(frameHeight - SCAN_LINE_HEIGHT, 0);

  const onFrameLayout = (event: LayoutChangeEvent) => {
    setFrameHeight(event.nativeEvent.layout.height);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <View style={styles.topBarSide} />
        <Text style={styles.topBarTitle} accessibilityRole="header">
          Scan Receipt
        </Text>
        <View style={[styles.topBarSide, styles.topBarSideRight]}>
          <TouchableOpacity
            onPress={handleCancel}
            disabled={!canCancel}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canCancel }}
            testID="scan-cancel-button"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {discarding ? (
              <ActivityIndicator size="small" color={COLORS.scannerCancel} />
            ) : (
              <Text style={[styles.cancelText, !canCancel && styles.cancelTextDisabled]}>Cancel</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Viewfinder */}
      <View style={styles.viewfinder}>
        <View style={styles.frame} onLayout={onFrameLayout} testID="scan-frame">
          {CORNERS.map((corner) => (
            <CornerGuide key={corner} corner={corner} />
          ))}

          <Animated.View
            testID="scan-line"
            style={[
              styles.scanLine,
              {
                transform: [
                  {
                    translateY: scanLineProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, scanLineTravel],
                    }),
                  },
                ],
              },
            ]}
          />
        </View>

        <Text style={styles.hintText} testID="scan-hint">
          {loading ? 'Analyzing receipt…' : 'Align receipt within the frame'}
        </Text>
      </View>

      {/* Camera controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.controlButton}
          onPress={handlePickFromGallery}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Choose from gallery"
          testID="scan-gallery-button"
        >
          <MaterialCommunityIcons name="image-outline" size={20} color={COLORS.buttonText} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.captureButton}
          onPress={handleCapture}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Take photo"
          testID="scan-capture-button"
        >
          {loading ? (
            <ActivityIndicator color={COLORS.textPrimary} testID="scan-loading" />
          ) : (
            <MaterialCommunityIcons name="camera" size={26} color={COLORS.textPrimary} />
          )}
        </TouchableOpacity>

        {/* The system camera launched by expo-image-picker has its own flash
            control; there is no picker option to drive it from here, so this
            slot stays empty (keeps the capture button centred). */}
        <View style={styles.controlSpacer} />
      </View>

      {/* AI result card */}
      {showResult && result && (
        <Animated.View
          testID="scan-result-card"
          style={[styles.resultCard, { transform: [{ translateY: slideAnim }] }]}
        >
          <View style={styles.dragPill} />

          <View style={styles.resultHeader}>
            <MaterialCommunityIcons name="creation" size={18} color={COLORS.textPrimary} />
            <Text style={styles.resultTitle}>AI Extracted</Text>
            <TouchableOpacity
              onPress={handleDismiss}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Close"
              testID="scan-close-button"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialCommunityIcons name="close" size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.resultRows}>
            <ResultRow label="Merchant">
              <TextInput
                testID="scan-merchant-input"
                style={[styles.resultInput, textDirectionStyle(editedMerchant)]}
                value={editedMerchant}
                onChangeText={setEditedMerchant}
                editable={!busy}
                placeholderTextColor={COLORS.placeholder}
              />
            </ResultRow>

            <ResultRow label="Category">
              <TouchableOpacity
                style={styles.categoryValue}
                onPress={() => setPickerIndex(ALL_ITEMS)}
                disabled={!canPickForAll}
                accessibilityRole="button"
                accessibilityLabel={`Category: ${categoryLabel}. Change category for all items`}
                accessibilityState={{ disabled: !canPickForAll }}
                testID="scan-category-row"
              >
                <View style={styles.categoryIcon}>
                  <MaterialCommunityIcons
                    name={categoryRowIcon(displayedItems) as keyof typeof MaterialCommunityIcons.glyphMap}
                    size={16}
                    color={COLORS.textPrimary}
                  />
                </View>
                <Text style={styles.resultValue} numberOfLines={1} testID="scan-category-summary">
                  {categoryLabel}
                </Text>
                {displayedItems.length > 0 ? (
                  <MaterialCommunityIcons name="chevron-down" size={16} color={COLORS.textSecondary} />
                ) : null}
              </TouchableOpacity>
            </ResultRow>

            <ResultRow label="Date">
              <Text style={styles.resultValue} testID="scan-date">{result.date}</Text>
            </ResultRow>

            <ResultRow label="Total" last>
              <TextInput
                testID="scan-total-input"
                style={[styles.resultInput, styles.totalInput]}
                value={editedTotal}
                onChangeText={setEditedTotal}
                keyboardType="numeric"
                editable={!busy}
              />
            </ResultRow>
          </View>

          {displayedItems.length > 0 && (
            <View style={styles.itemsSection}>
              <Text style={styles.itemsLabel}>Items</Text>
              <ScrollView style={styles.itemsScroll} nestedScrollEnabled testID="scan-items-scroll">
                <ReceiptItemsList
                  items={displayedItems}
                  onPressCategory={setPickerIndex}
                  disabled={busy}
                  testIDPrefix="scan-item"
                />
              </ScrollView>
            </View>
          )}

          <TouchableOpacity
            style={[styles.saveButton, busy && styles.saveButtonDisabled]}
            onPress={handleConfirm}
            disabled={busy}
            accessibilityRole="button"
            testID="scan-save-button"
          >
            {confirming ? (
              <ActivityIndicator color={COLORS.buttonText} />
            ) : (
              <Text style={styles.saveButtonText}>Save Receipt</Text>
            )}
          </TouchableOpacity>
        </Animated.View>
      )}

      {result && pickerIndex === ALL_ITEMS && result.items.length > 0 ? (
        <CategoryPicker
          visible
          categories={RECEIPT_CATEGORIES}
          selected={commonCategory(displayedItems)}
          subtitle={result.items.length === 1 ? 'Applies to the item' : `Applies to all ${result.items.length} items`}
          onSelect={chooseCategoryForAll}
          onClose={() => setPickerIndex(null)}
        />
      ) : null}

      {result && typeof pickerIndex === 'number' && result.items[pickerIndex] ? (
        <CategoryPicker
          visible
          categories={RECEIPT_CATEGORIES}
          selected={editedCategories[pickerIndex] ?? null}
          subtitle={result.items[pickerIndex].name}
          onSelect={(category) => chooseCategory(pickerIndex, category)}
          onClose={() => setPickerIndex(null)}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.scannerBg,
  },
  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.screenPadding,
    paddingVertical: 12,
    backgroundColor: COLORS.scannerBg,
  },
  topBarSide: {
    width: 64,
  },
  topBarSideRight: {
    alignItems: 'flex-end',
  },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: FONT_FAMILY,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.buttonText,
  },
  cancelText: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '400',
    color: COLORS.scannerCancel,
  },
  cancelTextDisabled: {
    opacity: 0.5,
  },
  // Viewfinder
  viewfinder: {
    flex: 1,
    backgroundColor: COLORS.scannerBg,
    paddingHorizontal: 32,
    paddingTop: 24,
    paddingBottom: 20,
  },
  frame: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  cornerGuide: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: COLORS.scannerCorner,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
  },
  scanLine: {
    position: 'absolute',
    top: 0,
    left: 8,
    right: 8,
    height: SCAN_LINE_HEIGHT,
    borderRadius: 1,
    backgroundColor: COLORS.scannerScanLine,
  },
  hintText: {
    marginTop: 16,
    textAlign: 'center',
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.scannerHint,
  },
  // Controls
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 20,
    paddingBottom: 28,
    backgroundColor: COLORS.darkBg,
  },
  controlButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.scannerControlBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlSpacer: {
    width: 42,
    height: 42,
  },
  captureButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Result card
  resultCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: SPACING.screenPadding,
    paddingTop: 8,
    paddingBottom: 24,
  },
  dragPill: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginBottom: 14,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  resultTitle: {
    flex: 1,
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  resultRows: {
    marginBottom: SPACING.sectionMargin + 4,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  resultRowLast: {
    borderBottomWidth: 0,
  },
  resultLabel: {
    width: 92,
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  resultValueContainer: {
    flex: 1,
    alignItems: 'flex-end',
  },
  resultValue: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    textAlign: 'right',
    flexShrink: 1,
  },
  resultInput: {
    // textAlign/writingDirection for the merchant are applied dynamically via
    // textDirectionStyle() based on the name's actual script (Hebrew vs. Latin).
    alignSelf: 'stretch',
    height: 34,
    paddingHorizontal: 10,
    paddingVertical: 0,
    borderRadius: RADIUS.input,
    backgroundColor: COLORS.background,
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  totalInput: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'right',
  },
  categoryValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '100%',
  },
  categoryIcon: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.categoryIcon,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemsSection: {
    marginBottom: SPACING.sectionMargin + 4,
  },
  itemsLabel: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  // Long receipts scroll inside the card instead of pushing Save off-screen.
  itemsScroll: {
    maxHeight: 176,
  },
  saveButton: {
    height: 50,
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.button,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.buttonText,
  },
});
