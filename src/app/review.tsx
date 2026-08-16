import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  AttachedDocumentRow,
  BackHeader,
  Button,
  Card,
  DataRow,
  RowGroup,
  SectionLabel,
  StickyFooter,
  Text,
} from '@/components';
import { profileFields } from '@/data/profile-fields';
import { formatUsd, type ProgramId } from '@/data/programs';
import { fill, useStrings } from '@/i18n/use-strings';
import { useAppStore } from '@/state/app-store';
import { colors, documentKinds, layout } from '@/theme';

export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: ProgramId }>();
  const strings = useStrings();
  const store = useAppStore();
  const { values, documents } = store;

  const attached = documentKinds.filter((k) => documents[k].status === 'read');

  return (
    <View style={styles.root}>
      <BackHeader label={strings.review.edit} title={strings.review.title} onPress={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.body}>
          <Text variant="reviewHeading">{strings.review.heading}</Text>

          <RowGroup>
            <DataRow label={strings.review.program} value={strings.programs[id].name} />
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

          <SectionLabel label={strings.review.attached} />
          <Card style={styles.attached}>
            {attached.map((kind) => (
              <AttachedDocumentRow
                key={kind}
                kind={kind}
                label={strings.documents[kind]}
                // No filename: the original is deleted once read, so the date is what is left.
                // The short form keeps the row on one line beside the document name.
                filename={fill(strings.profile.readShort, { date: documents[kind].readOn ?? '' })}
              />
            ))}
          </Card>
        </View>
      </ScrollView>

      <StickyFooter>
        <Button
          label={strings.review.submit}
          onPress={() => {
            const reference = store.submit(id);
            router.replace({ pathname: '/confirmation', params: { reference } });
          }}
        />
      </StickyFooter>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.offWhite,
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingTop: 18,
    paddingHorizontal: layout.screenPaddingX,
    paddingBottom: 40,
  },
  body: {
    flex: 1,
    gap: 14,
    maxWidth: layout.maxContentWidth,
  },
  attached: {
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
});
