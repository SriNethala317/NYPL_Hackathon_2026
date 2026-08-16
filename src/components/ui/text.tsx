import { Text as RNText, StyleSheet, type TextProps as RNTextProps } from 'react-native';

import { colors, fonts, typography, type TypographyVariant } from '@/theme';

type ColorToken = keyof typeof colors;

export type TextProps = RNTextProps & {
  /** A role from the type scale. See `typography` in src/theme/tokens.ts. */
  variant?: TypographyVariant;
  /** A palette key like `muted`, or any raw color for the splash overlays. */
  color?: ColorToken | (string & {});
  /** Filenames and reference numbers. */
  mono?: boolean;
  /** Fixed-width digits, so reference lines and dates don't jitter. */
  tabular?: boolean;
  align?: 'auto' | 'left' | 'right' | 'center';
};

function resolveColor(color: TextProps['color']) {
  if (!color) return colors.ink;
  return color in colors ? colors[color as ColorToken] : color;
}

/**
 * Every piece of text in the app goes through here, so sizes stay on the scale and no screen
 * hardcodes a hex.
 *
 * Text scales with the OS setting but is capped — the design's layouts are pixel-exact and
 * shatter past roughly 1.4×. Pass `maxFontSizeMultiplier` to override for a specific case.
 */
export function Text({
  variant = 'body',
  color,
  mono = false,
  tabular = false,
  align,
  style,
  ...rest
}: TextProps) {
  return (
    <RNText
      maxFontSizeMultiplier={1.4}
      style={[
        variantStyles[variant],
        { color: resolveColor(color) },
        mono && styles.mono,
        tabular && styles.tabular,
        align ? { textAlign: align } : undefined,
        style,
      ]}
      {...rest}
    />
  );
}

const variantStyles = StyleSheet.create(typography);

const styles = StyleSheet.create({
  mono: {
    fontFamily: fonts.mono,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
