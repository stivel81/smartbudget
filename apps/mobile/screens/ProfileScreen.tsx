import React, { useContext, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthContext } from '../lib/auth';
import { COLORS, FONT_FAMILY, RADIUS, SPACING } from '../lib/theme';
import { initialsFromEmail } from '../lib/profile';
import { errorMessage } from '../lib/errors';
import type { SignedInStackParamList } from '../lib/navigation';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

type MenuRoute = Exclude<keyof SignedInStackParamList, 'Main'>;

// Each row pushes a screen on the signed-in root stack (App.tsx).
// No Notifications row: push notifications arrive in a later phase.
export const MENU_ITEMS: { label: string; icon: IconName; route: MenuRoute; testID: string }[] = [
  { label: 'Settings', icon: 'cog-outline', route: 'Settings', testID: 'profile-menu-settings' },
  { label: 'Privacy Policy', icon: 'file-document-outline', route: 'PrivacyPolicy', testID: 'profile-menu-privacy' },
  { label: 'Help & Support', icon: 'help-circle-outline', route: 'HelpSupport', testID: 'profile-menu-help' },
];

export default function ProfileScreen(): React.ReactElement {
  const auth = useContext(AuthContext);
  const navigation = useNavigation<NativeStackNavigationProp<SignedInStackParamList>>();
  const [signingOut, setSigningOut] = useState(false);

  const email = auth.userEmail || '';
  const initials = initialsFromEmail(email);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await auth.logout();
      // App.tsx swaps to the auth stack automatically once
      // isAuthenticated flips to false — no navigation call needed.
    } catch (err: unknown) {
      Alert.alert('Failed to sign out', errorMessage(err, 'Please try again.'));
    } finally {
      setSigningOut(false);
    }
  };

  return (
    // White safe area so the status-bar strip matches the white header.
    <SafeAreaView style={styles.safeArea} testID="profile-screen">
      {/* Header — full-bleed white bar, same as Dashboard/Budget */}
      <View style={styles.header} testID="profile-header">
        <Text style={styles.caption}>Account</Text>
        <Text style={styles.title} accessibilityRole="header">
          Profile
        </Text>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        testID="profile-scroll"
      >

        {/* User card */}
        <View style={styles.card}>
          <View style={styles.userRow}>
            <View style={styles.avatar} testID="profile-avatar">
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userEmail} numberOfLines={1} testID="profile-email">
                {email}
              </Text>
              <Text style={styles.userSubtitle}>Signed in</Text>
            </View>
          </View>
        </View>

        {/* Menu */}
        <Text style={styles.sectionLabel}>General</Text>
        <View style={styles.card}>
          {MENU_ITEMS.map((item, index) => (
            <TouchableOpacity
              key={item.label}
              style={[styles.menuItem, index < MENU_ITEMS.length - 1 && styles.menuItemDivider]}
              onPress={() => navigation.navigate(item.route)}
              accessibilityRole="button"
              testID={item.testID}
            >
              <View style={styles.menuIcon}>
                <MaterialCommunityIcons name={item.icon} size={17} color={COLORS.textPrimary} />
              </View>
              <Text style={styles.menuItemText}>{item.label}</Text>
              <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.placeholder} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Sign out */}
        <TouchableOpacity
          style={[styles.signOutButton, signingOut && styles.signOutButtonDisabled]}
          onPress={handleSignOut}
          disabled={signingOut}
          accessibilityRole="button"
          testID="profile-sign-out-button"
        >
          {signingOut ? (
            <ActivityIndicator color={COLORS.danger} testID="profile-signing-out" />
          ) : (
            <Text style={styles.signOutButtonText}>Sign Out</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingHorizontal: SPACING.screenPadding,
    paddingTop: SPACING.sectionMargin,
    paddingBottom: 24,
  },
  header: {
    paddingHorizontal: SPACING.screenPadding,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: COLORS.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  caption: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.textSecondary,
  },
  title: {
    fontFamily: FONT_FAMILY,
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 4,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    overflow: 'hidden',
    marginBottom: SPACING.sectionMargin,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontFamily: FONT_FAMILY,
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  userInfo: {
    flex: 1,
  },
  userEmail: {
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  userSubtitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.textSecondary,
    marginTop: 2,
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
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  menuItemDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  menuIcon: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.categoryIcon,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuItemText: {
    flex: 1,
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: '400',
    color: COLORS.textPrimary,
    marginHorizontal: 12,
  },
  signOutButton: {
    height: 50,
    marginTop: SPACING.sectionMargin,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.button,
    justifyContent: 'center',
    alignItems: 'center',
  },
  signOutButtonDisabled: {
    opacity: 0.6,
  },
  signOutButtonText: {
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.danger,
  },
});
