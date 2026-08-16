import { router, useLocalSearchParams } from 'expo-router';
import { Linking, StyleSheet, View } from 'react-native';

import { Button, Card, ConfirmationPanel, SectionLabel, StickyFooter, Text } from '@/components';
import { programById } from '@/data/catalogue';
import { hasTemplate } from '@/features/forms';
import { useStrings } from '@/i18n/use-strings';
import { colors, layout } from '@/theme';

/**
 * What to do next, having filled in your answers.
 *
 * This screen used to announce "Application submitted" over a reference number. It was not true:
 * `submit()` writes a local row and generates a local string, there is no network call, and no
 * public way exists for an app to file a NYC benefits application. Somebody reading that screen
 * would stop, wait for a decision, and never apply.
 *
 * So it now says plainly that nothing has been sent, and spends its space on the one thing that
 * actually helps — the route to the agency. Where the programme publishes a fillable PDF the
 * applicant is sent to fill it; otherwise to the agency's own application page; and where the
 * City publishes neither, to 311, rather than pretending there is a path.
 */
export default function ConfirmationScreen() {
  const { reference, id } = useLocalSearchParams<{ reference: string; id?: string }>();
  const strings = useStrings();

  const program = id ? programById(id) : undefined;
  const fillable = id ? hasTemplate(id) : false;
  const applyUrl = program?.applyUrl;

  return (
    <View style={styles.root}>
      <ConfirmationPanel
        title={strings.confirmation.title}
        body={strings.confirmation.body}
        reference={reference}
        referenceLabel={strings.confirmation.referenceLabel}
        referenceNote={strings.confirmation.referenceNote}
      />

      <View style={styles.next}>
        <SectionLabel label={strings.confirmation.nextTitle} />

        {/* The real form, where one exists — the whole point of the pipeline. */}
        {fillable && id ? (
          <Button
            label={strings.confirmation.fillForm}
            onPress={() => router.replace(`/form/${encodeURIComponent(id)}`)}
          />
        ) : null}

        {applyUrl ? (
          <Button
            label={strings.confirmation.applyOnline}
            variant={fillable ? 'secondary' : 'primary'}
            onPress={() => Linking.openURL(applyUrl)}
          />
        ) : (
          <Card style={styles.card}>
            <Text variant="bodySm" color="muted">
              {strings.confirmation.noLink}
            </Text>
          </Card>
        )}
      </View>

      <StickyFooter>
        <Button
          label={strings.confirmation.viewStatus}
          variant="secondary"
          // `dismissTo` rather than push, so Home does not stack behind the confirmation.
          onPress={() => router.dismissTo('/')}
        />
      </StickyFooter>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  next: {
    gap: 10,
    paddingHorizontal: layout.screenPaddingX,
  },
  card: {
    gap: 6,
  },
});
