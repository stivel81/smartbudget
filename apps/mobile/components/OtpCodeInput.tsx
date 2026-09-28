import React from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { COLORS, FONT_FAMILY, RADIUS } from '../lib/theme';
import { OTP_CODE_LENGTH, sanitizeOtpCode } from '../lib/validation';

interface Props {
  value: string;
  /** Receives the already-sanitized code (digits only, at most OTP_CODE_LENGTH). */
  onChangeCode: (code: string) => void;
  editable?: boolean;
  testID?: string;
}

/**
 * The 6-digit emailed-code field used by Forgot password and Verify email:
 * digits only, number pad, iOS/Android one-time-code autofill. The wide
 * digit spacing only applies once something is typed — on the placeholder
 * it would stretch "6-digit code" into "6 - d i g i t  c o d e".
 */
export default function OtpCodeInput({ value, onChangeCode, editable = true, testID }: Props) {
  return (
    <TextInput
      style={[styles.input, value ? styles.filled : null]}
      placeholder={`${OTP_CODE_LENGTH}-digit code`}
      placeholderTextColor={COLORS.placeholder}
      value={value}
      onChangeText={(text) => onChangeCode(sanitizeOtpCode(text))}
      keyboardType="number-pad"
      textContentType="oneTimeCode"
      autoComplete="one-time-code"
      maxLength={OTP_CODE_LENGTH}
      editable={editable}
      testID={testID}
    />
  );
}

export const OTP_DIGIT_SPACING = 6;

const styles = StyleSheet.create({
  input: {
    fontFamily: FONT_FAMILY,
    height: 46,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.input,
    paddingHorizontal: 14,
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '600',
  },
  filled: {
    letterSpacing: OTP_DIGIT_SPACING,
  },
});
