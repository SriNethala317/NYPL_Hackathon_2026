import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { colors } from '@/theme';

export type PrivacyNoteProps = ViewProps & {
  /** The reassurance copy. Localized, so it's passed in rather than baked in here. */
  children: string;
  /**
   * Makes the note a link to the full privacy screen.
   *
   * A one-line reassurance is a claim; being able to tap through to exactly what is kept, what is
   * deleted, and what is never stored is what makes it checkable.
   */
  onPress?: () => void;
};

/**
 * The green padlock plus reassurance line that appears under the document lists and empty
 * states. It repeats often enough — Home, Enrollment, Profile, and the upload sheet — to be
 * worth its own component.
 */
export function PrivacyNote({ children, style, onPress, ...rest }: PrivacyNoteProps) {
  const body = (
    <>
      <View style={styles.icon}>
        <Icon name="lock" size={14} color={colors.green} />
      </View>
      <Text variant="meta" color={onPress ? 'navy' : 'muted'} style={styles.copy}>
        {children}
      </Text>
    </>
  );

  if (!onPress) {
    return (
      <View style={[styles.container, style]} {...rest}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={children}
      onPress={onPress}
      style={({ pressed }) => [styles.container, style, pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 2,
  },
  // Nudged down to sit on the first line's baseline rather than its box top.
  icon: {
    paddingTop: 2,
  },
  copy: {
    flex: 1,
  },
  pressed: {
    opacity: 0.6,
  },
});
