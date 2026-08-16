import { Text as RNText, StyleSheet, View, type ViewProps } from 'react-native';

import { Text } from '@/components/ui';
import { colors, fonts, onNavy } from '@/theme';

export type NycLockupVariant = 'splash' | 'header';

export type NycLockupProps = ViewProps & {
  /** `splash` is the 76pt navy-background lockup; `header` the 25pt one in the app chrome. */
  variant?: NycLockupVariant;
  /** "Enroll" — the agency sub-brand beside the wordmark. */
  title?: string;
  /** Two lines under the title. Splash only; the header omits it. */
  subtitle?: string[];
};

/**
 * The NYC wordmark plus the "Enroll" sub-brand.
 *
 * The two variants carry their own numbers rather than scaling from one size, because the
 * spec's proportions genuinely differ between them: the wordmark shrinks 76 → 25 while the
 * title only drops 24 → 15.
 *
 * Note the handoff's own caveat — in production this should be the official wordmark asset
 * from the agency brand kit, not type reconstructed from a font.
 */
export function NycLockup({
  variant = 'header',
  title = 'Enroll',
  subtitle,
  style,
  ...rest
}: NycLockupProps) {
  const spec = specs[variant];
  const letters = variant === 'splash' ? splashLetters : headerLetters;

  return (
    <View
      accessibilityRole="header"
      accessible
      accessibilityLabel={`NYC ${title}`}
      style={[styles.container, { gap: spec.gap }, style]}
      {...rest}>
      <Text
        // The wordmark is a fixed graphic; it must not reflow when the OS text size changes.
        maxFontSizeMultiplier={1}
        style={[
          styles.wordmark,
          {
            fontSize: spec.wordmark,
            lineHeight: spec.wordmark * 0.9,
            letterSpacing: spec.wordmark * LETTER_SPACING_RATIO,
          },
        ]}>
        {/*
          Plain RN Text, not the themed `Text` — a variant would set its own fontSize and
          override the wordmark size it's nested inside. These spans carry color only.
        */}
        <RNText style={{ color: letters.n }}>N</RNText>
        <RNText style={{ color: letters.y }}>Y</RNText>
        <RNText style={{ color: letters.c }}>C</RNText>
      </Text>

      <View style={[styles.rule, { backgroundColor: spec.rule }, spec.ruleHeight]} />

      <View style={styles.textBlock}>
        <Text
          maxFontSizeMultiplier={1.2}
          style={[styles.title, { fontSize: spec.title, lineHeight: spec.titleLine }]}
          color={spec.titleColor}>
          {title}
        </Text>
        {subtitle?.map((line) => (
          <Text key={line} variant="meta" color={onNavy.subtext} maxFontSizeMultiplier={1.2}>
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** -3.5 at 76pt, held constant as a ratio so the header variant tracks it. */
const LETTER_SPACING_RATIO = -3.5 / 76;

const splashLetters = { n: colors.paper, y: colors.cyan, c: colors.green };
const headerLetters = { n: colors.navy, y: colors.cyan, c: colors.green };

const specs = {
  splash: {
    wordmark: 76,
    gap: 20,
    rule: onNavy.rule,
    ruleHeight: { alignSelf: 'stretch' } as const,
    title: 24,
    titleLine: 26,
    titleColor: colors.paper,
  },
  header: {
    wordmark: 25,
    gap: 10,
    rule: colors.border,
    ruleHeight: { height: 22 } as const,
    title: 15,
    titleLine: 18,
    titleColor: colors.ink,
  },
} as const;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  wordmark: {
    fontFamily: fonts.display,
    // Carries the weight on web, where the plugin doesn't register the font file.
    fontWeight: '900',
  },
  rule: {
    width: 1,
  },
  textBlock: {
    justifyContent: 'center',
  },
  title: {
    fontWeight: '700',
    letterSpacing: -0.4,
  },
});
