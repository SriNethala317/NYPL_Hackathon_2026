import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type PressableProps } from 'react-native';

import { Text } from './text';

import { colors, layout, radius } from '@/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'accent';
export type ButtonSize = 'md' | 'lg';

export type ButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  label: string;
  /**
   * `primary` navy carries the main action. `secondary` is the navy outline used beside it.
   * `tertiary` is the quiet off-white fill for dead-end actions ("See other programs").
   * `accent` cyan is reserved for "Add documents" prompts on the detail screen.
   */
  variant?: ButtonVariant;
  /** `lg` (52pt) for sticky footers, `md` (48pt) inside cards. */
  size?: ButtonSize;
  /** Leading glyph, e.g. the `+` on "Add a document". */
  icon?: ReactNode;
  fullWidth?: boolean;
};

export function Button({
  label,
  variant = 'primary',
  size = 'lg',
  icon,
  fullWidth = true,
  disabled,
  ...rest
}: ButtonProps) {
  // `PressableProps['disabled']` is nullable; normalize before it reaches accessibilityState.
  const isDisabled = disabled ?? false;
  const palette = isDisabled ? disabledPalette[variant] : palettes[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        sizeStyles[size],
        { backgroundColor: palette.surface },
        palette.border ? { borderWidth: layout.borderWidth, borderColor: palette.border } : null,
        fullWidth ? styles.fullWidth : styles.hugContent,
        pressed && styles.pressed,
      ]}
      {...rest}>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text variant="bodyStrong" color={palette.label}>
        {label}
      </Text>
    </Pressable>
  );
}

type ButtonPalette = { surface: string; label: string; border?: string };

const palettes: Record<ButtonVariant, ButtonPalette> = {
  primary: { surface: colors.navy, label: colors.paper },
  secondary: { surface: colors.paper, label: colors.navy, border: colors.navy },
  tertiary: { surface: colors.offWhite, label: colors.navy },
  accent: { surface: colors.cyan, label: colors.paper },
};

/**
 * Only the filled variants dim — an outline button that lost its border would read as plain
 * text rather than a disabled control.
 */
const disabledPalette: Record<ButtonVariant, ButtonPalette> = {
  primary: { surface: colors.navyDisabled, label: colors.paper },
  secondary: { surface: colors.paper, label: colors.disabled, border: colors.border },
  tertiary: { surface: colors.offWhite, label: colors.disabled },
  accent: { surface: colors.navyDisabled, label: colors.paper },
};

const sizeStyles = StyleSheet.create({
  md: { minHeight: 48, borderRadius: radius.button },
  lg: { minHeight: 52, borderRadius: radius.card },
});

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
    // Vertical padding rather than a fixed height, so the label still fits when text scales.
    paddingVertical: 12,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  hugContent: {
    alignSelf: 'flex-start',
  },
  pressed: {
    opacity: 0.85,
  },
  icon: {
    justifyContent: 'center',
  },
});
