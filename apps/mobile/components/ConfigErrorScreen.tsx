import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../lib/theme';

/**
 * Shown instead of the app when the build is misconfigured (e.g. a store or
 * preview build without EXPO_PUBLIC_API_BASE_URL). Nothing in it can fix the
 * problem at runtime: the value is baked in at build time, so it says what is
 * wrong and that the app needs a corrected build.
 */
const ConfigErrorScreen: React.FC<{ message: string }> = ({ message }) => (
  <View style={styles.container} testID="config-error-screen">
    <View style={styles.card}>
      <Text style={styles.title} accessibilityRole="header">
        SmartBudget can't start
      </Text>
      <Text style={styles.body}>
        This build of the app is misconfigured and can't reach its server. Please install an updated version.
      </Text>
      <Text style={styles.detail} testID="config-error-message" selectable>
        {message}
      </Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    padding: SPACING.screenPadding,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  body: {
    fontSize: 15,
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  detail: {
    fontSize: 13,
    color: COLORS.danger,
  },
});

export default ConfigErrorScreen;
