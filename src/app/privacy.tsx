import { router } from 'expo-router';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';

import { BackHeader, Button, Card, Icon, SectionLabel, Text } from '@/components';
import { documentsWeRead, fieldsWeKeep, labelForNeverStored, neverStored } from '@/data/privacy-facts';
import { purgeGeneratedForms } from '@/features/forms';
import { useStrings } from '@/i18n/use-strings';
import { useAppStore } from '@/state/app-store';
import { colors, layout, radius } from '@/theme';

/** NYC's own public-charge guidance, rather than our paraphrase of it. */
const CITY_IMMIGRATION_GUIDANCE = 'https://www.nyc.gov/site/immigrants/help/legal-services/public-charge.page';

/**
 * The data-handling screen.
 *
 * Every list here is computed from the registries in `src/data`, not written by hand, so it
 * cannot quietly become untrue. Add a document type that reads a new sensitive identifier and it
 * appears in "what we never store" on its own — `privacy.test.ts` fails the build if it does not.
 */
export default function PrivacyScreen() {
  const strings = useStrings();
  const store = useAppStore();

  const documents = documentsWeRead();
  const fields = fieldsWeKeep();
  const never = neverStored();

  return (
    <View style={styles.root}>
      <BackHeader label={strings.detail.back} title={strings.privacyScreen.title} onPress={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.body}>
          <Text variant="bodySm" color="muted">
            {strings.privacyScreen.intro}
          </Text>

          <SectionLabel label={strings.privacyScreen.readTitle} dotColor={colors.cyan} />
          <Card style={styles.card}>
            <Text variant="bodySm" color="muted">
              {strings.privacyScreen.readBody}
            </Text>
            {documents.map((doc) => (
              <View key={doc.id} style={styles.row}>
                <Text variant="label">{strings.documents[doc.id]}</Text>
                <Text variant="caption" color="muted">
                  {doc.yields.length > 0
                    ? doc.yields.map((field) => strings.form.fields[field]).join(' · ')
                    : '—'}
                </Text>
              </View>
            ))}
          </Card>

          <SectionLabel label={strings.privacyScreen.keepTitle} dotColor={colors.green} />
          <Card style={styles.card}>
            <Text variant="bodySm" color="muted">
              {strings.privacyScreen.keepBody}
            </Text>
            {fields.map((field) => (
              <Text key={field.key} variant="label">
                · {strings.form.fields[field.key]}
              </Text>
            ))}
          </Card>

          {/*
            The strongest claim on this screen, so it is the one most tightly bound to the code:
            these come straight off the `neverStore` arrays in the document registry.
          */}
          <SectionLabel label={strings.privacyScreen.neverTitle} dotColor={colors.error} />
          <Card style={styles.card} accent={colors.error}>
            <Text variant="bodySm" color="muted">
              {strings.privacyScreen.neverBody}
            </Text>
            {never.map((key) => (
              <View key={key} style={styles.neverRow}>
                <Icon name="lock" size={13} color={colors.error} />
                <Text variant="label">{labelForNeverStored(key)}</Text>
                <Text variant="caption" color="disabled">
                  {documents
                    .filter((doc) => doc.neverStore.includes(key))
                    .map((doc) => strings.documents[doc.id])
                    .join(', ')}
                </Text>
              </View>
            ))}
          </Card>

          <SectionLabel label={strings.privacyScreen.whereTitle} />
          <Card style={styles.card}>
            <Text variant="bodySm" color="muted">
              {strings.privacyScreen.whereBody}
            </Text>
            {/*
              Kept visibly separate from what is true today. Merging the two is how a plan turns
              into a promise, which is exactly what went wrong with the previous version of this
              screen.
            */}
            <Text variant="caption" color="disabled">
              {strings.privacyScreen.whereNext}
            </Text>
          </Card>

          <SectionLabel label={strings.privacyScreen.formTitle} />
          <Card style={styles.card}>
            <Text variant="bodySm" color="muted">
              {strings.privacyScreen.formBody}
            </Text>
          </Card>

          {/*
            Addressed head-on rather than reassured around. The dominant misconception is that
            public charge touches every immigrant when it reaches a narrow group, and that
            confusion is what keeps eligible people from applying.
          */}
          <SectionLabel label={strings.privacyScreen.immigrationTitle} dotColor={colors.amber} />
          <Card style={styles.card}>
            <Text variant="bodySm" color="muted">
              {strings.privacyScreen.immigrationBody}
            </Text>
            <Button
              label={strings.privacyScreen.immigrationLink}
              variant="secondary"
              size="md"
              onPress={() => Linking.openURL(CITY_IMMIGRATION_GUIDANCE)}
            />
          </Card>

          <SectionLabel label={strings.privacyScreen.controlTitle} />
          <Card style={styles.card}>
            <Text variant="bodySm" color="muted">
              {strings.privacyScreen.controlBody}
            </Text>
            <Button
              label={strings.privacyScreen.deleteEverything}
              variant="tertiary"
              size="md"
              onPress={() => {
                // In-memory state alone is not "everything" -- a completed application PDF may
                // still be on disk, and it is the most sensitive thing this app produces.
                purgeGeneratedForms();
                store.reset();
                router.back();
              }}
            />
          </Card>
        </View>
      </ScrollView>
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
    gap: 12,
    maxWidth: layout.maxContentWidth,
  },
  card: {
    padding: 16,
    gap: 10,
    borderRadius: radius.card,
  },
  row: {
    gap: 2,
  },
  neverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
});
