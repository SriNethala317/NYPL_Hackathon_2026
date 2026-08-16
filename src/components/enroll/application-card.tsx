import { StyleSheet, View } from 'react-native';

import { StageTracker } from './stage-tracker';

import { Badge, Card, Divider, Text } from '@/components/ui';
import { colors, radius } from '@/theme';

export type ApplicationCardProps = {
  /** Program name, e.g. "SNAP food benefits". */
  name: string;
  /** Reference number — "NYC-2026-4180". */
  reference: string;
  /** Pre-formatted submission date; formatting is the caller's decision. */
  date: string;
  /** Localized name of the current stage, shown in the badge. */
  stageLabel: string;
  /** All stage names, in order. */
  stageLabels: string[];
  stage: number;
  /** One-line status note under the rail. */
  note?: string;
  /** Localized progress announcement for screen readers. */
  announcement?: string;
};

/**
 * One submitted application on the Home tab.
 *
 * The reference line uses tabular figures so a stack of these keeps its digits aligned
 * down the column.
 */
export function ApplicationCard({
  name,
  reference,
  date,
  stageLabel,
  stageLabels,
  stage,
  note,
  announcement,
}: ApplicationCardProps) {
  return (
    <Card size="cardLg" style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.heading}>
          <Text variant="rowTitle">{name}</Text>
          <Text variant="meta" color="muted" tabular>
            {reference} · {date}
          </Text>
        </View>
        <Badge label={stageLabel} surface={colors.navyTint} color={colors.navy} />
      </View>

      <StageTracker labels={stageLabels} stage={stage} announcement={announcement} />

      {note ? (
        <View style={styles.footer}>
          <Divider />
          <Text variant="meta" color="muted">
            {note}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 18,
    gap: 14,
    borderRadius: radius.cardLg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  heading: {
    flexShrink: 1,
    gap: 2,
  },
  footer: {
    gap: 14,
  },
});
