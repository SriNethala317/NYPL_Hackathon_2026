import { StyleSheet, View, type ViewProps } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { colors } from '@/theme';

export type PrivacyNoteProps = ViewProps & {
  /** The reassurance copy. Localized, so it's passed in rather than baked in here. */
  children: string;
};

/**
 * The green padlock plus reassurance line that appears under the document lists and empty
 * states. It repeats often enough — Home, Enrollment, Profile, and the upload sheet — to be
 * worth its own component.
 */
export function PrivacyNote({ children, style, ...rest }: PrivacyNoteProps) {
  return (
    <View style={[styles.container, style]} {...rest}>
      <View style={styles.icon}>
        <Icon name="lock" size={14} color={colors.green} />
      </View>
      <Text variant="meta" color="muted" style={styles.copy}>
        {children}
      </Text>
    </View>
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
});
