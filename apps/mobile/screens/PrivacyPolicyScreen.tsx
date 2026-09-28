import React from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ScreenHeader from '../components/ScreenHeader';
import {
  PRIVACY_POLICY_LAST_UPDATED,
  PRIVACY_POLICY_SECTIONS,
  PRIVACY_POLICY_STATUS,
  PRIVACY_POLICY_TITLE,
} from '../lib/content/privacyPolicy';
import type { SignedInStackParamList } from '../lib/navigation';
import { COLORS, FONT_FAMILY, RADIUS, SPACING } from '../lib/theme';

export default function PrivacyPolicyScreen(): React.ReactElement {
  const navigation = useNavigation<NativeStackNavigationProp<SignedInStackParamList>>();

  return (
    <SafeAreaView style={styles.safeArea} testID="privacy-screen">
      <ScreenHeader
        title={PRIVACY_POLICY_TITLE}
        backLabel="Profile"
        onBack={() => navigation.goBack()}
        testIDPrefix="privacy"
      />

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.content}
        testID="privacy-scroll"
      >
        <View style={styles.draftBadge} testID="privacy-draft-label">
          <Text style={styles.draftText}>{PRIVACY_POLICY_STATUS}</Text>
        </View>
        <Text style={styles.updated} testID="privacy-last-updated">
          Last updated: {PRIVACY_POLICY_LAST_UPDATED}
        </Text>

        <View style={styles.card}>
          {PRIVACY_POLICY_SECTIONS.map((section, index) => (
            <View
              key={section.heading}
              style={[styles.section, index > 0 && styles.sectionDivider]}
              testID={`privacy-section-${index}`}
            >
              <Text style={styles.heading} accessibilityRole="header">
                {section.heading}
              </Text>
              {section.paragraphs.map((paragraph) => (
                <Text key={paragraph} style={styles.paragraph}>
                  {paragraph}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  body: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingHorizontal: SPACING.screenPadding,
    paddingTop: SPACING.sectionMargin,
    paddingBottom: 32,
  },
  draftBadge: {
    backgroundColor: COLORS.alertBg,
    borderColor: COLORS.alertBorder,
    borderWidth: 1,
    borderRadius: RADIUS.input,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  draftText: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.alertTextColor,
    textAlign: 'center',
  },
  updated: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.textSecondary,
    marginBottom: SPACING.sectionMargin,
    marginLeft: 4,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    paddingHorizontal: 14,
  },
  section: {
    paddingVertical: 14,
  },
  sectionDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  heading: {
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 6,
  },
  paragraph: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
    color: COLORS.textPrimary,
    marginTop: 4,
  },
});
