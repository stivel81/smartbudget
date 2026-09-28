import React, { useState, useMemo } from 'react';
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
  Alert,
} from 'react-native';
import { MaterialCommunityIcons, FontAwesome } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { signup } from '../lib/api';
import { COLORS, RADIUS, FONT_FAMILY } from '../lib/theme';

type RootStackParamList = {
  Login: undefined;
  Signup: undefined;
  Main: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, 'Signup'>;

function calculatePasswordStrength(password: string): {
  strength: number;
  label: string;
} {
  if (!password) return { strength: 0, label: '' };

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  if (score <= 1) return { strength: 1, label: 'Weak' };
  if (score <= 2) return { strength: 2, label: 'Fair' };
  if (score <= 3) return { strength: 3, label: 'Good' };
  return { strength: 4, label: 'Strong' };
}

export default function SignupScreen({ navigation }: Props) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const passwordStrength = useMemo(
    () => calculatePasswordStrength(password),
    [password]
  );

  const handleSignup = async () => {
    setError('');

    if (!firstName.trim()) {
      setError('First name is required');
      return;
    }

    if (!lastName.trim()) {
      setError('Last name is required');
      return;
    }

    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email');
      return;
    }

    if (!password.trim()) {
      setError('Password is required');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`;
      await signup(email, password, fullName);
      Alert.alert(
        'Check your email',
        `We sent a verification link to ${email}. Verify your email before signing in.`
      );
      navigation.reset({
        index: 0,
        routes: [{ name: 'Login' }],
      });
    } catch (err: any) {
      setError(err.message || 'Signup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Logo Area */}
          <View style={styles.logoContainer}>
            <View style={styles.logoIcon}>
              <MaterialCommunityIcons name="wallet" size={26} color="#ffffff" />
            </View>
            <Text style={styles.title}>Create account</Text>
            <Text style={styles.subtitle}>Start tracking your budget</Text>
          </View>

          {/* Error Banner */}
          {error ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Name Row (First name | Last name) */}
          <View style={styles.nameRow}>
            <View style={[styles.formGroup, styles.nameField]}>
              <TextInput
                style={styles.input}
                placeholder="First name"
                placeholderTextColor={COLORS.placeholder}
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
                editable={!loading}
                testID="signup-firstname-input"
              />
            </View>
            <View style={[styles.formGroup, styles.nameField]}>
              <TextInput
                style={styles.input}
                placeholder="Last name"
                placeholderTextColor={COLORS.placeholder}
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
                editable={!loading}
                testID="signup-lastname-input"
              />
            </View>
          </View>

          {/* Email Field */}
          <View style={styles.formGroup}>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={COLORS.placeholder}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!loading}
              testID="signup-email-input"
            />
          </View>

          {/* Password Field */}
          <View style={styles.formGroup}>
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={COLORS.placeholder}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!loading}
              testID="signup-password-input"
            />
          </View>

          {/* Password Strength Indicator */}
          <View style={styles.strengthContainer}>
            <View style={styles.barsContainer}>
              {[1, 2, 3, 4].map((bar) => (
                <View
                  key={bar}
                  style={[
                    styles.strengthBar,
                    bar <= passwordStrength.strength
                      ? styles.strengthBarFilled
                      : styles.strengthBarEmpty,
                  ]}
                />
              ))}
            </View>
            {passwordStrength.label && (
              <Text style={styles.strengthLabel}>{passwordStrength.label}</Text>
            )}
          </View>

          {/* Create Account Button */}
          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.buttonDisabled]}
            onPress={handleSignup}
            disabled={loading}
            testID="signup-button"
          >
            {loading ? (
              <ActivityIndicator color={COLORS.buttonText} />
            ) : (
              <Text style={styles.primaryButtonText}>Create account</Text>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.dividerContainer}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Social Buttons */}
          <View style={styles.socialButtonsContainer}>
            <TouchableOpacity
              style={styles.socialButton}
              disabled={loading}
              testID="signup-google-button"
            >
              <FontAwesome name="google" size={18} color={COLORS.textPrimary} />
              <Text style={styles.socialButtonText}>Google</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.socialButton}
              disabled={loading}
              testID="signup-apple-button"
            >
              <FontAwesome name="apple" size={18} color={COLORS.textPrimary} />
              <Text style={styles.socialButtonText}>Apple</Text>
            </TouchableOpacity>
          </View>

          {/* Footer Link */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Have an account? </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Login')}
              disabled={loading}
            >
              <Text style={styles.footerLink}>Sign in</Text>
            </TouchableOpacity>
          </View>

          {/* Terms Text */}
          <Text style={styles.termsText}>
            By continuing you agree to our Terms & Privacy Policy
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
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
    marginBottom: 32,
    marginTop: 12,
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
  },
  errorBanner: {
    backgroundColor: '#FEE2E2',
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
  nameRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 0,
  },
  nameField: {
    flex: 1,
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
  strengthBarFilled: {
    backgroundColor: COLORS.success,
  },
  strengthBarEmpty: {
    backgroundColor: COLORS.border,
  },
  strengthLabel: {
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.success,
    minWidth: 40,
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
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    fontFamily: FONT_FAMILY,
    color: COLORS.textSecondary,
    fontSize: 12,
    marginHorizontal: 12,
    fontWeight: '500',
  },
  socialButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  socialButton: {
    flex: 1,
    height: 46,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.input,
    backgroundColor: COLORS.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  socialButtonText: {
    fontFamily: FONT_FAMILY,
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  footerText: {
    fontFamily: FONT_FAMILY,
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '400',
  },
  footerLink: {
    fontFamily: FONT_FAMILY,
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  termsText: {
    fontFamily: FONT_FAMILY,
    color: COLORS.placeholder,
    fontSize: 10,
    textAlign: 'center',
    lineHeight: 15,
  },
});
