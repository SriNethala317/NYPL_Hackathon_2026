import { Pressable, StyleSheet, View, type PressableProps } from 'react-native';

import { Text } from '@/components/ui';
import { colors, layout, radius } from '@/theme';

export type Language = 'en' | 'es';

export type LanguagePillProps = Omit<PressableProps, 'style' | 'children'> & {
  /** The language currently active — this is what the pill displays. */
  language: Language;
};

/**
 * The EN/ES toggle in the header. Displays the *current* language and switches the whole app
 * when tapped, so the accessible label has to say what tapping does rather than just naming
 * the state.
 */
export function LanguagePill({ language, ...rest }: LanguagePillProps) {
  const next = language === 'en' ? 'Español' : 'English';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Switch to ${next}`}
      style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
      {...rest}>
      <View style={styles.globe} />
      <Text variant="metaStrong" color="navy">
        {language.toUpperCase()}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.offWhite,
    borderWidth: layout.borderWidth,
    borderColor: colors.border,
  },
  globe: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.navy,
  },
  pressed: {
    opacity: 0.7,
  },
});
