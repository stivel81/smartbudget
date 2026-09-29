import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { calculatePasswordStrength, passwordStrengthTone } from '../lib/validation';
import { COLORS, FONT_FAMILY, PASSWORD_STRENGTH_COLORS } from '../lib/theme';

interface Props {
  password: string;
  /** Prefix for testIDs, e.g. "signup" -> "signup-strength-bar-1". */
  testIDPrefix: string;
}

/**
 * 4-bar password strength indicator (DESIGN_REFERENCE_V2.md, Screen 2).
 * Shared by Signup and ForgotPassword so the rules and UI stay identical.
 */
export default function PasswordStrengthMeter({ password, testIDPrefix }: Props) {
  const { strength, label } = calculatePasswordStrength(password);
  // Weak = red, Fair = amber, Good/Strong = green — bars and label alike.
  const levelColor = PASSWORD_STRENGTH_COLORS[passwordStrengthTone(label)];

  return (
    <View style={styles.strengthContainer}>
      <View style={styles.barsContainer}>
        {[1, 2, 3, 4].map((bar) => (
          <View
            key={bar}
            testID={`${testIDPrefix}-strength-bar-${bar}`}
            style={[
              styles.strengthBar,
              bar <= strength ? { backgroundColor: levelColor } : styles.strengthBarEmpty,
            ]}
          />
        ))}
      </View>
      {label ? (
        <Text style={[styles.strengthLabel, { color: levelColor }]} testID={`${testIDPrefix}-strength-label`}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  strengthContainer: {
    marginBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  barsContainer: {
    flexDirection: 'row',
    gap: 6,
    flex: 1,
  },
  strengthBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  strengthBarEmpty: {
    backgroundColor: COLORS.border,
  },
  strengthLabel: {
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '600',
    minWidth: 40,
  },
});
