import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Text } from './text';

import { colors, layout, radius, typography } from '@/theme';

export type TextFieldProps = Omit<TextInputProps, 'style'> & {
  label: string;
  /**
   * Explains where the value came from ("From your Photo ID"). Replaced by the error copy
   * when `invalid` is set, so the row never grows or shifts on validation.
   */
  hint?: string;
  invalid?: boolean;
  errorText?: string;
};

/**
 * A labelled text input. Fully controlled — pass `value` and `onChangeText`; this component
 * holds no state of its own, including validation, which the form layer decides.
 */
export function TextField({
  label,
  hint,
  invalid = false,
  errorText = 'Required',
  ...rest
}: TextFieldProps) {
  return (
    <View style={styles.container}>
      <Text variant="label">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={hint}
        // Announces the field as errored, rather than relying on the red border alone.
        aria-invalid={invalid}
        placeholderTextColor={colors.disabled}
        style={[styles.input, invalid && styles.inputInvalid]}
        {...rest}
      />
      {invalid || hint ? (
        <Text variant="caption" color={invalid ? 'error' : 'muted'}>
          {invalid ? errorText : hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  input: {
    minHeight: 50,
    borderRadius: radius.button,
    borderWidth: layout.borderWidth,
    borderColor: colors.border,
    backgroundColor: colors.paper,
    paddingHorizontal: 14,
    // Vertical padding, not a fixed height, so larger text sizes still fit.
    paddingVertical: 13,
    color: colors.ink,
    fontSize: typography.body.fontSize,
  },
  inputInvalid: {
    borderColor: colors.error,
  },
});
