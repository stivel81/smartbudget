import React, { useState, useContext } from 'react';
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
import { MaterialCommunityIcons, Feather, FontAwesome } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { login } from '../lib/api';
import { AuthContext } from '../App';
import { COLORS, RADIUS, FONT_FAMILY } from '../lib/theme';

type RootStackParamList = {
  Login: undefined;
  Signup: undefined;
  Main: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const auth = useContext(AuthContext);

  const handleLogin = async () => {
    setError('');

    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    if (!password.trim()) {
      setError('Password is required');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email');
      return;
    }

    setLoading(true);

    try {
      const result = await login(email, password);
      // On success, set authentication state
      auth.setAccessToken(result.session.access_token);
      auth.setRefreshToken(result.session.refresh_token);
      auth.setUserEmail(result.session.user.email);
      auth.setIsAuthenticated(true);
      // Navigate to the main app
      navigation.reset({
        index: 0,
        routes: [{ name: 'Main' }],
      });
    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.');
      setPassword('');
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
              <MaterialCommunityIcons name="wallet" size={26} color={COLORS.buttonText} />
            </View>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Sign in to SmartBudget</Text>
          </View>

          {/* Error Banner */}
          {error ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

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
              testID="login-email-input"
            />
          </View>

          {/* Password Field */}
          <View style={styles.formGroup}>
            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Password"
                placeholderTextColor={COLORS.placeholder}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                editable={!loading}
                testID="login-password-input"
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                disabled={loading}
                style={styles.passwordToggle}
                testID="login-password-toggle"
              >
                <Feather
                  name={showPassword ? 'eye' : 'eye-off'}
                  size={18}
                  color={COLORS.textSecondary}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Forgot Password Link */}
          <TouchableOpacity style={styles.forgotPasswordContainer}>
            <Text style={styles.forgotPasswordText}>Forgot password?</Text>
          </TouchableOpacity>

          {/* Sign In Button */}
          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            testID="login-button"
          >
            {loading ? (
              <ActivityIndicator color={COLORS.buttonText} />
            ) : (
              <Text style={styles.primaryButtonText}>Sign in</Text>
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
              testID="login-google-button"
            >
              <FontAwesome name="google" size={18} color={COLORS.textPrimary} />
              <Text style={styles.socialButtonText}>Google</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.socialButton}
              disabled={loading}
              testID="login-apple-button"
            >
              <FontAwesome name="apple" size={18} color={COLORS.textPrimary} />
              <Text style={styles.socialButtonText}>Apple</Text>
            </TouchableOpacity>
          </View>

          {/* Footer Link */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>No account? </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Signup')}
              disabled={loading}
            >
              <Text style={styles.footerLink}>Sign up</Text>
            </TouchableOpacity>
          </View>
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
  forgotPasswordContainer: {
    alignItems: 'flex-end',
    marginBottom: 24,
  },
  forgotPasswordText: {
    fontFamily: FONT_FAMILY,
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '500',
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
    marginBottom: 32,
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
    marginTop: 'auto',
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
});
