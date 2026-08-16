import { Pressable, StyleSheet, View, type PressableProps } from 'react-native';

import { DocumentThumbnail } from './document-thumbnail';

import { Badge, Card, Text } from '@/components/ui';
import { colors, layout, type DocumentKind } from '@/theme';

export type DocumentRowProps = Omit<PressableProps, 'style' | 'children'> & {
  kind: DocumentKind;
  /** Localized document name — "Photo ID / IDNYC". */
  label: string;
  /** The uploaded filename. Absent until the document is on file. */
  filename?: string;
  verified?: boolean;
  /** Localized status text: "Verified" / "Add" / "Not added". */
  statusLabel: string;
  placeholderLabel: string;
};

/**
 * One of the five document slots in Profile.
 *
 * A verified row is still pressable so the applicant can replace a document, but only an
 * unadded one advertises the action through its navy "Add" chip.
 */
export function DocumentRow({
  kind,
  label,
  filename,
  verified = false,
  statusLabel,
  placeholderLabel,
  ...rest
}: DocumentRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${verified ? `${statusLabel}, ${filename}` : placeholderLabel}`}
      {...rest}>
      {({ pressed }) => (
        <Card style={[styles.card, pressed && styles.pressed]}>
          <DocumentThumbnail kind={kind} verified={verified} />

          <View style={styles.copy}>
            <Text variant="bodyStrong">{label}</Text>
            <Text variant="meta" mono color={verified ? 'muted' : 'disabled'}>
              {verified ? filename : placeholderLabel}
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
