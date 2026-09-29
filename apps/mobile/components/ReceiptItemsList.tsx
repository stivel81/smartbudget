import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ReceiptExtraction } from '../lib/api';
import { useCategories } from '../lib/categoriesContext';
import { formatCurrency } from '../lib/currency';
import { textDirectionStyle } from '../lib/rtl';
import { COLORS, FONT_FAMILY } from '../lib/theme';

export interface ReceiptItemsListProps {
  items: ReceiptExtraction['items'];
  /** Tapping a line's category chip. Omit to render read-only chips. */
  onPressCategory?: (index: number) => void;
  disabled?: boolean;
  /** Index of a line whose category change is in flight (its chip shows "Saving…"). */
  savingIndex?: number | null;
  /** testID prefix for rows/chips (defaults to "receipt-line"). */
  testIDPrefix?: string;
}

/**
 * One row per line item: name (ellipsized, RTL-aware), amount, and a
 * category chip that opens the category picker.
 */
export default function ReceiptItemsList({
  items,
  onPressCategory,
  disabled = false,
  savingIndex = null,
  testIDPrefix = 'receipt-line',
}: ReceiptItemsListProps): React.ReactElement {
  const { metaFor } = useCategories();
  return (
    <View testID={`${testIDPrefix}s`}>
      {items.map((item, index) => {
        const meta = metaFor(item.category);
        const saving = savingIndex === index;
        const chipDisabled = disabled || !onPressCategory || savingIndex !== null;
        return (
          <View
            key={index}
            style={[styles.row, index === items.length - 1 && styles.rowLast]}
            testID={`${testIDPrefix}-${index}`}
          >
            <Text
              style={[styles.name, textDirectionStyle(item.name)]}
              numberOfLines={1}
              ellipsizeMode="tail"
              testID={`${testIDPrefix}-name-${index}`}
            >
              {item.name}
            </Text>
            <Text style={styles.amount} testID={`${testIDPrefix}-amount-${index}`}>
              {formatCurrency(item.amount, { decimals: 2 })}
            </Text>
            <TouchableOpacity
              style={[styles.chip, { backgroundColor: meta.backgroundColor }]}
              onPress={() => onPressCategory?.(index)}
              disabled={chipDisabled}
              accessibilityRole="button"
              accessibilityLabel={`Category for ${item.name}: ${item.category}. Change category`}
              accessibilityState={{ disabled: chipDisabled, busy: saving }}
              testID={`${testIDPrefix}-category-${index}`}
            >
              <MaterialCommunityIcons name={meta.icon as any} size={14} color={meta.color} />
              <Text style={[styles.chipText, { color: meta.color }]} numberOfLines={1}>
                {saving ? 'Saving…' : item.category}
              </Text>
              {onPressCategory ? (
                <MaterialCommunityIcons name="chevron-down" size={14} color={meta.color} />
              ) : null}
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  // Takes the leftover width and ellipsizes; minWidth 0 lets it shrink
  // below its text width so it can never push into the amount.
  name: {
    flex: 1,
    minWidth: 0,
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  amount: {
    flexShrink: 0,
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  chip: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 140,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  chipText: {
    flexShrink: 1,
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '600',
  },
});
