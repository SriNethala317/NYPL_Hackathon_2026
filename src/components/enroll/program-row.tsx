import { Pressable, StyleSheet, View, type PressableProps } from 'react-native';

import { Card, Icon, Text } from '@/components/ui';
import { colors, eligibility, type EligibilityStatus } from '@/theme';

export type ProgramRowProps = Omit<PressableProps, 'style' | 'children'> & {
  name: string;
  /** One-line description of the program. */
  blurb: string;
  /**
   * The status-specific fact: the benefit when eligible, the missing document when more
   * information is needed, the income limit when not eligible.
   */
  meta?: string;
  status: EligibilityStatus;
};

/**
 * A program in the Enrollment list.
 *
 * The 4px left edge is the fastest read of eligibility in a long list — it survives being
 * scanned at speed in a way a badge doesn't — and the meta line repeats that status in color
 * *and* in words, so it doesn't rely on color alone.
 */
export function ProgramRow({ name, blurb, meta, status, ...rest }: ProgramRowProps) {
  const palette = eligibility[status];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[name, blurb, meta].filter(Boolean).join('. ')}
      {...rest}>
      {({ pressed }) => (
        <Card accent={palette.accent} style={[styles.card, pressed && styles.pressed]}>
          <View style={styles.titleRow}>
            <Text variant="rowTitle" style={styles.title}>
              {name}
            </Text>
            <Icon name="chevronRight" size={16} color={colors.border} />
          </View>

          <Text variant="labelRegular" color="muted">
            {blurb}
          </Text>

          {meta ? (
            <Text variant="metaStrong" color={palette.meta}>
              {meta}
            </Text>
          ) : null}
        </Card>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: 16,
    paddingRight: 16,
    // 15 rather than 16 — the 4px accent edge eats a point of the optical gap.
    paddingLeft: 15,
    gap: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    flexShrink: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});
