import React, { useContext, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ScreenHeader from '../components/ScreenHeader';
import PasswordStrengthMeter from '../components/PasswordStrengthMeter';
import { AuthContext } from '../lib/auth';
import { changePassword } from '../lib/api';
import { apiErrorMessage } from '../lib/errors';
import { validatePasswordChange } from '../lib/validation';
import { APP_VERSION } from '../lib/appInfo';
import type { SignedInStackParamList } from '../lib/navigation';
import { COLORS, FONT_FAMILY, RADIUS, SPACING } from '../lib/theme';

export const PASSWORD_CHANGED_MESSAGE = 'Password updated';
const NETWORK_ERROR = 'Could not change your password. Check your connection and try again.';
const SIGNED_OUT_ERROR = 'Your session has ended. Please sign in again.';

interface PasswordFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  visible: boolean;
  onToggle: () => void;
  editable: boolean;
  textContentType: 'password' | 'newPassword';
  testID: string;
}

const PasswordField: React.FC<PasswordFieldProps> = ({
  value,
  onChangeText,
  placeholder,
  visible,
  onToggle,
  editable,
  textContentType,
  testID,
}) => (
  <View style={styles.passwordContainer}>
    <TextInput
      style={styles.passwordInput}
      placeholder={placeholder}
      placeholderTextColor={COLORS.placeholder}
      value={value}
      onChangeText={onChangeText}
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoCorrect={false}
      textContentType={textContentType}
      editable={editable}
      testID={`${testID}-input`}
    />
    <TouchableOpacity
      onPress={onToggle}
      disabled={!editable}
      style={styles.passwordToggle}
      accessibilityRole="button"
      accessibilityLabel={visible ? 'Hide password' : 'Show password'}
      testID={`${testID}-toggle`}
    >
      <Feather name={visible ? 'eye' : 'eye-off'} size={18} color={COLORS.textSecondary} />
    </TouchableOpacity>
  </View>
);

export default function SettingsScreen(): React.ReactElement {
  const navigation = useNavigation<NativeStackNavigationProp<SignedInStackParamList>>();
  const auth = useContext(AuthContext);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleChangePassword = async () => {
    setError('');
    setSuccess('');

    const validationError = validatePasswordChange(currentPassword, newPassword);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!auth.accessToken) {
      setError(SIGNED_OUT_ERROR);
      return;
    }

    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword, auth.accessToken);
      setCurrentPassword('');
      setNewPassword('');
      setShowCurrent(false);
      setShowNew(false);
      setSuccess(PASSWORD_CHANGED_MESSAGE);
    } catch (err: unknown) {
      setError(apiErrorMessage(err, NETWORK_ERROR));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} testID="settings-screen">
      <ScreenHeader
        title="Settings"
        backLabel="Profile"
        onBack={() => navigation.goBack()}
        testIDPrefix="settings"
      />

      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sectionLabel}>Change password</Text>
          <View style={styles.card}>
            {error ? (
              <View style={styles.errorBanner} testID="settings-error">
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
            {success ? (
              <View style={styles.successBanner} testID="settings-success">
                <Text style={styles.successText}>{success}</Text>
              </View>
            ) : null}

            <PasswordField
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder="Current password"
              visible={showCurrent}
              onToggle={() => setShowCurrent((v) => !v)}
              editable={!saving}
              textContentType="password"
              testID="settings-current-password"
            />
            <View style={styles.fieldGap} />
            <PasswordField
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="New password"
              visible={showNew}
              onToggle={() => setShowNew((v) => !v)}
              editable={!saving}
              textContentType="newPassword"
              testID="settings-new-password"
            />
            <View style={styles.fieldGap} />
            <PasswordStrengthMeter password={newPassword} testIDPrefix="settings" />

            <TouchableOpacity
              style={[styles.primaryButton, saving && styles.buttonDisabled]}
              onPress={handleChangePassword}
              disabled={saving}
              accessibilityRole="button"
              accessibilityState={{ disabled: saving }}
              testID="settings-change-password-button"
            >
              {saving ? (
                <ActivityIndicator color={COLORS.buttonText} testID="settings-saving" />
              ) : (
                <Text style={styles.primaryButtonText}>Update password</Text>
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel}>About</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Version</Text>
              <Text style={styles.rowValue} testID="settings-app-version">
                {APP_VERSION}
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
    paddingBottom: 24,
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
    padding: 14,
    marginBottom: SPACING.sectionMargin,
  },
  fieldGap: {
    height: 10,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 46,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.input,
  },
  passwordInput: {
    fontFamily: FONT_FAMILY,
    flex: 1,
    height: 46,
    paddingHorizontal: 14,
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '400',
  },
  passwordToggle: {
    paddingHorizontal: 14,
  },
  errorBanner: {
    backgroundColor: COLORS.errorBg,
    borderColor: COLORS.danger,
    borderWidth: 1,
    borderRadius: RADIUS.input,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  errorText: {
    fontFamily: FONT_FAMILY,
    color: COLORS.danger,
    fontSize: 13,
    fontWeight: '500',
  },
  successBanner: {
    backgroundColor: COLORS.chipBg,
    borderColor: COLORS.success,
    borderWidth: 1,
    borderRadius: RADIUS.input,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  successText: {
    fontFamily: FONT_FAMILY,
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '500',
  },
  primaryButton: {
    height: 50,
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.button,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    fontFamily: FONT_FAMILY,
    color: COLORS.buttonText,
    fontSize: 15,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowLabel: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: '400',
    color: COLORS.textPrimary,
  },
  rowValue: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: '400',
    color: COLORS.textSecondary,
  },
});
