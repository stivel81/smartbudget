import React, { useContext, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AuthContext } from '../App';
import { COLORS } from '../lib/theme';

export default function ProfileScreen(): React.ReactElement {
  const auth = useContext(AuthContext);
  const [signingOut, setSigningOut] = useState(false);

  const email = auth.userEmail || '';
  const initials = email ? email.slice(0, 2).toUpperCase() : '?';

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await auth.logout();
      // App.tsx swaps to the auth stack automatically once
      // isAuthenticated flips to false — no navigation call needed.
    } catch (err: any) {
      Alert.alert('Failed to sign out', err.message || 'Please try again.');
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>

      <View style={styles.content}>
        {/* Avatar & User Info */}
        <View style={styles.userCard}>
          <View
            style={[
              styles.largeAvatar,
              { backgroundColor: COLORS.button },
            ]}
          >
            <Text style={styles.largeAvatarText}>{initials}</Text>
          </View>
          <Text style={styles.userEmail}>{email}</Text>
        </View>

        {/* Menu Items */}
        <View style={styles.menuSection}>
          <TouchableOpacity style={styles.menuItem}>
            <MaterialCommunityIcons
              name="cog"
              size={20}
              color={COLORS.textPrimary}
            />
            <Text style={styles.menuItemText}>Settings</Text>
            <MaterialCommunityIcons
              name="chevron-right"
              size={20}
              color={COLORS.textSecondary}
            />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <MaterialCommunityIcons
              name="bell"
              size={20}
              color={COLORS.textPrimary}
            />
            <Text style={styles.menuItemText}>Notifications</Text>
            <MaterialCommunityIcons
              name="chevron-right"
              size={20}
              color={COLORS.textSecondary}
            />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <MaterialCommunityIcons
              name="file-document"
              size={20}
              color={COLORS.textPrimary}
            />
            <Text style={styles.menuItemText}>Privacy Policy</Text>
            <MaterialCommunityIcons
              name="chevron-right"
              size={20}
              color={COLORS.textSecondary}
            />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <MaterialCommunityIcons
              name="help-circle"
              size={20}
              color={COLORS.textPrimary}
            />
            <Text style={styles.menuItemText}>Help & Support</Text>
            <MaterialCommunityIcons
              name="chevron-right"
              size={20}
              color={COLORS.textSecondary}
            />
          </TouchableOpacity>
        </View>

        {/* Sign Out Button */}
        <TouchableOpacity
          style={styles.signOutButton}
          onPress={handleSignOut}
          disabled={signingOut}
          testID="profile-sign-out-button"
        >
          {signingOut ? (
            <ActivityIndicator color={COLORS.danger} />
          ) : (
            <Text style={styles.signOutButtonText}>Sign Out</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  userCard: {
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  largeAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  largeAvatarText: {
    color: COLORS.buttonText,
    fontWeight: '700',
    fontSize: 24,
  },
  userEmail: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  menuSection: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    marginBottom: 24,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  menuItemText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.textPrimary,
    marginHorizontal: 12,
  },
  signOutButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: COLORS.signOutBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.signOutBorder,
    alignItems: 'center',
  },
  signOutButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.danger,
  },
});
