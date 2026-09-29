import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { categoryMeta } from '../lib/categories';
import { textDirectionStyle } from '../lib/rtl';
import { COLORS, FONT_FAMILY, RADIUS, SPACING } from '../lib/theme';

export interface CategoryPickerProps {
  visible: boolean;
  /** The choices, in display order. Passed in (not hardcoded) so custom categories can be added later. */
  categories: readonly string[];
  /** The current category (gets the check mark), or null for none. */
  selected: string | null;
  /** Called with the chosen category; the picker then closes itself via onClose. */
  onSelect: (category: string) => void;
  onClose: () => void;
  /** Shown under the sheet title, e.g. the line item's name. */
  subtitle?: string;
}

/** V2 bottom sheet listing categories (icon + name), current one checked. */
export default function CategoryPicker({
  visible,
  categories,
  selected,
  onSelect,
  onClose,
  subtitle,
}: CategoryPickerProps): React.ReactElement {
  const choose = (category: string) => {
    onSelect(category);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay} testID="category-picker">
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss category picker"
          testID="category-picker-backdrop"
        />
        <View style={styles.sheet} testID="category-picker-sheet">
          <View style={styles.dragPill} />
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title} accessibilityRole="header">
                Choose category
              </Text>
              {subtitle ? (
                <Text
                  style={[styles.subtitle, textDirectionStyle(subtitle)]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  testID="category-picker-subtitle"
                >
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close category picker"
              testID="category-picker-close"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialCommunityIcons name="close" size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.list} bounces={false}>
            {categories.map((category, i) => {
              const meta = categoryMeta(category);
              const isSelected = category === selected;
              return (
                <TouchableOpacity
                  key={category}
                  style={[styles.option, i === categories.length - 1 && styles.optionLast]}
                  onPress={() => choose(category)}
                  accessibilityRole="button"
                  accessibilityLabel={category}
                  accessibilityState={{ selected: isSelected }}
                  testID={`category-option-${category}`}
                >
                  <View style={[styles.optionIcon, { backgroundColor: meta.backgroundColor }]}>
                    <MaterialCommunityIcons name={meta.icon as any} size={18} color={meta.color} />
                  </View>
                  <Text style={[styles.optionName, isSelected && styles.optionNameSelected]}>{category}</Text>
                  {isSelected ? (
                    <View testID={`category-option-check-${category}`}>
                      <MaterialCommunityIcons name="check" size={20} color={COLORS.textPrimary} />
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: COLORS.overlay,
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: SPACING.screenPadding,
    paddingTop: 8,
    paddingBottom: 28,
    maxHeight: '75%',
  },
  dragPill: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    marginRight: 12,
  },
  title: {
    fontFamily: FONT_FAMILY,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  list: {
    flexGrow: 0,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  optionLast: {
    borderBottomWidth: 0,
  },
  optionIcon: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.categoryIcon,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionName: {
    flex: 1,
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    fontWeight: '400',
    color: COLORS.textPrimary,
  },
  optionNameSelected: {
    fontWeight: '600',
  },
});
