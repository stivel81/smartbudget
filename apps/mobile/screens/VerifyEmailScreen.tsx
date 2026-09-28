import React, { useState, useContext, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { verifySignup, resendSignupCode } from '../lib/api';
import { apiErrorMessage } from '../lib/errors';
import { OTP_CODE_LENGTH, OTP_RESEND_COOLDOWN_SECONDS, validateOtpCode } from '../lib/validation';
import OtpCodeInput from '../components/OtpCodeInput';
import { AuthContext, applySession } from '../lib/auth';
import type { AuthStackParamList } from '../lib/navigation';
import { COLORS, RADIUS, FONT_FAMILY } from '../lib/theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'VerifyEmail'>;

const VERIFY_NETWORK_ERROR = 'Could not verify your email. Check your connection and try again.';
const SEND_NETWORK_ERROR = 'Could not send the code. Check your connection and try again.';
export const NOT_VERIFIED_NOTICE = "Your email isn't verified yet. We've sent you a new code.";
export const RESENT_NOTICE = 'A new code is on its way. Use the newest code.';

/**
 * "Check your email": confirm a new account with the 6-digit code from the
 * signup email, then sign straight in. Opened after signup (Supabase has just
 * sent a code, so the resend cooldown starts running) or from Login when the
 * account isn't verified yet (`sendCode`: a fresh code is sent on open).
 */
export default function VerifyEmailScreen({ navigation, route }: Props) {
  const auth = useContext(AuthContext);
  const email = route.params.email;
  const sendCodeOnOpen = route.params.sendCode === true;
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  // After signup a code was just sent, so the first resend waits out the
  // window; when we send one on open, the cooldown starts once it's sent.
  const [cooldown, setCooldown] = useState(sendCodeOnOpen ? 0 : OTP_RESEND_COOLDOWN_SECONDS);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const sendCode = async (successNotice: string) => {
    setError('');
    setNotice('');
    setResending(true);
    try {
      await resendSignupCode(email);
      if (!mounted.current) return;
      setCode('');
      setCooldown(OTP_RESEND_COOLDOWN_SECONDS);
      setNotice(successNotice);
    } catch (err) {
      if (mounted.current) setError(apiErrorMessage(err, SEND_NETWORK_ERROR));
    } finally {
      if (mounted.current) setResending(false);
    }
  };

  useEffect(() => {
    if (sendCodeOnOpen) sendCode(NOT_VERIFIED_NOTICE);
    // Once per screen open; `email`/`sendCode` come from the route and don't change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const busy = loading || resending;

  const handleVerify = async () => {
    setError('');
    setNotice('');

    const codeError = validateOtpCode(code);
    if (codeError) {
      setError(codeError);
      return;
    }

    setLoading(true);
    try {
      const result = await verifySignup(email, code);
      // Sign straight in — same as LoginScreen does on a successful login.
      applySession(auth, result.session);
    } catch (err) {
      if (mounted.current) setError(apiErrorMessage(err, VERIFY_NETWORK_ERROR));
    } finally {
      if (mounted.current) setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} testID="verify-screen">
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
              <MaterialCommunityIcons name="email-check-outline" size={26} color={COLORS.buttonText} />
            </View>
            <Text style={styles.title}>Check your email</Text>
            <Text style={styles.subtitle}>
              Enter the {OTP_CODE_LENGTH}-digit code we sent to
            </Text>
            <Text style={styles.emailText} numberOfLines={1} testID="verify-email-address">
              {email}
            </Text>
          </View>

          {/* Error Banner */}
          {error ? (
            <View style={styles.errorBanner} testID="verify-error">
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Info Banner */}
          {notice ? (
            <View style={styles.noticeBanner} testID="verify-notice">
              <Text style={styles.noticeText}>{notice}</Text>
            </View>
          ) : null}

          <View style={styles.formGroup}>
            <OtpCodeInput
              value={code}
              onChangeCode={setCode}
              editable={!loading}
              testID="verify-code-input"
            />
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, busy && styles.buttonDisabled]}
            onPress={handleVerify}
            disabled={busy}
            testID="verify-button"
          >
            {loading ? (
              <ActivityIndicator color={COLORS.buttonText} testID="verify-loading" />
            ) : (
              <Text style={styles.primaryButtonText}>Verify</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.resendContainer}
            onPress={() => sendCode(RESENT_NOTICE)}
            disabled={busy || cooldown > 0}
            testID="verify-resend-button"
          >
            <Text style={[styles.linkText, (busy || cooldown > 0) && styles.linkTextDisabled]}>
              {resending
                ? 'Sending…'
                : cooldown > 0
                  ? `Resend code in ${cooldown}s`
                  : 'Resend code'}
            </Text>
          </TouchableOpacity>

          <Text style={styles.hintText}>Can't find it? Check your spam folder.</Text>

          {/* Footer Link */}
          <View style={styles.footer}>
            <TouchableOpacity
              onPress={() => navigation.navigate('Login')}
              disabled={loading}
              testID="verify-back-button"
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
  // White page, like Login/Signup/ForgotPassword, so COLORS.background inputs stand out.
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
  emailText: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    color: COLORS.textPrimary,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
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
  formGroup: {
    marginBottom: 16,
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
    marginBottom: 12,
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
  hintText: {
    fontFamily: FONT_FAMILY,
    color: COLORS.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 24,
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
