import { router, useLocalSearchParams } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { BackHeader, Button, ConsentRow, InfoBanner, StickyFooter, Text, TextField } from '@/components';
import { profileFields } from '@/data/profile-fields';
import type { ProgramId } from '@/data/programs';
import { fill, useStrings } from '@/i18n/use-strings';
import { useAppStore } from '@/state/app-store';
import { colors, layout } from '@/theme';

export default function ApplicationFormScreen() {
  const { id } = useLocalSearchParams<{ id: ProgramId }>();
  const strings = useStrings();
  const store = useAppStore();
  const { values, consent, touched, resolved } = store;

  const missing = profileFields.filter((f) => f.mandatory && !values[f.key]?.trim());
  const canContinue = missing.length === 0 && consent;

  return (
    <View style={styles.root}>
      <BackHeader
        label={strings.detail.back}
        title={strings.programs[id].name}
        onPress={() => router.back()}
      />

      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.body}>
            <InfoBanner>{strings.form.banner}</InfoBanner>

            {profileFields.map((field) => {
              const value = values[field.key] ?? '';
              const invalid = touched && field.mandatory && !value.trim();
              // Provenance follows the reconciled winner, so the hint names the document the
              // value actually came from rather than a category it might have come from.
              const from = resolved.find((r) => r.field === field.key);

              return (
                <TextField
                  key={field.key}
                  label={strings.form.fields[field.key]}
                  value={value}
                  onChangeText={(next) => store.setValue(field.key, next)}
                  keyboardType={field.keyboard === 'numeric' ? 'numeric' : 'default'}
                  invalid={invalid}
                  errorText={strings.form.required}
                  /*
                   * Provenance per field. The applicant is about to certify these values as
                   * true, so they need to know which came from a machine reading a document
                   * and which they have to supply themselves.
                   */
                  hint={
                    from
                      ? fill(strings.form.fromDocument, {
                          document: strings.documents[from.documentType],
                        })
                      : strings.form.notExtracted
                  }
                />
              );
            })}

            <ConsentRow checked={consent} onToggle={() => store.setConsent(!consent)}>
              {strings.form.consent}
            </ConsentRow>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <StickyFooter>
        <Button
          label={strings.form.reviewApplication}
          // Muted but still tappable — pressing it is how the applicant finds out what is
          // missing, per the design. The hint carries that to screen readers too.
          inactive={!canContinue}
          accessibilityHint={canContinue ? undefined : strings.form.incomplete}
          onPress={() => {
            if (!canContinue) {
              // Reveal the red borders rather than failing silently.
              store.setTouched(true);
              return;
            }
            router.push({ pathname: '/review', params: { id } });
          }}
        />
        <Text variant="caption" align="center" color={canContinue ? 'green' : 'muted'}>
          {canContinue ? strings.form.complete : strings.form.incomplete}
        </Text>
      </StickyFooter>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.offWhite,
  },
  fill: {
    flex: 1,
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
    gap: 18,
    maxWidth: layout.maxContentWidth,
  },
});
