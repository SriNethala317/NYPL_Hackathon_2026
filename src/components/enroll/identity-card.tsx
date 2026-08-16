import { Pressable, StyleSheet, View } from 'react-native';

import { Card, Text } from '@/components/ui';
import { colors } from '@/theme';

export type IdentityCardProps = {
  name: string;
  /** Initials for the avatar. Derived by the caller, which knows the name format. */
  initials: string;
  /** "3 of 5 documents verified", or the empty equivalent. */
  summary: string;
  /** Optional trailing text action — the demo's "Load sample" / "Reset demo". */
  action?: { label: string; onPress?: () => void };
};

/** The applicant header at the top of Profile. */
export function IdentityCard({ name, initials, summary, action }: IdentityCardProps) {
  return (
    <Card style={styles.card}>
      <View style={styles.avatar}>
        <Text variant="cardTitle" color="paper">
          {initials}
        </Text>
      </View>

      <View style={styles.copy}>
        <Text variant="rowTitle">{name}</Text>
        <Text variant="labelRegular" color="muted">
          {summary}
        </Text>
      </View>

      {action ? (
        <Pressable
          accessibilityRole="button"
          onPress={action.onPress}
          hitSlop={8}
          style={({ pressed }) => pressed && styles.pressed}>
          <Text variant="label" color="navy">
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  pressed: {
    opacity: 0.6,
  },
});
