import React, { useState } from 'react';
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
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { signup } from '../lib/api';
import { validateEmail, validateNewPassword } from '../lib/validation';
import PasswordStrengthMeter from '../components/PasswordStrengthMeter';
import { COLORS, RADIUS, FONT_FAMILY } from '../lib/theme';

type RootStackParamList = {
  Login: undefined;
  Signup: undefined;
  Main: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, 'Signup'>;

export default function SignupScreen({ navigation }: Props) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }

    const passwordError = validateNewPassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setLoading(true);

    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`;
      const trimmedEmail = email.trim();
      await signup(trimmedEmail, password, fullName);
      Alert.alert(
        'Check your email',
        `We sent a verification link to ${trimmedEmail}. Verify your email before signing in.`
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
    <SafeAreaView style={styles.container} testID="signup-screen">
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
              <MaterialCommunityIcons name="wallet" size={26} color={COLORS.buttonText} />
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
          <PasswordStrengthMeter password={password} testIDPrefix="signup" />

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
  // White page (V2 spec: auth screens have a white status bar/background)
  // so the COLORS.background-filled inputs stand out against it.
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
