import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY, SPACING } from '../lib/theme';

interface Props {
  title: string;
  onBack: () => void;
  /** Text next to the back chevron — the screen you return to. */
  backLabel?: string;
  /** Prefix for testIDs, e.g. "settings" -> "settings-header", "settings-back-button". */
  testIDPrefix: string;
}

/**
 * V2 in-screen header for pushed (non-tab) screens: full-bleed white bar with
 * a back button and a 20px bold title. The navigator's own header is hidden
 * everywhere, so pushed screens draw this instead (same look as the tab
 * screens' headers).
 */
export default function ScreenHeader({ title, onBack, backLabel = 'Back', testIDPrefix }: Props) {
  return (
    <View style={styles.header} testID={`${testIDPrefix}-header`}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel={`Back to ${backLabel}`}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        testID={`${testIDPrefix}-back-button`}
      >
        <MaterialCommunityIcons name="chevron-left" size={24} color={COLORS.textPrimary} />
        <Text style={styles.backText}>{backLabel}</Text>
      </TouchableOpacity>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: SPACING.screenPadding,
    paddingTop: 8,
    paddingBottom: 16,
    backgroundColor: COLORS.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginLeft: -6,
    marginBottom: 6,
  },
  backText: {
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    fontWeight: '400',
    color: COLORS.textPrimary,
  },
  title: {
    fontFamily: FONT_FAMILY,
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
});
