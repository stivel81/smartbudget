import React, { useState, useContext, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { requestPasswordReset, resetPassword } from '../lib/api';
import { apiErrorMessage } from '../lib/errors';
import {
  RESET_CODE_LENGTH,
  sanitizeResetCode,
  validateEmail,
  validateNewPassword,
  validateResetCode,
} from '../lib/validation';
import PasswordStrengthMeter from '../components/PasswordStrengthMeter';
import { AuthContext } from '../App';
import { COLORS, RADIUS, FONT_FAMILY } from '../lib/theme';

type RootStackParamList = {
  Login: undefined;
  Signup: undefined;
  ForgotPassword: { email?: string } | undefined;
  Main: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, 'ForgotPassword'>;

type Step = 'email' | 'reset';

// Supabase only sends one recovery email per user per 60s by default, and
// the backend deliberately hides Supabase errors (anti-enumeration) — so a
// faster resend would *look* successful but send nothing. Match the window.
export const RESEND_COOLDOWN_SECONDS = 60;

const SEND_NETWORK_ERROR = 'Could not send the code. Check your connection and try again.';
const RESET_NETWORK_ERROR = 'Could not reset your password. Check your connection and try again.';

export default function ForgotPasswordScreen({ navigation, route }: Props) {
  const auth = useContext(AuthContext);
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState(route.params?.email ?? '');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const busy = loading || resending;

  const handleSendCode = async () => {
    setError('');
    setNotice('');

    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }

    const trimmed = email.trim();
    setLoading(true);
    try {
      await requestPasswordReset(trimmed);
      setEmail(trimmed);
      setCode('');
      setNewPassword('');
      setStep('reset');
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setNotice(
        `If an account exists for ${trimmed}, we've sent a ${RESET_CODE_LENGTH}-digit code to it.`
      );
    } catch (err) {
      setError(apiErrorMessage(err, SEND_NETWORK_ERROR));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setNotice('');
    setResending(true);
    try {
      await requestPasswordReset(email);
      setCode('');
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setNotice(`If an account exists for ${email}, a new code is on its way. Use the newest code.`);
    } catch (err) {
      setError(apiErrorMessage(err, SEND_NETWORK_ERROR));
    } finally {
      setResending(false);
    }
  };

  const handleReset = async () => {
    setError('');
    setNotice('');

    const codeError = validateResetCode(code);
    if (codeError) {
      setError(codeError);
      return;
    }

    const passwordError = validateNewPassword(newPassword);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setLoading(true);
    try {
      const result = await resetPassword(email, code, newPassword);
      // Sign straight in — same as LoginScreen does on a successful login.
      // Flipping isAuthenticated makes App.tsx swap the auth stack for Main;
      // no manual navigation (Main isn't registered until that re-render).
      auth.setAccessToken(result.session.access_token);
      auth.setRefreshToken(result.session.refresh_token);
      auth.setUserEmail(result.session.user.email);
      auth.setIsAuthenticated(true);
    } catch (err) {
      setError(apiErrorMessage(err, RESET_NETWORK_ERROR));
    } finally {
      setLoading(false);
    }
  };

  const changeEmail = () => {
    setStep('email');
    setCode('');
    setNewPassword('');
    setError('');
    setNotice('');
  };

  return (
    <SafeAreaView style={styles.container} testID="forgot-screen">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo Area */}
          <View style={styles.logoContainer}>
            <View style={styles.logoIcon}>
              <MaterialCommunityIcons name="wallet" size={26} color={COLORS.buttonText} />
            </View>
            <Text style={styles.title}>
              {step === 'email' ? 'Forgot password?' : 'Reset password'}
            </Text>
            <Text style={styles.subtitle}>
              {step === 'email'
                ? `We'll email you a ${RESET_CODE_LENGTH}-digit code`
                : 'Enter the code and choose a new password'}
            </Text>
          </View>

          {/* Error Banner */}
          {error ? (
            <View style={styles.errorBanner} testID="forgot-error">
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Info Banner */}
          {notice ? (
            <View style={styles.noticeBanner} testID="forgot-notice">
              <Text style={styles.noticeText}>{notice}</Text>
            </View>
          ) : null}

          {step === 'email' ? (
            <>
              <View style={styles.formGroup}>
                <TextInput
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor={COLORS.placeholder}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  editable={!loading}
                  testID="forgot-email-input"
                />
              </View>

              <TouchableOpacity
                style={[styles.primaryButton, loading && styles.buttonDisabled]}
                onPress={handleSendCode}
                disabled={loading}
                testID="forgot-send-button"
              >
                {loading ? (
                  <ActivityIndicator color={COLORS.buttonText} testID="forgot-send-loading" />
                ) : (
                  <Text style={styles.primaryButtonText}>Send code</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              {/* Which email the code went to, with a way back to fix it */}
              <View style={styles.emailRow}>
                <Text style={styles.emailRowText} numberOfLines={1} testID="forgot-sent-to">
                  {email}
                </Text>
                <TouchableOpacity onPress={changeEmail} disabled={busy} testID="forgot-change-email">
                  <Text style={styles.linkText}>Change</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.formGroup}>
                <TextInput
                  style={[styles.input, styles.codeInput]}
                  placeholder={`${RESET_CODE_LENGTH}-digit code`}
                  placeholderTextColor={COLORS.placeholder}
                  value={code}
                  onChangeText={(text) => setCode(sanitizeResetCode(text))}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="one-time-code"
                  maxLength={RESET_CODE_LENGTH}
                  editable={!loading}
                  testID="forgot-code-input"
                />
              </View>

              <View style={styles.formGroup}>
                <View style={styles.passwordContainer}>
                  <TextInput
                    style={styles.passwordInput}
                    placeholder="New password"
                    placeholderTextColor={COLORS.placeholder}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    textContentType="newPassword"
                    editable={!loading}
                    testID="forgot-password-input"
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    disabled={loading}
                    style={styles.passwordToggle}
                    testID="forgot-password-toggle"
                  >
                    <Feather
                      name={showPassword ? 'eye' : 'eye-off'}
                      size={18}
                      color={COLORS.textSecondary}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              <PasswordStrengthMeter password={newPassword} testIDPrefix="forgot" />

              <TouchableOpacity
                style={[styles.primaryButton, busy && styles.buttonDisabled]}
                onPress={handleReset}
                disabled={busy}
                testID="forgot-reset-button"
              >
                {loading ? (
                  <ActivityIndicator color={COLORS.buttonText} testID="forgot-reset-loading" />
                ) : (
                  <Text style={styles.primaryButtonText}>Reset password</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.resendContainer}
                onPress={handleResend}
                disabled={busy || cooldown > 0}
                testID="forgot-resend-button"
              >
                <Text
                  style={[styles.linkText, (busy || cooldown > 0) && styles.linkTextDisabled]}
                >
                  {resending
                    ? 'Sending…'
                    : cooldown > 0
                      ? `Resend code in ${cooldown}s`
                      : 'Resend code'}
                </Text>
              </TouchableOpacity>
            </>
          )}

          {/* Footer Link */}
          <View style={styles.footer}>
            <TouchableOpacity
              onPress={() => navigation.navigate('Login')}
              disabled={busy}
              testID="forgot-back-button"
            >
              <Text style={styles.footerLink}>Back to sign in</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // White page, like Login/Signup, so COLORS.background inputs stand out.
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
    marginTop: 20,
  },
  logoIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: COLORS.button,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontFamily: FONT_FAMILY,
    fontSize: 26,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '400',
    textAlign: 'center',
  },
  errorBanner: {
    backgroundColor: COLORS.errorBg,
    borderColor: COLORS.danger,
    borderWidth: 1,
    borderRadius: RADIUS.input,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 24,
  },
  errorText: {
    fontFamily: FONT_FAMILY,
    color: COLORS.danger,
    fontSize: 13,
    fontWeight: '500',
  },
  noticeBanner: {
    backgroundColor: COLORS.chipBg,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: RADIUS.input,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 24,
  },
  noticeText: {
    fontFamily: FONT_FAMILY,
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '400',
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 12,
  },
  emailRowText: {
    fontFamily: FONT_FAMILY,
    flex: 1,
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  formGroup: {
    marginBottom: 16,
  },
  input: {
    fontFamily: FONT_FAMILY,
    height: 46,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.input,
    paddingHorizontal: 14,
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '400',
  },
  codeInput: {
    letterSpacing: 6,
    fontSize: 18,
    fontWeight: '600',
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
  primaryButton: {
    height: 50,
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.button,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
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
  resendContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  linkText: {
    fontFamily: FONT_FAMILY,
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  linkTextDisabled: {
    color: COLORS.textSecondary,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 'auto',
  },
  footerLink: {
    fontFamily: FONT_FAMILY,
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
});
