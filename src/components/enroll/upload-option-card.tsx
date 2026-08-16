import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { Card, Icon, Text, type IconName } from '@/components/ui';

export type UploadOptionCardProps = Omit<PressableProps, 'style' | 'children'> & {
  icon: IconName;
  iconColor: string;
  title: string;
  description: string;
};

/**
 * One of the two choices in the upload sheet — scan with the camera, or pick a file.
 *
 * Deliberately equal in weight: neither route is the recommended one, so they sit side by
 * side at the same size rather than as a primary and a fallback.
 */
export function UploadOptionCard({
  icon,
  iconColor,
  title,
  description,
  ...rest
}: UploadOptionCardProps) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} style={styles.pressable} {...rest}>
      {({ pressed }) => (
        <Card style={[styles.card, pressed && styles.pressed]}>
          <Icon name={icon} size={24} color={iconColor} />
          <Text variant="label">{title}</Text>
          <Text variant="caption" color="muted">
            {description}
          </Text>
        </Card>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Each option takes half the sheet; the parent lays them out in a row with a 12pt gap.
  pressable: {
    flex: 1,
  },
  card: {
    flex: 1,
    paddingVertical: 18,
    paddingHorizontal: 14,
    gap: 8,
  },
  pressed: {
    opacity: 0.7,
  },
});
