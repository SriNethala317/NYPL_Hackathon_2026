import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Text } from '@/components/ui';
import { colors, layout } from '@/theme';

export type BackHeaderProps = {
  /** "Back" on the detail and form screens, "Edit" coming out of Review. */
  label: string;
  /** Shown beside the back control — the program name on the form screen. */
  title?: string;
  onPress?: () => void;
};

/** The header on pushed screens: detail, form, and review. */
export function BackHeader({ label, title, onPress }: BackHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        // Brings the small chevron-and-word target up to the 44pt minimum.
        hitSlop={12}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
        <Icon name="back" size={16} color={colors.navy} />
        <Text variant="bodyStrong" color="navy">
          {label}
        </Text>
      </Pressable>

      {title ? (
        <Text variant="label" numberOfLines={1} style={styles.title}>
          {title}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.paper,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: colors.border,
    paddingHorizontal: layout.screenPaddingX,
    paddingBottom: 14,
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: layout.minTarget,
  },
  title: {
    flexShrink: 1,
  },
  pressed: {
    opacity: 0.6,
  },
});
