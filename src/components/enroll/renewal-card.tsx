import { StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Icon, Text } from '@/components/ui';
import type { RenewalUrgency } from '@/data/renewals';
import { colors } from '@/theme';

export type RenewalCardProps = {
  programName: string;
  /** Pre-formatted deadline, already localized. */
  status: string;
  urgency: RenewalUrgency;
  /** The City's own sentence stating the renewal requirement. */
  sourceText?: string;
  /** Whether the documents needed to renew are already on file. */
  documentsReady: boolean;
  documentsNote: string;
  actionLabel: string;
  onRenew?: () => void;
};

/**
 * A renewal coming due.
 *
 * Colour follows urgency rather than eligibility, so this deliberately does not use the
 * `eligibility` token map — a renewal is not a judgement about whether someone qualifies, it is a
 * deadline. Reusing that palette would say the wrong thing.
 */
export function RenewalCard({
  programName,
  status,
  urgency,
  sourceText,
  documentsReady,
  documentsNote,
  actionLabel,
  onRenew,
}: RenewalCardProps) {
  const tone = tones[urgency];

  return (
    <Card accent={tone.accent} style={styles.card}>
      <View style={styles.header}>
        <Text variant="rowTitle" style={styles.name}>
          {programName}
        </Text>
        <Badge label={status} surface={tone.surface} color={tone.text} />
      </View>

      {/*
        Quoting the agency rather than paraphrasing. A deadline someone cannot trace back to an
        official source is one they are right to distrust.
      */}
      {sourceText ? (
        <Text variant="caption" color="disabled">
          “{sourceText}”
        </Text>
      ) : null}

      <View style={styles.documents}>
        <Icon name={documentsReady ? 'check' : 'document'} size={14} color={documentsReady ? colors.green : colors.amberText} />
        <Text variant="meta" color="muted" style={styles.documentsCopy}>
          {documentsNote}
        </Text>
      </View>

      {onRenew ? <Button label={actionLabel} size="md" onPress={onRenew} /> : null}
    </Card>
  );
}

/** Urgency → colour. Amber and red are warnings about time, not about eligibility. */
const tones: Record<RenewalUrgency, { accent: string; surface: string; text: string }> = {
  overdue: { accent: colors.error, surface: '#FBE9E7', text: colors.error },
  urgent: { accent: colors.amber, surface: colors.amberTint, text: colors.amberText },
  soon: { accent: colors.cyan, surface: colors.navyTint, text: colors.navy },
  later: { accent: colors.border, surface: colors.offWhite, text: colors.muted },
};

const styles = StyleSheet.create({
  card: {
    padding: 16,
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  name: {
    flexShrink: 1,
  },
  documents: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  documentsCopy: {
    flex: 1,
  },
});
