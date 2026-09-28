import React from 'react';
import {
  Alert,
  Linking,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ScreenHeader from '../components/ScreenHeader';
import { FAQ_ITEMS, HELP_TITLE } from '../lib/content/helpFaq';
import { getSupportEmail, supportMailtoUrl } from '../lib/support';
import type { SignedInStackParamList } from '../lib/navigation';
import { COLORS, FONT_FAMILY, RADIUS, SPACING } from '../lib/theme';

export const SUPPORT_NOT_CONFIGURED = 'Support email not configured';

interface Props {
  /**
   * Support address; defaults to EXPO_PUBLIC_SUPPORT_EMAIL. Injectable so
   * tests can cover the configured and unconfigured states.
   */
  supportEmail?: string | null;
}

export default function HelpSupportScreen({ supportEmail = getSupportEmail() }: Props): React.ReactElement {
  const navigation = useNavigation<NativeStackNavigationProp<SignedInStackParamList>>();
  const canContact = Boolean(supportEmail);

  const contactSupport = async () => {
    if (!supportEmail) return;
    try {
      await Linking.openURL(supportMailtoUrl(supportEmail));
    } catch {
      // e.g. no mail app configured (always the case on the iOS Simulator).
      Alert.alert('Could not open your mail app', `Email us at ${supportEmail}.`);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} testID="help-screen">
      <ScreenHeader
        title={HELP_TITLE}
        backLabel="Profile"
        onBack={() => navigation.goBack()}
        testIDPrefix="help"
      />

      <ScrollView style={styles.body} contentContainerStyle={styles.content}>
        <Text style={styles.sectionLabel}>Frequently asked questions</Text>
        <View style={styles.card}>
          {FAQ_ITEMS.map((item, index) => (
            <View
              key={item.id}
              style={[styles.faqItem, index > 0 && styles.faqDivider]}
              testID={`help-faq-${item.id}`}
            >
              <Text style={styles.question} accessibilityRole="header">
                {item.question}
              </Text>
              <Text style={styles.answer}>{item.answer}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Still need help?</Text>
        <TouchableOpacity
          style={[styles.contactButton, !canContact && styles.contactButtonDisabled]}
          onPress={contactSupport}
          disabled={!canContact}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canContact }}
          testID="help-contact-button"
        >
          <MaterialCommunityIcons
            name="email-outline"
            size={18}
            color={canContact ? COLORS.buttonText : COLORS.textSecondary}
          />
          <Text style={[styles.contactText, !canContact && styles.contactTextDisabled]}>
            {canContact ? 'Contact support' : SUPPORT_NOT_CONFIGURED}
          </Text>
        </TouchableOpacity>
        {supportEmail ? (
          <Text style={styles.contactCaption} testID="help-support-email">
            {supportEmail}
          </Text>
        ) : null}
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
  sectionLabel: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginTop: 8,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    paddingHorizontal: 14,
    marginBottom: SPACING.sectionMargin,
  },
  faqItem: {
    paddingVertical: 14,
  },
  faqDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  question: {
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 6,
  },
  answer: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
    color: COLORS.textPrimary,
  },
  contactButton: {
    height: 50,
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.button,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  contactButtonDisabled: {
    backgroundColor: COLORS.border,
  },
  contactText: {
    fontFamily: FONT_FAMILY,
    color: COLORS.buttonText,
    fontSize: 15,
    fontWeight: '600',
  },
  contactTextDisabled: {
    color: COLORS.textSecondary,
  },
  contactCaption: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
});
