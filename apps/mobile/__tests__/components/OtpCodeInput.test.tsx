import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import OtpCodeInput, { OTP_DIGIT_SPACING } from '../../components/OtpCodeInput';
import { COLORS } from '../../lib/theme';

function Controlled({ initial = '', onChange }: { initial?: string; onChange?: (c: string) => void }) {
  const [code, setCode] = useState(initial);
  return (
    <OtpCodeInput
      value={code}
      onChangeCode={(c) => {
        onChange?.(c);
        setCode(c);
      }}
      testID="otp"
    />
  );
}

const styleOf = () => StyleSheet.flatten(screen.getByTestId('otp').props.style);

describe('OtpCodeInput', () => {
  it('shows the "6-digit code" placeholder in the placeholder colour', () => {
    render(<Controlled />);

    const input = screen.getByTestId('otp');
    expect(input.props.placeholder).toBe('6-digit code');
    expect(input.props.placeholderTextColor).toBe(COLORS.placeholder);
  });

  it('has no letter spacing while empty, so the placeholder is not stretched', () => {
    render(<Controlled />);

    expect(styleOf().letterSpacing).toBeUndefined();
  });

  it('spaces the digits out once something is typed', () => {
    render(<Controlled />);

    fireEvent.changeText(screen.getByTestId('otp'), '1');

    expect(screen.getByTestId('otp').props.value).toBe('1');
    expect(styleOf().letterSpacing).toBe(OTP_DIGIT_SPACING);
    expect(OTP_DIGIT_SPACING).toBeGreaterThan(0);
  });

  it('drops the spacing again when the field is cleared', () => {
    render(<Controlled initial="123" />);
    expect(styleOf().letterSpacing).toBe(OTP_DIGIT_SPACING);

    fireEvent.changeText(screen.getByTestId('otp'), '');

    expect(styleOf().letterSpacing).toBeUndefined();
  });

  it('keeps the same font and colours whether empty or filled (only spacing changes)', () => {
    render(<Controlled />);
    const { letterSpacing: _empty, ...emptyRest } = styleOf();

    fireEvent.changeText(screen.getByTestId('otp'), '42');
    const { letterSpacing: _filled, ...filledRest } = styleOf();

    expect(filledRest).toEqual(emptyRest);
    expect(emptyRest.backgroundColor).toBe(COLORS.background);
    expect(emptyRest.color).toBe(COLORS.textPrimary);
  });

  it.each([
    ['12a 34-5678', '123456'],
    ['Your code is 482913.', '482913'],
    ['abc', ''],
    ['１２３', ''],
  ])('sanitizes %p to %p before reporting it', (typed, expected) => {
    const onChange = jest.fn();
    render(<Controlled onChange={onChange} />);

    fireEvent.changeText(screen.getByTestId('otp'), typed);

    expect(onChange).toHaveBeenCalledWith(expected);
    expect(screen.getByTestId('otp').props.value).toBe(expected);
  });

  it('is set up for one-time-code autofill on a number pad, capped at 6', () => {
    render(<Controlled />);

    const input = screen.getByTestId('otp');
    expect(input.props.keyboardType).toBe('number-pad');
    expect(input.props.textContentType).toBe('oneTimeCode');
    expect(input.props.autoComplete).toBe('one-time-code');
    expect(input.props.maxLength).toBe(6);
  });

  it('is editable by default and can be disabled', () => {
    const { rerender } = render(<OtpCodeInput value="" onChangeCode={() => {}} testID="otp" />);
    expect(screen.getByTestId('otp').props.editable).toBe(true);

    rerender(<OtpCodeInput value="" onChangeCode={() => {}} editable={false} testID="otp" />);
    expect(screen.getByTestId('otp').props.editable).toBe(false);
  });
});
