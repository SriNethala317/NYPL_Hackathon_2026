import { StyleSheet, View } from 'react-native';

import { Button, Card, Icon, Text } from '@/components/ui';
import { colors, radius } from '@/theme';

export type EmptyStateAction = {
  label: string;
  onPress?: () => void;
};

export type EmptyStateCardProps = {
  title: string;
  body: string;
  /** The navy call to action — usually "Add documents". */
  action: EmptyStateAction;
  /** An optional quieter second action beneath it. */
  secondaryAction?: EmptyStateAction;
};

/**
 * The "nothing here yet" card, shared by the Home and Enrollment tabs — same shape, different
 * copy and actions.
 */
export function EmptyStateCard({ title, body, action, secondaryAction }: EmptyStateCardProps) {
  return (
    <Card size="cardLg" style={styles.card}>
      <View style={styles.tile}>
        <Icon name="document" size={22} color={colors.muted} />
      </View>

      <View style={styles.copy}>
        <Text variant="cardTitle">{title}</Text>
        <Text variant="bodySm" color="muted">
          {body}
        </Text>
      </View>

      <View style={styles.actions}>
        <Button label={action.label} onPress={action.onPress} size="md" />
        {secondaryAction ? (
          <Button
            label={secondaryAction.label}
            onPress={secondaryAction.onPress}
            variant="secondary"
            size="md"
          />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: 26,
    paddingHorizontal: 22,
    gap: 14,
  },
  tile: {
    width: 44,
    height: 44,
    borderRadius: radius.tile,
    backgroundColor: colors.offWhite,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    gap: 6,
  },
  actions: {
    gap: 10,
    paddingTop: 2,
  },
});
