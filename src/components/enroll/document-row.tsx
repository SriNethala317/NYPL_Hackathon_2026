import { Pressable, StyleSheet, View, type PressableProps } from 'react-native';

import { DocumentThumbnail } from './document-thumbnail';

import { Badge, Card, Text } from '@/components/ui';
import { colors, layout, type DocumentCategory } from '@/theme';

export type DocumentRowProps = Omit<PressableProps, 'style' | 'children'> & {
  category: DocumentCategory;
  /** Localized document name — "Photo ID / IDNYC". */
  label: string;
  /**
   * The subline. Under extract-then-discard there is no stored file to name, so this reads
   * "Read Aug 16 · original deleted" once processed, and "Not added" before.
   */
  detail: string;
  verified?: boolean;
  /** Localized chip text: "Verified" or "Add". */
  statusLabel: string;
};

/**
 * One of the five document slots in Profile.
 *
 * A processed row stays pressable so the applicant can replace a document, but only an unadded
 * one advertises the action through its navy "Add" chip.
 */
export function DocumentRow({
  category,
  label,
  detail,
  verified = false,
  statusLabel,
  ...rest
}: DocumentRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${detail}`}
      {...rest}>
      {({ pressed }) => (
        <Card style={[styles.card, pressed && styles.pressed]}>
          <DocumentThumbnail category={category} verified={verified} />

          <View style={styles.copy}>
            <Text variant="bodyStrong">{label}</Text>
            <Text variant="meta" mono color={verified ? 'muted' : 'disabled'}>
              {detail}
            </Text>
          </View>

          <Badge
            label={statusLabel}
            surface={verified ? colors.greenTint : colors.offWhite}
            color={verified ? colors.greenText : colors.navy}
          />
        </Card>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    minHeight: layout.minTarget,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  pressed: {
    opacity: 0.7,
  },
});
