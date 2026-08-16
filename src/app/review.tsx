import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet } from 'react-native';

import {
  AttachedDocumentRow,
  Button,
  Card,
  DataRow,
  DetailScreen,
  RowGroup,
  SectionLabel,
  Text,
} from '@/components';
import { documentType } from '@/data/document-types';
import { profileFields } from '@/data/profile-fields';
import { programById } from '@/data/catalogue';
import { fill, useStrings } from '@/i18n/use-strings';
import { useAppStore } from '@/state/app-store';
import { formatUsd } from '@/data/eligibility';

export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const strings = useStrings();
  const store = useAppStore();
  const { values, documents } = store;

  const attached = documents.filter((d) => d.status === 'read');

  return (
    <DetailScreen
      backLabel={strings.review.edit}
      title={strings.review.title}
      onBack={() => router.back()}
      gap={14}
      footer={
        <Button
          label={strings.review.submit}
          onPress={() => {
            const reference = store.submit(id);
            router.replace({ pathname: '/confirmation', params: { reference, id } });
          }}
        />
      }>
          <Text variant="reviewHeading">{strings.review.heading}</Text>

          <RowGroup>
            <DataRow label={strings.review.program} value={programById(id)?.name ?? ''} />
            {profileFields.map((field) => (
              <DataRow
                key={field.key}
                label={strings.form.fields[field.key]}
                // Money is formatted for reading here; the form keeps it raw for editing.
                value={
                  field.key === 'income' && values.income
                    ? `${formatUsd(Number(values.income))}/mo`
                    : (values[field.key] ?? '—')
                }
              />
            ))}
          </RowGroup>

      {/* An empty card renders as a bare grey bar, which reads as a rendering bug. */}
      {attached.length > 0 && (
        <>
          <SectionLabel label={strings.review.attached} />
          <Card style={styles.attached}>
            {attached.map((doc) => (
              <AttachedDocumentRow
                key={doc.id}
                category={documentType(doc.type).category}
                label={strings.documents[doc.type]}
                // No filename: the original is deleted once read, so the date is what is left.
                // The short form keeps the row on one line beside the document name.
                filename={fill(strings.profile.readShort, { date: doc.readOn ?? '' })}
              />
            ))}
          </Card>
        </>
      )}
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  attached: {
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
});
