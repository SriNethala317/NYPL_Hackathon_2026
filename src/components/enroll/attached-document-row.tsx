import { StyleSheet, View } from 'react-native';

import { DocumentThumbnail } from './document-thumbnail';

import { Text } from '@/components/ui';
import type { DocumentCategory } from '@/theme';

export type AttachedDocumentRowProps = {
  category: DocumentCategory;
  /** Localized document name — "Photo ID / IDNYC". */
  label: string;
  filename: string;
};

/**
 * A document listed on the review screen. Unlike `DocumentRow` this is read-only — by the
 * time an applicant reaches review the documents are settled, so there's nothing to tap.
 */
export function AttachedDocumentRow({ category, label, filename }: AttachedDocumentRowProps) {
  return (
    <View style={styles.row}>
      <DocumentThumbnail category={category} size="sm" />
      <Text variant="labelRegular" color="muted" style={styles.copy} numberOfLines={1}>
        {label} · {filename}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  copy: {
    flex: 1,
  },
});
